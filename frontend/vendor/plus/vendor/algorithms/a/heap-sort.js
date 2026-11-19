/**
 * A · 堆排序（3 个代表性不同实现）
 *
 * 主层 style 8（heapLayer）：cells 永远是整条 a[]（含已排序后缀），
 *   tree 只放**有效前缀** arr.slice(0, heapSize)——所以堆缩小时逻辑堆也跟着变小，
 *   一眼就能看出"有效堆范围 / 已排序后缀"两个概念的区别。
 *
 * 三个变体的策略确实不同：
 *   v1 大根堆 + 递归下沉：建堆后每轮把堆顶换到末尾，再递归 sift_down，升序输出；
 *   v2 大根堆 + 迭代下沉：下沉改成 while 沿 2k+1 / 2k+2 走，不压调用栈；
 *   v3 小根堆 + 迭代下沉：堆顶是当前最小值，换到末尾得到**降序**输出（对照堆性质与输出方向）。
 */

import { trace, step, heapLayer } from '../../engine/model.js';

export const meta = {
  id: 'a/heap-sort',
  variants: [
    { id: 'v1', name: '大根堆递归下沉' },
    { id: 'v2', name: '大根堆迭代下沉' },
    { id: 'v3', name: '小根堆降序输出' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void heap_sort(int a[], int n) {' },
    { lineId: 'build', text: '  for (int i = n / 2 - 1; i >= 0; --i) sift_down(a, i, n);   /* 自底向上建大根堆 */' },
    { lineId: 'shrink', text: '  for (int end = n - 1; end > 0; --end) {      /* 每轮把堆顶换到末尾 */' },
    { lineId: 'swap', text: '    swap(a[0], a[end]);' },
    { lineId: 'sift', text: '    sift_down(a, 0, end);                     /* 有效堆缩小到 [0,end) */' },
    { lineId: 'shrink-end', text: '  }' },
    { lineId: 'end', text: '}' },
    { lineId: 'sift-fn', text: 'void sift_down(int a[], int k, int size) {     /* 递归下沉 */' },
    { lineId: 'child-l', text: '  int l = 2 * k + 1, r = 2 * k + 2, big = k;' },
    { lineId: 'cmp-l', text: '  if (l < size && a[l] > a[big]) big = l;' },
    { lineId: 'cmp-r', text: '  if (r < size && a[r] > a[big]) big = r;' },
    { lineId: 'if', text: '  if (big != k) {' },
    { lineId: 'swap2', text: '    swap(a[k], a[big]);' },
    { lineId: 'recurse', text: '    sift_down(a, big, size);               /* 递归：沿下沉路径继续 */' },
    { lineId: 'if-end', text: '  }' },
    { lineId: 'ret', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void heap_sort(int a[], int n) {' },
    { lineId: 'build', text: '  for (int i = n / 2 - 1; i >= 0; --i) sift_down_iter(a, i, n);  /* 建大根堆 */' },
    { lineId: 'shrink', text: '  for (int end = n - 1; end > 0; --end) {' },
    { lineId: 'swap', text: '    swap(a[0], a[end]);' },
    { lineId: 'sift', text: '    sift_down_iter(a, 0, end);' },
    { lineId: 'shrink-end', text: '  }' },
    { lineId: 'end', text: '}' },
    { lineId: 'sift-fn', text: 'void sift_down_iter(int a[], int k, int size) {  /* 迭代下沉，不压栈 */' },
    { lineId: 'loop', text: '  while (2 * k + 1 < size) {                 /* 还有孩子就继续往下走 */' },
    { lineId: 'child-l', text: '    int l = 2 * k + 1, r = l + 1, big = l;' },
    { lineId: 'cmp-l', text: '    if (r < size && a[r] > a[l]) big = r;      /* 先选出较大的孩子 */' },
    { lineId: 'cmp-parent', text: '    if (a[big] <= a[k]) break;                 /* 父不小于孩子：堆性质满足 */' },
    { lineId: 'swap2', text: '    swap(a[k], a[big]);' },
    { lineId: 'step', text: '    k = big;                                   /* 沿下沉路径继续 */' },
    { lineId: 'loop-end', text: '  }' },
    { lineId: 'ret', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void heap_sort_desc(int a[], int n) {' },
    { lineId: 'build', text: '  for (int i = n / 2 - 1; i >= 0; --i) sift_down_min(a, i, n);  /* 建小根堆 */' },
    { lineId: 'shrink', text: '  for (int end = n - 1; end > 0; --end) {' },
    { lineId: 'swap', text: '    swap(a[0], a[end]);          /* 堆顶是当前最小值 → 落到末尾，输出降序 */' },
    { lineId: 'sift', text: '    sift_down_min(a, 0, end);' },
    { lineId: 'shrink-end', text: '  }' },
    { lineId: 'end', text: '}' },
    { lineId: 'sift-fn', text: 'void sift_down_min(int a[], int k, int size) {' },
    { lineId: 'loop', text: '  while (2 * k + 1 < size) {' },
    { lineId: 'child-l', text: '    int l = 2 * k + 1, r = l + 1, small = l;' },
    { lineId: 'cmp-l', text: '    if (r < size && a[r] < a[l]) small = r;    /* 先选出较小的孩子 */' },
    { lineId: 'cmp-parent', text: '    if (a[small] >= a[k]) break;               /* 父不大于孩子：小根堆性质满足 */' },
    { lineId: 'swap2', text: '    swap(a[k], a[small]);' },
    { lineId: 'step', text: '    k = small;' },
    { lineId: 'loop-end', text: '  }' },
    { lineId: 'ret', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '[4,1,3,2]（v1/v2 升序 [1,2,3,4]；v3 小根堆降序 [4,3,2,1]）',
    input: { array: [4, 1, 3, 2] },
    expect: { array: [1, 2, 3, 4] },
    expectByVariant: { v3: { array: [4, 3, 2, 1] } },
  },
  {
    id: 'edge-single',
    label: '[1]（单元素：没有非叶结点，也没有可交换的末尾）',
    input: { array: [1] },
    expect: { array: [1] },
  },
  {
    id: 'edge-empty',
    label: '[]（空堆直接结束）',
    input: { array: [] },
    expect: { array: [] },
  },
];

const seq = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
};

/* ------------------------------------------------------------------ 变体 1（大根堆 + 递归下沉） */

function runV1(input) {
  const src = input.array || [];
  const arr = [...src];
  const n = arr.length;
  let heapSize = n;
  const L = LINES.v1;
  const steps = [];
  let comparisons = 0;
  let swaps = 0;

  const swapAt = (x, y) => {
    const t = arr[x]; arr[x] = arr[y]; arr[y] = t;
  };

  const snap = (o = {}) => [heapLayer({
    id: 'main',
    title: 'Heap',
    name: o.name || `heap · 有效堆 [0,${heapSize}) 共 ${heapSize} 个，已排序后缀 ${n - heapSize} 个`,
    cells: arr.map((v, i) => ({ label: `[${i}]`, value: v })),
    tree: o.fullTree ? arr.slice(0, n) : arr.slice(0, heapSize),
    roles: {
      focus1: o.f1 || [],
      focus2: o.f2 || [],
      swap: o.sw || [],
      done: o.doneIdx || seq(heapSize, n - 1),
      pointers: o.ptrs || [],
    },
  })];
  const put = (o) => steps.push(step({
    event: o.event, lineId: o.lineId, note: o.note, vars: o.vars, layers: snap(o),
    done: !!o.done, result: o.result,
  }));

  const siftDown = (k, size) => {
    let big = k;
    const l = 2 * k + 1;
    const r = 2 * k + 2;
    put({
      event: 'sift', lineId: 'sift-fn',
      note: l < size
        ? `进入 sift_down(k=${k}, size=${size})：k 的孩子是左 ${l}${r < size ? `、右 ${r}` : '（无右孩子）'}，默认最大者是 k 自己。`
        : `进入 sift_down(k=${k}, size=${size})：2k+1 = ${l} ≥ size，k 是叶子，无需下沉。`,
      vars: { n, heapSize, size, k, children: l < size ? `${l}${r < size ? `,${r}` : ''}` : '—' },
      f1: [k], ptrs: [{ id: 'k', label: 'k', index: k }],
    });
    if (l < size) {
      comparisons++;
      const takeL = arr[l] > arr[big];
      put({
        event: 'compare', lineId: 'cmp-l',
        note: `比较左孩子 a[${l}] = ${arr[l]} 与 a[${big}] = ${arr[big]}：${takeL ? `左孩子更大，最大者改记为 ${l}。` : `不大于 a[${big}]，最大者仍是 ${big}。`}`,
        vars: { n, heapSize, size, k, big },
        f1: [big], f2: [l], ptrs: [{ id: 'k', label: 'k', index: k }],
      });
      if (takeL) big = l;
    }
    if (r < size) {
      comparisons++;
      const takeR = arr[r] > arr[big];
      put({
        event: 'compare', lineId: 'cmp-r',
        note: `比较右孩子 a[${r}] = ${arr[r]} 与 a[${big}] = ${arr[big]}：${takeR ? `右孩子更大，最大者改记为 ${r}。` : `不大于 a[${big}]，最大者仍是 ${big}。`}`,
        vars: { n, heapSize, size, k, big },
        f1: [big], f2: [r], ptrs: [{ id: 'k', label: 'k', index: k }],
      });
      if (takeR) big = r;
    }

    if (big === k) {
      put({
        event: 'sift', lineId: 'if',
        note: l < size
          ? `最大者就是 k = ${k} 自己：a[${k}] 不小于所有孩子，大根堆性质成立，不再交换。`
          : `k = ${k} 没有孩子，堆性质自然成立，不再交换。`,
        vars: { n, heapSize, size, k },
        f1: [k], ptrs: [{ id: 'k', label: 'k', index: k }],
      });
      return;
    }

    const parentVal = arr[k];
    const childVal = arr[big];
    swapAt(k, big);
    swaps++;
    put({
      event: 'swap', lineId: 'swap2',
      note: `孩子 a[${big}] = ${childVal} 大于父 a[${k}] = ${parentVal}：交换父子，大值上浮一层。`,
      vars: { n, heapSize, size, k, big },
      sw: [k, big], ptrs: [{ id: 'k', label: 'k', index: k }],
    });
    put({
      event: 'sift', lineId: 'recurse',
      note: `递归下沉到结点 ${big}：换下去的小值可能继续破坏那一层的堆性质。`,
      vars: { n, heapSize, size, k: big },
      f1: [big], ptrs: [{ id: 'k', label: 'k', index: big }],
    });
    siftDown(big, size);
  };

  put({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：没有结点可以建堆，直接结束。'
      : `共 ${n} 个元素。先把 a[] 看成完全二叉树，从最后一个非叶结点 i = ${Math.floor(n / 2) - 1} 往前建大根堆；之后每轮「堆顶 ↔ 有效区末项」并递归下沉，升序输出。`,
    vars: { n, heapSize, i: null, k: null, end: null, swaps: 0 },
    doneIdx: [],
  });

  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    put({
      event: 'build', lineId: 'build',
      note: `建堆：现在调整以 i = ${i} 为根的子树。i 从最后一个非叶结点倒着走，所以下沉时它的左右子树都已经是堆了。`,
      vars: { n, heapSize, i, k: i, end: null, swaps },
      f1: [i], doneIdx: [], ptrs: [{ id: 'i', label: 'i', index: i }],
    });
    siftDown(i, heapSize);
  }

  if (n > 1) {
    put({
      event: 'build', lineId: 'shrink-end',
      note: '建堆完成：根 a[0] 就是全堆最大值，可以开始逐个取出了。',
      vars: { n, heapSize, i: null, k: 0, end: null, swaps },
      f1: [0], doneIdx: [],
    });
  }

  for (let end = n - 1; end > 0; end--) {
    const maxVal = arr[0];
    const tailVal = arr[end];
    swapAt(0, end);
    swaps++;
    put({
      event: 'swap', lineId: 'swap',
      note: `堆顶 a[0] = ${maxVal} 是当前有效堆的最大值：与有效区末项 a[${end}] = ${tailVal} 交换，最大值一步到位。`,
      vars: { n, heapSize, i: null, k: 0, end, swaps },
      sw: [0, end],
    });
    heapSize = end;
    put({
      event: 'shrink', lineId: 'shrink',
      note: `a[${end}] = ${maxVal} 进入已排序后缀（不会再动）。有效堆缩小为 [0,${end})，逻辑堆只画这 ${end} 个结点。`,
      vars: { n, heapSize, i: null, k: 0, end, swaps },
      f1: [end],
    });
    siftDown(0, heapSize);
  }

  const result = { array: [...arr] };
  put({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}（比较 ${comparisons} 次、交换 ${swaps} 次；有效堆缩到空，后缀即答案）。`,
    vars: { n, heapSize: 0, i: null, k: null, end: null, swaps },
    fullTree: true, doneIdx: seq(0, n - 1),
  });

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'heap-sort-recursive-v1',
    lines: L, steps, result, meta: { comparisons, swaps },
  });
}

/* ------------------------------------------------------------------ 变体 2（大根堆 + 迭代下沉） */

function runV2(input) {
  const src = input.array || [];
  const arr = [...src];
  const n = arr.length;
  let heapSize = n;
  const L = LINES.v2;
  const steps = [];
  let comparisons = 0;
  let swaps = 0;

  const swapAt = (x, y) => {
    const t = arr[x]; arr[x] = arr[y]; arr[y] = t;
  };

  const snap = (o = {}) => [heapLayer({
    id: 'main',
    title: 'Heap',
    name: o.name || `heap · 有效堆 [0,${heapSize}) 共 ${heapSize} 个，已排序后缀 ${n - heapSize} 个`,
    cells: arr.map((v, i) => ({ label: `[${i}]`, value: v })),
    tree: o.fullTree ? arr.slice(0, n) : arr.slice(0, heapSize),
    roles: {
      focus1: o.f1 || [],
      focus2: o.f2 || [],
      swap: o.sw || [],
      done: o.doneIdx || seq(heapSize, n - 1),
      pointers: o.ptrs || [],
    },
  })];
  const put = (o) => steps.push(step({
    event: o.event, lineId: o.lineId, note: o.note, vars: o.vars, layers: snap(o),
    done: !!o.done, result: o.result,
  }));

  const siftDown = (start, size) => {
    let k = start;
    put({
      event: 'sift', lineId: 'sift-fn',
      note: `进入 sift_down_iter(a, ${start}, ${size})：用 while 沿 2k+1 / 2k+2 循环往下走，不占调用栈。`,
      vars: { n, heapSize, size, k, l: null, r: null },
      f1: [k], ptrs: [{ id: 'k', label: 'k', index: k }],
    });
    for (;;) {
      const l = 2 * k + 1;
      if (l >= size) {
        put({
          event: 'sift', lineId: 'loop',
          note: `k = ${k} 的左孩子下标 ${l} 已 ≥ size ${size}：没有孩子可下沉，循环结束（迭代版的终止条件是循环条件，不是递归基准）。`,
          vars: { n, heapSize, size, k, l: null, r: null },
          f1: [k], ptrs: [{ id: 'k', label: 'k', index: k }],
        });
        break;
      }
      const r = l + 1;
      let big = l;
      put({
        event: 'compare', lineId: 'child-l',
        note: `结点 ${k} 的孩子：左 ${l}${r < size ? `、右 ${r}` : '（右孩子越界，不存在）'}。先把左孩子当候选最大。`,
        vars: { n, heapSize, size, k, l, r: r < size ? r : null },
        f1: [k], f2: [l], ptrs: [{ id: 'k', label: 'k', index: k }],
      });
      if (r < size) {
        comparisons++;
        const takeR = arr[r] > arr[l];
        put({
          event: 'compare', lineId: 'cmp-l',
          note: `比较两个孩子 a[${l}] = ${arr[l]} 与 a[${r}] = ${arr[r]}：${takeR ? `右孩子更大，候选改成 ${r}。` : `左孩子不小于右孩子，候选仍是 ${l}。`}`,
          vars: { n, heapSize, size, k, l, r, big },
          f1: [l], f2: [r], ptrs: [{ id: 'k', label: 'k', index: k }],
        });
        if (takeR) big = r;
      }
      comparisons++;
      const needSwap = arr[big] > arr[k];
      put({
        event: 'compare', lineId: 'cmp-parent',
        note: `比较孩子 a[${big}] = ${arr[big]} 与父 a[${k}] = ${arr[k]}：${needSwap ? '孩子更大，破坏大根堆性质，需要交换。' : '父不小于孩子，堆性质已满足，break 结束下沉。'}`,
        vars: { n, heapSize, size, k, l, r: r < size ? r : null, big },
        f1: [k], f2: [big], ptrs: [{ id: 'k', label: 'k', index: k }],
      });
      if (!needSwap) {
        put({
          event: 'sift', lineId: 'loop-end',
          note: `break：a[${k}] 以下（含它自己）都满足大根堆性质，本轮下沉结束。`,
          vars: { n, heapSize, size, k },
          f1: [k], ptrs: [{ id: 'k', label: 'k', index: k }],
        });
        break;
      }
      const parentVal = arr[k];
      const childVal = arr[big];
      swapAt(k, big);
      swaps++;
      put({
        event: 'swap', lineId: 'swap2',
        note: `交换 a[${k}] = ${parentVal} 与孩子 a[${big}] = ${childVal}：大值上浮一层。`,
        vars: { n, heapSize, size, k, big },
        sw: [k, big], ptrs: [{ id: 'k', label: 'k', index: k }],
      });
      k = big;
      put({
        event: 'sift', lineId: 'step',
        note: `k = ${k}：沿下沉路径走到刚换下来的位置，继续 while 检查下一层（没有压栈、没有递归返回）。`,
        vars: { n, heapSize, size, k },
        f1: [k], ptrs: [{ id: 'k', label: 'k', index: k }],
      });
    }
  };

  put({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：堆为空，直接结束。'
      : `共 ${n} 个元素。同样建大根堆，但下沉用 while 循环（k = big）实现，与 v1 的递归版本在画面上会看到"没有回退"的下沉路径。`,
    vars: { n, heapSize, i: null, k: null, end: null, swaps: 0 },
    doneIdx: [],
  });

  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    put({
      event: 'build', lineId: 'build',
      note: `建堆：调整以 i = ${i} 为根的子树；从最后一个非叶结点往前，子树先成堆，根再下潜。`,
      vars: { n, heapSize, i, k: i, end: null, swaps },
      f1: [i], doneIdx: [], ptrs: [{ id: 'i', label: 'i', index: i }],
    });
    siftDown(i, heapSize);
  }

  if (n > 1) {
    put({
      event: 'build', lineId: 'shrink-end',
      note: '建堆完成：a[0] 是最大值，接下来每轮把它换到有效区末尾。',
      vars: { n, heapSize, i: null, k: 0, end: null, swaps },
      f1: [0], doneIdx: [],
    });
  }

  for (let end = n - 1; end > 0; end--) {
    const maxVal = arr[0];
    const tailVal = arr[end];
    swapAt(0, end);
    swaps++;
    put({
      event: 'swap', lineId: 'swap',
      note: `堆顶 a[0] = ${maxVal} 与有效区末项 a[${end}] = ${tailVal} 交换：最大值就此归位。`,
      vars: { n, heapSize, i: null, k: 0, end, swaps },
      sw: [0, end],
    });
    heapSize = end;
    put({
      event: 'shrink', lineId: 'shrink',
      note: `有效堆缩小为 [0,${end})，后缀 [${end},${n - 1}] 已有序（绿色）；逻辑堆只剩 ${end} 个结点。`,
      vars: { n, heapSize, i: null, k: 0, end, swaps },
      f1: [end],
    });
    siftDown(0, heapSize);
  }

  const result = { array: [...arr] };
  put({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}（比较 ${comparisons} 次、交换 ${swaps} 次）。`,
    vars: { n, heapSize: 0, i: null, k: null, end: null, swaps },
    fullTree: true, doneIdx: seq(0, n - 1),
  });

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'heap-sort-iterative-v1',
    lines: L, steps, result, meta: { comparisons, swaps },
  });
}

/* ------------------------------------------------------------------ 变体 3（小根堆 → 降序输出） */

function runV3(input) {
  const src = input.array || [];
  const arr = [...src];
  const n = arr.length;
  let heapSize = n;
  const L = LINES.v3;
  const steps = [];
  let comparisons = 0;
  let swaps = 0;

  const swapAt = (x, y) => {
    const t = arr[x]; arr[x] = arr[y]; arr[y] = t;
  };

  const snap = (o = {}) => [heapLayer({
    id: 'main',
    title: 'Heap (min)',
    name: o.name || `min-heap · 有效堆 [0,${heapSize}) 共 ${heapSize} 个，已排好的后缀 ${n - heapSize} 个`,
    cells: arr.map((v, i) => ({ label: `[${i}]`, value: v })),
    tree: o.fullTree ? arr.slice(0, n) : arr.slice(0, heapSize),
    roles: {
      focus1: o.f1 || [],
      focus2: o.f2 || [],
      swap: o.sw || [],
      done: o.doneIdx || seq(heapSize, n - 1),
      pointers: o.ptrs || [],
    },
  })];
  const put = (o) => steps.push(step({
    event: o.event, lineId: o.lineId, note: o.note, vars: o.vars, layers: snap(o),
    done: !!o.done, result: o.result,
  }));

  const siftDown = (start, size) => {
    let k = start;
    put({
      event: 'sift', lineId: 'sift-fn',
      note: `进入 sift_down_min(a, ${start}, ${size})：小根堆要求"父不大于孩子"，所以往下换的是更小的那个孩子。`,
      vars: { n, heapSize, size, k, l: null, r: null },
      f1: [k], ptrs: [{ id: 'k', label: 'k', index: k }],
    });
    for (;;) {
      const l = 2 * k + 1;
      if (l >= size) {
        put({
          event: 'sift', lineId: 'loop',
          note: `k = ${k} 没有孩子（2k+1 = ${l} ≥ size ${size}），下沉结束。`,
          vars: { n, heapSize, size, k, l: null, r: null },
          f1: [k], ptrs: [{ id: 'k', label: 'k', index: k }],
        });
        break;
      }
      const r = l + 1;
      let small = l;
      put({
        event: 'compare', lineId: 'child-l',
        note: `结点 ${k} 的孩子：左 ${l}${r < size ? `、右 ${r}` : '（无右孩子）'}；小根堆要先选出更小的孩子。`,
        vars: { n, heapSize, size, k, l, r: r < size ? r : null },
        f1: [k], f2: [l], ptrs: [{ id: 'k', label: 'k', index: k }],
      });
      if (r < size) {
        comparisons++;
        const takeR = arr[r] < arr[l];
        put({
          event: 'compare', lineId: 'cmp-l',
          note: `比较两个孩子 a[${l}] = ${arr[l]} 与 a[${r}] = ${arr[r]}：${takeR ? `右孩子更小，候选改成 ${r}。` : `左孩子不大于右孩子，候选仍是 ${l}。`}`,
          vars: { n, heapSize, size, k, l, r, small },
          f1: [l], f2: [r], ptrs: [{ id: 'k', label: 'k', index: k }],
        });
        if (takeR) small = r;
      }
      comparisons++;
      const needSwap = arr[small] < arr[k];
      put({
        event: 'compare', lineId: 'cmp-parent',
        note: `比较孩子 a[${small}] = ${arr[small]} 与父 a[${k}] = ${arr[k]}：${needSwap ? '孩子更小，破坏小根堆性质，需要交换。' : '父不大于孩子，小根堆性质已满足，break。'}`,
        vars: { n, heapSize, size, k, l, r: r < size ? r : null, small },
        f1: [k], f2: [small], ptrs: [{ id: 'k', label: 'k', index: k }],
      });
      if (!needSwap) {
        put({
          event: 'sift', lineId: 'loop-end',
          note: `break：a[${k}] 以下都满足小根堆性质，下沉结束。`,
          vars: { n, heapSize, size, k },
          f1: [k], ptrs: [{ id: 'k', label: 'k', index: k }],
        });
        break;
      }
      const parentVal = arr[k];
      const childVal = arr[small];
      swapAt(k, small);
      swaps++;
      put({
        event: 'swap', lineId: 'swap2',
        note: `交换 a[${k}] = ${parentVal} 与更小的孩子 a[${small}] = ${childVal}：小值上浮一层。`,
        vars: { n, heapSize, size, k, small },
        sw: [k, small], ptrs: [{ id: 'k', label: 'k', index: k }],
      });
      k = small;
      put({
        event: 'sift', lineId: 'step',
        note: `k = ${k}：沿下沉路径继续检查下一层。`,
        vars: { n, heapSize, size, k },
        f1: [k], ptrs: [{ id: 'k', label: 'k', index: k }],
      });
    }
  };

  put({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空数组：堆为空，直接结束。'
      : `共 ${n} 个元素。这里建**小根堆**：堆顶是最小值，每轮换到有效区末尾，所以后缀从右往左是"越来越大"，最终数组是降序。`,
    vars: { n, heapSize, i: null, k: null, end: null, swaps: 0 },
    doneIdx: [],
  });

  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    put({
      event: 'build', lineId: 'build',
      note: `建小根堆：调整以 i = ${i} 为根的子树，让每个父结点都不大于它的孩子。`,
      vars: { n, heapSize, i, k: i, end: null, swaps },
      f1: [i], doneIdx: [], ptrs: [{ id: 'i', label: 'i', index: i }],
    });
    siftDown(i, heapSize);
  }

  if (n > 1) {
    put({
      event: 'build', lineId: 'shrink-end',
      note: '小根堆建好：a[0] 是全局最小值，接下来逐个把它甩到末尾。',
      vars: { n, heapSize, i: null, k: 0, end: null, swaps },
      f1: [0], doneIdx: [],
    });
  }

  for (let end = n - 1; end > 0; end--) {
    const minVal = arr[0];
    const tailVal = arr[end];
    swapAt(0, end);
    swaps++;
    put({
      event: 'swap', lineId: 'swap',
      note: `堆顶 a[0] = ${minVal} 是当前有效堆里的最小值：与 a[${end}] = ${tailVal} 交换，最小值沉到末尾，最终顺序就是降序。`,
      vars: { n, heapSize, i: null, k: 0, end, swaps },
      sw: [0, end],
    });
    heapSize = end;
    put({
      event: 'shrink', lineId: 'shrink',
      note: `有效堆缩小为 [0,${end})；后缀 [${end},${n - 1}] 已确定（降序），逻辑堆只画有效前缀。`,
      vars: { n, heapSize, i: null, k: 0, end, swaps },
      f1: [end],
    });
    siftDown(0, heapSize);
  }

  const result = { array: [...arr] };
  put({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '排序完成，结果仍是空数组。'
      : `排序完成：${arr.join(', ')}（比较 ${comparisons} 次、交换 ${swaps} 次；同样一次建堆 + 抽取，只是堆性质反过来，输出方向也反过来）。`,
    vars: { n, heapSize: 0, i: null, k: null, end: null, swaps },
    fullTree: true, doneIdx: seq(0, n - 1),
  });

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'heap-sort-min-desc-v1',
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
