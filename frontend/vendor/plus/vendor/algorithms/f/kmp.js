/**
 * F · KMP（3 个代表性不同实现）
 *
 *   1) v1「next 前缀长度表」：next[j] = 以 j 结尾的最长相等真前后缀长度，失配回退 next[j-1]；
 *   2) v2「nextval 优化版」：在前缀表上再派生一层跳表，跳过"退过去字符还一样"的注定失败位置；
 *   3) v3「自动机（DFA）版」：把模式编译成状态转移表，扫描时只查表、没有 while 回退（空间换时间）。
 *
 * 三层（style 1 数组）分工：主串 t[] / 模式 p[] / 预处理表（next、nextval，或 dfa 的当前行）。
 * 约定：空模式返回下标 0（不扫描主串）；匹配包含重叠——v1/v2 命中后回退 next[m-1]，v3 用状态 m 那一行继续。
 */

import { trace, step, arrayLayer } from '../../engine/model.js';

export const meta = {
  id: 'f/kmp',
  variants: [
    { id: 'v1', name: 'next 前缀长度表' },
    { id: 'v2', name: 'nextval 优化版' },
    { id: 'v3', name: '自动机（DFA）版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void kmp(char t[], int n, char p[], int m) {' },
    { lineId: 'build-init', text: '  int next[MAXP]; next[0] = 0;      /* 长度 1 的前缀没有真前后缀 */' },
    { lineId: 'build-for', text: '  for (int i = 1, j = 0; i < m; ++i) {' },
    { lineId: 'build-while', text: '    while (j > 0 && p[i] != p[j]) j = next[j - 1];' },
    { lineId: 'build-set', text: '    if (p[i] == p[j]) ++j;  next[i] = j;   /* 以 i 结尾的最长相等真前后缀 */' },
    { lineId: 'build-end', text: '  }' },
    { lineId: 'scan-init', text: '  int j = 0;                        /* 主串指针 i 永不回溯 */' },
    { lineId: 'scan-for', text: '  for (int i = 0; i < n; ++i) {' },
    { lineId: 'scan-while', text: '    while (j > 0 && t[i] != p[j]) j = next[j - 1];' },
    { lineId: 'scan-if', text: '    if (t[i] == p[j]) ++j;' },
    { lineId: 'hit', text: '    if (j == m) { report(i - m + 1); j = next[m - 1]; }  /* 继续找重叠 */' },
    { lineId: 'scan-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void kmp_nextval(char t[], int n, char p[], int m) {' },
    { lineId: 'build-init', text: '  int next[MAXP], nextval[MAXP]; next[0] = 0;' },
    { lineId: 'build-for', text: '  for (int i = 1, j = 0; i < m; ++i) {' },
    { lineId: 'build-while', text: '    while (j > 0 && p[i] != p[j]) j = next[j - 1];' },
    { lineId: 'build-set', text: '    if (p[i] == p[j]) ++j;  next[i] = j;   /* 与 v1 同一张前缀表 */' },
    { lineId: 'build-end', text: '  }' },
    { lineId: 'opt-init', text: '  nextval[0] = 0;                  /* 派生"一次跳到位"的跳表 */' },
    { lineId: 'opt-for', text: '  for (int k = 1; k < m; ++k) {' },
    { lineId: 'opt-if', text: '    nextval[k] = (p[k] == p[next[k - 1]]) ? nextval[next[k - 1]] : next[k - 1];' },
    { lineId: 'opt-end', text: '  }   /* 退过去字符若还相同，就再跳一次：省掉注定失败的比较 */' },
    { lineId: 'scan-init', text: '  int j = 0;' },
    { lineId: 'scan-for', text: '  for (int i = 0; i < n; ++i) {' },
    { lineId: 'scan-while', text: '    while (j > 0 && t[i] != p[j]) j = nextval[j];  /* 一次跳到"字符不同"的位置 */' },
    { lineId: 'scan-if', text: '    if (t[i] == p[j]) ++j;' },
    { lineId: 'hit', text: '    if (j == m) { report(i - m + 1); j = next[m - 1]; }' },
    { lineId: 'scan-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void kmp_dfa(char t[], int n, char p[], int m) {' },
    { lineId: 'alpha', text: '  /* 字母表 = 模式里出现过的字符；推导前先算一遍 next 前缀表 */' },
    { lineId: 'dfa-init', text: '  int dfa[MAXM + 1][26] = {0};' },
    { lineId: 'dfa-base', text: '  for (每个字符 c) dfa[0][c] = (c == p[0]);        /* 状态 0 只认首字符 */' },
    { lineId: 'dfa-for', text: '  for (int q = 1; q < m; ++q)' },
    { lineId: 'dfa-row', text: '    for (每个字符 c) dfa[q][c] = (c == p[q]) ? q + 1 : dfa[next[q - 1]][c];' },
    { lineId: 'dfa-m', text: '  for (每个字符 c) dfa[m][c] = dfa[next[m - 1]][c];   /* 已匹配状态继续找重叠 */' },
    { lineId: 'scan-init', text: '  int q = 0;                        /* 状态 = 当前已匹配长度 */' },
    { lineId: 'scan-for', text: '  for (int i = 0; i < n; ++i) {' },
    { lineId: 'scan-step', text: '    q = dfa[q][t[i]];               /* 查一次表，没有 while 回退 */' },
    { lineId: 'hit', text: '    if (q == m) report(i - m + 1);  /* 下一字符自动从状态 m 的行继续 */' },
    { lineId: 'scan-end', text: '  }' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: "text='ababaca' / pattern='ababaca'（next = [0,0,1,2,3,0,1]）",
    input: { text: 'ababaca', pattern: 'ababaca' },
    expect: { next: [0, 0, 1, 2, 3, 0, 1], matches: [0] },
    expectByVariant: {
      v1: { next: [0, 0, 1, 2, 3, 0, 1], matches: [0] },
      v2: { next: [0, 0, 1, 2, 3, 0, 1], nextval: [0, 0, 0, 0, 0, 3, 0], matches: [0] },
      v3: {
        next: [0, 0, 1, 2, 3, 0, 1],
        alphabet: ['a', 'b', 'c'],
        dfa: [
          [1, 0, 0],
          [1, 2, 0],
          [3, 0, 0],
          [1, 4, 0],
          [5, 0, 0],
          [1, 4, 6],
          [7, 0, 0],
          [1, 2, 0],
        ],
        matches: [0],
      },
    },
  },
  {
    id: 'normal-overlap',
    label: "text='aaaa' / pattern='aa'（重叠匹配 [0,1,2]）",
    input: { text: 'aaaa', pattern: 'aa' },
    expect: { next: [0, 1], matches: [0, 1, 2] },
    expectByVariant: {
      v1: { next: [0, 1], matches: [0, 1, 2] },
      v2: { next: [0, 1], nextval: [0, 0], matches: [0, 1, 2] },
      v3: { next: [0, 1], alphabet: ['a'], dfa: [[1], [2], [2]], matches: [0, 1, 2] },
    },
  },
  {
    id: 'edge-empty-pattern',
    label: "pattern=''（空模式约定返回下标 0）",
    input: { text: 'ababaca', pattern: '' },
    expect: { next: [], matches: [0] },
    expectByVariant: {
      v1: { next: [], matches: [0] },
      v2: { next: [], nextval: [], matches: [0] },
      v3: { next: [], alphabet: [], dfa: [], matches: [0] },
    },
  },
  {
    id: 'edge-none',
    label: "text='abcabx' / pattern='abcay'（无匹配，且真的走到回退）",
    input: { text: 'abcabx', pattern: 'abcay' },
    expect: { next: [0, 0, 0, 1, 0], matches: [] },
    expectByVariant: {
      v1: { next: [0, 0, 0, 1, 0], matches: [] },
      v2: { next: [0, 0, 0, 1, 0], nextval: [0, 0, 0, 0, 1], matches: [] },
      v3: {
        next: [0, 0, 0, 1, 0],
        alphabet: ['a', 'b', 'c', 'y'],
        dfa: [
          [1, 0, 0, 0],
          [1, 2, 0, 0],
          [1, 0, 3, 0],
          [4, 0, 0, 0],
          [1, 2, 0, 5],
          [1, 0, 0, 0],
        ],
        matches: [],
      },
    },
  },
];

/* ------------------------------------------------------------------ 三个图层（每步重建） */

function panels(o) {
  const chars = [...String(o.text ?? '')];
  const pchars = [...String(o.pattern ?? '')];
  const table = o.table || [];

  const tRoles = {};
  if ((o.marked || []).length) tRoles.done = [...o.marked];
  if (o.i != null && o.i >= 0) {
    tRoles.focus1 = [o.i];
    tRoles.pointers = [{ id: 'i', label: 'i', index: o.i }];
  }
  const pRoles = {};
  if ((o.patternFocus || []).length) pRoles.focus1 = [...o.patternFocus];
  if ((o.patternPointers || []).length) pRoles.pointers = o.patternPointers.map((p) => ({ ...p }));
  const tRoles2 = {};
  if ((o.tableFocus || []).length) tRoles2.focus1 = [...o.tableFocus];
  if ((o.tablePointers || []).length) tRoles2.pointers = o.tablePointers.map((p) => ({ ...p }));

  return [
    arrayLayer({
      id: 'text', title: '主串 t[]', name: `char t[${chars.length}]`,
      values: chars, labels: chars.map((_, k) => String(k)), roles: tRoles,
    }),
    arrayLayer({
      id: 'pattern', title: '模式 p[]', name: `char p[${pchars.length}]`,
      values: pchars, labels: pchars.map((_, k) => String(k)), roles: pRoles,
    }),
    arrayLayer({
      id: 'table', title: o.tableTitle || 'next[m]', name: o.tableName || 'int next[m]',
      values: table.map((v) => (v == null ? '·' : String(v))),
      labels: (o.tableLabels || table.map((_, k) => String(k))).slice(),
      roles: tRoles2,
    }),
  ];
}

/**
 * 前缀表：next[j] = 以 j 结尾的最长相等真前后缀长度（v1/v2 共用这一套 lineId）。
 * mk(args) → step 对象；返回 { steps, tail }，tail = next[m-1]（命中后回退用它）。
 */
function buildPrefixTable({ pattern, next, mk }) {
  const m = pattern.length;
  let j = 0;
  next[0] = 0;
  const steps = [];
  steps.push(mk({
    event: 'build-table', lineId: 'build-init', cell: 0, j: 0,
    note: `建表：next[0] = 0 —— 长度 1 的前缀找不到真前后缀。接着 i 从 1 走到 ${m - 1}，j 是"当前候选前后缀长度"。`,
  }));
  for (let i = 1; i < m; i++) {
    while (j > 0 && pattern[i] !== pattern[j]) {
      const nj = next[j - 1];
      steps.push(mk({
        event: 'fallback', lineId: 'build-while', cell: i, j: nj,
        note: `建表回退：p[${i}]='${pattern[i]}' 与"接续位置" p[${j}]='${pattern[j]}' 不等，候选长度退到 next[${j - 1}] = ${nj}，去试更短的前后缀。`,
      }));
      j = nj;
    }
    const grew = pattern[i] === pattern[j];
    if (grew) j++;
    next[i] = j;
    steps.push(mk({
      event: 'table-value', lineId: 'build-set', cell: i, j,
      note: grew
        ? `p[${i}]='${pattern[i]}' 与 p[${j - 1}]='${pattern[j - 1]}' 相同：前后缀延长一格，next[${i}] = ${j}。`
        : `p[${i}]='${pattern[i]}' 与 p[${j}]='${j < m ? pattern[j] : '∅'}' 不同：以 ${i} 结尾的最长相等真前后缀长度只能是 ${j}。`,
    }));
  }
  return { steps, tail: j };
}

/* ------------------------------------------------------------------ 变体 1：next 前缀长度表 */

function runV1(input) {
  const text = String(input.text ?? '');
  const pattern = String(input.pattern ?? '');
  const n = text.length;
  const m = pattern.length;
  const L = LINES.v1;
  const next = new Array(m).fill(null);
  const matches = [];
  const marked = [];
  let cmp = 0;
  const steps = [];
  const P = (o = {}) => panels({ text, pattern, table: next, tableTitle: 'next[m]', tableName: 'int next[m]', marked, ...o });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: m === 0
      ? `n=${n}、m=0：空模式不需要建表也不需要扫描，随后按约定直接给出匹配下标 0。`
      : `n=${n}，m=${m}。KMP 分两趟：先用模式给自己建 next 表，再让主串指针只前进地扫描（失配只动模式下标 j）。`,
    vars: { n, m, i: null, j: null, hits: 0, cmp },
    layers: P({}),
  }));

  if (m === 0) {
    matches.push(0);
    const result = { next: [], matches: [...matches] };
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note: '空模式：按约定直接返回下标 0，不建表也不扫描主串（空串是任何串的前缀）。',
      vars: { n, m, i: null, j: null, hits: 1, cmp },
      layers: P({}),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'kmp-v1', lines: L, steps, result, meta: { comparisons: cmp } });
  }

  const built = buildPrefixTable({
    pattern, next,
    mk: ({ event, lineId, note, cell, j }) => step({
      event, lineId, note,
      vars: { n, m, i: null, cell, j, hits: matches.length, cmp },
      layers: P({
        patternFocus: [cell, j],
        patternPointers: [{ id: 'i', label: 'i', index: cell }, { id: 'j', label: 'j', index: j }],
        tableFocus: [cell],
        tablePointers: [{ id: 'i', label: 'i', index: cell }],
      }),
    }),
  });
  steps.push(...built.steps);
  const tail = built.tail;

  let j = 0;
  steps.push(step({
    event: 'init', lineId: 'scan-init',
    note: `next 表建好：${JSON.stringify(next)}。开始扫描：i 只前进，j = 已匹配长度；失配时把 j 退到 next[j-1]，而不是把 i 往后挪。`,
    vars: { n, m, i: 0, j: 0, hits: 0, cmp },
    layers: P({ i: 0, patternFocus: [0], patternPointers: [{ id: 'j', label: 'j', index: 0 }], tablePointers: [{ id: 'j', label: 'j', index: 0 }] }),
  }));

  for (let i = 0; i < n; i++) {
    while (j > 0 && text[i] !== pattern[j]) {
      cmp++;
      const nj = next[j - 1];
      steps.push(step({
        event: 'mismatch', lineId: 'scan-while',
        note: `t[${i}]='${text[i]}' 与 p[${j}]='${pattern[j]}' 失配：主串指针不动，只把模式窗口右移，j 应退到 next[${j - 1}] = ${nj}。`,
        vars: { n, m, i, j: nj, hits: matches.length, cmp },
        layers: P({
          i, patternFocus: [j, nj],
          patternPointers: [{ id: 'j', label: 'j', index: nj }],
          tableFocus: [j - 1], tablePointers: [{ id: 'j', label: 'j', index: j - 1 }],
        }),
      }));
      steps.push(step({
        event: 'fallback', lineId: 'scan-while',
        note: `回退完成：改用 p[${nj}] 对齐 t[${i}]。t[0..${i - 1}] 里已经确认过的相等关系被复用了，这正是 KMP 比朴素匹配快的原因。`,
        vars: { n, m, i, j: nj, hits: matches.length, cmp },
        layers: P({ i, patternFocus: [nj], patternPointers: [{ id: 'j', label: 'j', index: nj }] }),
      }));
      j = nj;
    }
    const eq = pattern[j] === text[i];
    cmp++;
    steps.push(step({
      event: 'compare', lineId: 'scan-if',
      note: eq
        ? `t[${i}]='${text[i]}' 与 p[${j}]='${pattern[j]}' 相同：已匹配长度从 ${j} 变成 ${j + 1}。`
        : `t[${i}]='${text[i]}' 与 p[0]='${pattern[0]}' 也不等：这个对齐起点作废，i 前进一位重新开始。`,
      vars: { n, m, i, j: eq ? j + 1 : j, hits: matches.length, cmp },
      layers: P({ i, patternFocus: [j], patternPointers: [{ id: 'j', label: 'j', index: j }], tablePointers: [{ id: 'j', label: 'j', index: j }] }),
    }));
    if (eq) j++;
    if (j === m) {
      const start = i - m + 1;
      matches.push(start);
      for (let k = start; k <= i; k++) marked.push(k);
      j = tail;
      steps.push(step({
        event: 'hit', lineId: 'hit',
        note: `j == m：起点 ${start} 处完整匹配。为了还能找出重叠匹配，j 退到 next[${m - 1}] = ${j} 而不是退回 0，主串继续前进。`,
        vars: { n, m, i, j, hits: matches.length, cmp },
        layers: P({ i, marked: [...marked], patternFocus: [j], patternPointers: [{ id: 'j', label: 'j', index: j }] }),
      }));
    }
  }

  const result = { next: next.map((v) => v ?? 0), matches: [...matches] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: matches.length
      ? `扫描结束：匹配起点 [${matches.join(', ')}]，共比较 ${cmp} 次。next 表 = ${JSON.stringify(result.next)}。`
      : `扫描结束：没有匹配，共比较 ${cmp} 次。next 表 = ${JSON.stringify(result.next)}。`,
    vars: { n, m, i: null, j: null, hits: matches.length, cmp },
    layers: P({ marked: [...marked] }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'kmp-v1', lines: L, steps, result, meta: { comparisons: cmp, next: result.next, matches: result.matches } });
}

/* ------------------------------------------------------------------ 变体 2：nextval 优化版 */

function runV2(input) {
  const text = String(input.text ?? '');
  const pattern = String(input.pattern ?? '');
  const n = text.length;
  const m = pattern.length;
  const L = LINES.v2;
  const next = new Array(m).fill(null);
  const nextval = new Array(m).fill(null);
  const matches = [];
  const marked = [];
  let cmp = 0;
  let skipped = 0;
  const steps = [];
  const P = (o = {}) => panels({ text, pattern, table: next, tableTitle: 'next[m]', tableName: 'int next[m]', marked, ...o });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: m === 0
      ? `n=${n}、m=0：空模式无需派生 nextval，随后按约定直接给出匹配下标 0。`
      : `n=${n}，m=${m}。这一版比 v1 多一趟：先建 next 前缀表，再派生 nextval 跳表，让失配时一次跳到"字符确实不同"的位置。`,
    vars: { n, m, i: null, j: null, hits: 0, cmp, skipped },
    layers: P({}),
  }));

  if (m === 0) {
    matches.push(0);
    const result = { next: [], nextval: [], matches: [...matches] };
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note: '空模式：按约定直接返回下标 0，两张表都是空的。',
      vars: { n, m, i: null, j: null, hits: 1, cmp, skipped },
      layers: P({}),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'kmp-nextval-v1', lines: L, steps, result, meta: { comparisons: cmp } });
  }

  const built = buildPrefixTable({
    pattern, next,
    mk: ({ event, lineId, note, cell, j }) => step({
      event, lineId, note,
      vars: { n, m, i: null, cell, j, hits: matches.length, cmp, skipped },
      layers: P({
        patternFocus: [cell, j],
        patternPointers: [{ id: 'i', label: 'i', index: cell }, { id: 'j', label: 'j', index: j }],
        tableFocus: [cell],
        tablePointers: [{ id: 'i', label: 'i', index: cell }],
      }),
    }),
  });
  steps.push(...built.steps);
  const tail = built.tail;

  // 派生 nextval
  nextval[0] = 0;
  steps.push(step({
    event: 'build-table', lineId: 'opt-init',
    note: `前缀表就绪：${JSON.stringify(next)}。现在派生 nextval[0] = 0，逐位回答"退到哪儿才不必再比一次相同字符"。`,
    vars: { n, m, i: null, k: 0, hits: 0, cmp, skipped },
    layers: P({ table: next, tableTitle: 'next[m]', tableName: 'int next[m]', tableFocus: [0], tablePointers: [{ id: 'k', label: 'k', index: 0 }] }),
  }));
  for (let k = 1; k < m; k++) {
    const base = next[k - 1];
    const same = pattern[k] === pattern[base];
    nextval[k] = same ? nextval[base] : base;
    if (same) skipped++;
    steps.push(step({
      event: 'table-value', lineId: 'opt-if',
      note: same
        ? `p[${k}]='${pattern[k]}' 与回退目标 p[${base}]='${pattern[base]}' 相同：退到 ${base} 还会在同字符上再失败一次，于是继续借 nextval[${base}] = ${nextval[k]}，这一位被跳过。`
        : `p[${k}]='${pattern[k]}' 与回退目标 p[${base}]='${pattern[base] ?? '∅'}' 不同：退到 ${base} 就能立刻比出结果，nextval[${k}] = ${nextval[k]}。`,
      vars: { n, m, i: null, k, base, hits: 0, cmp, skipped },
      layers: P({
        table: nextval, tableTitle: 'nextval[m]', tableName: 'int nextval[m]',
        patternFocus: [k, base],
        patternPointers: [{ id: 'k', label: 'k', index: k }, { id: 'next[k-1]', label: 'next[k-1]', index: base }],
        tableFocus: [k], tablePointers: [{ id: 'k', label: 'k', index: k }],
      }),
    }));
  }

  let j = 0;
  steps.push(step({
    event: 'init', lineId: 'scan-init',
    note: `nextval 表：${JSON.stringify(nextval)}。扫描时失配就用它一次跳到位——同样的主串会少做 ${skipped} 次注定失败的比较。`,
    vars: { n, m, i: 0, j: 0, hits: 0, cmp, skipped },
    layers: P({ i: 0, table: nextval, tableTitle: 'nextval[m]', tableName: 'int nextval[m]', patternFocus: [0], patternPointers: [{ id: 'j', label: 'j', index: 0 }] }),
  }));

  for (let i = 0; i < n; i++) {
    while (j > 0 && text[i] !== pattern[j]) {
      cmp++;
      const nj = nextval[j];
      steps.push(step({
        event: 'mismatch', lineId: 'scan-while',
        note: `t[${i}]='${text[i]}' 与 p[${j}]='${pattern[j]}' 失配：查 nextval[${j}] = ${nj}，直接跳过"退过去还是同一个字符"的那些位置。`,
        vars: { n, m, i, j: nj, hits: matches.length, cmp, skipped },
        layers: P({
          i, table: nextval, tableTitle: 'nextval[m]', tableName: 'int nextval[m]',
          patternFocus: [j, nj], patternPointers: [{ id: 'j', label: 'j', index: nj }],
          tableFocus: [j], tablePointers: [{ id: 'j', label: 'j', index: j }],
        }),
      }));
      steps.push(step({
        event: 'fallback', lineId: 'scan-while',
        note: `一步到 ${nj}：p[${nj}] 与 t[${i}] 的这次比较才有意义，中间的"重复失败"被跳表省掉了。`,
        vars: { n, m, i, j: nj, hits: matches.length, cmp, skipped },
        layers: P({ i, table: nextval, tableTitle: 'nextval[m]', tableName: 'int nextval[m]', patternFocus: [nj], patternPointers: [{ id: 'j', label: 'j', index: nj }] }),
      }));
      j = nj;
    }
    const eq = pattern[j] === text[i];
    cmp++;
    steps.push(step({
      event: 'compare', lineId: 'scan-if',
      note: eq
        ? `t[${i}]='${text[i]}' 与 p[${j}]='${pattern[j]}' 相同：已匹配长度变成 ${j + 1}。`
        : `t[${i}]='${text[i]}' 与 p[0]='${pattern[0]}' 不等：起点作废，i 前进。`,
      vars: { n, m, i, j: eq ? j + 1 : j, hits: matches.length, cmp, skipped },
      layers: P({
        i, table: nextval, tableTitle: 'nextval[m]', tableName: 'int nextval[m]',
        patternFocus: [j], patternPointers: [{ id: 'j', label: 'j', index: j }],
        tablePointers: [{ id: 'j', label: 'j', index: j }],
      }),
    }));
    if (eq) j++;
    if (j === m) {
      const start = i - m + 1;
      matches.push(start);
      for (let k = start; k <= i; k++) marked.push(k);
      j = tail; // 重叠匹配要退回"真前后缀"，不能用 nextval（它会跳过重叠位置）
      steps.push(step({
        event: 'hit', lineId: 'hit',
        note: `j == m：起点 ${start} 匹配。这里必须退回 next[${m - 1}] = ${j}（前缀表而不是跳表），否则会漏掉重叠匹配。`,
        vars: { n, m, i, j, hits: matches.length, cmp, skipped },
        layers: P({ i, marked: [...marked], table: nextval, tableTitle: 'nextval[m]', tableName: 'int nextval[m]', patternFocus: [j], patternPointers: [{ id: 'j', label: 'j', index: j }] }),
      }));
    }
  }

  const result = { next: next.map((v) => v ?? 0), nextval: nextval.map((v) => v ?? 0), matches: [...matches] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: matches.length
      ? `扫描结束：匹配起点 [${matches.join(', ')}]，共比较 ${cmp} 次（nextval 跳过 ${skipped} 个无效回退位）。`
      : `扫描结束：没有匹配，共比较 ${cmp} 次（nextval 跳过 ${skipped} 个无效回退位）。`,
    vars: { n, m, i: null, j: null, hits: matches.length, cmp, skipped },
    layers: P({ marked: [...marked], table: nextval, tableTitle: 'nextval[m]', tableName: 'int nextval[m]' }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'kmp-nextval-v1', lines: L, steps, result, meta: { comparisons: cmp, skipped } });
}

/* ------------------------------------------------------------------ 变体 3：自动机（DFA）版 */

function runV3(input) {
  const text = String(input.text ?? '');
  const pattern = String(input.pattern ?? '');
  const n = text.length;
  const m = pattern.length;
  const L = LINES.v3;
  const alphabet = [...new Set([...pattern])].sort();
  const dfa = [];
  const matches = [];
  const marked = [];
  let cmp = 0;
  const steps = [];
  const P = (o = {}) => panels({ text, pattern, table: [], tableTitle: 'dfa[state][char]', tableName: `int dfa[${m + 1}][${alphabet.length}]`, tableLabels: alphabet, marked, ...o });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: m === 0
      ? `n=${n}、m=0：空模式没有状态需要编译，随后按约定直接给出匹配下标 0。`
      : `n=${n}，m=${m}。这一版不在扫描时回退：先把模式编译成"状态 × 字符"的转移表，扫描时每个字符只查一次表。`,
    vars: { n, m, i: null, q: null, hits: 0, cmp },
    layers: P({}),
  }));

  if (m === 0) {
    matches.push(0);
    const result = { next: [], alphabet: [], dfa: [], matches: [...matches] };
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note: '空模式：按约定直接返回下标 0，没有状态需要编译。',
      vars: { n, m, i: null, q: null, hits: 1, cmp },
      layers: P({}),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'kmp-dfa-v1', lines: L, steps, result, meta: { comparisons: cmp } });
  }

  // 推导转移表需要前缀表：内部算一遍，不逐步展示（本变体的重点是转移表）
  const pi = new Array(m).fill(0);
  for (let i = 1, j = 0; i < m; i++) {
    while (j > 0 && pattern[i] !== pattern[j]) j = pi[j - 1];
    if (pattern[i] === pattern[j]) j++;
    pi[i] = j;
  }
  const tail = pi[m - 1];

  steps.push(step({
    event: 'build-table', lineId: 'alpha',
    note: `字母表取模式里出现过的字符 [${alphabet.join(', ')}]，表只需要这几列；内部先算好前缀表 π = ${JSON.stringify(pi)}，它是推导转移的依据。`,
    vars: { n, m, i: null, q: 0, hits: 0, cmp },
    layers: P({ patternFocus: [0], patternPointers: [{ id: 'q', label: 'q', index: 0 }] }),
  }));

  dfa.push(alphabet.map((c) => (c === pattern[0] ? 1 : 0)));
  steps.push(step({
    event: 'table-value', lineId: 'dfa-base',
    note: `状态 0（什么都没匹配上）：只有读到 p[0]='${pattern[0]}' 才进状态 1，其它字符留在 0。`,
    vars: { n, m, i: null, q: 0, hits: 0, cmp },
    layers: P({ table: dfa[0], tableTitle: 'dfa[0][]', tableFocus: alphabet.map((_, k) => k), tablePointers: [{ id: 'q', label: 'q=0', index: 0 }] }),
  }));

  for (let q = 1; q < m; q++) {
    const row = alphabet.map((c, idx) => (c === pattern[q] ? q + 1 : dfa[pi[q - 1]][idx]));
    dfa.push(row);
    steps.push(step({
      event: 'table-value', lineId: 'dfa-row',
      note: `状态 ${q}（已匹配前 ${q} 个字符）：读到 p[${q}]='${pattern[q]}' 进状态 ${q + 1}；读别的字符时"等价于站在 π[${q - 1}] = ${pi[q - 1]} 号状态"，直接抄那一行——所以查表一步到位，不需要回退循环。`,
      vars: { n, m, i: null, q, hits: 0, cmp },
      layers: P({
        table: dfa[q], tableTitle: `dfa[${q}][]`,
        patternFocus: [q, pi[q - 1]],
        patternPointers: [{ id: 'q', label: 'q', index: q }, { id: 'π[q-1]', label: 'π[q-1]', index: pi[q - 1] }],
        tableFocus: alphabet.map((_, k) => k),
      }),
    }));
  }

  dfa.push(alphabet.map((c, idx) => dfa[tail][idx]));
  steps.push(step({
    event: 'table-value', lineId: 'dfa-m',
    note: `补上状态 m=${m} 这一行（就是 π[${m - 1}] = ${tail} 号状态的行）：命中之后还能从这里继续，重叠匹配不会漏。`,
    vars: { n, m, i: null, q: m, hits: 0, cmp },
    layers: P({
      table: dfa[m], tableTitle: `dfa[${m}][]`,
      patternFocus: [m - 1], patternPointers: [{ id: 'q', label: 'q=m', index: m - 1 }],
      tableFocus: alphabet.map((_, k) => k),
    }),
  }));

  let q = 0;
  steps.push(step({
    event: 'init', lineId: 'scan-init',
    note: '转移表编好：现在扫描只剩"读一个字符、查一次表"。主串指针 i 只前进，j 的角色换成了状态 q。',
    vars: { n, m, i: 0, q: 0, hits: 0, cmp },
    layers: P({ i: 0, table: dfa[0], tableTitle: 'dfa[0][]', tablePointers: [{ id: 'q', label: 'q=0', index: 0 }] }),
  }));

  for (let i = 0; i < n; i++) {
    const c = text[i];
    const col = alphabet.indexOf(c);
    const nq = col < 0 ? 0 : dfa[q][col];
    const event = col < 0 || (q === 0 && nq === 0) ? 'mismatch' : nq < q ? 'fallback' : 'compare';
    cmp++;
    let note;
    if (col < 0) {
      note = `t[${i}]='${c}' 不在字母表里：模式中根本没有这个字符，无论当前状态几都直接归零。`;
    } else if (q === m) {
      note = `状态已到 m（上一字符处刚命中）：dfa[${m}]['${c}'] = ${nq} 等价于从 π[${m - 1}] = ${tail} 号状态继续，所以重叠匹配接着被找出来。`;
    } else if (q === 0 && nq === 0) {
      note = `查表 dfa[0]['${c}'] = 0：连 p[0]='${pattern[0]}' 都不等，状态停在 0，相当于起点右移一格。`;
    } else if (nq === q + 1) {
      note = `查表 dfa[${q}]['${c}'] = ${nq}：与 p[${q}]='${pattern[q]}' 相同，已匹配长度加一。`;
    } else {
      note = `查表 dfa[${q}]['${c}'] = ${nq}：状态直接落到 ${nq}，没有 while 回退循环——回退信息在编表时就消化掉了。`;
    }
    steps.push(step({
      event, lineId: 'scan-step', note,
      vars: { n, m, i, q: nq, prev: q, hits: matches.length, cmp },
      layers: P({
        i, table: dfa[nq], tableTitle: `dfa[${nq}][]`,
        tableFocus: col < 0 ? [] : [col],
        tablePointers: [{ id: 'q', label: `q=${nq}`, index: 0 }],
      }),
    }));
    q = nq;
    if (q === m) {
      const start = i - m + 1;
      matches.push(start);
      for (let k = start; k <= i; k++) marked.push(k);
      steps.push(step({
        event: 'hit', lineId: 'hit',
        note: `状态达到 m：起点 ${start} 处匹配。下一字符从状态 m 那一行继续读，不需要任何额外回退。`,
        vars: { n, m, i, q, hits: matches.length, cmp },
        layers: P({ i, marked: [...marked], table: dfa[m], tableTitle: `dfa[${m}][]` }),
      }));
    }
  }

  const result = { next: [...pi], alphabet: [...alphabet], dfa: dfa.map((r) => [...r]), matches: [...matches] };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: matches.length
      ? `扫描结束：匹配起点 [${matches.join(', ')}]，共查表 ${cmp} 次（每个字符一次，与 m 无关）。`
      : `扫描结束：没有匹配，共查表 ${cmp} 次（每个字符一次，与 m 无关）。`,
    vars: { n, m, i: null, q, hits: matches.length, cmp },
    layers: P({ marked: [...marked], table: dfa[q], tableTitle: `dfa[${q}][]` }),
  }));

  return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'kmp-dfa-v1', lines: L, steps, result, meta: { lookups: cmp, dfaRows: dfa.length } });
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
