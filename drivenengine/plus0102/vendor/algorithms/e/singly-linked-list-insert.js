/**
 * E · 单链表插入（3 个代表性不同实现）
 *
 *   v1 前驱定位后接链：先走 pos-1 步找到前驱 prev，再 s->next = prev->next、prev->next = s；
 *      pos == 0 必须单独判头（要改 head 指针）；
 *   v2 头结点（dummy）统一版：head 指向一个不存值的头结点，prev 从 dummy 出发，
 *      pos == 0 与其它位置走同一条改链语句，head 指针永远不动；
 *   v3 按值有序插入：不用 pos，沿链找第一个 >= value 的结点，插在它前面，链保持升序。
 *
 * 链表在轨迹里的表示（linkLayer 的 data 字段全部被 04_LINK_2D 渲染器消费）：
 *   head  = 头指针所指的结点 id（null 就是空表，渲染器画"空链表"框）；
 *   nodes = 完整快照（每步重建），未被 head 链到的结点（例如刚 new 出来还没接链的 s）
 *           会被渲染器摆在最右边，正好对应"游离结点"；
 *   links = 当前所有 from→to 的 next 边（改链 = 换掉其中一条）；
 *   roles = focus1/focus2/added/done 用节点 id，pointers 用 {node:'n2'} 指结点（文字标签永远在）。
 *
 * result 统一给 { array:[...], headId }（非法位置给 { error, array, headId }），
 * 这样三版可以共用 expect；v3 不按下标插入，越界样例用 expectByVariant 单独声明它的期望。
 */

import { trace, step, linkLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'e/singly-linked-list-insert',
  variants: [
    { id: 'v1', name: '前驱定位后接链' },
    { id: 'v2', name: '头结点（dummy）统一版' },
    { id: 'v3', name: '按值有序插入' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'bool insert(SqNode **head, DataType x, int pos) {   /* pos = 新结点要占的下标 0..n */' },
    { lineId: 'bounds', text: '  if (pos < 0 || pos > length(*head)) return false;   /* 位置越界：拒绝 */' },
    { lineId: 'alloc', text: '  SqNode *s = new_node(x);                  /* 先把新结点造出来 */' },
    { lineId: 'headcase', text: '  if (pos == 0) { s->next = *head; *head = s; return true; }   /* 插表头：必须动 head */' },
    { lineId: 'prev-init', text: '  SqNode *prev = *head;                /* 否则 prev 从第一个结点出发 */' },
    { lineId: 'walk', text: '  for (int k = 1; k < pos; ++k) prev = prev->next;   /* 走到第 pos-1 个结点 */' },
    { lineId: 'link-next', text: '  s->next = prev->next;                /* 次序 1：先接后继 */' },
    { lineId: 'link-prev', text: '  prev->next = s;                      /* 次序 2：再改前驱 */' },
    { lineId: 'end', text: '  return true;' },
    { lineId: 'fn-end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'bool insert(SqNode *head, DataType x, int pos) {   /* head 是不存值的头结点 */' },
    { lineId: 'bounds', text: '  if (pos < 0 || pos > length(head)) return false;   /* 头结点不计入 length */' },
    { lineId: 'alloc', text: '  SqNode *s = new_node(x);' },
    { lineId: 'prev-init', text: '  SqNode *prev = head;                 /* 从 dummy 出发：pos=0 时前驱就是 dummy */' },
    { lineId: 'walk', text: '  for (int k = 0; k < pos; ++k) prev = prev->next;   /* 统一走 pos 步，无需判头 */' },
    { lineId: 'link-next', text: '  s->next = prev->next;                /* 次序 1：先接后继 */' },
    { lineId: 'link-prev', text: '  prev->next = s;                      /* 次序 2：再改前驱（pos=0 也是这一句） */' },
    { lineId: 'head-fixed', text: '  /* head 指针始终指向 dummy：插表头时也不用更新 head */' },
    { lineId: 'end', text: '  return true;' },
    { lineId: 'fn-end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'bool insert_sorted(SqNode **head, DataType x) {   /* 不按下标：按值有序插入 */' },
    { lineId: 'alloc', text: '  SqNode *s = new_node(x);' },
    { lineId: 'empty', text: '  if (*head == NULL || (*head)->data >= x) {    /* 空表或新值最小 → 头插 */' },
    { lineId: 'head-insert', text: '    s->next = *head; *head = s;              /* 新结点成为第一个 */' },
    { lineId: 'head-ret', text: '    return true;' },
    { lineId: 'prev-stuck', text: '  }' },
    { lineId: 'prev-init', text: '  SqNode *prev = *head;   /* 表头一定小于 x，可以从它起步 */' },
    { lineId: 'walk', text: '  while (prev->next && prev->next->data < x) prev = prev->next;' },
    { lineId: 'link-next', text: '  s->next = prev->next;   /* 次序 1：接住第一个 >= x 的后继 */' },
    { lineId: 'link-prev', text: '  prev->next = s;         /* 次序 2：前驱指向新结点，链仍升序 */' },
    { lineId: 'end', text: '  return true;' },
  ],
};

const posError = (pos, n) => `插入位置 ${pos} 越界：合法范围 0..${n}（表长 ${n}）`;

export const samples = [
  {
    id: 'normal',
    label: '[1,3] 在位置 1 插入 2（插在中间）',
    input: { list: [1, 3], value: 2, pos: 1 },
    expect: { array: [1, 2, 3] },
  },
  {
    id: 'edge-empty',
    label: '[] 在位置 0 插入 5（空表插表头）',
    input: { list: [], value: 5, pos: 0 },
    expect: { array: [5] },
  },
  {
    id: 'edge-head-min',
    label: '[2,3] 在位置 0 插入 1（插在表头，要改 head）',
    input: { list: [2, 3], value: 1, pos: 0 },
    expect: { array: [1, 2, 3] },
  },
  {
    id: 'edge-append',
    label: '[1,3] 在位置 2 插入 9（pos == n，插到表尾之后）',
    input: { list: [1, 3], value: 9, pos: 2 },
    expect: { array: [1, 3, 9] },
  },
  {
    id: 'edge-pos-over',
    label: '[1,3] 在位置 9 插入 2（位置超长：v1/v2 拒绝；v3 不按下标，仍插成 [1,2,3]）',
    input: { list: [1, 3], value: 2, pos: 9 },
    expect: { error: '插入位置 9 越界：合法范围 0..2（表长 2）', array: [1, 3] },
    expectByVariant: { v3: { array: [1, 2, 3] } },
  },
];

/* ------------------------------------------------------------------ 链表小工具（本文件内部用） */

/** 建一条链：结点编号按原表顺序 n1..nk；dummy=true 时多一个不存值的头结点 */
function newChain({ values = [], dummy = false } = {}) {
  const st = { nodes: [], nextOf: new Map(), valueOf: new Map(), head: null, dummyId: null, seq: 0 };
  if (dummy) {
    st.dummyId = 'dummy';
    st.nodes.push({ id: 'dummy', value: 'dummy', badge: '头结点' });
    st.valueOf.set('dummy', null);
    st.nextOf.set('dummy', null);
    st.head = 'dummy';
  }
  let prev = st.head;
  for (const v of values) {
    st.seq += 1;
    const id = `n${st.seq}`;
    st.nodes.push({ id, value: v });
    st.valueOf.set(id, v);
    st.nextOf.set(id, null);
    if (st.head == null) st.head = id;
    else st.nextOf.set(prev, id);
    prev = id;
  }
  return st;
}

/** 新结点入册（还没接进链，所以画在最右边） */
function allocNode(st, value) {
  st.seq += 1;
  const id = `n${st.seq}`;
  st.nodes.push({ id, value, badge: 'new' });
  st.valueOf.set(id, value);
  st.nextOf.set(id, null);
  return id;
}

/** 沿 head 走出来的结点 id（含 dummy，调用方自己过滤） */
function chainIds(st) {
  const out = [];
  const seen = new Set();
  let cur = st.head;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = st.nextOf.get(cur) ?? null;
  }
  return out;
}

/** 逻辑链表的值序列（不含 dummy） */
function listValues(st) {
  return chainIds(st).filter((id) => id !== st.dummyId).map((id) => st.valueOf.get(id));
}

/** 每步完整重建 layer（nodes / links / head 都是新鲜数组） */
function layerOf(st, roles = {}, name = '单链表（值 → 后继）') {
  return [linkLayer({
    id: 'main',
    title: 'head',
    name,
    head: st.head,
    nodes: st.nodes.map((n) => ({ id: n.id, value: n.value, ...(n.badge ? { badge: n.badge } : {}) })),
    links: st.nodes.filter((n) => st.nextOf.get(n.id)).map((n) => ({ from: n.id, to: st.nextOf.get(n.id) })),
    roles,
  })];
}

/* ------------------------------------------------------------------ 变体 1（前驱定位后接链） */

function runV1(input) {
  const src = Array.isArray(input.list) ? input.list : [];
  const value = input.value;
  const pos = Number.isInteger(input.pos) ? input.pos : 0;
  const n = src.length;
  const st = newChain({ values: src });
  const steps = [];
  const L = LINES.v1;
  const tags = labelsOf(src);

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空表：head = NULL。pos 只能是 0，插表头就是给 head 赋值。'
      : `初始链：${tags.join(' → ')}（长度 ${n}）。pos = ${pos} 的合法范围是 0..${n}，pos == ${n} 表示插到表尾之后。`,
    vars: { n, pos, value, head: st.head },
    layers: layerOf(st, {}),
  }));

  if (pos < 0 || pos > n) {
    const error = posError(pos, n);
    const result = { error, array: [...src], headId: st.head };
    steps.push(step({
      event: 'invalid', lineId: 'bounds', done: true, result,
      note: `${error}。位置越界时一个新结点都不建、链一格的箭头都不改——先校验，再动手。`,
      vars: { n, pos, value, head: st.head },
      layers: layerOf(st, {}),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v1', sourceVersion: 'sll-insert-prev-v1',
      lines: L, steps, result,
    });
  }

  const id = allocNode(st, value);
  steps.push(step({
    event: 'new-node', lineId: 'alloc',
    note: `申请新结点 s（数据域 = ${value}）。它还没接进链，所以画在最右边、没有箭头——"先造结点，再接链"。`,
    vars: { n, pos, value, head: st.head },
    layers: layerOf(st, { added: [id] }),
  }));

  if (pos === 0) {
    const oldHead = st.head;
    st.nextOf.set(id, oldHead);
    steps.push(step({
      event: 'link-next', lineId: 'headcase',
      note: oldHead
        ? `pos = 0：s->next = head（原来的第一个结点，值 ${st.valueOf.get(oldHead)}）。先把 s 的后继接上，否则原链会丢。`
        : 'pos = 0：s->next = head = NULL（空表，s 就是唯一结点）。',
      vars: { n, pos, value, head: st.head },
      layers: layerOf(st, { added: [id], focus2: oldHead ? [oldHead] : [] }),
    }));
    st.head = id;
    steps.push(step({
      event: 'update-head', lineId: 'headcase',
      note: '再改头指针 head = s。插在表头必须单独动 head，这正是本变体要判 pos == 0 的原因（dummy 版能省掉这一支）。',
      vars: { n, pos, value, head: st.head },
      layers: layerOf(st, { added: [id], done: [id] }),
    }));
  } else {
    let prev = st.head;
    steps.push(step({
      event: 'locate-prev', lineId: 'prev-init',
      note: `prev 从 head 出发（值 ${st.valueOf.get(prev)}）：新结点要接在第 ${pos} 个位置，所以前驱是第 ${pos - 1} 个结点。`,
      vars: { n, pos, value, k: 0, prev, head: st.head },
      layers: layerOf(st, { focus2: [prev], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
    }));
    for (let k = 1; k < pos; k++) {
      prev = st.nextOf.get(prev);
      steps.push(step({
        event: 'locate-prev', lineId: 'walk',
        note: `prev 前进到第 ${k} 个结点（值 ${st.valueOf.get(prev)}）：还差 ${pos - 1 - k} 步就到 pos-1 = ${pos - 1}。`,
        vars: { n, pos, value, k, prev, head: st.head },
        layers: layerOf(st, { focus2: [prev], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
      }));
    }
    const nxt = st.nextOf.get(prev);
    st.nextOf.set(id, nxt);
    steps.push(step({
      event: 'link-next', lineId: 'link-next',
      note: nxt
        ? `s->next = prev->next（值 ${st.valueOf.get(nxt)}）。这一步先做，因为 prev->next 一旦被改写，原来的后继就再也找不回来了。`
        : 's->next = prev->next = NULL：prev 是表尾，s 接上去成为新表尾。',
      vars: { n, pos, value, prev, head: st.head },
      layers: layerOf(st, {
        added: [id], focus2: nxt ? [nxt] : [],
        pointers: [{ id: 'prev', label: 'prev', node: prev }],
      }),
    }));
    st.nextOf.set(prev, id);
    steps.push(step({
      event: 'link-prev', lineId: 'link-prev',
      note: 'prev->next = s，链接上了。改链次序（先后继、再前驱）是单链表插入唯一容易写错的地方。',
      vars: { n, pos, value, prev, head: st.head },
      layers: layerOf(st, { added: [id], done: [id], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
    }));
  }

  const result = { array: listValues(st), headId: st.head };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `插入完成：${result.array.join(' → ')}。原 ${n} 个结点 + 新 1 个 = ${result.array.length} 个，head 指向 ${st.head}。`,
    vars: { n, pos, value, head: st.head },
    layers: layerOf(st, { done: chainIds(st) }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'sll-insert-prev-v1',
    lines: L, steps, result, meta: { len: result.array.length },
  });
}

/* ------------------------------------------------------------------ 变体 2（头结点 dummy 统一版） */

function runV2(input) {
  const src = Array.isArray(input.list) ? input.list : [];
  const value = input.value;
  const pos = Number.isInteger(input.pos) ? input.pos : 0;
  const n = src.length;
  const st = newChain({ values: src, dummy: true });
  const steps = [];
  const L = LINES.v2;
  const tags = labelsOf(src);

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? 'head 指向一个不存值的头结点 dummy，dummy->next = NULL：链长 0。有了 dummy，插表头与插中间就是同一件事。'
      : `head 指向不存值的头结点 dummy，真实数据在 dummy->next 之后：${tags.join(' → ')}（长度 ${n}）。pos 合法范围 0..${n}。`,
    vars: { n, pos, value, head: st.head, dummy: st.dummyId },
    layers: layerOf(st, {}, '单链表（dummy 头结点 + 值 → 后继）'),
  }));

  if (pos < 0 || pos > n) {
    const error = posError(pos, n);
    const result = { error, array: [...src], headId: st.head };
    steps.push(step({
      event: 'invalid', lineId: 'bounds', done: true, result,
      note: `${error}（length 只数真实结点，dummy 不算）。拒绝时不建结点、不改箭头。`,
      vars: { n, pos, value, head: st.head, dummy: st.dummyId },
      layers: layerOf(st, {}, '单链表（dummy 头结点 + 值 → 后继）'),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v2', sourceVersion: 'sll-insert-dummy-v1',
      lines: L, steps, result,
    });
  }

  const id = allocNode(st, value);
  steps.push(step({
    event: 'new-node', lineId: 'alloc',
    note: `申请新结点 s（数据域 = ${value}），此时它还没进链，画在最右边。`,
    vars: { n, pos, value, head: st.head, dummy: st.dummyId },
    layers: layerOf(st, { added: [id] }, '单链表（dummy 头结点 + 值 → 后继）'),
  }));

  let prev = st.head; // = dummy
  steps.push(step({
    event: 'locate-prev', lineId: 'prev-init',
    note: `prev 从 dummy 出发：插 0 号位时"前驱"就是 dummy，插其他位置时它再往后走——两种情况共用同一套代码。`,
    vars: { n, pos, value, k: 0, prev, head: st.head, dummy: st.dummyId },
    layers: layerOf(st, { focus2: [prev], pointers: [{ id: 'prev', label: 'prev', node: prev }] }, '单链表（dummy 头结点 + 值 → 后继）'),
  }));
  for (let k = 0; k < pos; k++) {
    prev = st.nextOf.get(prev);
    steps.push(step({
      event: 'locate-prev', lineId: 'walk',
      note: `prev 走第 ${k + 1} 步，停在第 ${k + 1} 个真实结点（值 ${st.valueOf.get(prev)}）：再走 ${pos - 1 - k} 步就到前驱位置。`,
      vars: { n, pos, value, k: k + 1, prev, head: st.head, dummy: st.dummyId },
      layers: layerOf(st, { focus2: [prev], pointers: [{ id: 'prev', label: 'prev', node: prev }] }, '单链表（dummy 头结点 + 值 → 后继）'),
    }));
  }

  const nxt = st.nextOf.get(prev);
  st.nextOf.set(id, nxt);
  steps.push(step({
    event: 'link-next', lineId: 'link-next',
    note: nxt
      ? `s->next = prev->next（值 ${st.valueOf.get(nxt)}）：仍然先接后继。`
      : `s->next = prev->next = NULL${pos === 0 ? '（空表，prev 就是 dummy）' : '（prev 是表尾）'}，s 将成为新表尾。`,
    vars: { n, pos, value, prev, head: st.head, dummy: st.dummyId },
    layers: layerOf(st, {
      added: [id], focus2: nxt ? [nxt] : [],
      pointers: [{ id: 'prev', label: 'prev', node: prev }],
    }, '单链表（dummy 头结点 + 值 → 后继）'),
  }));

  st.nextOf.set(prev, id);
  steps.push(step({
    event: 'link-prev', lineId: 'link-prev',
    note: `prev->next = s：pos = ${pos} 与其它位置走的是同一条语句，代码里没有 "if (pos == 0)" 分支。`,
    vars: { n, pos, value, prev, head: st.head, dummy: st.dummyId },
    layers: layerOf(st, { added: [id], done: [id], pointers: [{ id: 'prev', label: 'prev', node: prev }] },
      '单链表（dummy 头结点 + 值 → 后继）'),
  }));

  steps.push(step({
    event: 'update-head', lineId: 'head-fixed',
    note: 'head 依然指向 dummy：即使插在 0 号位也没有改 head。这就是头结点版的收益——插入删除都不用判头。',
    vars: { n, pos, value, head: st.head, dummy: st.dummyId },
    layers: layerOf(st, { done: chainIds(st) }, '单链表（dummy 头结点 + 值 → 后继）'),
  }));

  const result = { array: listValues(st), headId: st.head };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `插入完成：${result.array.join(' → ')}（真实结点 ${result.array.length} 个，dummy 不计入）。headId = dummy，真实表头是 dummy->next。`,
    vars: { n, pos, value, head: st.head, dummy: st.dummyId },
    layers: layerOf(st, { done: chainIds(st) }, '单链表（dummy 头结点 + 值 → 后继）'),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'sll-insert-dummy-v1',
    lines: L, steps, result, meta: { len: result.array.length },
  });
}

/* ------------------------------------------------------------------ 变体 3（按值有序插入） */

function runV3(input) {
  const src = Array.isArray(input.list) ? input.list : [];
  const value = input.value;
  const n = src.length;
  const st = newChain({ values: src });
  const steps = [];
  const L = LINES.v3;
  const tags = labelsOf(src);

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? `空表：head = NULL，插入 ${value} 之后它就是唯一结点。本变体不使用 pos 参数——位置由值决定。`
      : `有序链：${tags.join(' → ')}。本变体不使用 pos 参数（位置由值的大小决定）：从表头找第一个 >= ${value} 的结点，把 s 插在它前面。`,
    vars: { n, value, head: st.head, pos: '不使用' },
    layers: layerOf(st, {}),
  }));

  const id = allocNode(st, value);
  steps.push(step({
    event: 'new-node', lineId: 'alloc',
    note: `申请新结点 s（数据域 = ${value}），还没进链，画在最右边。`,
    vars: { n, value, head: st.head, pos: '不使用' },
    layers: layerOf(st, { added: [id] }),
  }));

  const headVal = st.head == null ? null : st.valueOf.get(st.head);
  if (st.head == null || headVal >= value) {
    steps.push(step({
      event: 'locate-prev', lineId: 'empty',
      note: st.head == null
        ? `head == NULL：空表，直接走头插分支。`
        : `head 的值 ${headVal} >= ${value}：新值最小，插在表头（头插分支），不用再往后找。`,
      vars: { n, value, head: st.head, pos: '不使用' },
      layers: layerOf(st, { added: [id] }),
    }));
    const oldHead = st.head;
    st.nextOf.set(id, oldHead);
    steps.push(step({
      event: 'link-next', lineId: 'head-insert',
      note: oldHead ? `s->next = head（值 ${st.valueOf.get(oldHead)}）：先接住原链。` : 's->next = head = NULL：空表，s 的后继是空。',
      vars: { n, value, head: st.head, pos: '不使用' },
      layers: layerOf(st, { added: [id], focus2: oldHead ? [oldHead] : [] }),
    }));
    st.head = id;
    steps.push(step({
      event: 'update-head', lineId: 'head-insert',
      note: 'head = s：有序插入出现在表头时，head 指针必须更新。',
      vars: { n, value, head: st.head, pos: '不使用' },
      layers: layerOf(st, { added: [id], done: [id] }),
    }));
  } else {
    let prev = st.head;
    steps.push(step({
      event: 'locate-prev', lineId: 'prev-init',
      note: `head 的值 ${headVal} < ${value}，不走头插。prev 从第一个结点出发：它一定小于 ${value}，是合法前驱。`,
      vars: { n, value, k: 0, prev, head: st.head, pos: '不使用' },
      layers: layerOf(st, { focus2: [prev], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
    }));
    while (st.nextOf.get(prev) && st.valueOf.get(st.nextOf.get(prev)) < value) {
      prev = st.nextOf.get(prev);
      steps.push(step({
        event: 'locate-prev', lineId: 'walk',
        note: `prev->next 的值 ${st.valueOf.get(prev)} 仍小于 ${value}：prev 后移一位。要找的是"第一个 >= ${value} 的结点"。`,
        vars: { n, value, prev, head: st.head, pos: '不使用' },
        layers: layerOf(st, { focus2: [prev], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
      }));
    }
    const nxt = st.nextOf.get(prev);
    steps.push(step({
      event: 'locate-prev', lineId: 'walk',
      note: nxt
        ? `prev->next 的值 ${st.valueOf.get(nxt)} >= ${value}：停下。prev 就是插入点的前驱，s 要插在 ${st.valueOf.get(nxt)} 前面。`
        : `prev->next == NULL：新值 ${value} 最大，s 将成为新表尾。`,
      vars: { n, value, prev, head: st.head, pos: '不使用' },
      layers: layerOf(st, { focus2: [prev], focus1: nxt ? [nxt] : [], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
    }));
    st.nextOf.set(id, nxt);
    steps.push(step({
      event: 'link-next', lineId: 'link-next',
      note: nxt ? `s->next = prev->next（值 ${st.valueOf.get(nxt)}）：先接后继，保住后半段。` : 's->next = prev->next = NULL。',
      vars: { n, value, prev, head: st.head, pos: '不使用' },
      layers: layerOf(st, {
        added: [id], focus2: nxt ? [nxt] : [],
        pointers: [{ id: 'prev', label: 'prev', node: prev }],
      }),
    }));
    st.nextOf.set(prev, id);
    steps.push(step({
      event: 'link-prev', lineId: 'link-prev',
      note: `prev->next = s：接上之后 ${st.valueOf.get(prev)} → ${value}${nxt ? ` → ${st.valueOf.get(nxt)}` : ''} 仍是升序。`,
      vars: { n, value, prev, head: st.head, pos: '不使用' },
      layers: layerOf(st, { added: [id], done: [id], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
    }));
  }

  const result = { array: listValues(st), headId: st.head };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `有序插入完成：${result.array.join(' → ')}。因为链插入前后都升序，"找第一个 >= ${value} 的结点"这一步等价于按位置插到正确的地方，所以根本不需要 pos。`,
    vars: { n, value, head: st.head, pos: '不使用' },
    layers: layerOf(st, { done: chainIds(st) }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'sll-insert-sorted-v1',
    lines: L, steps, result, meta: { len: result.array.length },
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
