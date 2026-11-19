/**
 * D · 红黑树 —— 3 个代表性且彼此不同的插入修复策略
 *
 *   v1 CLRS 插入修复：新节点先染红，挂上之后进入 while(z->p 是红) 循环。
 *      父红时只看"叔叔"的颜色：叔红 → 只变色并把 z 抬到祖父（冲突上溯）；
 *      叔黑 → 内侧先转一次掰成直线，再"父染黑 + 祖父染红 + 祖父处单旋"。
 *   v2 左倾红黑树 LLRB：递归插入，回来时只用三个原语
 *      rotateLeft / rotateRight / flipColors 把形态收敛成"红链必须左倾"，最后把根压黑。
 *      （LLRB 与 CLRS 是同一族不变量，但修复手段与中间形态完全不同：
 *       这里没有"叔叔"概念，靠三条 if 的先后顺序一次归一化。）
 *   v3 自顶向下分裂 4- 节点：在下降**途中**遇到"黑节点带两个红孩子"就先分裂
 *      （本节点染红、两孩子染黑），于是插入红叶子之后最多只剩一次旋转收尾，
 *      不需要向上回溯。
 *
 * 画面约定（style 9 treeLayer）：
 *   · 节点 id 稳定 = 'n<key>'，每步重建 nodes 数组；color 直接给渲染器用；
 *   · badge = 红/黑（颜色不能是唯一信息，所以同时写文字）；value = bh（沿左路数的黑高，含 NIL）；
 *   · roles 用节点 id，pointers 标 z / p / u / g / x 这些指针名。
 */

import { trace, step, treeLayer } from '../../engine/model.js';

export const meta = {
  id: 'd/red-black-tree',
  variants: [
    { id: 'v1', name: 'CLRS 插入修复', note: '新节点染红；父红时按叔红（变色上溯）/叔黑（旋转+变色）两类情形修复' },
    { id: 'v2', name: '左倾红黑树 LLRB', note: '只允许左倾红链，用 rotateLeft/rotateRight/flipColors 三原语完成插入修复' },
    { id: 'v3', name: '自顶向下分裂 4- 节点', note: '下降途中遇到 4- 节点（黑带两红）先分裂变色，插入后只需一次旋转收尾' },
  ],
};

const LINES = {
  /* v1：CLRS 自底向上修复（有 parent 指针、看叔叔颜色） */
  v1: [
    { lineId: 'fn', text: 'void rb_insert(RBTree *T, int key) {' },
    { lineId: 'new', text: '  Node *z = new_node(key);' },
    { lineId: 'red', text: '  z->color = RED;                      /* 新节点一律先染红 */' },
    { lineId: 'cmp', text: '  Node *y = NULL, *x = T->root;' },
    { lineId: 'seek', text: '  while (x) { y = x; x = (key < x->key) ? x->l : x->r; }   /* BST 下降只决定挂点 */' },
    { lineId: 'dup', text: '  if (key == x->key) return;             /* 集合语义：重复键不插 */' },
    { lineId: 'link', text: '  z->parent = y;  (key < y->key ? y->l : y->r) = z;' },
    { lineId: 'fix', text: '  while (z->parent && z->parent->color == RED) {' },
    { lineId: 'uncle-red', text: '    if (uncle->color == RED) { p->color = BLACK; uncle->color = BLACK; g->color = RED; z = g; }' },
    { lineId: 'uncle-black', text: '    else {                              /* 叔黑：必须旋转 */' },
    { lineId: 'inner', text: '      if (z 在内侧) { z = p; rotate_left(T, z); }        /* 先掰成一条直线 */' },
    { lineId: 'rot-l', text: '      rotate_left(T, x);                 /* 左旋：右孩子上升 */' },
    { lineId: 'rot-r', text: '      rotate_right(T, x);                /* 右旋：左孩子上升 */' },
    { lineId: 'recolor', text: '      p->color = BLACK;  g->color = RED;  rotate 父/祖父' },
    { lineId: 'fix-e', text: '  }' },
    { lineId: 'root-black', text: '  T->root->color = BLACK;              /* 性质 2：根永远黑 */' },
    { lineId: 'end', text: '}' },
  ],
  /* v2：LLRB 递归 + 三原语 */
  v2: [
    { lineId: 'fn', text: 'Node *llrb_insert(Node *h, int key) {' },
    { lineId: 'nil', text: '  if (h == NULL) return new_red_node(key);          /* 新叶子：红 */' },
    { lineId: 'cmp-l', text: '  if (key < h->key)      h->l = llrb_insert(h->l, key);' },
    { lineId: 'cmp-r', text: '  else if (key > h->key) h->r = llrb_insert(h->r, key);' },
    { lineId: 'dup', text: '  else return h;                                  /* 重复键不插 */' },
    { lineId: 'rl-check', text: '  if (is_red(h->r) && !is_red(h->l))               /* 红链右倾：LLRB 不允许 */' },
    { lineId: 'rl', text: '    h = rotate_left(h);                           /* 原语 1 */' },
    { lineId: 'rr-check', text: '  if (is_red(h->l) && is_red(h->l->l))            /* 连续两条左红 */' },
    { lineId: 'rr', text: '    h = rotate_right(h);                          /* 原语 2 */' },
    { lineId: 'flip-check', text: '  if (is_red(h->l) && is_red(h->r))                /* 左右皆红 = 4- 节点 */' },
    { lineId: 'flip', text: '    flip_colors(h);                               /* 原语 3 */' },
    { lineId: 'ret', text: '  return h;' },
    { lineId: 'p-rotl', text: 'Node *rotate_left(Node *h)  { Node *x = h->r; h->r = x->l; x->l = h; x->color = h->color; h->color = RED; return x; }' },
    { lineId: 'p-rotr', text: 'Node *rotate_right(Node *h) { Node *x = h->l; h->l = x->r; x->r = h; x->color = h->color; h->color = RED; return x; }' },
    { lineId: 'p-flip', text: 'void flip_colors(Node *h)   { h->color = RED; h->l->color = BLACK; h->r->color = BLACK; }' },
    { lineId: 'root-black', text: 'void llrb_put(RBTree *T, int key) { T->root = llrb_insert(T->root, key); T->root->color = BLACK; }' },
    { lineId: 'end', text: '}' },
  ],
  /* v3：自顶向下分裂 4- 节点 */
  v3: [
    { lineId: 'fn', text: 'void rb_insert_topdown(RBTree *T, int key) {' },
    { lineId: 'seek', text: '  Node *path[MAXH], *x = T->root; int top = 0;' },
    { lineId: 'walk', text: '  while (x) { path[top++] = x;' },
    { lineId: 'four-check', text: '    if (x->color == BLACK && is_red(x->l) && is_red(x->r)) {   /* 4- 节点：路过就分裂 */' },
    { lineId: 'split', text: '      x->color = RED; x->l->color = BLACK; x->r->color = BLACK;' },
    { lineId: 'split-rot', text: '      if (is_red(x->parent)) fix_red_red(x);   /* 分裂后与父同为红：祖父处一次旋转 */' },
    { lineId: 'four-e', text: '    }' },
    { lineId: 'tochild', text: '    x = (key < x->key) ? x->l : x->r;                          /* 继续下降 */' },
    { lineId: 'dup', text: '    if (key == x->key) return;                                 /* 重复键不插 */' },
    { lineId: 'leaf', text: '  } attach(parent, key) 为红叶子;                            /* 挂上就只剩一次旋转收尾 */' },
    { lineId: 'last-check', text: '  if (is_red(parent)) fix_red_red(new_leaf);                 /* 叔必黑，一次旋转即可 */' },
    { lineId: 'rot-l', text: '  rotate_left(T, x);                                         /* 左旋：右孩子上升 */' },
    { lineId: 'rot-r', text: '  rotate_right(T, x);                                        /* 右旋：左孩子上升 */' },
    { lineId: 'recolor', text: '  p->color = BLACK; g->color = RED;                          /* 旋转前的配色 */' },
    { lineId: 'root-black', text: '  T->root->color = BLACK;' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal-rotate',
    label: '[10,5,1]（插 1 时叔为 NIL 黑 → 父染黑 + 祖父染红 + 右旋）',
    input: { keys: [10, 5, 1] },
    expect: { root: 5, inorder: [1, 5, 10], blackHeight: 2, redViolations: 0 },
    // LLRB 在这里走的是"右旋 → 双红 → flipColors"三原语，落成 5 黑带 1 黑 / 10 黑两棵 2- 节点，
    // 黑高就比 CLRS 的 5 黑带两条红链高一层：合法差异，不是算法写错。
    expectByVariant: {
      v2: { root: 5, inorder: [1, 5, 10], blackHeight: 3, redViolations: 0 },
    },
  },
  {
    id: 'normal-recolor',
    label: '[10,5,15,1]（插 1 时叔 15 为红 → 只变色，冲突上溯到根）',
    input: { keys: [10, 5, 15, 1] },
    expect: { root: 10, inorder: [1, 5, 10, 15], blackHeight: 3, redViolations: 0 },
  },
  {
    id: 'edge-single',
    label: '[7]（单键：新节点先红，最后被"根置黑"压成黑）',
    input: { keys: [7] },
    expect: { root: 7, inorder: [7], blackHeight: 2, redViolations: 0 },
  },
  {
    id: 'edge-duplicate',
    label: '[10,5,10]（重复键：集合语义，第二个 10 不占新节点）',
    input: { keys: [10, 5, 10] },
    expect: { root: 10, inorder: [5, 10], blackHeight: 2, redViolations: 0 },
  },
  {
    id: 'edge-empty',
    label: '[]（空树：没有键可插）',
    input: { keys: [] },
    expect: { root: null, inorder: [], blackHeight: 0, redViolations: 0 },
  },
];

/* ------------------------------------------------------------------ 公共小工具 */

const nodeId = (key) => `n${key}`;
const isRed = (n) => !!n && n.color === 'red';
const colorOf = (n) => (!n ? 'NIL' : n.color === 'red' ? '红' : '黑');
const show = (n) => (n ? `${n.key}${n.color === 'red' ? '红' : '黑'}` : 'NIL');
const ptr = (n, label) => (n ? { id: label, label, node: n.id } : null);
const ptrs = (...list) => list.filter(Boolean);

/** bh(x) = x 到 NIL 路径上的黑节点数（含 NIL 哨兵，NIL 记 1） */
function bhOf(n) {
  return n ? (n.color === 'black' ? 1 : 0) + bhOf(n.l) : 1;
}

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

/** 红黑性质自检：红节点的孩子必须黑 + 根必须黑 */
function redViolationsOf(root) {
  let bad = 0;
  const walk = (n, parentRed) => {
    if (!n) return;
    if (n.color === 'red' && parentRed) bad += 1;
    walk(n.l, n.color === 'red');
    walk(n.r, n.color === 'red');
  };
  walk(root, false);
  if (root && root.color === 'red') bad += 1;
  return bad;
}

/** 完整快照：每步重新遍历建 nodes / edgeTags，绝不复用上一步的数组 */
function rbLayer(root, roles = {}, name = '') {
  const nodes = [];
  const edgeTags = {};
  const walk = (n, parentId) => {
    if (!n) return;
    nodes.push({
      id: n.id,
      label: String(n.key),
      value: `bh=${bhOf(n)}`,
      badge: n.color === 'red' ? '红' : '黑',
      color: n.color,
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
    title: '红黑树',
    name,
    nodes,
    roots: root ? [root.id] : [],
    edgeTags,
    roles,
  })];
}

const resultOf = (root) => ({
  root: root ? root.key : null,
  inorder: inorderOf(root),
  blackHeight: root ? bhOf(root) : 0,
  redViolations: redViolationsOf(root),
});

/* ------------------------------------------------------------------ 变体 1（CLRS） */

function runV1(input) {
  const src = (input.keys || []).map(Number);
  const L = LINES.v1;
  const steps = [];
  let root = null;
  const seq = src.length ? src.join(', ') : '∅';
  const vars = (o) => ({ 键序: seq, ...o });
  const NAME = '红黑树（CLRS）：badge = 红/黑，value = bh（沿左路数到 NIL）';
  const snap = (roles) => rbLayer(root, roles, NAME);
  const mk = (key) => ({ key, id: nodeId(key), color: 'red', p: null, l: null, r: null });

  const rotL = (x) => {
    const y = x.r;
    x.r = y.l;
    if (y.l) y.l.p = x;
    y.p = x.p;
    if (!x.p) root = y;
    else if (x.p.l === x) x.p.l = y;
    else x.p.r = y;
    y.l = x;
    x.p = y;
    return y;
  };
  const rotR = (x) => {
    const y = x.l;
    x.l = y.r;
    if (y.r) y.r.p = x;
    y.p = x.p;
    if (!x.p) root = y;
    else if (x.p.l === x) x.p.l = y;
    else x.p.r = y;
    y.r = x;
    x.p = y;
    return y;
  };

  const blackenRoot = (key) => {
    if (root && root.color === 'red') {
      root.color = 'black';
      steps.push(step({
        event: 'root-black', lineId: 'root-black',
        note: `根 ${root.key} 被染成黑色：红黑树的根必须黑（性质 2）。这一次改色不改变任何路径上的黑节点数，只是把"根可能变红"这唯一的收尾漏洞补上。`,
        vars: vars({ key, z: null, 情形: '根置黑' }),
        layers: snap({ focus1: [root.id], pointers: ptrs(ptr(root, 'root')) }),
      }));
    }
  };

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: src.length === 0
      ? '空树：没有键要插入，根保持 NULL。'
      : `插入序列 [${src.join(', ')}]。CLRS 的插入只有两步：先把新节点**染红**挂到 BST 该在的位置，然后看"父是不是红"。父红时全靠叔叔的颜色分流：叔红只变色，叔黑才旋转。`,
    vars: vars({ key: null, z: null, p: null, u: null, g: null, 情形: '—' }),
    layers: snap({}),
  }));

  const insert = (key) => {
    const z = mk(key);
    steps.push(step({
      event: 'insert-red', lineId: 'new',
      note: `新建节点 ${key}，先染红。染红的好处是"黑高不变"，代价是可能和红父连成两条红。`,
      vars: vars({ key, z: key, p: null, u: null, g: null, 情形: '新建' }),
      layers: snap({ pointers: ptrs(ptr(root, 'root')) }),
    }));

    if (!root) {
      root = z;
      steps.push(step({
        event: 'insert-red', lineId: 'link',
        note: `空树：${key} 直接做根。它是红的，所以下一步必须把根压黑。`,
        vars: vars({ key, z: key, 情形: '做根' }),
        layers: snap({ added: [z.id], pointers: ptrs(ptr(z, 'z')) }),
      }));
      blackenRoot(key);
      return;
    }

    let y = null;
    let x = root;
    let dup = false;
    while (x) {
      y = x;
      const eq = key === x.key;
      steps.push(step({
        event: 'descend',
        lineId: eq ? 'dup' : 'seek',
        note: eq
          ? `key = ${key} 与 ${x.key} 相等：集合语义下重复键不插，整棵树原样返回。`
          : `key = ${key} ${key < x.key ? '<' : '>'} ${x.key}：BST 下降只决定挂点，红黑性质要等挂上之后再修。`,
        vars: vars({ key, z: key, x: x.key, 颜色: colorOf(x), 情形: eq ? '重复键' : '下降' }),
        layers: snap({ focus1: [x.id], pointers: ptrs(ptr(x, 'x')) }),
      }));
      if (eq) {
        dup = true;
        break;
      }
      x = key < x.key ? x.l : x.r;
    }
    if (dup) return;

    z.p = y;
    if (key < y.key) y.l = z;
    else y.r = z;
    steps.push(step({
      event: 'insert-red', lineId: 'link',
      note: `把 ${key} 挂到 ${y.key} 的${key < y.key ? '左' : '右'}侧，z->parent 指向 ${y.key}。现在只看父的颜色：父黑就收工，父红才进修复循环。`,
      vars: vars({ key, z: key, p: y.key, 颜色: colorOf(y), 情形: '挂红' }),
      layers: snap({ added: [z.id], pointers: ptrs(ptr(z, 'z'), ptr(y, 'p')) }),
    }));

    let cur = z;
    while (cur.p && cur.p.color === 'red') {
      const p = cur.p;
      const g = p.p;                    // 父红 ⇒ 父不是根 ⇒ 祖父存在且为黑
      const pIsLeft = g.l === p;
      const u = pIsLeft ? g.r : g.l;
      const inner = pIsLeft ? cur === p.r : cur === p.l;

      if (isRed(u)) {
        steps.push(step({
          event: 'case-uncle-red', lineId: 'uncle-red',
          note: `z = ${cur.key}，父 ${p.key} 红、叔 ${show(u)} 也红：这是"只变色"的情形 —— 父叔一起染黑、祖父 ${g.key} 染红。子树黑高没变，但祖父变红可能与它的父亲冲突，所以把 z 抬到 ${g.key} 继续检查。`,
          vars: vars({ key, z: cur.key, p: p.key, u: u.key, g: g.key, 情形: '叔红' }),
          layers: snap({ focus1: [cur.id], focus2: [p.id], pointers: ptrs(ptr(cur, 'z'), ptr(p, 'p'), ptr(u, 'u'), ptr(g, 'g')) }),
        }));
        p.color = 'black';
        u.color = 'black';
        g.color = 'red';
        steps.push(step({
          event: 'recolor', lineId: 'recolor',
          note: `变色完成：${p.key} 黑、${u.key} 黑、${g.key} 红。两条红链同时被拆开，冲突被推到了"祖父与曾祖父"之间，z 上移一层。`,
          vars: vars({ key, z: g.key, p: null, u: null, g: g.key, 情形: '变色上溯' }),
          layers: snap({ focus1: [g.id], pointers: ptrs(ptr(g, 'z')) }),
        }));
        cur = g;
        continue;
      }

      steps.push(step({
        event: 'case-uncle-black', lineId: 'uncle-black',
        note: `z = ${cur.key}，父 ${p.key} 红、叔 ${show(u)}（黑）：变色解决不了，必须旋转。先判断 z 在父的哪一侧：${inner ? '内侧（与父的方向相反），要先把红链掰成直线' : '外侧（与父同向），一次旋转就够'}。`,
        vars: vars({ key, z: cur.key, p: p.key, u: u ? u.key : null, g: g.key, 情形: '叔黑' }),
        layers: snap({ focus1: [cur.id], focus2: [p.id], pointers: ptrs(ptr(cur, 'z'), ptr(p, 'p'), ptr(u, 'u'), ptr(g, 'g')) }),
      }));

      let zz = cur;
      if (inner) {
        zz = p;
        if (pIsLeft) rotL(p);
        else rotR(p);
        steps.push(step({
          event: pIsLeft ? 'rotate-left' : 'rotate-right',
          lineId: pIsLeft ? 'rot-l' : 'rot-r',
          note: `内侧先转一刀：对 ${p.key} ${pIsLeft ? '左' : '右'}旋，把 ${cur.key} 顶到父的位置 —— 这一步只在改形状，红红还没解除，但下一次旋转之后就能一次收干净。`,
          vars: vars({ key, z: zz.key, p: p.key, 情形: '内侧掰直' }),
          layers: snap({ focus1: [cur.id], focus2: [p.id], swap: [cur.id, p.id], pointers: ptrs(ptr(cur, 'up'), ptr(p, 'down')) }),
        }));
      }

      const par = zz.p;
      const grand = par.p;
      par.color = 'black';
      grand.color = 'red';
      steps.push(step({
        event: 'recolor', lineId: 'recolor',
        note: `旋转前的配色：父 ${par.key} 染黑、祖父 ${grand.key} 染红。这样旋转之后 ${par.key} 升上来接替祖父的位置，两边黑高正好抵消。`,
        vars: vars({ key, z: zz.key, p: par.key, g: grand.key, 情形: '配色' }),
        layers: snap({ focus1: [par.id], focus2: [grand.id], pointers: ptrs(ptr(par, 'p'), ptr(grand, 'g')) }),
      }));

      const upRight = par === grand.l;
      const top = upRight ? rotR(grand) : rotL(grand);
      steps.push(step({
        event: upRight ? 'rotate-right' : 'rotate-left',
        lineId: upRight ? 'rot-r' : 'rot-l',
        note: `对 ${grand.key} ${upRight ? '右' : '左'}旋：${top.key} 成为这棵子树的根，${grand.key} 落到它的${upRight ? '右' : '左'}边。父已经黑了，所以循环下一轮会直接退出 —— 叔黑情形一次修复到底。`,
        vars: vars({ key, z: zz.key, top: top.key, 情形: upRight ? 'RR 修复' : 'LL 修复' }),
        layers: snap({ focus1: [top.id], focus2: [grand.id], swap: [top.id, grand.id], pointers: ptrs(ptr(top, 'up'), ptr(grand, 'down')) }),
      }));
      cur = zz;
    }

    blackenRoot(key);
  };

  src.forEach((k) => insert(k));

  const result = resultOf(root);
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: result.root == null
      ? '空树：root = NULL，黑高记 0，没有红红冲突。'
      : `插入完成：根 ${result.root}，中序 ${result.inorder.join(', ')}，黑高 bh = ${result.blackHeight}（含 NIL 哨兵），红红冲突 ${result.redViolations} 处。CLRS 的修复是自底向上"父红 → 看叔 → 变或转"。`,
    vars: vars({ key: null, 黑高: result.blackHeight, 红红冲突: result.redViolations, 情形: '—' }),
    layers: snap({ done: result.inorder.map((k) => nodeId(k)) }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'rbtree-clrs-v1', lines: L, steps, result, meta: { keys: src.length } });
}

/* ------------------------------------------------------------------ 变体 2（LLRB） */

function runV2(input) {
  const src = (input.keys || []).map(Number);
  const L = LINES.v2;
  const steps = [];
  let root = null;
  let dupHit = false;
  const seq = src.length ? src.join(', ') : '∅';
  const vars = (o) => ({ 键序: seq, ...o });
  const NAME = 'LLRB：红链只能左倾，badge = 红/黑，value = bh';
  const snap = (roles) => rbLayer(root, roles, NAME);
  const mk = (key) => ({ key, id: nodeId(key), color: 'red', p: null, l: null, r: null });

  /** 原语 1：左旋。x 上升并继承 h 的颜色，h 变红（红链左倾化） */
  const rotL = (h) => {
    const x = h.r;
    h.r = x.l;
    if (x.l) x.l.p = h;
    x.p = h.p;
    if (!h.p) root = x;
    else if (h.p.l === h) h.p.l = x;
    else h.p.r = x;
    x.l = h;
    h.p = x;
    x.color = h.color;
    h.color = 'red';
    return x;
  };
  /** 原语 2：右旋 */
  const rotR = (h) => {
    const x = h.l;
    h.l = x.r;
    if (x.r) x.r.p = h;
    x.p = h.p;
    if (!h.p) root = x;
    else if (h.p.l === h) h.p.l = x;
    else h.p.r = x;
    x.r = h;
    h.p = x;
    x.color = h.color;
    h.color = 'red';
    return x;
  };
  /** 原语 3：flipColors —— 父变红、两孩子变黑（把 4- 节点拆开） */
  const flip = (h) => {
    h.color = 'red';
    h.l.color = 'black';
    h.r.color = 'black';
  };

  /** slot：把"挂在哪一格"抽象出来（父的左/右孩子，或 root） */
  const childSlot = (parent, side) => ({
    get: () => parent[side],
    set: (v) => { parent[side] = v; if (v) v.p = parent; },
  });

  const insert = (slot, key) => {
    const h = slot.get();
    if (!h) {
      const n = mk(key);
      slot.set(n);
      steps.push(step({
        event: 'insert-red', lineId: 'nil',
        note: `递归走到空位：新建红节点 ${key} 并挂上。LLRB 里红节点就代表"和父节点黏在一起"的 2-3 树边，一会儿回到上层要靠三个原语让它左倾。`,
        vars: vars({ key, 节点: key, 情形: '新叶子' }),
        layers: snap({ added: [n.id], pointers: ptrs(ptr(n, 'z'), ptr(n.p, 'p')) }),
      }));
      return;
    }

    const goLeft = key < h.key;
    const eq = key === h.key;
    steps.push(step({
      event: 'descend',
      lineId: eq ? 'dup' : goLeft ? 'cmp-l' : 'cmp-r',
      note: eq
        ? `key = ${key} 与 ${h.key} 相等：重复键不插，这一层直接返回。`
        : `key = ${key} ${goLeft ? '<' : '>'} ${h.key}：往${goLeft ? '左' : '右'}子树递归。LLRB 不看"叔叔"，只看回来之后这个节点自己长什么样。`,
      vars: vars({ key, 节点: h.key, 颜色: colorOf(h), 情形: eq ? '重复键' : '下降' }),
      layers: snap({ focus1: [h.id], pointers: ptrs(ptr(h, 'h')) }),
    }));
    if (eq) {
      dupHit = true;
      return;
    }

    insert(childSlot(h, goLeft ? 'l' : 'r'), key);
    if (dupHit) return;

    let node = h;

    if (isRed(node.r) && !isRed(node.l)) {
      steps.push(step({
        event: 'rotate-left', lineId: 'rl-check',
        note: `回到 ${node.key}：右孩子红、左孩子不红 —— 红链右倾了，LLRB 只允许左倾红链，所以必须用 rotateLeft 把它掰向左。`,
        vars: vars({ key, 节点: node.key, 情形: '右倾红链' }),
        layers: snap({ focus1: [node.id], focus2: [node.r.id], pointers: ptrs(ptr(node, 'h'), ptr(node.r, 'red')) }),
      }));
      node = rotL(node);
      steps.push(step({
        event: 'rotate-left', lineId: 'rl',
        note: `rotateLeft(${h.key})：${node.key} 上升接过这个位置，${h.key} 成为它的左孩子；颜色跟着位置交换 —— 红节点上浮，仍是一条左倾红链。`,
        vars: vars({ key, 节点: node.key, 情形: 'rotateLeft' }),
        layers: snap({ focus1: [node.id], focus2: [node.l.id], swap: [node.id, node.l.id], pointers: ptrs(ptr(node, 'h')) }),
      }));
    }

    if (isRed(node.l) && isRed(node.l.l)) {
      steps.push(step({
        event: 'rotate-right', lineId: 'rr-check',
        note: `${node.key} 连着两条左红（${node.l.key} 和 ${node.l.l.key}）：这等价于 2-3 树里一个节点攒了两个键，用 rotateRight 把中间键顶上来。`,
        vars: vars({ key, 节点: node.key, 情形: '两条左红' }),
        layers: snap({ focus1: [node.id], focus2: [node.l.id], pointers: ptrs(ptr(node, 'h'), ptr(node.l, 'red')) }),
      }));
      node = rotR(node);
      steps.push(step({
        event: 'rotate-right', lineId: 'rr',
        note: `rotateRight(${node.r.key})：${node.key} 上升做根，${node.r.key} 落到右边 —— 两条左红变成"左右各一红"，接下去就轮到 flipColors。`,
        vars: vars({ key, 节点: node.key, 情形: 'rotateRight' }),
        layers: snap({ focus1: [node.id], focus2: [node.r.id], swap: [node.id, node.r.id], pointers: ptrs(ptr(node, 'h')) }),
      }));
    }

    if (isRed(node.l) && isRed(node.r)) {
      steps.push(step({
        event: 'recolor', lineId: 'flip-check',
        note: `${node.key} 左右孩子都是红：这是临时的 4- 节点形态，flipColors 把"父红、两孩子黑"翻过来，等于把一个 4- 节点拆成三个 2- 节点。`,
        vars: vars({ key, 节点: node.key, 情形: '4- 节点' }),
        layers: snap({ focus1: [node.id], focus2: [node.l.id, node.r.id], pointers: ptrs(ptr(node, 'h')) }),
      }));
      flip(node);
      steps.push(step({
        event: 'recolor', lineId: 'flip',
        note: `flipColors(${node.key})：${node.key} 变红、两个孩子变黑。黑高沿每条路径都 +1−1 抵消；如果 ${node.key} 的父亲也是红，下一层递归的 if 会继续把它掰正。`,
        vars: vars({ key, 节点: node.key, 颜色: colorOf(node), 情形: 'flipColors' }),
        layers: snap({ focus1: [node.id], pointers: ptrs(ptr(node, 'h')) }),
      }));
    }

    return;
  };

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: src.length === 0
      ? '空树：llrb_insert 直接返回 NULL。'
      : `插入序列 [${src.join(', ')}]。LLRB 与 v1 是同一族不变量，但写法完全不同：递归插入后**只调三个原语**（rotateLeft → rotateRight → flipColors，顺序不能换）把形态收敛成"红链必须左倾"，最后把根压黑。全程没有"叔叔"。`,
    vars: vars({ key: null, 节点: null, 情形: '—' }),
    layers: snap({}),
  }));

  src.forEach((key) => {
    dupHit = false;
    insert({ get: () => root, set: (v) => { root = v; if (v) v.p = null; } }, key);
    if (root && root.color === 'red') {
      root.color = 'black';
      steps.push(step({
        event: 'root-black', lineId: 'root-black',
        note: `llrb_put 的最后一句：根 ${root.key} 压黑。LLRB 只把根允许例外地"临时变红"，这里统一抹掉，保证根永远是黑。`,
        vars: vars({ key, 节点: root.key, 情形: '根置黑' }),
        layers: snap({ focus1: [root.id], pointers: ptrs(ptr(root, 'root')) }),
      }));
    }
  });

  const result = resultOf(root);
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: result.root == null
      ? '空树：root = NULL，黑高记 0。'
      : `插入完成：根 ${result.root}，中序 ${result.inorder.join(', ')}，黑高 bh = ${result.blackHeight}，红红冲突 ${result.redViolations} 处。LLRB 的中间形态与 v1 不同（红链一律左倾），但两棵树都满足同一组红黑性质。`,
    vars: vars({ key: null, 黑高: result.blackHeight, 红红冲突: result.redViolations, 情形: '—' }),
    layers: snap({ done: result.inorder.map((k) => nodeId(k)) }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'rbtree-llrb-v1', lines: L, steps, result, meta: { keys: src.length } });
}

/* ------------------------------------------------------------------ 变体 3（自顶向下分裂） */

function runV3(input) {
  const src = (input.keys || []).map(Number);
  const L = LINES.v3;
  const steps = [];
  let root = null;
  const seq = src.length ? src.join(', ') : '∅';
  const vars = (o) => ({ 键序: seq, ...o });
  const NAME = '自顶向下红黑树：下降时就分裂 4- 节点，badge = 红/黑';
  const snap = (roles) => rbLayer(root, roles, NAME);
  const mk = (key) => ({ key, id: nodeId(key), color: 'red', l: null, r: null, p: null });

  /** 把 newChild 接回 oldChild 原来的位置（父为空则改 root） */
  const relink = (parent, oldChild, newChild) => {
    if (!parent) root = newChild;
    else if (parent.l === oldChild) parent.l = newChild;
    else parent.r = newChild;
  };
  const rotL = (parent, x) => {
    const y = x.r;
    x.r = y.l;
    y.l = x;
    relink(parent, x, y);
    return y;
  };
  const rotR = (parent, x) => {
    const y = x.l;
    x.l = y.r;
    y.r = x;
    relink(parent, x, y);
    return y;
  };

  /**
   * 红红冲突的一次性修复：z 与父 par 同为红，祖 g 必黑。
   * 内侧先掰直，然后"父染黑、祖染红、祖处单旋"。
   */
  const fixRedRed = (z, par, g, gg, key) => {
    let outer = par;                       // 默认：z 在父的外侧，父本身就是那个"顶上去"的节点
    if (g.l === par && z === par.r) {
      rotL(g, par);
      steps.push(step({
        event: 'rotate-left', lineId: 'rot-l',
        note: `内侧先掰直：对 ${par.key} 左旋，${z.key} 顶到父的位置，红链变成 ${z.key} → ${par.key} 的直线。`,
        vars: vars({ key, z: z.key, p: par.key, g: g.key, 情形: '掰直' }),
        layers: snap({ focus1: [z.id], focus2: [par.id], swap: [z.id, par.id], pointers: ptrs(ptr(z, 'up'), ptr(par, 'down')) }),
      }));
      outer = z;
    } else if (g.r === par && z === par.l) {
      rotR(g, par);
      steps.push(step({
        event: 'rotate-right', lineId: 'rot-r',
        note: `内侧先掰直：对 ${par.key} 右旋，${z.key} 顶到父的位置，红链变成 ${z.key} → ${par.key} 的直线。`,
        vars: vars({ key, z: z.key, p: par.key, g: g.key, 情形: '掰直' }),
        layers: snap({ focus1: [z.id], focus2: [par.id], swap: [z.id, par.id], pointers: ptrs(ptr(z, 'up'), ptr(par, 'down')) }),
      }));
      outer = z;
    }
    outer.color = 'black';
    g.color = 'red';
    steps.push(step({
      event: 'recolor', lineId: 'recolor',
      note: `配色：${outer.key} 染黑、祖父 ${g.key} 染红 —— 旋转之后 ${outer.key} 会顶到祖父的位置，正好把多出来的一层黑还回去。`,
      vars: vars({ key, z: outer.key, p: outer.key, g: g.key, 情形: '配色' }),
      layers: snap({ focus1: [outer.id], focus2: [g.id], pointers: ptrs(ptr(outer, 'p'), ptr(g, 'g')) }),
    }));
    const upRight = g.l === outer;
    const top = upRight ? rotR(gg, g) : rotL(gg, g);
    steps.push(step({
      event: upRight ? 'rotate-right' : 'rotate-left',
      lineId: upRight ? 'rot-r' : 'rot-l',
      note: `对 ${g.key} ${upRight ? '右' : '左'}旋：${top.key} 成为子树根，${g.key} 落到${upRight ? '右' : '左'}边 —— 红红冲突消除，且这棵子树黑高不变，上面的祖先不需要再管。`,
      vars: vars({ key, z: outer.key, top: top.key, 情形: '收尾旋转' }),
      layers: snap({ focus1: [top.id], focus2: [g.id], swap: [top.id, g.id], pointers: ptrs(ptr(top, 'up'), ptr(g, 'down')) }),
    }));
  };

  const blackenRoot = (key) => {
    if (root && root.color === 'red') {
      root.color = 'black';
      steps.push(step({
        event: 'root-black', lineId: 'root-black',
        note: `根 ${root.key} 压黑。自顶向下的分裂会把根临时染红，这里统一收尾，保证根永远黑。`,
        vars: vars({ key, 黑高: bhOf(root), 情形: '根置黑' }),
        layers: snap({ focus1: [root.id], pointers: ptrs(ptr(root, 'root')) }),
      }));
    }
  };

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: src.length === 0
      ? '空树：没有键要插入。'
      : `插入序列 [${src.join(', ')}]。v3 换了个方向：不等插完再往上修，而是在**下降的路上**就把"黑节点带两个红孩子"的 4- 节点分裂掉（本节点染红、两孩子染黑）。于是等新红叶子挂上去，最多只剩一次旋转收尾。`,
    vars: vars({ key: null, 节点: null, 情形: '—' }),
    layers: snap({}),
  }));

  const insert = (key) => {
    if (!root) {
      root = mk(key);
      steps.push(step({
        event: 'insert-red', lineId: 'leaf',
        note: `空树：${key} 做根。它先按红建，随后压黑。`,
        vars: vars({ key, 节点: key, 情形: '做根' }),
        layers: snap({ added: [root.id], pointers: ptrs(ptr(root, 'root')) }),
      }));
      blackenRoot(key);
      return;
    }

    const path = [];
    let x = root;
    let dup = false;
    for (;;) {
      path.push(x);
      const p = path[path.length - 2] || null;
      const g = path[path.length - 3] || null;
      const gg = path[path.length - 4] || null;

      // ① 路过 4- 节点先分裂
      if (x.color === 'black' && isRed(x.l) && isRed(x.r)) {
        steps.push(step({
          event: 'descend', lineId: 'four-check',
          note: `下降经过 ${x.key}：它是"黑带两个红孩子"的 4- 节点。自顶向下策略在路过时就动手，不等回溯。`,
          vars: vars({ key, 节点: x.key, 情形: '4- 节点' }),
          layers: snap({ focus1: [x.id], focus2: [x.l.id, x.r.id], pointers: ptrs(ptr(x, 'x'), ptr(p, 'p')) }),
        }));
        x.color = 'red';
        x.l.color = 'black';
        x.r.color = 'black';
        steps.push(step({
          event: 'recolor', lineId: 'split',
          note: `分裂 ${x.key}：本节点染红、两个孩子（${x.l.key}、${x.r.key}）染黑 —— 相当于把 4- 节点的中间键上交，整棵树黑高不变。`,
          vars: vars({ key, 节点: x.key, 情形: '分裂变色' }),
          layers: snap({ focus1: [x.id], focus2: [x.l.id, x.r.id], pointers: ptrs(ptr(x, 'x')) }),
        }));
        if (isRed(p) && g) {
          steps.push(step({
            event: 'case-uncle-black', lineId: 'split-rot',
            note: `分裂后 ${x.key} 变红，而父 ${p.key} 也是红：红红相连。因为一路上已经把 4- 节点都拆了，这里的"叔"必为黑，所以只用在祖父 ${g.key} 处转一次。`,
            vars: vars({ key, 节点: x.key, p: p.key, g: g.key, 情形: '分裂后红红' }),
            layers: snap({ focus1: [x.id], focus2: [p.id], pointers: ptrs(ptr(x, 'z'), ptr(p, 'p'), ptr(g, 'g')) }),
          }));
          fixRedRed(x, p, g, gg, key);
        }
      }

      // ② 决定往哪边走
      const eq = key === x.key;
      steps.push(step({
        event: 'descend',
        lineId: eq ? 'dup' : 'walk',
        note: eq
          ? `key = ${key} 与 ${x.key} 相等：重复键不插，本轮结束。`
          : `key = ${key} ${key < x.key ? '<' : '>'} ${x.key}：继续下降（路径栈里有 ${path.length} 个节点，收尾时用它的末尾几个做父子关系）。`,
        vars: vars({ key, 节点: x.key, 颜色: colorOf(x), 情形: eq ? '重复键' : '下降' }),
        layers: snap({ focus1: [x.id], pointers: ptrs(ptr(x, 'x')) }),
      }));
      if (eq) {
        dup = true;
        break;
      }
      const next = key < x.key ? x.l : x.r;
      if (!next) break;
      x = next;
    }
    if (dup) return;

    const at = path[path.length - 1];            // 挂点 = 新叶子的父亲
    const par = path[path.length - 2] || null;   // 祖父
    const g = path[path.length - 3] || null;     // 曾祖父（旋转后要接回去的那一层）

    const z = mk(key);
    z.p = at;
    if (key < at.key) at.l = z;
    else at.r = z;
    steps.push(step({
      event: 'insert-red', lineId: 'leaf',
      note: `新叶子 ${key} 挂到 ${at.key} 的${key < at.key ? '左' : '右'}侧，先染红。因为下降时已经把路上的 4- 节点都拆开，"父红"这种情况的叔叔一定是黑的。`,
      vars: vars({ key, 节点: key, p: at.key, 情形: '挂红' }),
      layers: snap({ added: [z.id], pointers: ptrs(ptr(z, 'z'), ptr(at, 'p')) }),
    }));

    if (isRed(at) && par) {
      steps.push(step({
        event: 'case-uncle-black', lineId: 'last-check',
        note: `父 ${at.key} 是红：只需一次旋转收尾（叔必黑，不会退化成"变色上溯"）。这就是自顶向下分裂换来的好处 —— 一次修复，不用回溯。`,
        vars: vars({ key, 节点: key, p: at.key, g: par.key, 情形: '一次收尾' }),
        layers: snap({ focus1: [z.id], focus2: [at.id], pointers: ptrs(ptr(z, 'z'), ptr(at, 'p'), ptr(par, 'g')) }),
      }));
      fixRedRed(z, at, par, g, key);
    }

    blackenRoot(key);
  };

  src.forEach((k) => insert(k));

  const result = resultOf(root);
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: result.root == null
      ? '空树：root = NULL，黑高记 0。'
      : `插入完成：根 ${result.root}，中序 ${result.inorder.join(', ')}，黑高 bh = ${result.blackHeight}，红红冲突 ${result.redViolations} 处。与 v1/v2 的区别只在"什么时候修"：v3 把修复提前到下降路上，所以插入后最多一次旋转。`,
    vars: vars({ key: null, 黑高: result.blackHeight, 红红冲突: result.redViolations, 情形: '—' }),
    layers: snap({ done: result.inorder.map((k) => nodeId(k)) }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'rbtree-topdown-v1', lines: L, steps, result, meta: { keys: src.length } });
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
