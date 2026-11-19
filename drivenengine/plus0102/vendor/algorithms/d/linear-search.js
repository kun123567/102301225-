/**
 * D · 顺序查找（3 个代表性不同实现）
 *
 *   1) v1 朴素 for 循环：从 0 逐项比较，遇首个相等即返回下标，遍历完返回 -1；
 *   2) v2 哨兵版：target 写进 a[0] 作哨兵，真实元素在 a[1..n]，从尾部往前扫；
 *   3) v3 全量命中版：不早停，收集全部相等元素下标（重复键场景）。
 *
 * 动画重点（目录 focus）：比较下标、当前值、命中/未命中结论。
 * 三个变体的**比较次数**不同（v1 命中即停，v2/v3 全程扫），
 * v3 的结果形状也不同（indices 列表），所以样例用 expectByVariant 分开声明。
 */

import { trace, step, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'd/linear-search',
  variants: [
    { id: 'v1', name: '朴素 for 循环' },
    { id: 'v2', name: '哨兵版' },
    { id: 'v3', name: '全量命中版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'int linear_search(int a[], int n, int target) {' },
    { lineId: 'for', text: '  for (int i = 0; i < n; ++i) {' },
    { lineId: 'cmp', text: '    if (a[i] == target)' },
    { lineId: 'ret-i', text: '      return i;              /* 命中即早停：只给第一个下标 */' },
    { lineId: 'next', text: '    /* 不等：i++ 继续看下一位 */' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'ret-miss', text: '  return -1;                /* 走完整表仍未命中 */' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'int sentinel_search(int a[], int n, int target) {' },
    { lineId: 'buf', text: '  /* 真实元素在 a[1..n]，a[0] 留作哨兵位 */' },
    { lineId: 'sentinel', text: '  a[0] = target;             /* 哨兵：i 一路减到 0 也一定停得住 */' },
    { lineId: 'best-init', text: '  int best = -1;' },
    { lineId: 'for', text: '  for (int i = n; i != 0; --i) {   /* 从尾部往前扫 */' },
    { lineId: 'cmp', text: '    if (a[i] == target)' },
    { lineId: 'keep', text: '      best = i - 1;          /* 记下命中；继续往左才能取最左命中 */' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'ret', text: '  return best;               /* best 保持 -1 即未命中 */' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'int collect_all(int a[], int n, int target) {' },
    { lineId: 'reset', text: '  found = 0;                 /* 命中计数器清零 */' },
    { lineId: 'for', text: '  for (int i = 0; i < n; ++i) {' },
    { lineId: 'cmp', text: '    if (a[i] == target) {' },
    { lineId: 'push', text: '      hits[found++] = i;     /* 不早停：把下标全部收下 */' },
    { lineId: 'if-end', text: '    }' },
    { lineId: 'else-note', text: '    /* 不等：什么也不做，继续扫 */' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'ret', text: '  return found;              /* 返回命中个数，hits 里是下标表 */' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '[4,2,4] 找 4（v1/v2 给单下标，v3 收集全部命中）',
    input: { array: [4, 2, 4], target: 4 },
    expect: { index: 0, found: true, compares: 1 },
    expectByVariant: {
      v2: { index: 0, found: true, compares: 3 },
      v3: { index: 0, found: true, compares: 3, indices: [0, 2] },
    },
  },
  {
    id: 'edge-empty',
    label: '[]（空表：一次比较都不做，返回 -1）',
    input: { array: [], target: 4 },
    expect: { index: -1, found: false, compares: 0 },
    expectByVariant: {
      v3: { index: -1, found: false, compares: 0, indices: [] },
    },
  },
  {
    id: 'edge-miss',
    label: '[1,5,3] 找 4（整表走完仍未命中）',
    input: { array: [1, 5, 3], target: 4 },
    expect: { index: -1, found: false, compares: 3 },
    expectByVariant: {
      v3: { index: -1, found: false, compares: 3, indices: [] },
    },
  },
];

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};

const ptr = (id, label, index) => ({ id, label, index });

/* ------------------------------------------------------------------ 变体 1（朴素 for） */

function runV1(input) {
  const src = Array.isArray(input.array) ? input.array : [];
  const target = input.target;
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const L = LINES.v1;
  const steps = [];
  let compares = 0;
  const layer = (roles = {}) => [arrayLayer({
    id: 'main', title: 'a[]（顺序表）', name: 'int a[n]（target 已给出）', values: [...arr], labels: [...labels], roles,
  })];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? `空表：没有元素可以比较，target = ${target} 不可能命中，直接返回 -1。`
      : `共 ${n} 项，target = ${target}。从 i = 0 逐项比较，第一次相等就返回下标（命中即早停）。`,
    vars: { n, target, i: null, value: null, compares: 0 },
    layers: layer({}),
  }));

  let hit = -1;
  for (let i = 0; i < n; i++) {
    compares += 1;
    const eq = arr[i] === target;
    steps.push(step({
      event: 'compare', lineId: 'cmp',
      note: `比较 a[${i}] = ${labels[i]} 与 target = ${target}：${eq ? '相等，命中，可以立刻返回了。' : '不等，i++ 看下一位。'}`,
      vars: { n, target, i, value: arr[i], compares },
      layers: layer({ focus1: [i], excluded: range(0, i - 1), pointers: [ptr('i', 'i', i)] }),
    }));
    if (eq) { hit = i; break; }
  }

  if (hit >= 0) {
    steps.push(step({
      event: 'hit', lineId: 'ret-i',
      note: `a[${hit}] = ${labels[hit]} 命中，返回下标 ${hit}；a[${hit + 1}..${n - 1}] 不再检查——早停省比较，但只给出第一个命中。`,
      vars: { n, target, i: hit, value: arr[hit], compares },
      layers: layer({ focus1: [hit], done: [hit], pointers: [ptr('i', 'i', hit)] }),
    }));
  } else {
    steps.push(step({
      event: 'miss', lineId: 'ret-miss',
      note: n === 0 ? '空表：一次比较都没做，返回 -1。' : `a[0..${n - 1}] 全比过，没有一项等于 ${target}，返回 -1。`,
      vars: { n, target, i: n, value: null, compares },
      layers: layer({ excluded: range(0, n - 1) }),
    }));
  }

  const result = { index: hit, found: hit >= 0, compares };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: hit >= 0
      ? `顺序查找结束：${target} 在 a[${hit}]，共比较 ${compares} 次。`
      : `顺序查找结束：未命中，返回 -1，共比较 ${compares} 次。`,
    vars: { n, target, i: hit >= 0 ? hit : null, value: null, compares },
    layers: layer(hit >= 0 ? { focus1: [hit], done: [hit] } : { excluded: range(0, n - 1) }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'linear-search-for-v1', lines: L, steps, result });
}

/* ------------------------------------------------------------------ 变体 2（哨兵） */

function runV2(input) {
  const src = Array.isArray(input.array) ? input.array : [];
  const target = input.target;
  const n = src.length;
  // a[0] 是哨兵位，真实元素在 a[1..n]
  const arr = ['', ...src];
  const labels = ['哨兵位', ...labelsOf(src)];
  const L = LINES.v2;
  const steps = [];
  let compares = 0;
  const layer = (roles = {}) => [arrayLayer({
    id: 'main', title: 'a[0..n]（a[0] 是哨兵位）', name: 'int a[n+1]', values: [...arr], labels: [...labels], roles,
  })];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? `空表：只有哨兵位 a[0] 可用，没有真实元素要比较，结果必然是 -1。`
      : `真实元素占 a[1..${n}]，a[0] 空出来当哨兵。哨兵版省掉 while 里的 i >= 0 判断：i 减到 0 一定停得住。`,
    vars: { n, target, i: null, value: null, compares: 0 },
    layers: layer({}),
  }));

  arr[0] = target;
  labels[0] = `${target}(哨兵)`;
  steps.push(step({
    event: 'init', lineId: 'sentinel',
    note: `把 target = ${target} 写进 a[0] 当哨兵。真正的比较只针对 a[1..${n}]，哨兵只负责兜底不越界。`,
    vars: { n, target, i: n, value: null, compares },
    layers: layer({ focus1: [0], pointers: [ptr('i', 'i', 0)] }),
  }));

  let best = -1;
  for (let i = n; i >= 1; i--) {
    compares += 1;
    const eq = arr[i] === target;
    steps.push(step({
      event: 'compare', lineId: 'cmp',
      note: `从尾部往前：比较 a[${i}] = ${labels[i]} 与 target = ${target}：${eq ? '相等，记下这个命中。' : '不等，继续往前（不越界，因为 a[0] 是哨兵）。'}`,
      vars: { n, target, i, value: arr[i], compares },
      layers: layer({ focus1: [i], focus2: [0], excluded: range(i + 1, n), pointers: [ptr('i', 'i', i)] }),
    }));
    if (eq) {
      best = i - 1;
      steps.push(step({
        event: 'hit', lineId: 'keep',
        note: `a[${i}] 命中 → 原始下标 best = i-1 = ${best}。继续往左扫：越靠左的命中覆盖它，最后留下的就是最左命中。`,
        vars: { n, target, i, value: arr[i], compares, best },
        layers: layer({ focus1: [i], done: [i], excluded: range(i + 1, n), pointers: [ptr('i', 'i', i)] }),
      }));
    }
  }

  if (best >= 0) {
    steps.push(step({
      event: 'hit', lineId: 'ret',
      note: `扫完 a[1..${n}]，最左命中下标是 ${best}（与朴素版返回同一个下标，但比较次数是 ${compares} 次，没有早停）。`,
      vars: { n, target, i: best + 1, value: arr[best + 1], compares, best },
      layers: layer({ focus1: [best + 1], done: [best + 1], pointers: [ptr('i', 'i', best + 1)] }),
    }));
  } else {
    steps.push(step({
      event: 'miss', lineId: 'ret',
      note: `a[1..${n}] 里没有 ${target}，best 保持 -1（哨兵只兜底，不算命中）。`,
      vars: { n, target, i: 0, value: null, compares, best },
      layers: layer({ excluded: range(1, n), focus2: [0] }),
    }));
  }

  const result = { index: best, found: best >= 0, compares };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: best >= 0
      ? `哨兵版结束：${target} 在最左命中 a[${best}]，共比较 ${compares} 次（全程扫，不早停）。`
      : `哨兵版结束：未命中，返回 -1，共比较 ${compares} 次。`,
    vars: { n, target, i: null, value: null, compares, best },
    layers: layer(best >= 0 ? { focus1: [best + 1], done: [best + 1] } : { excluded: range(1, n) }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'linear-search-sentinel-v1', lines: L, steps, result });
}

/* ------------------------------------------------------------------ 变体 3（全量命中） */

function runV3(input) {
  const src = Array.isArray(input.array) ? input.array : [];
  const target = input.target;
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const L = LINES.v3;
  const steps = [];
  const hits = [];
  let compares = 0;
  const layer = (roles = {}) => [arrayLayer({
    id: 'main', title: 'a[]（命中下标全收集）', name: 'int a[n]', values: [...arr], labels: [...labels], roles,
  })];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? `空表：命中列表保持为空，返回命中个数 0、下标表 []。`
      : `共 ${n} 项，target = ${target}。与朴素版相反：这里**不早停**，把每个相等元素的下标都收进 hits。`,
    vars: { n, target, i: null, value: null, compares: 0, hits: 0 },
    layers: layer({}),
  }));

  for (let i = 0; i < n; i++) {
    compares += 1;
    const eq = arr[i] === target;
    steps.push(step({
      event: 'compare', lineId: 'cmp',
      note: `比较 a[${i}] = ${labels[i]} 与 target = ${target}：${eq ? '相等。' : '不等。'}无论结果如何，循环都会继续到 i = ${i + 1}。`,
      vars: { n, target, i, value: arr[i], compares, hits: hits.length },
      layers: layer({ focus1: [i], done: [...hits], pointers: [ptr('i', 'i', i)] }),
    }));
    if (eq) {
      hits.push(i);
      steps.push(step({
        event: 'hit', lineId: 'push',
        note: `命中：hits[${hits.length - 1}] = ${i}（已有 ${hits.length} 个命中）。注意这里没有 return，后面可能还有重复键。`,
        vars: { n, target, i, value: arr[i], compares, hits: hits.length },
        layers: layer({ focus1: [i], done: [...hits], pointers: [ptr('i', 'i', i)] }),
      }));
    }
  }

  if (hits.length === 0) {
    steps.push(step({
      event: 'miss', lineId: 'ret',
      note: n === 0 ? '空表：命中个数 0。' : `整表扫完，hits 仍是空的：${target} 一次也没出现。`,
      vars: { n, target, i: n, value: null, compares, hits: 0 },
      layers: layer({ excluded: range(0, n - 1) }),
    }));
  } else {
    steps.push(step({
      event: 'hit', lineId: 'ret',
      note: `扫完得到 ${hits.length} 个命中下标 [${hits.join(', ')}]；返回首个下标 ${hits[0]} 与完整列表。`,
      vars: { n, target, i: null, value: null, compares, hits: hits.length },
      layers: layer({ done: [...hits] }),
    }));
  }

  const result = { index: hits.length ? hits[0] : -1, indices: [...hits], found: hits.length > 0, compares };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: hits.length
      ? `全量命中版结束：共 ${hits.length} 个命中，下标 [${hits.join(', ')}]，比较 ${compares} 次（全程扫，不早停）。`
      : `全量命中版结束：未命中，indices = []，比较 ${compares} 次。`,
    vars: { n, target, i: null, value: null, compares, hits: hits.length },
    layers: layer(hits.length ? { done: [...hits] } : { excluded: range(0, n - 1) }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'linear-search-collect-v1', lines: L, steps, result });
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
