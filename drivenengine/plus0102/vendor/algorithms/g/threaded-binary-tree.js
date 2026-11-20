/**
 * G · 二叉树线索化（3 个彼此不同的实现）
 *
 * 共同点：把"空左链 / 空右链"改造成线索，并用 ltag / rtag 区分"孩子"与"线索"。
 * 差别在**按什么次序线索化、回退靠什么**：
 *   v1 中序线索化（递归）—— 调用栈隐式回退，中序次序 B→D→A→C；
 *   v2 中序线索化（迭代）—— 显式栈压左链，弹栈那一刻处理节点，边弹边建线索；
 *   v3 前序线索化       —— 次序换成 A→B→D→C，前驱/后继的定义整体前移，遍历规则随之变化。
 *
 * 渲染约定（这点很容易写错）：节点的 left/right 只放**真实孩子**，线索目标存在 prev/next 里，
 * 由 treeLayer 的 threads（虚线）画出来。若把线索直接塞进 left/right，树就成环了，布局无从谈起。
 * badge 直接显示 ltag/rtag，例如 "L1/R0" = 左链是线索、右链仍是孩子。
 *
 * 契约（docs/04-轨迹契约.md）：每步完整快照；lineId 命中本变体自己的 sourceLines；
 * 最后一步 done=true 且 result 与样例 expect 深比较一致。
 */

import { trace, step, treeLayer, stackLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'g/threaded-binary-tree',
  variants: [
    { id: 'v1', name: '中序线索化（递归）', note: '按中序走，空左链指向前驱、空右链由前驱回填后继，并置 ltag/rtag' },
    { id: 'v2', name: '中序线索化（迭代）', note: '显式栈迭代中序，维护 pre 指针，边访问边建线索' },
    { id: 'v3', name: '前序线索化', note: '改为前序线索，前驱/后继定义随之变化，用于对照不同线索次序的遍历规则' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

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
    label: '样例树 A(L:B, R:C) · B(R:D)：中序 B→D→A→C，D 左线索指 B、右线索指 A',
    input: { tree: SAMPLE_TREE },
    expect: {
      order: ['B', 'D', 'A', 'C'],
      prev: { D: 'B', C: 'A' },
      next: { D: 'A' },
      tags: { A: 'L0/R0', B: 'L1/R0', C: 'L1/R1', D: 'L1/R1' },
    },
    expectByVariant: {
      v3: {
        order: ['A', 'B', 'D', 'C'],
        prev: { B: 'A', D: 'B', C: 'D' },
        next: { D: 'C' },
        tags: { A: 'L0/R0', B: 'L1/R0', C: 'L1/R1', D: 'L1/R1' },
      },
    },
  },
  {
    id: 'edge-single',
    label: '单节点 {A}：ltag=rtag=1，左右线索全为空（首尾合一的空线索）',
    input: { tree: { nodes: [{ id: 'A', label: 'A' }], root: 'A' } },
    expect: { order: ['A'], prev: {}, next: {}, tags: { A: 'L1/R1' } },
  },
  {
    id: 'edge-empty',
    label: '空树 {nodes:[], root:null}：pre 始终为空，一条线索都不建',
    input: { tree: { nodes: [], root: null } },
    expect: { order: [], prev: {}, next: {}, tags: {} },
  },
];

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void InThread(BiTree p, BiTree &pre) {' },
    { lineId: 'guard', text: '  if (p == NULL) return;              /* 空子树直接回退 */' },
    { lineId: 'goleft', text: '  InThread(p->lchild, pre);          /* ① 先把左子树线索化完 */' },
    { lineId: 'backleft', text: '  /* 左子树返回：这一刻才轮到 p —— 中序的"根在中" */' },
    { lineId: 'lthread', text: '  if (p->lchild == NULL) { p->lchild = pre; p->ltag = 1; }   /* ② 左空指前驱 */' },
    { lineId: 'rthread', text: '  if (pre && pre->rchild == NULL) { pre->rchild = p; pre->rtag = 1; }  /* ③ 前驱回填后继 */' },
    { lineId: 'preupd', text: '  pre = p;                         /* pre 始终是刚线索化完的那个 */' },
    { lineId: 'goright', text: '  InThread(p->rchild, pre);        /* ④ 最后进右子树 */' },
    { lineId: 'tail', text: '  /* 收尾 */ if (pre->rchild == NULL) pre->rtag = 1;   /* 末节点：右线索为空 */' },
    { lineId: 'walk', text: '  for (p = First(T); p; p = Next(p)) visit(p);  /* 顺线索线性遍历，不用栈/递归 */' },
    { lineId: 'ret', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void InThread_Iter(BiTree T) {' },
    { lineId: 'init', text: '  InitStack(&S);  BiTree p = T, pre = NULL;' },
    { lineId: 'loop', text: '  while (p != NULL || !StackEmpty(&S)) {' },
    { lineId: 'descend', text: '    if (p != NULL) { Push(&S, p); p = p->lchild; continue; }  /* 一路压左链 */' },
    { lineId: 'pop', text: '    p = Pop(&S);                  /* 弹栈：p 的中序位置到了 */' },
    { lineId: 'lthread', text: '    if (p->lchild == NULL) { p->lchild = pre; p->ltag = 1; }' },
    { lineId: 'rthread', text: '    if (pre && pre->rchild == NULL) { pre->rchild = p; pre->rtag = 1; }' },
    { lineId: 'preupd', text: '    pre = p;' },
    { lineId: 'goright', text: '    p = p->rchild;                /* 转向右子树，下一轮继续压它的左链 */' },
    { lineId: 'tail', text: '  }  if (pre && pre->rchild == NULL) pre->rtag = 1;   /* 末节点收尾 */' },
    { lineId: 'walk', text: '  for (p = First(T); p; p = Next(p)) visit(p);' },
    { lineId: 'ret', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void PreThread(BiTree p, BiTree &pre) {' },
    { lineId: 'guard', text: '  if (p == NULL) return;' },
    { lineId: 'lthread', text: '  if (p->lchild == NULL) { p->lchild = pre; p->ltag = 1; }   /* 前序：一进门就定前驱 */' },
    { lineId: 'rthread', text: '  if (pre && pre->rchild == NULL) { pre->rchild = p; pre->rtag = 1; }' },
    { lineId: 'preupd', text: '  pre = p;' },
    { lineId: 'goleft', text: '  if (p->ltag == 0) PreThread(p->lchild, pre);   /* 是线索就不能下，否则原地打转 */' },
    { lineId: 'goright', text: '  if (p->rtag == 0) PreThread(p->rchild, pre);' },
    { lineId: 'tail', text: '  /* 收尾 */ if (pre->rchild == NULL) pre->rtag = 1;' },
    { lineId: 'walk', text: '  for (p = T; p; p = (p->ltag == 0 ? p->lchild : p->rchild)) visit(p);' },
    { lineId: 'ret', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 小工具 */

/** 输入 → 内部树（剪掉悬空引用/自环；重复 label 自动加 a/b 后缀；线索字段初始化为空） */
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
      ltag: 0, rtag: 0,          // 0 = 指针指向真实孩子；1 = 指针已改成线索
      prev: null, next: null,    // 线索目标（渲染时走 threads 虚线，不塞进 left/right）
      seq: null,                 // 顺线索遍历时是第几个
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

/** 树图层工厂：每次调用都新建 nodes/threads 数组（快照必须独立） */
function layerFactory(t, title) {
  const lab = (id) => (id == null ? 'NULL' : (t.map.has(id) ? t.map.get(id).label : String(id)));
  const threadsOf = () => {
    const out = [];
    for (const id of t.ids) {
      const n = t.map.get(id);
      if (n.prev) out.push({ from: id, to: n.prev, type: 'prev' });
      if (n.next) out.push({ from: id, to: n.next, type: 'next' });
    }
    return out;
  };
  const layer = (o = {}) => treeLayer({
    id: 'main',
    title,
    name: o.name || 'BiThrTree · 虚线 = 线索（L=前驱 / R=后继），badge = ltag/rtag',
    roots: t.root ? [t.root] : [],
    nodes: t.ids.map((id) => {
      const n = t.map.get(id);
      const box = { id: n.id, label: n.label, badge: `L${n.ltag}/R${n.rtag}` };
      if (n.left) box.left = n.left;
      if (n.right) box.right = n.right;
      if (n.seq != null) box.value = `第${n.seq}个`;
      return box;
    }),
    edgeTags: { ...t.edgeTags },
    threads: threadsOf(),
    roles: o.roles || {},
  });
  const count = () => t.ids.reduce((k, id) => {
    const n = t.map.get(id);
    return k + (n.prev ? 1 : 0) + (n.next ? 1 : 0);
  }, 0);
  const tagsOf = () => Object.fromEntries(t.ids.map((id) => {
    const n = t.map.get(id);
    return [n.label, `L${n.ltag}/R${n.rtag}`];
  }));
  const pick = (side) => Object.fromEntries(t.ids.filter((id) => t.map.get(id)[side]).map((id) => {
    const n = t.map.get(id);
    return [n.label, lab(n[side])];
  }));
  return { lab, layer, count, tagsOf, pick };
}

/** 中序 Next：rtag==1 顺线索走；否则进右子树一路向左到最左 */
function nextInThread(t, id) {
  const n = t.map.get(id);
  if (n.rtag === 1) return n.next;
  let c = n.right;
  if (!c) return null;
  while (t.map.get(c).ltag === 0 && t.map.get(c).left) c = t.map.get(c).left;
  return c;
}

/** 中序 First：从根一路走真实左孩子，停下的第一个 ltag==1 节点 */
function firstInThread(t) {
  let c = t.root;
  while (c && t.map.get(c).ltag === 0 && t.map.get(c).left) c = t.map.get(c).left;
  return c;
}

/** 前序 Next：ltag==0 就进左孩子，否则走右链（多为线索） */
function nextPre(t, id) {
  const n = t.map.get(id);
  if (n.ltag === 0 && n.left) return n.left;
  return n.rtag === 1 ? n.next : n.right;
}

/* ------------------------------------------------------------------ 变体 1：中序线索化（递归） */

function runV1(input) {
  const t = buildTree(input);
  const L = LINES.v1;
  const steps = [];
  const order = [];  // 中序（线索化）次序
  let pre = null;
  const { lab, layer, count, tagsOf, pick } = layerFactory(t, 'BiThrTree · 中序线索化（递归）');

  const vars = (cur) => ({
    节点数: t.ids.length,
    当前: cur ? lab(cur) : '—',
    pre: pre ? lab(pre) : 'NULL',
    线索数: count(),
    次序: order.length ? order.map(lab).join(' → ') : '（空）',
  });

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: t.root
      ? '线索化要解决"没有栈就走不动"的问题：把空左链改指前驱、空右链改指后继，再用 ltag/rtag 说明这条链到底是孩子还是线索。谁是谁的前驱/后继，完全由中序次序 B→D→A→C 决定。'
      : '空树：InThread(NULL, pre) 立刻返回，一个指针都不用改。',
    vars: vars(t.root),
    layers: [layer({
      roles: t.root ? { focus1: [t.root], pointers: [{ id: 'p', label: 'p', node: t.root }] } : {},
    })],
  }));

  if (!t.root) {
    steps.push(step({
      event: 'inorder',
      lineId: 'guard',
      note: 'p == NULL 直接 return：没有节点，也就没有"空链"可以改写成线索。',
      vars: vars(null),
      layers: [layer()],
    }));
  }

  const rec = (id) => {
    const n = t.map.get(id);
    steps.push(step({
      event: 'inorder',
      lineId: 'guard',
      note: `${n.label} 非空，进入这一层递归：中序的规矩是左子树先做完，${n.label} 自己的位置被推到左子树返回之后。`,
      vars: vars(id),
      layers: [layer({ roles: { focus1: [id], pointers: [{ id: 'p', label: 'p', node: id }] } })],
    }));

    // ① 左子树
    if (n.left) {
      steps.push(step({
        event: 'inorder',
        lineId: 'goleft',
        note: `${n.label} 有真实左孩子 ${lab(n.left)} → 先 InThread(${lab(n.left)}, pre)：左子树里的节点在中序中全部排在 ${n.label} 之前。`,
        vars: vars(id),
        layers: [layer({
          roles: {
            focus1: [n.left], focus2: [id],
            pointers: [{ id: 'p', label: 'p', node: n.left }, { id: 'fa', label: '父', node: id }],
          },
        })],
      }));
      rec(n.left);
      steps.push(step({
        event: 'inorder',
        lineId: 'backleft',
        note: `左子树 ${lab(n.left)} 返回。此刻 ${n.label} 左边已经全部线索化，轮到 ${n.label} 自己 —— 这就是中序"根夹在中间"的那一行。`,
        vars: vars(id),
        layers: [layer({ roles: { focus1: [id], focus2: [n.left], pointers: [{ id: 'p', label: 'p', node: id }] } })],
      }));
    } else {
      steps.push(step({
        event: 'inorder',
        lineId: 'goleft',
        note: `${n.label} 的左链是空的 → 没有左子树可下，${n.label} 自己就是当前子树的"最左"节点（中序里它最先出现）。`,
        vars: vars(id),
        layers: [layer({ roles: { focus1: [id], pointers: [{ id: 'p', label: 'p', node: id }] } })],
      }));
    }

    // ② 左空指前驱
    if (!n.left) {
      n.ltag = 1;
      n.prev = pre;
      steps.push(step({
        event: 'set-pre-thread',
        lineId: 'lthread',
        note: pre
          ? `${n.label} 的左链空着 → 直接指向前驱 ${lab(pre)}（橙色虚线），并把 ltag 置 1。线索树的"前驱"就是这样存下来的。`
          : `${n.label} 是中序第一个节点，前驱根本不存在 → 左线索只能是 NULL（首节点的空线索），ltag 依然置 1。`,
        vars: vars(id),
        layers: [layer({
          roles: {
            focus1: [id],
            ...(pre ? { focus2: [pre], pointers: [{ id: 'pre', label: 'pre', node: pre }, { id: 'p', label: 'p', node: id }] } : { pointers: [{ id: 'p', label: 'p', node: id }] }),
          },
        })],
      }));
    } else {
      steps.push(step({
        event: 'inorder',
        lineId: 'lthread',
        note: `${n.label} 的左链是真实孩子 ${lab(n.left)} → 这根指针不能拿来做线索，ltag 保持 0（0 = 是孩子）。`,
        vars: vars(id),
        layers: [layer({ roles: { focus1: [id], focus2: [n.left], pointers: [{ id: 'p', label: 'p', node: id }] } })],
      }));
    }

    // ③ 前驱回填后继
    const pn = pre ? t.map.get(pre) : null;
    if (pn && !pn.right) {
      pn.rtag = 1;
      pn.next = id;
      steps.push(step({
        event: 'set-next-thread',
        lineId: 'rthread',
        note: `前驱 ${pn.label} 的右链还空着 → 顺手把它回填成指向 ${n.label} 的后继线索（绿色虚线），rtag 置 1。线索化的关键技巧：后继不改自己，由前驱代填。`,
        vars: vars(id),
        layers: [layer({
          roles: {
            focus1: [pn.id], focus2: [id],
            pointers: [{ id: 'pre', label: 'pre', node: pn.id }, { id: 'p', label: 'p', node: id }],
          },
        })],
      }));
    } else {
      steps.push(step({
        event: 'inorder',
        lineId: 'rthread',
        note: pn
          ? `${pn.label} 已经有真实右孩子 ${lab(pn.right)} → 它的右链要留给那个孩子，不能被后继线索占用，跳过回填。`
          : 'pre 还是 NULL（当前就是首节点）→ 没有"前驱"可以替它回填后继。',
        vars: vars(id),
        layers: [layer({ roles: { focus1: [id], pointers: [{ id: 'p', label: 'p', node: id }] } })],
      }));
    }

    // ④ pre 前移
    pre = id;
    order.push(id);
    steps.push(step({
      event: 'inorder',
      lineId: 'preupd',
      note: `pre = ${n.label}（中序第 ${order.length} 个）。以后遇到的空左链都会指向它，它自己的空右链也会被下一个节点回填。`,
      vars: vars(id),
      layers: [layer({ roles: { focus1: [id], done: [...order], pointers: [{ id: 'pre', label: 'pre', node: id }] } })],
    }));

    // ⑤ 右子树
    if (n.right) {
      steps.push(step({
        event: 'inorder',
        lineId: 'goright',
        note: `${n.label} 的右孩子 ${lab(n.right)} 是真实的 → 递归右子树：这些节点在中序里都排在 ${n.label} 之后。`,
        vars: vars(id),
        layers: [layer({
          roles: {
            focus1: [n.right], focus2: [id], done: [...order],
            pointers: [{ id: 'p', label: 'p', node: n.right }, { id: 'fa', label: '父', node: id }],
          },
        })],
      }));
      rec(n.right);
    } else {
      steps.push(step({
        event: 'inorder',
        lineId: 'goright',
        note: `${n.label} 的右链是空的 → InThread(NULL, pre) 立刻返回，这一支线索化到此结束。`,
        vars: vars(id),
        layers: [layer({ roles: { focus1: [id], done: [...order], pointers: [{ id: 'p', label: 'p', node: id }] } })],
      }));
    }
  };

  if (t.root) rec(t.root);

  if (t.root) {
    const pn = t.map.get(pre);
    if (!pn.right) pn.rtag = 1;
    steps.push(step({
      event: 'inorder',
      lineId: 'tail',
      note: pn.right
        ? `收尾：pre = ${pn.label} 还有真实右孩子 ${lab(pn.right)}，它不是末节点，rtag 保持 0。`
        : `收尾：pre = ${pn.label} 是中序最后一个节点，后继不存在 → rtag 置 1，右线索为 NULL（末节点的空线索）。`,
      vars: vars(pre),
      layers: [layer({ roles: { done: [...order], pointers: [{ id: 'pre', label: 'pre', node: pre }] } })],
    }));

    let p = firstInThread(t);
    steps.push(step({
      event: 'visit-thread',
      lineId: 'walk',
      note: `中场检验：First(T) 从根 ${lab(t.root)} 一路走真实左孩子（ltag==0 才走），第一个 ltag==1 的节点就是中序首节点 ${lab(p)}。下面只用线索走完整棵树，一个栈帧都不用。`,
      vars: vars(p),
      layers: [layer({ roles: { focus1: [p], done: [...order], pointers: [{ id: 'p', label: 'p', node: p }] } })],
    }));

    let k = 0;
    while (p) {
      const n = t.map.get(p);
      k++;
      n.seq = k;
      const nx = nextInThread(t, p);
      steps.push(step({
        event: 'visit-thread',
        lineId: 'walk',
        note: nx
          ? `顺线索访问 ${n.label}（第 ${k} 个）。Next 的判定：${n.rtag === 1
            ? `rtag==1 → 右链就是后继线索，直接跳到 ${lab(nx)}`
            : `rtag==0 → 右链是真实孩子 ${lab(n.right)}，其后继是这棵子树里最左的节点 ${lab(nx)}`}。`
          : `顺线索访问 ${n.label}（第 ${k} 个）：rtag==1 且右线索为 NULL → 没有后继，线性遍历到此结束。`,
        vars: { ...vars(p), 访问: k },
        layers: [layer({ roles: { focus1: [p], done: [...order], pointers: [{ id: 'p', label: 'p', node: p }] } })],
      }));
      p = nx;
    }
  }

  const result = { order: order.map(lab), prev: pick('prev'), next: pick('next'), tags: tagsOf() };

  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: t.root
      ? `中序线索化完成：次序 ${result.order.join(' → ')}；线索共 ${count()} 条（${Object.entries(result.prev).map(([a, b]) => `${a}←${b}`).join('，') || '无前驱线索'}；${Object.entries(result.next).map(([a, b]) => `${a}→${b}`).join('，') || '无后继线索'}）。首节点左线索、末节点右线索都为空，这是线索树唯一的两个"边界空链"。`
      : '空树线索化完成：没有任何节点，也就没有任何线索。',
    vars: vars(pre),
    layers: [layer({ roles: { done: [...order] } })],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v1',
    sourceVersion: 'tbt-inorder-recursive-v1',
    lines: L,
    steps,
    result,
    meta: { threads: count() },
  });
}

/* ------------------------------------------------------------------ 变体 2：中序线索化（迭代） */

function runV2(input) {
  const t = buildTree(input);
  const L = LINES.v2;
  const steps = [];
  const order = [];
  const S = [];      // 显式栈：栈底 → 栈顶
  let pre = null;
  const { lab, layer, count, tagsOf, pick } = layerFactory(t, 'BiThrTree · 中序线索化（迭代 + 显式栈）');

  const stackOf = (focusNode) => stackLayer({
    id: 'S',
    title: '栈 S',
    name: 'SqStack S（栈底 → 栈顶：还没处理完的祖先）',
    cells: S.map((id, i) => ({ value: lab(id), label: `S[${i}]` })),
    top: S.length ? S.length - 1 : null,
    capacity: Math.max(4, t.ids.length),
    roles: {
      focus1: focusNode != null && S.includes(focusNode) ? [S.indexOf(focusNode)] : [],
      pointers: S.length ? [{ id: 'top', label: 'top', index: S.length - 1 }] : [],
    },
  });

  const vars = (cur) => ({
    节点数: t.ids.length,
    p: cur ? lab(cur) : 'NULL',
    pre: pre ? lab(pre) : 'NULL',
    栈深: S.length,
    线索数: count(),
    次序: order.length ? order.map(lab).join(' → ') : '（空）',
  });

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: t.root
      ? '和递归版的差别只在"回退靠什么"：这里把祖先显式压进 S，弹栈的那一刻才处理节点、才建线索。线索次序不变，仍是中序 B→D→A→C。'
      : '空树：p == NULL 且 S 为空，while 条件一开始就不成立，一条线索也不会建。',
    vars: vars(t.root),
    layers: [
      layer({ roles: t.root ? { focus1: [t.root], pointers: [{ id: 'p', label: 'p', node: t.root }] } : {} }),
      stackOf(null),
    ],
  }));

  if (!t.root) {
    steps.push(step({
      event: 'inorder',
      lineId: 'loop',
      note: 'p == NULL 且栈空 → while 一次都不进；收尾时 pre 仍是 NULL，没有末节点需要收尾。',
      vars: vars(null),
      layers: [layer(), stackOf(null)],
    }));
  } else {
    let p = t.root;
    while (p || S.length) {
      if (p) {
        S.push(p);
        steps.push(step({
          event: 'inorder',
          lineId: 'descend',
          note: `${lab(p)} 入栈（它自己还没处理，先把家记住），p 转到左孩子 ${lab(t.map.get(p).left)}：中序要一路压到最左。`,
          vars: vars(p),
          layers: [
            layer({ roles: { focus1: [p], pointers: [{ id: 'p', label: 'p', node: p }] } }),
            stackOf(p),
          ],
        }));
        p = t.map.get(p).left;
      } else {
        p = S.pop();
        const n = t.map.get(p);
        steps.push(step({
          event: 'inorder',
          lineId: 'pop',
          note: `左链到底，弹栈 p = ${n.label}：它的左子树已经处理完（或本来就没有），现在它是"最左的未处理节点"。`,
          vars: vars(p),
          layers: [layer({ roles: { focus1: [p], pointers: [{ id: 'p', label: 'p', node: p }] } }), stackOf(null)],
        }));

        if (!n.left) {
          n.ltag = 1;
          n.prev = pre;
          steps.push(step({
            event: 'set-pre-thread',
            lineId: 'lthread',
            note: pre
              ? `${n.label} 的左链空着 → 指向前驱 ${lab(pre)}（橙色虚线），ltag 置 1。`
              : `${n.label} 是中序首节点，前驱不存在 → 左线索为 NULL，ltag 置 1（首节点的空线索）。`,
            vars: vars(p),
            layers: [layer({
              roles: {
                focus1: [p],
                ...(pre ? { focus2: [pre], pointers: [{ id: 'pre', label: 'pre', node: pre }, { id: 'p', label: 'p', node: p }] } : { pointers: [{ id: 'p', label: 'p', node: p }] }),
              },
            }), stackOf(null)],
          }));
        } else {
          steps.push(step({
            event: 'inorder',
            lineId: 'lthread',
            note: `${n.label} 的左链是真实孩子 ${lab(n.left)} → 不能改成线索，ltag 保持 0。`,
            vars: vars(p),
            layers: [layer({
              roles: { focus1: [p], focus2: [n.left], pointers: [{ id: 'p', label: 'p', node: p }] },
            }), stackOf(null)],
          }));
        }

        const pn = pre ? t.map.get(pre) : null;
        if (pn && !pn.right) {
          pn.rtag = 1;
          pn.next = p;
          steps.push(step({
            event: 'set-next-thread',
            lineId: 'rthread',
            note: `pre = ${pn.label} 的右链还空着 → 回填成指向 ${n.label} 的后继线索（绿色虚线），rtag 置 1。`,
            vars: vars(p),
            layers: [layer({
              roles: {
                focus1: [pn.id], focus2: [p],
                pointers: [{ id: 'pre', label: 'pre', node: pn.id }, { id: 'p', label: 'p', node: p }],
              },
            }), stackOf(null)],
          }));
        } else {
          steps.push(step({
            event: 'inorder',
            lineId: 'rthread',
            note: pn
              ? `${pn.label} 有真实右孩子 ${lab(pn.right)} → 右链要留给孩子，不做后继线索，跳过回填。`
              : 'pre 还是 NULL（当前是首节点）→ 没有前驱可以回填后继。',
            vars: vars(p),
            layers: [layer({ roles: { focus1: [p], pointers: [{ id: 'p', label: 'p', node: p }] } }), stackOf(null)],
          }));
        }

        pre = p;
        order.push(p);
        steps.push(step({
          event: 'inorder',
          lineId: 'preupd',
          note: `pre = ${n.label}（中序第 ${order.length} 个），栈里还剩 ${S.length} 个祖先等着被回填后继。`,
          vars: vars(p),
          layers: [layer({
            roles: { focus1: [p], done: [...order], pointers: [{ id: 'pre', label: 'pre', node: p }] },
          }), stackOf(null)],
        }));

        const r = n.right;
        p = r;
        steps.push(step({
          event: 'inorder',
          lineId: 'goright',
          note: r
            ? `p 转向右孩子 ${lab(r)}：下一轮继续压它的左链，右子树的节点在中序里排在 ${n.label} 之后。`
            : `${n.label} 没有右孩子 → p 变 NULL，下一轮直接继续弹栈（继续向更上层回退）。`,
          vars: vars(r),
          layers: [layer({
            roles: r
              ? { focus1: [r], done: [...order], pointers: [{ id: 'p', label: 'p', node: r }] }
              : { focus1: [p], done: [...order], pointers: [{ id: 'p', label: 'p', node: p }] },
          }), stackOf(null)],
        }));
      }
    }

    const tailNode = pre ? t.map.get(pre) : null;
    if (tailNode && !tailNode.right) tailNode.rtag = 1;
    steps.push(step({
      event: 'inorder',
      lineId: 'tail',
      note: `p == NULL 且 S 为空 → while 结束。收尾：pre = ${lab(pre)}${tailNode && tailNode.right ? ' 还有真实右孩子，rtag 保持 0。' : ' 是末节点，rtag 置 1，右线索为 NULL。'}`,
      vars: vars(null),
      layers: [layer({ roles: { done: [...order] } }), stackOf(null)],
    }));
  }

  const result = { order: order.map(lab), prev: pick('prev'), next: pick('next'), tags: tagsOf() };

  if (t.root) {
    let p = firstInThread(t);
    steps.push(step({
      event: 'visit-thread',
      lineId: 'walk',
      note: `验证阶段：First(T) 一路走真实左孩子，停在 ${lab(p)}。从这里开始只顺线索走，栈 S 已经彻底为空。`,
      vars: vars(p),
      layers: [layer({ roles: { focus1: [p], done: [...order], pointers: [{ id: 'p', label: 'p', node: p }] } }), stackOf(null)],
    }));
    let k = 0;
    while (p) {
      const n = t.map.get(p);
      k++;
      n.seq = k;
      const nx = nextInThread(t, p);
      steps.push(step({
        event: 'visit-thread',
        lineId: 'walk',
        note: nx
          ? `顺线索访问 ${n.label}（第 ${k} 个）：${n.rtag === 1 ? `rtag==1，顺着右线索到 ${lab(nx)}` : `rtag==0，从右孩子 ${lab(n.right)} 子树取最左节点 ${lab(nx)}`}。`
          : `顺线索访问 ${n.label}（第 ${k} 个）：右线索为 NULL，遍历结束 —— 全程没有用过栈。`,
        vars: { ...vars(p), 访问: k },
        layers: [layer({ roles: { focus1: [p], done: [...order], pointers: [{ id: 'p', label: 'p', node: p }] } }), stackOf(null)],
      }));
      p = nx;
    }
  }

  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: t.root
      ? `迭代线索化完成：次序 ${result.order.join(' → ')}，线索 ${count()} 条。与递归版结果一字不差，但回退依据从"调用栈"换成了显式栈 S，可见代价是 O(h) 的额外空间。`
      : '空树线索化完成：没有节点，也没有线索。',
    vars: vars(null),
    layers: [layer({ roles: { done: [...order] } }), stackOf(null)],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v2',
    sourceVersion: 'tbt-inorder-iterative-v1',
    lines: L,
    steps,
    result,
    meta: { threads: count() },
  });
}

/* ------------------------------------------------------------------ 变体 3：前序线索化 */

function runV3(input) {
  const t = buildTree(input);
  const L = LINES.v3;
  const steps = [];
  const order = [];  // 前序（线索化）次序
  let pre = null;
  const { lab, layer, count, tagsOf, pick } = layerFactory(t, 'BiThrTree · 前序线索化（线索次序与 v1/v2 不同）');

  const vars = (cur) => ({
    节点数: t.ids.length,
    当前: cur ? lab(cur) : '—',
    pre: pre ? lab(pre) : 'NULL',
    线索数: count(),
    次序: order.length ? order.map(lab).join(' → ') : '（空）',
    线索次序: '前序（根 → 左 → 右）',
  });

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: t.root
      ? '换成前序线索：一进节点就先定"它的前驱"，于是前驱/后继按 A→B→D→C 配对，和中序版的 B→D→A→C 完全不同 —— 线索次序决定了遍历规则。'
      : '空树：PreThread(NULL, pre) 立刻返回，没有线索要建。',
    vars: vars(t.root),
    layers: [layer({ roles: t.root ? { focus1: [t.root], pointers: [{ id: 'p', label: 'p', node: t.root }] } : {} })],
  }));

  if (!t.root) {
    steps.push(step({
      event: 'inorder',
      lineId: 'guard',
      note: 'p == NULL 直接 return：没有空链可以改写成线索。',
      vars: vars(null),
      layers: [layer()],
    }));
  }

  const rec = (id) => {
    const n = t.map.get(id);
    order.push(id);
    steps.push(step({
      event: 'inorder',
      lineId: 'guard',
      note: `${n.label} 非空。前序是"先根"，所以一进门就先给 ${n.label} 定前驱（第 ${order.length} 个线索化）。`,
      vars: vars(id),
      layers: [layer({ roles: { focus1: [id], done: [...order], pointers: [{ id: 'p', label: 'p', node: id }] } })],
    }));

    if (!n.left) {
      n.ltag = 1;
      n.prev = pre;
      steps.push(step({
        event: 'set-pre-thread',
        lineId: 'lthread',
        note: pre
          ? `${n.label} 的左链空着 → 指向前驱 ${lab(pre)}（前序里的上一个节点，橙色虚线），ltag 置 1。`
          : `${n.label} 是前序首节点（就是根），前驱不存在 → 左线索为 NULL，ltag 置 1。`,
        vars: vars(id),
        layers: [layer({
          roles: {
            focus1: [id],
            ...(pre ? { focus2: [pre], pointers: [{ id: 'pre', label: 'pre', node: pre }, { id: 'p', label: 'p', node: id }] } : { pointers: [{ id: 'p', label: 'p', node: id }] }),
          },
        })],
      }));
    } else {
      steps.push(step({
        event: 'inorder',
        lineId: 'lthread',
        note: `${n.label} 的左链是真实孩子 ${lab(n.left)} → 留给它，ltag 保持 0。前序线索化里这个 0 还兼任"能不能往左走"的开关。`,
        vars: vars(id),
        layers: [layer({ roles: { focus1: [id], focus2: [n.left], pointers: [{ id: 'p', label: 'p', node: id }] } })],
      }));
    }

    const pn = pre ? t.map.get(pre) : null;
    if (pn && !pn.right) {
      pn.rtag = 1;
      pn.next = id;
      steps.push(step({
        event: 'set-next-thread',
        lineId: 'rthread',
        note: `前驱 ${pn.label} 的右链空着 → 回填成指向 ${n.label} 的后继线索（绿色虚线），rtag 置 1。前序里"后继"往往是自己的左孩子，这里正好轮空。`,
        vars: vars(id),
        layers: [layer({
          roles: {
            focus1: [pn.id], focus2: [id],
            pointers: [{ id: 'pre', label: 'pre', node: pn.id }, { id: 'p', label: 'p', node: id }],
          },
        })],
      }));
    } else {
      steps.push(step({
        event: 'inorder',
        lineId: 'rthread',
        note: pn
          ? `${pn.label} 有真实右孩子 ${lab(pn.right)} → 右链留给它，跳过回填（前序的后继此时正好是别的分支，不冲突）。`
          : 'pre 还是 NULL（当前是前序首节点）→ 没有前驱可以回填后继。',
        vars: vars(id),
        layers: [layer({ roles: { focus1: [id], pointers: [{ id: 'p', label: 'p', node: id }] } })],
      }));
    }

    pre = id;
    steps.push(step({
      event: 'inorder',
      lineId: 'preupd',
      note: `pre = ${n.label}。注意此时 ltag 已经可能是 1 —— 下面的左递归必须靠 ltag 判断，不能只看指针是否为空。`,
      vars: vars(id),
      layers: [layer({ roles: { focus1: [id], done: [...order], pointers: [{ id: 'pre', label: 'pre', node: id }] } })],
    }));

    if (n.ltag === 0 && n.left) {
      steps.push(step({
        event: 'inorder',
        lineId: 'goleft',
        note: `${n.label} 的 ltag==0 → 左链是真实孩子 ${lab(n.left)}，前序继续往左。`,
        vars: vars(id),
        layers: [layer({
          roles: {
            focus1: [n.left], focus2: [id], done: [...order],
            pointers: [{ id: 'p', label: 'p', node: n.left }, { id: 'fa', label: '父', node: id }],
          },
        })],
      }));
      rec(n.left);
    } else {
      steps.push(step({
        event: 'inorder',
        lineId: 'goleft',
        note: `${n.label} 的 ltag==1 → 左链已经是线索，再往左就顺着线索绕圈了，所以跳过左递归。`,
        vars: vars(id),
        layers: [layer({ roles: { focus1: [id], done: [...order], pointers: [{ id: 'p', label: 'p', node: id }] } })],
      }));
    }

    if (n.rtag === 0 && n.right) {
      rec(n.right);
    } else {
      steps.push(step({
        event: 'inorder',
        lineId: 'goright',
        note: n.rtag === 1
          ? `${n.label} 的 rtag==1 → 右链是后继线索，不是子树，右递归跳过。`
          : `${n.label} 没有右孩子 → PreThread(NULL, pre) 立刻返回，这一支结束。`,
        vars: vars(id),
        layers: [layer({ roles: { focus1: [id], done: [...order], pointers: [{ id: 'p', label: 'p', node: id }] } })],
      }));
    }
  };

  if (t.root) rec(t.root);

  if (t.root) {
    if (!t.map.get(pre).right) t.map.get(pre).rtag = 1;
    steps.push(step({
      event: 'inorder',
      lineId: 'tail',
      note: `收尾：pre = ${lab(pre)} 是前序最后一个节点，右线索为 NULL，rtag 置 1。`,
      vars: vars(pre),
      layers: [layer({ roles: { done: [...order], pointers: [{ id: 'pre', label: 'pre', node: pre }] } })],
    }));

    let p = t.root;
    let k = 0;
    steps.push(step({
      event: 'visit-thread',
      lineId: 'walk',
      note: '前序线索树的遍历规则和中序版不同：ltag==0 说明"有真实左孩子"，往左走；ltag==1 说明左链是线索，只能往右走。起点永远是根。',
      vars: vars(p),
      layers: [layer({ roles: { focus1: [p], done: [...order], pointers: [{ id: 'p', label: 'p', node: p }] } })],
    }));
    while (p) {
      const n = t.map.get(p);
      k++;
      n.seq = k;
      const nx = nextPre(t, p);
      steps.push(step({
        event: 'visit-thread',
        lineId: 'walk',
        note: nx
          ? `顺线索访问 ${n.label}（第 ${k} 个）：${n.ltag === 0 && n.left
            ? `ltag==0 → 先进左孩子 ${lab(nx)}`
            : `ltag==1 → 左链是线索，改走右链到 ${lab(nx)}${n.rtag === 1 ? '（右线索）' : '（右孩子）'}`}。`
          : `顺线索访问 ${n.label}（第 ${k} 个）：ltag==1 且右侧也为空 → 遍历结束。`,
        vars: { ...vars(p), 访问: k },
        layers: [layer({ roles: { focus1: [p], done: [...order], pointers: [{ id: 'p', label: 'p', node: p }] } })],
      }));
      p = nx;
    }
  }

  const result = { order: order.map(lab), prev: pick('prev'), next: pick('next'), tags: tagsOf() };

  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: t.root
      ? `前序线索化完成：次序 ${result.order.join(' → ')}，线索 ${count()} 条。与中序版对照看：节点集合一样，ltag/rtag 的分布和线索对全变了 —— 所以线索树是"配一种遍历次序"的，不能通用。`
      : '空树线索化完成：没有节点，也没有线索。',
    vars: vars(null),
    layers: [layer({ roles: { done: [...order] } })],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v3',
    sourceVersion: 'tbt-preorder-v1',
    lines: L,
    steps,
    result,
    meta: { threads: count() },
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
