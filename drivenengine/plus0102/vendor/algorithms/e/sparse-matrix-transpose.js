/**
 * E · 稀疏矩阵转置（3 个代表性不同实现）
 *
 *   v1 列计数 + 起始位置（快速转置）：先扫一遍三元组给每列 num[] 计数，前缀和成 cpot[] 起始写入位置，
 *      再按原行序扫第二遍，把 (i,j,v) 写成 (j,i,v) 放到 cpot[j] 并让该列游标 +1 —— O(cols + terms)；
 *   v2 按列扫描的简单转置：外层逐列、内层每次重扫整个三元组表，命中才追加 —— O(cols × terms)，
 *      多出来的就是"列号不匹配的空比较"，本变体把这些空跑都画出来；
 *   v3 行逻辑链接版：num[]/rpos[] 之外再维护 cur[] 当前写入游标，写入阶段改成"按原矩阵的行"遍历 ——
 *      行逻辑链接提供的正是每行的三元组区间 [start,end)，于是落位顺序天然是原行序。
 *
 * 形状总账：转置 = 行列互换。所以输入 rows×cols 的输出必然是 cols×rows；
 * 空矩阵（terms = 0）只交换尺寸、三元组表为空；三版对同一输入给出的 result 完全一致，故共用一份 expect。
 *
 * 轨迹里的三个图层（都是 style 6 表格层，04_LINK_2D 之外由 two-array.js 的 layoutGrid 消费）：
 *   main = 原矩阵三元组表（行=三元组下标，列=i/j/v）；
 *   out  = 输出三元组表（v1/v3 预分配 terms 行、先画占位 ·，v2 边扫边追加）；
 *   aux  = 辅助数组（num / cpot，v3 多一行 cur）。角色的键统一写成 "行,列" 字符串。
 */

import { trace, step, gridLayer } from '../../engine/model.js';

export const meta = {
  id: 'e/sparse-matrix-transpose',
  variants: [
    { id: 'v1', name: '列计数 + 起始位置（快速转置）' },
    { id: 'v2', name: '按列扫描的简单转置' },
    { id: 'v3', name: '行逻辑链接版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'Status FastTranspose(TSMatrix M, TSMatrix *T) {' },
    { lineId: 'swap', text: '  T->rows = M.cols; T->cols = M.rows; T->terms = M.terms;   /* 行列互换 */' },
    { lineId: 'zero', text: '  for (c = 0; c < M.cols; ++c) num[c] = 0;                /* 列计数器清零 */' },
    { lineId: 'count', text: '  for (t = 0; t < M.terms; ++t) ++num[M.data[t].j];     /* 第 1 遍：只数每列有几个 */' },
    { lineId: 'cpot0', text: '  cpot[0] = 0;                                          /* 0 号列的起始写入位置 */' },
    { lineId: 'prefix', text: '  for (c = 1; c < M.cols; ++c)                          /* 前缀和：每列起点 */' },
    { lineId: 'prefix-add', text: '    cpot[c] = cpot[c-1] + num[c-1];                 /* 上一列起点 + 上一列个数 */' },
    { lineId: 'write', text: '  for (t = 0; t < M.terms; ++t) {                       /* 第 2 遍：按原行序落位 */' },
    { lineId: 'pos', text: '    k = cpot[M.data[t].j];                              /* 列 j 的下一个空位 */' },
    { lineId: 'put', text: '    T->data[k] = { M.data[t].j, M.data[t].i, M.data[t].v };   /* 行列互换写入 k */' },
    { lineId: 'advance', text: '    cpot[M.data[t].j] = k + 1;                          /* 该列游标后移一格 */' },
    { lineId: 'write-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'Status SimpleTranspose(TSMatrix M, TSMatrix *T) {' },
    { lineId: 'swap', text: '  T->rows = M.cols; T->cols = M.rows; T->terms = M.terms;' },
    { lineId: 'q-init', text: '  int q = 0;                                          /* 输出位置天然递增 */' },
    { lineId: 'col', text: '  for (c = 0; c < M.cols; ++c) {                       /* 外层：逐列处理 */' },
    { lineId: 'scan', text: '    for (t = 0; t < M.terms; ++t) {                    /* 内层：每次重扫整个三元组表 */' },
    { lineId: 'test', text: '      if (M.data[t].j != c) continue;                 /* 列号不对就白比较一次 */' },
    { lineId: 'append', text: '      T->data[q++] = { c, M.data[t].i, M.data[t].v };   /* 命中就直接追加 */' },
    { lineId: 'scan-end', text: '    }' },
    { lineId: 'col-end', text: '  }' },
    { lineId: 'cost', text: '  /* 比较次数 = cols × terms：正确但慢，这正是快速转置要消掉的部分 */' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'Status RowLinkTranspose(TSMatrix M, TSMatrix *T) {' },
    { lineId: 'swap', text: '  T->rows = M.cols; T->cols = M.rows; T->terms = M.terms;' },
    { lineId: 'count', text: '  for (t = 0; t < M.terms; ++t) ++num[M.data[t].j];     /* 每列个数 */' },
    { lineId: 'rpos0', text: '  rpos[0] = 0; cur[0] = 0;                              /* 0 号列的起始与游标 */' },
    { lineId: 'prefix', text: '  for (c = 1; c < M.cols; ++c) {' },
    { lineId: 'prefix-add', text: '    rpos[c] = rpos[c-1] + num[c-1];                  /* 每列（= 输出每行）起点 */' },
    { lineId: 'cur-init', text: '    cur[c]  = rpos[c];                              /* cur 才是会移动的写入游标 */' },
    { lineId: 'rowloop', text: '  for (r = 0; r < M.rows; ++r) {                       /* 按原矩阵的行遍历 */' },
    { lineId: 'rowrange', text: '    [start, end) = 第 r 行的三元组区间;               /* 行逻辑链接给的就是这个起点 */' },
    { lineId: 'pos', text: '    k = cur[M.data[t].j];                            /* 列 j 当前写到哪里 */' },
    { lineId: 'put', text: '    T->data[k] = { M.data[t].j, M.data[t].i, M.data[t].v };' },
    { lineId: 'advance', text: '    ++cur[M.data[t].j];' },
    { lineId: 'rowloop-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '2×3 稀疏矩阵 {(0,2,5)、(1,0,7)} → 3×2',
    input: { rows: 2, cols: 3, triples: [[0, 2, 5], [1, 0, 7]] },
    expect: { rows: 3, cols: 2, triples: [[0, 1, 7], [2, 0, 5]] },
  },
  {
    id: 'normal-dup-col',
    label: '3×3 里第 1 列有两个非零元（同一列落位要连续）',
    input: { rows: 3, cols: 3, triples: [[0, 1, 4], [1, 1, 6], [2, 0, 8]] },
    expect: { rows: 3, cols: 3, triples: [[0, 2, 8], [1, 0, 4], [1, 1, 6]] },
  },
  {
    id: 'edge-empty',
    label: '3×0 空矩阵（只交换尺寸，三元组表为空）',
    input: { rows: 3, cols: 0, triples: [] },
    expect: { rows: 0, cols: 3, triples: [] },
  },
  {
    id: 'edge-single',
    label: '1×1 单元素 {(0,0,9)}（转置后还是它自己）',
    input: { rows: 1, cols: 1, triples: [[0, 0, 9]] },
    expect: { rows: 1, cols: 1, triples: [[0, 0, 9]] },
  },
];

/* ------------------------------------------------------------------ 输入归一化 */

/** 只保留落在 rows×cols 之内的三元组；越界的直接丢弃并记账（不让一行脏数据毁掉整条轨迹） */
function normInput(input) {
  const rows = Number.isInteger(input.rows) && input.rows > 0 ? input.rows : 0;
  const cols = Number.isInteger(input.cols) && input.cols > 0 ? input.cols : 0;
  const raw = Array.isArray(input.triples) ? input.triples : [];
  const triples = [];
  let dropped = 0;
  for (const t of raw) {
    if (!Array.isArray(t) || t.length < 3) { dropped += 1; continue; }
    const [i, j, v] = t;
    if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= rows || j >= cols) {
      dropped += 1;
      continue;
    }
    triples.push([i, j, v]);
  }
  return { rows, cols, triples, dropped };
}

/* ------------------------------------------------------------------ 图层快照 */

/**
 * 每步完整重建三个表格层。所有 values / 行都是新数组（校验器会查"快照不独立"）。
 * @param {object} ctx { rows, cols, inT, outGrid, auxRows, auxLabels }
 * @param {object} r   角色：{ main, out, aux, mainText, outText, auxText }
 */
function snap(ctx, r = {}) {
  const { rows, cols, inT, outGrid, auxRows, auxLabels } = ctx;
  return [
    gridLayer({
      id: 'main',
      title: `原矩阵 ${rows}×${cols}`,
      name: `三元组表 M（行序存储）· terms = ${inT.length}`,
      values: inT.map((t) => [t[0], t[1], t[2]]),
      rowLabels: inT.map((_, i) => String(i)),
      colLabels: ['i', 'j', 'v'],
      triples: r.mainText || '',
      roles: r.main || {},
    }),
    gridLayer({
      id: 'out',
      title: `转置后 ${cols}×${rows}`,
      name: `三元组表 T（行 = 原列）· rows/cols 已互换`,
      values: outGrid.map((t) => [...t]),
      rowLabels: outGrid.map((_, i) => String(i)),
      colLabels: ['i', 'j', 'v'],
      triples: r.outText || '',
      roles: r.out || {},
    }),
    gridLayer({
      id: 'aux',
      title: '辅助数组',
      name: auxLabels.join(' / '),
      values: auxRows.map((row) => [...row]),
      rowLabels: [...auxLabels],
      colLabels: Array.from({ length: cols }, (_, c) => String(c)),
      triples: r.auxText || '列号 → 数组下标',
      roles: r.aux || {},
    }),
  ];
}

/** 辅助层里"第 row 行第 col 列"这格的键（26 个渲染器统一用 "行,列"） */
const cell = (row, col) => `${row},${col}`;

/** 输出表整行高亮用：写第 k 个三元组 = 点亮 out 的第 k 行三格 */
const rowCells = (k) => [cell(k, 0), cell(k, 1), cell(k, 2)];

/** 结果：只取真正写过数字的行（占位 '·' 不算） */
function resultOf(ctx) {
  const { rows, cols, outGrid } = ctx;
  return {
    rows: cols,
    cols: rows,
    triples: outGrid.filter((t) => typeof t[0] === 'number').map((t) => [t[0], t[1], t[2]]),
  };
}

/* ------------------------------------------------------------------ 变体 1（快速转置） */

function runV1(input) {
  const { rows, cols, triples, dropped } = normInput(input);
  const terms = triples.length;
  const L = LINES.v1;
  const steps = [];

  const ctx = {
    rows, cols, inT: triples,
    outGrid: Array.from({ length: terms }, () => ['·', '·', '·']),
    auxRows: [new Array(cols).fill(0), new Array(cols).fill('·')],
    auxLabels: ['num', 'cpot'],
  };
  const [num, cpot] = ctx.auxRows;
  const V = (extra) => ({ rows, cols, terms, ...extra });

  steps.push(step({
    event: 'init', lineId: 'swap',
    note: terms === 0
      ? `空矩阵：terms = 0，转置只做一件事——把尺寸 ${rows}×${cols} 换成 ${cols}×${rows}，三元组表一格都不写。${dropped ? `（另外丢弃了 ${dropped} 个越界三元组）` : ''}`
      : `${rows}×${cols} 的稀疏矩阵有 ${terms} 个非零元，按行序存成三元组。转置的第一步只是换尺寸：输出是 ${cols}×${rows}，下面两张表分别是要读的 M 和将写入的 T。${dropped ? `（丢弃了 ${dropped} 个越界三元组）` : ''}`,
    vars: V({ t: null, col: null, pos: null, written: 0 }),
    layers: snap(ctx, {
      mainText: `当前三元组 ${terms} 个`,
      outText: terms ? `预分配 ${terms} 行，全部占位 ·` : 'Terms = 0',
    }),
  }));

  // 第 1 遍：列计数
  for (let t = 0; t < terms; t++) {
    const [i, j, v] = triples[t];
    num[j] += 1;
    steps.push(step({
      event: 'count-column', lineId: 'count',
      note: `第 1 遍扫描：三元组 ${t} = (${i},${j},${v})，它的列号是 ${j}，所以 num[${j}] 变成 ${num[j]}。这一遍只看列号、不写输出——先摸清"每列有几个"，后面才敢一次算好落点。`,
      vars: V({ t, col: j, num_j: num[j], pos: null, written: 0 }),
      layers: snap(ctx, {
        main: { focus1: [cell(t, 1)] },
        aux: { focus1: [cell(0, j)] },
        mainText: `t = ${t}：读第 ${j} 列`,
        outText: '还没开始写',
        auxText: `num[${j}] = ${num[j]}`,
      }),
    }));
  }

  // 前缀和：起始写入位置
  if (cols > 0) {
    cpot[0] = 0;
    steps.push(step({
      event: 'prefix-start', lineId: 'cpot0',
      note: `第 0 列前面没有别的列，所以它的起始写入位置 cpot[0] = 0（用 0 基下标，就是输出表的第 0 行）。`,
      vars: V({ t: null, col: 0, cpot: 0, written: 0 }),
      layers: snap(ctx, {
        aux: { added: [cell(1, 0)], focus1: [cell(0, 0)] },
        mainText: `num = [${num.join(', ')}]`,
        outText: '等待落位',
        auxText: `cpot[0] = 0`,
      }),
    }));
    for (let c = 1; c < cols; c++) {
      cpot[c] = cpot[c - 1] + num[c - 1];
      steps.push(step({
        event: 'prefix-start', lineId: 'prefix-add',
        note: `前缀和：cpot[${c}] = cpot[${c - 1}] + num[${c - 1}] = ${cpot[c - 1]} + ${num[c - 1]} = ${cpot[c]}。意思是"列 ${c} 的第一个元素要写到输出第 ${cpot[c]} 行"，因为列 ${c} 前面那些列一共占了 ${cpot[c]} 行。`,
        vars: V({ t: null, col: c, cpot: cpot[c], written: 0 }),
        layers: snap(ctx, {
          aux: { added: [cell(1, c)], focus1: [cell(0, c - 1)], focus2: [cell(1, c - 1)] },
          mainText: `num = [${num.join(', ')}]`,
          outText: '起点算好，可以落位了',
          auxText: `cpot[${c}] = ${cpot[c]}`,
        }),
      }));
    }
  }

  // 第 2 遍：按原行序落位
  for (let t = 0; t < terms; t++) {
    const [i, j, v] = triples[t];
    const k = cpot[j];
    ctx.outGrid[k] = [j, i, v];
    cpot[j] = k + 1;
    const written = t + 1;
    steps.push(step({
      event: 'write-triple', lineId: 'put',
      note: `第 2 遍扫描：三元组 ${t} = (${i},${j},${v}) 行列互换成 (${j},${i},${v})，写到 cpot[${j}] = ${k} 号位；随后 cpot[${j}] 变成 ${k + 1}，下一次同列的三元组就接着往后放。因为按原行序遍历，输出天然按"原列"（= 新行）升序。`,
      vars: V({ t, col: j, pos: k, written }),
      layers: snap(ctx, {
        main: { focus1: rowCells(t) },
        out: { added: rowCells(k) },
        aux: { focus2: [cell(1, j)] },
        mainText: `t = ${t}：(${i},${j},${v})`,
        outText: `已写 ${written} / ${terms} 个`,
        auxText: `cpot[${j}] ${k} → ${k + 1}`,
      }),
    }));
    steps.push(step({
      event: 'write-triple', lineId: 'advance',
      note: `列 ${j} 的游标前移：cpot[${j}] = ${k + 1}。行 ${k} 已填满，列 ${j} 剩下的元素排在它后面——同一列的相对顺序（原行序）被保住了。`,
      vars: V({ t, col: j, pos: k + 1, written }),
      layers: snap(ctx, {
        out: { done: rowCells(k) },
        aux: { added: [cell(1, j)] },
        mainText: `已处理 ${t + 1} / ${terms}`,
        outText: `已写 ${written} / ${terms} 个`,
        auxText: `cpot[${j}] = ${cpot[j]}`,
      }),
    }));
  }

  const result = resultOf(ctx);
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: terms === 0
      ? `转置完成：${rows}×${cols} → ${cols}×${rows}，terms 仍然是 0。尺寸必须跟着换，否则"行列互换"只做了一半。`
      : `转置完成：输出 ${cols}×${rows}，三元组 ${JSON.stringify(result.triples)}。全程两遍扫描（数一遍、写一遍）+ 一趟 cols 长前缀和，所以是 O(cols + terms)。`,
    vars: V({ t: null, col: null, pos: null, written: terms }),
    layers: snap(ctx, {
      out: { done: ctx.outGrid.map((_, k) => rowCells(k)).flat() },
      mainText: `共 ${terms} 个非零元`,
      outText: `已写 ${terms} / ${terms} 个`,
      auxText: '两遍扫描结束',
    }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'sparse-transpose-fast-v1',
    lines: L, steps, result, meta: { terms },
  });
}

/* ------------------------------------------------------------------ 变体 2（按列扫描的简单转置） */

function runV2(input) {
  const { rows, cols, triples, dropped } = normInput(input);
  const terms = triples.length;
  const L = LINES.v2;
  const steps = [];

  const ctx = {
    rows, cols, inT: triples,
    outGrid: [],                                 // v2 不预分配：命中一个追加一个
    auxRows: [new Array(cols).fill(0)],
    auxLabels: ['本轮命中数'],
  };
  const [hitArr] = ctx.auxRows;
  const V = (extra) => ({ rows, cols, terms, ...extra });

  steps.push(step({
    event: 'init', lineId: 'q-init',
    note: terms === 0
      ? `空矩阵：terms = 0，${cols} 个列循环全都会扫空，输出表从头到尾是空的，只有尺寸被换成 ${cols}×${rows}。${dropped ? `（丢弃了 ${dropped} 个越界三元组）` : ''}`
      : `尺寸先互换：输出 ${cols}×${rows}。这一版不预先算位置，输出表从 0 行开始，靠 q 一直往后追加。接下来外层要走 ${cols} 列，每列都把 ${terms} 个三元组从头比一遍——总共 ${cols * terms} 次比较。${dropped ? `（丢弃了 ${dropped} 个越界三元组）` : ''}`,
    vars: V({ c: null, t: null, q: 0, hits: 0 }),
    layers: snap(ctx, {
      mainText: `当前三元组 ${terms} 个`,
      outText: '输出表为空，边扫边追加',
      auxText: 'v2 不需要 num/cpot 定位',
    }),
  }));

  let q = 0;
  for (let c = 0; c < cols; c++) {
    steps.push(step({
      event: 'count-column', lineId: 'col',
      note: `外层：开始处理列 ${c}。v2 的思路最直白——"转置后第 ${c} 行的元素，就是原矩阵第 ${c} 列的非零元"，那就对着整个三元组表找列号为 ${c} 的。`,
      vars: V({ c, t: null, q, hits: hitArr[c] }),
      layers: snap(ctx, {
        aux: { focus1: [cell(0, c)] },
        mainText: `扫列 ${c}`,
        outText: `已追加 ${q} 行`,
        auxText: `列 ${c} 命中数 ${hitArr[c]}`,
      }),
    }));

    for (let t = 0; t < terms; t++) {
      const [i, j, v] = triples[t];
      if (j === c) {
        hitArr[c] += 1;
        const k = q;
        ctx.outGrid.push([c, i, v]);
        q += 1;
        steps.push(step({
          event: 'write-triple', lineId: 'append',
          note: `命中：三元组 ${t} 的列号正好是 ${c}，行列互换得 (${c},${i},${v})，直接追加到输出第 ${k} 行。注意位置不是算出来的，是"扫到第几个命中就放第几行"。`,
          vars: V({ c, t, q, row: k, hits: hitArr[c] }),
          layers: snap(ctx, {
            main: { focus1: rowCells(t) },
            out: { added: rowCells(k) },
            aux: { added: [cell(0, c)] },
            mainText: `(${i},${j},${v}) 的列 = ${c}，命中`,
            outText: `已追加 ${q} 行`,
            auxText: `列 ${c} 命中 ${hitArr[c]} 个`,
          }),
        }));
      } else {
        steps.push(step({
          event: 'count-column', lineId: 'test',
          note: `空跑一次：三元组 ${t} 的列号是 ${j} ≠ ${c}，continue 跳过。这一版每个列循环都要把 ${terms} 个三元组比一遍，${cols} 列就是 ${cols * terms} 次比较——快速转置正是把这块消掉的。`,
          vars: V({ c, t, q, hits: hitArr[c] }),
          layers: snap(ctx, {
            main: { focus2: [cell(t, 1)] },
            out: { done: Array.from({ length: q }, (_, k) => rowCells(k)).flat() },
            aux: { focus1: [cell(0, c)] },
            mainText: `(${i},${j},${v}) 的列 ≠ ${c}，跳过`,
            outText: `已追加 ${q} 行`,
            auxText: `列 ${c} 命中 ${hitArr[c]} 个`,
          }),
        }));
      }
    }

    steps.push(step({
      event: 'count-column', lineId: 'col-end',
      note: hitArr[c] === 0
        ? `列 ${c} 扫完：一个都没命中，输出表一点没动，下一列仍然从第 ${q} 行开始写。空列照样要跑满 ${terms} 次比较——这也是简单转置的浪费之一。`
        : `列 ${c} 扫完：命中 ${hitArr[c]} 个，被连续写在输出第 ${q - hitArr[c]} ~ ${q - 1} 行（连续是因为追加位置一直跟着 q 走）。下一列从第 ${q} 行开始。`,
      vars: V({ c, t: null, q, hits: hitArr[c] }),
      layers: snap(ctx, {
        out: { done: Array.from({ length: q }, (_, k) => rowCells(k)).flat() },
        aux: { focus1: [cell(0, c)] },
        mainText: `列 ${c} 处理完`,
        outText: `已追加 ${q} 行`,
        auxText: `列 ${c} 命中 ${hitArr[c]} 个`,
      }),
    }));
  }

  const result = resultOf(ctx);
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: terms === 0
      ? `转置完成：${rows}×${cols} → ${cols}×${rows}，输出三元组表为空。`
      : `转置完成：输出 ${cols}×${rows}，三元组 ${JSON.stringify(result.triples)}。因为外层是列号升序，输出自然按新行升序排列（与快速转置结果一致），代价是 ${cols} × ${terms} = ${cols * terms} 次比较。`,
    vars: V({ c: null, t: null, q, hits: null }),
    layers: snap(ctx, {
      out: { done: Array.from({ length: q }, (_, k) => rowCells(k)).flat() },
      mainText: `共 ${terms} 个非零元`,
      outText: `已追加 ${q} 行`,
      auxText: `${cols} × ${terms} = ${cols * terms} 次比较`,
    }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'sparse-transpose-scan-v1',
    lines: L, steps, result, meta: { terms, compares: cols * terms },
  });
}

/* ------------------------------------------------------------------ 变体 3（行逻辑链接版） */

function runV3(input) {
  const { rows, cols, triples, dropped } = normInput(input);
  const terms = triples.length;
  const L = LINES.v3;
  const steps = [];

  const ctx = {
    rows, cols, inT: triples,
    outGrid: Array.from({ length: terms }, () => ['·', '·', '·']),
    auxRows: [new Array(cols).fill(0), new Array(cols).fill('·'), new Array(cols).fill('·')],
    auxLabels: ['num', 'rpos', 'cur'],
  };
  const [num, rpos, cur] = ctx.auxRows;
  const V = (extra) => ({ rows, cols, terms, ...extra });

  steps.push(step({
    event: 'init', lineId: 'swap',
    note: terms === 0
      ? `空矩阵：terms = 0，尺寸照样 ${rows}×${cols} → ${cols}×${rows}，num / rpos / cur 三行都是 0 或空。${dropped ? `（丢弃了 ${dropped} 个越界三元组）` : ''}`
      : `尺寸互换 → 输出 ${cols}×${rows}。这一版比 v1 多维护一个 cur[] 游标：rpos[] 是"每列的起点"，cur[] 是"这一列现在写到哪"，写入阶段再按原矩阵的行遍历。${dropped ? `（丢弃了 ${dropped} 个越界三元组）` : ''}`,
    vars: V({ t: null, r: null, col: null, k: null, written: 0 }),
    layers: snap(ctx, {
      mainText: `行序存储：第 r 行的三元组是连续的一段`,
      outText: terms ? `预分配 ${terms} 行占位` : 'Terms = 0',
      auxText: 'num 计数 / rpos 起点 / cur 游标',
    }),
  }));

  // 列计数
  for (let t = 0; t < terms; t++) {
    const [i, j, v] = triples[t];
    num[j] += 1;
    steps.push(step({
      event: 'count-column', lineId: 'count',
      note: `计数：三元组 ${t} = (${i},${j},${v}) 落在列 ${j}，num[${j}] → ${num[j]}。列 ${j} 的非零元个数就是转置后第 ${j} 行的长度。`,
      vars: V({ t, r: i, col: j, k: null, written: 0 }),
      layers: snap(ctx, {
        main: { focus1: [cell(t, 1)] },
        aux: { focus1: [cell(0, j)] },
        mainText: `t = ${t}：行 ${i} 列 ${j}`,
        outText: '等待起点算完',
        auxText: `num[${j}] = ${num[j]}`,
      }),
    }));
  }

  // rpos / cur 起点
  if (cols > 0) {
    rpos[0] = 0;
    cur[0] = 0;
    steps.push(step({
      event: 'prefix-start', lineId: 'rpos0',
      note: `rpos[0] = 0，并把游标 cur[0] 也置 0。区分 rpos 与 cur 是这一版的关键：rpos 算完就固定不动（"这列从哪开始"），cur 会随写入一路增长。`,
      vars: V({ t: null, r: null, col: 0, rpos: 0, written: 0 }),
      layers: snap(ctx, {
        aux: { added: [cell(1, 0), cell(2, 0)], focus1: [cell(0, 0)] },
        mainText: `num = [${num.join(', ')}]`,
        outText: '等待落位',
        auxText: 'rpos[0] = cur[0] = 0',
      }),
    }));
    for (let c = 1; c < cols; c++) {
      rpos[c] = rpos[c - 1] + num[c - 1];
      cur[c] = rpos[c];
      steps.push(step({
        event: 'prefix-start', lineId: 'cur-init',
        note: `rpos[${c}] = rpos[${c - 1}] + num[${c - 1}] = ${rpos[c - 1]} + ${num[c - 1]} = ${rpos[c]}，cur[${c}] 同步设为 ${cur[c]}。于是"列 ${c} 的数据写进输出第 ${rpos[c]} 行起的连续位置"。`,
        vars: V({ t: null, r: null, col: c, rpos: rpos[c], written: 0 }),
        layers: snap(ctx, {
          aux: { added: [cell(1, c), cell(2, c)], focus1: [cell(0, c - 1)], focus2: [cell(1, c - 1)] },
          mainText: `num = [${num.join(', ')}]`,
          outText: '起点与游标都就绪',
          auxText: `rpos[${c}] = cur[${c}] = ${rpos[c]}`,
        }),
      }));
    }
  }

  // 按行遍历写入
  let written = 0;
  for (let r = 0; r < rows; r++) {
    const group = [];
    for (let t = 0; t < terms; t++) if (triples[t][0] === r) group.push(t);
    if (group.length === 0) continue;
    const start = group[0];
    const end = group[group.length - 1] + 1;
    steps.push(step({
      event: 'prefix-start', lineId: 'rowrange',
      note: `行逻辑链接给出第 ${r} 行的三元组区间 [${start},${end})（${end - start} 个），所以按行遍历不用再扫全表：取到区间里每一个 t，就能直接算它该落到输出哪一行。`,
      vars: V({ t: start, r, col: null, k: null, written, range: `[${start},${end})` }),
      layers: snap(ctx, {
        main: { focus1: group.flatMap((t) => rowCells(t)) },
        out: { done: Array.from({ length: written }, (_, k) => rowCells(k)).flat() },
        mainText: `第 ${r} 行 = 三元组 [${start},${end})`,
        outText: `已写 ${written} / ${terms} 个`,
        auxText: '按行区间取 t',
      }),
    }));

    for (const t of group) {
      const [i, j, v] = triples[t];
      const k = cur[j];
      ctx.outGrid[k] = [j, i, v];
      cur[j] = k + 1;
      written += 1;
      steps.push(step({
        event: 'write-triple', lineId: 'put',
        note: `(${i},${j},${v}) → (${j},${i},${v})：列 ${j} 的游标 cur[${j}] = ${k}，写进输出第 ${k} 行。rpos[${j}] 始终是 ${rpos[j]} 不动，动的是 cur[${j}]。`,
        vars: V({ t, r, col: j, k, written }),
        layers: snap(ctx, {
          main: { focus1: rowCells(t) },
          out: { added: rowCells(k) },
          aux: { focus1: [cell(1, j)], focus2: [cell(2, j)] },
          mainText: `第 ${r} 行 t = ${t}`,
          outText: `已写 ${written} / ${terms} 个`,
          auxText: `cur[${j}] ${k} → ${k + 1}`,
        }),
      }));
      steps.push(step({
        event: 'write-triple', lineId: 'advance',
        note: `cur[${j}] = ${k + 1}。因为外层是"行号升序"、同一个 t 只会被访问一次，输出每一行内部也是原来的行序，所以整个输出按新行（原列）有序。`,
        vars: V({ t, r, col: j, k: k + 1, written }),
        layers: snap(ctx, {
          out: { done: rowCells(k) },
          aux: { added: [cell(2, j)] },
          mainText: `第 ${r} 行处理中`,
          outText: `已写 ${written} / ${terms} 个`,
          auxText: `cur[${j}] = ${cur[j]}`,
        }),
      }));
    }
  }

  const result = resultOf(ctx);
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: terms === 0
      ? `转置完成：${rows}×${cols} → ${cols}×${rows}，没有非零元可写，三行辅助数组也就没被真正用到。`
      : `转置完成：输出 ${cols}×${rows}，三元组 ${JSON.stringify(result.triples)}。num → rpos/cur 一趟，按行区间写入一趟，仍是 O(cols + terms)，但写入顺序由"行逻辑链接"决定，不再依赖三元组表里的全局顺序。`,
    vars: V({ t: null, r: null, col: null, k: null, written: terms }),
    layers: snap(ctx, {
      out: { done: ctx.outGrid.map((_, k) => rowCells(k)).flat() },
      mainText: `共 ${terms} 个非零元`,
      outText: `已写 ${terms} / ${terms} 个`,
      auxText: 'rpos 固定、cur 走到尾',
    }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'sparse-transpose-rowlink-v1',
    lines: L, steps, result, meta: { terms },
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
