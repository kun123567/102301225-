/**
 * G · 二叉树后序遍历（3 个代表性、彼此不同的实现）
 *
 * 后序的核心难点是"回退与访问的先后"：左右两棵子树都返回之后，根才第一次被输出。
 * 三个版本正好把"回退"画成三件不同的事：
 *   v1 递归版            —— 进入 → 左返回 → 右返回 → 这才访问；访问与回退之间隔着两次返回；
 *   v2 单栈 + lastVisited —— 只看栈顶不弹，靠 last 判断"我刚从哪棵子树回来"，确认右子树完成后才弹栈访问；
 *   v3 双栈逆序版        —— 按"根 → 右 → 左"压 S2，最后把 S2 自顶向下读出，天然就是后序。
 *
 * 契约（docs/04-轨迹契约.md）：每步都是完整快照；step.lineId 命中本变体自己的 sourceLines；
 * 最后一步 done=true 且 result 与样例 expect 深比较一致。
 */

import { trace, step, treeLayer, stackLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'g/binary-tree-postorder',
  variants: [
    { id: 'v1', name: '递归版', note: '先左右后根；只有两侧都返回后才访问父节点' },
    { id: 'v2', name: '单栈 + lastVisited', note: '迭代版：记录上一个访问节点，判断是从左子树还是右子树返回' },
    { id: 'v3', name: '双栈逆序版', note: '按"根→右→左"压栈得到逆后序，最后整体反转' },
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
    label: '样例树 A(L:B, R:C) · B(R:D) → D,B,C,A',
    input: { tree: SAMPLE_TREE },
    expect: { order: ['D', 'B', 'C', 'A'] },
  },
  {
    id: 'edge-single-child',
    label: '每个非叶节点只有一个孩子：A(L:B) · B(L:C) · C(R:D) → D,C,B,A',
    input: {
      tree: {
        nodes: [
          { id: 'A', label: 'A', left: 'B' },
          { id: 'B', label: 'B', left: 'C' },
          { id: 'C', label: 'C', right: 'D' },
          { id: 'D', label: 'D' },
        ],
        root: 'A',
      },
    },
    expect: { order: ['D', 'C', 'B', 'A'] },
  },
  {
    id: 'edge-empty',
    label: '空树 {nodes:[], root:null} → 空序列',
    input: { tree: { nodes: [], root: null } },
    expect: { order: [] },
  },
];

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void PostOrder(BiTree T) {' },
    { lineId: 'guard', text: '  if (T == NULL) return;              /* 空子树：直接回退，不压栈 */' },
    { lineId: 'push', text: '  /* 帧 T 入栈：左右两棵子树都还没做，根的访问排在最后 */' },
    { lineId: 'left', text: '  PostOrder(T->lchild);              /* ① 左子树 */' },
    { lineId: 'leftret', text: '  /* 左子树返回：还欠右子树，此时绝不能访问根 */' },
    { lineId: 'right', text: '  PostOrder(T->rchild);              /* ② 右子树 */' },
    { lineId: 'rightret', text: '  /* 右子树返回：左右两次返回都发生了 */' },
    { lineId: 'visit', text: '  visit(T);                         /* ③ 此刻才访问根 —— "根最后" */' },
    { lineId: 'ret', text: '}                                 /* 帧 T 出栈，控制权交回父节点 */' },
    { lineId: 'main', text: '/* main: PostOrder(A) —— 期望输出 D, B, C, A */' },
  ],
  v2: [
    { lineId: 'fn', text: 'void PostOrder_Iter(BiTree T) {' },
    { lineId: 'init', text: '  InitStack(&S);  BiTree p = T, last = NULL;   /* last = 上一个被访问的节点 */' },
    { lineId: 'loop', text: '  while (p != NULL || !StackEmpty(&S)) {' },
    { lineId: 'descend', text: '    while (p) { Push(&S, p); p = p->lchild; }  /* 一路压左链 */' },
    { lineId: 'peek', text: '    p = Top(&S);                       /* 只看栈顶，先不弹 */' },
    { lineId: 'goright', text: '    if (p->rchild && p->rchild != last) {' },
    { lineId: 'goright2', text: '      p = p->rchild;                    /* 右子树还没走：转过去 */' },
    { lineId: 'elsepop', text: '    } else {                            /* 右子树已走完或为空 */' },
    { lineId: 'pop', text: '      p = Pop(&S);                      /* 这才真正出栈 */' },
    { lineId: 'visit', text: '      visit(p);  last = p;  p = NULL;   /* 记 last，回到父节点重新判右 */' },
    { lineId: 'loopend', text: '    }' },
    { lineId: 'ret', text: '  }' },
  ],
  v3: [
    { lineId: 'fn', text: 'void PostOrder_TwoStack(BiTree T) {' },
    { lineId: 'init', text: '  InitStack(&S1); InitStack(&S2);    /* S1 = 待处理，S2 = 逆后序暂存 */' },
    { lineId: 'seed', text: '  if (T) Push(&S1, T);' },
    { lineId: 'loop', text: '  while (!StackEmpty(&S1)) {' },
    { lineId: 'pop1', text: '    BiTree p = Pop(&S1);             /* 从 S1 出栈 */' },
    { lineId: 'push2', text: '    Push(&S2, p);                    /* 立刻转进 S2（暂存，还不是访问） */' },
    { lineId: 'left', text: '    if (p->lchild) Push(&S1, p->lchild);   /* 先压左 */' },
    { lineId: 'right', text: '    if (p->rchild) Push(&S1, p->rchild);   /* 再压右 → 右先出 S1 */' },
    { lineId: 'loopend', text: '  }' },
    { lineId: 'reverse', text: '  /* S1 空：S2 里是"根 → 右 → 左"的逆序，自顶向下读出即后序 */' },
    { lineId: 'drain', text: '  while (!StackEmpty(&S2)) visit(Pop(&S2));' },
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
function makeTreeOf(t, order, subtitle) {
  return (o = {}) => treeLayer({
    id: 'main',
    title: 'BiTree',
    name: subtitle,
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
}

const makeStackOf = (opts) => (ids, focusNode, lab) => stackLayer({
  id: opts.id,
  title: opts.title,
  name: opts.name,
  cells: ids.map((id, i) => ({ value: lab(id), label: `${opts.cellPrefix}${i}` })),
  top: ids.length ? ids.length - 1 : null,
  capacity: opts.capacity,
  roles: {
    focus1: focusNode != null && ids.includes(focusNode) ? [ids.indexOf(focusNode)] : [],
    pointers: ids.length ? [{ id: 'top', label: 'top', index: ids.length - 1 }] : [],
  },
});

/* ------------------------------------------------------------------ 变体 1：递归 */

function runV1(input) {
  const t = buildTree(input);
  const L = LINES.v1;
  const steps = [];
  const order = [];
  const frames = []; // 调用栈：栈底 → 栈顶
  const lab = (id) => (id == null ? 'NULL' : (t.map.has(id) ? t.map.get(id).label : String(id)));
  const treeOf = makeTreeOf(t, order, 'TiTree · 后序（左 → 右 → 根）');
  const stackOf = makeStackOf({
    id: 'call', title: '调用栈', name: 'CallStack（栈底 → 栈顶；出栈前必须左右都回来）', cellPrefix: '帧', capacity: Math.max(4, t.ids.length),
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
      ? `后序 = 左 → 右 → 根。main 调用 PostOrder(${lab(t.root)})：根要等到左右两次返回都发生之后才被访问，这是三个遍历里"回退"最显眼的一个。`
      : '空树：PostOrder(NULL) 立刻 return，什么都不会发生。',
    vars: vars(null),
    layers: [treeOf(), stackOf(frames, null, lab)],
  }));

  if (!t.root) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'guard',
      note: 'T == NULL 立即返回：递归版连栈帧都没建起来，输出只能是空序列。',
      vars: vars(null),
      layers: [treeOf(), stackOf(frames, null, lab)],
    }));
  }

  const goSide = (node, child, isLeft) => {
    if (child) {
      steps.push(step({
        event: isLeft ? 'go-left' : 'go-right',
        lineId: isLeft ? 'left' : 'right',
        note: isLeft
          ? `从 ${lab(node)} 转向左孩子 ${lab(child)}：后序先做左，${lab(node)} 的访问还得再等两次返回。`
          : `左子树已返回，从 ${lab(node)} 转向右孩子 ${lab(child)}：注意此刻${lab(node)}仍然没有访问，因为它还在等右子树。`,
        vars: vars(child),
        layers: [
          treeOf({
            roles: roles({
              focus1: [child],
              focus2: [node],
              pointers: [{ id: 'cur', label: 'cur', node: child }, { id: 'fa', label: 'fa', node: node }],
            }),
          }),
          stackOf(frames, node, lab),
        ],
      }));
    } else {
      steps.push(step({
        event: 'backtrack',
        lineId: 'guard',
        note: `${lab(node)} 的${isLeft ? '左' : '右'}孩子是 NULL：PostOrder(NULL) 立即返回，这一侧不需要做任何事。`,
        vars: vars(node),
        layers: [
          treeOf({ roles: roles({ focus1: [node], pointers: [{ id: 'cur', label: 'cur', node: node }] }) }),
          stackOf(frames, node, lab),
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
      note: `进入 ${n.label} 并压帧：左右子树都还没做，帧里记的是"这笔账还欠着"。`,
      vars: vars(id),
      layers: [
        treeOf({ roles: roles({ focus1: [id], pointers: [{ id: 'cur', label: 'cur', node: id }] }) }),
        stackOf(frames, id, lab),
      ],
    }));

    goSide(id, n.left, true);
    if (n.left) {
      rec(n.left, id);
      steps.push(step({
        event: 'backtrack',
        lineId: 'leftret',
        note: `${lab(n.left)} 的左子树返回了，帧 ${n.label} 恢复 —— 但**不能**访问 ${n.label}：右子树还欠着。`,
        vars: vars(id),
        layers: [
          treeOf({
            roles: roles({
              focus1: [id],
              focus2: [n.left],
              pointers: [{ id: 'cur', label: 'cur', node: id }],
            }),
          }),
          stackOf(frames, id, lab),
        ],
      }));
    }

    goSide(id, n.right, false);
    if (n.right) {
      rec(n.right, id);
      steps.push(step({
        event: 'backtrack',
        lineId: 'rightret',
        note: `${lab(n.right)} 的右子树也返回了：${n.label} 的左右两次返回都发生，现在才轮到它自己。`,
        vars: vars(id),
        layers: [
          treeOf({
            roles: roles({
              focus1: [id],
              focus2: [n.right],
              pointers: [{ id: 'cur', label: 'cur', node: id }],
            }),
          }),
          stackOf(frames, id, lab),
        ],
      }));
    }

    order.push(id);
    steps.push(step({
      event: 'visit',
      lineId: 'visit',
      note: `访问 ${n.label}（第 ${order.length} 个）：它的左右子树已经全部输出完了，所以根是这一棵子树里最后出现的。`,
      vars: vars(id),
      layers: [
        treeOf({ roles: roles({ focus1: [id], pointers: [{ id: 'cur', label: 'cur', node: id }] }) }),
        stackOf(frames, id, lab),
      ],
    }));

    frames.pop();
    steps.push(step({
      event: 'backtrack',
      lineId: 'ret',
      note: parent
        ? `帧 ${n.label} 出栈，控制权交回 ${lab(parent)}：${lab(parent)} 会据此判断"我刚从左/右子树回来"。`
        : `帧 ${n.label} 出栈，调用栈空 → 后序遍历结束。`,
      vars: vars(parent || null),
      layers: [
        treeOf({
          roles: roles(
            parent ? { focus1: [parent], pointers: [{ id: 'cur', label: 'cur', node: parent }] } : {},
          ),
        }),
        stackOf(frames, parent || null, lab),
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
      ? `后序完成：${result.order.join(' → ')}。根永远排在最后 —— 因为它的访问点在左右两次返回之后。`
      : '空树的后序是空序列。',
    vars: vars(null),
    layers: [treeOf({ roles: { done: [...order] } }), stackOf(frames, null, lab)],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v1',
    sourceVersion: 'bt-postorder-recursive-v1',
    lines: L,
    steps,
    result,
    meta: { order: [...result.order] },
  });
}

/* ------------------------------------------------------------------ 变体 2：单栈 + lastVisited */

function runV2(input) {
  const t = buildTree(input);
  const L = LINES.v2;
  const steps = [];
  const order = [];
  const S = []; // 栈底 → 栈顶
  const lab = (id) => (id == null ? 'NULL' : (t.map.has(id) ? t.map.get(id).label : String(id)));
  const treeOf = makeTreeOf(t, order, 'TiTree · 后序（单栈 + lastVisited）');
  const stackOf = makeStackOf({
    id: 'S', title: '栈 S', name: 'SqStack S（栈底 → 栈顶）', cellPrefix: 'S[', capacity: Math.max(4, t.ids.length),
  });

  let last = null; // 上一个真正被访问过的节点 id

  const vars = (p) => ({
    n: t.ids.length,
    p: p ? lab(p) : 'NULL',
    last: last ? lab(last) : 'NULL',
    栈深: S.length,
    输出: order.length ? order.map(lab).join(' → ') : '（空）',
    栈: S.length ? S.map(lab).join(' | ') : '空',
  });

  const roles = (extra = {}) => ({ done: [...order], added: [...S], ...extra });
  const lastPtr = last ? [{ id: 'last', label: 'last', node: last }] : [];

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: 'InitStack(&S)，p 指向根，last = NULL。关键：**栈顶只能看不能弹**——先确认它的右子树处理完了才允许出栈。',
    vars: vars(t.root),
    layers: [
      treeOf({ roles: roles(t.root ? { focus1: [t.root], pointers: [{ id: 'p', label: 'p', node: t.root }] } : {}) }),
      stackOf(S, null, lab),
    ],
  }));

  if (!t.root) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'loop',
      note: 'p == NULL 且栈空 → while 一开始就不成立，一个节点也没入栈。',
      vars: vars(null),
      layers: [treeOf(), stackOf(S, null, lab)],
    }));
  } else {
    let p = t.root;
    while (p || S.length) {
      while (p) {
        S.push(p);
        steps.push(step({
          event: 'go-left',
          lineId: 'descend',
          note: `p = ${lab(p)} 入栈，然后 p = p->lchild：后序也要先把左链压到底才发现"最左的节点"。`,
          vars: vars(t.map.get(p).left),
          layers: [
            treeOf({
              roles: roles({
                focus1: [p],
                pointers: [{ id: 'p', label: 'p', node: p }, ...lastPtr],
              }),
            }),
            stackOf(S, p, lab),
          ],
        }));
        p = t.map.get(p).left;
      }

      if (!S.length) break;
      const top = S[S.length - 1];
      steps.push(step({
        event: 'enter',
        lineId: 'peek',
        note: `只看栈顶 ${lab(top)}，不弹：要问一句"你是从左子树回来的，还是从右子树回来的？"`,
        vars: vars(top),
        layers: [
          treeOf({
            roles: roles({
              focus1: [top],
              pointers: [{ id: 'top', label: '栈顶', node: top }, ...lastPtr],
            }),
          }),
          stackOf(S, top, lab),
        ],
      }));

      const r = t.map.get(top).right;
      if (r && r !== last) {
        p = r;
        steps.push(step({
          event: 'go-right',
          lineId: 'goright2',
          note: `栈顶 ${lab(top)} 的右孩子 ${lab(r)} ≠ last（last = ${lab(last)}）：说明右子树还没走过，转到右子树，${lab(top)} 继续留在栈里。`,
          vars: vars(r),
          layers: [
            treeOf({
              roles: roles({
                focus1: [r],
                focus2: [top],
                pointers: [{ id: 'p', label: 'p', node: r }, ...lastPtr],
              }),
            }),
            stackOf(S, top, lab),
          ],
        }));
      } else {
        S.pop();
        steps.push(step({
          event: 'backtrack',
          lineId: 'pop',
          note: r
            ? `${lab(top)} 的右孩子正是 last = ${lab(last)}：右子树刚走完，现在可以真正弹栈了。`
            : `${lab(top)} 没有右子树：左子树也已返回，直接弹栈。`,
          vars: vars(top),
          layers: [
            treeOf({
              roles: roles({
                focus1: [top],
                pointers: [{ id: 'p', label: 'p', node: top }, ...lastPtr],
              }),
            }),
            stackOf(S, null, lab),
          ],
        }));

        order.push(top);
        last = top;
        steps.push(step({
          event: 'visit',
          lineId: 'visit',
          note: `访问 ${lab(top)}（第 ${order.length} 个），并令 last = ${lab(top)}、p = NULL —— 回到父节点重新判断右子树。`,
          vars: vars(null),
          layers: [
            treeOf({
              roles: roles({
                focus1: [top],
                pointers: [{ id: 'last', label: 'last', node: top }],
              }),
            }),
            stackOf(S, null, lab),
          ],
        }));
        p = null;
      }
    }

    steps.push(step({
      event: 'backtrack',
      lineId: 'loopend',
      note: 'p == NULL 且 S 空 → while 结束。每个节点都"看过栈顶、确认过右子树、然后才出栈访问"。',
      vars: vars(null),
      layers: [treeOf({ roles: roles() }), stackOf(S, null, lab)],
    }));
  }

  const result = { order: order.map(lab) };
  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: t.root
      ? `后序完成：${result.order.join(' → ')}。last 指针就是"我刚从哪棵子树回来"的答案，替代了递归版的两次返回。`
      : '空树的后序是空序列。',
    vars: vars(null),
    layers: [treeOf({ roles: { done: [...order] } }), stackOf(S, null, lab)],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v2',
    sourceVersion: 'bt-postorder-onestack-v1',
    lines: L,
    steps,
    result,
    meta: { order: [...result.order] },
  });
}

/* ------------------------------------------------------------------ 变体 3：双栈逆序 */

function runV3(input) {
  const t = buildTree(input);
  const L = LINES.v3;
  const steps = [];
  const order = [];
  const S1 = []; // 待处理栈（栈底 → 栈顶）
  const S2 = []; // 逆后序暂存
  const lab = (id) => (id == null ? 'NULL' : (t.map.has(id) ? t.map.get(id).label : String(id)));
  const treeOf = makeTreeOf(t, order, 'TiTree · 后序（双栈逆序）');
  const stack1Of = makeStackOf({
    id: 'S1', title: '栈 S1（待处理）', name: 'S1：出栈顺序 = 根 → 右 → 左', cellPrefix: 'S1[', capacity: Math.max(4, t.ids.length),
  });
  const stack2Of = makeStackOf({
    id: 'S2', title: '栈 S2（逆后序）', name: 'S2：自顶向下读出 = 左 → 右 → 根', cellPrefix: 'S2[', capacity: Math.max(4, t.ids.length),
  });

  const vars = (p) => ({
    n: t.ids.length,
    p: p ? lab(p) : '—',
    S1: S1.length ? S1.map(lab).join(' | ') : '空',
    S2: S2.length ? S2.map(lab).join(' | ') : '空',
    输出: order.length ? order.map(lab).join(' → ') : '（空）',
  });

  const roles = (extra = {}) => ({ done: [...order], added: [...S1, ...S2], ...extra });
  const layers = (treeRoles) => [treeOf({ roles: roles(treeRoles) }), stack1Of(S1, null, lab), stack2Of(S2, null, lab)];

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: '两个栈都清空。思路倒过来：先按"根 → 右 → 左"把节点推进 S2，那么 S2 自底向上就是"左 → 右 → 根"，也就是后序。',
    vars: vars(null),
    layers: layers(t.root ? { focus1: [t.root], pointers: [{ id: 'p', label: 'p', node: t.root }] } : {}),
  }));

  if (!t.root) {
    steps.push(step({
      event: 'backtrack',
      lineId: 'loop',
      note: 'T == NULL：`if (T) Push(&S1, T)` 被挡住，S1 一直空，while 一次都不进，S2 也是空的。',
      vars: vars(null),
      layers: layers(),
    }));
  } else {
    S1.push(t.root);
    steps.push(step({
      event: 'enter',
      lineId: 'seed',
      note: `根 ${lab(t.root)} 压入 S1：它是"根 → 右 → 左"序列里的第一个，因此也是 S2 的栈底。`,
      vars: vars(t.root),
      layers: layers({ focus1: [t.root], pointers: [{ id: 'p', label: 'p', node: t.root }] }),
    }));

    while (S1.length) {
      const p = S1.pop();
      const n = t.map.get(p);
      S2.push(p);
      steps.push(step({
        event: 'enter',
        lineId: 'push2',
        note: `从 S1 弹出 ${n.label}，立刻转存进 S2。注意——这**还不是访问**，只是把"根 → 右 → 左"的顺序记下来。`,
        vars: vars(p),
        layers: layers({ focus1: [p], pointers: [{ id: 'p', label: 'p', node: p }] }),
      }));

      if (n.left) {
        S1.push(n.left);
        steps.push(step({
          event: 'go-left',
          lineId: 'left',
          note: `${n.label} 的左孩子 ${lab(n.left)} 压进 S1：因为左孩子后压，它会先出 S1、后进 S2，最终排在 ${n.label} 前面。`,
          vars: vars(p),
          layers: layers({
            focus1: [n.left],
            focus2: [p],
            pointers: [{ id: 'push', label: '刚压入', node: n.left }],
          }),
        }));
      }

      if (n.right) {
        S1.push(n.right);
        steps.push(step({
          event: 'go-right',
          lineId: 'right',
          note: `再压右孩子 ${lab(n.right)} → 它比左孩子先出 S1，于是先一步进 S2、最终排在左子树后面。这就是"右先左后"的关键一步。`,
          vars: vars(p),
          layers: layers({
            focus1: [n.right],
            focus2: [p],
            pointers: [{ id: 'push', label: '刚压入', node: n.right }],
          }),
        }));
      }

      if (!n.left && !n.right) {
        steps.push(step({
          event: 'backtrack',
          lineId: 'loopend',
          note: `${n.label} 是叶子：不往 S1 里压任何东西，回到 while 顶部继续弹 S1。`,
          vars: vars(p),
          layers: layers({ focus1: [p], pointers: [{ id: 'p', label: 'p', node: p }] }),
        }));
      }
    }

    steps.push(step({
      event: 'backtrack',
      lineId: 'reverse',
      note: 'S1 已空：S2 里装的就是"根 → 右 → 左"（后序的完全逆序）。接下来只要把 S2 一个接一个弹出来输出。',
      vars: vars(null),
      layers: layers(),
    }));

    while (S2.length) {
      const q = S2.pop();
      order.push(q);
      steps.push(step({
        event: 'visit',
        lineId: 'drain',
        note: `从 S2 弹出 ${lab(q)} 输出（第 ${order.length} 个）：逆序反过来就是正序，弹到最后一个 ${lab(q)} 时正好是整棵树的根。`,
        vars: vars(null),
        layers: layers({ focus1: [q], pointers: [{ id: 'out', label: '输出', node: q }] }),
      }));
    }

    steps.push(step({
      event: 'backtrack',
      lineId: 'drain',
      note: 'S2 也空了 → 后序输出完毕。全程没有"判断从哪棵子树返回"，代价是 O(n) 的额外栈。',
      vars: vars(null),
      layers: layers(),
    }));
  }

  const result = { order: order.map(lab) };
  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: t.root
      ? `后序完成：${result.order.join(' → ')}。先造出逆序、再反转 —— 用两段"顺序上的对称"绕开了递归判断。`
      : '空树的后序是空序列。',
    vars: vars(null),
    layers: layers(),
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v3',
    sourceVersion: 'bt-postorder-twostack-v1',
    lines: L,
    steps,
    result,
    meta: { order: [...result.order] },
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
