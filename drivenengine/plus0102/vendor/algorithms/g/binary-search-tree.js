/**
 * G · 二叉排序树（3 个代表性、彼此不同的实现）
 *
 * 三种策略的画面差别，正好对应"怎么下降 / 怎么挂接 / 挂完怎么证明它是对的"：
 *   v1 插入 + 查找（递归） —— 递归下降，空链接处的递归调用就是挂接点；调用栈深度可见；
 *   v2 迭代 + 父指针        —— while 下降，parent 记住最后一个非空节点，跳出循环后一次接好；
 *   v3 插入 + 中序校验      —— 显式路径栈 path[] 下降（栈顶即父节点），建完树后中序走一遍，
 *                              逐个核对"严格递增"，顺便统计树高与重复键拒绝次数。
 *
 * 契约（docs/04-轨迹契约.md）：每步都是完整快照；step.lineId 命中本变体自己的 sourceLines；
 * 最后一步 done=true 且 result 与样例 expect 深比较一致。
 * 重复键策略：三个变体一致 —— **拒绝插入**，不挂右子树，只把拒绝次数计入 duplicate。
 */

import { trace, step, treeLayer, stackLayer, arrayLayer } from '../../engine/model.js';

export const meta = {
  id: 'g/binary-search-tree',
  variants: [
    { id: 'v1', name: '插入 + 查找（递归）', note: '小于走左、大于走右，首个空链接处挂新节点；查找返回节点或未命中' },
    { id: 'v2', name: '迭代 + 父指针', note: 'while 下降并用 parent 记录挂接点，插入在空链接处一次接好' },
    { id: 'v3', name: '插入 + 中序校验', note: '插入完成后做一次中序验证输出有序，并统计树高与重复键拒绝次数' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '插入 5、3、7、4 → 中序 [3,4,5,7]',
    input: { insert: [5, 3, 7, 4] },
    expect: { inorder: ['3', '4', '5', '7'], size: 4, height: 3 },
  },
  {
    id: 'normal-find',
    label: '同一棵树里查 4：比较路径 5 → 3 → 4，命中',
    input: { insert: [5, 3, 7, 4], find: 4 },
    expect: { found: true, path: ['5', '3', '4'] },
  },
  {
    id: 'edge-duplicate',
    label: '重复插入 3（被拒绝 1 次，树不变）',
    input: { insert: [5, 3, 7, 4, 3] },
    expect: { duplicate: 1, size: 4, inorder: ['3', '4', '5', '7'] },
  },
  {
    id: 'edge-empty',
    label: '空树查找 4（根就是空链接 → 未命中）',
    input: { insert: [], find: 4 },
    expect: { found: false, path: [], size: 0, inorder: [] },
  },
];

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'BSTNode *BST_Insert(BSTree *T, int k) {' },
    { lineId: 'empty', text: '  if (*T == NULL) {                      /* 空链接 = 挂接点 */' },
    { lineId: 'attach', text: '    *T = NewNode(k);  return *T;         /* 就地挂上去 */' },
    { lineId: 'eq', text: '  } else if (k == (*T)->data) { return NULL; }   /* 重复键：拒绝 */' },
    { lineId: 'left', text: '  else if (k < (*T)->data) return BST_Insert(&(*T)->lchild, k);' },
    { lineId: 'right', text: '  else                       return BST_Insert(&(*T)->rchild, k);' },
    { lineId: 'fnEnd', text: '}' },
    { lineId: 'findFn', text: 'BSTNode *BST_Find(BSTree T, int k) {' },
    { lineId: 'findNull', text: '  if (T == NULL) return NULL;          /* 走到空链接：未命中 */' },
    { lineId: 'findEq', text: '  if (k == T->data) return T;           /* 命中 */' },
    { lineId: 'findLeft', text: '  if (k < T->data) return BST_Find(T->lchild, k);' },
    { lineId: 'findRight', text: '  return BST_Find(T->rchild, k);' },
    { lineId: 'findEnd', text: '}' },
    { lineId: 'main', text: '/* main: 逐个 Insert，再按需 Find —— 递归版靠调用栈记住回来的路 */' },
  ],
  v2: [
    { lineId: 'fn', text: 'BSTNode *BST_Insert_Iter(BSTree *T, int k) {' },
    { lineId: 'init', text: '  BSTNode *parent = NULL, *p = *T;      /* parent 记住最后一个非空节点 */' },
    { lineId: 'loop', text: '  while (p != NULL) {' },
    { lineId: 'cmp', text: '    if (k == p->data) return NULL;        /* 重复键：拒绝 */' },
    { lineId: 'goLeft', text: '    if (k < p->data) { parent = p;  p = p->lchild; }' },
    { lineId: 'goRight', text: '    else             { parent = p;  p = p->rchild; }' },
    { lineId: 'loopEnd', text: '  }                                     /* p == NULL：空链接到了 */' },
    { lineId: 'root', text: '  if (parent == NULL) { *T = NewNode(k);  return *T; }' },
    { lineId: 'linkL', text: '  if (k < parent->data) parent->lchild = NewNode(k);' },
    { lineId: 'linkR', text: '  else                  parent->rchild = NewNode(k);' },
    { lineId: 'fnEnd', text: '}' },
    { lineId: 'findFn', text: 'BSTNode *BST_Find_Iter(BSTree T, int k) {' },
    { lineId: 'findLoop', text: '  while (T && T->data != k) T = (k < T->data) ? T->lchild : T->rchild;' },
    { lineId: 'findRet', text: '  return T;                            /* NULL = 未命中 */' },
  ],
  v3: [
    { lineId: 'fn', text: 'void BST_Build(BSTree *T, int keys[], int n) {' },
    { lineId: 'init', text: '  *T = NULL;  int rejected = 0;' },
    { lineId: 'for', text: '  for (int i = 0; i < n; ++i) {' },
    { lineId: 'descend', text: '    BSTNode *p = *T;  int d = 0;  /* path[] 是显式路径栈 */' },
    { lineId: 'walk', text: '    while (p && p->data != keys[i]) { path[d++] = p;  p = (keys[i] < p->data) ? p->lchild : p->rchild; }' },
    { lineId: 'dup', text: '    if (p) { ++rejected;  continue; }    /* 已有同键：拒绝 */' },
    { lineId: 'root', text: '    if (d == 0) { *T = NewNode(keys[i]);  continue; }   /* 路径为空 → 当根 */' },
    { lineId: 'link', text: '    if (keys[i] < path[d-1]->data) path[d-1]->lchild = NewNode(keys[i]);' },
    { lineId: 'linkR', text: '    else                           path[d-1]->rchild = NewNode(keys[i]);' },
    { lineId: 'forEnd', text: '  }                                     /* 栈顶 path[d-1] 就是父节点 */' },
    { lineId: 'searchFn', text: 'BSTNode *BST_Find_Path(BSTree T, int k) {' },
    { lineId: 'searchLoop', text: '  while (T && T->data != k) T = (k < T->data) ? T->lchild : T->rchild;' },
    { lineId: 'searchRet', text: '  return T;                            /* NULL = 未命中 */' },
    { lineId: 'verifyFn', text: 'void BST_Verify(BSTree T) {          /* 中序必须严格递增，否则不是 BST */' },
    { lineId: 'verify', text: '  InOrder(T): if (prev && T->data <= prev->data) return NOT_A_BST;' },
    { lineId: 'stat', text: '  h(T) = max(h(T->lchild), h(T->rchild)) + 1;   /* 顺带统计树高 */' },
    { lineId: 'main', text: '/* main: 建树 → 中序校验 → 输出有序序列 + 树高 + 拒绝次数 */' },
  ],
};

/* ------------------------------------------------------------------ 小工具 */

const str = (v) => String(v);

/** 输入归一：insert 最多 10 个、find 可选；其它非法值丢掉（不让脏输入炸在场外） */
function normInput(input) {
  const raw = input || {};
  const ins = (Array.isArray(raw.insert) ? raw.insert : [])
    .slice(0, 10)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  const hasFind = raw.find != null && raw.find !== '' && Number.isFinite(Number(raw.find));
  return { ins, hasFind, target: hasFind ? Number(raw.find) : null };
}

/** 受控的树状态：nodes 是 id → 节点，所有边都由 attach 显式建立 */
function makeTree() {
  const nodes = new Map();
  const st = { root: null };
  const attach = (value, parentId, side) => {
    const id = str(value);
    nodes.set(id, { id, label: id, value, order: nodes.size, left: null, right: null, parent: parentId ?? null });
    if (parentId == null) st.root = id;
    else nodes.get(parentId)[side === 'l' ? 'left' : 'right'] = id;
    return id;
  };
  return { nodes, st, attach };
}

function edgeTagsOf(nodes) {
  const tags = {};
  for (const n of nodes.values()) {
    if (n.left) tags[n.left] = 'L';
    if (n.right) tags[n.right] = 'R';
  }
  return tags;
}

function inorderIds(nodes, root) {
  const out = [];
  const go = (id) => {
    if (!id) return;
    const n = nodes.get(id);
    go(n.left);
    out.push(id);
    go(n.right);
  };
  go(root);
  return out;
}

function heightOf(nodes, id) {
  if (!id) return 0;
  const n = nodes.get(id);
  return 1 + Math.max(heightOf(nodes, n.left), heightOf(nodes, n.right));
}

function resultOf(ctl, dupCount, found, findWalk) {
  const ids = inorderIds(ctl.nodes, ctl.st.root);
  return {
    inorder: ids.map((id) => ctl.nodes.get(id).label),
    size: ctl.nodes.size,
    height: heightOf(ctl.nodes, ctl.st.root),
    duplicate: dupCount,
    found: !!found,
    path: findWalk.map((id) => ctl.nodes.get(id).label),
  };
}

const walkVars = (walk, nodes) => (walk.length ? walk.map((id) => nodes.get(id).label).join(' → ') : '（空）');

/* ------------------------------------------------------------------ 变体 1：递归 */

function runV1(input) {
  const { ins, hasFind, target } = normInput(input);
  const L = LINES.v1;
  const steps = [];
  const ctl = makeTree();
  const { nodes, st, attach } = ctl;
  const frames = []; // 递归调用栈：栈底 → 栈顶
  const insOrder = [];
  let dupCount = 0;

  const lab = (id) => (id == null ? 'NULL' : nodes.get(id).label);

  const treeOf = (o = {}) => treeLayer({
    id: 'main',
    title: '二叉排序树',
    name: 'BSTree · 左 < 根 < 右',
    roots: st.root ? [st.root] : [],
    nodes: [...nodes.values()].map((n) => {
      const box = { id: n.id, label: n.label, value: `#${n.order + 1}` };
      if (n.left) box.left = n.left;
      if (n.right) box.right = n.right;
      return box;
    }),
    edgeTags: edgeTagsOf(nodes),
    roles: o.roles || {},
  });

  const stackOf = () => stackLayer({
    id: 'call',
    title: '递归调用栈',
    name: 'CallStack（栈底 → 栈顶）',
    cells: frames.map((id, i) => ({ value: lab(id), label: `帧${i + 1}` })),
    top: frames.length ? frames.length - 1 : null,
    capacity: Math.max(5, ins.length + 1),
    roles: { pointers: frames.length ? [{ id: 'top', label: 'top', index: frames.length - 1 }] : [] },
  });

  const vars = (extra = {}) => ({
    插入序列: ins.length ? ins.join(', ') : '（空）',
    节点数: nodes.size,
    树高: heightOf(nodes, st.root),
    重复键: dupCount,
    栈深: frames.length,
    ...extra,
  });

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: ins.length
      ? `按 ${ins.join(', ')} 依次 BST_Insert。规则只有一条：比当前节点小走左、大走右，**第一个空链接就是挂接点**。递归版把"回来的路"放在调用栈里。`
      : '插入序列是空的：树保持空，main 直接进查找阶段（根就是空链接）。',
    vars: vars({ 当前: '—' }),
    layers: [treeOf(), stackOf()],
  }));

  // 递归插入：curId 是当前"槽位"里的节点，null 表示这个槽位是空链接
  const recInsert = (curId, parentId, side, value, depth) => {
    if (curId === null) {
      steps.push(step({
        event: 'compare',
        lineId: 'empty',
        note: parentId == null
          ? `Insert(&root) 一进来 *T == NULL 就成立：整棵树还是空的，根位置就是挂接点。`
          : `${lab(parentId)} 的${side === 'l' ? '左' : '右'}孩子是空链接，递归到这里 *T == NULL 成立 —— 这个空位就是要挂 ${value} 的地方。`,
        vars: vars({ 当前: 'NULL', 深度: depth, key: value }),
        layers: [
          treeOf({
            roles: parentId == null
              ? {}
              : { focus1: [parentId], pointers: [{ id: 'cur', label: 'cur', node: parentId }] },
          }),
          stackOf(),
        ],
      }));
      const id = attach(value, parentId, side);
      insOrder.push(id);
      steps.push(step({
        event: 'attach',
        lineId: 'attach',
        note: `在空链处 NewNode(${value}) 并直接赋给指针：${parentId == null ? '成为根节点' : `成为 ${lab(parentId)} 的${side === 'l' ? '左' : '右'}孩子`}。挂完不动其它节点，所以整棵树仍满足"左小右大"。`,
        vars: vars({ 当前: lab(id), 深度: depth, key: value }),
        layers: [
          treeOf({
            roles: {
              added: [id],
              focus1: [id],
              done: [...insOrder.slice(0, -1)],
              pointers: [{ id: 'new', label: '新节点', node: id }],
            },
          }),
          stackOf(),
        ],
      }));
      return id;
    }

    const n = nodes.get(curId);
    frames.push(curId);
    steps.push(step({
      event: 'compare',
      lineId: 'eq',
      note: `帧 ${n.label}：先判等 —— k=${value} 与 ${n.label} ${value === n.value ? '相等，直接返回 NULL（重复键不插入）' : '不等，按大小选方向'}。`,
      vars: vars({ 当前: n.label, 深度: depth + 1, key: value }),
      layers: [
        treeOf({
          roles: {
            focus1: [curId],
            done: [...insOrder],
            pointers: [{ id: 'cur', label: 'cur', node: curId }, ...(parentId ? [{ id: 'fa', label: '调用者', node: parentId }] : [])],
          },
        }),
        stackOf(),
      ],
    }));

    if (value === n.value) {
      dupCount++;
      steps.push(step({
        event: 'duplicate',
        lineId: 'eq',
        note: `${n.label} 已经在树里：排序树的键必须唯一（否则查找结果不唯一），这里按"拒绝"策略处理，只累加拒绝次数，树形不变。`,
        vars: vars({ 当前: n.label, 深度: depth + 1, key: value }),
        layers: [
          treeOf({
            roles: {
              focus1: [curId],
              focus2: [curId],
              done: [...insOrder],
              pointers: [{ id: 'cur', label: 'cur', node: curId }, { id: 'dup', label: '重复键', node: curId }],
            },
          }),
          stackOf(),
        ],
      }));
      frames.pop();
      return null;
    }

    const dir = value < n.value ? 'l' : 'r';
    const child = dir === 'l' ? n.left : n.right;
    frames.push(child ?? null); // 下一层帧（可能是 NULL 帧）
    frames.pop();
    steps.push(step({
      event: dir === 'l' ? 'go-left' : 'go-right',
      lineId: dir === 'l' ? 'left' : 'right',
      note: `${value} ${dir === 'l' ? '<' : '>'} ${n.label}，所以递归调用走${dir === 'l' ? '左' : '右'}指针 ${child ? `到孩子 ${lab(child)}` : '—— 那边是空链接，下一帧就会挂上'}。`,
      vars: vars({ 当前: n.label, 方向: dir === 'l' ? '左' : '右', 深度: depth + 1, key: value }),
      layers: [
        treeOf({
          roles: {
            focus1: child ? [child] : [curId],
            focus2: [curId],
            done: [...insOrder],
            pointers: [
              { id: 'cur', label: 'cur', node: curId },
              ...(child ? [{ id: 'next', label: `走${dir === 'l' ? '左' : '右'}`, node: child }] : []),
            ],
          },
        }),
        stackOf(),
      ],
    }));

    const got = recInsert(child, curId, dir, value, depth + 1);
    frames.pop();
    return got;
  };

  for (const value of ins) recInsert(st.root, null, null, value, 0);

  // ---------------- 查找（递归） ----------------
  const findWalk = [];
  let found = false;
  const recFind = (curId) => {
    if (curId === null) {
      steps.push(step({
        event: 'miss',
        lineId: 'findNull',
        note: `${target} 一路上没遇到相等的键，走到空链接 T == NULL：查找失败，返回 NULL。`,
        vars: vars({ 查找: `${target}：未命中`, 路径: walkVars(findWalk, nodes) }),
        layers: [treeOf({ roles: { excluded: [], pointers: [] } }), stackOf()],
      }));
      return;
    }
    const n = nodes.get(curId);
    findWalk.push(curId);
    frames.push(curId);
    steps.push(step({
      event: 'compare',
      lineId: 'findEq',
      note: `BST_Find(${n.label})：比较 ${n.label} 与待查键 ${target}（第 ${findWalk.length} 次比较）。`,
      vars: vars({ 查找: `${target}`, 路径: walkVars(findWalk, nodes) }),
      layers: [
        treeOf({
          roles: {
            focus1: [curId],
            done: [...insOrder],
            pointers: [{ id: 'p', label: 'p', node: curId }, { id: 'k', label: `k=${target}`, node: curId }],
          },
        }),
        stackOf(),
      ],
    }));
    if (n.value === target) {
      found = true;
      steps.push(step({
        event: 'hit',
        lineId: 'findEq',
        note: `相等 → 命中 ${n.label}。排序树的比较路径就是查找路径：每比较一次就砍掉一整棵子树。`,
        vars: vars({ 查找: `${target}：命中`, 路径: walkVars(findWalk, nodes) }),
        layers: [
          treeOf({
            roles: {
              focus1: [curId],
              added: [curId],
              done: [...insOrder],
              pointers: [{ id: 'p', label: 'p', node: curId }],
            },
          }),
          stackOf(),
        ],
      }));
      frames.pop();
      return;
    }
    const dir = target < n.value ? 'l' : 'r';
    const child = dir === 'l' ? n.left : n.right;
    steps.push(step({
      event: dir === 'l' ? 'go-left' : 'go-right',
      lineId: dir === 'l' ? 'findLeft' : 'findRight',
      note: `${target} ${dir === 'l' ? '<' : '>'} ${n.label}：只需往${dir === 'l' ? '左' : '右'}递归——另一整棵子树不可能含有 ${target}，这就是 BST 查找 O(log n) 的来源。`,
      vars: vars({ 查找: `${target}`, 路径: walkVars(findWalk, nodes) }),
      layers: [
        treeOf({
          roles: {
            focus1: child ? [child] : [curId],
            focus2: [curId],
            done: [...insOrder],
            pointers: [{ id: 'p', label: 'p', node: curId }, ...(child ? [{ id: 'next', label: `走${dir === 'l' ? '左' : '右'}`, node: child }] : [])],
          },
        }),
        stackOf(),
      ],
    }));
    recFind(child);
    frames.pop();
  };

  if (hasFind) recFind(st.root);

  const result = resultOf(ctl, dupCount, found, findWalk);
  steps.push(step({
    event: 'done',
    lineId: 'main',
    done: true,
    result,
    note: `完成：中序 = [${result.inorder.join(', ')}]（BST 的中序必然递增），树高 ${result.height}，重复键拒绝 ${result.duplicate} 次${hasFind ? `，查找 ${target} ${found ? '命中' : '未命中'}` : ''}。递归版的挂接点永远是**空链接**，所以插入顺序决定树形、也决定树高。`,
    vars: vars({ 中序: `[${result.inorder.join(', ')}]`, 查找: hasFind ? (found ? '命中' : '未命中') : '未查' }),
    layers: [
      treeOf({ roles: { done: [...insOrder] } }),
      stackOf(),
    ],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v1',
    sourceVersion: 'bst-recursive-v1',
    lines: L,
    steps,
    result,
    meta: { size: result.size, height: result.height },
  });
}

/* ------------------------------------------------------------------ 变体 2：迭代 + 父指针 */

function runV2(input) {
  const { ins, hasFind, target } = normInput(input);
  const L = LINES.v2;
  const steps = [];
  const ctl = makeTree();
  const { nodes, st } = ctl;
  const insOrder = [];
  const walk = []; // 比较路径（按访问顺序）
  let dupCount = 0;

  const lab = (id) => (id == null ? 'NULL' : nodes.get(id).label);

  const treeOf = (o = {}) => treeLayer({
    id: 'main',
    title: '二叉排序树',
    name: 'BSTree · while 下降 + parent 挂接',
    roots: st.root ? [st.root] : [],
    nodes: [...nodes.values()].map((n) => {
      const box = { id: n.id, label: n.label, value: `#${n.order + 1}` };
      if (n.left) box.left = n.left;
      if (n.right) box.right = n.right;
      return box;
    }),
    edgeTags: edgeTagsOf(nodes),
    roles: o.roles || {},
  });

  /** style 1 数组层：把"比较路径"摊平成一条序列，配合树上的指针一起看 */
  const pathOf = (extra = {}) => arrayLayer({
    id: 'path',
    title: '比较路径（按访问顺序）',
    name: 'BSTNode *path[]',
    values: walk.map((id) => nodes.get(id).label),
    labels: walk.map((_, i) => `第${i + 1}站`),
    roles: extra.roles || {},
  });

  const vars = (extra = {}) => ({
    插入序列: ins.length ? ins.join(', ') : '（空）',
    节点数: nodes.size,
    树高: heightOf(nodes, st.root),
    重复键: dupCount,
    比较次数: walk.length,
    ...extra,
  });

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: ins.length
      ? `迭代版：parent 始终指向"最后一个非空节点"，p 一直往下掉。等 p 变成 NULL 时，parent 就是新节点的父亲 —— 挂接因此只要一次指针赋值，不用递归返回。`
      : '插入序列为空：p = *T = NULL，while 一次都不进，parent 仍是 NULL，main 直接进查找。',
    vars: vars({ p: 'NULL', parent: 'NULL' }),
    layers: [treeOf(), pathOf()],
  }));

  for (const value of ins) {
    walk.length = 0;
    let parent = null;
    let p = st.root;
    let rejected = false;

    steps.push(step({
      event: 'init',
      lineId: 'init',
      note: `准备插入 ${value}：parent = NULL、p = ${p ? lab(p) : 'NULL'}（根）。下降过程中 parent 会一直跟着 p 落在后面一步。`,
      vars: vars({ key: value, p: p ? lab(p) : 'NULL', parent: 'NULL' }),
      layers: [
        treeOf({
          roles: p
            ? { done: [...insOrder], focus1: [p], pointers: [{ id: 'p', label: 'p', node: p }] }
            : { done: [...insOrder] },
        }),
        pathOf(),
      ],
    }));

    while (p) {
      const n = nodes.get(p);
      walk.push(p);
      steps.push(step({
        event: 'compare',
        lineId: 'cmp',
        note: `判等：p->data = ${n.label} 与 ${value} ${value === n.value ? '相等 → 直接 return NULL，重复键被拒绝' : '不等 → 记下 parent = ' + n.label + ' 再选方向'}。`,
        vars: vars({ key: value, p: n.label, parent: parent ? lab(parent) : 'NULL' }),
        layers: [
          treeOf({
            roles: {
              focus1: [p],
              done: [...insOrder],
              pointers: [
                { id: 'p', label: 'p', node: p },
                ...(parent ? [{ id: 'parent', label: 'parent', node: parent }] : []),
              ],
            },
          }),
          pathOf({ roles: { focus1: [walk.length - 1] } }),
        ],
      }));

      if (value === n.value) {
        dupCount++;
        rejected = true;
        steps.push(step({
          event: 'duplicate',
          lineId: 'cmp',
          note: `${n.label} 已存在：while 里判等成功即 return NULL。迭代版连 "parent 改挂" 的机会都没有，树一点没变。`,
          vars: vars({ key: value, p: n.label, parent: parent ? lab(parent) : 'NULL' }),
          layers: [
            treeOf({
              roles: {
                focus1: [p],
                focus2: [p],
                done: [...insOrder],
                pointers: [{ id: 'p', label: 'p', node: p }, { id: 'dup', label: '重复键', node: p }],
              },
            }),
            pathOf({ roles: { focus1: [walk.length - 1] } }),
          ],
        }));
        break;
      }

      const dir = value < n.value ? 'l' : 'r';
      const child = dir === 'l' ? n.left : n.right;
      parent = p;
      p = child;
      steps.push(step({
        event: dir === 'l' ? 'go-left' : 'go-right',
        lineId: dir === 'l' ? 'goLeft' : 'goRight',
        note: `${value} ${dir === 'l' ? '<' : '>'} ${n.label}：parent = ${n.label}，p 下移到${dir === 'l' ? '左' : '右'}孩子 ${child ? lab(child) : 'NULL（空链接，可以挂）'}。`,
        vars: vars({ key: value, p: p ? lab(p) : 'NULL', parent: lab(parent) }),
        layers: [
          treeOf({
            roles: {
              focus1: p ? [p] : [parent],
              focus2: [parent],
              done: [...insOrder],
              pointers: [
                { id: 'p', label: 'p', node: p || parent },
                { id: 'parent', label: 'parent', node: parent },
              ],
            },
          }),
          pathOf({ roles: { done: walk.map((_, i) => i) } }),
        ],
      }));
    }

    if (rejected) continue;

    const id = ctl.attach(value, parent, parent == null ? null : (value < nodes.get(parent).value ? 'l' : 'r'));
    insOrder.push(id);
    const lineId = parent == null ? 'root' : (value < nodes.get(parent).value ? 'linkL' : 'linkR');
    steps.push(step({
      event: 'attach',
      lineId,
      note: parent == null
        ? `循环跳出时 parent 还是 NULL → 说明树本来是空的：新节点 ${value} 直接当根。`
        : `跳出 while 时 p == NULL，parent = ${lab(parent)} 就是挂接点：按大小把它挂到 ${lab(parent)} 的${value < nodes.get(parent).value ? '左' : '右'}孩子上，一次赋值搞定。`,
      vars: vars({ key: value, p: 'NULL', parent: parent ? lab(parent) : 'NULL' }),
      layers: [
        treeOf({
          roles: {
            added: [id],
            focus1: [id],
            done: [...insOrder.slice(0, -1)],
            pointers: parent
              ? [{ id: 'parent', label: 'parent', node: parent }, { id: 'new', label: '新节点', node: id }]
              : [{ id: 'new', label: '新节点', node: id }],
          },
        }),
        pathOf({ roles: { done: walk.map((_, i) => i) } }),
      ],
    }));
  }

  // ---------------- 查找（迭代） ----------------
  walk.length = 0;
  let found = false;
  if (hasFind) {
    let p = st.root;
    steps.push(step({
      event: 'init',
      lineId: 'findLoop',
      note: `查找 ${target}：迭代版一个 while 走到底，p 每次只朝一边移动，走过的节点就是比较路径。`,
      vars: vars({ 查找: target, p: p ? lab(p) : 'NULL' }),
      layers: [
        treeOf({
          roles: p
            ? { done: [...insOrder], focus1: [p], pointers: [{ id: 'p', label: 'p', node: p }] }
            : { done: [...insOrder] },
        }),
        pathOf(),
      ],
    }));
    while (p && nodes.get(p).value !== target) {
      const n = nodes.get(p);
      walk.push(p);
      steps.push(step({
        event: 'compare',
        lineId: 'findLoop',
        note: `${n.label} ≠ ${target}：把 ${n.label} 记进路径，然后 ${target < n.value ? '往左' : '往右'}。`,
        vars: vars({ 查找: target, p: n.label }),
        layers: [
          treeOf({
            roles: {
              focus1: [p],
              done: [...insOrder],
              pointers: [{ id: 'p', label: 'p', node: p }],
            },
          }),
          pathOf({ roles: { focus1: [walk.length - 1] } }),
        ],
      }));
      const dir = target < n.value ? 'l' : 'r';
      const child = dir === 'l' ? n.left : n.right;
      steps.push(step({
        event: dir === 'l' ? 'go-left' : 'go-right',
        lineId: 'findLoop',
        note: `p = p->${dir === 'l' ? 'lchild' : 'rchild'} = ${child ? lab(child) : 'NULL'}。`,
        vars: vars({ 查找: target, p: child ? lab(child) : 'NULL' }),
        layers: [
          treeOf({
            roles: {
              focus1: child ? [child] : [p],
              focus2: [p],
              done: [...insOrder],
              pointers: [{ id: 'p', label: 'p', node: child || p }],
            },
          }),
          pathOf({ roles: { done: walk.map((_, i) => i) } }),
        ],
      }));
      p = child;
    }
    if (p) {
      walk.push(p);
      found = true;
      steps.push(step({
        event: 'hit',
        lineId: 'findRet',
        note: `while 条件是 p && p->data != k：现在 p->data == ${target}，循环停下并返回 p → 命中。`,
        vars: vars({ 查找: `${target}：命中`, p: lab(p) }),
        layers: [
          treeOf({
            roles: {
              focus1: [p],
              added: [p],
              done: [...insOrder],
              pointers: [{ id: 'p', label: 'p', node: p }],
            },
          }),
          pathOf({ roles: { done: walk.map((_, i) => i) } }),
        ],
      }));
    } else {
      steps.push(step({
        event: 'miss',
        lineId: 'findRet',
        note: `p 变成 NULL：返回 NULL，${target} 不在树里。注意没有回溯、没有第二遍扫描。`,
        vars: vars({ 查找: `${target}：未命中`, p: 'NULL' }),
        layers: [treeOf({ roles: { done: [...insOrder] } }), pathOf({ roles: { done: walk.map((_, i) => i) } })],
      }));
    }
  }

  const result = resultOf(ctl, dupCount, found, walk);
  steps.push(step({
    event: 'done',
    lineId: 'fnEnd',
    done: true,
    result,
    note: `完成：中序 = [${result.inorder.join(', ')}]，树高 ${result.height}，重复键拒绝 ${result.duplicate} 次${hasFind ? `，查找 ${target} ${found ? '命中路径 ' + walk.map(lab).join(' → ') : '未命中'}` : ''}。迭代版省掉递归返回，只用 p 和 parent 两个指针。`,
    vars: vars({ 中序: `[${result.inorder.join(', ')}]`, 查找: hasFind ? (found ? '命中' : '未命中') : '未查' }),
    layers: [treeOf({ roles: { done: [...insOrder] } }), pathOf({ roles: { done: walk.map((_, i) => i) } })],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v2',
    sourceVersion: 'bst-iter-parent-v1',
    lines: L,
    steps,
    result,
    meta: { size: result.size, height: result.height },
  });
}

/* ------------------------------------------------------------------ 变体 3：插入 + 中序校验 */

function runV3(input) {
  const { ins, hasFind, target } = normInput(input);
  const L = LINES.v3;
  const steps = [];
  const ctl = makeTree();
  const { nodes, st } = ctl;
  const insOrder = [];
  const path = []; // 显式路径栈：栈底 → 栈顶（栈顶 = 父节点）
  const verified = []; // 已通过中序校验的节点 id（按中序）
  let dupCount = 0;
  const searchWalk = [];

  const lab = (id) => (id == null ? 'NULL' : nodes.get(id).label);
  const inorderNow = () => inorderIds(nodes, st.root);

  const treeOf = (o = {}) => treeLayer({
    id: 'main',
    title: '二叉排序树',
    name: 'BSTree · 路径栈 + 中序校验',
    roots: st.root ? [st.root] : [],
    nodes: [...nodes.values()].map((n) => {
      const box = { id: n.id, label: n.label, value: `#${n.order + 1}` };
      if (n.left) box.left = n.left;
      if (n.right) box.right = n.right;
      return box;
    }),
    edgeTags: edgeTagsOf(nodes),
    roles: o.roles || {},
  });

  /** style 1 数组层：当前树的中序（校验阶段逐步点亮 done） */
  const inorderOf = (o = {}) => {
    const ids = inorderNow();
    return arrayLayer({
      id: 'inorder',
      title: o.title || '当前中序（严格递增才算 BST）',
      name: 'int inorder[n]',
      values: ids.map((id) => nodes.get(id).label),
      labels: ids.map((_, i) => `第${i + 1}位`),
      roles: o.roles || {},
    });
  };

  const vars = (extra = {}) => ({
    插入序列: ins.length ? ins.join(', ') : '（空）',
    节点数: nodes.size,
    树高: heightOf(nodes, st.root),
    重复键: dupCount,
    路径栈深: path.length,
    ...extra,
  });

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: ins.length
      ? `与前两个变体的差别：这里不用递归、也不用 parent 单指针，而是把整条下降路径压进 path[] 数组——跳出循环时**栈顶就是父节点**；建完树后再中序走一遍，用"严格递增"反证它确实是一棵 BST。`
      : '插入序列为空：一棵节点都没有，中序（空）当然递增，但查找必然未命中。',
    vars: vars({ key: '—' }),
    layers: [treeOf(), inorderOf()],
  }));

  for (const value of ins) {
    path.length = 0;
    let p = st.root;

    steps.push(step({
      event: 'init',
      lineId: 'descend',
      note: `插入 ${value}：p = ${p ? lab(p) : 'NULL'}，path[] 清空。下降时每经过一个节点就把它压进 path。`,
      vars: vars({ key: value, p: p ? lab(p) : 'NULL' }),
      layers: [
        treeOf({
          roles: p
            ? { done: [...insOrder], focus1: [p], pointers: [{ id: 'p', label: 'p', node: p }] }
            : { done: [...insOrder] },
        }),
        inorderOf(),
      ],
    }));

    let isDup = false;
    while (p && nodes.get(p).value !== value) {
      const n = nodes.get(p);
      path.push(p);
      steps.push(step({
        event: 'compare',
        lineId: 'walk',
        note: `${n.label} ≠ ${value}：把它压栈（path[${path.length - 1}] = ${n.label}），继续按大小往${value < n.value ? '左' : '右'}走。`,
        vars: vars({ key: value, p: n.label, 栈顶: n.label }),
        layers: [
          treeOf({
            roles: {
              focus1: [p],
              done: [...insOrder],
              pointers: [{ id: 'p', label: 'p', node: p }],
            },
          }),
          inorderOf(),
        ],
      }));
      const dir = value < n.value ? 'l' : 'r';
      const child = dir === 'l' ? n.left : n.right;
      steps.push(step({
        event: dir === 'l' ? 'go-left' : 'go-right',
        lineId: 'walk',
        note: `${value} ${dir === 'l' ? '<' : '>'} ${n.label} → p = p->${dir === 'l' ? 'lchild' : 'rchild'} = ${child ? lab(child) : 'NULL'}。`,
        vars: vars({ key: value, p: child ? lab(child) : 'NULL', 栈顶: n.label }),
        layers: [
          treeOf({
            roles: {
              focus1: child ? [child] : [p],
              focus2: [p],
              done: [...insOrder],
              pointers: [{ id: 'p', label: 'p', node: child || p }],
            },
          }),
          inorderOf(),
        ],
      }));
      p = child;
    }

    if (p) {
      isDup = true;
      dupCount++;
      steps.push(step({
        event: 'duplicate',
        lineId: 'dup',
        note: `while 因"键相等"停下（p 非空）→ ++rejected 后 continue。重复键既不挂左也不挂右，树形与中序都不变。`,
        vars: vars({ key: value, p: lab(p), 拒绝: dupCount }),
        layers: [
          treeOf({
            roles: {
              focus1: [p],
              focus2: [p],
              done: [...insOrder],
              pointers: [{ id: 'p', label: 'p', node: p }, { id: 'dup', label: '重复键', node: p }],
            },
          }),
          inorderOf(),
        ],
      }));
    }

    if (isDup) continue;

    const parentId = path.length ? path[path.length - 1] : null;
    const side = parentId == null ? null : (value < nodes.get(parentId).value ? 'l' : 'r');
    const id = ctl.attach(value, parentId, side);
    insOrder.push(id);
    {
      steps.push(step({
        event: 'attach',
        lineId: parentId == null ? 'root' : (side === 'l' ? 'link' : 'linkR'),
        note: parentId == null
          ? `path 为空（d == 0）→ 树本来是空的，新节点 ${value} 当根。`
          : `path 栈顶 ${lab(parentId)} 就是父节点：按大小把 ${value} 挂成它的${side === 'l' ? '左' : '右'}孩子。整个插入过程一次向下遍历，路径栈替我们记下了父节点。`,
        vars: vars({ key: value, p: 'NULL', 栈顶: parentId ? lab(parentId) : '（空）' }),
        layers: [
          treeOf({
            roles: {
              added: [id],
              focus1: [id],
              done: [...insOrder.slice(0, -1)],
              pointers: parentId
                ? [{ id: 'parent', label: 'path[栈顶]', node: parentId }, { id: 'new', label: '新节点', node: id }]
                : [{ id: 'new', label: '新节点', node: id }],
            },
          }),
          inorderOf(),
        ],
      }));
    }
  }

  // ---------------- 中序校验：严格递增 ----------------
  const inorderIdsNow = inorderNow();
  verified.length = 0;
  steps.push(step({
    event: 'init',
    lineId: 'verifyFn',
    note: `插入结束，共 ${nodes.size} 个节点。现在做 BST_Verify：中序遍历一次，只要每个节点都**大于前驱**，就证明整棵树满足"左小右大"。`,
    vars: vars({ 校验: '开始', 中序长度: inorderIdsNow.length }),
    layers: [treeOf({ roles: { done: [...insOrder] } }), inorderOf()],
  }));

  let prev = null;
  let ok = true;
  for (let i = 0; i < inorderIdsNow.length; i++) {
    const id = inorderIdsNow[i];
    const n = nodes.get(id);
    const pass = prev == null || n.value > prev.value;
    if (!pass) ok = false;
    steps.push(step({
      event: 'compare',
      lineId: 'verify',
      note: prev == null
        ? `中序第 1 位是 ${n.label}：没有前驱，直接作为比较基准。`
        : `中序第 ${i + 1} 位 ${n.label} vs 前驱 ${prev.label}：${pass ? `${n.value} > ${prev.value}，递增关系成立 ✓` : `${n.value} ≤ ${prev.value}，说明挂错了位置 ✗`}。`,
      vars: vars({ 校验: `第 ${i + 1}/${inorderIdsNow.length} 位`, 前驱: prev ? prev.label : '—' }),
      layers: [
        treeOf({
          roles: {
            focus1: [id],
            ...(prev ? { focus2: [prev.id] } : {}),
            done: [...insOrder],
            pointers: [
              { id: 'cur', label: 'cur', node: id },
              ...(prev ? [{ id: 'prev', label: 'prev', node: prev.id }] : []),
            ],
          },
        }),
        inorderOf({ roles: { done: inorderIdsNow.slice(0, i).map((_, k) => k), focus1: [i] } }),
      ],
    }));
    verified.push(id);
    prev = n;
  }

  steps.push(step({
    event: 'compare',
    lineId: 'stat',
    note: `校验${ok ? '通过' : '失败'}：中序 [${inorderIdsNow.map(lab).join(', ')}] ${ok ? '严格递增 → 确实是一棵二叉排序树' : '并不递增 → 建树有错'}。同时统计：树高 ${heightOf(nodes, st.root)}，重复键拒绝 ${dupCount} 次。`,
    vars: vars({ 校验: ok ? '通过' : '失败' }),
    layers: [
      treeOf({ roles: { done: [...insOrder] } }),
      inorderOf({ roles: { done: inorderIdsNow.map((_, k) => k) } }),
    ],
  }));

  // ---------------- 查找（路径栈版） ----------------
  let found = false;
  if (hasFind) {
    let p = st.root;
    steps.push(step({
      event: 'init',
      lineId: 'searchLoop',
      note: `查找 ${target}：仍然是一条 while 走到空链接或相等为止。`,
      vars: vars({ 查找: target, p: p ? lab(p) : 'NULL' }),
      layers: [
        treeOf({
          roles: p ? { done: [...insOrder], focus1: [p], pointers: [{ id: 'p', label: 'p', node: p }] } : { done: [...insOrder] },
        }),
        inorderOf({ roles: { done: inorderIdsNow.map((_, k) => k) } }),
      ],
    }));
    while (p && nodes.get(p).value !== target) {
      const n = nodes.get(p);
      searchWalk.push(p);
      const dir = target < n.value ? 'l' : 'r';
      const child = dir === 'l' ? n.left : n.right;
      steps.push(step({
        event: dir === 'l' ? 'go-left' : 'go-right',
        lineId: 'searchLoop',
        note: `${n.label} ≠ ${target}：记入路径后 ${target < n.value ? '往左' : '往右'}，p = ${child ? lab(child) : 'NULL'}。`,
        vars: vars({ 查找: target, p: child ? lab(child) : 'NULL' }),
        layers: [
          treeOf({
            roles: {
              focus1: child ? [child] : [p],
              focus2: [p],
              done: [...insOrder],
              pointers: [{ id: 'p', label: 'p', node: child || p }],
            },
          }),
          inorderOf({ roles: { done: inorderIdsNow.map((_, k) => k) } }),
        ],
      }));
      p = child;
    }
    if (p) {
      searchWalk.push(p);
      found = true;
      steps.push(step({
        event: 'hit',
        lineId: 'searchRet',
        note: `p->data == ${target} → 返回该节点，命中。校验过的中序里也能看到 ${target} 排在正确的递增位置上。`,
        vars: vars({ 查找: `${target}：命中`, p: lab(p) }),
        layers: [
          treeOf({
            roles: {
              focus1: [p],
              added: [p],
              done: [...insOrder],
              pointers: [{ id: 'p', label: 'p', node: p }],
            },
          }),
          inorderOf({ roles: { done: inorderIdsNow.map((_, k) => k) } }),
        ],
      }));
    } else {
      steps.push(step({
        event: 'miss',
        lineId: 'searchRet',
        note: `p == NULL → 返回 NULL，${target} 不在树里。`,
        vars: vars({ 查找: `${target}：未命中`, p: 'NULL' }),
        layers: [treeOf({ roles: { done: [...insOrder] } }), inorderOf({ roles: { done: inorderIdsNow.map((_, k) => k) } })],
      }));
    }
  }

  const result = resultOf(ctl, dupCount, found, searchWalk);
  steps.push(step({
    event: 'done',
    lineId: 'main',
    done: true,
    result,
    note: `完成：中序校验 ${ok ? '通过' : '失败'} → [${result.inorder.join(', ')}]，树高 ${result.height}，重复键拒绝 ${result.duplicate} 次${hasFind ? `，查找 ${target} ${found ? '命中' : '未命中'}` : ''}。这条"建完再中序验一遍"的路子多了 O(n) 一次遍历，换来的是对 BST 性质的可检验证据。`,
    vars: vars({ 中序: `[${result.inorder.join(', ')}]`, 校验: ok ? '通过' : '失败', 查找: hasFind ? (found ? '命中' : '未命中') : '未查' }),
    layers: [
      treeOf({ roles: { done: [...insOrder] } }),
      inorderOf({ roles: { done: inorderNow().map((_, k) => k) } }),
    ],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v3',
    sourceVersion: 'bst-inorder-verify-v1',
    lines: L,
    steps,
    result,
    meta: { size: result.size, height: result.height, verified: ok },
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
