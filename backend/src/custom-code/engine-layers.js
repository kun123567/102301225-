/**
 * engine-layers.js -- 把引擎（base 插桩）的事件**折叠成 plus 的 layers[]**
 *
 * 为什么要这一层：引擎给的是"事件流"（S 行 / V 变量 / L 结点 / NM 语义 / LE 收尾 / N-NE 图），
 * 而 plus 渲染器只吃"每步一层的 layers[]"（`{id,title,style,props,data,roles}`）。
 * 这一步做完，自定义代码就和 54 个示例走**同一套渲染器与动画**，不用改 Step v1 schema。
 *
 * 支持的族（按事件判据，不猜）：
 *   L + LE(shape=list)                 → style 3（结点 + 后继链 + head）
 *   L + NM(left/right) + LE(shape=tree) → style 9（左/右孩子 + roots）
 *   N + NE                              → style 10（图：结点 + 边）
 *   V(name[i])                          → style 1（数组）
 *
 * 不做的事：不发明数据。L 里给的 key 是什么就画什么；没有子结点索引就不画树（宁可只画数组）。
 */

const MAX_NODES = 32;      // 与插桩运行时自己的上限一致（`i < 32`），再小就会出现"孩子被截断"的悬空边
const MAX_EDGES = 48;

/* 数组的"方向语义"：静态识别器（base 的 detect.js）认出这 26 项里的某一个之后，
   把"从哪头进、从哪头出"写进数组层的名字里 —— 只画成一根横轴的话，栈/队列和普通数组长得一模一样。
   只有"确实是一个数组"的结构才有方向语义；链表/树/图不在这张表里。 */
const ARRAY_SEMANTICS = {
  /* view：'stack' 用竖版栈视图（style 7，栈顶在上、top 指针）；
     'queue' 用横版数组 + front/rear 指针（队头出、队尾进）；
     'label' 只加一句方向说明，画法仍是普通数组。 */
  sqstack: { zh: '顺序栈', direction: '只在末尾进出（LIFO），栈顶在末格', view: 'stack' },
  sqqueue: { zh: '循环队列', direction: '队头出、队尾进（FIFO）', view: 'queue' },
  heap: { zh: '堆', direction: '层序存放：父 i ↔ 子 2i / 2i+1', view: 'label' },
  hashtab: { zh: '哈希表', direction: '按 h(k) 定位槽位', view: 'label' },
  mgraph: { zh: '邻接矩阵', direction: '第 i 行是顶点 i 的邻接关系', view: 'label' },
  ufset: { zh: '并查集', direction: 'parent[i] 指向上级', view: 'label' },
};

/** 竖版栈层（style 7）：cells[0] = 栈底，栈顶在最后；top 指针指向栈顶，capacity 记声明容量 */
const stackLayer = (name, values, { capacity, semantic, labelOf = null }) => ({
  id: 'stack:' + name,
  title: name,
  style: 7,
  props: { cellH: 30, cellW: 150, vertical: true },
  data: {
    name: semantic ? `${name} · ${semantic.zh}（${semantic.direction}）` : name,
    cells: values.map((v, i) => ({ value: v, label: labelOf ? labelOf(v) : '#' + i })),
    top: values.length ? values.length - 1 : -1,
    capacity: capacity || values.length || 1,
    bottomLabel: 'bottom（栈底）',
    topLabel: 'top（栈顶）',
    semantic: semantic || undefined,
  },
  roles: values.length ? { focus1: [values.length - 1] } : {},
});

/** 疑似未初始化：只在"没写过 + 没初始化"的格子上作为**展示**兜底（绝不用于裁剪长度） */
const looksGarbage = (v) => !Number.isFinite(v) || Math.abs(v) > 1000000;

/**
 * 数组裁剪：**只按"写入/初始化记录"和长度线索裁，绝不按数值大小裁**。
 *
 * 以前这里按 `|v| > 1e6` 判"未初始化垃圾"并把尾巴切掉，于是合法的大整数
 * （`int a[3] = {1, 2000000, 3000000}`）被当垃圾删成 `[1]`。数值大小不能当判据 ——
 * 现在靠插桩发出的写入标记（W）知道"哪些格子被写过"，以及长度标量（top/n/len…）。
 *
 * @param {number[]} values 采到的值
 * @param {number} shortestLen 同批里最短数组的长度（0/1 表示不用）
 * @param {number} hintLen 长度线索（名字标量 / 写过的最大下标 + 1）；-1 表示没有
 * @returns {{values:number[], trimmedFrom:number|null}}
 */
function trimValues(values, shortestLen, hintLen = -1) {
  let out = Array.isArray(values) ? values.slice() : [];
  let trimmedFrom = null;
  const limit = Math.min(
    shortestLen >= 2 ? shortestLen : Infinity,
    hintLen >= 0 ? hintLen : Infinity,
  );
  if (Number.isFinite(limit) && out.length > limit) {
    trimmedFrom = out.length;
    out = out.slice(0, Math.max(0, limit));
  }
  return { values: out, trimmedFrom };
}

const arrayLayer = (name, values, focus = null, semantic = null, labels = null) => ({
  id: 'arr:' + name,
  title: name,
  style: 1,
  props: { shape: 0, showGrid: true, showLine: false, showValues: true },
  data: {
    name: semantic ? `${name} · ${semantic.zh}（${semantic.direction}）` : name,
    values: values.map((v) => (v == null ? 0 : v)),
    labels: values.map((v, i) => (labels && labels[i] != null ? labels[i] : String(v == null ? 0 : v))),
    indexBase: 0,
    axis: true,
    unit: '',
    semantic: semantic || undefined,
  },
  roles: focus == null || !values.length ? {} : { focus1: [Math.min(focus, values.length - 1)] },
});

const listLayer = (name, nodes, head) => ({
  id: 'list:' + name,
  title: name,
  style: 3,
  props: { roundShape: false, linkFirst: false, nodeW: 92, nodeH: 44, gap: 46 },
  data: {
    name: `${name}（链）`,
    nodes: nodes.map((node) => ({ id: node.id, value: node.label, addr: node.addr == null ? undefined : node.addr })),
    links: nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id })),
    head: head || (nodes[0] && nodes[0].id) || null,
    fields: null,
    order: null,
  },
  roles: {},
});

const treeLayer = (name, nodes, rootId) => {
  /* 孩子引用必须落在本层结点集合里：截断（>MAX_NODES）留下的悬空引用会让渲染器找空结点，
     所以这里既裁剪也标注 —— 宁可少画，也不画到不存在的地方去。 */
  const ids = new Set(nodes.map((node) => node.id));
  let dropped = 0;
  const clean = (ref) => {
    if (!ref) return undefined;
    if (ids.has(ref)) return ref;
    dropped += 1;
    return undefined;
  };
  const dataNodes = nodes.map((node) => ({
    id: node.id,
    label: node.label,
    addr: node.addr == null ? undefined : node.addr,
    left: clean(node.left),
    right: clean(node.right),
    value: node.value == null ? undefined : String(node.value),
  }));
  return {
    id: 'tree:' + name,
    title: name,
    style: 9,
    props: { layout: 'canvas', levelGap: 84, siblingGap: 26 },
    data: {
      name: `${name}（树）`,
      nodes: dataNodes,
      roots: rootId && ids.has(rootId) ? [rootId] : [],
      edgeTags: {},
      threads: [],
      extraEdges: null,
      levels: null,
      truncatedChildren: dropped,
    },
    roles: {},
  };
};

/**
 * 树形结构的坐标（0..1）：多路树（Trie 的 children[26]、B 树的 ptr[]）没有 left/right，
 * 走不了 style 9，所以还是 style 10 —— 但**不能再画成圆环**：
 * 一条 `a→p→p→l→e` 的链画成圆环，看着就像"6 个结点随便摆一圈"，跟结构毫无关系。
 *
 * 判据（只看事件给的东西，不猜）：每个结点至多一个父亲、只有一个根、无环 → 是树。
 * 有向边 parent→child 由 walker 的 BFS 给出，方向是可信的。
 */
function treeLayout(nodes, edges) {
  const ids = new Set(nodes.map((n) => n.id));
  const parentOf = new Map();
  const kids = new Map();
  for (const node of nodes) kids.set(node.id, []);
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    if (parentOf.has(edge.to)) return null;            // 一个结点两个父亲 → 不是树
    parentOf.set(edge.to, edge.from);
    kids.get(edge.from).push(edge.to);
  }
  const roots = nodes.filter((n) => !parentOf.has(n.id)).map((n) => n.id);
  if (roots.length !== 1) return null;                  // 多根/全无根 → 不是树
  const depth = new Map();
  const order = [];
  const walk = (id, d, guard) => {
    if (guard > nodes.length + 2) return false;         // 环
    depth.set(id, d);
    order.push(id);
    for (const kid of kids.get(id)) if (!walk(kid, d + 1, guard + 1)) return false;
    return true;
  };
  if (!walk(roots[0], 0, 0)) return null;
  if (order.length !== nodes.length) return null;        // 有结点挂在环/孤岛上

  /* 叶子按 DFS 序排横坐标，父结点取孩子横坐标的中点（线性时间，够用） */
  const xOf = new Map();
  let leaf = 0;
  const place = (id) => {
    const list = kids.get(id);
    if (!list.length) { xOf.set(id, leaf++); return xOf.get(id); }
    const xs = list.map((kid) => place(kid));
    const x = xs.reduce((a, b) => a + b, 0) / xs.length;
    xOf.set(id, x);
    return x;
  };
  place(roots[0]);
  const maxDepth = Math.max(...[...depth.values()]);
  const spread = leaf - 1;                    // 叶子数 - 1：= 0 说明整棵树只是一条链
  const pos = new Map();
  for (const id of order) {
    pos.set(id, {
      /* 只有一条链时横坐标全一样 → 排在中线，别贴在左边缘 */
      x: spread > 0 ? xOf.get(id) / spread : 0.5,
      y: maxDepth ? depth.get(id) / maxDepth : 0,
    });
  }
  return pos;
}

/**
 * 源码里"字符 ↔ 槽位"的基准：`word[i] - 'a'`、`text[i] - 48`（= '0'）这类写法。
 *
 * 这是从用户代码里读出来的算术关系，不是名字表；只有**唯一一个**基准候选时才敢用，
 * 而且数字字面量必须落在可打印字符范围（32..126），避免把 `i - 1` 这种普通算术当成字符偏移。
 */
export function charBaseOf(sourceLines) {
  const text = String((sourceLines || []).join('\n'))
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const found = new Set();
  for (const m of text.matchAll(/-\s*'(.)'/g)) {
    const code = m[1].charCodeAt(0);
    if (code > 0) found.add(code);
  }
  for (const m of text.matchAll(/-\s*(\d{2,3})\b/g)) {
    const code = Number(m[1]);
    if (code >= 32 && code <= 126) found.add(code);
  }
  /* 只有一个基准候选才敢用（多个说明有多种映射，就别猜了） */
  return found.size === 1 ? [...found][0] : null;
}

const graphLayer = (name, nodes, edges, charBase = null) => ({
  id: 'graph:' + name,
  title: name,
  style: 10,
  props: { directed: true, weighted: false, layout: 'circle' },
  data: (() => {
    /* 结点标签优先级（全部来自事件/源码，没有结构名表）：
       ① 有槽位 + 源码能推出字符基准 → 字母（Trie 的 a/p/p/l/e），槽位放 sub；
       ② walker 给的值有信息量（不是全 0/1、不是全都一样）→ 用它当标签（B 树的 key），槽位放 sub；
       ③ 只有槽位 → #槽位；④ 什么都没有 → #下标。 */
    const raw = nodes.map((node) => String(node.label ?? ''));
    const known = raw.filter((l) => l !== '');            // 还没收到 N 的结点标签未知，不算进判据
    const allSame = known.length > 1 && known.every((l) => l === known[0]);
    /* 值全是 0/1 → 它是"是不是结束/是否访问"这类**标记**，当成标签只会让每个结点都长一样，
       所以标成 #下标 + 用 sub 写 END，语义不会丢 */
    const boolish = known.length > 0 && known.every((l) => l === '0' || l === '1');
    const valueLabel = !boolish && !allSame;
    const labelled = nodes.map((node, i) => {
      const slot = Number.isInteger(node.slot) && node.slot >= 0 ? node.slot : null;
      if (slot != null && charBase != null && charBase + slot <= 0x10ffff) {
        return { node, label: String.fromCharCode(charBase + slot), sub: '#' + slot };
      }
      if (valueLabel && raw[i]) return { node, label: raw[i], sub: slot != null ? '#' + slot : undefined };
      if (slot != null) return { node, label: '#' + slot, sub: 'child' };
      if (boolish) return { node, label: '#' + i, sub: raw[i] === '1' ? 'END' : undefined };
      return { node, label: '#' + i, sub: undefined };
    });
    const pos = treeLayout(nodes, edges);
    /* 整棵树只是一条链（叶子只有一个）→ 横着排更像"链"；竖着排圆圈会挨在一起、箭头都看不见 */
    const chain = pos ? new Set([...pos.values()].map((p) => p.x)).size === 1 : false;
    return {
      name,
      nodes: labelled.map(({ node, label, sub }) => ({
        id: node.id,
        label,
        sub,
        badge: null,
        /* 结点地址只给折叠层用（判断"两张卡是不是同一批结点"、"指针指到哪个结点"）；
           渲染器不读它，所以不会出现在画面上 */
        addr: node.addr == null ? undefined : node.addr,
        x: pos && !chain ? pos.get(node.id).x : undefined,
        y: pos && !chain ? pos.get(node.id).y : undefined,
      })),
      /* 树形（walker 的 BFS 父子关系）→ 画箭头；不是树（圆环）→ 保持原来的无向画法 */
      edges: edges.map((edge) => ({ from: edge.from, to: edge.to, state: 'idle', directed: Boolean(pos) })),
      layout: chain ? 'line' : (pos ? 'tree' : 'circle'),
    };
  })(),
  roles: {},
});

/** 事件流 → 结构化模型（可变，按步取快照） */
function emptyModel() {
  /* lineCursors：这一步在执行的那一行里"可以当游标画"的变量名。
     指针动画全靠它 —— "谁在动"必须是代码这一行写过的事实，不能靠名字猜。
     ptrVars：各指针变量这一轮 dump 的链头地址（NULL 记 null），用来把药丸钉到结点上。 */
  return { arrays: new Map(), matrices: new Map(), structures: new Map(), graphs: new Map(), ptrVars: new Map(), lineCursors: null };
}

/* 这一行源码用到了哪些标识符（先剥注释与字符串，避免把注释里的词当变量） */
export function identifiersOf(line) {
  const text = String(line || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ');
  const out = new Set();
  for (const m of text.matchAll(/[A-Za-z_]\w*/g)) out.add(m[0]);
  return out;
}

/**
 * 全文里"真的被当下标用过"的标识符：`a[i]`、`b[i+1]`、`q[(front+1)%cap]` 里的 i / i / front / cap…
 *
 * 这是从用户代码里抽出来的**事实**，不是名字表：`int t` 这种"暂存值"永远不会出现在下标里，
 * 于是也不会被误画成游标（否则 `t = a[j];` 会让 t 的药丸漂到"值等于 t 的那一格"上 —— 纯属误导）。
 */
export function indexNamesOf(sourceLines) {
  const names = new Set();
  const text = String((sourceLines || []).join('\n'))
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  for (const m of text.matchAll(/\[\s*([^\]\n]*)\]/g)) {
    for (const id of m[1].matchAll(/[A-Za-z_]\w*/g)) names.add(id[0]);
  }
  return names;
}

/**
 * 这一行里"可以当游标画"的变量名。两条判据都来自代码本身，不是名字表：
 *   ① 全文里被当下标用过（`a[i]` 的 i）→ 出现在本行就算；
 *   ② 本行是 `for` / `while` 头 → 头里的标量都是计数器/边界（`for (j = 0; j < n-1-i; j++)` 的 i、j）。
 * 这样 `sum += a[i]`、`t = a[j]` 里的 sum / t 不会被误画成"漂在第 sum 格上的指针"。
 */
export function cursorNamesOf(lineText, indexNames) {
  const out = new Set();
  if (lineText == null) return out;
  const names = identifiersOf(lineText);
  for (const name of names) if (indexNames && indexNames.has(name)) out.add(name);
  if (/^\s*(?:for|while)\s*\(/.test(String(lineText))) for (const name of names) out.add(name);
  return out;
}

const MAX_POINTERS = 4;

/**
 * 数组上的游标（i / j / k / p …）：**只认这一行出现过、且值落在实际格子里的标量**。
 *
 * 为什么不定一张名字表：`i/j/k/lo/hi/cur/pos` 各有各的写法，硬编码必然漏，
 * 而且会和"识别任意数据结构与算法组合"的目标相冲突。用"本行用到 + 值在范围内"
 * 当判据，任何自定义代码都成立，也不会把没参与这一步的变量画上去。
 */
function arrayPointers(varName, values, scalars, cursors) {
  const out = [];
  if (!cursors || !cursors.size || !values.length) return out;
  for (const [key, value] of scalars || []) {
    if (key === varName) continue;
    if (LEN_DIRECT.test(tailName(key))) continue;        // n / len / size 是长度，不是游标
    if (!cursors.has(key)) continue;                    // 这一步没把它当下标/计数器用
    const v = Number(value);
    if (!Number.isInteger(v) || v < 0 || v >= values.length) continue;
    out.push({ id: key, label: key, index: v });
    if (out.length >= MAX_POINTERS) break;
  }
  return out;
}

/* 常见"长度标量"名字：栈/队列用 top/sp/rear，数组用 n/len/size/count。
   有它就能把 int s[16] 这种"声明长度"裁到"实际用了多少格"，否则栈/队列里全是未初始化格子。

   注意都是按**最后一段**匹配：类的成员数组会被插桩成 `s.data[i]` / `s.top` 这种带点的名字
   （`struct MinStack { int data[64]; int top; }`），只认裸名字的话成员栈一辈子都裁不出来。 */
const LEN_PLUS_ONE = /^(top|sp|rear|tail)$/i;      // 这些是"最后一个元素的下标"
const LEN_DIRECT = /^(n|len|length|size|count|num|front)$/i;

/** `s.data` → `data`；裸名字原样返回 */
const tailName = (name) => String(name == null ? '' : name).split('.').pop();

function hintLength(scalars) {
  let best = -1;                     // -1 = 没有长度线索；0 = 明确为空（例如 top = -1 的空栈）
  for (const [name, value] of scalars || []) {
    const v = Number(value);
    if (!Number.isFinite(v)) continue;
    const tail = tailName(name);
    /* top/sp/rear 这类是"最后一个元素下标"：-1 表示空（长度 0），所以允许 -1；
       n/len/size 这类是长度本身：只接受 >= 0。早先把 -1 一刀切掉了，
       结果空栈那一步回退成"声明长度"，屏幕上又是一堆未初始化格子。 */
    if (LEN_PLUS_ONE.test(tail)) { if (v >= -1) best = Math.max(best, Math.round(v) + 1); }
    else if (LEN_DIRECT.test(tail)) { if (v >= 0) best = Math.max(best, Math.round(v)); }
  }
  return best;
}


/* 视图判定：**运行期游标**优先，静态识别兜底。
   为什么不能只看静态识别：`int q[8]` + `(rear + 1) % 8` 会被 base 的规则认成"哈希表"，
   但它其实是循环队列。而 `top` 存在 / `front`+`rear` 同时存在，是程序自己写出来的事实。 */
function viewOf(semantic, scalars) {
  /* 按最后一段匹配（`s.top` 也算 top）：类的成员栈被插桩成带点的名字 */
  const has = (k) => {
    if (!scalars) return false;
    for (const [name, value] of scalars) if (tailName(name) === k && Number.isInteger(value)) return true;
    return false;
  };
  if (has('top') || has('sp')) return 'stack';
  if ((has('front') && has('rear')) || (has('head') && has('tail'))) return 'queue';
  return semantic ? semantic.view : null;
}

/** 视图对应的语义说明：静态识别给的更具体，没有就给"按游标推断"的诚实说法 */
function semanticForView(view, semantic) {
  if (view === 'stack') {
    return semantic && semantic.zh && semantic.view === 'stack'
      ? semantic
      : { zh: '顺序栈（按 top 推断）', direction: '只在末尾进出（LIFO），栈顶在末格', view: 'stack', inferred: true };
  }
  if (view === 'queue') {
    return semantic && semantic.zh && semantic.view === 'queue'
      ? semantic
      : { zh: '循环队列（按 front/rear 推断）', direction: '队头出、队尾进（FIFO）', view: 'queue', inferred: true };
  }
  return semantic || null;
}
/** 数组层：先按"最短数组长度 / 长度标量 / 尾部垃圾"裁剪，再挂上静态识别给出的方向语义 */
function arrayLayersOf(model, statics, scalars) {
  /* 指针数组（`HNode* bucket[7]`）只存地址：地址不是数据，画成一排数字纯属噪音。
     它们的链已经由 list/graph 层画出来了，这里直接跳过。 */
  const entries = [...model.arrays.entries()].filter(([, entry]) => entry.values.length && !entry.addrOnly);
  if (!entries.length) return [];
  const lengths = entries.map(([, entry]) => entry.values.length).filter((n) => n >= 2);
  const shortest = lengths.length ? Math.min(...lengths) : 0;
  const hinted = hintLength(scalars);
  const semanticOf = (name) => {
    /* 成员数组叫 `s.data`，静态识别给的是 `data` —— 按最后一段也认一下，
       否则"顺序栈/循环队列"这些方向说明对类的成员数组永远不生效 */
    const tail = tailName(name);
    const hit = (statics || []).find((item) => {
      const itemName = String(item.name);
      return itemName === name || itemName === name + '[]'
        || tailName(itemName) === tail || tailName(itemName.replace(/\[\]$/, '')) === tail;
    });
    const mapping = hit && hit.templateId ? ARRAY_SEMANTICS[hit.templateId] : null;
    return mapping ? { ...mapping, templateId: hit.templateId, conf: hit.conf ?? null, source: hit.source ?? null } : null;
  };
  return entries.map(([name, entry]) => {
    const rawLength = entry.values.length;
    /* 长度线索：① 名字表（top / n / len …）—— 只对常见写法有效；
       ② **写入/初始化记录**：写过的最大下标 + 1，或声明时初始化过的长度。
       两者都没有就保持采样长度（不按数值大小猜）。 */
    const writtenLen = Number.isInteger(entry.writtenMax) && entry.writtenMax >= 0 ? entry.writtenMax + 1 : -1;
    const initLen = Number.isInteger(entry.initLen) ? entry.initLen : -1;
    const hint = hinted >= 0 ? hinted : Math.max(writtenLen, initLen);
    let { values, trimmedFrom } = trimValues(entry.values, shortest, hint);
    if (entry.chars) {
      /* 字符数组：尾部连续的 '\0' 是"字符串结束"、不是数据 —— 裁掉才能看清 "hello" 这 5 格 */
      while (values.length > 1 && values[values.length - 1] === 0) values = values.slice(0, -1);
    }
    /* 中间还没初始化的格子：只看**声明/写入记录**（声明时没有初始化器、且这格还没写过 → 未知）。
       绝不因为"数值大"就当垃圾 —— `int a[3] = {1, 2000000, 3000000}` 必须原样显示。 */
    const inited = (i) => (entry.uninit ? (entry.written.has(i) || i < (entry.initLen ?? 0)) : true);
    const labels = entry.chars
      ? values.map(charLabel)
      : values.map((v, i) => (inited(i) ? String(v) : '?'));
    const shown = values.map((v, i) => (labels[i] === '?' ? 0 : v));
    const view = viewOf(semanticOf(name), scalars);
    const semantic = semanticForView(view, semanticOf(name));

    /* 顺序栈 → 竖版栈视图（栈顶在上、带 top 指针）；画法一变，"从哪头进出"就不用解释了 */
    if (view === 'stack') {
      const layer = stackLayer(name, shown, { capacity: rawLength, semantic, labelOf: entry.chars ? charLabel : null });
      if (trimmedFrom != null) layer.data.trimmedFrom = trimmedFrom;
      return layer;
    }

    /* 循环队列 → 仍是横版数组，但把队头/队尾指针画出来（front 出、rear 进）；
       没有指针值时退化成普通数组 + 一行方向说明。 */
    const layer = arrayLayer(name, shown, entry.focus, semantic, labels);
    if (trimmedFrom != null) layer.data.trimmedFrom = trimmedFrom;   // 声明长度被裁过，留痕
    const pointers = [];
    if (view === 'queue') {
      /* 也按最后一段找（成员队列的游标叫 `q.front`） */
      const scalarOf = (key) => {
        if (!scalars) return undefined;
        for (const [name, value] of scalars) if (tailName(name) === key) return value;
        return undefined;
      };
      const push = (key, label) => {
        const idx = scalarOf(key);
        if (Number.isInteger(idx) && idx >= 0 && idx < values.length) pointers.push({ id: key, label, index: idx });
      };
      push('front', 'front（队头）');
      push('rear', 'rear（队尾）');
    }
    /* 游标（i / j / k / p …）：这一步在动的下标，画面上的药丸会跟着格子滑（置位动画由渲染端做） */
    for (const p of arrayPointers(name, values, scalars, model.lineCursors)) {
      if (!pointers.some((q) => q.id === p.id)) pointers.push(p);
    }
    if (pointers.length) layer.roles = { ...layer.roles, pointers };
    return layer;
  });
}

/**
 * 链表/树上的指针：插桩对**每个指针变量各 dump 一条链**（`L|cur|…`），
 * 每条链的头结点就是这个变量当前指的位置，并且带着真实地址。
 * 所以不用另外采地址：把"各变量的链头地址"对到本层的结点地址上，就能在同一张图上
 * 画出 head / cur / prev / p 各自的药丸 —— 而不是每个变量各占一张卡片各画一遍。
 */
function structurePointers(entry, ptrVars) {
  const out = [];
  if (!ptrVars || !ptrVars.size) return out;
  const byAddr = new Map();
  for (const node of entry.nodes) {
    if (node.addr == null) continue;
    if (!byAddr.has(node.addr)) byAddr.set(node.addr, node.id);
  }
  for (const [name, addr] of ptrVars) {
    if (addr == null) continue;
    const id = byAddr.get(addr);
    if (!id) continue;
    out.push({ id: name, label: name.startsWith('this:') ? 'this' : name, node: id });
    if (out.length >= MAX_POINTERS) break;
  }
  return out;
}

function snapshotLayers(model, statics, scalars) {
  const layers = [];
  for (const [name, entry] of model.structures) {
    if (entry.shape === 'tree' && entry.nodes.length) {
      const layer = treeLayer(name, entry.nodes, entry.root);
      const pointers = structurePointers(entry, model.ptrVars);
      const focus = structurePointers(entry, new Map([[name, model.ptrVars.get(name)]]));
      if (pointers.length) layer.roles = { ...layer.roles, pointers };
      if (focus.length) layer.roles = { ...layer.roles, focus1: [focus[0].node] };
      layers.push(layer);
    } else if (entry.shape === 'list' && entry.nodes.length) {
      const head = entry.nodes[0].id;
      const layer = listLayer(name, entry.nodes, head);
      const pointers = structurePointers(entry, model.ptrVars);
      const focus = structurePointers(entry, new Map([[name, model.ptrVars.get(name)]]));
      if (pointers.length) layer.roles = { ...layer.roles, pointers };
      if (focus.length) layer.roles = { ...layer.roles, focus1: [focus[0].node] };
      layers.push(layer);
    }
  }
  for (const [name, entry] of model.graphs) {
    if (!entry.nodes.length) continue;
    const layer = graphLayer(name, entry.nodes, entry.edges, model.charBase);
    /* 成员函数里的 `this` dump 带 `this:` 前缀（折叠层靠它决定重复时留谁）；
       卡片上不该出现这个前缀，直接显示类名 */
    if (name.startsWith('this:')) {
      const display = name.slice(5);
      layer.title = display;
      layer.data.name = display;
    }
    /* 多路结构（Trie / B 树）也有指针：`node` 走到哪个结点，靠结点地址对上（见 structurePointers） */
    const pointers = structurePointers(entry, model.ptrVars);
    const focus = structurePointers(entry, new Map([[name, model.ptrVars.get(name)]]));
    if (pointers.length) layer.roles = { ...layer.roles, pointers };
    if (focus.length) layer.roles = { ...layer.roles, focus1: [focus[0].node] };
    layers.push(layer);
  }
  for (const [name, entry] of model.matrices) {
    if (entry.cells.size) layers.push(matrixLayer(name, entry));
  }
  layers.push(...arrayLayersOf(model, statics, scalars));
  return pruneSubsetStructures(dedupeStructures(layers));
}

/**
 * 子集卡片折叠：`head` 与 `cur` 同时 dump 时，`cur` 的链是 `head` 链的一段 ——
 * 小卡片重复画了同一批结点，屏幕上就是"3 张几乎一样的链表"。
 * 这里把"结点地址集合是别人真子集"的那张去掉，并把它的指针药丸**映射到**留下来的那张上
 * （按地址找结点 id），于是"一个结构 + 一堆游标"就画在一张图上。
 *
 * 只在能证明是子集时动手（两边地址都齐、且真子集）；地址缺失（早期步骤/没发 NM）就不合并。
 */
function pruneSubsetStructures(layers) {
  const byStyle = new Map();
  for (const layer of layers) {
    if (layer.style !== 3 && layer.style !== 9 && layer.style !== 10) continue;
    if (!byStyle.has(layer.style)) byStyle.set(layer.style, []);
    byStyle.get(layer.style).push(layer);
  }
  const dropped = new Set();
  for (const group of byStyle.values()) {
    if (group.length < 2) continue;
    const info = group.map((layer) => {
      const byAddr = new Map();
      for (const node of layer.data.nodes || []) if (node.addr != null) byAddr.set(node.addr, node.id);
      return { layer, byAddr, addrs: new Set(byAddr.keys()) };
    });
    for (const small of info) {
      if (!small.addrs.size) continue;
      const container = info
        .filter((big) => big !== small && big.addrs.size > small.addrs.size
          && [...small.addrs].every((addr) => big.addrs.has(addr)))
        .sort((a, b) => b.addrs.size - a.addrs.size)[0];
      if (!container) continue;
      dropped.add(small.layer);
      const mapNode = (id) => {
        const node = (small.layer.data.nodes || []).find((n) => n.id === id);
        return node && node.addr != null ? container.byAddr.get(node.addr) : null;
      };
      const pointers = [...(container.layer.roles.pointers || [])];
      for (const p of small.layer.roles.pointers || []) {
        const mapped = mapNode(p.node);
        if (!mapped || pointers.some((q) => q.id === p.id)) continue;
        pointers.push({ ...p, node: mapped });
      }
      if (pointers.length) container.layer.roles = { ...container.layer.roles, pointers };
      const focus = (small.layer.roles.focus1 || []).map(mapNode).filter(Boolean);
      if (focus.length && !container.layer.roles.focus1) {
        container.layer.roles = { ...container.layer.roles, focus1: focus };
      }
    }
  }
  return dropped.size ? layers.filter((layer) => !dropped.has(layer)) : layers;
}

/**
 * 同一张结构被多个变量 dump 出来时（`this` 与 `t`、`head` 与 `cur` 恰好同一个对象），
 * 屏幕上会出现两张一模一样的卡片 —— 只留一张。
 *
 * 优先留"用户自己写的变量"：插桩给成员函数里的 `this` 加的 dump 名字带 `this:` 前缀，
 * 所以 `t` 与 `this:Trie` 撞在一起时留 `t`（屏幕上的名字就是代码里的名字）。
 * 只合并**完全相同**的（结点地址序列 + 边都一致），不做"子集就删"：少画是信息损失。
 */
function dedupeStructures(layers) {
  const seen = new Map();            // 指纹 → 已保留的层
  const out = [];
  const order = layers.slice().sort((a, b) => {
    const aSelf = String(a.id).includes('this:') ? 1 : 0;
    const bSelf = String(b.id).includes('this:') ? 1 : 0;
    return aSelf - bSelf;            // 非 this 的排前面 → 先被保留
  });
  for (const layer of order) {
    if (layer.style !== 3 && layer.style !== 9 && layer.style !== 10) { out.push(layer); continue; }
    const nodes = layer.data.nodes || [];
    const addrs = nodes.map((n) => (n.addr == null ? n.id : n.addr)).join(',');
    const links = (layer.data.edges || layer.data.links || []).map((e) => e.from + '>' + e.to).join(',');
    const sig = layer.style + '|' + nodes.length + '|' + addrs + '|' + links;
    const kept = seen.get(sig);
    if (kept) {
      /* 被合并的那张卡如果带了指针药丸，把药丸并到留下的那张上（信息不丢） */
      const merged = [...(kept.roles.pointers || [])];
      for (const p of layer.roles.pointers || []) if (!merged.some((q) => q.id === p.id)) merged.push(p);
      if (merged.length) kept.roles = { ...kept.roles, pointers: merged };
      continue;
    }
    seen.set(sig, layer);
    out.push(layer);
  }
  /* 同一张卡上"用户变量"和"this"指到同一个结点时，只留用户变量那个药丸
     （`t` 与成员函数里的 `this` 是同一个对象，画两个标签只是噪音） */
  for (const layer of out) {
    const pointers = layer.roles && layer.roles.pointers;
    if (!pointers || pointers.length < 2) continue;
    const keep = pointers.filter((p) => !(String(p.id).startsWith('this:')
      && pointers.some((q) => q !== p && !String(q.id).startsWith('this:') && q.node === p.node)));
    if (keep.length !== pointers.length) layer.roles = { ...layer.roles, pointers: keep };
  }
  return out;
}

/* 数组元素事件的名字：`a[3]`，也认类成员数组 `s.data[3]`（插桩对成员字段发的是带点的名字） */
const ARRAY_ELEMENT_RE = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\[(\d+)\]$/;
/* 二维数组（矩阵）：`a[1][2]` / `g[i][j]` 的字段版 `S.g[1][2]` —— 走 style 2 的矩阵渲染器 */
const MATRIX_ELEMENT_RE = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\[(\d+)\]\[(\d+)\]$/;

/** 字符数组层：值是字符码，标签显示成字符（`\0` 显示成 ·，尾部连续的 \0 直接裁掉） */
const charLabel = (code) => {
  const n = Number(code);
  if (!Number.isFinite(n)) return '?';
  if (n === 0) return '·';
  if (n === 32) return '␣';
  return n >= 33 && n <= 126 ? String.fromCharCode(n) : '·';
};

function matrixLayer(name, entry) {
  const rows = Math.min(entry.maxR + 1, MAX_NODES);
  const cols = Math.min(entry.maxC + 1, MAX_NODES);
  const values = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const v = entry.cells.get(r + ',' + c);
      /* 未写过的格子写 '·'：判据是**声明/写入记录**（声明时没有初始化器且还没写过），
         不是数值大小。整张矩阵声明时就初始化过、或根本没记录 → 原样显示。
         字符矩阵（棋盘/迷宫）按字符显示 —— 值就是字符码，声明里写了 char。 */
      const key = r + ',' + c;
      const inited = entry.uninit
        ? (entry.written.has(key) || (entry.initR != null && r < entry.initR && entry.initC != null && c < entry.initC))
        : true;
      if (v === undefined || !inited) row.push('·');
      else row.push(entry.chars ? charLabel(v) : v);
    }
    values.push(row);
  }
  return {
    id: 'mat:' + name,
    title: name,
    style: 2,
    props: { drawMode: 1 },
    data: { name, values, rows, cols },
    roles: entry.focus ? { focus1: [entry.focus] } : {},
  };
}

/**
 * 引擎事件 → 每步一层 layers（顺序与 S 事件一致）
 * @param {{trace:object, sourceLines?:Array, preludeLines?:number, statics?:Array}} input
 *   statics：静态识别结果（detectStatic().items），用来给数组标"栈/队列/堆…"的方向语义
 * @returns {{ok:true, steps:Array, style:number|null, families:string[], stats:object}|{ok:false,error:string}}
 */
export function buildLayerRun({ trace, sourceLines = [], preludeLines = 0, statics = [] } = {}) {
  const events = trace?.events || [];
  const model = emptyModel();
  model.indexNames = indexNamesOf(sourceLines);
  model.charBase = charBaseOf(sourceLines);
  const openDump = new Map();        // var → {nodes: Map(idx→node), shape, root}
  const scalars = new Map();         // 标量快照（top / n / len …），用来裁数组的"实际长度"
  const steps = [];
  const families = new Set();
  let lastLine = null;

  const toUserLine = (engineLine) => {
    const line = Number(engineLine) - preludeLines;
    return Number.isInteger(line) && line >= 1 && line <= (sourceLines.length || Infinity) ? line : null;
  };
  /* 本步状态变了就重取快照：一次 dump 会分好几条事件到达（N 标签 / NM 槽位与地址 / NE 边），
     漏刷新会画出"结点有了但还没标签/槽位"的中间态。 */
  const touch = () => {
    const step = steps[steps.length - 1];
    if (step) step.layers = snapshotLayers(model, statics, scalars);
  };

  for (const event of events) {
    const kind = event[0];
    if (kind === 'S') {
      /* 每个 S 都是一步：把当前模型快照下来（S = "即将执行这一行"，快照就是执行前的状态）。
         顺带清掉上一步的"聚焦元素" —— 聚焦表示"这一步写了谁"，不该跨步残留。 */
      for (const entry of model.arrays.values()) entry.focus = null;
      lastLine = toUserLine(event[1]);
      /* 这一行要执行了：记住它 —— 指针/游标只从这一行的变量里取（见 cursorNamesOf） */
      const lineText = lastLine == null ? '' : sourceLines[lastLine - 1];
      model.lineCursors = cursorNamesOf(lineText, model.indexNames);
      const layers = snapshotLayers(model, statics, scalars);
      steps.push({ stepIndex: steps.length, lineId: lastLine == null ? null : String(lastLine), layers, note: '', engineLine: event[1] });
      continue;
    }
    if (kind === 'V') {
      const [, line, name, typeTag, value] = event;
      const matrix = MATRIX_ELEMENT_RE.exec(String(name || ''));
      const element = matrix ? null : ARRAY_ELEMENT_RE.exec(String(name || ''));
      const refresh = () => {
        /* 值/标量都是本步的状态：谁来都得重取快照，否则"指针位置"会落后这一步 */
        const step = steps[steps.length - 1];
        if (step && line === step.engineLine) step.layers = snapshotLayers(model, statics, scalars);
      };
      if (matrix) {
        /* 二维数组：按 (行,列) 存格子，最后折成一个 style 2 矩阵层 */
        const [, base, rowText, colText] = matrix;
        const r = Number(rowText);
        const c = Number(colText);
        if (r >= MAX_NODES || c >= MAX_NODES) continue;
        const num = Number(value);
        const entry = model.matrices.get(base) || { cells: new Map(), maxR: 0, maxC: 0, focus: null };
        const key = r + ',' + c;
        if (entry.cells.get(key) !== num && Number.isFinite(num) && !entry.focus) entry.focus = key;
        entry.cells.set(key, Number.isFinite(num) ? num : 0);
        if (typeTag === 'c') entry.chars = true;
        entry.maxR = Math.max(entry.maxR, r);
        entry.maxC = Math.max(entry.maxC, c);
        model.matrices.set(base, entry);
        families.add('matrix');
        refresh();
        continue;
      }
      if (!element) {
        /* 标量：top / n / len / size 这些是"数组实际用了多少格"的线索（栈/队列全靠它定边界）；
           游标（i / j / cur 的下标位置）也是从这里来的 */
        const num = Number(value);
        if (Number.isFinite(num)) scalars.set(String(name), num);
        refresh();
        continue;
      }
      const [, base, idxText] = element;
      const index = Number(idxText);
      if (index >= MAX_NODES) continue;
      const entry = model.arrays.get(base) || { values: [], focus: null, written: new Set(), seen: new Set() };
      while (entry.values.length <= index) entry.values.push(null);
      const num = Number(value);
      if (entry.values[index] !== num && Number.isFinite(num) && entry.focus == null) entry.focus = index;   // 记本步第一个变化的元素
      /* 值变了 = 一定被写过（第一次观测不算：那只是"首次看到"）。
         真正的写入事实来自 W 事件；这里作为补充（`*p = …`、函数里改内存等抓不到目标的写入）。 */
      if (entry.seen.has(index) && entry.values[index] !== num && Number.isFinite(num)) {
        entry.written.add(index);
        entry.writtenMax = Math.max(entry.writtenMax ?? -1, index);
      }
      entry.seen.add(index);
      entry.values[index] = Number.isFinite(num) ? num : 0;
      /* 字符数组：类型标记 'c' 来自声明（char），据此把格子显示成字符而不是 104/101/108；
         指针数组 'p' 里是**地址**（`HNode* bucket[7]`），不是数据 —— 不能当数值数组画 */
      if (typeTag === 'c') entry.chars = true;
      if (typeTag === 'p') entry.addrOnly = true;
      model.arrays.set(base, entry);
      families.add('array');
      refresh();
      continue;
    }
    if (kind === 'I') {
      /* 声明记录：
         shape '0' = 声明时没有初始化器 → 写之前都是未知；
         shape '1'/'2' = 声明时就带初始化器 → 每格都已有值（合法的大整数必须原样显示）。 */
      const [, , name, shape, aText, bText] = event;
      const base = String(name || '');
      if (String(shape) === '0') {
        const entry = model.arrays.get(base) || { values: [], focus: null, written: new Set(), seen: new Set() };
        entry.uninit = true;
        model.arrays.set(base, entry);
        const mat = model.matrices.get(base) || { cells: new Map(), maxR: 0, maxC: 0, focus: null, written: new Set() };
        mat.uninit = true;
        model.matrices.set(base, mat);
      } else if (String(shape) === '1') {
        const n = Number(aText);
        if (Number.isFinite(n) && n >= 0) {
          const entry = model.arrays.get(base) || { values: [], focus: null, written: new Set(), seen: new Set() };
          entry.initLen = Math.max(entry.initLen ?? 0, Math.min(n, MAX_NODES));
          model.arrays.set(base, entry);
        }
      } else if (String(shape) === '2') {
        const rows = Number(aText);
        const cols = Number(bText);
        if (Number.isFinite(rows) && Number.isFinite(cols)) {
          const entry = model.matrices.get(base) || { cells: new Map(), maxR: 0, maxC: 0, focus: null, written: new Set() };
          entry.initR = Math.max(entry.initR ?? 0, Math.min(rows, MAX_NODES));
          entry.initC = Math.max(entry.initC ?? 0, Math.min(cols, MAX_NODES));
          model.matrices.set(base, entry);
          families.add('matrix');
        }
      }
      touch();
      continue;
    }
    if (kind === 'W') {
      /* 写入标记：`a[i] = …` / `g[i][j] = …`（插桩在语句前面发的，下标是写入前的值）。
         这是"哪些格子真的有数据"的**事实**来源 —— 裁剪与"未初始化"判断都只认它和长度线索。 */
      const [, , name, aText, bText] = event;
      const base = String(name || '');
      const a = Number(aText);
      if (a >= MAX_NODES) continue;
      if (bText === undefined) {
        const entry = model.arrays.get(base) || { values: [], focus: null, written: new Set(), seen: new Set() };
        entry.written.add(a);
        entry.writtenMax = Math.max(entry.writtenMax ?? -1, a);
        model.arrays.set(base, entry);
      } else {
        const b = Number(bText);
        if (b >= MAX_NODES) continue;
        const entry = model.matrices.get(base) || { cells: new Map(), maxR: 0, maxC: 0, focus: null, written: new Set() };
        entry.written.add(a + ',' + b);
        model.matrices.set(base, entry);
        families.add('matrix');
      }
      touch();
      continue;
    }
    if (kind === 'L') {
      const [, name, idxText, key, ptr, more] = event;
      const idx = Number(idxText);
      const dump = openDump.get(name) || { nodes: new Map(), shape: null, root: null, lastIdx: -1, active: true, ptrs: new Set(), cycle: false };
      if (idx === 0) { dump.nodes = new Map(); dump.shape = null; dump.root = null; dump.ptrs = new Set(); dump.cycle = false; }
      /* 指针去重：walker 追到野指针/环时会一直走满上限，屏幕上就是"永远 24 个结点"。
         同一个地址出现两次 = 环（或重复访问），到此截断，绝不画重复结点。 */
      const addr = String(ptr);
      if (dump.ptrs.has(addr)) { dump.cycle = true; openDump.set(name, dump); continue; }
      dump.ptrs.add(addr);
      /* addr 存下来：同一个结构被多个指针变量 dump 时，用地址把"这个变量指向哪个结点"对上 */
      dump.nodes.set(idx, { id: 'n' + idx, label: String(key), left: null, right: null, value: more ? null : null, addr: Number(ptr) });
      dump.lastIdx = idx;
      openDump.set(name, dump);
      continue;
    }
    if (kind === 'NM') {
      const [, name, idxText, kv] = event;
      const idx = Number(idxText);
      const match = /^([A-Za-z]+)=(-?\d+)$/.exec(String(kv || ''));
      if (!match) continue;
      const dump = openDump.get(name);
      if (dump) {
        const node = dump.nodes.get(idx);
        if (!node) continue;
        const childIdx = Number(match[2]);
        if (childIdx < 0) continue;
        if (match[1] === 'left') node.left = 'n' + childIdx;
        else if (match[1] === 'right') node.right = 'n' + childIdx;
        continue;
      }
      /* 多路结构（图 walker）：slot = 该结点挂在父结点指针数组的第几格；addr = 结点真实地址。
         addr 还用来判断"这个变量现在指到哪个结点"，所以链头（idx 0）要记进 ptrVars。 */
      const entry = model.graphs.get(name);
      if (!entry) continue;
      if (!entry.nodes[idx]) entry.nodes[idx] = { id: 'v' + idx, label: null, sub: idx };
      if (match[1] === 'slot') entry.nodes[idx].slot = Number(match[2]);
      else if (match[1] === 'addr') {
        const addr = Number(match[2]);
        entry.nodes[idx].addr = addr;
        if (idx === 0) model.ptrVars.set(name, addr);
      }
      touch();
      continue;
    }
    if (kind === 'LE') {
      const [, name, countText, shape] = event;
      const count = Number(countText);
      const dump = openDump.get(name);
      /* 空链的 dump 一条 L 都没有，所以这里可能根本没有 openDump —— 那也是一次真实状态：
         这个指针现在是 NULL。记下来并重取本步快照，药丸才不会赖在旧结点上。 */
      if (!dump) {
        if (Number.isFinite(count) && count <= 0) {
          model.ptrVars.set(name, null);
          const staleStep = steps[steps.length - 1];
          if (staleStep) staleStep.layers = snapshotLayers(model, statics, scalars);
        }
        continue;
      }
      /* 这一轮的链头地址 = 该指针变量现在指的位置；空链（count<=0）说明它是 NULL，
         必须记成"指空"，否则上一次的位置会一直挂在图上（那是假的）。 */
      const headNode = dump.nodes.get(0);
      model.ptrVars.set(name, count > 0 && headNode && headNode.addr != null ? headNode.addr : null);
      if (!Number.isFinite(count) || count <= 0 || !dump.nodes.size) {
        openDump.delete(name);
        /* 空链也是一次真实的状态变化（这个指针现在指空）：本步要重新取快照，
           否则药丸会一直挂在它上一次指的那个结点上（那是假的）。 */
        const stale = steps[steps.length - 1];
        if (stale) stale.layers = snapshotLayers(model, statics, scalars);
        continue;
      }
      const nodes = [...dump.nodes.entries()]
        .filter(([idx]) => idx < MAX_NODES)
        .sort((a, b) => a[0] - b[0])
        .map(([, node]) => node);
      if (shape === 'tree') {
        const children = new Set();
        for (const node of nodes) { if (node.left) children.add(node.left); if (node.right) children.add(node.right); }
        const root = nodes.find((node) => !children.has(node.id)) || nodes[0];
        model.structures.set(name, { shape: 'tree', nodes, root: root.id, count });
        families.add('tree');
      } else {
        model.structures.set(name, { shape: 'list', nodes, count });
        families.add('list');
      }
      openDump.delete(name);
      const step = steps[steps.length - 1];
      if (step) step.layers = snapshotLayers(model, statics, scalars);
      continue;
    }
    if (kind === 'M') {
      /* M|var|begin=1;len=0 表示"这一轮 dump 开始"。同一步里同一个变量可能被 dump 多次
         （每个插桩语句后都 dump），idx 会从 0 重来；不清空就会把几轮拼成一张图，
         表现为"2 个结点、3 条重复边"。所以每轮开始就重置该变量的图。 */
      const [, name, kv] = event;
      if (/begin=1/.test(String(kv || ''))) {
        model.graphs.set(name, { nodes: [], edges: [] });
        /* 新一轮 dump：这个变量的链头还不知道（等 idx 0 的 addr），先记成"指空"，
           免得上一轮的位置留在图上 */
        model.ptrVars.set(name, null);
      }
      continue;
    }
    if (kind === 'N') {
      const [, name, idxText, value] = event;
      const idx = Number(idxText);
      if (idx >= MAX_NODES) continue;
      const entry = model.graphs.get(name) || { nodes: [], edges: [] };
      /* N 的值（isEnd 之类）只作标签用；结点可能已经被 NE/NM 先建出来，
         所以这里要**补写**标签，不能因为"已存在"就丢掉 */
      const node = entry.nodes[idx] || (entry.nodes[idx] = { id: 'v' + idx, label: null, sub: idx });
      node.label = value == null ? null : String(value);
      model.graphs.set(name, entry);
      families.add('graph');
      touch();
      continue;
    }
    if (kind === 'NE') {
      const [, name, fromText, toText] = event;
      const entry = model.graphs.get(name) || { nodes: [], edges: [] };
      const from = Number(fromText);
      const to = Number(toText);
      /* 占位：标签留空，等 N / NM 来填 —— 早先这里用下标当标签，
         结果 NE 先建成结点时就把真正的标签挡掉了（屏幕上全是 0,1,2,3 编号）。 */
      if (!entry.nodes[from]) entry.nodes[from] = { id: 'v' + from, label: null, sub: from };
      if (!entry.nodes[to]) entry.nodes[to] = { id: 'v' + to, label: null, sub: to };
      if (entry.edges.length < MAX_EDGES) entry.edges.push({ from: 'v' + from, to: 'v' + to });
      model.graphs.set(name, entry);
      families.add('graph');
      touch();
      continue;
    }
  }

  if (!steps.length) return { ok: false, error: '引擎没有产生任何行事件（S），无法生成画面。' };
  // 只保留真正有层的那部分步骤：前面还没 dump 出结构的步骤会画成空白卡，看着像坏掉
  const firstWithLayers = steps.findIndex((step) => step.layers.length > 0);
  const kept = firstWithLayers < 0 ? steps : steps.slice(firstWithLayers);
  const style = (() => {
    for (const step of kept) {
      for (const layer of step.layers) if (layer.style === 9) return 9;
    }
    for (const step of kept) {
      for (const layer of step.layers) if (layer.style === 10) return 10;
    }
    for (const step of kept) {
      for (const layer of step.layers) if (layer.style === 3) return 3;
    }
    for (const step of kept) {
      for (const layer of step.layers) if (layer.style === 1) return 1;
    }
    return null;
  })();
  const renumbered = kept.map((step, index) => ({ ...step, stepIndex: index }));
  return {
    ok: true,
    steps: renumbered,
    style,
    families: [...families],
    stats: {
      steps: renumbered.length,
      droppedSteps: steps.length - kept.length,
      layers: renumbered.reduce((sum, step) => sum + step.layers.length, 0),
      maxLayers: renumbered.reduce((max, step) => Math.max(max, step.layers.length), 0),
      nodeCounts: [...model.structures.entries()].map(([name, entry]) => ({ name, shape: entry.shape, nodes: entry.nodes.length })),
    },
  };
}
