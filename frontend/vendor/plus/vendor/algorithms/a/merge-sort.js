/**
 * A · 归并排序（3 个代表性不同实现）
 *
 * 三条真实技术路线，不是改名换汤：
 *   v1 递归二分 + 临时数组：自顶向下拆到单元素，双游标把两段并进 tmp，再整段写回 a[]；
 *                          递归栈是显式的（vars.递归栈 里挂着还没合并的区间）。
 *   v2 自底向上迭代：完全不递归。width = 1,2,4… 每一趟把相邻两段长度 width 的段对合并，
 *                   画面按"趟"推进，段对是这一层的循环变量。
 *   v3 原地插入式归并：不用临时数组。右段元素逐个取出，往左段里"插入"（大元素右移腾位），
 *                      搬移次数明显多于前两者，用来对照空间换时间的代价。
 *
 * 契约（docs/04-轨迹契约.md）：每步完整快照、lineId 命中本变体 sourceLines、
 * 末步 done=true 且 result 与样例 expect 深比较一致。重复值用 2a/2b 标签核对稳定性。
 */

import { trace, step, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'a/merge-sort',
  variants: [
    { id: 'v1', name: '递归二分 + 临时数组' },
    { id: 'v2', name: '自底向上迭代' },
    { id: 'v3', name: '原地插入式归并' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void merge_sort(int a[], int lo, int hi) {' },
    { lineId: 'base', text: '  if (lo >= hi) return;                  /* 单元素/空区间：天然有序 */' },
    { lineId: 'mid', text: '  int mid = (lo + hi) / 2;                /* 二分边界 */' },
    { lineId: 'rec-l', text: '  merge_sort(a, lo, mid);                /* 先把左半排好 */' },
    { lineId: 'rec-r', text: '  merge_sort(a, mid + 1, hi);            /* 再把右半排好 */' },
    { lineId: 'call', text: '  merge(a, lo, mid, hi);                  /* 两段有序区合并 */' },
    { lineId: 'm-init', text: 'void merge(int a[], int lo, int mid, int hi) {' },
    { lineId: 'm-var', text: '  int i = lo, j = mid + 1, k = 0;  int tmp[hi - lo + 1];' },
    { lineId: 'm-while', text: '  while (i <= mid && j <= hi) {' },
    { lineId: 'm-cmp', text: '    if (a[i] <= a[j]) tmp[k++] = a[i++];  /* 相等取左 → 稳定 */' },
    { lineId: 'm-right', text: '    else              tmp[k++] = a[j++];' },
    { lineId: 'm-drain-l', text: '  while (i <= mid) tmp[k++] = a[i++];     /* 右段空了，左段直接搬 */' },
    { lineId: 'm-drain-r', text: '  while (j <= hi)  tmp[k++] = a[j++];     /* 左段空了，右段直接搬 */' },
    { lineId: 'm-back', text: '  for (k = 0; k <= hi - lo; ++k) a[lo + k] = tmp[k];' },
    { lineId: 'm-end', text: '}' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void merge_sort_bu(int a[], int n) {' },
    { lineId: 'init', text: '  int *tmp = malloc(n * sizeof(int));     /* 归并缓冲复用到每一趟 */' },
    { lineId: 'width', text: '  for (int width = 1; width < n; width *= 2) {   /* 每趟段长翻倍 */' },
    { lineId: 'lo', text: '    for (int lo = 0; lo + width < n; lo += 2 * width) {' },
    { lineId: 'mid', text: '      int mid = lo + width - 1;' },
    { lineId: 'hi', text: '      int hi = min(lo + 2 * width - 1, n - 1);     /* 末段可能不满 */' },
    { lineId: 'm-var', text: '      int i = lo, j = mid + 1, k = 0;' },
    { lineId: 'm-while', text: '      while (i <= mid && j <= hi) {' },
    { lineId: 'm-cmp', text: '        if (a[i] <= a[j]) tmp[k++] = a[i++];' },
    { lineId: 'm-right', text: '        else              tmp[k++] = a[j++];' },
    { lineId: 'm-drain-l', text: '      while (i <= mid) tmp[k++] = a[i++];' },
    { lineId: 'm-drain-r', text: '      while (j <= hi)  tmp[k++] = a[j++];' },
    { lineId: 'm-back', text: '      for (k = 0; k < hi - lo + 1; ++k) a[lo + k] = tmp[k];' },
    { lineId: 'pair-end', text: '    }                                     /* 一对段合并完成 */' },
    { lineId: 'pass-end', text: '  }                                       /* 一趟结束：宽度翻倍 */' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void inplace_merge_sort(int a[], int lo, int hi) {' },
    { lineId: 'base', text: '  if (lo >= hi) return;' },
    { lineId: 'mid', text: '  int mid = (lo + hi) / 2;' },
    { lineId: 'rec-l', text: '  inplace_merge_sort(a, lo, mid);' },
    { lineId: 'rec-r', text: '  inplace_merge_sort(a, mid + 1, hi);' },
    { lineId: 'call', text: '  inplace_merge(a, lo, mid, hi);          /* 不申请 tmp */' },
    { lineId: 'm-for', text: 'void inplace_merge(int a[], int lo, int mid, int hi) {' },
    { lineId: 'm-key', text: '  for (int i = mid + 1; i <= hi; ++i) {   /* 右段元素逐个往左插 */' },
    { lineId: 'm-var', text: '    int key = a[i], j = i - 1;' },
    { lineId: 'm-while', text: '    while (j >= lo && a[j] > key) {       /* 严格大于才右移 → 稳定 */' },
    { lineId: 'm-shift', text: '      a[j + 1] = a[j];                   /* 腾位搬移，就是这里的全部代价 */' },
    { lineId: 'm-dec', text: '      --j;' },
    { lineId: 'm-place', text: '    a[j + 1] = key;' },
    { lineId: 'm-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

export const samples = [
  {
    id: 'normal',
    label: '[2,1,2]（含重复值，核对稳定性 → 2a 应排在 2b 前）',
    input: { array: [2, 1, 2] },
    expect: { array: [1, 2, 2], labels: ['1', '2a', '2b'] },
  },
  {
    id: 'edge-empty',
    label: '[]（空数组，没有可拆分的区间）',
    input: { array: [] },
    expect: { array: [], labels: [] },
  },
  {
    id: 'edge-sorted',
    label: '[1,2,3]（已有序：每次比较都取左，不产生右段搬移）',
    input: { array: [1, 2, 3] },
    expect: { array: [1, 2, 3], labels: ['1', '2', '3'] },
  },
];

const rangeArr = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};

const ptr = (id, index) => ({ id, label: id, index });

/* ------------------------------------------------------------------ 变体 1（递归二分 + 临时数组） */

function runV1(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES.v1;
  const stack = [];            // 递归栈：还没合并完的区间
  let cmps = 0;
  let writes = 0;
  let merges = 0;

  const stackText = () => (stack.length ? stack.join(' ▸ ') : '（空）');
  const vars = (o = {}) => ({ n, 合并段数: merges, 比较: cmps, 搬移: writes, 递归栈: stackText(), ...o });
  const layers = (o = {}) => [
    arrayLayer({
      id: 'main', title: 'a[]（待排序数组）', name: 'int a[n]',
      values: [...arr], labels: [...labels], roles: o.roles || {},
    }),
    arrayLayer({
      id: 'temp', title: 'tmp[]（临时数组）', name: 'int tmp[hi-lo+1]',
      values: [...(o.tempValues || [])], labels: [...(o.tempLabels || [])], roles: o.tempRoles || {},
    }),
  ];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n <= 1
      ? `${n === 0 ? '空数组' : '只有一个元素'}：归并排序不需要拆也不需要合并，直接就是有序的。`
      : `共 ${n} 个元素。归并排序分两件事：① 二分拆到单元素（每段天然有序）；② 把相邻两段有序区双游标合并。合并结果先落进 tmp，再整段写回 a[]。`,
    vars: vars({ lo: 0, mid: null, hi: Math.max(n - 1, 0), i: null, j: null, k: null }),
    layers: layers({ roles: n ? { marks: { range: [0, n - 1], rangeLabel: `[0,${n - 1}]` } } : {} }),
  }));

  const doMerge = (lo, mid, hi) => {
    merges++;
    const tmpV = [];
    const tmpL = [];
    let i = lo;
    let j = mid + 1;
    const pairRoles = (extra = {}) => ({
      marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` },
      pointers: [ptr('i', i), ptr('j', j)],
      ...extra,
    });
    const tmpText = () => (tmpL.length ? tmpL.join(' ') : '（空）');

    steps.push(step({
      event: 'split', lineId: 'm-init',
      note: `[${lo},${mid}] 与 [${mid + 1},${hi}] 都已各自有序，进入合并：i 从左段首 ${lo} 出发，j 从右段首 ${mid + 1} 出发，tmp 清空重新装。`,
      vars: vars({ lo, mid, hi, i, j, k: 0, tmp: '（空）' }),
      layers: layers({
        roles: pairRoles({ focus1: [i], focus2: [j] }),
        tempValues: tmpV, tempLabels: tmpL,
      }),
    }));

    while (i <= mid && j <= hi) {
      cmps++;
      const takeLeft = arr[i] <= arr[j];
      steps.push(step({
        event: 'compare', lineId: 'm-while',
        note: `比较 a[${i}] = ${labels[i]} 与 a[${j}] = ${labels[j]}：${takeLeft ? '左段不大于右段 → 取左；相等时取左正是"稳定"的来源' : '右段更小 → 取右'}。`,
        vars: vars({ lo, mid, hi, i, j, k: tmpV.length, tmp: tmpText() }),
        layers: layers({ roles: pairRoles({ focus1: [i], focus2: [j] }), tempValues: tmpV, tempLabels: tmpL }),
      }));
      if (takeLeft) {
        tmpV.push(arr[i]);
        tmpL.push(labels[i]);
        i++;
        steps.push(step({
          event: 'take-left', lineId: 'm-cmp',
          note: `a[${i - 1}] = ${tmpL[tmpL.length - 1]} 搬进 tmp[${tmpV.length - 1}]，左游标 i 后移到 ${i}。`,
          vars: vars({ lo, mid, hi, i, j, k: tmpV.length, tmp: tmpText() }),
          layers: layers({
            roles: pairRoles({ focus1: [i - 1] }),
            tempValues: tmpV, tempLabels: tmpL, tempRoles: { added: [tmpV.length - 1] },
          }),
        }));
      } else {
        tmpV.push(arr[j]);
        tmpL.push(labels[j]);
        j++;
        steps.push(step({
          event: 'take-right', lineId: 'm-right',
          note: `a[${j - 1}] = ${tmpL[tmpL.length - 1]} 比左段当前项更小，搬进 tmp[${tmpV.length - 1}]，右游标 j 后移到 ${j}。`,
          vars: vars({ lo, mid, hi, i, j, k: tmpV.length, tmp: tmpText() }),
          layers: layers({
            roles: pairRoles({ focus2: [j - 1] }),
            tempValues: tmpV, tempLabels: tmpL, tempRoles: { added: [tmpV.length - 1] },
          }),
        }));
      }
    }

    while (i <= mid) {
      tmpV.push(arr[i]);
      tmpL.push(labels[i]);
      i++;
      steps.push(step({
        event: 'take-left', lineId: 'm-drain-l',
        note: `右段已空：剩下的左段元素天然不小于任何人，直接整批搬进 tmp（a[${i - 1}] → tmp[${tmpV.length - 1}]）。`,
        vars: vars({ lo, mid, hi, i, j, k: tmpV.length, tmp: tmpText() }),
        layers: layers({
          roles: pairRoles({ focus1: [i - 1] }),
          tempValues: tmpV, tempLabels: tmpL, tempRoles: { added: [tmpV.length - 1] },
        }),
      }));
    }
    while (j <= hi) {
      tmpV.push(arr[j]);
      tmpL.push(labels[j]);
      j++;
      steps.push(step({
        event: 'take-right', lineId: 'm-drain-r',
        note: `左段已空：剩下的右段元素直接整批搬进 tmp（a[${j - 1}] → tmp[${tmpV.length - 1}]）。`,
        vars: vars({ lo, mid, hi, i, j, k: tmpV.length, tmp: tmpText() }),
        layers: layers({
          roles: pairRoles({ focus2: [j - 1] }),
          tempValues: tmpV, tempLabels: tmpL, tempRoles: { added: [tmpV.length - 1] },
        }),
      }));
    }

    for (let k = 0; k < tmpV.length; k++) {
      arr[lo + k] = tmpV[k];
      labels[lo + k] = tmpL[k];
      writes++;
      steps.push(step({
        event: 'write-back', lineId: 'm-back',
        note: `把 tmp[${k}] = ${tmpL[k]} 写回 a[${lo + k}]（第 ${k + 1}/${tmpV.length} 个）。tmp 只是中间落脚点，不写回就等于没排。`,
        vars: vars({ lo, mid, hi, i: null, j: null, k, tmp: tmpText() }),
        layers: layers({
          roles: { marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` }, focus1: [lo + k], done: rangeArr(lo, lo + k - 1) },
          tempValues: tmpV, tempLabels: tmpL, tempRoles: { focus1: [k] },
        }),
      }));
    }

    steps.push(step({
      event: 'merge-end', lineId: 'm-end',
      note: `[${lo},${hi}] 合并完成：${arr.slice(lo, hi + 1).join(', ')}。这一整段现在有序，可以作为上一层合并的输入段。`,
      vars: vars({ lo, mid, hi, i: null, j: null, k: tmpV.length, tmp: tmpText() }),
      layers: layers({
        roles: { marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` }, done: rangeArr(lo, hi) },
        tempValues: tmpV, tempLabels: tmpL,
      }),
    }));
  };

  const rec = (lo, hi, depth) => {
    if (lo >= hi) {
      steps.push(step({
        event: 'split', lineId: 'base',
        note: lo === hi
          ? `区间 [${lo},${hi}] 只剩 1 个元素，天然有序，递归到底不再拆（递归深度 ${depth}）。`
          : `区间 [${lo},${hi}] 为空，直接返回。`,
        vars: vars({ lo, mid: null, hi, i: null, j: null, k: null }),
        layers: layers({ roles: { marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` }, focus1: lo === hi ? [lo] : [] } }),
      }));
      return;
    }
    const mid = Math.floor((lo + hi) / 2);
    stack.push(`ms(${lo},${hi})`);
    steps.push(step({
      event: 'split', lineId: 'mid',
      note: `把 [${lo},${hi}] 从中点切成左 [${lo},${mid}]（${mid - lo + 1} 个）和右 [${mid + 1},${hi}]（${hi - mid} 个）。先递归解决两边，再把两段拼起来——这就是"先分后治"。`,
      vars: vars({ lo, mid, hi, i: null, j: null, k: null }),
      layers: layers({
        roles: {
          marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` },
          focus2: [mid],
          pointers: [ptr('lo', lo), ptr('mid', mid), ptr('hi', hi)],
        },
      }),
    }));
    rec(lo, mid, depth + 1);
    rec(mid + 1, hi, depth + 1);
    doMerge(lo, mid, hi);
    stack.pop();
  };

  rec(0, n - 1, 0);

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n <= 1
      ? `排序完成，结果仍是 ${n === 0 ? '空数组' : `[${arr.join(', ')}]`}。`
      : `排序完成：${arr.join(', ')}（标签 ${labels.join(' ')}，共合并 ${merges} 段、比较 ${cmps} 次、写回 ${writes} 次）。`,
    vars: vars({ lo: null, mid: null, hi: null, i: null, j: null, k: null }),
    layers: layers({ roles: { done: rangeArr(0, n - 1) } }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'merge-sort-recursive-v1',
    lines: L, steps, result, meta: { merges, cmps, writes },
  });
}

/* ------------------------------------------------------------------ 变体 2（自底向上迭代） */

function runV2(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES.v2;
  let cmps = 0;
  let writes = 0;
  let merges = 0;
  let pass = 0;

  const vars = (o = {}) => ({ n, 趟次: pass, 合并段数: merges, 比较: cmps, 搬移: writes, ...o });
  const layers = (o = {}) => [
    arrayLayer({
      id: 'main', title: 'a[]（待排序数组）', name: 'int a[n]',
      values: [...arr], labels: [...labels], roles: o.roles || {},
    }),
    arrayLayer({
      id: 'temp', title: 'tmp[]（复用的归并缓冲）', name: 'int tmp[n]',
      values: [...(o.tempValues || [])], labels: [...(o.tempLabels || [])], roles: o.tempRoles || {},
    }),
  ];

  steps.push(step({
    event: 'init', lineId: 'init',
    note: n <= 1
      ? `${n === 0 ? '空数组' : '只有一个元素'}：没有段对可合并，一趟都不用跑。`
      : `共 ${n} 个元素。本变体不递归：一开始把每个单元素当成长度 1 的有序段，然后 width = 1,2,4… 每趟把相邻两段合并，段长翻倍，段数减半。`,
    vars: vars({ width: 1, lo: null, mid: null, hi: null, i: null, j: null, k: null }),
    layers: layers({ roles: n ? { excluded: rangeArr(0, n - 1) } : {} }),
  }));

  for (let width = 1; width < n; width *= 2) {
    pass++;
    steps.push(step({
      event: 'split', lineId: 'width',
      note: `第 ${pass} 趟开始：段长 width = ${width}。此时 a[] 已经由长度 ${width} 的有序段拼成，本趟把每两个相邻段并成一个长 ${width * 2} 的段。`,
      vars: vars({ width, lo: null, mid: null, hi: null, i: null, j: null, k: null }),
      layers: layers({}),
    }));

    for (let lo = 0; lo + width < n; lo += 2 * width) {
      const mid = lo + width - 1;
      const hi = Math.min(lo + 2 * width - 1, n - 1);
      merges++;
      const tmpV = [];
      const tmpL = [];
      let i = lo;
      let j = mid + 1;
      const pairRoles = (extra = {}) => ({
        marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` },
        pointers: [ptr('i', i), ptr('j', j)],
        ...extra,
      });
      const tmpText = () => (tmpL.length ? tmpL.join(' ') : '（空）');

      steps.push(step({
        event: 'split', lineId: 'hi',
        note: `本趟第 ${(lo / (2 * width)) + 1} 对段：[${lo},${mid}]（长 ${mid - lo + 1}）+ [${mid + 1},${hi}]（长 ${hi - mid}）${hi - mid < width ? '，右段不满 width：因为数组尾巴不够了' : ''}。`,
        vars: vars({ width, lo, mid, hi, i, j, k: 0, tmp: '（空）' }),
        layers: layers({ roles: pairRoles({ focus1: [i], focus2: [j] }), tempValues: tmpV, tempLabels: tmpL }),
      }));

      while (i <= mid && j <= hi) {
        cmps++;
        const takeLeft = arr[i] <= arr[j];
        steps.push(step({
          event: 'compare', lineId: 'm-while',
          note: `比较 a[${i}] = ${labels[i]} 与 a[${j}] = ${labels[j]}：${takeLeft ? '取左（相等取左，保持稳定）' : '取右'}。`,
          vars: vars({ width, lo, mid, hi, i, j, k: tmpV.length, tmp: tmpText() }),
          layers: layers({ roles: pairRoles({ focus1: [i], focus2: [j] }), tempValues: tmpV, tempLabels: tmpL }),
        }));
        if (takeLeft) {
          tmpV.push(arr[i]);
          tmpL.push(labels[i]);
          i++;
          steps.push(step({
            event: 'take-left', lineId: 'm-cmp',
            note: `a[${i - 1}] = ${tmpL[tmpL.length - 1]} 进 tmp[${tmpV.length - 1}]，i 后移到 ${i}。`,
            vars: vars({ width, lo, mid, hi, i, j, k: tmpV.length, tmp: tmpText() }),
            layers: layers({ roles: pairRoles({ focus1: [i - 1] }), tempValues: tmpV, tempLabels: tmpL, tempRoles: { added: [tmpV.length - 1] } }),
          }));
        } else {
          tmpV.push(arr[j]);
          tmpL.push(labels[j]);
          j++;
          steps.push(step({
            event: 'take-right', lineId: 'm-right',
            note: `a[${j - 1}] = ${tmpL[tmpL.length - 1]} 更小，进 tmp[${tmpV.length - 1}]，j 后移到 ${j}。`,
            vars: vars({ width, lo, mid, hi, i, j, k: tmpV.length, tmp: tmpText() }),
            layers: layers({ roles: pairRoles({ focus2: [j - 1] }), tempValues: tmpV, tempLabels: tmpL, tempRoles: { added: [tmpV.length - 1] } }),
          }));
        }
      }
      while (i <= mid) {
        tmpV.push(arr[i]);
        tmpL.push(labels[i]);
        i++;
        steps.push(step({
          event: 'take-left', lineId: 'm-drain-l',
          note: `右段空了，左段剩余元素直接搬进 tmp（a[${i - 1}] → tmp[${tmpV.length - 1}]）。`,
          vars: vars({ width, lo, mid, hi, i, j, k: tmpV.length, tmp: tmpText() }),
          layers: layers({ roles: pairRoles({ focus1: [i - 1] }), tempValues: tmpV, tempLabels: tmpL, tempRoles: { added: [tmpV.length - 1] } }),
        }));
      }
      while (j <= hi) {
        tmpV.push(arr[j]);
        tmpL.push(labels[j]);
        j++;
        steps.push(step({
          event: 'take-right', lineId: 'm-drain-r',
          note: `左段空了，右段剩余元素直接搬进 tmp（a[${j - 1}] → tmp[${tmpV.length - 1}]）。`,
          vars: vars({ width, lo, mid, hi, i, j, k: tmpV.length, tmp: tmpText() }),
          layers: layers({ roles: pairRoles({ focus2: [j - 1] }), tempValues: tmpV, tempLabels: tmpL, tempRoles: { added: [tmpV.length - 1] } }),
        }));
      }

      for (let k = 0; k < tmpV.length; k++) {
        arr[lo + k] = tmpV[k];
        labels[lo + k] = tmpL[k];
        writes++;
        steps.push(step({
          event: 'write-back', lineId: 'm-back',
          note: `tmp[${k}] = ${tmpL[k]} 写回 a[${lo + k}]（第 ${k + 1}/${tmpV.length} 个）。迭代版必须写回，否则下一趟拿不到新段。`,
          vars: vars({ width, lo, mid, hi, i: null, j: null, k, tmp: tmpText() }),
          layers: layers({
            roles: { marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` }, focus1: [lo + k], done: rangeArr(lo, lo + k - 1) },
            tempValues: tmpV, tempLabels: tmpL, tempRoles: { focus1: [k] },
          }),
        }));
      }

      steps.push(step({
        event: 'merge-end', lineId: 'pair-end',
        note: `这一对段合并完成：[${lo},${hi}] = ${arr.slice(lo, hi + 1).join(', ')}，长度 ${hi - lo + 1}。`,
        vars: vars({ width, lo, mid, hi, i: null, j: null, k: tmpV.length, tmp: tmpText() }),
        layers: layers({
          roles: { marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` }, done: rangeArr(lo, hi) },
          tempValues: tmpV, tempLabels: tmpL,
        }),
      }));
    }

    steps.push(step({
      event: 'merge-end', lineId: 'pass-end',
      note: `第 ${pass} 趟结束：width=${width} 的段对全部合并完，接下来 width 翻倍。${width * 2 >= n ? '再翻倍就超过 n：下一趟不会执行，排序结束。' : ''}`,
      vars: vars({ width, lo: null, mid: null, hi: null, i: null, j: null, k: null }),
      layers: layers({ roles: { done: rangeArr(0, n - 1) } }),
    }));
  }

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n <= 1
      ? `排序完成，结果仍是 ${n === 0 ? '空数组' : `[${arr.join(', ')}]`}。`
      : `排序完成：${arr.join(', ')}（共 ${pass} 趟、合并 ${merges} 段、比较 ${cmps} 次）。趟数 = ⌈log₂${n}⌉，与输入顺序无关——这是自底向上版的确定性。`,
    vars: vars({ width: null, lo: null, mid: null, hi: null, i: null, j: null, k: null }),
    layers: layers({ roles: { done: rangeArr(0, n - 1) } }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'merge-sort-bottomup-v1',
    lines: L, steps, result, meta: { passes: pass, merges, cmps, writes },
  });
}

/* ------------------------------------------------------------------ 变体 3（原地插入式归并） */

function runV3(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES.v3;
  const stack = [];
  let cmps = 0;
  let writes = 0;
  let merges = 0;
  let key = null;
  let keyLabel = null;

  const stackText = () => (stack.length ? stack.join(' ▸ ') : '（空）');
  const vars = (o = {}) => ({
    n, 合并段数: merges, 比较: cmps, 搬移: writes, 递归栈: stackText(),
    key: keyLabel ?? '—', ...o,
  });
  const layers = (o = {}) => [
    arrayLayer({
      id: 'main', title: 'a[]（原地，无 tmp）', name: 'int a[n]',
      values: [...arr], labels: [...labels], roles: o.roles || {},
    }),
    arrayLayer({
      id: 'key-slot', title: 'key（临时握在手里，不是数组）', name: 'int key',
      values: key == null ? [] : [key],
      labels: keyLabel == null ? [] : [keyLabel],
      roles: o.keyRoles || {},
    }),
  ];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n <= 1
      ? `${n === 0 ? '空数组' : '只有一个元素'}：不需要任何搬移。`
      : `共 ${n} 个元素。与 v1/v2 的关键差别：不申请 tmp[]. 合并时把右段元素一个个取在手里（单变量 key），向左段里插入，靠"大元素右移腾位"。空间 O(1)，代价是搬移次数变多。`,
    vars: vars({ lo: 0, mid: null, hi: Math.max(n - 1, 0), i: null, j: null }),
    layers: layers({ roles: n ? { marks: { range: [0, n - 1], rangeLabel: `[0,${n - 1}]` } } : {} }),
  }));

  const doMerge = (lo, mid, hi) => {
    merges++;
    steps.push(step({
      event: 'split', lineId: 'm-for',
      note: `[${lo},${mid}] 与 [${mid + 1},${hi}] 各自有序，进入原地合并：右段每个元素取出来往左段插。因为左段已有序，插入点一定在左段与已插入元素的头部之间。`,
      vars: vars({ lo, mid, hi, i: mid + 1, j: mid }),
      layers: layers({
        roles: {
          marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` },
          pointers: [ptr('lo', lo), ptr('mid', mid), ptr('hi', hi)],
        },
      }),
    }));

    for (let i = mid + 1; i <= hi; i++) {
      key = arr[i];
      keyLabel = labels[i];
      steps.push(step({
        event: 'take-right', lineId: 'm-key',
        note: `取出右段当前首个未处理元素 a[${i}] = ${keyLabel} 暂存到 key，a[${i}] 这格成为空位。`,
        vars: vars({ lo, mid, hi, i, j: i - 1 }),
        layers: layers({
          roles: { marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` }, focus1: [i], pointers: [ptr('i', i), ptr('j', i - 1)] },
          keyRoles: { focus1: [0] },
        }),
      }));

      let j = i - 1;
      while (j >= lo) {
        cmps++;
        const go = arr[j] > key;
        steps.push(step({
          event: 'compare', lineId: 'm-while',
          note: `比较 a[${j}] = ${labels[j]} 与 key = ${keyLabel}：${go ? '左边更大 → 它得往右挪一格给 key 腾位置' : `左边不大于 key → 停止，插入点就是 a[${j + 1}]（相等不越过，稳定性靠这条"严格大于"）`}。`,
          vars: vars({ lo, mid, hi, i, j }),
          layers: layers({
            roles: { marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` }, focus1: [j], focus2: [i], pointers: [ptr('i', i), ptr('j', j)] },
            keyRoles: { focus1: [0] },
          }),
        }));
        if (!go) break;
        arr[j + 1] = arr[j];
        labels[j + 1] = labels[j];
        writes++;
        steps.push(step({
          event: 'write-back', lineId: 'm-shift',
          note: `a[${j}] 右移一格到 a[${j + 1}]，空位随之左移。原地归并没有 tmp，全部代价都记在这些搬移上。`,
          vars: vars({ lo, mid, hi, i, j }),
          layers: layers({
            roles: { marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` }, swap: [j, j + 1], pointers: [ptr('i', i), ptr('j', j)] },
            keyRoles: { focus1: [0] },
          }),
        }));
        j--;
      }

      const placedAt = j + 1;
      const heldLabel = keyLabel;
      arr[placedAt] = key;
      labels[placedAt] = heldLabel;
      writes++;
      key = null;
      keyLabel = null;
      steps.push(step({
        event: 'write-back', lineId: 'm-place',
        note: `key = ${heldLabel} 落到 a[${placedAt}]：右段这个元素已插进左段，[${lo},${i}] 重新有序。`,
        vars: vars({ lo, mid, hi, i, j: placedAt }),
        layers: layers({
          roles: { marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` }, focus1: [placedAt], done: rangeArr(lo, i), pointers: [ptr('i', i)] },
        }),
      }));
    }

    steps.push(step({
      event: 'merge-end', lineId: 'm-end',
      note: `[${lo},${hi}] 原地合并完成：${arr.slice(lo, hi + 1).join(', ')}。整段有序，且全程没有申请额外数组。`,
      vars: vars({ lo, mid, hi, i: null, j: null }),
      layers: layers({
        roles: { marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` }, done: rangeArr(lo, hi) },
      }),
    }));
  };

  const rec = (lo, hi, depth) => {
    if (lo >= hi) {
      steps.push(step({
        event: 'split', lineId: 'base',
        note: lo === hi
          ? `区间 [${lo},${hi}] 只有 1 个元素，有序，递归到底返回（深度 ${depth}）。`
          : `区间 [${lo},${hi}] 为空，直接返回。`,
        vars: vars({ lo, mid: null, hi, i: null, j: null }),
        layers: layers({ roles: { marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` }, focus1: lo === hi ? [lo] : [] } }),
      }));
      return;
    }
    const mid = Math.floor((lo + hi) / 2);
    stack.push(`ms(${lo},${hi})`);
    steps.push(step({
      event: 'split', lineId: 'mid',
      note: `把 [${lo},${hi}] 切成左 [${lo},${mid}] 与右 [${mid + 1},${hi}]：两半各自排好后，才用原地插入的方式并起来。`,
      vars: vars({ lo, mid, hi, i: null, j: null }),
      layers: layers({
        roles: {
          marks: { range: [lo, hi], rangeLabel: `[${lo},${hi}]` },
          focus2: [mid],
          pointers: [ptr('lo', lo), ptr('mid', mid), ptr('hi', hi)],
        },
      }),
    }));
    rec(lo, mid, depth + 1);
    rec(mid + 1, hi, depth + 1);
    doMerge(lo, mid, hi);
    stack.pop();
  };

  rec(0, n - 1, 0);

  const result = { array: [...arr], labels: [...labels] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n <= 1
      ? `排序完成，结果仍是 ${n === 0 ? '空数组' : `[${arr.join(', ')}]`}。`
      : `排序完成：${arr.join(', ')}（标签 ${labels.join(' ')}）。空间 O(1)，代价是比较 ${cmps} 次、搬移 ${writes} 次——比走 tmp 的 v1/v2 更费搬移。`,
    vars: vars({ lo: null, mid: null, hi: null, i: null, j: null }),
    layers: layers({ roles: { done: rangeArr(0, n - 1) } }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'merge-sort-inplace-v1',
    lines: L, steps, result, meta: { merges, cmps, writes },
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
