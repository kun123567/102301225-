/**
 * E · 计数排序（3 个策略真正不同的实现）
 *
 * 事件词表：init / count-frequency / prefix-sum / write-back / overflow / done
 *
 *   v1 直接按频次展开：值 → 次数 用映射表记；按值升序、每个值直接写 count 次。
 *      —— 不做前缀和，也不记录同值元素的原始次序，所以**不稳定**。
 *   v2 min 偏移支持负数：开 span = max-min+1 格的偏移数组，下标 = 值 - min；
 *      负数、跨度超限都在分配之前处理干净，然后按值升序展开。
 *   v3 稳定版（从右往左回填）：频次 → 前缀和（= 每个值的"末尾位置"）→ 从右往左扫，
 *      每取一个就把计数减一，同值元素因此保持原次序。
 *
 * 画面：主 style 1 数组 + 辅助 style 1 频次表（v3 多一张 out[] 结果盘）。
 * 计数排序的代价是 O(n + 跨度)：跨度超限（maxSpan）直接拒绝，不硬开表。
 */

import { trace, step, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'e/counting-sort',
  variants: [
    { id: 'v1', name: '直接按频次展开' },
    { id: 'v2', name: 'min 偏移支持负数' },
    { id: 'v3', name: '稳定版（从右往左回填）' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void counting_expand(int a[], int n, int maxSpan) {' },
    { lineId: 'guard', text: '  if (max - min + 1 > maxSpan) return ERROR;   /* 值域超限：拒绝 */' },
    { lineId: 'minmax', text: '  int min = min_of(a), max = max_of(a), span = max - min + 1;' },
    { lineId: 'alloc', text: '  /* 只给"出现过的值"建条目：value -> cnt 的映射表 */' },
    { lineId: 'count', text: '    ++map[a[i]];                          /* 统计每个值出现几次 */' },
    { lineId: 'fill', text: '  for (v = min; v <= max; ++v)            /* 按值从小到大直接展开 */' },
    { lineId: 'fill-in', text: '    while (map[v]-- > 0) a[p++] = v;      /* 不做前缀和，只写 count 次 */' },
    { lineId: 'unstable', text: '  /* 直接展开根本不记录同值元素的先后，故不稳定 */' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void counting_offset(int a[], int n, int maxSpan) {' },
    { lineId: 'guard', text: '  if (max - min + 1 > maxSpan) return ERROR;' },
    { lineId: 'minmax', text: '  int min = min_of(a), max = max_of(a);' },
    { lineId: 'offset', text: '  int off = -min, span = max - min + 1;  /* 偏移：负数也能当下标 */' },
    { lineId: 'alloc', text: '  int f[span] = {0};' },
    { lineId: 'count', text: '    ++f[a[i] + off];                     /* 下标 = 值 - min */' },
    { lineId: 'fill', text: '  for (k = 0; k < span; ++k)             /* 按值升序展开 */' },
    { lineId: 'fill-in', text: '    while (f[k]-- > 0) a[p++] = k - off; /* 还原成原值再写回 */' },
    { lineId: 'space', text: '  /* 空间 O(跨度)：跨度大时不如比较排序，所以先判 maxSpan */' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void counting_stable(int a[], int n, int maxSpan) {' },
    { lineId: 'guard', text: '  if (max - min + 1 > maxSpan) return ERROR;' },
    { lineId: 'alloc', text: '  int min = min_of(a), cnt[max - min + 1] = {0}, out[n];' },
    { lineId: 'count', text: '    ++cnt[a[i] - min];' },
    { lineId: 'prefix', text: '  for (k = 1; k < span; ++k) cnt[k] += cnt[k - 1];   /* 前缀和 = 该值的末尾位置 */' },
    { lineId: 'back', text: '  for (i = n - 1; i >= 0; --i) {          /* 必须从右往左扫 */' },
    { lineId: 'back-in', text: '    out[--cnt[a[i] - min]] = a[i];        /* 先减再落位 */' },
    { lineId: 'copy', text: '  } 再 for (i = 0; i < n; ++i) a[i] = out[i];' },
    { lineId: 'stable', text: '  /* 递减计数 + 逆序扫描 = 稳定：同值元素保持原先后 */' },
    { lineId: 'end', text: '}' },
  ],
};

const spanMsg = (min, max, span, maxSpan) =>
  `值域跨度 ${span}（min=${min}, max=${max}, max-min+1）超过 maxSpan=${maxSpan}：计数表要开 ${span} 格，拒绝排序`;

export const samples = [
  {
    id: 'normal',
    label: '[2,-1,2,0]（含负数与重复值 2）',
    input: { array: [2, -1, 2, 0], maxSpan: 12 },
    expect: { array: [-1, 0, 2, 2], labels: ['-1', '0', '2a', '2b'] },
    // v1 直接展开不记录同值次序：两个 2 的标签会反过来
    expectByVariant: { v1: { array: [-1, 0, 2, 2], labels: ['-1', '0', '2b', '2a'] } },
  },
  {
    id: 'edge-overflow',
    label: '[0,100] maxSpan=12（跨度超限，拒绝）',
    input: { array: [0, 100], maxSpan: 12 },
    expect: { error: spanMsg(0, 100, 101, 12) },
  },
  {
    id: 'edge-empty',
    label: '[]（空数组直接结束）',
    input: { array: [], maxSpan: 12 },
    expect: { array: [], labels: [] },
  },
  {
    id: 'edge-single',
    label: '[5]（单元素：频次表只有一格）',
    input: { array: [5], maxSpan: 12 },
    expect: { array: [5], labels: ['5'] },
  },
];

/* ------------------------------------------------------------------ 公用小件 */

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};

const mainLayer = (values, labels, roles = {}, name = 'int a[n]', title = 'a[]') =>
  arrayLayer({ id: 'main', title, name, values: [...values], labels: [...labels], roles });

/** 辅助 style 1：频次 / 前缀和表。labels 就是"这一格代表哪个值" */
const freqLayer = (counts, labels, roles = {}, name = 'int freq[span]', title = 'freq[]') =>
  arrayLayer({ id: 'freq', title, name, values: [...counts], labels: [...labels], roles });

/** 值域超限：只走两步（overflow + 结束），一格内存都不分配 */
function rejectTrace({ variantId, sourceVersion, lines, src, labels, min, max, span, maxSpan }) {
  const msg = spanMsg(min, max, span, maxSpan);
  const shown = (roles) => mainLayer(src, labels, roles);
  const steps = [
    step({
      event: 'overflow', lineId: 'guard',
      note: `先算值域：min=${min}、max=${max}，跨度 max-min+1 = ${span}，超过上限 maxSpan=${maxSpan}。计数排序的时间与内存是 O(n + 跨度)，跨度一大就不该用它，所以直接拒绝，连表都不开。`,
      vars: { n: src.length, min, max, span, maxSpan, error: 'overflow' },
      layers: [shown({ excluded: range(0, src.length - 1) }), freqLayer([], [], {}, '未分配（跨度超限）')],
    }),
    step({
      event: 'done', lineId: 'end', done: true,
      result: { error: msg, array: [...src], labels: [...labels] },
      note: '输入被拒绝：原数组一个元素都没有动过，结果只报告错误原因。',
      vars: { n: src.length, span, maxSpan, error: 'overflow' },
      layers: [shown({ excluded: range(0, src.length - 1) }), freqLayer([], [], {}, '未分配（跨度超限）')],
    }),
  ];
  return trace({ algorithmId: meta.id, variantId, sourceVersion, lines, steps, result: { error: msg, array: [...src], labels: [...labels] } });
}

/** 空数组：没有 min/max 可算，直接结束 */
function emptyTrace({ variantId, sourceVersion, lines, note, withOut }) {
  const layers0 = [mainLayer([], [], {}, 'int a[0]', 'a[]'), freqLayer([], [], {}, 'int freq[0]', 'freq[]')];
  if (withOut) layers0.push(arrayLayer({ id: 'out', title: 'out[]', name: 'int out[0]', values: [], labels: [], roles: {} }));
  const steps = [
    step({ event: 'init', lineId: 'fn', note, vars: { n: 0 }, layers: layers0 }),
    step({
      event: 'done', lineId: 'end', done: true, result: { array: [], labels: [] },
      note: '空数组：没有元素要计数，结果仍是空数组。',
      vars: { n: 0 },
      layers: [mainLayer([], [], {}, '排序结果', '排序结果'), freqLayer([], [], {}, 'int freq[0]', 'freq[]')],
    }),
  ];
  return trace({ algorithmId: meta.id, variantId, sourceVersion, lines, steps, result: { array: [], labels: [] } });
}

/* ------------------------------------------------------------------ 变体 1：直接按频次展开（映射表，不稳定） */

function runV1(input) {
  const src = [...(input.array || [])];
  const labels0 = labelsOf(src);
  const L = LINES.v1;
  const maxSpan = Number.isFinite(input.maxSpan) ? input.maxSpan : 12;
  const n = src.length;
  if (n === 0) {
    return emptyTrace({
      variantId: 'v1', sourceVersion: 'counting-sort-expand-v1', lines: L,
      note: '空数组：没有 min/max，也没有值要统计，直接结束。',
    });
  }
  const min = Math.min(...src);
  const max = Math.max(...src);
  const span = max - min + 1;
  if (span > maxSpan) {
    return rejectTrace({ variantId: 'v1', sourceVersion: 'counting-sort-expand-v1', lines: L, src, labels: labels0, min, max, span, maxSpan });
  }

  const keys = [...new Set(src)].sort((a, b) => a - b);         // 出现过的值，升序（映射表的条目）
  const counts = new Map(keys.map((k) => [k, 0]));             // 计数从 0 开始，边扫边加
  const slotOf = new Map(keys.map((k, i) => [k, i]));
  const stacks = new Map();                                   // 每个值的标签栈（后进先出）
  src.forEach((v, i) => {
    if (!stacks.has(v)) stacks.set(v, []);
    stacks.get(v).push(labels0[i]);
  });

  const arr = [...src];
  const labels = [...labels0];
  const steps = [];
  const table = (roles = {}) => freqLayer(keys.map((k) => counts.get(k)), keys.map((k) => `值 ${k}`), roles, `映射表：${keys.length} 个出现过的值`, 'map 值→次数');

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: `跨度 ${span} 在 maxSpan=${maxSpan} 之内，可以计数。v1 只给出现过的 ${keys.length} 个值建条目（不看中间空档），代价是丢掉了"谁先谁后"的信息。`,
    vars: { n, min, max, span, maxSpan, distinct: keys.length },
    layers: [mainLayer(arr, labels, {}), table()],
  }));

  for (let i = 0; i < n; i++) {
    const v = src[i];
    counts.set(v, counts.get(v) + 1);
    steps.push(step({
      event: 'count-frequency', lineId: 'count',
      note: `扫到 a[${i}] = ${labels[i]}，把"值 ${v}"的次数加一；映射表按下标跳着放，所以不看值域里的空档。`,
      vars: { n, i, value: v, count: counts.get(v) },
      layers: [mainLayer(arr, labels, { focus1: [i], done: range(0, i - 1) }), table({ focus1: [slotOf.get(v)] })],
    }));
  }

  let p = 0;
  for (const k of keys) {
    if (counts.get(k) <= 0) continue;
    steps.push(step({
      event: 'write-back', lineId: 'fill',
      note: `轮到值 ${k}（出现 ${counts.get(k)} 次）：直接把它连续写 ${counts.get(k)} 次，不需要前缀和算位置。`,
      vars: { n, value: k, count: counts.get(k), write: p },
      layers: [mainLayer(arr, labels, { done: range(0, p - 1) }), table({ focus1: [slotOf.get(k)] })],
    }));
    while (counts.get(k) > 0) {
      counts.set(k, counts.get(k) - 1);
      const lb = stacks.get(k).pop();                          // 栈式：后进先出 → 不稳定
      arr[p] = k;
      labels[p] = lb;
      p++;
      steps.push(step({
        event: 'write-back', lineId: 'fill-in',
        note: `写回 a[${p - 1}] = ${lb}，值 ${k} 还剩 ${counts.get(k)} 个。注意这里没有保存原次序的机制，取出来的是最后一次见到的那个 ${k}。`,
        vars: { n, value: k, remain: counts.get(k), write: p - 1 },
        layers: [mainLayer(arr, labels, { focus1: [p - 1], done: range(0, p - 2) }), table({ focus1: [slotOf.get(k)] })],
      }));
    }
  }

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `排序完成：${arr.join(', ')}。值是对的，但同值元素的先后没有保证（本例两个 2 的标签就反了）；要稳定必须走 v3 的"前缀和 + 从右往左"。`,
    vars: { n, distinct: keys.length, stable: false },
    layers: [mainLayer(arr, labels, { done: range(0, n - 1) }, '排序结果', '排序结果'), table()],
  }));

  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'counting-sort-expand-v1', lines: L, steps, result, meta: { stable: false } });
}

/* ------------------------------------------------------------------ 变体 2：min 偏移（偏移数组，升序展开） */

function runV2(input) {
  const src = [...(input.array || [])];
  const labels0 = labelsOf(src);
  const L = LINES.v2;
  const maxSpan = Number.isFinite(input.maxSpan) ? input.maxSpan : 12;
  const n = src.length;
  if (n === 0) {
    return emptyTrace({
      variantId: 'v2', sourceVersion: 'counting-sort-offset-v1', lines: L,
      note: '空数组：连 min/max 都取不到，不需要分配偏移表，直接结束。',
    });
  }
  const min = Math.min(...src);
  const max = Math.max(...src);
  const span = max - min + 1;
  if (span > maxSpan) {
    return rejectTrace({ variantId: 'v2', sourceVersion: 'counting-sort-offset-v1', lines: L, src, labels: labels0, min, max, span, maxSpan });
  }

  const freq = new Array(span).fill(0);
  const queues = new Map();                                    // 值 → 标签队列（先进先出 → 稳定）
  src.forEach((v, i) => {
    if (!queues.has(v)) queues.set(v, []);
    queues.get(v).push(labels0[i]);
  });
  const valueOf = (k) => k + min;                              // 下标 → 原值
  const slotValues = range(0, span - 1).map(valueOf);

  const arr = [...src];
  const labels = [...labels0];
  const steps = [];
  const table = (roles = {}) => freqLayer(freq, slotValues.map((v) => String(v)), roles, `f[a[i]-min]：跨度 ${span} 格`, 'freq 偏移表');

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: `v1 用映射表绕过负数，v2 用偏移把负数搬到下标上：下标 = 值 - min = 值 + ${-min}，于是 -1 落到 0 号格、2 落到 ${2 - min} 号格。表大小正好是跨度 ${span}，所以必须先确认跨度没超过 maxSpan=${maxSpan}。`,
    vars: { n, min, max, span, maxSpan, off: -min },
    layers: [mainLayer(arr, labels, {}), table()],
  }));

  for (let i = 0; i < n; i++) {
    const v = arr[i];
    const k = v - min;
    freq[k] += 1;
    steps.push(step({
      event: 'count-frequency', lineId: 'count',
      note: `a[${i}] = ${labels[i]} → 下标 ${v} - (${min}) = ${k}，把 f[${k}] 加到 ${freq[k]}。这一步就是"负数靠偏移"的全部秘密。`,
      vars: { n, i, value: v, index: k, count: freq[k] },
      layers: [mainLayer(arr, labels, { focus1: [i], done: range(0, i - 1) }), table({ focus1: [k] })],
    }));
  }

  let p = 0;
  for (let k = 0; k < span; k++) {
    if (freq[k] <= 0) continue;
    steps.push(step({
      event: 'write-back', lineId: 'fill',
      note: `下标 ${k} 对应原值 ${valueOf(k)}，出现 ${freq[k]} 次。按值升序展开：先把它连续写回，再看下一个非空格；空档直接跳过但不影响正确性。`,
      vars: { n, index: k, value: valueOf(k), count: freq[k], write: p },
      layers: [mainLayer(arr, labels, { done: range(0, p - 1) }), table({ focus1: [k] })],
    }));
    while (freq[k] > 0) {
      freq[k] -= 1;
      const lb = queues.get(valueOf(k)).shift();               // 队列：先进先出
      arr[p] = valueOf(k);
      labels[p] = lb;
      p++;
      steps.push(step({
        event: 'write-back', lineId: 'fill-in',
        note: `写回 a[${p - 1}] = ${lb}（原值 ${valueOf(k)}，还要再写 ${freq[k]} 个）。值已经还原成 ${valueOf(k)}，偏移只在查表时出现。`,
        vars: { n, index: k, value: valueOf(k), remain: freq[k], write: p - 1 },
        layers: [mainLayer(arr, labels, { focus1: [p - 1], done: range(0, p - 2) }), table({ focus1: [k] })],
      }));
    }
  }

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `排序完成：${arr.join(', ')}。偏移让负数变得可计数，代价是必须为整个跨度开表（这里 ${span} 格）；跨度远超元素个数时就用 maxSpan 拒绝掉。`,
    vars: { n, min, max, span, off: -min },
    layers: [mainLayer(arr, labels, { done: range(0, n - 1) }, '排序结果', '排序结果'), table()],
  }));

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'counting-sort-offset-v1', lines: L, steps, result, meta: { span } });
}

/* ------------------------------------------------------------------ 变体 3：前缀和 + 从右往左回填（稳定） */

function runV3(input) {
  const src = [...(input.array || [])];
  const labels0 = labelsOf(src);
  const L = LINES.v3;
  const maxSpan = Number.isFinite(input.maxSpan) ? input.maxSpan : 12;
  const n = src.length;
  if (n === 0) {
    return emptyTrace({
      variantId: 'v3', sourceVersion: 'counting-sort-stable-v1', lines: L,
      note: '空数组：没有值要计数，也没有可回填的位置，直接结束。',
      withOut: true,
    });
  }
  const min = Math.min(...src);
  const max = Math.max(...src);
  const span = max - min + 1;
  if (span > maxSpan) {
    return rejectTrace({ variantId: 'v3', sourceVersion: 'counting-sort-stable-v1', lines: L, src, labels: labels0, min, max, span, maxSpan });
  }

  const cnt = new Array(span).fill(0);
  const outVals = new Array(n).fill('·');
  const outLabels = new Array(n).fill('');
  const slotValues = range(0, span - 1).map((k) => String(k + min));

  const arr = [...src];
  const labels = [...labels0];
  const steps = [];
  const table = (roles = {}, name) => freqLayer(cnt, slotValues, roles, name || `cnt[值-min]：跨度 ${span} 格`, 'cnt 计数/前缀和');
  const outLayer = (roles = {}) => arrayLayer({ id: 'out', title: 'out[]', name: `int out[${n}]（结果盘）`, values: [...outVals], labels: [...outLabels], roles });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: `要稳定就必须知道每个值"该从哪个位置结束往前放"：先数频次，再求前缀和得到每个值的末尾位置，最后从右往左扫原数组回填。跨度 ${span}，且 min=${min} 说明负数靠偏移处理。`,
    vars: { n, min, max, span, maxSpan, off: -min },
    layers: [mainLayer(arr, labels, {}), table(), outLayer()],
  }));

  for (let i = 0; i < n; i++) {
    const v = arr[i];
    const k = v - min;
    cnt[k] += 1;
    steps.push(step({
      event: 'count-frequency', lineId: 'count',
      note: `a[${i}] = ${labels[i]} → cnt[${k}] 加到 ${cnt[k]}。这一步只记次数，不带任何次序信息。`,
      vars: { n, i, value: v, index: k, count: cnt[k] },
      layers: [mainLayer(arr, labels, { focus1: [i], done: range(0, i - 1) }), table({ focus1: [k] }), outLayer()],
    }));
  }

  let running = 0;
  for (let k = 0; k < span; k++) {
    running += cnt[k];
    cnt[k] = running;
    steps.push(step({
      event: 'prefix-sum', lineId: 'prefix',
      note: `cnt[${k}] 改成前缀和 ${cnt[k]}：意思是"值 ${k + min} 的元素应该占据 out 的前 ${cnt[k]} 格"，也就是它的**末尾位置**（0-based 的下一个空位）。`,
      vars: { n, index: k, value: k + min, prefix: cnt[k] },
      layers: [mainLayer(arr, labels, {}), table({ focus1: [k], done: range(0, k - 1) }, 'cnt = 各值的末尾位置'), outLayer()],
    }));
  }

  for (let i = n - 1; i >= 0; i--) {
    const v = arr[i];
    const k = v - min;
    cnt[k] -= 1;
    const pos = cnt[k];
    outVals[pos] = v;
    outLabels[pos] = labels[i];
    steps.push(step({
      event: 'write-back', lineId: 'back-in',
      note: `从右往左取到 a[${i}] = ${labels[i]}：cnt[${k}] 先减成 ${pos}，把它放进 out[${pos}]。正因为是从右往左，同值里"后出现"的先落位，也就落得更靠右 —— 原次序因此被保住。`,
      vars: { n, i, value: v, index: k, pos },
      layers: [mainLayer(arr, labels, { focus1: [i], excluded: range(i + 1, n - 1) }), table({ focus1: [k] }, 'cnt = 下一个空位'), outLayer({ added: [pos] })],
    }));
  }

  arr.splice(0, n, ...outVals);
  labels.splice(0, n, ...outLabels);
  steps.push(step({
    event: 'write-back', lineId: 'copy',
    note: `out 已经整体有序，逐格拷回 a[]。到这一步才真正改动了原数组；稳定排序的意义是"同值元素的相对次序与输入完全一致"。`,
    vars: { n, min, max, span },
    layers: [mainLayer(arr, labels, { done: range(0, n - 1) }), table({}, 'cnt 已归零（每格都被消耗掉）'), outLayer({ done: range(0, n - 1) })],
  }));

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `排序完成：${arr.join(', ')}。前缀和定位 + 逆序回填，两个动作缺一不可：只做展开（v1/v2）就会丢掉同值的先后。`,
    vars: { n, min, max, span, stable: true },
    layers: [mainLayer(arr, labels, { done: range(0, n - 1) }, '排序结果', '排序结果'), table({}, 'cnt 已消耗完'), outLayer({ done: range(0, n - 1) })],
  }));

  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'counting-sort-stable-v1', lines: L, steps, result, meta: { stable: true } });
}

/* ------------------------------------------------------------------ 导出 */

const RUNNERS = { v1: runV1, v2: runV2, v3: runV3 };

export function run(variantId, input) {
  const fn = RUNNERS[variantId];
  if (!fn) throw new Error(`未知变体：${variantId}`);
  return fn(input || {});
}

export function sourceLines(variantId) {
  return LINES[variantId] || LINES.v1;
}
