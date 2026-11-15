/**
 * D · 哈希线性探测（3 个代表性不同实现）
 *
 *   1) v1 插入 + 查找基础版：遇空槽或同键停止，最多 m 次探测；删除即清空；
 *   2) v2 带删除标记（墓碑）：删除写 DELETED，查找必须越过墓碑，插入可复用墓碑槽；
 *   3) v3 装填因子扩容重散列：超阈值容量翻倍并重新散列全部键。
 *
 * 画面：style 1 一维数组当槽位表 —— `values` 是槽内容（空槽 '·'、墓碑 'DEL'），
 * `labels` 是"下标:内容"（渲染器把 labels 画在格子里，只写下标会让槽内容完全看不见）。
 * 动画重点（目录 focus）：初始槽 h(k)、探测次序 (h+i) mod m、冲突与回绕、表满终止。
 *
 * 三个变体在"删除 / 扩容"上的合法差异用 expectByVariant 表达：
 *   · edge-tombstone：v1/v3 删空了槽 → 查找在空槽处早停（漏掉 9）；v2 越过墓碑 → 命中；
 *   · normal-reuse：v1/v2 复用删掉的槽（表还是 5 槽），v3 先扩容到 10 槽再插入。
 */

import { trace, step, arrayLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'd/hash-linear-probing',
  variants: [
    { id: 'v1', name: '插入 + 查找基础版' },
    { id: 'v2', name: '带删除标记（墓碑）' },
    { id: 'v3', name: '装填因子扩容重散列' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'int lp_insert(int T[], int m, int k) {' },
    { lineId: 'hash', text: '  int h = k % m;                          /* 初始槽 h(k) */' },
    { lineId: 'loop', text: '  for (int i = 0; i < m; ++i) {            /* 最多 m 次探测 */' },
    { lineId: 'probe', text: '    int s = (h + i) % m;                  /* 线性探测：逐槽 +1 */' },
    { lineId: 'wrap', text: '    /* (h+i) 越过 m-1 时被 % m 拉回表头 —— 回绕 */' },
    { lineId: 'coll', text: '    if (T[s] != EMPTY && T[s] != k) continue;   /* 冲突：被占，往后挪一格 */' },
    { lineId: 'dup', text: '    if (T[s] == k) return s;              /* 重复键：已有，不占新槽 */' },
    { lineId: 'place', text: '    T[s] = k; return s;                   /* 空槽：落位 */' },
    { lineId: 'loop-e', text: '  }' },
    { lineId: 'full', text: '  return -1;                               /* m 次探测都失败：表满 */' },
    { lineId: 'fn2', text: 'int lp_find(int T[], int m, int k) {' },
    { lineId: 'find-h', text: '  int h = k % m;                          /* 与插入完全相同的次序 */' },
    { lineId: 'find-loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'find-probe', text: '    int s = (h + i) % m;' },
    { lineId: 'find-hit', text: '    if (T[s] == k) return s;              /* 命中 */' },
    { lineId: 'find-empty', text: '    if (T[s] == EMPTY) return -1;         /* 空槽：后面不可能再有该键 */' },
    { lineId: 'find-e', text: '  }' },
    { lineId: 'find-miss', text: '  return -1;                               /* 探测 m 次仍未命中 */' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'int lp_find_tt(int T[], int m, int k) {' },
    { lineId: 'hash', text: '  int h = k % m;' },
    { lineId: 'loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'probe', text: '    int s = (h + i) % m;                   /* 线性探测；越过 m-1 由 % m 回绕 */' },
    { lineId: 'hit', text: '    if (T[s] == k) return s;               /* 命中 */' },
    { lineId: 'tomb', text: '    if (T[s] == DELETED) continue;          /* 墓碑：删除留下的标记，必须越过 */' },
    { lineId: 'empty', text: '    if (T[s] == EMPTY) return -1;           /* 只有空槽才敢判定未命中 */' },
    { lineId: 'loop-e', text: '  }' },
    { lineId: 'find-miss', text: '  return -1;' },
    { lineId: 'ins', text: 'int lp_insert_tt(int T[], int m, int k) {' },
    { lineId: 'ins-hash', text: '  int h = k % m, first = -1;             /* first = 首个墓碑槽（可复用） */' },
    { lineId: 'ins-loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'ins-probe', text: '    int s = (h + i) % m;' },
    { lineId: 'ins-dup', text: '    if (T[s] == k) return s;              /* 重复键不占新槽 */' },
    { lineId: 'ins-tomb', text: '    if (T[s] == DELETED) { if (first < 0) first = s; continue; }' },
    { lineId: 'ins-place', text: '    if (T[s] == EMPTY) { int t = first >= 0 ? first : s; T[t] = k; return t; }' },
    { lineId: 'ins-loop-e', text: '  }' },
    { lineId: 'ins-full', text: '  return first;                           /* 只有墓碑时复用首个墓碑 */' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'int lp_insert_grow(int T[], int *pm, int k) {' },
    { lineId: 'chk', text: '  if ((count + 1) > 0.75 * (*pm)) {              /* 装填因子将超阈值 → 扩容 */' },
    { lineId: 'grow', text: '    int m2 = *pm * 2; int *T2 = calloc(m2, sizeof(int));' },
    { lineId: 'rehash', text: '    for (每个已插入键 o) { 按 o % m2 线性探测落到 T2 的空槽 }   /* 重散列 */' },
    { lineId: 'swap', text: '    T = T2; *pm = m2;                              /* 换成新表 */' },
    { lineId: 'chk-e', text: '  }' },
    { lineId: 'hash', text: '  int h = k % (*pm);' },
    { lineId: 'loop', text: '  for (int i = 0; i < *pm; ++i) {                 /* 新表只用前 (count+1) 个槽 */' },
    { lineId: 'probe', text: '    int s = (h + i) % (*pm);                     /* 线性探测 + 回绕 */' },
    { lineId: 'dup', text: '    if (T[s] == k) return s;                       /* 重复键不占新槽 */' },
    { lineId: 'place', text: '    if (T[s] == EMPTY) { T[s] = k; return s; }      /* 空槽落位 */' },
    { lineId: 'loop-e', text: '  }' },
    { lineId: 'full', text: '  return -1;' },
    { lineId: 'find', text: 'int lp_find_grow(int T[], int m, int k) {' },
    { lineId: 'find-loop', text: '  for (int i = 0; i < m; ++i) {' },
    { lineId: 'find-probe', text: '    int s = ((k % m) + i) % m;' },
    { lineId: 'find-hit', text: '    if (T[s] == k) return s;                    /* 命中 */' },
    { lineId: 'find-empty', text: '    if (T[s] == EMPTY) return -1;' },
    { lineId: 'find-e', text: '  } return -1;' },
    { lineId: 'end', text: '}' },
  ],
};

const EMPTY = '·';
const TOMB = 'DEL';

const mod = (x, m) => ((x % m) + m) % m;
const show = (v) => (v === EMPTY || v === TOMB ? v : String(v));

/** 一步一个完整快照：表内容 + labels 全部重建 */
function layersOf(table, roles = {}) {
  const values = table.map(show);
  return [arrayLayer({
    id: 'main',
    title: `哈希表 T[0..${table.length - 1}]`,
    name: 'int T[m]（· = 空槽，DEL = 墓碑）',
    values,
    labels: values.map((v, i) => `${i}:${v}`),
    roles,
  })];
}

const CFG = {
  v1: {
    tombstone: false,
    resize: false,
    threshold: 0,
    initNote: (m) => `容量 m = ${m}，h(k) = k mod ${m}，冲突时线性探测 (h+i) mod m。v1 只有"插入 + 查找"：遇空槽或同键就停，最多探测 m 次。删除会直接清空槽位（后面会看到它的代价）。`,
    ids: {
      fn: 'fn', hash: 'hash', probe: 'probe', wrap: 'wrap', insertColl: 'coll', findColl: 'find-probe',
      dup: 'dup', place: 'place', full: 'full', hit: 'find-hit', missEmpty: 'find-empty',
      miss: 'find-miss', tomb: null, grow: null, rehash: null, delWrite: 'place', end: 'end',
    },
  },
  v2: {
    tombstone: true,
    resize: false,
    threshold: 0,
    initNote: (m) => `容量 m = ${m}，h(k) = k mod ${m}。v2 在基础版上加删除标记：删除不真清空，而是写 DELETED（墓碑）。查找遇到墓碑必须越过，遇到空槽才能停；插入可以复用墓碑槽。`,
    ids: {
      fn: 'fn', hash: 'hash', probe: 'probe', wrap: 'probe', insertColl: 'ins-probe', findColl: 'probe',
      dup: 'ins-dup', place: 'ins-place', full: 'ins-full', hit: 'hit', missEmpty: 'empty',
      miss: 'find-miss', tomb: 'tomb', grow: null, rehash: null, delWrite: 'tomb', end: 'end',
    },
  },
  v3: {
    tombstone: false,
    resize: true,
    threshold: 0.75,
    initNote: (m) => `初始容量 m = ${m}，扩容阈值 0.75。v3 在每次插入前检查装填因子：若 (count+1)/m 将超过阈值，就把容量翻倍并把全部键重散列到新表（旧槽全部作废）。`,
    ids: {
      fn: 'fn', hash: 'hash', probe: 'probe', wrap: 'probe', insertColl: 'probe', findColl: 'find-probe',
      dup: 'dup', place: 'place', full: 'full', hit: 'find-hit', missEmpty: 'find-empty',
      miss: 'find-e', tomb: null, grow: 'grow', rehash: 'rehash', delWrite: 'place', end: 'end',
    },
  },
};

export const samples = [
  {
    id: 'normal',
    label: 'm=5 插入 4、9、14 → 落槽 4、0、1；再查 9',
    input: { m: 5, keys: [4, 9, 14], find: 9 },
    expect: { table: ['9', '14', '·', '·', '4'], placed: { 4: 4, 9: 0, 14: 1 }, foundSlot: 0, full: false },
  },
  {
    id: 'edge-full',
    label: 'm=5 插满 1..5 后查不存在的 9（探测 m 次终止）',
    input: { m: 5, keys: [1, 2, 3, 4, 5], find: 9 },
    expect: { table: ['5', '1', '2', '3', '4'], placed: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 0 }, foundSlot: -1, size: 5 },
    expectByVariant: {
      v3: {
        table: ['·', '1', '2', '3', '4', '5', '·', '·', '·', '·'],
        placed: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
        foundSlot: -1,
        size: 10,
        resized: true,
      },
    },
  },
  {
    id: 'edge-duplicate',
    label: 'm=5 插入 4、9 后再插 4（重复键不占新槽）',
    input: { m: 5, keys: [4, 9, 4] },
    expect: { table: ['9', '·', '·', '·', '4'], placed: { 4: 4, 9: 0 }, count: 2, size: 5 },
  },
  {
    id: 'edge-tombstone',
    label: 'm=5 插入 4、9、14 → 删除 4 → 查 9（v2 越过墓碑命中，v1/v3 早停漏掉）',
    input: { m: 5, keys: [4, 9, 14], deletes: [4], find: 9 },
    expect: { table: ['9', '14', '·', '·', '·'], placed: { 9: 0, 14: 1 }, foundSlot: -1 },
    expectByVariant: {
      v2: { table: ['9', '14', '·', '·', 'DEL'], placed: { 9: 0, 14: 1 }, foundSlot: 0 },
    },
  },
  {
    id: 'normal-reuse',
    label: 'm=5 删 4 后插 19 再查 9（删除后计数减一，三个变体都复用 4 号空槽）',
    input: { m: 5, keys: [4, 9, 14], deletes: [4], insertAfter: [19], find: 9 },
    expect: { table: ['9', '14', '·', '·', '19'], placed: { 9: 0, 14: 1, 19: 4 }, foundSlot: 0, size: 5 },
    // 口径说明：删除让 count 从 3 降到 2，插入 19 后 (2+1)/5 = 0.6 未超 0.75 阈值，
    // 所以 v3 在这组输入上本就不该扩容；"扩容 + 重散列"由 edge-full 覆盖（5 个键必然触发）。
    expectByVariant: {
      v3: { table: ['9', '14', '·', '·', '19'], placed: { 9: 0, 14: 1, 19: 4 }, foundSlot: 0, size: 5, resized: false },
    },
  },
];

/* ------------------------------------------------------------------ 探测核心（三个变体共用，差异点在 cfg） */

function runProbing(variantId, input) {
  const cfg = CFG[variantId];
  const ids = cfg.ids;
  const L = LINES[variantId];
  const m0 = Number.isInteger(input.m) && input.m > 0 ? input.m : 5;
  const keys = (Array.isArray(input.keys) ? input.keys : []).map(Number);
  const deletes = (Array.isArray(input.deletes) ? input.deletes : []).map(Number);
  const after = (Array.isArray(input.insertAfter) ? input.insertAfter : []).map(Number);
  const findKeyTarget = input.find == null ? null : Number(input.find);

  let m = m0;
  let table = new Array(m).fill(EMPTY);
  let count = 0;
  let probes = 0;
  let resized = false;
  let tableFull = false;
  let foundSlot = -1;
  const placed = {};
  const steps = [];

  const occupied = () => table.map((v, i) => (v !== EMPTY && v !== TOMB ? i : -1)).filter((i) => i >= 0);
  const vars = (extra = {}) => ({ m, count, alpha: `${count}/${m}`, probes, ...extra });
  const layers = (roles = {}) => layersOf(table, { done: occupied(), ...roles });
  const push = (o) => steps.push(step(o));
  const head = (key, h, i, slot) => [
    { id: 'h', label: `h(${key})=${h}`, index: h },
    { id: 'i', label: `i=${i}`, index: slot },
  ];
  const probeNote = (i, h, s, cur) => `第 ${i + 1} 次探测：槽 (${h}+${i}) mod ${m} = ${s}，当前内容 ${cur === EMPTY ? '·（空槽）' : cur === TOMB ? 'DEL（墓碑）' : cur}。`;
  const maybeWrap = (key, h, i, slot) => {
    if (i <= 0) return;
    const prev = mod(h + i - 1, m);
    if (slot < prev) {
      push({
        event: 'wrap', lineId: ids.wrap,
        note: `探测越过表尾：上一槽是 ${prev}，(h+${i}) mod ${m} 把下一次探测回绕到槽 ${slot}。`,
        vars: vars({ key, h, i, slot }),
        layers: layers({ focus1: [h], focus2: [slot], pointers: head(key, h, i, slot) }),
      });
    }
  };

  /* ---------------- 扩容 + 重散列（仅 v3） */
  function grow() {
    const oldM = m;
    const oldKeys = table.filter((v) => v !== EMPTY && v !== TOMB);
    m = oldM * 2;
    table = new Array(m).fill(EMPTY);
    resized = true;
    push({
      event: 'init', lineId: ids.grow,
      note: `装填因子 ${count}/${oldM} 再插一个将超过阈值 ${cfg.threshold}：容量 ${oldM} → ${m}。新表是空的，旧表的槽位全部作废，必须把每个键重新散列。`,
      vars: vars({ key: null, i: null }),
      layers: layers(),
    });
    for (const key of oldKeys) {
      const h = mod(key, m);
      let i = 0;
      while (table[mod(h + i, m)] !== EMPTY) i += 1;
      const slot = mod(h + i, m);
      table[slot] = key;
      placed[key] = slot;
      push({
        event: 'place', lineId: ids.rehash,
        note: `重散列：键 ${key} 在新模 ${m} 下 h = ${h}，探测 ${i} 次后落到槽 ${slot}（旧槽位不再有效）。`,
        vars: vars({ key, h, i, slot }),
        layers: layers({ focus2: [slot], added: [slot], pointers: head(key, h, i, slot) }),
      });
    }
    push({
      event: 'init', lineId: ids.grow,
      note: `重散列完成：容量 ${m}，${oldKeys.length} 个键都搬到了新表，装填因子 ${count}/${m}。`,
      vars: vars({ key: null, i: null }),
      layers: layers(),
    });
  }

  /* ---------------- 插入 */
  function insert(key) {
    if (cfg.resize && count + 1 > cfg.threshold * m) grow();
    const h = mod(key, m);
    push({
      event: 'hash', lineId: ids.hash,
      note: `插入 ${key}：h(${key}) = ${key} mod ${m} = ${h}，从槽 ${h} 开始探测。`,
      vars: vars({ key, h, i: 0 }),
      layers: layers({ focus1: [h], pointers: [{ id: 'h', label: `h(${key})=${h}`, index: h }] }),
    });
    let first = -1;
    for (let i = 0; i < m; i++) {
      const slot = mod(h + i, m);
      maybeWrap(key, h, i, slot);
      probes += 1;
      const cur = table[slot];
      push({
        event: 'probe', lineId: ids.probe,
        note: probeNote(i, h, slot, cur),
        vars: vars({ key, h, i, slot }),
        layers: layers({ focus1: [h], focus2: [slot], pointers: head(key, h, i, slot) }),
      });
      if (cur === key) {
        push({
          event: 'hit', lineId: ids.dup,
          note: `槽 ${slot} 里已经是 ${key}：重复键只算一次，不占新槽（表长与 count 都不变）。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot] }),
        });
        return;
      }
      if (cur === EMPTY) {
        const at = cfg.tombstone && first >= 0 ? first : slot;
        table[at] = key;
        count += 1;
        placed[key] = at;
        push({
          event: 'place', lineId: ids.place,
          note: cfg.tombstone && first >= 0
            ? `遇到空槽 ${slot}，但之前见过墓碑 ${first}：插入复用到墓碑槽 ${at}（既不浪费槽位，也不截断探测链）。`
            : `槽 ${at} 是空槽：落位，count = ${count}，装填因子 ${count}/${m}。`,
          vars: vars({ key, h, i, slot: at }),
          layers: layers({ focus2: [at], added: [at], pointers: head(key, h, i, at) }),
        });
        return;
      }
      if (cfg.tombstone && cur === TOMB) {
        if (first < 0) first = slot;
        push({
          event: 'probe', lineId: ids.tomb,
          note: `槽 ${slot} 是墓碑（删除标记）：插入可以复用它，先记下 first = ${slot}，继续探到"同键或空槽"再决定，避免把已有键重复插一遍。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot], pointers: head(key, h, i, slot) }),
        });
        continue;
      }
      push({
        event: 'collision', lineId: ids.insertColl,
        note: `槽 ${slot} 被 ${cur} 占着：冲突，i++ 试下一槽 ${mod(slot + 1, m)}。`,
        vars: vars({ key, h, i, slot }),
        layers: layers({ focus1: [h], focus2: [slot], pointers: head(key, h, i, slot) }),
      });
    }
    if (cfg.tombstone && first >= 0) {
      table[first] = key;
      count += 1;
      placed[key] = first;
      push({
        event: 'place', lineId: ids.place,
        note: `探测 ${m} 次没遇到空槽，但 first = ${first} 是可复用的墓碑：键 ${key} 落到槽 ${first}。`,
        vars: vars({ key, h: mod(key, m), i: m - 1, slot: first }),
        layers: layers({ focus2: [first], added: [first] }),
      });
      return;
    }
    tableFull = true;
    push({
      event: 'full', lineId: ids.full,
      note: `线性探测 m = ${m} 次全是别的键：表已满，${key} 插入失败（线性探测下这就是"无空槽"终止）。`,
      vars: vars({ key, i: m - 1, slot: null }),
      layers: layers({}),
    });
  }

  /* ---------------- 查找 */
  function lookup(key) {
    const h = mod(key, m);
    push({
      event: 'hash', lineId: ids.hash,
      note: `查找 ${key}：h(${key}) = ${h}。查找必须沿与插入**完全相同的探测次序**走，否则会漏。`,
      vars: vars({ key, h, i: 0 }),
      layers: layers({ focus1: [h], pointers: [{ id: 'h', label: `h(${key})=${h}`, index: h }] }),
    });
    for (let i = 0; i < m; i++) {
      const slot = mod(h + i, m);
      maybeWrap(key, h, i, slot);
      probes += 1;
      const cur = table[slot];
      push({
        event: 'probe', lineId: ids.probe,
        note: probeNote(i, h, slot, cur),
        vars: vars({ key, h, i, slot }),
        layers: layers({ focus1: [h], focus2: [slot], pointers: head(key, h, i, slot) }),
      });
      if (cur === key) {
        foundSlot = slot;
        push({
          event: 'hit', lineId: ids.hit,
          note: `槽 ${slot} = ${key}：命中，返回下标 ${slot}（比较 ${i + 1} 次探测）。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot], done: [slot] }),
        });
        return;
      }
      if (cur === EMPTY) {
        push({
          event: 'miss', lineId: ids.missEmpty,
          note: `槽 ${slot} 是空槽：线性探测里"空槽"意味着这条链到此结束，${key} 不在表里，返回 -1。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot] }),
        });
        return;
      }
      if (cfg.tombstone && cur === TOMB) {
        push({
          event: 'probe', lineId: ids.tomb,
          note: `槽 ${slot} 是墓碑：**不能停**——墓碑后面的槽里可能还有要找的键，越过它继续探测。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot], pointers: head(key, h, i, slot) }),
        });
        continue;
      }
      push({
        event: 'collision', lineId: ids.findColl,
        note: `槽 ${slot} = ${cur} ≠ ${key}：冲突，i++ 看下一槽 ${mod(slot + 1, m)}。`,
        vars: vars({ key, h, i, slot }),
        layers: layers({ focus1: [h], focus2: [slot], pointers: head(key, h, i, slot) }),
      });
    }
    push({
      event: 'miss', lineId: ids.miss,
      note: `探测 m = ${m} 次：既没命中也没遇到空槽（表已被占满），终止并返回 -1。`,
      vars: vars({ key, h, i: m - 1, slot: null }),
      layers: layers({}),
    });
  }

  /* ---------------- 删除 */
  function remove(key) {
    const h = mod(key, m);
    push({
      event: 'hash', lineId: ids.hash,
      note: `删除 ${key}：仍然先按 h(${key}) = ${h} 定位，找不到就什么也不改。`,
      vars: vars({ key, h, i: 0 }),
      layers: layers({ focus1: [h], pointers: [{ id: 'h', label: `h(${key})=${h}`, index: h }] }),
    });
    for (let i = 0; i < m; i++) {
      const slot = mod(h + i, m);
      maybeWrap(key, h, i, slot);
      const cur = table[slot];
      push({
        event: 'probe', lineId: ids.probe,
        note: probeNote(i, h, slot, cur),
        vars: vars({ key, h, i, slot }),
        layers: layers({ focus1: [h], focus2: [slot], pointers: head(key, h, i, slot) }),
      });
      if (cur === key) {
        table[slot] = cfg.tombstone ? TOMB : EMPTY;
        count -= 1;
        delete placed[key];
        push({
          event: 'place', lineId: ids.delWrite,
          note: cfg.tombstone
            ? `删除 ${key}：槽 ${slot} 写 DELETED 墓碑，不真清空——这样后面的键仍然能被找到，墓碑还可在插入时复用。`
            : `删除 ${key}：基础版直接清空槽 ${slot}。注意这会把探测链切断，后面的键可能查不到（这正是 v2 要解决的问题）。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot] }),
        });
        return;
      }
      if (cur === EMPTY) {
        push({
          event: 'miss', lineId: ids.missEmpty,
          note: `槽 ${slot} 是空槽：链到此结束，${key} 本来就不在表里，删除无操作。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot] }),
        });
        return;
      }
      if (cfg.tombstone && cur === TOMB) {
        push({
          event: 'probe', lineId: ids.tomb,
          note: `槽 ${slot} 是墓碑：删除定位同样要越过它，否则删不掉墓碑后面的键。`,
          vars: vars({ key, h, i, slot }),
          layers: layers({ focus2: [slot], pointers: head(key, h, i, slot) }),
        });
        continue;
      }
      push({
        event: 'collision', lineId: ids.findColl,
        note: `槽 ${slot} = ${cur} ≠ ${key}：冲突，继续下一槽 ${mod(slot + 1, m)}。`,
        vars: vars({ key, h, i, slot }),
        layers: layers({ focus1: [h], focus2: [slot], pointers: head(key, h, i, slot) }),
      });
    }
    push({
      event: 'miss', lineId: ids.miss,
      note: `探测 m = ${m} 次都没有找到 ${key}：表里没有这个键（或表已满），删除无操作。`,
      vars: vars({ key, h, i: m - 1, slot: null }),
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
  for (const key of deletes) remove(key);
  for (const key of after) insert(key);
  if (findKeyTarget != null) lookup(findKeyTarget);

  const result = {
    table: table.map(show),
    placed: { ...placed },
    foundSlot,
    count,
    size: m,
    resized,
    full: tableFull,
    probes,
  };
  push({
    event: 'done', lineId: ids.end, done: true, result,
    note: findKeyTarget == null
      ? `结束：容量 ${m} 槽，有效键 ${count} 个，探测总数 ${probes} 次。`
      : `结束：容量 ${m} 槽，有效键 ${count} 个；查找 ${findKeyTarget} ${foundSlot >= 0 ? `命中槽 ${foundSlot}` : '未命中（-1）'}，探测总数 ${probes} 次。`,
    vars: vars({ key: null, i: null }),
    layers: layers(foundSlot >= 0 ? { focus2: [foundSlot], done: [foundSlot] } : {}),
  });

  return trace({ algorithmId: meta.id, variantId, sourceVersion: `hash-linear-probing-${variantId}-v1`, lines: L, steps, result });
}

export function run(variantId, input) {
  const cfg = CFG[variantId];
  if (!cfg) throw new Error(`未知变体：${variantId}`);
  return runProbing(variantId, input || {});
}

export function sourceLines(variantId) {
  return LINES[variantId] || LINES.v1;
}
