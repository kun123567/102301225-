/**
 * B · Kruskal 最小生成树（3 个代表性不同实现）
 *
 * 三个变体的差别不只在名字，中间结构完全不同：
 *   v1 排序 + 按秩合并：parent[] + rank[]，find 只是"一路走到根"，合并时把秩小的根挂到
 *      秩大的根下，秩只在小→大时 +1。画面重点：rank 的变化与"谁挂到谁下面"。
 *   v2 排序 + 路径压缩：不维护 rank，find 走到根后把**沿途父指针直接改指到根**。
 *      画面上会出现"压缩前后 parent[] 不一样"的一步，合并方向也因此与 v1 相反（会造出链）。
 *   v3 逆向删除法：先把所有边都当成在用，按权**从大到小**试删；删完连通分量数没变就真删，
 *      否则该边是桥必须留。它不是"加边"而是"删边"，代价花在 m 次连通性判定上。
 *
 * 契约（docs/04-轨迹契约.md）：每步完整快照、lineId 命中本变体 sourceLines、
 * 末步 done=true 且带 result；事件只用目录词表里的 init/sort/probe-edge/union/reject/forest/done。
 */

import { trace, step, graphLayer, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'b/kruskal',
  variants: [
    { id: 'v1', name: '排序 + 按秩合并' },
    { id: 'v2', name: '排序 + 路径压缩' },
    { id: 'v3', name: '逆向删除法' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void kruskal_rank(Edge e[], int m, int n) {' },
    { lineId: 'init', text: '  for (v = 0; v < n; ++v) { parent[v] = v; rank[v] = 0; }   /* 每个顶点自成一棵树 */' },
    { lineId: 'sort', text: '  qsort(e, m, byWeight);                              /* 按权升序：先挑最轻的边 */' },
    { lineId: 'for', text: '  for (i = 0; i < m && cnt < n - 1; ++i) {' },
    { lineId: 'probe', text: '    u = e[i].from;  v = e[i].to;  w = e[i].w;          /* 当前考察的边 */' },
    { lineId: 'find', text: '    ru = find(u);  rv = find(v);                       /* 沿 parent 一路走到根，不做压缩 */' },
    { lineId: 'same', text: '    if (ru == rv) continue;                            /* 同根 → 加上这条边必成环，丢弃 */' },
    { lineId: 'rank', text: '    if (rank[ru] < rank[rv]) swap(&ru, &rv);           /* 秩小的根挂到秩大的根下 */' },
    { lineId: 'union', text: '    parent[rv] = ru;                                   /* 两棵树并成一棵 */' },
    { lineId: 'bump', text: '    if (rank[ru] == rank[rv]) ++rank[ru];              /* 只有同高合并，树高才 +1 */' },
    { lineId: 'accept', text: '    T[k++] = e[i];  sum += w;  ++cnt;' },
    { lineId: 'forest', text: '  if (cnt < n - 1) puts("边不够：得到最小生成森林");' },
    { lineId: 'ret', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void kruskal_compress(Edge e[], int m, int n) {' },
    { lineId: 'init', text: '  for (v = 0; v < n; ++v) parent[v] = v;              /* 不维护 rank：靠压缩换摊还代价 */' },
    { lineId: 'sort', text: '  qsort(e, m, byWeight);' },
    { lineId: 'for', text: '  for (i = 0; i < m && cnt < n - 1; ++i) {' },
    { lineId: 'probe', text: '    u = e[i].from;  v = e[i].to;  w = e[i].w;' },
    { lineId: 'walk', text: '    ru = root_of(u, pu);  rv = root_of(v, pv);         /* 走到根，同时把沿途顶点记进 pu / pv */' },
    { lineId: 'compress', text: '    for (k = 0; k < pu.len; ++k) parent[pu[k]] = ru;   /* 沿途父指针直接改指到根 */' },
    { lineId: 'same', text: '    if (ru == rv) continue;                            /* 压缩完再判：同根即成环 */' },
    { lineId: 'union', text: '    parent[ru] = rv;                                   /* 不用秩：整棵树直接挂过去 */' },
    { lineId: 'accept', text: '    T[k++] = e[i];  sum += w;  ++cnt;' },
    { lineId: 'forest', text: '  if (cnt < n - 1) puts("边不够：得到最小生成森林");' },
    { lineId: 'ret', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void reverse_delete(Edge e[], int m, int n) {' },
    { lineId: 'init', text: '  for (i = 0; i < m; ++i) removed[i] = FALSE;        /* 一开始所有边都在用 */' },
    { lineId: 'sort', text: '  qsort_desc(e, m, byWeight);                        /* 从最重的边开始试删 */' },
    { lineId: 'for', text: '  for (i = 0; i < m; ++i) {' },
    { lineId: 'probe', text: '    removed[i] = TRUE;                               /* 假设删掉 e[i]（当前最重的一条） */' },
    { lineId: 'check', text: '    if (count_components(n, e, m, removed) == base)  /* 删完连通分量数没变 → 这条边多余 */' },
    { lineId: 'del-ok', text: '      continue;                                      /* 真删：removed[i] 保持 TRUE */' },
    { lineId: 'undo', text: '    removed[i] = FALSE;                              /* 删了就断 → e[i] 是桥，必须留 */' },
    { lineId: 'count', text: '  }' },
    { lineId: 'forest', text: '  if (count_components(n, e, m, removed) > 1) puts("原图不连通：得到最小生成森林");' },
    { lineId: 'ret', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

const NODES = (ids) => ids.map((id) => ({ id, label: id }));
const WEDGES = (triples) => triples.map(([from, to, w]) => ({ from, to, w }));

// 任务单主样例：AB=1、BC=2、AC=3、CD=4 → AC 成一个圈，被拒；MST = AB+BC+CD，权重 7
const G_NORMAL = {
  directed: false,
  nodes: NODES(['A', 'B', 'C', 'D']),
  edges: WEDGES([['A', 'B', 1], ['B', 'C', 2], ['A', 'C', 3], ['C', 'D', 4]]),
};
// 边界：两个分量（A-B-C 与 D-E），边都不够连成树 → 森林
const G_FOREST = {
  directed: false,
  nodes: NODES(['A', 'B', 'C', 'D', 'E']),
  edges: WEDGES([['A', 'B', 1], ['B', 'C', 2], ['D', 'E', 3]]),
};
// 边界：单边图，最小生成树就是那条边本身
const G_SINGLE_EDGE = {
  directed: false,
  nodes: NODES(['A', 'B']),
  edges: WEDGES([['A', 'B', 5]]),
};

export const samples = [
  {
    id: 'normal',
    label: 'AB=1, BC=2, AC=3, CD=4（AC 成环被拒，期望权重 7）',
    input: { graph: G_NORMAL, start: 'A' },
    expect: {
      edges: [['A', 'B'], ['B', 'C'], ['C', 'D']],
      rejected: [['A', 'C']],
      weight: 7,
      forest: false,
      components: 1,
    },
  },
  {
    id: 'edge-forest',
    label: '两个分量 A-B-C 与 D-E（边不够连成树，期望 forest=true）',
    input: { graph: G_FOREST, start: 'A' },
    expect: {
      edges: [['A', 'B'], ['B', 'C'], ['D', 'E']],
      rejected: [],
      weight: 6,
      forest: true,
      components: 2,
    },
  },
  {
    id: 'edge-single-edge',
    label: '单边图 AB=5（只有一条边，没有可拒的）',
    input: { graph: G_SINGLE_EDGE, start: 'A' },
    expect: {
      edges: [['A', 'B']],
      rejected: [],
      weight: 5,
      forest: false,
      components: 1,
    },
  },
];

/* ------------------------------------------------------------------ 输入归一 */

const str = (v) => String(v);

function normalizeGraph(input) {
  const raw = (input && input.graph) || {};
  const rawNodes = raw.nodes || [];
  // 同名顶点加 a/b 后缀：不能靠颜色区分两个 label 相同的点
  const shown = labelsOf(rawNodes.map((nd) => str(nd.label ?? nd.id)));
  const nodes = rawNodes.map((nd, i) => ({ id: str(nd.id), label: shown[i] }));
  const known = new Set(nodes.map((nd) => nd.id));
  const edges = [];
  for (const e of raw.edges || []) {
    const from = str(e.from);
    const to = str(e.to);
    if (!known.has(from) || !known.has(to)) continue;   // 指向不存在顶点的边忽略
    if (from === to) continue;                          // 自环永远不会进生成树
    const w = Number.isFinite(Number(e.w)) ? Number(e.w) : 1;
    edges.push({ from, to, w });
  }
  return { directed: !!raw.directed, nodes, edges };
}

function indexOf(g) {
  const m = new Map();
  g.nodes.forEach((nd, i) => m.set(nd.id, i));
  return m;
}

/** 原图的连通分量数（按未删的边算） */
function countComponents(n, ends, removed) {
  const par = new Array(n).fill(0).map((_, i) => i);
  const find = (x) => { let r = x; while (par[r] !== r) r = par[r]; return r; };
  ends.forEach(([a, b], ei) => {
    if (removed[ei]) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) par[ra] = rb;
  });
  const roots = new Set();
  for (let i = 0; i < n; i++) roots.add(find(i));
  return roots.size;
}

/** 从 s 出发能到哪些点（假删一条边之后，用来解释"哪儿掉队了"） */
function reachableFrom(n, adj, s, removed) {
  const seen = new Array(n).fill(false);
  if (s < 0 || s >= n) return seen;
  const q = [s];
  seen[s] = true;
  while (q.length) {
    const u = q.shift();
    for (const { v, ei } of adj[u]) {
      if (removed[ei] || seen[v]) continue;
      seen[v] = true;
      q.push(v);
    }
  }
  return seen;
}

function graphPanel(g, o = {}) {
  return graphLayer({
    id: 'graph',
    title: o.title || '图',
    name: o.name || '',
    layout: 'circle',
    directed: g.directed,
    weighted: true,
    nodes: g.nodes.map((nd, i) => ({
      id: nd.id,
      label: nd.label,
      sub: o.subOf ? o.subOf(i) : undefined,
      badge: o.badgeOf ? o.badgeOf(i) : undefined,
    })),
    edges: g.edges.map((e, i) => ({
      from: e.from,
      to: e.to,
      w: e.w,
      state: (o.edgeStates && o.edgeStates[i]) || 'idle',
      directed: g.directed,
    })),
    roles: o.roles || {},
  });
}

function undirectedAdj(g, idx) {
  const adj = g.nodes.map(() => []);
  g.edges.forEach((e, ei) => {
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    adj[a].push({ v: b, ei });
    if (!g.directed) adj[b].push({ v: a, ei });
  });
  adj.forEach((list) => list.sort((x, y) => x.v - y.v || x.ei - y.ei));
  return adj;
}

/** 结果里的边一律按 (w, from, to) 规范排序，三个变体输出可比 */
function canonical(list) {
  return list
    .slice()
    .sort((x, y) => (x.w - y.w) || (x.from < y.from ? -1 : x.from > y.from ? 1 : 0) || (x.to < y.to ? -1 : x.to > y.to ? 1 : 0))
    .map((x) => [x.from, x.to]);
}

/* ------------------------------------------------------------------ 变体 1（排序 + 按秩合并） */

function runV1(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const m = g.edges.length;
  const idx = indexOf(g);
  const L = LINES.v1;

  const ascOrder = g.edges.map((_, ei) => ei).sort((a, b) => (g.edges[a].w - g.edges[b].w) || (a - b));

  const parents = new Array(n).fill(0).map((_, i) => i);
  const ranks = new Array(n).fill(0);
  const accepted = [];      // {from,to,w,ei}
  const rejectedE = [];
  const acceptSet = new Set();
  const rejectSet = new Set();
  let sum = 0;
  const steps = [];

  const findPlain = (x) => {
    let r = x;
    let guard = 0;
    while (parents[r] !== r && guard++ <= n + 2) r = parents[r];
    return r;
  };
  const rootIds = () => {
    const out = [];
    for (let i = 0; i < n; i++) if (parents[i] === i) out.push(i);
    return out;
  };
  const edgeStates = (override = {}) => {
    const st = g.edges.map(() => 'idle');
    for (const ei of acceptSet) st[ei] = 'tree';
    for (const ei of rejectSet) st[ei] = 'reject';
    for (const k of Object.keys(override)) st[Number(k)] = override[k];
    return st;
  };
  const edgePanel = (o = {}) => arrayLayer({
    id: 'edges',
    title: o.title || '边按权升序（值 = w）',
    name: 'Edge e[m]',
    values: ascOrder.map((ei) => g.edges[ei].w),
    labels: ascOrder.map((ei) => `${g.edges[ei].from}-${g.edges[ei].to}`),
    roles: o.roles || {},
  });
  const dsuPanel = (o = {}) => arrayLayer({
    id: 'dsu',
    title: 'parent[]（值 = 父结点 · 标签带 rank）',
    name: 'int parent[n], rank[n]',
    values: parents.map((p) => g.nodes[p].label),
    labels: g.nodes.map((nd, i) => `${nd.label}·秩${ranks[i]}`),
    roles: o.roles || {},
  });
  const sweep = (j) => Array.from({ length: j }, (_, x) => x);   // 已扫过的边（显示下标）
  const layers = (o = {}) => [
    graphPanel(g, {
      title: o.title || `图（${g.directed ? '有向' : '无向'} · 并查集在顶点上）`,
      name: 'Edge e[m] + DSU',
      roles: o.roles || {},
      edgeStates: edgeStates(o.override || {}),
      subOf: (i) => (parents[i] === i ? '根' : `→${g.nodes[parents[i]].label}`),
      badgeOf: (i) => (acceptSet.size > 0 && parents[i] === i ? `根·秩${ranks[i]}` : undefined),
    }),
    edgePanel({ roles: o.edgeRoles || {} }),
    dsuPanel({ roles: o.dsuRoles || {} }),
  ];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '图为空：没有顶点也没有边，并查集是空的。'
      : `共 ${n} 个顶点、${m} 条边，需要 n-1 = ${Math.max(0, n - 1)} 条边才能连成树。并查集一开始让每个顶点自成一棵树（parent[v] = v，秩全为 0）。`,
    vars: { n, edges: m, 已收边: 0, weight: 0, 需要: Math.max(0, n - 1) },
    layers: layers({ dsuRoles: { done: rootIds() } }),
  }));

  if (n === 0 || m === 0) {
    const comps = n === 0 ? 0 : n;
    const result = {
      edges: [], rejected: [], weight: 0, forest: comps > 1, components: comps, edgeCount: 0,
    };
    if (comps > 1) {
      steps.push(step({
        event: 'forest', lineId: 'forest',
        note: `没有边可考察：${n} 个顶点各自成树，谁也没和谁连上 → ${comps} 个分量的最小生成森林。`,
        vars: { n, edges: m, 已收边: 0, weight: 0, 分量数: comps },
        layers: layers({ dsuRoles: { done: rootIds() } }),
      }));
    }
    steps.push(step({
      event: 'done', lineId: 'ret', done: true, result,
      note: n === 0 ? '空图：直接结束，生成树是空的。' : `Kruskal 结束：一条边都收不了，${comps} 个分量各自孤立。`,
      vars: { n, edges: m, 已收边: 0, weight: 0, 分量数: comps },
      layers: layers({ dsuRoles: { done: rootIds() } }),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'kruskal-rank-v1', lines: L, steps, result });
  }

  steps.push(step({
    event: 'sort', lineId: 'sort',
    note: `按权升序排好：${ascOrder.map((ei) => `${g.edges[ei].from}-${g.edges[ei].to}(${g.edges[ei].w})`).join(' ≤ ')}。Kruskal 的贪心前提是"先看轻边"——排序是整个算法的第一步，也是最贵的一步（O(E log E)）。`,
    vars: { n, edges: m, 排序后: ascOrder.map((ei) => g.edges[ei].w).join('、'), 已收边: 0, weight: 0 },
    layers: layers({ edgeRoles: { pointers: [{ id: 'i', label: 'i', index: 0 }] }, dsuRoles: { done: rootIds() } }),
  }));

  for (let j = 0; j < ascOrder.length && accepted.length < n - 1; j++) {
    const ei = ascOrder[j];
    const e = g.edges[ei];
    const u = idx.get(e.from);
    const v = idx.get(e.to);

    steps.push(step({
      event: 'probe-edge', lineId: 'probe',
      note: `考察第 ${j + 1} 条边 ${e.from}-${e.to}（w=${e.w}）：它是当前还没被处理的最轻边。轻不轻不是目的，能不能"接上两个不同的集合"才是关键。`,
      vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, w: e.w, 已收边: accepted.length, weight: sum },
      layers: layers({
        roles: { focus1: [e.from], focus2: [e.to] },
        edgeRoles: { done: sweep(j), pointers: [{ id: 'i', label: 'i', index: j }], focus1: [j] },
        dsuRoles: { done: rootIds() },
        override: { [ei]: 'active' },
      }),
    }));

    let ru = findPlain(u);
    let rv = findPlain(v);
    const ruId = g.nodes[ru].id;
    const rvId = g.nodes[rv].id;

    steps.push(step({
      event: 'probe-edge', lineId: 'find',
      note: `find(${e.from}) = ${ruId}，find(${e.to}) = ${rvId}。find 只做一件事：顺着 parent 一路走到自己指向自己的那个点。${ru === rv ? '两个端点走到同一个根 —— 它们本来就在同一棵树里。' : '两个根不同 —— 这条边能把两个集合接起来。'}`,
      vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, ru: ruId, rv: rvId, 同根: ru === rv ? '是' : '否' },
      layers: layers({
        roles: { focus1: [ruId], focus2: [rvId] },
        edgeRoles: { done: sweep(j), pointers: [{ id: 'i', label: 'i', index: j }] },
        dsuRoles: { done: rootIds(), focus1: [ru], focus2: [rv], pointers: [{ id: 'ru', label: 'ru', index: ru }, { id: 'rv', label: 'rv', index: rv }] },
        override: { [ei]: 'active' },
      }),
    }));

    if (ru === rv) {
      rejectedE.push(e);
      rejectSet.add(ei);
      steps.push(step({
        event: 'reject', lineId: 'same',
        note: `${e.from} 与 ${e.to} 的根都是 ${ruId}：它们在同一个连通集合里，加上这条边就形成一个环。生成树不能有环 → 丢掉（拒绝 ${accepted.length + 1}/${n - 1} 之外的这条边，总权重不变）。`,
        vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, 拒绝原因: '两端同根', 已收边: accepted.length, weight: sum },
        layers: layers({
          roles: { focus1: [e.from], focus2: [e.to] },
          edgeRoles: { done: sweep(j + 1), pointers: [{ id: 'i', label: 'i', index: j }], excluded: [j] },
          dsuRoles: { done: rootIds(), focus1: [ru] },
          override: { [ei]: 'reject' },
        }),
      }));
      continue;
    }

    // 按秩合并：秩小的根挂到秩大的根下
    if (ranks[ru] < ranks[rv]) {
      const t = ru;
      ru = rv;
      rv = t;
      steps.push(step({
        event: 'union', lineId: 'rank',
        note: `rank[${g.nodes[ru].id}] = ${ranks[ru]} > rank[${g.nodes[rv].id}] = ${ranks[rv]}：让矮的那棵树挂到高的下面，树高不会变。这正是"按秩合并"要的效果——不做这一步，并查集可能退化成一条链。`,
        vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, 挂载: `${g.nodes[rv].id} → ${g.nodes[ru].id}`, 秩: `${ranks[ru]}/${ranks[rv]}` },
        layers: layers({
          roles: { focus1: [g.nodes[ru].id], focus2: [g.nodes[rv].id] },
          edgeRoles: { done: sweep(j), pointers: [{ id: 'i', label: 'i', index: j }] },
          dsuRoles: { done: rootIds(), focus1: [ru], focus2: [rv], pointers: [{ id: 'ru', label: 'ru', index: ru }, { id: 'rv', label: 'rv', index: rv }] },
        }),
      }));
    }

    const sameRank = ranks[ru] === ranks[rv];
    parents[rv] = ru;
    accepted.push({ ...e, ei });
    acceptSet.add(ei);
    sum += e.w;

    steps.push(step({
      event: 'union', lineId: 'union',
      note: `parent[${g.nodes[rv].id}] ← ${g.nodes[ru].id}：两个集合并成一个，森林少一棵树。${sameRank ? '两者秩相同，等高合并会让新树高 +1。' : '秩不同，新树高取较大者，不变。'}`,
      vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, 并集: `${g.nodes[rv].id} → ${g.nodes[ru].id}`, 已收边: accepted.length, weight: sum },
      layers: layers({
        roles: { focus1: [g.nodes[ru].id], focus2: [g.nodes[rv].id] },
        edgeRoles: { done: sweep(j), pointers: [{ id: 'i', label: 'i', index: j }] },
        dsuRoles: { done: rootIds(), focus1: [ru], pointers: [{ id: 'ru', label: 'ru', index: ru }] },
        override: { [ei]: 'tree' },
      }),
    }));

    if (sameRank) {
      ranks[ru] += 1;
      steps.push(step({
        event: 'union', lineId: 'bump',
        note: `两棵树原本等高（都是 ${ranks[ru] - 1}），合并后新树的秩变成 ${ranks[ru]}。秩只在"等高的两棵合并"时增加，所以它永远等于树高的上界。`,
        vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, 秩增加: `${g.nodes[ru].id}: ${ranks[ru] - 1} → ${ranks[ru]}`, 已收边: accepted.length, weight: sum },
        layers: layers({
          roles: { focus1: [g.nodes[ru].id] },
          edgeRoles: { done: sweep(j), pointers: [{ id: 'i', label: 'i', index: j }] },
          dsuRoles: { done: rootIds(), focus1: [ru] },
        }),
      }));
    }

    steps.push(step({
      event: 'union', lineId: 'accept',
      note: `边 ${e.from}-${e.to}（w=${e.w}）进 T，这已经是第 ${accepted.length} 条树边，累计权重 ${sum}。再收 ${Math.max(0, n - 1 - accepted.length)} 条就可以停手了——后面再轻的边也只会成环。`,
      vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, 已收边: accepted.length, weight: sum, 树边: accepted.map((x) => `${x.from}-${x.to}`).join('、') },
      layers: layers({
        roles: { done: accepted.flatMap((x) => [x.from, x.to]) },
        edgeRoles: { done: sweep(j + 1), pointers: [{ id: 'i', label: 'i', index: j }] },
        dsuRoles: { done: rootIds() },
      }),
    }));
  }

  const comps = rootIds().length;
  if (accepted.length < n - 1) {
    steps.push(step({
      event: 'forest', lineId: 'forest',
      note: `边扫完了只收到 ${accepted.length} 条，而 n-1 = ${n - 1}：说明图不连通。并查集最后还剩 ${comps} 个根，每个根就是一个连通分量，所以结果是**最小生成森林**而不是一棵树。`,
      vars: { n, edges: m, 已收边: accepted.length, weight: sum, 分量数: comps, 森林: '是' },
      layers: layers({
        roles: { done: accepted.flatMap((x) => [x.from, x.to]) },
        edgeRoles: { done: ascOrder.map((_, x) => x) },
        dsuRoles: { done: rootIds() },
      }),
    }));
  }

  const result = {
    edges: canonical(accepted),
    rejected: canonical(rejectedE),
    weight: sum,
    forest: comps > 1,
    components: comps,
    edgeCount: accepted.length,
  };
  steps.push(step({
    event: 'done', lineId: 'ret', done: true, result,
    note: `Kruskal 结束：${result.edgeCount} 条树边、累计权重 ${sum}，共 ${comps} 个连通分量${result.forest ? '（所以是最小生成森林）' : ''}。被拒绝的边 ${result.rejected.length} 条${result.rejected.length ? `：${result.rejected.map((p) => p.join('-')).join('、')}` : ''}——它们都是成环的边。`,
    vars: { n, edges: m, 已收边: result.edgeCount, weight: sum, 分量数: comps, 树边: accepted.map((x) => `${x.from}-${x.to}`).join('、') || '（无）' },
    layers: layers({
      roles: { done: accepted.flatMap((x) => [x.from, x.to]) },
      edgeRoles: { done: ascOrder.map((_, x) => x) },
      dsuRoles: { done: rootIds() },
    }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'kruskal-rank-v1', lines: L, steps, result });
}

/* ------------------------------------------------------------------ 变体 2（排序 + 路径压缩） */

function runV2(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const m = g.edges.length;
  const idx = indexOf(g);
  const L = LINES.v2;

  const ascOrder = g.edges.map((_, ei) => ei).sort((a, b) => (g.edges[a].w - g.edges[b].w) || (a - b));

  const parents = new Array(n).fill(0).map((_, i) => i);
  const accepted = [];
  const rejectedE = [];
  const acceptSet = new Set();
  const rejectSet = new Set();
  let sum = 0;
  let compressions = 0;
  const steps = [];

  const rootIds = () => {
    const out = [];
    for (let i = 0; i < n; i++) if (parents[i] === i) out.push(i);
    return out;
  };
  const edgeStates = (override = {}) => {
    const st = g.edges.map(() => 'idle');
    for (const ei of acceptSet) st[ei] = 'tree';
    for (const ei of rejectSet) st[ei] = 'reject';
    for (const k of Object.keys(override)) st[Number(k)] = override[k];
    return st;
  };
  const edgePanel = (o = {}) => arrayLayer({
    id: 'edges',
    title: o.title || '边按权升序（值 = w）',
    name: 'Edge e[m]',
    values: ascOrder.map((ei) => g.edges[ei].w),
    labels: ascOrder.map((ei) => `${g.edges[ei].from}-${g.edges[ei].to}`),
    roles: o.roles || {},
  });
  const dsuPanel = (o = {}) => arrayLayer({
    id: 'dsu',
    title: 'parent[]（值 = 父结点；路径压缩后一律直指根）',
    name: 'int parent[n]',
    values: parents.map((p) => g.nodes[p].label),
    labels: g.nodes.map((nd) => nd.label),
    roles: o.roles || {},
  });
  const sweep = (j) => Array.from({ length: j }, (_, x) => x);
  const layers = (o = {}) => [
    graphPanel(g, {
      title: o.title || `图（${g.directed ? '有向' : '无向'} · 并查集在顶点上）`,
      name: 'Edge e[m] + DSU',
      roles: o.roles || {},
      edgeStates: edgeStates(o.override || {}),
      subOf: (i) => (parents[i] === i ? '根' : `→${g.nodes[parents[i]].label}`),
      badgeOf: (i) => (acceptSet.size > 0 && parents[i] === i ? '根' : undefined),
    }),
    edgePanel({ roles: o.edgeRoles || {} }),
    dsuPanel({ roles: o.dsuRoles || {} }),
  ];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '图为空：并查集是空的。'
      : `共 ${n} 个顶点、${m} 条边，需要 n-1 = ${Math.max(0, n - 1)} 条。这个变体和 v1 的差别全在 find：它**不维护 rank**，改成把沿途父指针直接改指到根（路径压缩），把"下次再走这条路"的代价提前付掉。`,
    vars: { n, edges: m, 已收边: 0, weight: 0, 压缩次数: 0 },
    layers: layers({ dsuRoles: { done: rootIds() } }),
  }));

  if (n === 0 || m === 0) {
    const comps = n === 0 ? 0 : n;
    const result = { edges: [], rejected: [], weight: 0, forest: comps > 1, components: comps, edgeCount: 0 };
    if (n > 1) {
      steps.push(step({
        event: 'forest', lineId: 'forest',
        note: `一条边都没有：${n} 个顶点各自成树 → ${comps} 个分量的最小生成森林。`,
        vars: { n, edges: m, 已收边: 0, weight: 0, 分量数: comps },
        layers: layers({}),
      }));
    }
    steps.push(step({
      event: 'done', lineId: 'ret', done: true, result,
      note: n === 0 ? '空图：直接结束。' : `Kruskal 结束：0 条树边，${comps} 个分量。`,
      vars: { n, edges: m, 已收边: 0, weight: 0, 分量数: comps },
      layers: layers({}),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'kruskal-compress-v1', lines: L, steps, result });
  }

  steps.push(step({
    event: 'sort', lineId: 'sort',
    note: `按权升序排好：${ascOrder.map((ei) => `${g.edges[ei].from}-${g.edges[ei].to}(${g.edges[ei].w})`).join(' ≤ ')}。排序和 v1 完全一样，真正的分野从下一条边的 find 开始。`,
    vars: { n, edges: m, 排序后: ascOrder.map((ei) => g.edges[ei].w).join('、'), 已收边: 0, weight: 0 },
    layers: layers({ edgeRoles: { pointers: [{ id: 'i', label: 'i', index: 0 }] }, dsuRoles: { done: rootIds() } }),
  }));

  const findPath = (x) => {
    const path = [];
    let r = x;
    let guard = 0;
    while (parents[r] !== r && guard++ <= n + 4) {
      path.push(r);
      r = parents[r];
    }
    return { root: r, path };
  };

  for (let j = 0; j < ascOrder.length && accepted.length < n - 1; j++) {
    const ei = ascOrder[j];
    const e = g.edges[ei];
    const u = idx.get(e.from);
    const v = idx.get(e.to);

    steps.push(step({
      event: 'probe-edge', lineId: 'probe',
      note: `考察 ${e.from}-${e.to}（w=${e.w}），它是剩下没处理的最轻边。接下来要分别从 ${e.from} 和 ${e.to} 往上爬到根，并把沿途顶点记下来——记下来就是为了压缩。`,
      vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, w: e.w, 已收边: accepted.length, weight: sum, 压缩次数: compressions },
      layers: layers({
        roles: { focus1: [e.from], focus2: [e.to] },
        edgeRoles: { done: sweep(j), pointers: [{ id: 'i', label: 'i', index: j }], focus1: [j] },
        dsuRoles: { done: rootIds() },
        override: { [ei]: 'active' },
      }),
    }));

    const pu = findPath(u);
    const pv = findPath(v);
    const ru = pu.root;
    const rv = pv.root;
    const ruId = g.nodes[ru].id;
    const rvId = g.nodes[rv].id;
    const pathIds = (p) => p.map((x) => g.nodes[x].id);
    const puText = pu.path.length ? `${pathIds(pu.path).join(' → ')} → ${ruId}` : `${e.from} 本身就是根`;
    const pvText = pv.path.length ? `${pathIds(pv.path).join(' → ')} → ${rvId}` : `${e.to} 本身就是根`;

    steps.push(step({
      event: 'probe-edge', lineId: 'walk',
      note: `爬到根：${puText}；${pvText}。沿途点已经记进 pu / pv（${pu.path.length + pv.path.length} 个）。不做压缩的话，下次再查同一个点还得重爬一遍，链越长越亏。`,
      vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, ru: ruId, rv: rvId, 路径长度: `${pu.path.length}/${pv.path.length}` },
      layers: layers({
        roles: { focus1: [ruId], focus2: [rvId] },
        edgeRoles: { done: sweep(j), pointers: [{ id: 'i', label: 'i', index: j }] },
        dsuRoles: {
          done: rootIds(),
          focus1: [ru],
          focus2: [rv],
          pointers: [
            { id: 'ru', label: 'ru', index: ru },
            { id: 'rv', label: 'rv', index: rv },
            ...(v !== rv ? [{ id: 'pv', label: 'pv', index: v }] : []),
            ...(u !== ru ? [{ id: 'pu', label: 'pu', index: u }] : []),
          ],
        },
        override: { [ei]: 'active' },
      }),
    }));

    // 路径压缩：把 pu / pv 上的点直接挂到各自的根
    const changed = [];
    for (const x of pu.path) if (parents[x] !== ru) changed.push([x, parents[x], ru]);
    for (const x of pv.path) if (parents[x] !== rv) changed.push([x, parents[x], rv]);
    if (changed.length) {
      for (const x of pu.path) parents[x] = ru;
      for (const x of pv.path) parents[x] = rv;
      compressions += changed.length;
      steps.push(step({
        event: 'probe-edge', lineId: 'compress',
        note: `路径压缩：${changed.map(([x, was, now]) => `${g.nodes[x].id} 的父从 ${g.nodes[was].id} 改成 ${g.nodes[now].id}`).join('；')}。父指针一旦直指根，下次 find 这些点只要 1 步。v1 完全不改父指针，所以它的 find 会一直走下去——这是两个变体最本质的差别。`,
        vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, 改写: changed.length, 压缩次数: compressions, 根: `${ruId}/${rvId}` },
        layers: layers({
          roles: { focus1: [ruId], focus2: [rvId] },
          edgeRoles: { done: sweep(j), pointers: [{ id: 'i', label: 'i', index: j }] },
          dsuRoles: { done: rootIds(), focus1: [ru], focus2: [rv], pointers: [{ id: 'ru', label: 'ru', index: ru }, { id: 'rv', label: 'rv', index: rv }] },
        }),
      }));
    }

    if (ru === rv) {
      rejectedE.push(e);
      rejectSet.add(ei);
      steps.push(step({
        event: 'reject', lineId: 'same',
        note: `压缩完再看：两个端点都归到根 ${ruId}，本来就在同一个集合里 → 加这条边就成环，丢弃。注意压缩已经发生了——即使这条边被拒，find 一路上的父指针也已经被改好，这是"顺便"赚到的。`,
        vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, 拒绝原因: '两端同根', 已收边: accepted.length, weight: sum, 压缩次数: compressions },
        layers: layers({
          roles: { focus1: [e.from], focus2: [e.to] },
          edgeRoles: { done: sweep(j + 1), pointers: [{ id: 'i', label: 'i', index: j }], excluded: [j] },
          dsuRoles: { done: rootIds(), focus1: [ru] },
          override: { [ei]: 'reject' },
        }),
      }));
      continue;
    }

    parents[ru] = rv;
    accepted.push({ ...e, ei });
    acceptSet.add(ei);
    sum += e.w;

    steps.push(step({
      event: 'union', lineId: 'union',
      note: `parent[${ruId}] ← ${rvId}：不用秩，直接把 ru 整棵树挂到 rv 下面。单看这一步挺"野蛮"（可能造出长链），但每棵树内部都已经被压缩成一层星星，所以链长实际长得极慢——这就是用压缩换掉 rank 的取舍。`,
      vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, 并集: `${ruId} → ${rvId}`, 已收边: accepted.length, weight: sum, 压缩次数: compressions },
      layers: layers({
        roles: { focus1: [ruId], focus2: [rvId] },
        edgeRoles: { done: sweep(j), pointers: [{ id: 'i', label: 'i', index: j }] },
        dsuRoles: { done: rootIds(), focus1: [rv], pointers: [{ id: 'rv', label: 'rv', index: rv }] },
        override: { [ei]: 'tree' },
      }),
    }));

    steps.push(step({
      event: 'union', lineId: 'accept',
      note: `边 ${e.from}-${e.to}（w=${e.w}）进 T：第 ${accepted.length} 条树边，累计权重 ${sum}。还差 ${Math.max(0, n - 1 - accepted.length)} 条。`,
      vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, 已收边: accepted.length, weight: sum, 树边: accepted.map((x) => `${x.from}-${x.to}`).join('、'), 压缩次数: compressions },
      layers: layers({
        roles: { done: accepted.flatMap((x) => [x.from, x.to]) },
        edgeRoles: { done: sweep(j + 1), pointers: [{ id: 'i', label: 'i', index: j }] },
        dsuRoles: { done: rootIds() },
      }),
    }));
  }

  const comps = rootIds().length;
  if (accepted.length < n - 1) {
    steps.push(step({
      event: 'forest', lineId: 'forest',
      note: `边扫完只收到 ${accepted.length} 条 < n-1 = ${n - 1}：图不连通。parent 里还剩 ${comps} 个自己指向自己的根，每个根就是一个连通分量 → 输出最小生成森林。`,
      vars: { n, edges: m, 已收边: accepted.length, weight: sum, 分量数: comps, 森林: '是' },
      layers: layers({
        roles: { done: accepted.flatMap((x) => [x.from, x.to]) },
        edgeRoles: { done: ascOrder.map((_, x) => x) },
        dsuRoles: { done: rootIds() },
      }),
    }));
  }

  const result = {
    edges: canonical(accepted),
    rejected: canonical(rejectedE),
    weight: sum,
    forest: comps > 1,
    components: comps,
    edgeCount: accepted.length,
  };
  steps.push(step({
    event: 'done', lineId: 'ret', done: true, result,
    note: `Kruskal 结束：${result.edgeCount} 条树边、累计权重 ${sum}，${comps} 个分量。整场一共改写了 ${compressions} 次父指针（v1 是 0 次）——路径压缩的收益随 find 次数摊还，单次看不出来，多次之后就明显了。`,
    vars: { n, edges: m, 已收边: result.edgeCount, weight: sum, 分量数: comps, 压缩次数: compressions, 树边: accepted.map((x) => `${x.from}-${x.to}`).join('、') || '（无）' },
    layers: layers({
      roles: { done: accepted.flatMap((x) => [x.from, x.to]) },
      edgeRoles: { done: ascOrder.map((_, x) => x) },
      dsuRoles: { done: rootIds() },
    }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'kruskal-compress-v1', lines: L, steps, result, meta: { compressions } });
}

/* ------------------------------------------------------------------ 变体 3（逆向删除法） */

function runV3(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const m = g.edges.length;
  const idx = indexOf(g);
  const L = LINES.v3;

  const descOrder = g.edges.map((_, ei) => ei).sort((a, b) => (g.edges[b].w - g.edges[a].w) || (a - b));
  const ends = g.edges.map((e) => [idx.get(e.from), idx.get(e.to)]);
  const adj = undirectedAdj(g, idx);

  const removed = new Array(m).fill(false);
  const steps = [];
  let checks = 0;

  const base = countComponents(n, ends, removed);
  const keptList = () => g.edges.map((e, ei) => ({ ...e, ei })).filter((x) => !removed[x.ei]);
  const dropList = () => g.edges.map((e, ei) => ({ ...e, ei })).filter((x) => removed[x.ei]);
  const degOf = (i) => {
    let d = 0;
    g.edges.forEach((e, ei) => {
      if (removed[ei]) return;
      if (ends[ei][0] === i || ends[ei][1] === i) d++;
    });
    return d;
  };
  const edgeStates = (override = {}) => {
    const st = g.edges.map(() => 'idle');
    g.edges.forEach((e, ei) => {
      if (removed[ei]) st[ei] = 'reject';
    });
    for (const k of Object.keys(override)) st[Number(k)] = override[k];
    return st;
  };
  const edgePanel = (o = {}) => arrayLayer({
    id: 'edges',
    title: o.title || '边按权降序（值 = w，划掉的是已删）',
    name: 'Edge e[m]',
    values: descOrder.map((ei) => g.edges[ei].w),
    labels: descOrder.map((ei) => `${g.edges[ei].from}-${g.edges[ei].to}`),
    roles: o.roles || {},
  });
  const sweep = (j) => Array.from({ length: j }, (_, x) => x);
  const removedDisplay = () => descOrder.map((ei, j) => (removed[ei] ? j : -1)).filter((j) => j >= 0);
  const layers = (o = {}) => [
    graphPanel(g, {
      title: o.title || `图（${g.directed ? '有向' : '无向'} · 边可以删）`,
      name: 'EdgeSet + removed[]',
      roles: o.roles || {},
      edgeStates: edgeStates(o.override || {}),
      subOf: (i) => `度${degOf(i)}`,
      badgeOf: (i) => undefined,
    }),
    edgePanel({ roles: o.edgeRoles || {} }),
  ];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '图为空：没有边可删。'
      : `共 ${n} 个顶点、${m} 条边。逆向删除法的出发点和前两个变体相反：先把**所有边**都当成"在用"（这时连通分量数 = ${base}），再一条条试着删。删完分量数不变，说明这条边多余；分量数变多，说明它是桥，必须留。`,
    vars: { n, edges: m, 在用边: m, 分量数: base, 已删: 0, 判定次数: 0 },
    layers: layers({ edgeRoles: {} }),
  }));

  if (n === 0 || m === 0) {
    const comps = n === 0 ? 0 : n;
    const result = { edges: [], rejected: [], weight: 0, forest: comps > 1, components: comps, edgeCount: 0 };
    if (n > 1) {
      steps.push(step({
        event: 'forest', lineId: 'forest',
        note: `一条边都没有：${n} 个孤立点，${comps} 个分量 → 最小生成森林（森林里只有单点树）。`,
        vars: { n, edges: m, 在用边: 0, 分量数: comps, 判定次数: 0 },
        layers: layers({}),
      }));
    }
    steps.push(step({
      event: 'done', lineId: 'ret', done: true, result,
      note: n === 0 ? '空图：直接结束。' : `结束：0 条边，${comps} 个分量。`,
      vars: { n, edges: m, 在用边: 0, 分量数: comps, 判定次数: 0 },
      layers: layers({}),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'kruskal-reverse-delete-v1', lines: L, steps, result });
  }

  steps.push(step({
    event: 'sort', lineId: 'sort',
    note: `按权**降序**排好：${descOrder.map((ei) => `${g.edges[ei].from}-${g.edges[ei].to}(${g.edges[ei].w})`).join(' ≥ ')}。先试最重的边——重的边最可能是多余的（圈里最贵的那条），先删它能尽早减轻后面连通性判定的负担。`,
    vars: { n, edges: m, 在用边: m, 降序: descOrder.map((ei) => g.edges[ei].w).join('、'), 已删: 0, 判定次数: 0 },
    layers: layers({ edgeRoles: { pointers: [{ id: 'i', label: 'i', index: 0 }] } }),
  }));

  for (let j = 0; j < descOrder.length; j++) {
    const ei = descOrder[j];
    const e = g.edges[ei];

    steps.push(step({
      event: 'probe-edge', lineId: 'probe',
      note: `第 ${j + 1} 条 ${e.from}-${e.to}（w=${e.w}）：先假设把它删掉，然后数一遍连通分量。删之前是 ${base} 个。`,
      vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, w: e.w, 在用边: m - removed.filter(Boolean).length, 分量数: base, 判定次数: checks },
      layers: layers({
        roles: { focus1: [e.from], focus2: [e.to] },
        edgeRoles: { done: sweep(j), pointers: [{ id: 'i', label: 'i', index: j }], focus1: [j], excluded: removedDisplay() },
        override: { [ei]: 'active' },
      }),
    }));

    removed[ei] = true;
    checks++;
    const after = countComponents(n, ends, removed);
    const startIdx = ends[ei][0];
    const seen = reachableFrom(n, adj, startIdx, removed);
    const lost = g.nodes.filter((_, i) => !seen[i]).map((nd) => nd.id);
    const broke = after > base;

    steps.push(step({
      event: 'probe-edge', lineId: 'check',
      note: `假删 ${e.from}-${e.to} 之后重新数分量：${after} 个（原来 ${base} 个）。从 ${g.nodes[startIdx].id} 出发现在只能到 { ${g.nodes.filter((_, i) => seen[i]).map((nd) => nd.id).join('、')} }${broke ? `，${lost.join('、')} 掉队了 → 这条边是桥` : '，其余顶点照样走得到 → 这条边不多不少正好多余'}。一次判定就是一次 O(V+E) 的遍历，m 条边就要判 m 次。`,
      vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, 假删后分量数: after, 掉队: lost.join('、') || '—', 判定次数: checks },
      layers: layers({
        roles: { focus1: [g.nodes[startIdx].id], focus2: [g.nodes[ends[ei][1]].id] },
        edgeRoles: { done: sweep(j), pointers: [{ id: 'i', label: 'i', index: j }], excluded: removedDisplay() },
        override: { [ei]: broke ? 'reject' : 'path' },
      }),
    }));

    if (broke) {
      removed[ei] = false;
      steps.push(step({
        event: 'union', lineId: 'undo',
        note: `分量数从 ${base} 涨到 ${after}：删掉 ${e.from}-${e.to} 会把图切断。这条边是桥，必须留在生成森林里——于是撤销删除，把它算进结果，总权重 +${e.w}。`,
        vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, 处理: '保留（是桥）', 在用边: m - removed.filter(Boolean).length, 已删: removed.filter(Boolean).length, 判定次数: checks },
        layers: layers({
          roles: { focus1: [e.from], focus2: [e.to] },
          edgeRoles: { done: sweep(j + 1), pointers: [{ id: 'i', label: 'i', index: j }], excluded: removedDisplay() },
          override: { [ei]: 'tree' },
        }),
      }));
    } else {
      steps.push(step({
        event: 'reject', lineId: 'del-ok',
        note: `分量数还是 ${base}：删掉 ${e.from}-${e.to} 之后图照样连通，说明它是圈里最贵的那条 → 真删，拒绝它进生成树总权重。删边是在做减法，这跟前两个变体"一条条加边"的画法完全相反。`,
        vars: { n, edges: m, 当前边: `${e.from}-${e.to}`, 处理: '真删（多余）', 在用边: m - removed.filter(Boolean).length, 已删: removed.filter(Boolean).length, 判定次数: checks },
        layers: layers({
          roles: { focus1: [e.from], focus2: [e.to] },
          edgeRoles: { done: sweep(j + 1), pointers: [{ id: 'i', label: 'i', index: j }], excluded: removedDisplay() },
          override: { [ei]: 'reject' },
        }),
      }));
    }
  }

  const comps = countComponents(n, ends, removed);
  const kept = keptList();
  const dropped = dropList();
  const sum = kept.reduce((acc, e) => acc + e.w, 0);

  if (comps > 1) {
    steps.push(step({
      event: 'forest', lineId: 'forest',
      note: `删完之后数分量：${comps} 个（原图就是 ${base} 个）。剩下的边一条也删不掉了，但它们连不成一棵树 —— 原图本身不连通，所以结果是**最小生成森林**。`,
      vars: { n, edges: m, 在用边: kept.length, 分量数: comps, 已删: dropped.length, 判定次数: checks, 森林: '是' },
      layers: layers({
        roles: { done: kept.flatMap((e) => [e.from, e.to]) },
        edgeRoles: { done: descOrder.map((_, x) => x), excluded: removedDisplay() },
      }),
    }));
  }

  const result = {
    edges: canonical(kept),
    rejected: canonical(dropped),
    weight: sum,
    forest: comps > 1,
    components: comps,
    edgeCount: kept.length,
  };
  steps.push(step({
    event: 'done', lineId: 'ret', done: true, result,
    note: `逆向删除法结束：${m} 条边里删掉 ${dropped.length} 条${dropped.length ? `（${dropped.map((e) => `${e.from}-${e.to}`).join('、')}）` : ''}，留下 ${kept.length} 条、累计权重 ${sum}，${comps} 个分量。它和前两个变体给出同一棵生成树，但路径完全不同：这里是"从全集往回删"，共做了 ${checks} 次连通性判定。`,
    vars: { n, edges: m, 在用边: kept.length, 已删: dropped.length, 分量数: comps, weight: sum, 判定次数: checks, 保留: kept.map((e) => `${e.from}-${e.to}`).join('、') || '（无）' },
    layers: layers({
      roles: { done: kept.flatMap((e) => [e.from, e.to]) },
      edgeRoles: { done: descOrder.map((_, x) => x), excluded: removedDisplay() },
    }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'kruskal-reverse-delete-v1', lines: L, steps, result, meta: { checks } });
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
