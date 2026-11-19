/**
 * A · 希尔排序（3 个代表性且彼此不同的实现）
 *
 * 三个变体的差别**只在增量序列**（gap sequence）——这正是希尔排序的全部时间性能来源：
 *   v1 折半增量 n/2：gap = n/2, n/4, …, 1         （最简单，最坏 O(n²)）
 *   v2 Knuth 3h+1：gap ∈ {1,4,13,40,…}，取不超过 n 的最大项后按 (h-1)/3 回退
 *   v3 Hibbard 2^k-1：gap ∈ {1,3,7,15,…}，相邻增量互质，减少重复比较
 *
 * 每个 gap 都做同一件事：把表切成 gap 条子序列，**每条子序列内部**做直接插入排序。
 * 画面重点：gap 在变小、同组下标之间相差 gap、组内比较与后移、最后一轮 gap=1 才是纯插入排序。
 */

import { trace, step, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'a/shell-sort',
  variants: [
    { id: 'v1', name: '折半增量 n/2' },
    { id: 'v2', name: 'Knuth 序列 3h+1' },
    { id: 'v3', name: 'Hibbard 序列 2^k-1' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void shell_sort(int a[], int n) {' },
    { lineId: 'gap', text: '  for (int gap = n / 2; gap >= 1; gap /= 2) {' },
    { lineId: 'group', text: '    /* gap 条子序列：下标 r, r+gap, r+2*gap … 同组 */' },
    { lineId: 'for', text: '    for (int i = gap; i < n; ++i) {' },
    { lineId: 'while', text: '      /* key = a[i]，j = i - gap：组内向前比较 */' },
    { lineId: 'move', text: '      while (j >= 0 && a[j] > key) { a[j + gap] = a[j]; j -= gap; }' },
    { lineId: 'place', text: '      a[j + gap] = key;                /* 组内落位 */' },
    { lineId: 'for-end', text: '    }' },
    { lineId: 'gap-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void knuth_shell_sort(int a[], int n) {' },
    { lineId: 'seq', text: '  int h = 1; while (h < n / 3) h = 3 * h + 1;   /* 1,4,13,40… */' },
    { lineId: 'gap', text: '  for (; h >= 1; h = (h - 1) / 3) {' },
    { lineId: 'group', text: '    /* 同组下标：r, r+h, r+2h …（h 越大，跨组跳得越远） */' },
    { lineId: 'for', text: '    for (int i = h; i < n; ++i) {' },
    { lineId: 'while', text: '      /* key = a[i]，j = i - h：组内向前比较 */' },
    { lineId: 'move', text: '      while (j >= 0 && a[j] > key) { a[j + h] = a[j]; j -= h; }' },
    { lineId: 'place', text: '      a[j + h] = key;' },
    { lineId: 'for-end', text: '    }' },
    { lineId: 'gap-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void hibbard_shell_sort(int a[], int n) {' },
    { lineId: 'seq', text: '  int h = 1; while (h * 2 + 1 < n) h = h * 2 + 1;  /* 1,3,7,15… */' },
    { lineId: 'gap', text: '  for (; h >= 1; h = (h - 1) / 2) {' },
    { lineId: 'group', text: '    /* 同组下标：r, r+h, r+2h …；相邻增量互质，重复比较少 */' },
    { lineId: 'for', text: '    for (int i = h; i < n; ++i) {' },
    { lineId: 'while', text: '      /* key = a[i]，j = i - h：组内向前比较 */' },
    { lineId: 'move', text: '      while (j >= 0 && a[j] > key) { a[j + h] = a[j]; j -= h; }' },
    { lineId: 'place', text: '      a[j + h] = key;' },
    { lineId: 'for-end', text: '    }' },
    { lineId: 'gap-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
};

const EXPECT_SORTED = (array) => {
  const sorted = [...array].sort((a, b) => a - b);
  const labels = labelsOf(sorted);
  return { array: sorted, labels };
};

export const samples = [
  {
    id: 'normal',
    label: '[9,8,3,7,5,6]（n=6，三个变体的增量序列各不相同，结果一致）',
    input: { array: [9, 8, 3, 7, 5, 6] },
    expect: EXPECT_SORTED([9, 8, 3, 7, 5, 6]),
  },
  {
    id: 'edge-single',
    label: '[1]（单元素，没有任何增量需要跑）',
    input: { array: [1] },
    expect: EXPECT_SORTED([1]),
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

/* ------------------------------------------------------------------ 增量序列（三个变体唯一的本质差别） */

/** v1：n/2, n/4, …, 1 */
function gapsHalf(n) {
  const out = [];
  for (let g = n >> 1; g >= 1; g >>= 1) out.push(g);
  return out;
}

/** v2：Knuth 1,4,13,40,…（3h+1），取最大的小于 n 的项，再从大到小回退 */
function gapsKnuth(n) {
  const up = [];
  for (let h = 1; h < n; h = 3 * h + 1) up.push(h);
  return up.reverse();
}

/** v3：Hibbard 1,3,7,15,…（2^k-1），取最大的小于 n 的项，再从大到小回退 */
function gapsHibbard(n) {
  const up = [];
  for (let h = 1; h < n; h = h * 2 + 1) up.push(h);
  return up.reverse();
}

/** 一个 gap 把表切成 gap 条子序列：r, r+gap, r+2*gap … */
function groupIndices(n, gap) {
  const groups = [];
  for (let r = 0; r < gap && r < n; r++) {
    const g = [];
    for (let k = r; k < n; k += gap) g.push(k);
    groups.push(g);
  }
  return groups;
}

/* ------------------------------------------------------------------ 共用轨迹骨架（差异只有增量序列） */

function buildTrace({ variantId, input, gapList, sourceVersion, initNote, firstGapLine, seqNote }) {
  const src = (input || {}).array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES[variantId];
  let moved = 0;
  let compares = 0;

  const layer = (roles = {}) => [arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]', values: [...arr], labels: [...labels], roles,
  })];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：没有任何增量需要跑。'
      : n === 1
        ? '只有 1 个元素：任何增量下子序列都凑不满两项，一趟都不用跑。'
        : initNote,
    vars: { n, gap: null, i: null, j: null, moved: 0, compares: 0 },
    layers: layer(),
  }));

  gapList.forEach((gap, gi) => {
    const groups = groupIndices(n, gap);
    steps.push(step({
      event: 'gap', lineId: gi === 0 ? firstGapLine : 'gap',
      note: gi === 0
        ? seqNote(gap, gapList)
        : `gap 回退到 ${gap}：子序列变短，元素在一次搬移里走得比上一轮近。`,
      vars: { n, gap, i: null, j: null, moved, compares },
      layers: layer({ pointers: gap < n ? [{ id: 'gap', label: `gap=${gap}`, index: gap }] : [] }),
    }));

    for (const g of groups) {
      if (g.length < 2) continue;   // 只有一项的子序列本来就"有序"，跳过
      steps.push(step({
        event: 'group', lineId: 'group',
        note: `gap=${gap} 的第 ${g[0] % gap} 条子序列：下标 ${g.join(', ')}，两两相差 ${gap}，只在组内做插入排序。`,
        vars: { n, gap, i: null, j: null, moved, compares },
        layers: layer({ focus1: g, pointers: [{ id: 'gap', label: `gap=${gap}`, index: g[0] }] }),
      }));
    }

    for (let i = gap; i < n; i++) {
      const key = arr[i];
      const keyLabel = labels[i];
      const r = i % gap;
      let j = i - gap;
      while (j >= 0 && arr[j] > key) {
        compares++;
        steps.push(step({
          event: 'compare', lineId: 'while',
          note: `下标 ${i}（第 ${r} 组）取出 key = ${keyLabel}；同组前一项 a[${j}] = ${labels[j]} 比 key 大，组内逆序。`,
          vars: { n, gap, i, j, moved, compares },
          layers: layer({ focus1: [j], focus2: [i], pointers: [{ id: 'j', label: `j=${j}`, index: j }, { id: 'i', label: `i=${i}`, index: i }] }),
        }));
        arr[j + gap] = arr[j];
        labels[j + gap] = labels[j];
        moved++;
        steps.push(step({
          event: 'shift', lineId: 'move',
          note: `a[${j}] = ${labels[j]} 后移 ${gap} 格到 a[${j + gap}]，空位沿同组向前走。`,
          vars: { n, gap, i, j, moved, compares },
          layers: layer({ focus1: [j + gap], focus2: [j], pointers: [{ id: 'j', label: `j=${j}`, index: j }] }),
        }));
        j -= gap;
      }
      if (j >= 0) {
        compares++;
        steps.push(step({
          event: 'compare', lineId: 'while',
          note: `同组前一项 a[${j}] = ${labels[j]} 不大于 key = ${keyLabel}，停止后移，插入点在 a[${j + gap}]。`,
          vars: { n, gap, i, j, moved, compares },
          layers: layer({ focus1: [j], focus2: [i], pointers: [{ id: 'j', label: `j=${j}`, index: j }] }),
        }));
      } else {
        steps.push(step({
          event: 'compare', lineId: 'while',
          note: `j = ${j} 已经走到本组最左端，key = ${keyLabel} 插到组首 a[${j + gap}]。`,
          vars: { n, gap, i, j, moved, compares },
          layers: layer({ focus2: [i], pointers: [{ id: 'i', label: `i=${i}`, index: i }] }),
        }));
      }
      arr[j + gap] = key;
      labels[j + gap] = keyLabel;
      steps.push(step({
        event: 'place', lineId: 'place',
        note: `key = ${keyLabel} 落到 a[${j + gap}]：第 ${r} 组（下标 ${groups[r].join(', ')}）到 i=${i} 为止的一段已经有序。`,
        vars: { n, gap, i, j: j + gap, moved, compares },
        layers: layer({ focus1: [j + gap], pointers: [{ id: 'pos', label: `pos=${j + gap}`, index: j + gap }] }),
      }));
    }

    steps.push(step({
      event: 'gap-end', lineId: 'gap-end',
      note: gap === 1
        ? `gap=1 这一趟结束：每组就是一个元素，整表有序。`
        : `gap=${gap} 这一趟结束：各条子序列内部已有序，整表还只是"gap-有序"。`,
      vars: { n, gap, i: null, j: null, moved, compares },
      layers: layer(gap === 1 ? { done: range(0, n - 1) } : {}),
    }));
  });

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}（增量序列 ${gapList.join('→') || '无'}，组内比较 ${compares} 次、搬移 ${moved} 次）。`,
    vars: { n, gap: gapList.length ? 1 : null, i: null, j: null, moved, compares },
    layers: [arrayLayer({ id: 'main', title: 'a[]', name: '排序结果', values: [...arr], labels: [...labels], roles: { done: range(0, n - 1) } })],
  }));

  return trace({
    algorithmId: meta.id, variantId, sourceVersion, lines: L, steps, result,
    meta: { gaps: gapList, moved, compares },
  });
}

/* ------------------------------------------------------------------ 变体 1 */

function runV1(input) {
  const n = (input.array || []).length;
  return buildTrace({
    input,
    variantId: 'v1',
    gapList: gapsHalf(n),
    sourceVersion: 'shell-half-v1',
    firstGapLine: 'gap',
    initNote: `n = ${n}：增量从 n/2 = ${n >> 1} 开始每次折半，一路到 1。大间隔先把远距离元素搬到大致位置，最后一轮 gap=1 才是普通的插入排序。`,
    seqNote: (gap) => `gap = ${gap}（n/2 起步）：把表切成 ${gap} 条子序列，每条内部相邻元素相距 ${gap}。`,
  });
}

/* ------------------------------------------------------------------ 变体 2 */

function runV2(input) {
  const n = (input.array || []).length;
  const gapList = gapsKnuth(n);
  return buildTrace({
    input,
    variantId: 'v2',
    gapList,
    sourceVersion: 'shell-knuth-v1',
    firstGapLine: gapList.length ? 'seq' : 'gap',
    initNote: `n = ${n}：先按 3h+1 把增量算出来（1,4,13,40…），用不超过 n 的最大项 ${gapList[0] ?? '—'} 起步，再按 (h-1)/3 回退到 1。`,
    seqNote: (gap, list) => `Knuth 序列取到 gap = ${gap}（序列里还有 ${list.join(', ')}）：间隔大于折半增量，第一轮就能把远距离的小元素搬得更近。`,
  });
}

/* ------------------------------------------------------------------ 变体 3 */

function runV3(input) {
  const n = (input.array || []).length;
  const gapList = gapsHibbard(n);
  return buildTrace({
    input,
    variantId: 'v3',
    gapList,
    sourceVersion: 'shell-hibbard-v1',
    firstGapLine: gapList.length ? 'seq' : 'gap',
    initNote: `n = ${n}：先按 2^k-1 把增量算出来（1,3,7,15…），用不超过 n 的最大项 ${gapList[0] ?? '—'} 起步。Hibbard 序列相邻项互质，重复比较更少。`,
    seqNote: (gap, list) => `Hibbard 序列取到 gap = ${gap}（序列里还有 ${list.join(', ')}）：所有增量都是奇数，组与组之间不容易重复扫到同一对元素。`,
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
