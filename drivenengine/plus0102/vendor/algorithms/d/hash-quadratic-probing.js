/**
 * D · 哈希平方探测（3 个代表性不同实现）
 *
 *   1) v1 正平方增量：探测序列 (h + i²) mod m，i = 0..m-1，撞满 m 次即判失败；
 *   2) v2 交替正负增量：(h ± i²) mod m，奇数 i 取正、偶数 i 取负 —— 素数表长下覆盖更全；
 *   3) v3 耗尽检测版：额外维护已访问槽集合 seen[]，一旦算出**访问过的槽**立刻报"探测序列耗尽"。
 *
 * 画面：style 1 一维数组当槽位表 —— `values` 是槽内容（空槽 '·'），
 * `labels` 是"下标:内容"（槽内容必须直接看得见，不能只靠颜色）。
 * 动画重点（目录 focus）：探测公式与 i 值、探测槽、重复访问、序列耗尽（即使表里还有空槽）。
 *
 * 关键教学点：m=7 时 +i² 的偏移序列是 0,1,4,2,2,4,1 —— **只有 4 个不同槽**。
 * 所以插入 0、7、14、21 之后表里还剩 3 个空槽，再插 28 却怎样都进不去：
 *   · v1 只会白撞 m 次然后报失败（它不知道自己在兜圈）；
 *   · v2 的 ±i² 偏移是 0,1,3,2,5,4,6（7 个全不同），28 因此能落进槽 5；
 *   · v3 在 i=4 第二次算出槽 2 时立刻报"探测序列耗尽"。
 * 三者在 edge-exhaust 上的合法差异用 expectByVariant 表达。
 *
 * result：{ table, placed, size, probes, exhausted, failed, placedSlot, foundSlot }
 *   placedSlot = 最后一次插入真正落到的槽（失败为 -1）；
 *   foundSlot  = 查找命中的槽（未查找或未命中为 -1）。
 */

import { trace, step, arrayLayer } from '../../engine/model.js';

export const meta = {
  id: 'd/hash-quadratic-probing',
  variants: [
    { id: 'v1', name: '正平方增量' },
    { id: 'v2', name: '交替正负增量' },
    { id: 'v3', name: '耗尽检测版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'int qp_insert(int T[], int m, int k) {' },
    { lineId: 'hash', text: '  int h = k % m;                        /* 起始槽 h(k) */' },
    { lineId: 'loop', text: '  for (int i = 0; i < m; ++i) {          /* i 最多到 m-1 */' },
    { lineId: 'probe', text: '    int s = (h + i * i) % m;             /* 正平方增量：只加 i² */' },
    { lineId: 'coll', text: '    if (T[s] != EMPTY && T[s] != k) continue;   /* 被占：i++ 重算，不是 +1 */' },
    { lineId: 'dup', text: '    if (T[s] == k) return s;             /* 重复键：不占新槽 */' },
    { lineId: 'place', text: '    T[s] = k; return s;                  /* 空槽：落位 */' },
    { lineId: 'fail', text: '  return -1;   /* m 次探测都撞上别的键 —— 本版只能判失败 */' },
    { lineId: 'findfn', text: 'int qp_find(int T[], int m, int k) {' },
    { lineId: 'find-hash', text: '  int h = k % m;' },
    { lineId: 'find-loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'find-probe', text: '    int s = (h + i * i) % m;           /* 必须与插入用同一序列 */' },
    { lineId: 'find-hit', text: '    if (T[s] == k) return s;' },
    { lineId: 'find-empty', text: '    if (T[s] == EMPTY) return -1;      /* 空槽：后面不会再有该键 */' },
    { lineId: 'find-miss', text: '  return -1;   /* m 次都没命中也没遇到空槽 */' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'int qp_insert_alt(int T[], int m, int k) {' },
    { lineId: 'hash', text: '  int h = k % m;' },
    { lineId: 'loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'sign', text: '    int d = (i % 2 == 1) ? +(i * i) : -(i * i);   /* 交替：奇数正、偶数负 */' },
    { lineId: 'probe', text: '    int s = ((h + d) % m + m) % m;       /* (h ± i²) mod m，负数先归一 */' },
    { lineId: 'coll', text: '    if (T[s] != EMPTY && T[s] != k) continue;   /* 被占：换符号重算下一个槽 */' },
    { lineId: 'dup', text: '    if (T[s] == k) return s;' },
    { lineId: 'place', text: '    T[s] = k; return s;' },
    { lineId: 'fail', text: '  return -1;' },
    { lineId: 'findfn', text: 'int qp_find_alt(int T[], int m, int k) {' },
    { lineId: 'find-hash', text: '  int h = k % m;' },
    { lineId: 'find-loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'find-probe', text: '    int d = (i % 2 == 1) ? +(i*i) : -(i*i);' },
    { lineId: 'find-hit', text: '    int s = ((h + d) % m + m) % m; if (T[s] == k) return s;' },
    { lineId: 'find-empty', text: '    if (T[s] == EMPTY) return -1;' },
    { lineId: 'find-miss', text: '  } return -1;' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'int qp_insert_guard(int T[], int m, int k) {' },
    { lineId: 'hash', text: '  int h = k % m;' },
    { lineId: 'seen', text: '  bool seen[MAXM] = { false };            /* 记录本次插入访问过的槽 */' },
    { lineId: 'loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'probe', text: '    int s = (h + i * i) % m;               /* 与 v1 同一序列 */' },
    { lineId: 'repeat', text: '    if (seen[s]) return EXHAUSTED;         /* 访问过 → 探测序列耗尽 */' },
    { lineId: 'mark', text: '    seen[s] = true;' },
    { lineId: 'coll', text: '    if (T[s] != EMPTY && T[s] != k) continue;' },
    { lineId: 'dup', text: '    if (T[s] == k) return s;' },
    { lineId: 'place', text: '    T[s] = k; return s;' },
    { lineId: 'fail', text: '  return -1;   /* m 次既没重复也没空槽：表真的满了 */' },
    { lineId: 'findfn', text: 'int qp_find_guard(int T[], int m, int k) {' },
    { lineId: 'find-hash', text: '  int h = k % m;   bool seen[MAXM] = { false };' },
    { lineId: 'find-loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'find-probe', text: '    int s = (h + i * i) % m; if (seen[s]) return -1; seen[s] = true;' },
    { lineId: 'find-hit', text: '    if (T[s] == k) return s;' },
    { lineId: 'find-empty', text: '    if (T[s] == EMPTY) return -1;' },
    { lineId: 'find-miss', text: '  } return -1;' },
    { lineId: 'end', text: '}' },
  ],
};

const EMPTY = '·';
const mod = (x, m) => ((x % m) + m) % m;
const show = (v) => (v == null ? EMPTY : String(v));

/** 一步一个完整快照：槽内容与 labels 全部重建（禁止复用同一个数组） */
function layersOf(table, roles = {}) {
  const values = table.map(show);
  return [arrayLayer({
    id: 'main',
    title: `哈希表 T[0..${table.length - 1}]`,
    name: 'int T[m]（· = 空槽；平方探测）',
    values,
    labels: values.map((v, i) => `${i}:${v}`),
    roles,
  })];
}

const CFG = {
  v1: {
    detect: false,
    offset: (i) => i * i,
    label: '+i²',
    ids: {
      fn: 'fn', hash: 'hash', probe: 'probe', coll: 'coll', dup: 'dup', place: 'place', fail: 'fail',
      findHash: 'find-hash', findProbe: 'find-probe', findColl: 'find-loop',
      hit: 'find-hit', missEmpty: 'find-empty', miss: 'find-miss', repeat: null, end: 'end',
    },
    initNote: (m) => `容量 m = ${m}，h(k) = k mod ${m}。v1 的探测序列是 (h + i²) mod ${m}，i = 0..${m - 1}。注意：平方增量并不保证走遍所有槽，只能"最多试 m 次"。`,
  },
  v2: {
    detect: false,
    offset: (i) => (i % 2 === 1 ? i * i : -(i * i)),
    label: '±i²',
    ids: {
      fn: 'fn', hash: 'hash', probe: 'probe', coll: 'sign', dup: 'dup', place: 'place', fail: 'fail',
      findHash: 'find-hash', findProbe: 'find-loop', findColl: 'find-probe',
      hit: 'find-hit', missEmpty: 'find-empty', miss: 'find-miss', repeat: null, end: 'end',
    },
    initNote: (m) => `容量 m = ${m}，h(k) = k mod ${m}。v2 把增量改成交替正负：(h ± i²) mod ${m}（奇数 i 加、偶数 i 减），负偏移先归一再用。表长取素数时，这套序列能覆盖整张表。`,
  },
  v3: {
    detect: true,
    offset: (i) => i * i,
    label: '+i²',
    ids: {
      fn: 'fn', hash: 'hash', probe: 'probe', coll: 'coll', dup: 'dup', place: 'place', fail: 'fail',
      findHash: 'find-hash', findProbe: 'find-probe', findColl: 'find-loop',
      hit: 'find-hit', missEmpty: 'find-empty', miss: 'find-miss', repeat: 'repeat', end: 'end',
    },
    initNote: (m) => `容量 m = ${m}，h(k) = k mod ${m}，探测序列与 v1 相同（+i²）。v3 多开一个 seen[]：每次算出槽先查"这次插入来过没有"，来过就说明序列开始兜圈 —— 立刻报"探测序列耗尽"，不再白撞。`,
  },
};

export const samples = [
  {
    id: 'normal',
    label: 'm=7 插入 0、7、14、21（同余键全撞 h=0，期望落槽 0、1、4、2）',
    input: { m: 7, keys: [0, 7, 14, 21] },
    expect: {
      table: ['0', '7', '21', '·', '14', '·', '·'],
      placed: { 0: 0, 7: 1, 14: 4, 21: 2 },
      size: 7, probes: 10, exhausted: false, failed: false,
    },
    // v2 的 ±i² 在 14 上走的是 0→1→3，比 v1 的 0→1→4 早一格落位
    expectByVariant: {
      v2: {
        table: ['0', '7', '21', '14', '·', '·', '·'],
        placed: { 0: 0, 7: 1, 14: 3, 21: 2 },
        size: 7, probes: 10, exhausted: false, failed: false,
      },
    },
  },
  {
    id: 'edge-exhaust',
    label: 'm=7 已落 0、7、14、21 后再插 28（表里还剩 3 个空槽，却都进不去）',
    input: { m: 7, keys: [0, 7, 14, 21, 28] },
    expect: {
      table: ['0', '7', '21', '·', '14', '·', '·'],
      placed: { 0: 0, 7: 1, 14: 4, 21: 2 },
      size: 7, probes: 17, exhausted: false, failed: true, placedSlot: -1,
    },
    expectByVariant: {
      // v2 的序列覆盖全部 7 个槽，28 走得进去
      v2: {
        table: ['0', '7', '21', '14', '·', '28', '·'],
        placed: { 0: 0, 7: 1, 14: 3, 21: 2, 28: 5 },
        size: 7, probes: 15, exhausted: false, failed: false, placedSlot: 5,
      },
      // v3 在 i=4 第二次算出槽 2 时就收手
      v3: {
        table: ['0', '7', '21', '·', '14', '·', '·'],
        placed: { 0: 0, 7: 1, 14: 4, 21: 2 },
        size: 7, probes: 15, exhausted: true, failed: true, placedSlot: -1,
      },
    },
  },
  {
    id: 'edge-empty',
    label: 'm=7 空表插入 7（h=0 就是空槽，一次探测落位）',
    input: { m: 7, keys: [7] },
    expect: {
      table: ['7', '·', '·', '·', '·', '·', '·'],
      placed: { 7: 0 },
      size: 7, probes: 1, exhausted: false, failed: false, placedSlot: 0,
    },
  },
  {
    id: 'edge-find',
    label: '插入 0、7、14、21 后查 21（沿同一序列命中槽 2）',
    input: { m: 7, keys: [0, 7, 14, 21], find: 21 },
    expect: { foundSlot: 2, probes: 14, failed: false, size: 7 },
  },
  {
    id: 'edge-find-miss',
    label: 'm=7 插 0 后查不存在的 9（h=2 是空槽，立刻判未命中）',
    input: { m: 7, keys: [0], find: 9 },
    expect: { foundSlot: -1, probes: 2, failed: false, size: 7 },
  },
];

/* ------------------------------------------------------------------ 平方探测核心 */

function runQP(variantId, input) {
  const cfg = CFG[variantId];
  const ids = cfg.ids;
  const L = LINES[variantId];
  const m = Number.isInteger(input.m) && input.m > 0 ? input.m : 7;
  const keys = (Array.isArray(input.keys) ? input.keys : []).map(Number);
  const findKey = input.find == null ? null : Number(input.find);

  const table = new Array(m).fill(null);
  const placed = {};
  const steps = [];
  let count = 0;
  let probes = 0;
  let exhausted = false;
  let failed = false;
  let placedSlot = -1;
  let foundSlot = -1;

  const occupied = () => table.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  const vars = (extra = {}) => ({ m, count, alpha: `${count}/${m}`, probes, ...extra });
  const layers = (roles = {}) => layersOf(table, { done: occupied(), ...roles });
  const push = (o) => steps.push(step(o));
  const ptrs = (key, h, i, slot) => [
    { id: 'h', label: `h(${key})=${h}`, index: h },
    { id: 'i', label: `i=${i}`, index: slot },
  ];
  const probeNote = (i, h, slot, cur, key) => {
    const off = cfg.offset(i);
    const formula = off < 0
      ? `(${h} − ${-off}) mod ${m}`
      : `(${h} + ${off}) mod ${m}`;
    return `i=${i}：槽 ${formula} = ${slot}，当前内容 ${cur == null ? '·（空槽）' : cur}${cur != null && cur !== key ? '（被占）' : ''}。`;
  };

  /* ---------------- 插入 */
  function insert(key) {
    placedSlot = -1;
    const h = mod(key, m);
    const seen = new Set();
    push({
      event: 'hash', lineId: ids.hash,
      note: `插入 ${key}：h(${key}) = ${key} mod ${m} = ${h}，从 i=0 的槽 ${h} 开始，增量用 ${cfg.label}。`,
      vars: vars({ key, h, i: 0 }),
      layers: layers({ focus1: [h], pointers: [{ id: 'h', label: `h(${key})=${h}`, index: h }] }),
    });
    for (let i = 0; i < m; i++) {
      const slot = mod(h + cfg.offset(i), m);
      probes += 1;
      if (cfg.detect && seen.has(slot)) {
        push({
          event: 'repeat-slot', lineId: ids.repeat,
          note: `i=${i} 算出槽 ${slot}，但本次插入已经访问过它（seen[${slot}] = true）：平方序列开始循环，再算下去只会重复同样的槽。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot], excluded: [...seen], pointers: ptrs(key, h, i, slot) }),
        });
        exhausted = true;
        failed = true;
        push({
          event: 'exhausted', lineId: ids.repeat,
          note: `探测序列耗尽：只走过 ${seen.size} 个不同槽，就回到了老路。表里还有 ${m - count} 个空槽 —— 但它们不在这条 (h+i²) 序列上，所以插不进去。正解是换探测序列（双散列）或扩容重散列，而不是等表满。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ excluded: [...seen] }),
        });
        return;
      }
      seen.add(slot);
      const cur = table[slot];
      push({
        event: 'probe', lineId: ids.probe,
        note: probeNote(i, h, slot, cur, key),
        vars: vars({ key, h, i, slot }),
        layers: layers({ focus1: [h], focus2: [slot], pointers: ptrs(key, h, i, slot) }),
      });
      if (cur === key) {
        placed[key] = slot;
        placedSlot = slot;
        push({
          event: 'hit', lineId: ids.dup,
          note: `槽 ${slot} 里已经是 ${key}：重复键不占新槽，count 保持 ${count}。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot] }),
        });
        return;
      }
      if (cur == null) {
        table[slot] = key;
        count += 1;
        placed[key] = slot;
        placedSlot = slot;
        push({
          event: 'place', lineId: ids.place,
          note: `槽 ${slot} 是空槽：${key} 落位，count = ${count}，装填因子 ${count}/${m}。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot], added: [slot], pointers: ptrs(key, h, i, slot) }),
        });
        return;
      }
      const revisited = i > 0 && seen.size < i + 1;
      push({
        event: 'collision', lineId: ids.coll,
        note: cfg.detect
          ? `槽 ${slot} 被 ${cur} 占着：冲突，i++ 重新算 (h+${(i + 1) * (i + 1)}) mod ${m}。`
          : variantId === 'v2'
            ? `槽 ${slot} 被 ${cur} 占着：冲突。i 变成 ${i + 1}，增量符号翻成 ${(i + 1) % 2 === 1 ? '正' : '负'}，下一槽 = (${h} ${(i + 1) % 2 === 1 ? '+' : '−'} ${(i + 1) * (i + 1)}) mod ${m} = ${mod(h + cfg.offset(i + 1), m)}。`
            : `槽 ${slot} 被 ${cur} 占着：冲突${revisited ? '，而且这个槽本次插入已经来过（序列在兜圈）' : ''}。下一槽由 (h+${(i + 1) * (i + 1)}) mod ${m} = ${mod(h + cfg.offset(i + 1), m)} 给出，不是 +1。`,
        vars: vars({ key, h, i, slot }),
        layers: layers({ focus1: [h], focus2: [slot], pointers: ptrs(key, h, i, slot) }),
      });
    }
    failed = true;
    push({
      event: 'miss',
      lineId: ids.fail,
      note: `i 走完 0..${m - 1} 共 ${m} 次，每次算出的槽都被别的键占着：${key} 插入失败。但注意表里其实还有 ${m - count} 个空槽 —— 平方探测"试 m 次"不等于"试遍全表"，v1 无法区分这两种失败。`,
      vars: vars({ key, i: m - 1, slot: null }),
      layers: layers({}),
    });
  }

  /* ---------------- 查找 */
  function lookup(key) {
    const h = mod(key, m);
    push({
      event: 'hash', lineId: ids.findHash,
      note: `查找 ${key}：h(${key}) = ${h}。查找必须沿与插入**完全相同**的平方序列走，否则会漏。`,
      vars: vars({ key, h, i: 0 }),
      layers: layers({ focus1: [h], pointers: [{ id: 'h', label: `h(${key})=${h}`, index: h }] }),
    });
    for (let i = 0; i < m; i++) {
      const slot = mod(h + cfg.offset(i), m);
      probes += 1;
      const cur = table[slot];
      push({
        event: 'probe', lineId: ids.findProbe,
        note: probeNote(i, h, slot, cur, key),
        vars: vars({ key, h, i, slot }),
        layers: layers({ focus1: [h], focus2: [slot], pointers: ptrs(key, h, i, slot) }),
      });
      if (cur === key) {
        foundSlot = slot;
        push({
          event: 'hit', lineId: ids.hit,
          note: `槽 ${slot} = ${key}：命中，返回下标 ${slot}（共 ${i + 1} 次探测）。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot], done: [slot] }),
        });
        return;
      }
      if (cur == null) {
        push({
          event: 'miss', lineId: ids.missEmpty,
          note: `槽 ${slot} 是空槽：插入时这个键若在表里，一定会在这条序列的更早位置落下，所以现在可以断定 ${key} 不在表里，返回 -1。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot] }),
        });
        return;
      }
      push({
        event: 'collision', lineId: ids.findColl,
        note: `槽 ${slot} = ${cur} ≠ ${key}：冲突，i 变成 ${i + 1}，下一槽 = ${mod(h + cfg.offset(i + 1), m)}。`,
        vars: vars({ key, h, i, slot }),
        layers: layers({ focus1: [h], focus2: [slot], pointers: ptrs(key, h, i, slot) }),
      });
    }
    push({
      event: 'miss', lineId: ids.miss,
      note: `探测 m = ${m} 次：既没命中也没遇到空槽（序列上的槽都被别占满），终止并返回 -1。`,
      vars: vars({ key, h, i: m - 1, slot: null }),
      layers: layers({}),
    });
  }

  push({
    event: 'init', lineId: ids.fn,
    note: cfg.initNote(m),
    vars: vars({ key: null, i: null }),
    layers: layers(),
  });

  for (const key of keys) insert(key);
  if (findKey != null) lookup(findKey);

  const result = {
    table: table.map(show),
    placed: { ...placed },
    size: m,
    count,
    probes,
    exhausted,
    failed,
    placedSlot,
    foundSlot,
  };
  push({
    event: 'done', lineId: ids.end, done: true, result,
    note: [
      `结束：容量 ${m} 槽，有效键 ${count} 个，共探测 ${probes} 次。`,
      exhausted ? '触发了"探测序列耗尽"（表还没满，但序列走不动了）。' : '',
      failed && !exhausted ? '有插入失败（序列上的槽都试过了）。' : '',
      findKey != null ? `查找 ${findKey} ${foundSlot >= 0 ? `命中槽 ${foundSlot}` : '未命中（-1）'}。` : '',
    ].filter(Boolean).join(' '),
    vars: vars({ key: null, i: null }),
    layers: layers(foundSlot >= 0 ? { focus2: [foundSlot], done: [foundSlot] } : {}),
  });

  return trace({ algorithmId: meta.id, variantId, sourceVersion: `hash-quadratic-probing-${variantId}-v1`, lines: L, steps, result });
}

export function run(variantId, input) {
  if (!CFG[variantId]) throw new Error(`未知变体：${variantId}`);
  return runQP(variantId, input || {});
}

export function sourceLines(variantId) {
  return LINES[variantId] || LINES.v1;
}
