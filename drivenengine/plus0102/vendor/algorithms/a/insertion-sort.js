/**
 * A · 直接插入排序（3 个代表性不同实现）
 *
 * 本文件同时是**所有算法模块的样板**：其它 53 项照这个结构写。
 *   1) meta.variants 必须与 src/catalog/a.js 里的 variant id 一一对应；
 *   2) 每个变体有自己的 sourceLines（展示用 C 代码 + 稳定行号），step.lineId 必须命中；
 *   3) 每一步都是**完整快照**（layers 重新构造），不是增量修改；
 *   4) 最后一步 done=true 且 result 与 sample.expect 深比较一致。
 *
 * 验收样例（任务单 a-sorting-workbench.md）：
 *   [3a,1,3b,2] → [1,2,3a,3b]；空数组直接结束。重复值保留原始编号以核对稳定性。
 */

import { trace, step, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'a/insertion-sort',
  variants: [
    { id: 'v1', name: '教材右移版' },
    { id: 'v2', name: '哨兵版' },
    { id: 'v3', name: '交换上浮版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void insertion_sort(int a[], int n) {' },
    { lineId: 'for', text: '  for (int i = 1; i < n; ++i) {' },
    { lineId: 'key', text: '    int key = a[i];              /* 暂存待插入值 */' },
    { lineId: 'j-init', text: '    int j = i - 1;' },
    { lineId: 'while', text: '    while (j >= 0 && a[j] > key) {' },
    { lineId: 'shift', text: '      a[j + 1] = a[j];          /* 右移一格 */' },
    { lineId: 'dec', text: '      --j;' },
    { lineId: 'place', text: '    a[j + 1] = key;             /* 落位 */' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void sentinel_insertion_sort(int a[], int n) {' },
    { lineId: 'for', text: '  for (int i = 2; i <= n; ++i) {' },
    { lineId: 'sentinel', text: '    a[0] = a[i];                /* 哨兵：省掉越界判断 */' },
    { lineId: 'j-init', text: '    int j = i - 1;' },
    { lineId: 'while', text: '    while (a[j] > a[0]) {' },
    { lineId: 'shift', text: '      a[j + 1] = a[j];' },
    { lineId: 'dec', text: '      --j;' },
    { lineId: 'place', text: '    a[j + 1] = a[0];' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void swap_insertion_sort(int a[], int n) {' },
    { lineId: 'for', text: '  for (int i = 1; i < n; ++i) {' },
    { lineId: 'j-init', text: '    int j = i;' },
    { lineId: 'while', text: '    while (j > 0 && a[j - 1] > a[j]) {' },
    { lineId: 'compare', text: '      /* 相邻逆序：只交换，不做整段搬移 */' },
    { lineId: 'swap', text: '      int t = a[j - 1]; a[j - 1] = a[j]; a[j] = t;' },
    { lineId: 'dec', text: '      --j;' },
    { lineId: 'while-end', text: '    }' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '[3,1,3,2]（带重复值，核对稳定性）',
    input: { array: [3, 1, 3, 2] },
    expect: { array: [1, 2, 3, 3], labels: ['1', '2', '3a', '3b'] },
  },
  {
    id: 'edge-empty',
    label: '[]（空数组直接结束）',
    input: { array: [] },
    expect: { array: [], labels: [] },
  },
  {
    id: 'edge-sorted',
    label: '[1,2,3,4]（已有序，不产生搬移）',
    input: { array: [1, 2, 3, 4] },
    expect: { array: [1, 2, 3, 4], labels: ['1', '2', '3', '4'] },
  },
];

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};

/* ------------------------------------------------------------------ 变体 1 */

function runV1(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES.v1;
  const layer = (o = {}) => [arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]', values: [...arr], labels: [...labels], roles: o.roles || {},
  })];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0 ? '空数组：没有需要插入的元素。' : `共 ${n} 个元素。把 a[0] 当作已排序前缀，从 i=1 开始逐个向前插入。`,
    vars: { n, i: null, key: null, j: null, moved: 0 },
    layers: layer({ roles: { done: n ? [0] : [] } }),
  }));

  let moves = 0;
  for (let i = 1; i < n; i++) {
    const key = arr[i];
    const keyLabel = labels[i];
    steps.push(step({
      event: 'pick', lineId: 'key',
      note: `取出 a[${i}] = ${keyLabel} 暂存到 key，a[${i}] 这一格现在是"空位"。`,
      vars: { n, i, key: keyLabel, j: i - 1, moved: moves },
      layers: layer({ roles: { focus1: [i], done: range(0, i - 1) } }),
    }));
    let j = i - 1;
    while (j >= 0) {
      const cmp = arr[j] > key;
      steps.push(step({
        event: 'compare', lineId: 'while',
        note: `比较 a[${j}] = ${labels[j]} 与 key = ${keyLabel}：${cmp ? '左边更大，需要右移。' : '左侧不大于 key，插入点确定。'}`,
        vars: { n, i, key: keyLabel, j, moved: moves },
        layers: layer({ roles: { focus1: [j], focus2: [i], done: range(0, i - 1) } }),
      }));
      if (!cmp) break;
      arr[j + 1] = arr[j];
      labels[j + 1] = labels[j];
      moves++;
      steps.push(step({
        event: 'shift', lineId: 'shift',
        note: `a[${j}] 右移到 a[${j + 1}]，空位向前移动一格。`,
        vars: { n, i, key: keyLabel, j, moved: moves },
        layers: layer({ roles: { focus1: [j + 1], focus2: [j], done: range(0, i - 1) } }),
      }));
      j--;
    }
    if (j >= 0) {
      steps.push(step({
        event: 'compare', lineId: 'while',
        note: `a[${j}] = ${labels[j]} 不大于 key，循环结束。`,
        vars: { n, i, key: keyLabel, j, moved: moves },
        layers: layer({ roles: { focus1: [j], focus2: [i], done: range(0, i - 1) } }),
      }));
    }
    arr[j + 1] = key;
    labels[j + 1] = keyLabel;
    steps.push(step({
      event: 'place', lineId: 'place',
      note: `key = ${keyLabel} 落到 a[${j + 1}]，前缀 a[0..${i}] 已有序。`,
      vars: { n, i, key: keyLabel, j: j + 1, moved: moves },
      layers: layer({ roles: { focus1: [j + 1], done: range(0, i) } }),
    }));
    steps.push(step({
      event: 'pass-end', lineId: 'for-end',
      note: `第 ${i} 轮结束：有序前缀长度 ${i + 1}。`,
      vars: { n, i, key: keyLabel, j: j + 1, moved: moves },
      layers: layer({ roles: { done: range(0, i) } }),
    }));
  }

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0 ? '排序完成，结果仍是空数组。' : `排序完成：${arr.join(', ')}（总搬移 ${moves} 次）。`,
    vars: { n, i: null, key: null, j: null, moved: moves },
    layers: [arrayLayer({ id: 'main', title: 'a[]', name: '排序结果', values: [...arr], labels: [...labels], roles: { done: range(0, n - 1) } })],
  }));

  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'insertion-sort-v1', lines: L, steps, result, meta: { moves } });
}

/* ------------------------------------------------------------------ 变体 2（哨兵） */

function runV2(input) {
  const src = input.array || [];
  const n = src.length;
  // a[0] 是哨兵，真实数据在 a[1..n]
  const arr = [null, ...src];
  const labels = ['哨兵', ...labelsOf(src)];
  const steps = [];
  const L = LINES.v2;
  const shown = (o = {}) => {
    const values = arr.map((v) => (v == null ? '·' : v));
    return [arrayLayer({
      id: 'main', title: 'a[0..n]（a[0] 哨兵）', name: 'int a[n+1]', values, labels: [...labels], roles: o.roles || {},
    })];
  };

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0 ? '空数组：哨兵位保留，没有需要插入的元素。' : `a[0] 留作哨兵位，真实元素在 a[1..${n}]。哨兵可以省掉 while 里的 j>=0 判断。`,
    vars: { n, i: null, j: null, key: null },
    layers: shown({ roles: { done: n ? [1] : [] } }),
  }));

  for (let i = 2; i <= n; i++) {
    const key = arr[i];
    const keyLabel = labels[i];
    arr[0] = key;
    labels[0] = `${keyLabel}(哨兵)`;
    steps.push(step({
      event: 'pick', lineId: 'sentinel',
      note: `把 a[${i}] = ${keyLabel} 写进哨兵位 a[0]，同时把它当作待插入值。`,
      vars: { n, i, j: i - 1, key: keyLabel },
      layers: shown({ roles: { focus1: [0], focus2: [i], done: range(1, i - 1) } }),
    }));
    let j = i - 1;
    while (arr[j] > arr[0]) {
      steps.push(step({
        event: 'compare', lineId: 'while',
        note: `a[${j}] = ${labels[j]} > 哨兵 ${arr[0]}：继续右移。`,
        vars: { n, i, j, key: keyLabel },
        layers: shown({ roles: { focus1: [j], focus2: [0], done: range(1, i - 1) } }),
      }));
      arr[j + 1] = arr[j];
      labels[j + 1] = labels[j];
      j--;
      steps.push(step({
        event: 'shift', lineId: 'shift',
        note: `a[${j}] 右移到 a[${j + 1}]。`,
        vars: { n, i, j, key: keyLabel },
        layers: shown({ roles: { focus1: [j + 2], focus2: [j + 1], done: range(1, i - 1) } }),
      }));
    }
    steps.push(step({
      event: 'compare', lineId: 'while',
      note: `a[${j}] = ${labels[j]} 不大于哨兵，插入位置是 a[${j + 1}]。`,
      vars: { n, i, j, key: keyLabel },
      layers: shown({ roles: { focus1: [j], focus2: [0], done: range(1, i - 1) } }),
    }));
    arr[j + 1] = arr[0];
    labels[j + 1] = keyLabel;
    steps.push(step({
      event: 'place', lineId: 'place',
      note: `把哨兵里的 ${keyLabel} 写回 a[${j + 1}]，a[1..${i}] 有序。`,
      vars: { n, i, j: j + 1, key: keyLabel },
      layers: shown({ roles: { focus1: [j + 1], done: range(1, i) } }),
    }));
    steps.push(step({
      event: 'pass-end', lineId: 'for-end',
      note: `第 ${i - 1} 轮结束。`,
      vars: { n, i, j: j + 1, key: keyLabel },
      layers: shown({ roles: { done: range(1, i) } }),
    }));
  }

  const result = { array: arr.slice(1), labels: labels.slice(1) };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0 ? '排序完成，结果仍是空数组。' : `排序完成：${result.array.join(', ')}。`,
    vars: { n, i: null, j: null, key: null },
    layers: [arrayLayer({ id: 'main', title: '排序结果', name: 'int a[n]', values: [...result.array], labels: [...result.labels], roles: { done: range(0, n - 1) } })],
  }));

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'insertion-sort-sentinel-v1', lines: L, steps, result });
}

/* ------------------------------------------------------------------ 变体 3（交换上浮） */

function runV3(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES.v3;
  let swaps = 0;
  const layer = (o = {}) => [arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]', values: [...arr], labels: [...labels], roles: o.roles || {},
  })];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0 ? '空数组：直接结束。' : '与教材版的差别：不搬移整段，只用相邻交换让元素一步步浮到正确位置。',
    vars: { n, i: null, j: null, swaps: 0 },
    layers: layer({ roles: { done: n ? [0] : [] } }),
  }));

  for (let i = 1; i < n; i++) {
    let j = i;
    steps.push(step({
      event: 'pick', lineId: 'j-init',
      note: `从 j = ${i} 开始，让 a[${i}] 向左浮。`,
      vars: { n, i, j, swaps },
      layers: layer({ roles: { focus1: [i], done: range(0, i - 1) } }),
    }));
    while (j > 0 && arr[j - 1] > arr[j]) {
      const a = arr[j - 1];
      const b = arr[j];
      const la = labels[j - 1];
      const lb = labels[j];
      steps.push(step({
        event: 'compare', lineId: 'compare',
        note: `a[${j - 1}] = ${la} > a[${j}] = ${lb}：相邻逆序。`,
        vars: { n, i, j, swaps },
        layers: layer({ roles: { focus1: [j - 1], focus2: [j], done: range(0, i - 1) } }),
      }));
      arr[j - 1] = b;
      arr[j] = a;
      labels[j - 1] = lb;
      labels[j] = la;
      swaps++;
      steps.push(step({
        event: 'swap', lineId: 'swap',
        note: `交换 a[${j - 1}] 与 a[${j}]，${lb} 左移一格。`,
        vars: { n, i, j, swaps },
        layers: layer({ roles: { swap: [j - 1, j], done: range(0, i - 1) } }),
      }));
      j--;
    }
    if (j > 0) {
      steps.push(step({
        event: 'compare', lineId: 'while',
        note: `a[${j - 1}] = ${labels[j - 1]} 不大于 a[${j}] = ${labels[j]}，停止上浮。`,
        vars: { n, i, j, swaps },
        layers: layer({ roles: { focus1: [j - 1], focus2: [j], done: range(0, i - 1) } }),
      }));
    }
    steps.push(step({
      event: 'pass-end', lineId: 'for-end',
      note: `第 ${i} 轮结束：a[0..${i}] 已有序。`,
      vars: { n, i, j, swaps },
      layers: layer({ roles: { done: range(0, i) } }),
    }));
  }

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0 ? '排序完成，结果仍是空数组。' : `排序完成：${arr.join(', ')}（相邻交换 ${swaps} 次）。`,
    vars: { n, i: null, j: null, swaps },
    layers: [arrayLayer({ id: 'main', title: '排序结果', name: '排序结果', values: [...arr], labels: [...labels], roles: { done: range(0, n - 1) } })],
  }));

  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'insertion-sort-swap-v1', lines: L, steps, result, meta: { swaps } });
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
