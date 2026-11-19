/**
 * D · 平衡二叉树（AVL）—— 3 个代表性且彼此不同的实现变体
 *
 *   v1 递归高度 + 四类旋转：插入用递归，回溯时现算高度（不存高度字段），
 *      |bf| = 2 时按"新键落在失衡点的哪一侧 / 再下一层哪一侧"分 LL/RR/LR/RL 四支；
 *   v2 平衡因子 + parent 指针：节点存 h 与 bf（左高-右高），先自上而下找位置挂节点，
 *      再从父亲沿 parent 指针向上重算 bf，遇到 |bf| = 2 就地旋转（旋转后高度复原，修复即止）；
 *   v3 统一旋转（单/双）：把孩子位置压栈做迭代回溯，只用一个 rot(node, 方向) 原语，
 *      按 bf 的符号选方向，双旋转拆成两次单旋转（中间那一步的真形状要看得见）。
 *
 * 画面约定（style 9 treeLayer）：
 *   · 节点 id 稳定 = 'n<key>'，每一步都重建 nodes 数组，便于补间动画；
 *   · label = 键；value = h=<高度>；badge = bf=<平衡因子（带符号）>；
 *   · roles 用节点 id（focus1 = 当前回溯点 / 失衡点，focus2 = 参与旋转的孩子），
 *     pointers 用来标 t / z / g 这些"指针名"，颜色只是辅助。
 */

import { trace, step, treeLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'd/avl-tree',
  variants: [
    { id: 'v1', name: '递归高度 + 四类旋转', note: '回溯时现算高度，按失衡方向分 LL/RR/LR/RL 四种情形旋转' },
    { id: 'v2', name: '平衡因子 + parent 指针', note: '节点存 bf（左高-右高），自上而下调整并沿 parent 向上修复' },
    { id: 'v3', name: '统一旋转（单/双）', note: '用"三次单旋转"的统一写法实现双旋转，展示与四类分支法的等价性' },
  ],
};

const LINES = {
  /* v1：递归 + 回溯现算高度 */
  v1: [
    { lineId: 'fn', text: 'AVLNode *avl_insert(AVLNode *t, int key) {' },
    { lineId: 'nil', text: '  if (t == NULL) return new_node(key);        /* 空位：新叶子 */' },
    { lineId: 'cmp-l', text: '  if (key < t->key) t->l = avl_insert(t->l, key);' },
    { lineId: 'cmp-r', text: '  else if (key > t->key) t->r = avl_insert(t->r, key);' },
    { lineId: 'dup', text: '  else return t;                             /* 集合语义：重复键不插 */' },
    { lineId: 'h', text: '  t->h = 1 + max(height(t->l), height(t->r));  /* 回溯：现算高度，不存字段 */' },
    { lineId: 'bf', text: '  int bf = height(t->l) - height(t->r);       /* 左高 - 右高 */' },
    { lineId: 'll', text: '  if (bf == 2 && key < t->l->key) return rotate_right(t);      /* LL */' },
    { lineId: 'lr', text: '  if (bf == 2) { t->l = rotate_left(t->l); return rotate_right(t); } /* LR */' },
    { lineId: 'rr', text: '  if (bf == -2 && key > t->r->key) return rotate_left(t);      /* RR */' },
    { lineId: 'rl', text: '  if (bf == -2) { t->r = rotate_right(t->r); return rotate_left(t); } /* RL */' },
    { lineId: 'ret', text: '  return t;' },
    { lineId: 'end', text: '}' },
  ],
  /* v2：存 bf + parent 指针，向上修复 */
  v2: [
    { lineId: 'fn', text: 'void avl_insert(AVLTree *T, int key) {' },
    { lineId: 'new', text: '  AVLNode *z = new_node(key);                 /* h = 1, bf = 0 */' },
    { lineId: 'seek', text: '  AVLNode *p = NULL, *x = T->root;            /* 自上而下找位置 */' },
    { lineId: 'cmp', text: '  while (x) { p = x; x = (key < x->key) ? x->l : (key > x->key ? x->r : NULL); }' },
    { lineId: 'link', text: '  z->parent = p;  p == NULL ? (T->root = z) : (key < p->key ? p->l : p->r) = z;' },
    { lineId: 'bf-up', text: '  for (AVLNode *g = p; g; g = g->parent) { g->h = 1 + max(h(g->l), h(g->r)); g->bf = h(g->l) - h(g->r);' },
    { lineId: 'unbalanced', text: '    if (g->bf > 1 || g->bf < -1) {           /* 沿 parent 上溯发现失衡 */' },
    { lineId: 'll', text: '      if (g->bf > 1 && g->l->bf >= 0) rotate_right(T, g);              /* LL */' },
    { lineId: 'lr', text: '      else if (g->bf > 1) { rotate_left(T, g->l); rotate_right(T, g); } /* LR */' },
    { lineId: 'rr', text: '      else if (g->r->bf <= 0) rotate_left(T, g);                       /* RR */' },
    { lineId: 'rl', text: '      else { rotate_right(T, g->r); rotate_left(T, g); }               /* RL */' },
    { lineId: 'fixup', text: '      break;                                 /* 旋转后子树高度复原，祖先 bf 不变 */' },
    { lineId: 'stop', text: '    } else if (g->bf == 0) break;            /* 高度没长高，不用继续上溯 */' },
    { lineId: 'end', text: '  }' },
  ],
  /* v3：路径压栈 + 统一旋转原语（双旋 = 两次单旋） */
  v3: [
    { lineId: 'fn', text: 'void avl_insert(AVLTree *T, int key) {' },
    { lineId: 'seek', text: '  AVLNode *path[MAXH]; int top = 0; AVLNode *x = T->root;' },
    { lineId: 'walk', text: '  while (x) { path[top++] = x; x = (key < x->key) ? x->l : (key > x->key ? x->r : NULL); }' },
    { lineId: 'leaf', text: '  AVLNode *z = new_node(key); attach(T, path[top - 1], key, z);' },
    { lineId: 'unw', text: '  for (int i = top - 1; i >= 0; --i) path[i] = fix(path[i]);   /* 回溯 */' },
    { lineId: 'fnend', text: '}' },
    { lineId: 'ffn', text: 'AVLNode *fix(AVLNode *t) {                  /* 统一旋转：只判断 bf 的正负 */' },
    { lineId: 'fupd', text: '  t->h = 1 + max(h(t->l), h(t->r));  int b = h(t->l) - h(t->r);' },
    { lineId: 'fbf', text: '  if (b > 1) {                            /* 左重：单旋 or 双旋 */' },
    { lineId: 'fL1', text: '    if (bf(t->l) >= 0) return rot(t, R); /* LL：一次单旋 */' },
    { lineId: 'fL2', text: '    t->l = rot(t->l, L);                /* 双旋第一刀：孩子先转 */' },
    { lineId: 'fL3', text: '    return rot(t, R);                   /* 双旋第二刀 → 等价 LR */' },
    { lineId: 'fR', text: '  } else if (b < -1) {                    /* 右重 */' },
    { lineId: 'fR1', text: '    if (bf(t->r) <= 0) return rot(t, L); /* RR：一次单旋 */' },
    { lineId: 'fR2', text: '    t->r = rot(t->r, R);                /* 双旋第一刀 */' },
    { lineId: 'fR3', text: '    return rot(t, L);                   /* 双旋第二刀 → 等价 RL */' },
    { lineId: 'fret', text: '  }' },
    { lineId: 'fend', text: '  return t;' },
    { lineId: 'fclose', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal-ll',
    label: '[3,2,1]（LL：右单旋转，根变 2）',
    input: { keys: [3, 2, 1] },
    expect: { root: 2, inorder: [1, 2, 3], height: 2 },
  },
  {
    id: 'normal-rr',
    label: '[1,2,3]（RR：左单旋转，根变 2）',
    input: { keys: [1, 2, 3] },
    expect: { root: 2, inorder: [1, 2, 3], height: 2 },
  },
  {
    id: 'normal-lr',
    label: '[3,1,2]（LR：先左旋孩子再右旋，根变 2）',
    input: { keys: [3, 1, 2] },
    expect: { root: 2, inorder: [1, 2, 3], height: 2 },
  },
  {
    id: 'normal-rl',
    label: '[1,3,2]（RL：先右旋孩子再左旋，根变 2）',
    input: { keys: [1, 3, 2] },
    expect: { root: 2, inorder: [1, 2, 3], height: 2 },
  },
  {
    id: 'normal-mixed',
    label: '[10,20,30,40,25,50]（连续失衡：RR 两次 + LL 一次）',
    input: { keys: [10, 20, 30, 40, 25, 50] },
    expect: { root: 30, inorder: [10, 20, 25, 30, 40, 50], height: 3 },
  },
  {
    id: 'edge-single',
    label: '[5]（单键：根就是叶子，不旋转）',
    input: { keys: [5] },
    expect: { root: 5, inorder: [5], height: 1 },
  },
  {
    id: 'edge-empty',
    label: '[]（空树：没有键可插）',
    input: { keys: [] },
    expect: { root: null, inorder: [], height: 0 },
  },
];

/* ------------------------------------------------------------------ 公共小工具 */

const nodeId = (key) => `n${key}`;
const signed = (b) => (b > 0 ? `+${b}` : String(b));

function inorderOf(root) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    walk(n.l);
    out.push(n.key);
    walk(n.r);
  };
  walk(root);
  return out;
}

function treeHeight(root) {
  return root ? 1 + Math.max(treeHeight(root.l), treeHeight(root.r)) : 0;
}

function idsOf(root) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    out.push(n.id);
    walk(n.l);
    walk(n.r);
  };
  walk(root);
  return out;
}

const ptr = (n, label) => (n ? { id: label, label, node: n.id } : null);
const ptrs = (...list) => list.filter(Boolean);

/**
 * 完整快照：每步都重新走一遍树，重建 nodes / edgeTags（绝不复用上一步的数组）。
 * heightOf / bfOf 由各变体自己给（v1 现算、v2 读字段、v3 读字段），画面因此不同。
 */
function avlLayer(root, { heightOf, bfOf, roles = {} }) {
  const nodes = [];
  const edgeTags = {};
  const walk = (n, parentId) => {
    if (!n) return;
    nodes.push({
      id: n.id,
      label: String(n.key),
      value: `h=${heightOf(n)}`,
      badge: `bf=${signed(bfOf(n))}`,
      left: n.l ? n.l.id : null,
      right: n.r ? n.r.id : null,
      parent: parentId,
    });
    if (n.l) {
      edgeTags[n.l.id] = 'L';
      walk(n.l, n.id);
    }
    if (n.r) {
      edgeTags[n.r.id] = 'R';
      walk(n.r, n.id);
    }
  };
  walk(root, null);
  return [treeLayer({
    id: 'tree',
    title: 'AVL',
    name: 'AVL 树：value = 高度 h，badge = 平衡因子 bf（左高-右高）',
    nodes,
    roots: root ? [root.id] : [],
    edgeTags,
    roles,
  })];
}

/* ------------------------------------------------------------------ 变体 1 */

function runV1(input) {
  const src = (input.keys || []).map(Number);
  const labels = labelsOf(src);
  const L = LINES.v1;
  const steps = [];
  let root = null;
  const H = (n) => (n ? 1 + Math.max(H(n.l), H(n.r)) : 0);
  const BF = (n) => (n ? H(n.l) - H(n.r) : 0);
  const snap = (roles) => avlLayer(root, { heightOf: H, bfOf: BF, roles });
  const mk = (key) => ({ key, id: nodeId(key), l: null, r: null });
  const rotR = (t) => {
    const x = t.l;
    t.l = x.r;
    x.r = t;
    return x;
  };
  const rotL = (t) => {
    const x = t.r;
    t.r = x.l;
    x.l = t;
    return x;
  };
  const slotOf = (obj, side) => ({ get: () => obj[side], set: (v) => { obj[side] = v; } });
  const vars = (o) => ({ 序列: labels.join(',') || '∅', ...o });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: src.length === 0
      ? '空树：没有键需要插入，直接把 NULL 交回去。'
      : `插入序列 [${labels.join(', ')}]。递归往下找空位，回来时用 height() 现算高度（节点不存高度字段），发现 |bf| = 2 就按"新键走的是左左 / 右右 / 左右 / 右左"分四类旋转。`,
    vars: vars({ key: null, h: 0, bf: 0, 情形: '—' }),
    layers: snap({}),
  }));

  const insert = (slot, key) => {
    const t = slot.get();
    if (!t) {
      const n = mk(key);
      slot.set(n);
      steps.push(step({
        event: 'insert-node', lineId: 'nil',
        note: `递归走到空位：新建叶子 ${key}，高度为 1、bf 为 0，先挂在这里，回溯时再检查祖先是否失衡。`,
        vars: vars({ key, h: 1, bf: 0, 情形: '—' }),
        layers: snap({ added: [n.id], pointers: ptrs(ptr(n, 'new')) }),
      }));
      return n;
    }
    const goLeft = key < t.key;
    const cmp = key === t.key ? 'dup' : goLeft ? 'cmp-l' : 'cmp-r';
    steps.push(step({
      event: 'descend', lineId: cmp,
      note: key === t.key
        ? `key = ${key} 与节点 ${t.key} 相等：集合语义下忽略重复键，直接返回这棵子树。`
        : `key = ${key} ${goLeft ? '<' : '>'} ${t.key}：递归进${goLeft ? '左' : '右'}子树，这里先记住方向，回溯时用来判 LL/LR。`,
      vars: vars({ key, h: H(t), bf: BF(t), 情形: '—' }),
      layers: snap({ focus1: [t.id], pointers: ptrs(ptr(t, 't')) }),
    }));
    if (key === t.key) return t;

    insert(slotOf(t, goLeft ? 'l' : 'r'), key);

    const h = H(t);
    const bf = BF(t);
    steps.push(step({
      event: 'update-height', lineId: 'h',
      note: `孩子那支回来了：${t.key} 的高度现算 = 1 + max(${H(t.l)}, ${H(t.r)}) = ${h}，bf = ${signed(bf)}。${Math.abs(bf) === 2 ? '已经失衡，下一行判类型。' : '还没失衡，继续往上传。'}`,
      vars: vars({ key, h, bf, 情形: '—' }),
      layers: snap({ focus1: [t.id], pointers: ptrs(ptr(t, 't')) }),
    }));

    if (bf === 2) {
      const c = t.l;
      const leftLeft = key < c.key;
      steps.push(step({
        event: 'unbalanced', lineId: 'bf',
        note: `${t.key} 的左子树比右子树高 2（bf = +2）：失衡点就是 ${t.key}。新键 ${key} 落在左孩子 ${c.key} 的${leftLeft ? '左' : '右'}侧 → ${leftLeft ? 'LL（左左）' : 'LR（左右）'}。`,
        vars: vars({ key, h, bf, 情形: leftLeft ? 'LL' : 'LR' }),
        layers: snap({ focus1: [t.id], focus2: [c.id], pointers: ptrs(ptr(t, 'g'), ptr(c, 'p')) }),
      }));
      if (leftLeft) {
        const nt = rotR(t);
        slot.set(nt);
        steps.push(step({
          event: 'rotate-ll', lineId: 'll',
          note: `LL 用一次右旋解决：左孩子 ${c.key} 升为子树根，${t.key} 变成它的右孩子，${t.key} 的右子树补到 ${c.key} 的右位；两侧高度差回到 1。`,
          vars: vars({ key, h: H(nt), bf: BF(nt), 情形: 'LL' }),
          layers: snap({ focus1: [nt.id], focus2: [t.id], swap: [nt.id, t.id], pointers: ptrs(ptr(nt, 'up'), ptr(t, 'down')) }),
        }));
      } else {
        t.l = rotL(c);
        const nt = rotR(t);
        slot.set(nt);
        steps.push(step({
          event: 'rotate-lr', lineId: 'lr',
          note: `LR 是"先左后右"两次旋转：先对左孩子 ${c.key} 左旋，把新键 ${key} 顶到左孩子位置，再对 ${t.key} 右旋，${nt.key} 成为子树根，${c.key} 与 ${t.key} 分居左右。`,
          vars: vars({ key, h: H(nt), bf: BF(nt), 情形: 'LR' }),
          layers: snap({ focus1: [nt.id], focus2: [t.id], swap: [nt.id, t.id], pointers: ptrs(ptr(nt, 'up'), ptr(t, 'down')) }),
        }));
      }
      return slot.get();
    }

    if (bf === -2) {
      const c = t.r;
      const rightRight = key > c.key;
      steps.push(step({
        event: 'unbalanced', lineId: 'bf',
        note: `${t.key} 的右子树比左子树高 2（bf = -2）：新键 ${key} 落在右孩子 ${c.key} 的${rightRight ? '右' : '左'}侧 → ${rightRight ? 'RR（右右）' : 'RL（右左）'}。`,
        vars: vars({ key, h, bf, 情形: rightRight ? 'RR' : 'RL' }),
        layers: snap({ focus1: [t.id], focus2: [c.id], pointers: ptrs(ptr(t, 'g'), ptr(c, 'p')) }),
      }));
      if (rightRight) {
        const nt = rotL(t);
        slot.set(nt);
        steps.push(step({
          event: 'rotate-rr', lineId: 'rr',
          note: `RR 用一次左旋解决：右孩子 ${c.key} 升为子树根，${t.key} 变成它的左孩子。`,
          vars: vars({ key, h: H(nt), bf: BF(nt), 情形: 'RR' }),
          layers: snap({ focus1: [nt.id], focus2: [t.id], swap: [nt.id, t.id], pointers: ptrs(ptr(nt, 'up'), ptr(t, 'down')) }),
        }));
      } else {
        t.r = rotR(c);
        const nt = rotL(t);
        slot.set(nt);
        steps.push(step({
          event: 'rotate-rl', lineId: 'rl',
          note: `RL 也是两次旋转：先对右孩子 ${c.key} 右旋，再对 ${t.key} 左旋，${nt.key} 成为子树根，${t.key} 与 ${c.key} 分居左右。`,
          vars: vars({ key, h: H(nt), bf: BF(nt), 情形: 'RL' }),
          layers: snap({ focus1: [nt.id], focus2: [t.id], swap: [nt.id, t.id], pointers: ptrs(ptr(nt, 'up'), ptr(t, 'down')) }),
        }));
      }
      return slot.get();
    }

    return t;
  };

  src.forEach((key) => {
    insert({ get: () => root, set: (v) => { root = v; } }, key);
  });

  const result = { root: root ? root.key : null, inorder: inorderOf(root), height: treeHeight(root) };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: result.root == null
      ? '空树：结果仍是空树，root = NULL、height = 0。'
      : `插入完成：根为 ${result.root}，中序 ${result.inorder.join(', ')}，树高 ${result.height}。此时每个节点的 |bf| ≤ 1。`,
    vars: vars({ key: null, h: result.height, bf: root ? BF(root) : 0, 情形: '—' }),
    layers: snap({ done: idsOf(root) }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'avl-recursive-4case-v1', lines: L, steps, result, meta: { keys: src.length } });
}

/* ------------------------------------------------------------------ 变体 2 */

function runV2(input) {
  const src = (input.keys || []).map(Number);
  const labels = labelsOf(src);
  const L = LINES.v2;
  const steps = [];
  let root = null;
  const H = (n) => (n ? n.h : 0);
  const BF = (n) => (n ? n.bf : 0);
  const refresh = (n) => {
    n.h = 1 + Math.max(H(n.l), H(n.r));
    n.bf = H(n.l) - H(n.r);
  };
  const snap = (roles) => avlLayer(root, { heightOf: H, bfOf: BF, roles });
  const mk = (key) => ({ key, id: nodeId(key), l: null, r: null, parent: null, h: 1, bf: 0 });
  const vars = (o) => ({ 序列: labels.join(',') || '∅', ...o });

  const relink = (oldTop, newTop) => {
    newTop.parent = oldTop.parent;
    if (!oldTop.parent) root = newTop;
    else if (oldTop.parent.l === oldTop) oldTop.parent.l = newTop;
    else oldTop.parent.r = newTop;
  };
  const rotR = (y) => {
    const x = y.l;
    y.l = x.r;
    if (x.r) x.r.parent = y;
    relink(y, x);
    x.r = y;
    y.parent = x;
    refresh(y);
    refresh(x);
    return x;
  };
  const rotL = (y) => {
    const x = y.r;
    y.r = x.l;
    if (x.l) x.l.parent = y;
    relink(y, x);
    x.l = y;
    y.parent = x;
    refresh(y);
    refresh(x);
    return x;
  };

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: src.length === 0
      ? '空树：没有键要插入。'
      : `插入序列 [${labels.join(', ')}]。每个节点自己存 h 与 bf（左高-右高）；先自上而下找位置，再沿 parent 指针一层层向上重算 bf，谁先 |bf| = 2 就在谁身上转。`,
    vars: vars({ key: null, h: 0, bf: 0, 修复点: '—' }),
    layers: snap({}),
  }));

  src.forEach((key) => {
    if (!root) {
      root = mk(key);
      steps.push(step({
        event: 'insert-node', lineId: 'new',
        note: `空树：${key} 直接做根，h = 1、bf = 0、parent = NULL。`,
        vars: vars({ key, h: 1, bf: 0, 修复点: '—' }),
        layers: snap({ added: [root.id], pointers: ptrs(ptr(root, 'root')) }),
      }));
      return;
    }

    let p = null;
    let x = root;
    let dup = false;
    while (x) {
      p = x;
      const eq = key === x.key;
      steps.push(step({
        event: 'descend', lineId: 'cmp',
        note: eq
          ? `key = ${key} 与 ${x.key} 相等：集合语义，重复键不占新节点。`
          : `key = ${key} 与 ${x.key} 比较 → 往${key < x.key ? '左' : '右'}子树走（这一步只找位置，画面上 bf 还没变）。`,
        vars: vars({ key, h: x.h, bf: x.bf, 修复点: '—' }),
        layers: snap({ focus1: [x.id], pointers: ptrs(ptr(x, 'p'), ptr(root, 'root')) }),
      }));
      if (key < x.key) x = x.l;
      else if (key > x.key) x = x.r;
      else {
        dup = true;
        break;
      }
    }
    if (dup) return;

    const z = mk(key);
    z.parent = p;
    if (key < p.key) p.l = z;
    else p.r = z;
    steps.push(step({
      event: 'insert-node', lineId: 'link',
      note: `把 ${key} 挂到 ${p.key} 的${key < p.key ? '左' : '右'}侧，z->parent 指向 ${p.key}；接下来从 ${p.key} 沿 parent 指针向上修复。`,
      vars: vars({ key, h: 1, bf: 0, 修复点: String(p.key) }),
      layers: snap({ added: [z.id], pointers: ptrs(ptr(z, 'z'), ptr(p, 'p')) }),
    }));

    let g = p;
    let fixed = false;
    while (g && !fixed) {
      refresh(g);
      steps.push(step({
        event: 'update-height', lineId: 'bf-up',
        note: `沿 parent 上溯到 ${g.key}：h = 1 + max(${H(g.l)}, ${H(g.r)}) = ${g.h}，bf 重算为 ${signed(g.bf)}。`,
        vars: vars({ key, h: g.h, bf: g.bf, 修复点: String(g.key) }),
        layers: snap({ focus1: [g.id], pointers: ptrs(ptr(g, 'g'), ptr(z, 'z')) }),
      }));

      if (g.bf > 1 || g.bf < -1) {
        steps.push(step({
          event: 'unbalanced', lineId: 'unbalanced',
          note: `${g.key} 的 bf = ${signed(g.bf)}，超出 ±1：失衡点是 ${g.key}。类型由"失衡方向 + 该方向孩子的 bf 符号"决定，不必再看新键走哪边。`,
          vars: vars({ key, h: g.h, bf: g.bf, 修复点: String(g.key) }),
          layers: snap({ focus1: [g.id], focus2: [g.bf > 1 ? g.l.id : g.r.id], pointers: ptrs(ptr(g, 'g')) }),
        }));

        let top;
        let kind;
        if (g.bf > 1 && BF(g.l) >= 0) {
          top = rotR(g);
          kind = 'rotate-ll';
          steps.push(step({
            event: 'rotate-ll', lineId: 'll',
            note: `LL（左左）：${g.key} 左重且左孩子 ${BF(g.l) >= 0 ? '不右重' : ''}，一次右旋 —— ${top.key} 上升接住 ${g.key} 原来的 parent，${g.key} 成为它的右孩子。`,
            vars: vars({ key, h: top.h, bf: top.bf, 修复点: String(g.key) }),
            layers: snap({ focus1: [top.id], focus2: [g.id], swap: [top.id, g.id], pointers: ptrs(ptr(top, 'up'), ptr(g, 'down'), ptr(top.parent, 'par')) }),
          }));
        } else if (g.bf > 1) {
          const pivot = g.l;
          rotL(pivot);
          top = rotR(g);
          kind = 'rotate-lr';
          steps.push(step({
            event: 'rotate-lr', lineId: 'lr',
            note: `LR（左右）：左孩子 bf 为负（左孩子的右支更高），先对 ${pivot.key} 左旋再对 ${g.key} 右旋；parent 指针在两次旋转里各改一次。`,
            vars: vars({ key, h: top.h, bf: top.bf, 修复点: String(g.key) }),
            layers: snap({ focus1: [top.id], focus2: [g.id], swap: [top.id, g.id], pointers: ptrs(ptr(top, 'up'), ptr(g, 'down'), ptr(top.parent, 'par')) }),
          }));
        } else if (BF(g.r) <= 0) {
          top = rotL(g);
          kind = 'rotate-rr';
          steps.push(step({
            event: 'rotate-rr', lineId: 'rr',
            note: `RR（右右）：${g.key} 右重且右孩子不左重，一次左旋 —— ${top.key} 上升，${g.key} 成为它的左孩子。`,
            vars: vars({ key, h: top.h, bf: top.bf, 修复点: String(g.key) }),
            layers: snap({ focus1: [top.id], focus2: [g.id], swap: [top.id, g.id], pointers: ptrs(ptr(top, 'up'), ptr(g, 'down'), ptr(top.parent, 'par')) }),
          }));
        } else {
          const pivot = g.r;
          rotR(pivot);
          top = rotL(g);
          kind = 'rotate-rl';
          steps.push(step({
            event: 'rotate-rl', lineId: 'rl',
            note: `RL（右左）：右孩子 bf 为正（右孩子的左支更高），先对 ${pivot.key} 右旋再对 ${g.key} 左旋。`,
            vars: vars({ key, h: top.h, bf: top.bf, 修复点: String(g.key) }),
            layers: snap({ focus1: [top.id], focus2: [g.id], swap: [top.id, g.id], pointers: ptrs(ptr(top, 'up'), ptr(g, 'down'), ptr(top.parent, 'par')) }),
          }));
        }

        steps.push(step({
          event: 'update-height', lineId: 'fixup',
          note: `旋转后这棵子树的高度回到插入之前的值（${kind} 之后 h = ${top.h}），所以 ${top.key} 以上的 bf 不会再变，沿 parent 的修复到此结束。`,
          vars: vars({ key, h: top.h, bf: top.bf, 修复点: '已修复' }),
          layers: snap({ focus1: [top.id], pointers: ptrs(ptr(top, top.parent ? 'sub' : 'root')) }),
        }));
        fixed = true;
        break;
      }

      if (g.bf === 0) {
        steps.push(step({
          event: 'update-height', lineId: 'stop',
          note: `${g.key} 的 bf 变成 0：说明这棵子树"左右补齐了"，高度没比插入前更高，祖先的 bf 一定不变 —— 直接停止上溯。`,
          vars: vars({ key, h: g.h, bf: 0, 修复点: '停止' }),
          layers: snap({ focus1: [g.id], pointers: ptrs(ptr(g, 'g')) }),
        }));
        break;
      }

      g = g.parent;
    }
  });

  const result = { root: root ? root.key : null, inorder: inorderOf(root), height: treeHeight(root) };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: result.root == null
      ? '空树：结果仍是空树，root = NULL、height = 0。'
      : `插入完成：根为 ${result.root}，中序 ${result.inorder.join(', ')}，树高 ${result.height}；根节点 badge 上的 bf = ${root ? signed(root.bf) : 0}，落在 ±1 内。`,
    vars: vars({ key: null, h: result.height, bf: root ? root.bf : 0, 修复点: '—' }),
    layers: snap({ done: idsOf(root) }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'avl-bf-parent-v1', lines: L, steps, result, meta: { keys: src.length } });
}

/* ------------------------------------------------------------------ 变体 3 */

function runV3(input) {
  const src = (input.keys || []).map(Number);
  const labels = labelsOf(src);
  const L = LINES.v3;
  const steps = [];
  let root = null;
  const H = (n) => (n ? n.h : 0);
  const BF = (n) => (n ? H(n.l) - H(n.r) : 0);
  const upd = (n) => {
    n.h = 1 + Math.max(H(n.l), H(n.r));
  };
  const snap = (roles) => avlLayer(root, { heightOf: H, bfOf: BF, roles });
  const mk = (key) => ({ key, id: nodeId(key), l: null, r: null, h: 1 });
  /** 唯一旋转原语：dir='R' 右旋（左孩子上升），dir='L' 左旋（右孩子上升） */
  const rot = (n, dir) => {
    if (dir === 'R') {
      const x = n.l;
      n.l = x.r;
      x.r = n;
      upd(n);
      upd(x);
      return x;
    }
    const x = n.r;
    n.r = x.l;
    x.l = n;
    upd(n);
    upd(x);
    return x;
  };
  const vars = (o) => ({ 序列: labels.join(',') || '∅', ...o });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: src.length === 0
      ? '空树：路径栈为空，没有回溯可做。'
      : `插入序列 [${labels.join(', ')}]。下降时把路径压进 path[]（不递归），回溯时对每层调 fix()；fix() 里只有 rot(t, 方向) 一个原语，单旋转转一次、双旋转转两次。`,
    vars: vars({ key: null, top: 0, h: 0, bf: 0, 情形: '—' }),
    layers: snap({}),
  }));

  src.forEach((key) => {
    if (!root) {
      root = mk(key);
      steps.push(step({
        event: 'insert-node', lineId: 'leaf',
        note: `空树：${key} 直接做根（path 为空，没有父亲可挂），h = 1。`,
        vars: vars({ key, top: 0, h: 1, bf: 0, 情形: '—' }),
        layers: snap({ added: [root.id], pointers: ptrs(ptr(root, 'root')) }),
      }));
      return;
    }

    // 1) 下降：把整条路径压栈
    const path = [];
    let x = root;
    let dup = false;
    for (;;) {
      const goLeft = key < x.key;
      const eq = key === x.key;
      steps.push(step({
        event: 'descend', lineId: 'walk',
        note: eq
          ? `key = ${key} 与 ${x.key} 相等：集合语义，只压栈不插入。`
          : `path[${path.length}] = ${x.key}，key = ${key} 往${goLeft ? '左' : '右'}走；路径栈用来做"迭代回溯"，不用递归。`,
        vars: vars({ key, top: path.length, h: x.h, bf: BF(x), 情形: '—' }),
        layers: snap({ focus1: [x.id], pointers: ptrs(ptr(x, 'x')) }),
      }));
      if (eq) {
        dup = true;
        break;
      }
      path.push({ node: x, side: goLeft ? 'l' : 'r' });
      if (goLeft) {
        if (!x.l) break;
        x = x.l;
      } else {
        if (!x.r) break;
        x = x.r;
      }
    }
    if (dup) return;

    const holder = path[path.length - 1];
    const z = mk(key);
    holder.node[holder.side] = z;
    steps.push(step({
      event: 'insert-node', lineId: 'leaf',
      note: `新叶子 ${key} 挂到 ${holder.node.key} 的${holder.side === 'l' ? '左' : '右'}侧，h = 1；path 长度 ${path.length}，回溯从栈顶开始。`,
      vars: vars({ key, top: path.length, h: 1, bf: 0, 情形: '—' }),
      layers: snap({ added: [z.id], pointers: ptrs(ptr(z, 'z'), ptr(holder.node, 'par')) }),
    }));

    // 2) 回溯：自栈顶向上统一修复
    for (let i = path.length - 1; i >= 0; i--) {
      const t = path[i].node;
      upd(t);
      const b = H(t.l) - H(t.r);
      steps.push(step({
        event: 'update-height', lineId: 'fupd',
        note: `回溯到 path[${i}] = ${t.key}：h = 1 + max(${H(t.l)}, ${H(t.r)}) = ${t.h}，b = ${signed(b)}。fix() 只看 b 的正负，不看新键走哪边。`,
        vars: vars({ key, top: i, h: t.h, bf: b, 情形: '—' }),
        layers: snap({ focus1: [t.id], pointers: ptrs(ptr(t, 't'), ptr(z, 'z')) }),
      }));

      if (Math.abs(b) <= 1) continue;

      const child = b > 1 ? t.l : t.r;
      const sameSide = b > 1 ? H(child.l) - H(child.r) >= 0 : H(child.l) - H(child.r) <= 0;
      const kindLabel = b > 1 ? (sameSide ? 'LL' : 'LR') : sameSide ? 'RR' : 'RL';

      steps.push(step({
        event: 'unbalanced', lineId: 'fbf',
        note: `${t.key} 的 b = ${signed(b)}（子树高差 2）：失衡。孩子 ${child.key} 的 bf = ${signed(H(child.l) - H(child.r))}，与失衡方向${sameSide ? '同号' : '异号'} → ${kindLabel}，${sameSide ? '只转一次' : '要分两刀转'}。`,
        vars: vars({ key, top: i, h: t.h, bf: b, 情形: kindLabel }),
        layers: snap({ focus1: [t.id], focus2: [child.id], pointers: ptrs(ptr(t, 'g'), ptr(child, 'p')) }),
      }));

      let top;
      if (b > 1 && sameSide) {
        top = rot(t, 'R');
        steps.push(step({
          event: 'rotate-ll', lineId: 'fL1',
          note: `LL：按统一写法就是 rot(${t.key}, R) 一次。${child.key} 上升，${t.key} 落到它的右边，两侧高度差回到 1。`,
          vars: vars({ key, top: i, h: top.h, bf: H(top.l) - H(top.r), 情形: 'LL' }),
          layers: snap({ focus1: [top.id], focus2: [t.id], swap: [top.id, t.id], pointers: ptrs(ptr(top, 'up'), ptr(t, 'down')) }),
        }));
      } else if (b > 1) {
        const mid = rot(t.l, 'L');
        t.l = mid;
        steps.push(step({
          event: 'rotate-lr', lineId: 'fL2',
          note: `LR 第一刀：rot(${child.key}, L) —— 孩子先左旋，${mid.key} 顶上来做 ${t.key} 的左孩子。此刻 ${t.key} 的 b 还是 +2，但方向已经转成"同号"，下一刀就够。`,
          vars: vars({ key, top: i, h: t.h, bf: H(t.l) - H(t.r), 情形: 'LR①' }),
          layers: snap({ focus1: [mid.id], focus2: [t.id], swap: [mid.id, child.id], pointers: ptrs(ptr(mid, 'up'), ptr(child, 'down')) }),
        }));
        top = rot(t, 'R');
        steps.push(step({
          event: 'rotate-lr', lineId: 'fL3',
          note: `LR 第二刀：再 rot(${t.key}, R)，${top.key} 成为子树根 —— 连转两次单旋，形状与"四类分支法里的 LR 双旋"完全一致。`,
          vars: vars({ key, top: i, h: top.h, bf: H(top.l) - H(top.r), 情形: 'LR②' }),
          layers: snap({ focus1: [top.id], focus2: [t.id], swap: [top.id, t.id], pointers: ptrs(ptr(top, 'up'), ptr(t, 'down')) }),
        }));
      } else if (sameSide) {
        top = rot(t, 'L');
        steps.push(step({
          event: 'rotate-rr', lineId: 'fR1',
          note: `RR：rot(${t.key}, L) 一次，${child.key} 上升做子树根，${t.key} 落到左边。`,
          vars: vars({ key, top: i, h: top.h, bf: H(top.l) - H(top.r), 情形: 'RR' }),
          layers: snap({ focus1: [top.id], focus2: [t.id], swap: [top.id, t.id], pointers: ptrs(ptr(top, 'up'), ptr(t, 'down')) }),
        }));
      } else {
        const mid = rot(t.r, 'R');
        t.r = mid;
        steps.push(step({
          event: 'rotate-rl', lineId: 'fR2',
          note: `RL 第一刀：rot(${child.key}, R)，${mid.key} 顶上来做 ${t.key} 的右孩子，把"异号"掰成"同号"。`,
          vars: vars({ key, top: i, h: t.h, bf: H(t.l) - H(t.r), 情形: 'RL①' }),
          layers: snap({ focus1: [mid.id], focus2: [t.id], swap: [mid.id, child.id], pointers: ptrs(ptr(mid, 'up'), ptr(child, 'down')) }),
        }));
        top = rot(t, 'L');
        steps.push(step({
          event: 'rotate-rl', lineId: 'fR3',
          note: `RL 第二刀：rot(${t.key}, L)，${top.key} 成为子树根 —— 两次单旋等价于 RL 双旋。`,
          vars: vars({ key, top: i, h: top.h, bf: H(top.l) - H(top.r), 情形: 'RL②' }),
          layers: snap({ focus1: [top.id], focus2: [t.id], swap: [top.id, t.id], pointers: ptrs(ptr(top, 'up'), ptr(t, 'down')) }),
        }));
      }

      // 把子树根接回父亲（或更新 root），路径栈里保留的是"位置"
      if (i === 0) root = top;
      else path[i - 1].node[path[i - 1].side] = top;
    }
  });

  const result = { root: root ? root.key : null, inorder: inorderOf(root), height: treeHeight(root) };
  steps.push(step({
    event: 'done', lineId: 'fnend', done: true, result,
    note: result.root == null
      ? '空树：结果仍是空树，root = NULL、height = 0。'
      : `插入完成：根为 ${result.root}，中序 ${result.inorder.join(', ')}，树高 ${result.height}。四种情形在这里都只是"一次或两次 rot()"，结果与 v1 的四类分支法逐节点相同。`,
    vars: vars({ key: null, top: 0, h: result.height, bf: root ? H(root.l) - H(root.r) : 0, 情形: '—' }),
    layers: snap({ done: idsOf(root) }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'avl-unified-rotate-v1', lines: L, steps, result, meta: { keys: src.length } });
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
