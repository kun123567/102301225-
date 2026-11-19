/**
 * E · 找倒数第 K 个结点（3 个代表性不同实现）
 *
 *   v1 快慢指针：fast 先单独走 K 步把间距拉开，再与 slow 同步前进；fast 走出表尾时 slow 即答案，
 *      全程只遍历一遍；K 越界只能靠"fast 还没走满 K 步就空了"发现。
 *   v2 两次遍历：第 1 趟单指针数出长度 n（不看值），第 2 趟从头走 n-K 步；两趟遍历换来"先知道 n"。
 *   v3 带边界校验版：先数长度拿到 n，K 的下界与上界都在动指针之前判掉，所以推进循环里不必判空，
 *      这与 v1 的"边动边判"是两种写法。
 *
 * 三版对合法 K 指向同一个结点，越界/空表一律拒绝；错误文案由 kGuardError() 统一生成，
 * 因此 expect 里可以直接写同一个字符串，三个变体共用一份样例。
 *
 * 链表在轨迹里的表示（linkLayer 的字段全部被 04_LINK_2D 渲染器消费）：
 *   head  = 头指针所指结点 id（null 就是空表）；nodes = 每步完整快照（n0 是正向第 0 个结点）；
 *   links = 当前所有 next 边；roles 里 pointers 用 {node:'n2'} 指结点，文字标签 fast / slow 永远在。
 */

import { trace, step, linkLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'e/kth-from-end',
  variants: [
    { id: 'v1', name: '快慢指针' },
    { id: 'v2', name: '两次遍历（先求长度）' },
    { id: 'v3', name: '带边界校验版' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'SqNode *kth_from_end(SqNode *head, int k) {' },
    { lineId: 'guard', text: '  if (k < 1) return NULL;                       /* 倒数第 0 个没有定义 */' },
    { lineId: 'init', text: '  SqNode *fast = head, *slow = head;            /* 两指针同起点，间距 0 */' },
    { lineId: 'adv-loop', text: '  for (int i = 0; i < k; ++i) {                 /* 第 1 段：fast 单独走 K 步 */' },
    { lineId: 'adv-null', text: '    if (fast == NULL) return NULL;              /* 没走满 K 步就空了 → K > 表长 */' },
    { lineId: 'adv', text: '    fast = fast->next;                          /* 间距 gap 每次 +1 */' },
    { lineId: 'adv-end', text: '  }' },
    { lineId: 'sync', text: '  while (fast != NULL) {                        /* 第 2 段：两指针同步前进 */' },
    { lineId: 'move-fast', text: '    fast = fast->next;' },
    { lineId: 'move-slow', text: '    slow = slow->next;                          /* slow 始终落后 K 步 */' },
    { lineId: 'sync-end', text: '  }' },
    { lineId: 'found', text: '  return slow;                                  /* fast 到尾，slow 即倒数第 K 个 */' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'SqNode *kth_by_length(SqNode *head, int k) {' },
    { lineId: 'guard', text: '  if (k < 1) return NULL;' },
    { lineId: 'len-init', text: '  int n = 0; SqNode *p = head;                  /* 第 1 趟只数个数 */' },
    { lineId: 'len-loop', text: '  for (; p != NULL; p = p->next) ++n;           /* 不看值，也不记别的 */' },
    { lineId: 'len-end', text: '  /* 第 1 趟结束：n 就是表长，越界判断现在才有依据 */' },
    { lineId: 'check', text: '  if (k > n) return NULL;                       /* K 超过表长 */' },
    { lineId: 'pos', text: '  int t = n - k;                                /* 倒数第 K 个 = 正向第 n-K 个（0 基） */' },
    { lineId: 'walk-init', text: '  SqNode *cur = head;' },
    { lineId: 'walk-loop', text: '  for (int i = 0; i < t; ++i) cur = cur->next;   /* 第 2 趟：只走 n-K 步 */' },
    { lineId: 'cost', text: '  /* 两趟遍历：n + (n-K) 次前进，比快慢指针多走 n-K 步 */' },
    { lineId: 'found', text: '  return cur;' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'SqNode *kth_checked(SqNode *head, int k) {' },
    { lineId: 'bound-low', text: '  if (k < 1) return NULL;                       /* 校验 1：K 的下界 */' },
    { lineId: 'count-init', text: '  int n = 0; SqNode *p = head;' },
    { lineId: 'count', text: '  for (; p != NULL; p = p->next) ++n;           /* 提前遍历：先把表长拿到手 */' },
    { lineId: 'bound-high', text: '  if (k > n) return NULL;                       /* 校验 2：K 的上界（此时才知道 n） */' },
    { lineId: 'init', text: '  SqNode *fast = head, *slow = head;            /* 过了两道校验才动指针 */' },
    { lineId: 'adv-init', text: '  int d = 0;                                    /* 已走步数，用来说明 gap */' },
    { lineId: 'adv-loop', text: '  while (d < k) { fast = fast->next; ++d; }     /* K 已合法，循环里不必判空 */' },
    { lineId: 'sync', text: '  while (fast != NULL) { fast = fast->next; slow = slow->next; }' },
    { lineId: 'found', text: '  return slow;' },
    { lineId: 'end', text: '}' },
  ],
};

/** 三种拒绝共用一个文案生成器：同一输入三个变体给出的错误串必须一模一样 */
function kGuardError(k, n) {
  if (k < 1) return `K = ${k} 不合法：K 必须 ≥ 1（倒数第 0 个没有定义）`;
  if (n === 0) return `空链表：没有任何结点，K = ${k} 取不到`;
  return `K = ${k} 超过表长 ${n}：倒数第 ${k} 个不存在`;
}

export const samples = [
  {
    id: 'normal',
    label: '[1,2,3,4] 的倒数第 2 个（答案 3，正向下标 2）',
    input: { list: [1, 2, 3, 4], k: 2 },
    expect: { ok: true, id: 'n2', value: 3, index: 2 },
  },
  {
    id: 'edge-k-equals-n',
    label: '[1,2,3,4] K = 4（倒数第 4 个就是表头，快指针恰好走空）',
    input: { list: [1, 2, 3, 4], k: 4 },
    expect: { ok: true, id: 'n0', value: 1, index: 0 },
  },
  {
    id: 'edge-k-zero',
    label: '[1,2,3,4] K = 0（下界越界：三个变体都拒绝）',
    input: { list: [1, 2, 3, 4], k: 0 },
    expect: { ok: false, id: null, error: kGuardError(0, 4) },
  },
  {
    id: 'edge-k-over',
    label: '[1,2,3,4] K = 5（上界越界：三个变体都拒绝）',
    input: { list: [1, 2, 3, 4], k: 5 },
    expect: { ok: false, id: null, error: kGuardError(5, 4) },
  },
  {
    id: 'edge-empty',
    label: '[] K = 1（空链表：没有结点可取）',
    input: { list: [], k: 1 },
    expect: { ok: false, id: null, error: kGuardError(1, 0) },
  },
];

/* ------------------------------------------------------------------ 链表小工具（本文件内部用） */

/** 建链：结点 id 直接用正向下标 n0..n{k-1}，这样 id 本身就读得出位置 */
function newChain(values) {
  const st = { nodes: [], valueOf: new Map(), nextOf: new Map(), indexOf: new Map(), head: null };
  values.forEach((v, i) => {
    const id = `n${i}`;
    st.nodes.push({ id, value: v });
    st.valueOf.set(id, v);
    st.indexOf.set(id, i);
    st.nextOf.set(id, null);
    if (i > 0) st.nextOf.set(`n${i - 1}`, id);
  });
  st.head = values.length ? 'n0' : null;
  return st;
}

/** 每步完整重建 layer（nodes / links 都是新鲜数组，roles 也是新的） */
function layerOf(st, roles = {}, badge = null) {
  return [linkLayer({
    id: 'main',
    title: 'head',
    name: '单链表（值 → 后继）',
    head: st.head,
    nodes: st.nodes.map((n) => ({
      id: n.id,
      value: n.value,
      ...(badge && badge.id === n.id ? { badge: badge.text } : {}),
    })),
    links: st.nodes.filter((n) => st.nextOf.get(n.id)).map((n) => ({ from: n.id, to: st.nextOf.get(n.id) })),
    roles,
  })];
}

/** fast / slow 两个指针（到 NULL 时不画指针，但 vars 里仍然写 NULL） */
function ptrRoles(fast, slow) {
  const out = [];
  if (fast) out.push({ id: 'fast', label: 'fast', node: fast });
  if (slow) out.push({ id: 'slow', label: 'slow', node: slow });
  return out;
}

/** 正向下标 < i0 的结点 id：这些位置之后不足 K 个结点，已排除 */
function below(st, i0) {
  return st.nodes.filter((x) => st.indexOf.get(x.id) < i0).map((x) => x.id);
}

/** 正向下标 >= i0 的结点 id：最后 K 个，答案就落在这一段里 */
function fromIdx(st, i0) {
  return st.nodes.filter((x) => st.indexOf.get(x.id) >= i0).map((x) => x.id);
}

/** 统一的拒绝收尾：一步 invalid 就 done，链一格不动 */
function reject(st, steps, L, lineId, note, vars, k, n, algoVersion, variantId) {
  const result = { ok: false, error: kGuardError(k, n), id: null, value: null, index: null, n, k };
  steps.push(step({
    event: 'invalid', lineId, note, vars,
    layers: layerOf(st, {}),
    done: true, result,
  }));
  return trace({
    algorithmId: meta.id, variantId, sourceVersion: algoVersion,
    lines: L, steps, result,
  });
}

/* ------------------------------------------------------------------ 变体 1（快慢指针） */

function runV1(input) {
  const src = Array.isArray(input.list) ? input.list : [];
  const k = Number.isInteger(input.k) ? input.k : 0;
  const n = src.length;
  const st = newChain(src);
  const steps = [];
  const L = LINES.v1;
  const tags = labelsOf(src);
  const V = (extra) => ({ n, k, ...extra });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空表：head = NULL。fast 与 slow 都只能指向 NULL，K 无论取什么都取不到结点。'
      : `初始链 ${tags.join(' → ')}（共 ${n} 个结点）。fast 与 slow 都先停在 head：接下来 fast 单独走 K = ${k} 步，把"间距"先拉开。`,
    vars: V({ gap: 0, fast: st.head, slow: st.head }),
    layers: layerOf(st, { pointers: ptrRoles(st.head, st.head) }),
  }));

  if (k < 1) {
    return reject(st, steps, L, 'guard',
      `K = ${k}：倒数第 0 个（也没有倒数第负数个）在单链表上没有定义。这一步就返回 NULL，一个指针都不动。`,
      V({ gap: 0, fast: st.head, slow: st.head }), k, n, 'kth-fast-slow-v1', 'v1');
  }

  let fast = st.head;
  let slow = st.head;
  let gap = 0;

  for (let i = 0; i < k; i++) {
    if (fast == null) {
      return reject(st, steps, L, 'adv-null',
        n === 0
          ? '空表：fast 一开始就是 NULL，第一步就发现"走不满 K 步"，直接拒绝。'
          : `fast 只走了 ${gap} 步就到 NULL，还没走满 K = ${k} 步——说明链只有 ${n} 个结点，K > 表长，拒绝。`,
        V({ gap, fast: null, slow }), k, n, 'kth-fast-slow-v1', 'v1');
    }
    fast = st.nextOf.get(fast) ?? null;
    gap += 1;
    steps.push(step({
      event: 'fast-advance', lineId: 'adv',
      note: fast == null
        ? `fast 走第 ${gap} 步后变成 NULL：链正好 ${n} 个结点、K = ${k} 走满了，slow 还在 head，倒数第 ${k} 个就是表头。`
        : k - gap === 0
          ? `fast 走第 ${gap} 步到 ${fast}（值 ${st.valueOf.get(fast)}）：间距已经拉满 K = ${k}，第 1 段结束，接下来两指针同步前进。`
          : `fast 走第 ${gap} 步到 ${fast}（值 ${st.valueOf.get(fast)}）：间距 gap = ${gap}，还差 ${k - gap} 步才拉开到 K。`,
      vars: V({ gap, fast, slow, remaining: k - gap }),
      layers: layerOf(st, {
        focus2: fast ? [fast] : [],
        pointers: ptrRoles(fast, slow),
      }),
    }));
  }

  while (fast) {
    const oldFast = fast;
    fast = st.nextOf.get(fast) ?? null;
    steps.push(step({
      event: 'sync-move', lineId: 'move-fast',
      note: fast == null
        ? `fast 从 ${oldFast} 前进到 NULL（到表尾了）。这轮是在 fast 还指向 ${oldFast} 时进的循环，所以 slow 仍要跟着走这一步——走完它后面就只剩 ${k - 1} 个结点。`
        : `fast 从 ${oldFast} 前进到 ${fast}（值 ${st.valueOf.get(fast)}），slow 这一步还不许动：只要 fast 没到尾，slow 跟着走就可能越过答案。`,
      vars: V({ gap, fast, slow }),
      layers: layerOf(st, {
        focus1: [slow], focus2: fast ? [fast] : [],
        excluded: below(st, st.indexOf.get(slow)),
        pointers: ptrRoles(fast, slow),
      }),
    }));
    slow = st.nextOf.get(slow) ?? null;
    steps.push(step({
      event: 'sync-move', lineId: 'move-slow',
      note: `slow 前进到 ${slow}（值 ${st.valueOf.get(slow)}）：它落后 fast ${gap} 步，而 fast 到表尾时正好剩 ${k - 1} 个结点在 slow 后面。`,
      vars: V({ gap, fast, slow }),
      layers: layerOf(st, {
        focus1: [slow], focus2: fast ? [fast] : [],
        excluded: below(st, st.indexOf.get(slow)),
        pointers: ptrRoles(fast, slow),
      }),
    }));
  }

  const idx = st.indexOf.get(slow);
  const val = st.valueOf.get(slow);
  steps.push(step({
    event: 'found', lineId: 'found',
    note: `fast 已经走出表尾，slow 停在 ${slow}（值 ${val}）。它落后 fast 整整 ${gap} 步，所以它后面正好还有 ${n - 1 - idx} 个结点(${n - idx} 个含自己)——这就是"倒数第 ${k} 个"，正向下标 ${idx} = n - K。`,
    vars: V({ gap, fast: null, slow, index: idx, value: val }),
    layers: layerOf(st, {
      focus1: [slow],
      done: fromIdx(st, idx),
      excluded: below(st, idx),
      pointers: ptrRoles(null, slow),
    }, { id: slow, text: '答案' }),
  }));

  const result = { ok: true, id: slow, value: val, index: idx, n, k };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `结论：n0..n${n - 1} 里倒数第 ${k} 个是 ${slow}（值 ${val}）。整个算法只走了一趟：fast 走 n 步、slow 走 n-K 步，额外空间就是两个指针。`,
    vars: V({ gap, fast: null, slow, index: idx, value: val }),
    layers: layerOf(st, {
      done: fromIdx(st, idx),
      excluded: below(st, idx),
      pointers: ptrRoles(null, slow),
    }, { id: slow, text: '答案' }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'kth-fast-slow-v1',
    lines: L, steps, result, meta: { index: idx },
  });
}

/* ------------------------------------------------------------------ 变体 2（两次遍历：先求长度） */

function runV2(input) {
  const src = Array.isArray(input.list) ? input.list : [];
  const k = Number.isInteger(input.k) ? input.k : 0;
  const n = src.length;
  const st = newChain(src);
  const steps = [];
  const L = LINES.v2;
  const tags = labelsOf(src);

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空表：这一版也要先数长度——第 1 趟什么也没数到，n = 0，后面必然判定越界。'
      : `初始链 ${tags.join(' → ')}。这一版不并行推进两个指针：第 1 趟单指针从头到尾只数个数，拿到 n 之后第 2 趟才算位置。`,
    vars: { n, k, len: 0, p: st.head },
    layers: layerOf(st, { pointers: st.head ? [{ id: 'p', label: 'p', node: st.head }] : [] }),
  }));

  if (k < 1) {
    return reject(st, steps, L, 'guard',
      `K = ${k} < 1：连"倒数第几个"都不成立，长度都不用数就返回 NULL。`,
      { n, k, len: '未数', p: st.head }, k, n, 'kth-two-pass-v1', 'v2');
  }

  let p = st.head;
  let len = 0;
  while (p) {
    p = st.nextOf.get(p) ?? null;
    len += 1;
    steps.push(step({
      event: 'fast-advance', lineId: 'len-loop',
      note: p
        ? `第 1 趟：p 前进到 ${p}（值 ${st.valueOf.get(p)}），已数 ${len} 个结点。这一趟刻意不看值，只看"还能不能走"。`
        : `第 1 趟：p 走出表尾，数到 ${len} 个结点。表长 n = ${len} 拿到了，现在才有资格判断 K = ${k} 是否越界。`,
      vars: { n, k, len, p },
      layers: layerOf(st, {
        focus2: p ? [p] : [],
        done: below(st, len),
        pointers: p ? [{ id: 'p', label: 'p', node: p }] : [],
      }),
    }));
  }

  if (k > len) {
    return reject(st, steps, L, 'check',
      `数出表长 n = ${len}，而 K = ${k} > n：倒数第 ${k} 个不存在。第 2 趟一步都不用走——这正是"先求长度"换来的确定性。`,
      { n, k, len, p: null }, k, n, 'kth-two-pass-v1', 'v2');
  }

  const t = len - k;
  steps.push(step({
    event: 'fast-advance', lineId: 'pos',
    note: `已有 n = ${len}、K = ${k}，换算成正向下标：n - K = ${t}。所以第 2 趟从 head 只需要走 ${t} 步，一步不多。`,
    vars: { n, k, len, t, cur: st.head },
    layers: layerOf(st, { pointers: st.head ? [{ id: 'cur', label: 'cur', node: st.head }] : [] }),
  }));

  let cur = st.head;
  for (let i = 0; i < t; i++) {
    cur = st.nextOf.get(cur) ?? null;
    steps.push(step({
      event: 'sync-move', lineId: 'walk-loop',
      note: `第 2 趟：cur 走第 ${i + 1} 步到 ${cur}（值 ${st.valueOf.get(cur)}），还差 ${t - i - 1} 步。注意这 ${t} 步是"额外"的——快慢指针版不需要它们。`,
      vars: { n, k, len, t, cur, remaining: t - i - 1 },
      layers: layerOf(st, {
        focus1: [cur],
        excluded: below(st, st.indexOf.get(cur)),
        pointers: [{ id: 'cur', label: 'cur', node: cur }],
      }),
    }));
  }

  const idx = st.indexOf.get(cur);
  const val = st.valueOf.get(cur);
  steps.push(step({
    event: 'found', lineId: 'found',
    note: `walk 完 ${t} 步停在 ${cur}（值 ${val}）：正向下标 ${idx} 处就是倒数第 ${k} 个。代价是总共走了 ${len} + ${t} = ${len + t} 步（快慢指针只走 ${len} 步）。`,
    vars: { n, k, len, t, cur, index: idx, value: val },
    layers: layerOf(st, {
      focus1: [cur],
      done: fromIdx(st, idx),
      excluded: below(st, idx),
      pointers: [{ id: 'cur', label: 'cur', node: cur }],
    }, { id: cur, text: '答案' }),
  }));

  const result = { ok: true, id: cur, value: val, index: idx, n, k };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `结论：表长 ${len}、K = ${k}，答案 ${cur}（值 ${val}）。两趟遍历的好处是任何时候都知道剩余步数，坏处是多走 ${t} 步。`,
    vars: { n, k, len, t, cur, index: idx, value: val },
    layers: layerOf(st, {
      done: fromIdx(st, idx),
      excluded: below(st, idx),
      pointers: [{ id: 'cur', label: 'cur', node: cur }],
    }, { id: cur, text: '答案' }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'kth-two-pass-v1',
    lines: L, steps, result, meta: { index: idx, extraWalk: t },
  });
}

/* ------------------------------------------------------------------ 变体 3（带边界校验版） */

function runV3(input) {
  const src = Array.isArray(input.list) ? input.list : [];
  const k = Number.isInteger(input.k) ? input.k : 0;
  const n = src.length;
  const st = newChain(src);
  const steps = [];
  const L = LINES.v3;
  const tags = labelsOf(src);

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空表：先把两道校验都过一遍再说——K 下界过不了就直接返回，链表连碰都不碰。'
      : `初始链 ${tags.join(' → ')}。这一版的口号是"先校验、后动手"：K 的下界、上界都在动 fast/slow 之前判掉。`,
    vars: { n, k, len: 0, fast: st.head, slow: st.head, validated: '否' },
    layers: layerOf(st, { pointers: ptrRoles(st.head, st.head) }),
  }));

  if (k < 1) {
    return reject(st, steps, L, 'bound-low',
      `校验 1（下界）：K = ${k} < 1，直接返回 NULL。后面的长度统计一步都不用做。`,
      { n, k, len: '未数', fast: st.head, slow: st.head, validated: '否' }, k, n, 'kth-checked-v1', 'v3');
  }

  let p = st.head;
  let len = 0;
  while (p) {
    p = st.nextOf.get(p) ?? null;
    len += 1;
    steps.push(step({
      event: 'fast-advance', lineId: 'count',
      note: p
        ? `校验阶段：p 前进到 ${p}，已数 ${len} 个结点。这一步纯为"拿到 n"，不涉及 fast/slow。`
        : `校验阶段结束：n = ${len}。有了 n，K 的上界就能提前判——这是 v1 做不到的（v1 只能等 fast 撞到 NULL 才知道越界）。`,
      vars: { n, k, len, p, fast: st.head, slow: st.head, validated: '下界已过' },
      layers: layerOf(st, {
        focus2: p ? [p] : [],
        done: below(st, len),
        pointers: p ? [{ id: 'p', label: 'p', node: p }] : [],
      }),
    }));
  }

  if (k > len) {
    return reject(st, steps, L, 'bound-high',
      `校验 2（上界）：n = ${len}，K = ${k} > n，提前拒绝。注意此时 fast/slow 一次都没有移动过——拒绝是"什么都没做"的纯失败。`,
      { n, k, len, p: null, fast: st.head, slow: st.head, validated: '下界已过' }, k, n, 'kth-checked-v1', 'v3');
  }

  let fast = st.head;
  let slow = st.head;
  let d = 0;
  steps.push(step({
    event: 'init', lineId: 'init',
    note: `两道校验都过了（1 ≤ ${k} ≤ ${len}），现在才把 fast / slow 摆到 head。这是本变体与 v1 的顺序差异：v1 先动指针再靠撞空判越界。`,
    vars: { n, k, len, d, fast, slow, validated: '是' },
    layers: layerOf(st, { pointers: ptrRoles(fast, slow) }),
  }));

  while (d < k) {
    fast = st.nextOf.get(fast) ?? null;
    d += 1;
    steps.push(step({
      event: 'fast-advance', lineId: 'adv-loop',
      note: fast
        ? `fast 走第 ${d} 步到 ${fast}（值 ${st.valueOf.get(fast)}）：因为 K 已校验合法，这里不必写 if (fast == NULL)。`
        : `fast 走第 ${d} 步后为 NULL：K 恰好等于表长，slow 仍在 head，答案就是表头。`,
      vars: { n, k, len, d, fast, slow, validated: '是' },
      layers: layerOf(st, {
        focus2: fast ? [fast] : [],
        pointers: ptrRoles(fast, slow),
      }),
    }));
  }

  while (fast) {
    const beforeFast = fast;
    fast = st.nextOf.get(fast) ?? null;
    slow = st.nextOf.get(slow) ?? null;
    steps.push(step({
      event: 'sync-move', lineId: 'sync',
      note: `同步一步：fast ${beforeFast} → ${fast == null ? 'NULL' : fast}，slow 跟到 ${slow}（值 ${st.valueOf.get(slow)}）。间距恒为 ${k}，所以 fast 到尾时 slow 刚好停在答案上。`,
      vars: { n, k, len, d, fast, slow },
      layers: layerOf(st, {
        focus1: [slow], focus2: fast ? [fast] : [],
        excluded: below(st, st.indexOf.get(slow)),
        pointers: ptrRoles(fast, slow),
      }),
    }));
  }

  const idx = st.indexOf.get(slow);
  const val = st.valueOf.get(slow);
  steps.push(step({
    event: 'found', lineId: 'found',
    note: `fast 出表尾，slow 停在 ${slow}（值 ${val}），正向下标 ${idx}。回顾本变体的取舍：多花一趟计数（${len} 步）换来"提前拒绝 + 循环内不判空"。`,
    vars: { n, k, len, d, fast: null, slow, index: idx, value: val },
    layers: layerOf(st, {
      focus1: [slow],
      done: fromIdx(st, idx),
      excluded: below(st, idx),
      pointers: ptrRoles(null, slow),
    }, { id: slow, text: '答案' }),
  }));

  const result = { ok: true, id: slow, value: val, index: idx, n, k };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `结论：倒数第 ${k} 个是 ${slow}（值 ${val}）。共走了 ${len}（计数）+ ${k}（fast 拉开间距）+ ${len - k}（同步）步。`,
    vars: { n, k, len, d, fast: null, slow, index: idx, value: val },
    layers: layerOf(st, {
      done: fromIdx(st, idx),
      excluded: below(st, idx),
      pointers: ptrRoles(null, slow),
    }, { id: slow, text: '答案' }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'kth-checked-v1',
    lines: L, steps, result, meta: { index: idx },
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
