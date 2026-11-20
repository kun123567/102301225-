/**
 * B · Floyd 全源最短路（3 个代表性不同实现）
 *
 * 主画面是 style 2 矩阵层 dist[][]（不可达显示 ∞），角色 key 一律用 'r,c' 字符串：
 *   focus1 = 正在被评估/被改写的格 [i][j]
 *   focus2 = 本步用到的两个中转格 [i][k]、[k][j]
 *   excluded = 参与运算但为 ∞ 的格（灰）
 *
 * 三个变体是三条真实的技术路线，不是改名换汤：
 *   v1 标准三重循环：三重 for 一个不漏地跑完 n³ 次加法，含大量 ∞+w 与无效组合——
 *      这正是"可以省掉却没省"的对照基线；
 *   v2 带 path 中转点矩阵：多维护一整个 path[i][j]（最后中转点），因此结束之后还能把
 *      任意一对顶点的完整最短路还原出来（画面多一层 path 矩阵，每步多写一格）；
 *   v3 剪枝 + 负环检测：i==k / j==k 的无效组合直接跳过，dist[i][k]==∞ 时整行不再展开，
 *      dist[k][j]==∞ 时该 j 直接跳过（省掉的次数可见）；结束后检查对角线 dist[i][i]<0
 *      报告负环。
 *
 * 契约（docs/04-轨迹契约.md）：每步完整快照、lineId 命中本变体 sourceLines、
 * 末步 done=true 且 result 与样例 expect 逐键深比较一致。
 * 事件只用目录词表：init / kpivot / compare-path / update / skip-unreachable / negative-cycle / done。
 */

import { trace, step, matrixLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'b/floyd',
  variants: [
    { id: 'v1', name: '标准三重循环' },
    { id: 'v2', name: '带 path 中转点矩阵' },
    { id: 'v3', name: '剪枝 + 负环检测' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void floyd(MGraph *g, int dist[][]) {' },
    { lineId: 'init', text: '  for (i, j) dist[i][j] = (i == j ? 0 : (边权 或 INF));' },
    { lineId: 'k', text: '  for (k = 0; k < n; ++k) {            /* 中转点必须放在最外层 */' },
    { lineId: 'i', text: '    for (i = 0; i < n; ++i) {' },
    { lineId: 'j', text: '      for (j = 0; j < n; ++j) {' },
    { lineId: 'sum', text: '        cand = dist[i][k] + dist[k][j];  /* ∞ 参与加法仍是 ∞ */' },
    { lineId: 'compare', text: '        if (cand < dist[i][j]) {' },
    { lineId: 'update', text: '          dist[i][j] = cand;            /* 允许经过 k */' },
    { lineId: 'end', text: '        }' },
    { lineId: 'ret', text: '}  /* 三重循环一个不漏：n^3 次加法 */' },
  ],
  v2: [
    { lineId: 'fn', text: 'void floyd_path(MGraph *g, int dist[][], int path[][]) {' },
    { lineId: 'init', text: '  for (i, j) { dist[i][j] = (i == j ? 0 : (边权 或 INF)); path[i][j] = -1; }' },
    { lineId: 'k', text: '  for (k = 0; k < n; ++k) {' },
    { lineId: 'i', text: '    for (i = 0; i < n; ++i) {' },
    { lineId: 'j', text: '      for (j = 0; j < n; ++j) {' },
    { lineId: 'sum', text: '        cand = dist[i][k] + dist[k][j];' },
    { lineId: 'compare', text: '        if (cand < dist[i][j]) {' },
    { lineId: 'update', text: '          dist[i][j] = cand;' },
    { lineId: 'path', text: '          path[i][j] = k;               /* 记下最后中转点：路靠它还原 */' },
    { lineId: 'end', text: '        }' },
    { lineId: 'ret', text: '}  /* route(i,j) = route(i,path[i][j]) + route(path[i][j],j) */' },
  ],
  v3: [
    { lineId: 'fn', text: 'void floyd_prune(MGraph *g, int dist[][]) {' },
    { lineId: 'init', text: '  for (i, j) dist[i][j] = (i == j ? 0 : (边权 或 INF));' },
    { lineId: 'k', text: '  for (k = 0; k < n; ++k) {' },
    { lineId: 'skip-ik', text: '    if (i == k || dist[i][k] == INF) continue;   /* 剪枝：i 到 k 不通 */' },
    { lineId: 'i', text: '    for (i = 0; i < n; ++i) {' },
    { lineId: 'skip-kj', text: '      if (j == k || dist[k][j] == INF) continue; /* 剪枝：k 到 j 不通 */' },
    { lineId: 'j', text: '      for (j = 0; j < n; ++j) {' },
    { lineId: 'sum', text: '        cand = dist[i][k] + dist[k][j];' },
    { lineId: 'compare', text: '        if (cand < dist[i][j]) dist[i][j] = cand;' },
    { lineId: 'end', text: '      }' },
    { lineId: 'diag', text: '  for (i) if (dist[i][i] < 0) → 存在负环;   /* 对角线才是负环的判据 */' },
    { lineId: 'ret', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

const NODES = (ids) => ids.map((id) => ({ id, label: id }));
const INF = Infinity;

const LAB = {
  directed: true,
  nodes: NODES(['A', 'B', 'C']),
  // 直达 A→C=9，但绕 A→B→C 只有 5
  edges: [
    { from: 'A', to: 'B', w: 2 },
    { from: 'B', to: 'C', w: 3 },
    { from: 'A', to: 'C', w: 9 },
  ],
};

const NEG_CYCLE = {
  directed: true,
  nodes: NODES(['A', 'B', 'C']),
  // A→B→C→A = 2 + 3 - 6 = -1 < 0：负环
  edges: [
    { from: 'A', to: 'B', w: 2 },
    { from: 'B', to: 'C', w: 3 },
    { from: 'C', to: 'A', w: -6 },
  ],
};

const UNREACHABLE = {
  directed: true,
  nodes: NODES(['A', 'B', 'C']),
  // A 到不了 C，C 到不了 A：矩阵里必须出现 ∞
  edges: [
    { from: 'A', to: 'B', w: 4 },
    { from: 'C', to: 'B', w: 1 },
  ],
};

const LAB_DIST = [[0, 2, 5], [INF, 0, 3], [INF, INF, 0]];
const LAB_REACH = { 'A→B': 2, 'A→C': 5, 'B→C': 3 };
const LAB_PATH = [[null, null, 'B'], [null, null, null], [null, null, null]];
const LAB_ROUTES = { 'A→B': ['A', 'B'], 'A→C': ['A', 'B', 'C'], 'B→C': ['B', 'C'] };

// 负环里"最短路"没有下界：原地 Floyd 的最终数值取决于 i/j 的遍历与剪枝顺序，
// 所以这里两个数值表都对——关键是 v3 必须报告 negativeCycle，v1/v2 不报（它们根本没检查）。
const NEG_DIST_FULL = [[-1, 1, 4], [-3, -1, 2], [-7, -5, -2]];
const NEG_REACH_FULL = { 'A→B': 1, 'A→C': 4, 'B→A': -3, 'B→C': 2, 'C→A': -7, 'C→B': -5 };
const NEG_DIST_PRUNED = [[-1, 1, 5], [-3, -1, 3], [-6, -4, -1]];
const NEG_REACH_PRUNED = { 'A→B': 1, 'A→C': 5, 'B→A': -3, 'B→C': 3, 'C→A': -6, 'C→B': -4 };

const UNR_DIST = [[0, 4, INF], [INF, 0, INF], [INF, 1, 0]];
const UNR_REACH = { 'A→B': 4, 'C→B': 1 };

export const samples = [
  {
    id: 'normal',
    label: 'A→B=2、B→C=3、A→C=9（A→C 应为 5）',
    input: { graph: LAB },
    expect: { dist: LAB_DIST, reach: LAB_REACH },
    expectByVariant: {
      v2: { dist: LAB_DIST, reach: LAB_REACH, path: LAB_PATH, routes: LAB_ROUTES },
      v3: { dist: LAB_DIST, reach: LAB_REACH, negativeCycle: false },
    },
  },
  {
    id: 'edge-negative-cycle',
    label: 'A→B=2、B→C=3、C→A=-6（负环：v3 报 negativeCycle=true）',
    input: { graph: NEG_CYCLE },
    expect: { dist: NEG_DIST_FULL, reach: NEG_REACH_FULL },
    expectByVariant: {
      v3: { dist: NEG_DIST_PRUNED, reach: NEG_REACH_PRUNED, negativeCycle: true },
    },
  },
  {
    id: 'edge-unreachable',
    label: 'A→B=4、C→B=1（存在不可达对，矩阵里留 ∞）',
    input: { graph: UNREACHABLE },
    expect: { dist: UNR_DIST, reach: UNR_REACH },
    expectByVariant: {
      v3: { dist: UNR_DIST, reach: UNR_REACH, negativeCycle: false },
    },
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
  for (const e of raw.edges || []) {
    const from = str(e.from);
    const to = str(e.to);
    if (!known.has(from) || !known.has(to)) continue;
    const w = e.w == null ? 1 : Number(e.w);
    if (!Number.isFinite(w)) continue;
    edges.push({ from, to, w });
  }
  return { directed: !!raw.directed, nodes, edges };
}

/** dist[i][i]=0，有边取最小权（多重边只留最小），其余 ∞ */
function matrixOf(g, n) {
  const idx = new Map(g.nodes.map((nd, i) => [nd.id, i]));
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : INF)));
  for (const e of g.edges) {
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    if (a == null || b == null) continue;
    if (e.w < d[a][b]) d[a][b] = e.w;
    if (!g.directed && e.w < d[b][a]) d[b][a] = e.w;
  }
  return d;
}

function distPanel(g, dist, o = {}) {
  return matrixLayer({
    id: 'main',
    title: o.title || 'dist[][]（最短路长度，∞ = 不可达）',
    name: o.name || 'int dist[n][n]',
    values: dist.map((row) => row.slice()),
    rowLabels: g.nodes.map((nd) => nd.id),
    colLabels: g.nodes.map((nd) => nd.id),
    roles: o.roles || {},
  });
}

function pathPanel(g, pathV, o = {}) {
  return matrixLayer({
    id: 'path',
    title: 'path[][]（最后中转点，· = 直达/不可达）',
    name: 'int path[n][n]',
    values: pathV.map((row) => row.map((k) => (k == null ? '·' : g.nodes[k].id))),
    rowLabels: g.nodes.map((nd) => nd.id),
    colLabels: g.nodes.map((nd) => nd.id),
    roles: o.roles || {},
  });
}

function reachOf(g, dist) {
  const out = {};
  g.nodes.forEach((from, i) => {
    g.nodes.forEach((to, j) => {
      if (i === j) return;                       // 只看"真实的两点之间"
      if (!Number.isFinite(dist[i][j])) return;
      out[`${from.id}→${to.id}`] = dist[i][j];
    });
  });
  return out;
}

/** v2 专用：沿 path 矩阵还原 i→j 的顶点序列 */
function routeOf(g, dist, pathV, i, j, depth = 0) {
  if (!Number.isFinite(dist[i][j])) return null;
  if (i === j) return [g.nodes[i].id];
  const mid = pathV[i][j];
  if (mid == null || mid === i || mid === j || depth > g.nodes.length + 2) {
    return [g.nodes[i].id, g.nodes[j].id];
  }
  const left = routeOf(g, dist, pathV, i, mid, depth + 1) || [g.nodes[i].id];
  const right = routeOf(g, dist, pathV, mid, j, depth + 1) || [g.nodes[j].id];
  return [...left.slice(0, -1), ...right];
}

/* ------------------------------------------------------------------ 变体 1（标准三重循环） */

function runV1(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const dist = matrixOf(g, n);
  const ids = g.nodes.map((nd) => nd.id);
  const L = LINES.v1;
  const steps = [];
  const push = (o) => steps.push(step(o));
  const layers = (o = {}) => [distPanel(g, dist, { roles: o.roles || {} })];
  const result = {};
  const freeze = () => {
    result.dist = dist.map((row) => row.slice());
    result.reach = reachOf(g, dist);
    return result;
  };

  push({
    event: 'init', lineId: 'init',
    note: n === 0
      ? '图为空：0×0 矩阵，三重循环无事可做。'
      : `初始化 ${n}×${n} 的 dist：对角线 0（自己到自己），每条边填权（多重边取最小），其余 ∞。之后 k 每推进一格，就允许路径"绕道经过 k"。`,
    vars: { n, 边数: g.edges.length },
    layers: layers(),
  });

  if (n === 0) {
    freeze();
    push({
      event: 'done', lineId: 'ret', done: true, result,
      note: '空图：直接结束，dist 是 0×0 矩阵。',
      vars: { n: 0, 比较: 0, 更新: 0 },
      layers: layers(),
    });
    return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'floyd-triple-v1', lines: L, steps, result });
  }

  let compares = 0;
  let updates = 0;
  for (let k = 0; k < n; k++) {
    push({
      event: 'kpivot', lineId: 'k',
      note: `第 ${k + 1} 轮，中转点 k = ${ids[k]}。k 必须在最外层：只有这样，"中间点只取自 {${ids.slice(0, k + 1).join('、')}} 的最短路"才是每个 (i,j) 都已算好的子问题，后面才不会漏解。`,
      vars: { k: ids[k], 轮次: `${k + 1}/${n}` },
      layers: layers({ roles: { focus1: [`${k},${k}`], focus2: ids.map((_, j) => `${k},${j}`) } }),
    });

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        compares++;
        const ik = dist[i][k];
        const kj = dist[k][j];
        if (!Number.isFinite(ik) || !Number.isFinite(kj)) {
          push({
            event: 'skip-unreachable', lineId: 'sum',
            note: `dist[${ids[i]}][${ids[k]}] 与 dist[${ids[k]}][${ids[j]}] 里有一头是 ∞：中转 ${ids[k]} 这条路根本不通，∞ 加任何数仍是 ∞，比不过任何有限值。标准三重循环不剪枝，所以这一对还是要老老实实算一遍——这正是可以省掉的开销。`,
            vars: { k: ids[k], i: ids[i], j: ids[j], [`dist[${ids[i]}][${ids[k]}]`]: fmt(ik), [`dist[${ids[k]}][${ids[j]}]`]: fmt(kj) },
            layers: layers({ roles: { focus1: [`${i},${j}`], excluded: [`${i},${k}`, `${k},${j}`] } }),
          });
          continue;
        }
        const cand = ik + kj;
        const cur = dist[i][j];
        push({
          event: 'compare-path', lineId: 'compare',
          note: `${ids[i]}→${ids[j]} 的两条候选：现有的 ${fmt(cur)}，经 ${ids[k]} 中转的 ${fmt(ik)}+${fmt(kj)}=${cand}。${cand < cur ? '中转更短 → 本格该被改写。' : '中转不更短 → 保留原值（同一格在后面的 k 里还会被再算一次）。'}`,
          vars: { k: ids[k], i: ids[i], j: ids[j], 现有: fmt(cur), 中转: fmt(ik), 合计: fmt(cand) },
          layers: layers({ roles: { focus1: [`${i},${j}`], focus2: [`${i},${k}`, `${k},${j}`] } }),
        });
        if (cand < cur) {
          dist[i][j] = cand;
          updates++;
          push({
            event: 'update', lineId: 'update',
            note: `改写 dist[${ids[i]}][${ids[j]}]：${fmt(cur)} → ${cand}。中转 ${ids[k]} 让这对顶点变近了，这正是 Floyd 用一层 k 循环换来的信息。`,
            vars: { k: ids[k], i: ids[i], j: ids[j], 旧值: fmt(cur), 新值: cand },
            layers: layers({ roles: { focus1: [`${i},${j}`], focus2: [`${i},${k}`, `${k},${j}`] } }),
          });
        }
      }
    }
  }

  result.compares = compares;
  result.updates = updates;
  freeze();
  push({
    event: 'done', lineId: 'ret', done: true, result,
    note: `三重循环跑完：共 ${compares} 次加法（n³ = ${n ** 3}）、${updates} 次改写。dist[i][j] 现在是从 i 到 j 的最短路长度，∞ 表示真的没有通路。`,
    vars: { 比较: compares, 更新: updates, n: n },
    layers: layers({ roles: { focus1: [] } }),
  });

  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'floyd-triple-v1', lines: L, steps, result, meta: { compares, updates } });
}

/* ------------------------------------------------------------------ 变体 2（带 path 中转点矩阵） */

function runV2(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const dist = matrixOf(g, n);
  const pathV = Array.from({ length: n }, () => new Array(n).fill(null));
  const ids = g.nodes.map((nd) => nd.id);
  const L = LINES.v2;
  const steps = [];
  const push = (o) => steps.push(step(o));
  const layers = (o = {}) => [
    distPanel(g, dist, { roles: o.roles || {} }),
    pathPanel(g, pathV, { roles: o.pathRoles || {} }),
  ];
  const result = {};
  const freeze = () => {
    result.dist = dist.map((row) => row.slice());
    result.reach = reachOf(g, dist);
    return result;
  };

  push({
    event: 'init', lineId: 'init',
    note: n === 0
      ? '图为空：两张 0×0 矩阵都是空的。'
      : `初始化两张矩阵：dist 与 v1 完全一样，额外多出一张 path（全部置 ·）。path[i][j] 记的是"最后一次让 dist[i][j] 变短的 k"，也就是这条最短路上最后用到的中转点。`,
    vars: { n, 边数: g.edges.length, path: '全部 ·' },
    layers: layers(),
  });

  if (n === 0) {
    freeze();
    push({
      event: 'done', lineId: 'ret', done: true, result,
      note: '空图：直接结束。',
      vars: { n: 0 },
      layers: layers(),
    });
    return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'floyd-path-v1', lines: L, steps, result });
  }

  let compares = 0;
  let updates = 0;
  for (let k = 0; k < n; k++) {
    push({
      event: 'kpivot', lineId: 'k',
      note: `第 ${k + 1} 轮，中转点 k = ${ids[k]}。本轮任何被改写的 dist[i][j] 都会在 path[i][j] 里留下 ${ids[k]}，于是"谁是中转点"有了痕迹。`,
      vars: { k: ids[k], 轮次: `${k + 1}/${n}` },
      layers: layers({ roles: { focus1: [`${k},${k}`], focus2: ids.map((_, j) => `${k},${j}`) } }),
    });

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        compares++;
        const ik = dist[i][k];
        const kj = dist[k][j];
        if (!Number.isFinite(ik) || !Number.isFinite(kj)) {
          push({
            event: 'skip-unreachable', lineId: 'sum',
            note: `dist[${ids[i]}][${ids[k]}] / dist[${ids[k]}][${ids[j]}] 有一头是 ∞：中转不成路，path[${ids[i]}][${ids[j]}] 也不会被写。`,
            vars: { k: ids[k], i: ids[i], j: ids[j] },
            layers: layers({ roles: { focus1: [`${i},${j}`], excluded: [`${i},${k}`, `${k},${j}`] }, pathRoles: { focus1: [`${i},${j}`] } }),
          });
          continue;
        }
        const cand = ik + kj;
        const cur = dist[i][j];
        push({
          event: 'compare-path', lineId: 'compare',
          note: `${ids[i]}→${ids[j]}：经 ${ids[k]} 得 ${fmt(ik)}+${fmt(kj)}=${cand}，现有 ${fmt(cur)}（path 里记着 ${pathV[i][j] == null ? '·' : ids[pathV[i][j]]}）。${cand < cur ? '更短 → 改 dist，并把 path 记成 ' + ids[k] + '。' : '不更短 → dist 与 path 都不动。'}`,
          vars: { k: ids[k], i: ids[i], j: ids[j], 现有: fmt(cur), 合计: fmt(cand), 'path[i][j]': pathV[i][j] == null ? '·' : ids[pathV[i][j]] },
          layers: layers({ roles: { focus1: [`${i},${j}`], focus2: [`${i},${k}`, `${k},${j}`] }, pathRoles: { focus2: [`${i},${j}`] } }),
        });
        if (cand < cur) {
          dist[i][j] = cand;
          updates++;
          push({
            event: 'update', lineId: 'update',
            note: `dist[${ids[i]}][${ids[j]}]：${fmt(cur)} → ${cand}。接着必须同步写 path，否则距离改了、路却还原不出来。`,
            vars: { k: ids[k], i: ids[i], j: ids[j], 旧值: fmt(cur), 新值: cand },
            layers: layers({ roles: { focus1: [`${i},${j}`], focus2: [`${i},${k}`, `${k},${j}`] }, pathRoles: { focus2: [`${i},${j}`] } }),
          });
          pathV[i][j] = k;
          push({
            event: 'update', lineId: 'path',
            note: `path[${ids[i]}][${ids[j]}] = ${ids[k]}。以后要还原 ${ids[i]}→${ids[j]}，就把它拆成 ${ids[i]}→${ids[k]} 与 ${ids[k]}→${ids[j]} 两段递归；path 里没有中转点（·）的两格就是一条直达边。`,
            vars: { i: ids[i], j: ids[j], 'path[i][j]': ids[k] },
            layers: layers({ roles: { focus2: [`${i},${j}`] }, pathRoles: { focus1: [`${i},${j}`], added: [`${i},${j}`] } }),
          });
        }
      }
    }
  }

  result.compares = compares;
  result.updates = updates;
  freeze();
  result.path = pathV.map((row) => row.map((k) => (k == null ? null : ids[k])));
  const routes = {};
  g.nodes.forEach((from, i) => {
    g.nodes.forEach((to, j) => {
      if (i === j) return;
      const r = routeOf(g, dist, pathV, i, j);
      if (r) routes[`${from.id}→${to.id}`] = r;
    });
  });
  result.routes = routes;

  const routeText = Object.entries(routes).map(([pair, r]) => `${pair}: ${r.join('→')}`).join('；');
  push({
    event: 'done', lineId: 'ret', done: true, result,
    note: `三重循环跑完（${compares} 次加法、${updates} 次改写）。因为多维护了 path，现在能把任意一对顶点的完整最短路读出来：${routeText}。这是 v1 做不到的——v1 只知道长度，不知道路怎么走。`,
    vars: { 比较: compares, 更新: updates, 能还原: Object.keys(routes).length },
    layers: layers(),
  });

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'floyd-path-v1', lines: L, steps, result, meta: { compares, updates } });
}

/* ------------------------------------------------------------------ 变体 3（剪枝 + 负环检测） */

function runV3(input) {
  const g = normalizeGraph(input);
  const n = g.nodes.length;
  const dist = matrixOf(g, n);
  const ids = g.nodes.map((nd) => nd.id);
  const L = LINES.v3;
  const steps = [];
  const push = (o) => steps.push(step(o));
  const layers = (o = {}) => [distPanel(g, dist, { roles: o.roles || {} })];
  const result = { negativeCycle: false, compares: 0, updates: 0, pruned: 0 };
  const freeze = () => {
    result.dist = dist.map((row) => row.slice());
    result.reach = reachOf(g, dist);
    return result;
  };

  push({
    event: 'init', lineId: 'init',
    note: n === 0
      ? '图为空：0×0 矩阵，剪枝无从谈起。'
      : `初始化 dist。本变体的三点剪枝：i==k 与 j==k 的组合（中转点等于自己，恒等变形，白算）、dist[i][k]==∞（i 到 k 都不通，整行不必展开）、dist[k][j]==∞（k 到 j 不通，这个 j 直接跳过）。`,
    vars: { n, 边数: g.edges.length, 剪枝: 'i==k / j==k / ∞' },
    layers: layers(),
  });

  if (n === 0) {
    freeze();
    push({
      event: 'done', lineId: 'ret', done: true, result,
      note: '空图：直接结束。',
      vars: { n: 0 },
      layers: layers(),
    });
    return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'floyd-prune-v1', lines: L, steps, result });
  }

  let compares = 0;
  let updates = 0;
  let pruned = 0;
  for (let k = 0; k < n; k++) {
    push({
      event: 'kpivot', lineId: 'k',
      note: `第 ${k + 1} 轮，中转点 k = ${ids[k]}。本轮只展开"真能经 ${ids[k]} 走通"的组合：第 ${k} 行与第 ${k} 列既是中转的原料，也是剪枝依据，而且它们本身在这一轮不会变（i==k / j==k 已跳过）。`,
      vars: { k: ids[k], 轮次: `${k + 1}/${n}`, 已剪枝: pruned },
      layers: layers({ roles: { focus1: [`${k},${k}`], focus2: ids.map((_, j) => `${k},${j}`) } }),
    });

    for (let i = 0; i < n; i++) {
      if (i === k) { pruned++; continue; }            // i==k：中转点就是自己
      if (!Number.isFinite(dist[i][k])) {
        pruned++;
        push({
          event: 'skip-unreachable', lineId: 'skip-ik',
          note: `dist[${ids[i]}][${ids[k]}] = ∞：${ids[i]} 根本到不了 ${ids[k]}，那么"经 ${ids[k]} 中转"整行都不可能成立，第 ${ids[i]} 行这一轮直接不展开——省掉 n 次加法。`,
          vars: { k: ids[k], i: ids[i], 判据: `dist[${ids[i]}][${ids[k]}]=∞`, 已剪枝: pruned },
          layers: layers({ roles: { focus1: [`${i},${k}`], excluded: ids.map((_, j) => `${i},${j}`) } }),
        });
        continue;
      }
      for (let j = 0; j < n; j++) {
        if (j === k) { pruned++; continue; }          // j==k：同上
        if (!Number.isFinite(dist[k][j])) {
          pruned++;
          push({
            event: 'skip-unreachable', lineId: 'skip-kj',
            note: `dist[${ids[k]}][${ids[j]}] = ∞：${ids[k]} 到不了 ${ids[j]}，中转 ${ids[k]} 在这条 j 上没有意义，跳过这一对（不再做 ∞ 加法）。`,
            vars: { k: ids[k], i: ids[i], j: ids[j], 判据: `dist[${ids[k]}][${ids[j]}]=∞`, 已剪枝: pruned },
            layers: layers({ roles: { focus1: [`${k},${j}`], excluded: [`${i},${j}`] } }),
          });
          continue;
        }
        compares++;
        const ik = dist[i][k];
        const kj = dist[k][j];
        const cand = ik + kj;
        const cur = dist[i][j];
        push({
          event: 'compare-path', lineId: 'compare',
          note: `${ids[i]}→${ids[j]}：经 ${ids[k]} 得 ${fmt(ik)}+${fmt(kj)}=${cand}，现有 ${fmt(cur)}。${cand < cur ? '更短，改写。' : '不更短，保持。这里能省也不省——只有真正能改进的格才值得一次加法。'}`,
          vars: { k: ids[k], i: ids[i], j: ids[j], 现有: fmt(cur), 合计: fmt(cand), 已剪枝: pruned },
          layers: layers({ roles: { focus1: [`${i},${j}`], focus2: [`${i},${k}`, `${k},${j}`] } }),
        });
        if (cand < cur) {
          dist[i][j] = cand;
          updates++;
          push({
            event: 'update', lineId: 'compare',
            note: `dist[${ids[i]}][${ids[j]}]：${fmt(cur)} → ${cand}。这一格的改进会在后面的 k 里继续当作中转原料使用。`,
            vars: { k: ids[k], i: ids[i], j: ids[j], 旧值: fmt(cur), 新值: cand },
            layers: layers({ roles: { focus1: [`${i},${j}`], focus2: [`${i},${k}`, `${k},${j}`] } }),
          });
        }
      }
    }
  }

  // ---- 负环检测：dist[i][i] < 0 才说明"绕回自己"能变短
  const bad = [];
  for (let i = 0; i < n; i++) if (dist[i][i] < 0) bad.push(i);
  push({
    event: 'negative-cycle', lineId: 'diag',
    note: bad.length
      ? `对角线检查：${bad.map((i) => `dist[${ids[i]}][${ids[i]}]=${dist[i][i]}`).join('、')} 为负 → 存在负环。绕一圈回到自己反而更短，说明"最短路"没有下界，Floyd 的 dist 只是"绕了很多圈之后的当前值"，不是答案。`
      : `对角线检查：全部 dist[i][i] 都 ≥ 0，没有负环。于是每格 dist[i][j] 都是真正的最短路长度（∞ 表示确实不可达）。`,
    vars: { 负环: bad.length ? bad.map((i) => ids[i]).join('、') : '无', 比较: compares, 更新: updates, 剪枝: pruned },
    layers: layers({ roles: { focus1: bad.length ? bad.map((i) => `${i},${i}`) : ids.map((_, i) => `${i},${i}`) } }),
  });

  for (const i of bad) {
    push({
      event: 'negative-cycle', lineId: 'diag',
      note: `${ids[i]} 落在负环上：dist[${ids[i]}][${ids[i]}]=${dist[i][i]} < 0。任何经过 ${ids[i]} 的距离都可以被"再绕一圈"继续压小，所以这些值不可信（这也是为什么负权图要先跑负环检测）。`,
      vars: { 顶点: ids[i], 'dist[i][i]': dist[i][i] },
      layers: layers({ roles: { focus1: [`${i},${i}`], swap: ids.map((_, j) => `${i},${j}`) } }),
    });
  }

  result.negativeCycle = bad.length > 0;
  result.negativeVertices = bad.map((i) => ids[i]);
  result.compares = compares;
  result.updates = updates;
  result.pruned = pruned;
  freeze();

  push({
    event: 'done', lineId: 'ret', done: true, result,
    note: `结束：${compares} 次有效加法、${updates} 次改写、${pruned} 次被剪掉（v1 会老老实实算 n³=${n ** 3} 次）。${bad.length ? `同时报告负环：${bad.map((i) => ids[i]).join('、')}。` : '对角线非负，dist 可信。'}`,
    vars: { 比较: compares, 更新: updates, 剪枝: pruned, 负环: bad.length ? bad.map((i) => ids[i]).join('、') : '无' },
    layers: layers({ roles: { focus1: bad.length ? bad.map((i) => `${i},${i}`) : [] } }),
  });

  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'floyd-prune-v1', lines: L, steps, result, meta: { compares, updates, pruned, negativeCycle: result.negativeCycle } });
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
