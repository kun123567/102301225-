/**
 * A · 简单选择排序（3 个代表性且彼此不同的实现）
 *
 * 选择排序的核心不是"比较多少次"，而是"**每轮只交换一次**"——画面要让人看见：
 * 已排序区在长、扫描指针 j 在走、候选最小位置 min 在换，交换次数远少于冒泡/插入的搬移次数。
 *
 *   v1 标准单向后选择：候选记录「值 + 下标」（minVal 在比较时被反复比较），扫完一次交换到区首
 *   v2 双向选择版：   一轮同时找最小与最大，分别放到左右两端，轮数减半、每轮最多两次交换
 *   v3 零自交换版：   只记「下标」，min 落在区首时不交换（省掉一次自交换），并记下省了几次
 *
 * 关于样例：已有序的 [1,2,3] 上 v1 / v3 一次交换都不会发生（guard 为假），v2 用双端方式
 * 走完一轮也可能一次都不换——三者结果相同，只有过程中的比较/候选不同。
 */

import { trace, step, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'a/selection-sort',
  variants: [
    { id: 'v1', name: '标准单向后选择' },
    { id: 'v2', name: '双向选择版' },
    { id: 'v3', name: '零自交换版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void selection_sort(int a[], int n) {' },
    { lineId: 'pass', text: '  for (int i = 0; i < n - 1; ++i) {' },
    { lineId: 'cand', text: '    int minIdx = i, minVal = a[i];        /* 候选最小：值和下标一起记 */' },
    { lineId: 'cmp', text: '    for (int j = i + 1; j < n; ++j)' },
    { lineId: 'upd', text: '      if (a[j] < minVal) { minIdx = j; minVal = a[j]; }' },
    { lineId: 'swap', text: '    if (minIdx != i) SWAP(a[i], a[minIdx]);   /* 每轮至多一次交换 */' },
    { lineId: 'pass-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void bidirectional_selection_sort(int a[], int n) {' },
    { lineId: 'pass', text: '  for (int left = 0, right = n - 1; left < right; ++left, --right) {' },
    { lineId: 'cand', text: '    int minIdx = left, maxIdx = left;      /* 一轮同时盯住最小与最大 */' },
    { lineId: 'scan', text: '    for (int j = left + 1; j <= right; ++j) {' },
    { lineId: 'mincmp', text: '      if (a[j] < a[minIdx]) minIdx = j;    /* 候选最小 */' },
    { lineId: 'maxcmp', text: '      if (a[j] > a[maxIdx]) maxIdx = j;    /* 候选最大 */' },
    { lineId: 'swapmin', text: '    if (minIdx != left) SWAP(a[left], a[minIdx]);   /* 最小放左端 */' },
    { lineId: 'fixmax', text: '    if (maxIdx == left) maxIdx = minIdx;   /* 最大项刚被换到 minIdx 去 */' },
    { lineId: 'swapmax', text: '    if (maxIdx != right) SWAP(a[maxIdx], a[right]); /* 最大放右端 */' },
    { lineId: 'pass-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void selection_sort_no_self_swap(int a[], int n) {' },
    { lineId: 'pass', text: '  for (int i = 0; i < n - 1; ++i) {' },
    { lineId: 'cand', text: '    int min = i;                          /* 只记下标，不复制值 */' },
    { lineId: 'cmp', text: '    for (int j = i + 1; j < n; ++j)' },
    { lineId: 'upd', text: '      if (a[j] < a[min]) min = j;         /* 比较的是两个格子 */' },
    { lineId: 'swap', text: '    if (min != i) SWAP(a[i], a[min]);' },
    { lineId: 'skip', text: '    else ++selfSwapSkipped;              /* 最小已在区首：省掉一次自交换 */' },
    { lineId: 'pass-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '[3,1,2]（两轮各一次交换）',
    input: { array: [3, 1, 2] },
    expect: { array: [1, 2, 3], labels: ['1', '2', '3'] },
  },
  {
    id: 'edge-sorted',
    label: '[1,2,3]（已有序：v1/v3 不产生任何交换事件）',
    input: { array: [1, 2, 3] },
    expect: { array: [1, 2, 3], labels: ['1', '2', '3'] },
  },
  {
    id: 'edge-empty',
    label: '[]（空数组直接结束）',
    input: { array: [] },
    expect: { array: [], labels: [] },
  },
];

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};
const sortedEnds = (left, right, n) => [...range(0, left - 1), ...range(right + 1, n - 1)];

/* ------------------------------------------------------------------ 变体 1（值 + 下标） */

function runV1(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES.v1;
  let swaps = 0;
  let compares = 0;
  let skipped = 0;

  const layer = (roles = {}) => [arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]', values: [...arr], labels: [...labels], roles,
  })];
  const minPtr = (idx) => [{ id: 'min', label: `min=${idx}`, index: idx }];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：没有需要选择的元素。'
      : `共 ${n} 个元素：每轮在未排序区 a[i..${n - 1}] 里选出最小值，换到区首；比较 ${(n * (n - 1)) / 2} 次，交换却最多 ${n - 1} 次。`,
    vars: { n, i: null, j: null, minIdx: null, minVal: null, compares: 0, swaps: 0, skipped: 0 },
    layers: layer(),
  }));

  for (let i = 0; i < n - 1; i++) {
    let minIdx = i;
    let minVal = arr[i];
    steps.push(step({
      event: 'candidate', lineId: 'cand',
      note: `第 ${i + 1} 轮：未排序区 a[${i}..${n - 1}]，先把区首 a[${i}] = ${labels[i]} 当候选最小值（下标与值一起记住）。`,
      vars: { n, i, j: null, minIdx, minVal, compares, swaps, skipped },
      layers: layer({ focus1: [i], done: range(0, i - 1), pointers: minPtr(minIdx) }),
    }));

    for (let j = i + 1; j < n; j++) {
      const smaller = arr[j] < minVal;
      compares++;
      steps.push(step({
        event: 'compare', lineId: 'cmp',
        note: `a[${j}] = ${labels[j]} ${smaller ? '<' : '≥'} 候选值 ${minVal}：${smaller ? '找到更小的值，候选要换。' : '不比候选值小，候选不动（相等也不算更小，所以不换）。'}`,
        vars: { n, i, j, minIdx, minVal, compares, swaps, skipped },
        layers: layer({ focus1: [j], focus2: [minIdx], done: range(0, i - 1), pointers: minPtr(minIdx) }),
      }));
      if (smaller) {
        const prevVal = minVal;
        minIdx = j;
        minVal = arr[j];
        steps.push(step({
          event: 'candidate', lineId: 'upd',
          note: `候选值从 ${prevVal} 换成更小的 ${minVal}，候选位置移到 a[${minIdx}]；数组一个元素都没动。`,
          vars: { n, i, j, minIdx, minVal, compares, swaps, skipped },
          layers: layer({ focus1: [minIdx], done: range(0, i - 1), pointers: minPtr(minIdx) }),
        }));
      }
    }

    if (minIdx !== i) {
      const oldI = arr[i];
      const oldL = labels[i];
      const newI = arr[minIdx];
      const newL = labels[minIdx];
      arr[i] = newI;
      labels[i] = newL;
      arr[minIdx] = oldI;
      labels[minIdx] = oldL;
      swaps++;
      steps.push(step({
        event: 'swap', lineId: 'swap',
        note: `${newL} 是剩下里最小的，和被挤出来的 ${oldL} 交换：${newL} 到区首 a[${i}]，${oldL} 落到 a[${minIdx}]。本轮只此一次交换。`,
        vars: { n, i, j: null, minIdx, minVal, compares, swaps, skipped },
        layers: layer({ swap: [i, minIdx], done: range(0, i), pointers: [{ id: 'min', label: `min=${minIdx}`, index: minIdx }] }),
      }));
    } else {
      skipped++;
    }

    steps.push(step({
      event: 'pass-end', lineId: 'pass-end',
      note: minIdx === i
        ? `第 ${i + 1} 轮结束：候选就是区首自己，if (minIdx != i) 为假，这一次自交换被跳过（元素一个都没移动）。`
        : `第 ${i + 1} 轮结束：a[0..${i}] 已就位，后面不再参与比较。`,
      vars: { n, i, j: null, minIdx, minVal, compares, swaps, skipped },
      layers: layer({ done: range(0, i) }),
    }));
  }

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}（比较 ${compares} 次、交换 ${swaps} 次、跳过自交换 ${skipped} 次）。`,
    vars: { n, i: null, j: null, minIdx: null, minVal: null, compares, swaps, skipped },
    layers: [arrayLayer({ id: 'main', title: 'a[]', name: '排序结果', values: [...arr], labels: [...labels], roles: { done: range(0, n - 1) } })],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'selection-standard-v1',
    lines: L, steps, result, meta: { compares, swaps, skipped },
  });
}

/* ------------------------------------------------------------------ 变体 2（双向选择） */

function runV2(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES.v2;
  let swaps = 0;
  let compares = 0;

  const layer = (roles = {}) => [arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]', values: [...arr], labels: [...labels], roles,
  })];
  const ptrs = (minIdx, maxIdx) => ([
    { id: 'min', label: `min=${minIdx}`, index: minIdx },
    { id: 'max', label: `max=${maxIdx}`, index: maxIdx },
  ]);

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：没有需要选择的元素。'
      : `双向选择：一轮同时扫出最小值与最大值，最小放左端、最大放右端，轮数只要 ${Math.ceil((n - 1) / 2)} 轮左右。`,
    vars: { n, left: null, right: null, j: null, minIdx: null, maxIdx: null, compares: 0, swaps: 0 },
    layers: layer(),
  }));

  let left = 0;
  let right = n - 1;
  let round = 0;
  while (left < right) {
    round++;
    let minIdx = left;
    let maxIdx = left;
    steps.push(step({
      event: 'candidate', lineId: 'cand',
      note: `第 ${round} 轮左右边界 a[${left}]…a[${right}]：最小与最大的候选都先落在左端 a[${left}] = ${labels[left]}。`,
      vars: { n, left, right, j: null, minIdx, maxIdx, compares, swaps },
      layers: layer({ focus1: [left], done: sortedEnds(left, right, n), pointers: ptrs(minIdx, maxIdx) }),
    }));

    for (let j = left + 1; j <= right; j++) {
      const smaller = arr[j] < arr[minIdx];
      compares++;
      steps.push(step({
        event: 'compare', lineId: 'mincmp',
        note: `a[${j}] = ${labels[j]} 和候选最小 a[${minIdx}] = ${arr[minIdx]} 比：${smaller ? '更小，候选最小换到它。' : '不小于，候选最小不动。'}`,
        vars: { n, left, right, j, minIdx, maxIdx, compares, swaps },
        layers: layer({ focus1: [j], focus2: [minIdx], done: sortedEnds(left, right, n), pointers: ptrs(minIdx, maxIdx) }),
      }));
      if (smaller) {
        minIdx = j;
        steps.push(step({
          event: 'candidate', lineId: 'mincmp',
          note: `候选最小移到 a[${minIdx}] = ${arr[minIdx]}。`,
          vars: { n, left, right, j, minIdx, maxIdx, compares, swaps },
          layers: layer({ focus1: [minIdx], done: sortedEnds(left, right, n), pointers: ptrs(minIdx, maxIdx) }),
        }));
      }
      const bigger = arr[j] > arr[maxIdx];
      compares++;
      steps.push(step({
        event: 'compare', lineId: 'maxcmp',
        note: `a[${j}] = ${labels[j]} 和候选最大 a[${maxIdx}] = ${arr[maxIdx]} 比：${bigger ? '更大，候选最大换到它。' : '不大于，候选最大不动。'}`,
        vars: { n, left, right, j, minIdx, maxIdx, compares, swaps },
        layers: layer({ focus1: [j], focus2: [maxIdx], done: sortedEnds(left, right, n), pointers: ptrs(minIdx, maxIdx) }),
      }));
      if (bigger) {
        maxIdx = j;
        steps.push(step({
          event: 'candidate', lineId: 'maxcmp',
          note: `候选最大移到 a[${maxIdx}] = ${arr[maxIdx]}。`,
          vars: { n, left, right, j, minIdx, maxIdx, compares, swaps },
          layers: layer({ focus1: [maxIdx], done: sortedEnds(left, right, n), pointers: ptrs(minIdx, maxIdx) }),
        }));
      }
    }

    if (minIdx !== left) {
      const a = arr[left];
      const la = labels[left];
      arr[left] = arr[minIdx];
      labels[left] = labels[minIdx];
      arr[minIdx] = a;
      labels[minIdx] = la;
      swaps++;
      steps.push(step({
        event: 'swap', lineId: 'swapmin',
        note: `最小值 ${labels[left]} 换到左端 a[${left}]；如果最大项原本就在 a[${left}]，它现在跑到 a[${minIdx}] 去了。`,
        vars: { n, left, right, j: null, minIdx, maxIdx, compares, swaps },
        layers: layer({ swap: [left, minIdx], done: sortedEnds(left, right, n), pointers: ptrs(minIdx, maxIdx) }),
      }));
      if (maxIdx === left) {
        maxIdx = minIdx;
        steps.push(step({
          event: 'candidate', lineId: 'fixmax',
          note: `最大值刚被换到 a[${minIdx}]，把 maxIdx 修正为 ${maxIdx}，否则下面会把错的元素当最大项。`,
          vars: { n, left, right, j: null, minIdx, maxIdx, compares, swaps },
          layers: layer({ focus1: [maxIdx], done: sortedEnds(left, right, n), pointers: ptrs(minIdx, maxIdx) }),
        }));
      }
    }

    if (maxIdx !== right) {
      const a = arr[right];
      const la = labels[right];
      arr[right] = arr[maxIdx];
      labels[right] = labels[maxIdx];
      arr[maxIdx] = a;
      labels[maxIdx] = la;
      swaps++;
      steps.push(step({
        event: 'swap', lineId: 'swapmax',
        note: `最大值换到右端 a[${right}]；左右各钉好一个，未排序区缩到 a[${left + 1}..${right - 1}]。`,
        vars: { n, left, right, j: null, minIdx, maxIdx, compares, swaps },
        layers: layer({ swap: [maxIdx, right], done: [...range(0, left), ...range(right, n - 1)], pointers: ptrs(minIdx, maxIdx) }),
      }));
    }

    const doneNow = [...range(0, left), ...range(right, n - 1)];
    steps.push(step({
      event: 'pass-end', lineId: 'pass-end',
      note: `本轮结束：a[0..${left}] 与 a[${right}..${n - 1}] 两端都已就位，未排序区只剩 a[${left + 1}..${right - 1}]。`,
      vars: { n, left, right, j: null, minIdx, maxIdx, compares, swaps },
      layers: layer({ done: doneNow }),
    }));

    left++;
    right--;
  }

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}（双向扫描比较 ${compares} 次、交换 ${swaps} 次）。`,
    vars: { n, left: null, right: null, j: null, minIdx: null, maxIdx: null, compares, swaps },
    layers: [arrayLayer({ id: 'main', title: 'a[]', name: '排序结果', values: [...arr], labels: [...labels], roles: { done: range(0, n - 1) } })],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'selection-bidirectional-v1',
    lines: L, steps, result, meta: { compares, swaps },
  });
}

/* ------------------------------------------------------------------ 变体 3（零自交换） */

function runV3(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES.v3;
  let swaps = 0;
  let compares = 0;
  let selfSwapSkipped = 0;

  const layer = (roles = {}) => [arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]', values: [...arr], labels: [...labels], roles,
  })];
  const minPtr = (idx) => [{ id: 'min', label: `min=${idx}`, index: idx }];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：没有需要选择的元素。'
      : '与 v1 的差别：只记下标，不复制候选值；而且 min == i 时整个交换被跳过——少一次无意义的自交换。',
    vars: { n, i: null, j: null, min: null, compares: 0, swaps: 0, selfSwapSkipped: 0 },
    layers: layer(),
  }));

  for (let i = 0; i < n - 1; i++) {
    let min = i;
    steps.push(step({
      event: 'candidate', lineId: 'cand',
      note: `第 ${i + 1} 轮：未排序区 a[${i}..${n - 1}]，先假设区首 a[${i}] = ${labels[i]} 最小，只把下标记下来。`,
      vars: { n, i, j: null, min, compares, swaps, selfSwapSkipped },
      layers: layer({ focus1: [i], done: range(0, i - 1), pointers: minPtr(min) }),
    }));

    for (let j = i + 1; j < n; j++) {
      const smaller = arr[j] < arr[min];
      compares++;
      steps.push(step({
        event: 'compare', lineId: 'cmp',
        note: `a[${j}] = ${labels[j]} ${smaller ? '<' : '≥'} a[${min}] = ${arr[min]}：${smaller ? '更小，最小下标要跟上。' : '不比当前最小小，下标不动。'}`,
        vars: { n, i, j, min, compares, swaps, selfSwapSkipped },
        layers: layer({ focus1: [j], focus2: [min], done: range(0, i - 1), pointers: minPtr(min) }),
      }));
      if (smaller) {
        const prev = min;
        min = j;
        steps.push(step({
          event: 'candidate', lineId: 'upd',
          note: `最小下标从 ${prev} 挪到 ${min}；数组元素一个都没动，只是指针改指向。`,
          vars: { n, i, j, min, compares, swaps, selfSwapSkipped },
          layers: layer({ focus1: [min], done: range(0, i - 1), pointers: minPtr(min) }),
        }));
      }
    }

    if (min !== i) {
      const a = arr[i];
      const la = labels[i];
      arr[i] = arr[min];
      labels[i] = labels[min];
      arr[min] = a;
      labels[min] = la;
      swaps++;
      steps.push(step({
        event: 'swap', lineId: 'swap',
        note: `min = ${min} ≠ i = ${i}：把 ${labels[i]} 换到区首，${la} 落到 a[${min}]。`,
        vars: { n, i, j: null, min, compares, swaps, selfSwapSkipped },
        layers: layer({ swap: [i, min], done: range(0, i), pointers: [{ id: 'min', label: `min=${min}`, index: min }] }),
      }));
      steps.push(step({
        event: 'pass-end', lineId: 'pass-end',
        note: `第 ${i + 1} 轮结束：a[0..${i}] 已就位。`,
        vars: { n, i, j: null, min, compares, swaps, selfSwapSkipped },
        layers: layer({ done: range(0, i) }),
      }));
    } else {
      selfSwapSkipped++;
      steps.push(step({
        event: 'pass-end', lineId: 'skip',
        note: `min == i == ${i}：最小值本来就在区首，整条交换被跳过（selfSwapSkipped = ${selfSwapSkipped}），没有任何写操作。`,
        vars: { n, i, j: null, min, compares, swaps, selfSwapSkipped },
        layers: layer({ done: range(0, i) }),
      }));
    }
  }

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}（比较 ${compares} 次、交换 ${swaps} 次、跳过的自交换 ${selfSwapSkipped} 次）。`,
    vars: { n, i: null, j: null, min: null, compares, swaps, selfSwapSkipped },
    layers: [arrayLayer({ id: 'main', title: 'a[]', name: '排序结果', values: [...arr], labels: [...labels], roles: { done: range(0, n - 1) } })],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'selection-no-self-swap-v1',
    lines: L, steps, result, meta: { compares, swaps, selfSwapSkipped },
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
