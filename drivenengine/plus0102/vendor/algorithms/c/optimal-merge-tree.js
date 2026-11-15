/**
 * C · 最佳归并树（k 叉 Huffman 树，外部排序的「最佳归并方案」）
 *
 * 为什么"最佳"：段数固定时，带权路径长度 WPL = 所有内部结点权重之和 = 总读写代价。
 * 让权重小的段沉到更深的层，就能把这个和压到最小 —— 于是反复取最小的 k 个合成父节点。
 *
 * 三个变体（策略必须真的不同）：
 *   v1 两路 Huffman 式：候选集合是升序数组，每轮取前两个，合成后重排；
 *   v2 k 路 + 补零虚段：先补 (k-1-(n-1)%(k-1))%(k-1) 个零权虚段，保证每轮都取满 k 个；
 *   v3 最小堆实现的归并树：候选集合是小根堆，取数过程（弹出 / 下沉 / 上浮）可见，
 *      树形结构与代价同 v1，但候选数组的顺序是堆序而不是有序序。
 *
 * 画面：主层 style 9（归并树森林，候选根即森林的根），副层 style 1（候选权重集合）。
 */

import { trace, step, arrayLayer, treeLayer } from '../../engine/model.js';

export const meta = {
  id: 'c/optimal-merge-tree',
  variants: [
    { id: 'v1', name: '两路 Huffman 式' },
    { id: 'v2', name: 'k 路 + 补零虚段' },
    { id: 'v3', name: '最小堆实现的归并树' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'int optimal_merge_tree(int w[], int n) {' },
    { lineId: 'init', text: '  sort(w, n);                    /* 权重升序，最小段排最前 */' },
    { lineId: 'loop', text: '  while (n > 1) {' },
    { lineId: 'two', text: '    int a = w[0], b = w[1];      /* 取最小的两段 */' },
    { lineId: 'merge', text: '    int parent = a + b;          /* 合成一棵子树 */' },
    { lineId: 'cost', text: '    wpl += parent;               /* 这棵子树的每个叶子多一层 */' },
    { lineId: 'push', text: '    drop_two_min(w, &n); w[n++] = parent; sort(w, n);' },
    { lineId: 'loop-end', text: '  }' },
    { lineId: 'end', text: '  return wpl;                  /* 即总读写代价 */' },
  ],
  v2: [
    { lineId: 'fn', text: 'void k_way_merge_tree(int w[], int n, int k) {' },
    { lineId: 'pad-calc', text: '  int pad = (k-1 - (n-1) % (k-1)) % (k-1);  /* 要补几个虚段 */' },
    { lineId: 'pad-add', text: '  for (int i = 0; i < pad; ++i) w[n++] = 0;  /* 零权虚段不带来代价 */' },
    { lineId: 'loop', text: '  while (n > 1) {' },
    { lineId: 'take', text: '    pick_k_min(w, n, k, pick);   /* 每轮必须取满 k 个 */' },
    { lineId: 'sum', text: '    int parent = 0; for (j = 0; j < k; ++j) parent += pick[j];' },
    { lineId: 'cost', text: '    wpl += parent;' },
    { lineId: 'push', text: '    drop_k(w, &n, pick); w[n++] = parent; sort(w, n);' },
    { lineId: 'loop-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void heap_merge_tree(int w[], int n) {' },
    { lineId: 'build', text: '  build_min_heap(w, n);           /* 建小根堆，O(n) */' },
    { lineId: 'loop', text: '  while (n > 1) {' },
    { lineId: 'pop', text: '    int a = heap_pop(w, &n);        /* 堆顶最小，取走后下沉 */' },
    { lineId: 'pop2', text: '    int b = heap_pop(w, &n);        /* 次小 */' },
    { lineId: 'merge', text: '    int parent = a + b;' },
    { lineId: 'cost', text: '    wpl += parent;' },
    { lineId: 'push', text: '    heap_push(w, &n, parent);       /* 新权重上浮回堆 */' },
    { lineId: 'loop-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '[2,3,7]、k=2（教材两路归并）',
    input: { weights: [2, 3, 7], k: 2 },
    expect: { wpl: 17, root: 12 },
  },
  {
    id: 'edge-single',
    label: '[5]（只有一段，不需要归并）',
    input: { weights: [5], k: 2 },
    expect: { wpl: 0, root: 5 },
  },
  {
    id: 'edge-same',
    label: '[1,1,1]（权重全相同，合并顺序不影响代价）',
    input: { weights: [1, 1, 1], k: 2 },
    expect: { wpl: 5, root: 3 },
  },
  {
    id: 'edge-empty',
    label: '[]（空权重表）',
    input: { weights: [], k: 2 },
    expect: { wpl: 0, root: 0 },
  },
  {
    id: 'edge-k3-padding',
    label: '[2,3,7,9]、k=3（4 段要补 1 个零权虚段）',
    input: { weights: [2, 3, 7, 9], k: 3 },
    expect: { wpl: 38, root: 21 },
    expectByVariant: { v2: { wpl: 26, root: 21 } },
  },
];

/* ------------------------------------------------------------------ 状态机 */

function newState() {
  return { nodes: new Map(), seq: 0, leafNo: 0, dummyNo: 0, mergeNo: 0, cand: [], wpl: 0, merges: 0 };
}

function put(st, spec) {
  const n = { seq: st.seq++, children: [], ...spec };
  st.nodes.set(n.id, n);
  return n.id;
}

const wOf = (st, id) => st.nodes.get(id).weight;

function addLeaf(st, w) {
  st.leafNo += 1;
  return put(st, { id: `w${st.leafNo}`, weight: Number(w), kind: 'leaf', badge: `段${st.leafNo}` });
}

function addDummy(st) {
  st.dummyNo += 1;
  return put(st, { id: `z${st.dummyNo}`, weight: 0, kind: 'dummy', badge: '虚段' });
}

function addMerge(st, kids) {
  st.mergeNo += 1;
  const weight = kids.reduce((s, id) => s + wOf(st, id), 0);
  return put(st, { id: `m${st.mergeNo}`, weight, kind: 'merge', badge: `m${st.mergeNo}`, children: kids.slice() });
}

/** 候选集合按权重升序（同权重按生成顺序，保证轨迹可复现） */
function sortCand(st) {
  st.cand.sort((x, y) => (wOf(st, x) - wOf(st, y)) || (st.nodes.get(x).seq - st.nodes.get(y).seq));
}

/** 小根堆上浮：v3 的候选集合按堆序排，而不是有序序 */
function heapPush(st, id) {
  st.cand.push(id);
  let i = st.cand.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (wOf(st, st.cand[p]) <= wOf(st, st.cand[i])) break;
    [st.cand[p], st.cand[i]] = [st.cand[i], st.cand[p]];
    i = p;
  }
}

function heapPop(st) {
  const n = st.cand.length;
  if (n === 0) return null;
  const top = st.cand[0];
  st.cand[0] = st.cand[n - 1];
  st.cand.pop();
  let i = 0;
  const m = st.cand.length;
  for (;;) {
    const l = i * 2 + 1;
    const r = l + 1;
    let s = i;
    if (l < m && wOf(st, st.cand[l]) < wOf(st, st.cand[s])) s = l;
    if (r < m && wOf(st, st.cand[r]) < wOf(st, st.cand[s])) s = r;
    if (s === i) break;
    [st.cand[i], st.cand[s]] = [st.cand[s], st.cand[i]];
    i = s;
  }
  return top;
}

/* ------------------------------------------------------------------ 快照 */

/** 归并树森林快照：候选根 = 森林的根，已归并进子树内部的结点标 done */
function treeSnap(st, { k = 2, focus1 = [], focus2 = [], added = null, pointers = [], allDone = false } = {}) {
  const inCand = new Set(st.cand);
  const nodes = [...st.nodes.values()].map((n) => ({
    id: n.id,
    label: String(n.weight),
    children: [...n.children],
    badge: n.badge,
  }));
  const edgeTags = {};
  for (const n of st.nodes.values()) {
    n.children.forEach((c, i) => {
      edgeTags[c] = `C${i + 1}`;
    });
  }
  const done = allDone
    ? [...st.nodes.keys()]
    : [...st.nodes.keys()].filter((id) => !inCand.has(id) && id !== added);
  const roles = { done };
  if (focus1.length) roles.focus1 = focus1;
  if (focus2.length) roles.focus2 = focus2;
  if (added) roles.added = [added];
  if (pointers.length) roles.pointers = pointers;
  return treeLayer({
    id: 'tree',
    title: '归并树（森林：每棵候选子树是一个根）',
    name: `最佳归并树 · k=${k} · WPL=${st.wpl}`,
    nodes,
    roots: [...st.cand],
    edgeTags,
    roles,
  });
}

/** 候选权重集合：样式 1 数组，格子里显示"结点 id + 权重" */
function candLayer(st, { roles = {}, title = '候选权重', name = '候选集合（升序，前面最小）' } = {}) {
  return arrayLayer({
    id: 'cand',
    title,
    name,
    values: st.cand.map((id) => wOf(st, id)),
    labels: st.cand.map((id) => `${id}=${wOf(st, id)}`),
    roles,
  });
}

const candText = (st) => (st.cand.length ? st.cand.map((id) => `${id}(${wOf(st, id)})`).join(' ') : '∅');
const rootOf = (st) => (st.cand.length ? wOf(st, st.cand[0]) : 0);

/* ------------------------------------------------------------------ 变体 1：两路 Huffman 式 */

function runV1(input) {
  const weights = (input.weights || []).map((w) => Number(w));
  const k = 2;
  const n = weights.length;
  const st = newState();
  const steps = [];
  const L = LINES.v1;

  for (const w of weights) st.cand.push(addLeaf(st, w));
  sortCand(st);

  steps.push(step({
    event: 'init', lineId: 'init',
    note: n === 0
      ? '权重表为空，没有段需要归并，代价为 0。'
      : n === 1
        ? `只有 1 个段（权重 ${weights[0]}），它自己就是树根，没有归并代价。`
        : `把 ${n} 个段按权重升序排成候选数组。本变体固定两路归并（忽略输入 k）：每轮取最小的两段合成一棵子树，新子树再放回候选集合。`,
    vars: { n, k, wpl: 0, merges: 0, cand: candText(st) },
    layers: [treeSnap(st, { k }), candLayer(st, {})],
  }));

  while (st.cand.length > 1) {
    const a = st.cand[0];
    const b = st.cand[1];
    const wa = wOf(st, a);
    const wb = wOf(st, b);

    steps.push(step({
      event: 'pick-min-two', lineId: 'two',
      note: `候选里最小的是 ${a}(${wa}) 与 ${b}(${wb})。小权重的段要离根更远：它在归并树里每深一层就多读一次，所以先合并它们。`,
      vars: { n, k, wpl: st.wpl, merges: st.merges, a: `${a}(${wa})`, b: `${b}(${wb})`, cand: candText(st) },
      layers: [
        treeSnap(st, {
          k, focus1: [a], focus2: [b],
          pointers: [{ id: 'a', label: 'min1', node: a }, { id: 'b', label: 'min2', node: b }],
        }),
        candLayer(st, { roles: { focus1: [0], focus2: [1] } }),
      ],
    }));

    const parent = addMerge(st, [a, b]);
    const wp = wOf(st, parent);

    steps.push(step({
      event: 'merge', lineId: 'merge',
      note: `新建父结点 ${parent} = ${wa} + ${wb} = ${wp}，孩子是 ${a} 与 ${b}。它还没进候选集合，先作为一棵独立的子树挂出来。`,
      vars: { n, k, wpl: st.wpl, merges: st.merges, parent: `${parent}(${wp})`, cand: candText(st) },
      layers: [
        treeSnap(st, { k, added: parent, focus1: [a], focus2: [b] }),
        candLayer(st, { roles: { focus1: [0], focus2: [1] } }),
      ],
    }));

    st.wpl += wp;
    steps.push(step({
      event: 'cost', lineId: 'cost',
      note: `${parent} 子树下的每个叶子都要在这一次归并里被读写一遍，WPL 增加 ${wp}，累计 ${st.wpl}。`,
      vars: { n, k, wpl: st.wpl, merges: st.merges, parent: `${parent}(${wp})`, cand: candText(st) },
      layers: [
        treeSnap(st, { k, added: parent, focus1: [a], focus2: [b] }),
        candLayer(st, { roles: { focus1: [0], focus2: [1] } }),
      ],
    }));

    st.cand = st.cand.filter((id) => id !== a && id !== b);
    st.cand.push(parent);
    sortCand(st);
    st.merges += 1;
    steps.push(step({
      event: 'push-back', lineId: 'push',
      note: `${a}、${b} 出候选集合，${parent}(${wp}) 作为一棵新子树回到候选集合并重排：候选数变成 ${st.cand.length}。`,
      vars: { n, k, wpl: st.wpl, merges: st.merges, cand: candText(st) },
      layers: [
        treeSnap(st, { k }),
        candLayer(st, { roles: { added: [st.cand.indexOf(parent)] } }),
      ],
    }));
  }

  const result = { wpl: st.wpl, root: rootOf(st) };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n <= 1
      ? `不需要归并：树根权重 ${result.root}，WPL = ${result.wpl}。`
      : `只剩一个候选 ${st.cand[0] ?? '∅'} 时结束：树根权重 ${result.root}，累计 WPL = ${result.wpl}（归并 ${st.merges} 次）。`,
    vars: { n, k, wpl: st.wpl, merges: st.merges, cand: candText(st) },
    layers: [treeSnap(st, { k, allDone: true }), candLayer(st, { roles: { done: [0] } })],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'optimal-merge-tree-huffman-v1',
    lines: L, steps, result, meta: { wpl: st.wpl, merges: st.merges },
  });
}

/* ------------------------------------------------------------------ 变体 2：k 路 + 补零虚段 */

function runV2(input) {
  const weights = (input.weights || []).map((w) => Number(w));
  const n0 = weights.length;
  const k = Math.max(2, Math.floor(Number(input.k) || 2));
  const st = newState();
  const steps = [];
  const L = LINES.v2;

  for (const w of weights) st.cand.push(addLeaf(st, w));
  sortCand(st);

  const pad = n0 === 0 ? 0 : ((k - 1) - ((n0 - 1) % (k - 1))) % (k - 1);

  steps.push(step({
    event: 'init', lineId: 'pad-calc',
    note: n0 === 0
      ? '权重表为空，不需要补段，也不需要归并。'
      : `k = ${k} 路归并要求每轮都能取满 ${k} 个，因此段数必须满足 n ≡ 1 (mod ${k - 1})。当前 n = ${n0}，算出要补 pad = ${pad} 个零权虚段。`,
    vars: { n: n0, k, pad, wpl: 0, merges: 0, cand: candText(st) },
    layers: [treeSnap(st, { k }), candLayer(st, { title: '候选权重', name: `候选集合（升序，最多每次取 ${k} 个）` })],
  }));

  for (let i = 0; i < pad; i++) {
    const z = addDummy(st);
    st.cand.push(z);
    sortCand(st);
    steps.push(step({
      event: 'push-back', lineId: 'pad-add',
      note: `补第 ${i + 1}/${pad} 个零权虚段 ${z}：权重 0 的段被归并时不会给 WPL 增加任何代价，只是把段数凑成 n ≡ 1 (mod ${k - 1})。`,
      vars: { n: st.cand.length, k, pad, wpl: st.wpl, merges: st.merges, cand: candText(st) },
      layers: [treeSnap(st, { k, added: z }), candLayer(st, { added: [st.cand.indexOf(z)] })],
    }));
  }

  while (st.cand.length > 1) {
    const take = Math.min(k, st.cand.length);
    const picked = st.cand.slice(0, take);
    const sum = picked.reduce((s, id) => s + wOf(st, id), 0);
    const detail = picked.map((id) => `${id}(${wOf(st, id)})`).join(' + ');

    steps.push(step({
      event: 'pick-min-two', lineId: 'take',
      note: `每轮取满 ${take} 个最小候选：${detail}。段数已凑成 n ≡ 1 (mod ${k - 1})，所以每次都能取满 ${k} 个，树不会出现只有一个孩子的空层次。`,
      vars: { n: st.cand.length, k, wpl: st.wpl, merges: st.merges, take, pick: detail },
      layers: [
        treeSnap(st, { k, focus1: picked, pointers: picked.slice(0, 3).map((id, i) => ({ id: `p${i}`, label: `#${i + 1}`, node: id })) }),
        candLayer(st, { roles: { focus1: picked.map((_, i) => i) } }),
      ],
    }));

    const parent = addMerge(st, picked);
    const wp = wOf(st, parent);

    steps.push(step({
      event: 'merge', lineId: 'sum',
      note: `父结点 ${parent} = ${detail} = ${wp}，一次归并 ${take} 段，孩子边按 C1..C${take} 标注。`,
      vars: { n: st.cand.length, k, wpl: st.wpl, merges: st.merges, parent: `${parent}(${wp})` },
      layers: [treeSnap(st, { k, added: parent, focus1: picked }), candLayer(st, { roles: { focus1: picked.map((_, i) => i) } })],
    }));

    st.wpl += wp;
    steps.push(step({
      event: 'cost', lineId: 'cost',
      note: `WPL 增加 ${wp}（这 ${take} 棵子树里的叶子各多一层），累计 ${st.wpl}。虚段的 0 权重对代价没有贡献。`,
      vars: { n: st.cand.length, k, wpl: st.wpl, merges: st.merges, parent: `${parent}(${wp})` },
      layers: [treeSnap(st, { k, added: parent, focus1: picked }), candLayer(st, { roles: { focus1: picked.map((_, i) => i) } })],
    }));

    st.cand = st.cand.filter((id) => !picked.includes(id));
    st.cand.push(parent);
    sortCand(st);
    st.merges += 1;
    steps.push(step({
      event: 'push-back', lineId: 'push',
      note: `这 ${take} 个候选出集合，${parent}(${wp}) 回到候选集合并重排：剩 ${st.cand.length} 个。`,
      vars: { n: st.cand.length, k, wpl: st.wpl, merges: st.merges, cand: candText(st) },
      layers: [treeSnap(st, { k }), candLayer(st, {})],
    }));
  }

  const result = { wpl: st.wpl, root: rootOf(st) };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n0 <= 1
      ? `不需要归并：树根权重 ${result.root}，WPL = ${result.wpl}。`
      : `结束：${k} 叉归并树根权重 ${result.root}，累计 WPL = ${result.wpl}（共归并 ${st.merges} 次，补了 ${pad} 个虚段）。`,
    vars: { n: st.cand.length, k, pad, wpl: st.wpl, merges: st.merges, cand: candText(st) },
    layers: [treeSnap(st, { k, allDone: true }), candLayer(st, { title: '候选权重', name: '归并结束后只剩树根', roles: { done: [0] } })],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'optimal-merge-tree-kway-v1',
    lines: L, steps, result, meta: { wpl: st.wpl, merges: st.merges, pad },
  });
}

/* ------------------------------------------------------------------ 变体 3：最小堆实现 */

function runV3(input) {
  const weights = (input.weights || []).map((w) => Number(w));
  const k = 2;
  const n = weights.length;
  const st = newState();
  const steps = [];
  const L = LINES.v3;

  for (const w of weights) addLeaf(st, w);
  // 建小根堆：逐个上浮（等价于 build_min_heap）
  st.cand = [];
  for (const id of [...st.nodes.keys()]) heapPush(st, id);

  steps.push(step({
    event: 'init', lineId: 'build',
    note: n === 0
      ? '权重表为空，堆也是空的，不需要归并。'
      : n === 1
        ? `只有 1 个段（权重 ${weights[0]}），它同时是树根与堆顶。`
        : `把 ${n} 个段建成小根堆（按权重）。注意候选数组是**堆序**而不是有序序：堆顶最小，但后面几个谁大谁小看不出来。`,
    vars: { n, k, wpl: 0, merges: 0, cand: candText(st) },
    layers: [
      treeSnap(st, { k }),
      candLayer(st, { title: '候选权重（堆序）', name: '小根堆数组表示：heap[0] 最小' }),
    ],
  }));

  while (st.cand.length > 1) {
    const a = heapPop(st);
    const wa = wOf(st, a);
    steps.push(step({
      event: 'pick-min-two', lineId: 'pop',
      note: `弹出堆顶 ${a}(${wa})：把堆尾挪到堆顶再下沉，O(log n) 次比较换回最小值，堆序依然成立。`,
      vars: { n: st.cand.length + 1, k, wpl: st.wpl, merges: st.merges, a: `${a}(${wa})`, cand: candText(st) },
      layers: [
        treeSnap(st, { k, focus1: [a], pointers: [{ id: 'a', label: 'min1', node: a }] }),
        candLayer(st, { title: '候选权重（堆序）', name: '小根堆数组表示：heap[0] 最小' }),
      ],
    }));

    const b = heapPop(st);
    const wb = wOf(st, b);
    steps.push(step({
      event: 'pick-min-two', lineId: 'pop2',
      note: `再弹出新的堆顶 ${b}(${wb})。两个最小值都出堆了，接下来它们合成的新子树要重新上浮回堆里。`,
      vars: { n: st.cand.length + 2, k, wpl: st.wpl, merges: st.merges, a: `${a}(${wa})`, b: `${b}(${wb})`, cand: candText(st) },
      layers: [
        treeSnap(st, { k, focus1: [a], focus2: [b], pointers: [{ id: 'a', label: 'min1', node: a }, { id: 'b', label: 'min2', node: b }] }),
        candLayer(st, { title: '候选权重（堆序）', name: '小根堆数组表示：heap[0] 最小' }),
      ],
    }));

    const parent = addMerge(st, [a, b]);
    const wp = wOf(st, parent);
    steps.push(step({
      event: 'merge', lineId: 'merge',
      note: `父结点 ${parent} = ${wa} + ${wb} = ${wp}。树形结构和 v1 一样，差别只在"最小值怎么找出来"：这里是堆而不是排序。`,
      vars: { n: st.cand.length + 2, k, wpl: st.wpl, merges: st.merges, parent: `${parent}(${wp})` },
      layers: [treeSnap(st, { k, added: parent, focus1: [a], focus2: [b] }), candLayer(st, { title: '候选权重（堆序）', name: '小根堆数组表示：heap[0] 最小' })],
    }));

    st.wpl += wp;
    steps.push(step({
      event: 'cost', lineId: 'cost',
      note: `${parent} 子树里的每个叶子都要再读写一遍，WPL 增加 ${wp}，累计 ${st.wpl}。`,
      vars: { n: st.cand.length + 2, k, wpl: st.wpl, merges: st.merges, parent: `${parent}(${wp})` },
      layers: [treeSnap(st, { k, added: parent, focus1: [a], focus2: [b] }), candLayer(st, { title: '候选权重（堆序）', name: '小根堆数组表示：heap[0] 最小' })],
    }));

    heapPush(st, parent);
    st.merges += 1;
    steps.push(step({
      event: 'push-back', lineId: 'push',
      note: `${parent}(${wp}) 压入堆尾后上浮到合适位置（可能与父结点交换若干次），堆里还剩 ${st.cand.length} 个候选。`,
      vars: { n: st.cand.length, k, wpl: st.wpl, merges: st.merges, cand: candText(st) },
      layers: [
        treeSnap(st, { k }),
        candLayer(st, { title: '候选权重（堆序）', name: '小根堆数组表示：heap[0] 最小', roles: { added: [st.cand.indexOf(parent)] } }),
      ],
    }));
  }

  const result = { wpl: st.wpl, root: rootOf(st) };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n <= 1
      ? `不需要归并：树根权重 ${result.root}，WPL = ${result.wpl}。`
      : `堆里只剩一个元素，它就是树根：权重 ${result.root}，累计 WPL = ${result.wpl}。代价与 v1 相同，取最小值的比较次数从每轮 O(n) 降到 O(log n)。`,
    vars: { n: st.cand.length, k, wpl: st.wpl, merges: st.merges, cand: candText(st) },
    layers: [
      treeSnap(st, { k, allDone: true }),
      candLayer(st, { title: '候选权重（堆序）', name: '堆里只剩树根', roles: { done: [0] } }),
    ],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'optimal-merge-tree-heap-v1',
    lines: L, steps, result, meta: { wpl: st.wpl, merges: st.merges },
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
