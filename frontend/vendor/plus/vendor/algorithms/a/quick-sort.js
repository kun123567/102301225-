/**
 * A · 快速排序（3 个代表性不同实现）
 *
 * 主层 style 1（数组 a[]），辅助层 style 7（递归栈：当前正在划分的区间 [lo,hi]）。
 * 动画必须让观众看到：枢轴值（focus1 停在枢轴上）、扫描位置（focus2 / 指针 j）、
 * 分区边界（指针 i / 指针 lt/gt）、待处理区间（递归栈的 push/pop）。
 *
 * 三个变体的策略确实不同：
 *   v1 Lomuto：单向扫描 + 分界指针 i，枢轴取区间末元素，最后一次交换定枢轴位置；
 *   v2 Hoare ：左右指针向中间夹，交换逆序对，按 j 切分（枢轴取首元素，不等价于末元素法）；
 *   v3 三路  ：划分成 <pivot / =pivot / >pivot 三段，全相等输入一趟就结束。
 */

import { trace, step, arrayLayer, stackLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'a/quick-sort',
  variants: [
    { id: 'v1', name: 'Lomuto 末元素枢轴' },
    { id: 'v2', name: 'Hoare 双指针' },
    { id: 'v3', name: '三路划分版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void quick_sort(int a[], int lo, int hi) {' },
    { lineId: 'push', text: '  /* 递归进入：区间 [lo,hi] 压入递归栈 */' },
    { lineId: 'base', text: '  if (lo >= hi) return;                 /* 长度 ≤1：区间已就位 */' },
    { lineId: 'pivot', text: '  int pivot = a[hi];                    /* Lomuto：枢轴取末元素 */' },
    { lineId: 'i-init', text: '  int i = lo - 1;                        /* 左段（≤pivot）的右边界 */' },
    { lineId: 'for', text: '  for (int j = lo; j < hi; ++j) {' },
    { lineId: 'cmp', text: '    if (a[j] <= pivot) {                 /* 单向扫描：只跟枢轴比 */' },
    { lineId: 'inc', text: '      ++i;' },
    { lineId: 'swap', text: '      swap(a[i], a[j]);                  /* 左段扩一格 */' },
    { lineId: 'for-end', text: '    }' },
    { lineId: 'place', text: '  swap(a[i + 1], a[hi]);                 /* 枢轴落位 i+1 */' },
    { lineId: 'p-end', text: '  int p = i + 1;                        /* a[p] 已是最终位置 */' },
    { lineId: 'recurse', text: '  quick_sort(a, lo, p - 1); quick_sort(a, p + 1, hi);' },
    { lineId: 'pop', text: '  /* 递归返回：本区间出栈 */' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void quick_sort(int a[], int lo, int hi) {' },
    { lineId: 'push', text: '  /* 递归进入：区间 [lo,hi] 压入递归栈 */' },
    { lineId: 'base', text: '  if (lo >= hi) return;' },
    { lineId: 'pivot', text: '  int pivot = a[lo];                    /* Hoare：枢轴取首元素 */' },
    { lineId: 'init', text: '  int i = lo - 1, j = hi + 1;' },
    { lineId: 'loop', text: '  while (1) {' },
    { lineId: 'scan-left', text: '    do { ++i; } while (a[i] < pivot);     /* 左指针找 ≥pivot */' },
    { lineId: 'scan-right', text: '    do { --j; } while (a[j] > pivot);     /* 右指针找 ≤pivot */' },
    { lineId: 'cmp', text: '    if (i >= j) break;                   /* 两指针交叉：按 j 切分 */' },
    { lineId: 'swap', text: '    swap(a[i], a[j]);                    /* 逆序对就地交换 */' },
    { lineId: 'loop-end', text: '  }' },
    { lineId: 'split', text: '  int p = j;  quick_sort(a, lo, p); quick_sort(a, p + 1, hi);' },
    { lineId: 'pop', text: '  /* 递归返回：本区间出栈 */' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void quick_sort(int a[], int lo, int hi) {' },
    { lineId: 'push', text: '  /* 递归进入：区间 [lo,hi] 压入递归栈 */' },
    { lineId: 'base', text: '  if (lo >= hi) return;' },
    { lineId: 'pivot', text: '  int pivot = a[lo];                    /* 三路划分：基准取首元素 */' },
    { lineId: 'init', text: '  int lt = lo, i = lo, gt = hi;         /* [lo,lt) < · [lt,gt] = · (gt,hi] > */' },
    { lineId: 'loop', text: '  while (i <= gt) {' },
    { lineId: 'cmp', text: '    if (a[i] < pivot)' },
    { lineId: 'less', text: '      swap(a[lt++], a[i++]);             /* 小于段：左侧接一格 */' },
    { lineId: 'greater', text: '    else if (a[i] > pivot)' },
    { lineId: 'swap-gt', text: '      swap(a[i], a[gt--]);              /* 大于段：i 不前进，换来的还要再看 */' },
    { lineId: 'equal', text: '    else ++i;                           /* 等于段：只前进 */' },
    { lineId: 'loop-end', text: '  }' },
    { lineId: 'p-end', text: '  /* a[lt..gt] 全等于 pivot，整段已是最终位置 */' },
    { lineId: 'recurse', text: '  quick_sort(a, lo, lt - 1); quick_sort(a, gt + 1, hi);' },
    { lineId: 'pop', text: '  /* 递归返回：本区间出栈 */' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '[4,1,3,2]（三个变体都升序 [1,2,3,4]）',
    input: { array: [4, 1, 3, 2] },
    expect: { array: [1, 2, 3, 4], labels: ['1', '2', '3', '4'] },
  },
  {
    id: 'edge-all-equal',
    label: '[2,2,2]（全相等：三种划分都必须终止）',
    input: { array: [2, 2, 2] },
    expect: { array: [2, 2, 2] },
  },
  {
    id: 'edge-empty',
    label: '[]（空数组直接结束）',
    input: { array: [] },
    expect: { array: [], labels: [] },
  },
];

const seq = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
};

/* ------------------------------------------------------------------ 变体 1（Lomuto） */

function runV1(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const L = LINES.v1;
  const steps = [];
  const doneSet = new Set();
  const frames = [];
  let comparisons = 0;
  let swaps = 0;

  const swapAt = (x, y) => {
    const t = arr[x]; arr[x] = arr[y]; arr[y] = t;
    const u = labels[x]; labels[x] = labels[y]; labels[y] = u;
  };

  const snap = (o = {}) => {
    const ptrs = [];
    if (o.ptrI != null && o.ptrI >= 0 && o.ptrI < n) ptrs.push({ id: 'i', label: 'i', index: o.ptrI });
    if (o.ptrJ != null && o.ptrJ >= 0 && o.ptrJ < n) ptrs.push({ id: 'j', label: 'j', index: o.ptrJ });
    const rg = o.range && o.range[0] <= o.range[1] ? o.range : null;
    return [
      arrayLayer({
        id: 'main',
        title: 'a[]',
        name: 'int a[n]',
        values: [...arr],
        labels: [...labels],
        roles: {
          focus1: o.f1 || [],
          focus2: o.f2 || [],
          swap: o.sw || [],
          done: [...doneSet].sort((a, b) => a - b),
          pointers: ptrs,
          marks: rg ? { range: [rg[0], rg[1]], rangeLabel: `区间 [${rg[0]}, ${rg[1]}]` } : {},
        },
      }),
      stackLayer({
        id: 'stk',
        title: '递归栈（待处理区间）',
        name: 'call stack · 每格一个 [lo,hi]',
        cells: frames.map((f, k) => ({ value: `[${f[0]}, ${f[1]}]`, label: `#${k}` })),
        top: frames.length - 1,
        capacity: Math.max(4, n),
        bottomLabel: 'bottom（主调用）',
        topLabel: 'top',
        roles: { focus1: o.topFocus && frames.length ? [frames.length - 1] : [] },
      }),
    ];
  };
  const put = (o) => steps.push(step({
    event: o.event, lineId: o.lineId, note: o.note, vars: o.vars, layers: snap(o),
    done: !!o.done, result: o.result,
  }));

  put({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：没有任何区间需要划分，直接结束。'
      : `共 ${n} 个元素。Lomuto 方案：枢轴固定取区间末元素，用一个单向扫描指针 j 和分界指针 i，把区间分成「≤pivot」与「>pivot」两段。`,
    vars: { n, lo: null, hi: null, pivot: null, i: null, j: null, cmp: 0, swaps: 0 },
  });

  const qsort = (lo, hi) => {
    if (lo > hi) return;
    frames.push([lo, hi]);
    put({
      event: 'push', lineId: 'push',
      note: `进入区间 [${lo},${hi}] 并压栈（当前栈深 ${frames.length}）：这一段还没划分完，先记在栈上。`,
      vars: { n, lo, hi, pivot: null, i: null, j: null, cmp: comparisons, swaps },
      range: [lo, hi], topFocus: true,
    });
    if (lo === hi) {
      doneSet.add(lo);
      frames.pop();
      put({
        event: 'pop', lineId: 'base',
        note: `区间 [${lo},${hi}] 只剩一个元素 a[${lo}] = ${labels[lo]}，它必然在最终位置，直接出栈。`,
        vars: { n, lo, hi, pivot: null, i: null, j: null, cmp: comparisons, swaps },
        range: [lo, hi], f1: [lo],
      });
      return;
    }

    const pivot = arr[hi];
    const pivotLabel = labels[hi];
    let i = lo - 1;
    put({
      event: 'pivot', lineId: 'pivot',
      note: `枢轴 pivot = a[${hi}] = ${pivotLabel}（末元素）。分界指针 i 先退到 ${i}，i 左边的格子都属于「≤pivot」的左段。`,
      vars: { n, lo, hi, pivot: pivotLabel, i, j: lo, cmp: comparisons, swaps },
      range: [lo, hi], f1: [hi],
    });

    for (let j = lo; j < hi; j++) {
      comparisons++;
      const ok = arr[j] <= pivot;
      put({
        event: 'compare', lineId: 'cmp',
        note: `比较 a[${j}] = ${labels[j]} 与枢轴 ${pivotLabel}：${ok ? '不大于枢轴，它应该留在左段。' : '大于枢轴，留给右段，i 不动。'}`,
        vars: { n, lo, hi, pivot: pivotLabel, i, j, cmp: comparisons, swaps },
        range: [lo, hi], f1: [hi], f2: [j], ptrI: i, ptrJ: j,
      });
      if (!ok) continue;
      i++;
      if (i !== j) {
        swapAt(i, j);
        swaps++;
        put({
          event: 'swap', lineId: 'swap',
          note: `i 前进到 ${i} 与扫描位 j=${j} 不重合：交换两格，把 ${labels[i]} 归入左段。`,
          vars: { n, lo, hi, pivot: pivotLabel, i, j, cmp: comparisons, swaps },
          range: [lo, hi], sw: [i, j], ptrI: i, ptrJ: j,
        });
      }
    }

    const p = i + 1;
    if (p !== hi) {
      swapAt(p, hi);
      swaps++;
      put({
        event: 'swap', lineId: 'place',
        note: `扫描结束：把枢轴从 a[${hi}] 换到 a[${p}]。换完之后左边 [${lo},${p - 1}] 都不大于它，右边都大于它。`,
        vars: { n, lo, hi, pivot: pivotLabel, i: p, j: null, cmp: comparisons, swaps },
        range: [lo, hi], sw: [p, hi], ptrI: p,
      });
    }
    doneSet.add(p);
    put({
      event: 'partition-end', lineId: 'p-end',
      note: `分区完成：枢轴 ${pivotLabel} 定格在 a[${p}]，这是它的最终位置。剩下左区 [${lo},${p - 1}] 与右区 [${p + 1},${hi}] 要继续划分。`,
      vars: { n, lo, hi, pivot: pivotLabel, i: p, j: null, cmp: comparisons, swaps },
      range: [lo, hi], f1: [p],
    });

    frames.pop();
    put({
      event: 'pop', lineId: 'recurse',
      note: `本区间划分完，出栈；随后按「先左后右」进入两个子区间（栈深回到 ${frames.length}）。`,
      vars: { n, lo, hi, pivot: pivotLabel, i: p, j: null, cmp: comparisons, swaps },
      range: [lo, hi],
    });
    qsort(lo, p - 1);
    qsort(p + 1, hi);
  };

  if (n > 0) qsort(0, n - 1);

  const result = { array: [...arr], labels: [...labels] };
  put({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}（比较 ${comparisons} 次、交换 ${swaps} 次；递归栈已清空）。`,
    vars: { n, lo: null, hi: null, pivot: null, i: null, j: null, cmp: comparisons, swaps },
    range: [0, n - 1],
  });

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'quick-sort-lomuto-v1',
    lines: L, steps, result, meta: { comparisons, swaps },
  });
}

/* ------------------------------------------------------------------ 变体 2（Hoare） */

function runV2(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const L = LINES.v2;
  const steps = [];
  const doneSet = new Set();
  const frames = [];
  let comparisons = 0;
  let swaps = 0;

  const swapAt = (x, y) => {
    const t = arr[x]; arr[x] = arr[y]; arr[y] = t;
    const u = labels[x]; labels[x] = labels[y]; labels[y] = u;
  };

  const snap = (o = {}) => {
    const ptrs = [];
    if (o.ptrI != null && o.ptrI >= 0 && o.ptrI < n) ptrs.push({ id: 'i', label: 'i', index: o.ptrI });
    if (o.ptrJ != null && o.ptrJ >= 0 && o.ptrJ < n) ptrs.push({ id: 'j', label: 'j', index: o.ptrJ });
    const rg = o.range && o.range[0] <= o.range[1] ? o.range : null;
    return [
      arrayLayer({
        id: 'main',
        title: 'a[]',
        name: 'int a[n]',
        values: [...arr],
        labels: [...labels],
        roles: {
          focus1: o.f1 || [],
          focus2: o.f2 || [],
          swap: o.sw || [],
          done: [...doneSet].sort((a, b) => a - b),
          pointers: ptrs,
          marks: rg ? { range: [rg[0], rg[1]], rangeLabel: `区间 [${rg[0]}, ${rg[1]}]` } : {},
        },
      }),
      stackLayer({
        id: 'stk',
        title: '递归栈（待处理区间）',
        name: 'call stack · 每格一个 [lo,hi]',
        cells: frames.map((f, k) => ({ value: `[${f[0]}, ${f[1]}]`, label: `#${k}` })),
        top: frames.length - 1,
        capacity: Math.max(4, n),
        bottomLabel: 'bottom（主调用）',
        topLabel: 'top',
        roles: { focus1: o.topFocus && frames.length ? [frames.length - 1] : [] },
      }),
    ];
  };
  const put = (o) => steps.push(step({
    event: o.event, lineId: o.lineId, note: o.note, vars: o.vars, layers: snap(o),
    done: !!o.done, result: o.result,
  }));

  put({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：没有区间可切分，直接结束。'
      : `共 ${n} 个元素。Hoare 方案：枢轴取首元素，左右两个指针向中间夹，遇到逆序对就交换，交叉时按 j 切分——枢轴不参与最后一次交换。`,
    vars: { n, lo: null, hi: null, pivot: null, i: null, j: null, cmp: 0, swaps: 0 },
  });

  const qsort = (lo, hi) => {
    if (lo > hi) return;
    frames.push([lo, hi]);
    put({
      event: 'push', lineId: 'push',
      note: `进入区间 [${lo},${hi}] 并压栈（当前栈深 ${frames.length}）。`,
      vars: { n, lo, hi, pivot: null, i: null, j: null, cmp: comparisons, swaps },
      range: [lo, hi], topFocus: true,
    });
    if (lo === hi) {
      doneSet.add(lo);
      frames.pop();
      put({
        event: 'pop', lineId: 'base',
        note: `区间 [${lo},${hi}] 只有一个元素 a[${lo}] = ${labels[lo]}，无需切分，出栈。`,
        vars: { n, lo, hi, pivot: null, i: null, j: null, cmp: comparisons, swaps },
        range: [lo, hi], f1: [lo],
      });
      return;
    }

    const pivot = arr[lo];
    const pivotLabel = labels[lo];
    let i = lo - 1;
    let j = hi + 1;
    put({
      event: 'pivot', lineId: 'pivot',
      note: `枢轴 pivot = a[${lo}] = ${pivotLabel}。注意它留在原地：Hoare 只保证「左段 ≤ pivot」与「右段 ≥ pivot」，不保证枢轴一步到位。`,
      vars: { n, lo, hi, pivot: pivotLabel, i, j: null, cmp: comparisons, swaps },
      range: [lo, hi], f1: [lo], ptrI: i,
    });

    let p = lo;
    for (;;) {
      do {
        i++;
        comparisons++;
        put({
          event: 'compare', lineId: 'scan-left',
          note: `左指针 i = ${i}：a[${i}] = ${labels[i]} ${arr[i] < pivot ? `< 枢轴 ${pivotLabel}，继续右移。` : `≥ 枢轴 ${pivotLabel}，停在这里等交换。`}`,
          vars: { n, lo, hi, pivot: pivotLabel, i, j: null, cmp: comparisons, swaps },
          range: [lo, hi], f1: [lo], f2: [i], ptrI: i,
        });
      } while (arr[i] < pivot);

      do {
        j--;
        comparisons++;
        put({
          event: 'compare', lineId: 'scan-right',
          note: `右指针 j = ${j}：a[${j}] = ${labels[j]} ${arr[j] > pivot ? `> 枢轴 ${pivotLabel}，继续左移。` : `≤ 枢轴 ${pivotLabel}，停在这里。`}`,
          vars: { n, lo, hi, pivot: pivotLabel, i, j, cmp: comparisons, swaps },
          range: [lo, hi], f1: [lo], f2: [j], ptrI: i, ptrJ: j,
        });
      } while (arr[j] > pivot);

      if (i >= j) {
        p = j;
        put({
          event: 'partition-end', lineId: 'cmp',
          note: `i = ${i} 与 j = ${j} 交叉，分区结束：按 j = ${j} 切分，左段 [${lo},${j}]、右段 [${j + 1},${hi}]（两段都非空，所以一定会收敛）。`,
          vars: { n, lo, hi, pivot: pivotLabel, i, j, cmp: comparisons, swaps },
          range: [lo, hi], f1: [j], ptrI: i, ptrJ: j,
        });
        break;
      }

      swapAt(i, j);
      swaps++;
      put({
        event: 'swap', lineId: 'swap',
        note: `a[${i}] = ${labels[i]} 与 a[${j}] = ${labels[j]} 是一对逆序（左大右小），交换后两边各归各位。`,
        vars: { n, lo, hi, pivot: pivotLabel, i, j, cmp: comparisons, swaps },
        range: [lo, hi], sw: [i, j], ptrI: i, ptrJ: j,
      });
    }

    frames.pop();
    put({
      event: 'pop', lineId: 'split',
      note: `本区间切分完，出栈；再分别处理左段 [${lo},${p}] 与右段 [${p + 1},${hi}]。`,
      vars: { n, lo, hi, pivot: pivotLabel, i, j: p, cmp: comparisons, swaps },
      range: [lo, hi],
    });
    qsort(lo, p);
    qsort(p + 1, hi);
  };

  if (n > 0) qsort(0, n - 1);

  const result = { array: [...arr], labels: [...labels] };
  put({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}（比较 ${comparisons} 次、交换 ${swaps} 次；Hoare 的枢轴不占最终位，靠区间不断收窄收敛）。`,
    vars: { n, lo: null, hi: null, pivot: null, i: null, j: null, cmp: comparisons, swaps },
    range: [0, n - 1],
  });

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'quick-sort-hoare-v1',
    lines: L, steps, result, meta: { comparisons, swaps },
  });
}

/* ------------------------------------------------------------------ 变体 3（三路划分） */

function runV3(input) {
  const src = input.array || [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const L = LINES.v3;
  const steps = [];
  const doneSet = new Set();
  const frames = [];
  let comparisons = 0;
  let swaps = 0;

  const swapAt = (x, y) => {
    const t = arr[x]; arr[x] = arr[y]; arr[y] = t;
    const u = labels[x]; labels[x] = labels[y]; labels[y] = u;
  };

  const snap = (o = {}) => {
    const ptrs = [];
    if (o.ptrLt != null && o.ptrLt >= 0 && o.ptrLt < n) ptrs.push({ id: 'lt', label: 'lt', index: o.ptrLt });
    if (o.ptrI != null && o.ptrI >= 0 && o.ptrI < n) ptrs.push({ id: 'i', label: 'i', index: o.ptrI });
    if (o.ptrGt != null && o.ptrGt >= 0 && o.ptrGt < n) ptrs.push({ id: 'gt', label: 'gt', index: o.ptrGt });
    const rg = o.range && o.range[0] <= o.range[1] ? o.range : null;
    return [
      arrayLayer({
        id: 'main',
        title: 'a[]',
        name: 'int a[n]',
        values: [...arr],
        labels: [...labels],
        roles: {
          focus1: o.f1 || [],
          focus2: o.f2 || [],
          swap: o.sw || [],
          done: [...doneSet].sort((a, b) => a - b),
          pointers: ptrs,
          marks: rg ? { range: [rg[0], rg[1]], rangeLabel: `区间 [${rg[0]}, ${rg[1]}]` } : {},
        },
      }),
      stackLayer({
        id: 'stk',
        title: '递归栈（待处理区间）',
        name: 'call stack · 每格一个 [lo,hi]',
        cells: frames.map((f, k) => ({ value: `[${f[0]}, ${f[1]}]`, label: `#${k}` })),
        top: frames.length - 1,
        capacity: Math.max(4, n),
        bottomLabel: 'bottom（主调用）',
        topLabel: 'top',
        roles: { focus1: o.topFocus && frames.length ? [frames.length - 1] : [] },
      }),
    ];
  };
  const put = (o) => steps.push(step({
    event: o.event, lineId: o.lineId, note: o.note, vars: o.vars, layers: snap(o),
    done: !!o.done, result: o.result,
  }));

  put({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：一趟划分都不用跑，直接结束。'
      : `共 ${n} 个元素。三路划分：把区间切成「< pivot」「= pivot」「> pivot」三段，等于段一次就集结完，重复值很多时只跑一趟。`,
    vars: { n, lo: null, hi: null, pivot: null, lt: null, i: null, gt: null, cmp: 0, swaps: 0 },
  });

  const qsort = (lo, hi) => {
    if (lo > hi) return;
    frames.push([lo, hi]);
    put({
      event: 'push', lineId: 'push',
      note: `进入区间 [${lo},${hi}] 并压栈（当前栈深 ${frames.length}）。`,
      vars: { n, lo, hi, pivot: null, lt: null, i: null, gt: null, cmp: comparisons, swaps },
      range: [lo, hi], topFocus: true,
    });
    if (lo === hi) {
      doneSet.add(lo);
      frames.pop();
      put({
        event: 'pop', lineId: 'base',
        note: `区间 [${lo},${hi}] 单个元素 a[${lo}] = ${labels[lo]}，无需划分，出栈。`,
        vars: { n, lo, hi, pivot: null, lt: null, i: null, gt: null, cmp: comparisons, swaps },
        range: [lo, hi], f1: [lo],
      });
      return;
    }

    const pivot = arr[lo];
    const pivotLabel = labels[lo];
    let lt = lo;
    let i = lo;
    let gt = hi;
    put({
      event: 'pivot', lineId: 'pivot',
      note: `基准 pivot = a[${lo}] = ${pivotLabel}。三个指针：lt = ${lt}（小于段右边界）、i = ${i}（扫描位）、gt = ${gt}（大于段左边界）。`,
      vars: { n, lo, hi, pivot: pivotLabel, lt, i, gt, cmp: comparisons, swaps },
      range: [lo, hi], f1: [lo], ptrLt: lt, ptrI: i, ptrGt: gt,
    });

    while (i <= gt) {
      comparisons++;
      const v = arr[i];
      const kind = v < pivot ? 'less' : v > pivot ? 'greater' : 'equal';
      put({
        event: 'compare', lineId: 'cmp',
        note: `a[${i}] = ${labels[i]} 与基准 ${pivotLabel} 比：${kind === 'less' ? '更小，该进左侧的小于段。' : kind === 'greater' ? '更大，该甩到右侧的大于段。' : '相等，留在中间的等于段。'}`,
        vars: { n, lo, hi, pivot: pivotLabel, lt, i, gt, cmp: comparisons, swaps },
        range: [lo, hi], f1: [lo], f2: [i], ptrLt: lt, ptrI: i, ptrGt: gt,
      });

      if (kind === 'less') {
        if (lt !== i) {
          swapAt(lt, i);
          swaps++;
          put({
            event: 'swap', lineId: 'less',
            note: `交换 a[${lt}] 与 a[${i}]：${labels[lt]} 落到小于段末尾，lt 与 i 一起前进。`,
            vars: { n, lo, hi, pivot: pivotLabel, lt, i, gt, cmp: comparisons, swaps },
            range: [lo, hi], sw: [lt, i], ptrLt: lt, ptrI: i, ptrGt: gt,
          });
        }
        lt++;
        i++;
      } else if (kind === 'greater') {
        if (i !== gt) {
          swapAt(i, gt);
          swaps++;
          put({
            event: 'swap', lineId: 'swap-gt',
            note: `把 a[${i}] 换到大等于段起点 a[${gt}]：换过来的元素还没比过，i 原地不动，gt 左移。`,
            vars: { n, lo, hi, pivot: pivotLabel, lt, i, gt, cmp: comparisons, swaps },
            range: [lo, hi], sw: [i, gt], ptrLt: lt, ptrI: i, ptrGt: gt,
          });
        }
        gt--;
      } else {
        i++;
      }
    }

    for (let k = lt; k <= gt; k++) doneSet.add(k);
    put({
      event: 'partition-end', lineId: 'p-end',
      note: `划分完成：a[${lt}..${gt}] 全都等于 ${pivotLabel}，整段已是最终位置（${Math.max(0, gt - lt + 1)} 个元素一次到位）。只剩 [${lo},${lt - 1}] 与 [${gt + 1},${hi}] 待处理。`,
      vars: { n, lo, hi, pivot: pivotLabel, lt, i, gt, cmp: comparisons, swaps },
      range: [lo, hi], f1: seq(lt, gt),
    });

    frames.pop();
    put({
      event: 'pop', lineId: 'recurse',
      note: `本区间划分完，出栈；再分别进入小于段与大于段（相等段绝不重复进入）。`,
      vars: { n, lo, hi, pivot: pivotLabel, lt, i, gt, cmp: comparisons, swaps },
      range: [lo, hi],
    });
    qsort(lo, lt - 1);
    qsort(gt + 1, hi);
  };

  if (n > 0) qsort(0, n - 1);

  const result = { array: [...arr], labels: [...labels] };
  put({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}（比较 ${comparisons} 次、交换 ${swaps} 次；重复值越多，三路的优势越明显）。`,
    vars: { n, lo: null, hi: null, pivot: null, lt: null, i: null, gt: null, cmp: comparisons, swaps },
    range: [0, n - 1],
  });

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'quick-sort-3way-v1',
    lines: L, steps, result, meta: { comparisons, swaps },
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
