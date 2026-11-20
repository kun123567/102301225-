/**
 * E · 顺序表逆置（3 个代表性不同实现）
 *
 *   1) v1 双指针就地交换：i 从 0、j 从 n-1 向中间靠，交换对称的两格，i>=j 结束；额外空间 O(1)；
 *   2) v2 递归逆置：reverse(i,j) 换完首尾再递归 reverse(i+1,j-1)，vars.depth 展示调用栈深度；
 *   3) v3 借助临时数组：先把整表拷进 temp，再倒序写回，额外空间 O(n)，两趟遍历。
 *
 * 三版结果一定相同（都是逆置），所以 expect 只用 { array } 就能统一深比较。
 * 动画重点：左右下标、交换的两项、交换后的数组、奇数个元素时"中间格不交换"的边界。
 */

import { trace, step, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'e/array-list-reverse',
  variants: [
    { id: 'v1', name: '双指针就地交换' },
    { id: 'v2', name: '递归逆置' },
    { id: 'v3', name: '借助临时数组' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void reverse(int a[], int n) {' },
    { lineId: 'init', text: '  int i = 0, j = n - 1;                    /* 左右下标指向两端 */' },
    { lineId: 'while', text: '  while (i < j) {                          /* 下标没交叉就还要换 */' },
    { lineId: 'swap', text: '    int t = a[i]; a[i] = a[j]; a[j] = t;    /* 对称两格对调 */' },
    { lineId: 'advance', text: '    ++i; --j;                              /* 处理完一对，向中间靠 */' },
    { lineId: 'while-end', text: '  }' },
    { lineId: 'meet', text: '  /* i >= j：奇数个时 i==j 落在中间格，自己与自己对称，不换 */' },
    { lineId: 'cost', text: '  /* 交换 n/2 次，额外空间 O(1) —— 这是"就地"的含义 */' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void reverse(int a[], int i, int j) {' },
    { lineId: 'base', text: '  if (i >= j) return;                     /* 递归出口：剩 0 或 1 个元素 */' },
    { lineId: 'swap', text: '  int t = a[i]; a[i] = a[j]; a[j] = t;    /* 先换当前层的首尾 */' },
    { lineId: 'recurse', text: '  reverse(a, i + 1, j - 1);               /* 再下潜一层处理内层 */' },
    { lineId: 'ret', text: '  /* return：内层处理完，本层栈帧弹出 */' },
    { lineId: 'depth', text: '  /* depth = 当前嵌套层数；n 个元素最多递归 n/2 层 */' },
    { lineId: 'cost', text: '  /* 时间 O(n)（n/2 次交换），空间 O(n/2) 层栈帧 */' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void reverse(int a[], int n) {' },
    { lineId: 'alloc', text: '  int *temp = malloc(n * sizeof(int));     /* 先要一块 O(n) 额外空间 */' },
    { lineId: 'copy-init', text: '  int k;' },
    { lineId: 'copy', text: '  for (k = 0; k < n; ++k) temp[k] = a[k];          /* 第 1 趟：整体拷贝 */' },
    { lineId: 'back-init', text: '  /* 值已安全留在 temp 里，现在 a 可以随便覆盖 */' },
    { lineId: 'back', text: '  for (k = 0; k < n; ++k) a[k] = temp[n - 1 - k]; /* 第 2 趟：倒序写回 */' },
    { lineId: 'free', text: '  free(temp);                              /* 归还额外空间 */' },
    { lineId: 'cost', text: '  /* 两趟遍历：2n 次读写，空间 O(n)；对比双指针版的 O(1) */' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '[1,2,3,4,5]（奇数个：中间格 a[2] 不参与交换）',
    input: { array: [1, 2, 3, 4, 5] },
    expect: { array: [5, 4, 3, 2, 1] },
  },
  {
    id: 'edge-even',
    label: '[1,2,3,4]（偶数个：两两配对，没有中间格）',
    input: { array: [1, 2, 3, 4] },
    expect: { array: [4, 3, 2, 1] },
  },
  {
    id: 'edge-empty',
    label: '[]（空表：i>=j 立刻成立）',
    input: { array: [] },
    expect: { array: [] },
  },
  {
    id: 'edge-single',
    label: '[7]（单元素：i==j，一格自己对称）',
    input: { array: [7] },
    expect: { array: [7] },
  },
];

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};

/* ------------------------------------------------------------------ 变体 1（双指针就地交换） */

function runV1(input) {
  const src = Array.isArray(input.array) ? input.array : [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES.v1;

  const snap = (roles = {}) => [arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]', values: [...arr], labels: [...labels], roles,
  })];
  const ptrs = (i, j) => ([{ id: 'i', label: 'i', index: i }, { id: 'j', label: 'j', index: j }]);
  const pending = (i, j) => (i <= j && n > 1 ? { marks: { range: [i, j], rangeLabel: '[i,j] 待逆置' } } : {});

  steps.push(step({
    event: 'init', lineId: 'init',
    note: n === 0
      ? '空表：i = 0、j = -1，i < j 不成立，一格都不用换。'
      : `n = ${n}：i = 0 指向表头，j = ${n - 1} 指向表尾，两下标向中间靠，每次只换对称的一对。`,
    vars: { n, i: 0, j: n - 1, swaps: 0 },
    layers: snap({ pointers: ptrs(0, n - 1), ...pending(0, n - 1) }),
  }));

  let i = 0;
  let j = n - 1;
  let swaps = 0;
  while (i < j) {
    const vi = arr[i];
    const vj = arr[j];
    const li = labels[i];
    const lj = labels[j];
    arr[i] = vj;
    arr[j] = vi;
    labels[i] = lj;
    labels[j] = li;
    swaps += 1;
    steps.push(step({
      event: 'swap', lineId: 'swap',
      note: `交换 a[${i}] = ${li} 与 a[${j}] = ${lj}：逆置就是把对称的两格对调，换完这两格就固定了。`,
      vars: { n, i, j, swaps },
      layers: snap({ swap: [i, j], pointers: ptrs(i, j), ...pending(i, j) }),
    }));
    i += 1;
    j -= 1;
    steps.push(step({
      event: 'advance', lineId: 'advance',
      note: `i → ${i}、j → ${j}：这一对处理完，各自前进一格${i > j ? '，两下标已经交叉，循环到此结束' : '，中间还剩一段没换'}。`,
      vars: { n, i, j, swaps },
      layers: snap({
        done: [...range(0, i - 1), ...range(j + 1, n - 1)],
        pointers: ptrs(i, j),
        ...pending(i, j),
      }),
    }));
  }

  steps.push(step({
    event: 'meet', lineId: 'meet',
    note: n === 0
      ? '空表：没有元素需要逆置，结果仍是空表。'
      : (i === j
        ? `i = j = ${i}：两下标在中间格相遇。共 ${n} 个（奇数个）元素，a[${i}] 与它自己对称，所以不交换——这就是"中间格"的边界。`
        : `i = ${i} > j = ${j}：两下标交叉。共 ${n} 个（偶数个）元素已两两配对完毕，没有中间格需要处理。`),
    vars: { n, i, j, swaps },
    layers: snap({ done: range(0, n - 1) }),
  }));

  const result = { array: [...arr] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0 ? '逆置完成：结果仍是空表。' : `逆置完成：${arr.join(', ')}（交换 ${swaps} 次，额外空间 O(1)）。`,
    vars: { n, i: null, j: null, swaps },
    layers: snap({ done: range(0, n - 1) }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'array-list-reverse-two-pointer-v1',
    lines: L, steps, result, meta: { swaps },
  });
}

/* ------------------------------------------------------------------ 变体 2（递归逆置） */

function runV2(input) {
  const src = Array.isArray(input.array) ? input.array : [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const steps = [];
  const L = LINES.v2;
  const snap = (roles = {}) => [arrayLayer({
    id: 'main', title: 'a[]', name: 'int a[n]（递归版：每层只负责自己的 [i,j]）',
    values: [...arr], labels: [...labels], roles,
  })];
  const ptrs = (i, j) => ([{ id: 'i', label: 'i', index: i }, { id: 'j', label: 'j', index: j }]);
  const inner = (i, j, depth) => (i <= j ? { marks: { range: [i, j], rangeLabel: `第 ${depth} 层 [i,j]` } } : {});

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n <= 1
      ? `表长 ${n}：调用 reverse(a, 0, ${n - 1}) 一进来就命中递归出口，一次交换都不会发生。`
      : `调用 reverse(a, 0, ${n - 1})：每层只换当前区间的首尾，内层交给下一层递归；depth 记录已嵌套的层数。`,
    vars: { n, i: 0, j: n - 1, depth: 0, swaps: 0 },
    layers: snap({ pointers: ptrs(0, n - 1), ...inner(0, n - 1, 0) }),
  }));

  let i = 0;
  let j = n - 1;
  let depth = 0;
  let swaps = 0;
  while (i < j) {
    const vi = arr[i];
    const vj = arr[j];
    const li = labels[i];
    const lj = labels[j];
    arr[i] = vj;
    arr[j] = vi;
    labels[i] = lj;
    labels[j] = li;
    swaps += 1;
    steps.push(step({
      event: 'swap', lineId: 'swap',
      note: `第 ${depth} 层（栈深 ${depth}）：交换 a[${i}] = ${li} 与 a[${j}] = ${lj}，本层的活干完了。`,
      vars: { n, i, j, depth, swaps },
      layers: snap({ swap: [i, j], pointers: ptrs(i, j), ...inner(i, j, depth) }),
    }));
    i += 1;
    j -= 1;
    depth += 1;
    steps.push(step({
      event: 'advance', lineId: 'recurse',
      note: `调用 reverse(a, ${i}, ${j})：递归下潜一层，栈深变成 ${depth}${i > j ? '，新一层一进来就会命中出口' : ''}。`,
      vars: { n, i, j, depth, swaps },
      layers: snap({
        done: [...range(0, i - 1), ...range(j + 1, n - 1)],
        pointers: ptrs(i, j),
        ...inner(i, j, depth),
      }),
    }));
  }

  steps.push(step({
    event: 'meet', lineId: 'base',
    note: n === 0
      ? '第 0 层：i = 0 > j = -1，立刻命中出口，没有交换、也没有更深的栈帧。'
      : (i === j
        ? `第 ${depth} 层：i = j = ${i}，只剩中间格自己，命中出口（奇数个元素的边界）。`
        : `第 ${depth} 层：i = ${i} > j = ${j}，区间已空，命中出口（偶数个元素没有中间格）。`),
    vars: { n, i, j, depth, swaps },
    layers: snap({ done: range(0, n - 1) }),
  }));

  const result = { array: [...arr] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '递归结束：结果仍是空表。'
      : `递归结束：${arr.join(', ')}；最大栈深 ${depth}、交换 ${swaps} 次。各层 return 只是弹栈，数组不再变化。`,
    vars: { n, i: null, j: null, depth: 0, swaps },
    layers: snap({ done: range(0, n - 1) }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'array-list-reverse-recursive-v1',
    lines: L, steps, result, meta: { swaps, maxDepth: depth },
  });
}

/* ------------------------------------------------------------------ 变体 3（借助临时数组） */

function runV3(input) {
  const src = Array.isArray(input.array) ? input.array : [];
  const arr = [...src];
  const labels = labelsOf(src);
  const n = arr.length;
  const temp = new Array(n).fill(null);
  const tempLabels = new Array(n).fill('·');
  const steps = [];
  const L = LINES.v3;

  const snap = (roles = {}, tempRoles = {}) => [
    arrayLayer({
      id: 'main', title: 'a[]', name: 'int a[n]', values: [...arr], labels: [...labels], roles,
    }),
    arrayLayer({
      id: 'temp', title: 'temp[]', name: 'int temp[n]（额外 O(n) 空间）',
      values: temp.map((v) => (v == null ? '·' : v)), labels: [...tempLabels], roles: tempRoles,
    }),
  ];
  const ptr = (id, label, index) => ([{ id, label, index }]);

  steps.push(step({
    event: 'init', lineId: 'alloc',
    note: n === 0
      ? '空表：temp 分配 0 格，两趟遍历都是空转。'
      : `先分配 temp[0..${n - 1}]（下方那层）。这一版不就地交换，代价就是这块 O(n) 的额外空间。`,
    vars: { n, k: null, phase: '准备', swaps: 0, space: n },
    layers: snap({}, {}),
  }));

  let pw = 0;
  for (let k = 0; k < n; k++) {
    temp[k] = arr[k];
    tempLabels[k] = labels[k];
    steps.push(step({
      event: 'advance', lineId: 'copy',
      note: `第 1 趟（拷贝）k = ${k}：temp[${k}] ← a[${k}] = ${labels[k]}。此刻两份数据完全一样。`,
      vars: { n, k, phase: '拷贝', swaps: 0, space: n },
      layers: snap({ focus1: [k] }, { added: range(0, k) }),
    }));
  }

  if (n > 0) {
    steps.push(step({
      event: 'advance', lineId: 'back-init',
      note: `拷贝完成：值都安全留在 temp 里，接下去可以放心覆盖 a（这是"两次遍历"的分界）。`,
      vars: { n, k: null, phase: '写回', swaps: 0, space: n },
      layers: snap({}, { done: range(0, n - 1) }),
    }));
  }

  for (let k = 0; k < n; k++) {
    const srcIdx = n - 1 - k;
    arr[k] = temp[srcIdx];
    labels[k] = tempLabels[srcIdx];
    pw += 1;
    steps.push(step({
      event: 'advance', lineId: 'back',
      note: `第 2 趟（倒序写回）k = ${k}：a[${k}] ← temp[${srcIdx}] = ${labels[k]}。写回位置 k 与取值位置 n-1-k 刚好对称。`,
      vars: { n, k, phase: '写回', swaps: 0, written: pw, space: n },
      layers: snap({ focus1: [k], done: range(0, k - 1) }, { focus2: [srcIdx], done: range(srcIdx + 1, n - 1) }),
    }));
  }

  steps.push(step({
    event: 'meet', lineId: 'free',
    note: n === 0
      ? '空表：free(NULL) 直接返回，没有写回动作。'
      : `free(temp)：额外空间归还。写回结束，a 已经是逆序，不需要再动 temp。`,
    vars: { n, k: null, phase: '收尾', swaps: 0, written: pw, space: n },
    layers: snap({ done: range(0, n - 1) }),
  }));

  const result = { array: [...arr] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0
      ? '逆置完成：结果仍是空表。'
      : `逆置完成：${arr.join(', ')}（两趟遍历共读写 ${2 * n} 次，额外空间 O(n)——不如双指针版省空间，但写法最直白）。`,
    vars: { n, k: null, phase: '完成', swaps: 0, space: n },
    layers: snap({ done: range(0, n - 1) }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'array-list-reverse-temp-array-v1',
    lines: L, steps, result, meta: { extra: n },
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
