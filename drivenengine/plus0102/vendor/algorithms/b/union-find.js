/**
 * B · 并查集（3 个代表性不同实现）
 *
 * 输入：{ ops: [{op:'union', a:'A', b:'B'}, {op:'find', a:'A'}], elements?: ['A','B','C'] }
 *   · 不给 elements 时，元素集合 = ops 里出现过的名字（此时不可能有非法元素）；
 *   · 给了 elements 就以它为**唯一合法集合**：ops 里出现集合外的名字 = 非法元素，
 *     只记 invalid 并跳过，结构一点不动、集合数不变——"非法元素拒绝"要演的正是这个。
 *
 * 三个变体的差别在"树怎么长"，不是改名换汤：
 *   v1 父指针 + 路径压缩：合并时直接 parent[rb]=ra（不看秩/大小），find 把整条路径压到根上 → 树越来越扁平；
 *   v2 按秩合并：find 只找根**不压缩**，合并时秩小的根挂到秩大的根下，只有同秩合并秩才 +1；
 *   v3 按大小合并 + 路径减半：size 定胜负，find 只把节点挂到**祖父**（一次减半，不改整条路径）。
 * 秩/大小相同时统一"后一个的根挂到前一个的根下"，所以三个变体的根集合一致、样例期望可共用。
 *
 * 图层（每步完整重建）：
 *   forest style 9 —— 双亲树森林：value 写 p=父节点，根的 badge 写 秩/大小，查找路径用 added 标出来；
 *   parent style 1 —— parent[] 数组：下标 = 元素，被改写的格子用 swap 标出来。
 */

import { trace, step, treeLayer, arrayLayer } from '../../engine/model.js';

export const meta = {
  id: 'b/union-find',
  variants: [
    { id: 'v1', name: '父指针 + 路径压缩' },
    { id: 'v2', name: '按秩合并' },
    { id: 'v3', name: '按大小合并 + 路径减半' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void uf_sets(int parent[], int n) {' },
    { lineId: 'init', text: '  for (i = 0; i < n; ++i) parent[i] = i;              /* 每个元素自成集合 */' },
    { lineId: 'check', text: '  for (k = 0; k < m; ++k) {                          /* 逐条执行操作 */' },
    { lineId: 'invalid', text: '    if (!in_set(a) || (is_union && !in_set(b))) { ++invalid; continue; }' },
    { lineId: 'find-call', text: '    ra = find_with_compress(parent, a);              /* find 内顺手压缩 */' },
    { lineId: 'find-walk', text: '      while (parent[x] != x) x = parent[x];          /* 沿父指针上溯到根 */' },
    { lineId: 'compress', text: '      for (y = a; y != ra; y = parent[y]) parent[y] = ra;   /* 路径直挂根 */' },
    { lineId: 'union', text: '    if (ra != rb) parent[rb] = ra, --sets;          /* v1 不看秩/大小：直接挂 */' },
    { lineId: 'same', text: '    else /* ra == rb */ ++skipped;                  /* 同集合：结构不动 */' },
    { lineId: 'end', text: '  }' },
  ],
  v2: [
    { lineId: 'fn', text: 'void uf_rank(int parent[], int rank[], int n) {' },
    { lineId: 'init', text: '  for (i = 0; i < n; ++i) { parent[i] = i; rank[i] = 0; }' },
    { lineId: 'check', text: '  for (k = 0; k < m; ++k) {' },
    { lineId: 'invalid', text: '    if (!in_set(a) || (is_union && !in_set(b))) { ++invalid; continue; }' },
    { lineId: 'find-plain', text: '    ra = find_plain(parent, a);                      /* v2 的 find 只找根，不压缩 */' },
    { lineId: 'find-walk', text: '      while (parent[x] != x) x = parent[x];' },
    { lineId: 'compare', text: '    if (rank[ra] < rank[rb]) swap(&ra, &rb);         /* 秩大的当根 */' },
    { lineId: 'attach', text: '    parent[rb] = ra;                                 /* 秩小的树挂到秩大的树下 */' },
    { lineId: 'rank-inc', text: '    if (rank[rb] == rank[ra]) ++rank[ra];            /* 只有同秩合并秩才 +1 */' },
    { lineId: 'same', text: '    if (ra == rb) ++skipped;                         /* 同集合：不合并 */' },
    { lineId: 'end', text: '  }' },
  ],
  v3: [
    { lineId: 'fn', text: 'void uf_size(int parent[], int size[], int n) {' },
    { lineId: 'init', text: '  for (i = 0; i < n; ++i) { parent[i] = i; size[i] = 1; }' },
    { lineId: 'check', text: '  for (k = 0; k < m; ++k) {' },
    { lineId: 'invalid', text: '    if (!in_set(a) || (is_union && !in_set(b))) { ++invalid; continue; }' },
    { lineId: 'find-half', text: '    ra = find_halving(parent, a);                   /* 路径减半：只挂到祖父 */' },
    { lineId: 'half', text: '      parent[x] = parent[parent[x]];                 /* 减半：跳到祖父 */' },
    { lineId: 'compare', text: '    if (size[ra] < size[rb]) swap(&ra, &rb);        /* 小的树挂到大的树下 */' },
    { lineId: 'attach', text: '    parent[rb] = ra; size[ra] += size[rb];           /* 大小立即累加 */' },
    { lineId: 'same', text: '    if (ra == rb) ++skipped;' },
    { lineId: 'end', text: '  }' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

export const samples = [
  {
    id: 'normal',
    label: 'M={A,B,C}：合并 A/B、B/C，再 find A（期望 {A:A,B:A,C:A}、集合数 1）',
    input: {
      ops: [
        { op: 'union', a: 'A', b: 'B' },
        { op: 'union', a: 'B', b: 'C' },
        { op: 'find', a: 'A' },
      ],
    },
    expect: { roots: { A: 'A', B: 'A', C: 'A' }, sets: 1, invalid: 0 },
  },
  {
    id: 'normal-chain',
    label: 'M=4：先各自成对合并，再把两棵树合并，最后 find D 触发压缩/减半',
    input: {
      ops: [
        { op: 'union', a: 'A', b: 'B' },
        { op: 'union', a: 'C', b: 'D' },
        { op: 'union', a: 'B', b: 'C' },
        { op: 'find', a: 'D' },
      ],
    },
    expect: { roots: { A: 'A', B: 'A', C: 'A', D: 'A' }, sets: 1, invalid: 0 },
  },
  {
    id: 'edge-repeat',
    label: '重复合并 A/C（已在同一集合：集合数不变，只 +1 次 same-set）',
    input: {
      ops: [
        { op: 'union', a: 'A', b: 'B' },
        { op: 'union', a: 'B', b: 'C' },
        { op: 'union', a: 'A', b: 'C' },
      ],
    },
    expect: { roots: { A: 'A', B: 'A', C: 'A' }, sets: 1, skipped: 1 },
  },
  {
    id: 'edge-invalid',
    label: '合法集合 {A,B,C} 里混进非法元素 X（拒绝执行，invalid=1）',
    input: {
      elements: ['A', 'B', 'C'],
      ops: [
        { op: 'union', a: 'A', b: 'B' },
        { op: 'union', a: 'A', b: 'X' },
      ],
    },
    expect: { roots: { A: 'A', B: 'A', C: 'C' }, sets: 2, invalid: 1 },
  },
];

/* ------------------------------------------------------------------ 公用小工具 */

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};

/** 元素集合：优先用 input.elements（此时集合外的一律非法），否则从 ops 的名字里收集 */
function universeOf(input) {
  const declared = Array.isArray(input.elements)
    ? input.elements.filter((v) => v != null).map(String)
    : null;
  if (declared && declared.length) {
    const out = [];
    for (const id of declared) if (!out.includes(id)) out.push(id);
    return out;
  }
  const out = [];
  for (const op of Array.isArray(input.ops) ? input.ops : []) {
    if (!op) continue;
    for (const v of [op.a, op.b]) {
      if (v == null) continue;
      const s = String(v);
      if (!out.includes(s)) out.push(s);
    }
  }
  return out;
}

/** 快照：双亲树森林（style 9）+ parent[]（style 1），每步都新建对象 */
function snapLayers({ els, parent, sets, rank, size, family, opt = {} }) {
  const kids = new Map(els.map((id) => [id, []]));
  for (const id of els) {
    const p = parent[id];
    if (p !== id && kids.has(p)) kids.get(p).push(id);
  }
  const roots = els.filter((id) => parent[id] === id);
  const nodes = els.map((id) => {
    const node = { id, label: id, value: `p=${parent[id]}`, children: kids.get(id) };
    if (parent[id] === id) {
      node.badge = family === 'v2' ? `秩 ${rank[id]}` : family === 'v3' ? `大小 ${size[id]}` : '根';
    }
    return node;
  });

  const forest = treeLayer({
    id: 'forest',
    title: '双亲树森林',
    name: `双亲树森林（${els.length} 个元素 · ${sets} 个集合）`,
    nodes,
    roots,
    roles: {
      focus1: opt.node != null ? [opt.node] : [],
      focus2: opt.root != null ? [opt.root] : [],
      swap: opt.rewrite != null ? [opt.rewrite] : [],
      added: opt.path || [],
      pointers:
        opt.node != null
          ? [{ id: 'x', label: `x=${opt.node}`, node: opt.node }]
          : opt.root != null
            ? [{ id: 'r', label: `根=${opt.root}`, node: opt.root }]
            : [],
    },
  });

  const idx = (id) => els.indexOf(id);
  const row = arrayLayer({
    id: 'parent',
    title: 'parent[]',
    name: `int parent[${els.length}]（下标 = 元素）`,
    values: els.map((id) => parent[id]),
    labels: [...els],
    roles: {
      focus1: opt.node != null && idx(opt.node) >= 0 ? [idx(opt.node)] : [],
      swap: opt.rewrite != null && idx(opt.rewrite) >= 0 ? [idx(opt.rewrite)] : [],
      added: (opt.path || []).map(idx).filter((i) => i >= 0),
      pointers:
        opt.node != null && idx(opt.node) >= 0
          ? [{ id: 'x', label: `下标 ${idx(opt.node)}`, index: idx(opt.node) }]
          : [],
    },
  });

  return [forest, row];
}

/** 走父指针求根（只读，不改结构） */
function rootOf(parent, id) {
  let x = id;
  let guard = 0;
  while (parent[x] !== x && guard++ < 64) x = parent[x];
  return x;
}

/** 统一处理"这条操作该不该拒绝"，拒绝则返回说明文字 */
function invalidReason(op, a, b, kind, els) {
  const set = els.join(', ');
  if (!op || (op.op !== 'union' && op.op !== 'find')) return `动作「${op && op.op}」不是 union/find`;
  if (a == null) return '操作缺少元素名 a';
  if (!els.includes(a)) return `「${a}」不在合法元素集合 {${set}} 里`;
  if (kind === 'union' && b == null) return 'union 缺少元素名 b';
  if (kind === 'union' && !els.includes(b)) return `「${b}」不在合法元素集合 {${set}} 里`;
  return null;
}

const fmtOp = (kind, a, b) => (kind === 'union' ? `union(${a}, ${b})` : `find(${a})`);

/* ------------------------------------------------------------------ 变体 1：父指针 + 路径压缩 */

function runV1(input) {
  const els = universeOf(input);
  const ops = Array.isArray(input.ops) ? input.ops : [];
  const parent = {};
  for (const id of els) parent[id] = id;

  const rank = {};
  const size = {};
  let sets = els.length;
  let invalid = 0;
  let unions = 0;
  let skipped = 0;
  let compress = 0;

  const L = LINES.v1;
  const steps = [];
  const snap = (opt) => snapLayers({ els, parent, sets, rank, size, family: 'v1', opt });
  const varsOf = (op, a, b, ra, rb) => ({
    op, a, b, rootA: ra, rootB: rb, sets, invalid, skipped, compress,
  });

  steps.push(
    step({
      event: 'init',
      lineId: 'init',
      note:
        els.length === 0
          ? '元素集合为空：没有可执行的并查操作。'
          : `${els.length} 个元素各自成一棵树（parent[x]=x），共 ${sets} 个集合。v1 的 find 会顺手把整条路径压到根上，所以树只会越来越扁平。`,
      vars: varsOf('-', null, null, null, null),
      layers: snap({}),
    }),
  );

  // find(a)：沿父指针上溯 → 把路径上每个节点直接挂到根
  const find = (x, why) => {
    const path = [x];
    steps.push(
      step({
        event: 'find',
        lineId: 'find-call',
        note: `find(${x})（${why}）：沿父指针往根走，回程把路径上的节点都挂到根上。`,
        vars: varsOf(`find(${x})`, x, null, null, null),
        layers: snap({ node: x }),
      }),
    );
    let cur = x;
    while (parent[cur] !== cur) {
      cur = parent[cur];
      path.push(cur);
      steps.push(
        step({
          event: 'find',
          lineId: 'find-walk',
          note: `x=${cur}：parent[${cur}]=${parent[cur]}${parent[cur] === cur ? ' 就是自己 → 到根了。' : ' 不是自己 → 继续上溯。'}`,
          vars: varsOf(`find(${x})`, x, null, null, null),
          layers: snap({ node: cur, path: path.slice(0, -1) }),
        }),
      );
    }
    const root = cur;
    const deep = path.filter((y) => y !== root && parent[y] !== root);
    for (const y of deep) {
      const old = parent[y];
      parent[y] = root;
      compress += 1;
      steps.push(
        step({
          event: 'path-compress',
          lineId: 'compress',
          note: `parent[${y}] 由 ${old} 改成 ${root}：这是本路径第 ${deep.indexOf(y) + 1}/${deep.length} 个被改写的父指针，压完下次 find 一步到根。`,
          vars: varsOf(`find(${x})`, x, null, null, null),
          layers: snap({ root, rewrite: y, path }),
        }),
      );
    }
    steps.push(
      step({
        event: 'find',
        lineId: 'find-walk',
        note:
          deep.length > 0
            ? `${x} 的根是 ${root}；路径 ${path.join('→')} 上压平了 ${deep.length} 个父指针。`
            : `${x} 的根是 ${root}；路径 ${path.join('→')} 本来就不长，没有父指针需要改写。`,
        vars: varsOf(`find(${x})`, x, null, root, null),
        layers: snap({ root, path }),
      }),
    );
    return root;
  };

  ops.forEach((op, k) => {
    const kind = op && op.op === 'find' ? 'find' : 'union';
    const a = op && op.a != null ? String(op.a) : null;
    const b = kind === 'union' && op && op.b != null ? String(op.b) : null;
    const tag = `第 ${k + 1} 条${fmtOp(kind, a, b)}`;

    const bad = invalidReason(op, a, b, kind, els);
    if (bad) {
      invalid += 1;
      steps.push(
        step({
          event: 'invalid',
          lineId: 'invalid',
          note: `${tag} 被拒绝：${bad}。非法名字绝不偷偷加进集合——结构不动，集合数仍是 ${sets}，非法计数 +1（共 ${invalid}）。`,
          vars: varsOf(fmtOp(kind, a, b), a, b, null, null),
          layers: snap({}),
        }),
      );
      return;
    }

    const ra = find(a, `先找 a 的根`);
    if (kind === 'find') {
      steps.push(
        step({
          event: 'same-set',
          lineId: 'same',
          note: `find(${a}) 只查询不改动：结果 ${a} 属于集合 ${ra}（集合数 ${sets}）。`,
          vars: varsOf(fmtOp(kind, a, b), a, b, ra, null),
          layers: snap({ root: ra }),
        }),
      );
      return;
    }

    const rb = find(b, `再找 b 的根`);
    if (ra === rb) {
      skipped += 1;
      steps.push(
        step({
          event: 'same-set',
          lineId: 'same',
          note: `${a} 与 ${b} 的根都是 ${ra}：已经在同一集合，合并无事可做，集合数保持 ${sets}（同集合调用 ${skipped} 次）。`,
          vars: varsOf(fmtOp(kind, a, b), a, b, ra, rb),
          layers: snap({ root: ra, path: [a, b] }),
        }),
      );
      return;
    }

    parent[rb] = ra;
    unions += 1;
    sets -= 1;
    steps.push(
      step({
        event: 'union-by-rank',
        lineId: 'union',
        note: `v1 不比较秩/大小，直接 parent[${rb}]=${ra}：${rb} 那棵树整体挂到 ${ra} 下。集合数 ${sets + 1} → ${sets}。`,
        vars: varsOf(fmtOp(kind, a, b), a, b, ra, rb),
        layers: snap({ root: ra, rewrite: rb }),
      }),
    );
  });

  const rootsMap = {};
  for (const id of els) rootsMap[id] = rootOf(parent, id);
  const result = {
    elements: [...els],
    roots: rootsMap,
    sets,
    invalid,
    unions,
    skipped,
    compresses: compress,
    parent: { ...parent },
  };

  steps.push(
    step({
      event: 'done',
      lineId: 'end',
      done: true,
      result,
      note: `执行完毕：${sets} 个集合，合并 ${unions} 次、同集合 ${skipped} 次、非法拒绝 ${invalid} 次、父指针压缩 ${compress} 次。根：${els.map((id) => `${id}→${rootsMap[id]}`).join('，') || '（空）'}。`,
      vars: varsOf('done', null, null, null, null),
      layers: snap({ root: null, path: [] }).map((l) =>
        l.id === 'forest'
          ? { ...l, data: { ...l.data, nodes: l.data.nodes.map((n) => ({ ...n })), roles: { done: l.data.roots } } }
          : l,
      ),
    }),
  );

  return trace({
    algorithmId: meta.id,
    variantId: 'v1',
    sourceVersion: 'union-find-path-compress-v1',
    lines: L,
    steps,
    result,
    meta: { sets, invalid, compresses: compress },
  });
}

/* ------------------------------------------------------------------ 变体 2：按秩合并 */

function runV2(input) {
  const els = universeOf(input);
  const ops = Array.isArray(input.ops) ? input.ops : [];
  const parent = {};
  const rank = {};
  const size = {};
  for (const id of els) {
    parent[id] = id;
    rank[id] = 0;
    size[id] = 1;
  }
  let sets = els.length;
  let invalid = 0;
  let unions = 0;
  let skipped = 0;

  const L = LINES.v2;
  const steps = [];
  const snap = (opt) => snapLayers({ els, parent, sets, rank, size, family: 'v2', opt });
  const varsOf = (op, a, b, ra, rb) => ({
    op, a, b, rootA: ra, rootB: rb, sets, invalid, skipped, rankA: ra ? rank[ra] : null, rankB: rb ? rank[rb] : null,
  });

  steps.push(
    step({
      event: 'init',
      lineId: 'init',
      note:
        els.length === 0
          ? '元素集合为空：没有可执行的并查操作。'
          : `${els.length} 个元素各自成一棵树，秩全部为 0，共 ${sets} 个集合。v2 的 find 只找根不改结构，树的形状完全由"按秩合并"控制。`,
      vars: varsOf('-', null, null, null, null),
      layers: snap({}),
    }),
  );

  const find = (x, why) => {
    const path = [x];
    steps.push(
      step({
        event: 'find',
        lineId: 'find-plain',
        note: `find_plain(${x})（${why}）：v2 不压缩，只沿父指针找到根，父指针一个都不改。`,
        vars: varsOf(`find(${x})`, x, null, null, null),
        layers: snap({ node: x }),
      }),
    );
    let cur = x;
    while (parent[cur] !== cur) {
      cur = parent[cur];
      path.push(cur);
      steps.push(
        step({
          event: 'find',
          lineId: 'find-walk',
          note: `x=${cur}：parent[${cur}]=${parent[cur]}${parent[cur] === cur ? ' 就是自己 → 到根了。' : ' 不是自己 → 继续上溯（仍不改）'}。`,
          vars: varsOf(`find(${x})`, x, null, null, null),
          layers: snap({ node: cur, path: path.slice(0, -1) }),
        }),
      );
    }
    steps.push(
      step({
        event: 'find',
        lineId: 'find-walk',
        note: `${x} 的根是 ${cur}（路径 ${path.join('→')}，长度 ${path.length}）；秩 = ${rank[cur]}。`,
        vars: varsOf(`find(${x})`, x, null, cur, null),
        layers: snap({ root: cur, path }),
      }),
    );
    return cur;
  };

  ops.forEach((op, k) => {
    const kind = op && op.op === 'find' ? 'find' : 'union';
    const a = op && op.a != null ? String(op.a) : null;
    const b = kind === 'union' && op && op.b != null ? String(op.b) : null;
    const tag = `第 ${k + 1} 条${fmtOp(kind, a, b)}`;

    const bad = invalidReason(op, a, b, kind, els);
    if (bad) {
      invalid += 1;
      steps.push(
        step({
          event: 'invalid',
          lineId: 'invalid',
          note: `${tag} 被拒绝：${bad}。秩数组和父指针都不动，集合数仍是 ${sets}，非法计数 +1（共 ${invalid}）。`,
          vars: varsOf(fmtOp(kind, a, b), a, b, null, null),
          layers: snap({}),
        }),
      );
      return;
    }

    const ra = find(a, '先找 a 的根');
    if (kind === 'find') {
      steps.push(
        step({
          event: 'same-set',
          lineId: 'same',
          note: `find(${a}) 只查询：${a} 属于集合 ${ra}（集合数 ${sets}）。`,
          vars: varsOf(fmtOp(kind, a, b), a, b, ra, null),
          layers: snap({ root: ra }),
        }),
      );
      return;
    }
    const rb = find(b, '再找 b 的根');
    if (ra === rb) {
      skipped += 1;
      steps.push(
        step({
          event: 'same-set',
          lineId: 'same',
          note: `${a} 与 ${b} 的根都是 ${ra}：同集合，不合并；集合数保持 ${sets}。`,
          vars: varsOf(fmtOp(kind, a, b), a, b, ra, rb),
          layers: snap({ root: ra, path: [a, b] }),
        }),
      );
      return;
    }

    const rA = rank[ra];
    const rB = rank[rb];
    let big = ra;
    let small = rb;
    if (rA < rB) {
      big = rb;
      small = ra;
    }
    steps.push(
      step({
        event: 'union-by-rank',
        lineId: 'compare',
        note: `比较秩：${ra}(秩 ${rA}) vs ${rb}(秩 ${rB}) → ${rA < rB ? `${rb} 的秩更大` : rA > rB ? `${ra} 的秩更大` : '秩相同，把后者挂到前者下'}，所以根定为 ${big}。`,
        vars: varsOf(fmtOp(kind, a, b), a, b, ra, rb),
        layers: snap({ root: big, path: [ra, rb] }),
      }),
    );

    parent[small] = big;
    unions += 1;
    sets -= 1;
    const grew = rank[big] === rank[small];
    if (grew) rank[big] += 1;
    steps.push(
      step({
        event: 'union-by-rank',
        lineId: grew ? 'rank-inc' : 'attach',
        note: `parent[${small}]=${big}，集合数 ${sets + 1} → ${sets}；${grew ? `两棵秩同为 ${rank[small]}，合并后秩 +1 变成 ${rank[big]}（秩只在小→大时增加）。` : `秩 ${rank[big]} 比 ${rank[small]} 大，挂上去不用加秩，秩仍是 ${rank[big]}。`}`,
        vars: varsOf(fmtOp(kind, a, b), a, b, ra, rb),
        layers: snap({ root: big, rewrite: small }),
      }),
    );
  });

  const rootsMap = {};
  for (const id of els) rootsMap[id] = rootOf(parent, id);
  const result = {
    elements: [...els],
    roots: rootsMap,
    sets,
    invalid,
    unions,
    skipped,
    rank: { ...rank },
    parent: { ...parent },
  };

  steps.push(
    step({
      event: 'done',
      lineId: 'end',
      done: true,
      result,
      note: `执行完毕：${sets} 个集合，合并 ${unions} 次（按秩）、同集合 ${skipped} 次、非法拒绝 ${invalid} 次。根：${els.map((id) => `${id}→${rootsMap[id]}`).join('，') || '（空）'}。`,
      vars: varsOf('done', null, null, null, null),
      layers: snap({}).map((l) =>
        l.id === 'forest'
          ? { ...l, data: { ...l.data, roots: [...l.data.roots] }, roles: { done: l.data.roots } }
          : l,
      ),
    }),
  );

  return trace({
    algorithmId: meta.id,
    variantId: 'v2',
    sourceVersion: 'union-find-rank-v1',
    lines: L,
    steps,
    result,
    meta: { sets, invalid, maxRank: Math.max(0, ...els.map((id) => rank[id])) },
  });
}

/* ------------------------------------------------------------------ 变体 3：按大小合并 + 路径减半 */

function runV3(input) {
  const els = universeOf(input);
  const ops = Array.isArray(input.ops) ? input.ops : [];
  const parent = {};
  const size = {};
  const rank = {};
  for (const id of els) {
    parent[id] = id;
    size[id] = 1;
    rank[id] = 0;
  }
  let sets = els.length;
  let invalid = 0;
  let unions = 0;
  let skipped = 0;
  let halved = 0;

  const L = LINES.v3;
  const steps = [];
  const snap = (opt) => snapLayers({ els, parent, sets, rank, size, family: 'v3', opt });
  const varsOf = (op, a, b, ra, rb) => ({
    op, a, b, rootA: ra, rootB: rb, sets, invalid, skipped, halved,
    sizeA: ra ? size[ra] : null, sizeB: rb ? size[rb] : null,
  });

  steps.push(
    step({
      event: 'init',
      lineId: 'init',
      note:
        els.length === 0
          ? '元素集合为空：没有可执行的并查操作。'
          : `${els.length} 个元素各自成一棵树，size 全为 1，共 ${sets} 个集合。v3 用 size 定胜负，find 只把节点提到祖父（路径减半），不走完整压缩。`,
      vars: varsOf('-', null, null, null, null),
      layers: snap({}),
    }),
  );

  const find = (x, why) => {
    const path = [x];
    steps.push(
      step({
        event: 'find',
        lineId: 'find-half',
        note: `find_halving(${x})（${why}）：每次把当前节点的父指针改成祖父，路径长度一次减半。`,
        vars: varsOf(`find(${x})`, x, null, null, null),
        layers: snap({ node: x }),
      }),
    );
    let cur = x;
    while (parent[cur] !== cur) {
      const p = parent[cur];
      const gp = parent[p];
      if (p !== gp) {
        parent[cur] = gp;
        halved += 1;
        path.push(gp);
        steps.push(
          step({
            event: 'path-compress',
            lineId: 'half',
            note: `parent[${cur}] 由 ${p} 改成祖父 ${gp}：一步跨两层，只减半、不压平。`,
            vars: varsOf(`find(${x})`, x, null, null, null),
            layers: snap({ node: cur, rewrite: cur, path: path.slice(0, -1) }),
          }),
        );
        cur = gp;
      } else {
        cur = p;
        path.push(cur);
        steps.push(
          step({
            event: 'find',
            lineId: 'find-half',
            note: `${p} 就是根：${x} 的父节点 ${p} 已经直挂根，不用再减半，直接上到根。`,
            vars: varsOf(`find(${x})`, x, null, null, null),
            layers: snap({ node: cur, path: path.slice(0, -1) }),
          }),
        );
      }
    }
    steps.push(
      step({
        event: 'find',
        lineId: 'find-half',
        note: `${x} 的根是 ${cur}；size = ${size[cur]}，路径 ${path.join('→')}（减半 ${halved} 次累计）。`,
        vars: varsOf(`find(${x})`, x, null, cur, null),
        layers: snap({ root: cur, path }),
      }),
    );
    return cur;
  };

  ops.forEach((op, k) => {
    const kind = op && op.op === 'find' ? 'find' : 'union';
    const a = op && op.a != null ? String(op.a) : null;
    const b = kind === 'union' && op && op.b != null ? String(op.b) : null;
    const tag = `第 ${k + 1} 条${fmtOp(kind, a, b)}`;

    const bad = invalidReason(op, a, b, kind, els);
    if (bad) {
      invalid += 1;
      steps.push(
        step({
          event: 'invalid',
          lineId: 'invalid',
          note: `${tag} 被拒绝：${bad}。size/父指针都不动，集合数仍是 ${sets}，非法计数 +1（共 ${invalid}）。`,
          vars: varsOf(fmtOp(kind, a, b), a, b, null, null),
          layers: snap({}),
        }),
      );
      return;
    }

    const ra = find(a, '先找 a 的根');
    if (kind === 'find') {
      steps.push(
        step({
          event: 'same-set',
          lineId: 'same',
          note: `find(${a}) 只查询：${a} 属于集合 ${ra}（集合数 ${sets}）。`,
          vars: varsOf(fmtOp(kind, a, b), a, b, ra, null),
          layers: snap({ root: ra }),
        }),
      );
      return;
    }

    const rb = find(b, '再找 b 的根');
    if (ra === rb) {
      skipped += 1;
      steps.push(
        step({
          event: 'same-set',
          lineId: 'same',
          note: `${a} 与 ${b} 的根都是 ${ra}：同集合，不合并；集合数保持 ${sets}。`,
          vars: varsOf(fmtOp(kind, a, b), a, b, ra, rb),
          layers: snap({ root: ra, path: [a, b] }),
        }),
      );
      return;
    }

    const sA = size[ra];
    const sB = size[rb];
    let big = ra;
    let small = rb;
    if (sA < sB) {
      big = rb;
      small = ra;
    }
    steps.push(
      step({
        event: 'union-by-rank',
        lineId: 'compare',
        note: `比较 size：${ra}(size ${sA}) vs ${rb}(size ${sB}) → ${sA < sB ? `${rb} 更大` : sA > sB ? `${ra} 更大` : '一样大，把后者挂到前者下'}，根定为 ${big}。`,
        vars: varsOf(fmtOp(kind, a, b), a, b, ra, rb),
        layers: snap({ root: big, path: [ra, rb] }),
      }),
    );

    parent[small] = big;
    size[big] += size[small];
    unions += 1;
    sets -= 1;
    steps.push(
      step({
        event: 'union-by-rank',
        lineId: 'attach',
        note: `parent[${small}]=${big}，size[${big}] = ${sA} + ${sB} = ${size[big]}；集合数 ${sets + 1} → ${sets}。小树挂大树，树高因此保持为 O(log n)。`,
        vars: varsOf(fmtOp(kind, a, b), a, b, ra, rb),
        layers: snap({ root: big, rewrite: small }),
      }),
    );
  });

  const rootsMap = {};
  for (const id of els) rootsMap[id] = rootOf(parent, id);
  const result = {
    elements: [...els],
    roots: rootsMap,
    sets,
    invalid,
    unions,
    skipped,
    halved,
    size: { ...size },
    parent: { ...parent },
  };

  steps.push(
    step({
      event: 'done',
      lineId: 'end',
      done: true,
      result,
      note: `执行完毕：${sets} 个集合，按大小合并 ${unions} 次、同集合 ${skipped} 次、非法拒绝 ${invalid} 次、路径减半 ${halved} 次。根：${els.map((id) => `${id}→${rootsMap[id]}`).join('，') || '（空）'}。`,
      vars: varsOf('done', null, null, null, null),
      layers: snap({}).map((l) =>
        l.id === 'forest'
          ? { ...l, data: { ...l.data, roots: [...l.data.roots] }, roles: { done: l.data.roots } }
          : l,
      ),
    }),
  );

  return trace({
    algorithmId: meta.id,
    variantId: 'v3',
    sourceVersion: 'union-find-size-halving-v1',
    lines: L,
    steps,
    result,
    meta: { sets, invalid, halved },
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
