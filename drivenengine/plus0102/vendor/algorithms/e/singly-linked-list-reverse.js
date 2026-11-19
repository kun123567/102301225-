/**
 * E · 单链表逆置（3 个代表性不同实现）
 *
 * 三个变体的画面差异来自"指针怎么走"：
 *   v1 三指针迭代：prev / cur / next 三个指针同屏，每次只改一条链、改完立刻前进；
 *   v2 递归逆置：先把调用栈压到最深处（只有 cur 在动），回溯路上才逐层改链，新头一路上抛；
 *   v3 头插法重建：画面拆成"原表 / 新表"两栏，结点从左栏被摘下、头插进右栏，天然逆序。
 *
 * 结点 id 全生命周期固定（n1/n2/n3…），并把 `order` 固定成初始顺序：
 * 这样相邻两个快照里同一结点仍在同一格，补间动画才连贯（改的只是链的方向）。
 * 数据域显示 label（重复值带 a/b 后缀），指针域显示 next 指向的结点 id 或 ∧。
 */

import { trace, step, arrayLayer, linkLayer, gridLayer, matrixLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'e/singly-linked-list-reverse',
  variants: [
    { id: 'v1', name: '三指针迭代', note: '保存 cur.next → 改 cur.next=prev → prev/cur 同步前进，最后 head=prev' },
    { id: 'v2', name: '递归逆置', note: 'reverse(cur.next) 先逆置后续，再让后继指回自己，最后返回新的头' },
    { id: 'v3', name: '头插法重建', note: '把结点逐个从原表摘下，头插到新表，天然逆序，展示两次遍历' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: '[1,2,3] → [3,2,1]',
    input: { list: [1, 2, 3] },
    expect: { array: [3, 2, 1], headId: 'n3' },
  },
  {
    id: 'edge-empty',
    label: '[]（空链：head 保持 ∧）',
    input: { list: [] },
    expect: { array: [], headId: null },
  },
  {
    id: 'edge-single',
    label: '[7]（单结点：逆置等于自身）',
    input: { list: [7] },
    expect: { array: [7], headId: 'n1' },
  },
];

/** 结点字段表：数据域 + 指针域（渲染器按字段表切分结点框，并显示 next 的实际取值） */
const FIELDS = [
  { name: 'data', type: 'int' },
  { name: 'next', type: 'ptr' },
];

const LINES = {
  v1: [
    { lineId: 'fn', text: 'Node *reverse_list(Node *head) {' },
    { lineId: 'init', text: '  Node *prev = NULL, *cur = head, *next = NULL;' },
    { lineId: 'while', text: '  while (cur != NULL) {' },
    { lineId: 'save', text: '    next = cur->next;         /* 1. 先存后继：改完 cur->next 原表后半段就断了 */' },
    { lineId: 'relink', text: '    cur->next = prev;         /* 2. 掉头：指向已经逆置好的那一段 */' },
    { lineId: 'advance', text: '    prev = cur;  cur = next;  /* 3. 两个指针一起前进 */' },
    { lineId: 'while-end', text: '  }' },
    { lineId: 'update-head', text: '  head = prev;              /* 4. cur 走空时 prev 就是新头 */' },
    { lineId: 'end', text: '  return head;' },
    { lineId: 'x', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'Node *rev(Node *cur) {' },
    { lineId: 'base', text: '  if (cur == NULL || cur->next == NULL) return cur;  /* 基本情况：它就是新头 */' },
    { lineId: 'descend', text: '  Node *p = rev(cur->next);      /* 1. 先把后面整段逆置好（压栈深入） */' },
    { lineId: 'save', text: '  /* 回溯路上：cur->next 这一段已经逆置完成，p 是它的新头 */' },
    { lineId: 'relink', text: '  cur->next->next = cur;         /* 2. 让原来的后继指回自己 */' },
    { lineId: 'cut', text: '  cur->next = NULL;              /* 3. 自己成为新链的尾 */' },
    { lineId: 'ret', text: '  return p;                      /* 4. 新头一路往上抛 */' },
    { lineId: 'end', text: '}' },
    { lineId: 'set-head', text: 'head = rev(head);   /* 调用处：返回值就是整条链表的新头 */' },
  ],
  v3: [
    { lineId: 'fn', text: 'Node *rebuild_by_head_insert(Node *head) {' },
    { lineId: 'init', text: '  Node *newHead = NULL, *cur = head, *next;' },
    { lineId: 'while', text: '  while (cur != NULL) {' },
    { lineId: 'save', text: '    next = cur->next;      /* 1. 先记下原表的下一个结点 */' },
    { lineId: 'relink', text: '    cur->next = newHead;   /* 2. 头插：接到新表头，天然逆序 */' },
    { lineId: 'advance', text: '    newHead = cur;         /* 3. 新表头前移，原表头让给 next */' },
    { lineId: 'advance2', text: '    cur = next;' },
    { lineId: 'while-end', text: '  }' },
    { lineId: 'set-head', text: '  head = newHead;        /* 4. 原表已空，head 改指新表 */' },
    { lineId: 'verify', text: '  for (p = head; p; p = p->next)   /* 第二遍：沿新链核对逆序 */' },
    { lineId: 'end', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 公共小工具 */

/** [1,2,3] → [{id:'n1',raw:1,label:'1'}, …]（重复值带 a/b，结点 id 与值无关、永不变） */
function makeNodes(values) {
  const labels = labelsOf(values);
  return values.map((v, i) => ({ id: `n${i + 1}`, raw: v, label: labels[i] }));
}

function initialNext(nodes) {
  const nextOf = {};
  nodes.forEach((n, i) => { nextOf[n.id] = nodes[i + 1] ? nodes[i + 1].id : null; });
  return nextOf;
}

/** 沿链走一遍，返回结点 id 顺序（用给定的 next 表，所以能看清"改链之后"的形态） */
function walk(head, nextOf) {
  const out = [];
  const seen = new Set();
  let cur = head;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = nextOf[cur] ?? null;
  }
  return out;
}

function buildLayer(o) {
  const { id = 'main', title = '单链表 head → … → ∧', name = 'Node *head', nodes, nextOf, head, order, roles = {} } = o;
  return linkLayer({
    id,
    title,
    name,
    fields: FIELDS,
    order: order || nodes.map((n) => n.id),
    head,
    nodes: nodes.map((n) => ({ id: n.id, value: n.label, label: n.label, next: nextOf[n.id] ?? null })),
    links: nodes.map((n) => ({ from: n.id, to: nextOf[n.id] ?? null })).filter((l) => l.to),
    roles,
  });
}

function ptrs(list) {
  return list.filter((p) => p && p.node).map((p) => ({ id: p.id, label: p.label, node: p.node }));
}

/* ------------------------------------------------------------------ 变体 1：三指针迭代 */

function runV1(input) {
  const values = Array.isArray(input.list) ? input.list : [];
  const nodes = makeNodes(values);
  const nextOf = initialNext(nodes);
  const steps = [];
  const L = LINES.v1;
  const n = nodes.length;
  let head = n ? nodes[0].id : null;
  const snap = (roles) => [buildLayer({ nodes, nextOf, head, roles })];
  const v = (prev, cur, next) => ({ head: head ?? '∧', prev: prev ?? '∧', cur: cur ?? '∧', next: next ?? '∧' });

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空链：cur = head = ∧，循环一次也不会进，head 最后还是 ∧。'
      : `共 ${n} 个结点，head = ${head}。逆置只需要三根指针：prev（已逆置段的头）、cur（待处理）、next（临时存后继）。`,
    vars: v(null, head, null),
    layers: snap({ focus1: head ? [head] : [], pointers: ptrs([{ id: 'cur', label: 'cur', node: head }]) }),
  }));

  let prev = null;
  let cur = head;
  let next = null;
  const inverted = [];

  while (cur) {
    const nxt = nextOf[cur] ?? null;
    steps.push(step({
      event: 'save-next', lineId: 'save',
      note: `先把 cur.next 存到 next（${nxt ?? '∧'}）：下一步就要把 cur.next 改掉，不先记住它，原表后半段就再也找不回来了。`,
      vars: v(prev, cur, nxt),
      layers: snap({
        focus1: [cur],
        focus2: prev ? [prev] : [],
        done: [...inverted],
        pointers: ptrs([{ id: 'prev', label: 'prev', node: prev }, { id: 'cur', label: 'cur', node: cur }, { id: 'next', label: 'next', node: nxt }]),
      }),
    }));

    nextOf[cur] = prev;
    inverted.push(cur);
    steps.push(step({
      event: 'relink', lineId: 'relink',
      note: `改链：${cur}.next = ${prev ?? '∧'}，${cur} 掉头指回前一个结点。此刻 head 侧那条链是断的（head 还指着 ${head}），这是正常的中间态。`,
      vars: v(prev, cur, nxt),
      layers: snap({
        swap: [cur],
        done: [...inverted],
        pointers: ptrs([{ id: 'prev', label: 'prev', node: prev }, { id: 'cur', label: 'cur', node: cur }, { id: 'next', label: 'next', node: nxt }]),
      }),
    }));

    prev = cur;
    cur = nxt;
    next = nxt;
    steps.push(step({
      event: 'advance', lineId: 'advance',
      note: `两指针同步前进：prev = ${prev}（已逆置段的头），cur = ${cur ?? '∧'}（下一个待处理）。`,
      vars: v(prev, cur, next),
      layers: snap({
        focus1: cur ? [cur] : [],
        focus2: [prev],
        done: [...inverted],
        pointers: ptrs([{ id: 'prev', label: 'prev', node: prev }, { id: 'cur', label: 'cur', node: cur }, { id: 'next', label: 'next', node: next }]),
      }),
    }));
  }

  head = prev;
  steps.push(step({
    event: 'update-head', lineId: 'update-head',
    note: n === 0
      ? '空链：prev 仍是 ∧，head 保持为 ∧。'
      : `cur 走空，循环结束：新头是 prev = ${head}，把 head 指针改指它，逆置完成。`,
    vars: v(prev, cur, next),
    layers: snap({ done: nodes.map((x) => x.id), pointers: ptrs([{ id: 'prev', label: 'prev(head)', node: head }]) }),
  }));

  const order = walk(head, nextOf);
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const result = { array: order.map((id) => byId.get(id).raw), headId: head ?? null };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0 ? '逆置完成：仍是空链。' : `逆置完成：head = ${head}，链序 ${order.join(' → ')} → ∧。`,
    vars: { ...v(prev, cur, next), 新链: order.join('→') },
    layers: [buildLayer({ nodes, nextOf, head, roles: { done: nodes.map((x) => x.id) } })],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'sll-reverse-3ptr-v1',
    lines: L, steps, result, meta: { nodes: n, relinks: inverted.length },
  });
}

/* ------------------------------------------------------------------ 变体 2：递归逆置 */

function runV2(input) {
  const values = Array.isArray(input.list) ? input.list : [];
  const nodes = makeNodes(values);
  const nextOf = initialNext(nodes);
  const steps = [];
  const L = LINES.v2;
  const n = nodes.length;
  let head = n ? nodes[0].id : null;
  const snap = (roles) => [buildLayer({ nodes, nextOf, head, roles })];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空链：rev(∧) 走基本情况，直接返回 ∧。'
      : `递归版的关键差别：改链不在下降路上，而在回溯路上。先把 rev(${head}) 压栈，一路压到最后一个结点。`,
    vars: { head: head ?? '∧', 栈深: 0, cur: head ?? '∧', 返回的新头: '—' },
    layers: snap({ focus1: head ? [head] : [], pointers: ptrs([{ id: 'cur', label: 'cur', node: head }]) }),
  }));

  const path = [];
  let cur = head;
  while (cur) {
    path.push(cur);
    const nxt = nextOf[cur] ?? null;
    steps.push(step({
      event: nxt ? 'advance' : 'found',
      lineId: nxt ? 'descend' : 'base',
      note: nxt
        ? `rev(${cur})：cur.next = ${nxt} 非空，把本层压栈（栈深 ${path.length}），转去处理 ${nxt}。`
        : `rev(${cur})：cur.next = ∧，命中基本情况，这一层直接返回 ${cur} —— 它就是整条链的新头。`,
      vars: { head: head ?? '∧', 栈深: path.length, cur, 返回的新头: nxt ? '待回溯' : cur },
      layers: snap({
        focus1: [cur],
        done: path.slice(0, -1),
        pointers: ptrs([{ id: 'cur', label: 'cur', node: cur }, ...(nxt ? [] : [{ id: 'new', label: '新头 p', node: cur }])]),
      }),
    }));
    cur = nxt;
  }

  const newHead = path.length ? path[path.length - 1] : null;
  for (let k = path.length - 2; k >= 0; k--) {
    const c = path[k];
    const nxt = nextOf[c];
    steps.push(step({
      event: 'save-next', lineId: 'save',
      note: `回溯到 rev(${c})：此刻 ${nxt} 那一段已经逆置好，它的头是 p = ${newHead}；要把 ${c} 接到这段后面，靠的就是 ${c}.next。`,
      vars: { head: head ?? '∧', 栈深: k + 1, cur: c, 返回的新头: newHead },
      layers: snap({
        focus1: [c],
        focus2: [nxt],
        pointers: ptrs([{ id: 'cur', label: 'cur', node: c }, { id: 'p', label: '新头 p', node: newHead }, { id: 'post', label: 'cur.next', node: nxt }]),
      }),
    }));

    nextOf[nxt] = c;
    nextOf[c] = null;
    steps.push(step({
      event: 'relink', lineId: 'relink',
      note: `${nxt}.next = ${c}，并把 ${c}.next 置 ∧：${c} 从此成为新链的尾。注意递归版从最里面往外改，改的顺序和迭代版正好相反。`,
      vars: { head: head ?? '∧', 栈深: k + 1, cur: c, 返回的新头: newHead },
      layers: snap({
        swap: [c, nxt],
        pointers: ptrs([{ id: 'cur', label: 'cur', node: c }, { id: 'p', label: '新头 p', node: newHead }]),
      }),
    }));

    steps.push(step({
      event: 'advance', lineId: 'ret',
      note: `本层 return p = ${newHead}：新头不用改，一路往上抛，上一层继续把更前面的结点接上来。`,
      vars: { head: head ?? '∧', 栈深: k, cur: newHead, 返回的新头: newHead },
      layers: snap({ done: path.slice(0, k + 1), pointers: ptrs([{ id: 'p', label: '返回的新头 p', node: newHead }]) }),
    }));
  }

  head = newHead;
  steps.push(step({
    event: 'update-head', lineId: 'set-head',
    note: n === 0
      ? '空链：rev(∧) 返回 ∧，head 保持为 ∧。'
      : n === 1
        ? `单结点：rev(${newHead}) 命中基本情况直接返回自己，head 不变。`
        : `调用处把返回值写回 head：head = ${newHead}。递归版从不需要额外的 prev 指针。`,
    vars: { head: head ?? '∧', 栈深: 0, cur: head ?? '∧', 返回的新头: newHead ?? '∧' },
    layers: snap({ done: nodes.map((x) => x.id), pointers: ptrs([{ id: 'head', label: 'head', node: head }]) }),
  }));

  const order = walk(head, nextOf);
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const result = { array: order.map((id) => byId.get(id).raw), headId: head ?? null };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0 ? '逆置完成：仍是空链。' : `逆置完成：head = ${head}，链序 ${order.join(' → ')} → ∧（改链全部发生在回溯路上）。`,
    vars: { head: head ?? '∧', 栈深: 0, 新链: order.join('→') },
    layers: [buildLayer({ nodes, nextOf, head, roles: { done: nodes.map((x) => x.id) } })],
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'sll-reverse-recursive-v1',
    lines: L, steps, result, meta: { nodes: n, depth: path.length },
  });
}

/* ------------------------------------------------------------------ 变体 3：头插法重建 */

function runV3(input) {
  const values = Array.isArray(input.list) ? input.list : [];
  const nodes = makeNodes(values);
  const oldNext = initialNext(nodes);
  const newNext = {};
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const steps = [];
  const L = LINES.v3;
  const n = nodes.length;

  let oldHead = n ? nodes[0].id : null;
  let newHead = null;
  let cur = oldHead;

  const oldOrder = () => walk(oldHead, oldNext);
  const newOrder = () => walk(newHead, newNext);

  /** 两栏画面：左栏原表（待摘），右栏新表（头插得到的新链） */
  const snap = (rolesOld, rolesNew, ptrOld, ptrNew) => [
    buildLayer({
      id: 'old', title: '原表（摘一个少一个）', name: 'Node *cur', nodes, nextOf: oldNext,
      head: oldHead, order: oldOrder(), roles: { ...rolesOld, pointers: ptrs(ptrOld) },
    }),
    buildLayer({
      id: 'new', title: '新表（每次都插在表头 → 天然逆序）', name: 'Node *newHead', nodes, nextOf: newNext,
      head: newHead, order: newOrder(), roles: { ...rolesNew, pointers: ptrs(ptrNew) },
    }),
  ];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空链：原表空、新表也空，循环一次不进，head 仍是 ∧。'
      : `头插法不看"原链怎么指"，而是重建一条新链：新表初始为 ∧，逐个把原表头结点摘下、插到新表头。`,
    vars: { 原表头: oldHead ?? '∧', 新表头: '∧', cur: cur ?? '∧' },
    layers: snap({ focus1: oldHead ? [oldHead] : [] }, {}, [{ id: 'cur', label: 'cur', node: oldHead }], []),
  }));

  while (cur) {
    const nxt = oldNext[cur] ?? null;
    steps.push(step({
      event: 'save-next', lineId: 'save',
      note: `摘下 ${cur} 之前先记下它的后继 ${nxt ?? '∧'}：摘下之后它就是原表新的表头。`,
      vars: { 原表头: cur, 新表头: newHead ?? '∧', cur, next: nxt ?? '∧' },
      layers: snap({ focus1: [cur] }, {}, [{ id: 'cur', label: 'cur', node: cur }], [{ id: 'new', label: 'newHead', node: newHead }]),
    }));

    const prevNewHead = newHead;
    oldNext[cur] = null;
    oldHead = nxt;
    newNext[cur] = prevNewHead;
    newHead = cur;

    steps.push(step({
      event: 'relink', lineId: 'relink',
      note: `${cur}.next = ${prevNewHead ?? '∧'}：头插到新表。它原来的后继不动，仍由 next 变量保管。`,
      vars: { 原表头: oldHead ?? '∧', 新表头: newHead, cur, next: nxt ?? '∧' },
      layers: snap({}, { swap: [cur] }, [], [{ id: 'new', label: 'newHead', node: newHead }]),
    }));

    cur = nxt;
    steps.push(step({
      event: 'advance', lineId: 'advance',
      note: `newHead = ${newHead}（新表头前移），cur = ${cur ?? '∧'}（原表下一个待摘结点）。`,
      vars: { 原表头: oldHead ?? '∧', 新表头: newHead, cur: cur ?? '∧', next: '—' },
      layers: snap(
        { focus1: cur ? [cur] : [], done: [] },
        { done: newOrder() },
        cur ? [{ id: 'cur', label: 'cur', node: cur }] : [],
        [{ id: 'new', label: 'newHead', node: newHead }],
      ),
    }));
  }

  steps.push(step({
    event: 'update-head', lineId: 'set-head',
    note: n === 0
      ? '空链：新表头也是 ∧，head 保持为 ∧。'
      : `原表已经摘空，把真正的 head 改成新表头：head = ${newHead}。第一遍遍历到此结束。`,
    vars: { 原表头: '∧', 新表头: newHead ?? '∧', cur: '∧' },
    layers: snap({}, { done: newOrder() }, [], [{ id: 'head', label: 'head', node: newHead }]),
  }));

  // 第二遍遍历：沿新链核对逆序，这是头插法"两次遍历"的第二次
  const checkOrder = newOrder();
  let walkPtr = newHead;
  let idx = 0;
  while (walkPtr) {
    idx++;
    const node = byId.get(walkPtr);
    const follow = newNext[walkPtr] ?? null;
    steps.push(step({
      event: 'advance', lineId: 'verify',
      note: `第二遍沿新链走：第 ${idx} 个结点是 ${walkPtr}（值 ${node.label}）${follow ? `，下一个是 ${follow}` : '，它后面是 ∧（新链的尾）'}。`,
      vars: { 第几个: idx, 当前结点: walkPtr, 值: node.label, 下一个: follow ?? '∧' },
      layers: snap({}, { done: checkOrder.slice(0, idx - 1), pointers: [{ id: 'p', label: 'p', node: walkPtr }] }, [], [{ id: 'p', label: '第二遍 p', node: walkPtr }]),
    }));
    walkPtr = follow;
  }

  const result = { array: checkOrder.map((id) => byId.get(id).raw), headId: newHead ?? null };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: n === 0 ? '逆置完成：仍是空链。' : `逆置完成：head = ${newHead}，链序 ${checkOrder.join(' → ')} → ∧（由头插顺序决定）。`,
    vars: { 新表头: newHead ?? '∧', 结点数: checkOrder.length, 新链: checkOrder.join('→') },
    layers: snap({}, { done: checkOrder }, [], []),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'sll-reverse-headinsert-v1',
    lines: L, steps, result, meta: { nodes: n },
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
