/**
 * D · 哈希双散列（3 个代表性不同实现）
 *
 *   1) v1 h2 = 1 + k mod (m-1)：m 取素数时步长恒与 m 互素，探测能走遍全表；
 *   2) v2 h2 = q - (k mod q)：q 是小于 m 的素数，步长落在 [1, q]，与 v1 明显不同；
 *   3) v3 扩容 + 重散列：装填因子将超 0.75 时容量翻倍，并按新表长重算每个键的 h1/h2。
 *
 * 画面：style 1 一维数组当槽位表 —— `values` 是槽内容（空槽 '·'），`labels` 是"下标:内容"。
 * 动画重点（目录 focus）：h1、h2（步长）、(h1 + i·h2) mod m 的槽位序列、未命中终止。
 *
 * 两处易错点都在动画里点明：
 *   · 查找必须用与插入**完全相同**的 h1/h2，否则序列不同会漏；
 *   · 步长与表长互素时"碰上空槽"就等于"键不在表里"，未命中可以在空槽处提前终止。
 *
 * m=5 插入 1、6、11（h1 全是 1）：
 *   v1（h2 = 1+k mod 4）：1→槽1，6→槽4，11→槽0，共 5 次探测；
 *   v2（q=3, h2 = 3-(k mod 3)）：1→槽1，6→槽4，11→槽2  —— 步长不同，落点不同；
 *   v3 在装入第 4 个键时才扩容（3/5 再插一个 = 0.8 > 0.75），差异用 expectByVariant 表达。
 *
 * result：{ table, placed, foundSlot, size, resized, count, probes }
 */

import { trace, step, arrayLayer } from '../../engine/model.js';

export const meta = {
  id: 'd/hash-double-hashing',
  variants: [
    { id: 'v1', name: 'h2 = 1 + k mod (m-1)' },
    { id: 'v2', name: 'h2 = q - (k mod q)' },
    { id: 'v3', name: '扩容 + 重散列' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'int dh_insert(int T[], int m, int k) {' },
    { lineId: 'hash1', text: '  int h1 = k % m;                        /* 起始槽 */' },
    { lineId: 'hash2', text: '  int h2 = 1 + k % (m - 1);              /* 步长：m 为素数时恒与 m 互素 */' },
    { lineId: 'loop', text: '  for (int i = 0; i < m; ++i) {          /* 最多 m 次探测 */' },
    { lineId: 'probe', text: '    int s = (h1 + i * h2) % m;           /* 每次跨 h2 步，而不是 +1 */' },
    { lineId: 'coll', text: '    if (T[s] != EMPTY && T[s] != k) continue;   /* 被占：i++，再跨 h2 步 */' },
    { lineId: 'dup', text: '    if (T[s] == k) return s;             /* 重复键不占新槽 */' },
    { lineId: 'place', text: '    T[s] = k; return s;                  /* 空槽落位 */' },
    { lineId: 'fail', text: '  return -1;                             /* m 次都没落位：表已满 */' },
    { lineId: 'findfn', text: 'int dh_find(int T[], int m, int k) {' },
    { lineId: 'find-hash1', text: '  int h1 = k % m, h2 = 1 + k % (m - 1);   /* 与插入同一对 h1/h2 */' },
    { lineId: 'find-loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'find-probe', text: '    int s = (h1 + i * h2) % m;' },
    { lineId: 'find-hit', text: '    if (T[s] == k) return s;' },
    { lineId: 'find-empty', text: '    if (T[s] == EMPTY) return -1;        /* 互素步长 ⇒ 空槽即结论 */' },
    { lineId: 'find-miss', text: '  } return -1;                         /* m 次都没命中也没空槽 */' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'int dh_insert_q(int T[], int m, int k) {' },
    { lineId: 'hash1', text: '  int h1 = k % m;' },
    { lineId: 'hash-q', text: '  int q = prime_below(m);                /* q：小于 m 的素数 */' },
    { lineId: 'hash2', text: '  int h2 = q - (k % q);                  /* 步长落在 [1, q] */' },
    { lineId: 'loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'probe', text: '    int s = (h1 + i * h2) % m;           /* h2 由 q 决定，步长比 v1 更小 */' },
    { lineId: 'coll', text: '    if (T[s] != EMPTY && T[s] != k) continue;' },
    { lineId: 'dup', text: '    if (T[s] == k) return s;' },
    { lineId: 'place', text: '    T[s] = k; return s;' },
    { lineId: 'fail', text: '  return -1;' },
    { lineId: 'findfn', text: 'int dh_find_q(int T[], int m, int k) {' },
    { lineId: 'find-hash1', text: '  int h1 = k % m, q = prime_below(m), h2 = q - (k % q);' },
    { lineId: 'find-loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'find-probe', text: '    int s = (h1 + i * h2) % m;' },
    { lineId: 'find-hit', text: '    if (T[s] == k) return s;' },
    { lineId: 'find-empty', text: '    if (T[s] == EMPTY) return -1;' },
    { lineId: 'find-miss', text: '  } return -1;' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'int dh_insert_grow(int T[], int *pm, int k) {' },
    { lineId: 'chk', text: '  if ((count + 1) * 4 > 3 * (*pm)) {     /* 装填因子将超 0.75 → 扩容 */' },
    { lineId: 'grow', text: '    int m2 = *pm * 2; int *T2 = calloc(m2, sizeof(int));' },
    { lineId: 'rehash', text: '    for (每个旧键 o) { h1 = o % m2; h2 = 1 + o % (m2-1); 双散列落进 T2 }' },
    { lineId: 'swap', text: '    T = T2; *pm = m2;                    /* 旧槽全部作废 */' },
    { lineId: 'hash1', text: '  int h1 = k % (*pm);' },
    { lineId: 'hash2', text: '  int h2 = 1 + k % (*pm - 1);           /* 新表长上重算步长 */' },
    { lineId: 'loop', text: '  for (int i = 0; i < *pm; ++i) {' },
    { lineId: 'probe', text: '    int s = (h1 + i * h2) % (*pm);      /* 新表上的双散列序列 */' },
    { lineId: 'dup', text: '    if (T[s] == k) return s;' },
    { lineId: 'place', text: '    if (T[s] == EMPTY) { T[s] = k; return s; }' },
    { lineId: 'fail', text: '  } return -1;' },
    { lineId: 'findfn', text: 'int dh_find_grow(int T[], int m, int k) {' },
    { lineId: 'find-hash1', text: '  int h1 = k % m, h2 = 1 + k % (m - 1);   /* 表长变了步长也要跟着变 */' },
    { lineId: 'find-loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'find-probe', text: '    int s = (h1 + i * h2) % m;' },
    { lineId: 'find-hit', text: '    if (T[s] == k) return s;' },
    { lineId: 'find-empty', text: '    if (T[s] == EMPTY) return -1;' },
    { lineId: 'find-miss', text: '  } return -1;' },
    { lineId: 'end', text: '}' },
  ],
};

const EMPTY = '·';
const mod = (x, m) => ((x % m) + m) % m;
const show = (v) => (v == null ? EMPTY : String(v));

const isPrime = (n) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};
/** 小于 m 的最大素数；m ≤ 2 时退化取 1（步长恒为 1，等于线性探测） */
const primeBelow = (m) => {
  for (let q = m - 1; q >= 2; q--) if (isPrime(q)) return q;
  return 1;
};

/** 一步一个完整快照：槽内容与 labels 全部重建 */
function layersOf(table, roles = {}) {
  const values = table.map(show);
  return [arrayLayer({
    id: 'main',
    title: `哈希表 T[0..${table.length - 1}]`,
    name: 'int T[m]（· = 空槽；双散列）',
    values,
    labels: values.map((v, i) => `${i}:${v}`),
    roles,
  })];
}

const CFG = {
  v1: {
    resize: false,
    h2: (k, m) => 1 + mod(k, m - 1),
    ids: {
      fn: 'fn', hash1: 'hash1', hashQ: null, hash2: 'hash2', probe: 'probe', coll: 'coll',
      dup: 'dup', place: 'place', fail: 'fail', findHash: 'find-hash1', findProbe: 'find-probe',
      findColl: 'find-loop', hit: 'find-hit', missEmpty: 'find-empty', miss: 'find-miss',
      grow: null, rehash: null, end: 'end',
    },
    initNote: (m) => `容量 m = ${m} 是素数，h1(k) = k mod ${m}，h2(k) = 1 + k mod ${m - 1}。因为 h2 恒与 m 互素，"每次跨 h2 步"能走遍全表，不会像平方探测那样兜圈。`,
    h2Note: (k, m, h2) => `步长 h2(${k}) = 1 + ${k} mod ${m - 1} = ${h2}：与 ${m} 互素，i 从 0 加到 ${m - 1} 会走遍每一个槽。`,
  },
  v2: {
    resize: false,
    h2: (k, m) => {
      const q = primeBelow(m);
      return q - mod(k, q);
    },
    ids: {
      fn: 'fn', hash1: 'hash1', hashQ: 'hash-q', hash2: 'hash2', probe: 'probe', coll: 'coll',
      dup: 'dup', place: 'place', fail: 'fail', findHash: 'find-hash1', findProbe: 'find-probe',
      findColl: 'find-loop', hit: 'find-hit', missEmpty: 'find-empty', miss: 'find-miss',
      grow: null, rehash: null, end: 'end',
    },
    initNote: (m) => `容量 m = ${m}，h1(k) = k mod ${m}。v2 换一套步长：先取小于 ${m} 的素数 q = ${primeBelow(m)}，再令 h2(k) = q − (k mod q)。它在 [1, q] 内取值，比 v1 的 1 + k mod ${m - 1} 更小 —— 同一个键因此走另一条序列。`,
    h2Note: (k, m, h2) => `步长 h2(${k}) = ${primeBelow(m)} − (${k} mod ${primeBelow(m)}) = ${h2}（q = ${primeBelow(m)}）：落在 [1, q] 里，与 ${m} 仍互素。`,
  },
  v3: {
    resize: true,
    thresholdNote: '0.75',
    h2: (k, m) => 1 + mod(k, m - 1),
    ids: {
      fn: 'fn', hash1: 'hash1', hashQ: null, hash2: 'hash2', probe: 'probe', coll: 'probe',
      dup: 'dup', place: 'place', fail: 'fail', findHash: 'find-hash1', findProbe: 'find-probe',
      findColl: 'find-loop', hit: 'find-hit', missEmpty: 'find-empty', miss: 'find-miss',
      grow: 'grow', rehash: 'rehash', swap: 'swap', end: 'end',
    },
    initNote: (m) => `初始容量 m = ${m}，h2(k) = 1 + k mod (m − 1)。v3 在每次插入前检查装填因子：若 (count+1)/m 将超过 0.75，就把容量翻倍并把全部旧键按**新表长**重散列（h1、h2 都要重算）。`,
    h2Note: (k, m, h2) => `步长 h2(${k}) = 1 + ${k} mod ${m - 1} = ${h2}。注意 h2 依赖表长：一旦扩容到 2m，这个键的步长会重新计算。`,
  },
};

export const samples = [
  {
    id: 'normal',
    label: 'm=5 插入 1、6、11（h1 全是 1，v1 期望落槽 1、4、0）',
    input: { m: 5, keys: [1, 6, 11] },
    expect: {
      table: ['11', '1', '·', '·', '6'],
      placed: { 1: 1, 6: 4, 11: 0 },
      size: 5, resized: false, foundSlot: -1, probes: 5,
    },
    // v2 的步长来自 q=3，11 的序列是 1 → 2（v1 是 1 → 0），落槽因此不同
    expectByVariant: {
      v2: {
        table: ['·', '1', '11', '·', '6'],
        placed: { 1: 1, 6: 4, 11: 2 },
        size: 5, resized: false, foundSlot: -1, probes: 5,
      },
    },
  },
  {
    id: 'edge-full-miss',
    label: 'm=5 插满 1..5 后查不存在的 9（全表占满，m 次探测后终止）',
    input: { m: 5, keys: [1, 2, 3, 4, 5], find: 9 },
    expect: {
      table: ['5', '1', '2', '3', '4'],
      placed: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 0 },
      size: 5, resized: false, foundSlot: -1, probes: 10,
    },
    // v3 在装第 4 个键时触发扩容 → 10 槽、键位整体迁移、查找碰上空槽立刻终止
    expectByVariant: {
      v3: {
        table: ['·', '1', '2', '3', '4', '5', '·', '·', '·', '·'],
        placed: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
        size: 10, resized: true, foundSlot: -1, probes: 6,
      },
    },
  },
  {
    id: 'edge-single',
    label: 'm=7 单键：插 10 再查 10（h1=3，一次探测落位、一次探测命中）',
    input: { m: 7, keys: [10], find: 10 },
    expect: {
      table: ['·', '·', '·', '10', '·', '·', '·'],
      placed: { 10: 3 },
      size: 7, resized: false, foundSlot: 3, probes: 2,
    },
  },
  {
    id: 'edge-resize',
    label: 'm=5 插入 1、6、11、16（第 4 个键让 v3 扩容到 10 槽并重散列）',
    input: { m: 5, keys: [1, 6, 11, 16] },
    expect: {
      table: ['11', '1', '16', '·', '6'],
      placed: { 1: 1, 6: 4, 11: 0, 16: 2 },
      size: 5, resized: false, foundSlot: -1, probes: 7,
    },
    expectByVariant: {
      v2: {
        table: ['·', '1', '11', '16', '6'],
        placed: { 1: 1, 6: 4, 11: 2, 16: 3 },
        size: 5, resized: false, foundSlot: -1, probes: 7,
      },
      // 重散列按旧表下标顺序 [11, 1, 6] 搬到新表：11→1、1→3、6→6，再插 16→4
      v3: {
        table: ['·', '11', '·', '1', '16', '·', '6', '·', '·', '·'],
        placed: { 1: 3, 6: 6, 11: 1, 16: 4 },
        size: 10, resized: true, foundSlot: -1, probes: 7,
      },
    },
  },
];

/* ------------------------------------------------------------------ 双散列核心 */

function runDH(variantId, input) {
  const cfg = CFG[variantId];
  const ids = cfg.ids;
  const L = LINES[variantId];
  const m0 = Number.isInteger(input.m) && input.m > 1 ? input.m : 5;
  const keys = (Array.isArray(input.keys) ? input.keys : []).map(Number);
  const findKey = input.find == null ? null : Number(input.find);

  let m = m0;
  let table = new Array(m).fill(null);
  const placed = {};
  const steps = [];
  let count = 0;
  let probes = 0;
  let resized = false;
  let foundSlot = -1;

  const occupied = () => table.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  const vars = (extra = {}) => ({ m, count, alpha: `${count}/${m}`, probes, ...extra });
  const layers = (roles = {}) => layersOf(table, { done: occupied(), ...roles });
  const push = (o) => steps.push(step(o));
  const ptrs = (key, h1, i, slot) => [
    { id: 'h1', label: `h1(${key})=${h1}`, index: h1 },
    { id: 'i', label: `i=${i}`, index: slot },
  ];
  const slotOf = (h1, i, h2) => mod(h1 + i * h2, m);

  /* ---------------- 扩容 + 重散列（仅 v3） */
  function grow() {
    const oldM = m;
    const oldKeys = table.filter((v) => v != null);
    m = oldM * 2;
    table = new Array(m).fill(null);
    resized = true;
    push({
      event: 'init', lineId: ids.grow,
      note: `装填因子 ${count}/${oldM} 再插一个就是 ${(count + 1) / oldM} > 0.75：容量 ${oldM} → ${m}。新表是空的，旧槽位置全部作废，每个键的 h1、h2 都得按新表长重算。`,
      vars: vars({ key: null, i: null }),
      layers: layers(),
    });
    for (const key of oldKeys) {
      const h1 = mod(key, m);
      const h2 = cfg.h2(key, m);
      let i = 0;
      while (table[slotOf(h1, i, h2)] != null) i += 1;
      const slot = slotOf(h1, i, h2);
      table[slot] = key;
      placed[key] = slot;
      push({
        event: 'place', lineId: ids.rehash,
        note: `重散列 ${key}：新模 ${m} 下 h1 = ${h1}、h2 = ${cfg.h2(key, m)}，跨 ${i} 步后落到槽 ${slot}。注意表长一变，h2 也跟着变。`,
        vars: vars({ key, i, h1, h2 }),
        layers: layers({ focus2: [slot], added: [slot], pointers: ptrs(key, h1, i, slot) }),
      });
    }
    push({
      event: 'init', lineId: ids.swap,
      note: `新表就绪：容量 ${m}，${oldKeys.length} 个键全部搬完，装填因子回落到 ${count}/${m}。`,
      vars: vars({ key: null, i: null }),
      layers: layers(),
    });
  }

  /* ---------------- 插入 */
  function insert(key) {
    if (cfg.resize && (count + 1) * 4 > 3 * m) grow();
    const h1 = mod(key, m);
    push({
      event: 'hash1', lineId: ids.hash1,
      note: `插入 ${key}：h1(${key}) = ${key} mod ${m} = ${h1}，这是第 0 次探测的槽。`,
      vars: vars({ key, h1, i: 0 }),
      layers: layers({ focus1: [h1], pointers: [{ id: 'h1', label: `h1(${key})=${h1}`, index: h1 }] }),
    });
    let h2;
    if (variantId === 'v2') {
      push({
        event: 'hash2', lineId: ids.hashQ,
        note: `先取 q = 小于 ${m} 的最大素数 = ${primeBelow(m)}：步长公式里的 q 由**表长**决定，与键无关。`,
        vars: vars({ key, h1, i: 0, q: primeBelow(m) }),
        layers: layers({ focus1: [h1] }),
      });
    }
    h2 = cfg.h2(key, m);
    push({
      event: 'hash2', lineId: ids.hash2,
      note: cfg.h2Note(key, m, h2),
      vars: vars({ key, h1, h2, i: 0 }),
      layers: layers({ focus1: [h1], pointers: [{ id: 'h1', label: `h1(${key})=${h1}`, index: h1 }] }),
    });
    for (let i = 0; i < m; i++) {
      const slot = slotOf(h1, i, h2);
      probes += 1;
      const cur = table[slot];
      push({
        event: 'probe', lineId: ids.probe,
        note: `i=${i}：槽 (${h1} + ${i}·${h2}) mod ${m} = ${slot}，当前内容 ${cur == null ? '·（空槽）' : cur}。`,
        vars: vars({ key, h1, h2, i, slot }),
        layers: layers({ focus1: [h1], focus2: [slot], pointers: ptrs(key, h1, i, slot) }),
      });
      if (cur === key) {
        placed[key] = slot;
        push({
          event: 'hit', lineId: ids.dup,
          note: `槽 ${slot} 里已经是 ${key}：重复键不占新槽，count 保持 ${count}。`,
          vars: vars({ key, h1, h2, i, slot }),
          layers: layers({ focus2: [slot] }),
        });
        return;
      }
      if (cur == null) {
        table[slot] = key;
        count += 1;
        placed[key] = slot;
        push({
          event: 'place', lineId: ids.place,
          note: `槽 ${slot} 是空槽：${key} 落位，count = ${count}，装填因子 ${count}/${m}。`,
          vars: vars({ key, h1, h2, i, slot }),
          layers: layers({ focus2: [slot], added: [slot], pointers: ptrs(key, h1, i, slot) }),
        });
        return;
      }
      push({
        event: 'collision', lineId: ids.coll,
        note: `槽 ${slot} 被 ${cur} 占着：冲突。i 变成 ${i + 1}，下一槽 = (${h1} + ${i + 1}·${h2}) mod ${m} = ${slotOf(h1, i + 1, h2)}（跨 ${h2} 步，不是 +1）。`,
        vars: vars({ key, h1, h2, i, slot }),
        layers: layers({ focus1: [h1], focus2: [slot], pointers: ptrs(key, h1, i, slot) }),
      });
    }
    push({
      event: 'miss', lineId: ids.fail,
      note: `i 走完 0..${m - 1}，共 ${m} 次探测全是别的键：表已满，${key} 插入失败。`,
      vars: vars({ key, h1, h2, i: m - 1, slot: null }),
      layers: layers({}),
    });
  }

  /* ---------------- 查找 */
  function lookup(key) {
    const h1 = mod(key, m);
    const h2 = cfg.h2(key, m);
    push({
      event: 'hash1', lineId: ids.findHash,
      note: `查找 ${key}：h1 = ${h1}、h2 = ${h2} 必须与插入时**完全一致**，否则走的是另一条序列。`,
      vars: vars({ key, h1, h2, i: 0 }),
      layers: layers({ focus1: [h1], pointers: [{ id: 'h1', label: `h1(${key})=${h1}`, index: h1 }] }),
    });
    for (let i = 0; i < m; i++) {
      const slot = slotOf(h1, i, h2);
      probes += 1;
      const cur = table[slot];
      push({
        event: 'probe', lineId: ids.findProbe,
        note: `i=${i}：槽 (${h1} + ${i}·${h2}) mod ${m} = ${slot}，当前内容 ${cur == null ? '·（空槽）' : cur}。`,
        vars: vars({ key, h1, h2, i, slot }),
        layers: layers({ focus1: [h1], focus2: [slot], pointers: ptrs(key, h1, i, slot) }),
      });
      if (cur === key) {
        foundSlot = slot;
        push({
          event: 'hit', lineId: ids.hit,
          note: `槽 ${slot} = ${key}：命中，返回下标 ${slot}（第 ${i + 1} 次探测）。`,
          vars: vars({ key, h1, h2, i, slot }),
          layers: layers({ focus2: [slot], done: [slot] }),
        });
        return;
      }
      if (cur == null) {
        push({
          event: 'miss', lineId: ids.missEmpty,
          note: `槽 ${slot} 是空槽：步长与表长互素，插入时这个键若在表里就一定在这条序列的更早位置，所以 ${key} 不在表里，返回 -1。`,
          vars: vars({ key, h1, h2, i, slot }),
          layers: layers({ focus2: [slot] }),
        });
        return;
      }
      push({
        event: 'collision', lineId: ids.findColl,
        note: `槽 ${slot} = ${cur} ≠ ${key}：冲突，i 变成 ${i + 1}，下一槽 = ${slotOf(h1, i + 1, h2)}。`,
        vars: vars({ key, h1, h2, i, slot }),
        layers: layers({ focus1: [h1], focus2: [slot], pointers: ptrs(key, h1, i, slot) }),
      });
    }
    push({
      event: 'miss', lineId: ids.miss,
      note: `探测 m = ${m} 次：既没命中也没遇到空槽（整张表都被别的键占着），终止并返回 -1。注意"表满"和"键不存在"在这里分不开 —— 只能靠装填因子控制来避免。`,
      vars: vars({ key, h1, h2, i: m - 1, slot: null }),
      layers: layers({}),
    });
  }

  push({
    event: 'init', lineId: ids.fn,
    note: cfg.initNote(m0),
    vars: vars({ key: null, i: null }),
    layers: layers(),
  });

  for (const key of keys) insert(key);
  if (findKey != null) lookup(findKey);

  const result = {
    table: table.map(show),
    placed: { ...placed },
    foundSlot,
    size: m,
    resized,
    count,
    probes,
  };
  push({
    event: 'done', lineId: ids.end, done: true, result,
    note: `结束：容量 ${m} 槽，有效键 ${count} 个，共探测 ${probes} 次${resized ? '（过程中扩过一次容，全部键已重散列）' : ''}${findKey != null ? `；查找 ${findKey} ${foundSlot >= 0 ? `命中槽 ${foundSlot}` : '未命中（-1）'}` : ''}。`,
    vars: vars({ key: null, i: null }),
    layers: layers(foundSlot >= 0 ? { focus2: [foundSlot], done: [foundSlot] } : {}),
  });

  return trace({ algorithmId: meta.id, variantId, sourceVersion: `hash-double-hashing-${variantId}-v1`, lines: L, steps, result });
}

export function run(variantId, input) {
  if (!CFG[variantId]) throw new Error(`未知变体：${variantId}`);
  return runDH(variantId, input || {});
}

export function sourceLines(variantId) {
  return LINES[variantId] || LINES.v1;
}
