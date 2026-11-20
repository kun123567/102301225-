/**
 * D · 哈希拉链法（3 个代表性不同实现）
 *
 *   1) v1 头插法：新键 O(1) 挂到桶链头部，链内顺序与插入顺序相反；查找必须整链扫完才知道"没有"。
 *   2) v2 尾插法：新键追加到桶链尾部（边扫边找尾），链内保持插入顺序；
 *      查找的平均比较次数与 v1 一样（都是链长），但链序不同。
 *   3) v3 桶内有序链：桶内链按 key 升序维护，插入时找到第一个 ≥ k 的位置挂上；
 *      查找可以在 p->key > k 时**提前退出**——这是三者里唯一能少比较的。
 *
 * 画面（两层，步数少、信息全）：
 *   · layer 1 = style 1 一维数组：m 个桶的**桶头**（空桶写 '·'），指针 h(k) 指向命中的桶；
 *   · layer 2 = style 3 链表：只画"当前操作的那个桶"的链，逐节点比较、插入位置、空桶都在这里看。
 *   roles 里桶用下标、链节点用节点 id（'k<键>'），指针一律带文字（h / cur / prev）。
 *
 * 头插/尾插/有序链的链序不同，所以同一组输入的 buckets 与比较次数会合法地不一样：
 * 用 expectByVariant 分别声明，而不是为了过校验去改算法。
 */

import { trace, step, arrayLayer, linkLayer } from '../../engine/model.js';

export const meta = {
  id: 'd/hash-chaining',
  variants: [
    { id: 'v1', name: '头插法', note: '新键插入桶链头部，插入 O(1)，链内顺序与插入顺序相反' },
    { id: 'v2', name: '尾插法', note: '新键追加到桶链尾部，链内保持插入顺序，查找平均比较次数一致' },
    { id: 'v3', name: '桶内有序链', note: '桶内链按 key 升序维护，可在桶内提前终止查找' },
  ],
};

const LINES = {
  /* v1：头插 + 整链扫描 */
  v1: [
    { lineId: 'fn', text: 'void chain_insert(HNode **H, int m, int k) {' },
    { lineId: 'hash', text: '  int b = k % m;                          /* 桶号 */' },
    { lineId: 'walk', text: '  for (HNode *p = H[b]; p; p = p->next)   /* 先去重：链上已有 k 就不插 */' },
    { lineId: 'cmp', text: '    if (p->key == k) return;' },
    { lineId: 'prepend', text: '  HNode *z = new_node(k); z->next = H[b]; H[b] = z;   /* 头插：O(1) */' },
    { lineId: 'fnd', text: 'bool chain_find(HNode **H, int m, int k) {' },
    { lineId: 'fnd-hash', text: '  int b = k % m;' },
    { lineId: 'fnd-walk', text: '  for (HNode *p = H[b]; p; p = p->next)   /* 头插法下链序被打乱，只能整链扫完 */' },
    { lineId: 'fnd-cmp', text: '    if (p->key == k) return true;' },
    { lineId: 'fnd-miss', text: '  return false;                          /* 走到 NULL 才算未命中 */' },
    { lineId: 'end', text: '}' },
  ],
  /* v2：尾插 + 整链扫描 */
  v2: [
    { lineId: 'fn', text: 'void chain_append(HNode **H, int m, int k) {' },
    { lineId: 'hash', text: '  int b = k % m;' },
    { lineId: 'walk', text: '  HNode *tail = NULL;' },
    { lineId: 'cmp', text: '  for (HNode *p = H[b]; p; p = p->next) {   /* 边去重边记住最后一个节点 */' },
    { lineId: 'dup', text: '    if (p->key == k) return;' },
    { lineId: 'tail', text: '    tail = p;' },
    { lineId: 'walk-e', text: '  }' },
    { lineId: 'append', text: '  HNode *z = new_node(k); if (tail) tail->next = z; else H[b] = z;   /* 尾插：链序 = 插入序 */' },
    { lineId: 'fnd', text: 'bool chain_find(HNode **H, int m, int k) {' },
    { lineId: 'fnd-hash', text: '  int b = k % m;' },
    { lineId: 'fnd-walk', text: '  for (HNode *p = H[b]; p; p = p->next)   /* 链序等于插入序，但平均比较次数与 v1 相同 */' },
    { lineId: 'fnd-cmp', text: '    if (p->key == k) return true;' },
    { lineId: 'fnd-miss', text: '  return false;' },
    { lineId: 'end', text: '}' },
  ],
  /* v3：桶内有序链 + 提前终止 */
  v3: [
    { lineId: 'fn', text: 'void chain_insert_sorted(HNode **H, int m, int k) {' },
    { lineId: 'hash', text: '  int b = k % m;' },
    { lineId: 'walk', text: '  HNode *prev = NULL, *p = H[b];' },
    { lineId: 'walk-cmp', text: '  while (p && p->key < k) { prev = p; p = p->next; }   /* 找到第一个 >= k 的位置 */' },
    { lineId: 'dup', text: '  if (p && p->key == k) return;                        /* 重复键不插 */' },
    { lineId: 'insert', text: '  HNode *z = new_node(k); z->next = p;                 /* 摘后继 → 挂自己 */' },
    { lineId: 'link', text: '  if (prev) prev->next = z; else H[b] = z;             /* 插链头就改桶头数组 */' },
    { lineId: 'fnd', text: 'bool chain_find_sorted(HNode **H, int m, int k) {' },
    { lineId: 'fnd-hash', text: '  int b = k % m;' },
    { lineId: 'fnd-walk', text: '  for (HNode *p = H[b]; p && p->key <= k; p = p->next)   /* 有序链：p->key > k 就提前退出 */' },
    { lineId: 'fnd-cmp', text: '    if (p->key == k) return true;' },
    { lineId: 'fnd-miss', text: '  return false;                                       /* 不必扫完整条链 */' },
    { lineId: 'end', text: '}' },
  ],
};

/* 三个变体只差"插入策略"，其余流程共用一套 ✓ */
const CFG = {
  v1: {
    policy: 'prepend',
    earlyStop: false,
    initNote: (m) => `容量 m = ${m}，桶号 b = k mod ${m}。v1 用**头插法**：新键直接挂到桶链头部（插入 O(1)），代价是同桶的键在链里是"后来的在前"，查找只能整条链扫完。`,
  },
  v2: {
    policy: 'append',
    earlyStop: false,
    initNote: (m) => `容量 m = ${m}，桶号 b = k mod ${m}。v2 用**尾插法**：先扫一遍找到链尾（顺便去重），再把新键接在最后，链内保持插入顺序；查找的平均比较次数与 v1 相同。`,
  },
  v3: {
    policy: 'sorted',
    earlyStop: true,
    initNote: (m) => `容量 m = ${m}，桶号 b = k mod ${m}。v3 让**桶内链按 key 升序**：插入时找到第一个 ≥ k 的位置挂上；查找时一旦遇到 p->key > k 就可以提前退出，这是三种写法里唯一能少比较的。`,
  },
};

export const samples = [
  {
    id: 'normal',
    label: 'm=5 插入 1、6（同桶 1）后查 6：尾插/有序链是 1→6，比较两次',
    input: { m: 5, keys: [1, 6], query: 6 },
    expect: { buckets: { 1: [1, 6] }, found: true, compares: 2 },
    // 头插法的桶链是 6→1，查 6 第一次就命中
    expectByVariant: {
      v1: { buckets: { 1: [6, 1] }, found: true, compares: 1 },
    },
  },
  {
    id: 'normal-early-stop',
    label: 'm=5 插入 1、6、21、26（全在桶 1）后查不存在的 11：v3 有序链提前退出',
    input: { m: 5, keys: [1, 6, 21, 26], query: 11 },
    expect: { buckets: { 1: [1, 6, 21, 26] }, found: false, compares: 4 },
    expectByVariant: {
      // 头插法链序 26→21→6→1，比较次数仍是 4（只是顺序不同）
      v1: { buckets: { 1: [26, 21, 6, 1] }, found: false, compares: 4 },
      // 有序链：查到 21 > 11 就能停，少比较一次
      v3: { buckets: { 1: [1, 6, 21, 26] }, found: false, compares: 3 },
    },
  },
  {
    id: 'edge-empty-bucket',
    label: 'm=5 插入 1、6 后查 3：h(3)=3 桶链为空，一次比较都不做',
    input: { m: 5, keys: [1, 6], query: 3 },
    expect: { buckets: { 1: [1, 6] }, found: false, compares: 0 },
    expectByVariant: {
      v1: { buckets: { 1: [6, 1] }, found: false, compares: 0 },
    },
  },
  {
    id: 'edge-same-bucket-3',
    label: 'm=5 插入 1、6、11（三个键同桶 1）后查 11',
    input: { m: 5, keys: [1, 6, 11], query: 11 },
    expect: { buckets: { 1: [1, 6, 11] }, found: true, compares: 3 },
    expectByVariant: {
      v1: { buckets: { 1: [11, 6, 1] }, found: true, compares: 1 },
    },
  },
];

/* ------------------------------------------------------------------ 公共小工具 */

const mod = (x, m) => ((x % m) + m) % m;
const nodeId = (key) => `k${key}`;

/* ------------------------------------------------------------------ 主流程（三个变体共用） */

function runChaining(variantId, input) {
  const cfg = CFG[variantId];
  const L = LINES[variantId];
  const m = Number.isInteger(input.m) && input.m > 0 ? input.m : 5;
  const keys = (Array.isArray(input.keys) ? input.keys : []).map(Number);
  const query = input.query == null ? null : Number(input.query);

  const buckets = Array.from({ length: m }, () => []);
  const steps = [];
  let curBucket = null;        // 当前正在看的桶（null = 还没算过任何桶）
  let compares = 0;            // 查找阶段链内比较次数
  let found = false;

  const vars = (extra = {}) => ({
    m,
    key: null,
    桶号: curBucket == null ? '—' : curBucket,
    链长: curBucket == null ? '—' : buckets[curBucket].length,
    ...extra,
  });

  /* ---------------- 两层快照（每步重建） */

  const headArray = (roles = {}) => arrayLayer({
    id: 'buckets',
    title: `桶头 B[0..${m - 1}]`,
    name: '桶头数组：每格 = 该桶链的首键（· = 空桶）',
    values: buckets.map((ch) => (ch.length ? String(ch[0]) : '·')),
    labels: buckets.map((ch, i) => `桶${i}:${ch.length ? ch[0] : '·'}`),
    roles,
  });

  const chainOf = (b, roles = {}) => {
    const chain = b == null ? [] : buckets[b];
    const nodes = chain.map((k) => ({ id: nodeId(k), value: String(k) }));
    const links = [];
    for (let i = 0; i + 1 < chain.length; i++) links.push({ from: nodeId(chain[i]), to: nodeId(chain[i + 1]) });
    return linkLayer({
      id: 'chain',
      title: b == null ? '当前操作的桶链' : `桶 ${b} 的链`,
      name: b == null
        ? '（还没定位到桶）'
        : chain.length
          ? `桶 ${b}：${chain.join(' → ')}（长度 ${chain.length}）`
          : `桶 ${b}：空链（桶头 = NULL）`,
      nodes,
      links,
      head: chain.length ? nodeId(chain[0]) : null,
      roles,
    });
  };

  const layers = (b, arrRoles = {}, chainRoles = {}) => [headArray(arrRoles), chainOf(b, chainRoles)];

  const ptrH = (key, b) => ({ id: 'h', label: `h(${key})=${b}`, index: b });

  /* ---------------- 插入 */

  const insert = (key) => {
    const b = mod(key, m);
    curBucket = b;
    const chain = buckets[b];

    steps.push(step({
      event: 'hash', lineId: 'hash',
      note: `插入 ${key}：桶号 b = ${key} mod ${m} = ${b}。拉链法里"冲突"不再往后找空槽，而是把新键挂进这个桶自己的链。`,
      vars: vars({ key, b }),
      layers: layers(b, { focus1: [b], pointers: [ptrH(key, b)] }),
    }));

    let dup = false;
    if (!chain.length) {
      steps.push(step({
        event: 'bucket', lineId: 'walk',
        note: `桶 ${b} 现在是空链（桶头 = NULL）：没有冲突，也不可能有重复键，直接挂上去就是唯一的节点。`,
        vars: vars({ key, b, 链长: 0 }),
        layers: layers(b, { focus1: [b], pointers: [ptrH(key, b)] }),
      }));
    } else {
      // 链内逐节点比较（尾插/有序链的"边扫边找位置"也走这里）
      let cmpCount = 0;
      if (variantId === 'v1' || variantId === 'v2') {
        for (let i = 0; i < chain.length; i++) {
          const p = chain[i];
          cmpCount += 1;
          const eq = p === key;
          steps.push(step({
            event: 'compare-node', lineId: 'cmp',
            note: eq
              ? `桶 ${b} 的第 ${i + 1} 个节点就是 ${key}：重复键不占新节点，本次插入直接返回（链长不变）。`
              : `比较桶 ${b} 链上第 ${i + 1} 个节点 ${p} 与 ${key}：不等，${variantId === 'v1' ? '继续往后看还有没有重复键' : '记下它是候选链尾，继续往后扫'}。`,
            vars: vars({ key, b, 比较节点: p, 第几次: cmpCount }),
            layers: layers(b, { focus1: [b], pointers: [ptrH(key, b)] }, { focus1: [nodeId(p)], pointers: [{ id: 'cur', label: `cur=${p}`, node: nodeId(p) }] }),
          }));
          if (eq) {
            dup = true;
            break;
          }
        }
      } else {
        // v3：有序链，边走边比，遇到 >= key 就停
        for (let i = 0; i < chain.length; i++) {
          const p = chain[i];
          cmpCount += 1;
          const eq = p === key;
          const stop = p > key;
          steps.push(step({
            event: 'compare-node', lineId: 'walk-cmp',
            note: eq
              ? `桶 ${b} 第 ${i + 1} 个节点是 ${p}，与 ${key} 相等：重复键不插。`
              : stop
                ? `${p} > ${key}：有序链到这就够了，${key} 应该插在 ${p} 的**前面**，不用再往后扫。`
                : `${p} < ${key}：还没到位置，prev 移到 ${p}，继续往后走。`,
            vars: vars({ key, b, 比较节点: p, 第几次: cmpCount }),
            layers: layers(b, { focus1: [b], pointers: [ptrH(key, b)] }, { focus1: [nodeId(p)], pointers: [{ id: 'cur', label: `cur=${p}`, node: nodeId(p) }] }),
          }));
          if (eq) {
            dup = true;
            break;
          }
          if (stop) break;
        }
      }
    }

    if (dup) return;

    // 真正挂链：三种策略各自的"插在哪"
    if (cfg.policy === 'prepend') {
      chain.unshift(key);
      steps.push(step({
        event: 'prepend', lineId: 'prepend',
        note: `头插：${key} 的 next 指向原桶头 ${chain[1] == null ? 'NULL' : chain[1]}，桶头数组改成 ${key}。插入只改两个指针，O(1)，但链序变成"后来的在前"。`,
        vars: vars({ key, b, 链长: chain.length }),
        layers: layers(b, { focus2: [b], added: [b], pointers: [ptrH(key, b)] }, { focus1: [nodeId(key)], added: [nodeId(key)], pointers: [{ id: 'z', label: `z=${key}`, node: nodeId(key) }] }),
      }));
    } else if (cfg.policy === 'append') {
      chain.push(key);
      const tail = chain.length >= 2 ? chain[chain.length - 2] : null;
      steps.push(step({
        event: 'append', lineId: 'append',
        note: `尾插：${tail == null ? `桶原来是空的，桶头直接指向 ${key}` : `${tail} 的 next 指向 ${key}`}，${key} 的 next = NULL。链序就是插入顺序，代价是每次插入都要先走到链尾（O(链长)）。`,
        vars: vars({ key, b, 链长: chain.length }),
        layers: layers(b, { focus2: [b], added: [b], pointers: [ptrH(key, b)] }, { focus1: [nodeId(key)], added: [nodeId(key)], pointers: [{ id: 'z', label: `z=${key}`, node: nodeId(key) }] }),
      }));
    } else {
      // 有序链：插到第一个 >= key 的位置
      let at = chain.length;
      for (let i = 0; i < chain.length; i++) if (chain[i] > key) { at = i; break; }
      chain.splice(at, 0, key);
      const prevKey = at > 0 ? chain[at - 1] : null;
      const nextKey = at + 1 < chain.length ? chain[at + 1] : null;
      const ev = at === 0 ? 'prepend' : 'append';
      steps.push(step({
        event: ev,
        lineId: 'insert',
        note: prevKey == null
          ? `有序链插在最前：${key} 的 next 指向原桶头 ${nextKey == null ? 'NULL' : nextKey}，桶头数组改成 ${key}。`
          : `有序链插在 ${prevKey} 之后、${nextKey == null ? 'NULL（链尾）' : nextKey} 之前：${prevKey}.next = ${key}，${key}.next = ${nextKey == null ? 'NULL' : nextKey}。桶内始终升序，查找才能提前停。`,
        vars: vars({ key, b, 链长: chain.length, 位置: at }),
        layers: layers(b, { focus2: [b], added: [b], pointers: [ptrH(key, b)] }, { focus1: [nodeId(key)], added: [nodeId(key)], pointers: [{ id: 'z', label: `z=${key}`, node: nodeId(key) }] }),
      }));
    }
  };

  /* ---------------- 查找 */

  const lookup = (key) => {
    const b = mod(key, m);
    curBucket = b;
    const chain = buckets[b];
    compares = 0;

    steps.push(step({
      event: 'hash', lineId: 'fnd-hash',
      note: `查找 ${key}：桶号 b = ${key} mod ${m} = ${b}。拉链法的查找范围只有这一条链，别的桶完全不用看。`,
      vars: vars({ key, b }),
      layers: layers(b, { focus1: [b], pointers: [ptrH(key, b)] }),
    }));

    if (!chain.length) {
      steps.push(step({
        event: 'bucket', lineId: 'fnd-walk',
        note: `桶 ${b} 是空链：连第一个节点都没有，直接判定未命中，链内比较次数 0 —— 这就是拉链法"查空桶最便宜"的情形。`,
        vars: vars({ key, b, 链长: 0, 比较次数: 0 }),
        layers: layers(b, { focus1: [b], pointers: [ptrH(key, b)] }, { focus2: [], pointers: [{ id: 'p', label: 'p = NULL', node: null }] }),
      }));
      steps.push(step({
        event: 'miss', lineId: 'fnd-miss',
        note: `${key} 不在桶 ${b} 里：空链查找结束，返回 false（比较 0 次）。`,
        vars: vars({ key, b, 比较次数: 0, 结果: '未命中' }),
        layers: layers(b, { focus1: [b], pointers: [ptrH(key, b)] }),
      }));
      found = false;
      return;
    }

    let hitKey = null;
    for (let i = 0; i < chain.length; i++) {
      const p = chain[i];
      compares += 1;
      const eq = p === key;
      steps.push(step({
        event: 'compare-node', lineId: 'fnd-cmp',
        note: eq
          ? `第 ${compares} 次比较：节点 ${p} 与 ${key} 相等 → 命中，直接返回 true，后面的节点不用看。`
          : `第 ${compares} 次比较：节点 ${p} ≠ ${key}，${cfg.earlyStop && p > key ? `而且 ${p} > ${key}（有序链）→ 后面的键只会更大，可以提前判定未命中。` : '沿 next 继续下一个节点。'}`,
        vars: vars({ key, b, 比较节点: p, 比较次数: compares }),
        layers: layers(b, { focus1: [b], pointers: [ptrH(key, b)] }, { focus1: [nodeId(p)], pointers: [{ id: 'p', label: `p=${p}`, node: nodeId(p) }] }),
      }));
      if (eq) {
        hitKey = p;
        break;
      }
      if (cfg.earlyStop && p > key) break;
    }

    if (hitKey != null) {
      found = true;
      steps.push(step({
        event: 'hit', lineId: 'fnd-cmp',
        note: `命中：${key} 在桶 ${b} 的链上，共比较 ${compares} 次。${variantId === 'v1' ? '头插法把最近插入的键放在最前面，所以"刚插就查"很快，但平均还是链长的一半。' : variantId === 'v2' ? '尾插法链序是插入顺序，第几次插入就对应第几个节点。' : '有序链命中位置由键值大小决定，与插入顺序无关。'}`,
        vars: vars({ key, b, 比较次数: compares, 结果: '命中' }),
        layers: layers(b, { focus2: [b], done: [b], pointers: [ptrH(key, b)] }, { focus1: [nodeId(key)], done: [nodeId(key)], pointers: [{ id: 'p', label: `p=${key}`, node: nodeId(key) }] }),
      }));
      return;
    }

    steps.push(step({
      event: 'miss', lineId: 'fnd-miss',
      note: cfg.earlyStop
        ? `未命中：桶 ${b} 的链是升序的，比较 ${compares} 次后已经能确定 ${key} 不在链上（不必扫完剩下的节点）。`
        : `未命中：桶 ${b} 的整条链比较完（${compares} 次）都没看到 ${key}，走到 NULL 才能判定 —— 这就是无序链的代价。`,
      vars: vars({ key, b, 比较次数: compares, 结果: '未命中' }),
      layers: layers(b, { focus1: [b], pointers: [ptrH(key, b)] }, { pointers: [] }),
    }));
    found = false;
  };

  /* ---------------- 时间线 */

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: `${cfg.initNote(m)}桶头数组一开始 m 个都是空链（· 表示桶头 = NULL）。`,
    vars: { m, key: null, 桶号: '—', 链长: '—' },
    layers: layers(null, {}, {}),
  }));

  keys.forEach((k) => insert(k));
  if (query != null) lookup(query);

  const bucketsObj = {};
  buckets.forEach((ch, i) => {
    if (ch.length) bucketsObj[i] = [...ch];
  });
  const used = buckets.map((ch, i) => (ch.length ? i : -1)).filter((i) => i >= 0);
  const result = { buckets: bucketsObj, found: query == null ? false : found, compares: query == null ? 0 : compares };

  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `结束：${used.length} 个非空桶（${used.map((i) => `桶${i}: ${buckets[i].join('→')}`).join('；') || '全空'}）。${query == null ? '' : `查找 ${query} ${found ? '命中' : '未命中'}，链内比较 ${compares} 次。`}三种写法的桶分布相同，链内顺序与比较次数不同：头插法链序反转、尾插法保持插入序、有序链能提前停。`,
    vars: vars({ key: null, 比较次数: query == null ? '—' : compares, 结果: query == null ? '—' : found ? '命中' : '未命中' }),
    layers: layers(curBucket, { done: used }, { done: curBucket == null ? [] : buckets[curBucket].map((k) => nodeId(k)) }),
  }));

  return trace({
    algorithmId: meta.id,
    variantId,
    sourceVersion: `hash-chaining-${variantId}-v1`,
    lines: L,
    steps,
    result,
    meta: { m, keys: keys.length },
  });
}

export function run(variantId, input) {
  if (!CFG[variantId]) throw new Error(`未知变体：${variantId}`);
  return runChaining(variantId, input || {});
}

export function sourceLines(variantId) {
  return LINES[variantId] || LINES.v1;
}
