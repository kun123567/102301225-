/**
 * B · BFS（3 个代表性不同实现）
 *
 * 三个变体是三条真实的技术路线，不是改名换汤：
 *   v1 队列 + 邻接表：教材写法。起点入队**即**标记，出队后沿邻接表找未访问邻点，标记后入队；
 *   v2 按层双队列：cur / next 两个队列交替，"层"是显式数据结构，因此能直接输出每层节点集合；
 *   v3 邻接矩阵版：不建邻接表，出队后扫**整行**矩阵（每行 O(V)，总代价 O(V²)，靠 scanned 计数对照）。
 *
 * 契约（docs/04-轨迹契约.md）：每步完整快照、lineId 命中本变体 sourceLines、末步 done=true 且带 result。
 * 事件只用目录词表里的 init/enqueue/dequeue/discover/visit/layer/done。
 */

import { trace, step, graphLayer, stackLayer, treeLayer, arrayLayer, linkLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'b/bfs',
  variants: [
    { id: 'v1', name: '队列 + 邻接表' },
    { id: 'v2', name: '按层双队列' },
    { id: 'v3', name: '邻接矩阵版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void bfs(ALGraph *g, int s) {' },
    { lineId: 'init', text: '  for (v = 0; v < g->n; ++v) visited[v] = FALSE;' },
    { lineId: 'enq-start', text: '  visited[s] = TRUE;  EnQueue(&Q, s);      /* 入队即标记，不留重复入队 */' },
    { lineId: 'while-q', text: '  while (!QueueEmpty(&Q)) {' },
    { lineId: 'deq', text: '    u = DeQueue(&Q);  Visit(u);' },
    { lineId: 'level', text: '    /* dist[w] = dist[u] + 1：dist 变大就进入下一层 */' },
    { lineId: 'for', text: '    for (p = g->vex[u].firstarc; p; p = p->next) {' },
    { lineId: 'adj', text: '      w = p->adjvex;' },
    { lineId: 'check', text: '      if (!visited[w]) {                  /* 没访问过才算新树边 */' },
    { lineId: 'mark', text: '        visited[w] = TRUE;  dist[w] = dist[u] + 1;' },
    { lineId: 'enq', text: '        EnQueue(&Q, w);' },
    { lineId: 'end-if', text: '      }' },
    { lineId: 'end-for', text: '    }' },
    { lineId: 'end-while', text: '  }' },
    { lineId: 'ret', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void bfs_layer(ALGraph *g, int s) {' },
    { lineId: 'init', text: '  InitQueue(&cur);  InitQueue(&next);  int d = 0;' },
    { lineId: 'mark-start', text: '  visited[s] = TRUE;  EnQueue(&cur, s);     /* 起点先标记再入 cur */' },
    { lineId: 'while-cur', text: '  while (!QueueEmpty(&cur)) {            /* 一层一轮，不混层 */' },
    { lineId: 'clear', text: '    level[d] = EMPTY;                     /* 清空本层集合 */' },
    { lineId: 'while-inner', text: '    while (!QueueEmpty(&cur)) {' },
    { lineId: 'deq', text: '      u = DeQueue(&cur);  Visit(u);  LevelPush(&level[d], u);' },
    { lineId: 'for', text: '      for (p = g->vex[u].firstarc; p; p = p->next) {' },
    { lineId: 'adj', text: '        w = p->adjvex;' },
    { lineId: 'check', text: '        if (!visited[w]) {                /* 新发现的点一律进 next */' },
    { lineId: 'mark-next', text: '          visited[w] = TRUE;  dist[w] = d + 1;' },
    { lineId: 'enq-next', text: '          EnQueue(&next, w);' },
    { lineId: 'end-if', text: '        }' },
    { lineId: 'end-for', text: '      }' },
    { lineId: 'out-layer', text: '    }  OutputLayer(d, level[d]);' },
    { lineId: 'swap', text: '    Swap(&cur, &next);  ++d;               /* 两队列交替，层号自增 */' },
    { lineId: 'ret', text: '  }' },
  ],
  v3: [
    { lineId: 'fn', text: 'void bfs_matrix(MGraph *g, int s) {' },
    { lineId: 'init', text: '  for (v = 0; v < g->n; ++v) visited[v] = FALSE;' },
    { lineId: 'enq-start', text: '  visited[s] = TRUE;  EnQueue(&Q, s);     /* 入队即标记 */' },
    { lineId: 'while-q', text: '  while (!QueueEmpty(&Q)) {' },
    { lineId: 'deq', text: '    u = DeQueue(&Q);  Visit(u);' },
    { lineId: 'scan', text: '    for (j = 0; j < g->n; ++j) {           /* 不建邻接表：整行扫 O(V) */' },
    { lineId: 'skip-zero', text: '      if (g->m[u][j] == 0) continue;       /* 矩阵里的 0 = 没有这条边 */' },
    { lineId: 'skip-seen', text: '      if (visited[j]) continue;            /* 已发现过的列跳过 */' },
    { lineId: 'mark-j', text: '      visited[j] = TRUE;  dist[j] = dist[u] + 1;' },
    { lineId: 'enq-j', text: '      EnQueue(&Q, j);' },
    { lineId: 'end-for', text: '    }' },
    { lineId: 'end-while', text: '  }' },
    { lineId: 'ret', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

const NODES = (ids) => ids.map((id) => ({ id, label: id }));
const EDGES = (pairs) => pairs.map(([from, to]) => ({ from, to }));
const TRIANGLE = {
  directed: false,
  nodes: NODES(['A', 'B', 'C']),
  edges: EDGES([['A', 'B'], ['B', 'C'], ['C', 'A']]),
};
const WITH_ISOLATED = {
  directed: false,
  nodes: NODES(['A', 'B', 'C', 'D']),
  edges: EDGES([['A', 'B'], ['B', 'C'], ['C', 'A']]),   // D 完全孤立
};
const SINGLE = { directed: false, nodes: NODES(['A']), edges: [] };
const EMPTY = { directed: false, nodes: [], edges: [] };

export const samples = [
  {
    id: 'normal',
    label: '三角形 A-B-C-A，从 A 出发（期望 A,B,C）',
    input: { graph: TRIANGLE, start: 'A' },
    expect: { order: ['A', 'B', 'C'], visitedCount: 3 },
    expectByVariant: {
      v2: { order: ['A', 'B', 'C'], visitedCount: 3, levels: [['A'], ['B', 'C']] },
    },
  },
  {
    id: 'edge-isolated',
    label: '三角形 + 孤立点 D（期望 D 不在结果里）',
    input: { graph: WITH_ISOLATED, start: 'A' },
    expect: { order: ['A', 'B', 'C'], visitedCount: 3, unreached: ['D'] },
    expectByVariant: {
      v2: { order: ['A', 'B', 'C'], visitedCount: 3, levels: [['A'], ['B', 'C']], unreached: ['D'] },
    },
  },
  {
    id: 'edge-single',
    label: '单点图（只有 A，无边）',
    input: { graph: SINGLE, start: 'A' },
    expect: { order: ['A'], visitedCount: 1 },
    expectByVariant: {
      v2: { order: ['A'], visitedCount: 1, levels: [['A']] },
    },
  },
  {
    id: 'edge-empty',
    label: '空图（0 个顶点，直接结束）',
    input: { graph: EMPTY, start: 'A' },
    expect: { order: [], visitedCount: 0 },
    expectByVariant: {
      v2: { order: [], visitedCount: 0, levels: [] },
    },
  },
];

/* ------------------------------------------------------------------ 输入归一 */

const str = (v) => String(v);

function normalizeGraph(input) {
  const raw = (input && input.graph) || {};
  const rawNodes = raw.nodes || [];
  // 重复的 label 加 a/b 后缀（不能靠颜色区分两个"同名"顶点）
  const shown = labelsOf(rawNodes.map((nd) => str(nd.label ?? nd.id)));
  const nodes = rawNodes.map((nd, i) => ({ id: str(nd.id), label: shown[i] }));
  const known = new Set(nodes.map((nd) => nd.id));
  const edges = [];
  for (const e of raw.edges || []) {
    const from = str(e.from);
    const to = str(e.to);
    if (!known.has(from) || !known.has(to)) continue;   // 指向不存在顶点的边直接忽略
    if (from === to) continue;                          // 自环对 BFS 无意义
    edges.push({ from, to, w: e.w });
  }
  return { directed: !!raw.directed, nodes, edges };
}

function indexOf(g) {
  const m = new Map();
  g.nodes.forEach((nd, i) => m.set(nd.id, i));
  return m;
}

/** 邻接表：按顶点下标排序，便于和 v3 的矩阵行扫描逐列对照 */
function adjacencyOf(g) {
  const idx = indexOf(g);
  const adj = g.nodes.map(() => []);
  for (const e of g.edges) {
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    adj[a].push(b);
    if (!g.directed) adj[b].push(a);
  }
  adj.forEach((list) => list.sort((x, y) => x - y));
  return adj;
}

function matrixOf(g) {
  const idx = indexOf(g);
  const n = g.nodes.length;
  const M = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const e of g.edges) {
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    M[a][b] = 1;
    if (!g.directed) M[b][a] = 1;
  }
  return M;
}

function startOf(input, g) {
  const idx = indexOf(g);
  const wanted = input && input.start != null ? str(input.start) : (g.nodes[0] ? g.nodes[0].id : null);
  const at = wanted != null && idx.has(wanted) ? idx.get(wanted) : -1;
  return { startId: wanted, startIdx: at };
}

function setEdge(states, g, a, b, st) {
  for (let i = 0; i < g.edges.length; i++) {
    const e = g.edges[i];
    if ((e.from === a && e.to === b) || (!g.directed && e.from === b && e.to === a)) {
      states[i] = st;
      return;
    }
  }
}

/* ------------------------------------------------------------------ 图层构造 */

function graphPanel(g, o = {}) {
  return graphLayer({
    id: 'graph',
    title: o.title || '图',
    name: o.name || '',
    layout: 'circle',
    directed: g.directed,
    weighted: g.edges.some((e) => e.w != null),
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

function queuePanel(o) {
  const items = o.items || [];
  const nodes = items.map((it) => ({ id: it.key, value: it.label, label: it.label, badge: it.badge }));
  const links = items.slice(0, -1).map((it, i) => ({ from: it.key, to: items[i + 1].key }));
  const pointers = [];
  if (items.length) {
    pointers.push({ id: `${o.id}-front`, label: 'front', node: items[0].key });
    if (items.length > 1) pointers.push({ id: `${o.id}-rear`, label: 'rear', node: items[items.length - 1].key });
  }
  return linkLayer({
    id: o.id,
    title: o.title,
    name: o.name || '',
    nodes,
    links,
    head: items.length ? items[0].key : null,
    order: items.map((it) => it.key),
    roles: { ...(o.roles || {}), pointers },
  });
}

const qText = (items, g) => (items.length ? items.map((it) => g.nodes[it.idx].id).join(' → ') : '（空）');

/* ------------------------------------------------------------------ 变体 1（队列 + 邻接表） */

function runV1(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const adj = adjacencyOf(g);
  const { startId, startIdx } = startOf(input, g);
  const L = LINES.v1;

  const states = g.edges.map(() => 'idle');
  const visited = new Array(n).fill(false);
  const dist = new Array(n).fill(-1);
  const badge = new Array(n).fill(null);
  const order = [];
  const queue = [];
  const steps = [];
  let seq = 0;
  let checks = 0;
  let tail = '';

  const queuedIds = () => queue.map((it) => g.nodes[it.idx].id);
  const layers = (o = {}) => [
    graphPanel(g, {
      title: `图（${g.directed ? '有向' : '无向'} · 邻接表）`,
      name: 'ALGraph',
      roles: o.roles || {},
      edgeStates: states,
      subOf: (i) => (visited[i] ? `d=${dist[i]}` : '未发现'),
      badgeOf: (i) => badge[i],
    }),
    queuePanel({ id: 'queue', title: '队列 front → rear', name: 'Queue Q', items: queue, roles: o.queueRoles || {} }),
  ];
  const push = (o) => {
    steps.push(step({ ...o, note: tail ? `${o.note}${tail}` : o.note }));
    tail = '';
  };

  push({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '图为空：没有顶点，BFS 无事可做。'
      : `共 ${n} 个顶点、${g.edges.length} 条边。队列保证"先被发现者先被访问"，所以访问序列按 dist 一层层加宽。`,
    vars: { start: startId ?? '—', n, edges: g.edges.length, Q: '（空）', marked: 0, visited: 0 },
    layers: layers({ roles: startIdx >= 0 ? { focus1: [g.nodes[startIdx].id] } : {} }),
  });

  if (n === 0 || startIdx < 0) {
    const result = { order: [], visitedCount: 0, start: null, unreached: g.nodes.map((nd) => nd.id) };
    push({
      event: 'done', lineId: 'ret', done: true, result,
      note: n === 0 ? '空图：直接结束，访问序列为空。' : `起点 ${startId} 不在顶点集合里：入队都做不到，直接结束。`,
      vars: { start: startId ?? '—', n, marked: 0, visited: 0, order: '（空）' },
      layers: layers(),
    });
    return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'bfs-adjlist-v1', lines: L, steps, result, meta: { checks } });
  }

  visited[startIdx] = true;
  dist[startIdx] = 0;
  const startKey = `q${seq++}`;
  queue.push({ idx: startIdx, key: startKey, label: g.nodes[startIdx].label, badge: `#${seq}` });
  push({
    event: 'enqueue', lineId: 'enq-start',
    note: `起点 ${startId} 入队的同时就把 visited 置真。BFS 的"标记"必须发生在入队时刻，否则同一个顶点会被多个前驱重复入队，队列会膨胀。`,
    vars: { start: startId, u: '—', w: '—', Q: qText(queue, g), marked: 1, visited: 0, dist: 'd=0' },
    layers: layers({ roles: { focus1: [startId], added: [startId] }, queueRoles: { focus2: [startKey] } }),
  });

  let level = 0;
  while (queue.length) {
    const cur = queue.shift();
    const u = cur.idx;
    const uId = g.nodes[u].id;
    const nb = adj[u].map((w) => g.nodes[w].id);

    push({
      event: 'dequeue', lineId: 'deq',
      note: `队头 ${uId} 出队（dist=${dist[u]}）。排在前面的顶点 dist 更小，所以出队顺序天然"由近到远"。`,
      vars: { start: startId, u: uId, w: '—', Q: qText(queue, g), marked: visited.filter(Boolean).length, visited: order.length, dist: `d=${dist[u]}`, 邻接: nb.join('、') || '（无）' },
      layers: layers({ roles: { focus1: [uId], done: order.slice(), added: queuedIds() } }),
    });

    if (dist[u] > level) {
      level = dist[u];
      push({
        event: 'layer', lineId: 'level',
        note: `dist 由 ${level - 1} 增到 ${level}：上一层已经全部出队完毕，现在进入第 ${level} 层。层号不是额外维护的，它就是 dist。`,
        vars: { start: startId, u: uId, w: '—', Q: qText(queue, g), marked: visited.filter(Boolean).length, visited: order.length, dist: `d=${level}` },
        layers: layers({ roles: { focus1: [uId], done: order.slice(), added: queuedIds() } }),
      });
    }

    order.push(uId);
    badge[u] = `#${order.length}`;
    push({
      event: 'visit', lineId: 'deq',
      note: `访问 ${uId}，它是第 ${order.length} 个被访问的顶点。出队只是"从队列里摘下来"，访问才是写进访问序列。`,
      vars: { start: startId, u: uId, w: '—', Q: qText(queue, g), marked: visited.filter(Boolean).length, visited: order.length, order: order.join(' → '), dist: `d=${dist[u]}` },
      layers: layers({ roles: { focus1: [uId], done: order.slice(), added: queuedIds() } }),
    });

    let skipped = [];
    for (const w of adj[u]) {
      checks++;
      const wId = g.nodes[w].id;
      if (visited[w]) {
        setEdge(states, g, uId, wId, 'reject');
        skipped.push(wId);
        continue;
      }
      setEdge(states, g, uId, wId, 'active');
      push({
        event: 'discover', lineId: 'check',
        note: `邻接表里 ${wId} 还没被访问 → 这条边是新树边，${wId} 该入队了。${skipped.length ? `（更早扫到的 ${skipped.join('、')} 已被访问，那几条边标成灰色拒绝边，不产生动作。）` : ''}`,
        vars: { start: startId, u: uId, w: wId, Q: qText(queue, g), marked: visited.filter(Boolean).length, visited: order.length, dist: `d=${dist[u] + 1}`, 邻接: nb.join('、') || '（无）' },
        layers: layers({ roles: { focus1: [uId], focus2: [wId], done: order.slice(), added: queuedIds() } }),
      });
      skipped = [];
      visited[w] = true;
      dist[w] = dist[u] + 1;
      setEdge(states, g, uId, wId, 'tree');
      const key = `q${seq}`;
      queue.push({ idx: w, key, label: g.nodes[w].label, badge: `#${seq + 1}` });
      seq++;
      push({
        event: 'enqueue', lineId: 'enq',
        note: `${wId} 标记 visited 后压到队尾（dist=${dist[w]}）。它此刻只在队列里、还没被访问，所以画成蓝色"待访问"。`,
        vars: { start: startId, u: uId, w: wId, Q: qText(queue, g), marked: visited.filter(Boolean).length, visited: order.length, dist: `d=${dist[w]}` },
        layers: layers({ roles: { focus2: [wId], done: order.slice(), added: queuedIds() }, queueRoles: { focus2: [key] } }),
      });
    }
    if (skipped.length) tail = `（顺带：${uId} 的邻点 ${skipped.join('、')} 早已被访问，相关边保持灰色拒绝边。）`;
  }

  const unreached = g.nodes.filter((nd, i) => !visited[i]).map((nd) => nd.id);
  const result = { order: order.slice(), visitedCount: order.length, start: startId, unreached };
  push({
    event: 'done', lineId: 'ret', done: true, result,
    note: `队列空了，BFS 结束：${order.join(' → ')}。${unreached.length ? `${unreached.join('、')} 一次也没进过队列，所以不在结果里——BFS 只覆盖 start 所在的连通分量。` : '所有顶点都进了结果。'}`,
    vars: { start: startId, n, edges: g.edges.length, marked: visited.filter(Boolean).length, visited: order.length, order: order.join(' → '), 未到达: unreached.join('、') || '—' },
    layers: layers({ roles: { done: order.slice() } }),
  });
  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'bfs-adjlist-v1', lines: L, steps, result, meta: { checks } });
}

/* ------------------------------------------------------------------ 变体 2（按层双队列） */

function runV2(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const adj = adjacencyOf(g);
  const { startId, startIdx } = startOf(input, g);
  const L = LINES.v2;

  const states = g.edges.map(() => 'idle');
  const visited = new Array(n).fill(false);
  const dist = new Array(n).fill(-1);
  const badge = new Array(n).fill(null);
  const order = [];
  const levels = [];
  const steps = [];
  let cur = [];
  let next = [];
  let seq = 0;
  let checks = 0;
  let tail = '';

  const layers = (o = {}) => [
    graphPanel(g, {
      title: `图（${g.directed ? '有向' : '无向'} · 相邻表）`,
      name: 'ALGraph',
      roles: o.roles || {},
      edgeStates: states,
      subOf: (i) => (visited[i] ? `d=${dist[i]}` : '未发现'),
      badgeOf: (i) => badge[i],
    }),
    queuePanel({ id: 'cur-queue', title: '当前层队列 cur', name: 'Queue cur', items: cur, roles: o.curRoles || {} }),
    queuePanel({ id: 'next-queue', title: '下一层队列 next', name: 'Queue next', items: next, roles: o.nextRoles || {} }),
  ];
  const push = (o) => {
    steps.push(step({ ...o, note: tail ? `${o.note}${tail}` : o.note }));
    tail = '';
  };

  push({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '图为空：两个队列都用不上，直接结束。'
      : `共 ${n} 个顶点、${g.edges.length} 条边。本变体不靠 dist 推层号，而是用 cur / next 两个队列把"本层"和"下一层"物理隔开。`,
    vars: { start: startId ?? '—', n, edges: g.edges.length, cur: '（空）', next: '（空）', d: 0 },
    layers: layers({ roles: startIdx >= 0 ? { focus1: [g.nodes[startIdx].id] } : {} }),
  });

  if (n === 0 || startIdx < 0) {
    const result = { order: [], visitedCount: 0, start: null, levels: [], unreached: g.nodes.map((nd) => nd.id) };
    push({
      event: 'done', lineId: 'ret', done: true, result,
      note: n === 0 ? '空图：直接结束，访问序列与层集合都是空。' : `起点 ${startId} 不在顶点集合里：直接结束。`,
      vars: { start: startId ?? '—', n, d: '—', visited: 0, order: '（空）' },
      layers: layers(),
    });
    return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'bfs-two-queue-v1', lines: L, steps, result, meta: { checks } });
  }

  push({
    event: 'init', lineId: 'init',
    note: 'cur 装"正在处理的这一层"，next 装"下一层"。两层从不混在一个队列里，所以层号天然存在，结束一层就能直接输出该层节点集合。',
    vars: { start: startId, n, cur: '（空）', next: '（空）', d: 0 },
    layers: layers({ roles: { focus1: [startId] } }),
  });

  visited[startIdx] = true;
  dist[startIdx] = 0;
  const startKey = `q${seq++}`;
  cur.push({ idx: startIdx, key: startKey, label: g.nodes[startIdx].label, badge: '#1' });
  push({
    event: 'enqueue', lineId: 'mark-start',
    note: `起点 ${startId} 标记后进入 cur（第 0 层）。next 还空着，等第 0 层处理完才会装人。`,
    vars: { start: startId, u: '—', cur: qText(cur, g), next: '（空）', d: 0 },
    layers: layers({ roles: { focus1: [startId], added: [startId] }, curRoles: { focus2: [startKey] } }),
  });

  let d = 0;
  while (cur.length) {
    levels[d] = [];
    push({
      event: 'layer', lineId: 'clear',
      note: `进入第 ${d} 层：cur 里有 ${cur.length} 个顶点，先把 level[${d}] 清空，准备记录这一层访问到的点。`,
      vars: { start: startId, u: '—', d, cur: qText(cur, g), next: '（空）' },
      layers: layers({ roles: { added: cur.map((it) => g.nodes[it.idx].id) } }),
    });

    let innerSkipped = [];
    while (cur.length) {
      const it = cur.shift();
      const u = it.idx;
      const uId = g.nodes[u].id;
      const nb = adj[u].map((w) => g.nodes[w].id);

      push({
        event: 'dequeue', lineId: 'deq',
        note: `从 cur 队头取出 ${uId}（第 ${d} 层）。cur 只装本层，所以它能一次性处理完，不会被下一层的点插队。`,
        vars: { start: startId, u: uId, d, cur: qText(cur, g), next: qText(next, g), 邻接: nb.join('、') || '（无）' },
        layers: layers({ roles: { focus1: [uId], done: order.slice(), added: cur.map((x) => g.nodes[x.idx].id) } }),
      });

      order.push(uId);
      badge[u] = `#${order.length}`;
      levels[d].push(uId);
      push({
        event: 'visit', lineId: 'deq',
        note: `访问 ${uId}（第 ${order.length} 个），同时把它记进 level[${d}]。这一层结束时 level[${d}] 就是完整的层集合。`,
        vars: { start: startId, u: uId, d, cur: qText(cur, g), next: qText(next, g), level: levels[d].join('、'), visited: order.length },
        layers: layers({ roles: { focus1: [uId], done: order.slice(), added: cur.map((x) => g.nodes[x.idx].id) } }),
      });

      for (const w of adj[u]) {
        checks++;
        const wId = g.nodes[w].id;
        if (visited[w]) {
          setEdge(states, g, uId, wId, 'reject');
          innerSkipped.push(wId);
          continue;
        }
        setEdge(states, g, uId, wId, 'active');
        push({
          event: 'discover', lineId: 'check',
          note: `${wId} 没被访问过 → 它属于第 ${d + 1} 层，要进 next 而不是 cur。${innerSkipped.length ? `（${innerSkipped.join('、')} 已访问，相关边标为拒绝边。）` : ''}`,
          vars: { start: startId, u: uId, w: wId, d, cur: qText(cur, g), next: qText(next, g), dist: `d=${d + 1}` },
          layers: layers({ roles: { focus1: [uId], focus2: [wId], done: order.slice(), added: cur.map((x) => g.nodes[x.idx].id) } }),
        });
        innerSkipped = [];
        visited[w] = true;
        dist[w] = d + 1;
        setEdge(states, g, uId, wId, 'tree');
        const key = `q${seq}`;
        next.push({ idx: w, key, label: g.nodes[w].label, badge: `#${seq + 1}` });
        seq++;
        push({
          event: 'enqueue', lineId: 'enq-next',
          note: `${wId} 压进 next（dist=${dist[w]}）。它要等 cur 彻底空了才会开始出队——这就是"按层"的来源。`,
          vars: { start: startId, u: uId, w: wId, d, cur: qText(cur, g), next: qText(next, g), marked: visited.filter(Boolean).length },
          layers: layers({ roles: { focus2: [wId], done: order.slice(), added: cur.map((x) => g.nodes[x.idx].id) }, nextRoles: { focus2: [key] } }),
        });
      }
      if (innerSkipped.length) tail = `（顺带：${uId} 的邻点 ${innerSkipped.join('、')} 已访问，不再入队。）`;
    }

    push({
      event: 'layer', lineId: 'out-layer',
      note: `第 ${d} 层收齐：{ ${levels[d].join('、')} }，共 ${levels[d].length} 个顶点。输出层集合只有在双队列写法里是"免费"的。`,
      vars: { start: startId, u: '—', d, level: levels[d].join('、'), cur: '（空）', next: qText(next, g) },
      layers: layers({ roles: { done: order.slice() } }),
    });

    const moved = next.length;
    cur = next;
    next = [];
    push({
      event: 'layer', lineId: 'swap',
      note: moved
        ? `cur ← next（${moved} 个顶点），d 变成 ${d + 1}：两个队列交替一次，就推进了一层。`
        : `next 是空的：没有更深一层的顶点，队列交替后 cur 也为空，循环即将退出。`,
      vars: { start: startId, u: '—', d: d + 1, cur: qText(cur, g), next: '（空）', marked: visited.filter(Boolean).length },
      layers: layers({ roles: { done: order.slice(), added: cur.map((x) => g.nodes[x.idx].id) } }),
    });
    d++;
  }

  const unreached = g.nodes.filter((nd, i) => !visited[i]).map((nd) => nd.id);
  const result = { order: order.slice(), visitedCount: order.length, start: startId, levels: levels.map((l) => l.slice()), unreached };
  push({
    event: 'done', lineId: 'ret', done: true, result,
    note: `两层队列都空了，BFS 结束：${order.join(' → ')}，共 ${levels.length} 层。${unreached.length ? `${unreached.join('、')} 从未进过任何一个队列，所以不在结果里。` : '所有顶点都被覆盖。'}`,
    vars: { start: startId, n, edges: g.edges.length, d: levels.length, visited: order.length, order: order.join(' → '), 未到达: unreached.join('、') || '—' },
    layers: layers({ roles: { done: order.slice() } }),
  });
  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'bfs-two-queue-v1', lines: L, steps, result, meta: { checks, levels: levels.length } });
}

/* ------------------------------------------------------------------ 变体 3（邻接矩阵） */

function runV3(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const M = matrixOf(g);
  const { startId, startIdx } = startOf(input, g);
  const L = LINES.v3;

  const states = g.edges.map(() => 'idle');
  const visited = new Array(n).fill(false);
  const dist = new Array(n).fill(-1);
  const badge = new Array(n).fill(null);
  const order = [];
  const queue = [];
  const steps = [];
  let seq = 0;
  let scanned = 0;
  let tail = '';

  const rowText = (u) => g.nodes.map((nd, j) => `${nd.label}=${M[u][j]}`).join(' ');
  const queuedIds = () => queue.map((it) => g.nodes[it.idx].id);
  const layers = (o = {}) => [
    graphPanel(g, {
      title: `图（${g.directed ? '有向' : '无向'} · 邻接矩阵）`,
      name: `MGraph · ${n}×${n}`,
      roles: o.roles || {},
      edgeStates: states,
      subOf: (i) => (visited[i] ? `d=${dist[i]}` : '未发现'),
      badgeOf: (i) => badge[i],
    }),
    queuePanel({ id: 'queue', title: '队列 front → rear', name: 'Queue Q', items: queue, roles: o.queueRoles || {} }),
  ];
  const push = (o) => {
    steps.push(step({ ...o, note: tail ? `${o.note}${tail}` : o.note }));
    tail = '';
  };

  push({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '图为空：0×0 矩阵，没有可扫的行。'
      : `先把 ${g.edges.length} 条边铺成 ${n}×${n} 的 0/1 矩阵。矩阵版不建邻接表：处理每个顶点都要把整行 ${n} 个格扫一遍，总代价 O(V²)。`,
    vars: { start: startId ?? '—', n, edges: g.edges.length, Q: '（空）', scanned: 0, 矩阵: `${n}×${n}` },
    layers: layers({ roles: startIdx >= 0 ? { focus1: [g.nodes[startIdx].id] } : {} }),
  });

  if (n === 0 || startIdx < 0) {
    const result = { order: [], visitedCount: 0, start: null, scanned, unreached: g.nodes.map((nd) => nd.id) };
    push({
      event: 'done', lineId: 'ret', done: true, result,
      note: n === 0 ? '空图：直接结束，一行也没扫。' : `起点 ${startId} 不在顶点集合里：直接结束。`,
      vars: { start: startId ?? '—', n, scanned, visited: 0, order: '（空）' },
      layers: layers(),
    });
    return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'bfs-matrix-v1', lines: L, steps, result, meta: { scanned } });
  }

  visited[startIdx] = true;
  dist[startIdx] = 0;
  const startKey = `q${seq++}`;
  queue.push({ idx: startIdx, key: startKey, label: g.nodes[startIdx].label, badge: '#1' });
  push({
    event: 'enqueue', lineId: 'enq-start',
    note: `起点 ${startId} 入队即标记。矩阵版和邻接表版的队列操作完全一样，差别只在"怎么找邻点"。`,
    vars: { start: startId, u: '—', Q: qText(queue, g), marked: 1, scanned, dist: 'd=0' },
    layers: layers({ roles: { focus1: [startId], added: [startId] }, queueRoles: { focus2: [startKey] } }),
  });

  let level = 0;
  while (queue.length) {
    const cur = queue.shift();
    const u = cur.idx;
    const uId = g.nodes[u].id;

    push({
      event: 'dequeue', lineId: 'deq',
      note: `队头 ${uId} 出队（dist=${dist[u]}）。接着要扫矩阵第 ${u} 行（行标签 ${uId}）。`,
      vars: { start: startId, u: uId, Q: qText(queue, g), marked: visited.filter(Boolean).length, visited: order.length, dist: `d=${dist[u]}`, 行: rowText(u) },
      layers: layers({ roles: { focus1: [uId], done: order.slice(), added: queuedIds() } }),
    });

    if (dist[u] > level) {
      level = dist[u];
      push({
        event: 'layer', lineId: 'deq',
        note: `dist 增到 ${level}：进入第 ${level} 层。矩阵版同样有层号，只是它靠 mark-j 那一步的 dist[j]=dist[u]+1 累加。`,
        vars: { start: startId, u: uId, Q: qText(queue, g), marked: visited.filter(Boolean).length, visited: order.length, dist: `d=${level}` },
        layers: layers({ roles: { focus1: [uId], done: order.slice(), added: queuedIds() } }),
      });
    }

    order.push(uId);
    badge[u] = `#${order.length}`;
    push({
      event: 'visit', lineId: 'deq',
      note: `访问 ${uId}（第 ${order.length} 个）。下面扫描第 ${u} 行：${rowText(u)}`,
      vars: { start: startId, u: uId, Q: qText(queue, g), marked: visited.filter(Boolean).length, visited: order.length, order: order.join(' → '), 行: rowText(u) },
      layers: layers({ roles: { focus1: [uId], done: order.slice(), added: queuedIds() } }),
    });

    let skipped = [];
    for (let j = 0; j < n; j++) {
      scanned++;                                  // 每一格都算一次真实访问——O(V²) 的代价就在这里
      const colId = g.nodes[j].id;
      if (M[u][j] === 0) continue;                // 矩阵里的 0：这条边不存在
      if (visited[j]) {
        setEdge(states, g, uId, colId, 'reject');
        skipped.push(colId);
        continue;
      }
      setEdge(states, g, uId, colId, 'active');
      push({
        event: 'discover', lineId: 'skip-seen',
        note: `第 ${u} 行第 ${j} 列 M[${u}][${j}]=1 且 ${colId} 未访问 → 找到新邻点。注意：为了这一格，前面 ${j} 个格（含对角线 0 和已访问列）都白扫了。`,
        vars: { start: startId, u: uId, j, col: colId, Q: qText(queue, g), scanned, marked: visited.filter(Boolean).length, 行: rowText(u) },
        layers: layers({ roles: { focus1: [uId], focus2: [colId], done: order.slice(), added: queuedIds() } }),
      });
      skipped = [];
      visited[j] = true;
      dist[j] = dist[u] + 1;
      setEdge(states, g, uId, colId, 'tree');
      const key = `q${seq}`;
      queue.push({ idx: j, key, label: g.nodes[j].label, badge: `#${seq + 1}` });
      seq++;
      push({
        event: 'enqueue', lineId: 'enq-j',
        note: `${colId} 标记后压入队尾（dist=${dist[j]}）。整行扫完，本行贡献的新顶点数就是入队次数。`,
        vars: { start: startId, u: uId, j, col: colId, Q: qText(queue, g), scanned, marked: visited.filter(Boolean).length, dist: `d=${dist[j]}` },
        layers: layers({ roles: { focus2: [colId], done: order.slice(), added: queuedIds() }, queueRoles: { focus2: [key] } }),
      });
    }
    if (skipped.length) tail = `（顺带：第 ${u} 行的非零列 ${skipped.join('、')} 都已访问，本轮无新入队。）`;
  }

  const unreached = g.nodes.filter((nd, i) => !visited[i]).map((nd) => nd.id);
  const result = { order: order.slice(), visitedCount: order.length, start: startId, scanned, unreached };
  push({
    event: 'done', lineId: 'ret', done: true, result,
    note: `队列空了，BFS 结束：${order.join(' → ')}。整场共扫描 ${scanned} 个矩阵格（≈ 出队点数 × V），而邻接表版只需看 ${g.edges.length * (g.directed ? 1 : 2)} 条边——这就是 O(V²) 与 O(V+E) 的差别。${unreached.length ? `${unreached.join('、')} 的每一行都扫过了，但它们是孤立的，所以不在结果里。` : ''}`,
    vars: { start: startId, n, edges: g.edges.length, scanned, marked: visited.filter(Boolean).length, visited: order.length, order: order.join(' → '), 未到达: unreached.join('、') || '—' },
    layers: layers({ roles: { done: order.slice() } }),
  });
  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'bfs-matrix-v1', lines: L, steps, result, meta: { scanned } });
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
