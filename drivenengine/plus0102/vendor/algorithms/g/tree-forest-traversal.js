/**
 * G · 树与森林遍历（3 个变体：先根 / 后根 / 层次）
 *
 * 输入约定：
 *   { forest: [ { root:'A', children:['B','C'] }, { root:'D', children:[] } ] }
 *   节点用"名字"当 id（全森林唯一）；需要更深的结构时，可用可选的
 *   nodes:[{ id:'B', children:['E'] }] 继续声明某个节点的孩子（等价于补充父子边）。
 *
 * 三个变体的画面差别，正好是"深度优先 vs 广度优先"和"根的访问时点"：
 *   v1 先根 —— 进入即访问根，再逐个孩子递归下降；回退 = 调用帧出栈；
 *   v2 后根 —— 所有孩子整棵走完才访问根，输出序列与 v1 完全错位（可对照）；
 *   v3 层次 —— 所有树的根先全部入队，然后一层一层往外扩，靠队列推进而不是递归。
 *
 * 契约（docs/04-轨迹契约.md）：每步都是完整快照（layers 重新构造），
 * step.lineId 命中本变体自己的 sourceLines，最后一步 done=true 且 result 与样例 expect 深比较一致。
 */

import { trace, step, treeLayer, stackLayer, arrayLayer } from '../../engine/model.js';

export const meta = {
  id: 'g/tree-forest-traversal',
  variants: [
    { id: 'v1', name: '先根遍历', note: '访问根再依次遍历各孩子，跨树按输入顺序推进' },
    { id: 'v2', name: '后根遍历', note: '先遍历全部孩子再访问根，输出序列与先根版对照' },
    { id: 'v3', name: '按层次遍历森林', note: '层序推进：先把所有根入队，再逐层扩展孩子，展示广度方向' },
  ],
};

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void PreOrderForest(Forest F) {' },
    { lineId: 'for-t', text: '  for (int t = 0; t < F.n; ++t) {        /* 跨树：森林按输入顺序推进 */' },
    { lineId: 'next', text: '    /* 第 t+1 棵树的根：先根遍历从它开始，树号 t 记录下来 */' },
    { lineId: 'call', text: '    PreOrder(F.tree[t]->root);' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'fn2', text: '}' },
    { lineId: 'pfn', text: 'void PreOrder(Node *p) {' },
    { lineId: 'guard', text: '  if (p == NULL) return;              /* 空孩子：这一侧直接回退，不压栈 */' },
    { lineId: 'enter', text: '  /* 进入 p：帧 p 压栈，记下"根还没访问、孩子都还没走" */' },
    { lineId: 'visit', text: '  visit(p);                          /* ① 进入即访问根 —— 先根的"根先" */' },
    { lineId: 'for-c', text: '  for (int j = 0; j < p->n; ++j) {    /* ② 依次下降各孩子 */' },
    { lineId: 'descend', text: '    PreOrder(p->child[j]);' },
    { lineId: 'back', text: '    /* 第 j 个孩子整棵返回：帧 p 重新拿到控制权 */' },
    { lineId: 'for-c-end', text: '  }' },
    { lineId: 'ret', text: '  /* 帧 p 出栈，控制权交回父节点（或其所在树的 for 循环） */' },
    { lineId: 'pfn2', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void PostOrderForest(Forest F) {' },
    { lineId: 'for-t', text: '  for (int t = 0; t < F.n; ++t) {        /* 树间顺序与先根版相同 */' },
    { lineId: 'next', text: '    /* 第 t+1 棵树：后根先钻到叶子，根最后才出现 */' },
    { lineId: 'call', text: '    PostOrder(F.tree[t]->root);' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'fn2', text: '}' },
    { lineId: 'pfn', text: 'void PostOrder(Node *p) {' },
    { lineId: 'guard', text: '  if (p == NULL) return;' },
    { lineId: 'enter', text: '  /* 进入 p：帧压栈，此刻 p 还不能访问 —— 它的孩子一个都没走 */' },
    { lineId: 'for-c', text: '  for (int j = 0; j < p->n; ++j) {' },
    { lineId: 'descend', text: '    PostOrder(p->child[j]);            /* 先把每个孩子整棵走完 */' },
    { lineId: 'back', text: '    /* 第 j 个孩子返回：接着走下一个孩子 */' },
    { lineId: 'for-c-end', text: '  }' },
    { lineId: 'visit', text: '  visit(p);                          /* ③ 全部孩子都走完，才访问根 */' },
    { lineId: 'ret', text: '  /* 帧 p 出栈 */' },
    { lineId: 'pfn2', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void LevelOrderForest(Forest F) {' },
    { lineId: 'init', text: '  InitQueue(&Q);                     /* 层序靠队列推进，不用递归 */' },
    { lineId: 'for-t', text: '  for (int t = 0; t < F.n; ++t) {' },
    { lineId: 'next', text: '    EnQueue(&Q, F.tree[t]->root);    /* 所有树的根先全部入队 = 第 0 层 */' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'loop', text: '  while (!QueueEmpty(&Q)) {' },
    { lineId: 'dequeue', text: '    p = DeQueue(&Q);                 /* 出队：轮到 p（同一层按入队先后） */' },
    { lineId: 'visit', text: '    visit(p);                        /* 出队即访问 */' },
    { lineId: 'for-c', text: '    for (int j = 0; j < p->n; ++j) {' },
    { lineId: 'descend', text: '      EnQueue(&Q, p->child[j]);      /* 孩子排在所有同层节点之后 → 天然分层 */' },
    { lineId: 'for-c-end', text: '    }' },
    { lineId: 'back', text: '    /* p 的孩子全部入队完毕，回到队头看下一个是谁 */' },
    { lineId: 'loop-end', text: '  }' },
    { lineId: 'ret', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

const SAMPLE_FOREST = [
  { root: 'A', children: ['B', 'C'] },
  { root: 'D', children: [] },
];

export const samples = [
  {
    id: 'normal',
    label: '森林 [A(B,C), D]：先根 A,B,C,D / 后根 B,C,A,D / 层次 A,D,B,C',
    input: { forest: SAMPLE_FOREST.map((t) => ({ root: t.root, children: [...t.children] })) },
    expect: { order: ['A', 'B', 'C', 'D'] },
    expectByVariant: {
      v1: { order: ['A', 'B', 'C', 'D'] },
      v2: { order: ['B', 'C', 'A', 'D'] },
      v3: { order: ['A', 'D', 'B', 'C'] },
    },
  },
  {
    id: 'edge-empty',
    label: '空森林 {forest:[]}（三种遍历都输出空序列）',
    input: { forest: [] },
    expect: { order: [] },
  },
  {
    id: 'edge-single-tree',
    label: '单树多孩子 A(B(E),C,D)：先根 A,B,E,C,D / 后根 E,B,C,D,A / 层次 A,B,C,D,E',
    input: { forest: [{ root: 'A', children: ['B', 'C', 'D'] }], nodes: [{ id: 'B', children: ['E'] }] },
    expect: { order: ['A', 'B', 'E', 'C', 'D'] },
    expectByVariant: {
      v1: { order: ['A', 'B', 'E', 'C', 'D'] },
      v2: { order: ['E', 'B', 'C', 'D', 'A'] },
      v3: { order: ['A', 'B', 'C', 'D', 'E'] },
    },
  },
];

/* ------------------------------------------------------------------ 输入归一化 */

/**
 * 森林输入 → 受控内部结构。
 * · 节点用名字当 id；一个节点只能有一个双亲（重复挂接的第二条边被丢弃）；
 * · 自环、指向树根的边一律剪掉，避免画成环。
 */
function buildForest(input) {
  const spec = Array.isArray(input && input.forest) ? input.forest : [];
  const kids = new Map();
  const decl = [];
  const parentOf = new Map();
  const ensure = (name) => {
    const id = String(name);
    if (!kids.has(id)) {
      kids.set(id, []);
      decl.push(id);
    }
    return id;
  };

  const roots = [];
  for (const t of spec) {
    if (!t || t.root == null || t.root === '') continue;
    const r = ensure(t.root);
    if (!roots.includes(r)) roots.push(r);
  }

  const link = (p, c) => {
    if (!p || !c || p === c) return;
    if (roots.includes(c)) return;          // 树根只能当根，不能同时当别人的孩子
    if (parentOf.has(c)) return;            // 一个节点只能有一个双亲
    parentOf.set(c, p);
    kids.get(p).push(c);
  };

  for (const t of spec) {
    if (!t || t.root == null || t.root === '') continue;
    const r = String(t.root);
    for (const c of Array.isArray(t.children) ? t.children : []) {
      if (c == null || c === '') continue;
      const cc = ensure(c);
      link(r, cc);
    }
  }

  const extra = Array.isArray(input && input.nodes) ? input.nodes : [];
  for (const n of extra) {
    if (!n || n.id == null || n.id === '') continue;
    const id = ensure(n.id);
    for (const c of Array.isArray(n.children) ? n.children : []) {
      if (c == null || c === '') continue;
      const cc = ensure(c);
      link(id, cc);
    }
  }

  // 树号（0 基）+ 深度：从每棵树的根做一次 DFS
  const treeOf = new Map();
  const depthOf = new Map();
  const ids = [];
  roots.forEach((r, t) => {
    const walk = (id, d) => {
      if (treeOf.has(id)) return;
      treeOf.set(id, t);
      depthOf.set(id, d);
      ids.push(id);
      for (const c of kids.get(id) || []) walk(c, d + 1);
    };
    walk(r, 0);
  });

  // 没有被任何树根覆盖到的漏网节点（异常输入）也画出来，但标注为"孤立"
  for (const id of decl) {
    if (treeOf.has(id)) continue;
    treeOf.set(id, -1);
    depthOf.set(id, 0);
    ids.push(id);
  }

  const map = new Map();
  for (const id of ids) {
    map.set(id, { id, label: id, children: [...(kids.get(id) || [])], tree: treeOf.get(id), depth: depthOf.get(id) });
  }

  return { map, ids, roots, trees: roots.map((r) => ids.filter((id) => treeOf.get(id) === roots.indexOf(r))) };
}

/* ------------------------------------------------------------------ 变体 1：先根遍历 */

function runV1(input) {
  const F = buildForest(input);
  const L = LINES.v1;
  const steps = [];
  const order = [];       // 输出序列（节点 id）
  const frames = [];      // 调用栈：栈底 → 栈顶
  const N = F.ids.length;
  const T = F.roots.length;

  const treeOf = (o = {}) => treeLayer({
    id: 'main',
    title: 'Forest',
    name: '森林 · 先根遍历（根 → 各孩子，逐棵树推进）',
    roots: [...F.roots],
    nodes: F.ids.map((id) => {
      const n = F.map.get(id);
      const box = { id, label: n.label, children: [...n.children] };
      const k = order.indexOf(id);
      if (k >= 0) box.value = `第${k + 1}个`;
      if (F.roots.includes(id)) box.badge = id === F.roots[0] && T === 1 ? '树1' : `树${n.tree + 1}`;
      return box;
    }),
    roles: o.roles || {},
  });

  const stackOf = (focusId) => stackLayer({
    id: 'call',
    title: '调用栈',
    name: 'CallStack（栈底 → 栈顶）',
    cells: frames.map((id, i) => ({ value: id, label: `帧${i + 1}` })),
    top: frames.length ? frames.length - 1 : null,
    capacity: Math.max(4, N),
    roles: {
      focus1: focusId != null && frames.includes(focusId) ? [frames.indexOf(focusId)] : [],
      pointers: frames.length ? [{ id: 'top', label: 'top', index: frames.length - 1 }] : [],
    },
  });

  const outOf = () => arrayLayer({
    id: 'out',
    title: '输出序列',
    name: 'visit 输出（先根：根先于孩子）',
    values: order.map((id) => F.map.get(id).label),
    labels: order.map((id, i) => `第${i + 1}个`),
    roles: { done: order.map((_, i) => i) },
  });

  const vars = (tree, cur) => ({
    树数: T,
    节点数: N,
    当前树: tree == null || tree < 0 ? '—' : `${tree + 1}/${T}`,
    当前: cur ? F.map.get(cur).label : '—',
    栈深: frames.length,
    输出: order.length ? order.map((id) => F.map.get(id).label).join(' → ') : '（空）',
  });

  const seen = (extra = {}) => ({ done: [...order], ...extra });

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: T === 0
      ? '空森林：没有树可以进入，PreOrderForest 的 for 一次都不进。'
      : `森林共 ${T} 棵树、${N} 个节点。先根遍历 = 每棵树内部"根 → 各孩子"，树与树之间按输入顺序依次走完。`,
    vars: vars(null, null),
    layers: [treeOf(), stackOf(null), outOf()],
  }));

  if (T === 0) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'for-t',
      note: 'F.n == 0：跨树的 for 循环不进循环体，输出序列保持为空。',
      vars: vars(null, null),
      layers: [treeOf(), stackOf(null), outOf()],
    }));
  }

  const rec = (id, parent, tree) => {
    frames.push(id);
    const n = F.map.get(id);
    steps.push(step({
      event: 'enter',
      lineId: 'enter',
      note: `进入 ${n.label}（第 ${tree + 1} 棵树，第 ${n.depth} 层）：帧 ${n.label} 压栈，此时它的孩子都还没走。`,
      vars: vars(tree, id),
      layers: [
        treeOf({ roles: seen({ focus1: [id], pointers: [{ id: 'cur', label: 'cur', node: id }] }) }),
        stackOf(id),
        outOf(),
      ],
    }));

    order.push(id);
    steps.push(step({
      event: 'visit',
      lineId: 'visit',
      note: `${n.label} 一进入就被访问（第 ${order.length} 个）：先根的"根先"，所以它一定出现在自己所有孩子之前。`,
      vars: vars(tree, id),
      layers: [
        treeOf({ roles: seen({ focus1: [id], pointers: [{ id: 'cur', label: 'cur', node: id }] }) }),
        stackOf(id),
        outOf(),
      ],
    }));

    for (let j = 0; j < n.children.length; j++) {
      const c = n.children[j];
      steps.push(step({
        event: 'descend',
        lineId: 'descend',
        note: `下降进入 ${n.label} 的第 ${j + 1}/${n.children.length} 个孩子 ${c}：父帧 ${n.label} 留在栈里等它返回。`,
        vars: vars(tree, c),
        layers: [
          treeOf({
            roles: seen({
              focus1: [c],
              focus2: [id],
              pointers: [{ id: 'child', label: `child[${j}]`, node: c }, { id: 'fa', label: 'fa', node: id }],
            }),
          }),
          stackOf(id),
          outOf(),
        ],
      }));
      rec(c, id, tree);
      steps.push(step({
        event: 'backtrack',
        lineId: 'back',
        note: `${c} 这一整棵子树返回了，控制权回到 ${n.label}；还剩 ${n.children.length - j - 1} 个孩子没走。`,
        vars: vars(tree, id),
        layers: [
          treeOf({
            roles: seen({
              focus1: [id],
              focus2: [c],
              pointers: [{ id: 'cur', label: 'cur', node: id }],
            }),
          }),
          stackOf(id),
          outOf(),
        ],
      }));
    }

    frames.pop();
    steps.push(step({
      event: 'backtrack',
      lineId: 'ret',
      note: parent
        ? `帧 ${n.label} 出栈，回到父节点 ${F.map.get(parent).label}。`
        : `第 ${tree + 1} 棵树的根 ${n.label} 出栈：这棵树走完了，跨树的 for 循环接着取下一棵。`,
      vars: vars(tree, parent || null),
      layers: [
        treeOf({
          roles: seen(
            parent
              ? { focus1: [parent], pointers: [{ id: 'cur', label: 'cur', node: parent }] }
              : {},
          ),
        }),
        stackOf(parent || null),
        outOf(),
      ],
    }));
  };

  F.roots.forEach((r, t) => {
    steps.push(step({
      event: 'next-tree',
      lineId: 'next',
      note: `当前树号切换到第 ${t + 1}/${T} 棵：根是 ${r}。先根遍历会把这一整棵树走完，才轮到下一棵。`,
      vars: vars(t, r),
      layers: [
        treeOf({ roles: seen({ focus1: [r], pointers: [{ id: 't', label: `t=${t}`, node: r }] }) }),
        stackOf(null),
        outOf(),
      ],
    }));
    steps.push(step({
      event: 'enter',
      lineId: 'call',
      note: `PreOrder(${r})：从第 ${t + 1} 棵树的根发起递归。`,
      vars: vars(t, r),
      layers: [
        treeOf({ roles: seen({ focus1: [r], pointers: [{ id: 'cur', label: 'cur', node: r }] }) }),
        stackOf(null),
        outOf(),
      ],
    }));
    rec(r, null, t);
  });

  const result = { order: order.map((id) => F.map.get(id).label) };
  steps.push(step({
    event: 'done',
    lineId: 'pfn2',
    done: true,
    result,
    note: T === 0
      ? '空森林的先根遍历是空序列。'
      : `先根遍历完成：${result.order.join(', ')}。每棵树内部是"根 → 各孩子"，树与树之间按输入顺序串联。`,
    vars: vars(null, null),
    layers: [treeOf({ roles: { done: [...order] } }), stackOf(null), outOf()],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v1',
    sourceVersion: 'forest-preorder-v1',
    lines: L,
    steps,
    result,
    meta: { order: [...result.order], trees: T, nodes: N },
  });
}

/* ------------------------------------------------------------------ 变体 2：后根遍历 */

function runV2(input) {
  const F = buildForest(input);
  const L = LINES.v2;
  const steps = [];
  const order = [];
  const frames = [];
  const N = F.ids.length;
  const T = F.roots.length;

  const treeOf = (o = {}) => treeLayer({
    id: 'main',
    title: 'Forest',
    name: '森林 · 后根遍历（先走完各孩子，最后才轮到根）',
    roots: [...F.roots],
    nodes: F.ids.map((id) => {
      const n = F.map.get(id);
      const box = { id, label: n.label, children: [...n.children] };
      const k = order.indexOf(id);
      if (k >= 0) box.value = `第${k + 1}个`;
      if (F.roots.includes(id)) box.badge = `树${n.tree + 1}`;
      return box;
    }),
    roles: o.roles || {},
  });

  const stackOf = (focusId) => stackLayer({
    id: 'call',
    title: '调用栈',
    name: 'CallStack（栈底 → 栈顶，帧里"还没访问"）',
    cells: frames.map((id, i) => ({ value: id, label: `帧${i + 1}` })),
    top: frames.length ? frames.length - 1 : null,
    capacity: Math.max(4, N),
    roles: {
      focus1: focusId != null && frames.includes(focusId) ? [frames.indexOf(focusId)] : [],
      pointers: frames.length ? [{ id: 'top', label: 'top', index: frames.length - 1 }] : [],
    },
  });

  const outOf = () => arrayLayer({
    id: 'out',
    title: '输出序列',
    name: 'visit 输出（后根：孩子先于根）',
    values: order.map((id) => F.map.get(id).label),
    labels: order.map((id, i) => `第${i + 1}个`),
    roles: { done: order.map((_, i) => i) },
  });

  const vars = (tree, cur) => ({
    树数: T,
    节点数: N,
    当前树: tree == null || tree < 0 ? '—' : `${tree + 1}/${T}`,
    当前: cur ? F.map.get(cur).label : '—',
    栈深: frames.length,
    输出: order.length ? order.map((id) => F.map.get(id).label).join(' → ') : '（空）',
  });

  const seen = (extra = {}) => ({ done: [...order], ...extra });

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: T === 0
      ? '空森林：没有树，后根的 for 也不进。'
      : `同样 ${T} 棵树、${N} 个节点，但后根把"访问根"推迟到所有孩子返回之后，所以输出顺序会明显不同于先根。`,
    vars: vars(null, null),
    layers: [treeOf(), stackOf(null), outOf()],
  }));

  if (T === 0) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'for-t',
      note: 'F.n == 0：跨树循环不进，输出为空序列。',
      vars: vars(null, null),
      layers: [treeOf(), stackOf(null), outOf()],
    }));
  }

  const rec = (id, parent, tree) => {
    frames.push(id);
    const n = F.map.get(id);
    steps.push(step({
      event: 'enter',
      lineId: 'enter',
      note: `进入 ${n.label}（第 ${tree + 1} 棵树，第 ${n.depth} 层）：帧压栈，但此刻不能访问它——${n.children.length} 个孩子一个都没走。`,
      vars: vars(tree, id),
      layers: [
        treeOf({ roles: seen({ focus1: [id], pointers: [{ id: 'cur', label: 'cur', node: id }] }) }),
        stackOf(id),
        outOf(),
      ],
    }));

    for (let j = 0; j < n.children.length; j++) {
      const c = n.children[j];
      steps.push(step({
        event: 'descend',
        lineId: 'descend',
        note: `先钻进 ${n.label} 的第 ${j + 1}/${n.children.length} 个孩子 ${c}：后根必须把孩子整棵处理完，根才轮到。`,
        vars: vars(tree, c),
        layers: [
          treeOf({
            roles: seen({
              focus1: [c],
              focus2: [id],
              pointers: [{ id: 'child', label: `child[${j}]`, node: c }, { id: 'fa', label: 'fa', node: id }],
            }),
          }),
          stackOf(id),
          outOf(),
        ],
      }));
      rec(c, id, tree);
      steps.push(step({
        event: 'backtrack',
        lineId: 'back',
        note: `孩子 ${c} 返回：${n.label} 的第 ${j + 1} 个孩子处理完了，还剩 ${n.children.length - j - 1} 个。`,
        vars: vars(tree, id),
        layers: [
          treeOf({
            roles: seen({
              focus1: [id],
              focus2: [c],
              pointers: [{ id: 'cur', label: 'cur', node: id }],
            }),
          }),
          stackOf(id),
          outOf(),
        ],
      }));
    }

    order.push(id);
    steps.push(step({
      event: 'visit',
      lineId: 'visit',
      note: `${n.label} 的全部孩子都走完了，现在才访问它（第 ${order.length} 个）：后根的"根最后"，所以根一定出现在自己所有后代之后。`,
      vars: vars(tree, id),
      layers: [
        treeOf({ roles: seen({ focus1: [id], pointers: [{ id: 'cur', label: 'cur', node: id }] }) }),
        stackOf(id),
        outOf(),
      ],
    }));

    frames.pop();
    steps.push(step({
      event: 'backtrack',
      lineId: 'ret',
      note: parent
        ? `帧 ${n.label} 出栈，回到父节点 ${F.map.get(parent).label}。`
        : `第 ${tree + 1} 棵树的根 ${n.label} 出栈：这棵树的后根序列已经完整输出。`,
      vars: vars(tree, parent || null),
      layers: [
        treeOf({
          roles: seen(
            parent
              ? { focus1: [parent], pointers: [{ id: 'cur', label: 'cur', node: parent }] }
              : {},
          ),
        }),
        stackOf(parent || null),
        outOf(),
      ],
    }));
  };

  F.roots.forEach((r, t) => {
    steps.push(step({
      event: 'next-tree',
      lineId: 'next',
      note: `当前树号切到第 ${t + 1}/${T} 棵，根 ${r}：树间顺序与先根版一致，差别只在树内部根的时点。`,
      vars: vars(t, r),
      layers: [
        treeOf({ roles: seen({ focus1: [r], pointers: [{ id: 't', label: `t=${t}`, node: r }] }) }),
        stackOf(null),
        outOf(),
      ],
    }));
    steps.push(step({
      event: 'enter',
      lineId: 'call',
      note: `PostOrder(${r})：从第 ${t + 1} 棵树的根发起递归。`,
      vars: vars(t, r),
      layers: [
        treeOf({ roles: seen({ focus1: [r], pointers: [{ id: 'cur', label: 'cur', node: r }] }) }),
        stackOf(null),
        outOf(),
      ],
    }));
    rec(r, null, t);
  });

  const result = { order: order.map((id) => F.map.get(id).label) };
  steps.push(step({
    event: 'done',
    lineId: 'pfn2',
    done: true,
    result,
    note: T === 0
      ? '空森林的后根遍历是空序列。'
      : `后根遍历完成：${result.order.join(', ')}。与先根版对照看：每棵树的根都挪到了自己孩子的后面。`,
    vars: vars(null, null),
    layers: [treeOf({ roles: { done: [...order] } }), stackOf(null), outOf()],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v2',
    sourceVersion: 'forest-postorder-v1',
    lines: L,
    steps,
    result,
    meta: { order: [...result.order], trees: T, nodes: N },
  });
}

/* ------------------------------------------------------------------ 变体 3：按层次遍历森林 */

function runV3(input) {
  const F = buildForest(input);
  const L = LINES.v3;
  const steps = [];
  const order = [];
  const Q = [];           // 队列：Q[0] 是队头
  const N = F.ids.length;
  const T = F.roots.length;

  const treeOf = (o = {}) => treeLayer({
    id: 'main',
    title: 'Forest',
    name: '森林 · 按层次遍历（先所有根，再逐层展开孩子）',
    roots: [...F.roots],
    nodes: F.ids.map((id) => {
      const n = F.map.get(id);
      const box = { id, label: n.label, children: [...n.children] };
      const k = order.indexOf(id);
      if (k >= 0) box.value = `第${k + 1}个`;
      if (F.roots.includes(id)) box.badge = `树${n.tree + 1}`;
      return box;
    }),
    roles: o.roles || {},
  });

  const queueOf = (focusId) => arrayLayer({
    id: 'Q',
    title: '队列 Q',
    name: 'SqQueue Q（队头在左）',
    values: Q.map((id) => F.map.get(id).label),
    labels: Q.map((id) => `${id}·树${F.map.get(id).tree + 1}`),
    roles: {
      focus1: focusId != null && Q.includes(focusId) ? [Q.indexOf(focusId)] : [],
      added: [...Q],
      pointers: Q.length
        ? [
            { id: 'head', label: '队头', index: 0 },
            { id: 'tail', label: '队尾', index: Q.length - 1 },
          ]
        : [],
    },
  });

  const outOf = () => arrayLayer({
    id: 'out',
    title: '输出序列',
    name: 'visit 输出（层序：同层按从左到右、树与树按输入顺序）',
    values: order.map((id) => F.map.get(id).label),
    labels: order.map((id, i) => `第${i + 1}个`),
    roles: { done: order.map((_, i) => i) },
  });

  const vars = (tree, cur) => ({
    树数: T,
    节点数: N,
    当前树: tree == null || tree < 0 ? '—' : `${tree + 1}/${T}`,
    当前: cur ? F.map.get(cur).label : '—',
    队列: Q.length ? Q.map((id) => F.map.get(id).label).join(' | ') : '空',
    输出: order.length ? order.map((id) => F.map.get(id).label).join(' → ') : '（空）',
  });

  const seen = (extra = {}) => ({ done: [...order], ...extra });

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: '层序遍历森林：InitQueue(&Q) 后队列为空。关键不变式——**出队顺序就是访问顺序**，而孩子入队总排在已有节点之后，所以天然按层推进。',
    vars: vars(null, null),
    layers: [treeOf(), queueOf(null), outOf()],
  }));

  if (T === 0) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'loop',
      note: 'Q 为空：while 一次都不进，空森林的层序序列为空。',
      vars: vars(null, null),
      layers: [treeOf(), queueOf(null), outOf()],
    }));
  }

  // 第 0 层：所有树的根先入队
  F.roots.forEach((r, t) => {
    Q.push(r);
    steps.push(step({
      event: 'next-tree',
      lineId: 'next',
      note: `第 ${t + 1}/${T} 棵树的根 ${r} 入队：所有根排在同一层（第 0 层），所以它们会最先被访问。`,
      vars: vars(t, r),
      layers: [
        treeOf({ roles: seen({ focus1: [r], pointers: [{ id: 't', label: `t=${t}`, node: r }] }) }),
        queueOf(r),
        outOf(),
      ],
    }));
  });

  while (Q.length) {
    const p = Q.shift();
    const n = F.map.get(p);
    steps.push(step({
      event: 'enter',
      lineId: 'dequeue',
      note: `出队 ${n.label}（第 ${n.tree + 1} 棵树，第 ${n.depth} 层）：队里还剩 ${Q.length} 个节点排在它后面。`,
      vars: vars(n.tree, p),
      layers: [
        treeOf({ roles: seen({ focus1: [p], pointers: [{ id: 'p', label: 'p', node: p }] }) }),
        queueOf(null),
        outOf(),
      ],
    }));

    order.push(p);
    steps.push(step({
      event: 'visit',
      lineId: 'visit',
      note: `访问 ${n.label}（第 ${order.length} 个）：层序没有"回到父节点"这回事，出队即访问完。`,
      vars: vars(n.tree, p),
      layers: [
        treeOf({ roles: seen({ focus1: [p], pointers: [{ id: 'p', label: 'p', node: p }] }) }),
        queueOf(null),
        outOf(),
      ],
    }));

    for (let j = 0; j < n.children.length; j++) {
      const c = n.children[j];
      Q.push(c);
      steps.push(step({
        event: 'descend',
        lineId: 'descend',
        note: `${n.label} 的第 ${j + 1}/${n.children.length} 个孩子 ${c} 入队到队尾：它要排在所有同层节点之后，这就是"逐层"的来源。`,
        vars: vars(n.tree, c),
        layers: [
          treeOf({
            roles: seen({
              focus1: [c],
              focus2: [p],
              pointers: [{ id: 'p', label: 'p', node: p }, { id: 'child', label: `child[${j}]`, node: c }],
            }),
          }),
          queueOf(c),
          outOf(),
        ],
      }));
    }

    steps.push(step({
      event: 'backtrack',
      lineId: 'back',
      note: n.children.length
        ? `${n.label} 的 ${n.children.length} 个孩子都进队了：这一支到此结束，回到队头取下一个（层序不需要回退到父节点）。`
        : `${n.label} 是叶子，没有孩子进队：直接回到队头取下一个。`,
      vars: vars(n.tree, p),
      layers: [
        treeOf({ roles: seen({ focus1: [p], pointers: [{ id: 'p', label: 'p', node: p }] }) }),
        queueOf(null),
        outOf(),
      ],
    }));
  }

  if (T > 0) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'loop-end',
      note: 'Q 已空 → while 结束：所有层都扩展完了，没有递归、没有调用栈。',
      vars: vars(null, null),
      layers: [treeOf({ roles: seen() }), queueOf(null), outOf()],
    }));
  }

  const result = { order: order.map((id) => F.map.get(id).label) };
  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: T === 0
      ? '空森林的层序遍历是空序列。'
      : `层序遍历完成：${result.order.join(', ')}。先出现的一定是最浅层的节点，同层内按入队先后。`,
    vars: vars(null, null),
    layers: [treeOf({ roles: { done: [...order] } }), queueOf(null), outOf()],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v3',
    sourceVersion: 'forest-levelorder-v1',
    lines: L,
    steps,
    result,
    meta: { order: [...result.order], trees: T, nodes: N, strategy: 'BFS + 队列' },
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
