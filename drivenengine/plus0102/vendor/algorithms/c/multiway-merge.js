/**
 * C · 多路平衡归并（3 个代表性不同实现）
 *
 * 输入：input.runs = [[…], […]] —— 若干**各自有序**的段；input.k = 每次最多取几段归并。
 * 输出：result.array = 归并后的整体有序序列；result.runs = 最终的段列表。
 *
 * 三个变体的差别在"每趟怎么把段数降下来"，所以画面上的趟次、段号、游标、候选都不一样：
 *   v1 二路逐对归并 —— 固定二路，每趟相邻两两配对，一趟之后段数 ceil(m/2)；
 *   v2 k 路一次归并 —— 每批最多 k 段，每次在 k 个当前首项里**线性扫描**挑最小；
 *   v3 败者树版     —— 同样 k 路，但用败者树把"挑最小"降到 O(log k)：冠军浮到根，
 *                      内部结点只记败者；输出冠军后只重赛它到根的那 log k 场。
 *
 * 单段输入的约定（见 sample edge-single-run）：**一段有序段直接作为结果，不重新排序**。
 * 归并的前提是"输入段已有序"，为了过校验把 [3,1] 悄悄排成 [1,3] 会把前提藏起来，
 * 所以 v1/v2/v3 都原样输出 [3,1]，并在每一步的 note 里说明"单段直通、不做比较"。
 *
 * 图层（每步完整重建；step 0 的图层 id 决定播放器开几张画布）：
 *   out style 1 —— 本段/本趟的输出数组（绿 = 已落位，蓝 = 本步新增）；
 *   seg style 3 —— 段游标层：每段一个结点，格子是「当前首项 cur | 其余剩余」，
 *                  指针 chip 写着 i / j / 取这个 / 冠军，不靠颜色单独表达信息。
 */

import { trace, step, arrayLayer, treeLayer, heapLayer, linkLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'c/multiway-merge',
  variants: [
    { id: 'v1', name: '二路逐对归并', note: '每趟把相邻两段归并成一段，展示段数逐趟减半' },
    { id: 'v2', name: 'k 路一次归并', note: '每批取 k 段，每次在 k 个当前首项里线性挑最小输出' },
    { id: 'v3', name: '败者树版', note: '用败者树在 O(log k) 内选出最小首项，展示内部结点与冠军' },
  ],
};

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void two_way_merge(Run runs[], int m) {' },
    { lineId: 'guard', text: '  if (m <= 1) return runs;                /* 单段：直接作为结果 */' },
    { lineId: 'pass', text: '  for (int p = 1; m > 1; ++p) {            /* 每趟段数至少减半 */' },
    { lineId: 'cursor', text: '    int i = 0, j = 0;                    /* 两段游标归零 */' },
    { lineId: 'while', text: '    while (i < len(Rs) && j < len(Rt)) {' },
    { lineId: 'take-a', text: '      if (Rs[i] <= Rt[j]) out[k++] = Rs[i++];   /* 取左段首项 */' },
    { lineId: 'take-b', text: '      else                out[k++] = Rt[j++];   /* 取右段首项 */' },
    { lineId: 'drain', text: '    while (i < len(Rs)) out[k++] = Rs[i++];     /* 另一段耗尽，直接续接 */' },
    { lineId: 'tail', text: '    if (m % 2) next[t++] = runs[m - 1];         /* 奇数段：末段直通下一趟 */' },
    { lineId: 'pass-end', text: '    runs = next; m = (m + 1) / 2;               /* 段数减半 */' },
    { lineId: 'end', text: '  }   /* 只剩 1 段 → 整体有序 */' },
  ],
  v2: [
    { lineId: 'fn', text: 'void k_way_merge(Run runs[], int m, int k) {' },
    { lineId: 'guard', text: '  if (m <= 1) return runs;                  /* 单段：直接作为结果 */' },
    { lineId: 'pass', text: '  while (m > 1) {                           /* 每趟段数缩到 ceil(m / k) */' },
    { lineId: 'batch', text: '    for (int s = 0; s < m; s += k) {        /* 每批最多取 k 段 */' },
    { lineId: 'seg-init', text: '      int cur[k] = {0};                   /* k 个游标各自归零 */' },
    { lineId: 'scan', text: '      while (1) {' },
    { lineId: 'scan2', text: '        /* 线性扫描：候选 R[t] 不更小 → 当前最小不动 */' },
    { lineId: 'scan3', text: '        best = R[t];                      /* 候选更小 → 换最小候选 */' },
    { lineId: 'empty', text: '        if (best 不存在) break;            /* 本批 k 段全部耗尽 */' },
    { lineId: 'emit', text: '        out[t++] = runs[best][cur[best]++];   /* 输出最小首项 */' },
    { lineId: 'pass-end', text: '    }  runs = next; m = ceil(m / k);' },
    { lineId: 'end', text: '  }   /* 只剩 1 段 → 整体有序 */' },
  ],
  v3: [
    { lineId: 'fn', text: 'void loser_tree_merge(Run runs[], int m, int k) {' },
    { lineId: 'guard', text: '  if (m <= 1) return runs;                    /* 单段：直接作为结果 */' },
    { lineId: 'pass', text: '  while (m > 1) {' },
    { lineId: 'batch', text: '    for (int s = 0; s < m; s += k) {          /* 每批最多取 k 段 */' },
    { lineId: 'build', text: '      build_loser_tree(ls, runs + s, k);      /* 叶子 = 段，内部结点存败者 */' },
    { lineId: 'build-cmp', text: '      /* 自底向上每场：胜者上浮，败者写进该内部结点 */' },
    { lineId: 'champ', text: '      while ((w = champion(ls)) != NONE) {    /* 冠军 = 最小首项 */' },
    { lineId: 'match', text: '        adjust(ls, w, next_value);            /* 只重赛 w→根的 log k 场 */' },
    { lineId: 'emit', text: '        out[t++] = value_of(w);               /* 输出冠军 */' },
    { lineId: 'pass-end', text: '    }  runs = next; m = ceil(m / k);' },
    { lineId: 'end', text: '  }   /* 只剩 1 段 → 整体有序 */' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

export const samples = [
  {
    id: 'normal',
    label: '[[1,4],[2,3],[0,5]] k=2（三小段，两趟归并）',
    input: { runs: [[1, 4], [2, 3], [0, 5]], k: 2 },
    expect: { array: [0, 1, 2, 3, 4, 5], runs: [[0, 1, 2, 3, 4, 5]] },
  },
  {
    id: 'edge-empty-run',
    label: '[[],[2],[1]] k=2（含空段：空段不产生输出）',
    input: { runs: [[], [2], [1]], k: 2 },
    expect: { array: [1, 2], runs: [[1, 2]] },
  },
  {
    id: 'edge-single-run',
    label: '[[3,1]] k=2（只有一段：直接作为结果，不重排）',
    input: { runs: [[3, 1]], k: 2 },
    expect: { array: [3, 1], runs: [[3, 1]] },
  },
  {
    id: 'wide-k',
    label: '[[1,4],[2,3],[0,5]] k=3（k 路一次取满 3 段）',
    input: { runs: [[1, 4], [2, 3], [0, 5]], k: 3 },
    expect: { array: [0, 1, 2, 3, 4, 5], runs: [[0, 1, 2, 3, 4, 5]] },
  },
];

/* ------------------------------------------------------------------ 公用小工具 */

const idx = (n) => Array.from({ length: n }, (_, i) => i);
const copyRuns = (list) => list.map((r) => [...r]);

/** 段游标层的结点：一格 = 「当前首项 cur | 其余剩余」，badge 用文字写清段号与游标位置 */
function segsOf(runList, cursors, prefix) {
  const segs = runList.map((r, i) => {
    const c = cursors[i] ?? 0;
    const empty = c >= r.length;
    return {
      id: `${prefix}r${i}`,
      label: `R${i}`,
      cur: empty ? '—' : String(r[c]),
      rem: empty ? '(已空)' : r.slice(c + 1).map(String).join(',') || '(尾)',
      fields: [{ name: 'cur' }, { name: 'rem' }],
      badge: `R${i} · i=${c}`,
    };
  });
  const done = segs.filter((s, i) => (cursors[i] ?? 0) >= runList[i].length).map((s) => s.id);
  return { segs, done };
}

function segLayer({ title, segs, roles = {} }) {
  return linkLayer({
    id: 'seg',
    title,
    name: '段游标层（左格 cur = 当前首项，右格 = 其余剩余；badge 写段号与游标）',
    order: segs.map((s) => s.id),
    nodes: segs,
    roles,
  });
}

function outLayer(values, roles = {}, title = '输出 OUT[]', name = '归并输出（本段）') {
  return arrayLayer({ id: 'out', title, name, values: [...values], labels: labelsOf(values), roles });
}

const guardPack = (runs) => segsOf(runs, runs.map(() => 0), 'p0');
const tailPack = (runs, pass) => segsOf(runs, runs.map(() => 0), pass === 0 ? 'p0' : `p${pass + 1}`);

/* ------------------------------------------------------------------ 变体 1：二路逐对归并 */

function runV1(input) {
  const L = LINES.v1;
  let runs = copyRuns((input.runs || []).map((r) => r.map(Number)));
  let cursors = runs.map(() => 0);
  const steps = [];
  let pass = 0;
  let cmp = 0;
  let emitted = 0;

  const vars = (extra = {}) => ({ pass, segs: runs.length, out: emitted, cmp, ...extra });

  const head = guardPack(runs);
  steps.push(step({
    event: 'init', lineId: 'fn',
    note: runs.length === 0
      ? '没有输入段：归并结果为空。'
      : `共 ${runs.length} 段（${runs.map((r) => r.length).join(' + ')} 个元素）。v1 固定二路：每趟相邻两段配对归并，一趟之后段数大致减半。`,
    vars: vars(),
    layers: [
      outLayer([], {}, '输出 OUT[]'),
      segLayer({ title: `初始 ${runs.length} 段（每段已各自有序）`, segs: head.segs }),
    ],
  }));

  if (runs.length <= 1) {
    const only = runs.length ? [...runs[0]] : [];
    const pack = guardPack(runs);
    steps.push(step({
      event: 'round-end', lineId: 'guard',
      note: runs.length === 0
        ? '没有段：不进入归并循环，结果为空。'
        : '只有 1 段：归并的前提是"输入段本身已有序"，所以直接把它当结果，一次比较都不做（[[3,1]] → [3,1]，不重新排序）。',
      vars: vars({ seg: runs.length ? 'R0' : null }),
      layers: [
        outLayer(only, { done: idx(only.length) }, '单段直通：结果就是这一段'),
        segLayer({ title: '单段：无需归并', segs: pack.segs, roles: { done: pack.done } }),
      ],
    }));
  } else {
    while (runs.length > 1) {
      pass += 1;
      const m = runs.length;
      const prefix = `p${pass}`;
      cursors = runs.map(() => 0);
      let passOut = [];
      const nextRuns = [];

      const segNow = (title, roles = {}) => {
        const pack = segsOf(runs, cursors, prefix);
        return segLayer({ title, segs: pack.segs, roles: { done: pack.done, ...roles } });
      };

      steps.push(step({
        event: 'pass', lineId: 'pass',
        note: `第 ${pass} 趟开始：${m} 段相邻两两配对，本趟结束只剩 ${Math.ceil(m / 2)} 段——二路归并的段数就是这样逐趟减半的。`,
        vars: vars(),
        layers: [
          outLayer([], {}, `第 ${pass} 趟输出 OUT[]`),
          segNow(`第 ${pass} 趟输入：${m} 段`),
        ],
      }));

      for (let pi = 0; pi < m; pi += 2) {
        const a = runs[pi];
        const b = pi + 1 < m ? runs[pi + 1] : null;
        const idA = `${prefix}r${pi}`;
        const idB = b ? `${prefix}r${pi + 1}` : null;

        if (!b) {
          cursors[pi] = a.length;
          nextRuns.push([...a]);
          steps.push(step({
            event: 'cursor', lineId: 'tail',
            note: `段数 ${m} 是奇数：R${pi} 没有配对段，原样直通下一趟——段内顺序不动，也不产生任何比较。`,
            vars: vars({ seg: `R${pi}` }),
            layers: [
              outLayer(passOut, { done: idx(passOut.length) }, `第 ${pass} 趟输出 OUT[]`),
              segNow(`R${pi} 直通下一趟（奇数段）`),
            ],
          }));
          continue;
        }

        cursors[pi] = 0;
        cursors[pi + 1] = 0;
        let i = 0;
        let j = 0;
        const merged = [];

        steps.push(step({
          event: 'cursor', lineId: 'cursor',
          note: `准备归并 R${pi}（${a.length} 项）与 R${pi + 1}（${b.length} 项）：两个游标 i、j 都归零，从各自首项开始比。`,
          vars: vars({ seg: `R${pi}+R${pi + 1}`, i: 0, j: 0 }),
          layers: [
            outLayer([], {}, `R${pi} / R${pi + 1} 归并中`),
            segNow(`第 ${pass} 趟：R${pi} 与 R${pi + 1} 逐项归并`, {
              focus1: [idA], focus2: [idB],
              pointers: [{ id: 'i', label: `i(R${pi})`, node: idA }, { id: 'j', label: `j(R${pi + 1})`, node: idB }],
            }),
          ],
        }));

        while (i < a.length && j < b.length) {
          cmp += 1;
          const takeA = a[i] <= b[j];
          const winId = takeA ? idA : idB;
          const loseId = takeA ? idB : idA;
          steps.push(step({
            event: 'compare', lineId: 'while',
            note: `比较 R${pi}[i]=${a[i]} 与 R${pi + 1}[j]=${b[j]}：${takeA ? `左边不大，取 ${a[i]}` : `右边更小，取 ${b[j]}`}（相等时取左段，稳定性来自这里）。`,
            vars: vars({ seg: `R${pi}+R${pi + 1}`, i, j }),
            layers: [
              outLayer(merged, { done: idx(merged.length) }, `R${pi} / R${pi + 1} 归并中`),
              segNow(`第 ${pass} 趟：R${pi} 与 R${pi + 1} 逐项归并`, {
                focus1: [loseId], focus2: [winId],
                pointers: [{ id: 'take', label: '取这个', node: winId }],
              }),
            ],
          }));
          const v = takeA ? a[i] : b[j];
          if (takeA) {
            i += 1;
            cursors[pi] = i;
          } else {
            j += 1;
            cursors[pi + 1] = j;
          }
          merged.push(v);
          passOut.push(v);
          emitted += 1;
          steps.push(step({
            event: 'emit', lineId: takeA ? 'take-a' : 'take-b',
            note: `把 ${v} 写到本段第 ${merged.length} 个位置（来自 R${takeA ? pi : pi + 1}），两段游标现在是 i=${i}、j=${j}。`,
            vars: vars({ seg: `R${pi}+R${pi + 1}`, i, j, last: v }),
            layers: [
              outLayer(merged, { added: [merged.length - 1], done: idx(merged.length - 1) }, `R${pi} / R${pi + 1} 归并中`),
              segNow(`第 ${pass} 趟：R${pi} 与 R${pi + 1} 逐项归并`, {
                pointers: [{ id: 'i', label: `i(R${pi})`, node: idA }, { id: 'j', label: `j(R${pi + 1})`, node: idB }],
              }),
            ],
          }));
        }

        while (i < a.length) {
          const v = a[i];
          i += 1;
          cursors[pi] = i;
          merged.push(v);
          passOut.push(v);
          emitted += 1;
          steps.push(step({
            event: 'emit', lineId: 'drain',
            note: `R${pi + 1} 已耗尽：R${pi} 剩下的 ${v} 直接续接到本段尾部，不需要再比较。`,
            vars: vars({ seg: `R${pi}+R${pi + 1}`, i, j, last: v }),
            layers: [
              outLayer(merged, { added: [merged.length - 1], done: idx(merged.length - 1) }, `R${pi} / R${pi + 1} 归并中`),
              segNow(`第 ${pass} 趟：右段已空，左段续接`, { excluded: [idB] }),
            ],
          }));
        }
        while (j < b.length) {
          const v = b[j];
          j += 1;
          cursors[pi + 1] = j;
          merged.push(v);
          passOut.push(v);
          emitted += 1;
          steps.push(step({
            event: 'emit', lineId: 'drain',
            note: `R${pi} 已耗尽：R${pi + 1} 剩下的 ${v} 直接续接到本段尾部，不需要再比较。`,
            vars: vars({ seg: `R${pi}+R${pi + 1}`, i, j, last: v }),
            layers: [
              outLayer(merged, { added: [merged.length - 1], done: idx(merged.length - 1) }, `R${pi} / R${pi + 1} 归并中`),
              segNow(`第 ${pass} 趟：左段已空，右段续接`, { excluded: [idA] }),
            ],
          }));
        }
        nextRuns.push(merged);
      }

      steps.push(step({
        event: 'round-end', lineId: 'pass-end',
        note: `第 ${pass} 趟结束：${m} 段归并成 ${nextRuns.length} 段（本趟共输出 ${passOut.length} 个元素，累计比较 ${cmp} 次）。`,
        vars: vars({ segs: nextRuns.length }),
        layers: [
          outLayer(passOut, { done: idx(passOut.length) }, `第 ${pass} 趟输出（${nextRuns.length} 段）`),
          segLayer({
            title: `第 ${pass} 趟产出 ${nextRuns.length} 段 → 下一趟的输入`,
            segs: segsOf(nextRuns, nextRuns.map(() => 0), `p${pass + 1}`).segs,
          }),
        ],
      }));

      runs = nextRuns;
      cursors = runs.map(() => 0);
      passOut = [];
    }
  }

  const finalArr = runs.length ? [...runs[0]] : [];
  const result = { array: finalArr, runs: copyRuns(runs) };
  const pack = tailPack(runs, pass);
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: finalArr.length === 0
      ? '归并完成：结果为空。'
      : `归并完成：${finalArr.join(', ')}（共 ${pass} 趟，比较 ${cmp} 次，输出 ${emitted} 个元素）。`,
    vars: vars({ segs: runs.length }),
    layers: [
      outLayer(finalArr, { done: idx(finalArr.length) }, '归并结果'),
      segLayer({ title: '归并结果：只剩 1 段', segs: pack.segs, roles: { done: pack.done } }),
    ],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'multiway-merge-two-way-v1',
    lines: L, steps, result, meta: { passes: pass, compares: cmp, emitted },
  });
}

/* ------------------------------------------------------------------ 变体 2：k 路一次归并 */

function runV2(input) {
  const L = LINES.v2;
  const k = Math.max(2, Number(input.k) || 2);
  let runs = copyRuns((input.runs || []).map((r) => r.map(Number)));
  let cursors = runs.map(() => 0);
  const steps = [];
  let pass = 0;
  let cmp = 0;
  let emitted = 0;

  const vars = (extra = {}) => ({ pass, segs: runs.length, k, out: emitted, cmp, ...extra });

  const head = guardPack(runs);
  steps.push(step({
    event: 'init', lineId: 'fn',
    note: runs.length === 0
      ? '没有输入段：归并结果为空。'
      : `共 ${runs.length} 段，k=${k}：每批最多取 ${k} 段，一趟之后段数缩到 ceil(${runs.length}/${k}) = ${Math.ceil(runs.length / k)}。`,
    vars: vars(),
    layers: [
      outLayer([], {}, '输出 OUT[]'),
      segLayer({ title: `初始 ${runs.length} 段（各自有序）`, segs: head.segs }),
    ],
  }));

  if (runs.length <= 1) {
    const only = runs.length ? [...runs[0]] : [];
    const pack = guardPack(runs);
    steps.push(step({
      event: 'round-end', lineId: 'guard',
      note: runs.length === 0
        ? '没有段：不进入归并循环，结果为空。'
        : '只有 1 段：k 路归并也要求"输入段已有序"，所以直接当结果输出，不比较、不重排（[[3,1]] → [3,1]）。',
      vars: vars({ seg: runs.length ? 'R0' : null }),
      layers: [
        outLayer(only, { done: idx(only.length) }, '单段直通：结果就是这一段'),
        segLayer({ title: '单段：无需归并', segs: pack.segs, roles: { done: pack.done } }),
      ],
    }));
  } else {
    while (runs.length > 1) {
      pass += 1;
      const m = runs.length;
      const prefix = `p${pass}`;
      cursors = runs.map(() => 0);
      const nextRuns = [];
      let passOut = [];

      const segNow = (title, roles = {}) => {
        const pack = segsOf(runs, cursors, prefix);
        return segLayer({ title, segs: pack.segs, roles: { done: pack.done, ...roles } });
      };

      steps.push(step({
        event: 'pass', lineId: 'pass',
        note: `第 ${pass} 趟开始：${m} 段按每批 k=${k} 分组，本趟结束只剩 ${Math.ceil(m / k)} 段。`,
        vars: vars(),
        layers: [
          outLayer([], {}, `第 ${pass} 趟输出 OUT[]`),
          segNow(`第 ${pass} 趟输入：${m} 段，每批 ${k} 段`),
        ],
      }));

      for (let s = 0; s < m; s += k) {
        const lo = s;
        const hi = Math.min(s + k, m);
        const batch = [];
        for (let t = lo; t < hi; t++) {
          batch.push({ runIdx: t, data: runs[t], c: 0 });
          cursors[t] = 0;
        }
        const batchTitle = `第 ${pass} 趟 · 本批 R${lo}…R${hi - 1}`;

        if (batch.length === 1) {
          const only = batch[0];
          only.c = only.data.length;
          cursors[only.runIdx] = only.c;
          nextRuns.push([...only.data]);
          steps.push(step({
            event: 'cursor', lineId: 'batch',
            note: `本批只有 R${lo} 一段（不够 k 段）：原样直通下一趟，不产生输出也不比较。`,
            vars: vars({ batch: `R${lo}` }),
            layers: [
              outLayer(passOut, { done: idx(passOut.length) }, `第 ${pass} 趟输出 OUT[]`),
              segNow(`${batchTitle}：单段直通`),
            ],
          }));
          continue;
        }

        const merged = [];
        steps.push(step({
          event: 'cursor', lineId: 'seg-init',
          note: `本批取 ${batch.length} 段：${batch.length} 个游标 cur[t] 全部归零，之后每输出一个元素就前移对应游标。`,
          vars: vars({ batch: `R${lo}…R${hi - 1}` }),
          layers: [
            outLayer([], {}, `本批输出（R${lo}…R${hi - 1}）`),
            segNow(`${batchTitle}：游标归零`, {
              focus1: batch.map((b) => `${prefix}r${b.runIdx}`),
              pointers: batch.map((b) => ({ id: `c${b.runIdx}`, label: `cur[R${b.runIdx}]`, node: `${prefix}r${b.runIdx}` })),
            }),
          ],
        }));

        for (;;) {
          let best = -1;
          for (let bi = 0; bi < batch.length; bi++) {
            const cand = batch[bi];
            if (cand.c >= cand.data.length) continue;
            if (best < 0) {
              best = bi;
              continue;
            }
            cmp += 1;
            const bestCand = batch[best];
            const candV = cand.data[cand.c];
            const bestV = bestCand.data[bestCand.c];
            const take = candV < bestV;
            steps.push(step({
              event: 'compare', lineId: take ? 'scan3' : 'scan2',
              note: `线性扫描第 ${bi + 1} 个候选：R${cand.runIdx}[${cand.c}]=${candV} vs 当前最小 R${bestCand.runIdx}[${bestCand.c}]=${bestV} — ${take ? `更小，最小候选换成 R${cand.runIdx}` : `不更小，最小候选仍是 R${bestCand.runIdx}`}。`,
              vars: vars({ batch: `R${lo}…R${hi - 1}`, min: `R${batch[best].runIdx}`, cand: `R${cand.runIdx}` }),
              layers: [
                outLayer(merged, { done: idx(merged.length) }, `本批输出（R${lo}…R${hi - 1}）`),
                segNow(`${batchTitle}：在 ${batch.length} 个首项里挑最小`, {
                  focus1: [take ? `${prefix}r${bestCand.runIdx}` : `${prefix}r${cand.runIdx}`],
                  focus2: [take ? `${prefix}r${cand.runIdx}` : `${prefix}r${bestCand.runIdx}`],
                }),
              ],
            }));
            if (take) best = bi;
          }
          if (best < 0) break;
          const bc = batch[best];
          const v = bc.data[bc.c];
          bc.c += 1;
          cursors[bc.runIdx] = bc.c;
          merged.push(v);
          passOut.push(v);
          emitted += 1;
          steps.push(step({
            event: 'emit', lineId: 'emit',
            note: `${batch.length} 个首项里 ${v} 最小（来自 R${bc.runIdx}）：输出到本段尾部，R${bc.runIdx} 的游标前进到 i=${bc.c}。`,
            vars: vars({ batch: `R${lo}…R${hi - 1}`, last: v, from: `R${bc.runIdx}` }),
            layers: [
              outLayer(merged, { added: [merged.length - 1], done: idx(merged.length - 1) }, `本批输出（R${lo}…R${hi - 1}）`),
              segNow(`${batchTitle}：输出 ${v}`, {
                focus1: [`${prefix}r${bc.runIdx}`],
                pointers: batch.map((b) => ({ id: `c${b.runIdx}`, label: `cur[R${b.runIdx}]`, node: `${prefix}r${b.runIdx}` })),
              }),
            ],
          }));
        }

        steps.push(step({
          event: 'cursor', lineId: 'empty',
          note: `本批 ${batch.length} 段全部耗尽：输出 ${merged.length} 个元素（${merged.join(', ')}），拼成下一趟的一段。`,
          vars: vars({ batch: `R${lo}…R${hi - 1}` }),
          layers: [
            outLayer(merged, { done: idx(merged.length) }, `本批输出（${merged.length} 项）`),
            segNow(`${batchTitle}：全部耗尽`),
          ],
        }));
        nextRuns.push(merged);
      }

      steps.push(step({
        event: 'round-end', lineId: 'pass-end',
        note: `第 ${pass} 趟结束：${m} 段 → ${nextRuns.length} 段。每趟段数除以 k=${k}，这就是 k 路平衡归并的"平衡"。`,
        vars: vars({ segs: nextRuns.length }),
        layers: [
          outLayer(passOut, { done: idx(passOut.length) }, `第 ${pass} 趟输出（${nextRuns.length} 段）`),
          segLayer({
            title: `第 ${pass} 趟产出 ${nextRuns.length} 段 → 下一趟的输入`,
            segs: segsOf(nextRuns, nextRuns.map(() => 0), `p${pass + 1}`).segs,
          }),
        ],
      }));

      runs = nextRuns;
      cursors = runs.map(() => 0);
      passOut = [];
    }
  }

  const finalArr = runs.length ? [...runs[0]] : [];
  const result = { array: finalArr, runs: copyRuns(runs) };
  const pack = tailPack(runs, pass);
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: finalArr.length === 0
      ? '归并完成：结果为空。'
      : `归并完成：${finalArr.join(', ')}（k=${k}，共 ${pass} 趟，线性扫描比较 ${cmp} 次）。`,
    vars: vars({ segs: runs.length }),
    layers: [
      outLayer(finalArr, { done: idx(finalArr.length) }, '归并结果'),
      segLayer({ title: '归并结果：只剩 1 段', segs: pack.segs, roles: { done: pack.done } }),
    ],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'multiway-merge-kway-v1',
    lines: L, steps, result, meta: { passes: pass, compares: cmp, k },
  });
}

/* ------------------------------------------------------------------ 变体 3：败者树 */

/**
 * 败者树的静态骨架：叶子 = 段，内部结点 = 一场比赛（只记败者）。
 * k 个叶子做单败淘汰正好 k-1 场，所以内部结点数 = k-1，路径长度 = ⌈log₂k⌉。
 */
function buildLoserTree(n) {
  let seq = 0;
  const build = (lo, hi) => {
    if (hi - lo === 1) return { kind: 'leaf', leaf: lo, id: `L${lo}`, kids: [] };
    const mid = lo + Math.ceil((hi - lo) / 2);
    const left = build(lo, mid);
    const right = build(mid, hi);
    return { kind: 'inner', id: `T${seq++}`, left, right, kids: [left, right] };
  };
  const root = n > 0 ? build(0, n) : null;
  const all = [];
  const walk = (node, parent) => {
    node.parent = parent;
    all.push(node);
    node.kids.forEach((kid) => walk(kid, node));
  };
  if (root) walk(root, null);
  const leafNode = new Map();
  for (const x of all) if (x.kind === 'leaf') leafNode.set(x.leaf, x);
  return { root, all, leafNode, inner: all.filter((x) => x.kind === 'inner'), leaves: all.filter((x) => x.kind === 'leaf') };
}

function runV3(input) {
  const L = LINES.v3;
  const k = Math.max(2, Number(input.k) || 2);
  let runs = copyRuns((input.runs || []).map((r) => r.map(Number)));
  const steps = [];
  let pass = 0;
  let cmp = 0;
  let emitted = 0;

  const vars = (extra = {}) => ({ pass, segs: runs.length, k, out: emitted, cmp, ...extra });

  const head = guardPack(runs);
  steps.push(step({
    event: 'init', lineId: 'fn',
    note: runs.length === 0
      ? '没有输入段：归并结果为空。'
      : `共 ${runs.length} 段，k=${k}。v3 与 v2 同为 k 路，但"挑最小"不靠线性扫描：每批 ${k} 段建一棵败者树，叶子是段，内部结点只记住这一场的败者，冠军浮到根。`,
    vars: vars(),
    layers: [
      outLayer([], {}, '输出 OUT[]'),
      segLayer({ title: `初始 ${runs.length} 段（各自有序）`, segs: head.segs }),
    ],
  }));

  if (runs.length <= 1) {
    const only = runs.length ? [...runs[0]] : [];
    const pack = guardPack(runs);
    steps.push(step({
      event: 'round-end', lineId: 'guard',
      note: runs.length === 0
        ? '没有段：不建树、不输出，结果为空。'
        : '只有 1 段：一个叶子的败者树没有对手，直接把它当结果（[[3,1]] → [3,1]），段内顺序原样保留。',
      vars: vars({ seg: runs.length ? 'R0' : null }),
      layers: [
        outLayer(only, { done: idx(only.length) }, '单段直通：结果就是这一段'),
        segLayer({ title: '单段：无需建败者树', segs: pack.segs, roles: { done: pack.done } }),
      ],
    }));
  } else {
    while (runs.length > 1) {
      pass += 1;
      const m = runs.length;
      const prefix = `p${pass}`;
      const nextRuns = [];
      let passOut = [];

      steps.push(step({
        event: 'pass', lineId: 'pass',
        note: `第 ${pass} 趟开始：${m} 段按每批 k=${k} 分组，本趟结束只剩 ${Math.ceil(m / k)} 段。`,
        vars: vars(),
        layers: [
          outLayer([], {}, `第 ${pass} 趟输出 OUT[]`),
          segLayer({ title: `第 ${pass} 趟输入：${m} 段`, segs: segsOf(runs, runs.map(() => 0), prefix).segs }),
        ],
      }));

      for (let s = 0; s < m; s += k) {
        const lo = s;
        const hi = Math.min(s + k, m);
        const cnt = hi - lo;
        const batchTitle = `第 ${pass} 趟 · 批次 R${lo}…R${hi - 1}（${cnt} 段）`;
        const batchRuns = runs.slice(lo, hi).map((r) => [...r]);
        const cursors = new Array(cnt).fill(0);
        const pathLen = Math.ceil(Math.log2(Math.max(2, cnt)));

        if (cnt === 1) {
          nextRuns.push([...batchRuns[0]]);
          steps.push(step({
            event: 'cursor', lineId: 'batch',
            note: `本批只有 R${lo} 一段：没有对手就没有"败者"，直接把这个段交给下一趟。`,
            vars: vars({ batch: `R${lo}` }),
            layers: [
              outLayer(passOut, { done: idx(passOut.length) }, `第 ${pass} 趟输出 OUT[]`),
              segLayer({ title: `${batchTitle}：单段直通`, segs: segsOf(batchRuns, cursors, prefix).segs }),
            ],
          }));
          continue;
        }

        const tree = buildLoserTree(cnt);
        const valOf = (leaf) => {
          const r = batchRuns[leaf];
          const c = cursors[leaf];
          return c < r.length ? r[c] : Infinity;
        };
        const fmtV = (leaf) => (valOf(leaf) === Infinity ? '∞' : valOf(leaf));

        const leafNodes = () => batchRuns.map((r, i) => {
          const c = cursors[i];
          const empty = c >= r.length;
          return {
            id: `L${i}`,
            label: `R${lo + i}`,
            cur: empty ? '∞' : String(r[c]),
            rem: empty ? '(已空)' : r.slice(c + 1).map(String).join(',') || '(尾)',
            fields: [{ name: 'cur' }, { name: 'rem' }],
            badge: `R${lo + i} · i=${c}`,
          };
        });

        const segTree = (title, roles = {}) => {
          const nodes = leafNodes();
          for (const node of tree.inner) {
            nodes.push({
              id: node.id,
              label: node.id,
              value: node.loser == null ? '—' : `败者 R${lo + node.loser}`,
              badge: `${node.id} · 记败者`,
            });
          }
          const champ = tree.root.winner;
          nodes.push({
            id: 'WIN',
            label: '冠',
            value: champ == null ? '—' : `胜者 R${lo + champ}`,
            badge: '冠军（根）',
          });
          const links = tree.all.map((node) => ({
            from: node.id,
            to: node.parent ? node.parent.id : 'WIN',
            label: node.parent ? '胜者上浮' : '冠军',
          }));
          return linkLayer({
            id: 'seg',
            title,
            name: '败者树（叶子 = 段；内部结点 = 该场败者；冠 = 根上浮出的最小首项）',
            order: [...tree.leaves.map((x) => x.id), ...tree.inner.map((x) => x.id), 'WIN'],
            nodes,
            links,
            roles,
          });
        };

        const play = (node) => {
          if (node.kind === 'leaf') {
            node.winner = node.leaf;
            return node.leaf;
          }
          const a = play(node.left);
          const b = play(node.right);
          const win = valOf(a) <= valOf(b) ? a : b;
          node.winner = win;
          node.loser = win === a ? b : a;
          return win;
        };

        steps.push(step({
          event: 'cursor', lineId: 'build',
          note: `本批 ${cnt} 段建成败者树：${cnt} 个叶子、${cnt - 1} 个内部结点（单败淘汰正好 ${cnt - 1} 场），游标全部归零后自底向上打一遍。`,
          vars: vars({ batch: `R${lo}…R${hi - 1}`, nodes: cnt - 1 }),
          layers: [
            outLayer(passOut, { done: idx(passOut.length) }, `第 ${pass} 趟输出 OUT[]`),
            segLayer({ title: `${batchTitle}：建树前的叶子`, segs: segsOf(batchRuns, cursors, prefix).segs }),
          ],
        }));

        for (const node of tree.inner) {
          const a = play(node.left);
          const b = play(node.right);
          const win = valOf(a) <= valOf(b) ? a : b;
          const lose = win === a ? b : a;
          node.winner = win;
          node.loser = lose;
          cmp += 1;
          steps.push(step({
            event: 'compare', lineId: 'build-cmp',
            note: `建树 · ${node.id} 这一场：R${lo + a}（${fmtV(a)}）vs R${lo + b}（${fmtV(b)}）— 胜者 R${lo + win} 继续上浮，败者 R${lo + lose} 记在 ${node.id} 里。`,
            vars: vars({ batch: `R${lo}…R${hi - 1}`, node: node.id }),
            layers: [
              outLayer(passOut, { done: idx(passOut.length) }, `第 ${pass} 趟输出 OUT[]`),
              segTree(`建树：${node.id} 记住败者`, { focus1: [`L${lose}`], focus2: [`L${win}`], added: [node.id] }),
            ],
          }));
        }

        const merged = [];
        let safety = 0;
        for (;;) {
          safety += 1;
          if (safety > 64) break;
          const champ = tree.root.winner;
          if (champ == null || valOf(champ) === Infinity) break;
          const champV = valOf(champ);

          steps.push(step({
            event: 'cursor', lineId: 'champ',
            note: `冠军就在根上：R${lo + champ} 的首项 ${champV} 是整批最小。不用扫 ${cnt} 个首项，O(1) 取根即可。`,
            vars: vars({ batch: `R${lo}…R${hi - 1}`, champ: `R${lo + champ}`, value: champV }),
            layers: [
              outLayer(merged, { done: idx(merged.length) }, `本批输出（R${lo}…R${hi - 1}）`),
              segTree(`冠军 = R${lo + champ}（值 ${champV}）`, {
                focus1: [`L${champ}`],
                pointers: [{ id: 'champ', label: '冠军 = 最小首项', node: 'WIN' }],
              }),
            ],
          }));

          cursors[champ] += 1;
          const nextV = valOf(champ);
          let node = tree.leafNode.get(champ).parent;
          while (node) {
            const a = node.left.winner;
            const b = node.right.winner;
            const win = valOf(a) <= valOf(b) ? a : b;
            const lose = win === a ? b : a;
            node.winner = win;
            node.loser = lose;
            cmp += 1;
            steps.push(step({
              event: 'compare', lineId: 'match',
              note: `${node.id} 重赛：R${lo + a}（${fmtV(a)}）vs R${lo + b}（${fmtV(b)}）— 胜者 R${lo + win} 上浮，败者 R${lo + lose} 写回结点。只走冠军这条路径，共 ${pathLen} 场。`,
              vars: vars({ batch: `R${lo}…R${hi - 1}`, node: node.id }),
              layers: [
                outLayer(merged, { done: idx(merged.length) }, `本批输出（R${lo}…R${hi - 1}）`),
                segTree(`${node.id} 重赛（路径长 ⌈log₂${cnt}⌉ = ${pathLen}）`, {
                  focus1: [`L${lose}`], focus2: [`L${win}`], added: [node.id],
                }),
              ],
            }));
            node = node.parent;
          }

          merged.push(champV);
          passOut.push(champV);
          emitted += 1;
          steps.push(step({
            event: 'emit', lineId: 'emit',
            note: `输出冠军的值 ${champV} 到本段尾部；R${lo + champ} 的游标前进到 i=${cursors[champ]}（新首项 ${nextV === Infinity ? '∞，该段已空' : nextV}）。`,
            vars: vars({ batch: `R${lo}…R${hi - 1}`, last: champV, from: `R${lo + champ}` }),
            layers: [
              outLayer(merged, { added: [merged.length - 1], done: idx(merged.length - 1) }, `本批输出（R${lo}…R${hi - 1}）`),
              segTree(`输出 ${champV}，败者树已沿路径更新`, {
                focus1: [`L${champ}`],
                pointers: [{ id: 'champ', label: '下一轮的冠军看这里', node: 'WIN' }],
              }),
            ],
          }));
        }

        steps.push(step({
          event: 'cursor', lineId: 'emit',
          note: `本批 ${cnt} 段全部耗尽：共输出 ${merged.length} 个元素（${merged.join(', ')}），构成下一趟的一段有序序列。`,
          vars: vars({ batch: `R${lo}…R${hi - 1}` }),
          layers: [
            outLayer(merged, { done: idx(merged.length) }, `本批输出（${merged.length} 项）`),
            segTree(`${batchTitle}：本批结束`, { done: ['WIN'] }),
          ],
        }));
        nextRuns.push(merged);
      }

      steps.push(step({
        event: 'round-end', lineId: 'pass-end',
        note: `第 ${pass} 趟结束：${m} 段 → ${nextRuns.length} 段（输出 ${passOut.length} 个元素，累计比较 ${cmp} 次；败者树的优势在于"每次换冠军只重赛 ${Math.ceil(Math.log2(k))} 场"）。`,
        vars: vars({ segs: nextRuns.length }),
        layers: [
          outLayer(passOut, { done: idx(passOut.length) }, `第 ${pass} 趟输出（${nextRuns.length} 段）`),
          segLayer({
            title: `第 ${pass} 趟产出 ${nextRuns.length} 段 → 下一趟的输入`,
            segs: segsOf(nextRuns, nextRuns.map(() => 0), `p${pass + 1}`).segs,
          }),
        ],
      }));

      runs = nextRuns;
      passOut = [];
    }
  }

  const finalArr = runs.length ? [...runs[0]] : [];
  const result = { array: finalArr, runs: copyRuns(runs) };
  const pack = tailPack(runs, pass);
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: finalArr.length === 0
      ? '归并完成：结果为空。'
      : `归并完成：${finalArr.join(', ')}（k=${k}，共 ${pass} 趟，败者树比较 ${cmp} 次）。`,
    vars: vars({ segs: runs.length }),
    layers: [
      outLayer(finalArr, { done: idx(finalArr.length) }, '归并结果'),
      segLayer({ title: '归并结果：只剩 1 段', segs: pack.segs, roles: { done: pack.done } }),
    ],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'multiway-merge-loser-tree-v1',
    lines: L, steps, result, meta: { passes: pass, compares: cmp, k },
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
