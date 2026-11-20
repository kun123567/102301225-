/**
 * 数据结构 → 样式（渲染器）总表。**先定数据结构，再定算法动画。**
 *
 * 依据 D:\.FZU\00Item\04\AnyviewC\.bench\10_viz_principles 复原：
 *   · 04_LINK_2D.md §5「支持的 25 种数据结构的画法归属」
 *   · 07_TREE_GRAPH.md §2「为什么树类数据结构全部走 TreeView」
 *   · 01_RENDER_DISPATCH.md §1「渲染器表 + style 号」
 *   · 06_STACK_HEAP.md / 08_MEMORY_CELL.md（栈/堆/内存共用单元格原语）
 *
 * 还原的关键结论：**渲染器由数据结构的「形状类别」决定**，不是由 C 声明类型决定。
 *   linear-chain → Link；tree-graph → Tree/Graph；array-string → Array；stack-heap → StackHeap。
 *
 * 范围裁剪（用户明确要求）：**不做 3D**。
 * 因此 style 4（TLinkOpenGLForm：球节点 + 锥边 + GLU 显示列表）整条链路移除，
 * 二维数组的 4 个 DrawMode 保留语义但改用 2D 等效画法。保留的 style 号与原版一致，
 * 缺号 4 即裁剪点——写在这里，而不是悄悄重编号。
 */

/** AnyviewC style → 渲染器类名（01_RENDER_DISPATCH.md §1） */
export const RENDERERS = {
  1: { key: 'one-array', label: '一维数组', cls: 'TOneArrayForm', backend: 'canvas' },
  2: { key: 'two-array', label: '二维数组 / 矩阵', cls: 'TTwoArrayForm', backend: 'canvas' },
  3: { key: 'link-2d', label: '链表', cls: 'TLinkForm', backend: 'canvas' },
  5: { key: 'one-array', label: '一维数组（兜底）', cls: 'TOneArrayForm', backend: 'canvas' },
  6: { key: 'array-base', label: '数组基类（GDI 降级）', cls: 'TArrayForm', backend: 'canvas' },
  7: { key: 'stack', label: '栈', cls: 'TDSStackForm', backend: 'canvas' },
  8: { key: 'heap', label: '堆 / 内存单元', cls: 'THeapForm', backend: 'canvas' },
  9: { key: 'tree', label: '树 / 森林（TTreeView）', cls: 'TTreeForm', backend: 'treeview' },
  10: { key: 'graph', label: '图（node-link，扩展）', cls: 'TGraphForm(ext)', backend: 'canvas', extend: true },
};

/** 后端契约（00_PRINCIPLE_OVERVIEW.md §1 ④ 后端层）：只保留纯 2D 两条路径 */
export const BACKENDS = {
  canvas: { label: 'TCanvas(GDI)', desc: '纯 2D 像素：MoveTo/LineTo/FillRect，几何在渲染器内现算' },
  treeview: { label: 'TTreeView', desc: '不画线：节点由控件堆出来，StateIndex 14/15 = 叶 / 有子' },
};

/**
 * 14 个数据结构族。
 *  - style：默认面板渲染器；altStyles 为同一结构可切换的其它样式（界面上的"样式"下拉）。
 *  - kindModel：映射到模型层（09_OBJECT_MODEL.md）的字段表 kind：
 *    kind 18 = 数组（元素连续），11 = 结构体成员，9/10 = 类型分类，7 = 指针。
 */
export const DATA_STRUCTURES = [
  {
    id: 'sqlist',
    name: '顺序表 / 整数数组 a[]',
    cTypes: ['SqList'],
    family: 'array',
    style: 1,
    altStyles: [5, 6],
    kindModel: { kind: 18, fields: [{ name: 'data', kind: 18 }, { name: 'length', kind: 9 }] },
    props: { shape: 0, showGrid: true, showLine: false, showValues: true },
    notes: '一维数组真实形态空间 = 2(Shape) × 2(Grid) × 2(Line) = 8 种（02_ARRAY_1D.md）。',
  },
  {
    id: 'string',
    name: '串 / 字符数组 SStr',
    cTypes: ['SStr', 'LStr'],
    family: 'array',
    style: 1,
    altStyles: [6],
    kindModel: { kind: 18, fields: [{ name: 'ch', kind: 10 }, { name: 'length', kind: 9 }] },
    props: { shape: 0, showGrid: true, showLine: false, showValues: true },
    notes: 'AnyviewC 里 SStr 归 TOneArrayForm / TTwoArrayForm（04_LINK_2D.md §5）。',
  },
  {
    id: 'matrix',
    name: '二维矩阵 / 邻接矩阵',
    cTypes: ['MG', 'MGraph'],
    family: 'array',
    style: 2,
    altStyles: [6],
    kindModel: { kind: 18, dims: 2, fields: [{ name: 'rows', kind: 9 }, { name: 'cols', kind: 9 }] },
    props: { drawMode: 1 },
    notes: 'DrawMode 0 圆柱 / 1 柱状 / 2 球 / 3 曲面（03_ARRAY_2D.md），本项目用 2D 等效画法。',
  },
  {
    id: 'grid2d',
    name: '二维表格（GDI 降级）',
    cTypes: ['TArrayForm'],
    family: 'array',
    style: 6,
    altStyles: [2],
    kindModel: { kind: 18, dims: 2 },
    props: { cellW: 46, cellH: 26 },
    notes: '没有 OpenGL 时的平面表示，TArrayForm 用 TCanvas 画线段（03_ARRAY_2D.md §5）。',
  },
  {
    id: 'linkedlist',
    name: '单链表 / 链队列',
    cTypes: ['NLinkList', 'LinkQueue', 'SqQueue', 'CLenQueue'],
    family: 'chain',
    style: 3,
    altStyles: [],
    kindModel: {
      kind: 11,
      fields: [
        { name: 'data', kind: 9, size: 4 },
        { name: 'next', kind: 7, size: 4 },
      ],
    },
    props: { roundShape: false, linkFirst: false, nodeW: 92, nodeH: 44, gap: 46 },
    notes: '节点框用 4 条 MoveTo/LineTo 手画（便于逐边换色），连线是直角折线（04_LINK_2D.md）。',
  },
  {
    id: 'stack',
    name: '栈 SqStack',
    cTypes: ['SqStack'],
    family: 'stackheap',
    style: 7,
    altStyles: [],
    kindModel: { kind: 18, fields: [{ name: 'data', kind: 18 }, { name: 'top', kind: 9 }] },
    props: { cellH: 30, cellW: 150, vertical: true },
    notes: '竖向堆叠、top 指针高亮；每次变化 Free 全部单元格再整幅重绘（06_STACK_HEAP.md）。',
  },
  {
    id: 'heap',
    name: '堆 / 优先队列 Heap',
    cTypes: ['Heap', 'HFTree'],
    family: 'stackheap',
    style: 8,
    altStyles: [1],
    kindModel: { kind: 18, fields: [{ name: 'data', kind: 18 }, { name: 'size', kind: 9 }] },
    props: { cellW: 64, cellH: 30, showTree: true },
    notes: '按地址稀疏摆放（空洞用 MemEmpty）+ 已分配/空闲两态色（06_STACK_HEAP.md §3）。',
  },
  {
    id: 'memcell',
    name: '内存单元 / 结点对象表',
    cTypes: ['TMemCellAttirbute'],
    family: 'stackheap',
    style: 8,
    altStyles: [],
    kindModel: {
      kind: 11,
      fields: [
        { name: 'addr', kind: 9, size: 4 },
        { name: 'name', kind: 10, size: 1 },
        { name: 'value', kind: 9, size: 4 },
      ],
    },
    props: { cellW: 70, cellH: 28, cols: ['label', 'name', 'value', 'addr'] },
    notes: '四列（label/name/value/addr）+ 四边变体绘制，栈/堆/内存三视图共用（08_MEMORY_CELL.md）。',
  },
  {
    id: 'tree',
    name: '二叉树 / 森林 / B 树 / 红黑树',
    cTypes: ['BTree', 'BpTree', 'RBTree', 'BiThrTree', 'CTree', 'PTree'],
    family: 'tree',
    style: 9,
    altStyles: [],
    kindModel: {
      kind: 11,
      fields: [
        { name: 'key', kind: 9, size: 4 },
        { name: 'lchild', kind: 7, size: 4 },
        { name: 'rchild', kind: 7, size: 4 },
      ],
    },
    props: { layout: 'canvas', levelGap: 84, siblingGap: 26 },
    notes: 'AnyviewC 树/图走 TTreeView（StateIndex 14 叶 / 15 有子）；canvas 后端是同一 renderer 的'
      + '第二种后端，节点坐标由渲染器按层现算，保持「无场景图」原则。',
  },
  {
    id: 'graph',
    name: '图（邻接表 / 邻接矩阵）',
    cTypes: ['ALGraph', 'OLGraph'],
    family: 'graph',
    style: 10,
    altStyles: [9],
    kindModel: {
      kind: 11,
      fields: [
        { name: 'vex', kind: 9, size: 4 },
        { name: 'firstarc', kind: 7, size: 4 },
      ],
    },
    props: { directed: false, weighted: true, layout: 'circle' },
    notes: 'AnyviewC 把 ALGraph/MGraph/OLGraph 归 TTreeForm；node-link 为扩展渲染器（style 10），'
      + '界面上可与 style 9 的 TreeView 形态互切。',
  },
  {
    id: 'dsu',
    name: '并查集 / 双亲树 UFSet',
    cTypes: ['UFSet', 'PTree'],
    family: 'tree',
    style: 9,
    altStyles: [1],
    kindModel: { kind: 18, fields: [{ name: 'parent', kind: 18 }, { name: 'rank', kind: 9 }] },
    props: { layout: 'canvas', showParentArray: true },
    notes: '双亲表示法：parent[] 数组 + 父子树两种视图（07_TREE_GRAPH.md 双亲树归 TTreeForm）。',
  },
  {
    id: 'hash',
    name: '哈希表（开放定址）',
    cTypes: ['OpenHashTab'],
    family: 'array',
    style: 1,
    altStyles: [6],
    kindModel: { kind: 18, fields: [{ name: 'slot', kind: 18 }, { name: 'flag', kind: 9 }] },
    props: { shape: 0, showGrid: true, showLine: false, showValues: true },
    notes: '槽位 = 一维数组格；探测轨迹用 Focus1/Focus2 双焦点色区分「初始槽」与「当前探测槽」。',
  },
  {
    id: 'hashchain',
    name: '哈希表（链地址）',
    cTypes: ['ChainHashTab'],
    family: 'chain',
    style: 3,
    altStyles: [],
    kindModel: {
      kind: 11,
      fields: [
        { name: 'data', kind: 9, size: 4 },
        { name: 'next', kind: 7, size: 4 },
      ],
    },
    props: { roundShape: true, linkFirst: false, nodeW: 76, nodeH: 38, gap: 34 },
    notes: '桶头 = 头指针标记（LinkHead），链内比较 = 节点框换色（04_LINK_2D.md）。',
  },
  {
    id: 'queue',
    name: '队列 / 零入度集合',
    cTypes: ['SqQueue', 'CLenQueue'],
    family: 'chain',
    style: 3,
    altStyles: [7],
    kindModel: { kind: 11, fields: [{ name: 'data', kind: 9, size: 4 }, { name: 'next', kind: 7, size: 4 }] },
    props: { roundShape: true, linkFirst: true, nodeW: 62, nodeH: 40, gap: 26, horizontal: true },
    notes: 'AnyviewC 里循环队列归 TLinkForm（04_LINK_2D.md §5）；可切到栈视图观察出入队端。',
  },
];

export const DS_BY_ID = Object.fromEntries(DATA_STRUCTURES.map((d) => [d.id, d]));

/** 家族 → 渲染器归属（04_LINK_2D.md §5 的形状类别结论） */
export const FAMILY_RULE = {
  array: '数组/串 → Array 族（TOneArrayForm / TTwoArrayForm / TArrayForm）',
  chain: '线性/链式 → Link 族（TLinkForm）',
  tree: '树形/图形 → Tree 族（TTreeForm）',
  graph: '图形 → Tree 族（TTreeForm），本项目追加 node-link 扩展',
  stackheap: '栈/堆 → StackHeap 族（TDSStackForm / THeapForm）+ MemCellUnit 单元格原语',
};

export function resolveStyle(dsId, override) {
  if (Number.isInteger(override) && RENDERERS[override]) return override;
  const ds = DS_BY_ID[dsId];
  return ds ? ds.style : 1;
}

/** 一个结构可切换的样式集合（界面「数据结构样式」下拉的选项来源） */
export function styleOptions(dsId) {
  const ds = DS_BY_ID[dsId];
  if (!ds) return [1];
  return [...new Set([ds.style, ...(ds.altStyles || [])])].filter((s) => RENDERERS[s]);
}
