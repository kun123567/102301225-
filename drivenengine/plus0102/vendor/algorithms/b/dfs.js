/**
 * B · DFS（3 个代表性不同实现）
 *
 *   v1 递归版：进入即标记、即访问；调用栈就是"深度优先"的可视化本体，返回时才回溯；
 *   v2 显式栈迭代：自己管理栈，出栈才标记、才访问 —— 因此**次序与递归版不同**
 *      （邻接表里靠后的邻点先进栈，反而先出栈），还会出现"同一顶点被压了多次副本"：
 *      旧副本出栈时按 visited 丢弃，这就是"惰性删除"；
 *   v3 三色标记版：白（未访问）/ 灰（在栈上）/ 黑（已完成），灰点相遇即回边 ⇒ 能直接报告环。
 *
 * 事件只用目录词表里的 init/enter/explore/backtrack/visit/finish/done。
 * v2 的访问顺序在样例里用 expectByVariant 单独声明 —— 它合法地不同于 v1/v3，不为通过校验而改算法。
 */

import { trace, step, graphLayer, stackLayer, treeLayer, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'b/dfs',
  variants: [
    { id: 'v1', name: '递归版' },
    { id: 'v2', name: '显式栈迭代' },
    { id: 'v3', name: '三色标记版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void DFS(ALGraph *g, int u) {' },
    { lineId: 'mark', text: '  visited[u] = TRUE;  Visit(u);          /* 进入即标记、即访问 */' },
    { lineId: 'for', text: '  for (p = g->vex[u].firstarc; p; p = p->next) {' },
    { lineId: 'adj', text: '    w = p->adjvex;' },
    { lineId: 'check', text: '    if (visited[w]) continue;            /* 已访问的邻点不再深入 */' },
    { lineId: 'descend', text: '    DFS(g, w);                           /* 未访问 → 压新的一层 */' },
    { lineId: 'end-for', text: '  }' },
    { lineId: 'backtrack', text: '  /* 邻点全部处理完：本层函数返回 → 弹栈回溯到父层 */' },
    { lineId: 'ret', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void DFS_iter(ALGraph *g, int s) {' },
    { lineId: 'init', text: '  InitStack(&S);  Push(&S, s);           /* 起点先入栈，此时还不标记 */' },
    { lineId: 'while-S', text: '  while (!StackEmpty(&S)) {' },
    { lineId: 'pop', text: '    u = Pop(&S);' },
    { lineId: 'dup', text: '    if (visited[u]) continue;            /* 旧副本：出栈才发现已访问 → 丢弃 */' },
    { lineId: 'mark', text: '    visited[u] = TRUE;  Visit(u);         /* 出栈即访问：与递归版时机不同 */' },
    { lineId: 'for', text: '    for (p = g->vex[u].firstarc; p; p = p->next) {' },
    { lineId: 'adj', text: '      w = p->adjvex;' },
    { lineId: 'push-w', text: '      if (!visited[w]) Push(&S, w);       /* 只压栈不标记 → 可能重复入栈 */' },
    { lineId: 'end-for', text: '    }' },
    { lineId: 'ret', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void DFS_color(ALGraph *g, int u) {          /* color: WHITE / GRAY / BLACK */' },
    { lineId: 'init', text: '  color[v] = WHITE;  parent[v] = -1;' },
    { lineId: 'enter', text: '  color[u] = GRAY;  Visit(u);             /* 首次访问：入栈即变灰 */' },
    { lineId: 'for', text: '  for (p = g->vex[u].firstarc; p; p = p->next) {' },
    { lineId: 'adj', text: '    w = p->adjvex;' },
    { lineId: 'skip-parent', text: '    if (w == parent[u]) continue;         /* 父边回头看不算回边 */' },
    { lineId: 'gray', text: '    if (color[w] == GRAY) ReportCycle(u, w);  /* 灰点=祖先 → 回边 → 有环 */' },
    { lineId: 'descend', text: '    if (color[w] == WHITE) DFS_color(g, w);   /* 白点 → 深入一层 */' },
    { lineId: 'black', text: '    /* 黑点：已完成，属于跨边/前向边，不再深入 */' },
    { lineId: 'end-for', text: '  }' },
    { lineId: 'finish', text: '  color[u] = BLACK;                       /* 邻点全处理完 → 变黑 */' },
    { lineId: 'popback', text: '  /* 出栈：控制权交回父层（父层继续它自己的邻接表）*/' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

const NODES = (ids) => ids.map((id) => ({ id, label: id }));
const EDGES = (pairs) => pairs.map(([from, to]) => ({ from, to }));
const TREE_GRAPH = {
  directed: false,
  nodes: NODES(['A', 'B', 'C', 'D']),
  edges: EDGES([['A', 'B'], ['A', 'C'], ['B', 'D']]),
};
const CYCLE_GRAPH = {
  directed: false,
  nodes: NODES(['A', 'B', 'C', 'D']),
  edges: EDGES([['A', 'B'], ['A', 'C'], ['B', 'D'], ['D', 'A']]),   // D–A 成环 A-B-D-A
};
const EMPTY = { directed: false, nodes: [], edges: [] };

export const samples = [
  {
    id: 'normal',
    label: 'A–B、A–C、B–D，从 A 出发（递归序 A,B,D,C；栈迭代序 A,C,B,D）',
    input: { graph: TREE_GRAPH, start: 'A' },
    expect: { order: ['A', 'B', 'D', 'C'], visitedCount: 4 },
    expectByVariant: {
      v2: { order: ['A', 'C', 'B', 'D'], visitedCount: 4 },
      v3: { order: ['A', 'B', 'D', 'C'], visitedCount: 4, hasCycle: false, backEdges: [] },
    },
  },
  {
    id: 'edge-cycle',
    label: '在上面加 D–A 成环（同一个点不会被访问两次；三色版报出回边 D→A）',
    input: { graph: CYCLE_GRAPH, start: 'A' },
    expect: { order: ['A', 'B', 'D', 'C'], visitedCount: 4 },
    expectByVariant: {
      v2: { order: ['A', 'D', 'B', 'C'], visitedCount: 4 },
      v3: { order: ['A', 'B', 'D', 'C'], visitedCount: 4, hasCycle: true, backEdges: [['D', 'A']] },
    },
  },
  {
    id: 'edge-empty',
    label: '空图（0 个顶点，栈始终为空）',
    input: { graph: EMPTY, start: 'A' },
    expect: { order: [], visitedCount: 0 },
    expectByVariant: {
      v2: { order: [], visitedCount: 0 },
      v3: { order: [], visitedCount: 0, hasCycle: false, backEdges: [] },
    },
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
  for (const e of raw.edges || []) {
    const from = str(e.from);
    const to = str(e.to);
    if (!known.has(from) || !known.has(to) || from === to) continue;
    edges.push({ from, to, w: e.w });
  }
  return { directed: !!raw.directed, nodes, edges };
}

function indexOf(g) {
  const m = new Map();
  g.nodes.forEach((nd, i) => m.set(nd.id, i));
  return m;
}

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

/** 调用栈 / 显式栈：cells[0] 是栈底，最后一个是栈顶 */
function stackPanel(o) {
  const frames = o.frames || [];
  return stackLayer({
    id: o.id,
    title: o.title,
    name: o.name || '',
    cells: frames.map((f, i) => ({ value: f.value, label: f.label ?? `层${i}`, badge: f.badge })),
    top: frames.length ? frames.length - 1 : null,
    capacity: o.capacity ?? 8,
    bottomLabel: o.bottomLabel || 'bottom',
    topLabel: o.topLabel || 'top',
    roles: o.roles || {},
  });
}

/* ------------------------------------------------------------------ 变体 1（递归版） */

function runV1(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const adj = adjacencyOf(g);
  const { startId, startIdx } = startOf(input, g);
  const L = LINES.v1;

  const states = g.edges.map(() => 'idle');
  const visited = new Array(n).fill(false);
  const badge = new Array(n).fill(null);
  const order = [];
  const frames = [];
  const steps = [];
  let tail = '';

  const layers = (o = {}) => [
    graphPanel(g, {
      title: `图（${g.directed ? '有向' : '无向'}）`,
      name: 'ALGraph',
      roles: o.roles || {},
      edgeStates: states,
      subOf: (i) => (visited[i] ? `#${badge[i] ? badge[i].slice(1) : '·'}` : '未访问'),
      badgeOf: (i) => badge[i],
    }),
    stackPanel({
      id: 'call-stack', title: '调用栈（栈顶 = 正在跑的那层）', name: 'Call stack',
      frames: frames.map((f, i) => ({ value: `DFS(${g.nodes[f.idx].id})`, label: `层${i}` })),
      roles: o.stackRoles || {},
    }),
  ];
  const push = (o) => {
    steps.push(step({ ...o, note: tail ? `${o.note}${tail}` : o.note }));
    tail = '';
  };
  const unreached = () => g.nodes.filter((nd, i) => !visited[i]).map((nd) => nd.id);

  push({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '图为空：没有顶点可以进入递归。'
      : `共 ${n} 个顶点、${g.edges.length} 条边。递归版的可视化重点是调用栈：每深入一层就压一帧，每返回一次就弹一帧。`,
    vars: { start: startId ?? '—', n, edges: g.edges.length, depth: 0, visited: 0, order: '（空）' },
    layers: layers({ roles: startIdx >= 0 ? { focus1: [g.nodes[startIdx].id] } : {} }),
  });

  if (n === 0 || startIdx < 0) {
    push({
      event: 'finish', lineId: 'backtrack',
      note: n === 0 ? '没有顶点：调用栈永远是空的。' : `起点 ${startId} 不在顶点集合里：连第一次调用都发不出去。`,
      vars: { start: startId ?? '—', n, depth: 0, visited: 0, order: '（空）' },
      layers: layers(),
    });
    const result = { order: [], visitedCount: 0, start: null, unreached: g.nodes.map((nd) => nd.id) };
    push({
      event: 'done', lineId: 'ret', done: true, result,
      note: 'DFS 结束：访问序列为空。',
      vars: { start: startId ?? '—', visited: 0, order: '（空）' },
      layers: layers(),
    });
    return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'dfs-recursive-v1', lines: L, steps, result, meta: { depth: 0 } });
  }

  let maxDepth = 0;
  const walk = (u) => {
    const uId = g.nodes[u].id;
    frames.push({ idx: u });
    maxDepth = Math.max(maxDepth, frames.length);
    push({
      event: 'enter', lineId: 'fn',
      note: `DFS(${uId}) 被调用，调用栈压到第 ${frames.length} 层。递归版靠"调用"完成下降，所以栈帧顺序就是深入顺序。`,
      vars: { start: startId, u: uId, depth: frames.length, visited: order.length, order: order.join(' → ') || '（空）' },
      layers: layers({ roles: { focus1: [uId], added: [uId], done: order.slice() } }),
    });

    visited[u] = true;
    order.push(uId);
    badge[u] = `#${order.length}`;
    push({
      event: 'visit', lineId: 'mark',
      note: `标记并访问 ${uId}（第 ${order.length} 个）。递归版"进入即访问"，所以访问序列等于调用序列。`,
      vars: { start: startId, u: uId, depth: frames.length, visited: order.length, order: order.join(' → ') },
      layers: layers({ roles: { focus1: [uId], done: order.slice() } }),
    });

    const nb = adj[u].map((w) => g.nodes[w].id);
    for (const w of adj[u]) {
      const wId = g.nodes[w].id;
      if (visited[w]) {
        setEdge(states, g, uId, wId, 'reject');
        push({
          event: 'explore', lineId: 'check',
          note: `考察边 ${uId}–${wId}：${wId} 已被访问，不再深入——这条边标为灰色拒绝边，它可能是回路，也可能只是"来路"。`,
          vars: { start: startId, u: uId, w: wId, depth: frames.length, visited: order.length, 邻接: nb.join('、') },
          layers: layers({ roles: { focus1: [uId], focus2: [wId], done: order.slice() } }),
        });
        continue;
      }
      setEdge(states, g, uId, wId, 'active');
      push({
        event: 'explore', lineId: 'descend',
        note: `考察边 ${uId}–${wId}：${wId} 还没访问，这条边成为树边，下一行就是递归调用 DFS(${wId})。`,
        vars: { start: startId, u: uId, w: wId, depth: frames.length, visited: order.length, 邻接: nb.join('、') },
        layers: layers({ roles: { focus1: [uId], focus2: [wId], done: order.slice() } }),
      });
      setEdge(states, g, uId, wId, 'tree');
      walk(w);
    }

    frames.pop();
    const last = frames.length === 0;
    push({
      event: last ? 'finish' : 'backtrack',
      lineId: last ? 'backtrack' : 'backtrack',
      note: last
        ? `${uId} 的邻点全部处理完，调用栈已经空了：整趟 DFS 结束，访问序列 ${order.join(' → ')}。`
        : `${uId} 的邻点全部处理完，函数返回 → 弹栈，回溯到父节点 ${g.nodes[frames[frames.length - 1].idx].id}。`,
      vars: { start: startId, u: uId, depth: frames.length, visited: order.length, order: order.join(' → ') },
      layers: layers({ roles: { done: order.slice(), ...(last ? {} : { focus1: [g.nodes[frames[frames.length - 1].idx].id] }) } }),
    });
  };

  walk(startIdx);

  const rest = unreached();
  const result = { order: order.slice(), visitedCount: order.length, start: startId, unreached: rest, maxDepth };
  push({
    event: 'done', lineId: 'ret', done: true, result,
    note: `DFS 结束：${order.join(' → ')}，最大递归深度 ${maxDepth}。${rest.length ? `${rest.join('、')} 不在 start 的连通分量里，所以没被访问。` : '所有顶点都被访问过。'}`,
    vars: { start: startId, n, edges: g.edges.length, depth: 0, visited: order.length, order: order.join(' → '), 未到达: rest.join('、') || '—' },
    layers: layers({ roles: { done: order.slice() } }),
  });
  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'dfs-recursive-v1', lines: L, steps, result, meta: { maxDepth } });
}

/* ------------------------------------------------------------------ 变体 2（显式栈迭代） */

function runV2(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const adj = adjacencyOf(g);
  const { startId, startIdx } = startOf(input, g);
  const L = LINES.v2;

  const states = g.edges.map(() => 'idle');
  const visited = new Array(n).fill(false);
  const badge = new Array(n).fill(null);
  const order = [];
  const stack = [];
  const steps = [];
  let duplicates = 0;
  let tail = '';

  const layers = (o = {}) => [
    graphPanel(g, {
      title: `图（${g.directed ? '有向' : '无向'}）`,
      name: 'ALGraph · 迭代',
      roles: o.roles || {},
      edgeStates: states,
      subOf: (i) => (visited[i] ? `#${badge[i] ? badge[i].slice(1) : '·'}` : '未访问'),
      badgeOf: (i) => badge[i],
    }),
    stackPanel({
      id: 'explicit-stack', title: '显式栈（栈顶 = 下一个出栈的）', name: 'Stack S',
      frames: stack.map((it, i) => ({ value: g.nodes[it.idx].id, label: `S[${i}]`, badge: visited[it.idx] ? '旧副本' : '待访问' })),
      topLabel: 'top',
      roles: o.stackRoles || {},
    }),
  ];
  const push = (o) => {
    steps.push(step({ ...o, note: tail ? `${o.note}${tail}` : o.note }));
    tail = '';
  };

  push({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '图为空：显式栈也没有东西可压。'
      : `共 ${n} 个顶点、${g.edges.length} 条边。迭代版把"递归"换成自己维护的栈：只压栈、不标记，等出栈时才标记+访问。`,
    vars: { start: startId ?? '—', n, edges: g.edges.length, stack: '（空）', visited: 0, order: '（空）' },
    layers: layers({ roles: startIdx >= 0 ? { focus1: [g.nodes[startIdx].id] } : {} }),
  });

  if (n === 0 || startIdx < 0) {
    push({
      event: 'finish', lineId: 'ret',
      note: n === 0 ? '没有顶点：栈始终为空。' : `起点 ${startId} 不在顶点集合里：没有可压栈的起点。`,
      vars: { start: startId ?? '—', n, stack: '（空）', visited: 0, order: '（空）' },
      layers: layers(),
    });
    const result = { order: [], visitedCount: 0, start: null, duplicates: 0, unreached: g.nodes.map((nd) => nd.id) };
    push({
      event: 'done', lineId: 'ret', done: true, result,
      note: 'DFS 结束：访问序列为空。',
      vars: { start: startId ?? '—', visited: 0, order: '（空）' },
      layers: layers(),
    });
    return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'dfs-explicit-stack-v1', lines: L, steps, result, meta: { duplicates } });
  }

  stack.push({ idx: startIdx });
  push({
    event: 'enter', lineId: 'init',
    note: `把起点 ${startId} 压栈。注意这里**不标记** visited：标记推迟到出栈那一刻，所以同一个顶点可能被压好几次。`,
    vars: { start: startId, u: '—', w: '—', stack: `${startId}`, visited: 0, order: '（空）' },
    layers: layers({ roles: { focus1: [startId], added: [startId] }, stackRoles: { focus1: [0] } }),
  });

  let maxStack = 1;
  while (stack.length) {
    maxStack = Math.max(maxStack, stack.length);
    const top = stack.pop();
    const u = top.idx;
    const uId = g.nodes[u].id;

    if (visited[u]) {
      duplicates++;
      push({
        event: 'backtrack', lineId: 'dup',
        note: `出栈的是 ${uId}，但它已经被访问过了——这是早先某次压栈留下的旧副本。按 visited 丢弃即可，不用回退任何状态。`,
        vars: { start: startId, u: uId, w: '—', stack: stack.map((it) => g.nodes[it.idx].id).join(' → ') || '（空）', visited: order.length, 丢弃副本: duplicates },
        layers: layers({ roles: { added: [uId], done: order.slice() } }),
      });
      continue;
    }

    visited[u] = true;
    order.push(uId);
    badge[u] = `#${order.length}`;
    push({
      event: 'visit', lineId: 'mark',
      note: `${uId} 出栈即访问（第 ${order.length} 个）。递归版是"进入就访问"，这里推迟到出栈，访问顺序因此和递归版不同。`,
      vars: { start: startId, u: uId, w: '—', stack: stack.map((it) => g.nodes[it.idx].id).join(' → ') || '（空）', visited: order.length, order: order.join(' → ') },
      layers: layers({ roles: { focus1: [uId], done: order.slice() } }),
    });

    const nb = adj[u].map((w) => g.nodes[w].id);
    for (const w of adj[u]) {
      const wId = g.nodes[w].id;
      if (visited[w]) {
        setEdge(states, g, uId, wId, 'reject');
        push({
          event: 'explore', lineId: 'push-w',
          note: `${wId} 已经访问过 → 不压栈。迭代版只在这一处判 visited，所以不会无限压。`,
          vars: { start: startId, u: uId, w: wId, stack: stack.map((it) => g.nodes[it.idx].id).join(' → ') || '（空）', visited: order.length, 邻接: nb.join('、') },
          layers: layers({ roles: { focus1: [uId], focus2: [wId], done: order.slice() } }),
        });
        continue;
      }
      setEdge(states, g, uId, wId, 'active');
      stack.push({ idx: w });
      push({
        event: 'explore', lineId: 'push-w',
        note: `${wId} 还没被标记 → 压栈。它此刻既没访问也没标记，所以邻接表里靠后的邻点会顶在栈顶、先出栈——这就是和递归版次序相反的根源。`,
        vars: { start: startId, u: uId, w: wId, stack: stack.map((it) => g.nodes[it.idx].id).join(' → '), visited: order.length, 邻接: nb.join('、') },
        layers: layers({ roles: { focus1: [uId], focus2: [wId], done: order.slice() }, stackRoles: { focus2: [stack.length - 1] } }),
      });
      setEdge(states, g, uId, wId, 'tree');
    }
  }

  const rest = g.nodes.filter((nd, i) => !visited[i]).map((nd) => nd.id);
  const result = { order: order.slice(), visitedCount: order.length, start: startId, duplicates, unreached: rest, maxStack };
  push({
    event: 'finish', lineId: 'ret',
    note: `栈空了：迭代 DFS 结束，访问序列 ${order.join(' → ')}。整场压栈峰值 ${maxStack} 帧，其中 ${duplicates} 个是出栈时才丢弃的旧副本。`,
    vars: { start: startId, n, edges: g.edges.length, stack: '（空）', visited: order.length, 丢弃副本: duplicates, order: order.join(' → ') },
    layers: layers({ roles: { done: order.slice() } }),
  });
  push({
    event: 'done', lineId: 'ret', done: true, result,
    note: `与递归版对照：同样的图、同样的邻接表顺序，这里的访问次序是 ${order.join(' → ')}，因为"靠后的邻点先出栈"。${rest.length ? `未到达：${rest.join('、')}。` : ''}`,
    vars: { start: startId, n, visited: order.length, 丢弃副本: duplicates, order: order.join(' → '), 未到达: rest.join('、') || '—' },
    layers: layers({ roles: { done: order.slice() } }),
  });
  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'dfs-explicit-stack-v1', lines: L, steps, result, meta: { duplicates, maxStack } });
}

/* ------------------------------------------------------------------ 变体 3（三色标记） */

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;
const COLOR_NAME = ['白', '灰', '黑'];

function runV3(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const adj = adjacencyOf(g);
  const { startId, startIdx } = startOf(input, g);
  const L = LINES.v3;

  const states = g.edges.map(() => 'idle');
  const color = new Array(n).fill(WHITE);
  const parent = new Array(n).fill(-1);
  const badge = new Array(n).fill(null);
  const order = [];
  const frames = [];
  const backEdges = [];
  const steps = [];
  let tail = '';

  const layers = (o = {}) => {
    const gray = [];
    const black = [];
    g.nodes.forEach((nd, i) => {
      if (color[i] === GRAY) gray.push(nd.id);
      if (color[i] === BLACK) black.push(nd.id);
    });
    return [
      graphPanel(g, {
        title: `图（${g.directed ? '有向' : '无向'} · 三色）`,
        name: 'color: WHITE / GRAY / BLACK',
        roles: { added: gray, done: black, ...(o.roles || {}) },
        edgeStates: states,
        subOf: (i) => `${COLOR_NAME[color[i]]}${badge[i] ? ` ${badge[i]}` : ''}`,
        badgeOf: (i) => (color[i] === GRAY ? '在栈上' : undefined),
      }),
      stackPanel({
        id: 'frame-stack', title: '帧栈（灰点 = 还在栈上）', name: 'DFS stack',
        frames: frames.map((f, i) => ({ value: g.nodes[f.idx].id, label: `帧${i}`, badge: '灰' })),
        roles: o.stackRoles || {},
      }),
    ];
  };
  const push = (o) => {
    steps.push(step({ ...o, note: tail ? `${o.note}${tail}` : o.note }));
    tail = '';
  };

  push({
    event: 'init', lineId: 'init',
    note: n === 0
      ? '图为空：所有顶点（一个也没有）都是白色。'
      : `共 ${n} 个顶点、${g.edges.length} 条边。三种颜色：白=没碰过，灰=正躺在栈上（祖先还没做完），黑=整棵子树已经做完。灰点相遇就是回边。`,
    vars: { start: startId ?? '—', n, edges: g.edges.length, 白: n, 灰: 0, 黑: 0, 环: '未发现' },
    layers: layers({ roles: startIdx >= 0 ? { focus1: [g.nodes[startIdx].id] } : {} }),
  });

  if (n === 0 || startIdx < 0) {
    push({
      event: 'finish', lineId: 'popback',
      note: n === 0 ? '没有顶点：帧栈一直为空。' : `起点 ${startId} 不在顶点集合里：没有任何顶点能变灰。`,
      vars: { start: startId ?? '—', n, 白: n, 灰: 0, 黑: 0, 环: '未发现' },
      layers: layers(),
    });
    const result = { order: [], visitedCount: 0, start: null, hasCycle: false, backEdges: [], unreached: g.nodes.map((nd) => nd.id) };
    push({
      event: 'done', lineId: 'finish', done: true, result,
      note: 'DFS 结束：没有访问任何顶点，也没有回边。',
      vars: { start: startId ?? '—', visited: 0, 环: '未发现' },
      layers: layers(),
    });
    return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'dfs-three-color-v1', lines: L, steps, result, meta: { backEdges: 0 } });
  }

  let maxDepth = 0;
  const enterFrame = (u, viaLine, viaNote) => {
    const uId = g.nodes[u].id;
    frames.push({ idx: u });
    maxDepth = Math.max(maxDepth, frames.length);
    push({
      event: 'enter', lineId: viaLine,
      note: `${viaNote} 帧栈压到第 ${frames.length} 层；${uId} 此刻还是白色，下一步才变灰。`,
      vars: { start: startId, u: uId, w: '—', depth: frames.length, visited: order.length, 白: color.filter((c) => c === WHITE).length, 灰: color.filter((c) => c === GRAY).length, 黑: color.filter((c) => c === BLACK).length },
      layers: layers({ roles: { focus1: [uId] } }),
    });
    color[u] = GRAY;
    order.push(uId);
    badge[u] = `#${order.length}`;
    push({
      event: 'visit', lineId: 'enter',
      note: `${uId} 变灰并记下访问序号 #${order.length}。变灰 = "我还在栈上，我的子孙还没处理完"；只要还有灰点，图里就可能藏着环。`,
      vars: { start: startId, u: uId, w: '—', depth: frames.length, visited: order.length, order: order.join(' → '), 白: color.filter((c) => c === WHITE).length, 灰: color.filter((c) => c === GRAY).length, 黑: color.filter((c) => c === BLACK).length },
      layers: layers({ roles: { focus1: [uId] } }),
    });
  };

  const walk = (u, viaLine, viaNote) => {
    enterFrame(u, viaLine, viaNote);
    const uId = g.nodes[u].id;
    const nb = adj[u].map((w) => g.nodes[w].id);
    for (const w of adj[u]) {
      const wId = g.nodes[w].id;
      if (!g.directed && w === parent[u]) {
        push({
          event: 'explore', lineId: 'skip-parent',
          note: `${wId} 是 ${uId} 的父节点：从这个方向看回去是同一条树边，不算回边，直接跳过。`,
          vars: { start: startId, u: uId, w: wId, depth: frames.length, 环: backEdges.length ? backEdges.map((e) => `${e[0]}→${e[1]}`).join('、') : '未发现', 邻接: nb.join('、') },
          layers: layers({ roles: { focus1: [uId], focus2: [wId] } }),
        });
        continue;
      }
      if (color[w] === GRAY) {
        backEdges.push([uId, wId]);
        setEdge(states, g, uId, wId, 'active');
        push({
          event: 'explore', lineId: 'gray',
          note: `${uId}–${wId}：${wId} 是灰的（还压在栈上）⇒ 这是一条回边，${wId} 是 ${uId} 的祖先，图里有环！记录回边 ${uId}→${wId}。`,
          vars: { start: startId, u: uId, w: wId, depth: frames.length, 回边: `${uId}→${wId}`, 环数: backEdges.length, 邻接: nb.join('、') },
          layers: layers({ roles: { focus1: [uId], focus2: [wId] } }),
        });
        continue;
      }
      if (color[w] === WHITE) {
        setEdge(states, g, uId, wId, 'tree');
        push({
          event: 'explore', lineId: 'descend',
          note: `${uId}–${wId}：${wId} 还是白的 → 这条边成为树边，递归深入一层（${wId} 的 parent 记成 ${uId}）。`,
          vars: { start: startId, u: uId, w: wId, depth: frames.length, 邻接: nb.join('、') },
          layers: layers({ roles: { focus1: [uId], focus2: [wId] } }),
        });
        parent[w] = u;
        walk(w, 'descend', `${uId} 的邻点 ${wId} 是白色，DFS_color(${wId}) 被调用。`);
        continue;
      }
      setEdge(states, g, uId, wId, 'reject');
      push({
        event: 'explore', lineId: 'black',
        note: `${uId}–${wId}：${wId} 已经变黑了（子树做完并出栈）→ 这是跨边/前向边，不再深入，也不会被误判成环。`,
        vars: { start: startId, u: uId, w: wId, depth: frames.length, 邻接: nb.join('、') },
        layers: layers({ roles: { focus1: [uId], focus2: [wId], done: g.nodes.filter((nd, i) => color[i] === BLACK).map((nd) => nd.id) } }),
      });
    }

    color[u] = BLACK;
    push({
      event: 'finish', lineId: 'finish',
      note: `${uId} 的邻点全部处理完 → 变黑。变黑以后再也不会被深入，这正是"子树完成"的标记。`,
      vars: { start: startId, u: uId, depth: frames.length, visited: order.length, 白: color.filter((c) => c === WHITE).length, 灰: color.filter((c) => c === GRAY).length, 黑: color.filter((c) => c === BLACK).length },
      layers: layers({ roles: { focus1: [uId] } }),
    });
    frames.pop();
    if (frames.length) {
      const back = g.nodes[frames[frames.length - 1].idx].id;
      push({
        event: 'backtrack', lineId: 'popback',
        note: `${uId} 出栈，控制权回到 ${back}：${back} 继续沿着它自己的邻接表往下走。`,
        vars: { start: startId, u: uId, depth: frames.length, visited: order.length, 环: backEdges.length ? backEdges.map((e) => `${e[0]}→${e[1]}`).join('、') : '未发现' },
        layers: layers({ roles: { focus1: [back] } }),
      });
    }
  };

  walk(startIdx, 'fn', `初始调用 DFS_color(${startId})。`);

  const rest = g.nodes.filter((nd, i) => color[i] === WHITE).map((nd) => nd.id);
  const result = {
    order: order.slice(),
    visitedCount: order.length,
    start: startId,
    hasCycle: backEdges.length > 0,
    backEdges: backEdges.map((e) => e.slice()),
    unreached: rest,
    maxDepth,
  };
  push({
    event: 'done', lineId: 'finish', done: true, result,
    note: `DFS 结束：${order.join(' → ')}。${backEdges.length ? `共记录 ${backEdges.length} 条回边（${backEdges.map((e) => `${e[0]}→${e[1]}`).join('、')}）⇒ 有环；但每个顶点只变一次灰，所以环不会导致重复访问。` : '一条回边都没有 ⇒ 这张图（start 所在的连通分量）是一棵无环的树。'}${rest.length ? `白点 ${rest.join('、')} 没有被访问到。` : ''}`,
    vars: { start: startId, n, edges: g.edges.length, visited: order.length, 白: rest.length, 黑: color.filter((c) => c === BLACK).length, 回边: backEdges.map((e) => `${e[0]}→${e[1]}`).join('、') || '未发现', order: order.join(' → ') },
    layers: layers({ roles: { done: order.slice() } }),
  });
  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'dfs-three-color-v1', lines: L, steps, result, meta: { backEdges: backEdges.length, maxDepth } });
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
