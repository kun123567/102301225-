/**
 * F · 朴素模式匹配（3 个代表性不同实现）
 *
 *   1) v1 双层循环：外层枚举每一个起点 i，内层逐字符比较；失配则起点 +1。
 *      **不剪枝**：i 可以一直走到 n-1，靠 i+j>=n 的越界判断兜底——这正是朴素算法的浪费所在。
 *      内层走满 m 次就早停返回首个起点。
 *   2) v2 提前剪枝版：先用 limit = n - m 把"长度不够的起点"整体划掉（画面上变灰），
 *      之后外层只在 [0, limit] 里枚举，内层因此不再需要越界判断。同样早停返回首个起点。
 *   3) v3 全量匹配版：同样是剪枝后的枚举，但命中**不早停**、起点只 +1，
 *      所以能记录重叠命中（aaaa 里查 aa 有 0/1/2 三个），结果与 KMP 对照一致。
 *
 * 三版的差别是"枚举范围 + 是否早停"，所以正常样例上 v1/v2 与 v3 的 result 合法不同，
 * 用 expectByVariant 单独声明 v3 的期望（不为了通过校验去改算法）。
 *
 * 画面：两个字符层（主串 t[]、模式串 p[]）。红色=当前比较的主串字符，品红=当前模式字符，
 * 虚线框=本次对齐窗口，指针带文字（起点 i、t[k]、j）。
 */

import { trace, step, arrayLayer, graphLayer, gridLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'f/naive-string-match',
  variants: [
    { id: 'v1', name: '双层循环' },
    { id: 'v2', name: '提前剪枝版' },
    { id: 'v3', name: '全量匹配版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'int naive_match(const char t[], int n, const char p[], int m) {' },
    { lineId: 'for-i', text: '  for (int i = 0; i < n; ++i) {              /* 外层：枚举每一个起点 */' },
    { lineId: 'align', text: '    /* 把 p[0..m-1] 贴到 t[i..i+m-1] 上 */' },
    { lineId: 'for-j', text: '    for (int j = 0; j < m; ++j) {            /* 内层：逐字符比较 */' },
    { lineId: 'guard', text: '      if (i + j >= n) break;                /* 不剪枝：靠越界判断兜底 */' },
    { lineId: 'cmp', text: '      if (t[i + j] != p[j]) break;           /* 有一个字符不同，本起点作废 */' },
    { lineId: 'j-end', text: '    }' },
    { lineId: 'hit', text: '    if (j == m) return i;                     /* 内层走满 m 次 → 命中首个起点 */' },
    { lineId: 'shift', text: '    /* 失配：起点 +1，内层已比过的信息全部丢弃 */' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'int naive_match_pruned(const char t[], int n, const char p[], int m) {' },
    { lineId: 'limit', text: '  int limit = n - m;                     /* 起点最多到 n-m，再往后窗口放不下 */' },
    { lineId: 'check', text: '  if (limit < 0) return -1;              /* 模式比主串还长：不存在合法起点 */' },
    { lineId: 'for-i', text: '  for (int i = 0; i <= limit; ++i) {     /* 只在合法起点里枚举 */' },
    { lineId: 'align', text: '    /* 窗口 t[i..i+m-1] 一定完整落在主串内 */' },
    { lineId: 'for-j', text: '    for (int j = 0; j < m; ++j) {' },
    { lineId: 'cmp', text: '      if (t[i + j] != p[j]) break;       /* 无需越界判断：长度已经保证 */' },
    { lineId: 'j-end', text: '    }' },
    { lineId: 'hit', text: '    if (j == m) return i;                /* 命中首个起点即返回 */' },
    { lineId: 'shift', text: '    /* 失配：i+1，仍在 limit 之内，不会白跑 */' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'int naive_match_all(const char t[], int n, const char p[], int m, int out[]) {' },
    { lineId: 'limit', text: '  int limit = n - m, cnt = 0;            /* 合法起点上限 + 命中计数 */' },
    { lineId: 'for-i', text: '  for (int i = 0; i <= limit; ++i) {     /* 每个合法起点都要试 */' },
    { lineId: 'align', text: '    /* 窗口 t[i..i+m-1] */' },
    { lineId: 'for-j', text: '    for (int j = 0; j < m; ++j) {' },
    { lineId: 'cmp', text: '      if (t[i + j] != p[j]) break;' },
    { lineId: 'j-end', text: '    }' },
    { lineId: 'hit', text: '    if (j == m) out[cnt++] = i;          /* 命中只记录，不早停 */' },
    { lineId: 'overlap', text: '    /* 起点只 +1：aaaa 里查 aa 允许重叠，0 与 1 都算命中 */' },
    { lineId: 'shift', text: '    /* 未命中：起点 +1 */' },
    { lineId: 'for-end', text: '  }' },
    { lineId: 'end', text: '  return cnt;' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: "aaaa 查 aa（v1/v2 早停只得 0；v3 全量得 0/1/2）",
    input: { text: 'aaaa', pattern: 'aa' },
    expect: { matches: [0] },
    expectByVariant: { v3: { matches: [0, 1, 2] } },
  },
  {
    id: 'normal-two-hits',
    label: 'abcabc 查 abc（两处命中，v3 才看得见第二处）',
    input: { text: 'abcabc', pattern: 'abc' },
    expect: { matches: [0] },
    expectByVariant: { v3: { matches: [0, 3] } },
  },
  {
    id: 'edge-longer',
    label: 'ab 查 abc（模式比主串长：一个合法起点都没有）',
    input: { text: 'ab', pattern: 'abc' },
    expect: { matches: [] },
  },
  {
    id: 'edge-empty',
    label: "abc 查 ''（空模式：约定在下标 0 命中）",
    input: { text: 'abc', pattern: '' },
    expect: { matches: [0] },
  },
];

/* ------------------------------------------------------------------ 小工具 */

const chars = (s) => String(s == null ? '' : s).split('');

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (i >= 0) out.push(i);
  return out;
};

/** 一个字符层（style 1：字符写在格子里，labels 与 values 同形） */
function charRow(id, title, name, list, roles) {
  return arrayLayer({
    id,
    title,
    name,
    values: [...list],
    labels: [...list],
    indexBase: 0,
    roles: roles || {},
  });
}

/* ------------------------------------------------------------------ 变体 1（双层循环） */

function runV1(input) {
  const T = chars(input.text);
  const P = chars(input.pattern);
  const n = T.length;
  const m = P.length;
  const L = LINES.v1;
  const steps = [];
  const matches = [];
  let compares = 0;

  /** 完整快照：主串层 + 模式串层（每步新建） */
  const snap = (o = {}) => {
    const tRoles = {};
    const pRoles = {};
    const ptrs = [];
    if (o.i != null) ptrs.push({ id: 'i', label: `起点 i=${o.i}`, index: o.i });
    if (o.at != null) ptrs.push({ id: 'at', label: `t[${o.at}]`, index: o.at });
    if (ptrs.length) tRoles.pointers = ptrs;
    if (o.window && o.window[0] <= o.window[1]) {
      tRoles.marks = { range: [o.window[0], o.window[1]], rangeLabel: `对齐窗口 [${o.window[0]},${o.window[1]}]` };
    }
    if (o.textRoles) Object.assign(tRoles, o.textRoles);
    if (o.j != null && o.j >= 0 && o.j < m) {
      pRoles.focus2 = [o.j];
      pRoles.pointers = [{ id: 'j', label: `j=${o.j}`, index: o.j }];
    }
    if (o.patRoles) Object.assign(pRoles, o.patRoles);
    return [
      charRow('text', '主串 t[]', `char t[${n}]`, T, tRoles),
      charRow('pattern', '模式串 p[]', `char p[${m}]`, P, pRoles),
    ];
  };

  const die = (note) => {
    const result = { matches: [...matches] };
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note,
      vars: { n, m, i: null, j: null, compares, matches: [...matches] },
      layers: snap({ textRoles: { done: [...matches] }, patRoles: matches.length ? { done: range(0, m - 1) } : {} }),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v1', sourceVersion: 'naive-string-match-double-loop-v1',
      lines: L, steps, result, meta: { compares },
    });
  };

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: m === 0
      ? '模式串为空（m = 0）：按约定空模式在主串下标 0 处匹配一次，一个字符都不用比。'
      : n === 0
        ? '主串为空（n = 0）：没有任何起点可枚举，循环一次都不进。'
        : `主串 n = ${n}、模式串 m = ${m}。外层把起点 i 依次移到 0,1,...,${n - 1}，内层把 p[0..${m - 1}] 逐个字符贴上去比。这一版不剪枝：起点会一直走到 ${n - 1}，长度不够时靠越界判断兜底。`,
    vars: { n, m, i: null, j: null, compares: 0, matches: [] },
    layers: snap({ textRoles: n ? { done: [] } : {} }),
  }));

  if (m === 0) {
    matches.push(0);
    steps.push(step({
      event: 'hit', lineId: 'hit',
      note: '空模式与任何位置都"相等"，约定命中下标 0。',
      vars: { n, m, i: 0, j: 0, compares, matches: [...matches] },
      layers: snap({ i: n ? 0 : null }),
    }));
    return die('空模式匹配结束：返回下标 0。');
  }

  for (let i = 0; i < n; i++) {
    const last = i + m - 1;
    const winLast = Math.min(n - 1, last);
    steps.push(step({
      event: 'align', lineId: 'align',
      note: last <= n - 1
        ? `起点 i = ${i}：t[${i}..${last}] 与 p[0..${m - 1}] 对齐，开始逐字符比。`
        : `起点 i = ${i}：窗口右端到 t[${last}]，已经越出主串（n-1 = ${n - 1}）。v1 不剪枝，只能等内层撞到越界再退出——这就是 v2 要提前划掉的那批无效起点。`,
      vars: { n, m, i, j: 0, compares, matches: [...matches] },
      layers: snap({ i, j: 0, at: i, window: [i, winLast], textRoles: { focus1: [i] } }),
    }));

    let j = 0;
    let outOfRange = false;
    while (j < m) {
      if (i + j >= n) {
        outOfRange = true;
        steps.push(step({
          event: 'mismatch', lineId: 'guard',
          note: `i + j = ${i + j} ≥ n = ${n}：主串剩下不到 ${m - j} 个字符，这个起点不可能命中，内层直接退出。`,
          vars: { n, m, i, j, compares, matches: [...matches] },
          layers: snap({ i, j, window: [i, winLast], textRoles: { focus2: [n - 1] } }),
        }));
        break;
      }
      compares += 1;
      const k = i + j;
      const same = T[k] === P[j];
      if (same) {
        steps.push(step({
          event: 'compare', lineId: 'cmp',
          note: `t[${k}] = '${T[k]}' 与 p[${j}] = '${P[j]}' 相同：内层右移一格，已匹配长度 +1。`,
          vars: { n, m, i, j, compares, matches: [...matches] },
          layers: snap({ i, j, at: k, window: [i, winLast], textRoles: { focus1: [k], done: range(i, k - 1) }, patRoles: { focus2: [j], done: range(0, j - 1) } }),
        }));
        j += 1;
      } else {
        steps.push(step({
          event: 'mismatch', lineId: 'cmp',
          note: `t[${k}] = '${T[k]}' 与 p[${j}] = '${P[j]}' 不同：失配位置在模式串第 ${j} 位，这个起点作废。朴素算法不看已经比过的前 ${j} 个字符，起点只往前挪一格。`,
          vars: { n, m, i, j, compares, matches: [...matches] },
          layers: snap({ i, j, at: k, window: [i, winLast], textRoles: { focus1: [k], done: range(i, k - 1), swap: [k] }, patRoles: { focus2: [j] } }),
        }));
        break;
      }
    }

    if (!outOfRange && j === m) {
      matches.push(i);
      steps.push(step({
        event: 'hit', lineId: 'hit',
        note: `内层走满 m = ${m} 次：t[${i}..${last}] 与模式串完全相同，起点 ${i} 命中。v1 找到首个匹配就 return，后面还有没有匹配它不关心。`,
        vars: { n, m, i, j, compares, matches: [...matches] },
        layers: snap({ i, window: [i, winLast], textRoles: { done: range(i, last) }, patRoles: { done: range(0, m - 1) } }),
      }));
      return die(`v1（早停）结束：首个匹配起点 ${matches[0]}，共比较 ${compares} 次。`);
    }

    steps.push(step({
      event: 'shift', lineId: 'shift',
      note: `起点 i → ${i + 1}：整份已比较的信息全部丢弃，从头再比一次。`,
      vars: { n, m, i: i + 1, j: null, compares, matches: [...matches] },
      layers: snap({ i: i + 1, window: [i + 1, Math.min(n - 1, i + m)], textRoles: i + 1 < n ? { added: [i + 1] } : {} }),
    }));
  }

  return die(matches.length ? `匹配结束：起点 ${matches[0]}。` : `n 个起点都试完，没有一个能完整对上模式串，返回失败（共比较 ${compares} 次）。`);
}

/* ------------------------------------------------------------------ 变体 2（提前剪枝） */

function runV2(input) {
  const T = chars(input.text);
  const P = chars(input.pattern);
  const n = T.length;
  const m = P.length;
  const limit = n - m;
  const L = LINES.v2;
  const steps = [];
  const matches = [];
  let compares = 0;

  /** 剪枝后"不可能成为起点"的位置在画面上统一变灰 */
  const cut = limit >= 0 ? range(limit + 1, n - 1) : range(0, n - 1);

  const snap = (o = {}) => {
    const tRoles = { excluded: [...cut] };
    const pRoles = {};
    const ptrs = [];
    if (o.i != null && o.i < n) ptrs.push({ id: 'i', label: `起点 i=${o.i}`, index: o.i });
    if (o.at != null && o.at < n) ptrs.push({ id: 'at', label: `t[${o.at}]`, index: o.at });
    if (ptrs.length) tRoles.pointers = ptrs;
    if (o.window && o.window[0] <= o.window[1]) {
      tRoles.marks = { range: [o.window[0], o.window[1]], rangeLabel: `合法窗口 [${o.window[0]},${o.window[1]}]` };
    }
    if (o.textRoles) Object.assign(tRoles, o.textRoles);
    if (o.j != null && o.j >= 0 && o.j < m) {
      pRoles.focus2 = [o.j];
      pRoles.pointers = [{ id: 'j', label: `j=${o.j}`, index: o.j }];
    }
    if (o.patRoles) Object.assign(pRoles, o.patRoles);
    return [
      charRow('text', '主串 t[]', `char t[${n}]（灰色 = 起点长度不足）`, T, tRoles),
      charRow('pattern', '模式串 p[]', `char p[${m}]`, P, pRoles),
    ];
  };

  const die = (note) => {
    const result = { matches: [...matches] };
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note,
      vars: { n, m, limit, i: null, j: null, compares, matches: [...matches] },
      layers: snap({ textRoles: { done: [...matches] }, patRoles: matches.length ? { done: range(0, m - 1) } : {} }),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v2', sourceVersion: 'naive-string-match-pruned-v1',
      lines: L, steps, result, meta: { compares, limit },
    });
  };

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: m === 0
      ? '模式串为空（m = 0）：按约定空模式命中下标 0。'
      : n === 0
        ? '主串为空（n = 0）：没有起点可枚举。'
        : `n = ${n}、m = ${m}。先把起点上限算出来：limit = n - m = ${limit}。起点一旦超过 limit，窗口就放不下整个模式串，根本不用去比。`,
    vars: { n, m, limit, i: null, j: null, compares: 0, matches: [] },
    layers: snap({}),
  }));

  if (m === 0) {
    matches.push(0);
    steps.push(step({
      event: 'hit', lineId: 'hit',
      note: '空模式：约定命中下标 0。',
      vars: { n, m, limit, i: 0, j: 0, compares, matches: [...matches] },
      layers: snap({}),
    }));
    return die('空模式匹配结束：返回下标 0。');
  }

  steps.push(step({
    event: 'align', lineId: 'limit',
    note: limit < 0
      ? `limit = ${limit} < 0：模式串比主串还长（${m} > ${n}），一个合法起点都没有，所有位置都被划掉。`
      : `limit = ${limit}：起点只能在 [0, ${limit}] 里取。画面上 t[${limit + 1}..${n - 1}] 已经变灰——这些起点窗口越界，连比较都不用开始。`,
    vars: { n, m, limit, i: null, j: null, compares, matches: [...matches] },
    layers: snap({}),
  }));

  if (limit < 0) {
    steps.push(step({
      event: 'mismatch', lineId: 'check',
      note: `check：limit < 0 直接返回失败，省掉 ${n} 次注定失败的枚举。这就是"剪枝"的全部意义。`,
      vars: { n, m, limit, compares, matches: [...matches] },
      layers: snap({}),
    }));
    return die('模式串比主串长：不存在合法起点，返回失败（一次比较都没做）。');
  }

  for (let i = 0; i <= limit; i++) {
    const last = i + m - 1;
    steps.push(step({
      event: 'align', lineId: 'align',
      note: `起点 i = ${i}（≤ limit = ${limit}）：窗口 t[${i}..${last}] 完整落在主串内，内层不需要任何越界判断。`,
      vars: { n, m, limit, i, j: 0, compares, matches: [...matches] },
      layers: snap({ i, j: 0, at: i, window: [i, last], textRoles: { focus1: [i] } }),
    }));

    let j = 0;
    while (j < m) {
      compares += 1;
      const k = i + j;
      if (T[k] === P[j]) {
        steps.push(step({
          event: 'compare', lineId: 'cmp',
          note: `t[${k}] = '${T[k]}' 与 p[${j}] = '${P[j]}' 相同：继续右移。`,
          vars: { n, m, limit, i, j, compares, matches: [...matches] },
          layers: snap({ i, j, at: k, window: [i, last], textRoles: { focus1: [k], done: range(i, k - 1) }, patRoles: { done: range(0, j - 1) } }),
        }));
        j += 1;
      } else {
        steps.push(step({
          event: 'mismatch', lineId: 'cmp',
          note: `t[${k}] = '${T[k]}' 与 p[${j}] = '${P[j]}' 不同：失配，本起点作废（不会再出现越界，因为窗口本来就合法）。`,
          vars: { n, m, limit, i, j, compares, matches: [...matches] },
          layers: snap({ i, j, at: k, window: [i, last], textRoles: { focus1: [k], swap: [k], done: range(i, k - 1) } }),
        }));
        break;
      }
    }

    if (j === m) {
      matches.push(i);
      steps.push(step({
        event: 'hit', lineId: 'hit',
        note: `内层走满 m 次：起点 ${i} 命中。v2 同样早停返回首个匹配。`,
        vars: { n, m, limit, i, j, compares, matches: [...matches] },
        layers: snap({ i, window: [i, last], textRoles: { done: range(i, last) }, patRoles: { done: range(0, m - 1) } }),
      }));
      return die(`v2（剪枝 + 早停）结束：首个匹配起点 ${matches[0]}，共比较 ${compares} 次（有效起点只有 ${limit + 1} 个）。`);
    }

    steps.push(step({
      event: 'shift', lineId: 'shift',
      note: `起点 i → ${i + 1}${i + 1 > limit ? '：已经超过 limit，枚举到此为止（v1 还会继续白跑）' : '：仍在 limit 之内'}。`,
      vars: { n, m, limit, i: i + 1, j: null, compares, matches: [...matches] },
      layers: snap({ i: i + 1, window: [i + 1, Math.min(n - 1, i + 1 + m - 1)], textRoles: i + 1 < n ? { added: [i + 1] } : {} }),
    }));
  }

  return die(matches.length ? `匹配结束：起点 ${matches[0]}。` : `[0, ${limit}] 的合法起点全部试完仍未命中，返回失败（共比较 ${compares} 次；v1 会多跑 ${Math.max(0, n - limit - 1)} 个无效起点）。`);
}

/* ------------------------------------------------------------------ 变体 3（全量匹配） */

function runV3(input) {
  const T = chars(input.text);
  const P = chars(input.pattern);
  const n = T.length;
  const m = P.length;
  const limit = n - m;
  const L = LINES.v3;
  const steps = [];
  const matches = [];
  let compares = 0;

  const snap = (o = {}) => {
    const tRoles = { excluded: limit >= 0 ? range(limit + 1, n - 1) : range(0, n - 1) };
    const pRoles = {};
    const ptrs = [];
    if (o.i != null && o.i < n) ptrs.push({ id: 'i', label: `起点 i=${o.i}`, index: o.i });
    if (o.at != null && o.at < n) ptrs.push({ id: 'at', label: `t[${o.at}]`, index: o.at });
    if (ptrs.length) tRoles.pointers = ptrs;
    if (o.window && o.window[0] <= o.window[1]) {
      tRoles.marks = { range: [o.window[0], o.window[1]], rangeLabel: `当前窗口 [${o.window[0]},${o.window[1]}]` };
    }
    if (o.textRoles) Object.assign(tRoles, o.textRoles);
    if (o.j != null && o.j >= 0 && o.j < m) {
      pRoles.focus2 = [o.j];
      pRoles.pointers = [{ id: 'j', label: `j=${o.j}`, index: o.j }];
    }
    if (o.patRoles) Object.assign(pRoles, o.patRoles);
    return [
      charRow('text', '主串 t[]', `char t[${n}]（绿 = 已命中的起点）`, T, tRoles),
      charRow('pattern', '模式串 p[]', `char p[${m}]`, P, pRoles),
    ];
  };

  const die = (note) => {
    const result = { matches: [...matches] };
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note,
      vars: { n, m, limit, i: null, j: null, compares, matches: [...matches], count: matches.length },
      layers: snap({ textRoles: { done: [...matches] }, patRoles: matches.length ? { done: range(0, m - 1) } : {} }),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v3', sourceVersion: 'naive-string-match-all-v1',
      lines: L, steps, result, meta: { compares, count: matches.length },
    });
  };

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: m === 0
      ? '模式串为空（m = 0）：按约定空模式命中下标 0。'
      : n === 0
        ? '主串为空（n = 0）：没有起点可枚举。'
        : `n = ${n}、m = ${m}，limit = n - m = ${limit}。这一版要在 [0, limit] 里把**每个**起点都试一遍，命中也不早停，所以重复出现的位置（含重叠）都会进结果——和 KMP 的 matches 可以直接对账。`,
    vars: { n, m, limit, i: null, j: null, compares: 0, matches: [], count: 0 },
    layers: snap({}),
  }));

  if (m === 0) {
    matches.push(0);
    steps.push(step({
      event: 'hit', lineId: 'hit',
      note: '空模式：约定命中下标 0。',
      vars: { n, m, limit, i: 0, j: 0, compares, matches: [...matches], count: 1 },
      layers: snap({}),
    }));
    return die('空模式匹配结束：返回下标 0。');
  }

  if (limit < 0) {
    steps.push(step({
      event: 'mismatch', lineId: 'limit',
      note: `limit = ${limit} < 0：模式串（${m}）比主串（${n}）长，for 循环的 i <= limit 一次都不成立。`,
      vars: { n, m, limit, compares, matches: [] },
      layers: snap({}),
    }));
    return die('模式串比主串长：一个合法起点都没有，返回空列表。');
  }

  for (let i = 0; i <= limit; i++) {
    const last = i + m - 1;
    steps.push(step({
      event: 'align', lineId: 'align',
      note: `起点 i = ${i}：对齐 t[${i}..${last}]。上一步即使命中过，起点也只 +1，不跳过重叠位置。`,
      vars: { n, m, limit, i, j: 0, compares, matches: [...matches], count: matches.length },
      layers: snap({ i, j: 0, at: i, window: [i, last], textRoles: { focus1: [i], done: [...matches] } }),
    }));

    let j = 0;
    while (j < m) {
      compares += 1;
      const k = i + j;
      if (T[k] === P[j]) {
        steps.push(step({
          event: 'compare', lineId: 'cmp',
          note: `t[${k}] = '${T[k]}' 与 p[${j}] = '${P[j]}' 相同：已匹配 ${j + 1} / ${m} 个字符。`,
          vars: { n, m, limit, i, j, compares, matches: [...matches], count: matches.length },
          layers: snap({ i, j, at: k, window: [i, last], textRoles: { focus1: [k], done: [...matches] }, patRoles: { done: range(0, j - 1) } }),
        }));
        j += 1;
      } else {
        steps.push(step({
          event: 'mismatch', lineId: 'cmp',
          note: `t[${k}] = '${T[k]}' 与 p[${j}] = '${P[j]}' 不同：这个起点不会命中，接着试下一个起点。`,
          vars: { n, m, limit, i, j, compares, matches: [...matches], count: matches.length },
          layers: snap({ i, j, at: k, window: [i, last], textRoles: { focus1: [k], swap: [k], done: [...matches] } }),
        }));
        break;
      }
    }

    if (j === m) {
      matches.push(i);
      steps.push(step({
        event: 'hit', lineId: 'hit',
        note: `起点 ${i} 命中（第 ${matches.length} 个）：记录后**不返回**，继续试 i+1，所以能与前一个命中重叠。`,
        vars: { n, m, limit, i, j, compares, matches: [...matches], count: matches.length },
        layers: snap({ i, window: [i, last], textRoles: { done: [...matches], focus1: [i] }, patRoles: { done: range(0, m - 1) } }),
      }));
      steps.push(step({
        event: 'shift', lineId: 'overlap',
        note: `起点 i → ${i + 1}：只挪一格而不是挪 m 格，重叠的候选位置不会被跳过（aaaa 查 aa 的三个起点就是这么来的）。`,
        vars: { n, m, limit, i: i + 1, j: null, compares, matches: [...matches], count: matches.length },
        layers: snap({ i: i + 1, window: [i + 1, Math.min(n - 1, i + 1 + m - 1)], textRoles: { done: [...matches], added: i + 1 <= limit ? [i + 1] : [] } }),
      }));
      continue;
    }

    steps.push(step({
      event: 'shift', lineId: 'shift',
      note: `起点 i → ${i + 1}：未命中，换下一个合法起点。`,
      vars: { n, m, limit, i: i + 1, j: null, compares, matches: [...matches], count: matches.length },
      layers: snap({ i: i + 1, window: [i + 1, Math.min(n - 1, i + 1 + m - 1)], textRoles: { done: [...matches], added: i + 1 <= limit ? [i + 1] : [] } }),
    }));
  }

  return die(matches.length
    ? `全量匹配结束：共 ${matches.length} 处命中 [${matches.join(', ')}]（含重叠），共比较 ${compares} 次。`
    : `[0, ${limit}] 的合法起点全部试完，共比较 ${compares} 次，没有任何命中。`);
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
