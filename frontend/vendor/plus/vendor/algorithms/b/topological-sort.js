/**
 * B · 拓扑排序（3 个代表性不同实现）
 *
 * 三条路线真的不同：
 *   v1 Kahn 队列版：先统计入度 → 零入度进 FIFO 队列 → 出队后递减后继入度 → 输出不足 n 个即报环；
 *   v2 DFS 后序逆序版：三色标记（白/灰/黑），完成时刻压后序栈，最后逆序输出；遇到灰点即后向边 → 有环。
 *                      它**不需要入度表**，画面上的 indeg[] 只是陪衬对照；
 *   v3 字典序优先队列版：零入度集合换成最小堆而不是队列，因此同样合法时优先取字母更小的顶点，
 *                      得到字典序最小的拓扑序列（同一张图上出队顺序与 v1 可能不同）。
 *
 * 注意：v2 的输出顺序**合法地**可能不同于 v1/v3（后序逆序天然如此），样例里用 expectByVariant 单独声明。
 * 契约（docs/04-轨迹契约.md）：每步完整快照、lineId 命中本变体 sourceLines、末步 done=true 且带 result。
 */

import { trace, step, arrayLayer, linkLayer, graphLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'b/topological-sort',
  variants: [
    { id: 'v1', name: 'Kahn 队列版' },
    { id: 'v2', name: 'DFS 后序逆序版' },
    { id: 'v3', name: '字典序优先队列版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'int topo_kahn(ALGraph *g, int order[]) {' },
    { lineId: 'indeg-init', text: '  for (v = 0; v < g->n; ++v) indeg[v] = 0;' },
    { lineId: 'indeg', text: '  for (每条弧 u→v) ++indeg[v];             /* 入度 = 前驱个数 */' },
    { lineId: 'enq0', text: '  InitQueue(&Q);' },
    { lineId: 'enq0-scan', text: '  for (v = 0; v < g->n; ++v) if (indeg[v] == 0) EnQueue(&Q, v);' },
    { lineId: 'while-q', text: '  while (!QueueEmpty(&Q)) {' },
    { lineId: 'deq', text: '    u = DeQueue(&Q);  order[count++] = u;   /* 入度归零才能进序列 */' },
    { lineId: 'for', text: '    for (p = g->vex[u].firstarc; p; p = p->next) {' },
    { lineId: 'dec', text: '      v = p->adjvex;  --indeg[v];          /* 删掉这条边 u→v */' },
    { lineId: 'enq', text: '      if (indeg[v] == 0) EnQueue(&Q, v);  /* 前驱全部输出后才入队 */' },
    { lineId: 'end-for', text: '    }' },
    { lineId: 'end-while', text: '  }' },
    { lineId: 'cycle', text: '  if (count < g->n) return FALSE;         /* 剩下顶点的入度不为 0：成环 */' },
    { lineId: 'ret', text: '  return TRUE;' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'int topo_dfs(ALGraph *g, int order[]) {' },
    { lineId: 'init', text: '  for (v = 0; v < g->n; ++v) color[v] = WHITE;   int top = 0;' },
    { lineId: 'indeg-ref', text: '  /* 本变体不用入度表：三色 DFS 靠"完成时刻"定序 */' },
    { lineId: 'for-s', text: '  for (s = 0; s < g->n; ++s) if (color[s] == WHITE) dfs(g, s);' },
    { lineId: 'dfs-fn', text: 'void dfs(ALGraph *g, int u) {' },
    { lineId: 'gray', text: '  color[u] = GRAY;                        /* 进入：正在探索，递归还没返回 */' },
    { lineId: 'for-adj', text: '  for (p = g->vex[u].firstarc; p; p = p->next) {' },
    { lineId: 'back', text: '    if (color[v] == GRAY) { hasCycle = TRUE; return; }  /* 后向边 = 环 */' },
    { lineId: 'descend', text: '    if (color[v] == WHITE) dfs(g, v);     /* 白点才继续深入 */' },
    { lineId: 'black', text: '  }  color[u] = BLACK;  post[top++] = u;  /* 完成时刻压后序栈 */' },
    { lineId: 'dfs-end', text: '}' },
    { lineId: 'reverse', text: '  while (top) order[count++] = post[--top];  /* 后序逆序 = 拓扑序 */' },
    { lineId: 'ret', text: '  return !hasCycle;' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'int topo_lex(ALGraph *g, int order[]) {' },
    { lineId: 'indeg-init', text: '  for (v = 0; v < g->n; ++v) indeg[v] = 0;' },
    { lineId: 'indeg', text: '  for (每条弧 u→v) ++indeg[v];' },
    { lineId: 'push0', text: '  InitMinHeap(&H);                        /* 零入度集合换成最小堆 */' },
    { lineId: 'push0-scan', text: '  for (v = 0; v < g->n; ++v) if (indeg[v] == 0) MinHeapPush(&H, v);' },
    { lineId: 'while-h', text: '  while (!MinHeapEmpty(&H)) {' },
    { lineId: 'pop', text: '    u = MinHeapPop(&H);  order[count++] = u;  /* 每次取字典序最小的零入度点 */' },
    { lineId: 'for', text: '    for (p = g->vex[u].firstarc; p; p = p->next) {' },
    { lineId: 'dec', text: '      v = p->adjvex;  --indeg[v];' },
    { lineId: 'push', text: '      if (indeg[v] == 0) MinHeapPush(&H, v);   /* 插入即按字典序定位置 */' },
    { lineId: 'end-for', text: '    }' },
    { lineId: 'end-while', text: '  }' },
    { lineId: 'cycle', text: '  if (count < g->n) return FALSE;         /* 堆空了却还有顶点没输出：成环 */' },
    { lineId: 'ret', text: '  return TRUE;' },
    { lineId: 'end', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

const NODES = (ids) => ids.map((id) => ({ id }));
const EDGES = (pairs) => pairs.map(([from, to]) => ({ from, to }));
const DIAMOND = { directed: true, nodes: NODES(['A', 'B', 'C']), edges: EDGES([['A', 'C'], ['B', 'C']]) };
const CYCLE2 = { directed: true, nodes: NODES(['A', 'B']), edges: EDGES([['A', 'B'], ['B', 'A']]) };
const SINGLE = { directed: true, nodes: NODES(['A']), edges: [] };

export const samples = [
  {
    id: 'normal',
    label: 'A→C、B→C（两个源点 A、B，期望 A,B,C；v2 后序逆序会得到同族顺序）',
    input: { graph: DIAMOND },
    expect: { order: ['A', 'B', 'C'], cycle: false },
    expectByVariant: {
      v2: { order: ['B', 'A', 'C'], cycle: false },
    },
  },
  {
    id: 'edge-cycle',
    label: 'A↔B（互相牵制，入度永不为 0 → 有环）',
    input: { graph: CYCLE2 },
    expect: { cycle: true },
  },
  {
    id: 'edge-single',
    label: '单点图（只有 A，零入度直接出队）',
    input: { graph: SINGLE },
    expect: { order: ['A'], cycle: false },
  },
];

/* ------------------------------------------------------------------ 输入归一 */

const str = (v) => String(v);

function normalizeGraph(input) {
  const raw = (input && input.graph) || {};
  const rawNodes = raw.nodes || [];
  const shown = labelsOf(rawNodes.map((nd) => str(nd.label ?? nd.id)));
  const nodes = rawNodes.map((nd, i) => ({ id: str(nd.id), label: shown[i] }));
  const known = new Set(nodes.map((nd) => nd.id));
  const edges = [];
  const seen = new Set();
  for (const e of raw.edges || []) {
    const from = str(e.from);
    const to = str(e.to);
    if (!known.has(from) || !known.has(to)) continue;    // 指向不存在顶点的边忽略
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;                          // 重边只算一次入度
    seen.add(key);
    edges.push({ from, to });                             // 自环保留：它本身就是环
  }
  return { directed: true, nodes, edges };
}

function indexOf(g) {
  const m = new Map();
  g.nodes.forEach((nd, i) => m.set(nd.id, i));
  return m;
}

/** 邻接表：按顶点下标升序，保证每次运行同一张图走同样的边序 */
function adjacencyOf(g) {
  const idx = indexOf(g);
  const adj = g.nodes.map(() => []);
  for (const e of g.edges) adj[idx.get(e.from)].push(idx.get(e.to));
  adj.forEach((list) => list.sort((x, y) => x - y));
  return adj;
}

function indegreesOf(g) {
  const idx = indexOf(g);
  const indeg = g.nodes.map(() => 0);
  for (const e of g.edges) indeg[idx.get(e.to)]++;
  return indeg;
}

function edgeSlotFactory(g) {
  const idx = indexOf(g);
  const slot = new Map();
  g.edges.forEach((e, i) => slot.set(`${idx.get(e.from)}->${idx.get(e.to)}`, i));
  return (a, b) => slot.get(`${a}->${b}`);
}

/* ------------------------------------------------------------------ 图层构造 */

function graphPanel(g, o = {}) {
  return graphLayer({
    id: 'graph',
    title: o.title || '有向图',
    name: 'ALGraph（有向）',
    layout: 'circle',
    directed: true,
    weighted: false,
    nodes: g.nodes.map((nd, i) => ({
      id: nd.id,
      label: nd.label,
      sub: o.subOf ? o.subOf(i) : undefined,
      badge: o.badgeOf ? o.badgeOf(i) : undefined,
    })),
    edges: g.edges.map((e, i) => ({
      from: e.from,
      to: e.to,
      state: (o.edgeStates && o.edgeStates[i]) || 'idle',
      directed: true,
    })),
    roles: o.roles || {},
  });
}

function indegPanel(indeg, g, o = {}) {
  return arrayLayer({
    id: 'indeg',
    title: o.title || '入度表 indeg[]',
    name: 'int indeg[n]',
    values: [...indeg],
    labels: g.nodes.map((nd) => nd.label),
    roles: o.roles || {},
  });
}

function queuePanel(o) {
  const items = o.items || [];
  const lab = (i) => o.labelOf(i);
  const nodes = items.map((i) => ({ id: `q${i}`, value: lab(i), label: lab(i) }));
  const links = items.slice(0, -1).map((i, k) => ({ from: `q${i}`, to: `q${items[k + 1]}` }));
  const pointers = [];
  if (items.length) {
    pointers.push({ id: `${o.id}-head`, label: o.headLabel || 'front', node: `q${items[0]}` });
    if (items.length > 1) pointers.push({ id: `${o.id}-rear`, label: o.rearLabel || 'rear', node: `q${items[items.length - 1]}` });
  }
  return linkLayer({
    id: o.id,
    title: o.title,
    name: o.name || '',
    nodes,
    links,
    head: items.length ? `q${items[0]}` : null,
    order: items.map((i) => `q${i}`),
    roles: { ...(o.roles || {}), pointers },
  });
}

const listText = (items, g) => (items.length ? items.map((i) => g.nodes[i].label).join(' → ') : '（空）');

/* ------------------------------------------------------------------ 变体 1（Kahn 队列版） */

function runV1(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const adj = adjacencyOf(g);
  const slot = edgeSlotFactory(g);
  const L = LINES.v1;
  const id = (i) => g.nodes[i].label;

  const indeg = new Array(n).fill(0);
  const edgeStates = g.edges.map(() => 'idle');
  const badge = new Array(n).fill(null);
  const order = [];
  const queue = [];
  const steps = [];
  let decrements = 0;
  let tail = '';

  const layers = (o = {}) => [
    graphPanel(g, {
      title: '有向图（Kahn：按入度删边推进）',
      edgeStates,
      subOf: (i) => `in=${indeg[i]}`,
      badgeOf: (i) => badge[i],
      roles: o.roles || {},
    }),
    indegPanel(indeg, g, { roles: o.indegRoles || {} }),
    queuePanel({ id: 'queue', title: '零入度队列 front → rear', name: 'Queue Q', items: queue, labelOf: id, roles: o.queueRoles || {} }),
  ];
  const vars = (o = {}) => ({ n, 边数: g.edges.length, 已输出: order.length, 递减次数: decrements, Q: listText(queue, g), ...o });
  const push = (o) => {
    steps.push(step({ ...o, note: tail ? `${o.note}${tail}` : o.note }));
    tail = '';
  };

  push({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空图：没有顶点，拓扑序列为空，也不可能有环。'
      : `共 ${n} 个顶点、${g.edges.length} 条有向边。Kahn 的思路：入度 = 还有几个前驱没被输出；入度为 0 的顶点可以立刻放进序列，删掉它的出边后可能又造出新的零入度点。`,
    vars: vars(),
    layers: layers(),
  });

  push({
    event: 'indegree', lineId: 'indeg-init',
    note: `先把 indeg[] 全部清 0：入度是"前驱个数"，不是权值，所以要逐条边累加。`,
    vars: vars(),
    layers: layers(),
  });

  for (const e of g.edges) {
    const to = g.nodes.findIndex((nd) => nd.id === e.to);
    indeg[to]++;
    edgeStates[slot(g.nodes.findIndex((nd) => nd.id === e.from), to)] = 'candidate';
    push({
      event: 'indegree', lineId: 'indeg',
      note: `扫到弧 ${e.from}→${e.to}：给 ${e.to} 的入度 +1，现在 indeg[${e.to}] = ${indeg[to]}。${e.from === e.to ? '这是自环：它自己就是自己的前驱，入度永远不会归零 → 必成环。' : ''}`,
      vars: vars({ 当前边: `${e.from}→${e.to}` }),
      layers: layers({ roles: { focus1: [e.from], focus2: [e.to] }, indegRoles: { focus1: [to] } }),
    });
  }

  const zeros = [];
  for (let v = 0; v < n; v++) if (indeg[v] === 0) zeros.push(v);
  for (const v of zeros) {
    queue.push(v);
    push({
      event: 'enqueue-zero', lineId: 'enq0-scan',
      note: `${id(v)} 的入度为 0：它没有任何前驱，可以放在序列最前面，先入队。`,
      vars: vars({ 当前: id(v) }),
      layers: layers({ roles: { focus1: [id(v)], added: [id(v)] }, indegRoles: { done: [v] }, queueRoles: { added: [`q${v}`] } }),
    });
  }
  if (!zeros.length && n > 0) {
    push({
      event: 'enqueue-zero', lineId: 'enq0-scan',
      note: `扫完全部 ${n} 个顶点，没有一个入度为 0：说明每个顶点都有前驱，图里必然有环，队列从一开始就是空的。`,
      vars: vars(),
      layers: layers(),
    });
  }

  while (queue.length) {
    const u = queue.shift();
    order.push(u);
    badge[u] = `#${order.length}`;
    push({
      event: 'dequeue', lineId: 'deq',
      note: `${id(u)} 出队并接到拓扑序列第 ${order.length} 位。它出队时入度恰好是 0，等价于"它的前驱已经全部就位"。`,
      vars: vars({ 当前: id(u), 输出: order.map((i) => id(i)).join(' → ') }),
      layers: layers({ roles: { focus1: [id(u)], done: order.map((i) => id(i)) }, indegRoles: { done: order.slice() } }),
    });

    for (const v of adj[u]) {
      const before = indeg[v];
      indeg[v]--;
      decrements++;
      edgeStates[slot(u, v)] = 'tree';
      push({
        event: 'decrement', lineId: 'dec',
        note: `删掉边 ${id(u)}→${id(v)}：${id(v)} 的入度从 ${before} 降到 ${indeg[v]}。${indeg[v] === 0 ? '降到 0 了，它马上可以入队。' : `还剩 ${indeg[v]} 个前驱没输出，先等着。`}`,
        vars: vars({ 当前: id(u), 后继: id(v) }),
        layers: layers({ roles: { focus1: [id(u)], focus2: [id(v)] }, indegRoles: { focus1: [v] } }),
      });
      if (indeg[v] === 0) {
        queue.push(v);
        push({
          event: 'enqueue', lineId: 'enq',
          note: `${id(v)} 的入度归零 → 压到队尾。注意它是"最后一个前驱被删掉的那一刻"才入队，不是一开始就入队。`,
          vars: vars({ 当前: id(v), 输出: order.map((i) => id(i)).join(' → ') }),
          layers: layers({ roles: { added: [id(v)] }, indegRoles: { done: [v] }, queueRoles: { added: [`q${v}`] } }),
        });
      }
    }
  }

  const remaining = g.nodes.map((nd, i) => (order.includes(i) ? null : nd.id)).filter(Boolean);
  const cycle = remaining.length > 0;
  if (cycle) {
    push({
      event: 'cycle', lineId: 'cycle',
      note: `队列空了，可是只输出了 ${order.length}/${n} 个顶点：剩下 ${remaining.join('、')} 的入度始终大于 0。它们的"前驱"都在剩下的集合里互相牵制——这就是环，拓扑序不存在。`,
      vars: vars({ 剩余: remaining.join('、'), 输出: order.map((i) => id(i)).join(' → ') || '（空）' }),
      layers: layers({ roles: { focus1: remaining, excluded: order.map((i) => id(i)) }, indegRoles: { focus1: g.nodes.map((nd, i) => i).filter((i) => !order.includes(i)) } }),
    });
  }

  const result = { order: order.map((i) => id(i)), cycle, remaining };
  push({
    event: 'done', lineId: 'end', done: true, result,
    note: cycle
      ? `算法结束：有环，没有完整拓扑序（只输出了 ${order.length} 个顶点，剩下 ${remaining.join('、')} 卡在环里）。`
      : n === 0
        ? '空图：拓扑序列为空，循环依赖不存在。'
        : `算法结束：${result.order.join(' → ')} 是 ${n} 个顶点的一个拓扑序（共递减入度 ${decrements} 次）。每一步都输出了入度为 0 的点，所以每条边的起点都排在终点之前。`,
    vars: vars({ 输出: result.order.join(' → ') || '（空）', 剩余: remaining.join('、') || '—' }),
    layers: layers({ roles: { done: order.map((i) => id(i)), focus1: remaining } }),
  });

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'topological-kahn-v1',
    lines: L, steps, result, meta: { decrements, cycle },
  });
}

/* ------------------------------------------------------------------ 变体 2（DFS 后序逆序版） */

function runV2(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const adj = adjacencyOf(g);
  const slot = edgeSlotFactory(g);
  const L = LINES.v2;
  const id = (i) => g.nodes[i].label;

  const indeg = indegreesOf(g);            // 只用于画面上的入度表（DFS 不需要它）
  const edgeStates = g.edges.map(() => 'idle');
  const color = new Array(n).fill(0);      // 0 白 / 1 灰 / 2 黑
  const badge = new Array(n).fill(null);
  const post = [];                         // 后序栈（完成时刻依次压入）
  const order = [];
  const stack = [];                        // 递归栈（画面）
  const steps = [];
  let cycle = false;
  let backEdges = 0;
  let tail = '';

  const stateOf = (i) => ['白（未访问）', '灰（在栈上）', '黑（已完成）'][color[i]];
  const layers = (o = {}) => [
    graphPanel(g, {
      title: '有向图（DFS 三色标记）',
      edgeStates,
      subOf: (i) => (color[i] === 0 ? `in=${indeg[i]}` : `${['白', '灰', '黑'][color[i]]}·in=${indeg[i]}`),
      badgeOf: (i) => badge[i],
      roles: o.roles || {},
    }),
    indegPanel(indeg, g, { title: '入度表 indeg[]（本变体只作对照）', roles: o.indegRoles || {} }),
    queuePanel({
      id: 'stack', title: '递归栈（右侧为栈顶 u）', name: 'dfs stack',
      items: stack, labelOf: id,
      headLabel: '栈底', rearLabel: '栈顶 u',
      roles: o.stackRoles || {},
    }),
  ];
  const vars = (o = {}) => ({
    n, 已输出: order.length, 后向边: backEdges,
    后序栈: listText(post, g), 输出: order.map((i) => id(i)).join(' → ') || '（空）', ...o,
  });
  const push = (o) => {
    steps.push(step({ ...o, note: tail ? `${o.note}${tail}` : o.note }));
    tail = '';
  };

  push({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空图：没有顶点可遍历，拓扑序列为空。'
      : `共 ${n} 个顶点、${g.edges.length} 条有向边。本变体不用入度表，改看"完成时刻"：顶点 u 变黑时，它的所有后继都已经变黑，所以 u 必须排在它们**后面**——把完成顺序倒过来就是拓扑序。`,
    vars: vars(),
    layers: layers(),
  });

  push({
    event: 'indegree', lineId: 'indeg-ref',
    note: `顺手把 indeg[] 算出来放在左边作对照：DFS 版完全不读它（下一步的循环只看 color[]）。${g.edges.length === 0 ? '本图没有边，所有入度都是 0。' : ''}`,
    vars: vars(),
    layers: layers(),
  });

  const dfs = (u) => {
    color[u] = 1;
    stack.push(u);
    push({
      event: 'enqueue', lineId: 'gray',
      note: `${id(u)} 染灰并压入递归栈：它正在被探索，递归还没返回。灰色顶点若再被遇到，就说明存在后向边（环）。`,
      vars: vars({ 当前: id(u) }),
      layers: layers({ roles: { focus1: [id(u)] }, indegRoles: { focus1: [u] }, stackRoles: { focus2: [`q${u}`] } }),
    });

    for (const v of adj[u]) {
      if (color[v] === 1) {
        cycle = true;
        backEdges++;
        edgeStates[slot(u, v)] = 'reject';
        push({
          event: 'cycle', lineId: 'back',
          note: `沿边 ${id(u)}→${id(v)} 撞上一个灰点：${id(v)} 还在递归栈上，说明从 ${id(v)} 出发能走回它自己。后向边 = 有向环，拓扑序不存在。`,
          vars: vars({ 当前: id(u), 撞灰点: id(v) }),
          layers: layers({ roles: { focus1: [id(u)], focus2: [id(v)] }, indegRoles: { focus2: [v] } }),
        });
        return true;
      }
      if (color[v] === 0) {
        edgeStates[slot(u, v)] = 'active';
        push({
          event: 'enqueue', lineId: 'descend',
          note: `沿边 ${id(u)}→${id(v)}：${id(v)} 还是白色，深入它。DFS 必须先钻到底，才能保证"完成时刻"的正确顺序。`,
          vars: vars({ 当前: id(u), 深入: id(v) }),
          layers: layers({ roles: { focus1: [id(u)], focus2: [id(v)] }, indegRoles: { focus1: [v] } }),
        });
        if (dfs(v)) return true;
      } else {
        edgeStates[slot(u, v)] = 'path';   // 指向黑点：这条边已经"安全"，不构成环
      }
    }

    color[u] = 2;
    stack.pop();
    post.push(u);
    push({
      event: 'dequeue', lineId: 'black',
      note: `${id(u)} 的后继都处理完了：离开递归栈、染黑，并压入后序栈。它此刻排在栈顶，将来逆序输出时就会排到它的所有后继**前面**。`,
      vars: vars({ 当前: id(u) }),
      layers: layers({ roles: { done: post.map((i) => id(i)), focus1: [id(u)] }, indegRoles: { done: post.slice() } }),
    });
    return false;
  };

  for (let s = 0; s < n; s++) {
    if (color[s] !== 0) continue;
    if (s > 0) {
      push({
        event: 'enqueue', lineId: 'for-s',
        note: `${id(s)} 还是白色：它所在的连通分量还没碰过，从它重新起一次 DFS。多源起点是"非连通图也能全遍历"的关键。`,
        vars: vars({ 起点: id(s) }),
        layers: layers({ roles: { focus2: [id(s)] } }),
      });
    }
    if (dfs(s)) break;
  }

  if (!cycle) {
    push({
      event: 'dequeue', lineId: 'reverse',
      note: `所有顶点都变黑了，后序栈自底向上是 ${listText(post, g)}。逆序输出就得到拓扑序：一个顶点总是在它的所有后继之后才完成，所以倒过来它就排在它们之前。`,
      vars: vars(),
      layers: layers({ roles: { done: post.map((i) => id(i)) } }),
    });
    while (post.length) {
      const u = post.pop();
      order.push(u);
      badge[u] = `#${order.length}`;
      push({
        event: 'dequeue', lineId: 'reverse',
        note: `从后序栈弹出 ${id(u)}，接到拓扑序列第 ${order.length} 位。`,
        vars: vars({ 当前: id(u) }),
        layers: layers({ roles: { done: order.map((i) => id(i)), focus1: [id(u)] }, indegRoles: { done: order.slice() } }),
      });
    }
  }

  const remaining = g.nodes.map((nd, i) => (order.includes(i) ? null : nd.id)).filter(Boolean);
  const result = { order: order.map((i) => id(i)), cycle, remaining };
  push({
    event: 'done', lineId: 'ret', done: true, result,
    note: cycle
      ? `算法结束：遇到后向边（共命中 ${backEdges} 次），图有环，没有拓扑序。DFS 版的好处是"边走就当场发现"，不像 Kahn 要跑完才知道。`
      : n === 0
        ? '空图：拓扑序列为空。'
        : `算法结束：${result.order.join(' → ')}。它和 Kahn 版给出的序列可能不同（都合法）——后序逆序的先后取决于 DFS 的探索顺序，Kahn 取决于队/堆的取点顺序。`,
    vars: vars({ 当前: null }),
    layers: layers({ roles: { done: order.map((i) => id(i)) } }),
  });

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'topological-dfs-v1',
    lines: L, steps, result, meta: { backEdges, cycle },
  });
}

/* ------------------------------------------------------------------ 变体 3（字典序优先队列版） */

function runV3(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const adj = adjacencyOf(g);
  const slot = edgeSlotFactory(g);
  const L = LINES.v3;
  const id = (i) => g.nodes[i].label;

  const indeg = new Array(n).fill(0);
  const edgeStates = g.edges.map(() => 'idle');
  const badge = new Array(n).fill(null);
  const order = [];
  const heap = [];                       // 用保持升序的数组模拟最小堆：heap[0] 是字典序最小
  const steps = [];
  let decrements = 0;
  let tail = '';

  const cmp = (a, b) => (id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0);
  const insert = (v) => {
    let at = heap.length;
    while (at > 0 && cmp(v, heap[at - 1]) < 0) at--;
    heap.splice(at, 0, v);
    return at;
  };

  const layers = (o = {}) => [
    graphPanel(g, {
      title: '有向图（字典序优先队列：每步取最小）',
      edgeStates,
      subOf: (i) => `in=${indeg[i]}`,
      badgeOf: (i) => badge[i],
      roles: o.roles || {},
    }),
    indegPanel(indeg, g, { roles: o.indegRoles || {} }),
    queuePanel({
      id: 'heap', title: '零入度优先队列（左侧最小）', name: 'MinHeap H',
      items: heap, labelOf: id, headLabel: '最小', rearLabel: '最大',
      roles: o.heapRoles || {},
    }),
  ];
  const vars = (o = {}) => ({ n, 边数: g.edges.length, 已输出: order.length, 递减次数: decrements, H: listText(heap, g), ...o });
  const push = (o) => {
    steps.push(step({ ...o, note: tail ? `${o.note}${tail}` : o.note }));
    tail = '';
  };

  push({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空图：优先队列也是空的，直接结束。'
      : `共 ${n} 个顶点、${g.edges.length} 条有向边。流程和 Kahn 一样，只把一个东西换掉：零入度集合用**最小堆**而不是 FIFO 队列。于是同时有多个可选顶点时，永远先取字典序最小的那个——输出的是字典序最小的拓扑序。`,
    vars: vars(),
    layers: layers(),
  });

  push({
    event: 'indegree', lineId: 'indeg-init',
    note: 'indeg[] 清零：入度 = 还有几个前驱没输出。',
    vars: vars(),
    layers: layers(),
  });

  for (const e of g.edges) {
    const to = g.nodes.findIndex((nd) => nd.id === e.to);
    indeg[to]++;
    edgeStates[slot(g.nodes.findIndex((nd) => nd.id === e.from), to)] = 'candidate';
    push({
      event: 'indegree', lineId: 'indeg',
      note: `扫到弧 ${e.from}→${e.to}：indeg[${e.to}] 变成 ${indeg[to]}。${e.from === e.to ? '自环：入度永不归零。' : ''}`,
      vars: vars({ 当前边: `${e.from}→${e.to}` }),
      layers: layers({ roles: { focus1: [e.from], focus2: [e.to] }, indegRoles: { focus1: [to] } }),
    });
  }

  let inserted = 0;
  for (let v = 0; v < n; v++) {
    if (indeg[v] !== 0) continue;
    const at = insert(v);
    inserted++;
    push({
      event: 'enqueue-zero', lineId: 'push0-scan',
      note: `${id(v)} 入度为 0，插进最小堆的第 ${at} 个位置（插到第一个字典序比它大的元素前面）。${at === 0 ? '所以它现在是堆里最小的。' : `它比堆里前 ${at} 个元素都大。`}`,
      vars: vars({ 当前: id(v) }),
      layers: layers({ roles: { focus1: [id(v)], added: [id(v)] }, indegRoles: { done: [v] }, heapRoles: { added: [`q${v}`] } }),
    });
  }
  if (inserted === 0 && n > 0) {
    push({
      event: 'enqueue-zero', lineId: 'push0-scan',
      note: `没有任何顶点的入度为 0：堆从空开始，也就永远取不出东西——图里必然有环。`,
      vars: vars(),
      layers: layers(),
    });
  }

  while (heap.length) {
    const u = heap.shift();
    order.push(u);
    badge[u] = `#${order.length}`;
    push({
      event: 'dequeue', lineId: 'pop',
      note: `取堆顶（最小）= ${id(u)}，接到序列第 ${order.length} 位。若这里是 FIFO 队列，取的可能是另一个顶点——这正是 v3 与 v1 唯一的差别，也是"字典序最小"的来源。`,
      vars: vars({ 当前: id(u), 输出: order.map((i) => id(i)).join(' → ') }),
      layers: layers({ roles: { focus1: [id(u)], done: order.map((i) => id(i)) }, indegRoles: { done: order.slice() } }),
    });

    for (const v of adj[u]) {
      const before = indeg[v];
      indeg[v]--;
      decrements++;
      edgeStates[slot(u, v)] = 'tree';
      push({
        event: 'decrement', lineId: 'dec',
        note: `删掉边 ${id(u)}→${id(v)}：indeg[${id(v)}] 从 ${before} 降到 ${indeg[v]}。${indeg[v] === 0 ? '归零 → 可以进堆。' : `还有 ${indeg[v]} 个前驱。`}`,
        vars: vars({ 当前: id(u), 后继: id(v) }),
        layers: layers({ roles: { focus1: [id(u)], focus2: [id(v)] }, indegRoles: { focus1: [v] } }),
      });
      if (indeg[v] === 0) {
        const at = insert(v);
        push({
          event: 'enqueue', lineId: 'push',
          note: `${id(v)} 入度归零，按字典序插到堆的第 ${at} 个位置（前面有 ${at} 个更小的零入度点等着被取）。堆始终保持有序，代价是每次 O(log n)。`,
          vars: vars({ 当前: id(v), 输出: order.map((i) => id(i)).join(' → ') }),
          layers: layers({ roles: { added: [id(v)] }, indegRoles: { done: [v] }, heapRoles: { added: [`q${v}`] } }),
        });
      }
    }
  }

  const remaining = g.nodes.map((nd, i) => (order.includes(i) ? null : nd.id)).filter(Boolean);
  const cycle = remaining.length > 0;
  if (cycle) {
    push({
      event: 'cycle', lineId: 'cycle',
      note: `堆空了却只输出 ${order.length}/${n} 个顶点：${remaining.join('、')} 的入度一直是正的，它们互为前驱构成环。`,
      vars: vars({ 剩余: remaining.join('、') }),
      layers: layers({ roles: { focus1: remaining, excluded: order.map((i) => id(i)) } }),
    });
  }

  const result = { order: order.map((i) => id(i)), cycle, remaining };
  push({
    event: 'done', lineId: 'end', done: true, result,
    note: cycle
      ? `算法结束：有环，只能输出 ${order.length} 个顶点，剩下 ${remaining.join('、')} 卡在环内，不存在拓扑序。`
      : n === 0
        ? '空图：拓扑序列为空。'
        : `算法结束：${result.order.join(' → ')}。这是本图**字典序最小**的拓扑序：每一步都取了当前可选顶点里最小的，所以任何贪心的提前替换都只会让序列变大。`,
    vars: vars({ 当前: null }),
    layers: layers({ roles: { done: order.map((i) => id(i)), focus1: remaining } }),
  });

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'topological-lexheap-v1',
    lines: L, steps, result, meta: { decrements, cycle },
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
