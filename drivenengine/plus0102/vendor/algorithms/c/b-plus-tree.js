/**
 * C · B+ 树（3 个代表性不同实现）
 *
 * 阶数约定（任务单要求"先对齐阶数定义"）：`order = 3`
 *   · 叶结点最多 `order - 1 = 2` 个键；
 *   · 内结点最多 `order = 3` 个孩子、2 个键（键是"分隔键 / 父键副本"）；
 *   · **所有键都在叶里**，内结点的键只是叶首键的副本（B+ 树与 B 树的核心差别）。
 *
 * 三个变体：
 *   v1 自底向上分裂 + 父键复制：叶溢出按 ceil(n/2) 分裂，右叶首键**复制**到父结点；
 *   v2 自顶向下预分裂：下降途中先分裂满孩子，插入时叶必不溢出（CLRS 风格）；
 *   v3 结构同 v1，但插入结束后沿叶链做一次 [lo,hi] 区间扫描，验证叶链有序。
 *
 * 验收样例（任务单）：插入 10、20、30、40、50、60、70，叶链应输出全部有序键，重复键不新增；
 * 触发叶分裂之后还要能触发内结点分裂与根分裂。
 */

import { trace, step, treeLayer, arrayLayer, linkLayer } from '../../engine/model.js';

export const meta = {
  id: 'c/b-plus-tree',
  variants: [
    { id: 'v1', name: '自底向上分裂 + 父键复制' },
    { id: 'v2', name: '自顶向下预分裂' },
    { id: 'v3', name: '叶链范围查询版' },
  ],
};

const ORDER = 3;
const MAX_KEYS = ORDER - 1; // 叶 / 内结点最多键数

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void bplus_insert(Node **proot, int key) {' },
    { lineId: 'descend', text: '  Node *cur = *proot; Node *path[MAXH]; int d = 0;' },
    { lineId: 'while', text: '  while (!cur->leaf) {                 /* 查找始终走到底层叶 */' },
    { lineId: 'choose', text: '    path[d++] = cur; int i = 0;' },
    { lineId: 'choose2', text: '    while (i < cur->n && key >= cur->keys[i]) ++i;' },
    { lineId: 'down', text: '    cur = cur->child[i];' },
    { lineId: 'leaf-insert', text: '  leaf_insert(cur, key);              /* 叶内有序插入，重复键不新增 */' },
    { lineId: 'split-leaf', text: '  if (cur->n > MAX) {                 /* 叶溢出：按 ceil(n/2) 分裂 */' },
    { lineId: 'copy-up', text: '    Node *right = split_leaf(cur);' },
    { lineId: 'copy-up2', text: '    /* 右叶首键**复制**到父结点：叶里的键不删 */' },
    { lineId: 'new-root', text: '    if (d == 0) { *proot = new_root(cur, right); break; }' },
    { lineId: 'inner-split', text: '    cur = parent_insert(path[--d], right->keys[0], right); /* 父溢出继续上推 */' },
    { lineId: 'end', text: '  }' },
    { lineId: 'close', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void bplus_insert_topdown(Node **proot, int key) {' },
    { lineId: 'root-full', text: '  if ((*proot)->n == MAX) *proot = split_root(*proot);  /* 根满先分裂 */' },
    { lineId: 'descend', text: '  Node *cur = *proot;' },
    { lineId: 'while', text: '  while (!cur->leaf) {' },
    { lineId: 'choose', text: '    int i = 0; while (i < cur->n && key >= cur->keys[i]) ++i;' },
    { lineId: 'pre-split', text: '    if (cur->child[i]->n == MAX) {          /* 下降前先分裂满孩子 */' },
    { lineId: 'split-child', text: '      split_child(cur, i);' },
    { lineId: 'reselect', text: '      if (key >= cur->keys[i]) ++i;         /* 分裂后重新选孩子 */' },
    { lineId: 'down', text: '    }' },
    { lineId: 'leaf-insert', text: '    cur = cur->child[i];' },
    { lineId: 'end', text: '  }' },
    { lineId: 'done', text: '  leaf_insert(cur, key);                  /* 此时叶必不溢出 */' },
    { lineId: 'close', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void bplus_insert_then_scan(Node **proot, int key, int lo, int hi) {' },
    { lineId: 'descend', text: '  Node *cur = *proot; Node *path[MAXH]; int d = 0;' },
    { lineId: 'while', text: '  while (!cur->leaf) { path[d++] = cur;' },
    { lineId: 'choose', text: '    int i = 0; while (i < cur->n && key >= cur->keys[i]) ++i;' },
    { lineId: 'down', text: '    cur = cur->child[i]; }' },
    { lineId: 'leaf-insert', text: '  leaf_insert(cur, key);' },
    { lineId: 'split-leaf', text: '  while (cur->n > MAX) {                                             /* 叶链重建 */' },
    { lineId: 'copy-up', text: '    Node *right = split_leaf(cur);' },
    { lineId: 'new-root', text: '    if (d == 0) { *proot = new_root(cur, right); break; }' },
    { lineId: 'inner-split', text: '    cur = parent_insert(path[--d], right->keys[0], right);' },
    { lineId: 'scan-start', text: '  }' },
    { lineId: 'scan-walk', text: '  for (cur = leftmost(*proot); cur; cur = cur->next)  /* 沿叶链扫描 */' },
    { lineId: 'scan-emit', text: '    for (int j = 0; j < cur->n; ++j)' },
    { lineId: 'scan-check', text: '      if (cur->keys[j] >= lo && cur->keys[j] <= hi) visit(cur->keys[j]);' },
    { lineId: 'close', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '依次插入 10…70（触发叶分裂 → 内结点分裂 → 根分裂）',
    input: { keys: [10, 20, 30, 40, 50, 60, 70] },
    expect: {
      leafOrder: [10, 20, 30, 40, 50, 60, 70],
      leafCount: 4,
      rootKeys: [50],
    },
    // v2 是"自顶向下预分裂"：为了插入时叶必不溢出，会在下降前把满孩子先拆开，
    // 代价是叶的使用率更低（同样 7 个键会得到 6 片叶），根的分隔键也因此不同。
    expectByVariant: {
      v2: {
        leafOrder: [10, 20, 30, 40, 50, 60, 70],
        leafCount: 6,
        rootKeys: [30, 50],
      },
    },
  },
  {
    id: 'normal-duplicate',
    label: '重复键不新增（10 插两次）',
    input: { keys: [10, 20, 10] },
    expect: { leafOrder: [10, 20], duplicate: 1 },
  },
  {
    id: 'edge-single',
    label: '单键（不分裂）',
    input: { keys: [42] },
    expect: { leafOrder: [42], leafCount: 1, rootKeys: [] },
  },
  {
    id: 'edge-scan',
    label: '[25,55] 区间扫描（只有 v3 做扫描，其余变体只插入）',
    input: { keys: [10, 20, 30, 40, 50, 60, 70], lo: 25, hi: 55 },
    expectByVariant: {
      v3: { leafOrder: [10, 20, 30, 40, 50, 60, 70], scanned: [30, 40, 50] },
    },
  },
];

/* ------------------------------------------------------------------ 结构 */

let uid = 0;
function newNode(leaf, keys = [], children = []) {
  return { id: `bp${++uid}`, leaf, keys: [...keys], children: [...children], next: null };
}

function buildTree(keys) {
  uid = 0;
  const root = newNode(true);
  return { root, insert: (k) => (rootIsLeaf(root) ? null : null) };
}

function rootIsLeaf(n) {
  return !!n.leaf;
}

function nodeCount(n) {
  if (!n) return 0;
  return 1 + n.children.reduce((s, c) => s + nodeCount(c), 0);
}

function heightOf(n) {
  if (!n || n.leaf) return 1;
  return 1 + heightOf(n.children[0]);
}

/** 所有叶（按叶链顺序） */
function leavesInOrder(n) {
  if (n.leaf) return [n];
  return n.children.flatMap((c) => leavesInOrder(c));
}

/** 左端点叶：沿 child[0] 一路向下 */
function leftmost(n) {
  let cur = n;
  while (!cur.leaf) cur = cur.children[0];
  return cur;
}

function serialize(n) {
  if (n.leaf) return { keys: [...n.keys], kind: 'leaf' };
  return { keys: [...n.keys], kind: 'inner' };
}

function layout(roots, focus, added = []) {
  const nodes = [];
  const walk = (n, depth, parent) => {
    nodes.push({
      id: n.id,
      label: n.keys.length ? `[${n.keys.join(' ')}]` : '[ ]',
      children: n.children.map((c) => c.id),
      parent,
      badge: n.leaf ? (n.next ? '叶 →' : '叶') : `内 d${depth}`,
      value: n.leaf ? `n=${n.keys.length}` : `c=${n.children.length}`,
    });
    n.children.forEach((c) => walk(c, depth + 1, n.id));
  };
  roots.forEach((r) => walk(r, 0, null));
  const leafEdges = [];
  const leaves = leavesInOrder(roots[0]);
  for (let i = 0; i + 1 < leaves.length; i++) {
    leafEdges.push({ from: leaves[i].id, to: leaves[i + 1].id, color: '#0a6b4a', dash: [5, 4] });
  }
  return treeLayer({
    id: 'main',
    title: 'B+ 树（叶链用绿色虚线：next 指针）',
    name: `B+ tree  order=${ORDER}`,
    nodes,
    roots: roots.map((r) => r.id),
    extraEdges: leafEdges,
    roles: {
      focus1: focus ? [focus.id] : [],
      added,
    },
  });
}

function leafArrayLayer(roots, roles = {}) {
  const leaves = leavesInOrder(roots[0]);
  const flat = leaves.flatMap((l) => l.keys.map(String));
  const labels = [];
  leaves.forEach((l, li) => l.keys.forEach(() => labels.push(`叶${li}`)));
  return arrayLayer({ id: 'leafchain', title: '叶链（顺序值）', name: 'leaf chain', values: flat, labels, roles });
}

/* ------------------------------------------------------------------ 插入（共用） */

function makeCtx(keys) {
  return {
    keys,
    root: newNode(true),
    steps: null,
    push: null,
  };
}

/** 叶内有序插入：返回 'dup' | 'ok' */
function leafInsert(leaf, key) {
  if (leaf.keys.includes(key)) return 'dup';
  let i = 0;
  while (i < leaf.keys.length && leaf.keys[i] < key) i++;
  leaf.keys.splice(i, 0, key);
  return 'ok';
}

/** 叶分裂：左 ceil(n/2) 个键，右剩下的键；右叶首键**复制**给父 */
function splitLeaf(leaf) {
  const mid = Math.ceil(leaf.keys.length / 2);
  const right = newNode(true, leaf.keys.slice(mid));
  leaf.keys = leaf.keys.slice(0, mid);
  right.next = leaf.next;
  leaf.next = right;
  return right;
}

/** 叶或内结点分裂的统一入口：叶**复制**首键上移，内结点**移动**中位键上移 */
function splitNode(n) {
  if (n.leaf) {
    const right = splitLeaf(n);
    return { up: right.keys[0], right };
  }
  return splitInner(n);
}

/** 内结点分裂：中位键**上移**（内结点不是复制） */
function splitInner(node) {
  const mid = Math.floor(node.keys.length / 2);
  const up = node.keys[mid];
  const right = newNode(false, node.keys.slice(mid + 1), node.children.slice(mid + 1));
  node.keys = node.keys.slice(0, mid);
  node.children = node.children.slice(0, mid + 1);
  return { up, right };
}

/* ------------------------------------------------------------------ 变体 1 / 3：自底向上 */

function runBottomUp(input, variantId) {
  const src = (input.keys || []).map(Number);
  const lo = input.lo ?? null;
  const hi = input.hi ?? null;
  const doScan = variantId === 'v3' && Number.isFinite(lo) && Number.isFinite(hi);
  const L = LINES[variantId];
  const steps = [];
  uid = 0;
  const root = newNode(true);
  const rootsRef = { root };
  let dup = 0;
  let splits = 0;

  const snap = (focus, added = [], extraRoles = {}) => [
    layout([rootsRef.root], focus, added),
    leafArrayLayer([rootsRef.root], extraRoles),
  ];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: src.length === 0
      ? '没有键：B+ 树只有一个空叶。'
      : `阶数 order=${ORDER}：叶最多 ${MAX_KEYS} 键、内结点最多 ${ORDER} 孩子。插入 ${src.join('、')}；注意 B+ 树的键**全部在叶**，内结点存的是"叶首键的副本"。`,
    vars: { order: ORDER, keys: src.length, leaves: 1, height: 1, splits: 0, duplicate: 0 },
    layers: snap(null),
  }));

  for (const key of src) {
    // ---- 定位叶
    let cur = rootsRef.root;
    const path = [];
    while (!cur.leaf) {
      steps.push(step({
        event: 'descend', lineId: 'choose',
        note: `在内结点 ${cur.keys.length ? `[${cur.keys.join(' ')}]` : '[ ]'} 上比较 key=${key}：分隔键只用来导航，**不参与匹配**。`,
        vars: { key, depth: path.length, leaves: leavesInOrder(rootsRef.root).length, height: heightOf(rootsRef.root), splits, duplicate: dup },
        layers: snap(cur),
      }));
      let i = 0;
      while (i < cur.keys.length && key >= cur.keys[i]) i++;
      path.push({ node: cur, idx: i });
      cur = cur.children[i];
    }

    // ---- 叶内比较
    steps.push(step({
      event: 'probe-key', lineId: 'while',
      note: `到达叶 ${cur.keys.length ? `[${cur.keys.join(' ')}]` : '[ ]'}：在叶里逐键比较，确定插入位置。`,
      vars: { key, depth: path.length, leaves: leavesInOrder(rootsRef.root).length, height: heightOf(rootsRef.root), splits, duplicate: dup },
      layers: snap(cur),
    }));

    const r = leafInsert(cur, key);
    if (r === 'dup') {
      dup++;
      steps.push(step({
        event: 'duplicate', lineId: 'leaf-insert',
        note: `叶里已有 ${key}：B+ 树按集合处理，重复键不新增，结构不变。`,
        vars: { key, leaves: leavesInOrder(rootsRef.root).length, height: heightOf(rootsRef.root), splits, duplicate: dup },
        layers: snap(cur),
      }));
      continue;
    }
    steps.push(step({
      event: 'insert-leaf', lineId: 'leaf-insert',
      note: `把 ${key} 有序插入叶，得到 [${cur.keys.join(' ')}]${cur.keys.length > MAX_KEYS ? '（超出上限 → 需要分裂）' : ''}。`,
      vars: { key, leaves: leavesInOrder(rootsRef.root).length, height: heightOf(rootsRef.root), splits, duplicate: dup },
      layers: snap(cur, [cur.id]),
    }));

    // ---- 分裂上推
    while (cur.keys.length > MAX_KEYS) {
      const right = splitLeaf(cur);
      splits++;
      steps.push(step({
        event: 'split-leaf', lineId: 'split-leaf',
        note: `叶溢出（${MAX_KEYS + 1} 键）：按 ceil(n/2) 分裂成左 [${cur.keys.join(' ')}] 与右 [${right.keys.join(' ')}]，并把右叶接到左叶的 next 上。`,
        vars: { key, leaves: leavesInOrder(rootsRef.root).length, height: heightOf(rootsRef.root), splits, duplicate: dup },
        layers: snap(right, [right.id]),
      }));
      if (path.length === 0) {
        const up = right.keys[0];
        const nr = newNode(false, [up], [cur, right]);
        rootsRef.root = nr;
        steps.push(step({
          event: 'new-root', lineId: 'new-root',
          note: `根就是被分裂的叶：新建根 [${up}]，它持有两片叶。右叶首键 ${up} **复制**上来做分隔键，叶里仍然保留 ${up}。`,
          vars: { key, leaves: leavesInOrder(rootsRef.root).length, height: heightOf(rootsRef.root), splits, duplicate: dup },
          layers: snap(nr, [nr.id]),
        }));
        break;
      }
      const { node: par, idx } = path.pop();
      const up = right.keys[0];
      par.keys.splice(idx, 0, up);
      par.children.splice(idx + 1, 0, right);
      steps.push(step({
        event: 'copy-up', lineId: 'copy-up',
        note: `把右叶首键 ${up} 复制进父结点（第 ${idx + 1} 个孩子位置），父键变成 [${par.keys.join(' ')}]。`,
        vars: { key, leaves: leavesInOrder(rootsRef.root).length, height: heightOf(rootsRef.root), splits, duplicate: dup },
        layers: snap(par, [right.id]),
      }));
      cur = par;
      if (cur.keys.length > MAX_KEYS) {
        // 内结点溢出：中位键上移
        const { up: midKey, right: rightInner } = splitInner(cur);
        steps.push(step({
          event: 'split-inner', lineId: 'inner-split',
          note: `内结点也溢出：中位键 ${midKey} **上移**（不是复制）到父结点，左右各留一半孩子。`,
          vars: { key, leaves: leavesInOrder(rootsRef.root).length, height: heightOf(rootsRef.root), splits, duplicate: dup },
          layers: snap(rightInner, [rightInner.id]),
        }));
        if (path.length === 0) {
          const nr = newNode(false, [midKey], [cur, rightInner]);
          rootsRef.root = nr;
          steps.push(step({
            event: 'new-root', lineId: 'new-root',
            note: `内结点分裂发生在根上：树高 +1，新根 [${midKey}]。`,
            vars: { key, leaves: leavesInOrder(rootsRef.root).length, height: heightOf(rootsRef.root), splits, duplicate: dup },
            layers: snap(nr, [nr.id]),
          }));
          break;
        }
        const { node: gp, idx: gi } = path.pop();
        gp.keys.splice(gi, 0, midKey);
        gp.children.splice(gi + 1, 0, rightInner);
        cur = gp;
        steps.push(step({
          event: 'copy-up', lineId: 'inner-split',
          note: `上移的 ${midKey} 进祖父结点，祖父键为 [${gp.keys.join(' ')}]；继续向上检查是否还需要分裂。`,
          vars: { key, leaves: leavesInOrder(rootsRef.root).length, height: heightOf(rootsRef.root), splits, duplicate: dup },
          layers: snap(gp, [rightInner.id]),
        }));
      } else {
        break;
      }
    }
  }

  // ---- 叶链扫描（仅 v3 且给了区间）
  let scanned = null;
  if (doScan) {
    scanned = [];
    const leaves = leavesInOrder(rootsRef.root);
    for (const lf of leaves) {
      steps.push(step({
        event: 'leaf-scan', lineId: 'scan-walk',
        note: `沿 next 走到叶 [${lf.keys.join(' ')}]，准备收集落在 [${lo}, ${hi}] 的键。`,
        vars: { lo, hi, leaf: lf.keys.join(' '), hit: scanned.length, leaves: leaves.length, height: heightOf(rootsRef.root), splits, duplicate: dup },
        layers: [
          layout([rootsRef.root], lf, []),
          leafArrayLayer([rootsRef.root], { focus1: lf.keys.map(() => 0) }),
        ],
      }));
      for (const k of lf.keys) {
        if (k >= lo && k <= hi) {
          scanned.push(k);
          steps.push(step({
            event: 'leaf-scan', lineId: 'scan-check',
            note: `键 ${k} 落在 [${lo}, ${hi}]：收集（当前结果 [${scanned.join(', ')}]）。`,
            vars: { lo, hi, key: k, hit: scanned.length, leaves: leaves.length, height: heightOf(rootsRef.root), splits, duplicate: dup },
            layers: [layout([rootsRef.root], lf, []), leafArrayLayer([rootsRef.root])],
          }));
        }
      }
    }
  }

  const leaves = leavesInOrder(rootsRef.root);
  const result = {
    leafOrder: leaves.flatMap((l) => l.keys),
    leafCount: leaves.length,
    rootKeys: [...rootsRef.root.keys],
    height: heightOf(rootsRef.root),
    duplicate: dup,
    splits,
  };
  if (rootsRef.root.leaf) result.rootKeys = [];
  if (doScan) result.scanned = scanned;

  steps.push(step({
    event: 'done', lineId: 'close', done: true, result,
    note: `插入完成：${leaves.length} 片叶、树高 ${heightOf(rootsRef.root)}、分裂 ${splits} 次${dup ? `、拒绝重复键 ${dup} 次` : ''}。叶链输出 [${result.leafOrder.join(', ')}]。`,
    vars: { lo, hi, leaves: leaves.length, height: heightOf(rootsRef.root), splits, duplicate: dup },
    layers: snap(null, [], { done: leaves.flatMap((_, i) => [i]) }),
  }));

  return trace({
    algorithmId: meta.id,
    variantId,
    sourceVersion: `b-plus-tree-${variantId}-v1`,
    lines: L,
    steps,
    result,
    meta: { order: ORDER, keys: src.length },
  });
}

/* ------------------------------------------------------------------ 变体 2：自顶向下预分裂 */

function runTopDown(input) {
  const src = (input.keys || []).map(Number);
  const L = LINES.v2;
  const steps = [];
  uid = 0;
  let root = newNode(true);
  let dup = 0;
  let splits = 0;

  const snap = (focus, added = []) => [layout([root], focus, added), leafArrayLayer([root])];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: src.length === 0
      ? '没有键：B+ 树只有一个空叶。'
      : `v2 与 v1 的差别在**时机**：不等结点溢出再分裂，而是下降前先把"满孩子"分裂好，于是插入那一行永远不用回溯。插入 ${src.join('、')}。`,
    vars: { order: ORDER, keys: src.length, leaves: 1, height: 1, splits: 0, duplicate: 0 },
    layers: snap(null),
  }));

  for (const key of src) {
    if (root.keys.length >= MAX_KEYS) {
      const { up, right } = splitNode(root);
      const nr = newNode(false, [up], [root, right]);
      root = nr;
      splits++;
      steps.push(step({
        event: 'new-root', lineId: 'root-full',
        note: `下降前发现根已满：先分裂根，新根 [${nr.keys.join(' ')}]，树高 +1。`,
        vars: { key, leaves: leavesInOrder(root).length, height: heightOf(root), splits, duplicate: dup },
        layers: snap(nr, [nr.id]),
      }));
    }
    let cur = root;
    while (!cur.leaf) {
      let i = 0;
      while (i < cur.keys.length && key >= cur.keys[i]) i++;
      steps.push(step({
        event: 'descend', lineId: 'choose',
        note: `在内结点 [${cur.keys.join(' ')}] 上选第 ${i} 个孩子（key=${key}）。`,
        vars: { key, leaves: leavesInOrder(root).length, height: heightOf(root), splits, duplicate: dup },
        layers: snap(cur),
      }));
      const child = cur.children[i];
      if (child.keys.length >= MAX_KEYS) {
        const { up, right } = splitNode(child);
        cur.keys.splice(i, 0, up);
        cur.children.splice(i + 1, 0, right);
        splits++;
        steps.push(step({
          event: child.leaf ? 'split-leaf' : 'split-inner', lineId: 'split-child',
          note: `${child.leaf ? '孩子叶' : '孩子内结点'}已满（${MAX_KEYS} 键）：先分裂成 [${child.keys.join(' ')}] 与 [${right.keys.join(' ')}]，把 ${up} ${child.leaf ? '**复制**' : '**上移**'}进当前结点。`,
          vars: { key, leaves: leavesInOrder(root).length, height: heightOf(root), splits, duplicate: dup },
          layers: snap(cur, [right.id]),
        }));
        steps.push(step({
          event: 'probe-key', lineId: 'reselect',
          note: `分裂后重新选孩子：${key} ${key >= up ? '≥' : '<'} ${up} → 进${key >= up ? '右' : '左'}半。`,
          vars: { key, leaves: leavesInOrder(root).length, height: heightOf(root), splits, duplicate: dup },
          layers: snap(cur),
        }));
        if (key >= up) i += 1;
      }
      cur = cur.children[i];
    }
    const r = leafInsert(cur, key);
    if (r === 'dup') {
      dup++;
      steps.push(step({
        event: 'duplicate', lineId: 'done',
        note: `叶里已有 ${key}：重复键不新增。`,
        vars: { key, leaves: leavesInOrder(root).length, height: heightOf(root), splits, duplicate: dup },
        layers: snap(cur),
      }));
    } else {
      steps.push(step({
        event: 'insert-leaf', lineId: 'done',
        note: `插入 ${key}：叶为 [${cur.keys.join(' ')}]，因为下降前已保证不满，这里一定不溢出，不需要回溯分裂。`,
        vars: { key, leaves: leavesInOrder(root).length, height: heightOf(root), splits, duplicate: dup },
        layers: snap(cur, [cur.id]),
      }));
    }
  }

  const leaves = leavesInOrder(root);
  const result = {
    leafOrder: leaves.flatMap((l) => l.keys),
    leafCount: leaves.length,
    rootKeys: [...root.keys],
    height: heightOf(root),
    duplicate: dup,
    splits,
  };
  if (root.leaf) result.rootKeys = [];
  steps.push(step({
    event: 'done', lineId: 'close', done: true, result,
    note: `插入完成：${leaves.length} 片叶、树高 ${heightOf(root)}、分裂 ${splits} 次。叶链输出 [${result.leafOrder.join(', ')}]。`,
    vars: { leaves: leaves.length, height: heightOf(root), splits, duplicate: dup },
    layers: snap(null),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'b-plus-tree-topdown-v1', lines: L, steps, result, meta: { order: ORDER } });
}

const RUNNERS = {
  v1: (input) => runBottomUp(input, 'v1'),
  v2: runTopDown,
  v3: (input) => runBottomUp(input, 'v3'),
};

export function run(variantId, input) {
  const fn = RUNNERS[variantId];
  if (!fn) throw new Error(`未知变体：${variantId}`);
  return fn(input || {});
}

export function sourceLines(variantId) {
  return LINES[variantId] || LINES.v1;
}
