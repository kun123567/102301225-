/**
 * D · 分块查找（3 个代表性不同实现）
 *
 *   1) v1 索引顺序查找：索引表顺序比较，取第一个 max ≥ target 的块，再块内顺序扫描；
 *   2) v2 索引折半 + 块内顺序：索引表按 max 有序 → 折半选块，块内仍顺序；
 *   3) v3 索引折半 + 块内折半：块内也有序时块内再折半，展示"两重收敛"。
 *
 * 画面两层：
 *   · style 1 数据表层：各块按顺序拼接的 int a[n]，选中块用 marks.range 框出来；
 *   · style 6 索引表层：每行 = 一个块的索引项 {块号, max, 位置范围}（空块 max 记 ∅）。
 *
 * 三个变体的**比较次数**不同，所以样例用 expectByVariant 分开声明（index/block 一致）。
 */

import { trace, step, arrayLayer, gridLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'd/block-search',
  variants: [
    { id: 'v1', name: '索引顺序查找' },
    { id: 'v2', name: '索引折半 + 块内顺序' },
    { id: 'v3', name: '索引折半 + 块内折半' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'int block_search(int a[], int n, Index idx[], int k, int target) {' },
    { lineId: 'build', text: '  /* idx[j].max = 第 j 块的最大值；空块没有 max */' },
    { lineId: 'for-j', text: '  for (int j = 0; j < k; ++j) {' },
    { lineId: 'skip', text: '    if (idx[j].len == 0) continue;        /* 空块：没有候选元素 */' },
    { lineId: 'cmp-idx', text: '    if (idx[j].max >= target) {          /* 顺序比较：第一个够大的块 */' },
    { lineId: 'select', text: '      /* 前 j-1 块的最大值都 < target，目标只可能在块 j */' },
    { lineId: 'scan', text: '      for (int t = idx[j].start; t < idx[j].start + idx[j].len; ++t) {' },
    { lineId: 'cmp-blk', text: '        if (a[t] == target)' },
    { lineId: 'hit', text: '          return t;                      /* 块内顺序扫描命中 */' },
    { lineId: 'scan-end', text: '      }' },
    { lineId: 'break', text: '      break;                             /* 只需看这一块 */' },
    { lineId: 'if-end', text: '    }' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'miss', text: '  return -1;                             /* 索引走完 / 块内没找到 */' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'int block_search_bin_index(int a[], int n, Index idx[], int k, int target) {' },
    { lineId: 'init', text: '  int lo = 0, hi = k - 1, sel = -1;' },
    { lineId: 'while', text: '  while (lo <= hi) {                     /* 索引按 max 有序 → 可以折半 */' },
    { lineId: 'mid', text: '    int mid = (lo + hi) / 2;' },
    { lineId: 'skip', text: '    if (idx[mid].len == 0) { lo = mid + 1; continue; }   /* 空块 max=∅，往右收 */' },
    { lineId: 'cmp-idx', text: '    if (idx[mid].max >= target) { sel = mid; hi = mid - 1; }  /* 候选块，往左找更靠前的 */' },
    { lineId: 'else-right', text: '    else lo = mid + 1;                   /* 这一段 max 都不够大 → 往右 */' },
    { lineId: 'wend', text: '  }' },
    { lineId: 'select', text: '  if (sel < 0) return -1;                /* 没有任何块的 max 够大 */' },
    { lineId: 'scan', text: '  for (int t = idx[sel].start; t < idx[sel].start + idx[sel].len; ++t) {' },
    { lineId: 'cmp-blk', text: '    if (a[t] == target) return t;        /* 块内仍然顺序扫描 */' },
    { lineId: 'scan-end', text: '  }' },
    { lineId: 'miss', text: '  return -1;' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'int block_search_bin_all(int a[], int n, Index idx[], int k, int target) {' },
    { lineId: 'lo1', text: '  int lo = 0, hi = k - 1, sel = -1;' },
    { lineId: 'while1', text: '  while (lo <= hi) {                     /* 第一重：索引表折半选块 */' },
    { lineId: 'mid1', text: '    int mid = (lo + hi) / 2;' },
    { lineId: 'skip1', text: '    if (idx[mid].len == 0) { lo = mid + 1; continue; }' },
    { lineId: 'cidx1', text: '    if (idx[mid].max >= target) { sel = mid; hi = mid - 1; } else lo = mid + 1;' },
    { lineId: 'wend1', text: '  }' },
    { lineId: 'sel', text: '  if (sel < 0) return -1;' },
    { lineId: 'lo2', text: '  int p = idx[sel].start, q = idx[sel].start + idx[sel].len - 1;' },
    { lineId: 'while2', text: '  while (p <= q) {                       /* 第二重：块内（升序）折半 */' },
    { lineId: 'mid2', text: '    int m = (p + q) / 2;' },
    { lineId: 'cmp2', text: '    if (a[m] == target) return m;' },
    { lineId: 'dir2', text: '    if (a[m] > target) q = m - 1; else p = m + 1;' },
    { lineId: 'wend2', text: '  }' },
    { lineId: 'miss', text: '  return -1;' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '[[3,1],[8,5]] 查 3（max 表 [3,8]：第二块才够大）',
    input: { blocks: [[3, 1], [8, 5]], target: 3 },
    expect: { index: 0, block: 0, offset: 0, compares: 2 },
  },
  {
    id: 'miss',
    label: '[[3,1],[8,5]] 查 4（选第二块，块内扫完未命中）',
    input: { blocks: [[3, 1], [8, 5]], target: 4 },
    expect: { index: -1, block: -1, offset: -1, compares: 4 },
    expectByVariant: {
      v3: { index: -1, block: -1, offset: -1, compares: 3 },
    },
  },
  {
    id: 'edge-empty-block',
    label: '[[3,1],[],[8,5]] 查 6（中间是空块：skip-empty 后进第三块）',
    input: { blocks: [[3, 1], [], [8, 5]], target: 6 },
    expect: { index: -1, block: -1, offset: -1, compares: 4 },
    expectByVariant: {
      v2: { index: -1, block: -1, offset: -1, compares: 3 },
      v3: { index: -1, block: -1, offset: -1, compares: 2 },
    },
  },
  {
    id: 'edge-no-blocks',
    label: 'blocks=[] 查 6（索引表为空，直接返回 -1）',
    input: { blocks: [], target: 6 },
    expect: { index: -1, block: -1, offset: -1, compares: 0 },
  },
];

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};

/** 把 input.blocks 摊平成"数据表 + 索引表"两份只读视图 */
function makeCtx(input) {
  const blocks = (Array.isArray(input.blocks) ? input.blocks : []).map((b) => (Array.isArray(b) ? [...b] : []));
  const target = input.target;
  const flat = [];
  const start = [];
  const len = [];
  const idxMax = [];
  for (const b of blocks) {
    start.push(flat.length);
    len.push(b.length);
    idxMax.push(b.length ? Math.max(...b) : null);
    for (const v of b) flat.push(v);
  }
  const labels = labelsOf(flat);
  const k = blocks.length;
  const rowLabels = blocks.map((_, j) => `块${j}`);
  const rowKeys = (j) => [`${j},0`, `${j},1`, `${j},2`];
  const rejectedRows = (upto) => {
    const out = [];
    for (let r = 0; r < upto; r++) out.push(...rowKeys(r));
    return out;
  };
  const gridRows = () => blocks.map((_, j) => [
    String(j),
    idxMax[j] == null ? '∅' : String(idxMax[j]),
    len[j] ? `${start[j]}..${start[j] + len[j] - 1}` : '空',
  ]);
  /** 每步重建两层（数据层 + 索引层），保证快照独立 */
  const layers = (rData = {}, rIdx = {}) => [
    arrayLayer({
      id: 'data', title: '数据表（各块按顺序拼接）', name: 'int a[n]',
      values: [...flat], labels: [...labels], roles: rData,
    }),
    gridLayer({
      id: 'index', title: '索引表 idx[]（每块最大值）', name: 'Index idx[k]',
      values: gridRows(), rowLabels: [...rowLabels], colLabels: ['块号', 'max', '位置范围'], roles: rIdx,
    }),
  ];
  return { blocks, target, flat, start, len, idxMax, labels, k, layerCount: 2, layers, rowKeys, rejectedRows };
}

/** 选中块后在数据层画区间框，在索引层点亮整行 */
const blockMarks = (c, sel) => ({
  range: [c.start[sel], c.start[sel] + c.len[sel] - 1],
  rangeLabel: `块${sel}（a[${c.start[sel]}..${c.start[sel] + c.len[sel] - 1}]）`,
});

/** 块内顺序扫描（v1 / v2 共用） */
function scanBlockSequential(c, steps, sel, L, baseVars, comparesRef, ids) {
  let hit = -1;
  for (let t = c.start[sel]; t < c.start[sel] + c.len[sel]; t++) {
    comparesRef.compares += 1;
    const eq = c.flat[t] === c.target;
    steps.push(step({
      event: 'compare-in-block', lineId: ids.cmpBlk,
      note: `块内顺序扫描：a[${t}] = ${c.labels[t]} ${eq ? '=' : '≠'} ${c.target}${eq ? '，命中，返回全局下标 ' + t + '。' : '，继续块内下一位。'}`,
      vars: { ...baseVars, t, value: c.flat[t], compares: comparesRef.compares },
      layers: c.layers(
        { focus1: [t], marks: blockMarks(c, sel), pointers: [{ id: 't', label: 't', index: t }] },
        { done: c.rowKeys(sel) },
      ),
    }));
    if (eq) { hit = t; break; }
  }
  if (hit < 0) {
    steps.push(step({
      event: 'miss', lineId: ids.scanEnd,
      note: `块 ${sel} 扫完（a[${c.start[sel]}..${c.start[sel] + c.len[sel] - 1}] 都不等于 ${c.target}）：分块查找只保证"可能在块 ${sel}"，不保证一定在，所以返回 -1。`,
      vars: { ...baseVars, compares: comparesRef.compares },
      layers: c.layers(
        { marks: blockMarks(c, sel), excluded: range(c.start[sel], c.start[sel] + c.len[sel] - 1) },
        { done: c.rowKeys(sel) },
      ),
    }));
  }
  return hit;
}

function finish(c, steps, hit, sel, compares, L) {
  const index = hit >= 0 ? hit : -1;
  const offset = hit >= 0 ? hit - c.start[sel] : -1;
  const result = { index, block: hit >= 0 ? sel : -1, offset, compares };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: hit >= 0
      ? `分块查找结束：${c.target} 在块 ${sel} 的第 ${offset} 个位置（全局下标 ${index}），共比较 ${compares} 次。`
      : `分块查找结束：未命中，返回 -1，共比较 ${compares} 次。`,
    vars: { k: c.k, target: c.target, compares, index, block: result.block, offset },
    layers: hit >= 0
      ? c.layers({ focus1: [hit], marks: blockMarks(c, sel) }, { done: c.rowKeys(sel) })
      : c.layers({ excluded: range(0, c.flat.length - 1) }, { excluded: c.blocks.map((_, j) => c.rowKeys(j)).flat() }),
  }));
  return result;
}

/* ------------------------------------------------------------------ 变体 1（索引顺序） */

function runV1(input) {
  const c = makeCtx(input);
  const L = LINES.v1;
  const steps = [];
  const ref = { compares: 0 };
  const vars = (extra = {}) => ({ k: c.k, target: c.target, compares: ref.compares, ...extra });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: c.k === 0
      ? '索引表为空（一个块都没有）：没有块可以被选中，直接返回 -1。'
      : `共 ${c.k} 块，索引项 idx[j].max 是第 j 块的最大值。索引表顺序比较：第一个 max ≥ target 的块才可能含 target；空块的 max 记 ∅，永远不会被选中。`,
    vars: vars({ j: null }),
    layers: c.layers(),
  }));

  let sel = -1;
  for (let j = 0; j < c.k; j++) {
    if (c.len[j] === 0) {
      steps.push(step({
        event: 'skip-empty', lineId: 'skip',
        note: `块 ${j} 是空块：没有元素也就没有 max，索引项不可能 ≥ target，跳过（空块不能用来定位）。`,
        vars: vars({ j }),
        layers: c.layers({}, { excluded: c.rowKeys(j) }),
      }));
      continue;
    }
    ref.compares += 1;
    const ok = c.idxMax[j] >= c.target;
    steps.push(step({
      event: 'compare-index', lineId: 'cmp-idx',
      note: `顺序比较 idx[${j}].max = ${c.idxMax[j]} 与 target = ${c.target}：${ok
        ? `成立 → 前 ${j} 块最大值都更小，目标只可能在块 ${j}。`
        : `不成立 → 块 ${j} 的元素都 ≤ ${c.idxMax[j]} < ${c.target}，整块排除。`}`,
      vars: vars({ j, idxMax: c.idxMax[j] }),
      layers: c.layers({}, { focus1: [`${j},1`], excluded: c.rejectedRows(j) }),
    }));
    if (ok) { sel = j; break; }
  }

  if (sel < 0) {
    steps.push(step({
      event: 'miss', lineId: 'miss',
      note: c.k === 0
        ? '索引表为空：一次比较都没做，返回 -1。'
        : `索引表走完，没有任何块的 max ≥ ${c.target}：目标比所有块的最大值都大，整表排除，返回 -1（一次块内扫描都不用做）。`,
      vars: vars({ sel: -1 }),
      layers: c.layers({ excluded: range(0, c.flat.length - 1) }, { excluded: c.blocks.map((_, j) => c.rowKeys(j)).flat() }),
    }));
    const result = finish(c, steps, -1, 0, ref.compares, L);
    return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'block-search-seq-v1', lines: L, steps, result });
  }

  steps.push(step({
    event: 'select-block', lineId: 'select',
    note: `选中块 ${sel}：位置 a[${c.start[sel]}..${c.start[sel] + c.len[sel] - 1}]（${c.len[sel]} 个元素），接下来块内逐个顺序扫描。`,
    vars: vars({ j: sel, start: c.start[sel], len: c.len[sel] }),
    layers: c.layers(
      { marks: blockMarks(c, sel), pointers: [{ id: 's', label: `块${sel}起点`, index: c.start[sel] }] },
      { done: c.rowKeys(sel) },
    ),
  }));

  const hit = scanBlockSequential(c, steps, sel, L, vars(), ref, { cmpBlk: 'cmp-blk', scanEnd: 'scan-end' });
  if (hit >= 0) {
    steps.push(step({
      event: 'hit', lineId: 'hit',
      note: `a[${hit}] = ${c.flat[hit]} 命中：全局下标 ${hit} = 块 ${sel} 起点 ${c.start[sel]} + 块内偏移 ${hit - c.start[sel]}。`,
      vars: vars({ t: hit, value: c.flat[hit] }),
      layers: c.layers({ focus1: [hit], marks: blockMarks(c, sel) }, { done: c.rowKeys(sel) }),
    }));
  }
  const result = finish(c, steps, hit, sel, ref.compares, L);
  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'block-search-seq-v1', lines: L, steps, result });
}

/* ------------------------------------------------------------------ 变体 2（索引折半 + 块内顺序） */

function runV2(input) {
  const c = makeCtx(input);
  const L = LINES.v2;
  const steps = [];
  const ref = { compares: 0 };
  const vars = (extra = {}) => ({ k: c.k, target: c.target, compares: ref.compares, ...extra });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: c.k === 0
      ? '索引表为空：lo=0、hi=-1，折半循环一次都不进，直接返回 -1。'
      : `索引表按 max 递增有序，所以选块可以折半：要找的是"第一个 max ≥ target 的块"，折半把它压到 O(log k)。块内仍是顺序扫描。`,
    vars: vars({ lo: 0, hi: c.k - 1, sel: -1 }),
    layers: c.layers(),
  }));

  let lo = 0;
  let hi = c.k - 1;
  let sel = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    steps.push(step({
      event: 'compare-index', lineId: 'mid',
      note: `折半定位：lo = ${lo}、hi = ${hi} → mid = ${mid}（区间 [${lo}, ${hi}] 收敛中）。`,
      vars: vars({ lo, hi, mid }),
      layers: c.layers({}, { focus1: [`${mid},1`], pointers: [{ id: 'mid', label: 'mid', node: `${mid},1` }] }),
    }));
    if (c.len[mid] === 0) {
      steps.push(step({
        event: 'skip-empty', lineId: 'skip',
        note: `块 ${mid} 是空块（max = ∅）：空块不可能 ≥ target，于是把左边界推到 ${mid + 1}（往右找）。`,
        vars: vars({ lo, hi, mid }),
        layers: c.layers({}, { focus1: [`${mid},1`], excluded: c.rowKeys(mid) }),
      }));
      lo = mid + 1;
      continue;
    }
    ref.compares += 1;
    const ok = c.idxMax[mid] >= c.target;
    steps.push(step({
      event: 'compare-index', lineId: 'cmp-idx',
      note: `比较 idx[${mid}].max = ${c.idxMax[mid]} 与 target = ${c.target}：${ok
        ? `成立 → 块 ${mid} 是候选，但左边可能还有更靠前的够大块，把 hi 收到 ${mid - 1}。`
        : `不成立 → 块 ${mid} 及其左侧的 max 都太小，把 lo 推到 ${mid + 1}。`}`,
      vars: vars({ lo, hi, mid, idxMax: c.idxMax[mid] }),
      layers: c.layers({}, ok
        ? { focus1: [`${mid},1`], added: c.rowKeys(mid) }
        : { focus1: [`${mid},1`], excluded: c.rowKeys(mid) }),
    }));
    if (ok) { sel = mid; hi = mid - 1; } else { lo = mid + 1; }
  }

  steps.push(step({
    event: 'select-block', lineId: 'wend',
    note: sel < 0
      ? `折半结束（lo = ${lo} > hi = ${hi}）：没有任何块的 max ≥ ${c.target}，目标不可能存在。`
      : `折半结束：第一个 max ≥ ${c.target} 的块是 ${sel}（共比较 ${ref.compares} 次索引项）。`,
    vars: vars({ lo, hi, sel }),
    layers: c.layers({}, sel < 0 ? { excluded: c.blocks.map((_, j) => c.rowKeys(j)).flat() } : { done: c.rowKeys(sel) }),
  }));

  if (sel < 0) {
    steps.push(step({
      event: 'miss', lineId: 'select',
      note: `sel = -1：target = ${c.target} 比所有块的最大值都大，块内扫描直接省掉，返回 -1。`,
      vars: vars({ sel: -1 }),
      layers: c.layers({ excluded: range(0, c.flat.length - 1) }),
    }));
    const result = finish(c, steps, -1, 0, ref.compares, L);
    return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'block-search-binindex-v1', lines: L, steps, result });
  }

  steps.push(step({
    event: 'select-block', lineId: 'select',
    note: `选中块 ${sel}：块内仍顺序扫描 a[${c.start[sel]}..${c.start[sel] + c.len[sel] - 1}]（块内无序也能查，这是 v2 相对 v3 的保守之处）。`,
    vars: vars({ sel, start: c.start[sel], len: c.len[sel] }),
    layers: c.layers(
      { marks: blockMarks(c, sel), pointers: [{ id: 's', label: `块${sel}起点`, index: c.start[sel] }] },
      { done: c.rowKeys(sel) },
    ),
  }));

  const hit = scanBlockSequential(c, steps, sel, L, vars(), ref, { cmpBlk: 'cmp-blk', scanEnd: 'scan-end' });
  if (hit >= 0) {
    steps.push(step({
      event: 'hit', lineId: 'cmp-blk',
      note: `命中：a[${hit}] = ${c.flat[hit]}，全局下标 ${hit}，块内偏移 ${hit - c.start[sel]}。索引折半省下了逐块比较。`,
      vars: vars({ t: hit, value: c.flat[hit] }),
      layers: c.layers({ focus1: [hit], marks: blockMarks(c, sel) }, { done: c.rowKeys(sel) }),
    }));
  }
  const result = finish(c, steps, hit, sel, ref.compares, L);
  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'block-search-binindex-v1', lines: L, steps, result });
}

/* ------------------------------------------------------------------ 变体 3（索引折半 + 块内折半） */

function runV3(input) {
  const c = makeCtx(input);
  const L = LINES.v3;
  const steps = [];
  const ref = { compares: 0 };
  const vars = (extra = {}) => ({ k: c.k, target: c.target, compares: ref.compares, ...extra });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: c.k === 0
      ? '索引表为空：两重折半都没有区间可收敛，直接返回 -1。'
      : 'v3 = 两重折半：先在索引表上折半选块，再在块内折半找元素。前提是**块内升序**——本演示按此前提使用（块内无序时块内折半结果不可靠）。',
    vars: vars({ lo: 0, hi: c.k - 1, sel: -1 }),
    layers: c.layers({}, {}),
  }));

  let lo = 0;
  let hi = c.k - 1;
  let sel = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    steps.push(step({
      event: 'compare-index', lineId: 'mid1',
      note: `第一重（索引表）：lo = ${lo}、hi = ${hi} → mid = ${mid}。`,
      vars: vars({ lo, hi, mid }),
      layers: c.layers({}, { focus1: [`${mid},1`], pointers: [{ id: 'mid', label: 'mid', node: `${mid},1` }] }),
    }));
    if (c.len[mid] === 0) {
      steps.push(step({
        event: 'skip-empty', lineId: 'skip1',
        note: `块 ${mid} 是空块（max = ∅）：不可能含目标，左边界推到 ${mid + 1}。`,
        vars: vars({ lo, hi, mid }),
        layers: c.layers({}, { focus1: [`${mid},1`], excluded: c.rowKeys(mid) }),
      }));
      lo = mid + 1;
      continue;
    }
    ref.compares += 1;
    const ok = c.idxMax[mid] >= c.target;
    steps.push(step({
      event: 'compare-index', lineId: 'cidx1',
      note: `idx[${mid}].max = ${c.idxMax[mid]} ${ok ? '≥' : '<'} target = ${c.target} → ${ok
        ? `记候选块 ${mid}，hi 收到 ${mid - 1} 继续往左找第一个够大的块。`
        : `块 ${mid} 及左侧都太小，lo 推到 ${mid + 1}。`}`,
      vars: vars({ lo, hi, mid, idxMax: c.idxMax[mid] }),
      layers: c.layers({}, ok
        ? { focus1: [`${mid},1`], added: c.rowKeys(mid) }
        : { focus1: [`${mid},1`], excluded: c.rowKeys(mid) }),
    }));
    if (ok) { sel = mid; hi = mid - 1; } else { lo = mid + 1; }
  }

  steps.push(step({
    event: 'select-block', lineId: 'wend1',
    note: sel < 0
      ? `第一重结束（lo = ${lo} > hi = ${hi}）：没有块的 max ≥ ${c.target}，目标不存在。`
      : `第一重结束：候选块 ${sel}，范围 a[${c.start[sel]}..${c.start[sel] + c.len[sel] - 1}]，现在进入第二重（块内折半）。`,
    vars: vars({ lo, hi, sel }),
    layers: c.layers(
      sel < 0 ? { excluded: range(0, c.flat.length - 1) } : { marks: blockMarks(c, sel) },
      sel < 0 ? { excluded: c.blocks.map((_, j) => c.rowKeys(j)).flat() } : { done: c.rowKeys(sel) },
    ),
  }));

  if (sel < 0) {
    steps.push(step({
      event: 'miss', lineId: 'miss',
      note: `sel = -1：target = ${c.target} 比所有块的最大值都大，没有第二重折半可做，返回 -1。`,
      vars: vars({ sel: -1 }),
      layers: c.layers({ excluded: range(0, c.flat.length - 1) }),
    }));
    const result = finish(c, steps, -1, 0, ref.compares, L);
    return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'block-search-binall-v1', lines: L, steps, result });
  }

  const s = c.start[sel];
  let p = s;
  let q = s + c.len[sel] - 1;
  let hit = -1;
  while (p <= q) {
    const m = (p + q) >> 1;
    steps.push(step({
      event: 'compare-in-block', lineId: 'mid2',
      note: `第二重（块内折半）：p = ${p}、q = ${q} → m = ${m}，取 a[${m}] = ${c.labels[m]} 与 ${c.target} 比。`,
      vars: vars({ sel, p, q, m }),
      layers: c.layers(
        { focus1: [m], marks: { range: [p, q], rangeLabel: `块内 [${p},${q}]` }, pointers: [{ id: 'm', label: 'm', index: m }] },
        { done: c.rowKeys(sel) },
      ),
    }));
    ref.compares += 1;
    if (c.flat[m] === c.target) {
      hit = m;
      steps.push(step({
        event: 'hit', lineId: 'cmp2',
        note: `a[${m}] = ${c.labels[m]} 命中：全局下标 ${m}，块内偏移 ${m - s}。两重折半各走 log 步。`,
        vars: vars({ sel, p, q, m, value: c.flat[m] }),
        layers: c.layers(
          { focus1: [m], marks: blockMarks(c, sel) },
          { done: c.rowKeys(sel) },
        ),
      }));
      break;
    }
    const goLeft = c.flat[m] > c.target;
    const half = goLeft ? [p, m - 1] : [m + 1, q];
    const halfLabel = goLeft ? `左半 [${p},${m - 1}]` : `右半 [${m + 1},${q}]`;
    steps.push(step({
      event: 'compare-in-block', lineId: 'dir2',
      note: `a[${m}] = ${c.labels[m]} ${goLeft ? '>' : '<'} ${c.target} → 块内${goLeft ? `左半 [${p},${m - 1}]` : `右半 [${m + 1},${q}]`}继续折半${half[0] > half[1] ? '（该半区为空，下一轮直接收敛）' : ''}。`,
      vars: vars({ sel, p, q, m, value: c.flat[m] }),
      layers: c.layers(
        { focus1: [m], marks: half[0] <= half[1] ? { range: half, rangeLabel: halfLabel } : {} },
        { done: c.rowKeys(sel) },
      ),
    }));
    if (goLeft) q = m - 1; else p = m + 1;
  }

  if (hit < 0) {
    steps.push(step({
      event: 'miss', lineId: 'miss',
      note: `块 ${sel} 内折半收敛到空区间（p = ${p} > q = ${q}）：块 ${sel} 里没有 ${c.target}，返回 -1。`,
      vars: vars({ sel, p, q }),
      layers: c.layers(
        { excluded: range(c.start[sel], c.start[sel] + c.len[sel] - 1), marks: blockMarks(c, sel) },
        { done: c.rowKeys(sel) },
      ),
    }));
  }

  const result = finish(c, steps, hit, sel, ref.compares, L);
  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'block-search-binall-v1', lines: L, steps, result });
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
