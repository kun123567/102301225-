/**
 * F · 表达式有向无环图（3 个代表性不同实现）
 *
 *   1) v1「哈希表去重（CSE）」：先建语法树，再后序遍历；键 (op, 左id, 右id) 查哈希表，
 *      已存在就复用节点（公共子表达式共享），最后按后序（拓扑序）统一求值；
 *   2) v2「递归下降 + 记忆化」：递归下降时边建边算，键命中就既复用节点、又直接取记忆里的值
 *      （整个子树不再下沉），因此求值顺序是"穿插"在遍历里的；
 *   3) v3「后缀式栈式建 DAG」：转成后缀式，用操作数栈取两个子节点，建节点前先查重，
 *      最后按逆后序（拓扑序）批量求值。
 *
 * 图层：style 10 的 DAG 图；v1/v2 额外用 style 6 的表格显示"去重哈希表 / 记忆表"，
 *       v3 额外用 style 7 的栈显示操作数栈。支持的数字/运算符：整数、+、*、括号。
 */

import { trace, step, graphLayer, gridLayer, stackLayer } from '../../engine/model.js';

export const meta = {
  id: 'f/expression-dag',
  variants: [
    { id: 'v1', name: '哈希表去重（CSE）' },
    { id: 'v2', name: '递归下降 + 记忆化' },
    { id: 'v3', name: '后缀式栈式建 DAG' },
  ],
};

const LINES = {
  v1: [
    { lineId: 'fn', text: 'Node *expr_dag_cse(const char *s) {' },
    { lineId: 'walk', text: '  /* 第 1 趟：后序遍历语法树，边建 DAG 边去重 */' },
    { lineId: 'walk-leaf', text: '  if (ast->kind == NUM) return intern("num:" + ast->num);' },
    { lineId: 'walk-op', text: '  l = walk(ast->left); r = walk(ast->right);' },
    { lineId: 'key', text: '  key = "(" + ast->op + "," + l->id + "," + r->id + ")";' },
    { lineId: 'lookup', text: '  if (table.find(key)) return table[key];        /* 命中：复用已有节点 */' },
    { lineId: 'create', text: '  n = new_node(ast->op, l, r); table[key] = n;' },
    { lineId: 'edge', text: '  add_edge(n, l); add_edge(n, r);' },
    { lineId: 'topo', text: '  topo = 后序(DAG);          /* 子节点一定排在父节点之前 */' },
    { lineId: 'eval', text: '  for (v : topo) value[v] = eval(v);' },
    { lineId: 'end', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'int eval_memo(Node *ast) {' },
    { lineId: 'recurse', text: '  /* 一趟递归：边下潜边建节点边求值 */' },
    { lineId: 'leaf', text: '  if (ast->kind == NUM) return node_of_num(ast->num);' },
    { lineId: 'descend', text: '  l = eval_memo(ast->left); r = eval_memo(ast->right);   /* 先算两个子树 */' },
    { lineId: 'key', text: '  key = "(" + ast->op + "," + l->id + "," + r->id + ")";' },
    { lineId: 'hit', text: '  if (memo.has(key)) return memo[key];   /* 记忆命中：节点和值一起复用 */' },
    { lineId: 'miss', text: '  v = apply(ast->op, l->value, r->value); n = new_node(...); memo[key] = v;' },
    { lineId: 'end-if', text: '  return n;' },
    { lineId: 'end', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'Node *dag_from_postfix(const char *s) {' },
    { lineId: 'postfix', text: '  post = to_postfix(s);           /* (2+3)*(2+3) → 2 3 + 2 3 + * */' },
    { lineId: 'scan', text: '  for (t : post) {' },
    { lineId: 'num', text: '    if (is_num(t)) st.push(intern_num(t));' },
    { lineId: 'op', text: '    else { r = st.pop(); l = st.pop();             /* 先右后左 */' },
    { lineId: 'key', text: '      key = "(" + t + "," + l->id + "," + r->id + ")";' },
    { lineId: 'dedup', text: '      if (table.find(key)) st.push(table[key]);    /* 建节点前先查重 */' },
    { lineId: 'newnode', text: '      else { n = new_node(t, l, r); table[key] = n; add_edge(n, l); add_edge(n, r); st.push(n); }' },
    { lineId: 'scan-end', text: '    }' },
    { lineId: 'rev-topo', text: '  for (n : 逆后序(DAG)) value[n] = eval(n);' },
    { lineId: 'end', text: '}' },
  ],
};

export const samples = [
  {
    id: 'normal',
    label: "'(2+3)*(2+3)'：加法节点只有 1 个，第二个 (2+3) 复用节点（nodeCount=4 个 DAG 节点，reuse=1 个运算符公因式）",
    input: { text: '(2+3)*(2+3)' },
    expect: { value: 25, nodeCount: 4, reuse: 1, adds: 1 },
  },
  {
    id: 'edge-single-number',
    label: "'7'：单个数字，DAG 只有一个常量节点",
    input: { text: '7' },
    expect: { value: 7, nodeCount: 1, reuse: 0, adds: 0 },
  },
  {
    id: 'edge-invalid',
    label: "'(2+3'：括号未闭合，建图前就报错",
    input: { text: '(2+3' },
    expect: { error: '括号不匹配：缺少右括号' },
  },
];

/* ------------------------------------------------------------------ 词法 / 语法 / 遍历 */

const OPS = '+*()';

function tokenize(text) {
  const s = String(text ?? '');
  const tokens = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) continue;
    if (/[0-9]/.test(c)) {
      let d = c;
      while (i + 1 < s.length && /[0-9]/.test(s[i + 1])) d += s[++i];
      tokens.push(d);
      continue;
    }
    if (OPS.includes(c)) { tokens.push(c); continue; }
    throw new Error(`非法字符 '${c}'：本演示只支持整数、+、*、括号`);
  }
  if (tokens.length === 0) throw new Error('表达式为空');
  return tokens;
}

function parse(tokens) {
  let p = 0;
  const peek = () => (p < tokens.length ? tokens[p] : null);
  const take = () => tokens[p++];

  function expr() {
    let left = term();
    while (peek() === '+') { take(); left = { op: '+', left, right: term() }; }
    return left;
  }
  function term() {
    let left = factor();
    while (peek() === '*') { take(); left = { op: '*', left, right: factor() }; }
    return left;
  }
  function factor() {
    const t = peek();
    if (t == null) throw new Error('表达式意外结束：缺少操作数');
    if (t === '(') {
      take();
      const inner = expr();
      if (peek() !== ')') throw new Error('括号不匹配：缺少右括号');
      take();
      return inner;
    }
    if (t === ')') throw new Error('括号不匹配：多余的右括号');
    if (/^[0-9]+$/.test(t)) { take(); return { num: Number(t) }; }
    throw new Error(`非法符号 '${t}'`);
  }

  const ast = expr();
  const rest = peek();
  if (rest != null) {
    throw new Error(rest === ')' ? '括号不匹配：多余的右括号' : `多余的内容 '${rest}'`);
  }
  return ast;
}

/** 后缀式（用于 v3） */
function toPostfix(ast) {
  const out = [];
  (function walk(n) {
    if (n.num != null) { out.push(String(n.num)); return; }
    walk(n.left);
    walk(n.right);
    out.push(n.op);
  })(ast);
  return out;
}

/* ------------------------------------------------------------------ DAG 数据结构 */

function newDag() {
  const list = [];
  const byId = new Map();
  return {
    list,
    byId,
    add(props) {
      const id = `n${list.length + 1}`;
      const node = { id, shared: false, ...props };
      list.push(node);
      byId.set(id, node);
      return node;
    },
    get: (id) => byId.get(id) || null,
    markShared(id) {
      const n = byId.get(id);
      if (n) n.shared = true;
      return n;
    },
  };
}

/* ------------------------------------------------------------------ 图层构造 */

function graphOf(dag, o = {}) {
  const edges = [];
  for (const n of dag.list) {
    if (n.kind !== 'op') continue;
    for (const [which, child] of [['L', n.left], ['R', n.right]]) {
      const hot = (o.hotEdges || []).some((h) => h.from === n.id && h.to === child && (h.which == null || h.which === which));
      edges.push({ from: n.id, to: child, w: which, directed: true, state: hot ? 'active' : 'tree' });
    }
  }
  return graphLayer({
    id: 'dag',
    title: o.title || '表达式 DAG（一个节点 = 一个子表达式）',
    name: o.name || `${dag.list.length} 个节点`,
    layout: 'circle',
    directed: true,
    weighted: true,
    nodes: dag.list.map((n) => ({
      id: n.id,
      label: n.kind === 'num' ? String(n.value) : n.op,
      sub: n.id,
      badge: n.shared ? '共享' : undefined,
    })),
    edges,
    roles: o.roles || {},
  });
}

function tableGrid(entries, o = {}) {
  return gridLayer({
    id: 'table',
    title: o.title || '去重哈希表',
    name: o.name || 'table[key] → node',
    colLabels: ['键 (op,L,R)', '节点', '值'],
    rowLabels: entries.map((_, i) => `#${i + 1}`),
    values: entries.map((e) => [e.key, e.node, e.value == null ? '?' : String(e.value)]),
    roles: o.roles || {},
  });
}

function operandStack(items, o = {}) {
  return stackLayer({
    id: 'stack',
    title: o.title || '操作数栈（存节点 id）',
    name: 'stack of nodes',
    cells: items.map((it, i) => ({
      value: `${it.label} (${it.id})`,
      label: `#${i}`,
      state: o.top === i ? 'focus' : 'normal',
    })),
    top: items.length ? items.length - 1 : null,
    capacity: 8,
  });
}

/* ------------------------------------------------------------------ 错误收尾（三个变体共用） */

function failTrace({ variantId, sourceVersion, lines, text, message }) {
  const empty = newDag();
  const result = { error: message };
  const steps = [
    step({
      event: 'error', lineId: 'fn',
      note: `解析失败：${message}。表达式在建成 DAG 之前就被拒绝，图里没有节点——错误在词法/语法阶段暴露，比求值到一半再崩更好定位。`,
      vars: { expr: text, error: message },
      layers: [graphOf(empty, { title: '表达式 DAG（空）' }), tableGrid([], { title: '去重哈希表（空）' })],
    }),
    step({
      event: 'done', lineId: 'end', done: true, result,
      note: `结束：返回 { error: '${message}' }，不产生任何值。`,
      vars: { expr: text, error: message },
      layers: [graphOf(empty, { title: '表达式 DAG（空）' }), tableGrid([], { title: '去重哈希表（空）' })],
    }),
  ];
  return trace({ algorithmId: meta.id, variantId, sourceVersion, lines, steps, result });
}

/* ------------------------------------------------------------------ 变体 1：哈希表去重（CSE） */

function runV1(input) {
  const text = String(input.text ?? '');
  const L = LINES.v1;
  const steps = [];

  let ast;
  try {
    ast = parse(tokenize(text));
  } catch (e) {
    return failTrace({ variantId: 'v1', sourceVersion: 'expression-dag-cse-v1', lines: L, text, message: e.message });
  }

  const dag = newDag();
  const table = new Map();
  let reuseOps = 0;
  let adds = 0;

  const entries = () => [...table.entries()].map(([key, node]) => ({ key, node: node.id, value: node.value }));
  const layers = (o = {}) => [graphOf(dag, o), tableGrid(entries(), { title: '去重哈希表', roles: o.tableRoles })];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: `表达式 '${text}' 先解析成语法树（乘法优先级高于加法，括号整体成节点）。这一趟只建树不求值：真正的去重发生在下一步遍历里。`,
    vars: { expr: text, nodes: 0, reuse: 0 },
    layers: layers({ title: '表达式 DAG（还没有节点）' }),
  }));

  const visit = (n) => {
    if (n.num != null) {
      const key = `num:${n.num}`;
      const found = table.get(key);
      if (found) {
        dag.markShared(found.id);
        steps.push(step({
          event: 'reuse-node', lineId: 'key',
          note: `常量 ${n.num} 的键 '${key}' 已经在表里：直接返回节点 ${found.id}，不再新建。常量按值共享是后面 (2+3) 能被复用的前提。`,
          vars: { expr: text, nodes: dag.list.length, reuse: reuseOps },
          layers: layers({ roles: { focus2: [found.id], added: [found.id] }, tableRoles: { focus1: [...table.keys()].indexOf(key) } }),
        }));
        return found.id;
      }
      const node = dag.add({ kind: 'num', value: n.num, op: null, key });
      table.set(key, node);
      steps.push(step({
        event: 'new-node', lineId: 'walk-leaf',
        note: `新建常量节点 ${node.id} = ${n.num}，并在表里登记 '${key}' → ${node.id}。`,
        vars: { expr: text, nodes: dag.list.length, reuse: reuseOps },
        layers: layers({ roles: { focus1: [node.id], added: [node.id] } }),
      }));
      return node.id;
    }
    const lid = visit(n.left);
    const rid = visit(n.right);
    const key = `${n.op}:${lid}:${rid}`;
    const found = table.get(key);
    if (found) {
      dag.markShared(found.id);
      reuseOps++;
      steps.push(step({
        event: 'reuse-node', lineId: 'lookup',
        note: `键 '${key}' 命中：${n.op} 的两个子节点 (${lid}, ${rid}) 与已有节点 ${found.id} 完全相同，直接复用 ${found.id}，公共子表达式被共享。`,
        vars: { expr: text, nodes: dag.list.length, reuse: reuseOps },
        layers: layers({ roles: { focus2: [found.id], added: [found.id] } }),
      }));
      return found.id;
    }
    const node = dag.add({ kind: 'op', op: n.op, left: lid, right: rid, key });
    if (n.op === '+') adds++;
    table.set(key, node);
    steps.push(step({
      event: 'new-node', lineId: 'create',
      note: `键 '${key}' 没命中：新建运算节点 ${node.id}（${n.op}），子节点是 ${lid} 与 ${rid}。`,
      vars: { expr: text, nodes: dag.list.length, reuse: reuseOps },
      layers: layers({ roles: { focus1: [node.id], added: [node.id] } }),
    }));
    steps.push(step({
      event: 'add-edge', lineId: 'edge',
      note: `加依赖边 ${node.id} → ${lid}（左操作数）与 ${node.id} → ${rid}（右操作数）：父节点的值依赖子节点先算出来。`,
      vars: { expr: text, nodes: dag.list.length, reuse: reuseOps },
      layers: layers({
        roles: { focus1: [node.id], focus2: [lid, rid] },
        hotEdges: [{ from: node.id, to: lid }, { from: node.id, to: rid }],
      }),
    }));
    return node.id;
  };

  const rootId = visit(ast);
  const topo = dag.list.map((n) => n.id);

  steps.push(step({
    event: 'topo', lineId: 'topo',
    note: `建图结束：${dag.list.length} 个节点、${topo.length - 1} 条依赖关系。后序 [${topo.join(', ')}] 天然是拓扑序——每个节点都排在它的父节点之前，按它求值不会用到还没算的值。`,
    vars: { expr: text, nodes: dag.list.length, reuse: reuseOps, topo: topo.join(',') },
    layers: layers({ roles: { focus1: [rootId], done: topo.map((id) => id).filter((id) => id !== rootId) } }),
  }));

  const valueOf = new Map();
  for (const id of topo) {
    const n = dag.get(id);
    let v;
    if (n.kind === 'num') {
      v = n.value;
    } else {
      const lv = valueOf.get(n.left);
      const rv = valueOf.get(n.right);
      v = n.op === '+' ? lv + rv : lv * rv;
    }
    n.value = v;
    valueOf.set(id, v);
    const doneIds = topo.filter((x) => valueOf.has(x));
    steps.push(step({
      event: 'evaluate', lineId: 'eval',
      note: n.kind === 'num'
        ? `求值 ${id}：常量直接取值 ${v}。`
        : `求值 ${id}：子节点 ${n.left}(${valueOf.get(n.left)}) ${n.op} ${n.right}(${valueOf.get(n.right)}) = ${v}。共享节点只会被算一次。`,
      vars: { expr: text, nodes: dag.list.length, reuse: reuseOps, value: v },
      layers: layers({ roles: { focus1: [id], done: doneIds } }),
    }));
  }

  const result = { value: valueOf.get(rootId), nodeCount: dag.list.length, reuse: reuseOps, adds };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `结束：根节点 ${rootId} 的值是 ${result.value}。语法树本来有 7 个节点，去重后只剩 ${result.nodeCount} 个；加法节点只有 ${adds} 个，公共子表达式被复用了 ${reuseOps} 次。`,
    vars: { expr: text, nodes: result.nodeCount, reuse: reuseOps, value: result.value },
    layers: layers({ roles: { done: topo } }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v1', sourceVersion: 'expression-dag-cse-v1',
    lines: L, steps, result, meta: { rootId, keys: [...table.keys()] },
  });
}

/* ------------------------------------------------------------------ 变体 2：递归下降 + 记忆化 */

function runV2(input) {
  const text = String(input.text ?? '');
  const L = LINES.v2;
  const steps = [];

  let ast;
  try {
    ast = parse(tokenize(text));
  } catch (e) {
    return failTrace({ variantId: 'v2', sourceVersion: 'expression-dag-memo-v1', lines: L, text, message: e.message });
  }

  const dag = newDag();
  const memo = new Map(); // key → { id, value }
  let reuseOps = 0;
  let adds = 0;

  const entries = () => [...memo.entries()].map(([key, it]) => ({ key, node: it.id, value: it.value }));
  const layers = (o = {}) => [graphOf(dag, o), tableGrid(entries(), { title: '记忆表 memo[key] → (节点, 值)', name: 'memo', roles: o.tableRoles })];

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: `表达式 '${text}' 不做"先建树再求值"：直接递归下降，函数返回的是"已经算好的节点"。所以建节点和求值穿插进行。`,
    vars: { expr: text, nodes: 0, reuse: 0 },
    layers: layers({ title: '表达式 DAG（还没有节点）' }),
  }));

  const rec = (n) => {
    if (n.num != null) {
      const key = `num:${n.num}`;
      const found = memo.get(key);
      if (found) {
        dag.markShared(found.id);
        steps.push(step({
          event: 'reuse-node', lineId: 'leaf',
          note: `常量 ${n.num} 已在记忆表里（节点 ${found.id}）：直接复用这个叶子，不再新建。`,
          vars: { expr: text, nodes: dag.list.length, reuse: reuseOps },
          layers: layers({ roles: { focus2: [found.id], added: [found.id] }, tableRoles: { focus1: [...memo.keys()].indexOf(key) } }),
        }));
        return found;
      }
      const node = dag.add({ kind: 'num', value: n.num, op: null, key });
      memo.set(key, { id: node.id, value: n.num });
      steps.push(step({
        event: 'new-node', lineId: 'leaf',
        note: `新建常量节点 ${node.id} = ${n.num}，值当场就是 ${n.num}，顺手写进记忆表。`,
        vars: { expr: text, nodes: dag.list.length, reuse: reuseOps },
        layers: layers({ roles: { focus1: [node.id], added: [node.id] } }),
      }));
      return { id: node.id, value: node.value };
    }

    const left = rec(n.left);
    const right = rec(n.right);
    const key = `${n.op}:${left.id}:${right.id}`;
    const found = memo.get(key);
    if (found) {
      dag.markShared(found.id);
      reuseOps++;
      steps.push(step({
        event: 'reuse-node', lineId: 'key',
        note: `键 '${key}' 命中：子节点 (${left.id}, ${right.id}) 与已有节点 ${found.id} 一致，共享它，不重复建节点。`,
        vars: { expr: text, nodes: dag.list.length, reuse: reuseOps },
        layers: layers({ roles: { focus2: [found.id], added: [found.id] } }),
      }));
      steps.push(step({
        event: 'cache-hit', lineId: 'hit',
        note: `记忆命中：节点 ${found.id} 的值 ${found.value} 已经在表里，整个子树不必再往下走——递归在这里"短路"返回。`,
        vars: { expr: text, nodes: dag.list.length, reuse: reuseOps, value: found.value },
        layers: layers({ roles: { focus2: [found.id], done: [found.id] } }),
      }));
      return found;
    }

    const v = n.op === '+' ? left.value + right.value : left.value * right.value;
    const node = dag.add({ kind: 'op', op: n.op, left: left.id, right: right.id, key, value: v });
    if (n.op === '+') adds++;
    memo.set(key, { id: node.id, value: v });
    steps.push(step({
      event: 'new-node', lineId: 'miss',
      note: `键 '${key}' 未命中：两个子树都已求值（${left.value} 与 ${right.value}），新建 ${n.op} 节点 ${node.id} 并立刻算得 ${v}，连值和键一起写入记忆表。`,
      vars: { expr: text, nodes: dag.list.length, reuse: reuseOps, value: v },
      layers: layers({ roles: { focus1: [node.id], added: [node.id] } }),
    }));
    steps.push(step({
      event: 'add-edge', lineId: 'miss',
      note: `加依赖边 ${node.id} → ${left.id} 与 ${node.id} → ${right.id}：这是求值顺序（子先父后）唯一的依据。`,
      vars: { expr: text, nodes: dag.list.length, reuse: reuseOps, value: v },
      layers: layers({
        roles: { focus1: [node.id], focus2: [left.id, right.id] },
        hotEdges: [{ from: node.id, to: left.id }, { from: node.id, to: right.id }],
      }),
    }));
    steps.push(step({
      event: 'evaluate', lineId: 'miss',
      note: `求值 ${node.id}：${left.id}(${left.value}) ${n.op} ${right.id}(${right.value}) = ${v}。这是"边递归边算"，没有单独的求值趟。`,
      vars: { expr: text, nodes: dag.list.length, reuse: reuseOps, value: v },
      layers: layers({ roles: { focus1: [node.id], done: [left.id, right.id] } }),
    }));
    return { id: node.id, value: v };
  };

  const root = rec(ast);
  const nodes = dag.list.length;

  steps.push(step({
    event: 'topo', lineId: 'end-if',
    note: `递归回到根：根节点 ${root.id} 的值是 ${root.value}。DAG 上一条边都没重复指向同一个"新建"节点——公共子表达式在递归里就被并掉了。`,
    vars: { expr: text, nodes, reuse: reuseOps, value: root.value },
    layers: layers({ roles: { focus1: [root.id], done: dag.list.map((x) => x.id) } }),
  }));

  const result = { value: root.value, nodeCount: nodes, reuse: reuseOps, adds };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `结束：值 ${result.value}，DAG 共 ${result.nodeCount} 个节点，加法节点 ${adds} 个，记忆命中并复用运算符节点 ${reuseOps} 次（每次命中省掉一整棵子树的递归）。`,
    vars: { expr: text, nodes: result.nodeCount, reuse: reuseOps, value: result.value },
    layers: layers({ roles: { done: dag.list.map((x) => x.id) } }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v2', sourceVersion: 'expression-dag-memo-v1',
    lines: L, steps, result, meta: { rootId: root.id, keys: [...memo.keys()] },
  });
}

/* ------------------------------------------------------------------ 变体 3：后缀式栈式建 DAG */

function runV3(input) {
  const text = String(input.text ?? '');
  const L = LINES.v3;
  const steps = [];

  let ast;
  try {
    ast = parse(tokenize(text));
  } catch (e) {
    return failTrace({ variantId: 'v3', sourceVersion: 'expression-dag-postfix-v1', lines: L, text, message: e.message });
  }

  const dag = newDag();
  const table = new Map();
  const stack = [];
  let reuseOps = 0;
  let adds = 0;
  const post = toPostfix(ast);

  const entries = () => [...table.entries()].map(([key, node]) => ({ key, node: node.id, value: node.value }));
  const layers = (o = {}) => [
    graphOf(dag, o),
    operandStack(o.stack || stack, { top: (o.stack || stack).length - 1 }),
    tableGrid(entries(), { title: '去重哈希表', roles: o.tableRoles }),
  ];

  steps.push(step({
    event: 'init', lineId: 'postfix',
    note: `表达式 '${text}' 先转成后缀式：${post.join(' ')}。后缀式里操作数在前、运算符在后，正好适合"取两个子节点建父节点"的栈式建图。`,
    vars: { expr: text, postfix: post.join(' '), nodes: 0, reuse: 0 },
    layers: layers({ title: '表达式 DAG（还没有节点）' }),
  }));

  for (const t of post) {
    if (/^[0-9]+$/.test(t)) {
      const key = `num:${t}`;
      const found = table.get(key);
      if (found) {
        dag.markShared(found.id);
        stack.push({ id: found.id, label: String(t) });
        steps.push(step({
          event: 'reuse-node', lineId: 'num',
          note: `读到数字 ${t}：键 '${key}' 已在表里，压入已有节点 ${found.id}，不新建。`,
          vars: { expr: text, token: t, nodes: dag.list.length, reuse: reuseOps },
          layers: layers({ roles: { focus2: [found.id], added: [found.id] } }),
        }));
      } else {
        const node = dag.add({ kind: 'num', value: Number(t), op: null, key });
        table.set(key, node);
        stack.push({ id: node.id, label: t });
        steps.push(step({
          event: 'new-node', lineId: 'num',
          note: `读到数字 ${t}：新建常量节点 ${node.id}，压栈等待配对的运算符。`,
          vars: { expr: text, token: t, nodes: dag.list.length, reuse: reuseOps },
          layers: layers({ roles: { focus1: [node.id], added: [node.id] } }),
        }));
      }
      continue;
    }

    const right = stack.pop();
    const left = stack.pop();
    if (!left || !right) throw new Error('后缀式不合法：操作数不足');
    const key = `${t}:${left.id}:${right.id}`;
    const found = table.get(key);
    if (found) {
      dag.markShared(found.id);
      reuseOps++;
      stack.push({ id: found.id, label: found.kind === 'num' ? String(found.value) : `(${left.id}${t}${right.id})` });
      steps.push(step({
        event: 'reuse-node', lineId: 'dedup',
        note: `运算符 '${t}' 弹出 ${right.id}(右) 与 ${left.id}(左)：键 '${key}' 命中，说明这个子表达式已经建过，直接把 ${found.id} 压回栈。`,
        vars: { expr: text, token: t, nodes: dag.list.length, reuse: reuseOps },
        layers: layers({ roles: { focus2: [found.id], added: [found.id] } }),
      }));
      continue;
    }
    const node = dag.add({ kind: 'op', op: t, left: left.id, right: right.id, key });
    if (t === '+') adds++;
    table.set(key, node);
    stack.push({ id: node.id, label: `(${left.id}${t}${right.id})` });
    steps.push(step({
      event: 'new-node', lineId: 'newnode',
      note: `键 '${key}' 未命中：新建 ${t} 节点 ${node.id}，左右子节点是 ${left.id} 与 ${right.id}，并把它压回栈。`,
      vars: { expr: text, token: t, nodes: dag.list.length, reuse: reuseOps },
      layers: layers({ roles: { focus1: [node.id], added: [node.id] } }),
    }));
    steps.push(step({
      event: 'add-edge', lineId: 'newnode',
      note: `加依赖边 ${node.id} → ${left.id}（左）与 ${node.id} → ${right.id}（右）：后缀式天然保证子节点先建，边永远指向前辈节点。`,
      vars: { expr: text, token: t, nodes: dag.list.length, reuse: reuseOps },
      layers: layers({
        roles: { focus1: [node.id], focus2: [left.id, right.id] },
        hotEdges: [{ from: node.id, to: left.id }, { from: node.id, to: right.id }],
      }),
    }));
  }

  const rootId = stack.length ? stack[stack.length - 1].id : dag.list[0].id;
  const topo = dag.list.map((n) => n.id);

  steps.push(step({
    event: 'topo', lineId: 'rev-topo',
    note: `建图结束：栈里只剩根节点 ${rootId}。建节点顺序本身就是拓扑序 [${topo.join(', ')}]，逆后序即"子先父后"，可直接批量求值。`,
    vars: { expr: text, nodes: dag.list.length, reuse: reuseOps, topo: topo.join(',') },
    layers: layers({ roles: { focus1: [rootId], done: topo.filter((id) => id !== rootId) } }),
  }));

  const valueOf = new Map();
  for (const id of topo) {
    const n = dag.get(id);
    let v;
    if (n.kind === 'num') {
      v = n.value;
    } else {
      const lv = valueOf.get(n.left);
      const rv = valueOf.get(n.right);
      v = n.op === '+' ? lv + rv : lv * rv;
    }
    n.value = v;
    valueOf.set(id, v);
    steps.push(step({
      event: 'evaluate', lineId: 'rev-topo',
      note: n.kind === 'num'
        ? `求值 ${id}：常量 ${v}。`
        : `求值 ${id}：${n.left}(${valueOf.get(n.left)}) ${n.op} ${n.right}(${valueOf.get(n.right)}) = ${v}；共享节点只算一次。`,
      vars: { expr: text, nodes: dag.list.length, reuse: reuseOps, value: v },
      layers: layers({ roles: { focus1: [id], done: topo.filter((x) => valueOf.has(x)) } }),
    }));
  }

  const result = { value: valueOf.get(rootId), nodeCount: dag.list.length, reuse: reuseOps, adds };
  steps.push(step({
    event: 'done', lineId: 'end', done: true, result,
    note: `结束：后缀式 ${post.join(' ')} 建成 ${result.nodeCount} 个节点的 DAG，值 ${result.value}；加法节点 ${adds} 个，公共子表达式复用 ${reuseOps} 次。`,
    vars: { expr: text, nodes: result.nodeCount, reuse: reuseOps, value: result.value },
    layers: layers({ roles: { done: topo }, stack: [] }),
  }));

  return trace({
    algorithmId: meta.id, variantId: 'v3', sourceVersion: 'expression-dag-postfix-v1',
    lines: L, steps, result, meta: { rootId, postfix: post },
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
