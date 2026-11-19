/**
 * C · 置换-选择排序（3 个代表性不同实现）
 *
 * 输入：{ stream: [4,5,1,2,6], M: 2 } —— M = 内存工作区能同时容纳的记录数。
 * 输出：result.runs = 顺串数组（每个顺串是流里的一段），并保证**每条输入恰好输出一次**（代码里 assert）。
 *
 * 三个变体的差别在"怎么维护活动区"，画面上的槽位、堆形态、冻结时机都不一样：
 *   v1 教材活动/冻结版 —— 工作区是普通数组，每次**线性扫描** M 个槽挑最小，O(M)，无堆；
 *   v2 最小堆维护活动区 —— 工作区是小根堆，取最小 O(log M)；冻结项**留在堆里**打标记，
 *                          靠"冻结项比任何活动项都大"的比较规则让它自动沉到堆底；
 *   v3 大根堆生成逆序段 —— 改成大根堆 + 反向冻结规则（r > 段末值 才冻结），生成**递减**顺串，
 *                          用来对照"段内有序方向"的取舍（所以 v3 的 runs 内容与其他变体合法地不同）。
 *
 * 关于样例期望的一处校准（不编造数据）：
 *   任务单里写的是 M=2、[4,5,1,2,6] → [[4,5,6],[1,2]]，但这两者不可能同时成立——
 *   6 是第 5 个才读入的记录，读入 6 之前 1、2 已被冻结、活动区已清空，第 1 段早已关闭。
 *   所以这里放两个递增样例：
 *     normal        M=2、[4,5,1,2,6] → [[4,5],[1,2,6]]
 *     normal-6-third M=2、[4,5,6,1,2] → [[4,5,6],[1,2]]（6 在第 3 位读入，才落进第 1 段）
 *
 * 图层（每步完整重建；layers[0] = 主 style 8 堆层）：
 *   wa     style 8 —— 内存工作区：一槽一格，label 写明「活动 / 冻结 / 空出」，v2/v3 额外画逻辑堆；
 *   stream style 1 —— 输入流：绿 = 已读，红 = 刚读入，指针 chip 写「读指针」；
 *   run    style 1 —— 当前顺串：指针 chip 写「段末值」，绿 = 已输出。
 */

import { trace, step, arrayLayer, heapLayer, memCell } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'c/replacement-selection',
  variants: [
    { id: 'v1', name: '教材活动/冻结版' },
    { id: 'v2', name: '最小堆维护活动区' },
    { id: 'v3', name: '大根堆生成逆序段' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void replacement_selection(FILE *fi, int M, FILE *fo) {' },
    { lineId: 'fill', text: '  for (k = 0; k < M && !feof(fi); ++k) WA[k] = read_record(fi);  /* 先填满工作区 */' },
    { lineId: 'loop', text: '  while (还有活动记录 || fi 未读完) {' },
    { lineId: 'scan', text: '    min = 活动记录里关键字最小的槽;                  /* 线性扫描 M 个槽 O(M) */' },
    { lineId: 'out', text: '    输出 min 到当前顺串;  last = min.key;             /* last = 本段段末值 */' },
    { lineId: 'read', text: '    r = feof(fi) ? NONE : read_record(fi);' },
    { lineId: 'decision', text: '    r.frozen = (r.key < last);                        /* 接不上本段 → 冻结留到下一段 */' },
    { lineId: 'slot', text: '    WA[min 的槽] = r;                                 /* 顶替刚空出的槽位 */' },
    { lineId: 'newrun', text: '    if (没有活动记录) { 结束本段; 解冻全部冻结记录; last = -INF; }' },
    { lineId: 'end', text: '  }   /* 所有记录恰好输出一次 */' },
  ],
  v2: [
    { lineId: 'fn', text: 'void replacement_selection_heap(FILE *fi, int M, FILE *fo) {' },
    { lineId: 'fill', text: '  for (k = 0; k < M && !feof(fi); ++k) WA[k] = read_record(fi);' },
    { lineId: 'fill-heap', text: '  build_min_heap(WA, M);                         /* 前 M 条记录建成小根堆 */' },
    { lineId: 'loop', text: '  while (WA 里还有活动记录 || fi 未读完) {' },
    { lineId: 'root', text: '    w = WA[0];                                     /* 堆顶就是活动区最小项 O(1) */' },
    { lineId: 'out', text: '    输出 w 到当前顺串;  last = w.key;                 /* last = 本段段末值 */' },
    { lineId: 'read', text: '    r = feof(fi) ? NONE : read_record(fi);' },
    { lineId: 'mark', text: '    WA[0] = r;  r.frozen = (r.key < last);           /* 冻结项留在堆里，只打标记 */' },
    { lineId: 'sift', text: '    sift_down(WA, 0, M);                           /* 冻结项按"比任何活动项都大"下沉 */' },
    { lineId: 'heapify', text: '    if (WA[0].frozen) { 结束本段; 全部解冻; heapify(WA); last = -INF; }' },
    { lineId: 'end', text: '  }   /* 堆里始终只有 M 条记录，活动区不会被写爆 */' },
  ],
  v3: [
    { lineId: 'fn', text: 'void replacement_selection_max(FILE *fi, int M, FILE *fo) {' },
    { lineId: 'fill', text: '  for (k = 0; k < M && !feof(fi); ++k) WA[k] = read_record(fi);' },
    { lineId: 'fill-heap', text: '  build_max_heap(WA, M);                         /* 前 M 条记录建成大根堆 */' },
    { lineId: 'loop', text: '  while (WA 里还有活动记录 || fi 未读完) {' },
    { lineId: 'root', text: '    w = WA[0];                                     /* 大根堆堆顶 = 活动区最大项 */' },
    { lineId: 'out', text: '    输出 w 到当前顺串;  last = w.key;                 /* 段内递减：last 是段末（最小）值 */' },
    { lineId: 'read', text: '    r = feof(fi) ? NONE : read_record(fi);' },
    { lineId: 'mark', text: '    WA[0] = r;  r.frozen = (r.key > last);            /* 比段末值还大 → 接不上递减段 */' },
    { lineId: 'sift', text: '    sift_down_max(WA, 0, M);                       /* 冻结项按"比任何活动项都小"下沉 */' },
    { lineId: 'heapify', text: '    if (WA[0].frozen) { 结束本段; 全部解冻; heapify_max(WA); last = +INF; }' },
    { lineId: 'end', text: '  }   /* 每个顺串内部递减，等价于"倒着写的递增段" */' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

export const samples = [
  {
    id: 'normal',
    label: 'M=2、[4,5,1,2,6]（6 是第 5 个读入，第 1 段读不到它）',
    input: { stream: [4, 5, 1, 2, 6], M: 2 },
    expect: { runs: [[4, 5], [1, 2, 6]] },
    expectByVariant: { v3: { runs: [[5, 4, 2, 1], [6]] } },   // 大根堆 → 段内递减
  },
  {
    id: 'normal-6-third',
    label: 'M=2、[4,5,6,1,2]（6 在第 3 位读入 → 第 1 段是 [4,5,6]）',
    input: { stream: [4, 5, 6, 1, 2], M: 2 },
    expect: { runs: [[4, 5, 6], [1, 2]] },
    expectByVariant: { v3: { runs: [[5, 4, 1], [6, 2]] } },
  },
  {
    id: 'edge-m1',
    label: 'M=1、[3,1,2]（工作区只有一个槽，读一条就要挤掉一条）',
    input: { stream: [3, 1, 2], M: 1 },
    expect: { runs: [[3], [1, 2]] },
    expectByVariant: { v3: { runs: [[3, 1], [2]] } },
  },
  {
    id: 'edge-empty',
    label: '空输入流（直接结束，runs = []）',
    input: { stream: [], M: 2 },
    expect: { runs: [] },
  },
];

/* ------------------------------------------------------------------ 公用小工具 */

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};

function limitsOf(input) {
  const raw = Array.isArray(input.stream) ? input.stream : [];
  const stream = raw.slice();
  let M = Number(input.M);
  if (!Number.isFinite(M) || M < 1) M = 2;
  M = Math.min(8, Math.floor(M));
  return { stream, M };
}

function countsOf(slots) {
  let active = 0;
  let frozen = 0;
  let spent = 0;
  for (const s of slots) {
    if (s.state === 'active') active += 1;
    else if (s.state === 'frozen') frozen += 1;
    else spent += 1;
  }
  return { active, frozen, spent };
}

/** 每条输入恰好输出一次（失败就大声抛错，绝不静默丢记录） */
function assertExactlyOnce(stream, runs) {
  const flat = runs.flat();
  if (flat.length !== stream.length) {
    throw new Error(`置换-选择输出条数不符：输入 ${stream.length} 条，输出 ${flat.length} 条（${JSON.stringify(runs)}）`);
  }
  const key = (arr) => arr.map((v) => String(v)).sort().join(',');
  if (key(stream) !== key(flat)) {
    throw new Error(`顺串里的值不是输入的排列：输入 [${stream.join(',')}]，输出 [${flat.join(',')}]`);
  }
}

/** 一步的三张图：工作区（style 8）+ 输入流（style 1）+ 当前顺串（style 1） */
function mkLayers(cfg) {
  const { slots, M, mode, stream, labels, readPos, run, runNo, dir, roles } = cfg;
  const cells = slots.map((s, i) => {
    const state = s.state === 'active' ? 'node' : s.state === 'frozen' ? 'invalid' : 'empty';
    const tag = s.state === 'active' ? '活动' : s.state === 'frozen' ? '冻结' : '空出';
    return memCell({ label: `槽${i + 1} ${tag}`, value: s.state === 'spent' ? '' : s.value, addr: i, state });
  });
  const n = stream.length;
  const wa = heapLayer({
    id: 'wa',
    title: '内存工作区 WA',
    name: `工作区 WA（容量 M=${M}，实际 ${slots.length} 槽 · ${dir}顺串 ${runNo}）`,
    cells,
    tree: mode === 'plain' ? null : slots.map((s) => (s.state === 'spent' ? '' : s.value)),
    showTree: mode !== 'plain',
    roles: roles || {},
  });
  const streamLayer = arrayLayer({
    id: 'stream',
    title: '输入流 FI',
    name: `输入流 FI（已读 ${readPos}/${n}）`,
    values: [...stream],
    labels: [...labels],
    roles: {
      done: range(0, readPos - 1),
      focus1: readPos > 0 ? [readPos - 1] : [],
      pointers: readPos < n ? [{ id: 'next', label: `读指针 ${readPos + 1}`, index: readPos }] : [],
    },
  });
  const runLayer = arrayLayer({
    id: 'run',
    title: '当前顺串',
    name: `第 ${runNo} 段（${dir}）· 已输出 ${run.length} 条`,
    values: [...run],
    labels: labelsOf(run),
    roles: {
      done: range(0, run.length - 1),
      added: run.length ? [run.length - 1] : [],
      pointers: run.length ? [{ id: 'last', label: '段末值', index: run.length - 1 }] : [],
    },
  });
  return [wa, streamLayer, runLayer];
}

/* ------------------------------------------------------------------ 变体 1：教材活动/冻结版（线性扫描） */

function runV1(input) {
  const { stream, M } = limitsOf(input);
  const labels = labelsOf(stream);
  const W = Math.min(M, stream.length);
  const slots = Array.from({ length: W }, () => ({ value: null, state: 'spent' }));
  let readPos = 0;
  let run = [];
  let runNo = 1;
  let last = null;
  const runs = [];
  const dir = '递增';
  const steps = [];

  const varsOf = (op) => {
    const c = countsOf(slots);
    return { op, 段号: runNo, 段末值: last == null ? '—' : last, 活动项: c.active, 冻结项: c.frozen, 已读: `${readPos}/${stream.length}`, M };
  };
  const push = (event, lineId, note, opt = {}) => {
    steps.push(
      step({
        event,
        lineId,
        note,
        vars: varsOf(opt.op || event),
        layers: mkLayers({ slots, M, mode: 'plain', stream, labels, readPos, run, runNo, dir, roles: opt.roles || {} }),
        done: !!opt.done,
        result: opt.result,
      }),
    );
  };

  push(
    'init',
    'fn',
    stream.length === 0
      ? `置换-选择：输入流为空（M=${M}），没有记录可读，直接结束。`
      : `置换-选择：工作区容量 M=${M}，这次最多同时放 ${W} 条记录。规则：每次输出活动项里最小的记为段末值，新读入的记录若小于段末值就冻结到下一段，活动项清空即段结束。`,
    { roles: {} },
  );

  for (let i = 0; i < W; i++) {
    slots[i] = { value: stream[readPos], state: 'active' };
    readPos += 1;
    push('read', 'fill', `读入 ${slots[i].value} 放进槽${i + 1}：工作区还没填满，它直接成为活动项（读指针 → ${readPos < stream.length ? readPos + 1 : '末尾'}）。`, {
      roles: { swap: [i], pointers: [{ id: 'new', label: `新读入 ${slots[i].value}`, index: i }] },
    });
  }

  for (;;) {
    const c = countsOf(slots);
    if (c.active === 0) {
      if (c.frozen === 0) break;
      runs.push([...run]);
      push(
        'new-run',
        'newrun',
        `工作区里已经没有活动项：第 ${runNo} 段结束（${run.join(', ') || '空'}，共 ${run.length} 条）。解冻 ${c.frozen} 条冻结记录，让它们当第 ${runNo + 1} 段的活动项。`,
        { roles: { done: range(0, run.length - 1) } },
      );
      for (const s of slots) if (s.state === 'frozen') s.state = 'active';
      run = [];
      runNo += 1;
      last = null;
      push('activate', 'newrun', `解冻完成：${c.frozen} 条记录全部变回活动项，段末值清零，开始第 ${runNo} 段。`, {
        roles: { added: range(0, slots.length - 1) },
      });
      continue;
    }

    // 线性扫描挑最小活动项
    let best = -1;
    let cmp = 0;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].state !== 'active') continue;
      cmp += 1;
      if (best < 0 || slots[i].value < slots[best].value) best = i;
    }
    push(
      'emit-min',
      'scan',
      `线性扫描工作区 ${W} 个槽、比较 ${cmp} 次：活动项里最小的是槽${best + 1} 的 ${slots[best].value}${last == null ? '（本段刚开始，没有段末值约束）' : `（段末值 ${last}，取最小才保证段内递增）`}。`,
      { roles: { focus1: [best], pointers: [{ id: 'min', label: 'min', index: best }] } },
    );

    const v = slots[best].value;
    slots[best] = { value: v, state: 'spent' };
    run.push(v);
    last = v;
    push('emit-min', 'out', `输出 ${v} 到第 ${runNo} 段，段末值更新为 ${last}；槽${best + 1} 空出来，等着装下一条读入记录。`, {
      roles: { focus1: [best], pointers: [{ id: 'min', label: `输出 ${v}`, index: best }] },
    });

    if (readPos < stream.length) {
      const r = stream[readPos];
      readPos += 1;
      push('read', 'read', `从输入流读入 ${r}（读指针 → ${readPos < stream.length ? readPos + 1 : '末尾'}），准备放进刚空出的槽${best + 1}。`, {
        roles: { swap: [best], pointers: [{ id: 'in', label: `读入 ${r}`, index: best }] },
      });
      if (r < last) {
        slots[best] = { value: r, state: 'frozen' };
        push('freeze', 'decision', `${r} < 段末值 ${last}：接在本段后面会破坏递增，所以冻结——它归下一段。槽${best + 1} 标成冻结，活动项少一个。`, {
          roles: { swap: [best], excluded: [best], pointers: [{ id: 'frozen', label: `冻结 ${r}`, index: best }] },
        });
      } else {
        slots[best] = { value: r, state: 'active' };
        push('activate', 'slot', `${r} >= 段末值 ${last}：可以接在本段后面，直接成为活动项，活动项数不变。`, {
          roles: { swap: [best], pointers: [{ id: 'active', label: `活动 ${r}`, index: best }] },
        });
      }
    }
  }

  if (run.length) runs.push([...run]);
  assertExactlyOnce(stream, runs);

  const result = {
    runs: runs.map((r) => [...r]),
    runCount: runs.length,
    emitted: runs.reduce((a, r) => a + r.length, 0),
    M,
  };
  push(
    'done',
    'end',
    `置换-选择完成：${stream.length} 条记录切成 ${runs.length} 个递增顺串 —— ${runs.map((r, i) => `第${i + 1}段[${r.join(', ')}]`).join('，') || '（空输入）'}。每条记录恰好输出一次。`,
    { done: true, result, roles: { done: range(0, run.length - 1) } },
  );

  return trace({
    algorithmId: meta.id,
    variantId: 'v1',
    sourceVersion: 'replacement-selection-textbook-v1',
    lines: LINES.v1,
    steps,
    result,
    meta: { runs: result.runCount, M },
  });
}

/* ------------------------------------------------------------------ 变体 2：最小堆维护活动区 */

function runV2(input) {
  const { stream, M } = limitsOf(input);
  const labels = labelsOf(stream);
  const W = Math.min(M, stream.length);
  const slots = Array.from({ length: W }, () => ({ value: null, state: 'spent' }));
  let readPos = 0;
  let run = [];
  let runNo = 1;
  let last = null;
  const runs = [];
  const dir = '递增';
  const steps = [];
  let siftCount = 0;

  const varsOf = (op) => {
    const c = countsOf(slots);
    return { op, 段号: runNo, 段末值: last == null ? '—' : last, 活动项: c.active, 冻结项: c.frozen, 已读: `${readPos}/${stream.length}`, M, 下沉次数: siftCount };
  };
  const push = (event, lineId, note, opt = {}) => {
    steps.push(
      step({
        event,
        lineId,
        note,
        vars: varsOf(opt.op || event),
        layers: mkLayers({ slots, M, mode: 'minheap', stream, labels, readPos, run, runNo, dir, roles: opt.roles || {} }),
        done: !!opt.done,
        result: opt.result,
      }),
    );
  };

  // 小根堆的比较规则：活动项 < 冻结项 < 空出；同档按值小者优先
  const rankOf = (s) => (s.state === 'active' ? 0 : s.state === 'frozen' ? 1 : 2);
  const before = (a, b) => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra !== rb) return ra < rb;
    return a.value < b.value;
  };
  const siftDown = (from, event, what) => {
    let i = from;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let win = i;
      if (l < W && before(slots[l], slots[win])) win = l;
      if (r < W && before(slots[r], slots[win])) win = r;
      if (win === i) break;
      const a = slots[i];
      const b = slots[win];
      slots[i] = b;
      slots[win] = a;
      siftCount += 1;
      i = win;
      push(event, 'sift', `${what}（${a.value}）换到槽${win + 1}，把 ${b.value} 顶上来：小根堆只让"更小的活动项"往上走，冻结/空出记录一律排在下面，堆顶因此总是活动项（累计下沉 ${siftCount} 次）。`, {
        roles: { swap: [win], pointers: [{ id: 'sift', label: `下沉 ${a.value}`, index: win }] },
      });
    }
  };
  const heapify = () => {
    for (let i = Math.floor((W - 2) / 2); i >= 0; i--) siftDown(i, 'activate', `解冻后重建小根堆（自底向上）`);
  };

  push(
    'init',
    'fn',
    stream.length === 0
      ? `置换-选择（小根堆版）：输入流为空（M=${M}），直接结束。`
      : `置换-选择（小根堆版）：工作区容量 M=${M}，实际装 ${W} 条，建成小根堆。取最小只需看堆顶 O(1)，换掉堆顶后 sift_down O(log M)——比线性扫描快，这是 v2 与 v1 的根本差别。`,
    { roles: {} },
  );

  for (let i = 0; i < W; i++) {
    slots[i] = { value: stream[readPos], state: 'active' };
    readPos += 1;
    push('read', 'fill', `读入 ${slots[i].value} 放进槽${i + 1}，作为活动项（读指针 → ${readPos < stream.length ? readPos + 1 : '末尾'}）。`, {
      roles: { swap: [i], pointers: [{ id: 'new', label: `新读入 ${slots[i].value}`, index: i }] },
    });
  }
  if (W > 1) heapify();
  if (W > 0) {
    push('init', 'fill-heap', `前 ${W} 条记录建成小根堆：堆顶是 ${slots[0].value}，也就是活动区里最小的那条（接下来要输出的就是它）。`, {
      roles: { focus1: [0], pointers: [{ id: 'root', label: '堆顶', index: 0 }] },
    });
  }

  for (;;) {
    const c = countsOf(slots);
    if (c.active === 0) {
      if (c.frozen === 0) break;
      runs.push([...run]);
      push(
        'new-run',
        'heapify',
        `堆顶已经不是活动项（按"冻结更大"的规则，这意味着整个堆都冻结了）：第 ${runNo} 段结束（${run.join(', ') || '空'}，共 ${run.length} 条）。解冻全部 ${c.frozen} 条，重建小根堆，开始第 ${runNo + 1} 段。`,
        { roles: { done: range(0, run.length - 1) } },
      );
      for (const s of slots) if (s.state === 'frozen') s.state = 'active';
      run = [];
      runNo += 1;
      last = null;
      heapify();
      push('activate', 'heapify', `解冻 + 重建完成：堆顶变成 ${slots[0] ? slots[0].value : '（空）'}，段末值清零，开始第 ${runNo} 段。`, {
        roles: { focus1: [0], pointers: [{ id: 'root', label: '堆顶', index: 0 }] },
      });
      continue;
    }

    push('emit-min', 'root', `堆顶就是活动区最小项：槽1 的 ${slots[0].value}${last == null ? '（本段刚开始）' : `（段末值 ${last}）`}。不用扫描，O(1) 取到。`, {
      roles: { focus1: [0], pointers: [{ id: 'root', label: '堆顶 min', index: 0 }] },
    });

    const v = slots[0].value;
    slots[0] = { value: v, state: 'spent' };
    run.push(v);
    last = v;
    push('emit-min', 'out', `输出 ${v} 到第 ${runNo} 段，段末值更新为 ${last}；槽1 空出，等新记录顶上来。`, {
      roles: { focus1: [0], pointers: [{ id: 'out', label: `输出 ${v}`, index: 0 }] },
    });

    if (readPos < stream.length) {
      const r = stream[readPos];
      readPos += 1;
      push('read', 'read', `从输入流读入 ${r}（读指针 → ${readPos < stream.length ? readPos + 1 : '末尾'}），装进空出来的堆顶槽1。`, {
        roles: { swap: [0], pointers: [{ id: 'in', label: `读入 ${r}`, index: 0 }] },
      });
      const frozen = r < last;
      slots[0] = { value: r, state: frozen ? 'frozen' : 'active' };
      push(frozen ? 'freeze' : 'activate', 'mark', frozen
        ? `${r} < 段末值 ${last}：接不上本段的递增顺序 → 打冻结标记。冻结项仍留在堆里，只是比较时"比任何活动项都大"，所以它会沉下去。`
        : `${r} >= 段末值 ${last}：可以接在本段后面 → 保持活动。它现在在堆顶，接下来要 sift_down 找到自己的位置。`, {
        roles: { swap: [0], excluded: frozen ? [0] : [], pointers: [{ id: 'slot', label: frozen ? `冻结 ${r}` : `活动 ${r}`, index: 0 }] },
      });
      siftDown(0, frozen ? 'freeze' : 'activate', `刚放入的 ${r}`);
    } else if (W > 1) {
      siftDown(0, 'emit-min', `已输出的 ${v}（空出记录）`);
    }
  }

  if (run.length) runs.push([...run]);
  assertExactlyOnce(stream, runs);

  const result = {
    runs: runs.map((r) => [...r]),
    runCount: runs.length,
    emitted: runs.reduce((a, r) => a + r.length, 0),
    M,
    siftCount,
  };
  push(
    'done',
    'end',
    `置换-选择完成：${stream.length} 条记录切成 ${runs.length} 个递增顺串 —— ${runs.map((r, i) => `第${i + 1}段[${r.join(', ')}]`).join('，') || '（空输入）'}。每条记录恰好输出一次，全程 sift_down 共 ${siftCount} 次。`,
    { done: true, result, roles: { done: range(0, run.length - 1) } },
  );

  return trace({
    algorithmId: meta.id,
    variantId: 'v2',
    sourceVersion: 'replacement-selection-minheap-v1',
    lines: LINES.v2,
    steps,
    result,
    meta: { runs: result.runCount, M, siftCount },
  });
}

/* ------------------------------------------------------------------ 变体 3：大根堆生成逆序段 */

function runV3(input) {
  const { stream, M } = limitsOf(input);
  const labels = labelsOf(stream);
  const W = Math.min(M, stream.length);
  const slots = Array.from({ length: W }, () => ({ value: null, state: 'spent' }));
  let readPos = 0;
  let run = [];
  let runNo = 1;
  let last = null;
  const runs = [];
  const dir = '递减';
  const steps = [];
  let siftCount = 0;

  const varsOf = (op) => {
    const c = countsOf(slots);
    return { op, 段号: runNo, 段末值: last == null ? '—' : last, 活动项: c.active, 冻结项: c.frozen, 已读: `${readPos}/${stream.length}`, M, 下沉次数: siftCount };
  };
  const push = (event, lineId, note, opt = {}) => {
    steps.push(
      step({
        event,
        lineId,
        note,
        vars: varsOf(opt.op || event),
        layers: mkLayers({ slots, M, mode: 'maxheap', stream, labels, readPos, run, runNo, dir, roles: opt.roles || {} }),
        done: !!opt.done,
        result: opt.result,
      }),
    );
  };

  // 大根堆的比较规则：活动项仍在最上面，同一档里**值大者优先**（这样段内递减）
  const rankOf = (s) => (s.state === 'active' ? 0 : s.state === 'frozen' ? 1 : 2);
  const before = (a, b) => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra !== rb) return ra < rb;
    return a.value > b.value;
  };
  const siftDown = (from, event, what) => {
    let i = from;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let win = i;
      if (l < W && before(slots[l], slots[win])) win = l;
      if (r < W && before(slots[r], slots[win])) win = r;
      if (win === i) break;
      const a = slots[i];
      const b = slots[win];
      slots[i] = b;
      slots[win] = a;
      siftCount += 1;
      i = win;
      push(event, 'sift', `${what}（${a.value}）换到槽${win + 1}，把 ${b.value} 顶上来：大根堆只让"活动且值更大"的记录往上走，冻结/空出记录一律沉底，堆顶因此总是活动项（累计下沉 ${siftCount} 次）。`, {
        roles: { swap: [win], pointers: [{ id: 'sift', label: `下沉 ${a.value}`, index: win }] },
      });
    }
  };
  const heapify = () => {
    for (let i = Math.floor((W - 2) / 2); i >= 0; i--) siftDown(i, 'activate', `解冻后重建大根堆（自底向上）`);
  };

  push(
    'init',
    'fn',
    stream.length === 0
      ? `置换-选择（大根堆版）：输入流为空（M=${M}），直接结束。`
      : `置换-选择（大根堆版）：工作区容量 M=${M}，实际装 ${W} 条，建成大根堆。堆顶取最大 → 生成的顺串**段内递减**；冻结规则也随之反过来：新记录比段末值大才冻结。`,
    { roles: {} },
  );

  for (let i = 0; i < W; i++) {
    slots[i] = { value: stream[readPos], state: 'active' };
    readPos += 1;
    push('read', 'fill', `读入 ${slots[i].value} 放进槽${i + 1}，作为活动项（读指针 → ${readPos < stream.length ? readPos + 1 : '末尾'}）。`, {
      roles: { swap: [i], pointers: [{ id: 'new', label: `新读入 ${slots[i].value}`, index: i }] },
    });
  }
  if (W > 1) heapify();
  if (W > 0) {
    push('init', 'fill-heap', `前 ${W} 条记录建成大根堆：堆顶是 ${slots[0].value}，也就是活动区里最大的一条——它会成为第 ${runNo} 段的第一个（也是最大的）记录。`, {
      roles: { focus1: [0], pointers: [{ id: 'root', label: '堆顶 max', index: 0 }] },
    });
  }

  for (;;) {
    const c = countsOf(slots);
    if (c.active === 0) {
      if (c.frozen === 0) break;
      runs.push([...run]);
      push(
        'new-run',
        'heapify',
        `堆顶已经不是活动项 → 整个堆都冻结了：第 ${runNo} 段结束（${run.join(', ') || '空'}，共 ${run.length} 条递减）。解冻 ${c.frozen} 条，重建大根堆，开始第 ${runNo + 1} 段。`,
        { roles: { done: range(0, run.length - 1) } },
      );
      for (const s of slots) if (s.state === 'frozen') s.state = 'active';
      run = [];
      runNo += 1;
      last = null;
      heapify();
      push('activate', 'heapify', `解冻 + 重建完成：堆顶变成 ${slots[0] ? slots[0].value : '（空）'}，段末值清零，开始第 ${runNo} 段。`, {
        roles: { focus1: [0], pointers: [{ id: 'root', label: '堆顶', index: 0 }] },
      });
      continue;
    }

    push('emit-min', 'root', `大根堆堆顶就是活动区最大项：槽1 的 ${slots[0].value}${last == null ? '（本段刚开始）' : `（段末值 ${last}，取最大才保证段内递减）`}。`, {
      roles: { focus1: [0], pointers: [{ id: 'root', label: '堆顶 max', index: 0 }] },
    });

    const v = slots[0].value;
    slots[0] = { value: v, state: 'spent' };
    run.push(v);
    last = v;
    push('emit-min', 'out', `输出 ${v} 到第 ${runNo} 段，段末值更新为 ${last}（本段最小值）；槽1 空出。`, {
      roles: { focus1: [0], pointers: [{ id: 'out', label: `输出 ${v}`, index: 0 }] },
    });

    if (readPos < stream.length) {
      const r = stream[readPos];
      readPos += 1;
      push('read', 'read', `从输入流读入 ${r}（读指针 → ${readPos < stream.length ? readPos + 1 : '末尾'}），装进空出来的堆顶槽1。`, {
        roles: { swap: [0], pointers: [{ id: 'in', label: `读入 ${r}`, index: 0 }] },
      });
      const frozen = r > last;
      slots[0] = { value: r, state: frozen ? 'frozen' : 'active' };
      push(frozen ? 'freeze' : 'activate', 'mark', frozen
        ? `${r} > 段末值 ${last}：比段末值还大，接在递减段后面就破坏了递减 → 冻结到下一段。冻结项在堆里"比任何活动项都小"，会沉到底。`
        : `${r} <= 段末值 ${last}：比段末值小，能接在递减段后面 → 保持活动。`, {
        roles: { swap: [0], excluded: frozen ? [0] : [], pointers: [{ id: 'slot', label: frozen ? `冻结 ${r}` : `活动 ${r}`, index: 0 }] },
      });
      siftDown(0, frozen ? 'freeze' : 'activate', `刚放入的 ${r}`);
    } else if (W > 1) {
      siftDown(0, 'emit-min', `已输出的 ${v}（空出记录）`);
    }
  }

  if (run.length) runs.push([...run]);
  assertExactlyOnce(stream, runs);

  const result = {
    runs: runs.map((r) => [...r]),
    runCount: runs.length,
    emitted: runs.reduce((a, r) => a + r.length, 0),
    M,
    siftCount,
    order: 'desc',
  };
  push(
    'done',
    'end',
    `置换-选择完成：${stream.length} 条记录切成 ${runs.length} 个**递减**顺串 —— ${runs.map((r, i) => `第${i + 1}段[${r.join(', ')}]`).join('，') || '（空输入）'}。每条记录恰好输出一次；段内递减，合并时倒着读就等价于递增段。`,
    { done: true, result, roles: { done: range(0, run.length - 1) } },
  );

  return trace({
    algorithmId: meta.id,
    variantId: 'v3',
    sourceVersion: 'replacement-selection-maxheap-v1',
    lines: LINES.v3,
    steps,
    result,
    meta: { runs: result.runCount, M, siftCount, order: 'desc' },
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
