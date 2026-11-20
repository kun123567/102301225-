/**
 * G · 二叉树中序遍历（3 个代表性、彼此不同的实现）
 *
 * 三个版本共同点是"根的访问点在左子树之后"，差别在**回退机制**：
 *   v1 递归版     —— 左子树返回时由调用栈把帧恢复出来，帧恢复的那一刻才访问根；
 *   v2 显式栈迭代 —— 一路压左链到底，弹栈即访问，然后转到右子树再压它的左链；
 *   v3 Morris 中序 —— 用前驱 pred 的空右链当线索，走到线索上就"回到根"并就地访问，随后拆线索。
 *
 * 契约（docs/04-轨迹契约.md）：每步都是完整快照；step.lineId 命中本变体自己的 sourceLines；
 * 最后一步 done=true 且 result 与样例 expect 深比较一致。
 */

import { trace, step, treeLayer, stackLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'g/binary-tree-inorder',
  variants: [
    { id: 'v1', name: '递归版', note: '先递归左子树，回到根时访问，再进右子树' },
    { id: 'v2', name: '显式栈迭代', note: '一路压左链，弹出即访问，然后转向右子树' },
    { id: 'v3', name: 'Morris 中序', note: '用前驱节点的空右链建线索，访问后拆除，空间 O(1)' },
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
    label: '样例树 A(L:B, R:C) · B(R:D) → B,D,A,C',
    input: { tree: SAMPLE_TREE },
    expect: { order: ['B', 'D', 'A', 'C'] },
  },
  {
    id: 'edge-empty',
    label: '空树 {nodes:[], root:null} → 空序列',
    input: { tree: { nodes: [], root: null } },
    expect: { order: [] },
  },
  {
    id: 'edge-right-skew',
    label: '右偏斜树 A→B→C（全部挂在 right，深度 = 节点数）→ A,B,C',
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
    { lineId: 'fn', text: 'void InOrder(BiTree T) {' },
    { lineId: 'guard', text: '  if (T == NULL) return;             /* 空子树：直接回退，不压栈 */' },
    { lineId: 'push', text: '  /* 帧 T 入栈：左子树没做，根的访问也还欠着 */' },
    { lineId: 'left', text: '  InOrder(T->lchild);               /* ① 一路向左，把左子树榨干 */' },
    { lineId: 'leftret', text: '  /* 左子树返回：此刻才轮到根 —— 中序的"根在中" */' },
    { lineId: 'visit', text: '  visit(T);                        /* ② 回到根时访问 */' },
    { lineId: 'right', text: '  InOrder(T->rchild);               /* ③ 最后进右子树 */' },
    { lineId: 'rightret', text: '  /* 右子树返回：T 的左右都完成了 */' },
    { lineId: 'ret', text: '}                                 /* 帧 T 出栈，控制权交回父节点 */' },
    { lineId: 'main', text: '/* main: InOrder(A) —— 期望输出 B, D, A, C */' },
  ],
  v2: [
    { lineId: 'fn', text: 'void InOrder_Iter(BiTree T) {' },
    { lineId: 'init', text: '  InitStack(&S);  BiTree p = T;       /* p = 当前要挖左链的位置 */' },
    { lineId: 'loop', text: '  while (p != NULL || !StackEmpty(&S)) {' },
    { lineId: 'descend', text: '    if (p != NULL) { Push(&S, p); p = p->lchild; }  /* 一路压左链 */' },
    { lineId: 'pop', text: '    else { p = Pop(&S);              /* 左链到底：弹栈回退到最近的祖先 */' },
    { lineId: 'visit', text: '           visit(p);                 /* 出栈即访问 —— 它的左子树已经空/走完 */' },
    { lineId: 'right', text: '           p = p->rchild; }           /* 转向右子树，重新开始压左链 */' },
    { lineId: 'loopend', text: '  }' },
    { lineId: 'ret', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void InOrder_Morris(BiTree T) {' },
    { lineId: 'init', text: '  BiTree cur = T;                        /* 只多一个 pred 指针，不用栈 */' },
    { lineId: 'loop', text: '  while (cur != NULL) {' },
    { lineId: 'noleft', text: '    if (cur->lchild == NULL) {           /* 没有左子树：它就是"最左" */' },
    { lineId: 'visit1', text: '      visit(cur);  cur = cur->rchild;    /* 直接访问，再走右（可能是线索） */' },
    { lineId: 'noleftE', text: '    } else {' },
    { lineId: 'findpred', text: '      pred = cur->lchild;              /* 中序前驱 = 左子树最右节点 */' },
    { lineId: 'findloop', text: '      while (pred->rchild && pred->rchild != cur) pred = pred->rchild;' },
    { lineId: 'build', text: '      if (pred->rchild == NULL) {      /* 第一次到 cur：建线索后进左 */' },
    { lineId: 'thread', text: '        pred->rchild = cur;  cur = cur->lchild; }' },
    { lineId: 'cut', text: '      else {  pred->rchild = NULL;      /* 第二次到 cur：左子树走完，拆线索 */' },
    { lineId: 'visit2', text: '              visit(cur);  cur = cur->rchild; }  /* 拆完才访问根 */' },
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

/** 树图层：每步重建 nodes（visited 的节点用 value 显示"第几个被访问"） */
function makeTreeOf(t, order) {
  return (o = {}) => treeLayer({
    id: 'main',
    title: 'BiTree',
    name: 'TiTree · 中序（左 → 根 → 右）',
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
    threads: o.threads || [],
    roles: o.roles || {},
  });
}

/* ------------------------------------------------------------------ 变体 1：递归 */

function runV1(input) {
  const t = buildTree(input);
  const L = LINES.v1;
  const steps = [];
  const order = [];
  const frames = []; // 调用栈：栈底 → 栈顶
  const lab = (id) => (id == null ? 'NULL' : (t.map.has(id) ? t.map.get(id).label : String(id)));
  const treeOf = makeTreeOf(t, order);

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

  const roles = (extra = {}) => ({ done: [...order], ...extra });

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: t.root
      ? `中序 = 左 → 根 → 右。main 调用 InOrder(${lab(t.root)})：先把左子树榨干，根要"等"着，这是与 preorder 最直观的差别。`
      : '空树：InOrder(NULL) 立刻 return，一次压栈都没有。',
    vars: vars(null),
    layers: [treeOf(), stackOf(null)],
  }));

  if (!t.root) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'guard',
      note: 'T == NULL 立刻返回：调用栈始终是空的，输出也只能是空序列。',
      vars: vars(null),
      layers: [treeOf(), stackOf(null)],
    }));
  }

  const goSide = (node, child, isLeft) => {
    if (child) {
      steps.push(step({
        event: isLeft ? 'go-left' : 'go-right',
        lineId: isLeft ? 'left' : 'right',
        note: isLeft
          ? `从 ${lab(node)} 转向左孩子 ${lab(child)}：中序必须先把左子树整棵做完，${lab(node)} 的访问被推迟到左子树返回之后。`
          : `左子树已全部访问完，从 ${lab(node)} 转向右孩子 ${lab(child)}：右子树里的节点都会排在 ${lab(node)} 之后。`,
        vars: vars(child),
        layers: [
          treeOf({
            roles: roles({
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
        note: `${lab(node)} 的${isLeft ? '左' : '右'}孩子是 NULL：InOrder(NULL) 立即 return，这一侧没有节点可访问。`,
        vars: vars(node),
        layers: [
          treeOf({ roles: roles({ focus1: [node], pointers: [{ id: 'cur', label: 'cur', node: node }] }) }),
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
      note: `进入 ${n.label} 并压帧：先别访问它，帧里记着"左子树还没做"。`,
      vars: vars(id),
      layers: [
        treeOf({ roles: roles({ focus1: [id], pointers: [{ id: 'cur', label: 'cur', node: id }] }) }),
        stackOf(id),
      ],
    }));

    goSide(id, n.left, true);
    if (n.left) {
      rec(n.left, id);
      steps.push(step({
        event: 'backtrack',
        lineId: 'leftret',
        note: `${lab(n.left)} 的整棵左子树返回了：帧 ${n.label} 恢复，现在才轮到访问它自己。`,
        vars: vars(id),
        layers: [
          treeOf({
            roles: roles({
              focus1: [id],
              focus2: [n.left],
              pointers: [{ id: 'cur', label: 'cur', node: id }],
            }),
          }),
          stackOf(id),
        ],
      }));
    }

    order.push(id);
    steps.push(step({
      event: 'visit',
      lineId: 'visit',
      note: `访问 ${n.label}（第 ${order.length} 个）：它的左子树已全部输出，右子树还一个都没输出——所以它正好夹在中间，这就是"中序"。`,
      vars: vars(id),
      layers: [
        treeOf({ roles: roles({ focus1: [id], pointers: [{ id: 'cur', label: 'cur', node: id }] }) }),
        stackOf(id),
      ],
    }));

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
            roles: roles({
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
        ? `帧 ${n.label} 出栈，控制权交回 ${lab(parent)}。`
        : `帧 ${n.label} 出栈，调用栈空 → 中序遍历结束。`,
      vars: vars(parent || null),
      layers: [
        treeOf({
          roles: roles(
            parent ? { focus1: [parent], pointers: [{ id: 'cur', label: 'cur', node: parent }] } : {},
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
      ? `中序完成：${result.order.join(' → ')}。访问点落在"左子树返回、右子树还没开始"的缝隙里，所以根永远在左右之间。`
      : '空树的中序是空序列。',
    vars: vars(null),
    layers: [treeOf({ roles: { done: [...order] } }), stackOf(null)],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v1',
    sourceVersion: 'bt-inorder-recursive-v1',
    lines: L,
    steps,
    result,
    meta: { order: [...result.order] },
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
  const treeOf = makeTreeOf(t, order);

  const stackOf = (focusNode) => stackLayer({
    id: 'S',
    title: '栈 S',
    name: 'SqStack S（栈底 → 栈顶，全是"左链"上的祖先）',
    cells: S.map((id, i) => ({ value: lab(id), label: `S[${i}]` })),
    top: S.length ? S.length - 1 : null,
    capacity: Math.max(4, t.ids.length),
    roles: {
      focus1: focusNode != null && S.includes(focusNode) ? [S.indexOf(focusNode)] : [],
      pointers: S.length ? [{ id: 'top', label: 'top', index: S.length - 1 }] : [],
    },
  });

  const vars = (p) => ({
    n: t.ids.length,
    p: p ? lab(p) : 'NULL',
    栈深: S.length,
    输出: order.length ? order.map(lab).join(' → ') : '（空）',
    栈: S.length ? S.map(lab).join(' | ') : '空',
  });

  const roles = (extra = {}) => ({ done: [...order], added: [...S], ...extra });

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: 'InitStack(&S)，p 指向根。不变式：**栈里存的永远是还没访问过的祖先**，一路向左压链，压不动就弹栈。',
    vars: vars(t.root),
    layers: [
      treeOf({ roles: roles(t.root ? { focus1: [t.root], pointers: [{ id: 'p', label: 'p', node: t.root }] } : {}) }),
      stackOf(null),
    ],
  }));

  if (!t.root) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'loop',
      note: 'p == NULL 且栈空 → while 条件一开始就不成立，连一次压栈都没有。',
      vars: vars(null),
      layers: [treeOf(), stackOf(null)],
    }));
  } else {
    S.push(t.root);
    steps.push(step({
      event: 'go-left',
      lineId: 'descend',
      note: `先把根 ${lab(t.root)} 压进 S，p 转左孩子：中序要先把左链一路压到底，根不着急访问。`,
      vars: vars(t.root),
      layers: [
        treeOf({
          roles: roles({
            focus1: [t.root],
            pointers: [{ id: 'p', label: 'p', node: t.root }],
          }),
        }),
        stackOf(t.root),
      ],
    }));

    let p = t.map.get(t.root).left;
    while (p || S.length) {
      if (p) {
        S.push(p);
        steps.push(step({
          event: 'go-left',
          lineId: 'descend',
          note: `p = ${lab(p)} 入栈，然后 p = p->lchild：继续沿左链下探，这些祖先都还没访问。`,
          vars: vars(p),
          layers: [
            treeOf({
              roles: roles({
                focus1: [p],
                pointers: [{ id: 'p', label: 'p', node: p }],
              }),
            }),
            stackOf(p),
          ],
        }));
        p = t.map.get(p).left;
        if (!p) {
          steps.push(step({
            event: 'backtrack',
            lineId: 'descend',
            note: 'p 变成 NULL：左链到底了，没有更左的节点 —— 此时只能弹栈，回退到最近的祖先。',
            vars: vars(S[S.length - 1]),
            layers: [
              treeOf({
                roles: roles({
                  focus1: [S[S.length - 1]],
                  pointers: [{ id: 'p', label: 'p', node: S[S.length - 1] }],
                }),
              }),
              stackOf(S[S.length - 1]),
            ],
          }));
        }
      } else {
        const top = S.pop();
        steps.push(step({
          event: 'enter',
          lineId: 'pop',
          note: `弹出 ${lab(top)}：它的左孩子已经处理完（或者本来就没有），所以它是当前"最左的未访问节点"。`,
          vars: vars(top),
          layers: [
            treeOf({
              roles: roles({
                focus1: [top],
                pointers: [{ id: 'p', label: 'p', node: top }],
              }),
            }),
            stackOf(null),
          ],
        }));

        order.push(top);
        steps.push(step({
          event: 'visit',
          lineId: 'visit',
          note: `访问 ${lab(top)}（第 ${order.length} 个）：出栈即访问，正是"左子树走完、右子树还没开始"的时刻。`,
          vars: vars(top),
          layers: [
            treeOf({
              roles: roles({
                focus1: [top],
                pointers: [{ id: 'p', label: 'p', node: top }],
              }),
            }),
            stackOf(null),
          ],
        }));

        const r = t.map.get(top).right;
        p = r;
        steps.push(step({
          event: 'go-right',
          lineId: 'right',
          note: r
            ? `p 转向右孩子 ${lab(r)}：右子树里的节点都该排在 ${lab(top)} 之后，下一轮会把它自己的左链继续压到底。`
            : `${lab(top)} 没有右子树：p 保持 NULL，下一轮直接继续弹栈（继续往更上层回退）。`,
          vars: vars(r),
          layers: [
            treeOf({
              roles: roles(
                r
                  ? { focus1: [r], pointers: [{ id: 'p', label: 'p', node: r }] }
                  : { focus1: [top], pointers: [{ id: 'p', label: 'p', node: top }] },
              ),
            }),
            stackOf(null),
          ],
        }));
      }
    }

    steps.push(step({
      event: 'backtrack',
      lineId: 'loopend',
      note: 'p == NULL 且 S 空 → while 结束。所有节点都从栈里弹过一次，也都访问过一次。',
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
      ? `中序完成：${result.order.join(' → ')}。栈里存的就是"左链上的祖先"，弹一个访问一个。`
      : '空树的中序是空序列。',
    vars: vars(null),
    layers: [treeOf({ roles: { done: [...order] } }), stackOf(null)],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v2',
    sourceVersion: 'bt-inorder-stack-v1',
    lines: L,
    steps,
    result,
    meta: { order: [...result.order] },
  });
}

/* ------------------------------------------------------------------ 变体 3：Morris 中序 */

function runV3(input) {
  const t = buildTree(input);
  const L = LINES.v3;
  const steps = [];
  const order = [];
  const threads = new Map(); // 临时线索：predId → curId
  const lab = (id) => (id == null ? 'NULL' : (t.map.has(id) ? t.map.get(id).label : String(id)));
  const rightOf = (id) => (threads.has(id) ? threads.get(id) : (t.map.get(id).right || null));
  const threadList = () => [...threads.entries()].map(([from, to]) => ({ from, to, type: 'next' }));

  const treeOf = (o = {}) => treeLayer({
    id: 'main',
    title: 'BiTree',
    name: 'TiTree · Morris 中序（虚线 = 临时线索）',
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
    threads: threadList(),
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
    note: 'Morris 中序：不用栈。走到"没有左子树"的节点就直接访问；有左子树就先在最右节点上建一条回到 cur 的线索（虚线）。',
    vars: vars(t.root, null),
    layers: [
      treeOf({ roles: roles(t.root ? { focus1: [t.root], pointers: [{ id: 'cur', label: 'cur', node: t.root }] } : {}) }),
    ],
  }));

  if (!t.root) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'loop',
      note: 'cur == NULL：while 一次都不进，没有节点、也没有线索要拆。',
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
      note: `cur = ${n.label}：老问题——它有左子树吗？有就先下去（留一条线索回家），没有就当场访问。`,
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
        note: `${n.label} 没有左子树 → 它就是当前子树的"最左"节点，中序第一个输出的就是它（第 ${order.length} 个）。`,
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
          note: `${n.label} 的右链是临时线索，指向祖先 ${lab(nxt)}：顺着线索回退，回到那个"根"也就轮到它被访问了。`,
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
          note: `cur 转到右孩子 ${lab(nxt)}（真实孩子边）：右子树里还有节点要按中序处理。`,
          vars: vars(nxt, null),
          layers: [
            treeOf({ roles: roles({ focus1: [nxt], pointers: [{ id: 'cur', label: 'cur', node: nxt }] }) }),
          ],
        }));
      } else {
        steps.push(step({
          event: 'backtrack',
          lineId: 'visit1',
          note: `${n.label} 既没有左子树也没有右子树（且无线索）：中序走到尽头，cur 变 NULL。`,
          vars: vars(null, cur),
          layers: [
            treeOf({ roles: roles({ focus1: [cur], pointers: [{ id: 'cur', label: 'cur', node: cur }] }) }),
          ],
        }));
      }
      cur = nxt;
      continue;
    }

    let pred = n.left;
    while (t.map.get(pred).right) pred = t.map.get(pred).right;
    steps.push(step({
      event: 'enter',
      lineId: 'findloop',
      note: `找 ${n.label} 的中序前驱：左子树 ${lab(n.left)} 的最右节点 = ${lab(pred)}。真实代码在 pred->rchild 上判断"是空还是线索"。`,
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
        note: `pred=${lab(pred)} 的右链指向 ${n.label}：左子树已经整棵走完，线索用完了 —— 拆掉它把树还原。`,
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
        note: `现在才访问 ${n.label}（第 ${order.length} 个）：左子树全部输出完、右子树一个都没输出，根正好落在中间。`,
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
        lineId: 'visit2',
        note: nxt
          ? `cur 转向右子树 ${lab(nxt)}：中序里右子树的节点都排在 ${n.label} 之后。`
          : `${n.label} 没有右子树，cur 变 NULL —— 这一支也处理完了。`,
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
      cur = nxt;
      continue;
    }

    threads.set(pred, cur);
    steps.push(step({
      event: 'enter',
      lineId: 'thread',
      note: `把 ${lab(pred)} 的空右链临时指向 ${n.label}（虚线）：这样左子树走完能顺着它回到这里，然后才访问 ${n.label}。`,
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
      event: 'go-left',
      lineId: 'thread',
      note: `曲线索已建好，cur 转向左孩子 ${lab(n.left)}：注意中序**不在这里访问** cur，要等线索把我们带回来。`,
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
      note: 'cur == NULL 且所有线索都已拆除 → while 结束：Morris 中序收尾，树恢复原样。',
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
      ? `中序完成：${result.order.join(' → ')}。全程零栈帧，靠的是"前驱右链"这条临时回家的路。`
      : '空树的中序是空序列。',
    vars: vars(null, null),
    layers: [treeOf({ roles: { done: [...order] } })],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v3',
    sourceVersion: 'bt-inorder-morris-v1',
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
