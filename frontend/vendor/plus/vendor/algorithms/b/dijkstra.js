/**
 * B · Dijkstra 单源最短路（3 个代表性不同实现）
 *
 * 三个变体是三条真实的技术路线，不是改名换汤：
 *   v1 朴素 O(V²)：每轮从表头线性扫全部未确定顶点挑 dist 最小者，再松弛出边——
 *      扫描本身的代价是可见的（每轮 V 次比较，共 V 轮）；
 *   v2 二叉堆（惰性删除）：候选按 dist 压小根堆，同一顶点可能留**多条旧距离条目**，
 *      弹出时若 dist[v] 已小于条目里的 d，说明这条记录作废 → 直接丢弃（惰性删除），
 *      堆面板上用灰色 invalid 单元展示"残留条目"；
 *   v3 路径回溯版：松弛时同时写 pre[]，并在每次改进后立刻沿 pre 链回溯到起点、
 *      把整条链的边走成"路径"色；结束后从终点再逐跳回溯一遍，打印整条最短路。
 *
 * 契约（docs/04-轨迹契约.md）：每步完整快照、lineId 命中本变体 sourceLines、
 * 末步 done=true 且 result 与样例 expect 逐键深比较一致。
 * 事件只用目录词表：init / select-min / relax / reject-relax / settle / unreachable / done。
 *
 * 主画面 style 10（带权图：节点 sub 显示 dist，badge=S 表示已确定），
 * 辅助 style 1 两层：dist[] 暂定距离、pre[] 前驱；v2 另加 style 8 展示堆的惰性条目。
 */

import { trace, step, graphLayer, arrayLayer, heapLayer, memCell } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'b/dijkstra',
  variants: [
    { id: 'v1', name: '朴素 O(V²)' },
    { id: 'v2', name: '二叉堆（惰性删除）' },
    { id: 'v3', name: '路径回溯版' },
  ],
};

const NEG_MSG = '存在负权边：Dijkstra 依赖非负权保证贪心正确性，已拒绝执行';

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void dijkstra(MGraph *g, int s, int dist[], int pre[]) {' },
    { lineId: 'init', text: '  for (v = 0; v < g->n; ++v) { dist[v] = INF; pre[v] = -1; S[v] = FALSE; }' },
    { lineId: 'set-s', text: '  dist[s] = 0;                       /* 起点到自己是 0 */' },
    { lineId: 'while', text: '  while (还有未确定且 dist 有限的顶点) {' },
    { lineId: 'scan', text: '    u = -1;  best = INF;              /* 每轮从头重扫 */' },
    { lineId: 'scan-for', text: '    for (v = 0; v < g->n; ++v) {     /* 线性扫最小：O(V) */' },
    { lineId: 'scan-if', text: '      if (!S[v] && dist[v] < best) { u = v; best = dist[v]; }' },
    { lineId: 'settle', text: '    S[u] = TRUE;                     /* dist[u] 从此不再改变 */' },
    { lineId: 'for-edge', text: '    for (每个 u->w 的边, 权 w(u,w)) {' },
    { lineId: 'relax-if', text: '      if (dist[u] + w(u,w) < dist[w]) {' },
    { lineId: 'relax', text: '        dist[w] = dist[u] + w(u,w);  pre[w] = u;' },
    { lineId: 'skip', text: '      } else { /* 旧方案不差，保持原值 */ }' },
    { lineId: 'end-for', text: '    }' },
    { lineId: 'end-while', text: '  }' },
    { lineId: 'ret', text: '}  /* 仍为 INF 的顶点 = 从 s 不可达 */' },
  ],
  v2: [
    { lineId: 'fn', text: 'void dijkstra_heap(MGraph *g, int s, int dist[], int pre[]) {' },
    { lineId: 'init', text: '  for (v = 0; v < g->n; ++v) { dist[v] = INF; pre[v] = -1; S[v] = FALSE; }' },
    { lineId: 'set-s', text: '  dist[s] = 0;  HeapPush(&Q, (s, 0));   /* 条目 = (顶点, 那时的 dist) */' },
    { lineId: 'while', text: '  while (!HeapEmpty(&Q)) {' },
    { lineId: 'peek', text: '    e = HeapTop(&Q);                  /* 堆顶是当前最小条目 */' },
    { lineId: 'pop', text: '    e = HeapPop(&Q);' },
    { lineId: 'stale', text: '    if (e.d > dist[e.v]) continue;    /* 惰性删除：这条是旧记录，丢弃 */' },
    { lineId: 'settle', text: '    S[e.v] = TRUE;                    /* 第一次弹出即最终距离 */' },
    { lineId: 'for-edge', text: '    for (每个 e.v->w 的边, 权 w) {' },
    { lineId: 'relax-if', text: '      if (dist[e.v] + w < dist[w]) {' },
    { lineId: 'relax', text: '        dist[w] = dist[e.v] + w;  pre[w] = e.v;' },
    { lineId: 'push', text: '        HeapPush(&Q, (w, dist[w]));   /* 旧条目留在堆里，等它被弹出时再丢 */' },
    { lineId: 'skip', text: '      } else { /* 不优 */ }' },
    { lineId: 'end-for', text: '    }' },
    { lineId: 'end-while', text: '  }' },
    { lineId: 'ret', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void dijkstra_path(MGraph *g, int s, int dist[], int pre[]) {' },
    { lineId: 'init', text: '  for (v = 0; v < g->n; ++v) { dist[v] = INF; pre[v] = -1; S[v] = FALSE; }' },
    { lineId: 'set-s', text: '  dist[s] = 0;                       /* pre[s] 保持 -1：回溯的终点 */' },
    { lineId: 'while', text: '  while (还有未确定且 dist 有限的顶点) {' },
    { lineId: 'scan', text: '    u = argmin{ dist[v] : !S[v] };    /* 线性扫一遍，只报结果 */' },
    { lineId: 'settle', text: '    S[u] = TRUE;' },
    { lineId: 'for-edge', text: '    for (每个 u->w 的边, 权 w(u,w)) {' },
    { lineId: 'relax-if', text: '      if (dist[u] + w(u,w) < dist[w]) {' },
    { lineId: 'relax', text: '        dist[w] = dist[u] + w(u,w);  pre[w] = u;   /* 这一跳写进 pre */' },
    { lineId: 'chain', text: '        /* 立刻沿 pre 从 w 回到 s：验证这条链已经被完整记录 */' },
    { lineId: 'skip', text: '      } else { /* 不优：原有 pre[w] 更划算 */ }' },
    { lineId: 'end-for', text: '    }' },
    { lineId: 'end-while', text: '  }' },
    { lineId: 'bt-init', text: '  v = t;                             /* t = 终点，回溯起点 */' },
    { lineId: 'bt-hop', text: '  while (pre[v] != -1) { v = pre[v]; }   /* 逐跳前移，边即最短路 */' },
    { lineId: 'ret', text: '}  /* 逆序读出的 v 序列就是 s->t 的最短路 */' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

const NODES = (ids) => ids.map((id) => ({ id, label: id }));

const LAB = {
  directed: true,
  nodes: NODES(['A', 'B', 'C']),
  // A→B=5 / A→C=1 / C→B=2：先直达 B=5，settle A、C 之后被 C 改成 3
  edges: [
    { from: 'A', to: 'B', w: 5 },
    { from: 'A', to: 'C', w: 1 },
    { from: 'C', to: 'B', w: 2 },
  ],
};

const ISOLATED = {
  directed: true,
  nodes: NODES(['A', 'B', 'C', 'D']),   // D 完全孤立：dist 永远 ∞
  edges: [
    { from: 'A', to: 'B', w: 1 },
    { from: 'B', to: 'C', w: 1 },
  ],
};

const NEGATIVE = {
  directed: true,
  nodes: NODES(['A', 'B', 'C']),
  // C→A=-6 造成负权，负环 A→B→C→A 的总权 6 + (-6)…… 这里只要"有负权"就该拒绝
  edges: [
    { from: 'A', to: 'B', w: 1 },
    { from: 'B', to: 'C', w: 1 },
    { from: 'C', to: 'A', w: -6 },
  ],
};

const FULL_LAB = { dist: { A: 0, B: 3, C: 1 }, pre: { A: null, B: 'C', C: 'A' }, order: ['A', 'C', 'B'], unreachable: [] };
const FULL_ISOLATED = { dist: { A: 0, B: 1, C: 2 }, pre: { A: null, B: 'A', C: 'B' }, order: ['A', 'B', 'C'], unreachable: ['D'] };

export const samples = [
  {
    id: 'normal',
    label: 'A→B=5、A→C=1、C→B=2，从 A 出发（B 应为 3，pre[B]=C）',
    input: { graph: LAB, start: 'A', target: 'B' },
    expect: FULL_LAB,
    expectByVariant: {
      v3: { ...FULL_LAB, path: ['A', 'C', 'B'], pathWeight: 3 },
    },
  },
  {
    id: 'edge-isolated',
    label: '三点链 A→B→C 加孤立点 D（D 不可达）',
    input: { graph: ISOLATED, start: 'A', target: 'C' },
    expect: FULL_ISOLATED,
    expectByVariant: {
      v3: { ...FULL_ISOLATED, path: ['A', 'B', 'C'], pathWeight: 2 },
    },
  },
  {
    id: 'edge-negative-weight',
    label: 'C→A=-6（负权输入必须被拒绝）',
    input: { graph: NEGATIVE, start: 'A' },
    expect: { error: NEG_MSG },
  },
];

/* ------------------------------------------------------------------ 输入归一 / 公共结构 */

const str = (v) => String(v);
const fmt = (x) => (Number.isFinite(x) ? x : '∞');

function normalizeGraph(input) {
  const raw = (input && input.graph) || {};
  const rawNodes = raw.nodes || [];
  const shown = labelsOf(rawNodes.map((nd) => str(nd.label ?? nd.id)));
  const nodes = rawNodes.map((nd, i) => ({ id: str(nd.id), label: shown[i] }));
  const known = new Set(nodes.map((nd) => nd.id));
  const edges = [];
  let negative = null;
  for (const e of raw.edges || []) {
    const from = str(e.from);
    const to = str(e.to);
    if (!known.has(from) || !known.has(to)) continue;      // 指向不存在顶点：忽略
    const w = e.w == null ? 1 : Number(e.w);
    if (!Number.isFinite(w)) continue;
    if (w < 0 && !negative) negative = { from, to, w };
    if (from === to) continue;                             // 自环不影响最短路
    edges.push({ from, to, w });
  }
  return { directed: !!raw.directed, nodes, edges, negative };
}

function adjacencyOf(g) {
  const idx = new Map(g.nodes.map((nd, i) => [nd.id, i]));
  const adj = g.nodes.map(() => []);
  g.edges.forEach((e, ei) => {
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    adj[a].push({ to: b, w: e.w, edge: ei });
    if (!g.directed && a !== b) adj[b].push({ to: a, w: e.w, edge: ei });
  });
  return adj;
}

function startOf(input, g) {
  const idx = new Map(g.nodes.map((nd, i) => [nd.id, i]));
  const wanted = input && input.start != null ? str(input.start) : (g.nodes[0] ? g.nodes[0].id : null);
  const at = wanted != null && idx.has(wanted) ? idx.get(wanted) : -1;
  return { startId: wanted, startIdx: at };
}

const settledIdxOf = (settled) => settled.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);

/**
 * 统一画面：style 10 带权图 + style 1 dist[] + style 1 pre[]（+ 可选 style 8 堆）。
 * 每次调用都新建 layer 与 data，保证"完整快照"。
 */
function panels(g, view, o = {}) {
  const { dist, pre, settled } = view;
  const layers = [
    graphLayer({
      id: 'graph',
      title: o.title || `图（${g.directed ? '有向' : '无向'} · 边权）`,
      name: o.name || 'MGraph（带权）',
      directed: g.directed,
      weighted: true,
      layout: 'circle',
      nodes: g.nodes.map((nd, i) => ({
        id: nd.id,
        label: nd.label,
        sub: `d=${fmt(dist[i])}`,
        badge: settled[i] ? 'S' : undefined,
      })),
      edges: g.edges.map((e, i) => ({
        from: e.from,
        to: e.to,
        w: e.w,
        directed: g.directed,
        state: (o.edgeStates && o.edgeStates[i]) || 'idle',
      })),
      roles: o.roles || {},
    }),
    arrayLayer({
      id: 'dist',
      title: 'dist[]（暂定距离，∞ = 尚未发现）',
      name: 'int dist[n]',
      values: dist.map((d) => fmt(d)),
      labels: g.nodes.map((nd) => nd.id),
      roles: o.distRoles || {},
    }),
    arrayLayer({
      id: 'pre',
      title: 'pre[]（前驱，— = 无）',
      name: 'int pre[n]',
      values: pre.map((p) => (p == null ? '—' : g.nodes[p].id)),
      labels: g.nodes.map((nd) => nd.id),
      roles: o.preRoles || {},
    }),
  ];
  if (Array.isArray(o.heapCells)) {
    layers.push(heapLayer({
      id: 'heap',
      title: '最小堆 Q（灰格 = 惰性删除的残留条目）',
      name: 'Heap Q（条目 = 顶点,当时的 dist）',
      cells: o.heapCells.map((c) => ({ ...c })),
      tree: o.heapTree || null,
      roles: o.heapRoles || {},
    }));
  }
  return layers;
}

function resultOf(g, dist, pre, order) {
  const distObj = {};
  const preObj = {};
  g.nodes.forEach((nd, i) => {
    if (!Number.isFinite(dist[i])) return;
    distObj[nd.id] = dist[i];
    preObj[nd.id] = pre[i] == null ? null : g.nodes[pre[i]].id;
  });
  const unreachable = g.nodes.filter((nd, i) => !Number.isFinite(dist[i])).map((nd) => nd.id);
  return { dist: distObj, pre: preObj, order: order.map((i) => g.nodes[i].id), unreachable };
}

/** 负权输入：只需两步（说明 + 拒绝），result 只有一个 error 键 */
function rejectNegative(g, input, L, variantId, sourceVersion, layersFor, steps) {
  const at = g.edges.findIndex((e) => e.from === g.negative.from && e.to === g.negative.to && e.w === g.negative.w);
  steps.push(step({
    event: 'init', lineId: 'fn',
    note: `输入里出现负权边 ${g.negative.from}→${g.negative.to}（w=${g.negative.w}）。Dijkstra 的每一步都赌"当前 dist 最小的顶点不会再被改进"，这条赌注只在非负权图上成立：一条负边可以让已经确定的顶点之后又变短。`,
    vars: { start: input.start ?? '—', 负权边: `${g.negative.from}→${g.negative.to}`, w: g.negative.w },
    layers: layersFor({ edgeStates: g.edges.map((e, i) => (i === at ? 'reject' : 'idle')), roles: { focus1: [g.negative.from], focus2: [g.negative.to] } }),
  }));
  const result = { error: NEG_MSG };
  steps.push(step({
    event: 'done', lineId: 'ret', done: true, result,
    note: `拒绝执行：${NEG_MSG}。负权（或负环）的图应改用 Bellman-Ford / SPFA，它们允许多次修正同一个顶点。`,
    vars: { error: '负权边', 建议: 'Bellman-Ford' },
    layers: layersFor({ excluded: g.nodes.map((nd) => nd.id) }),
  }));
  return trace({ algorithmId: meta.id, variantId, sourceVersion, lines: L, steps, result, meta: { rejected: 'negative-weight' } });
}

/* ------------------------------------------------------------------ 变体 1（朴素 O(V²)） */

function runV1(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const adj = adjacencyOf(g);
  const { startId, startIdx } = startOf(input, g);
  const L = LINES.v1;

  const dist = new Array(n).fill(Infinity);
  const pre = new Array(n).fill(null);
  const settled = new Array(n).fill(false);
  const order = [];
  const edgeStates = g.edges.map(() => 'idle');
  const steps = [];
  const layers = (o = {}) => panels(g, { dist, pre, settled }, o);
  const push = (o) => steps.push(step(o));
  const doneIds = () => order.map((i) => g.nodes[i].id);

  if (g.negative) {
    return rejectNegative(g, input, L, 'v1', 'dijkstra-scan-v1', layers, steps);
  }

  if (n === 0 || startIdx < 0) {
    const result = { dist: {}, pre: {}, order: [], unreachable: g.nodes.map((nd) => nd.id) };
    push({
      event: 'init', lineId: 'fn',
      note: n === 0 ? '图为空：没有顶点，dist 表是空的。' : `起点 ${startId} 不在顶点集合里：dist 表连初始化都无从谈起。`,
      vars: { start: startId ?? '—', n, 边数: g.edges.length },
      layers: layers(),
    });
    push({
      event: 'done', lineId: 'ret', done: true, result,
      note: n === 0 ? '空图：直接结束。' : '起点不存在：直接结束，所有顶点都算不可达。',
      vars: { start: startId ?? '—', 已确定: 0 },
      layers: layers(),
    });
    return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'dijkstra-scan-v1', lines: L, steps, result });
  }

  dist[startIdx] = 0;
  push({
    event: 'init', lineId: 'set-s',
    note: `dist[${startId}]=0，其余全是 ∞，S 为空。每轮挑一个 dist 最小的未确定顶点 u，settle 它，再用 u 的出边把邻居的暂定距离压小。`,
    vars: { start: startId, n, 边数: g.edges.length, 已确定: 0 },
    layers: layers({ roles: { added: [startId] }, distRoles: { added: [startIdx] } }),
  });

  let rounds = 0;
  while (true) {
    push({
      event: 'select-min', lineId: 'scan',
      note: `第 ${rounds + 1} 轮：u = -1、best = ∞，从表头重新扫一遍（上一轮的最优值不能复用，因为 dist 被松弛改过）。`,
      vars: { u: '—', best: '∞', 已确定: doneIds().join('、') || '—' },
      layers: layers({ roles: { done: doneIds() }, distRoles: { done: settledIdxOf(settled) } }),
    });

    let u = -1;
    let best = Infinity;
    for (let v = 0; v < n; v++) {
      if (settled[v]) continue;
      const better = dist[v] < best;
      push({
        event: 'select-min', lineId: 'scan-if',
        note: `看 ${g.nodes[v].id}：dist=${fmt(dist[v])}，当前最优 ${u >= 0 ? `${g.nodes[u].id}(${fmt(best)})` : '∞'}${better ? ` → ${g.nodes[v].id} 更小，成为新的 u` : ` → 不比 ${fmt(best)} 小，跳过`}。线性扫描每轮都要看完所有未确定顶点，V 轮就是 O(V²)。`,
        vars: { v: g.nodes[v].id, dist: fmt(dist[v]), u: u >= 0 ? g.nodes[u].id : '—', best: fmt(best) },
        layers: layers({
          roles: { done: doneIds() },
          distRoles: { done: settledIdxOf(settled), focus1: [v], focus2: u >= 0 ? [u] : [] },
        }),
      });
      if (better) {
        u = v;
        best = dist[v];
      }
    }

    if (u < 0) break;                                    // 剩下的全是 ∞：不可达

    settled[u] = true;
    order.push(u);
    rounds++;
    push({
      event: 'settle', lineId: 'settle',
      note: `确定 ${g.nodes[u].id}：dist=${fmt(dist[u])}，S 加它。此时它的暂定距离被"冻结"，后面不再改——这正是非负权才敢下的结论。`,
      vars: { u: g.nodes[u].id, dist: fmt(dist[u]), 已确定: order.length },
      layers: layers({ roles: { done: doneIds(), focus1: [g.nodes[u].id] }, distRoles: { done: settledIdxOf(settled), focus1: [u] } }),
    });

    for (const e of adj[u]) {
      const uId = g.nodes[u].id;
      const wId = g.nodes[e.to].id;
      const old = dist[e.to];
      if (settled[e.to]) {
        edgeStates[e.edge] = 'reject';
        push({
          event: 'reject-relax', lineId: 'relax-if',
          note: `看边 ${uId}→${wId}(${e.w})：${wId} 已确定（dist=${fmt(old)}）。非负权保证 ${uId} 的路径不可能比它更短，所以这条边不产生松弛。`,
          vars: { u: uId, w: wId, w边: e.w, 旧值: fmt(old), 新值: fmt(dist[u] + e.w) },
          layers: layers({
            roles: { done: doneIds(), focus1: [uId], focus2: [wId] },
            edgeStates,
            distRoles: { done: settledIdxOf(settled), focus1: [u], focus2: [e.to] },
          }),
        });
        continue;
      }
      const cand = dist[u] + e.w;
      if (cand < old) {
        dist[e.to] = cand;
        pre[e.to] = u;
        edgeStates[e.edge] = 'tree';
        push({
          event: 'relax', lineId: 'relax',
          note: `${uId}→${wId}：${fmt(old)} → ${cand}（${fmt(dist[u])}+${e.w}）。暂定距离被压小，pre[${wId}] 改记 ${uId}，这条边成为当前最优路径的一段。`,
          vars: { u: uId, w: wId, w边: e.w, 旧值: fmt(old), 新值: cand },
          layers: layers({
            roles: { done: doneIds(), focus1: [uId], focus2: [wId] },
            edgeStates,
            distRoles: { done: settledIdxOf(settled), added: [e.to] },
            preRoles: { focus1: [e.to] },
          }),
        });
      } else {
        edgeStates[e.edge] = 'reject';
        push({
          event: 'reject-relax', lineId: 'skip',
          note: `${uId}→${wId}：${fmt(dist[u])}+${e.w}=${cand} 不比现有的 ${fmt(old)} 小，保持原值与原 pre；这条边标成拒绝边。`,
          vars: { u: uId, w: wId, w边: e.w, 旧值: fmt(old), 新值: cand },
          layers: layers({
            roles: { done: doneIds(), focus1: [uId], focus2: [wId] },
            edgeStates,
            distRoles: { done: settledIdxOf(settled), focus1: [u], focus2: [e.to] },
          }),
        });
      }
    }
  }

  const unreached = g.nodes.filter((nd, i) => !settled[i]).map((nd) => nd.id);
  if (unreached.length) {
    push({
      event: 'unreachable', lineId: 'end-while',
      note: `${unreached.join('、')} 的 dist 始终是 ∞：所有未确定顶点的 dist 都不是有限值，循环只能停。它们不在起点 ${startId} 的可达范围里（图上没有任何从 ${startId} 指向它们的通路）。`,
      vars: { 未确定: unreached.join('、'), 已确定: order.length },
      layers: layers({ roles: { done: doneIds(), excluded: unreached }, distRoles: { done: settledIdxOf(settled), excluded: g.nodes.map((nd, i) => i).filter((i) => !settled[i]) } }),
    });
  }

  const result = resultOf(g, dist, pre, order);
  push({
    event: 'done', lineId: 'ret', done: true, result,
    note: `结束：已确定 ${order.length} 个顶点（顺序 ${order.map((i) => g.nodes[i].id).join(' → ')}）。dist 是最终最短路长度，pre 给出该最短路上每个顶点的前一个顶点。${unreached.length ? `${unreached.join('、')} 不可达。` : ''}`,
    vars: { 已确定: order.length, dist: Object.entries(result.dist).map(([k, v]) => `${k}=${v}`).join(' '), 未到达: result.unreachable.join('、') || '—' },
    layers: layers({ roles: { done: doneIds() }, distRoles: { done: settledIdxOf(settled) } }),
  });

  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'dijkstra-scan-v1', lines: L, steps, result, meta: { settles: order.length } });
}

/* ------------------------------------------------------------------ 变体 2（二叉堆 + 惰性删除） */

function runV2(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const adj = adjacencyOf(g);
  const { startId, startIdx } = startOf(input, g);
  const L = LINES.v2;

  const dist = new Array(n).fill(Infinity);
  const pre = new Array(n).fill(null);
  const settled = new Array(n).fill(false);
  const order = [];
  const edgeStates = g.edges.map(() => 'idle');
  const steps = [];
  let heap = [];            // [{ v, d, key }]，同一顶点允许多条
  let keySeq = 0;
  let staleCount = 0;
  let focusKey = null;

  const heapCells = () => heap.map((e) => memCell({
    label: `${g.nodes[e.v].id}#${e.key}`,
    name: `d=${e.d}`,
    value: e.d,
    addr: e.key,
    state: e.d > dist[e.v] ? 'invalid' : (e.key === focusKey ? 'focus' : 'node'),
  }));
  const heapTree = () => heap.map((e) => `${g.nodes[e.v].id}:${e.d}`);

  const layers = (o = {}) => panels(g, { dist, pre, settled }, { ...o, heapCells: heapCells(), heapTree: heapTree() });
  const push = (o) => steps.push(step(o));
  const doneIds = () => order.map((i) => g.nodes[i].id);

  const siftUp = (i) => {
    let k = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p].d <= heap[k].d) break;
      const t = heap[p];
      heap[p] = heap[k];
      heap[k] = t;
      k = p;
    }
  };
  const siftDown = (i) => {
    let k = i;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < heap.length && heap[l].d < heap[m].d) m = l;
      if (r < heap.length && heap[r].d < heap[m].d) m = r;
      if (m === k) break;
      const t = heap[m];
      heap[m] = heap[k];
      heap[k] = t;
      k = m;
    }
  };
  const heapPush = (v, d) => {
    heap.push({ v, d, key: keySeq++ });
    siftUp(heap.length - 1);
  };
  const heapPop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      siftDown(0);
    }
    return top;
  };

  if (g.negative) {
    return rejectNegative(g, input, L, 'v2', 'dijkstra-heap-v1', layers, steps);
  }

  if (n === 0 || startIdx < 0) {
    const result = { dist: {}, pre: {}, order: [], unreachable: g.nodes.map((nd) => nd.id) };
    push({
      event: 'init', lineId: 'fn',
      note: n === 0 ? '图为空：堆里什么都不会有。' : `起点 ${startId} 不在顶点集合里：没有可以入堆的起点。`,
      vars: { start: startId ?? '—', n, 边数: g.edges.length, 堆内: 0 },
      layers: layers(),
    });
    push({
      event: 'done', lineId: 'ret', done: true, result,
      note: n === 0 ? '空图：直接结束。' : '起点不存在：直接结束，所有顶点都算不可达。',
      vars: { start: startId ?? '—', 堆内: 0 },
      layers: layers(),
    });
    return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'dijkstra-heap-v1', lines: L, steps, result });
  }

  dist[startIdx] = 0;
  heapPush(startIdx, 0);
  focusKey = heap[0].key;
  push({
    event: 'init', lineId: 'set-s',
    note: `起点 ${startId} 以 (${startId}, 0) 入堆。与朴素版的区别：不再"每轮扫全表"，而是让堆自己把最小条目顶上来；代价是同一顶点可能有多条条目同时待在堆里。`,
    vars: { start: startId, n, 边数: g.edges.length, 堆内: heap.length, 惰性丢弃: 0 },
    layers: layers({ roles: { added: [startId] }, distRoles: { added: [startIdx] }, heapRoles: { focus1: [0] } }),
  });

  while (heap.length) {
    focusKey = heap[0].key;
    const peek = heap[0];
    push({
      event: 'select-min', lineId: 'peek',
      note: `堆顶是 (${g.nodes[peek.v].id}#${peek.key}, d=${peek.d})：堆始终把最小的 d 顶在上头，所以"选最小"是 O(1) 看、O(log V) 弹，而不是 O(V) 扫。`,
      vars: { 堆顶: `${g.nodes[peek.v].id}#${peek.key}`, d: peek.d, 堆内: heap.length, 惰性丢弃: staleCount },
      layers: layers({ roles: { done: doneIds() }, distRoles: { done: settledIdxOf(settled) }, heapRoles: { focus1: [0] } }),
    });

    const e = heapPop();
    focusKey = e.key;
    const vId = g.nodes[e.v].id;

    if (e.d > dist[e.v]) {
      staleCount++;
      push({
        event: 'reject-relax', lineId: 'stale',
        note: `弹出 (${vId}#${e.key}, d=${e.d})，但 dist[${vId}] 已经是 ${fmt(dist[e.v])} —— 这条记录被后来的更短路径作废了。惰性删除：不主动从堆中间删它，等它冒到堆顶时直接丢掉（图上这一格画成灰色 invalid）。`,
        vars: { 弹出: `${vId}#${e.key}`, 条目d: e.d, 实际dist: fmt(dist[e.v]), 惰性丢弃: staleCount, 堆内: heap.length },
        layers: layers({ roles: { done: doneIds() }, distRoles: { done: settledIdxOf(settled), focus2: [e.v] }, heapRoles: { focus1: [0] } }),
      });
      continue;
    }

    settled[e.v] = true;
    order.push(e.v);
    push({
      event: 'settle', lineId: 'settle',
      note: `第一次弹出 ${vId} 且 d 与 dist 相符 → 它的最终距离就是 ${fmt(dist[e.v])}，标记 S。之后它可能还有别的（更大的）条目留在堆里，那些都会被惰性丢弃。`,
      vars: { u: vId, dist: fmt(dist[e.v]), 已确定: order.length, 堆内: heap.length },
      layers: layers({ roles: { done: doneIds(), focus1: [vId] }, distRoles: { done: settledIdxOf(settled), focus1: [e.v] }, heapRoles: { focus1: [0] } }),
    });

    for (const ej of adj[e.v]) {
      const wId = g.nodes[ej.to].id;
      const old = dist[ej.to];
      if (settled[ej.to]) {
        edgeStates[ej.edge] = 'reject';
        push({
          event: 'reject-relax', lineId: 'relax-if',
          note: `${vId}→${wId}(${ej.w})：${wId} 已确定（dist=${fmt(old)}）。非负权下绕一圈只会更远，这条边不产生新条目。`,
          vars: { u: vId, w: wId, w边: ej.w, 旧值: fmt(old), 堆内: heap.length },
          layers: layers({ roles: { done: doneIds(), focus1: [vId], focus2: [wId] }, edgeStates, distRoles: { done: settledIdxOf(settled), focus1: [e.v], focus2: [ej.to] } }),
        });
        continue;
      }
      const cand = dist[e.v] + ej.w;
      if (cand < old) {
        dist[ej.to] = cand;
        pre[ej.to] = e.v;
        edgeStates[ej.edge] = 'tree';
        heapPush(ej.to, cand);
        const added = heap[heap.length - 1].key;
        focusKey = added;
        push({
          event: 'relax', lineId: 'relax',
          note: `${vId}→${wId}：${fmt(old)} → ${cand}，pre[${wId}]=${vId}。注意：${wId} 的旧条目（如果有）**仍留在堆里**，新条目 (${wId}#${added}, d=${cand}) 也入堆，所以同一顶点在堆里出现多次——这是惰性删除的直接代价。`,
          vars: { u: vId, w: wId, w边: ej.w, 旧值: fmt(old), 新值: cand, 堆内: heap.length },
          layers: layers({
            roles: { done: doneIds(), focus1: [vId], focus2: [wId] },
            edgeStates,
            distRoles: { done: settledIdxOf(settled), added: [ej.to] },
            preRoles: { focus1: [ej.to] },
          }),
        });
        push({
          event: 'relax', lineId: 'push',
          note: `新条目入堆后要 sift-up 恢复堆序：堆形状变了但"最小在上"不变，所以下一轮"选最小"依然只看得见堆顶。堆里现在同时有 ${heap.length} 条记录，其中 ${heap.filter((x) => x.d > dist[x.v]).length} 条是待丢弃的旧记录。`,
          vars: { 新条目: `${wId}#${added}`, d: cand, 堆内: heap.length, 待丢弃: heap.filter((x) => x.d > dist[x.v]).length },
          layers: layers({ roles: { done: doneIds() }, distRoles: { done: settledIdxOf(settled) }, heapRoles: { focus1: [0] } }),
        });
      } else {
        edgeStates[ej.edge] = 'reject';
        push({
          event: 'reject-relax', lineId: 'skip',
          note: `${vId}→${wId}：${fmt(dist[e.v])}+${ej.w}=${cand} 不比 ${fmt(old)} 小，不产生新条目。堆的大小因此不增长。`,
          vars: { u: vId, w: wId, w边: ej.w, 旧值: fmt(old), 新值: cand, 堆内: heap.length },
          layers: layers({ roles: { done: doneIds(), focus1: [vId], focus2: [wId] }, edgeStates, distRoles: { done: settledIdxOf(settled), focus1: [e.v], focus2: [ej.to] } }),
        });
      }
    }
  }

  const unreached = g.nodes.filter((nd, i) => !settled[i]).map((nd) => nd.id);
  if (unreached.length) {
    push({
      event: 'unreachable', lineId: 'end-while',
      note: `堆空了，但 ${unreached.join('、')} 一次也没被弹出来：它们从来没有过有限的 dist，也就从来没有入过堆（或入的不是有限值）。`,
      vars: { 未确定: unreached.join('、'), 已确定: order.length, 堆内: 0, 惰性丢弃: staleCount },
      layers: layers({ roles: { done: doneIds(), excluded: unreached }, distRoles: { done: settledIdxOf(settled), excluded: g.nodes.map((nd, i) => i).filter((i) => !settled[i]) } }),
    });
  }

  const result = resultOf(g, dist, pre, order);
  push({
    event: 'done', lineId: 'ret', done: true, result,
    note: `结束：${order.length} 个顶点被弹出并确定（${order.map((i) => g.nodes[i].id).join(' → ')}），另有 ${staleCount} 条旧条目被惰性丢弃。dist/pre 与朴素版结果相同——堆只是换了"选最小"的手段。`,
    vars: { 已确定: order.length, 惰性丢弃: staleCount, dist: Object.entries(result.dist).map(([k, v]) => `${k}=${v}`).join(' '), 未到达: result.unreachable.join('、') || '—' },
    layers: layers({ roles: { done: doneIds() }, distRoles: { done: settledIdxOf(settled) } }),
  });

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'dijkstra-heap-v1', lines: L, steps, result, meta: { settles: order.length, stale: staleCount } });
}

/* ------------------------------------------------------------------ 变体 3（路径回溯版） */

function runV3(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const adj = adjacencyOf(g);
  const { startId, startIdx } = startOf(input, g);
  const L = LINES.v3;

  const dist = new Array(n).fill(Infinity);
  const pre = new Array(n).fill(null);
  const settled = new Array(n).fill(false);
  const order = [];
  const edgeStates = g.edges.map(() => 'idle');
  const steps = [];
  const layers = (o = {}) => panels(g, { dist, pre, settled }, o);
  const push = (o) => steps.push(step(o));
  const doneIds = () => order.map((i) => g.nodes[i].id);

  /** 沿 pre 从 v 回溯到起点，返回 [起点, …, v] */
  const chainOf = (v) => {
    const out = [];
    let cur = v;
    let guard = 0;
    while (cur != null && guard++ <= n) {
      out.push(cur);
      cur = pre[cur];
    }
    return out.reverse();
  };
  const markChain = (v, verdict) => {
    const chain = chainOf(v);
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = g.nodes[chain[i]].id;
      const b = g.nodes[chain[i + 1]].id;
      const at = g.edges.findIndex((e) => e.from === a && e.to === b);
      if (at >= 0) edgeStates[at] = verdict;
    }
    return chain;
  };

  if (g.negative) {
    return rejectNegative(g, input, L, 'v3', 'dijkstra-path-v1', layers, steps);
  }

  if (n === 0 || startIdx < 0) {
    const result = { dist: {}, pre: {}, order: [], unreachable: g.nodes.map((nd) => nd.id), path: [], pathWeight: null };
    push({
      event: 'init', lineId: 'fn',
      note: n === 0 ? '图为空：dist/pre 都为空，没有可回溯的路径。' : `起点 ${startId} 不在顶点集合里：无法开始。`,
      vars: { start: startId ?? '—', n, 边数: g.edges.length },
      layers: layers(),
    });
    push({
      event: 'done', lineId: 'ret', done: true, result,
      note: n === 0 ? '空图：直接结束。' : '起点不存在：直接结束，路径为空。',
      vars: { start: startId ?? '—', 路径: '（空）' },
      layers: layers(),
    });
    return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'dijkstra-path-v1', lines: L, steps, result });
  }

  dist[startIdx] = 0;
  push({
    event: 'init', lineId: 'set-s',
    note: `dist[${startId}]=0，pre[${startId}]=—（回溯时它就是路的开头）。本变体的重点不是"求出距离"，而是把 pre[] 维护成一条真正可读的链：每次改进都记下这一跳。`,
    vars: { start: startId, n, 边数: g.edges.length, 已确定: 0 },
    layers: layers({ roles: { added: [startId] }, distRoles: { added: [startIdx] } }),
  });

  while (true) {
    let u = -1;
    let best = Infinity;
    for (let v = 0; v < n; v++) {
      if (settled[v]) continue;
      if (dist[v] < best) {
        u = v;
        best = dist[v];
      }
    }
    if (u < 0) break;

    push({
      event: 'select-min', lineId: 'scan',
      note: `扫过全部未确定顶点，最小的仍然是 ${g.nodes[u].id}（dist=${fmt(dist[u])}）。本变体把"扫描过程"压成一步，腾出讲解预算给后面的回溯。`,
      vars: { u: g.nodes[u].id, dist: fmt(dist[u]), 已确定: doneIds().join('、') || '—' },
      layers: layers({ roles: { done: doneIds() }, distRoles: { done: settledIdxOf(settled), focus1: [u] } }),
    });

    settled[u] = true;
    order.push(u);
    push({
      event: 'settle', lineId: 'settle',
      note: `确定 ${g.nodes[u].id}（dist=${fmt(dist[u])}，pre=${g.nodes[u].id} 的前驱是 ${pre[u] == null ? '—' : g.nodes[pre[u]].id}）。已确定的顶点不会再被改进，所以它上面那段 pre 链从此是最终答案的一部分。`,
      vars: { u: g.nodes[u].id, dist: fmt(dist[u]), 已确定: order.length },
      layers: layers({ roles: { done: doneIds(), focus1: [g.nodes[u].id] }, distRoles: { done: settledIdxOf(settled), focus1: [u] } }),
    });

    for (const e of adj[u]) {
      const uId = g.nodes[u].id;
      const wId = g.nodes[e.to].id;
      const old = dist[e.to];
      const cand = dist[u] + e.w;
      if (settled[e.to]) {
        edgeStates[e.edge] = 'reject';
        push({
          event: 'reject-relax', lineId: 'relax-if',
          note: `${uId}→${wId}(${e.w})：${wId} 已确定（dist=${fmt(old)}），非负权下不可能再变短，pre[${wId}] 保持 ${pre[e.to] == null ? '—' : g.nodes[pre[e.to]].id}。`,
          vars: { u: uId, w: wId, w边: e.w, 旧值: fmt(old), 新值: fmt(cand) },
          layers: layers({ roles: { done: doneIds(), focus1: [uId], focus2: [wId] }, edgeStates, distRoles: { done: settledIdxOf(settled), focus1: [u], focus2: [e.to] }, preRoles: { focus2: [e.to] } }),
        });
        continue;
      }
      if (cand < old) {
        dist[e.to] = cand;
        pre[e.to] = u;
        edgeStates[e.edge] = 'tree';
        push({
          event: 'relax', lineId: 'relax',
          note: `${uId}→${wId}：${fmt(old)} → ${cand}，pre[${wId}] 改写成 ${uId}。距离只是数字，pre 才是"路"：改 pre 等于把这棵最短路树的一条边换掉。`,
          vars: { u: uId, w: wId, w边: e.w, 旧值: fmt(old), 新值: cand, pre: `${wId}←${uId}` },
          layers: layers({
            roles: { done: doneIds(), focus1: [uId], focus2: [wId] },
            edgeStates,
            distRoles: { done: settledIdxOf(settled), added: [e.to] },
            preRoles: { focus1: [e.to] },
          }),
        });
        const chain = markChain(e.to, 'path');
        push({
          event: 'relax', lineId: 'chain',
          note: `立刻沿 pre 回溯：${chain.map((i) => g.nodes[i].id).join(' ← ')}。这条链就是到 ${wId} 的完整最短路（合计 ${fmt(dist[e.to])}），整段被涂成路径色——不用等到算法结束就能核对 pre 是否正确。`,
          vars: { 链: chain.map((i) => g.nodes[i].id).join('←'), 合计: fmt(dist[e.to]) },
          layers: layers({
            roles: { done: doneIds(), added: chain.map((i) => g.nodes[i].id) },
            edgeStates,
            distRoles: { done: settledIdxOf(settled), added: [e.to] },
            preRoles: { added: [e.to] },
          }),
        });
      } else {
        edgeStates[e.edge] = 'reject';
        push({
          event: 'reject-relax', lineId: 'skip',
          note: `${uId}→${wId}：${fmt(dist[u])}+${e.w}=${cand} 不比 ${fmt(old)} 小，保留原 dist 与原 pre（原来那段链更划算）。`,
          vars: { u: uId, w: wId, w边: e.w, 旧值: fmt(old), 新值: cand },
          layers: layers({ roles: { done: doneIds(), focus1: [uId], focus2: [wId] }, edgeStates, distRoles: { done: settledIdxOf(settled), focus1: [u], focus2: [e.to] }, preRoles: { focus2: [e.to] } }),
        });
      }
    }
  }

  const unreached = g.nodes.filter((nd, i) => !settled[i]).map((nd) => nd.id);
  if (unreached.length) {
    push({
      event: 'unreachable', lineId: 'end-while',
      note: `${unreached.join('、')} 的 dist 始终是 ∞，没有可回溯的东西：它们的 pre 还是 —。`,
      vars: { 未确定: unreached.join('、'), 已确定: order.length },
      layers: layers({ roles: { done: doneIds(), excluded: unreached }, distRoles: { done: settledIdxOf(settled), excluded: g.nodes.map((nd, i) => i).filter((i) => !settled[i]) } }),
    });
  }

  // ---- 结束后从终点回溯，逐跳打印整条最短路
  const wanted = input && input.target != null ? str(input.target) : null;
  let targetIdx = wanted != null ? g.nodes.findIndex((nd) => nd.id === wanted) : -1;
  if (targetIdx < 0 || !Number.isFinite(dist[targetIdx])) {
    targetIdx = order.length ? order[order.length - 1] : startIdx;   // 没指定终点：取最后被确定的顶点
  }
  const targetId = g.nodes[targetIdx].id;

  push({
    event: 'select-min', lineId: 'bt-init',
    note: `回溯准备：从终点 ${targetId} 开始（dist=${fmt(dist[targetIdx])}）。回溯不需要 dist，只需要 pre——每一步问"我是从谁被松弛出来的"。`,
    vars: { t: targetId, dist: fmt(dist[targetIdx]), pre: pre[targetIdx] == null ? '—' : g.nodes[pre[targetIdx]].id },
    layers: layers({ roles: { done: doneIds(), focus1: [targetId] }, distRoles: { done: settledIdxOf(settled), focus2: [targetIdx] }, preRoles: { focus1: [targetIdx] } }),
  });

  let cur = targetIdx;
  const path = [targetIdx];
  let guard = 0;
  while (pre[cur] != null && guard++ <= n) {
    const from = pre[cur];
    const a = g.nodes[from].id;
    const b = g.nodes[cur].id;
    const at = g.edges.findIndex((e) => e.from === a && e.to === b);
    if (at >= 0) edgeStates[at] = 'path';
    path.unshift(from);
    cur = from;
    push({
      event: 'relax', lineId: 'bt-hop',
      note: `回溯一步：pre[${b}] = ${a} → ${a}→${b}(${g.edges[at] ? g.edges[at].w : '?'}) 是这条最短路的一段。继续问 pre[${a}]。`,
      vars: { 当前: b, 前驱: a, 已回溯: path.map((i) => g.nodes[i].id).join('←') },
      layers: layers({
        roles: { done: doneIds(), focus1: [a], focus2: [b] },
        edgeStates,
        distRoles: { done: settledIdxOf(settled), focus2: [cur] },
        preRoles: { focus1: [cur], added: path.slice() },
      }),
    });
  }

  const pathIds = path.map((i) => g.nodes[i].id);
  const pathWeight = Number.isFinite(dist[targetIdx]) ? dist[targetIdx] : null;
  const result = { ...resultOf(g, dist, pre, order), path: pathIds, pathWeight };

  push({
    event: 'done', lineId: 'ret', done: true, result,
    note: `回溯到起点 ${startId}，最短路整条读出：${pathIds.join(' → ')}（合计 ${fmt(pathWeight)}）。距离正确只是必要条件；能读出一条真正连通的边序列，才算证明 pre 链没写错。${unreached.length ? `（${unreached.join('、')} 不可达，没有路径。）` : ''}`,
    vars: { 路径: pathIds.join(' → '), 权重: fmt(pathWeight), 已确定: order.length, 未到达: result.unreachable.join('、') || '—' },
    layers: layers({ roles: { done: doneIds(), added: pathIds }, distRoles: { done: settledIdxOf(settled), focus1: [targetIdx] } }),
  });

  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'dijkstra-path-v1', lines: L, steps, result, meta: { settles: order.length, path: pathIds } });
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
