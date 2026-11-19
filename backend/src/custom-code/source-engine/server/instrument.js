'use strict';
/**
 * instrument.js -- 把 C/C++ 源码改写成"可跟踪"版本
 *
 * 核心思想（对应 AnyviewC 的 VM 不可用时的替代方案）：
 *   每条可执行语句前插 __avc_t(line)，语句后插变量快照 __avc_vi/vd/vs；
 *   函数入口插 __avc_e("f")，出口插 __avc_x()；
 *   链表/树变量插生成的 dump 函数调用。
 *
 * 安全性原则：所有插桩都包在独立块 { ... } 里，避免改变 if/else、循环体的归属。
 *   例：  if (a) x = 1;
 *   ->    if (a) { __avc_t(9); x = 1; __avc_vi(9,"x",(long)x); }
 *
 * 分析全部基于"去注释后的等行数副本"，因此行号与用户源码严格一致。
 */

const astLib = require('../web/js/ast.js');

const INT_TYPES = /^(unsigned|signed|short|long|int|char|size_t)\b/;
const FLT_TYPES = /^(float|double)\b/;

function stripComments(src) {
  let out = '';
  let i = 0, n = src.length, st = 0; // 0 code 1 line-comment 2 block-comment 3 string 4 char
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (st === 0) {
      if (c === '/' && c2 === '/') { st = 1; out += '  '; i += 2; continue; }
      if (c === '/' && c2 === '*') { st = 2; out += '  '; i += 2; continue; }
      if (c === '"') { st = 3; out += c; i++; continue; }
      if (c === "'") { st = 4; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (st === 1) { if (c === '\n') { st = 0; out += '\n'; i++; } else { out += ' '; i++; } continue; }
    if (st === 2) {
      if (c === '*' && c2 === '/') { st = 0; out += '  '; i += 2; continue; }
      out += (c === '\n' ? '\n' : ' '); i++; continue;
    }
    if (st === 3 || st === 4) {
      out += c;
      if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; }
      if ((st === 3 && c === '"') || (st === 4 && c === "'")) st = 0;
      i++; continue;
    }
  }
  return out;
}

function balanced(s) {
  let p = 0, b = 0, k = 0;
  for (const ch of s) {
    if (ch === '(') p++; else if (ch === ')') p--;
    else if (ch === '[') b++; else if (ch === ']') b--;
    else if (ch === '{') k++; else if (ch === '}') k--;
  }
  return p === 0 && b === 0 && k === 0;
}

/**
 * 解析一条结构体字段声明（支持多声明符：`int key, color;` / `struct T *left, *right;`）
 * 之前只按"最后一个词是名字"抓，遇到 `int key, color` 整条丢掉 ——
 * 红黑树的 color、线索树的 ltag 就这么丢的。
 */
function parseFieldDecls(text, selfNames) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || t.startsWith('#')) return [];
  const out = [];
  const segs = t.split(',');
  const head = segs[0].trim();
  const m = head.match(/^([A-Za-z_][\w\s]*?)\s*(\**)\s*([A-Za-z_]\w*)\s*(\[[^\]]*\])?$/);
  if (!m) return [];
  const baseType = m[1].trim().replace(/^(struct|union)\s+/, '');
  if (/^(typedef|return|struct|union|enum)$/.test(baseType)) return [];
  const mk = (stars, name, arr) => ({
    type: baseType, isPtr: !!stars, name,
    isArray: !!arr, array: arr || null,
    self: !!stars && selfNames.has(baseType),
  });
  out.push(mk(m[2], m[3], m[4]));
  for (let i = 1; i < segs.length; i++) {
    const mm = segs[i].trim().match(/^(\**)\s*([A-Za-z_]\w*)\s*(\[[^\]]*\])?$/);
    if (mm) out.push(mk(mm[1], mm[2], mm[3]));
  }
  return out;
}

/** 解析 struct/typedef struct，记录字段与自引用指针 */
function parseStructs(codeLines) {
  const structs = [];
  for (let i = 0; i < codeLines.length; i++) {
    /* C++ 的 class 与 struct 在这里等价（只是默认可见性不同），一起认才能画 Tries / 链表类 */
      const m = codeLines[i].match(/\b(struct|union|class)\s+([A-Za-z_]\w*)?\s*\{/);
    if (!m) continue;
    const tag = m[2] || ('anon' + i);
    let j = i, depth = 0, bodyStart = -1, end = -1;
    for (; j < codeLines.length; j++) {
      for (const ch of codeLines[j]) {
        if (ch === '{') { depth++; if (bodyStart < 0) bodyStart = j; }
        else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end >= 0) break;
    }
    if (bodyStart < 0 || end < 0) continue;
    // typedef 名
    const after = codeLines[end].match(/\}\s*([A-Za-z_]\w*)\s*;/);
    const alias = after ? after[1] : null;
    const selfNames = new Set([tag, alias].filter(Boolean));
    const fields = [];
    /* 类体里除了数据成员，还有 public:/private: 与**成员函数体**。
       早期把函数体里的局部变量（i / j …）也当成字段，dump 代码就会去访问 p->i，
       插桩版直接编不过（表现是"回退到 no-dump，图上什么都没有"）。
       所以：只取类体第一层的声明，跳过访问修饰符与含函数体的行。 */
    let memberDepth = 0;
    for (let k = bodyStart; k <= end; k++) {
      let seg = codeLines[k];
      if (k === bodyStart) seg = seg.slice(seg.indexOf('{') + 1);
      if (k === end) seg = seg.slice(0, seg.lastIndexOf('}'));
      const trimmed = seg.trim();
      const opens = (seg.match(/\{/g) || []).length;
      const closes = (seg.match(/\}/g) || []).length;
      if (memberDepth === 0 && trimmed && !/^(?:public|private|protected)\s*:/.test(trimmed) && !/\(/.test(seg)) {
        for (const piece of seg.split(';')) {
          for (const f of parseFieldDecls(piece, selfNames)) fields.push(f);
        }
      }
      memberDepth += opens - closes;
      if (memberDepth < 0) memberDepth = 0;
    }
    if (!fields.length) continue;
    const selfFields = fields.filter(f => f.self);                 // 所有自引用字段（含指针数组）
    const nextField = (selfFields.find(f => !f.isArray && /^(next|link|succ)$/i.test(f.name)) || null);
    const prevField = (selfFields.find(f => !f.isArray && /^(prev|prior)$/i.test(f.name)) || null);
    const leftField = selfFields.find(f => /^(left|lchild|llink)$/i.test(f.name)) || null;
    const rightField = selfFields.find(f => /^(right|rchild|rlink)$/i.test(f.name)) || null;
    const keyField = fields.find(f => !f.isPtr && !f.isArray && INT_TYPES.test(f.type)) ||
                     fields.find(f => !f.isPtr && !f.isArray) || null;
    /* 形状判定（比原来"只认 next / left-right"宽得多）：
     *   tree  —— left + right（红黑/线索树也是二叉树，只是多带 color/ltag 语义）
     *   list  —— 单一 forward 指针（next/link/succ），或 next + prev 双向链
     *   graph —— 其余多指针情形（firstchild+nextsibling、ptr[]、hp/tp、right/down、firstin/firstout…）
     *            交给"通用多指针 walker"发 N/NE 事件，由前端按图统计判形状
     */
    const forwardOnly = !!(nextField && selfFields.length === 1);
    const dlistOnly = !!(nextField && prevField && selfFields.length === 2);
    const singleSelf = selfFields.length === 1 ? selfFields[0] : null;
    const hasColor = fields.some(f => /^color$/i.test(f.name));
    const hasThreadTag = fields.some(f => /^(ltag|rtag)$/i.test(f.name));
    /* 单一"非数组"自指针 → 可以按单链走；单一是"指针数组"（ptr[]/child[]）→ 必须走多叉 walker。
     * 红黑树 / 线索树带 color / ltag 语义，改走通用 walker（N/NE + NM 事件），
     * 否则 L/LE 通道装不下"结点的属性"，角标就永远画不出来。
     * 没有任何自引用字段（SqStack/SqQueue 这种纯数组+下标）→ 不需要 dump（字段由 V 事件观测）。 */
    const shape = !selfFields.length ? null
      : ((leftField && rightField)
        ? ((hasColor || hasThreadTag) ? 'graph' : 'tree')
        : ((forwardOnly || dlistOnly || (singleSelf && !singleSelf.isArray)) ? 'list' : 'graph'));
    structs.push({
      tag, alias, start: i, end, fields, nextField, prevField, leftField, rightField, keyField, selfFields,
      hasColor, hasThreadTag,
      shape,
      // 生成 dump 时使用的 C 类型写法：匿名结构体只能用 typedef 别名
      ctype: (alias && /^anon/.test(tag)) ? alias : ('struct ' + tag),
    });
  }
  return structs;
}

/** 找函数定义（名字 + 函数体行区间）
 *
 * `inClass` 传 true 时，**类/结构体里定义的成员函数**也要找到（`Trie::insert` 那种写法，
 * 以及直接写在 class 里的 `void insert(...) { ... }`）。
 * 为什么必须找：以前整个结构体区间一律跳过，于是成员函数体里的语句一条都不插桩 ——
 * 力扣那种 `class Trie { ... void insert(...) {...} }` 跑出来只有 main 里的一次 dump，
 * 屏幕上就是一张永远不变的图（"空空如也"的根因）。
 */
function parseFunctions(codeLines, structRanges, depthAt) {
  const inStruct = (i) => structRanges.some(r => i >= r.start && i <= r.end);
  /** 这一行是不是类的"直接子层"（= 成员函数签名所在层，而不是函数体内部） */
  const atClassBody = (i) => {
    const r = structRanges.find((x) => i >= x.start && i <= x.end);
    if (!r || !depthAt) return false;
    return depthAt[i] === depthAt[r.start] + 1;
  };
  const fns = [];
  const skipKw = /^(if|for|while|switch|return|else|do|case|default|typedef|struct|union|enum|sizeof|goto|break|continue)\b/;
  for (let i = 0; i < codeLines.length; i++) {
    if (inStruct(i) && !atClassBody(i)) continue;
    const line = codeLines[i];
    if (!line.match(/\([^;]*\)\s*\{?\s*$/) && !line.match(/\([^;]*\)\s*$/)) continue;
    if (line.trim().startsWith('#') || skipKw.test(line.trim())) continue;
    if (line.includes(';') && !line.includes('{')) continue;      // 原型声明
    const nm = line.match(/([A-Za-z_]\w*)\s*\(/);
    if (!nm || skipKw.test(nm[1])) continue;
    // 函数体起点
    let bodyLine = -1;
    if (line.includes('{')) bodyLine = i;
    else {
      for (let k = i + 1; k < Math.min(i + 4, codeLines.length); k++) {
        if (codeLines[k].trim().startsWith('{')) { bodyLine = k; break; }
        if (codeLines[k].trim() !== '') break;
      }
    }
    if (bodyLine < 0) continue;
    // 匹配右花括号
    let depth = 0, end = -1;
    for (let k = bodyLine; k < codeLines.length; k++) {
      for (const ch of codeLines[k]) {
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = k; break; } }
      }
      if (end >= 0) break;
    }
    if (end < 0) continue;
    const params = (line.match(/\(([^)]*)\)/) || [])[1] || '';
    /* 成员函数记下"属于哪个类/结构体"：这样函数体里就能用 `this` 把整个对象 dump 出来
       （`class Trie` 的 insert 里，`this` 就是根结点 —— 不 dump 它，插入过程中根本看不到整棵树） */
    const owner = structRanges.find((r) => i >= r.start && i <= r.end);
    fns.push({
      name: nm[1], start: i, bodyLine, end, params: params.trim(), ret: line.split(nm[1])[0].trim(),
      owner: owner ? owner.ref : null,
    });
    i = end;
  }
  return fns;
}

/* ---------------- C++ 容器（V2 采集层 b：STL 泛型） ---------------- */
/** 已知容器 → 采集类别；只列本工具链 <bits/stdc++.h> 垫片覆盖到的 */
const CXX_CTOR = {
  vector: 'seq', deque: 'seq', list: 'seq', set: 'seq', multiset: 'seq',
  queue: 'adapt', stack: 'adapt', priority_queue: 'adapt',
  map: 'map', multimap: 'map', unordered_map: 'map', unordered_set: 'seq',
  hash_map: 'map', hash_set: 'seq',
};
/** 元素类型白名单：不在其中的一律降级为只发 M(len)，绝不硬转 (long) */
const NUM_ELEM = /^(?:(?:unsigned|signed)\s+)?(?:char|short|int|long|float|double|bool|size_t|long\s+long|unsigned\s+long)$/;

function normType(s) {
  return String(s || '').replace(/^std\s*::\s*/, '').replace(/\bconst\b/g, '').replace(/\s+/g, ' ').trim();
}

/** vector<int> g[N]; / queue<int> q; / map<int,int> mp; → 记录数组（或 null） */
function parseCxxDecl(t) {
  const head = t.match(/^(?:std\s*::\s*)?([A-Za-z_]\w*)\s*</);
  if (!head || !CXX_CTOR[head[1]]) return null;
  const start = t.indexOf('<');
  let depth = 0, end = -1;
  for (let i = start; i < t.length; i++) {
    if (t[i] === '<') depth++;
    else if (t[i] === '>') { depth--; if (!depth) { end = i; break; } }
  }
  if (end < 0) return null;
  const targs = t.slice(start + 1, end);
  const typeText = t.slice(0, end + 1).replace(/\s+/g, ' ').trim();   // 保留用户写法（含 std::）
  const vm = t.slice(end + 1).match(/^\s*(?:[*&]\s*)?([A-Za-z_]\w*)\s*((?:\[[^\]]*\])*)/);
  if (!vm) return null;
  const args = targs.split(',').map(x => x.trim());
  return [{
    name: vm[1], kind: 'cxx', array: vm[2] || null,
    ctor: head[1], ctorKind: CXX_CTOR[head[1]],
    cxxType: typeText, targs: args,
    elem: normType(args[0]),
    elem2: args.length > 1 ? normType(args[1]) : null,
  }];
}

/**
 * C++ 容器的观测语句（内联生成，不依赖模板实例化）
 * 限流铁律：非空桶、结点≤32、边≤64、推不出元素类型 → 只发 M(len)
 */
function cxxWatchCalls(v, defines) {
  const q = (s) => '"' + s + '"';
  const n = v.name;
  const len = `__avc_len(${q(n)},(int)${n}.size());`;
  const numeric = NUM_ELEM.test(v.elem);
  const it = `${v.cxxType}::const_iterator`;

  /* ① 容器数组：vector<int> g[N] → 邻接表（顶点 = 桶下标，桶内元素 = 出边） */
  if (v.array) {
    const dims = arrayDims(v.array, defines);
    if (!dims) return [`__avc_len(${q(n)},0);`];
    const V = Math.min(dims[0], 32);
    if (!numeric) {
      return [`{ int _avc_u; __avc_len(${q(n)},${V}); for (_avc_u = 0; _avc_u < ${V}; _avc_u++)` +
        ` __avc_n(${q(n)},_avc_u,(long)${n}[_avc_u].size()); }`];
    }
    return [[`{ int _avc_u, _avc_ec = 0; __avc_len(${q(n)},${V});`,
      `for (_avc_u = 0; _avc_u < ${V}; _avc_u++) {`,
      `if (${n}[_avc_u].empty()) continue;`,                 // 只画非空桶（限流铁律）
      `__avc_n(${q(n)},_avc_u,(long)${n}[_avc_u].size());`,
      `for (${it} _avc_it = ${n}[_avc_u].begin(); _avc_it != ${n}[_avc_u].end() && _avc_ec < 64; ++_avc_it, ++_avc_ec)`,
      `__avc_edge(${q(n)},_avc_u,(int)(*_avc_it),"adj");`,
      `} }`].join(' ')];
  }

  if (!numeric && v.ctorKind !== 'map') return [len];

  /* ② 适配器：queue 用 front，stack / priority_queue 用 top（拷贝后弹空，不动原容器） */
  if (v.ctorKind === 'adapt') {
    const take = v.ctor === 'queue' ? 'front' : 'top';
    return [`{ ${v.cxxType} _avc_c = ${n}; int _avc_i = 0; ${len}` +
      ` while (!_avc_c.empty() && _avc_i < 32) { __avc_n(${q(n)},_avc_i,(long)_avc_c.${take}()); _avc_c.pop(); ++_avc_i; } }`];
  }

  /* ③ 关联容器：键可作 idx 时用键，否则顺序编号 */
  if (v.ctorKind === 'map') {
    if (!NUM_ELEM.test(v.elem2 || '')) return [len];
    const idx = NUM_ELEM.test(v.elem) ? '(int)_avc_it->first' : '_avc_i';
    return [`{ int _avc_i = 0; ${len} for (${it} _avc_it = ${n}.begin();` +
      ` _avc_it != ${n}.end() && _avc_i < 32; ++_avc_it, ++_avc_i)` +
      ` __avc_n(${q(n)},${idx},(long)_avc_it->second); }`];
  }

  /* ④ 序列容器：vector/deque 用下标，list/set 用迭代器 */
  if (v.ctor === 'vector' || v.ctor === 'deque') {
    return [`${len} { int _avc_i; for (_avc_i = 0; _avc_i < (int)${n}.size() && _avc_i < 32; _avc_i++)` +
      ` __avc_n(${q(n)},_avc_i,(long)${n}[_avc_i]); }`];
  }
  return [`{ int _avc_i = 0; ${len} for (${it} _avc_it = ${n}.begin();` +
    ` _avc_it != ${n}.end() && _avc_i < 32; ++_avc_it, ++_avc_i) __avc_n(${q(n)},_avc_i,(long)*_avc_it); }`];
}

/** 一行里花括号/圆括号/方括号的净增量（用于识别跨行初始化器的续行） */
function braceDelta(t) {
  let d = 0;
  for (const ch of String(t || '')) {
    if (ch === '{' || ch === '(' || ch === '[') d++;
    else if (ch === '}' || ch === ')' || ch === ']') d--;
  }
  return d;
}

/** 已知类型名（含用户 typedef）：用于识别"带初始化的声明" */
function typeNameSet(codeLines) {
  const s = new Set(['string', 'wstring', 'size_t', 'll', 'ull', 'pii', 'vi', 'ld', 'ull_t']);
  for (const l of codeLines) {
    const m = l.match(/^\s*typedef\b[^;]*?\b([A-Za-z_]\w*)\s*;/);
    if (m) s.add(m[1]);
  }
  return s;
}

/** `string s = "…";` / `ll big = …;` / `T x(v);` —— 带初始化的声明，
 *  绝不能被包进 `{ … }`，否则变量立刻出作用域（E029 就是这么来的）。 */
function declWithInit(t, types) {
  const m = String(t || '').match(/^([A-Za-z_]\w*)\s*(<[^;{}()]*>)?\s*[*&\s]\s*[A-Za-z_]\w*\s*(?:=|;|\(|\[|\{)/);
  return !!m && types.has(m[1]);
}

/** 这个声明符本身有没有初始化器？`int a[2], b[2] = {1,2};` → a 没有、b 有。
 *  评审报告 §3.4：不能只看整行有没有等号 —— 同行里别的变量带初始化器，会把没有的也当已初始化
 *  （实测 `int leftMax[32], rightMax[32], ans = 0, i;` 里 leftMax 被当成"已初始化 16 格"，于是裁不掉尾巴）。
 */
function declaratorHasInit(lineText, name) {
  const re = new RegExp('\\b' + name + '\\s*(?:\\[[^\\]]*\\]\\s*)*=(?!=)');
  return re.test(String(lineText || ''));
}

/** 解析声明语句里的变量 */
function parseDecl(line, structs) {
  const out = [];
  // `int* a = new int[n]` → `int *a = …`：类型与星号之间没有空格时，
  // 下面"类型 + 空格 + 声明符"的正则匹配不到，变量会被整个漏掉。
  const t = line.trim().replace(/^static\s+/, '').replace(/^const\s+/, '')
    .replace(/\b(unsigned|signed|short|long|int|char|float|double|bool|_Bool|size_t)\s*\*/g, '$1 *');
  const cx = parseCxxDecl(t);
  if (cx) return cx;
  // `PNode *head` / `BTNode *root`：用 typedef 别名代替 `struct Tag`（C 语言里最常见写法），
  // 也必须能认出来，否则链表/树一律采集不到（这是"换个代码就画不出"的头号原因）。
  const am = t.match(/^([A-Za-z_]\w*)\s*(\*+)?\s*(.+);$/);
  if (am && !/^(?:unsigned|signed|short|long|int|char|float|double|bool|_Bool|size_t|const|static|void|FILE)$/.test(am[1])) {
    const ast = structs.find(s => s.alias === am[1] || s.tag === am[1]);
    if (ast) {
      for (const d of am[3].split(',')) {
        const dm = d.trim().match(/^(\*+)?\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\])*)/);
        if (!dm) continue;
        const stars = (am[2] || '').length + (dm[1] || '').length;
        out.push({
          // `Node** p` 是"指针的指针"，不能当单指针喂给 walker（类型不匹配会编译失败）；
          // `HNode *ht[7]` 是"指针数组"（哈希桶 / 多级索引）：按数组逐元素采集，绝不当单结点 dump
          name: dm[2], kind: stars >= 2 ? 'ptr2' : (stars === 1 ? (dm[3] ? 'parr' : 'ptr') : 'struct'),
          structTag: ast.tag, array: dm[3] || null,
        });
      }
      return out;
    }
  }
  const sm = t.match(/^(struct|union)\s+([A-Za-z_]\w*)\s*(\*+)?\s*(.+);$/);
  if (sm) {
    const st = structs.find(s => s.tag === sm[2] || s.alias === sm[2]);
    for (const d of sm[4].split(',')) {
      const dm = d.trim().match(/^(\*+)?\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\])*)/);
      if (!dm) continue;
      const stars = (dm[1] || sm[3] || '').length;
      out.push({
        name: dm[2], kind: stars >= 2 ? 'ptr2' : (stars === 1 ? (dm[3] ? 'parr' : 'ptr') : 'struct'),
        structTag: sm[2], array: dm[3] || null,
      });
    }
    return out;
  }
  const tm = t.match(/^((?:unsigned|signed|short|long|int|char|float|double|bool|_Bool|size_t)(?:\s+(?:int|char|long|short))?)\s+(.+);$/);
  if (!tm) return out;
  const type = tm[1].trim();
  for (const d of tm[2].split(',')) {
    const dm = d.trim().match(/^(\*+)?\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\])*)\s*(?:=\s*(.*))?$/);
    if (!dm) continue;
    const isArr = !!dm[3];
    // `int* a = new int[n];` → 运行期长度的堆数组（数组窗要能看它）
    const nm = dm[1] && dm[4] ? dm[4].match(/^new\s+[A-Za-z_][\w:\s]*\s*\[([^\]]+)\]/) : null;
    if (nm) {
      out.push({ name: dm[2], kind: 'ptrarr', type, elem: type, lenExpr: nm[1].trim(), array: null });
      continue;
    }
    let kind = 'i';
    if (FLT_TYPES.test(type)) kind = 'd';
    if (dm[1]) kind = 'ptr';
    if (isArr && type === 'char') kind = 's';
    else if (isArr) kind = FLT_TYPES.test(type) ? 'da' : 'ia';
    out.push({ name: dm[2], kind, type, array: dm[3] || null });
  }
  return out;
}

function collectDefines(codeLines) {
  const map = {};
  for (const l of codeLines) {
    const m = l.match(/^\s*#\s*define\s+([A-Za-z_]\w*)\s+(\d+)\s*$/);
    if (m) map[m[1]] = parseInt(m[2], 10);
  }
  // const int N = 8;（含多声明符 const int N = 8, M = 4;）——数组尺寸常量最常见来源
  for (const l of codeLines) {
    const m = l.match(/^\s*(?:static\s+)?const\s+(?:unsigned\s+|signed\s+)?(?:int|long|short|size_t)\s+(.+?);/);
    if (!m) continue;
    for (const part of m[1].split(',')) {
      const d = part.match(/^\s*([A-Za-z_]\w*)\s*=\s*(\d+)\s*$/);
      if (d) map[d[1]] = parseInt(d[2], 10);
    }
  }
  return map;
}

/**
 * 记录**所有**宏的宏体文本（不要求是数字）。
 * 用途：判"下标表达式可证明无副作用"时要看宏会不会展开成函数调用/复合表达式 ——
 * `#define IDX nextIndex()` 这种在源码里看着像标识符，展开后却有副作用。
 */
function collectMacroBodies(codeLines) {
  const map = {};
  for (const l of codeLines) {
    const m = String(l).match(/^\s*#\s*define\s+([A-Za-z_]\w*)(\([^)]*\))?\s*(.*)$/);
    if (!m) continue;
    map[m[1]] = m[2] ? '(' + m[2].slice(1) + ' ' + m[3] : m[3];
  }
  return map;
}

function arrayDims(txt, defines) {
  const dims = [];
  const re = /\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(txt || ''))) {
    const expr = (m[1] || '').trim();
    let v = parseInt(expr, 10);
    if (!Number.isFinite(v) && defines && defines[expr]) v = defines[expr];
    if (!Number.isFinite(v) || v <= 0) return null;   // 尺寸未知 -> 不冒风险生成数组观察
    dims.push(Math.min(v, 16));
  }
  return dims.length ? dims : null;
}

/**
 * 下标表达式是否"可证明无副作用"。
 *
 * 为什么必须证明：写入标记要在赋值语句**前面**再求值一次下标，如果下标里有函数调用、
 * 自增自减、赋值或宏展开成调用，就等于把副作用执行了两遍 —— 插桩改变了程序行为。
 * 实测：`a[nextIndex()] = 7;`（nextIndex 里 cursor++）原程序输出 `1 7 0`，插桩后变成 `2 0 7`。
 *
 * 只放行：标识符、数字/字符字面量、`[] () . -> + - * / % & | ^ ~ ! < > ? :` 这些运算符组合，
 * 并且**任何标识符都不直接跟 `(`**（那可能是函数调用/构造），也不在 #define 里被展开成带括号的表达式。
 * 拿不准就不发标记（宁可少一条记录，也不能改程序行为）。
 */
const PURE_INDEX_CHARS = /^[A-Za-z_0-9\s[\]().+\-*/%&|^~!<>=?:,]*$/;
function isPurityProvable(expr, macros) {
  const text = String(expr || '').trim();
  if (!text) return false;
  if (!PURE_INDEX_CHARS.test(text)) return false;
  if (/(\+\+|--|=(?![=])|->\s*\()/.test(text)) return false;
  /* `f(x)` / `obj.method(x)` / `T(x)` 这类：标识符后面直接跟左括号 → 当作调用，跳过 */
  const ids = [...text.matchAll(/([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]);
  if (ids.length && ids.some((id) => id !== 'sizeof')) return false;
  const bodies = macros || {};
  for (const m of text.matchAll(/([A-Za-z_]\w*)/g)) {
    const body = bodies[m[1]];
    /* 宏体里只要带括号/自增/赋值，就可能展开成调用或有副作用的表达式 → 不发标记 */
    if (body != null && /[(){}]|\+\+|--|=(?!=)/.test(String(body))) return false;
  }
  return true;
}

/**
 * 语句里的**数组写入标记**：`a[i] = …` / `a[i]++` / `++a[i]` / `g[i][j] += …` → W 事件。
 *
 * 为什么要它：判断"这格是不是未初始化"以前只能看数值大小（|v| > 1e6 算垃圾），
 * 合法的大整数（2000000）就被误删了。写入记录是**事实**，不用猜。
 *
 * 安全边界（评审报告 P1 第 1 条）：下标必须**可证明无副作用**才发（见 isPurityProvable），
 * 函数调用、宏展开、自增自减、赋值一律跳过 —— 宁可少一条记录，也不能让插桩改变程序结果。
 * @returns {string[]} 要插在语句前面的 C 片段
 */
function writeMarkCalls(lineNo, text, structArrayFields, defines) {
  let s = String(text || '').trim().replace(/;$/, '').trim();
  const prefix = s.match(/^(\+\+|--)(?=\s*[A-Za-z_])/);
  if (prefix) s = s.slice(prefix[1].length).trim();
  /* `++a[i]` 剥掉前缀后就没有尾部运算符了，所以"有前缀"时只认赋值目标本身；
     另外 `a[i].key = …` 这种"结构体数组的字段写入"也要认（目标名拼成 `a.key`）。 */
  const assign = /^([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)+)\s*(?:\.\s*([A-Za-z_]\w*)\s*)?(?:[-+*/%&|^]?=(?!=)|\+\+|--)/.exec(s);
  const bare = prefix ? /^([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)+)$/.exec(s) : null;
  const m = assign || bare;
  if (!m) return [];
  const name = m[1];
  const field = m[3] || null;
  const idxTexts = [...m[2].matchAll(/\[([^\]]*)\]/g)].map((x) => x[1].trim());
  if (!idxTexts.length || idxTexts.length > 2) return [];
  /* 下标必须两处都无副作用：不然"标记一次 + 赋值一次"会把副作用做两遍 */
  if (!idxTexts.every((t) => isPurityProvable(t, defines))) return [];
  if (idxTexts.length === 1) {
    const at = `(int)(${idxTexts[0]})`;
    /* `a[i].key = x` → 记到字段视图 `a.key` 上（字段伪变量就是按这个名字出层的） */
    if (field) return [`__avc_w(${lineNo},"${name}.${field}",${at});`];
    /* `a[j] = a[j + 1]`（整条结构体拷贝）→ 每个字段视图都算被写过 */
    const fields = structArrayFields && structArrayFields.get(name);
    if (fields && fields.length) return fields.map((f) => `__avc_w(${lineNo},"${name}.${f}",${at});`);
    return [`__avc_w(${lineNo},"${name}",${at});`];
  }
  return [`__avc_w2(${lineNo},"${name}",(int)(${idxTexts[0]}),(int)(${idxTexts[1]}));`];
}

/**
 * 库函数写入：`scanf`、`memcpy/memmove/memset`。
 *
 * 为什么必须覆盖：这些写入不经过赋值语句，`W` 标记抓不到；"首次观测"又不算写入。
 * 但**标多标少**都必须按真实结果来（报告 §3）：
 *   · `scanf` 用返回值决定"前几项成功"：`scanf("%d %d", &a[0], &a[1])` 输入 `7 x` 只成功 1 项，
 *     a[1] 仍是未初始化内存 —— 不能两个格子都标已知；全部失败就一个都不标。
 *   · `memcpy/memset` 按**实际覆盖的完整元素数**标：`sizeof(int)` 是 1 个元素、
 *     `sizeof(a)` 是整块、`k * sizeof(T)` 是 k 个；算不出来（变量长度）就一个都不标，保持未知。
 * @returns {{before: string[], after: string[]}} before 插在语句前，after 插在语句后
 */
function libWriteCalls(lineNo, text, dimsOf, macroBodies) {
  const s = String(text || '');
  const before = [];
  const after = [];
  const seen = new Set();

  /* ---- scanf / fscanf：按**整次调用的转换序号**标记（报告 §1） ---- */
  const scan = /\b(scanf|fscanf)\s*\(/.exec(s);
  if (scan) {
    const open = scan.index + scan[0].length - 1;
    const close = matchParen(s, open);
    if (close >= 0) {
      const args = splitTopLevel(s.slice(open + 1, close), ',');
      /* fscanf 的第 1 个参数是 FILE*，格式串在第 2 个；scanf 在第 1 个 */
      const fmtIndex = scan[1] === 'fscanf' ? 1 : 0;
      const fmtText = String(args[fmtIndex] || '').trim();
      const fmt = /^"((?:[^"\\]|\\.)*)"$/.exec(fmtText);
      const conversions = fmt ? countScanfConversions(fmt[1]) : null;   // null = 格式串不是字面量，无法可靠识别
      if (conversions != null) {
        const targets = args.slice(fmtIndex + 1);
        /* 有序目标表：每个"会计入返回值"的转换对应一个参数（标量也要占位，报告明确要求保留位置） */
        let ord = 0;
        for (let i = 0; i < conversions.length; i++) {
          if (conversions[i] === 'suppressed') continue;                // %*d 不消耗参数、不计入返回值
          ord += 1;
          const arg = String(targets[i] || '').trim();
          const ref = /^&\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)+)$/.exec(arg);
          if (!ref) continue;                                          // 标量目标：占位但不发标记
          const name = ref[1];
          const idxTexts = [...ref[2].matchAll(/\[([^\]]*)\]/g)].map((x) => x[1].trim());
          if (!idxTexts.length || idxTexts.length > 2) continue;
          if (!idxTexts.every((t) => isPurityProvable(t, macroBodies))) continue;
          /* 参数顺序必须与运行时签名一致：__avc_swo(okCount, ord, name, idx) */
          if (idxTexts.length === 1) after.push(`__avc_swo(COUNT,${ord},"${name}",(int)(${idxTexts[0]}));`);
          else after.push(`__avc_swo2(COUNT,${ord},"${name}",(int)(${idxTexts[0]}),(int)(${idxTexts[1]}));`);
        }
        /* 返回值的来源：
           · 裸 `scanf(...)` → 整句包成 `int _avc_sc = (scanf(...));` 拿返回值（只求值一次）
           · `read = scanf(...)` → 语句之后 read 就是返回值
           · 其它（在 if 条件里等）→ 证明不了，不标（保持未知） */
        const assigned = /^([A-Za-z_]\w*)\s*=\s*(?:scanf|fscanf)\s*\(/.exec(s);
        const bare = /^(?:scanf|fscanf)\s*\(/.test(s);
        const countExpr = assigned ? assigned[1] : (bare ? '_avc_sc' : null);
        if (!countExpr) after.length = 0;
        else for (let i = 0; i < after.length; i++) after[i] = after[i].replace('COUNT', countExpr);
      }
    }
  }

  /* ---- memcpy / memmove / memset：按覆盖的完整元素数标记 ---- */
  for (const call of s.matchAll(/\b(memcpy|memmove|memset)\s*\(\s*&?\s*([A-Za-z_]\w*)\s*[,)]/g)) {
    const name = call[2];
    const dims = dimsOf && dimsOf.get(name);
    if (!dims || !dims.length) continue;
    const open = s.indexOf('(', call.index);
    const close = open >= 0 ? matchParen(s, open) : -1;
    if (close < 0) continue;
    const args = s.slice(open + 1, close).split(',');
    /* memset 的尺寸是第 3 个参数，memcpy/memmove 是第 3 个（dest,src,n） */
    const sizeText = (args[2] || '').trim();
    const count = copyElementCount(sizeText, name, dims);
    if (count == null) continue;                       // 算不出来 → 一格都不标，保持未知
    const key = name + '|copy';
    if (seen.has(key)) continue;
    seen.add(key);
    if (count >= dims[0] && dims.length === 1) { after.push(`__avc_init(${lineNo},"${name}",${dims[0]});`); continue; }
    if (dims.length === 2) {
      /* 二维：按**线性元素下标**逐格映射成行列（报告 §2）。
         以前把"覆盖元素数"向上取整成行数、再把整行都标成已写，
         于是 `memcpy(g, b, sizeof(int))` 会把第一行两格都标已知。 */
      const cols = dims[1] || 1;
      const total = dims[0] * cols;
      if (count >= total) { after.push(`__avc_init2(${lineNo},"${name}",${dims[0]},${dims[1]});`); continue; }
      for (let i = 0; i < Math.min(count, total); i++) {
        after.push(`__avc_w2(${lineNo},"${name}",${Math.floor(i / cols)},${i % cols});`);
      }
      continue;
    }
    for (let i = 0; i < Math.min(count, dims[0]); i++) after.push(`__avc_w(${lineNo},"${name}",${i});`);
  }
  return { before, after };
}

/**
 * `sizeof(a)` / `sizeof(int)` / `k * sizeof(T)` / `sizeof(T) * k` → 覆盖了几个完整元素。
 * 算不出来（含变量长度、或 size 不是 sizeof 形式）返回 null。
 */
function copyElementCount(sizeText, name, dims) {
  const t = String(sizeText || '').trim();
  if (!t) return null;
  if (new RegExp('^sizeof\\s*\\(?\\s*' + name + '\\b').test(t)) {
    /* 整块：1D 就是采样长度，2D 是 rows*cols */
    return dims.length >= 2 ? dims[0] * dims[1] : dims[0];
  }
  const single = /^sizeof\s*\(\s*[A-Za-z_][\w\s*]*\s*\)$/.test(t) || /^sizeof\s+[A-Za-z_]\w*$/.test(t);
  if (single) return 1;                                  // sizeof(int) → 一个元素
  const kTimes = /^(\d+)\s*\*\s*sizeof\s*\(?/.exec(t) || /^sizeof\s*\(?[^)]*\)?\s*\*\s*(\d+)$/.exec(t);
  if (kTimes) return Number(kTimes[1]);
  return null;
}

/**
 * 数一次 scanf 里的转换项（按顺序）：返回数组，每项是 'normal' 或 'suppressed'（`%*d`）。
 * 返回 null 表示格式串无法可靠解析（非字面量 / 含 `%%` 以外无法识别的东西也不必怕，`%%` 直接跳过）。
 * 只有"会计入返回值"的转换才消耗参数并对齐序号（报告 §1：标量目标也要占位）。
 */
function countScanfConversions(format) {
  const out = [];
  const text = String(format || '');
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '%') continue;
    i += 1;
    if (text[i] === '%') continue;                 // %% 字面量，不消耗参数
    let suppressed = false;
    if (text[i] === '*') { suppressed = true; i += 1; }
    /* 跳过标志/宽度/长度修饰，直到拿到转换字符 */
    while (i < text.length && /[-+ #0-9.hlLjzt]/.test(text[i])) i += 1;
    if (i >= text.length) break;
    out.push(suppressed ? 'suppressed' : 'normal');
  }
  return out;
}

function watchCalls(line, v) {
  const n = v.name;
  const L = line;
  const q = (s) => '"' + s + '"';
  // 结构体字段（S.data / S.top）：显示名带前缀，取值表达式走 `S.字段`
  const expr = v.fieldOf ? (v.fieldOf + '.' + v.fieldName) : n;
  /* 声明记录：带初始化器 → "每格都已有值"；没有初始化器 → "写之前都是未知"。
     折叠层据此判断"未初始化"，不再靠数值大小猜（合法的大整数不会被当垃圾）。
     声明行本身不插桩（C89 保证），所以这条标记挂在紧随其后的语句上，重复发也无害（幂等）。 */
  const initMark = (dims) => {
    if (!dims) return [];
    /* 结构体字段伪变量（`s.data`）不发：它们的写入发生在**成员函数里**（那时只有裸名字 `data`），
       名字对不上，发"未初始化"记录只会把好好的字段全打成未知。字段的初始化交给构造函数。 */
    if (v.fieldOf) return [];
    /* 全局 / static 存储期：C 规则保证隐式零初始化 → 全部格子都算已初始化。
       以前只看"声明行有没有等号"，于是 `int a[3];`（全局）明明是 0 0 0 却被标成三个未知。 */
    if (v.staticStorage) return dims.length === 1
      ? [`__avc_init(${L},${q(n)},${dims[0]});`]
      : [`__avc_init2(${L},${q(n)},${dims[0]},${dims[1]});`];
    if (!v.hasInit) return [`__avc_uninit(${L},${q(n)});`];
    /* 字符串字面量初始化的字符数组（`char s[] = "hi";`）单独标：只有这种才允许按 '\0' 裁尾巴，
       二进制字符数组里的 0 是数据，不能删（评审报告 §4）。 */
    if (dims.length === 1) {
      return [v.stringInit ? `__avc_initstr(${L},${q(n)},${dims[0]});` : `__avc_init(${L},${q(n)},${dims[0]});`];
    }
    if (dims.length >= 2) return [`__avc_init2(${L},${q(n)},${dims[0]},${dims[1]});`];
    return [];
  };
  if (v.kind === 'i') {
    /* 结构体数组字段视图：继承所属对象的初始化信息（有初始化器 → 已初始化；没有 → 未知） */
    const marks = v.uninitView
      ? [`__avc_uninit(${L},${q(v.viewBase || n)});`]
      : (v.hasInit && v.fieldCount ? [`__avc_init(${L},${q(v.viewBase || n)},${v.fieldCount});`] : []);
    return [...marks, `__avc_vi(${L},${q(n)},(long)(${expr}));`];
  }
  if (v.kind === 'd') {
    const marks = v.uninitView
      ? [`__avc_uninit(${L},${q(v.viewBase || n)});`]
      : (v.hasInit && v.fieldCount ? [`__avc_init(${L},${q(v.viewBase || n)},${v.fieldCount});`] : []);
    return [...marks, `__avc_vd(${L},${q(n)},(double)(${expr}));`];
  }
  if (v.kind === 's') {
    // 字符数组：既发整串（变量窗可读），也发逐下标（数组窗要按 a[i] 聚格）
    /* 逐下标发的是**字符**（类型标记 'c'）：只看数字的话，`"hello"` 会画成
       104/101/108/108/111，学生根本认不出这是字符串。类型标记来自声明，不是猜的。 */
    const calls = [...initMark(v.dims), `__avc_vs(${L},${q(n)},${expr});`];
    if (v.dims && v.dims.length === 1) {
      for (let i = 0; i < v.dims[0]; i++) {
        calls.push(`__avc_aic(${L},${q(n)},${i},(long)(unsigned char)(${expr}[${i}]));`);
      }
    } else if (v.dims && v.dims.length >= 2) {
      /* 二维字符数组（棋盘/迷宫）：必须发 `g[i][j]`，只发 `g[i]` 是把整行指针当字符，纯错误数据 */
      for (let i = 0; i < v.dims[0]; i++) {
        for (let j = 0; j < v.dims[1]; j++) {
          calls.push(`__avc_aic2(${L},${q(n)},${i},${j},(long)(unsigned char)(${expr}[${i}][${j}]));`);
        }
      }
    }
    return calls;
  }
  if (v.kind === 'ia' || v.kind === 'da') {
    const dims = v.dims;
    if (!dims) return [];
    const fn = v.kind === 'ia' ? '__avc_vi' : '__avc_vd';
    const cast = v.kind === 'ia' ? 'long' : 'double';
    const calls = initMark(dims);
    if (dims.length === 1) {
      for (let i = 0; i < dims[0]; i++) calls.push(`${fn}(${L},${q(n + '[' + i + ']')},(${cast})(${expr}[${i}]));`);
    } else {
      for (let i = 0; i < dims[0]; i++)
        for (let j = 0; j < dims[1]; j++)
          calls.push(`${fn}(${L},${q(n + '[' + i + '][' + j + ']')},(${cast})(${expr}[${i}][${j}]));`);
    }
    return calls;
  }
  return [];
}

function genDump(structs) {
  const protos = [], defs = [];
  // 指针合法性守卫：dump 常在 free() 之后被调用（悬垂指针），
  // 直接解引用会访问违例崩溃，因此先把指针范围筛一遍。
  const guard = [
    'static int __avc_ptr_ok(const void* p)',
    '{',
    '    unsigned long v = (unsigned long)p;',
    '    return v > 0x1000UL && v < 0x7F000000UL;',
    '}',
    '',
  ].join('\n');
  /** 结点的语义标量（红黑 color / 线索 ltag）→ NM 事件，渲染器据此画角标 */
  const metaCall = (s, idxExpr, ptrExpr) => {
    const lines = [];
    if (s.hasColor) lines.push(`        __avc_metai(var, ${idxExpr}, "color", (long)${ptrExpr}->color);\n`);
    if (s.hasThreadTag) lines.push(`        __avc_metai(var, ${idxExpr}, "ltag", (long)${ptrExpr}->ltag);\n`);
    return lines.join('');
  };

  for (const s of structs) {
    if (!s.shape) continue;
    const tag = s.tag.replace(/\W/g, '_');
    const key = s.keyField ? 'p->' + s.keyField.name : '0';
    // 匿名结构体（typedef struct {…} SqStack;）没有可写的 `struct <tag>` 名字，
    // 生成代码必须用 typedef 别名，否则编译器报 "Parameter 2, pointer type mismatch"。
    const ct = s.ctype || ('struct ' + s.tag);
    if (s.shape === 'list' && s.nextField) {
      protos.push(`static void __avc_dump_${tag}(const char* var, ${ct}* head);`);
      defs.push(
        `static void __avc_dump_${tag}(const char* var, ${ct}* head)\n{\n` +
        `    ${ct}* p = head;\n    int i = 0;\n` +
        `    while (p != (${ct}*)0 && __avc_ptr_ok(p) && i < 24) {\n` +
        `        __avc_l(var, i, (long)(${key}), (unsigned long)p, (p->${s.nextField.name} != (${ct}*)0) ? 1 : 0);\n` +
        metaCall(s, 'i', 'p') +
        `        p = p->${s.nextField.name}; i++;\n    }\n` +
        `    __avc_le(var, i, "list");\n}\n`);
    } else if (s.shape === 'tree' && s.leftField && s.rightField) {
      protos.push(`static void __avc_dump_${tag}(const char* var, ${ct}* root);`);
      defs.push(
        `static void __avc_dump_${tag}(const char* var, ${ct}* root)\n{\n` +
        `    ${ct}* q[64];\n    int qn = 0, i = 0;\n` +
        `    if (root) { q[qn++] = root; }\n` +
        `    while (i < qn && i < 32) {\n` +
        `        ${ct}* p = q[i];\n` +
        `        int _avc_li = -1, _avc_ri = -1;\n` +
        `        if (!__avc_ptr_ok(p)) { i++; continue; }\n` +
        /* 子结点下标 = 它入队时的队列下标（BFS 序），必须**先入队再发结点事件**，
           否则发 L 的时候还不知道自己的孩子是几号，树就画不出来（旧实现只发 L，没有父子索引）。 */
        `        if (p->${s.leftField.name})  { if (qn < 64) { _avc_li = qn; q[qn++] = p->${s.leftField.name}; } }\n` +
        `        if (p->${s.rightField.name}) { if (qn < 64) { _avc_ri = qn; q[qn++] = p->${s.rightField.name}; } }\n` +
        `        __avc_l(var, i, (long)(${key}), (unsigned long)p, (_avc_li >= 0 || _avc_ri >= 0) ? 1 : 0);\n` +
        `        __avc_metai(var, i, "left", (long)_avc_li);\n` +
        `        __avc_metai(var, i, "right", (long)_avc_ri);\n` +
        metaCall(s, 'i', 'p') +
        `        i++;\n    }\n` +
        `    __avc_le(var, i, "tree");\n}\n`);
    } else {
      /* shape === 'graph'：通用多指针 walker（PLAN_DETECT §4.3 ②-a 的落地）
       * 对每个自引用字段（含指针数组）发一条 NE 边，一次覆盖：
       *   孩子-兄弟树 / B 树 ptr[] / Trie child[] / 广义表 hp-tp / 十字链 right-down / 图十字链 firstin-firstout
       * 结点序号 = BFS 队列下标，边指向"子结点入队时的下标"，因此边与结点天然对齐；
       * 队列去重（__avc_ptr_in）保证同一结点不会因为多条边被重复入队。
       */
      const edges = [];
      for (const f of (s.selfFields || [])) {
        if (f.isArray) {
          /* 指针数组的探测长度：按**声明维度**来（上限 32），不要写死 8。
             Trie 的 children[26] 里 'p' 落在下标 15，写死 8 会让整棵树只走两层。 */
          const declaredSpan = (() => {
            const digits = String(f.array || '').match(/\d+/);
            return digits ? Number(digits[0]) : 0;
          })();
          const span = declaredSpan ? Math.min(declaredSpan, 32) : 8;
          edges.push(`        for (_avc_k = 0; _avc_k < ${span}; _avc_k++) { ${ct}* _avc_c = p->${f.name}[_avc_k];` +
            ` if (_avc_c && __avc_ptr_ok(_avc_c) && qn < 64 && !__avc_ptr_in(q, qn, _avc_c))` +
            /* slot= 记"这个子结点挂在父结点指针数组的第几格"：
               Trie 的 children[15] 就是字母 'p'（若程序里是 c - 'a'），
               没有它就只剩"第几个结点"，画出来的树没有任何语义。 */
            ` { __avc_edge(var, i, qn, "${f.name}"); __avc_metai(var, qn, "slot", (long)_avc_k); q[qn++] = (void*)_avc_c; } }`);
        } else {
          edges.push(`        if (p->${f.name} && __avc_ptr_ok(p->${f.name}) && qn < 64 && !__avc_ptr_in(q, qn, p->${f.name}))` +
            ` { __avc_edge(var, i, qn, "${f.name}"); __avc_metai(var, qn, "slot", (long)-1); q[qn++] = (void*)p->${f.name}; }`);
        }
      }
      protos.push(`static void __avc_dump_${tag}(const char* var, ${ct}* root);`);
      defs.push(
        `static void __avc_dump_${tag}(const char* var, ${ct}* root)\n{\n` +
        `    void* q[64];\n    int qn = 0, i = 0, _avc_k = 0;\n` +
        `    __avc_len(var, 0);\n` +
        `    if (root && __avc_ptr_ok(root)) { q[qn++] = (void*)root; }\n` +
        `    while (i < qn && i < 32) {\n` +
        `        ${ct}* p = (${ct}*)q[i];\n` +
        `        if (!__avc_ptr_ok(p)) { i++; continue; }\n` +
        `        __avc_n(var, i, (long)(${key}));\n` +
        /* 结点真实地址：链表/树靠它把"指针变量指到哪个结点"对上（L 事件里带地址，图这里也要带，
           否则 Trie 这类多路结构只能各画一张卡，看不出 node 走到哪了）。 */
        `        __avc_metai(var, i, "addr", (long)(unsigned long)p);\n` +
        metaCall(s, 'i', 'p') +
        edges.join('\n') + '\n' +
        `        i++;\n    }\n` +
        `    __avc_end(var, i);\n}\n`);
    }
  }
  if (defs.length) defs.unshift(guard);
  return { protos, defs };
}

/**
 * 找与 `openIdx` 处的 '(' 配对的 ')'（跳过字符串/字符字面量）
 * @returns {number} 闭合位置，找不到返回 -1
 */
function matchParen(text, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** 按顶层分隔符切分（for 头的三段；括号/花括号/字符串里的不算） */
function splitTopLevel(text, sep) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === sep && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * 循环条件里打点：让 for / while **每轮**都发一个 S 事件
 *
 *   while (cond)        ->  while ((__avc_t(L), (cond)))
 *   for (a; cond; c)    ->  for (a; (__avc_t(L), (cond)); c)
 *   do { ... } while(x); ->  do { ... } while((__avc_t(L), (x)));
 *
 * 为什么用逗号表达式、不给循环体加花括号：
 *   · 单语句体 `for (...) a[i]=i*i;` 加花括号会改变 else 配对与作用域风险；
 *   · 逗号表达式只出现在已有的括号里，语法位置不变，C89/C++ 都合法（左边是 void 表达式）；
 *   · 循环头跨多行时无法安全改写 → 返回 null，由调用方按原样处理（不硬改）。
 *
 * @param {string} codeLine 去注释后的单行文本
 * @param {number} lineNo 行号（写进 S 事件）
 * @returns {string|null} 改写后的行；不是循环头 / 头跨行 / 空条件 → null
 */
function markLoopCondition(codeLine, lineNo) {
  const m = /^(\s*)(for|while)\b\s*\(/.exec(codeLine || '');
  if (!m) return null;
  const open = (codeLine || '').indexOf('(', m[1].length);
  if (open < 0) return null;
  const close = matchParen(codeLine, open);
  if (close < 0) return null;                 // 循环头跨行：不动
  const inner = codeLine.slice(open + 1, close);
  const rest = codeLine.slice(close + 1);
  const marker = `__avc_t(${lineNo})`;
  if (m[2] === 'while') {
    const cond = inner.trim();
    if (!cond) return null;
    return `${m[1]}while ((${marker}, (${cond})))${rest}`;
  }
  const parts = splitTopLevel(inner, ';');
  if (parts.length < 2) return null;
  const cond = parts[1].trim() || '1';        // for (;;) 也照样能出步
  const head = parts[0];
  const tail = parts.slice(2).join(';');
  return `${m[1]}for (${head}; (${marker}, (${cond})); ${tail})${rest}`;
}

/**
 * @param {string} source
 * @param {object} opt {withWatches:boolean, withDumps:boolean, withFrame:boolean, maxWatches:number}
 */
function instrument(source, opt) {
  opt = Object.assign({ withWatches: true, withDumps: true, withFrame: true, maxWatches: 16 }, opt || {});
  const raw = source.split(/\r?\n/);
  const code = stripComments(source).split(/\r?\n/);
  const structs = parseStructs(code);
  const defines = collectDefines(code);
  const macroBodies = collectMacroBodies(code);
  const typeSet = typeNameSet(code);
  const structRanges = structs.map(s => ({ start: s.start, end: s.end, ref: s }));

  // 作用域按花括号层级粗略估算（parseFunctions 需要它来区分"类体直接子层"和"成员函数体内"）
  const depthAt = (() => {
    const d = new Array(code.length).fill(0);
    let cur = 0;
    for (let i = 0; i < code.length; i++) {
      d[i] = cur;
      for (const ch of code[i]) {
        if (ch === '{') cur++;
        else if (ch === '}') cur--;
      }
    }
    return d;
  })();

  const fns = parseFunctions(code, structRanges, depthAt);
  const inStruct = (i) => structRanges.some(r => i >= r.start && i <= r.end);
  /** 是否在某个函数体内部（含成员函数） */
  const insideFn = (i) => fns.some(f => i > f.bodyLine && i < f.end);

  // 收集变量：全局 + 各函数体首层
  const vars = [];
  const globals = [];
  /* 结构体数组（`Item a[4]`）→ 它的字段视图名，写入标记据此分发到 `a.key` / `a.aux`（整条拷贝时全都算写过） */
  const structArrayFields = new Map();
  /* name → 采样维度：给 scanf/memcpy/memset 的写入标记用 */
  const arrayDimsOf = new Map();
  for (let i = 0; i < code.length; i++) {
    /* 结构体/类的"成员声明区"跳过；但**成员函数体内部**要照常收集局部变量
       （`Trie* node = this;` / `int ch = ...` 全在这里，不收集就没有每一步的值） */
    if (inStruct(i) && !insideFn(i)) continue;
    const line = code[i];
    if (!/;\s*$/.test(line)) continue;
    if (/^\s*#/.test(line)) continue;
    const fn = fns.find(f => i > f.bodyLine && i < f.end);
    const baseDepth = fn ? depthAt[fn.bodyLine] + 1 : 0;
    if (depthAt[i] !== baseDepth) continue;      // 只取函数首层/全局
    const decls = parseDecl(line, structs);
    if (!decls.length) continue;
    for (const d of decls) {
      const st = d.structTag ? structs.find(s => s.tag === d.structTag) : null;
      const rec = Object.assign({}, d, {
        dims: arrayDims(d.array, defines),
        declLine: i + 1,
        scopeStart: fn ? fn.bodyLine : 0,
        scopeEnd: fn ? fn.end : code.length - 1,
        struct: st || null,
        /* 声明行里带初始化器（`int a[3] = {1,2,3};`）→ 每一格都已有值。
           折叠层用它区分"合法的大整数"和"未初始化的内存"。 */
        /* 这个**声明符本身**有没有初始化器：`int a[2], b[2] = {1,2};` → a 没有、b 有。
           评审报告 §3.4：不能只看整行有没有等号，否则同行里别的变量的初始化器会把没有的也当已初始化。 */
        hasInit: declaratorHasInit(line, d.name),
        /* 声明用字符串字面量初始化（`char s[] = "hi";`）：只有这种数组才按 '\0' 裁尾巴 */
        stringInit: /=\s*"/.test(String(line || '')),
        /* 存储期：全局/文件作用域，或声明里带 static/extern → C 保证隐式零初始化 */
        staticStorage: (!fn || /^\s*(?:static|extern)\b/.test(String(line || ''))),
      });
      if (!fn) globals.push(rec);
      else vars.push(rec);
      if (rec.dims && rec.dims.length) arrayDimsOf.set(rec.name, rec.dims);

      /* 结构体字段也要能看见：S.data[i] / S.top
       * 此前只观测"函数首层普通变量"，于是 SqStack.data/SqList.elem 这类字段完全不可见，
       * samples/ds/04 与 09 只能手写 sync_view() 镜像绕过。这里按字段表补出"字段伪变量"：
       *   数组字段 → 逐元素 V 事件（显示名 S.data[i]，与普通数组同一个聚合通道）
       *   标量字段 → 单条 V 事件（S.top）
       * 只处理非指针字段（指针字段交给 dump 的 walker）。
       *
       * 注意：仅当该行是"纯声明行"时才生成。`Edge e; e.to = 7;` 这种一行多语句，
       * 插桩会把整行包进 `{ … }`，变量随块结束出作用域 —— 之后再引用就报 E029。
       */
      const pureDeclLine = astLib.isDeclLine(String(code[i] || '').trim()) ||
        declWithInit(String(code[i] || '').trim(), typeSet);
      /* 结构体**数组**（`Item a[4]`）：字段要按下标展开成 `a.key[0..]` / `a[0].key`。
         以前一律生成 `a.key` —— 那是非法 C（'.' 左边不是结构体），插桩版直接编不过，
         整段代码降级到 trace-only，屏幕上 0 张卡（"结构体数组排序"这类题就是这样变空的）。 */
      if (rec.kind === 'struct' && st && rec.dims && rec.dims.length && d.kind !== 'ptr2' && pureDeclLine) {
        const count = Math.min(rec.dims[0] || 0, 16);
        const fieldNames = [];
        for (const f of (st.fields || [])) {
          if (f.isPtr || f.isArray) continue;                 // 指针/数组字段塞不进单条 V 事件
          const isNum = INT_TYPES.test(f.type);
          const isFloat = /^(float|double)$/i.test(String(f.type || '').trim());
          if (!isNum && !isFloat) continue;
          fieldNames.push(f.name);
          for (let k = 0; k < count; k++) {
            const frec = {
              /* 名字用 `a.key[k]`：数组窗按 base 聚格，于是"排序时 key 列怎么动"能一格格看 */
              name: rec.name + '.' + f.name + '[' + k + ']',
              fieldOf: rec.name + '[' + k + ']', fieldName: f.name,
              kind: isFloat ? 'd' : 'i', dims: null,
              /* 对象是**结构体数组**：这些字段视图在写之前是未初始化的，
                 名字和写入标记（`a.key`）对得上，所以可以放心发"未初始化"记录 */
              /* 字段视图继承所属结构体数组的初始化信息：带初始化器就不该标未知 */
              uninitView: !rec.hasInit,
              hasInit: rec.hasInit,
              fieldCount: count,
              viewBase: rec.name + '.' + f.name,
              declLine: rec.declLine, scopeStart: rec.scopeStart, scopeEnd: rec.scopeEnd,
              struct: null, structTag: null,
            };
            (fn ? vars : globals).push(frec);
          }
        }
        structArrayFields.set(rec.name, fieldNames);
        continue;
      }
      if (rec.kind === 'struct' && st && !(rec.dims && rec.dims.length) && d.kind !== 'ptr2' && pureDeclLine) {
        for (const f of (st.fields || [])) {
          if (f.isPtr) continue;
          const base = {
            name: rec.name + '.' + f.name, fieldOf: rec.name, fieldName: f.name,
            declLine: rec.declLine, scopeStart: rec.scopeStart, scopeEnd: rec.scopeEnd,
            struct: null, structTag: null,
          };
          const isNum = INT_TYPES.test(f.type);
          const isFloat = /^(float|double)$/i.test(String(f.type || '').trim());
          if (f.isArray) {
            const dims = arrayDims(f.array, defines);
            if (!dims) continue;
            const frec = Object.assign({}, base, { kind: isFloat ? 'da' : (isNum ? 'ia' : 's'), dims });
            (fn ? vars : globals).push(frec);
          } else {
            const frec = Object.assign({}, base, { kind: isFloat ? 'd' : (isNum ? 'i' : 's'), dims: null });
            (fn ? vars : globals).push(frec);
          }
        }
      }

      // `int* a = new int[n]`：长度是运行期值，且数组会在别的函数里被改（快排交换）。
      // 因此：① 记下"释放行"，释放之后绝不再解引用；② 允许在"声明它的函数"和
      // "参数表里出现同名指针的函数"里也 dump，看到交换过程。
      if (rec.kind === 'ptrarr') {
        const reFree = new RegExp('\\b(?:delete\\s*(?:\\[\\s*\\])?|free)\\s*\\(?\\s*' + rec.name + '\\b');
        let fi = -1;
        for (let k = i + 1; k < code.length; k++) if (reFree.test(code[k])) { fi = k; break; }
        rec.freeLine = fi >= 0 ? fi + 1 : code.length + 1;
        rec.looseFns = {};
        rec.declFn = fn ? fn.name : null;
        if (fn) rec.looseFns[fn.name] = 1;
        for (const f2 of fns) {
          const ps = Array.isArray(f2.params) ? f2.params.map(String) : String(f2.params || '').split(',');
          if (ps.some(p => new RegExp('\\b' + rec.name + '\\b').test(p))) rec.looseFns[f2.name] = 1;
        }
      }
    }
  }
  const allVars = globals.concat(vars);

  /* 数组参数（`void sort(int a[], int n)`）的元素 dump：
     局部数组由 watchCalls 逐元素发 V 事件，但**形参里的数组**不是变量声明，
     不进 vars 表，于是函数体内的每一步都看不到 a[ ] 的值 —— 自定义代码主线
     （学生写 `void sort(int a[], int n)`）正好卡在这里。
     这里按"数组形参 + 同名 int 形参当长度"生成 dump 调用，在每个插桩语句后发出。 */
  const paramArrays = {};
  for (const f of fns) {
    const ps = Array.isArray(f.params) ? f.params.map(String) : String(f.params || '').split(',');
    const arrays = [];
    const ints = [];
    for (const rawParam of ps) {
      const p = String(rawParam).trim();
      if (!p) continue;
      const arr = /^(?:const\s+)?(?:unsigned\s+|signed\s+)?(?:int|long|short|char|float|double|bool)\s+(\w+)\s*\[\s*\w*\s*\]$/.exec(p);
      if (arr) { arrays.push(arr[1]); continue; }
      const num = /^(?:const\s+)?(?:unsigned\s+|signed\s+)?int\s+(\w+)$/.exec(p);
      if (num) ints.push(num[1]);
    }
    if (arrays.length) paramArrays[f.name] = { arrays, len: ints[0] || null };
  }


  // 生成 dump 函数
  const dumps = opt.withDumps ? genDump(structs) : { protos: [], defs: [] };
  const dumpByTag = {};
  for (const s of structs) if (s.shape && opt.withDumps) dumpByTag[s.tag] = '__avc_dump_' + s.tag.replace(/\W/g, '_');

  // 函数入口的 __avc_e() 不能紧跟 '{' —— C89 要求声明在块首，
  // 而函数体通常先是 int a[N]; int i; 之类的声明。
  // 因此把进入点放在"最后一个前导声明之后、第一条语句之前"。
  // 声明行判定：C 基本类型 + struct/union/FILE + **C++ 模板/容器声明**（queue<int> q; 等）
  const DECL_START = /^(?:(?:unsigned|signed|short|long|int|char|float|double|bool|const|static|register|volatile|auto)\b|(?:struct|union|enum|class)\s+\w+|FILE\s*\*)/;
  const CXX_DECL = /^(?:std\s*::\s*)?[A-Za-z_]\w*(?:::\w+)*(?:\s*<[^;{}()]*>)?\s*[*&]*\s+[A-Za-z_]\w*\s*(?:=|;|\(|\[|\{)/;
  const enterAt = {};        // 行下标 -> 函数名（在该行前插入 __avc_e）
  const enterInline = {};    // bodyLine -> 函数名（空函数体，直接跟在 '{' 后）
  for (const f of fns) {
    let k = f.bodyLine + 1, found = -1, bd = 0;
    while (k <= f.end) {
      const t = code[k].trim();
      if (bd > 0) { bd += braceDelta(t); k++; continue; }   // 跨行声明/初始化器的续行
      if (!t || t.startsWith('#')) { k++; continue; }
      if (t === '}') break;                       // 空函数体 / 只有声明
      if (astLib.isDeclLine(t) || declWithInit(t, typeSet)) {
        bd += braceDelta(t);                      // `int a[3][3] = {` 之后是初始化器续行
        k++; continue;                            // 跳过前导声明
      }
      found = k; break;
    }
    if (found >= 0) enterAt[found] = f.name;
    else enterInline[f.bodyLine] = f.name;
  }

  const out = [];
  const slots = [];          // 每行输出在 out 中的下标（用于事后加前缀）
  const steps = [];
  const warnings = [];

  // 头部
  out.push('#include "avctrace.h"');
  /* 插桩要读用户结构体的成员来出结点图，但 C++ 的 private/protected 会挡住这些读取
     （报 E148: access to private member 'X::y' is not allowed）。
     这里在 C++ 下把可见性放开 —— 只为"能画出来"，不改变用户代码的运行行为；
     C 代码不受影响（#ifdef __cplusplus 包住）。 */
  out.push('#ifdef __cplusplus');
  out.push('#define private public');
  out.push('#define protected public');
  out.push('#endif');
  // 运行期数组长度：静态变量用"变量名"命名，任何函数里都能安全引用（不必知道 n 的作用域）
  const lenSyms = {};
  for (const v of allVars) {
    if (v.kind !== 'ptrarr' || lenSyms[v.name]) continue;
    lenSyms[v.name] = '__avc_Len_' + v.name;
    out.push(`static int ${lenSyms[v.name]} = 0;`);
  }
  // dump 原型引用了 struct Tag，必须放在 struct 定义之后
  const protoAt = structs.length ? Math.max.apply(null, structs.map(s => s.end)) + 1 : 0;
  let protosEmitted = dumps.protos.length === 0;

  /* 成员函数（class 里直接定义的方法）会在 **类体内部** 调用 dump —— 那时"struct 定义之后"
     的那份原型还没出现，Watcom 会报 `E029: symbol '__avc_dump_X' has not been declared`。
     所以：参数写的是 `struct Tag*` 的原型（命名 tag，可以只前置声明）额外在文件头再声明一次。
     C/C++ 都允许重复声明，后面 protoAt 处那份保持不动，原有布局零影响；
     用 typedef 别名的匿名单（`typedef struct {…} Node;`）没法前置声明，仍留在原位置。 */
  for (const p of dumps.protos) {
    if (/struct\s+[A-Za-z_]\w*\s*\*/.test(p)) out.push(p);
  }

  for (let i = 0; i < raw.length; i++) {
    if (!protosEmitted && i >= protoAt) {
      for (const p of dumps.protos) out.push(p);
      protosEmitted = true;
    }
    slots[i] = out.length;
    const orig = raw[i];
    const c = code[i];
    const lineNo = i + 1;
    const trimmed = c.trim();
    // 拼装插桩时必须用**去注释**的行：否则行尾 // 会把追加的 watch 与闭合 } 一起注释掉
    const codeLine = (c || '').replace(/\s+$/, '');

    /* ---- 循环头：把 __avc_t 塞进条件表达式，让 for/while **每轮**都发一次 S 事件 ----
       用逗号表达式而不是给循环体加花括号：单语句体、else 配对、do-while 尾巴都不受影响。
       块头行（`for (...) {`）以前完全不插桩，只有循环体内的行各自出步；现在每轮也能看到"判条件"这一步。 */
    const loopCode = markLoopCondition(codeLine, lineNo);
    if (loopCode && !enterInline[i] && !trimmed.startsWith('#')) {
      out.push(loopCode);
      steps.push(lineNo);
      continue;
    }

    // ---- 函数入口：空函数体时直接跟在 '{' 后 ----
    const inlineHere = enterInline[i];
    if (inlineHere && trimmed.includes('{')) {
      out.push(orig.replace('{', '{ ' + (opt.withFrame ? `__avc_e("${inlineHere}"); ` : '')));
      continue;
    }

    // ---- 普通语句插桩 ----
    // 只处理"完整的简单语句行"，并保证它是语句的起点：
    //   1) 去注释后非空、非预处理、非 case/default、非孤立花括号
    //   2) 以 ; 结尾且整行不含 '{'（含 { 的是块头，不能在行内塞进独立块）
    //   3) 括号/方括号配平（多行语句的中间行会被排除）
    //   4) 上一行必须是语句边界（; { } : 或空行/预处理），避免把续行当成新语句
    const startsWithContinuation = /^[,)\]}?+:*/=<>%&|"'.\-]/.test(trimmed);
    const prevBoundary = (() => {
      for (let k = i - 1; k >= 0; k--) {
        const t = code[k].trim();
        if (!t) continue;
        if (t.startsWith('#')) return true;
        return /[;{}:]$/.test(t) || t === 'else' || /^else\b/.test(t);
      }
      return true;
    })();

    // 只在函数体内部插桩（文件作用域的声明/原型不能变成语句块）
    const inFn = fns.find(f => i > f.bodyLine && i < f.end);
    // 声明语句：C89 要求声明位于块首，插桩时必须把声明放到最前面
    const declLike = astLib.isDeclLine(trimmed) || declWithInit(trimmed, typeSet);
    // 允许初始化器里的花括号，但禁止块头（if/for/while... {）
    const braceOk = !trimmed.includes('{') ||
      (/=[^;]*\{/.test(trimmed) && !/\b(if|for|while|switch|else|do|struct|union|enum)\b/.test(trimmed.split('{')[0]));

    const isStmt =
      !!inFn &&
      trimmed.length > 0 &&
      !trimmed.startsWith('#') &&
      /;\s*$/.test(trimmed) &&
      braceOk &&
      !trimmed.includes('}') &&
      !/^(case|default|else|do)\b/.test(trimmed) &&
      !/^while\s*\([^;]*\)\s*;\s*$/.test(trimmed) &&   // do-while 的尾巴，不能插
      !/^(typedef|struct|union|enum)\b/.test(trimmed) &&
      balanced(trimmed) &&
      !startsWithContinuation &&
      prevBoundary &&
      (!inStruct(i) || insideFn(i)) &&          // 类体里只插桩成员函数体内部
      !fns.some(f => f.start === i);

    // 排除纯控制头（无分号的行已由上面过滤）
    if (!isStmt) {
      // 函数收尾：无 return 的函数在 } 前补 __avc_x()
      const fnEnd = fns.find(f => f.end === i);
      if (fnEnd && opt.withFrame) {
        const body = code.slice(fnEnd.bodyLine, fnEnd.end).join('\n');
        if (!/\breturn\b/.test(body)) {
          out.push(orig.replace('}', '__avc_x(); }'));
          continue;
        }
      }
      out.push(orig);
      continue;
    }

    // 需要插桩的行
    const visible = allVars.filter(v => {
      if (v.kind === 'ptrarr') {
        // 只在"未释放"区间内、且当前函数有同名指针（声明处或参数）时才 dump。
        // 注意不能用"全局行号 > 声明行"来判断别的函数——快排这类"辅助函数写在前面、
        // 被 main 调用修改同一块内存"的结构，函数体的行号会小于声明行。
        if (!inFn || !v.looseFns || !v.looseFns[inFn.name]) return false;
        if (inFn.name === v.declFn) return lineNo > v.declLine && lineNo < v.freeLine;
        return inFn.bodyLine < v.freeLine;      // 同名指针的辅助函数：整个函数体都允许
      }
      return v.declLine < lineNo && lineNo >= v.scopeStart && lineNo <= v.scopeEnd;
    });
    const isReturn = /^return\b/.test(trimmed);
    const isBreak = /^(break|continue)\b/.test(trimmed);

    let watches = [];
    if (opt.withWatches && !isReturn && !isBreak) {
      let usedVars = 0;
      for (const v of visible) {
        if (usedVars >= opt.maxWatches) break;
        usedVars++;                        // 预算按"变量"计，不按生成的调用条数计
        const st = v.struct;
        if (v.kind === 'cxx') {
          watches.push(...cxxWatchCalls(v, defines));
        } else if (v.kind === 'ptrarr') {
          // 长度符号只在声明它的函数里能被赋值（那里 lenExpr 在作用域内）
          const setLen = (inFn && inFn.name === v.declFn) ? `${lenSyms[v.name]} = (int)(${v.lenExpr}); ` : '';
          watches.push(`${setLen}if (${v.name}) { int _avc_i;` +
            ` for (_avc_i = 0; _avc_i < ${lenSyms[v.name]} && _avc_i < 16; _avc_i++)` +
            ` __avc_aip(${lineNo},"${v.name}",_avc_i,(unsigned long)${v.name}[_avc_i]); }`);
        } else if (v.kind === 'parr') {
          // 指针数组（哈希桶 ht[7]、邻接表 adj[6]）：逐元素发**地址**（类型标记 'p'）。
          // 以前它被当成单个结点 dump，把 7 个桶首指针当成一个结点走；
          // 现在则要小心另一头：把地址当数组值画出来就是 15278504 这种无意义数字，折叠层见 'p' 不建数组层。
          const n = Math.min((v.dims && v.dims[0]) || 8, 16);
          const calls = [];
          for (let k = 0; k < n; k++) calls.push(`__avc_aip(${lineNo},"${v.name}",${k},(unsigned long)${v.name}[${k}]);`);
          watches.push(`{ ${calls.join(' ')} }`);
        } else if (v.kind === 'ptr' && st && st.shape && dumpByTag[st.tag]) {
          watches.push(`if (${v.name}) ${dumpByTag[st.tag]}("${v.name}", ${v.name});`);
        } else if (v.kind === 'struct' && st && st.shape && dumpByTag[st.tag]) {
          watches.push(`${dumpByTag[st.tag]}("${v.name}", &${v.name});`);
        } else {
          watches.push(...watchCalls(lineNo, v));
        }
      }
      /* 成员函数：把 `this` 指向的整张结构也 dump 一次。
         为什么必须：`class Trie` 的 insert 里只有 `node`（子树）可见，`main` 里的 `t` 要等函数返回才 dump，
         于是"插入过程中整棵树长什么样"完全看不到。`this` 就是那个根。
         卡片名用类名（`Trie`），比 `this` 好认；与 main 里同名结构重复时由折叠层去重。
         **但构造/析构函数里绝不能 dump**：那时成员还没初始化（`children[]` 全是垃圾），
         指针校验挡不住 0x0000dde8 这类"看起来合法"的野值，实测直接段错误。 */
      const owner = inFn && inFn.owner;
      const isCtorDtor = owner && (inFn.name === (owner.alias || owner.tag) || /^~/.test(inFn.name));
      if (owner && !isCtorDtor && owner.shape && dumpByTag[owner.tag]) {
        /* 变量名带 `this:` 前缀：折叠层据此"同名结构重复时优先保留用户自己的变量"
           （`t` 与"成员函数里的 this"是同一张图，屏幕上留一张就够） */
        watches.push(`${dumpByTag[owner.tag]}("this:${owner.alias || owner.tag}", this);`);
      }
    }

    // 组装插入后的行
    /* 数组形参的逐元素 dump（放在语句之后 → 快照是"这一步做完"的状态） */
    const paramWatches = [];
    if (opt.withWatches && inFn && paramArrays[inFn.name] && !isReturn) {
      const info = paramArrays[inFn.name];
      const lenExpr = info.len ? `(${info.len})` : '24';
      for (const name of info.arrays) {
        paramWatches.push(`if (${name}) { int _avc_pa;` +
          ` for (_avc_pa = 0; _avc_pa < ${lenExpr} && _avc_pa < 24; _avc_pa++)` +
          ` __avc_ai(${lineNo},"${name}",_avc_pa,(long)${name}[_avc_pa]); }`);
      }
    }
    const wtail = (paramWatches.length || watches.length) ? ' ' + paramWatches.concat(watches).join(' ') : '';
    const isControl = /^(if|for|while|switch)\b/.test(trimmed);
    /* 数组写入标记（`a[i] = …` / `a[i]++` / `g[i][j] = …`）：插在语句**前面**，
       这样下标表达式还是"写入前"的值（`a[j] = a[j+1]` 的 j 不会被语句改掉）。
       折叠层靠它区分"写过的格子"和"从没初始化过的格子"，不再拿数值大小猜垃圾。
       库函数（scanf/memcpy/memset）可能还有"语句之后才知道"的标记（scanf 的成功项数）。 */
    const libMarks = libWriteCalls(lineNo, trimmed, arrayDimsOf, macroBodies);
    const writeMark = [
      ...writeMarkCalls(lineNo, trimmed, structArrayFields, macroBodies),
      ...libMarks.before,
    ];
    const afterMark = libMarks.after;
    /* 裸 `scanf(...)`：把整句包成 `int _avc_sc = (scanf(...));` 才能拿到"成功赋值项数"。
       只求值一次、求值顺序不变（就是一个赋值表达式的初始化）。 */
    const bareScan = afterMark.length && /^(?:scanf|fscanf)\s*\(/.test(trimmed);

    if (declLike) {
      // 声明行完全不插桩：一旦在声明后追加语句，后面的声明就不再处于块首（C89 违规），
      // 作用域也会被切断。变量值由紧随其后的语句快照体现。
      out.push(orig);
      continue;
    }
    if (isControl) {
      // 控制语句只在其前面插入一个独立的跟踪块，绝不包裹：
      //   { __avc_t(n); } if (q) printf(...);   -> else 仍能正确配对
      out.push(`{ __avc_t(${lineNo}); } ${codeLine}`);
    } else if (isReturn && opt.withFrame) {
      out.push(`{ __avc_t(${lineNo}); __avc_x(); ${codeLine} }`);
    } else {
      const mark = writeMark.length ? ' ' + writeMark.join(' ') : '';
      const tail = afterMark.length ? ' ' + afterMark.join(' ') : '';
      const body = bareScan ? `int _avc_sc = (${trimmed.replace(/;\s*$/, '')});` : codeLine;
      out.push(`{ __avc_t(${lineNo});${mark} ${body}${wtail}${tail} }`);
    }
    steps.push(lineNo);
  }

  // 追加 dump 函数定义
  for (const d of dumps.defs) out.push('', d);
  if (!protosEmitted) for (const p of dumps.protos) out.push(p);

  // 事后给"进入点"那一行加前缀（保证 E 事件在该函数第一条语句的 S 之前发出）
  if (opt.withFrame) {
    for (const key in enterAt) {
      const i = +key;
      if (slots[i] == null || out[slots[i]] == null) continue;
      out[slots[i]] = `__avc_e("${enterAt[i]}"); ` + out[slots[i]];
    }
  }

  return {
    code: out.join('\n'),
    meta: {
      steps: steps.length,
      structs: structs.map(s => ({ tag: s.tag, alias: s.alias, shape: s.shape, fields: s.fields })),
      functions: fns.map(f => ({ name: f.name, line: f.start + 1, params: f.params })),
      globals: globals.map(g => ({ name: g.name, kind: g.kind, line: g.declLine })),
      vars: allVars.map(v => ({
        name: v.name, kind: v.kind, declLine: v.declLine,
        structTag: v.structTag || null,
        shape: v.struct && v.struct.shape ? v.struct.shape : null,
        array: v.array,
      })),
      warnings,
    },
  };
}

module.exports = { instrument, stripComments, markLoopCondition };
