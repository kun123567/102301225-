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

const arrayLayer = (name, values, focus = null) => ({
  id: 'arr:' + name,
  title: name,
  style: 1,
  props: { shape: 0, showGrid: true, showLine: false, showValues: true },
  data: {
    name,
    values: values.map((v) => (v == null ? 0 : v)),
    labels: values.map((v) => String(v == null ? 0 : v)),
    indexBase: 0,
    axis: true,
    unit: '',
  },
  roles: focus == null ? {} : { focus1: [focus] },
});

const listLayer = (name, nodes, head) => ({
  id: 'list:' + name,
  title: name,
  style: 3,
  props: { roundShape: false, linkFirst: false, nodeW: 92, nodeH: 44, gap: 46 },
  data: {
    name: `${name}（链）`,
    nodes: nodes.map((node) => ({ id: node.id, value: node.label })),
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

const graphLayer = (name, nodes, edges) => ({
  id: 'graph:' + name,
  title: name,
  style: 10,
  props: { directed: false, weighted: false, layout: 'circle' },
  data: {
    name,
    nodes: nodes.map((node) => ({ id: node.id, label: node.label, sub: node.sub == null ? undefined : String(node.sub), badge: null })),
    edges: edges.map((edge) => ({ from: edge.from, to: edge.to, state: 'idle', directed: false })),
    layout: 'circle',
  },
  roles: {},
});

/** 事件流 → 结构化模型（可变，按步取快照） */
function emptyModel() {
  return { arrays: new Map(), structures: new Map(), graphs: new Map() };
}

function snapshotLayers(model) {
  const layers = [];
  for (const [name, entry] of model.structures) {
    if (entry.shape === 'tree' && entry.nodes.length) {
      layers.push(treeLayer(name, entry.nodes, entry.root));
    } else if (entry.shape === 'list' && entry.nodes.length) {
      layers.push(listLayer(name, entry.nodes, entry.nodes[0] && entry.nodes[0].id));
    }
  }
  for (const [name, entry] of model.graphs) {
    if (entry.nodes.length) layers.push(graphLayer(name, entry.nodes, entry.edges));
  }
  for (const [name, entry] of model.arrays) {
    if (entry.values.length) layers.push(arrayLayer(name, entry.values, entry.focus));
  }
  return layers;
}

const ARRAY_ELEMENT_RE = /^([A-Za-z_]\w*)\[(\d+)\]$/;

/**
 * 引擎事件 → 每步一层 layers（顺序与 S 事件一致）
 * @param {{trace:object, sourceLines?:Array, preludeLines?:number}} input
 * @returns {{ok:true, steps:Array, style:number|null, families:string[], stats:object}|{ok:false,error:string}}
 */
export function buildLayerRun({ trace, sourceLines = [], preludeLines = 0 } = {}) {
  const events = trace?.events || [];
  const model = emptyModel();
  const openDump = new Map();        // var → {nodes: Map(idx→node), shape, root}
  const steps = [];
  const families = new Set();
  let lastLine = null;

  const toUserLine = (engineLine) => {
    const line = Number(engineLine) - preludeLines;
    return Number.isInteger(line) && line >= 1 && line <= (sourceLines.length || Infinity) ? line : null;
  };

  for (const event of events) {
    const kind = event[0];
    if (kind === 'S') {
      /* 每个 S 都是一步：把当前模型快照下来（S = "即将执行这一行"，快照就是执行前的状态）。
         顺带清掉上一步的"聚焦元素" —— 聚焦表示"这一步写了谁"，不该跨步残留。 */
      for (const entry of model.arrays.values()) entry.focus = null;
      const layers = snapshotLayers(model);
      lastLine = toUserLine(event[1]);
      steps.push({ stepIndex: steps.length, lineId: lastLine == null ? null : String(lastLine), layers, note: '', engineLine: event[1] });
      continue;
    }
    if (kind === 'V') {
      const [, line, name, , value] = event;
      const element = ARRAY_ELEMENT_RE.exec(String(name || ''));
      if (!element) continue;
      const [, base, idxText] = element;
      const index = Number(idxText);
      if (index >= MAX_NODES) continue;
      const entry = model.arrays.get(base) || { values: [], focus: null };
      while (entry.values.length <= index) entry.values.push(null);
      const num = Number(value);
      if (entry.values[index] !== num && Number.isFinite(num) && entry.focus == null) entry.focus = index;   // 记本步第一个变化的元素
      entry.values[index] = Number.isFinite(num) ? num : 0;
      model.arrays.set(base, entry);
      families.add('array');
      const step = steps[steps.length - 1];
      if (step && line === step.engineLine) {
        step.layers = snapshotLayers(model);
      }
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
      dump.nodes.set(idx, { id: 'n' + idx, label: String(key), left: null, right: null, value: more ? null : null });
      dump.lastIdx = idx;
      openDump.set(name, dump);
      continue;
    }
    if (kind === 'NM') {
      const [, name, idxText, kv] = event;
      const idx = Number(idxText);
      const dump = openDump.get(name);
      if (!dump) continue;
      const node = dump.nodes.get(idx);
      if (!node) continue;
      const match = /^(left|right)=(-?\d+)$/.exec(String(kv || ''));
      if (!match) continue;
      const childIdx = Number(match[2]);
      if (childIdx < 0) continue;
      node[match[1]] = 'n' + childIdx;
      continue;
    }
    if (kind === 'LE') {
      const [, name, countText, shape] = event;
      const dump = openDump.get(name);
      if (!dump) continue;
      const count = Number(countText);
      if (!Number.isFinite(count) || count <= 0 || !dump.nodes.size) { openDump.delete(name); continue; }
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
      if (step) step.layers = snapshotLayers(model);
      continue;
    }
    if (kind === 'N') {
      const [, name, idxText, value] = event;
      const idx = Number(idxText);
      if (idx >= MAX_NODES) continue;
      const entry = model.graphs.get(name) || { nodes: [], edges: [] };
      if (!entry.nodes[idx]) entry.nodes[idx] = { id: 'v' + idx, label: String(value == null ? idx : value), sub: idx };
      model.graphs.set(name, entry);
      families.add('graph');
      continue;
    }
    if (kind === 'NE') {
      const [, name, fromText, toText] = event;
      const entry = model.graphs.get(name) || { nodes: [], edges: [] };
      const from = Number(fromText);
      const to = Number(toText);
      if (!entry.nodes[from]) entry.nodes[from] = { id: 'v' + from, label: String(from), sub: from };
      if (!entry.nodes[to]) entry.nodes[to] = { id: 'v' + to, label: String(to), sub: to };
      if (entry.edges.length < MAX_EDGES) entry.edges.push({ from: 'v' + from, to: 'v' + to });
      model.graphs.set(name, entry);
      families.add('graph');
      const step = steps[steps.length - 1];
      if (step) step.layers = snapshotLayers(model);
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
