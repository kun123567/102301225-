/**
 * E · 单链表删除（3 个代表性不同实现）
 *
 *   v1 前驱改链：走 pos-1 步找到前驱 prev，prev->next = target->next，取出值后释放目标；
 *      pos == 0 要单独改 head（删表头）；
 *   v2 头结点（dummy）统一版：head 指向不存值的头结点，prev 从 dummy 出发，
 *      删 0 号位与删中间是同一条 "prev->next = t->next"，head 指针永远不改；
 *   v3 删除所有匹配值：先连续删头，再沿链用"指针接力"删掉所有值等于 x 的结点
 *      （可能连续多个），prev 只在"确认保留"时前进。
 *
 * 链表表示（linkLayer.data 的字段都被 04_LINK_2D 渲染器消费）：
 *   head  = 头指针指向的结点 id（null = 空表，渲染器画"空链表"框）；
 *   nodes = 完整快照（每步重建）；被 free 的结点从数组里移除，所以画面上真的消失；
 *           改链后暂时"游离"的目标结点还在 nodes 里但已不被 head 链到，渲染器把它摆到最右边，
 *           正好演示"先断链、再释放"；
 *   links = 当前所有 next 边；   roles = 用节点 id，pointers 用 {node:'n2'}。
 *
 * result 统一给 { array:[…], headId }（非法操作给 { error, array, headId }）；
 * v3 不按位置删除，越界/重复值样例用 expectByVariant 单独声明它的期望。
 */

import { trace, step, linkLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'e/singly-linked-list-delete',
  variants: [
    { id: 'v1', name: '前驱改链' },
    { id: 'v2', name: '头结点统一版' },
    { id: 'v3', name: '删除所有匹配值' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'bool delete_node(SqNode **head, int pos, DataType *out) {   /* pos = 被删结点的下标 */' },
    { lineId: 'invalid', text: '  if (*head == NULL) return false;                  /* 空表：非法操作 */' },
    { lineId: 'bounds', text: '  if (pos < 0 || pos >= length(*head)) return false;   /* 位置越界：拒绝 */' },
    { lineId: 'headcase', text: '  if (pos == 0) { SqNode *t = *head; *head = t->next; *out = t->data; free(t); return true; }' },
    { lineId: 'prev-init', text: '  SqNode *prev = *head;                  /* prev 从第一个结点出发 */' },
    { lineId: 'walk', text: '  for (int k = 1; k < pos; ++k) prev = prev->next;   /* 走到第 pos-1 个：目标的前驱 */' },
    { lineId: 'target', text: '  SqNode *t = prev->next;                   /* 目标结点 */' },
    { lineId: 'relink', text: '  prev->next = t->next;                     /* 跨过目标：前驱直连目标的后继 */' },
    { lineId: 'free', text: '  *out = t->data; free(t);                    /* 先取值，再释放 */' },
    { lineId: 'end', text: '  return true;' },
  ],
  v2: [
    { lineId: 'fn', text: 'bool delete_node(SqNode *head, int pos, DataType *out) {   /* head 是不存值的头结点 */' },
    { lineId: 'invalid', text: '  if (pos < 0 || pos >= length(head)) return false;   /* 空表时 length=0，一律拒绝 */' },
    { lineId: 'prev-init', text: '  SqNode *prev = head;                   /* 从 dummy 出发 */' },
    { lineId: 'walk', text: '  for (int k = 0; k < pos; ++k) prev = prev->next;   /* 统一走 pos 步 */' },
    { lineId: 'target', text: '  SqNode *t = prev->next;                   /* 目标结点 = 前驱的后继 */' },
    { lineId: 'relink', text: '  prev->next = t->next;                   /* 删 0 号位与删中间都是这一句 */' },
    { lineId: 'free', text: '  *out = t->data; free(t);' },
    { lineId: 'head-fixed', text: '  /* head 始终指向 dummy：删表头也不用改 head */' },
    { lineId: 'end', text: '  return true;' },
  ],
  v3: [
    { lineId: 'fn', text: 'int delete_all(SqNode **head, DataType x) {   /* 不按位置：删除所有值为 x 的结点 */' },
    { lineId: 'empty', text: '  if (*head == NULL) return -1;                   /* 空表：非法操作 */' },
    { lineId: 'headloop', text: '  while (*head && (*head)->data == x) { *head = (*head)->next; ++removed; }   /* 连续删头 */' },
    { lineId: 'restart', text: '  SqNode *prev = *head;                   /* 删完表头后把 prev 重新锚定 */' },
    { lineId: 'walk', text: '  while (prev && prev->next) {' },
    { lineId: 'test', text: '    if (prev->next->data == x) {            /* 命中：删 prev 的后继 */' },
    { lineId: 'relink', text: '      prev->next = prev->next->next;      /* 跨过它，prev 本身不动 */' },
    { lineId: 'count', text: '      ++removed;' },
    { lineId: 'step', text: '    } else prev = prev->next;               /* 不匹配：prev 前进（指针接力） */' },
    { lineId: 'walk-end', text: '  }' },
    { lineId: 'end', text: '  return removed;' },
  ],
};

const EMPTY_ERROR = '空表：没有可删除的结点';
const posError = (pos, n) => `删除位置 ${pos} 越界：合法范围 0..${n - 1}（表长 ${n}）`;

export const samples = [
  {
    id: 'normal',
    label: '[1,2,3] 删位置 0（删表头：v1 要改 head，v2 走同一句 relink；v3 删掉所有 1）',
    input: { list: [1, 2, 3], pos: 0, value: 1 },
    expect: { array: [2, 3] },
  },
  {
    id: 'edge-tail',
    label: '[1,2,3] 删表尾（位置 2：前驱的 next 置空）',
    input: { list: [1, 2, 3], pos: 2, value: 3 },
    expect: { array: [1, 2] },
  },
  {
    id: 'edge-empty',
    label: '[] 空表删除（非法操作，三版都拒绝）',
    input: { list: [], pos: 0, value: 1 },
    expect: { error: '空表：没有可删除的结点', array: [] },
  },
  {
    id: 'edge-pos-over',
    label: '[1,2,3] 删位置 9（v1/v2 越界拒绝；v3 不按位置，删掉所有 1 → [2,3]）',
    input: { list: [1, 2, 3], pos: 9, value: 1 },
    expect: { error: '删除位置 9 越界：合法范围 0..2（表长 3）', array: [1, 2, 3] },
    expectByVariant: { v3: { array: [2, 3] } },
  },
  {
    id: 'edge-dup-values',
    label: '[2,1,2,2] 删位置 0（重复值：v1/v2 只删一个 → [1,2,2]；v3 删全部 2 → [1]）',
    input: { list: [2, 1, 2, 2], pos: 0, value: 2 },
    expect: { array: [1, 2, 2] },
    expectByVariant: { v3: { array: [1] } },
  },
];

/* ------------------------------------------------------------------ 链表小工具（本文件内部用） */

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

function listValues(st) {
  return chainIds(st).filter((id) => id !== st.dummyId).map((id) => st.valueOf.get(id));
}

/** 真正"释放"：从显示结点数组里移除，画面上就消失了 */
function freeNode(st, id) {
  const i = st.nodes.findIndex((n) => n.id === id);
  if (i >= 0) st.nodes.splice(i, 1);
}

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

/* ------------------------------------------------------------------ 变体 1（前驱改链） */

function runV1(input) {
  const src = Array.isArray(input.list) ? input.list : [];
  const pos = Number.isInteger(input.pos) ? input.pos : 0;
  const n = src.length;
  const st = newChain({ values: src });
  const steps = [];
  const L = LINES.v1;
  const tags = labelsOf(src);

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空表：head = NULL，没有任何结点可删——这是非法操作。'
      : `初始链：${tags.join(' → ')}（长度 ${n}）。pos = ${pos} 的合法范围是 0..${n - 1}；要删位置 ${pos} 的结点，先找它的前驱。`,
    vars: { n, pos, head: st.head },
    layers: layerOf(st, {}),
  }));

  if (n === 0) {
    const result = { error: EMPTY_ERROR, array: [], headId: null };
    steps.push(step({
      event: 'invalid', lineId: 'invalid', done: true, result,
      note: `${EMPTY_ERROR}：空表连表头都没有，取不出前驱，直接拒绝（返回 false / 抛错都可以，但不能动链）。`,
      vars: { n, pos, head: null },
      layers: layerOf(st, {}),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v1', sourceVersion: 'sll-delete-prev-v1',
      lines: L, steps, result,
    });
  }

  if (pos < 0 || pos >= n) {
    const error = posError(pos, n);
    const result = { error, array: [...src], headId: st.head };
    steps.push(step({
      event: 'invalid', lineId: 'bounds', done: true, result,
      note: `${error}。越界时链一格都不动——先校验位置，再动手改链。`,
      vars: { n, pos, head: st.head },
      layers: layerOf(st, {}),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v1', sourceVersion: 'sll-delete-prev-v1',
      lines: L, steps, result,
    });
  }

  if (pos === 0) {
    const t = st.head;
    steps.push(step({
      event: 'target', lineId: 'headcase',
      note: `pos = 0：目标就是表头结点（值 ${st.valueOf.get(t)}）。删它没有"前驱"可用，必须直接改 head。`,
      vars: { n, pos, head: st.head, target: st.valueOf.get(t) },
      layers: layerOf(st, { focus1: [t] }),
    }));
    const nxt = st.nextOf.get(t);
    st.head = nxt;
    steps.push(step({
      event: 'update-head', lineId: 'headcase',
      note: nxt
        ? `head = t->next（值 ${st.valueOf.get(nxt)}）：表头往后挪一格。此时被删结点已经游离在链外。`
        : 'head = t->next = NULL：删掉唯一结点后表就空了。',
      vars: { n, pos, head: st.head, target: st.valueOf.get(t) },
      layers: layerOf(st, { excluded: [t], focus2: nxt ? [nxt] : [] }),
    }));
    freeNode(st, t);
    steps.push(step({
      event: 'free-node', lineId: 'free',
      note: `释放被删结点（值 ${st.valueOf.get(t)}）：free 之后它才真正从画面消失，链长 ${n} → ${n - 1}。`,
      vars: { n: n - 1, pos, head: st.head },
      layers: layerOf(st, { done: chainIds(st) }),
    }));
  } else {
    let prev = st.head;
    steps.push(step({
      event: 'locate-prev', lineId: 'prev-init',
      note: `prev 从 head 出发（值 ${st.valueOf.get(prev)}）：目标是位置 ${pos}，所以前驱是位置 ${pos - 1}。`,
      vars: { n, pos, k: 0, prev, head: st.head },
      layers: layerOf(st, { focus2: [prev], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
    }));
    for (let k = 1; k < pos; k++) {
      prev = st.nextOf.get(prev);
      steps.push(step({
        event: 'locate-prev', lineId: 'walk',
        note: `prev 前进到第 ${k} 个结点（值 ${st.valueOf.get(prev)}）：还差 ${pos - 1 - k} 步。`,
        vars: { n, pos, k, prev, head: st.head },
        layers: layerOf(st, { focus2: [prev], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
      }));
    }
    const t = st.nextOf.get(prev);
    steps.push(step({
      event: 'target', lineId: 'target',
      note: `t = prev->next = 位置 ${pos} 的结点（值 ${st.valueOf.get(t)}）。目标找到，它的后继是 ${st.nextOf.get(t) ? `值 ${st.valueOf.get(st.nextOf.get(t))}` : 'NULL（要删的是表尾）'}。`,
      vars: { n, pos, prev, head: st.head, target: st.valueOf.get(t) },
      layers: layerOf(st, { focus1: [t], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
    }));
    const nxt = st.nextOf.get(t);
    st.nextOf.set(prev, nxt);
    steps.push(step({
      event: 'relink', lineId: 'relink',
      note: nxt
        ? `prev->next = t->next（值 ${st.valueOf.get(nxt)}）：前驱跨过目标直连后继。注意 t 本身仍是老的指向关系，只是没人指向它了。`
        : 'prev->next = t->next = NULL：删表尾，前驱变成新的表尾。',
      vars: { n, pos, prev, head: st.head, target: st.valueOf.get(t) },
      layers: layerOf(st, { excluded: [t], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
    }));
    freeNode(st, t);
    steps.push(step({
      event: 'free-node', lineId: 'free',
      note: `释放目标结点（值 ${st.valueOf.get(t)}），链长 ${n} → ${n - 1}。次序：先改链，再 free——反了就先丢后继再改链。`,
      vars: { n: n - 1, pos, prev, head: st.head },
      layers: layerOf(st, { done: chainIds(st), pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
    }));
  }

  const result = { array: listValues(st), headId: st.head };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: result.array.length === 0
      ? '删除完成：链被删空，head = NULL。'
      : `删除完成：${result.array.join(' → ')}（长度 ${result.array.length}，head 指向 ${st.head}）。`,
    vars: { n: result.array.length, pos, head: st.head },
    layers: layerOf(st, { done: chainIds(st) }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'sll-delete-prev-v1',
    lines: L, steps, result,
  });
}

/* ------------------------------------------------------------------ 变体 2（头结点 dummy 统一版） */

function runV2(input) {
  const src = Array.isArray(input.list) ? input.list : [];
  const pos = Number.isInteger(input.pos) ? input.pos : 0;
  const n = src.length;
  const st = newChain({ values: src, dummy: true });
  const steps = [];
  const L = LINES.v2;
  const tags = labelsOf(src);
  const NM = '单链表（dummy 头结点 + 值 → 后继）';

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? 'head 指向头结点 dummy，dummy->next = NULL：链长 0（length 不数 dummy），删除请求非法。'
      : `head 指向头结点 dummy，真实数据在 dummy->next 之后：${tags.join(' → ')}（长度 ${n}）。pos = ${pos} 的合法范围 0..${n - 1}。`,
    vars: { n, pos, head: st.head, dummy: st.dummyId },
    layers: layerOf(st, {}, NM),
  }));

  if (n === 0) {
    const result = { error: EMPTY_ERROR, array: [], headId: st.head };
    steps.push(step({
      event: 'invalid', lineId: 'invalid', done: true, result,
      note: `${EMPTY_ERROR}：length = 0，pos >= 0 一定不满足 pos < length，自然被拒绝。`,
      vars: { n, pos, head: st.head, dummy: st.dummyId },
      layers: layerOf(st, {}, NM),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v2', sourceVersion: 'sll-delete-dummy-v1',
      lines: L, steps, result,
    });
  }

  if (pos < 0 || pos >= n) {
    const error = posError(pos, n);
    const result = { error, array: [...src], headId: st.head };
    steps.push(step({
      event: 'invalid', lineId: 'invalid', done: true, result,
      note: `${error}（length 不数 dummy）。越界时链一格都不动。`,
      vars: { n, pos, head: st.head, dummy: st.dummyId },
      layers: layerOf(st, {}, NM),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v2', sourceVersion: 'sll-delete-dummy-v1',
      lines: L, steps, result,
    });
  }

  let prev = st.head; // = dummy
  steps.push(step({
    event: 'locate-prev', lineId: 'prev-init',
    note: 'prev 从 dummy 出发：删 0 号位时"前驱"就是 dummy，删其它位置它再往后走——两种情况同一条代码路径。',
    vars: { n, pos, k: 0, prev, head: st.head, dummy: st.dummyId },
    layers: layerOf(st, { focus2: [prev], pointers: [{ id: 'prev', label: 'prev', node: prev }] }, NM),
  }));
  for (let k = 0; k < pos; k++) {
    prev = st.nextOf.get(prev);
    steps.push(step({
      event: 'locate-prev', lineId: 'walk',
      note: `prev 走第 ${k + 1} 步，停在值 ${st.valueOf.get(prev)} 的结点：再走 ${pos - 1 - k} 步就是目标的前驱。`,
      vars: { n, pos, k: k + 1, prev, head: st.head, dummy: st.dummyId },
      layers: layerOf(st, { focus2: [prev], pointers: [{ id: 'prev', label: 'prev', node: prev }] }, NM),
    }));
  }

  const t = st.nextOf.get(prev);
  steps.push(step({
    event: 'target', lineId: 'target',
    note: `t = prev->next：要删的结点（值 ${st.valueOf.get(t)}${prev === st.dummyId ? '，它是 dummy 后面的第一个真实结点' : ''}）。`,
    vars: { n, pos, prev, head: st.head, dummy: st.dummyId, target: st.valueOf.get(t) },
    layers: layerOf(st, { focus1: [t], pointers: [{ id: 'prev', label: 'prev', node: prev }] }, NM),
  }));

  const nxt = st.nextOf.get(t);
  st.nextOf.set(prev, nxt);
  steps.push(step({
    event: 'relink', lineId: 'relink',
    note: nxt
      ? `prev->next = t->next（值 ${st.valueOf.get(nxt)}）：pos = ${pos} 与任何其它位置用的是同一条语句，没有 if (pos == 0)。`
      : 'prev->next = t->next = NULL：删的是表尾，prev 成为新的最后结点。',
    vars: { n, pos, prev, head: st.head, dummy: st.dummyId, target: st.valueOf.get(t) },
    layers: layerOf(st, { excluded: [t], pointers: [{ id: 'prev', label: 'prev', node: prev }] }, NM),
  }));

  steps.push(step({
    event: 'update-head', lineId: 'head-fixed',
    note: `head 仍指向 dummy${prev === st.dummyId ? '：删掉了 0 号位也没有改 head，真实表头自动变成 dummy->next' : ''}。头结点的收益就在这里。`,
    vars: { n, pos, prev, head: st.head, dummy: st.dummyId },
    layers: layerOf(st, { excluded: [t] }, NM),
  }));

  freeNode(st, t);
  steps.push(step({
    event: 'free-node', lineId: 'free',
    note: `释放目标结点（值 ${st.valueOf.get(t)}），真实链长 ${n} → ${n - 1}。`,
    vars: { n: n - 1, pos, prev, head: st.head, dummy: st.dummyId },
    layers: layerOf(st, { done: chainIds(st) }, NM),
  }));

  const result = { array: listValues(st), headId: st.head };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: result.array.length === 0
      ? '删除完成：真实结点被删空，head 仍指向 dummy（dummy->next = NULL）。'
      : `删除完成：${result.array.join(' → ')}（真实结点 ${result.array.length} 个）。headId 始终是 dummy，真实表头是它的后继。`,
    vars: { n: result.array.length, pos, head: st.head, dummy: st.dummyId },
    layers: layerOf(st, { done: chainIds(st) }, NM),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'sll-delete-dummy-v1',
    lines: L, steps, result,
  });
}

/* ------------------------------------------------------------------ 变体 3（删除所有匹配值） */

function runV3(input) {
  const src = Array.isArray(input.list) ? input.list : [];
  const x = input.value;
  const n = src.length;
  const st = newChain({ values: src });
  const steps = [];
  const L = LINES.v3;
  const tags = labelsOf(src);

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空表：head = NULL，删除操作非法。本变体不使用 pos，要删的是"所有值等于 ' + x + ' 的结点"。'
      : `初始链：${tags.join(' → ')}（长度 ${n}）。本变体不使用 pos（删哪些结点由值决定）：要删掉所有值等于 ${x} 的结点，可能连续出现多个。`,
    vars: { n, x, head: st.head, pos: '不使用' },
    layers: layerOf(st, {}),
  }));

  if (n === 0) {
    const result = { error: EMPTY_ERROR, array: [], headId: null };
    steps.push(step({
      event: 'invalid', lineId: 'empty', done: true, result,
      note: `${EMPTY_ERROR}：连表头都没有，先拒绝再谈删除。`,
      vars: { n, x, head: null, pos: '不使用' },
      layers: layerOf(st, {}),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v3', sourceVersion: 'sll-delete-all-value-v1',
      lines: L, steps, result,
    });
  }

  let removed = 0;
  // ① 连续删头
  while (st.head && st.valueOf.get(st.head) === x) {
    const t = st.head;
    steps.push(step({
      event: 'target', lineId: 'headloop',
      note: `head 的值 ${st.valueOf.get(t)} == ${x}：命中最前面的匹配结点。删头没有前驱可用，只能改 head。`,
      vars: { n, x, head: st.head, removed, pos: '不使用' },
      layers: layerOf(st, { focus1: [t] }),
    }));
    const nxt = st.nextOf.get(t);
    st.head = nxt;
    steps.push(step({
      event: 'update-head', lineId: 'headloop',
      note: nxt ? `head = head->next（值 ${st.valueOf.get(nxt)}）` : 'head = head->next = NULL：整条链被删空',
      vars: { n, x, head: st.head, removed: removed + 1, pos: '不使用' },
      layers: layerOf(st, { excluded: [t], focus2: nxt ? [nxt] : [] }),
    }));
    freeNode(st, t);
    removed += 1;
    steps.push(step({
      event: 'free-node', lineId: 'headloop',
      note: `释放它，removed = ${removed}。while 条件会再看一眼新的 head：值还是 ${x} 就继续删——这就是"连续多个"的处理。`,
      vars: { n, x, head: st.head, removed, pos: '不使用' },
      layers: layerOf(st, { done: chainIds(st) }),
    }));
  }

  // ② 重锚 prev
  let prev = st.head;
  steps.push(step({
    event: 'locate-prev', lineId: 'restart',
    note: prev
      ? `删头结束，prev 重新锚定到现在的第一个结点（值 ${st.valueOf.get(prev)}）：它一定不等于 ${x}，可以安全当"前驱"。`
      : `删头结束后 head = NULL：整条链都等于 ${x}，已被删空，其余循环直接跳过。`,
    vars: { n, x, prev, head: st.head, removed, pos: '不使用' },
    layers: layerOf(st, prev
      ? { pointers: [{ id: 'prev', label: 'prev', node: prev }], done: chainIds(st) }
      : { done: [] }),
  }));

  // ③ 指针接力删中间
  while (prev && st.nextOf.get(prev)) {
    const t = st.nextOf.get(prev);
    if (st.valueOf.get(t) === x) {
      steps.push(step({
        event: 'target', lineId: 'test',
        note: `prev->next 的值 ${st.valueOf.get(t)} == ${x}：命中。注意 prev 自己保留，被删的是它的后继。`,
        vars: { n, x, prev, head: st.head, removed, pos: '不使用' },
        layers: layerOf(st, { focus1: [t], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
      }));
      const nxt = st.nextOf.get(t);
      st.nextOf.set(prev, nxt);
      steps.push(step({
        event: 'relink', lineId: 'relink',
        note: nxt
          ? `prev->next = prev->next->next（值 ${st.valueOf.get(nxt)}）：跨过匹配结点，prev 不动——所以后面紧跟着的 ${x} 还能被下一个循环抓到。`
          : 'prev->next = NULL：删的是表尾，prev 成为新的最后结点。',
        vars: { n, x, prev, head: st.head, removed, pos: '不使用' },
        layers: layerOf(st, { excluded: [t], pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
      }));
      freeNode(st, t);
      removed += 1;
      steps.push(step({
        event: 'free-node', lineId: 'count',
        note: `释放它，removed = ${removed}。prev 留在原地等下一次循环：连续多个 ${x} 就是这样被一个个摘掉的。`,
        vars: { n, x, prev, head: st.head, removed, pos: '不使用' },
        layers: layerOf(st, { done: chainIds(st), pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
      }));
    } else {
      prev = t;
      steps.push(step({
        event: 'locate-prev', lineId: 'step',
        note: `prev->next 的值 ${st.valueOf.get(prev)} != ${x}：这个结点要保留，prev 前进到它身上（指针接力）。`,
        vars: { n, x, prev, head: st.head, removed, pos: '不使用' },
        layers: layerOf(st, { done: chainIds(st), pointers: [{ id: 'prev', label: 'prev', node: prev }] }),
      }));
    }
  }

  const result = { array: listValues(st), headId: st.head };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: result.array.length === 0
      ? `删除完成：所有值为 ${x} 的结点都删掉了，链被删空（removed = ${removed}，head = NULL）。`
      : `删除完成：${result.array.join(' → ')}（removed = ${removed}，剩 ${result.array.length} 个结点，head 指向 ${st.head}）。`,
    vars: { n: result.array.length, x, head: st.head, removed, pos: '不使用' },
    layers: layerOf(st, { done: chainIds(st) }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'sll-delete-all-value-v1',
    lines: L, steps, result, meta: { removed },
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
