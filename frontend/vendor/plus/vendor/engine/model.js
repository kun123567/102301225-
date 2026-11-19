/**
 * 模型层（09_OBJECT_MODEL.md 复原）+ 场景构造器。
 *
 * 复原的总契约：**任何被画出来的东西，最终都是"一串带 kind 与 offset 的字段项"**。
 * 渲染器只消费两种信息：(1) 字段表 (2) 取值。所以这里提供：
 *   · buildFields()：复刻 sub_4BAE28 —— 成员 kind==11 进成员表，按 kind 分桶，偏移累加，
 *     类型自带 sizeof（对应 vmt+16），并给成员打「已布局」标记位 2；
 *   · memCell()：复刻 TMemCellAttirbute —— 一格的 label/name/value/addr 四列 + 状态色；
 *   · 九个 layer 构造器：算法模块只描述"数据 + 角色"，不碰像素。
 *
 * 算法模块（src/algorithms/**.js）只允许用这里的构造器产出 step，
 * 这样"代码运行进度 → 画面"的映射对所有算法是同构的，02 的播放器只需要认一种格式。
 */

import { ARRAY, LINK, MEMORY } from './theme.js';

export const FIELD_KIND = {
  STRUCT_MEMBER: 11,   // 结构体成员（sub_4BAE28 里 kind==11 才进成员表）
  ARRAY: 18,           // 数组（self[4]==18 时偏移按 0 处理，即"整体一块"）
  PTR: 7,
  INT: 9,
  CHAR: 10,
};

/** 类型 → sizeof（复原「每个类型节点都能回答自己的大小」） */
const TYPE_SIZE = { int: 4, long: 8, double: 8, char: 1, ptr: 4, bool: 1, struct: 0 };

export function sizeOf(type) {
  return TYPE_SIZE[type] ?? 4;
}

/**
 * 复刻 sub_4BAE28：把对象定义展开成字段表。
 * @param {{name?:string, kind?:number, isArray?:boolean, members:Array<{name:string,type:string,kind?:number,arrayLen?:number}>}} def
 */
export function buildFields(def = { members: [] }) {
  const fields = { name: def.name || 'obj', kind: def.kind ?? FIELD_KIND.STRUCT_MEMBER, members: [], buckets: {}, offsetOf: {} };
  let offset = 0;
  for (const m of def.members || []) {
    const kind = m.kind ?? (m.type === 'ptr' ? FIELD_KIND.PTR : m.type === 'char' ? FIELD_KIND.CHAR : FIELD_KIND.INT);
    const size = m.arrayLen ? sizeOf(m.type) * m.arrayLen : sizeOf(m.type);
    const item = { name: m.name, type: m.type, kind, offset: def.isArray ? 0 : offset, size, laidOut: true };
    fields.members.push(item);
    fields.offsetOf[m.name] = item.offset;
    // offset += vmt[16](类型节点) —— 语义等价：累加 sizeof
    offset += size;
    // 按 kind 分桶（kind 9/10/7 各自一桶，其它落 misc）
    const bucket = kind === FIELD_KIND.INT ? 'ints' : kind === FIELD_KIND.CHAR ? 'chars' : kind === FIELD_KIND.PTR ? 'ptrs' : 'misc';
    (fields.buckets[bucket] ||= []).push(item);
  }
  fields.byteSize = offset;
  return fields;
}

/** TMemCellAttirbute：一格内存长什么样（08_MEMORY_CELL.md） */
export function memCell({ label = '', name = '', value = '', addr = null, state = 'node' } = {}) {
  const fill = { node: MEMORY.MemNode, empty: MEMORY.MemEmpty, focus: '#ffe0e0', invalid: MEMORY.MemInvalid, done: '#dff5e6' }[state] || MEMORY.MemNode;
  const stroke = state === 'focus' ? MEMORY.MemFocus : state === 'invalid' ? '#c7d0de' : MEMORY.MemFrame;
  return { label, name, value: String(value), addr, state, fill, stroke };
}

/* ------------------------------------------------------------------ 角色归一化 */

/**
 * roles 里所有成员都允许写成「下标数组 / 节点 id 数组」。
 * 归一化后渲染器用 Set 做 O(1) 判定。
 */
export function norm(roles = {}) {
  const toSet = (v) => new Set(Array.isArray(v) ? v : v == null ? [] : [v]);
  const pointers = (roles.pointers || []).map((p, i) => ({ id: p.id || `p${i}`, label: p.label ?? p.id ?? String(i), color: p.color, index: p.index, node: p.node }));
  return {
    f1: toSet(roles.focus1),
    f2: toSet(roles.focus2),
    swap: toSet(roles.swap),
    done: toSet(roles.done),
    excl: toSet(roles.excluded),
    added: toSet(roles.added),
    pointers,
    badges: roles.badges || [],
    marks: roles.marks || {},
    raw: roles,
  };
}

/* ------------------------------------------------------------------ layer 构造器 */

function base(style, props, o) {
  return { id: o.id, title: o.title || '', style, props: { ...props, ...(o.props || {}) }, data: o.data || {}, roles: o.roles || {} };
}

/** style 1/5：一维数组（Shape × Grid × Line 三开关，02_ARRAY_1D.md） */
export function arrayLayer(o = {}) {
  return {
    ...base(5, { shape: ARRAY.ArrOneShape, showGrid: ARRAY.ArrOneShowGrid, showLine: ARRAY.ArrOneShowLine, showValues: true }, o),
    style: o.style || 1,
    data: {
      name: o.name ?? '',
      values: o.values || [],
      labels: o.labels || null,
      indexBase: o.indexBase ?? 0,
      axis: o.axis !== false,
      unit: o.unit || '',
    },
  };
}

/** style 2：二维数组 / 矩阵 / 柱状（DrawMode 0..3，03_ARRAY_2D.md） */
export function matrixLayer(o = {}) {
  return {
    ...base(2, { drawMode: 1, pitch: 18, yaw: -26, zoom: 1 }, o),
    data: {
      name: o.name ?? '',
      values: o.values || [],
      rowLabels: o.rowLabels || null,
      colLabels: o.colLabels || null,
      cellLabels: o.cellLabels || null,
      unit: o.unit || '',
    },
  };
}

/** style 6：二维表格（GDI 降级，TArrayForm） */
export function gridLayer(o = {}) {
  return {
    ...base(6, { cellW: 46, cellH: 26 }, o),
    data: {
      name: o.name ?? '',
      values: o.values || [],
      rowLabels: o.rowLabels || null,
      colLabels: o.colLabels || null,
      cellLabels: o.cellLabels || null,
      triples: o.triples || null,
    },
  };
}

/** style 3：链表 2D（节点框 + 直角折线 + 箭头，04_LINK_2D.md） */
export function linkLayer(o = {}) {
  return {
    ...base(3, { roundShape: LINK.LinkRoundShape, linkFirst: LINK.LinkLinkFirst, nodeW: 92, nodeH: 44, gap: 46 }, o),
    data: {
      name: o.name ?? '',
      nodes: o.nodes || [],       // [{id, value, fields?, state?}]
      links: o.links || [],       // [{from, to, label?}] 缺省按 nodes.next 顺序连
      head: o.head ?? null,       // 头指针指向的节点 id
      fields: o.fields || null,   // 字段表（buildFields 的 members）
      order: o.order || null,     // 显式排列顺序（缺省=从 head 沿链）
    },
  };
}

/** style 7：栈（竖向堆叠 + top 高亮，06_STACK_HEAP.md） */
export function stackLayer(o = {}) {
  return {
    ...base(7, { cellH: 30, cellW: 150, vertical: true }, o),
    data: {
      name: o.name ?? 'S',
      cells: o.cells || [],   // [{id?, value, state?:'normal'|'focus'|'empty'|'done'}]
      top: o.top ?? null,     // 栈顶下标
      capacity: o.capacity ?? null,
      bottomLabel: o.bottomLabel ?? 'bottom',
      topLabel: o.topLabel ?? 'top',
    },
  };
}

/** style 8：堆 / 内存单元（稀疏地址 + 已分配/空闲，06_STACK_HEAP.md §3） */
export function heapLayer(o = {}) {
  return {
    ...base(8, { cellW: 64, cellH: 30, showTree: o.showTree !== false }, o),
    data: {
      name: o.name ?? 'heap',
      cells: o.cells || [],          // memCell() 或 {label,name,value,addr,state}
      tree: o.tree || null,          // 逻辑堆数组（画成完全二叉树辅助判断父子）
      treeRoot: o.treeRoot ?? 0,
    },
  };
}

/** style 9：树/森林（TTreeForm；canvas 后端按层现算坐标，treeview 后端堆节点） */
export function treeLayer(o = {}) {
  return {
    ...base(9, { layout: o.layout || 'canvas', levelGap: 84, siblingGap: 26 }, o),
    data: {
      name: o.name ?? '',
      nodes: o.nodes || [],   // [{id,label,value?,left?,right?,children?,parent?,color?}]
      roots: o.roots || [],
      edgeTags: o.edgeTags || null,   // {[childId]:'L'|'R'|'C'|'→'}
      threads: o.threads || null,     // [{from,to,type:'prev'|'next'}] 线索边
      extraEdges: o.extraEdges || null,
      levels: o.levels || null,
    },
  };
}

/** style 10：图（node-link，扩展渲染器；可与 style 9 的 TreeView 形态互切） */
export function graphLayer(o = {}) {
  return {
    ...base(10, { directed: o.directed ?? false, weighted: o.weighted ?? true, layout: o.layout || 'circle' }, o),
    data: {
      name: o.name ?? '',
      nodes: o.nodes || [],   // [{id,label,x?,y?,state?}]
      edges: o.edges || [],   // [{from,to,w?,directed?,state?:'tree'|'reject'|'candidate'|'path'|'active'}]
      layout: o.layout || 'circle',
    },
  };
}

/* ------------------------------------------------------------------ step / trace */

const TRACE_SCHEMA = 'trace-v1';

function assert(cond, msg) {
  if (!cond) throw new Error(`[trace] ${msg}`);
}

/**
 * 构造一步。
 * @param {object} o { event, lineId, note, layers, vars, done, result }
 */
export function step(o) {
  assert(o && o.event, 'step 缺少 event');
  assert(o.lineId, 'step 缺少 lineId（必须能在 sourceLines 里找到）');
  assert(Array.isArray(o.layers) && o.layers.length > 0, 'step 至少要有一个 layer');
  for (const l of o.layers) {
    assert(l && l.id && Number.isInteger(l.style), `layer 缺少 id/style：${JSON.stringify(l && l.id)}`);
  }
  return {
    event: o.event,
    lineId: o.lineId,
    note: o.note || '',
    vars: o.vars || {},
    layers: o.layers,
    done: !!o.done,
    result: o.done ? (o.result ?? null) : null,
  };
}

/**
 * 构造整条轨迹；在这里就做完整性自检（失败大声报错，不静默）。
 * @param {object} o { algorithmId, variantId, sourceVersion, lines, steps, result, meta }
 */
export function trace(o) {
  assert(o.algorithmId, 'trace 缺少 algorithmId');
  assert(o.variantId, 'trace 缺少 variantId');
  assert(Array.isArray(o.lines) && o.lines.length > 0, 'trace 缺少 sourceLines');
  assert(Array.isArray(o.steps) && o.steps.length > 0, 'trace 缺少 steps');

  const lineIds = new Set(o.lines.map((l) => l.lineId));
  const steps = o.steps.map((s, i) => ({ ...s, stepIndex: i }));
  for (const s of steps) {
    assert(lineIds.has(s.lineId), `${o.algorithmId}/${o.variantId} 第 ${s.stepIndex} 步的 lineId 不在 sourceLines 里：${s.lineId}`);
  }
  assert(steps[steps.length - 1].done, `${o.algorithmId}/${o.variantId} 最后一步必须 done=true`);

  return {
    schemaVersion: TRACE_SCHEMA,
    algorithmId: o.algorithmId,
    variantId: o.variantId,
    sourceVersion: o.sourceVersion || `${o.algorithmId}-v1`,
    sourceLines: o.lines,
    steps,
    result: o.result ?? null,
    meta: o.meta || {},
  };
}

/** 行定义简写 */
export function lines(arr) {
  return arr.map((text, i) => ({ lineId: i === 0 ? 'fn' : `l${i}`, text, no: i + 1 }));
}

/** 给 sourceLines 补上行号 */
export function withLineNo(list) {
  return list.map((l, i) => ({ ...l, no: l.no ?? i + 1 }));
}

export { TRACE_SCHEMA };
