/**
 * C · B 树（最小度数 t，每结点最多 2t-1 个键、最多 2t 个孩子）
 *
 * 三个变体的插入策略真的不同，最终树形也会合理不同：
 *   v1 插入 + 事后分裂：先落到叶结点插进去，再沿父链检查 n > 2t-1，溢出就把中间键提上去；
 *   v2 自顶向下预分裂：下降途中遇到"满孩子"先分裂再进入（CLRS 版），到叶时一定有空间；
 *   v3 自底向上批量装载：键先排序去重，把叶按上限填满，再逐层把孩子首键复制成父键。
 *
 * 画面：主层 style 9（一个 B 树结点 = 一个树节点，label 是键数组如 '[5 6]'，
 * 孩子按 C0/C1… 标注），副层 style 1（待插入键序列 + 当前 key 指针）。
 */

import { trace, step, arrayLayer, treeLayer } from '../../engine/model.js';

export const meta = {
  id: 'c/b-tree',
  variants: [
    { id: 'v1', name: '插入 + 事后分裂' },
    { id: 'v2', name: '自顶向下预分裂' },
    { id: 'v3', name: '自底向上批量装载' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void btree_insert(BTree *T, int key) {' },
    { lineId: 'find', text: '  Node *p = descend_to_leaf(T, key);      /* 按区间一路下降到叶 */' },
    { lineId: 'probe', text: '    for (i = 0; i < p->n; ++i) if (key == p->key[i]) return DUPLICATE;' },
    { lineId: 'insert', text: '  insert_key_sorted(p, key);            /* 先插进去，再回头收拾溢出 */' },
    { lineId: 'check', text: '  while (p && p->n > 2*t - 1) {         /* 事后检查溢出 */' },
    { lineId: 'split', text: '    Node *right, int up; split_at_middle(p, &right, &up);' },
    { lineId: 'promote', text: '    if (p->parent) insert_into_parent(p->parent, up, p, right);' },
    { lineId: 'newroot', text: '    else T->root = make_root(up, p, right);   /* 根分裂：树长高一层 */' },
    { lineId: 'check-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void btree_insert_presplit(BTree *T, int key) {' },
    { lineId: 'rootchk', text: '  if (T->root->n == 2*t - 1) split_root(T);   /* 根满先分裂 */' },
    { lineId: 'descend', text: '  Node *p = T->root;' },
    { lineId: 'loop', text: '  while (!p->leaf) {' },
    { lineId: 'probe', text: '    for (i = 0; i < p->n; ++i) if (key == p->key[i]) return DUPLICATE;' },
    { lineId: 'choose', text: '    int c = child_index(p, key);            /* 决定进哪个孩子 */' },
    { lineId: 'full', text: '    if (p->child[c]->n == 2*t - 1) {        /* 满孩子不能进 */' },
    { lineId: 'split', text: '      split_child(p, c);                    /* 先分裂，中间键升到 p */' },
    { lineId: 'promote', text: '      /* 提升键进了 p，回到本结点重新比较 */' },
    { lineId: 'down', text: '    } else p = p->child[c];                 /* 孩子不满才下降 */' },
    { lineId: 'loop-end', text: '  }' },
    { lineId: 'insert', text: '  insert_key_sorted(p, key);              /* 到这里叶必有空位 */' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'Node *btree_bulk_load(int *keys, int n, int t) {' },
    { lineId: 'sort', text: '  sort(keys, n); n = drop_duplicates(keys, n);   /* 先排好序 */' },
    { lineId: 'leaf', text: '  for (i = 0; i < n; i += 2*t - 1) fill_leaf(T, keys + i);  /* 叶按上限填满 */' },
    { lineId: 'level', text: '  while (level_count(T) > 1) {              /* 逐层向上加索引 */' },
    { lineId: 'group', text: '    group_children(T, 2*t);                 /* 每 2t 个孩子归一组 */' },
    { lineId: 'promote', text: '    parent->key[j] = child[j+1]->key[0];    /* 孩子首键复制上来做分隔键 */' },
    { lineId: 'level-end', text: '  }' },
    { lineId: 'root', text: '  T->root = last_parent;                    /* 最后一层只剩一个结点就是根 */' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '插入 10,20,5,6（t=2，根分裂一次）',
    input: { keys: [10, 20, 5, 6], t: 2 },
    expect: { root: [10], leaves: [[5, 6], [20]] },
    expectByVariant: { v3: { root: [20], leaves: [[5, 6, 10], [20]] } },
  },
  {
    id: 'edge-duplicate',
    label: '插入 10,10（重复键不插入，结构不变）',
    input: { keys: [10, 10], t: 2 },
    expect: { root: [10], leaves: [[10]], duplicate: 1 },
  },
  {
    id: 'edge-empty',
    label: '空键表（不建任何结点）',
    input: { keys: [], t: 2 },
    expect: { root: [], leaves: [], duplicate: 0 },
  },
  {
    id: 'edge-two-level',
    label: '插入 3,1,2,5,4,6,7（连续分裂成两层）',
    input: { keys: [3, 1, 2, 5, 4, 6, 7], t: 2 },
    expect: { root: [3, 6], leaves: [[1, 2], [4, 5], [7]] },
    expectByVariant: {
      v2: { root: [2, 4], leaves: [[1], [3], [5, 6, 7]] },
      v3: { root: [4, 7], leaves: [[1, 2, 3], [4, 5, 6], [7]] },
    },
  },
];

/* ------------------------------------------------------------------ 树状态 */

function newTree(t) {
  return { t, nodes: new Map(), nextId: 1, root: null };
}

function mkNode(T, keys = [], children = [], parent = null) {
  const id = `n${T.nextId++}`;
  const node = { id, keys: [...keys], children: [...children], parent, kind: 'node' };
  T.nodes.set(id, node);
  return node;
}

/** 提升键的"悬空"结点：分裂时先挂在画面上，父结点接住后删掉 */
function mkLift(T, key) {
  const id = `up${T.nextId++}`;
  T.nodes.set(id, { id, keys: [key], children: [], parent: null, kind: 'lift' });
  return id;
}

const dropNode = (T, id) => T.nodes.delete(id);

const lowerBound = (arr, key) => {
  let i = 0;
  while (i < arr.length && arr[i] < key) i++;
  return i;
};

/**
 * 就地分裂一个结点：把 keys[mid] 提上去，左半留在原结点，右半成为新结点。
 * mid = t-1 用于"满结点（2t-1 键）预分裂"，mid = t 用于"事后溢出（2t 键）分裂"。
 */
function splitAt(T, node, mid) {
  const promoted = node.keys[mid];
  const rightKeys = node.keys.slice(mid + 1);
  const rightChildren = node.children.length ? node.children.splice(mid + 1) : [];
  node.keys = node.keys.slice(0, mid);
  const right = mkNode(T, rightKeys, rightChildren, node.parent);
  for (const cid of rightChildren) T.nodes.get(cid).parent = right.id;
  const lift = mkLift(T, promoted);
  return { right, lift, promoted, rightKeys };
}

/* ------------------------------------------------------------------ 快照 */

function snap(T, { path = [], focus = null, focus2 = null, added = [], done = [], pointers = [] } = {}) {
  const nodes = [...T.nodes.values()].map((n) => {
    const text = `[${n.keys.join(' ')}]`;
    return {
      id: n.id,
      label: text,
      children: [...n.children],
      badge: n.kind === 'lift' ? '提升键' : n.children.length === 0 ? '叶' : `${n.children.length} 指针`,
      radius: Math.max(18, Math.round(4 + text.length * 3.2)),
      fontSize: text.length > 6 ? 9 : 10,
    };
  });
  const edgeTags = {};
  for (const n of T.nodes.values()) n.children.forEach((c, i) => { edgeTags[c] = `C${i}`; });
  const roles = {};
  if (focus) roles.focus1 = [focus];
  if (focus2) roles.focus2 = [focus2];
  if (path.length) roles.swap = path;
  if (added.length) roles.added = added;
  if (done.length) roles.done = done;
  if (pointers.length) roles.pointers = pointers;
  return treeLayer({
    id: 'tree',
    title: 'B 树（一个结点 = 一个树节点，label 是键数组）',
    name: `B 树 · t=${T.t} · 每结点最多 ${2 * T.t - 1} 键`,
    nodes,
    roots: T.root ? [T.root] : [],
    edgeTags,
    roles,
  });
}

function keyLayer(keys, cur, { done = [], excl = [], title = '待插入键序列', name = 'keys[]（按输入顺序逐个插入）' } = {}) {
  return arrayLayer({
    id: 'keys',
    title,
    name,
    values: [...keys],
    labels: keys.map((v) => String(v)),
    roles: {
      focus1: cur != null ? [cur] : [],
      done: done.slice(),
      excluded: excl.slice(),
      pointers: cur != null ? [{ id: 'cur', label: 'key', index: cur }] : [],
    },
  });
}

/** 从左到右（DFS）收集叶结点的键数组 */
function leafLists(T) {
  const out = [];
  const walk = (id) => {
    const n = T.nodes.get(id);
    if (!n) return;
    if (!n.children.length) { out.push([...n.keys]); return; }
    for (const c of n.children) walk(c);
  };
  if (T.root) walk(T.root);
  return out;
}

const spread = (n) => n.keys.map((k) => k).join(' ');

/* ------------------------------------------------------------------ 变体 1：插入 + 事后分裂 */

function runV1(input) {
  const keys = (input.keys || []).map((k) => Number(k));
  const t = Math.max(2, Math.floor(Number(input.t) || 2));
  const MAX = 2 * t - 1;
  const T = newTree(t);
  const steps = [];
  const L = LINES.v1;
  let dup = 0;
  let splits = 0;

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: keys.length === 0
      ? '键表为空：不会建任何结点，树保持空树。'
      : `t = ${t}：每个结点最多 ${MAX} 个键、${MAX + 1} 个孩子，最少 ${t - 1} 个键。本变体先下降到叶把键插进去，再沿父链检查溢出，溢出才分裂。`,
    vars: { t, maxKeys: MAX, n: keys.length, dup: 0, splits: 0 },
    layers: [snap(T), keyLayer(keys, null)],
  }));

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    if (!T.root) {
      const root = mkNode(T, [key], [], null);
      T.root = root.id;
      steps.push(step({
        event: 'insert-key', lineId: 'insert',
        note: `树还是空的：${key} 直接成为根结点唯一的键（根同时是叶）。`,
        vars: { t, maxKeys: MAX, key, node: `[${key}]`, depth: 0, dup, splits },
        layers: [snap(T, { focus: root.id, added: [root.id], pointers: [{ id: 'key', label: `key=${key}`, node: root.id }] }), keyLayer(keys, i, { done: rangeTo(i) })],
      }));
      continue;
    }

    // ---- 下降：结点内逐个比较，按区间选孩子 ----
    const path = [];
    let node = T.nodes.get(T.root);
    let depth = 0;
    let found = false;

    for (;;) {
      path.push(node.id);
      let childIdx = 0;
      for (let j = 0; j < node.keys.length; j++) {
        const kj = node.keys[j];
        const rel = key === kj ? 'eq' : key < kj ? 'lt' : 'gt';
        steps.push(step({
          event: 'probe-key', lineId: 'probe',
          note: rel === 'eq'
            ? `结点 ${`[${spread(node)}]`} 的第 ${j} 个键 ${kj} 正好等于 ${key}：B 树不存重复键，放弃这次插入。`
            : rel === 'lt'
              ? `${key} < ${kj}：比这个键小，应该进它左边的第 ${j} 个孩子指针。`
              : `${key} > ${kj}：继续和右边的键比较。`,
          vars: { t, maxKeys: MAX, key, node: `[${spread(node)}]`, i: j, depth, dup, splits },
          layers: [
            snap(T, { path: [...path], focus: node.id, pointers: [{ id: 'key', label: `key=${key}`, node: node.id }] }),
            keyLayer(keys, i, { done: rangeTo(i) }),
          ],
        }));
        if (rel === 'eq') { found = true; break; }
        if (rel === 'lt') { childIdx = j; break; }
        childIdx = j + 1;
      }
      if (found) break;

      if (node.children.length === 0) break; // 到叶了，就插在这里

      const child = T.nodes.get(node.children[childIdx]);
      steps.push(step({
        event: 'descend', lineId: 'find',
        note: `${key} 落在第 ${childIdx} 个孩子的区间里，下降到结点 [${spread(child)}]（第 ${depth + 1} 层）。`,
        vars: { t, maxKeys: MAX, key, node: `[${spread(child)}]`, child: childIdx, depth: depth + 1, dup, splits },
        layers: [
          snap(T, { path: [...path], focus: child.id, focus2: node.id, pointers: [{ id: 'key', label: `key=${key}`, node: child.id }] }),
          keyLayer(keys, i, { done: rangeTo(i) }),
        ],
      }));
      node = child;
      depth += 1;
    }

    if (found) {
      dup += 1;
      steps.push(step({
        event: 'duplicate', lineId: 'probe',
        note: `${key} 已经在树里，结构一点不动：B 树里每个键只出现一次，重复插入被拒绝。`,
        vars: { t, maxKeys: MAX, key, dup, splits },
        layers: [snap(T, { path: [...path], focus: node.id }), keyLayer(keys, i, { done: rangeTo(i), excl: [i] })],
      }));
      continue;
    }

    // ---- 叶结点插入 ----
    const pos = lowerBound(node.keys, key);
    node.keys.splice(pos, 0, key);
    steps.push(step({
      event: 'insert-key', lineId: 'insert',
      note: `把 ${key} 插进叶结点 [${spread(node)}] 的第 ${pos} 个位置。现在它有 ${node.keys.length} 个键，上限是 ${MAX}。`,
      vars: { t, maxKeys: MAX, key, node: `[${spread(node)}]`, depth, dup, splits },
      layers: [
        snap(T, { path: [...path], focus: node.id, pointers: [{ id: 'key', label: `key=${key}`, node: node.id }] }),
        keyLayer(keys, i, { done: rangeTo(i) }),
      ],
    }));

    // ---- 事后沿父链收拾溢出 ----
    let cur = node;
    while (cur.keys.length > MAX) {
      const before = `[${spread(cur)}]`;
      const { right, lift, promoted, rightKeys } = splitAt(T, cur, t);
      splits += 1;
      steps.push(step({
        event: 'split', lineId: 'split',
        note: `结点 ${before} 有 ${before.split(' ').length} 个键，超过上限 ${MAX}：取中间键 ${promoted} 准备上提，左半 [${spread(cur)}] 留在原结点，右半 [${rightKeys.join(' ')}] 成为新结点，右半的孩子指针也跟着搬过去。`,
        vars: { t, maxKeys: MAX, promote: promoted, left: `[${spread(cur)}]`, right: `[${rightKeys.join(' ')}]`, dup, splits },
        layers: [
          snap(T, { path, focus: cur.id, added: [right.id, lift], pointers: [{ id: 'up', label: `提升 ${promoted}`, node: lift }] }),
          keyLayer(keys, i, { done: rangeTo(i) }),
        ],
      }));

      if (!cur.parent) {
        const root = mkNode(T, [promoted], [cur.id, right.id], null);
        cur.parent = root.id;
        right.parent = root.id;
        T.root = root.id;
        dropNode(T, lift);
        steps.push(step({
          event: 'new-root', lineId: 'newroot',
          note: `${promoted} 是根分裂出来的键，没有父结点可放：新建根 [${promoted}]，两个孩子指向左半与右半，整棵树长高一层。`,
          vars: { t, maxKeys: MAX, promote: promoted, root: `[${promoted}]`, dup, splits },
          layers: [
            snap(T, { focus: root.id, added: [root.id], done: [cur.id, right.id] }),
            keyLayer(keys, i, { done: rangeTo(i) }),
          ],
        }));
        break;
      }

      const parent = T.nodes.get(cur.parent);
      const ci = parent.children.indexOf(cur.id);
      parent.keys.splice(ci, 0, promoted);
      parent.children.splice(ci + 1, 0, right.id);
      right.parent = parent.id;
      dropNode(T, lift);
      steps.push(step({
        event: 'promote', lineId: 'promote',
        note: `把提升键 ${promoted} 插进父结点 [${spread(parent)}] 的第 ${ci} 个位置，新结点 [${rightKeys.join(' ')}] 挂在它右边。父结点若因此超过 ${MAX} 个键，会继续向上分裂。`,
        vars: { t, maxKeys: MAX, promote: promoted, parent: `[${spread(parent)}]`, dup, splits },
        layers: [
          snap(T, { path, focus: parent.id, added: [right.id], done: [cur.id] }),
          keyLayer(keys, i, { done: rangeTo(i) }),
        ],
      }));
      cur = parent;
    }
  }

  const result = { root: T.root ? [...T.nodes.get(T.root).keys] : [], leaves: leafLists(T), duplicate: dup, splits };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: keys.length === 0
      ? '键表为空，树保持空树。'
      : `插入结束：根 [${result.root.join(' ')}]，叶依次为 ${result.leaves.map((l) => `[${l.join(' ')}]`).join(' ')}（分裂 ${splits} 次，拒绝重复 ${dup} 次）。`,
    vars: { t, maxKeys: MAX, n: keys.length, dup, splits },
    layers: [
      snap(T, { done: [...T.nodes.keys()], focus: T.root }),
      keyLayer(keys, null, { done: keys.map((_, i) => i) }),
    ],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'b-tree-postsplit-v1',
    lines: L, steps, result, meta: { splits, dup },
  });
}

function rangeTo(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(i);
  return out;
}

/* ------------------------------------------------------------------ 变体 2：自顶向下预分裂 */

function runV2(input) {
  const keys = (input.keys || []).map((k) => Number(k));
  const t = Math.max(2, Math.floor(Number(input.t) || 2));
  const MAX = 2 * t - 1;
  const T = newTree(t);
  const steps = [];
  const L = LINES.v2;
  let dup = 0;
  let splits = 0;

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: keys.length === 0
      ? '键表为空：不会建任何结点，树保持空树。'
      : `t = ${t}：每结点最多 ${MAX} 键。本变体只在"要进入的结点还满"之前先分裂它，所以键落到叶时叶必定有空位，插完不需要再回头修补。`,
    vars: { t, maxKeys: MAX, n: keys.length, dup: 0, splits: 0 },
    layers: [snap(T), keyLayer(keys, null)],
  }));

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    if (!T.root) {
      const root = mkNode(T, [key], [], null);
      T.root = root.id;
      steps.push(step({
        event: 'insert-key', lineId: 'insert',
        note: `空树：${key} 成为根结点（此时根就是叶）。`,
        vars: { t, maxKeys: MAX, key, node: `[${key}]`, dup, splits },
        layers: [snap(T, { focus: root.id, added: [root.id] }), keyLayer(keys, i, { done: rangeTo(i) })],
      }));
      continue;
    }

    // 根满先分裂：CLRS 要求下降前根一定不满
    if (T.nodes.get(T.root).keys.length === MAX) {
      const root = T.nodes.get(T.root);
      const before = `[${spread(root)}]`;
      const { right, lift, promoted, rightKeys } = splitAt(T, root, t - 1);
      splits += 1;
      steps.push(step({
        event: 'split', lineId: 'split',
        note: `根 ${before} 已经满（${MAX} 键），按预分裂口径取中位键 ${promoted}：左半 [${spread(root)}] 与右半 [${rightKeys.join(' ')}] 各自成为一层结点。`,
        vars: { t, maxKeys: MAX, promote: promoted, left: `[${spread(root)}]`, right: `[${rightKeys.join(' ')}]`, dup, splits },
        layers: [
          snap(T, { focus: root.id, added: [right.id, lift], pointers: [{ id: 'up', label: `提升 ${promoted}`, node: lift }] }),
          keyLayer(keys, i, { done: rangeTo(i) }),
        ],
      }));
      const newRoot = mkNode(T, [promoted], [root.id, right.id], null);
      root.parent = newRoot.id;
      right.parent = newRoot.id;
      T.root = newRoot.id;
      dropNode(T, lift);
      steps.push(step({
        event: 'new-root', lineId: 'rootchk',
        note: `预分裂的根同样要造一个新根 [${promoted}]：树高 +1，之后每次下降都能保证"孩子不满才进入"。`,
        vars: { t, maxKeys: MAX, promote: promoted, root: `[${promoted}]`, dup, splits },
        layers: [snap(T, { focus: newRoot.id, added: [newRoot.id], done: [root.id, right.id] }), keyLayer(keys, i, { done: rangeTo(i) })],
      }));
    }

    // 下降：路上碰到满孩子就先分裂
    const path = [];
    let node = T.nodes.get(T.root);
    let depth = 0;
    let found = false;

    descendLoop:
    for (;;) {
      path.push(node.id);
      let childIdx = 0;
      for (let j = 0; j < node.keys.length; j++) {
        const kj = node.keys[j];
        const rel = key === kj ? 'eq' : key < kj ? 'lt' : 'gt';
        steps.push(step({
          event: 'probe-key', lineId: 'probe',
          note: rel === 'eq'
            ? `结点 [${spread(node)}] 里已经有 ${kj}，与待插入的 ${key} 相同：丢弃这次插入。`
            : rel === 'lt'
              ? `${key} < ${kj}：下一层往左走（第 ${j} 个孩子）。`
              : `${key} > ${kj}：往右继续比。`,
          vars: { t, maxKeys: MAX, key, node: `[${spread(node)}]`, i: j, depth, dup, splits },
          layers: [snap(T, { path: [...path], focus: node.id, pointers: [{ id: 'key', label: `key=${key}`, node: node.id }] }), keyLayer(keys, i, { done: rangeTo(i) })],
        }));
        if (rel === 'eq') { found = true; break descendLoop; }
        if (rel === 'lt') { childIdx = j; break; }
        childIdx = j + 1;
      }

      if (node.children.length === 0) break; // 叶且不满：直接插

      const child = T.nodes.get(node.children[childIdx]);
      if (child.keys.length === MAX) {
        const before = `[${spread(child)}]`;
        const { right, lift, promoted, rightKeys } = splitAt(T, child, t - 1);
        splits += 1;
        steps.push(step({
          event: 'split', lineId: 'split',
          note: `要进入的第 ${childIdx} 个孩子 ${before} 已经满了：先分裂它，中位键 ${promoted} 升到本结点，左半 [${spread(child)}]、右半 [${rightKeys.join(' ')}]。`,
          vars: { t, maxKeys: MAX, key, promote: promoted, left: `[${spread(child)}]`, right: `[${rightKeys.join(' ')}]`, depth, dup, splits },
          layers: [
            snap(T, { path: [...path], focus: child.id, focus2: node.id, added: [right.id, lift], pointers: [{ id: 'up', label: `提升 ${promoted}`, node: lift }] }),
            keyLayer(keys, i, { done: rangeTo(i) }),
          ],
        }));
        node.keys.splice(childIdx, 0, promoted);
        node.children.splice(childIdx + 1, 0, right.id);
        right.parent = node.id;
        dropNode(T, lift);
        steps.push(step({
          event: 'promote', lineId: 'promote',
          note: `提升键 ${promoted} 进了 [${spread(node)}]，于是本结点多了一个分隔键、一个孩子。必须回到本结点重新比较：${key} 可能落到新拆出来的左半或右半。`,
          vars: { t, maxKeys: MAX, key, promote: promoted, node: `[${spread(node)}]`, depth, dup, splits },
          layers: [snap(T, { path: [...path], focus: node.id, added: [right.id], done: [child.id] }), keyLayer(keys, i, { done: rangeTo(i) })],
        }));
        continue; // 重新在本结点比较
      }

      steps.push(step({
        event: 'descend', lineId: 'down',
        note: `第 ${childIdx} 个孩子 [${spread(child)}] 没满，安全下降（第 ${depth + 1} 层）。`,
        vars: { t, maxKeys: MAX, key, node: `[${spread(child)}]`, child: childIdx, depth: depth + 1, dup, splits },
        layers: [snap(T, { path: [...path], focus: child.id, focus2: node.id, pointers: [{ id: 'key', label: `key=${key}`, node: child.id }] }), keyLayer(keys, i, { done: rangeTo(i) })],
      }));
      node = child;
      depth += 1;
    }

    if (found) {
      dup += 1;
      steps.push(step({
        event: 'duplicate', lineId: 'probe',
        note: `${key} 已存在，直接返回：预分裂可能已经让树形变过，但这个键本身不再插入。`,
        vars: { t, maxKeys: MAX, key, dup, splits },
        layers: [snap(T, { path: [...path], focus: node.id }), keyLayer(keys, i, { done: rangeTo(i), excl: [i] })],
      }));
      continue;
    }

    const pos = lowerBound(node.keys, key);
    node.keys.splice(pos, 0, key);
    steps.push(step({
      event: 'insert-key', lineId: 'insert',
      note: `落到的叶 [${spread(node)}] 必有空位：把 ${key} 插到第 ${pos} 位，共 ${node.keys.length} 个键（≤ ${MAX}）。整个过程不需要再回头修补。`,
      vars: { t, maxKeys: MAX, key, node: `[${spread(node)}]`, depth, dup, splits },
      layers: [snap(T, { path: [...path], focus: node.id, pointers: [{ id: 'key', label: `key=${key}`, node: node.id }] }), keyLayer(keys, i, { done: rangeTo(i) })],
    }));
  }

  const result = { root: T.root ? [...T.nodes.get(T.root).keys] : [], leaves: leafLists(T), duplicate: dup, splits };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: keys.length === 0
      ? '键表为空，树保持空树。'
      : `插入结束：根 [${result.root.join(' ')}]，叶依次为 ${result.leaves.map((l) => `[${l.join(' ')}]`).join(' ')}。预分裂把分裂提前，最终形状与"事后分裂"通常不同。`,
    vars: { t, maxKeys: MAX, n: keys.length, dup, splits },
    layers: [snap(T, { done: [...T.nodes.keys()], focus: T.root }), keyLayer(keys, null, { done: keys.map((_, i) => i) })],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'b-tree-presplit-v1',
    lines: L, steps, result, meta: { splits, dup },
  });
}

/* ------------------------------------------------------------------ 变体 3：自底向上批量装载 */

/** 把一层结点按"每组最多 maxKids 个孩子、每组不少于 minKids 个"切分 */
function groupIds(ids, maxKids, minKids) {
  const groups = [];
  for (let i = 0; i < ids.length; i += maxKids) groups.push(ids.slice(i, i + maxKids));
  if (groups.length > 1) {
    const last = groups[groups.length - 1];
    while (last.length < minKids && groups[groups.length - 2].length > minKids) {
      last.unshift(groups[groups.length - 2].pop());
    }
  }
  return groups;
}

function runV3(input) {
  const raw = (input.keys || []).map((k) => Number(k));
  const t = Math.max(2, Math.floor(Number(input.t) || 2));
  const MAX = 2 * t - 1;
  const MIN = t - 1;
  const T = newTree(t);
  const steps = [];
  const L = LINES.v3;
  let dup = 0;
  let splits = 0;

  const sorted = [...raw].sort((a, b) => a - b);
  const uniq = [];
  for (const k of sorted) {
    if (uniq.length && uniq[uniq.length - 1] === k) dup += 1;
    else uniq.push(k);
  }

  steps.push(step({
    event: 'init', lineId: 'sort',
    note: raw.length === 0
      ? '键表为空：没有要装载的数据，结果就是空树。'
      : `批量装载先把键排成升序并去重（重复 ${dup} 个直接丢掉），再按"叶填满 → 逐层复制首键"自底向上建树。整个过程没有一次沿着树下降。`,
    vars: { t, maxKeys: MAX, n: raw.length, uniq: uniq.length, dup, splits: 0 },
    layers: [snap(T), keyLayer(sorted, null, { title: '排序去重后的键序列', name: 'keys[]（批量装载输入，升序）', done: [] })],
  }));

  if (uniq.length === 0) {
    const result = { root: [], leaves: [], duplicate: dup, splits: 0 };
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note: `没有可用键：空树即为结果（拒绝重复 ${dup} 个）。`,
      vars: { t, maxKeys: MAX, dup, splits: 0 },
      layers: [snap(T), keyLayer(sorted, null, { title: '排序去重后的键序列', name: 'keys[]（批量装载输入，升序）' })],
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v3', sourceVersion: 'b-tree-bulkload-v1',
      lines: L, steps, result, meta: { dup, splits: 0 },
    });
  }

  // ---- 第一步：切叶并按上限填满 ----
  const leafGroups = [];
  for (let i = 0; i < uniq.length; i += MAX) leafGroups.push(uniq.slice(i, i + MAX));
  if (leafGroups.length > 1) {
    const last = leafGroups[leafGroups.length - 1];
    while (last.length < MIN && leafGroups[leafGroups.length - 2].length > MIN) {
      last.unshift(leafGroups[leafGroups.length - 2].pop());
    }
  }

  let level = [];
  for (let gi = 0; gi < leafGroups.length; gi++) {
    const g = leafGroups[gi];
    const leaf = mkNode(T, g, [], null);
    level.push(leaf.id);
    if (gi === 0) T.root = leaf.id;
    steps.push(step({
      event: 'insert-key', lineId: 'leaf',
      note: `第 ${gi + 1} 个叶结点一次填入 [${g.join(' ')}]（${g.length} 个键，上限 ${MAX}）。批量装载不做逐个比较：位置由升序直接决定。`,
      vars: { t, maxKeys: MAX, leaf: gi + 1, keys: `[${g.join(' ')}]`, dup, splits },
      layers: [
        snap(T, { added: [leaf.id], focus: leaf.id, pointers: [{ id: 'leaf', label: `叶${gi + 1}`, node: leaf.id }] }),
        keyLayer(sorted, null, { title: '排序去重后的键序列', name: 'keys[]（批量装载输入，升序）', done: g.map((k) => sorted.indexOf(k)) }),
      ],
    }));
  }
  let guard = 0;
  while (level.length > 1) {
    guard += 1;
    if (guard > 12) break;
    const groups = groupIds(level, MAX + 1, t);
    steps.push(step({
      event: 'descend', lineId: 'level',
      note: `第 ${guard} 层已有 ${level.length} 个结点，现在往上加一层索引：把它们按"每组最多 ${MAX + 1} 个孩子、不少于 ${t} 个"分组，共 ${groups.length} 组。`,
      vars: { t, maxKeys: MAX, level: guard, groups: groups.length, dup, splits },
      layers: [
        snap(T, { path: [...level] }),
        keyLayer(sorted, null, { title: '排序去重后的键序列', name: 'keys[]（批量装载输入，升序）' }),
      ],
    }));

    const nextLevel = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const grp = groups[gi];
      const keys = grp.slice(1).map((cid) => T.nodes.get(cid).keys[0]);
      const parent = mkNode(T, keys, grp, null);
      for (const cid of grp) T.nodes.get(cid).parent = parent.id;
      nextLevel.push(parent.id);
      // 新一层的第一个父结点立刻成为画面的根，这样"孩子被接上来"是当场可见的
      if (nextLevel.length === 1) T.root = parent.id;
      splits += 1;
      steps.push(step({
        event: 'promote', lineId: 'promote',
        note: `父结点 [${keys.join(' ')}] 的分隔键就是除第一个孩子外、每个孩子的首键：${grp.slice(1).map((cid, k) => `${T.nodes.get(cid).keys[0]}(来自孩子 ${k + 2})`).join('、')}。键只是复制上来，叶里的副本仍在。`,
        vars: { t, maxKeys: MAX, parent: `[${keys.join(' ')}]`, children: grp.length, dup, splits },
        layers: [
          snap(T, { focus: parent.id, added: [parent.id], done: [...grp] }),
          keyLayer(sorted, null, { title: '排序去重后的键序列', name: 'keys[]（批量装载输入，升序）' }),
        ],
      }));
    }
    level = nextLevel;
    if (level.length > 0) T.root = level[0];
  }

  // 只剩一个结点 → 它是根；把森林里其余孤立根都接到它下面（本例中已全部连好）
  const rootNode = T.root ? T.nodes.get(T.root) : null;
  const result = { root: rootNode ? [...rootNode.keys] : [], leaves: leafLists(T), duplicate: dup, splits };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `装载结束：根 [${result.root.join(' ')}]，叶依次为 ${result.leaves.map((l) => `[${l.join(' ')}]`).join(' ')}。叶被填得比插入法更满（${MAX} 键），所以层数更少、根更靠右——这正是批量装载与逐条插入的结构差异。`,
    vars: { t, maxKeys: MAX, n: uniq.length, dup, splits },
    layers: [
      snap(T, { done: [...T.nodes.keys()], focus: T.root }),
      keyLayer(sorted, null, { title: '排序去重后的键序列', name: 'keys[]（批量装载输入，升序）', done: sorted.map((_, i) => i) }),
    ],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'b-tree-bulkload-v1',
    lines: L, steps, result, meta: { dup, splits },
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
