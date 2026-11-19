/**
 * G · 二叉树前序遍历（3 个代表性、彼此不同的实现）
 *
 * 三种策略的画面差别，正好对应"进入 / 访问 / 回退"这三件事的可见性：
 *   v1 递归版      —— 进入与访问在同一刻发生（前序的"根先"）；回退 = 调用栈出栈；
 *   v2 显式栈迭代  —— 出栈才访问；先压右、后压左，所以"栈顶就是下一个才轮到的人"；
 *   v3 Morris 前序 —— 不用栈也不用递归：借 pred 的空右链当临时线索，第二次到达时拆线索、顺线索回退。
 *
 * 契约（docs/04-轨迹契约.md）：每步都是完整快照；step.lineId 命中本变体自己的 sourceLines；
 * 最后一步 done=true 且 result 与样例 expect 深比较一致。
 */

import { trace, step, treeLayer, stackLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'g/binary-tree-preorder',
  variants: [
    { id: 'v1', name: '递归版', note: '进入节点先访问，再递归左、右子树；调用栈深度可见' },
    { id: 'v2', name: '显式栈迭代', note: '压栈时先压右孩子再压左孩子，出栈即访问，顺序与递归一致' },
    { id: 'v3', name: 'Morris 前序', note: '利用空右链临时线索回溯，O(1) 额外空间，展示线索建立与拆除' },
  ],
};

/* ------------------------------------------------------------------ 样例树 */

/** 任务单指定的样例树：A 的左孩子 B、右孩子 C，B 的右孩子 D */
const SAMPLE_TREE = {
  nodes: [
    { id: 'A', label: 'A', left: 'B', right: 'C' },
    { id: 'B', label: 'B', right: 'D' },
    { id: 'C', label: 'C' },
    { id: 'D', label: 'D' },
  ],
  root: 'A',
};

export const samples = [
  {
    id: 'normal',
    label: '样例树 A(L:B, R:C) · B(R:D) → A,B,D,C',
    input: { tree: SAMPLE_TREE },
    expect: { order: ['A', 'B', 'D', 'C'] },
  },
  {
    id: 'edge-empty',
    label: '空树 {nodes:[], root:null} → 空序列',
    input: { tree: { nodes: [], root: null } },
    expect: { order: [] },
  },
  {
    id: 'edge-right-skew',
    label: '右偏斜树 A→B→C（全部挂在 right）→ A,B,C',
    input: {
      tree: {
        nodes: [
          { id: 'A', label: 'A', right: 'B' },
          { id: 'B', label: 'B', right: 'C' },
          { id: 'C', label: 'C' },
        ],
        root: 'A',
      },
    },
    expect: { order: ['A', 'B', 'C'] },
  },
];

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void PreOrder(BiTree T) {' },
    { lineId: 'guard', text: '  if (T == NULL) return;              /* 空子树：这一侧直接回退，不压栈 */' },
    { lineId: 'push', text: '  /* 调用栈压入帧 T：记下"根已访问，左右还没走" */' },
    { lineId: 'visit', text: '  visit(T);                         /* ① 进入即访问 —— 前序的"根先" */' },
    { lineId: 'left', text: '  PreOrder(T->lchild);              /* ② 递归左子树 */' },
    { lineId: 'leftret', text: '  /* 左子树整棵返回：帧 T 恢复，左半边已全部访问完 */' },
    { lineId: 'right', text: '  PreOrder(T->rchild);              /* ③ 递归右子树 */' },
    { lineId: 'rightret', text: '  /* 右子树整棵返回：T 的左右都完成了 */' },
    { lineId: 'ret', text: '}                                 /* 帧 T 出栈，控制权交回父节点 */' },
    { lineId: 'main', text: '/* main: PreOrder(A) —— 期望输出 A, B, D, C */' },
  ],
  v2: [
    { lineId: 'fn', text: 'void PreOrder_Iter(BiTree T) {' },
    { lineId: 'init', text: '  InitStack(&S);                    /* 空栈 */' },
    { lineId: 'pushroot', text: '  if (T) Push(&S, T);               /* 根先入栈 */' },
    { lineId: 'loop', text: '  while (!StackEmpty(&S)) {' },
    { lineId: 'pop', text: '    BiTree p = Pop(&S);             /* 出栈：轮到 p */' },
    { lineId: 'visit', text: '    visit(p);                      /* 出栈立刻访问，不等子树 */' },
    { lineId: 'pushR', text: '    if (p->rchild) Push(&S, p->rchild);  /* 先压右：它会晚一轮出栈 */' },
    { lineId: 'pushL', text: '    if (p->lchild) Push(&S, p->lchild);  /* 后压左 → 左孩子先出栈 */' },
    { lineId: 'loopend', text: '  }                                /* 栈空 = 全部访问完 */' },
    { lineId: 'ret', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void PreOrder_Morris(BiTree T) {' },
    { lineId: 'init', text: '  BiTree cur = T;                          /* 只要 cur / pred 两个指针 */' },
    { lineId: 'loop', text: '  while (cur != NULL) {' },
    { lineId: 'noleft', text: '    if (cur->lchild == NULL) {             /* 没有左子树 */' },
    { lineId: 'visit1', text: '      visit(cur);  cur = cur->rchild;      /* 访问后直接走右（可能是线索） */' },
    { lineId: 'noleftE', text: '    } else {' },
    { lineId: 'findpred', text: '      pred = cur->lchild;                /* 找左子树最右节点 */' },
    { lineId: 'findloop', text: '      while (pred->rchild && pred->rchild != cur) pred = pred->rchild;' },
    { lineId: 'build', text: '      if (pred->rchild == NULL) {        /* 第一次到 cur：建线索 */' },
    { lineId: 'thread', text: '        pred->rchild = cur;              /* 临时线索：pred 右链指回 cur */' },
    { lineId: 'visit2', text: '        visit(cur);  cur = cur->lchild;  /* 前序在此访问，然后进左子树 */' },
    { lineId: 'cut', text: '      } else {  pred->rchild = NULL;      /* 第二次到 cur：线索使命完成，拆掉 */' },
    { lineId: 'visit3', text: '               visit(cur);  cur = cur->rchild; }' },
    { lineId: 'loopend', text: '  }' },
    { lineId: 'ret', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 小工具 */

/** 输入 → 受控的内部树结构（剪掉悬空引用 / 自环；重复 label 自动加 a/b 后缀） */
function buildTree(input) {
  const spec = (input && input.tree) || {};
  const list = Array.isArray(spec.nodes) ? spec.nodes.filter((n) => n && n.id != null) : [];
  const ids = list.map((n) => String(n.id));
  const labs = labelsOf(list.map((n, i) => (n.label != null && n.label !== '' ? n.label : ids[i])));
  const map = new Map();
  list.forEach((n, i) => {
    map.set(ids[i], {
      id: ids[i],
      label: String(labs[i]),
      left: n.left != null && n.left !== '' ? String(n.left) : null,
      right: n.right != null && n.right !== '' ? String(n.right) : null,
    });
  });
  for (const n of map.values()) {
    if (!n.left || !map.has(n.left) || n.left === n.id) n.left = null;
    if (!n.right || !map.has(n.right) || n.right === n.id) n.right = null;
  }
  const root = spec.root != null && map.has(String(spec.root)) ? String(spec.root) : (ids[0] ?? null);
  const edgeTags = {};
  for (const n of map.values()) {
    if (n.left) edgeTags[n.left] = 'L';
    if (n.right) edgeTags[n.right] = 'R';
  }
  return { map, root, ids, edgeTags };
}

/* ------------------------------------------------------------------ 变体 1：递归 */

function runV1(input) {
  const t = buildTree(input);
  const L = LINES.v1;
  const steps = [];
  const order = [];
  const frames = []; // 调用栈：栈底 → 栈顶
  const lab = (id) => (id == null ? 'NULL' : (t.map.has(id) ? t.map.get(id).label : String(id)));

  const treeOf = (o = {}) => treeLayer({
    id: 'main',
    title: 'BiTree',
    name: 'TiTree · 前序（根 → 左 → 右）',
    roots: t.root ? [t.root] : [],
    nodes: t.ids.map((id) => {
      const n = t.map.get(id);
      const box = { id: n.id, label: n.label };
      if (n.left) box.left = n.left;
      if (n.right) box.right = n.right;
      const k = order.indexOf(id);
      if (k >= 0) box.value = `第${k + 1}个`;
      return box;
    }),
    edgeTags: { ...t.edgeTags },
    threads: [],
    roles: o.roles || {},
  });

  const stackOf = (focusNode) => stackLayer({
    id: 'call',
    title: '调用栈',
    name: 'CallStack（栈底 → 栈顶）',
    cells: frames.map((id, i) => ({ value: lab(id), label: `帧${i + 1}` })),
    top: frames.length ? frames.length - 1 : null,
    capacity: Math.max(4, t.ids.length),
    roles: {
      focus1: focusNode != null && frames.includes(focusNode) ? [frames.indexOf(focusNode)] : [],
      pointers: frames.length ? [{ id: 'top', label: 'top', index: frames.length - 1 }] : [],
    },
  });

  const vars = (cur) => ({
    n: t.ids.length,
    当前: cur ? lab(cur) : '—',
    栈深: frames.length,
    输出: order.length ? order.map(lab).join(' → ') : '（空）',
    调用栈: frames.length ? frames.map(lab).join(' > ') : '空',
  });

  const seenRoles = (extra = {}) => ({ done: [...order], ...extra });

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: t.root
      ? `前序 = 根 → 左 → 右。main 调用 PreOrder(${lab(t.root)})：共 ${t.ids.length} 个节点，先盯住"进入"与"访问"在同一刻发生。`
      : '空树：PreOrder(NULL) 立刻 return，一次压栈、一次访问都不会发生。',
    vars: vars(null),
    layers: [treeOf(), stackOf(null)],
  }));

  if (!t.root) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'guard',
      note: 'T == NULL 成立，函数当场返回：递归版连一个栈帧都没建起来，所以下面只剩空序列。',
      vars: vars(null),
      layers: [treeOf(), stackOf(null)],
    }));
  }

  const goSide = (node, child, isLeft) => {
    if (child) {
      steps.push(step({
        event: isLeft ? 'go-left' : 'go-right',
        lineId: isLeft ? 'left' : 'right',
        note: `从 ${lab(node)} 转向${isLeft ? '左' : '右'}孩子 ${lab(child)}：真正进入的是孩子，父节点 ${lab(node)} 的帧还留在栈里等它返回。`,
        vars: vars(child),
        layers: [
          treeOf({
            roles: seenRoles({
              focus1: [child],
              focus2: [node],
              pointers: [{ id: 'cur', label: 'cur', node: child }, { id: 'fa', label: 'fa', node: node }],
            }),
          }),
          stackOf(node),
        ],
      }));
    } else {
      steps.push(step({
        event: 'backtrack',
        lineId: 'guard',
        note: `${lab(node)} 的${isLeft ? '左' : '右'}孩子是 NULL：PreOrder(NULL) 立即 return，这一侧没有任何节点被访问，也没有压栈。`,
        vars: vars(node),
        layers: [
          treeOf({ roles: seenRoles({ focus1: [node], pointers: [{ id: 'cur', label: 'cur', node: node }] }) }),
          stackOf(node),
        ],
      }));
    }
  };

  const rec = (id, parent) => {
    const n = t.map.get(id);
    frames.push(id);
    steps.push(step({
      event: 'enter',
      lineId: 'push',
      note: `进入 ${n.label}：帧 ${n.label} 压栈。注意"进入"还不是"访问"——帧里记的是"左、右子树都还没做"。`,
      vars: vars(id),
      layers: [
        treeOf({ roles: seenRoles({ focus1: [id], pointers: [{ id: 'cur', label: 'cur', node: id }] }) }),
        stackOf(id),
      ],
    }));

    order.push(id);
    steps.push(step({
      event: 'visit',
      lineId: 'visit',
      note: `前序在进入的同一刻访问 ${n.label}（第 ${order.length} 个）：父节点一定早于它的左右孩子出现在序列里，这就是"根先"。`,
      vars: vars(id),
      layers: [
        treeOf({ roles: seenRoles({ focus1: [id], pointers: [{ id: 'cur', label: 'cur', node: id }] }) }),
        stackOf(id),
      ],
    }));

    goSide(id, n.left, true);
    if (n.left) {
      rec(n.left, id);
      steps.push(step({
        event: 'backtrack',
        lineId: 'leftret',
        note: `${lab(n.left)} 的整棵左子树返回了，帧 ${n.label} 重新拿到控制权；左半边已经全部访问完，接下来才走右子树。`,
        vars: vars(id),
        layers: [
          treeOf({
            roles: seenRoles({
              focus1: [id],
              focus2: [n.left],
              pointers: [{ id: 'cur', label: 'cur', node: id }],
            }),
          }),
          stackOf(id),
        ],
      }));
    }

    goSide(id, n.right, false);
    if (n.right) {
      rec(n.right, id);
      steps.push(step({
        event: 'backtrack',
        lineId: 'rightret',
        note: `${lab(n.right)} 的整棵右子树返回：${n.label} 的左右都完成了，本帧可以出栈。`,
        vars: vars(id),
        layers: [
          treeOf({
            roles: seenRoles({
              focus1: [id],
              focus2: [n.right],
              pointers: [{ id: 'cur', label: 'cur', node: id }],
            }),
          }),
          stackOf(id),
        ],
      }));
    }

    frames.pop();
    steps.push(step({
      event: 'backtrack',
      lineId: 'ret',
      note: parent
        ? `帧 ${n.label} 出栈，控制权交回父节点 ${lab(parent)}：${n.label} 这一整棵子树都处理完了。`
        : `帧 ${n.label} 出栈，调用栈空 → 前序遍历结束。`,
      vars: vars(parent || null),
      layers: [
        treeOf({
          roles: seenRoles(
            parent
              ? { focus1: [parent], pointers: [{ id: 'cur', label: 'cur', node: parent }] }
              : {},
          ),
        }),
        stackOf(parent || null),
      ],
    }));
  };

  if (t.root) rec(t.root, null);

  const result = { order: order.map(lab) };
  steps.push(step({
    event: 'done',
    lineId: 'main',
    done: true,
    result,
    note: t.root
      ? `前序完成：${result.order.join(' → ')}。递归版靠调用栈记住"回来的路"，访问发生在进入的那一刻。`
      : '空树的前序是空序列。',
    vars: vars(null),
    layers: [treeOf({ roles: { done: [...order] } }), stackOf(null)],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v1',
    sourceVersion: 'bt-preorder-recursive-v1',
    lines: L,
    steps,
    result,
    meta: { order: [...result.order], depthMax: Math.max(1, t.ids.length) },
  });
}

/* ------------------------------------------------------------------ 变体 2：显式栈迭代 */

function runV2(input) {
  const t = buildTree(input);
  const L = LINES.v2;
  const steps = [];
  const order = [];
  const S = []; // 栈底 → 栈顶
  const lab = (id) => (id == null ? 'NULL' : (t.map.has(id) ? t.map.get(id).label : String(id)));

  const treeOf = (o = {}) => treeLayer({
    id: 'main',
    title: 'BiTree',
    name: 'TiTree · 前序迭代（栈顶 = 下一个出栈）',
    roots: t.root ? [t.root] : [],
    nodes: t.ids.map((id) => {
      const n = t.map.get(id);
      const box = { id: n.id, label: n.label };
      if (n.left) box.left = n.left;
      if (n.right) box.right = n.right;
      const k = order.indexOf(id);
      if (k >= 0) box.value = `第${k + 1}个`;
      return box;
    }),
    edgeTags: { ...t.edgeTags },
    threads: [],
    roles: o.roles || {},
  });

  const stackOf = (focusNode) => stackLayer({
    id: 'S',
    title: '栈 S',
    name: 'SqStack S（栈底 → 栈顶）',
    cells: S.map((id, i) => ({ value: lab(id), label: `S[${i}]` })),
    top: S.length ? S.length - 1 : null,
    capacity: Math.max(4, t.ids.length),
    roles: {
      focus1: focusNode != null && S.includes(focusNode) ? [S.indexOf(focusNode)] : [],
      pointers: S.length ? [{ id: 'top', label: 'top', index: S.length - 1 }] : [],
    },
  });

  const vars = (cur) => ({
    n: t.ids.length,
    当前: cur ? lab(cur) : '—',
    栈深: S.length,
    输出: order.length ? order.map(lab).join(' → ') : '（空）',
    栈: S.length ? S.map(lab).join(' | ') : '空',
  });

  const roles = (extra = {}) => ({ done: [...order], added: [...S], ...extra });

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: '显式栈版本：InitStack(&S) 后 S 为空。核心不变式——**出栈顺序就是访问顺序**，所以压栈必须"右先左后"。',
    vars: vars(null),
    layers: [treeOf(), stackOf(null)],
  }));

  if (!t.root) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'loop',
      note: 'T == NULL：`if (T) Push` 被挡住，栈一直空，while 一次都不进。',
      vars: vars(null),
      layers: [treeOf(), stackOf(null)],
    }));
  } else {
    S.push(t.root);
    steps.push(step({
      event: 'enter',
      lineId: 'pushroot',
      note: `根 ${lab(t.root)} 入栈。它在第一次出栈时被访问，所以它就是输出的第一个。`,
      vars: vars(t.root),
      layers: [
        treeOf({ roles: roles({ focus1: [t.root], pointers: [{ id: 'cur', label: 'cur', node: t.root }] }) }),
        stackOf(t.root),
      ],
    }));

    while (S.length) {
      const p = S.pop();
      const n = t.map.get(p);
      steps.push(step({
        event: 'enter',
        lineId: 'pop',
        note: `出栈 ${n.label}：出栈就是"轮到它处理"了。栈里剩下 ${S.length} 个节点还没轮到。`,
        vars: vars(p),
        layers: [
          treeOf({ roles: roles({ focus1: [p], pointers: [{ id: 'cur', label: 'p', node: p }] }) }),
          stackOf(null),
        ],
      }));

      order.push(p);
      steps.push(step({
        event: 'visit',
        lineId: 'visit',
        note: `访问 ${n.label}（第 ${order.length} 个）：迭代版不用等子树，出栈即访问完。`,
        vars: vars(p),
        layers: [
          treeOf({ roles: roles({ focus1: [p], pointers: [{ id: 'cur', label: 'p', node: p }] }) }),
          stackOf(null),
        ],
      }));

      if (n.right) {
        S.push(n.right);
        steps.push(step({
          event: 'go-right',
          lineId: 'pushR',
          note: `${n.label} 的右孩子 ${lab(n.right)} 先入栈：它要等整棵左子树都访问完才轮到，所以被压在下面。`,
          vars: vars(p),
          layers: [
            treeOf({
              roles: roles({
                focus1: [n.right],
                focus2: [p],
                pointers: [{ id: 'push', label: '刚压入', node: n.right }],
              }),
            }),
            stackOf(n.right),
          ],
        }));
      }

      if (n.left) {
        S.push(n.left);
        steps.push(step({
          event: 'go-left',
          lineId: 'pushL',
          note: `${n.label} 的左孩子 ${lab(n.left)} 后入栈 → 下一次弹栈就是它。左子树因此一定排在右子树前面，与递归版完全一致。`,
          vars: vars(p),
          layers: [
            treeOf({
              roles: roles({
                focus1: [n.left],
                focus2: [p],
                pointers: [{ id: 'push', label: '刚压入', node: n.left }],
              }),
            }),
            stackOf(n.left),
          ],
        }));
      }

      if (!n.left && !n.right) {
        steps.push(step({
          event: 'backtrack',
          lineId: 'loopend',
          note: `${n.label} 左右孩子都是 NULL：什么也不压，直接回到 while 顶部看栈顶是谁。`,
          vars: vars(p),
          layers: [
            treeOf({ roles: roles({ focus1: [p], pointers: [{ id: 'cur', label: 'p', node: p }] }) }),
            stackOf(null),
          ],
        }));
      }
    }

    steps.push(step({
      event: 'backtrack',
      lineId: 'loopend',
      note: 'S 已空 → while 结束。整棵树处理完毕，没有用一次递归。',
      vars: vars(null),
      layers: [treeOf({ roles: roles() }), stackOf(null)],
    }));
  }

  const result = { order: order.map(lab) };
  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: t.root
      ? `前序完成：${result.order.join(' → ')}。"先压右、后压左"保证了与递归版一模一样的序列。`
      : '空树的前序是空序列。',
    vars: vars(null),
    layers: [treeOf({ roles: { done: [...order] } }), stackOf(null)],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v2',
    sourceVersion: 'bt-preorder-stack-v1',
    lines: L,
    steps,
    result,
    meta: { order: [...result.order], stackPeak: t.ids.length },
  });
}

/* ------------------------------------------------------------------ 变体 3：Morris 前序 */

function runV3(input) {
  const t = buildTree(input);
  const L = LINES.v3;
  const steps = [];
  const order = [];
  const threads = new Map(); // 临时线索：predId → curId（真实代码里写在 pred->rchild）
  const lab = (id) => (id == null ? 'NULL' : (t.map.has(id) ? t.map.get(id).label : String(id)));
  const rightOf = (id) => (threads.has(id) ? threads.get(id) : (t.map.get(id).right || null));

  const treeOf = (o = {}) => treeLayer({
    id: 'main',
    title: 'BiTree',
    name: 'TiTree · Morris 前序（虚线 = 临时线索）',
    roots: t.root ? [t.root] : [],
    nodes: t.ids.map((id) => {
      const n = t.map.get(id);
      const box = { id: n.id, label: n.label };
      if (n.left) box.left = n.left;
      if (n.right) box.right = n.right;
      const k = order.indexOf(id);
      if (k >= 0) box.value = `第${k + 1}个`;
      return box;
    }),
    edgeTags: { ...t.edgeTags },
    threads: [...threads.entries()].map(([from, to]) => ({ from, to, type: 'next' })),
    roles: o.roles || {},
  });

  const vars = (cur, pred) => ({
    n: t.ids.length,
    cur: cur ? lab(cur) : 'NULL',
    pred: pred ? lab(pred) : '—',
    线索数: threads.size,
    输出: order.length ? order.map(lab).join(' → ') : '（空）',
    额外空间: 'O(1)（无栈）',
  });

  const roles = (extra = {}) => ({ done: [...order], ...extra });

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: 'Morris：不用递归也不用栈，只用 cur / pred 两个指针，空间 O(1)。代价是**临时改写**树里的空右链当"回家的线索"（画面上是虚线）。',
    vars: vars(t.root, null),
    layers: [treeOf({ roles: roles(t.root ? { focus1: [t.root], pointers: [{ id: 'cur', label: 'cur', node: t.root }] } : {}) })],
  }));

  if (!t.root) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'loop',
      note: 'cur == NULL：while 一次都不进，树里也没有任何线索要拆。',
      vars: vars(null, null),
      layers: [treeOf()],
    }));
  }

  let cur = t.root;
  while (cur) {
    const n = t.map.get(cur);
    steps.push(step({
      event: 'enter',
      lineId: 'loop',
      note: `cur = ${n.label}：本轮只判断一件事——它有没有左子树。有就走"建线索"那条路，没有就直接访问。`,
      vars: vars(cur, null),
      layers: [
        treeOf({ roles: roles({ focus1: [cur], pointers: [{ id: 'cur', label: 'cur', node: cur }] }) }),
      ],
    }));

    if (!n.left) {
      order.push(cur);
      steps.push(step({
        event: 'visit',
        lineId: 'visit1',
        note: `${n.label} 没有左子树：前序的"根先"在这里直接兑现（第 ${order.length} 个）。注意此时没有任何线索需要建。`,
        vars: vars(cur, null),
        layers: [
          treeOf({ roles: roles({ focus1: [cur], pointers: [{ id: 'cur', label: 'cur', node: cur }] }) }),
        ],
      }));

      const nxt = rightOf(cur);
      if (threads.has(cur)) {
        steps.push(step({
          event: 'backtrack',
          lineId: 'visit1',
          note: `${n.label} 的右指针是临时线索，指向 ${lab(nxt)}：顺着它回退，绝不能当成真孩子继续往右（否则会绕成环）。`,
          vars: vars(nxt, cur),
          layers: [
            treeOf({
              roles: roles({
                focus1: [nxt],
                pointers: [{ id: 'cur', label: 'cur', node: nxt }, { id: 'via', label: '顺线索', node: cur }],
              }),
            }),
          ],
        }));
      } else if (nxt) {
        steps.push(step({
          event: 'go-right',
          lineId: 'visit1',
          note: `cur 转到右孩子 ${lab(nxt)}（真实的孩子边，不是线索）。`,
          vars: vars(nxt, null),
          layers: [
            treeOf({
              roles: roles({
                focus1: [nxt],
                pointers: [{ id: 'cur', label: 'cur', node: nxt }],
              }),
            }),
          ],
        }));
      } else {
        steps.push(step({
          event: 'backtrack',
          lineId: 'visit1',
          note: `${n.label} 的右孩子为 NULL 且没有线索：这一支走到头，cur 变 NULL 准备收尾。`,
          vars: vars(null, cur),
          layers: [
            treeOf({ roles: roles({ focus1: [cur], pointers: [{ id: 'cur', label: 'cur', node: cur }] }) }),
          ],
        }));
      }
      cur = nxt;
      continue;
    }

    // 有左子树：先找左子树的"最右节点" pred
    let pred = n.left;
    while (t.map.get(pred).right) pred = t.map.get(pred).right;
    steps.push(step({
      event: 'enter',
      lineId: 'findloop',
      note: `从 ${lab(n.left)} 一路沿右指针找最右节点：pred = ${lab(pred)}。真实代码在 pred->rchild 上判断"是空还是线索"。`,
      vars: vars(cur, pred),
      layers: [
        treeOf({
          roles: roles({
            focus1: [pred],
            focus2: [cur],
            pointers: [{ id: 'cur', label: 'cur', node: cur }, { id: 'pred', label: 'pred', node: pred }],
          }),
        }),
      ],
    }));

    if (threads.get(pred) === cur) {
      threads.delete(pred);
      steps.push(step({
        event: 'backtrack',
        lineId: 'cut',
        note: `pred=${lab(pred)} 的右链正指向 ${n.label}：这说明 ${n.label} 的左子树整个走完了。拆掉线索把树还原。`,
        vars: vars(cur, pred),
        layers: [
          treeOf({
            roles: roles({
              focus1: [pred],
              focus2: [cur],
              pointers: [{ id: 'cur', label: 'cur', node: cur }, { id: 'pred', label: 'pred', node: pred }],
            }),
          }),
        ],
      }));

      steps.push(step({
        event: 'backtrack',
        lineId: 'cut',
        note: `线索拆除 → 树恢复原状（虚线消失）。${n.label} 现在才轮到，但**前序已经在建线索那次访问过它了**，所以这里不再访问。`,
        vars: vars(cur, pred),
        layers: [
          treeOf({
            roles: roles({
              focus1: [cur],
              pointers: [{ id: 'cur', label: 'cur', node: cur }],
            }),
          }),
        ],
      }));

      const nxt = rightOf(cur);
      steps.push(step({
        event: 'go-right',
        lineId: 'visit3',
        note: `cur 转到右子树 ${lab(nxt)}：左子树已处理完，前序接着走右边。`,
        vars: vars(nxt, pred),
        layers: [
          treeOf({
            roles: roles(
              nxt
                ? { focus1: [nxt], pointers: [{ id: 'cur', label: 'cur', node: nxt }] }
                : { focus1: [cur], pointers: [{ id: 'cur', label: 'cur', node: cur }] },
            ),
          }),
        ],
      }));
      cur = rightOf(cur);
      continue;
    }

    threads.set(pred, cur);
    steps.push(step({
      event: 'enter',
      lineId: 'thread',
      note: `把 ${lab(pred)} 的右孩子临时指向 ${n.label}（虚线线索）：这样左子树走完时能从 ${lab(pred)} 直接"回家"，不用栈。`,
      vars: vars(cur, pred),
      layers: [
        treeOf({
          roles: roles({
            focus1: [pred],
            focus2: [cur],
            pointers: [{ id: 'cur', label: 'cur', node: cur }, { id: 'pred', label: 'pred', node: pred }],
          }),
        }),
      ],
    }));

    order.push(cur);
    steps.push(step({
      event: 'visit',
      lineId: 'visit2',
      note: `前序在"建线索的这一次"就访问 ${n.label}（第 ${order.length} 个）：根先于左子树，所以等第二次回来时不能再访问。`,
      vars: vars(cur, pred),
      layers: [
        treeOf({
          roles: roles({
            focus1: [cur],
            pointers: [{ id: 'cur', label: 'cur', node: cur }, { id: 'pred', label: 'pred', node: pred }],
          }),
        }),
      ],
    }));

    steps.push(step({
      event: 'go-left',
      lineId: 'visit2',
      note: `cur 转向左孩子 ${lab(n.left)}，线索 ${lab(pred)} → ${n.label} 留在树上等着带我们回来。`,
      vars: vars(n.left, pred),
      layers: [
        treeOf({
          roles: roles({
            focus1: [n.left],
            focus2: [cur],
            pointers: [{ id: 'cur', label: 'cur', node: n.left }],
          }),
        }),
      ],
    }));
    cur = n.left;
  }

  if (t.root) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'loopend',
      note: 'cur == NULL 且再无未拆线索 → while 结束：Morris 前序收尾，树的形状已完全还原。',
      vars: vars(null, null),
      layers: [treeOf({ roles: { done: [...order] } })],
    }));
  }

  const result = { order: order.map(lab) };
  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: t.root
      ? `前序完成：${result.order.join(' → ')}。全程没建过栈帧、没入栈出栈，额外空间只有 cur 和 pred 两个指针。`
      : '空树的前序是空序列。',
    vars: vars(null, null),
    layers: [treeOf({ roles: { done: [...order] } })],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v3',
    sourceVersion: 'bt-preorder-morris-v1',
    lines: L,
    steps,
    result,
    meta: { order: [...result.order], threadsLeft: threads.size },
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
