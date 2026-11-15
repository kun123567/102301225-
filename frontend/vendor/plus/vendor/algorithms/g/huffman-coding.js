/**
 * G · 哈夫曼编码（3 个变体：最小堆 / 有序链表 / k 进制）
 *
 * 输入约定：{ weights:[2,3,7], symbols:['A','B','C'], k:2 }
 *   · weights 与 symbols 一一对应；symbols 缺省时按 A、B、C… 生成；
 *   · v1/v2 固定做二叉哈夫曼（"两两合并"，与输入 k 无关）；
 *   · v3 做 k 叉哈夫曼，k 缺省 3；不足 k 个时补权重 0 的虚符号，保证满 k 叉。
 *
 * 三个变体的差别在"候选集合"这个数据结构上，画面因此完全不同：
 *   v1 最小堆   —— 候选排成完全二叉树形态的堆，父 ≤ 子，取两个最轻只需看根与较小孩子；
 *   v2 有序链表 —— 候选是一条按权重升序的链，每次摘链头两个，合并结果再按序插回；
 *   v3 k 进制   —— 候选是有序数组，一次取 k 个最轻的合并，孩子用 0..k-1 编号。
 *
 * 码字固定"左 0 右 1"（k 叉则按孩子顺序 0、1、2 …），码字由根到叶的路径拼成。
 * result：{ wpl, codes:{ 符号: 码字 } }，wpl = Σ 权重 × 码长。
 *
 * 契约（docs/04-轨迹契约.md）：每步完整快照；step.lineId 命中本变体 sourceLines；
 * 最后一步 done=true 且 result 与样例 expect 深比较一致；k=3 的码字与 k=2 合法不同 → expectByVariant。
 */

import { trace, step, treeLayer, heapLayer, linkLayer, arrayLayer } from '../../engine/model.js';

export const meta = {
  id: 'g/huffman-coding',
  variants: [
    { id: 'v1', name: '最小堆两两合并', note: '反复取两个最小权合并，建树后左 0 右 1 生成码字' },
    { id: 'v2', name: '有序链表合并', note: '候选按权有序存链表，每次取头两个、合并后插回有序位置' },
    { id: 'v3', name: 'k 进制哈夫曼', note: 'k 叉哈夫曼需补零权虚符号；展示同一组权重在 k=2 与 k=3 下的树形差异' },
  ],
};

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void HuffmanCoding(int w[], char sym[], int n, Code c[]) {' },
    { lineId: 'init', text: '  MinHeap H; InitHeap(&H);          /* 候选集合 = 最小堆，父 ≤ 子 */' },
    { lineId: 'build', text: '  for (i = 0; i < n; ++i) HeapInsert(&H, NewLeaf(sym[i], w[i]));' },
    { lineId: 'loop', text: '  while (H.size > 1) {              /* 只剩一棵树时结束 */' },
    { lineId: 'pick', text: '    a = HeapExtractMin(&H);         /* 取最小：堆根 */' },
    { lineId: 'pick2', text: '    b = HeapExtractMin(&H);         /* 再取最小：新的堆根 */' },
    { lineId: 'merge', text: '    m = NewNode(a->w + b->w);  m->l = a;  m->r = b;' },
    { lineId: 'push', text: '    HeapInsert(&H, m);              /* 合并结果插回堆，上浮到该去的位置 */' },
    { lineId: 'loopend', text: '  }' },
    { lineId: 'gen', text: '  /* 从根出发，左 0 右 1，把路径拼成码字 */' },
    { lineId: 'genleaf', text: '  /* 走到叶子：该符号的码字 = 根到叶的路径 */' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void HuffmanCoding(int w[], char sym[], int n, Code c[]) {' },
    { lineId: 'init', text: '  List L = SortByWeight(w, sym, n); /* 候选集合 = 按权重升序的链表 */' },
    { lineId: 'loop', text: '  while (L->len > 1) {' },
    { lineId: 'pick', text: '    a = ListPopHead(&L);            /* 摘链头 = 最轻 */' },
    { lineId: 'pick2', text: '    b = ListPopHead(&L);            /* 再摘一个 = 次轻 */' },
    { lineId: 'merge', text: '    m = NewNode(a->w + b->w);  m->l = a;  m->r = b;' },
    { lineId: 'scan', text: '    p = L->head;                    /* 从链头找第一个权重大于 m 的节点 */' },
    { lineId: 'scanloop', text: '    while (p && p->w < m->w) p = p->next;   /* 并列时不越过 → 编号小的在前 */' },
    { lineId: 'insert', text: '    ListInsertBefore(&L, p, m);     /* 插回有序位置 */' },
    { lineId: 'loopend', text: '  }' },
    { lineId: 'gen', text: '  /* 从根出发，左 0 右 1，把路径拼成码字 */' },
    { lineId: 'genleaf', text: '  /* 走到叶子：该符号的码字 = 根到叶的路径 */' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void KHuffmanCoding(int w[], char sym[], int n, int k, Code c[]) {' },
    { lineId: 'pad', text: '  /* 满 k 叉要求 (N-1) % (k-1) == 0，不足则补权重 0 的虚符号 */' },
    { lineId: 'init', text: '  SortByWeight(sym, w, N);                 /* 候选集合 = 按权重升序的数组 */' },
    { lineId: 'loop', text: '  while (N > 1) {' },
    { lineId: 'pick', text: '    /* 一次取最轻的 k 个候选树（并列按固定编号） */' },
    { lineId: 'merge', text: '    m = NewNode(sum of the k weights);  m->child[0..k-1] = 这 k 棵树;' },
    { lineId: 'digit', text: '    /* 第 i 个孩子对应数码 i：k=3 时是 0/1/2，不是 0/1 */' },
    { lineId: 'push', text: '    /* 合并结果按权重重新插入有序数组，候选数减 k-1 */' },
    { lineId: 'loopend', text: '  }' },
    { lineId: 'gen', text: '  /* 从根出发，沿第 i 个孩子走就拼上数码 i，直到叶子 */' },
    { lineId: 'genleaf', text: '  /* 叶子（虚符号不给码字） */' },
    { lineId: 'end', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

export const samples = [
  {
    id: 'normal',
    label: 'A=2 B=3 C=7（二叉 WPL 17；k=3 时一次合并成根，码字 0/1/2）',
    input: { weights: [2, 3, 7], symbols: ['A', 'B', 'C'], k: 2 },
    expect: { wpl: 17, codes: { A: '00', B: '01', C: '1' } },
    expectByVariant: {
      v1: { wpl: 17, codes: { A: '00', B: '01', C: '1' } },
      v2: { wpl: 17, codes: { A: '00', B: '01', C: '1' } },
      v3: { wpl: 12, codes: { A: '0', B: '1', C: '2' } },
    },
  },
  {
    id: 'edge-single',
    label: '单符号 A=5（没有可合并的对，约定编码为 "0"）',
    input: { weights: [5], symbols: ['A'], k: 2 },
    expect: { wpl: 5, codes: { A: '0' } },
  },
  {
    id: 'edge-equal-weights',
    label: 'A=B=C=D=4（并列权重按固定编号取；k=3 要补一个零权虚符号）',
    input: { weights: [4, 4, 4, 4], symbols: ['A', 'B', 'C', 'D'], k: 2 },
    expect: { wpl: 32, codes: { A: '00', B: '01', C: '10', D: '11' } },
    expectByVariant: {
      v1: { wpl: 32, codes: { A: '00', B: '01', C: '10', D: '11' } },
      v2: { wpl: 32, codes: { A: '00', B: '01', C: '10', D: '11' } },
      v3: { wpl: 24, codes: { A: '21', B: '22', C: '0', D: '1' } },
    },
  },
];

/* ------------------------------------------------------------------ 公用小工具 */

/** 权重/符号归一化：symbols 缺省用 A、B、C…；重名符号加 #序号 区分 */
function normalizeInput(input) {
  const rawW = Array.isArray(input && input.weights) ? input.weights : [];
  const rawS = Array.isArray(input && input.symbols) ? input.symbols : [];
  const weights = rawW.map((w) => {
    const n = Number(w);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  const seen = new Map();
  const symbols = weights.map((_, i) => {
    let s = rawS[i] != null && rawS[i] !== '' ? String(rawS[i]) : String.fromCharCode(65 + (i % 26));
    const k = (seen.get(s) || 0) + 1;
    seen.set(s, k);
    if (k > 1) s = `${s}#${k}`;
    return s;
  });
  return { weights, symbols, n: weights.length };
}

/** 候选集合的统一比较：先比权重，并列时比固定编号（编号小者先取，保证结果可复现） */
const cmpCand = (a, b) => (a.weight - b.weight) || (a.id - b.id);

/**
 * 哈夫曼树 → treeLayer 数据。
 * roots = 当前候选树的根 + 本步额外要显示的树（刚合并出的新树 / 刚取出还没合并的那两棵）。
 */
function forestData(cands, extra, nodeOf) {
  const extras = Array.isArray(extra) ? extra : extra ? [extra] : [];
  const roots = [...extras, ...cands].map((c) => c.id);
  const nodes = [];
  const edgeTags = {};
  const seen = new Set();
  const walk = (node) => {
    if (!node || seen.has(node.id)) return;
    seen.add(node.id);
    node.children.forEach((c, i) => {
      edgeTags[c.id] = String(i);
    });
    const box = { id: node.id, label: node.sym != null ? node.sym : String(node.weight), value: nodeOf(node) };
    if (node.dummy) box.badge = '补零';
    if (node.children.length) box.children = node.children.map((c) => c.id);
    if (node.sym == null) box.badge = node.badge || `w=${node.weight}`;
    nodes.push(box);
    node.children.forEach(walk);
  };
  extras.forEach(walk);
  cands.forEach(walk);
  return { roots, nodes, edgeTags };
}

/** 叶子遍历顺序（码字按根→叶路径顺序落地的顺序，便于回看时核对码表） */
function leafOrder(node, prefix, out = []) {
  if (!node.children.length) {
    out.push({ node, code: prefix });
    return out;
  }
  node.children.forEach((c, i) => leafOrder(c, prefix + String(i), out));
  return out;
}

/* ------------------------------------------------------------------ 变体 1：最小堆两两合并 */

function runV1(input) {
  const { weights, symbols, n } = normalizeInput(input);
  const L = LINES.v1;
  const steps = [];
  let nextId = 0;
  const codes = {};
  const leaves = [];
  const H = [];          // 最小堆（数组即逻辑堆形态）

  const newNode = ({ weight, sym = null, children = [] }) => ({ id: nextId++, weight, sym, children, code: null });

  const push = (x) => {
    H.push(x);
    let i = H.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cmpCand(H[i], H[p]) < 0) {
        [H[i], H[p]] = [H[p], H[i]];
        i = p;
      } else break;
    }
    return i;
  };
  const pop = () => {
    const top = H[0];
    const last = H.pop();
    if (H.length) {
      H[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let best = i;
        if (l < H.length && cmpCand(H[l], H[best]) < 0) best = l;
        if (r < H.length && cmpCand(H[r], H[best]) < 0) best = r;
        if (best === i) break;
        [H[i], H[best]] = [H[best], H[i]];
        i = best;
      }
    }
    return top;
  };

  for (let i = 0; i < n; i++) {
    const leaf = newNode({ weight: weights[i], sym: symbols[i] });
    leaves.push(leaf);
    push(leaf);
  }

  const nodeOf = (node) => (node.sym != null
    ? `w=${node.weight}${node.code ? ` · ${node.code}` : ''}`
    : `w=${node.weight}`);

  const treeOf = (extra) => {
    const d = forestData(H, extra, nodeOf);
    return treeLayer({
      id: 'huff',
      title: 'Huffman 树',
      name: 'Huffman 树（森林 = 当前候选树；边上的 0/1 是左/右）',
      roots: d.roots,
      nodes: d.nodes,
      edgeTags: d.edgeTags,
      roles: {},
    });
  };

  const heapOf = (focusIdx = [], doneIdx = []) => heapLayer({
    id: 'H',
    title: '最小堆 H',
    name: '候选集合 · 最小堆（父 ≤ 子，根即最轻）',
    cells: H.length
      ? H.map((x, i) => ({
          label: `H[${i}]`,
          name: x.sym != null ? x.sym : '合并',
          value: `${x.weight}${x.sym != null ? `·${x.sym}` : ''}`,
        }))
      : [{ label: 'H', name: '候选集合已空', value: '立即合并', state: 'empty' }],
    tree: H.map((x) => String(x.weight)),
    roles: { focus1: focusIdx, done: doneIdx },
  });

  const vars = (extra = {}) => ({
    符号数: n,
    候选数: H.length,
    堆顶: H.length ? `${H[0].weight}` : '—',
    ...extra,
    码表: Object.keys(codes).length ? Object.entries(codes).map(([s, c]) => `${s}:${c}`).join(' ') : '（待生成）',
  });

  steps.push(step({
    event: 'init',
    lineId: 'build',
    note: n === 0
      ? '没有任何权重：候选集合为空，不需要建树。'
      : n === 1
        ? '只有 1 个符号：候选集合里就它一棵树，while(H.size > 1) 不进，直接生成码字。'
        : `把 ${n} 个叶子逐个插入最小堆，得到"父 ≤ 子"的堆形态：根就是最轻的 ${H[0].weight}。注意堆只保证父子关系，兄弟之间不排序——第二个最小的一定是根的两个孩子之一。`,
    vars: vars({ 堆数组: H.map((x) => x.weight).join(' ') }),
    layers: [treeOf(null), heapOf()],
  }));

  while (H.length > 1) {
    // 两个最轻：堆根 + 较小的那个孩子（堆性质保证第二个最小必在 1 或 2 号位）
    const i1 = 0;
    const i2 = (H.length > 2 && cmpCand(H[2], H[1]) < 0) ? 2 : 1;
    steps.push(step({
      event: 'pick-two',
      lineId: 'pick',
      note: `取两棵最轻的树：堆根 H[${i1}] = ${H[i1].weight}${H[i1].sym ? `(${H[i1].sym})` : ''}，再比它的两个孩子取较小者 H[${i2}] = ${H[i2].weight}${H[i2].sym ? `(${H[i2].sym})` : ''}。这就是最小堆的好处：最轻的两个不用全表扫描。`,
      vars: vars({ 取一: `${H[i1].weight}`, 取二: `${H[i2].weight}` }),
      layers: [treeOf(null), heapOf([i1, i2])],
    }));

    const a = pop();
    const b = pop();
    steps.push(step({
      event: 'pick-two',
      lineId: 'pick2',
      note: `两次 HeapExtractMin 后堆里还剩 ${H.length} 棵树；被取走的 ${a.weight} 与 ${b.weight} 暂时挂在候选集合之外（画面上仍可见，等着被合并）。`,
      vars: vars(),
      layers: [treeOf([a, b]), heapOf()],
    }));

    const m = newNode({ weight: a.weight + b.weight, children: [a, b] });
    steps.push(step({
      event: 'merge',
      lineId: 'merge',
      note: `合并成新节点：${a.weight} + ${b.weight} = ${m.weight}。左孩子 ${a.weight}（码位 0）、右孩子 ${b.weight}（码位 1）——"左 0 右 1"从这一步就定死了。`,
      vars: vars({ 新节点: `${m.weight}` }),
      layers: [treeOf(m), heapOf()],
    }));

    const idx = push(m);
    steps.push(step({
      event: 'push-back',
      lineId: 'push',
      note: `合并结果 ${m.weight} 插回堆并上浮到 H[${idx}]：候选集合重新满足"父 ≤ 子"，下一轮又可以从根取最轻的。`,
      vars: vars({ 插入位置: `H[${idx}]` }),
      layers: [treeOf(null), heapOf([idx])],
    }));
  }

  /* ------------------------------------------------------------ 码字生成 */
  const root = H[0] || null;
  const codegen = [];
  const walk = (node, prefix) => {
    if (!node.children.length) {
      node.code = prefix === '' ? '0' : prefix;   // 单符号树：约定编码为 "0"
      if (!node.dummy) codes[node.sym] = node.code;
      codegen.push(node);
      return;
    }
    node.children.forEach((c, i) => walk(c, prefix + String(i)));
  };
  if (root) walk(root, '');

  codegen.forEach((leaf, k) => {
    steps.push(step({
      event: 'codegen',
      lineId: leaf.sym != null ? 'genleaf' : 'gen',
      note: leaf.sym != null
        ? `${leaf.sym}（权重 ${leaf.weight}）的码字是 "${leaf.code}"：从根一路按 0/1 走下来，长度 ${leaf.code.length}，贡献 ${leaf.weight} × ${leaf.code.length} = ${leaf.weight * leaf.code.length} 到 WPL。`
        : `合并节点 ${leaf.weight} 的路径是 "${leaf.code}"（内部节点，不产生码字）。`,
      vars: vars({ 当前叶: leaf.sym != null ? leaf.sym : `w=${leaf.weight}` }),
      layers: [treeOf(null), heapOf([])],
    }));
    if (k === codegen.length - 1 && codegen.length > 1) {
      steps.push(step({
        event: 'codegen',
        lineId: 'gen',
        note: '所有叶子都走完了：码表就是每个符号的根→叶路径，且没有任何一个码字是别人前缀（前缀码）。',
        vars: vars(),
        layers: [treeOf(null), heapOf([])],
      }));
    }
  });

  const wpl = leaves.reduce((s, l) => s + l.weight * (codes[l.sym] || '').length, 0);
  const result = { wpl, codes: { ...codes } };
  steps.push(step({
    event: 'done',
    lineId: 'end',
    done: true,
    result,
    note: n === 0
      ? '空权重：没有码字，WPL 记作 0。'
      : n === 1
        ? `单符号 ${symbols[0]} 没有可合并的对象，约定编码 "0"，WPL = ${wpl}。`
        : `哈夫曼树建完：WPL = ${wpl}。权重越小的符号路径越长（${symbols.map((s) => `${s}:${codes[s]}`).join('，')}），这是"带权路径长度最小"的直接结果。`,
    vars: vars(),
    layers: [treeOf(null), heapOf([])],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v1',
    sourceVersion: 'huffman-minheap-v1',
    lines: L,
    steps,
    result,
    meta: { codes: { ...codes }, wpl, leafOrder: root ? leafOrder(root, '').map(({ node, code }) => `${node.sym ?? `w=${node.weight}`}:${node.code ?? code}`) : [] },
  });
}

/* ------------------------------------------------------------------ 变体 2：有序链表合并 */

function runV2(input) {
  const { weights, symbols, n } = normalizeInput(input);
  const L = LINES.v2;
  const steps = [];
  let nextId = 0;
  const codes = {};
  const leaves = [];
  let list = [];         // 按 (权重, 编号) 升序的链表（数组模拟，队首 = 最轻）

  const newNode = ({ weight, sym = null, children = [] }) => ({ id: nextId++, weight, sym, children, code: null });

  for (let i = 0; i < n; i++) {
    const leaf = newNode({ weight: weights[i], sym: symbols[i] });
    leaves.push(leaf);
    list.push(leaf);
  }
  list.sort(cmpCand);

  const nodeOf = (node) => (node.sym != null
    ? `w=${node.weight}${node.code ? ` · ${node.code}` : ''}`
    : `w=${node.weight}`);

  const treeOf = (extra) => {
    const d = forestData(list, extra, nodeOf);
    return treeLayer({
      id: 'huff',
      title: 'Huffman 树',
      name: 'Huffman 树（森林 = 当前候选树；边上的 0/1 是左/右）',
      roots: d.roots,
      nodes: d.nodes,
      edgeTags: d.edgeTags,
      roles: {},
    });
  };

  const listOf = (focusIds = []) => linkLayer({
    id: 'L',
    title: '候选链表 L',
    name: '候选集合 · 按权重升序的单链表（head 最小）',
    head: list.length ? list[0].id : null,
    nodes: list.map((x) => ({
      id: x.id,
      value: `${x.weight}${x.sym != null ? `·${x.sym}` : ''}`,
    })),
    links: list.slice(0, -1).map((x, i) => ({ from: x.id, to: list[i + 1].id })),
    roles: {
      focus1: focusIds.length > 0 ? [focusIds[0]] : [],
      focus2: focusIds.length > 1 ? [focusIds[1]] : [],
      pointers: list.length ? [{ id: 'head', label: 'head', node: list[0].id }] : [],
    },
  });

  const vars = (extra = {}) => ({
    符号数: n,
    候选数: list.length,
    链头: list.length ? `${list[0].weight}` : '—',
    ...extra,
    码表: Object.keys(codes).length ? Object.entries(codes).map(([s, c]) => `${s}:${c}`).join(' ') : '（待生成）',
  });

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: n === 0
      ? '没有任何权重：链表为空。'
      : n === 1
        ? '只有 1 个符号：链表长度 1，while 不进，直接出码字。'
        : `先把叶子按权重排成一条升序链（并列时编号小的在前），head 就是最轻的 ${list[0].weight}。与堆版的区别：整条链**处处有序**，所以取最轻的两个只看链头两格，不需要上浮/下沉。`,
    vars: vars({ 链表: list.map((x) => x.weight).join(' → ') }),
    layers: [treeOf(null), listOf()],
  }));

  while (list.length > 1) {
    steps.push(step({
      event: 'pick-two',
      lineId: 'pick',
      note: `摘链头两个：${list[0].weight}${list[0].sym ? `(${list[0].sym})` : ''} 与 ${list[1].weight}${list[1].sym ? `(${list[1].sym})` : ''}。链表有序 ⇒ 这两个一定是最轻的，O(1) 就能确定。`,
      vars: vars({ 取一: `${list[0].weight}`, 取二: `${list[1].weight}` }),
      layers: [treeOf(null), listOf([list[0].id, list[1].id])],
    }));

    const a = list.shift();
    const b = list.shift();
    steps.push(step({
      event: 'pick-two',
      lineId: 'pick2',
      note: `两次摘头后链表剩 ${list.length} 个候选；${a.weight} 与 ${b.weight} 已离开链表，等着被合并成一棵。`,
      vars: vars(),
      layers: [treeOf([a, b]), listOf()],
    }));

    const m = newNode({ weight: a.weight + b.weight, children: [a, b] });
    steps.push(step({
      event: 'merge',
      lineId: 'merge',
      note: `合并成新节点 ${a.weight} + ${b.weight} = ${m.weight}：左孩子码位 0、右孩子码位 1。`,
      vars: vars({ 新节点: `${m.weight}` }),
      layers: [treeOf(m), listOf()],
    }));

    // 从链头找第一个权重大于 m 的节点（严格小于才越过 → 并列时排在后面，编号大的在后）
    let pos = 0;
    while (pos < list.length && cmpCand(list[pos], m) < 0) pos++;
    steps.push(step({
      event: 'push-back',
      lineId: 'scanloop',
      note: `从 head 顺序扫描，找到第一个"不比 ${m.weight} 更轻"的位置（扫过 ${pos} 个节点）：链表的插入点只能顺序找，这是它相对堆的代价。`,
      vars: vars({ 插入位置: `第 ${pos + 1} 位` }),
      layers: [treeOf(m), listOf()],
    }));

    list.splice(pos, 0, m);
    steps.push(step({
      event: 'push-back',
      lineId: 'insert',
      note: `把 ${m.weight} 插回第 ${pos + 1} 位，链表重新有序；候选数变成 ${list.length}，下一轮继续摘头两个。`,
      vars: vars({ 插入位置: `第 ${pos + 1} 位` }),
      layers: [treeOf(null), listOf([m.id])],
    }));
  }

  const root = list[0] || null;
  const codegen = [];
  const walk = (node, prefix) => {
    if (!node.children.length) {
      node.code = prefix === '' ? '0' : prefix;
      if (!node.dummy) codes[node.sym] = node.code;
      codegen.push(node);
      return;
    }
    node.children.forEach((c, i) => walk(c, prefix + String(i)));
  };
  if (root) walk(root, '');

  codegen.forEach((leaf, k) => {
    steps.push(step({
      event: 'codegen',
      lineId: leaf.sym != null ? 'genleaf' : 'gen',
      note: leaf.sym != null
        ? `${leaf.sym}（权重 ${leaf.weight}）沿 0/1 走到叶子，得到码字 "${leaf.code}"，贡献 ${leaf.weight} × ${leaf.code.length} = ${leaf.weight * leaf.code.length}。`
        : `内部节点 ${leaf.weight} 的路径是 "${leaf.code}"，不产生码字。`,
      vars: vars({ 当前叶: leaf.sym != null ? leaf.sym : `w=${leaf.weight}` }),
      layers: [treeOf(null), listOf()],
    }));
    if (k === codegen.length - 1 && codegen.length > 1) {
      steps.push(step({
        event: 'codegen',
        lineId: 'gen',
        note: '码字全部生成：每个符号的码字是根→叶路径，任意两个码字互不为前缀。',
        vars: vars(),
        layers: [treeOf(null), listOf()],
      }));
    }
  });

  const wpl = leaves.reduce((s, l) => s + l.weight * (codes[l.sym] || '').length, 0);
  const result = { wpl, codes: { ...codes } };
  steps.push(step({
    event: 'done',
    lineId: 'end',
    done: true,
    result,
    note: n === 0
      ? '空权重：链表始终为空，没有码字。'
      : n === 1
        ? `单符号 ${symbols[0]}：约定编码 "0"，WPL = ${wpl}。`
        : `有序链表版完成：WPL = ${wpl}，码表与堆版一致（同样的权重、同样的"左 0 右 1"），差别只在候选集合的维护方式与扫描代价。`,
    vars: vars(),
    layers: [treeOf(null), listOf()],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v2',
    sourceVersion: 'huffman-list-v1',
    lines: L,
    steps,
    result,
    meta: { codes: { ...codes }, wpl, leafOrder: root ? leafOrder(root, '').map(({ node, code }) => `${node.sym ?? `w=${node.weight}`}:${node.code ?? code}`) : [] },
  });
}

/* ------------------------------------------------------------------ 变体 3：k 进制哈夫曼 */

function runV3(input) {
  const { weights, symbols, n } = normalizeInput(input);
  const k = Number(input && input.k) >= 3 ? Math.round(Number(input.k)) : 3;
  const L = LINES.v3;
  const steps = [];
  let nextId = 0;
  const codes = {};
  const leaves = [];
  const cands = [];       // 按 (权重, 编号) 升序的候选数组

  const newNode = ({ weight, sym = null, children = [], dummy = false }) => ({ id: nextId++, weight, sym, children, dummy, code: null });

  for (let i = 0; i < n; i++) {
    const leaf = newNode({ weight: weights[i], sym: symbols[i] });
    leaves.push(leaf);
  }
  // 满 k 叉：(N-1) % (k-1) == 0，不足则补零权虚符号
  const needPad = n === 0 ? 0 : (k - 1 - ((n - 1) % (k - 1))) % (k - 1);
  for (let i = 0; i < needPad; i++) {
    leaves.push(newNode({ weight: 0, sym: `虚${i + 1}`, dummy: true }));
  }
  cands.push(...leaves);
  cands.sort(cmpCand);

  const nodeOf = (node) => (node.dummy
    ? 'w=0（补零）'
    : node.sym != null
      ? `w=${node.weight}${node.code ? ` · ${node.code}` : ''}`
      : `w=${node.weight}`);

  const treeOf = (extra) => {
    const d = forestData(cands, extra, nodeOf);
    return treeLayer({
      id: 'huff',
      title: `${k} 叉 Huffman 树`,
      name: `${k} 叉 Huffman 树（森林 = 当前候选树；边上的 0..${k - 1} 是孩子序号）`,
      roots: d.roots,
      nodes: d.nodes,
      edgeTags: d.edgeTags,
      roles: {},
    });
  };

  const candOf = (focusIdx = []) => arrayLayer({
    id: 'C',
    title: '候选集合',
    name: `候选集合 · 按 (权重, 编号) 升序（每次取最轻的 ${k} 个）`,
    values: cands.map((x) => `${x.weight}${x.sym != null ? `·${x.sym}` : ''}`),
    labels: cands.map((x, i) => `第${i + 1}轻`),
    roles: { focus1: focusIdx },
  });

  const vars = (extra = {}) => ({
    符号数: n,
    进制: k,
    补零虚符号: needPad,
    候选数: cands.length,
    ...extra,
    码表: Object.keys(codes).length ? Object.entries(codes).map(([s, c]) => `${s}:${c}`).join(' ') : '（待生成）',
  });

  steps.push(step({
    event: 'init',
    lineId: 'pad',
    note: n === 0
      ? '没有任何权重：候选集合为空。'
      : `k = ${k} 时每次合并吃掉 ${k} 棵、吐出 1 棵，候选数减少 k-1 = ${k - 1}。要正好剩一棵，必须 (N-1) % ${k - 1} == 0：当前 ${n} 个真实符号${needPad ? `，所以要补 ${needPad} 个权重 0 的虚符号` : '，恰好满足，不需要补虚符号'}。`,
    vars: vars({ 候选序列: cands.map((x) => x.weight).join(' ') }),
    layers: [treeOf(null), candOf()],
  }));

  while (cands.length > 1) {
    const take = Math.min(k, cands.length);
    const picked = cands.slice(0, take);
    steps.push(step({
      event: 'pick-two',
      lineId: 'pick',
      note: `取最轻的 ${take} 棵树：${picked.map((x) => `${x.weight}${x.sym != null ? `(${x.sym})` : ''}`).join('、')}。k 叉合并一次要 ${k} 棵，不是 2 棵 —— 这是与 v1/v2 最根本的区别。`,
      vars: vars({ 本次取: picked.map((x) => x.weight).join('+') }),
      layers: [treeOf(null), candOf(picked.map((_, i) => i))],
    }));

    cands.splice(0, take);
    const m = newNode({ weight: picked.reduce((s, x) => s + x.weight, 0), children: picked });
    steps.push(step({
      event: 'merge',
      lineId: 'digit',
      note: `合并成 ${m.weight}（${picked.map((x) => x.weight).join(' + ')}），它的 ${take} 个孩子按顺序对应数码 0..${take - 1}：k=3 时第三个数码是 2，不是 1 —— 所以 k 叉的码字与二叉完全不同。`,
      vars: vars({ 新节点: `${m.weight}` }),
      layers: [treeOf(m), candOf()],
    }));

    let pos = 0;
    while (pos < cands.length && cmpCand(cands[pos], m) < 0) pos++;
    cands.splice(pos, 0, m);
    steps.push(step({
      event: 'push-back',
      lineId: 'push',
      note: `按权重把 ${m.weight} 插回第 ${pos + 1} 位，候选数从 ${cands.length + k - 1} 降到 ${cands.length}（少 k-1 棵）。`,
      vars: vars({ 插入位置: `第 ${pos + 1} 位` }),
      layers: [treeOf(null), candOf([pos])],
    }));
  }

  const root = cands[0] || null;
  const codegen = [];
  const walk = (node, prefix) => {
    if (!node.children.length) {
      node.code = prefix === '' ? '0' : prefix;
      if (!node.dummy) codes[node.sym] = node.code;
      codegen.push(node);
      return;
    }
    node.children.forEach((c, i) => walk(c, prefix + String(i)));
  };
  if (root) walk(root, '');

  codegen.forEach((leaf, k2) => {
    steps.push(step({
      event: 'codegen',
      lineId: leaf.sym != null ? 'genleaf' : 'gen',
      note: leaf.dummy
        ? `${leaf.sym} 是补零虚符号（权重 0）：它占据一个码位（"${leaf.code}"）但权重为 0，所以不影响 WPL，也不出现在码表里。`
        : leaf.sym != null
          ? `${leaf.sym}（权重 ${leaf.weight}）沿数码走到叶子，码字 "${leaf.code}"，长度 ${leaf.code.length}，贡献 ${leaf.weight} × ${leaf.code.length} = ${leaf.weight * leaf.code.length}。`
          : `内部节点 ${leaf.weight} 的路径是 "${leaf.code}"，不产生码字。`,
      vars: vars({ 当前叶: leaf.sym != null ? leaf.sym : `w=${leaf.weight}` }),
      layers: [treeOf(null), candOf()],
    }));
    if (k2 === codegen.length - 1 && codegen.length > 1) {
      steps.push(step({
        event: 'codegen',
        lineId: 'gen',
        note: `${k} 叉码字全部生成：每个符号仍然是一条根→叶路径，只是分支从 2 路变成 ${k} 路，码长更短但"字母表"更大。`,
        vars: vars(),
        layers: [treeOf(null), candOf()],
      }));
    }
  });

  const wpl = leaves.reduce((s, l) => s + (l.dummy ? 0 : l.weight * (codes[l.sym] || '').length), 0);
  const result = { wpl, codes: { ...codes } };
  steps.push(step({
    event: 'done',
    lineId: 'end',
    done: true,
    result,
    note: n === 0
      ? '空权重：没有码字，WPL 记作 0。'
      : n === 1
        ? `单符号 ${symbols[0]}：k=${k} 下 (N-1)%(k-1)==0 已满足，无需补零，约定编码 "0"，WPL = ${wpl}。`
        : `${k} 叉哈夫曼完成：WPL = ${wpl}。与二叉版对照——同一组权重，k 越大合并轮数越少、码字越短，但每个节点要区分 ${k} 个数码。`,
    vars: vars(),
    layers: [treeOf(null), candOf()],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v3',
    sourceVersion: 'huffman-kary-v1',
    lines: L,
    steps,
    result,
    meta: { codes: { ...codes }, wpl, k, pad: needPad, leafOrder: root ? leafOrder(root, '').map(({ node, code }) => `${node.sym ?? `w=${node.weight}`}:${node.code ?? code}`) : [] },
  });
}

const RUNNERS = { v1: runV1, v2: runV2, v3: runV3 };

export function run(variantId, input) {
  const fn = RUNNERS[variantId];
  if (!fn) throw new Error(`未知变体：${variantId}`);
  return fn(input || {});
}

export function sourceLines(variantId) {
  return LINES[variantId] || LINES.v1;
}
