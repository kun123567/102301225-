/**
 * A · 折半插入排序（3 个代表性且彼此不同的实现）
 *
 * 与直接插入排序的差别：找插入位置不再从右往左线性扫，而是对**有序前缀**做二分。
 * 比较次数从 O(i) 降到 O(log i)，但搬移次数**一点没少**——动画要同时讲清这两件事。
 *
 *   v1 上界二分版：找第一个「严格大于」key 的位置（upper bound）→ 相等值排在后面，稳定
 *   v2 下界二分版：找第一个「不小于」key 的位置（lower bound）→ 相等值插到前面，不稳定
 *   v3 哨兵折半版：a[0] 作哨兵，折半区间改到 a[1..i-1]，搬移与落位都带上哨兵位
 *
 * 关于 expect：v2 天然会把相等值换到前面（lower bound 的合法结果，不是 bug），
 * 因此 normal 样例用 expectByVariant 单独声明 v2 的 标签顺序
 * （docs/04-轨迹契约.md §5：结果合法地不同就单独声明，不许为了通过校验改算法）。
 */

import { trace, step, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'a/binary-insertion-sort',
  variants: [
    { id: 'v1', name: '上界二分版' },
    { id: 'v2', name: '下界二分版' },
    { id: 'v3', name: '哨兵折半版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void binary_insertion_sort(int a[], int n) {' },
    { lineId: 'for', text: '  for (int i = 1; i < n; ++i) {' },
    { lineId: 'key', text: '    int key = a[i]; int lo = 0, hi = i - 1;  /* 搜索区间 a[0..i-1] */' },
    { lineId: 'while', text: '    while (lo <= hi) {' },
    { lineId: 'probe', text: '      int mid = (lo + hi) / 2;            /* 取中点后与 key 比较 */' },
    { lineId: 'hi', text: '      if (a[mid] > key) hi = mid - 1;     /* upper bound：第一个 > key */' },
    { lineId: 'lo', text: '      else              lo = mid + 1;     /* 不大于 key：去右半找 */' },
    { lineId: 'shift', text: '    for (int j = i - 1; j >= lo; --j)     /* 整段右移，空出 a[lo] */' },
    { lineId: 'move', text: '      a[j + 1] = a[j];' },
    { lineId: 'place', text: '    a[lo] = key;                          /* 落位 */' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void lower_bound_insertion_sort(int a[], int n) {' },
    { lineId: 'for', text: '  for (int i = 1; i < n; ++i) {' },
    { lineId: 'key', text: '    int key = a[i]; int lo = 0, hi = i - 1;' },
    { lineId: 'while', text: '    while (lo <= hi) {' },
    { lineId: 'probe', text: '      int mid = (lo + hi) / 2;            /* 取中点后与 key 比较 */' },
    { lineId: 'hi', text: '      if (a[mid] >= key) hi = mid - 1;    /* lower bound：第一个 >= key */' },
    { lineId: 'lo', text: '      else               lo = mid + 1;    /* 严格小于 key：去右半找 */' },
    { lineId: 'shift', text: '    for (int j = i - 1; j >= lo; --j)' },
    { lineId: 'move', text: '      a[j + 1] = a[j];' },
    { lineId: 'place', text: '    a[lo] = key;                          /* 相等元素被推到 key 右边 */' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void sentinel_binary_insertion_sort(int a[], int n) {' },
    { lineId: 'for', text: '  for (int i = 2; i <= n; ++i) {           /* 真实数据在 a[1..n] */' },
    { lineId: 'sentinel', text: '    a[0] = a[i]; int lo = 1, hi = i - 1;   /* 哨兵 + 折半区间 a[1..i-1] */' },
    { lineId: 'while', text: '    while (lo <= hi) {' },
    { lineId: 'probe', text: '      int mid = (lo + hi) / 2;             /* 中点与哨兵里的 key 比较 */' },
    { lineId: 'hi', text: '      if (a[mid] > a[0]) hi = mid - 1;     /* 中点更大：插入点在左半 */' },
    { lineId: 'lo', text: '      else               lo = mid + 1;' },
    { lineId: 'shift', text: '    for (int j = i - 1; j >= lo; --j)      /* 搬移区间整体带哨兵位右移 */' },
    { lineId: 'move', text: '      a[j + 1] = a[j];' },
    { lineId: 'place', text: '    a[lo] = a[0];                          /* 从哨兵落位 */' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '[2,3,2]（重复值：v1/v3 稳定，“2a”仍在“2b”前；v2 走 lower bound 会换序）',
    input: { array: [2, 3, 2] },
    expect: { array: [2, 2, 3], labels: ['2a', '2b', '3'] },
    expectByVariant: { v2: { array: [2, 2, 3], labels: ['2b', '2a', '3'] } },
  },
  {
    id: 'edge-empty',
    label: '[]（空数组，一步都不折半）',
    input: { array: [] },
    expect: { array: [], labels: [] },
  },
  {
    id: 'edge-single',
    label: '[7]（单元素，没有需要插入的项）',
    input: { array: [7] },
    expect: { array: [7], labels: ['7'] },
  },
];

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};

/* ------------------------------------------------------------------ 变体 1（upper bound） */

function runV1(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES.v1;
  let moved = 0;
  let probes = 0;

  const layer = (roles = {}) => [arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]', values: [...arr], labels: [...labels], roles,
  })];
  const ptrs = (lo, mid, hi) => {
    const out = [];
    if (lo != null) out.push({ id: 'lo', label: `lo=${lo}`, index: lo });
    if (mid != null) out.push({ id: 'mid', label: `mid=${mid}`, index: mid });
    if (hi != null) out.push({ id: 'hi', label: `hi=${hi}`, index: hi });
    return out;
  };
  const span = (lo, hi) => (lo <= hi ? { range: [lo, hi], rangeLabel: `[${lo},${hi}]` } : {});

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：没有需要折半插入的元素。'
      : n === 1
        ? '只有 1 个元素：它自己就是有序前缀，没有需要折半查找的插入点。'
        : `把 a[0] 当有序前缀，i 从 1 走到 ${n - 1}：每个 key 都在 a[0..i-1] 里折半找插入点。`,
    vars: { n, i: null, key: null, lo: null, hi: null, mid: null, moved: 0, probes: 0 },
    layers: layer({ done: n ? [0] : [] }),
  }));

  for (let i = 1; i < n; i++) {
    const key = arr[i];
    const keyLabel = labels[i];
    let lo = 0;
    let hi = i - 1;
    steps.push(step({
      event: 'pick', lineId: 'key',
      note: `取出 a[${i}] = ${keyLabel} 存进 key；折半区间取有序前缀 a[${lo}..${hi}]（upper bound：找第一个 > key 的位置）。`,
      vars: { n, i, key: keyLabel, lo, hi, mid: null, moved, probes },
      layers: layer({ focus1: [i], done: range(0, i - 1), pointers: ptrs(lo, null, hi), marks: span(lo, hi) }),
    }));

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const greater = arr[mid] > key;
      probes++;
      steps.push(step({
        event: 'probe', lineId: 'probe',
        note: `mid = ${mid}：a[${mid}] = ${labels[mid]} ${greater ? '>' : '≤'} key = ${keyLabel}，${greater ? '中点更大，插入点只可能在左半 mid-1 及其左边。' : '中点不大于 key，key 可以排到它右边，去右半继续。'}`,
        vars: { n, i, key: keyLabel, lo, hi, mid, moved, probes },
        layers: layer({ focus1: [mid], done: range(0, i - 1), pointers: ptrs(lo, mid, hi), marks: span(lo, hi) }),
      }));
      if (greater) hi = mid - 1; else lo = mid + 1;
      const empty = lo > hi;
      steps.push(step({
        event: 'narrow', lineId: greater ? 'hi' : 'lo',
        note: empty
          ? `区间收缩为空：插入位置确定为 a[${lo}]（左边全部 ≤ key，右边全部 > key）。`
          : `区间收缩为 a[${lo}..${hi}]，继续折半。`,
        vars: { n, i, key: keyLabel, lo, hi, mid, moved, probes },
        layers: layer(empty
          ? { focus2: [lo], done: range(0, i - 1), pointers: [{ id: 'pos', label: `pos=${lo}`, index: lo }] }
          : { done: range(0, i - 1), pointers: ptrs(lo, null, hi), marks: span(lo, hi) }),
      }));
    }

    const pos = lo;
    for (let j = i - 1; j >= pos; j--) {
      arr[j + 1] = arr[j];
      labels[j + 1] = labels[j];
      moved++;
      steps.push(step({
        event: 'shift', lineId: 'move',
        note: `折半只省比较，不省搬移：a[${j}] = ${labels[j]} 右移到 a[${j + 1}]。`,
        vars: { n, i, key: keyLabel, lo: pos, hi: null, mid: null, moved, probes },
        layers: layer({ focus1: [j + 1], focus2: [j], done: range(0, i - 1) }),
      }));
    }
    arr[pos] = key;
    labels[pos] = keyLabel;
    steps.push(step({
      event: 'place', lineId: 'place',
      note: `key = ${keyLabel} 落到 a[${pos}]，前缀 a[0..${i}] 重新有序。`,
      vars: { n, i, key: keyLabel, lo: pos, hi: null, mid: null, moved, probes },
      layers: layer({ focus1: [pos], done: range(0, i), pointers: [{ id: 'pos', label: `pos=${pos}`, index: pos }] }),
    }));
    steps.push(step({
      event: 'pass-end', lineId: 'for-end',
      note: `第 ${i} 轮结束：有序前缀长度 ${i + 1}。`,
      vars: { n, i, key: keyLabel, lo: pos, hi: null, mid: null, moved, probes },
      layers: layer({ done: range(0, i) }),
    }));
  }

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}（折半比较 ${probes} 次、搬移 ${moved} 次——搬移与直接插入排序一样多）。`,
    vars: { n, i: null, key: null, lo: null, hi: null, mid: null, moved, probes },
    layers: [arrayLayer({ id: 'main', title: 'a[]', name: '排序结果', values: [...arr], labels: [...labels], roles: { done: range(0, n - 1) } })],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'binary-insertion-upper-v1',
    lines: L, steps, result, meta: { moved, probes },
  });
}

/* ------------------------------------------------------------------ 变体 2（lower bound） */

function runV2(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES.v2;
  let moved = 0;
  let probes = 0;

  const layer = (roles = {}) => [arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]', values: [...arr], labels: [...labels], roles,
  })];
  const ptrs = (lo, mid, hi) => {
    const out = [];
    if (lo != null) out.push({ id: 'lo', label: `lo=${lo}`, index: lo });
    if (mid != null) out.push({ id: 'mid', label: `mid=${mid}`, index: mid });
    if (hi != null) out.push({ id: 'hi', label: `hi=${hi}`, index: hi });
    return out;
  };
  const span = (lo, hi) => (lo <= hi ? { range: [lo, hi], rangeLabel: `[${lo},${hi}]` } : {});

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：没有需要折半插入的元素。'
      : n === 1
        ? '只有 1 个元素：有序前缀就是它自己，不存在要找的插入位置。'
        : '与 v1 只差一个比较符：这里找第一个 ≥ key 的位置，相等元素会被顶到 key 右边。',
    vars: { n, i: null, key: null, lo: null, hi: null, mid: null, moved: 0, probes: 0 },
    layers: layer({ done: n ? [0] : [] }),
  }));

  for (let i = 1; i < n; i++) {
    const key = arr[i];
    const keyLabel = labels[i];
    let lo = 0;
    let hi = i - 1;
    steps.push(step({
      event: 'pick', lineId: 'key',
      note: `取出 a[${i}] = ${keyLabel} 存进 key；折半区间 a[${lo}..${hi}]（lower bound：找第一个 ≥ key 的位置）。`,
      vars: { n, i, key: keyLabel, lo, hi, mid: null, moved, probes },
      layers: layer({ focus1: [i], done: range(0, i - 1), pointers: ptrs(lo, null, hi), marks: span(lo, hi) }),
    }));

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const notLess = arr[mid] >= key;
      probes++;
      steps.push(step({
        event: 'probe', lineId: 'probe',
        note: `mid = ${mid}：a[${mid}] = ${labels[mid]} ${notLess ? '≥' : '<'} key = ${keyLabel}，${notLess ? '中点不小于 key，插入点不会在它右边。' : '中点严格小于 key，插入点必须更靠右。'}`,
        vars: { n, i, key: keyLabel, lo, hi, mid, moved, probes },
        layers: layer({ focus1: [mid], done: range(0, i - 1), pointers: ptrs(lo, mid, hi), marks: span(lo, hi) }),
      }));
      if (notLess) hi = mid - 1; else lo = mid + 1;
      const empty = lo > hi;
      steps.push(step({
        event: 'narrow', lineId: notLess ? 'hi' : 'lo',
        note: empty
          ? `区间收缩为空：插入位置确定为 a[${lo}]（第一个 ≥ key 的位置，相等元素会让位到后面）。`
          : `区间收缩为 a[${lo}..${hi}]，继续折半。`,
        vars: { n, i, key: keyLabel, lo, hi, mid, moved, probes },
        layers: layer(empty
          ? { focus2: [lo], done: range(0, i - 1), pointers: [{ id: 'pos', label: `pos=${lo}`, index: lo }] }
          : { done: range(0, i - 1), pointers: ptrs(lo, null, hi), marks: span(lo, hi) }),
      }));
    }

    const pos = lo;
    for (let j = i - 1; j >= pos; j--) {
      arr[j + 1] = arr[j];
      labels[j + 1] = labels[j];
      moved++;
      steps.push(step({
        event: 'shift', lineId: 'move',
        note: `a[${j}] = ${labels[j]} 右移到 a[${j + 1}]（含与 key 相等的元素，所以相等值会换序）。`,
        vars: { n, i, key: keyLabel, lo: pos, hi: null, mid: null, moved, probes },
        layers: layer({ focus1: [j + 1], focus2: [j], done: range(0, i - 1) }),
      }));
    }
    arr[pos] = key;
    labels[pos] = keyLabel;
    steps.push(step({
      event: 'place', lineId: 'place',
      note: `key = ${keyLabel} 落到 a[${pos}]：它插在所有相等元素的左边，前缀 a[0..${i}] 有序但不再保证稳定。`,
      vars: { n, i, key: keyLabel, lo: pos, hi: null, mid: null, moved, probes },
      layers: layer({ focus1: [pos], done: range(0, i), pointers: [{ id: 'pos', label: `pos=${pos}`, index: pos }] }),
    }));
    steps.push(step({
      event: 'pass-end', lineId: 'for-end',
      note: `第 ${i} 轮结束：有序前缀长度 ${i + 1}。`,
      vars: { n, i, key: keyLabel, lo: pos, hi: null, mid: null, moved, probes },
      layers: layer({ done: range(0, i) }),
    }));
  }

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}（折半比较 ${probes} 次、搬移 ${moved} 次；相等值顺序与 v1 相反）。`,
    vars: { n, i: null, key: null, lo: null, hi: null, mid: null, moved, probes },
    layers: [arrayLayer({ id: 'main', title: 'a[]', name: '排序结果', values: [...arr], labels: [...labels], roles: { done: range(0, n - 1) } })],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'binary-insertion-lower-v1',
    lines: L, steps, result, meta: { moved, probes },
  });
}

/* ------------------------------------------------------------------ 变体 3（哨兵折半） */

function runV3(input) {
  const src = input.array || [];
  const n = src.length;
  // a[0] 是哨兵位，真实数据在 a[1..n]
  const arr = [null, ...src];
  const labels = ['哨兵', ...labelsOf(src)];
  const steps = [];
  const L = LINES.v3;
  let moved = 0;
  let probes = 0;

  const shown = (roles = {}) => [arrayLayer({
    id: 'main', title: 'a[0..n]（a[0] 哨兵）', name: 'int a[n+1]',
    values: arr.map((v) => (v == null ? '·' : v)), labels: [...labels], roles,
  })];
  const ptrs = (lo, mid, hi) => {
    const out = [];
    if (lo != null) out.push({ id: 'lo', label: `lo=${lo}`, index: lo });
    if (mid != null) out.push({ id: 'mid', label: `mid=${mid}`, index: mid });
    if (hi != null) out.push({ id: 'hi', label: `hi=${hi}`, index: hi });
    return out;
  };
  const span = (lo, hi) => (lo <= hi ? { range: [lo, hi], rangeLabel: `[${lo},${hi}]` } : {});

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：哨兵位保留，没有需要折半插入的元素。'
      : `a[0] 空出来当哨兵，真实元素在 a[1..${n}]；折半区间是 a[1..i-1]，所有下标都比数据下标大 1。`,
    vars: { n, i: null, key: null, lo: null, hi: null, mid: null, moved: 0, probes: 0 },
    layers: shown({ done: n ? [1] : [] }),
  }));

  for (let i = 2; i <= n; i++) {
    const key = arr[i];
    const keyLabel = labels[i];
    arr[0] = key;
    labels[0] = `${keyLabel}(哨兵)`;
    let lo = 1;
    let hi = i - 1;
    steps.push(step({
      event: 'pick', lineId: 'sentinel',
      note: `把 a[${i}] = ${keyLabel} 同时写进哨兵位 a[0]：折半时与 a[0] 比较，省掉一次 key 的额外存取；区间取 a[${lo}..${hi}]。`,
      vars: { n, i, key: keyLabel, lo, hi, mid: null, moved, probes },
      layers: shown({ focus1: [0], focus2: [i], done: range(1, i - 1), pointers: ptrs(lo, null, hi), marks: span(lo, hi) }),
    }));

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const greater = arr[mid] > arr[0];
      probes++;
      steps.push(step({
        event: 'probe', lineId: 'probe',
        note: `mid = ${mid}：a[${mid}] = ${labels[mid]} ${greater ? '>' : '≤'} 哨兵 ${keyLabel}，${greater ? '中点更大，去左半。' : '中点不大于哨兵，去右半。'}`,
        vars: { n, i, key: keyLabel, lo, hi, mid, moved, probes },
        layers: shown({ focus1: [mid], focus2: [0], done: range(1, i - 1), pointers: ptrs(lo, mid, hi), marks: span(lo, hi) }),
      }));
      if (greater) hi = mid - 1; else lo = mid + 1;
      const empty = lo > hi;
      steps.push(step({
        event: 'narrow', lineId: greater ? 'hi' : 'lo',
        note: empty
          ? `区间收缩为空：插入位置确定为 a[${lo}]（真实数据里是第 ${lo} 格，比 v1 的下标大 1）。`
          : `区间收缩为 a[${lo}..${hi}]，继续折半。`,
        vars: { n, i, key: keyLabel, lo, hi, mid, moved, probes },
        layers: shown(empty
          ? { focus2: [lo], done: range(1, i - 1), pointers: [{ id: 'pos', label: `pos=${lo}`, index: lo }] }
          : { done: range(1, i - 1), pointers: ptrs(lo, null, hi), marks: span(lo, hi) }),
      }));
    }

    const pos = lo;
    for (let j = i - 1; j >= pos; j--) {
      arr[j + 1] = arr[j];
      labels[j + 1] = labels[j];
      moved++;
      steps.push(step({
        event: 'shift', lineId: 'move',
        note: `a[${j}] = ${labels[j]} 右移到 a[${j + 1}]；搬移区间从 i-1 一直到 pos，哨兵位不动。`,
        vars: { n, i, key: keyLabel, lo: pos, hi: null, mid: null, moved, probes },
        layers: shown({ focus1: [j + 1], focus2: [j], done: range(1, i - 1) }),
      }));
    }
    arr[pos] = arr[0];
    labels[pos] = keyLabel;
    steps.push(step({
      event: 'place', lineId: 'place',
      note: `a[${pos}] ← 哨兵里的 ${keyLabel}，a[1..${i}] 重新有序。`,
      vars: { n, i, key: keyLabel, lo: pos, hi: null, mid: null, moved, probes },
      layers: shown({ focus1: [pos], done: range(1, i), pointers: [{ id: 'pos', label: `pos=${pos}`, index: pos }] }),
    }));
    steps.push(step({
      event: 'pass-end', lineId: 'for-end',
      note: `第 ${i - 1} 轮结束：有序前缀长度 ${i}（不含哨兵位）。`,
      vars: { n, i, key: keyLabel, lo: pos, hi: null, mid: null, moved, probes },
      layers: shown({ done: range(1, i) }),
    }));
  }

  const result = { array: arr.slice(1), labels: labels.slice(1) };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${result.array.join(', ')}（折半比较 ${probes} 次、搬移 ${moved} 次；结果里不含哨兵位）。`,
    vars: { n, i: null, key: null, lo: null, hi: null, mid: null, moved, probes },
    layers: [arrayLayer({ id: 'main', title: '排序结果', name: 'int a[n]', values: [...result.array], labels: [...result.labels], roles: { done: range(0, n - 1) } })],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'binary-insertion-sentinel-v1',
    lines: L, steps, result, meta: { moved, probes },
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
