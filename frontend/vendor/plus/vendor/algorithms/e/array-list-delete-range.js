/**
 * E · 顺序表区间删除（3 个代表性不同实现）
 *
 *   v1 单循环前移覆盖：把 r 之后的元素整体前移 span 格，最后一趟改逻辑长度；
 *   v2 读写双指针：read 扫全表，命中删除区间就跳过，write 只在保留元素时前进，
 *      天然支持任意区间（本演示仍先做同样的越界校验，保证三版拒绝口径一致）；
 *   v3 带搬移计数版：与 v1 同逻辑，但把每次搬移记进 moved，末尾给出搬移次数与复杂度。
 *
 * 动画重点：待删闭区间 [l,r]、搬移来源(src)与目标(dst)、逻辑长度变化、越界拒绝。
 * 三版对同一输入的保留结果相同，所以 expect 只用 { array }；非法输入用 { error, array }。
 */

import { trace, step, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'e/array-list-delete-range',
  variants: [
    { id: 'v1', name: '单循环前移覆盖' },
    { id: 'v2', name: '读写双指针' },
    { id: 'v3', name: '带搬移计数版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'bool delete_range(SqList *L, int l, int r) {' },
    { lineId: 'validate', text: '  if (l < 0 || r >= L->length || l > r) return false;   /* 越界/空表/区间倒置：拒绝 */' },
    { lineId: 'span', text: '  int span = r - l + 1;              /* 要删掉几个元素 */' },
    { lineId: 'dst-init', text: '  int dst = l;                      /* 目标位置从区间左端开始 */' },
    { lineId: 'loop', text: '  for (int src = r + 1; src < L->length; ++src) {' },
    { lineId: 'shift', text: '    L->data[dst++] = L->data[src];     /* 后面的保留元素依次前移 */' },
    { lineId: 'loop-end', text: '  }' },
    { lineId: 'truncate', text: '  L->length -= span;                /* 改逻辑长度，尾部残留不再算数 */' },
    { lineId: 'end', text: '  return true;' },
  ],
  v2: [
    { lineId: 'fn', text: 'bool delete_range(SqList *L, int l, int r) {' },
    { lineId: 'validate', text: '  if (l < 0 || r >= L->length || l > r) return false;' },
    { lineId: 'rd-init', text: '  int read = 0, write = 0;          /* read 扫全表，write 只给保留元素用 */' },
    { lineId: 'loop', text: '  while (read < L->length) {' },
    { lineId: 'skip', text: '    if (read >= l && read <= r) { ++read; continue; }   /* 命中删除区间：跳过不写 */' },
    { lineId: 'shift', text: '    L->data[write++] = L->data[read++];               /* 保留：前移到 write */' },
    { lineId: 'loop-end', text: '  }' },
    { lineId: 'truncate', text: '  L->length = write;               /* 写指针最终位置就是新长度 */' },
    { lineId: 'end', text: '  return true;' },
  ],
  v3: [
    { lineId: 'fn', text: 'bool delete_range_count(SqList *L, int l, int r) {   /* 与 v1 同逻辑，另外计数 */' },
    { lineId: 'validate', text: '  if (l < 0 || r >= L->length || l > r) return false;' },
    { lineId: 'span', text: '  int span = r - l + 1;' },
    { lineId: 'moved-init', text: '  int moved = 0;                    /* 搬移次数：本趟的全部工作量 */' },
    { lineId: 'loop', text: '  int src = r + 1, dst = l;' },
    { lineId: 'while', text: '  while (src < L->length) {' },
    { lineId: 'shift', text: '    L->data[dst++] = L->data[src++]; /* 一次搬一格 */' },
    { lineId: 'count', text: '    ++moved;                        /* 只有真正搬过的元素才计数 */' },
    { lineId: 'loop-end', text: '  }' },
    { lineId: 'truncate', text: '  L->length -= span;                /* moved == 原长度 - r - 1 */' },
    { lineId: 'end', text: '  return true;' },
  ],
};

const EMPTY_ERROR = '空表：没有可删除的下标';
const outOfRangeError = (l, r, n) => `区间 [${l},${r}] 越界：合法下标 0..${n - 1}`;
const orderError = (l, r) => `区间 [${l},${r}] 不合法：要求 l <= r`;

export const samples = [
  {
    id: 'normal',
    label: '[1,2,3,4,5] 删 [1,3]（中间一段，尾部两个元素前移）',
    input: { array: [1, 2, 3, 4, 5], l: 1, r: 3 },
    expect: { array: [1, 5] },
  },
  {
    id: 'edge-all',
    label: '[1,2,3,4,5] 删 [0,4]（整表删除，一趟都不用搬）',
    input: { array: [1, 2, 3, 4, 5], l: 0, r: 4 },
    expect: { array: [] },
  },
  {
    id: 'edge-oob',
    label: '[1,2,3,4,5] 删 [0,9]（右端越界：拒绝，原表不动）',
    input: { array: [1, 2, 3, 4, 5], l: 0, r: 9 },
    expect: { error: '区间 [0,9] 越界：合法下标 0..4', array: [1, 2, 3, 4, 5] },
  },
  {
    id: 'edge-swapped',
    label: '[1,2,3,4,5] 删 [3,1]（l > r：区间倒置，拒绝）',
    input: { array: [1, 2, 3, 4, 5], l: 3, r: 1 },
    expect: { error: '区间 [3,1] 不合法：要求 l <= r', array: [1, 2, 3, 4, 5] },
  },
  {
    id: 'edge-empty',
    label: '[] 删 [0,0]（空表：非法操作）',
    input: { array: [], l: 0, r: 0 },
    expect: { error: '空表：没有可删除的下标', array: [] },
  },
];

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};

/** 三版共用的越界判定（拒绝口径必须一致，否则 expect 无法通用） */
function validateRange(n, l, r) {
  if (n === 0) return EMPTY_ERROR;
  if (!Number.isInteger(l) || !Number.isInteger(r) || l < 0 || r >= n) return outOfRangeError(l, r, n);
  if (l > r) return orderError(l, r);
  return null;
}

function readInput(input) {
  const src = Array.isArray(input.array) ? input.array : [];
  const l = Number.isInteger(input.l) ? input.l : 0;
  const r = Number.isInteger(input.r) ? input.r : src.length - 1;
  return { src, l, r, n: src.length };
}

/* ------------------------------------------------------------------ 变体 1（单循环前移覆盖） */

function runV1(input) {
  const { src, l, r, n } = readInput(input);
  const buf = [...src];
  const bufLabels = labelsOf(src);
  const steps = [];
  const L = LINES.v1;
  const error = validateRange(n, l, r);
  const span = l >= 0 && r >= l ? r - l + 1 : 0;

  // cut = 当前"逻辑长度"：truncate 之前显示整块容量（尾部是脏数据），之后只显示逻辑部分
  const snap = (roles = {}, cut = n) => [arrayLayer({
    id: 'main', title: `a[]（逻辑长度 ${cut}）`,
    name: `int data[capacity=${n}]（length = ${cut}）`,
    values: buf.slice(0, cut), labels: bufLabels.slice(0, cut), roles,
  })];
  const stale = (cut) => range(cut, n - 1);

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空表：长度 0，任何删除请求都非法。'
      : `逻辑长度 ${n}，待删闭区间 [${l},${r}]，合法下标范围 0..${n - 1}（l 与 r 都要落在里面，且 l <= r）。`,
    vars: { n, l, r, span: error ? null : span, length: n, moved: 0 },
    layers: snap(error ? {} : { marks: { range: [l, r], rangeLabel: `待删 [${l},${r}]` } }),
  }));

  if (error) {
    const result = { error, array: [...src], length: n };
    steps.push(step({
      event: 'invalid', lineId: 'validate', done: true, result,
      note: `${error}。删除请求被拒绝，原表一格都没动——越界检查必须在搬移之前做。`,
      vars: { n, l, r, span: null, length: n, moved: 0 },
      layers: snap({}),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v1', sourceVersion: 'array-list-delete-range-shift-v1',
      lines: L, steps, result,
    });
  }

  steps.push(step({
    event: 'validate', lineId: 'validate',
    note: `校验通过：l = ${l}、r = ${r} 都在 0..${n - 1} 内，且 l <= r。要删 ${span} 个，r 之后还剩 ${n - r - 1} 个保留元素要前移。`,
    vars: { n, l, r, span, length: n, moved: 0 },
    layers: snap({ marks: { range: [l, r], rangeLabel: `待删 [${l},${r}]` } }),
  }));

  let moved = 0;
  let dst = l;
  for (let srcIdx = r + 1; srcIdx < n; srcIdx++) {
    const v = buf[srcIdx];
    const lv = bufLabels[srcIdx];
    buf[dst] = v;
    bufLabels[dst] = lv;
    const movedSoFar = moved;
    steps.push(step({
      event: 'shift', lineId: 'shift',
      note: `把 a[${srcIdx}] = ${lv} 搬到 a[${dst}]：搬移距离固定是 span = ${span} 格，所以 dst = src - ${span}。前 ${dst} 个保留元素已经就位。`,
      vars: { n, l, r, span, length: n, moved: movedSoFar, dst, src: srcIdx },
      layers: snap({
        focus1: [dst], focus2: [srcIdx],
        done: range(0, dst - 1), excluded: stale(n - span),
        pointers: [{ id: 'dst', label: 'dst', index: dst }, { id: 'src', label: 'src', index: srcIdx }],
      }),
    }));
    dst += 1;
    moved += 1;
  }

  const keep = n - span;
  steps.push(step({
    event: 'truncate', lineId: 'truncate',
    note: `逻辑长度 ${n} → ${keep}：数组不真的"缩容"，只是把 length 改小，尾部 ${span} 格成了不再访问的残留数据。${moved === 0 ? '本次没有需要前移的元素。' : `共前移 ${moved} 个元素。`}`,
    vars: { n, l, r, span, length: keep, moved },
    layers: snap({ done: range(0, keep - 1) }, keep),
  }));

  const result = { array: buf.slice(0, keep), length: keep };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: keep === 0 ? '删除完成：整表被删空，逻辑长度为 0。' : `删除完成：${result.array.join(', ')}（逻辑长度 ${keep}）。`,
    vars: { n, l, r, span, length: keep, moved },
    layers: snap({ done: range(0, keep - 1) }, keep),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'array-list-delete-range-shift-v1',
    lines: L, steps, result, meta: { moved },
  });
}

/* ------------------------------------------------------------------ 变体 2（读写双指针） */

function runV2(input) {
  const { src, l, r, n } = readInput(input);
  const buf = [...src];
  const bufLabels = labelsOf(src);
  const steps = [];
  const L = LINES.v2;
  const error = validateRange(n, l, r);
  const span = l >= 0 && r >= l ? r - l + 1 : 0;

  const snap = (roles = {}, cut = n) => [arrayLayer({
    id: 'main', title: `a[]（逻辑长度 ${cut}）`,
    name: `int data[capacity=${n}]（length = ${cut}）`,
    values: buf.slice(0, cut), labels: bufLabels.slice(0, cut), roles,
  })];

  steps.push(step({
    event: 'init', lineId: 'rd-init',
    note: n === 0
      ? '空表：长度为 0，删除请求一律非法。'
      : `这一版不用"整段前移"：read 从 0 扫到 ${n - 1}，只有落在保留集的元素才写进 write 位置。先摆好两个指针，read = write = 0。`,
    vars: { n, l, r, read: 0, write: 0, kept: 0, length: n },
    layers: snap({ pointers: [{ id: 'read', label: 'read', index: 0 }, { id: 'write', label: 'write', index: 0 }] }),
  }));

  if (error) {
    const result = { error, array: [...src], length: n };
    steps.push(step({
      event: 'invalid', lineId: 'validate', done: true, result,
      note: `${error}。读写双指针虽然能自动跳过任意区间，但非法区间仍要先拒绝，否则 read/write 会越界。`,
      vars: { n, l, r, read: null, write: null, kept: 0, length: n },
      layers: snap({}),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v2', sourceVersion: 'array-list-delete-range-rw-pointer-v1',
      lines: L, steps, result,
    });
  }

  steps.push(step({
    event: 'validate', lineId: 'validate',
    note: `校验通过：待删 [${l},${r}] 共 ${span} 个。接下来 read 一路扫过去，落在 [${l},${r}] 里的直接跳过。`,
    vars: { n, l, r, read: 0, write: 0, kept: 0, length: n },
    layers: snap({
      marks: { range: [l, r], rangeLabel: `待删 [${l},${r}]` },
      pointers: [{ id: 'read', label: 'read', index: 0 }, { id: 'write', label: 'write', index: 0 }],
    }),
  }));

  let write = 0;
  for (let read = 0; read < n; read++) {
    if (read >= l && read <= r) {
      steps.push(step({
        event: 'miss', lineId: 'skip',
        note: `read = ${read} 落在删除区间 [${l},${r}] 内：这一格不保留，跳过不写，write 停在 ${write}（这就是"未命中保留集"）。`,
        vars: { n, l, r, read, write, kept: write, length: n },
        layers: snap({
          excluded: [read],
          done: range(0, write - 1),
          marks: { range: [l, r], rangeLabel: `待删 [${l},${r}]` },
          pointers: [
            { id: 'read', label: 'read', index: read },
            { id: 'write', label: 'write', index: Math.min(write, n - 1) },
          ],
        }),
      }));
      continue;
    }
    const v = buf[read];
    const lv = bufLabels[read];
    buf[write] = v;
    bufLabels[write] = lv;
    steps.push(step({
      event: 'shift', lineId: 'shift',
      note: read === write
        ? `read = write = ${read}：这一格本来就在正确位置，写回自己（值 ${lv}），write 前进一格。`
        : `read = ${read} 不在删除区间内：保留，把 ${lv} 搬到 write = ${write}，write 前进一格。`,
      vars: { n, l, r, read, write, kept: write + 1, length: n },
      layers: snap({
        focus1: [write], focus2: [read],
        done: range(0, write - 1),
        pointers: [
          { id: 'read', label: 'read', index: read },
          { id: 'write', label: 'write', index: write },
        ],
      }),
    }));
    write += 1;
  }

  const keep = write;
  steps.push(step({
    event: 'truncate', lineId: 'truncate',
    note: `read 走完整表，write 停在 ${keep}：新长度直接取 write，不需要再算 span。${span > 0 ? `被跳过的 ${span} 格就是删掉的部分。` : ''}`,
    vars: { n, l, r, read: n, write: keep, kept: keep, length: keep },
    layers: snap({ done: range(0, keep - 1) }, keep),
  }));

  const result = { array: buf.slice(0, keep), length: keep };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: keep === 0 ? '删除完成：整表被删空，逻辑长度为 0。' : `删除完成：${result.array.join(', ')}（逻辑长度 ${keep}）。`,
    vars: { n, l, r, read: n, write: keep, kept: keep, length: keep },
    layers: snap({ done: range(0, keep - 1) }, keep),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'array-list-delete-range-rw-pointer-v1',
    lines: L, steps, result, meta: { moved: keep },
  });
}

/* ------------------------------------------------------------------ 变体 3（带搬移计数版） */

function runV3(input) {
  const { src, l, r, n } = readInput(input);
  const buf = [...src];
  const bufLabels = labelsOf(src);
  const steps = [];
  const L = LINES.v3;
  const error = validateRange(n, l, r);
  const span = l >= 0 && r >= l ? r - l + 1 : 0;
  const stale = (cut) => range(cut, n - 1);

  const snap = (roles = {}, cut = n) => [arrayLayer({
    id: 'main', title: `a[]（逻辑长度 ${cut}）`,
    name: `int data[capacity=${n}]（length = ${cut}）`,
    values: buf.slice(0, cut), labels: bufLabels.slice(0, cut), roles,
  })];

  steps.push(step({
    event: 'init', lineId: 'moved-init',
    note: n === 0
      ? '空表：长度 0，删除请求非法。'
      : `与 v1 同一套搬移逻辑，区别是把搬移记进 moved：本次最多要搬 ${Math.max(0, n - r - 1)} 次（r 之后的元素个数），moved 从 0 开始。`,
    vars: { n, l, r, span: error ? null : span, length: n, moved: 0, maxMoves: Math.max(0, n - r - 1) },
    layers: snap(error ? {} : { marks: { range: [l, r], rangeLabel: `待删 [${l},${r}]` } }),
  }));

  if (error) {
    const result = { error, array: [...src], length: n };
    steps.push(step({
      event: 'invalid', lineId: 'validate', done: true, result,
      note: `${error}。注意：拒绝发生在 moved 计数之前，所以搬移次数为 0——代价只有在合法删除时才产生。`,
      vars: { n, l, r, span: null, length: n, moved: 0, maxMoves: 0 },
      layers: snap({}),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v3', sourceVersion: 'array-list-delete-range-counted-v1',
      lines: L, steps, result,
    });
  }

  steps.push(step({
    event: 'validate', lineId: 'validate',
    note: `校验通过：待删 [${l},${r}] 共 ${span} 格。搬移次数只与"r 之后还有几个元素"有关，等于 n - r - 1 = ${n - r - 1}，与 l 无关。`,
    vars: { n, l, r, span, length: n, moved: 0, maxMoves: n - r - 1 },
    layers: snap({ marks: { range: [l, r], rangeLabel: `待删 [${l},${r}]` } }),
  }));

  let moved = 0;
  let dst = l;
  let srcIdx = r + 1;
  while (srcIdx < n) {
    const lv = bufLabels[srcIdx];
    buf[dst] = buf[srcIdx];
    bufLabels[dst] = lv;
    steps.push(step({
      event: 'shift', lineId: 'shift',
      note: `搬第 ${moved + 1} 次：a[${dst}] ← a[${srcIdx}] = ${lv}。每搬一格就 ++moved，所以 moved 就是真实的搬移量。`,
      vars: { n, l, r, span, length: n, moved, maxMoves: n - r - 1, dst, src: srcIdx },
      layers: snap({
        focus1: [dst], focus2: [srcIdx],
        done: range(0, dst - 1), excluded: stale(n - span),
        pointers: [{ id: 'dst', label: 'dst', index: dst }, { id: 'src', label: 'src', index: srcIdx }],
      }),
    }));
    dst += 1;
    srcIdx += 1;
    moved += 1;
  }

  const keep = n - span;
  steps.push(step({
    event: 'truncate', lineId: 'truncate',
    note: `逻辑长度 ${n} → ${keep}，moved = ${moved}。结论：搬移次数 = n - r - 1（与 v1 完全一样），说明两版复杂度同为 O(n)，额外空间同为 O(1)；计数版的价值是把工作量显式摆出来。`,
    vars: { n, l, r, span, length: keep, moved, maxMoves: n - r - 1 },
    layers: snap({ done: range(0, keep - 1) }, keep),
  }));

  const result = { array: buf.slice(0, keep), length: keep };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: keep === 0 ? '删除完成：整表被删空，搬移 0 次。' : `删除完成：${result.array.join(', ')}（逻辑长度 ${keep}，搬移 ${moved} 次）。`,
    vars: { n, l, r, span, length: keep, moved, maxMoves: n - r - 1 },
    layers: snap({ done: range(0, keep - 1) }, keep),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'array-list-delete-range-counted-v1',
    lines: L, steps, result, meta: { moved },
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
