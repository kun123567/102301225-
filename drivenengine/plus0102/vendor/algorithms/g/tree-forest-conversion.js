/**
 * G · 树与森林转换（3 个彼此不同的实现）
 *
 * 一条规则贯穿全程（教材口径的"孩子兄弟表示法"）：
 *   左孩子 = 长子（第一个孩子）；右孩子 = 下一个兄弟。
 *   v1 树 → 二叉树：单棵树内逐条父子边转换，树根没有兄弟，所以 rchild 恒为 NULL；
 *   v2 森林 → 二叉树：先逐棵树转换，再把 n 个根用右兄弟链串起来 —— 森林的 n 个根在二叉树里只剩 1 个；
 *   v3 二叉树 → 森林（逆转换）：沿右链断根得到根集合，再按"左孩子→孩子、右孩子→兄弟"还原，
 *      并做往返校验：还原出的森林必须与输入森林逐棵一致。
 *
 * 画法：两层并排 —— 左边「原树/森林」用 children 表示（父子边），右边「二叉树」用 left/right 表示，
 * edgeTags 标 L/R，新建立的边再用 extraEdges 描一遍箭头，这样"哪条父子边变成了哪条 L/R 边"一目了然。
 * 根边界也画出来了：forestView 给每棵树的根挂 badge "根"，binView 只给二叉树唯一的根挂 badge。
 */

import { trace, step, treeLayer } from '../../engine/model.js';

export const meta = {
  id: 'g/tree-forest-conversion',
  variants: [
    { id: 'v1', name: '树 → 二叉树', note: '左孩子指向第一个孩子，右兄弟指向下一个兄弟，逐条边转换' },
    { id: 'v2', name: '森林 → 二叉树', note: '各棵树根之间用右兄弟链串起来，是树→二叉树的自然推广' },
    { id: 'v3', name: '二叉树 → 森林（逆转换）', note: '沿右链断开根集合，再按左孩子→孩子、右孩子→兄弟还原，验证往返一致' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

/** 任务单指定：森林 = 树 A(孩子 B、C) + 树 D(孤立根) */
const FOREST = [
  { root: 'A', children: ['B', 'C'] },
  { root: 'D', children: [] },
];

/** 往返样例：A 有三个孩子（兄弟链更长），再加一棵孤立的 D */
const FOREST_DEEP = [
  { root: 'A', children: ['B', 'C', 'E'] },
  { root: 'D', children: [] },
];

export const samples = [
  {
    id: 'normal',
    label: '森林 A(B,C) + D：A 左接 B、B 右接 C、A 右接 D',
    input: { forest: FOREST, tree: FOREST[0] },
    expect: {
      binary: ['A -L-> B', 'A -R-> D', 'B -R-> C'],
      binaryRoots: ['A'],
      forestRoots: ['A', 'D'],
      forest: ['A(B,C)', 'D'],
    },
    expectByVariant: {
      v1: {
        binary: ['A -L-> B', 'B -R-> C'],
        binaryRoots: ['A'],
        forestRoots: ['A'],
        forest: ['A(B,C)'],
      },
    },
  },
  {
    id: 'edge-single',
    label: '单节点森林 A：没有孩子也没有兄弟，转换是恒等映射',
    input: { forest: [{ root: 'A', children: [] }], tree: { root: 'A', children: [] } },
    expect: { binary: [], binaryRoots: ['A'], forestRoots: ['A'], forest: ['A'] },
  },
  {
    id: 'edge-roundtrip',
    label: '森林 A(B,C,E) + D：三兄弟链 + 根链，逆转换往返必须一致',
    input: { forest: FOREST_DEEP, tree: FOREST_DEEP[0] },
    expect: {
      binary: ['A -L-> B', 'A -R-> D', 'B -R-> C', 'C -R-> E'],
      binaryRoots: ['A'],
      forestRoots: ['A', 'D'],
      forest: ['A(B,C,E)', 'D'],
    },
    expectByVariant: {
      v1: {
        binary: ['A -L-> B', 'B -R-> C', 'C -R-> E'],
        binaryRoots: ['A'],
        forestRoots: ['A'],
        forest: ['A(B,C,E)'],
      },
    },
  },
];

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void TreeToBiTree(CSTree T) {' },
    { lineId: 'init', text: '  /* 规则一：p 的左孩子 = p 的第一个孩子（长子）*/' },
    { lineId: 'rule2', text: '  /* 规则二：p 的右孩子 = p 的下一个兄弟 */' },
    { lineId: 'loop', text: '  for each p in 先根次序(T) {' },
    { lineId: 'first', text: '    if (p->firstchild) p->lchild = p->firstchild;' },
    { lineId: 'sib', text: '    for (c = p->firstchild; c && c->nextsibling; c = c->nextsibling)' },
    { lineId: 'sib2', text: '      c->rchild = c->nextsibling;              /* 兄弟链进右孩子 */' },
    { lineId: 'lastSib', text: '    /* 最后一个孩子没有 nextsibling → 它的 rchild 保持 NULL */' },
    { lineId: 'loopend', text: '  }' },
    { lineId: 'rootnote', text: '  /* 根边界：树根没有兄弟，转换后它仍然是唯一的根 */' },
    { lineId: 'ret', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void ForestToBiTree(CSTree F[], int n) {' },
    { lineId: 'init', text: '  /* 第 1 步：每一棵树单独做一次 树→二叉树 */' },
    { lineId: 'loop', text: '  for (i = 0; i < n; ++i) {' },
    { lineId: 'first', text: '    for each p in 先根次序(F[i]) if (p->firstchild) p->lchild = p->firstchild;' },
    { lineId: 'sib', text: '    for (c = p->firstchild; c && c->nextsibling; c = c->nextsibling) c->rchild = c->nextsibling;' },
    { lineId: 'lastSib', text: '    /* 最后一个孩子：rchild 保持 NULL */' },
    { lineId: 'loopend', text: '  }' },
    { lineId: 'roots', text: '  /* 第 2 步：把各棵树的根串成一条兄弟链 */' },
    { lineId: 'rootsib', text: '  for (i = 1; i < n; ++i) F[i - 1]->rchild = F[i];' },
    { lineId: 'boundary', text: '  /* 根边界：只剩 F[0] 是二叉树的根，其余根都降级成"兄弟" */' },
    { lineId: 'ret', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void BiTreeToForest(BiTree B) {' },
    { lineId: 'init', text: '  /* 逆规则一：沿右链断根 —— 右链上的每个节点都是一棵树的根 */' },
    { lineId: 'cutloop', text: '  for (p = B; p; p = p->rchild) roots.push(p);' },
    { lineId: 'cut', text: '  p->rchild = NULL;                  /* 断掉兄弟链，各自成树 */' },
    { lineId: 'restore', text: '  /* 逆规则二：左孩子 → 孩子表，孩子的右链 → 兄弟 */' },
    { lineId: 'kidloop', text: '  for (c = p->lchild; c; c = c->rchild) children.push(c);' },
    { lineId: 'kidcut', text: '  c->rchild = NULL;                  /* 兄弟链拆掉，改记成"孩子" */' },
    { lineId: 'verify', text: '  /* 往返校验：还原出的森林必须与原森林逐棵一致 */' },
    { lineId: 'ret', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 小工具 */

/**
 * 输入 → 规整森林。
 *   mode='tree'   ：只取一棵树（优先 input.tree，其次 input.forest[0]）；
 *   mode='forest' ：取整个森林（优先 input.forest，其次 input.tree）。
 * 孩子项可以是 id 字符串，也可以是嵌套对象 {id|root, children}，便于画更深的树。
 */
function buildForest(input, mode = 'forest') {
  const spec = input || {};
  let trees;
  if (mode === 'tree') {
    if (spec.tree) trees = [spec.tree];
    else if (Array.isArray(spec.forest) && spec.forest.length) trees = [spec.forest[0]];
    else trees = [];
  } else if (Array.isArray(spec.forest) && spec.forest.length) trees = spec.forest;
  else if (spec.tree) trees = [spec.tree];
  else if (Array.isArray(spec.trees) && spec.trees.length) trees = spec.trees;
  else trees = [];

  const map = new Map();   // id → { id, label, children:[], parent }
  const order = [];        // 出现次序（输出保持稳定）
  const mk = (raw, parent) => {
    const o = raw != null && typeof raw === 'object' ? raw : { id: String(raw) };
    const base = String(o.id ?? o.root ?? o.label ?? '?');
    let id = base;
    let k = 2;
    while (map.has(id)) id = `${base}#${k++}`;
    const node = { id, label: String(o.label ?? base), children: [], parent: parent || null };
    map.set(id, node);
    order.push(id);
    if (Array.isArray(o.children)) for (const c of o.children) node.children.push(mk(c, id).id);
    return node;
  };
  const roots = trees.map((t) => mk(t, null).id);
  return { map, order, roots };
}

/** 两层视图工厂（每步都新建 layer 与数组，快照互相独立） */
function views(f) {
  const lab = (id) => (id == null ? 'NULL' : (f.map.has(id) ? f.map.get(id).label : String(id)));

  /** 原树/森林（children 表示）：根挂 badge "根" */
  const forestView = (o = {}) => {
    const kidsOf = o.kidsOf || ((id) => f.map.get(id).children);
    const roots = o.roots || [];
    const multi = roots.length > 1;
    return treeLayer({
      id: o.id || 'src',
      title: o.title || '原树 / 森林（父子表示）',
      name: o.name || (multi ? `森林：${roots.length} 个根 = ${roots.map(lab).join(', ')}` : '原树：父子边（children）'),
      roots: [...roots],
      nodes: f.order.map((id) => {
        const kids = kidsOf(id);
        const box = { id, label: lab(id) };
        if (kids.length) box.children = [...kids];
        if (roots.includes(id)) box.badge = '根';
        return box;
      }),
      roles: o.roles || {},
    });
  };

  /** 二叉树（left/right 表示）：edgeTags 标 L/R，新边用 extraEdges 重描 */
  const binView = (bin, root, o = {}) => {
    const edgeTags = {};
    const nodes = f.order.map((id) => {
      const b = bin.get(id) || {};
      const box = { id, label: lab(id) };
      if (b.left) { box.left = b.left; edgeTags[b.left] = 'L'; }
      if (b.right) { box.right = b.right; edgeTags[b.right] = 'R'; }
      if (root && id === root) box.badge = '根';
      return box;
    });
    return treeLayer({
      id: o.id || 'bin',
      title: o.title || '二叉树（左孩子 / 右兄弟）',
      name: o.name || '二叉树：左孩子 = 长子，右孩子 = 下一个兄弟（edgeTags 的 L/R 就是这两条规则）',
      roots: root ? [root] : [],
      nodes,
      edgeTags,
      extraEdges: o.extraEdges || [],
      roles: o.roles || {},
    });
  };

  return { lab, forestView, binView };
}

/** 二叉树边清单（结果用，形如 "A -L-> B"；按出现次序稳定输出） */
function binEdgeList(f, bin, lab) {
  const out = [];
  for (const id of f.order) {
    const b = bin.get(id) || {};
    if (b.left) out.push(`${lab(id)} -L-> ${lab(b.left)}`);
    if (b.right) out.push(`${lab(id)} -R-> ${lab(b.right)}`);
  }
  return out;
}

/** 树的括号文本：A(B,C)；叶子只写 A */
function fmtTree(lab, kidsOf, id) {
  const kids = kidsOf(id);
  return kids.length ? `${lab(id)}(${kids.map((c) => fmtTree(lab, kidsOf, c)).join(',')})` : lab(id);
}

/* ------------------------------------------------------------------ 变体 1：树 → 二叉树 */

function runV1(input) {
  const f = buildForest(input, 'tree');
  const L = LINES.v1;
  const steps = [];
  const { lab, forestView, binView } = views(f);

  const bin = new Map(f.order.map((id) => [id, { left: null, right: null }]));
  const binRoot = f.roots[0] || null;
  const kidsOf = (id) => f.map.get(id).children;

  // 先根次序
  const scan = [];
  const dfs = (id) => { scan.push(id); for (const c of kidsOf(id)) dfs(c); };
  f.roots.forEach(dfs);

  const newEdges = [];
  const result = {
    binary: [],
    binaryRoots: binRoot ? [lab(binRoot)] : [],
    forestRoots: f.roots.map(lab),
    forest: f.roots.map((id) => fmtTree(lab, kidsOf, id)),
  };

  const snap = (o = {}) => [
    forestView({ roles: o.srcRoles || {} }),
    binView(bin, binRoot, { extraEdges: [...newEdges], roles: o.binRoles || {} }),
  ];

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: f.roots.length
      ? `环境：一棵树 T = ${result.forest[0]}。转换只用两条规则 —— 左孩子放长子、右孩子放下一个兄弟，于是"多叉"被压成了"二叉"。`
      : '输入既没有 tree 也没有 forest：没有节点可转换。',
    vars: { 树的个数: f.roots.length, 节点数: f.order.length, 已建边数: 0 },
    layers: snap({ srcRoles: { focus1: f.roots }, binRoles: binRoot ? { focus1: [binRoot] } : {} }),
  }));

  let edgeCount = 0;
  let visited = 0;
  for (const id of scan) {
    visited++;
    const kids = kidsOf(id);
    if (kids.length) {
      const first = kids[0];
      bin.get(id).left = first;
      newEdges.push({ from: id, to: first, color: '#6b3fa0' });
      edgeCount++;
      steps.push(step({
        event: 'link-first-child',
        lineId: 'first',
        note: `${lab(id)} 有 ${kids.length} 个孩子，第一个是 ${lab(first)} → ${lab(id)} 的**左孩子** = ${lab(first)}（紫色箭头）。这一步就把"长子"落到了二叉树的左链上。`,
        vars: { 当前: lab(id), 长子: lab(first), 已建边数: edgeCount },
        layers: snap({
          srcRoles: { focus1: [id], focus2: [first] },
          binRoles: { focus1: [id], focus2: [first] },
        }),
      }));

      for (let i = 1; i < kids.length; i++) {
        bin.get(kids[i - 1]).right = kids[i];
        newEdges.push({ from: kids[i - 1], to: kids[i], color: '#1f7a5c' });
        edgeCount++;
        steps.push(step({
          event: 'link-next-sibling',
          lineId: 'sib2',
          note: `${lab(kids[i - 1])} 的下一个兄弟是 ${lab(kids[i])} → 让 ${lab(kids[i - 1])} 的**右孩子**指向 ${lab(kids[i])}。兄弟关系没有专门的指针，只能寄生在右链上（绿色箭头）。`,
          vars: { 当前: lab(id), 兄弟对: `${lab(kids[i - 1])}→${lab(kids[i])}`, 已建边数: edgeCount },
          layers: snap({
            srcRoles: { focus1: [kids[i - 1]], focus2: [kids[i]] },
            binRoles: { focus1: [kids[i - 1]], focus2: [kids[i]] },
          }),
        }));
      }

      const last = kids[kids.length - 1];
      steps.push(step({
        event: 'link-next-sibling',
        lineId: 'lastSib',
        note: `${lab(last)} 是 ${lab(id)} 的最后一个孩子，没有下一个兄弟 → 它的右孩子保持空，兄弟链到此为止（这就是"右链为空"的判定点）。`,
        vars: { 当前: lab(id), 兄弟链尾: lab(last), 已建边数: edgeCount },
        layers: snap({
          srcRoles: { focus1: [last] },
          binRoles: { focus1: [last] },
        }),
      }));
    } else {
      steps.push(step({
        event: 'link-first-child',
        lineId: 'first',
        note: `${lab(id)} 是叶子（先根次序第 ${visited} 个）：firstchild 为空 → 左孩子为空，也没什么可挂的。`,
        vars: { 当前: lab(id), 长子: 'NULL', 已建边数: edgeCount },
        layers: snap({ srcRoles: { focus1: [id] }, binRoles: { focus1: [id] } }),
      }));
    }
  }

  if (!f.order.length) {
    steps.push(step({
      event: 'link-first-child',
      lineId: 'loop',
      note: '没有任何节点 → 先根次序为空，循环体一次都没进，二叉树也是空的。',
      vars: { 节点数: 0, 已建边数: 0 },
      layers: snap(),
    }));
  }

  result.binary = binEdgeList(f, bin, lab);

  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: f.roots.length
      ? `树 → 二叉树完成：${result.binary.join('，') || '没有任何边'}。根边界要注意 —— 树根没有兄弟，${lab(binRoot)} 的右孩子始终为 NULL，所以它转换后仍然是唯一的根；一共建了 ${edgeCount} 条 L/R 边，节点数不变。`
      : '输入为空：转换前后都是空树。',
    vars: { 节点数: f.order.length, 已建边数: edgeCount, 二叉树根: binRoot ? lab(binRoot) : 'NULL' },
    layers: snap({ binRoles: { done: [...f.order] } }),
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v1',
    sourceVersion: 'tfc-tree-to-binary-v1',
    lines: L,
    steps,
    result,
    meta: { edges: edgeCount },
  });
}

/* ------------------------------------------------------------------ 变体 2：森林 → 二叉树 */

function runV2(input) {
  const f = buildForest(input, 'forest');
  const L = LINES.v2;
  const steps = [];
  const { lab, forestView, binView } = views(f);

  const bin = new Map(f.order.map((id) => [id, { left: null, right: null }]));
  const binRoot = f.roots[0] || null;
  const kidsOf = (id) => f.map.get(id).children;
  const scan = [];
  const dfs = (id) => { scan.push(id); for (const c of kidsOf(id)) dfs(c); };
  f.roots.forEach(dfs);

  const newEdges = [];
  const result = {
    binary: [],
    binaryRoots: binRoot ? [lab(binRoot)] : [],
    forestRoots: f.roots.map(lab),
    forest: f.roots.map((id) => fmtTree(lab, kidsOf, id)),
  };

  const snap = (o = {}) => [
    forestView({ roots: f.roots, roles: o.srcRoles || {} }),
    binView(bin, binRoot, { extraEdges: [...newEdges], roles: o.binRoles || {} }),
  ];

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: f.roots.length
      ? `森林 ${result.forest.join(' 、 ')}：共 ${f.roots.length} 棵树。第一轮先把每棵树各自变成二叉树（规则同 v1），第二轮再处理"根与根之间"这条原本不存在的兄弟关系。`
      : '输入森林为空：没有节点、没有根，也就没有根链要串。',
    vars: { 树的个数: f.roots.length, 节点数: f.order.length, 已建边数: 0, 根链: '（未串）' },
    layers: snap({ srcRoles: { focus1: f.roots }, binRoles: binRoot ? { focus1: [binRoot] } : {} }),
  }));

  let edgeCount = 0;
  for (const id of scan) {
    const kids = kidsOf(id);
    if (!kids.length) continue;
    const first = kids[0];
    bin.get(id).left = first;
    newEdges.push({ from: id, to: first, color: '#6b3fa0' });
    edgeCount++;
    steps.push(step({
      event: 'link-first-child',
      lineId: 'first',
      note: `${lab(id)} 的第一个孩子 ${lab(first)} → 左孩子（紫色箭头）。注意这一步和"这棵树是第几棵"无关，规则对森林里每棵树都同样适用。`,
      vars: { 当前: lab(id), 长子: lab(first), 已建边数: edgeCount },
      layers: snap({ srcRoles: { focus1: [id], focus2: [first] }, binRoles: { focus1: [id], focus2: [first] } }),
    }));

    for (let i = 1; i < kids.length; i++) {
      bin.get(kids[i - 1]).right = kids[i];
      newEdges.push({ from: kids[i - 1], to: kids[i], color: '#1f7a5c' });
      edgeCount++;
      steps.push(step({
        event: 'link-next-sibling',
        lineId: 'sib',
        note: `${lab(kids[i - 1])} 与 ${lab(kids[i])} 是兄弟 → 前者的右孩子指向后者（绿色箭头）：兄弟链寄生在右链上。`,
        vars: { 当前: lab(id), 兄弟对: `${lab(kids[i - 1])}→${lab(kids[i])}`, 已建边数: edgeCount },
        layers: snap({
          srcRoles: { focus1: [kids[i - 1]], focus2: [kids[i]] },
          binRoles: { focus1: [kids[i - 1]], focus2: [kids[i]] },
        }),
      }));
    }

    const last = kids[kids.length - 1];
    steps.push(step({
      event: 'link-next-sibling',
      lineId: 'lastSib',
      note: `${lab(last)} 是这个孩子表的最后一个 → 右孩子为空，兄弟链收尾。`,
      vars: { 当前: lab(id), 兄弟链尾: lab(last), 已建边数: edgeCount },
      layers: snap({ srcRoles: { focus1: [last] }, binRoles: { focus1: [last] } }),
    }));
  }

  // 第 2 步：根链
  for (let i = 1; i < f.roots.length; i++) {
    const prev = f.roots[i - 1];
    const cur = f.roots[i];
    bin.get(prev).right = cur;
    newEdges.push({ from: prev, to: cur, color: '#b0197f' });
    edgeCount++;
    steps.push(step({
      event: 'link-root-sibling',
      lineId: 'rootsib',
      note: `根链：第 ${i} 棵树的根 ${lab(cur)} 接到第 ${i} 棵之前的根 ${lab(prev)} 的**右孩子**上（品红箭头）。从这一刻起 ${lab(cur)} 不再是根，只是一个"兄弟" —— 这就是森林与二叉树的根边界。`,
      vars: { 已建边数: edgeCount, 根链: f.roots.slice(0, i + 1).map(lab).join(' → '), 二叉树根: binRoot ? lab(binRoot) : 'NULL' },
      layers: snap({
        srcRoles: { focus1: [prev], focus2: [cur] },
        binRoles: { focus1: [prev], focus2: [cur] },
      }),
    }));
  }

  if (!f.order.length) {
    steps.push(step({
      event: 'link-root-sibling',
      lineId: 'loop',
      note: '空森林：既没有孩子边可建，也没有根可串，两个循环都不进。',
      vars: { 树的个数: 0, 已建边数: 0 },
      layers: snap(),
    }));
  } else if (f.roots.length === 1) {
    steps.push(step({
      event: 'link-root-sibling',
      lineId: 'rootsib',
      note: `森林里只有 1 棵树（${lab(f.roots[0])}）→ 根链循环 i 从 1 开始、条件不成立，什么也不串。此时"森林→二叉树"退化成"树→二叉树"。`,
      vars: { 已建边数: edgeCount, 根链: '（只有 1 个根）' },
      layers: snap({ srcRoles: { focus1: [f.roots[0]] }, binRoles: { focus1: [f.roots[0]] } }),
    }));
  }

  result.binary = binEdgeList(f, bin, lab);

  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: f.roots.length
      ? `森林 → 二叉树完成：森林有 ${f.roots.length} 个根（${result.forestRoots.join(', ')}），二叉树只有 1 个根 ${lab(binRoot)}；边的清单是 ${result.binary.join('，') || '（没有边）'}。看两层的 badge：左上层的"根"有 ${f.roots.length} 个，右上层的"根"只有 1 个。`
      : '输入为空森林：转换前后都是空的。',
    vars: { 节点数: f.order.length, 已建边数: edgeCount, 二叉树根: binRoot ? lab(binRoot) : 'NULL' },
    layers: snap({ binRoles: { done: [...f.order] } }),
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v2',
    sourceVersion: 'tfc-forest-to-binary-v1',
    lines: L,
    steps,
    result,
    meta: { edges: edgeCount, trees: f.roots.length },
  });
}

/* ------------------------------------------------------------------ 变体 3：二叉树 → 森林（逆转换） */

function runV3(input) {
  const f = buildForest(input, 'forest');
  const L = LINES.v3;
  const steps = [];
  const { lab, forestView, binView } = views(f);

  // 逆转换的起点：由森林正向转换得到的二叉树（画在左边那层）
  const bin = new Map(f.order.map((id) => [id, { left: null, right: null }]));
  for (const id of f.order) {
    const kids = f.map.get(id).children;
    if (!kids.length) continue;
    bin.get(id).left = kids[0];
    for (let i = 1; i < kids.length; i++) bin.get(kids[i - 1]).right = kids[i];
  }
  for (let i = 1; i < f.roots.length; i++) bin.get(f.roots[i - 1]).right = f.roots[i];
  const binRoot = f.roots[0] || null;

  // 起点边清单必须最先记录（下面会边拆边还原，bin 会被改）
  const startEdges = binEdgeList(f, bin, lab);

  const restored = new Map(f.order.map((id) => [id, []]));
  const rootsBack = [];
  const srcKids = (id) => f.map.get(id).children;
  const backKids = (id) => restored.get(id) || [];

  const result = {
    binary: startEdges,
    binaryRoots: binRoot ? [lab(binRoot)] : [],
    forestRoots: f.roots.map(lab),
    forest: f.roots.map((id) => fmtTree(lab, srcKids, id)),
  };

  const snap = (o = {}) => [
    binView(bin, binRoot, { id: 'bin', title: '待还原的二叉树', roles: o.binRoles || {} }),
    forestView({ id: 'src', title: '还原出来的森林', kidsOf: backKids, roots: rootsBack, roles: o.srcRoles || {} }),
  ];

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: binRoot
      ? `逆转换的输入是左边这棵二叉树（${startEdges.join('，')}，唯一的根是 ${lab(binRoot)}）。逆转换分两步：① 沿右链断根，得到森林的根集合；② 把每个节点的左链还原成孩子表。`
      : '空二叉树：没有右链可断，也没有左链可还原。',
    vars: { 节点数: f.order.length, 已断根: 0, 已还原孩子: 0, 二叉树根: binRoot ? lab(binRoot) : 'NULL' },
    layers: snap({ binRoles: binRoot ? { focus1: [binRoot] } : {} }),
  }));

  // ① 沿右链断根
  let p = binRoot;
  while (p) {
    const nxt = bin.get(p).right;
    steps.push(step({
      event: 'reverse',
      lineId: 'cutloop',
      note: `沿右链走到 ${lab(p)}：它在二叉树里是当前这层的根，所以它就是一整棵树的根 → roots 加入 ${lab(p)}。${nxt ? `它的右孩子 ${lab(nxt)} 是右链上的下一个根候选。` : '它的右孩子是空的 → 右链到此为止。'}`,
      vars: { 已断根: rootsBack.length + 1, 当前根: lab(p), 下一个: nxt ? lab(nxt) : 'NULL' },
      layers: snap({
        binRoles: { focus1: [p], ...(nxt ? { focus2: [nxt] } : {}) },
        srcRoles: { focus1: [...rootsBack, p] },
      }),
    }));
    bin.get(p).right = null;   // 断掉根链：它不再是谁的兄弟
    rootsBack.push(p);
    steps.push(step({
      event: 'reverse',
      lineId: 'cut',
      note: `${lab(p)} 的右链被断开：右孩子清空，${lab(p)} 从此是一棵独立的树，只保留自己的左孩子（= 它的长子）。左边也看得见这条 R 边消失了。`,
      vars: { 已断根: rootsBack.length, 当前根: lab(p), 根集合: rootsBack.map(lab).join(', ') },
      layers: snap({ binRoles: { focus1: [p] }, srcRoles: { focus1: [...rootsBack] } }),
    }));
    p = nxt;
  }

  if (binRoot) {
    steps.push(step({
      event: 'reverse',
      lineId: 'cutloop',
      note: `右链走完（p == NULL）→ 森林共 ${rootsBack.length} 个根：${rootsBack.map(lab).join(', ')}。注意二叉树的根只有 1 个，断完之后森林却能有多个根 —— 根边界的方向反过来了。`,
      vars: { 已断根: rootsBack.length, 根集合: rootsBack.map(lab).join(', ') },
      layers: snap({ srcRoles: { focus1: [...rootsBack] } }),
    }));
  } else {
    steps.push(step({
      event: 'reverse',
      lineId: 'cutloop',
      note: 'p 一开始就是 NULL：右链为空，一个根也断不出来。',
      vars: { 已断根: 0 },
      layers: snap(),
    }));
  }

  // ② 左链还原孩子
  let restoredCount = 0;
  const queue = [...rootsBack];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);

    // 先取左链（左孩子 + 它的右链），再拆
    const kids = [];
    let c = bin.get(id).left;
    while (c) {
      kids.push(c);
      const nx = bin.get(c).right;
      bin.get(c).right = null;    // 兄弟链拆掉
      c = nx;
    }
    bin.get(id).left = null;      // 左链拆掉
    restored.set(id, kids);
    restoredCount += kids.length;
    kids.forEach((k) => queue.push(k));

    steps.push(step({
      event: 'reverse',
      lineId: kids.length ? 'kidloop' : 'restore',
      note: kids.length
        ? `${lab(id)} 的左链：左孩子 ${lab(kids[0])}${kids.length > 1 ? `，再沿右链到 ${kids.slice(1).map(lab).join('、')}` : ''} → 它们全都是 ${lab(id)} 的**孩子**（左孩子是长子，右链是兄弟，还原时把"兄弟"读回"孩子"）。`
        : `${lab(id)} 的左孩子是空的 → 它在原树里是叶子，没有孩子可还原。`,
      vars: { 当前: lab(id), 还原出的孩子: kids.length ? kids.map(lab).join(', ') : '（无）', 已还原孩子: restoredCount },
      layers: snap({
        binRoles: { focus1: [id], ...(kids.length ? { focus2: kids } : {}) },
        srcRoles: { focus1: [id], added: kids, done: [...seen] },
      }),
    }));

    if (kids.length) {
      steps.push(step({
        event: 'reverse',
        lineId: 'kidcut',
        note: `${lab(id)} 的孩子们各自的右链被拆掉（${kids.map(lab).join('、')}）：在森林的表示里"兄弟"是同一个父亲下的兄弟关系，不再需要右指针。`,
        vars: { 当前: lab(id), 已还原孩子: restoredCount },
        layers: snap({ binRoles: { focus1: kids }, srcRoles: { focus1: [id], added: [...kids], done: [...seen] } }),
      }));
    }
  }

  const backForest = rootsBack.map((id) => fmtTree(lab, backKids, id));
  const roundTrip = backForest.length === result.forest.length && backForest.every((s, i) => s === result.forest[i]);

  steps.push(step({
    event: 'done',
    lineId: 'verify',
    done: true,
    result,
    note: binRoot
      ? `逆转换完成，还原出的森林是 ${backForest.join(' 、 ')}；与输入的 ${result.forest.join(' 、 ')} ${roundTrip ? '逐棵一致 → 往返校验通过（树↔二叉树的转换是可逆的双射）' : '不一致 → 说明输入不是合法转换结果'}。`
      : '空二叉树还原成空森林，往返同样一致。',
    vars: { 森林根数: rootsBack.length, 往返一致: roundTrip ? '是' : '否', 还原出的森林: backForest.join(' 、 ') || '（空）' },
    layers: [
      binView(bin, binRoot, { id: 'bin', title: '待还原的二叉树（已拆完）', roles: { done: [...f.order] } }),
      forestView({ id: 'src', title: '还原出来的森林', kidsOf: backKids, roots: rootsBack, roles: { done: [...f.order] } }),
    ],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v3',
    sourceVersion: 'tfc-binary-to-forest-v1',
    lines: L,
    steps,
    result,
    meta: { roots: rootsBack.length, roundTrip },
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
