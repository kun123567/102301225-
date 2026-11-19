/**
 * detect.js -- 源码静态数据结构检测（M6 / D1）
 *
 * 目标：**不依赖运行时 trace**，仅凭源码特征就能认出用了哪些数据结构，
 * 并按 dsCatalog 的 26 项模板给出分类建议（逻辑结构 + 推荐渲染器 + 置信度 + 行号）。
 *
 * 三层判据（按可靠性排序，结果统一带 source 字段）：
 *   ast      —— 声明表 + 结构体字段模式（最可靠：认 typedef / 嵌套模板 / 作用域）
 *   semantic —— 源码语义（函数名与访问模式：find/union → 并查集，probe → 开放定址哈希…）
 *   regex    —— 21 条兜底正则（**跑在去注释后的文本上**，否则注释里的例子会被误报）
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  /* 每条规则：id/名称/正则/分类/模板/说明 */
  const RULES = [
    /* ---- 图形（多对多）---- */
    { id: 'adjListVecArr', zh: '邻接表（vector 数组）', logical: 'graph', templateId: 'algraph',
      re: /\bvector\s*<\s*[^>]+>\s+(\w+)\s*\[\s*(\w+)\s*\]/, conf: 0.95,
      why: 'vector 的数组：外层下标是顶点，内层是邻接点 —— 教科书式邻接表' },
    { id: 'adjListVecVec', zh: '邻接表（vector of vector）', logical: 'graph', templateId: 'algraph',
      re: /\bvector\s*<\s*vector\s*<\s*[^>]+>\s*>/, conf: 0.95, why: '二维 vector，典型的 vector<vector<int>> 邻接表' },
    { id: 'adjMatrix', zh: '邻接矩阵（二维数组）', logical: 'graph', templateId: 'mgraph',
      re: /\b(?:int|bool|long\s+long)\s+(\w+)\s*\[\s*(\w+)\s*\]\s*\[\s*(\w+)\s*\]/, conf: 0.55,
      why: '二维数组（邻接矩阵 / 矩阵 DP 都长这样，需结合 push 边或 "graph" 语义确认）' },
    { id: 'starForward', zh: '链式前向星（head/next/to）', logical: 'graph', templateId: 'algraph',
      re: /\bhead\s*\[[^\]]*\]\s*;[\s\S]{0,400}?\b(?:next|nxt)\s*\[[^\]]*\]\s*;/, conf: 0.85,
      why: 'head/next/to 三个数组是链式前向星（邻接表的压缩表示）' },

    /* ---- 树形（一对多）---- */
    { id: 'bitree', zh: '二叉树（lchild/rchild）', logical: 'tree', templateId: 'proto-bitree', tagGroup: 1,
      re: /\bstruct\s+(\w+)\s*\{[^}]*\*\s*(?:lchild|left)[^}]*\*\s*(?:rchild|right)/, conf: 0.9,
      why: '结构体内含两个自指针 lchild/rchild' },
    { id: 'bitreeSimple', zh: '树结点（left/right）', logical: 'tree', templateId: 'proto-bitree', tagGroup: 1,
      re: /(\w+)\s*\*\s*(?:left|left_child)\s*;[\s\S]{0,200}?(\w+)\s*\*\s*(?:right|right_child)\s*;/, conf: 0.8,
      why: '出现成对的 left/right 指针域' },
    { id: 'parentArr', zh: '双亲表示 / 并查集（parent 数组）', logical: 'tree', templateId: 'ptree',
      re: /\b(?:parent|fa|father|ufa?)\s*\[\s*\w+\s*\]/, conf: 0.75,
      why: 'parent[] 数组是双亲表示法；若配合 find/union 则为并查集' },

    /* ---- 线性（一对一）---- */
    { id: 'queueSTL', zh: '队列（STL queue）', logical: 'linear', templateId: 'linkqueue',
      re: /\bqueue\s*<\s*[^>]+>\s+(\w+)/, conf: 0.9, why: 'STL queue 对象' },
    { id: 'stackSTL', zh: '栈（STL stack）', logical: 'linear', templateId: 'sqstack',
      re: /\bstack\s*<\s*[^>]+>\s+(\w+)/, conf: 0.9, why: 'STL stack 对象' },
    { id: 'sqstackArr', zh: '顺序栈（数组 + top）', logical: 'linear', templateId: 'sqstack',
      re: /\b(?:int|char|ElemType)\s+(\w+)\s*\[\s*\w+\s*\]\s*;[\s\S]{0,200}?\b(?:top|tp)\b/, conf: 0.7,
      why: '数组 + top 指针的组合通常是顺序栈' },
    { id: 'linkList', zh: '单链表（next 指针）', logical: 'linear', templateId: 'proto-list', tagGroup: 1,
      re: /\bstruct\s+(\w+)\s*\{[^}]*\*\s*(?:next|link|succ)\s*;/, conf: 0.9, why: '结构体内含自指针 next' },
    { id: 'dlist', zh: '双向链表（prev + next）', logical: 'linear', templateId: 'proto-dlist', tagGroup: 1,
      re: /\*\s*(?:prev|prior)\s*;[\s\S]{0,200}?\*\s*(?:next|succ)\s*;/, conf: 0.85, why: '同时出现 prev 与 next' },

    /* ---- 集合（松散关系）---- */
    { id: 'hashSTL', zh: '哈希表（map / unordered_map）', logical: 'set', templateId: 'hashtab',
      re: /\b(?:unordered_map|map)\s*<\s*[^>]+>\s+(\w+)/, conf: 0.85, why: '键值容器，元素间无前后继约束' },
    { id: 'setSTL', zh: '集合（set）', logical: 'set', templateId: 'hashtab',
      re: /\b(?:unordered_set|set)\s*<\s*[^>]+>\s+(\w+)/, conf: 0.8, why: 'STL set 容器' },

    /* ---- 数组 / 串（数组族）---- */
    { id: 'vec1d', zh: '一维数组（vector）', logical: 'linear', templateId: 'proto-seq',
      re: /\bvector\s*<\s*(int|long\s+long|double|char)\s*>\s+(\w+)\s*[;(\[]/, conf: 0.7, why: '一维 vector' },
    { id: 'arr1d', zh: '一维数组（C 数组）', logical: 'linear', templateId: 'proto-seq',
      re: /\b(?:int|long\s+long|double|float|char)\s+(\w+)\s*\[\s*(\d+|\w+)\s*\]\s*(?:=|;)/, conf: 0.6, why: '定长或宏长度的一维数组' },
    { id: 'visArr', zh: '标记数组（vis/used/book）', logical: 'linear', templateId: 'proto-seq',
      re: /\b(?:bool|int|char)\s+(vis|used|book|seen|mark)\s*\[/, conf: 0.85, why: '命名即语义：访问标记数组（配合图/树遍历）' },
    { id: 'charArr', zh: '字符串（char 数组）', logical: 'linear', templateId: 'sstr',
      re: /\bchar\s+(\w+)\s*\[\s*\w+\s*\]/, conf: 0.6, why: 'char 数组即 C 风格字符串' },
    { id: 'stringSTL', zh: '字符串（std::string）', logical: 'linear', templateId: 'sstr',
      re: /\bstring\s+(\w+)\s*[;=(]/, conf: 0.8, why: 'std::string 对象' },

    /* ---- 容器级补充 ---- */
    { id: 'priorityQueue', zh: '优先队列 / 堆', logical: 'tree', templateId: 'heap',
      re: /\bpriority_queue\s*<\s*[^>]+>/, conf: 0.9, why: 'priority_queue 底层是堆（完全二叉树）' },
    { id: 'deque', zh: '双端队列', logical: 'linear', templateId: 'sqqueue',
      re: /\bdeque\s*<\s*[^>]+>\s+(\w+)/, conf: 0.7, why: 'deque 容器' },
  ];

  /* ---------------- 模板元信息 ---------------- */
  function tplMeta(id) {
    const cat = AVC.dsCatalog;
    const tpl = cat ? (cat.byId(id) || (cat.PROTOS || []).find(x => x.id === id)) : null;
    return {
      renderer: tpl ? tpl.renderer : 'linkView',
      zh: tpl ? tpl.zh : id,
      logical: tpl ? tpl.logical : 'linear',
    };
  }
  const item = (o) => {
    const m = tplMeta(o.templateId);
    return Object.assign({ renderer: m.renderer, zh: m.zh, logical: m.logical, name: '', text: '' }, o);
  };

  /* ================= 结构体字段模式 → 模板（唯一判定点） =================
   * 之前只认 next / left-right 三种命名，于是孩子树、B 树、十字链、广义表全认不出。
   * 这里按"字段名 + 字段形状（指针 / 指针数组 / 标签位）"分类，覆盖 dsCatalog 26 项里的树形与集合族。
   */
  function classifyFields(fields) {
    if (!fields || !fields.length) return null;
    const has = (re) => fields.some(f => re.test(String(f.name || '').toLowerCase()));
    const arrOf = (re) => fields.find(f => f.isArray && re.test(String(f.name || '').toLowerCase()));
    const selfPtr = fields.filter(f => (f.ptrDepth || 0) > 0 && f.self);
    const selfPtrArr = selfPtr.filter(f => f.isArray);

    // 稀疏矩阵十字链：right + down
    if (has(/^(right|rlink)$/) && has(/^(down|dlink)$/)) return 'sparsematrix';
    // 图十字链：firstin + firstout / hlink + tlink
    if (has(/^firstin$/) && has(/^firstout$/)) return 'olgraph';
    if (has(/^(hlink|tlink)$/) && has(/^(hlink|tlink)$/)) return 'olgraph';
    // 广义表：hp + tp（或 head/tail 双指针）
    if (has(/^(hp|head)$/) && has(/^(tp|tail)$/) && selfPtr.length >= 2) return 'glist';
    // 双链树（孩子-兄弟）：firstchild + nextsibling
    if (has(/^firstchild$/) && has(/^nextsibling$/)) return 'dltree';
    // 线索二叉树：ltag / rtag
    if (has(/^ltag$/) || has(/^rtag$/)) return 'bithrtree';
    // 红黑树：color 标记
    if (has(/^color$/) && (selfPtr.length >= 2)) return 'rbtree';
    // 堆-赫夫曼：weight + parent/lchild/rchild（静态数组三叉表示）
    if (has(/^weight$/) && has(/^(parent|p)$/) && has(/^(lchild|left)$/)) return 'hufftree';
    // 多叉（自指针数组）：B 树族 / Trie / 孩子树 / 跳跃表
    if (selfPtrArr.length) {
      const a = String(selfPtrArr[0].name || '').toLowerCase();
      if (/^(child|children|son|kids)$/.test(a)) {
        return arrOf(/^(key|ch|alpha|letter|word)$/) || has(/^(isend|isterminal)$/) ? 'trie' : 'ctree';
      }
      if (/^(next|succ|forward|nxt)$/.test(a)) return 'skiplist';       // 多层 next[]
      return 'btree';                                                    // ptr[] + key[]：B-/B+ 树
    }
    // 孩子树（下标表示）：child[] + n
    if (arrOf(/^(child|children|son)$/) && has(/^(n|count|size|degree)$/)) return 'ctree';
    // 三叉链表：left + right + parent
    if (has(/^(left|lchild)$/) && has(/^(right|rchild)$/) && has(/^(parent|p|pa)$/)) return 'trifurcate';
    // 普通二叉树
    if (has(/^(left|lchild|llink)$/) && has(/^(right|rchild|rlink)$/)) return 'proto-bitree';
    // 双向链表
    if (has(/^(prev|prior)$/) && has(/^(next|succ)$/)) return 'proto-dlist';
    // 队列：front + rear（指针 → 链队列；下标 → 循环队列）
    if (has(/^front$/) && has(/^rear$/)) return selfPtr.length ? 'linkqueue' : 'sqqueue';
    // 顺序栈：数组 + top
    if (has(/^(top|tp)$/) && arrOf(/^(data|stack|elem|base|st)$/)) return 'sqstack';
    // 顺序表：数组 + length / size
    if (arrOf(/^(elem|data|list|arr)$/) && has(/^(length|len|size|count|n)$/)) {
      return has(/^(elem)$/) ? 'sqlist' : 'sqlist';
    }
    // 索引表：idx + data 数组
    if (has(/^idx$/) && arrOf(/^(data|elem)$/)) return 'idxlist';
    // 多项式：coef + exp
    if (has(/^coef$/) && has(/^exp$/)) return 'poly';
    // 单链表
    if (selfPtr.length) return 'proto-list';
    return null;
  }

  /* 类型名/别名 → 模板（教科书命名 + ds.ini 的 cTypes 表） */
  function classifyTypeName(name) {
    const s = String(name || '');
    if (!s) return null;
    const cat = AVC.dsCatalog;
    if (cat && cat.findByCType) {
      const hit = cat.findByCType(s);
      if (hit) return hit.id;
    }
    const l = s.toLowerCase();
    if (/ufset|unionfind|disjoint/.test(l)) return 'ufset';
    if (/^bp|bplus|b\+/.test(l)) return 'bptree';
    if (/btree/.test(l)) return 'btree';
    if (/rbtree|redblack/.test(l)) return 'rbtree';
    if (/bithr|thread/.test(l)) return 'bithrtree';
    if (/trie|dictree/.test(l)) return 'trie';
    if (/skiplist/.test(l)) return 'skiplist';
    if (/glist/.test(l)) return 'glist';
    if (/olgraph/.test(l)) return 'olgraph';
    if (/algraph|adjlist/.test(l)) return 'algraph';
    if (/mgraph|adjmatrix/.test(l)) return 'mgraph';
    if (/hash|hashtab/.test(l)) return 'hashtab';
    if (/queue/.test(l)) return /link/.test(l) ? 'linkqueue' : 'sqqueue';
    if (/stack/.test(l)) return 'sqstack';
    if (/list|link/.test(l)) return 'sqlist';
    if (/tree/.test(l)) return 'proto-bitree';
    return null;
  }

  /* ================= ①-AST 通道 ================= */
  function detectFromAst(text) {
    const out = [];
    if (!AVC.ast) return out;
    let P;
    try { P = AVC.ast.parse(text); } catch (e) { return out; }
    const push = (o) => out.push(item(Object.assign({ source: 'ast' }, o)));

    // typedef struct {…} SqQueue; → 别名 → 结构体 tag（ast.js 已把它记在 structs[tag].alias 上）
    const aliasToTag = {};
    for (const t in (P.structs || {})) {
      const s = P.structs[t];
      if (s && s.alias) aliasToTag[s.alias] = t;
    }
    // 结构体 tag → 模板：别名（教科书命名 / ds.ini cTypes）优先，其次字段模式
    const tagTpl = {};
    for (const t in (P.structs || {})) {
      const s = P.structs[t] || {};
      const c = classifyTypeName(s.alias) || classifyFields(s.fields) || classifyTypeName(t);
      if (c) tagTpl[t] = c;
    }
    // 源码里"定义了这种结构、但还没用它声明变量"也要报出来（教科书片段常常只有 typedef）
    const tplNameOfTag = {};
    for (const t in tagTpl) {
      const s = P.structs[t] || {};
      const nm = s.alias || (t.startsWith('anon') ? '' : t);
      tplNameOfTag[t] = nm;
      push({
        id: 'ast.def.' + t, name: nm, templateId: tagTpl[t], conf: 0.88, kind: 'type',
        why: 'AST：结构体 ' + (nm || t) + ' 的字段模式 → ' + tagTpl[t], line: s.line || 1,
      });
    }

    for (const dcl of (P.decls || [])) {
      const bt = dcl.baseType || '';
      const inner0 = (dcl.inner && dcl.inner[0]) || '';
      const tag = dcl.structTag || (aliasToTag[bt] || null);
      const line = dcl.declLine;

      // C++ 容器族
      if (bt === 'vector' && dcl.isArray) { push({ id: 'ast.adjListVecArr', name: dcl.name, templateId: 'algraph', conf: 0.96, why: 'AST：vector<T> ' + dcl.name + '[...]', line }); continue; }
      if (bt === 'vector' && /^vector/.test(inner0)) { push({ id: 'ast.adjListVecVec', name: dcl.name, templateId: 'algraph', conf: 0.95, why: 'AST：vector<vector<...>>', line }); continue; }
      if (bt === 'queue') { push({ id: 'ast.queue', name: dcl.name, templateId: 'linkqueue', conf: 0.92, why: 'AST：queue<...>', line }); continue; }
      if (bt === 'stack') { push({ id: 'ast.stack', name: dcl.name, templateId: 'sqstack', conf: 0.92, why: 'AST：stack<...>', line }); continue; }
      if (bt === 'priority_queue') { push({ id: 'ast.pq', name: dcl.name, templateId: 'heap', conf: 0.93, why: 'AST：priority_queue', line }); continue; }
      if (bt === 'map' || bt === 'unordered_map') { push({ id: 'ast.map', name: dcl.name, templateId: 'hashtab', conf: 0.9, why: 'AST：map 键值容器', line }); continue; }
      if (bt === 'set' || bt === 'unordered_set') { push({ id: 'ast.set', name: dcl.name, templateId: 'hashtab', conf: 0.85, why: 'AST：set 容器', line }); continue; }
      if (bt === 'string') { push({ id: 'ast.string', name: dcl.name, templateId: 'sstr', conf: 0.85, why: 'AST：std::string', line }); continue; }

      // 结构体变量：字段模式优先，其次类型名（typedef 别名 / ds.ini cTypes）
      if (tag) {
        const tpl = tagTpl[tag] || classifyTypeName(tag) || classifyTypeName(bt);
        if (tpl) {
          push({ id: 'ast.struct.' + tpl, name: dcl.name, templateId: tpl, conf: 0.9, why: 'AST：' + tag + ' 字段模式 → ' + tpl, line });
          continue;
        }
      }
      if (!tag) {
        const tpl = classifyTypeName(bt);
        if (tpl && /^(SqList|SqStack|SqQueue|LinkQueue|ALGraph|MGraph|UFSet|Heap|PTree|CTree|BTree|BpTree|RBTree|BiThrTree|TrieNode|TrieTree|SkipList|GList|DLTree|OLGraph|PolyStruct|IdxList|OpenHashTab|ChainHashTab|ChainHT|OpenHT)$/i.test(bt)) {
          push({ id: 'ast.typename.' + tpl, name: dcl.name, templateId: tpl, conf: 0.85, why: 'AST：类型名 ' + bt + ' 命中 ds.ini 类型表', line });
          continue;
        }
      }

      // 数组族
      if (dcl.isArray && dcl.dims.length >= 2) { push({ id: 'ast.matrix', name: dcl.name, templateId: 'mgraph', conf: 0.6, why: 'AST：二维数组', line }); continue; }
      if (dcl.isArray && /^(vis|used|book|seen|mark)$/i.test(dcl.name)) { push({ id: 'ast.vis', name: dcl.name, templateId: 'proto-seq', conf: 0.88, why: 'AST：命名即语义的标记数组', line }); continue; }
      if (/^(parent|fa|father|ufa?)$/i.test(dcl.name) && dcl.isArray) { push({ id: 'ast.parent', name: dcl.name, templateId: 'ptree', conf: 0.8, why: 'AST：parent[] 数组', line }); continue; }
      if (dcl.isArray && /^(int|long|char|double|float|bool)$/.test(bt)) { push({ id: 'ast.arr1', name: dcl.name, templateId: 'proto-seq', conf: 0.62, why: 'AST：一维数组', line }); continue; }
      // typedef 出来的指针类型：typedef struct Node *LinkList; LinkList head;
      // 注意 typeText 保留用户写的别名（LinkList），baseType 已被 typedef 展开成 struct 标签（Node），
      // 命名启发式必须看 typeText，否则永远匹配不到 "Link…"。
      if (dcl.ptrDepth > 0 && !dcl.isArray) {
        const tpl = classifyTypeName(dcl.typeText) || classifyTypeName(bt) || classifyTypeName(tag)
          || (/list|link/i.test(dcl.typeText || '') ? 'proto-list'
            : (/tree/i.test(dcl.typeText || '') ? 'proto-bitree'
              : (/queue/i.test(dcl.typeText || '') ? 'linkqueue'
                : (/stack/i.test(dcl.typeText || '') ? 'sqstack' : null))));
        if (tpl) { push({ id: 'ast.ptr.' + tpl, name: dcl.name, templateId: tpl, conf: 0.8, why: 'AST：指针类型 ' + (dcl.typeText || bt) + (tag ? (' → struct ' + tag) : ''), line }); continue; }
      }
    }
    return out;
  }

  /* ================= ①.S 语义通道（函数名 / 访问模式） ================= */
  function detectSemantic(clean) {
    const out = [];
    const has = (re) => re.test(clean);
    const push = (o) => out.push(item(Object.assign({ source: 'semantic' }, o)));

    // 并查集：parent 数组 + find/union 函数（uni/join/merge 等写法都算）
    if (has(/\b(?:parent|fa|father|ufa?)\s*\[/) && has(/\bfind\s*\(/) && has(/\b(?:union|unite|uni|merge|join)\w*\s*\(/)) {
      push({ id: 'sem.ufset', name: '', templateId: 'ufset', conf: 0.9,
        why: '语义：parent[] + find() + union()/unite() → 并查集' });
    }
    // 开放定址哈希：取模定位 + 线性探测（(i+1)%M）
    if (has(/%\s*[A-Za-z_]\w*/) && has(/\(\s*\w+\s*\+\s*1\s*\)\s*%/) && has(/\[[^\]]*\]\s*(?:=|==|!=)/)) {
      const m = clean.match(/\bint\s+(\w+)\s*\[\s*\w+\s*\]/);
      push({ id: 'sem.hashOpen', name: m ? m[1] : '', templateId: 'hashtab', conf: 0.88,
        why: '语义：取模 + (i+1)%M 线性探测 → 开放定址哈希表' });
    }
    // 链地址哈希：指针数组 + 该结构体有 next
    const bucket = clean.match(/\b([A-Za-z_]\w*)\s*\*\s*(\w+)\s*\[\s*(\w+)\s*\]/);
    if (bucket && has(/\b(?:next|link)\b/) && has(/%\s*[A-Za-z_]\w*/)) {
      push({ id: 'sem.hashChain', name: bucket[2], templateId: 'hashtab', conf: 0.88,
        why: '语义：' + bucket[1] + '* ' + bucket[2] + '[...] 桶数组 + next 链 + 取模 → 链地址哈希表' });
    }
    // 堆：堆调整函数名 + 整数数组
    if (has(/\b(?:sift\w*|heapify|adjust\w*|shift_?up|shift_?down)\s*\(/i) && has(/\bint\s+\w+\s*\[/)) {
      const m = clean.match(/\btypedef\s+struct[^}]*\}\s*(\w+)\s*;/);
      const arr = clean.match(/\bint\s+(\w+)\s*\[\s*\w+\s*\]/);
      push({ id: 'sem.heap', name: arr ? arr[1] : '', templateId: 'heap', conf: 0.87,
        why: '语义：sift/adjust 系列函数 + 整型数组 → 顺序存储的堆' + (m ? '（类型 ' + m[1] + '）' : '') });
    }
    // 链队列：next 结点 + front/rear 双指针（教科书写法：QNode + front/rear）
    if (has(/\b(?:front|rear)\b/) && has(/\bstruct\s+\w+\s*\{[^}]*\*\s*(?:next|link)\b/)) {
      const m = clean.match(/\b(?:struct\s+\w+\s*\*\s*)?(front|rear)\b/);
      push({ id: 'sem.linkqueue', name: m ? m[1] : '', templateId: 'linkqueue', conf: 0.86,
        why: '语义：next 结点结构 + front/rear 双指针 → 链队列' });
    }
    // 顺序表：数组 + length/size
    if (has(/\bint\s+(?:elem|data)\s*\[/) && has(/\b(?:length|len|size|count)\b/)) {
      const m = clean.match(/\bint\s+(elem|data|list)\s*\[/);
      push({ id: 'sem.sqlist', name: m ? m[1] : '', templateId: 'sqlist', conf: 0.8,
        why: '语义：数组 + 长度变量 → 顺序表' });
    }
    return out;
  }

  /* ================= 正则通道（去注释文本） ================= */
  function detectRegex(clean, P) {
    const out = [];
    const lines = clean.split(/\r?\n/);
    for (const r of RULES) {
      const m = clean.match(r.re);
      if (!m) continue;
      const idx = clean.indexOf(m[0]);
      let line = 1;
      for (let i = 0; i < idx && i < clean.length; i++) if (clean.charCodeAt(i) === 10) line++;
      const base = item({
        id: r.id, name: m[1] || (m[2] || ''), templateId: r.templateId, conf: r.conf,
        why: r.why, line, text: (lines[line - 1] || '').trim().slice(0, 100), source: 'regex',
      });
      // 结构体模式类规则：把 tag 落到"该 tag 的变量"上（否则结论没有名字，前端挂不到对象）
      const tag = r.tagGroup ? m[r.tagGroup] : null;
      if (tag && P && P.decls) {
        const vars = P.decls.filter(d => d.structTag === tag);
        if (vars.length) {
          for (const v of vars) out.push(Object.assign({}, base, { name: v.name, line: v.declLine || line, id: r.id + '.' + v.name }));
          continue;
        }
      }
      out.push(base);
    }
    return out;
  }

  /* ================= 汇总 ================= */
  function detect(src) {
    const text = String(src || '');
    // 正则必须跑在去注释文本上（行数保持不变），否则注释里的示例声明会被误报
    const clean = AVC.ast && AVC.ast.stripComments ? AVC.ast.stripComments(text) : text;
    let P = null;
    try { P = AVC.ast ? AVC.ast.parse(text) : null; } catch (e) { P = null; }

    const out = detectRegex(clean, P);
    let astItems = [], semItems = [];
    try { astItems = detectFromAst(text); } catch (e) { astItems = []; }
    try { semItems = detectSemantic(clean); } catch (e) { semItems = []; }

    // 语义层结论最强：同 name+template 时覆盖
    const mergeIn = (list) => {
      for (const it of list) {
        const i = out.findIndex(o => o.templateId === it.templateId && o.name === it.name);
        if (i >= 0) out[i] = it; else out.push(it);
      }
    };
    mergeIn(astItems);
    mergeIn(semItems);

    // 并查集语义成立时，把误判的双亲树降级（同一次分析里两套结论都留着会自相矛盾）
    if (out.some(o => o.templateId === 'ufset')) {
      for (let i = out.length - 1; i >= 0; i--) if (out[i].templateId === 'ptree') out.splice(i, 1);
    }

    // 按逻辑结构排序：图形 > 树形 > 集合 > 线性，同级按置信度
    const order = { graph: 0, tree: 1, set: 2, linear: 3 };
    out.sort((a, b) => (order[a.logical] - order[b.logical]) || (b.conf - a.conf));
    return out;
  }

  /* 渲染到"程序结构"窗（附行号，可点击跳行） */
  function render(host, src, opts) {
    opts = opts || {};
    const items = detect(src);
    host.innerHTML = '';
    if (!items.length) {
      host.innerHTML = '<div class="empty">未检测到已知数据结构（可手工在「跟踪设置」里指定）</div>';
      return items;
    }
    const head = document.createElement('div');
    head.style.cssText = 'font-weight:600;padding:2px 4px 6px;color:#334155';
    head.textContent = '数据结构检测（源码静态分析，' + items.length + ' 项）';
    host.appendChild(head);

    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;margin:0;padding:0;font:12px var(--mono)';
    items.forEach(it => {
      const li = document.createElement('li');
      li.style.cssText = 'padding:3px 6px;border-bottom:1px dashed #e3e8ee;cursor:pointer;display:flex;gap:6px;align-items:baseline';
      const badge = it.logical === 'graph' ? '#8250df' : it.logical === 'tree' ? '#1f6feb'
        : it.logical === 'set' ? '#bf3989' : '#1a7f37';
      li.innerHTML =
        '<span style="color:' + badge + ';font-weight:700">' + it.zh + '</span>' +
        (it.name ? '<span style="color:#0b3d91">' + it.name + '</span>' : '') +
        '<span style="margin-left:auto;color:#7b8794">行 ' + it.line +
        ' · ' + (it.source || '?') + ' 置信 ' + Math.round(it.conf * 100) + '%</span>';
      li.title = it.why;
      if (opts.onPick) li.addEventListener('click', () => opts.onPick(it));
      ul.appendChild(li);
    });
    host.appendChild(ul);

    const foot = document.createElement('div');
    foot.className = 'empty';
    foot.style.cssText = 'text-align:left;padding:6px 4px';
    foot.textContent = '提示：检测只给"建议画法"；单步运行时按 lists[] / N-NE 事件自动切换为准。';
    host.appendChild(foot);
    return items;
  }

  AVC.detect = { RULES, detect, render, classifyFields, classifyTypeName };
})(typeof window !== 'undefined' ? window : globalThis);
