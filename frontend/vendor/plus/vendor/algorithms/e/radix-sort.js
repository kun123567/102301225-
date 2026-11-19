/**
 * E · 基数排序（3 个策略真正不同的实现）
 *
 * 事件词表：init / digit / distribute / bucket / collect / pass-end / done
 *
 *   v1 LSD 十进制计数桶：个位 → 十位 → …，每轮稳定入 10 个桶，再按桶号 0→9 回收；
 *   v2 MSD 递归分桶   ：先按最高位分成 10 个桶，每个桶内部递归看次高位（分治）；
 *   v3 二进制位基数    ：只开 2 个桶，用位运算 >> 取第 bit 位，桶少 → 趟多。
 *
 * 画面：主 style 1 数组 + 辅助 style 6 表格（每个桶一行：桶内元素 / 个数）。
 * 稳定性是这个算法的命根子：同值元素入桶必须尾插、回收必须头取，
 * 所以 21a 永远排在 21b 前面（样例里用 a/b 后缀核对）。
 *
 * 负数一律拒绝：`(a[i] / place) % 10` 对负数会得到负的桶号，桶数组直接越界。
 */

import { trace, step, arrayLayer, gridLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'e/radix-sort',
  variants: [
    { id: 'v1', name: 'LSD 十进制计数桶' },
    { id: 'v2', name: 'MSD 递归分桶' },
    { id: 'v3', name: '二进制位基数（2 桶）' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void radix_lsd(int a[], int n) {' },
    { lineId: 'guard', text: '  if (has_negative(a, n)) return ERROR;      /* 负数拒绝：取余会得到负桶号 */' },
    { lineId: 'maxv', text: '  int maxv = max(a, n);                      /* 决定要跑几轮 */' },
    { lineId: 'pass', text: '  for (int place = 1; place <= maxv; place *= 10) {' },
    { lineId: 'digit', text: '    int k = (a[i] / place) % 10;            /* 取当前位的数字 = 桶号 */' },
    { lineId: 'dist', text: '    bucket[k][tail[k]++] = a[i];            /* 尾插进桶：不打断同桶原序 */' },
    { lineId: 'bucket', text: '    /* bucket[0..9] 各自就位，准备回收 */' },
    { lineId: 'collect', text: '    for (int k = 0; k < 10; ++k)            /* 必须按桶号 0 -> 9 回收 */' },
    { lineId: 'collect-in', text: '      while (cnt[k]--) a[p++] = bucket[k][head[k]++];   /* 头取 = 先进先出 */' },
    { lineId: 'passend', text: '    /* 本轮结束：数组按 place 位有序；低位有序性由稳定性保留 */' },
    { lineId: 'end', text: '  }' },
  ],
  v2: [
    { lineId: 'fn', text: 'void radix_msd(int a[], int lo, int hi, int place) {' },
    { lineId: 'guard', text: '  if (has_negative(a, n)) return ERROR;      /* 负数拒绝 */' },
    { lineId: 'top', text: '  /* 入口：place = maxv 的最高位权，然后 place / 10 逐层向下 */' },
    { lineId: 'base', text: '  if (place == 0 || hi - lo <= 1) return;    /* 桶内至多 1 个元素：已有序 */' },
    { lineId: 'digit', text: '  int k = (a[i] / place) % 10;               /* 高位优先取位 */' },
    { lineId: 'dist', text: '  bucket[k].push(a[i]);                      /* 同桶保持原有相对次序 */' },
    { lineId: 'bucket', text: '  /* 10 个桶：这一位相同的元素落进同一个桶 */' },
    { lineId: 'collect', text: '  for (k = 0; k < 10; ++k) 把 bucket[k] 按原序写回 a[lo..hi)  ' },
    { lineId: 'recurse', text: '  for (k = 0; k < 10; ++k) radix_msd(a, 桶k起, 桶k止, place / 10);  /* 桶内递归 */' },
    { lineId: 'passend', text: '  /* 本层返回：a[lo..hi) 整体有序（分治 + 稳定性） */' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void radix_binary(int a[], int n) {' },
    { lineId: 'guard', text: '  if (has_negative(a, n)) return ERROR;      /* 负数拒绝：算术右移会无限补 1 */' },
    { lineId: 'bits', text: '  int bits = 0; while ((maxv >> bits) > 0) ++bits;   /* 二进制位数 = 趟数 */' },
    { lineId: 'pass', text: '  for (int bit = 0; bit < bits; ++bit) {' },
    { lineId: 'digit', text: '    int k = (a[i] >> bit) & 1;               /* 位运算取第 bit 位 = 桶号 */' },
    { lineId: 'dist', text: '    bucket[k][tail[k]++] = a[i];             /* 只有 2 个桶，仍然尾插 */' },
    { lineId: 'bucket', text: '    /* bucket[0]：该位为 0；bucket[1]：该位为 1 */' },
    { lineId: 'collect', text: '    for (int k = 0; k < 2; ++k)              /* 先收桶 0 再收桶 1 */' },
    { lineId: 'collect-in', text: '      while (cnt[k]--) a[p++] = bucket[k][head[k]++];' },
    { lineId: 'passend', text: '    /* 一轮只消 1 个二进制位：桶少了，趟数多了 */' },
    { lineId: 'end', text: '  }' },
  ],
};

const negativeMsg = (i, v) =>
  `a[${i}] = ${v} 是负数：取位对负数不成立（(a[i] / place) % 10 得到负桶号，>> 会无限补 1），本演示只处理非负整数`;

export const samples = [
  {
    id: 'normal',
    label: '[21,3,21,10]（含重复值 21，核对稳定性）',
    input: { array: [21, 3, 21, 10] },
    expect: { array: [3, 10, 21, 21], labels: ['3', '10', '21a', '21b'] },
  },
  {
    id: 'edge-all-zero',
    label: '[0,0]（全 0：每一位都进 0 号桶）',
    input: { array: [0, 0] },
    expect: { array: [0, 0], labels: ['0a', '0b'] },
  },
  {
    id: 'edge-negative',
    label: '[5,-1,3]（含负数：拒绝）',
    input: { array: [5, -1, 3] },
    expect: { error: negativeMsg(1, -1) },
  },
  {
    id: 'edge-single',
    label: '[7]（单元素：分桶后原样返回）',
    input: { array: [7] },
    expect: { array: [7], labels: ['7'] },
  },
];

/* ------------------------------------------------------------------ 公用小件 */

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};

const placeName = (p) =>
  p === 1 ? '个' : p === 10 ? '十' : p === 100 ? '百' : p === 1000 ? '千' : `10^${String(p).length - 1}`;

const nonEmptyKeys = (buckets) => buckets.map((b, k) => (b.labels.length ? `${k},0` : null)).filter(Boolean);

/** 辅助层：每个桶一行（桶内元素 / 个数），style 6 表格 */
function bucketGrid(buckets, roles = {}, o = {}) {
  return gridLayer({
    id: 'buckets',
    title: o.title || `桶 × ${buckets.length}`,
    name: o.name || '桶：入桶尾插、回收头取（先进先出才稳定）',
    values: buckets.map((b) => [b.labels.length ? b.labels.join(', ') : '·', String(b.labels.length)]),
    rowLabels: o.rowLabels || buckets.map((b, k) => `桶${k}`),
    colLabels: ['桶内元素（入桶顺序）', '个数'],
    props: { cellW: 168, cellH: 26 },
    roles,
  });
}

const emptyBuckets = (k) => Array.from({ length: k }, () => ({ vals: [], labels: [] }));

/** 负数拒绝：只走两步（校验 + 结束），不改动任何元素 */
function rejectTrace({ variantId, sourceVersion, lines, src, labels, index }) {
  const msg = negativeMsg(index, src[index]);
  const shown = (roles) => arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]', values: [...src], labels: [...labels], roles,
  });
  const steps = [
    step({
      event: 'init', lineId: 'guard',
      note: `先做输入校验：a[${index}] = ${src[index]} < 0。基数排序靠"除以位权再取余"取位，负数取余会得到负的桶号，所以直接拒绝，不进入分桶。`,
      vars: { n: src.length, i: index, value: src[index], error: 'negative' },
      layers: [shown({ focus1: [index] }), bucketGrid(emptyBuckets(10), {})],
    }),
    step({
      event: 'done', lineId: 'end', done: true,
      result: { error: msg, array: [...src], labels: [...labels] },
      note: '输入非法：一个元素都没有动过，结果只报告错误原因。',
      vars: { n: src.length, error: 'negative' },
      layers: [shown({ excluded: range(0, src.length - 1) }), bucketGrid(emptyBuckets(10), {})],
    }),
  ];
  return trace({ algorithmId: meta.id, variantId, sourceVersion, lines, steps, result: { error: msg, array: [...src], labels: [...labels] } });
}

/* ------------------------------------------------------------------ LSD 引擎（v1 / v3 共用骨架，桶数与取位方式不同） */

/**
 * @param {object} cfg
 *   variantId / sourceVersion / lines
 *   radix        桶数（10 或 2）
 *   passes       每轮的"位标记"数组
 *   digitOf      (v, marker) -> 桶号
 *   formulaOf    (v, marker) -> 取位表达式文字
 *   labelOf      (marker) -> "十位" / "第 3 位（权 8）"
 *   rowLabel     (k) -> 桶行标题
 *   gridName     辅助表格标题说明
 *   initNote     (info) -> 初始说明
 *   passEndNote  (info) -> 本轮结束说明
 */
function runLsd(cfg) {
  const src = [...(cfg.inputArray || [])];
  const labels0 = labelsOf(src);
  const neg = src.findIndex((v) => v < 0);
  if (neg >= 0) {
    return rejectTrace({ variantId: cfg.variantId, sourceVersion: cfg.sourceVersion, lines: cfg.lines, src, labels: labels0, index: neg });
  }

  const arr = [...src];
  const labels = [...labels0];
  const n = arr.length;
  const maxv = n ? Math.max(...arr) : 0;
  const passes = cfg.passesOf(maxv);
  const steps = [];
  const mainL = (roles = {}) => arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]', values: [...arr], labels: [...labels], roles,
  });
  const gridL = (buckets, roles = {}) => bucketGrid(buckets, roles, {
    name: cfg.gridName,
    rowLabels: buckets.map((b, k) => cfg.rowLabel(k)),
  });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: cfg.initNote({ n, maxv, passCount: passes.length }),
    vars: { n, max: maxv, passes: passes.length },
    layers: [mainL(), gridL(emptyBuckets(cfg.radix))],
  }));

  for (let pi = 0; pi < passes.length; pi++) {
    const marker = passes[pi];
    const buckets = emptyBuckets(cfg.radix);
    for (let i = 0; i < n; i++) {
      const d = cfg.digitOf(arr[i], marker);
      steps.push(step({
        event: 'digit', lineId: 'digit',
        note: `第 ${pi + 1} 轮只看${cfg.labelOf(marker)}：a[${i}] = ${labels[i]} 在这一位上是 ${d}（${cfg.formulaOf(arr[i], marker)}），所以它该进桶 ${d}。`,
        vars: { pass: pi + 1, place: cfg.labelOf(marker), i, digit: d },
        layers: [mainL({ focus1: [i], excluded: range(0, i - 1) }), gridL(buckets, { done: nonEmptyKeys(buckets) })],
      }));
      buckets[d].vals.push(arr[i]);
      buckets[d].labels.push(labels[i]);
      steps.push(step({
        event: 'distribute', lineId: 'dist',
        note: `把 ${labels[i]} 追加到桶 ${d} 的尾部。必须尾插：同桶内要保留上一轮已经排好的先后次序，稳定性全靠这一步。`,
        vars: { pass: pi + 1, place: cfg.labelOf(marker), i, digit: d, bucket: d, count: buckets[d].labels.length },
        layers: [mainL({ focus1: [i], excluded: range(0, i - 1) }), gridL(buckets, { focus1: [`${d},0`] })],
      }));
    }

    const filled = buckets.map((b, k) => (b.labels.length ? `桶${k}：[${b.labels.join(', ')}]` : null)).filter(Boolean);
    steps.push(step({
      event: 'bucket', lineId: 'bucket',
      note: `${filled.length ? filled.join('；') : '本轮所有桶都是空的'}。回收时必须按桶号从小到大：桶号就是这一位的数值，先收小数字才能让本轮结果按该位有序。`,
      vars: { pass: pi + 1, place: cfg.labelOf(marker), nonEmpty: filled.length },
      layers: [mainL(), gridL(buckets, { done: nonEmptyKeys(buckets) })],
    }));

    let p = 0;
    for (let k = 0; k < cfg.radix; k++) {
      if (!buckets[k].labels.length) continue;
      steps.push(step({
        event: 'collect', lineId: 'collect',
        note: `轮到桶 ${k}（共 ${buckets[k].labels.length} 个）：桶内按先进先出取，${buckets[k].labels[0]} 最先出来。`,
        vars: { pass: pi + 1, place: cfg.labelOf(marker), bucket: k, count: buckets[k].labels.length },
        layers: [mainL({ done: range(0, p - 1) }), gridL(buckets, { focus1: [`${k},0`] })],
      }));
      while (buckets[k].vals.length) {
        const v = buckets[k].vals.shift();
        const lb = buckets[k].labels.shift();
        arr[p] = v;
        labels[p] = lb;
        p++;
        steps.push(step({
          event: 'collect', lineId: 'collect-in',
          note: `从桶 ${k} 队首取出 ${lb} 写回 a[${p - 1}]：位置从左往右连着填，桶号递增、桶内先来先出，本轮的稳定性就此确定。`,
          vars: { pass: pi + 1, place: cfg.labelOf(marker), bucket: k, write: p - 1 },
          layers: [mainL({ focus1: [p - 1], done: range(0, p - 2) }), gridL(buckets, { focus1: [`${k},0`] })],
        }));
      }
    }

    steps.push(step({
      event: 'pass-end', lineId: 'passend',
      note: cfg.passEndNote({ pass: pi + 1, place: cfg.labelOf(marker) }),
      vars: { pass: pi + 1, place: cfg.labelOf(marker), done: pi + 1 },
      layers: [mainL({ done: range(0, n - 1) }), gridL(emptyBuckets(cfg.radix))],
    }));
  }

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}。一共 ${passes.length} 轮"稳定入桶 + 按桶号回收"，最后一轮看的是最高位，所以整表有序。`,
    vars: { n, passes: passes.length },
    layers: [
      arrayLayer({ id: 'main', title: '排序结果', name: '排序结果', values: [...arr], labels: [...labels], roles: { done: range(0, n - 1) } }),
      gridL(emptyBuckets(cfg.radix)),
    ],
  }));

  return trace({ algorithmId: meta.id, variantId: cfg.variantId, sourceVersion: cfg.sourceVersion, lines: cfg.lines, steps, result, meta: { passes: passes.length } });
}

/* ------------------------------------------------------------------ 变体 1：LSD 十进制 */

function runV1(input) {
  return runLsd({
    inputArray: input.array,
    variantId: 'v1',
    sourceVersion: 'radix-sort-lsd-decimal-v1',
    lines: LINES.v1,
    radix: 10,
    passesOf: (maxv) => {
      const out = [];
      for (let p = 1; p <= Math.max(maxv, 1); p *= 10) out.push(p);
      return out;
    },
    digitOf: (v, p) => Math.floor(v / p) % 10,
    formulaOf: (v, p) => `(${v} / ${p}) % 10`,
    labelOf: (p) => `${placeName(p)}位`,
    rowLabel: (k) => `桶${k}`,
    gridName: '10 个十进制桶：入桶尾插、回收头取',
    initNote: ({ n, maxv, passCount }) =>
      n === 0
        ? '空数组：没有元素需要分桶。'
        : `LSD 从最低位开始：先按个位分桶回收，再按十位、百位。最大值 ${maxv} 只用到 ${passCount} 轮，一轮只保证"当前位"有序，靠稳定性把上一轮的次序保留下来。`,
    passEndNote: ({ pass, place }) =>
      `第 ${pass} 轮结束：数组已按${place}有序。下轮看更高一位时，同位元素之间的先后次序完全由这一轮的稳定性决定，这就是最后 21a 仍在 21b 前面的原因。`,
  });
}

/* ------------------------------------------------------------------ 变体 2：MSD 递归分桶 */

function runV2(input) {
  const src = [...(input.array || [])];
  const labels0 = labelsOf(src);
  const L = LINES.v2;
  const neg = src.findIndex((v) => v < 0);
  if (neg >= 0) return rejectTrace({ variantId: 'v2', sourceVersion: 'radix-sort-msd-v1', lines: L, src, labels: labels0, index: neg });

  const arr = [...src];
  const labels = [...labels0];
  const n = arr.length;
  const maxv = n ? Math.max(...arr) : 0;
  let topPlace = 1;
  while (topPlace * 10 <= Math.max(maxv, 1)) topPlace *= 10;

  const steps = [];
  const mainL = (roles = {}) => arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]', values: [...arr], labels: [...labels], roles,
  });
  const gridL = (buckets, roles = {}) => bucketGrid(buckets, roles, { name: '本层的 10 个桶：这一位相同 → 同桶' });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：递归入口没有任何元素，直接返回。'
      : `MSD 与 LSD 的分治方向相反：从最高位 ${placeName(topPlace)}位（位权 ${topPlace}）开始分桶，桶内再看低一位。最大 ${maxv} 意味着递归深度最多 ${String(topPlace).length} 层。`,
    vars: { n, max: maxv, topPlace, depth: 0 },
    layers: [mainL(), gridL(emptyBuckets(10))],
  }));

  const recurseStep = (lo, hi, place, depth) => {
    if (place < 1 || hi - lo <= 1) {
      steps.push(step({
        event: 'bucket', lineId: 'base',
        note: `a[${lo}..${hi}) 只有 ${hi - lo} 个元素：一个（或零个）元素的桶天然有序，作为递归基直接返回，不再往下看位。`,
        vars: { depth, lo, hi, place, segment: `${lo}..${hi}` },
        layers: [mainL({ done: range(lo, hi - 1) }), gridL(emptyBuckets(10))],
      }));
      return;
    }
    const buckets = emptyBuckets(10);
    for (let i = lo; i < hi; i++) {
      const d = Math.floor(arr[i] / place) % 10;
      steps.push(step({
        event: 'digit', lineId: 'digit',
        note: `深度 ${depth} 看${placeName(place)}位（位权 ${place}）：a[${i}] = ${labels[i]} 该位是 ${d}（(${arr[i]} / ${place}) % 10）。`,
        vars: { depth, place, i, digit: d, lo, hi },
        layers: [mainL({ focus1: [i], excluded: range(0, i - 1) }), gridL(buckets, { done: nonEmptyKeys(buckets) })],
      }));
      buckets[d].vals.push(arr[i]);
      buckets[d].labels.push(labels[i]);
      steps.push(step({
        event: 'distribute', lineId: 'dist',
        note: `把 ${labels[i]} 追加进桶 ${d}。同桶元素在这一位上相等，靠尾插保住它们在原数组里的先后次序，后面递归时这条次序不能乱。`,
        vars: { depth, place, i, digit: d, bucket: d, count: buckets[d].labels.length },
        layers: [mainL({ focus1: [i], excluded: range(0, i - 1) }), gridL(buckets, { focus1: [`${d},0`] })],
      }));
    }

    const filled = buckets.map((b, k) => (b.labels.length ? `桶${k}：[${b.labels.join(', ')}]` : null)).filter(Boolean);
    steps.push(step({
      event: 'bucket', lineId: 'bucket',
      note: `${filled.join('；')}。高位不同的元素已经被彻底分开，桶与桶之间的先后顺序（桶 0 在桶 9 之前）就是这一层的排序结果。`,
      vars: { depth, place, nonEmpty: filled.length },
      layers: [mainL(), gridL(buckets, { done: nonEmptyKeys(buckets) })],
    }));

    let p = lo;
    const spans = [];
    for (let k = 0; k < 10; k++) {
      if (!buckets[k].labels.length) continue;
      const start = p;
      while (buckets[k].vals.length) {
        arr[p] = buckets[k].vals.shift();
        labels[p] = buckets[k].labels.shift();
        p++;
      }
      spans.push({ k, lo: start, hi: p });
      steps.push(step({
        event: 'collect', lineId: 'collect',
        note: `桶 ${k} 按原序写回 a[${start}..${p - 1}]：先把这一层的结果落地，桶内还没排序，所以下一步要进桶递归。`,
        vars: { depth, place, bucket: k, lo: start, hi: p },
        layers: [mainL({ done: range(lo, start - 1), added: range(start, p - 1) }), gridL(buckets, { focus1: [`${k},0`] })],
      }));
    }

    for (const sp of spans) {
      steps.push(step({
        event: 'bucket', lineId: 'recurse',
        note: `进入桶 ${sp.k}（a[${sp.lo}..${sp.hi})）：这些元素高位相同，只能靠更低的位区分，于是把 place / 10 交给下一层。`,
        vars: { depth, place, bucket: sp.k, next: place / 10, lo: sp.lo, hi: sp.hi },
        layers: [mainL({ focus2: range(sp.lo, sp.hi - 1), done: range(lo, sp.lo - 1) }), gridL(emptyBuckets(10))],
      }));
      recurseStep(sp.lo, sp.hi, place / 10, depth + 1);
    }
  };

  recurseStep(0, n, topPlace, 1);

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}。MSD 靠"顶层分桶 + 桶内递归"，每个元素只在它所在的那条递归路径上被检查几次，不必像 LSD 那样对每一位都扫全表。`,
    vars: { n, topPlace, depth: 1 },
    layers: [
      arrayLayer({ id: 'main', title: '排序结果', name: '排序结果', values: [...arr], labels: [...labels], roles: { done: range(0, n - 1) } }),
      gridL(emptyBuckets(10)),
    ],
  }));

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'radix-sort-msd-v1', lines: L, steps, result, meta: { topPlace } });
}

/* ------------------------------------------------------------------ 变体 3：二进制位基数（2 桶） */

function runV3(input) {
  return runLsd({
    inputArray: input.array,
    variantId: 'v3',
    sourceVersion: 'radix-sort-binary-v1',
    lines: LINES.v3,
    radix: 2,
    passesOf: (maxv) => {
      let bits = 0;
      const top = Math.max(maxv, 1);
      while (top >> bits) bits++;
      if (bits < 1) bits = 1;
      return range(0, bits - 1);
    },
    digitOf: (v, bit) => (v >> bit) & 1,
    formulaOf: (v, bit) => `(${v} >> ${bit}) & 1`,
    labelOf: (bit) => `第 ${bit} 位（权 ${2 ** bit}）`,
    rowLabel: (k) => `桶${k}（该位=${k}）`,
    gridName: '只有 2 个桶：该位为 0 进桶 0，该位为 1 进桶 1',
    initNote: ({ n, maxv, passCount }) =>
      n === 0
        ? '空数组：没有元素需要分桶。'
        : `二进制版把每一位单独当一轮：最大值 ${maxv} 的二进制长度是 ${passCount}，所以要跑 ${passCount} 轮。桶少了（2 个而不是 10 个）但趟数多了，这正是"桶数换位数"的取舍。`,
    passEndNote: ({ pass, place }) =>
      `第 ${pass} 轮结束：数组按${place}有序。只开了 2 个桶，每轮只消 1 位，所以要跑更多轮；好处是取位只靠移位与按位与，不碰除法。`,
  });
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
