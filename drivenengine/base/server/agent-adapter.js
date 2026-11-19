'use strict';
/**
 * agent-adapter.js -- 把 datastructure-agent 的 B 包 steps 转成 prototype01 的统一图模型
 *
 * 上游：D:\..\datastructure-agent-main\shared\algorithms\final\b\*.js
 *   每步形如 { event, lineId, description, variables:{...}, done }
 * 下游：prototype01 的 snapshot（viewport 直接可消费）
 *   snapshot = { step, line, frames:[{fn,depth,base,sp,vars:[{name,kind,value}]}], nxm:{var:[N/NE/M]}, lists:{}, heap:[] }
 *
 * 运行：node server/agent-adapter.js [输出路径]
 */
const fs = require('fs');
const path = require('path');

const AGENT = process.env.AGENT_REPO || 'D:\\.FZU\\03Software\\04\\05\\datastructure-agent-main';
const B = path.join(AGENT, 'shared/algorithms/final/b');
const OUT = process.argv[2] || path.join(__dirname, '..', 'web', 'data', 'agent-b.json');

/* ---------------- 用例（每个算法一份，够用即可） ---------------- */
const V = ['A', 'B', 'C', 'D', 'E'];
const WEDGES = [['A', 'B', 4], ['A', 'C', 2], ['B', 'C', 1], ['B', 'D', 5], ['C', 'D', 8], ['C', 'E', 10], ['D', 'E', 2]];
const UEDGES = [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E']];
const TOPO = ['1', '2', '3', '4', '5', '6'];
const TOPO_E = [['1', '2'], ['1', '3'], ['2', '4'], ['3', '4'], ['4', '5'], ['4', '6']];

const CASES = [
  { key: 'bfs', file: 'bfs.js', fn: 'generateBfsSteps', title: 'BFS 广度优先', input: { nodes: V, edges: UEDGES, start: 'A' }, graph: { nodes: V, edges: UEDGES } },
  { key: 'dfs', file: 'dfs.js', fn: 'generateDfsSteps', title: 'DFS 深度优先', input: { nodes: V, edges: UEDGES, start: 'A' }, graph: { nodes: V, edges: UEDGES } },
  { key: 'dijkstra', file: 'dijkstra.js', fn: 'generateDijkstraSteps', title: 'Dijkstra 最短路', input: { nodes: V, edges: WEDGES, start: 'A' }, graph: { nodes: V, edges: WEDGES } },
  { key: 'floyd', file: 'floyd.js', fn: 'generateFloydSteps', title: 'Floyd 全源最短路', input: { nodes: V, edges: WEDGES }, graph: { nodes: V, edges: WEDGES } },
  { key: 'kruskal', file: 'kruskal.js', fn: 'generateKruskalSteps', title: 'Kruskal 最小生成树', input: { nodes: V, edges: WEDGES }, graph: { nodes: V, edges: WEDGES } },
  { key: 'prim', file: 'prim.js', fn: 'generatePrimSteps', title: 'Prim 最小生成树', input: { nodes: V, edges: WEDGES, start: 'A' }, graph: { nodes: V, edges: WEDGES } },
  { key: 'topo', file: 'topological-sort.js', fn: 'generateTopoSteps', title: '拓扑排序', input: { nodes: TOPO, edges: TOPO_E, directed: true }, graph: { nodes: TOPO, edges: TOPO_E } },
  {
    key: 'uf', file: 'union-find.js', fn: 'generateUnionFindSteps', title: '并查集（路径压缩+按秩合并）',
    input: { elements: ['1', '2', '3', '4', '5'], operations: [['union', '1', '2'], ['union', '3', '4'], ['union', '2', '3'], ['find', '4']] },
    graph: null,
  },
];

/* ---------------- 工具 ---------------- */
const q = (s) => '"' + String(s).replace(/"/g, '') + '"';
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function str(v) { return v === null || v === undefined ? '' : String(v); }

/** "B-C(1)" → {u:'B', v:'C', w:1} */
function parseEdgeLabel(s) {
  const m = String(s || '').match(/^(.+?)-(.+?)(?:\((-?\d+(?:\.\d+)?)\))?$/);
  if (!m) return null;
  return { u: m[1].trim(), v: m[2].trim(), w: m[3] == null ? null : Number(m[3]) };
}

/**
 * 把一步的 variables 变成 snapshot：
 *  · 标量/对象 → frames[0].vars（数组型的进 a[0],a[1]… 让数组窗能画）
 *  · 图类结构 → nxm（N/NE/M），渲染只看 shape
 */
function toSnapshot(step, stepIndex, cs) {
  const vars = [];
  const nxm = {};
  const v = step.variables || {};
  const pushScalar = (name, val) => vars.push({ name, kind: typeof val === 'number' ? 'i' : 's', value: str(val) });
  const pushArray = (name, arr) => {
    if (!Array.isArray(arr)) return;
    const a = arr.slice(0, 16);
    for (let i = 0; i < a.length; i++) {
      vars.push({ name: name + '[' + i + ']', kind: 'i', value: str(a[i]) });
    }
  };

  /* --- 通用：把各种"数组型/映射型"变量摊平 --- */
  for (const k of Object.keys(v)) {
    const val = v[k];
    if (Array.isArray(val)) {
      if (val.length && val[0] && typeof val[0] === 'object') continue;   // 对象数组交给图逻辑
      pushArray(k, val);
    } else if (val && typeof val === 'object') {
      // Record<string, T>：dist/previous/key/inDegree/inDegree/parent…
      const keys = Object.keys(val);
      pushArray(k, keys.map(kk => (val[kk] === null ? '-' : val[kk])));
      vars.push({ name: k + '.keys', kind: 's', value: keys.join(',') });
    } else if (val !== null && val !== undefined) {
      pushScalar(k, val);
    }
  }

  /* --- 图类结构：每个算法一个 var，形状由渲染器按 shape 决定 --- */
  const g = cs.graph || { nodes: [], edges: [] };
  const nodes = (g.nodes || []).map(String);
  const edgeList = (g.edges || []).map(e => ({ u: String(e[0]), v: String(e[1]), w: e[2] == null ? null : Number(e[2]) }));

  if (cs.key === 'uf') {
    // 并查集：parent 视作森林的父指针；rank 进 meta
    const parent = v.parent || {};
    const rank = v.rank || {};
    const ids = Object.keys(parent);
    const ev = [['M', 'forest', 'begin=1;len=' + ids.length]];
    ids.forEach((id, i) => {
      ev.push(['N', 'forest', i, str(id)]);
    });
    ids.forEach((id, i) => {
      const p = parent[id];
      if (p !== undefined && p !== null && String(p) !== String(id)) {
        const pi = ids.indexOf(String(p));
        if (pi >= 0) ev.push(['NE', 'forest', i, pi, 'parent']);
      }
    });
    nxm['forest'] = ev;
    vars.push({ name: 'setCount', kind: 'i', value: str(v.setCount) });
    if (v.findPath) vars.push({ name: 'findPath', kind: 's', value: Array.isArray(v.findPath) ? v.findPath.join('→') : str(v.findPath) });
    if (v.currentOp) vars.push({ name: 'currentOp', kind: 's', value: Array.isArray(v.currentOp) ? v.currentOp.join(' ') : str(v.currentOp) });
  } else {
    /* 顶点值：优先 dist / key / inDegree / discoveryOrder 序号 / visited 标记 */
    const valOf = (id) => {
      if (v.dist && v.dist[id] !== undefined && v.dist[id] !== '∞') return str(v.dist[id]);
      if (v.key && v.key[id] !== undefined && v.key[id] !== '∞') return str(v.key[id]);
      if (v.inDegree && v.inDegree[id] !== undefined) return str(v.inDegree[id]);
      if (Array.isArray(v.discoveryOrder)) {
        const idx = v.discoveryOrder.findIndex(x => String(x) === id);
        if (idx >= 0) return '#' + (idx + 1);
      }
      if (Array.isArray(v.visited) && v.visited.some(x => String(x) === id)) return 'V';
      if (Array.isArray(v.inMST) && v.inMST.some(x => String(x) === id)) return 'M';
      return id;
    };
    const ev = [['M', 'graph', 'begin=1;len=' + nodes.length + (v.totalWeight != null ? ';weight=' + v.totalWeight : '')]];
    nodes.forEach((id, i) => ev.push(['N', 'graph', i, valOf(id)]));

    // 选中的边 / 已定型的边用不同 edgeKind，渲染器只认 kind
    const sel = new Set();
    const pickSel = (arr) => {
      (Array.isArray(arr) ? arr : []).forEach(x => {
        const pe = typeof x === 'string' ? parseEdgeLabel(x) : (x && x.u ? x : null);
        if (pe) sel.add(pe.u + '|' + pe.v), sel.add(pe.v + '|' + pe.u);
      });
    };
    pickSel(v.selectedEdges);
    if (Array.isArray(v.inMST)) v.inMST.forEach(x => sel.add(String(x)));

    edgeList.forEach(e => {
      const iu = nodes.indexOf(e.u), iv = nodes.indexOf(e.v);
      if (iu < 0 || iv < 0) return;
      const hot = sel.has(e.u + '|' + e.v) || sel.has(e.v);
      ev.push(['NE', 'graph', iu, iv, hot ? 'mst' : 'adj']);
    });

    // Prim/Dijkstra 的 parent/previous 才是"生成树边"；Kruskal 的 parent 是并查集，不能当图边
    const tree = (cs.key === 'prim' || cs.key === 'dijkstra') ? (v.parent || v.previous || null) : null;
    if (tree && typeof tree === 'object') {
      Object.keys(tree).forEach(id => {
        const p = tree[id];
        if (p == null) return;
        const iu = nodes.indexOf(String(id)), iv = nodes.indexOf(String(p));
        if (iu >= 0 && iv >= 0) ev.push(['NE', 'graph', iu, iv, 'tree']);
      });
    }
    nxm['graph'] = ev;
  }

  /* --- Floyd：矩阵单独作为二维数组窗的数据 --- */
  if (Array.isArray(v.matrix)) {
    const rows = v.matrix.map(r => String(r).split(',').map(x => x.trim()));
    rows.slice(0, 6).forEach((row, i) => row.slice(0, 6).forEach((cell, j) => {
      vars.push({ name: 'matrix[' + i + '][' + j + ']', kind: 'i', value: String(cell).replace('∞', '-1') });
    }));
  }

  return {
    step: stepIndex,
    line: 0,
    depth: 1,
    frames: [{ fn: cs.key, depth: 1, base: 0, sp: 0, vars }],
    nxm,
    lists: {},
    heap: [],
    heapCursor: 9999,
    sp: 0,
    truncated: false,
    desc: step.description || '',
    event: step.event || '',
    lineId: step.lineId || '',
  };
}

/** 上游把源码行表写成 `const SOURCE_LINES = [...]`，但**没有 export**。
 *  这里从文件文本里把数组字面量抠出来求值（纯字符串数组，安全）。 */
function extractSourceLines(fileText) {
  const i = String(fileText || '').indexOf('SOURCE_LINES');
  if (i < 0) return null;
  const start = fileText.indexOf('[', i);
  if (start < 0) return null;
  let depth = 0, end = -1;
  for (let k = start; k < fileText.length; k++) {
    const ch = fileText[k];
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (!depth) { end = k; break; } }
  }
  if (end < 0) return null;
  const literal = fileText.slice(start, end + 1);
  try {
    const arr = new Function('return ' + literal)();
    return Array.isArray(arr) ? arr : null;
  } catch (e) { return null; }
}

(async () => {
  const out = { generatedAt: new Date().toISOString(), source: AGENT, algorithms: [] };
  for (const cs of CASES) {
    let steps;
    try {
      const mod = await import('file:///' + path.join(B, cs.file).replace(/\\/g, '/'));
      const r = mod[cs.fn](cs.input);
      steps = Array.isArray(r) ? r : (r && Array.isArray(r.steps) ? r.steps : null);
      if (!steps) throw new Error('返回不是数组，也不是 {steps:[]}：' + Object.keys(r || {}).join(','));
    } catch (e) {
      console.log('!! ' + cs.key + ' 失败：' + e.message);
      continue;
    }
    const fileText = fs.readFileSync(path.join(B, cs.file), 'utf8');
    const sourceLines = extractSourceLines(fileText);
    out.algorithms.push({
      key: cs.key, title: cs.title, stepCount: steps.length,
      sourceLines,
      steps: steps.map((s, i) => toSnapshot(s, i, cs)),
    });
    console.log(cs.key.padEnd(10) + ' → ' + String(steps.length).padStart(4) + ' 步，源码行表 ' + (sourceLines ? sourceLines.length : 0) + ' 行');
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
  console.log('\n写入 ' + OUT + '  (' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB)');
})();
