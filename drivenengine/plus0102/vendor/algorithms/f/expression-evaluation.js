/**
 * F · 表达式求值（3 个代表性不同实现）
 *
 * 契约见 docs/04-轨迹契约.md：每步都是**完整快照**（layer 全部重建），
 * lineId 必须命中本变体自己的 sourceLines，末步 done=true 且 result 与样例期望深比较一致。
 *
 * 三个变体的差别是真的差别，不是改名：
 *   v1 后缀表达式求值   —— 输入是后缀（'8 2 3 - /'），只要一个操作数栈，一条直线扫过去。
 *   v2 双栈中缀直接求值 —— 输入是中缀，操作数栈 + 运算符栈分工：运算符先记账，遇到"更急的来了"
 *                          或右括号就把账结掉（结账动作就是弹右、弹左、算、压回）。
 *   v3 递归下降解析求值 —— 输入是中缀，expr → term → factor 三层递归，优先级与左结合由
 *                          文法层级本身决定（不查表、不比优先级）；栈里放的是"每一层等着合并的左值"。
 *
 * 输入约定：三个变体都读 input.text。v1 读的是**后缀**（词元用空格隔开）；
 * v2/v3 读的是**中缀**。同一个 sample 要给 v1 不同的文本时，用
 * input.byVariant = { v1: { text: '…' } } 单独覆盖（其余变体仍用 input.text）。
 *
 * result = { value: string | null, error: string | null }
 *   value 一律是字符串（'-8' / '14'），免得浮点数在深比较里抖；
 *   error ∈ div-by-zero / underflow / operand-left / bad-token / syntax / unbalanced / empty。
 */

import { trace, step, arrayLayer, stackLayer } from '../../engine/model.js';

export const meta = {
  id: 'f/expression-evaluation',
  variants: [
    { id: 'v1', name: '后缀表达式求值' },
    { id: 'v2', name: '双栈中缀直接求值' },
    { id: 'v3', name: '递归下降解析求值' },
  ],
};

/* ------------------------------------------------------------------ 词元 / 数值 */

const OP_CHARS = '+-*/';
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };
const LEFT_ASSOC = { '+': true, '-': true, '*': true, '/': true };

/** 数值 → 字符串（除不尽时留 9 位，避免 -8.000000000000002 这种抖动） */
const fmt = (x) => {
  if (!Number.isFinite(x)) return String(x);
  return String(Math.round(x * 1e9) / 1e9);
};

const apply = (o, l, r) => (o === '+' ? l + r : o === '-' ? l - r : o === '*' ? l * r : l / r);

/** 求值错误：code 给 result，lineId 给"出错时正在执行哪一行" */
class EvalErr extends Error {
  constructor(code, msg, lineId) {
    super(msg);
    this.code = code;
    this.lineId = lineId;
  }
}

/** v1：后缀词元（必须用空格 / 逗号隔开，否则 12 和 1、2 分不开） */
function postfixTokens(text) {
  const parts = String(text).split(/[\s,，]+/).filter(Boolean);
  return parts.map((p) => {
    if (/^-?\d+(\.\d+)?$/.test(p)) return { kind: 'num', text: p, value: Number(p) };
    if (p.length === 1 && OP_CHARS.indexOf(p) >= 0) return { kind: 'op', text: p };
    return { kind: 'bad', text: p };
  });
}

/** v2/v3：中缀词元（多位数认成一整块） */
function infixTokens(text) {
  const s = String(text);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n') { i += 1; continue; }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j += 1;
      out.push({ kind: 'num', text: s.slice(i, j), value: Number(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (OP_CHARS.indexOf(c) >= 0) { out.push({ kind: 'op', text: c }); i += 1; continue; }
    if (c === '(' || c === ')') { out.push({ kind: c, text: c }); i += 1; continue; }
    out.push({ kind: 'bad', text: c });
    i += 1;
  }
  return out;
}

/** 同一个 sample 里各变体输入不同时的取文本规则 */
function pickText(input, variantId) {
  const per = input && input.byVariant && input.byVariant[variantId];
  if (per && typeof per.text === 'string') return per.text;
  return input && input.text != null ? String(input.text) : '';
}

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'double eval_postfix(char *expr[], int n) {' },
    { lineId: 'init', text: '  Stack S; initStack(&S);            /* 只放操作数（数字） */' },
    { lineId: 'scan', text: '  for (int i = 0; i < n; ++i) {      /* 从左到右读后缀词元 */' },
    { lineId: 'num', text: '    if (isNumber(t)) push(&S, atof(t));   /* 数字直接入栈 */' },
    { lineId: 'underflow', text: '    else { if (S.top < 1) return UNDERFLOW;   /* 不够两个操作数 */' },
    { lineId: 'popr', text: '      double r = pop(&S);           /* pop-right：先弹的是右操作数 */' },
    { lineId: 'popl', text: '      double l = pop(&S);           /* pop-left：后弹的是左操作数 */' },
    { lineId: 'div', text: "      if (t == '/' && r == 0) return DIV_BY_ZERO;" },
    { lineId: 'compute', text: '      double v = apply(t, l, r);    /* 顺序不能反：算 l op r */' },
    { lineId: 'pushr', text: '      push(&S, v);                  /* 结果压回，继续当操作数用 */' },
    { lineId: 'scan-end', text: '    }' },
    { lineId: 'end', text: '  return (S.top == 0) ? pop(&S) : UNDERFLOW;   /* 必须恰好剩一个值 */' },
  ],
  v2: [
    { lineId: 'fn', text: 'double eval_infix(Tok *p) {         /* 边走边算，不先转后缀 */' },
    { lineId: 'init', text: '  Stack num, op; initStack(&num); initStack(&op);   /* 一个存数，一个存运算符 */' },
    { lineId: 'num', text: '  if (isNumber(p)) { push(&num, value(p)); ++p; }' },
    { lineId: 'lparen', text: "  else if (*p == '(') { push(&op, '('); ++p; }   /* 分隔符，不产生值 */" },
    { lineId: 'rparen', text: "  else if (*p == ')') {                       /* 把括号里的账先结清 */" },
    { lineId: 'rparen-apply', text: "    while (top(&op) != '(') applyTop(&num, &op);" },
    { lineId: 'rparen-pop', text: "    pop(&op);                                /* 丢掉 '(' */" },
    { lineId: 'op', text: '  } else {                                   /* 二元运算符：先记账 */' },
    { lineId: 'while-op', text: "    while (!isEmpty(&op) && top(&op) != '(' && 不低(top(&op), *p)) applyTop(&num, &op);" },
    { lineId: 'op-push', text: '    push(&op, *p); ++p;' },
    { lineId: 'apply-popr', text: 'void applyTop(Stack *num, Stack *op) { double r = pop(num);  /* pop-right */' },
    { lineId: 'apply-popl', text: '  double l = pop(num);                            /* pop-left */' },
    { lineId: 'apply-div', text: "  if (o == '/' && r == 0) return DIV_BY_ZERO;      /* 除零在这里拦住 */" },
    { lineId: 'apply-push', text: '  push(num, apply(o, l, r));                      /* 结果压回数栈 */' },
    { lineId: 'flush', text: "  while (!isEmpty(&op)) { if (top(&op) == '(') return UNBALANCED; applyTop(&num, &op); }" },
    { lineId: 'end', text: '  return (num.top == 0) ? pop(&num) : SYNTAX_ERROR;   /* 恰剩一个 */' },
  ],
  v3: [
    { lineId: 'fn', text: 'void eval_recursive(Tok **p, Stack *S) {   /* S = 每层等着合并的左值 */' },
    { lineId: 'expr', text: '  void expr(Tok **p, Stack *S) {            /* 第一层：expr → term { (+|-) term } */' },
    { lineId: 'expr-loop', text: "    term(p, S); while (peek(p) == '+' || peek(p) == '-') {" },
    { lineId: 'expr-call', text: '      char o = *(*p)++; term(p, S);         /* 右值由 term 算好压上来 */' },
    { lineId: 'expr-popr', text: '      double r = pop(S);                    /* pop-right */' },
    { lineId: 'expr-popl', text: '      double l = pop(S);                    /* pop-left */' },
    { lineId: 'expr-calc-push', text: '      push(S, apply(o, l, r));              /* compute + push-result */' },
    { lineId: 'term', text: '  void term(Tok **p, Stack *S) {            /* 第二层：term → factor { (*|/) factor } */' },
    { lineId: 'term-loop', text: "    factor(p, S); while (peek(p) == '*' || peek(p) == '/') {" },
    { lineId: 'term-call', text: '      char o = *(*p)++; factor(p, S);       /* 右值由 factor 算好压上来 */' },
    { lineId: 'term-popr', text: '      double r = pop(S);' },
    { lineId: 'term-popl', text: '      double l = pop(S);' },
    { lineId: 'term-calc-push', text: '      push(S, apply(o, l, r));              /* 除零同样在这里拦住 */' },
    { lineId: 'factor', text: '  void factor(Tok **p, Stack *S) {          /* 第三层：一个数字或一个括号组 */' },
    { lineId: 'factor-num', text: '    if (isNumber(peek(p))) { push(S, number(p)); ++*p; return; }' },
    { lineId: 'factor-lp', text: "    if (peek(p) == '(') { ++*p; expr(p, S); expect(')'); ++*p; return; }" },
    { lineId: 'factor-bad', text: '    ERR(SYNTAX);                           /* 既不是数字也不是括号 */' },
    { lineId: 'end', text: '  /* 词元全部消化完：S 里恰好剩一个值，那就是答案 */' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

const INFIX_NORMAL = '8/(2-3)';

export const samples = [
  {
    id: 'normal',
    label: '8/(2-3) = -8（v1 用后缀形式 8 2 3 - /）',
    input: { text: INFIX_NORMAL, byVariant: { v1: { text: '8 2 3 - /' } } },
    expect: { value: '-8', error: null },
    expectByVariant: {
      v1: { value: '-8', error: null },
      v2: { value: '-8', error: null },
      v3: { value: '-8', error: null },
    },
  },
  {
    id: 'normal-priority',
    label: '2+3*4 = 14（乘法先算，v1 的后缀是 2 3 4 * +）',
    input: { text: '2+3*4', byVariant: { v1: { text: '2 3 4 * +' } } },
    expect: { value: '14', error: null },
    expectByVariant: {
      v1: { value: '14', error: null },
      v2: { value: '14', error: null },
      v3: { value: '14', error: null },
    },
  },
  {
    id: 'edge-div-zero',
    label: '6/0 —— 右操作数是 0，除法没有定义',
    input: { text: '6/0', byVariant: { v1: { text: '6 0 /' } } },
    expect: { error: 'div-by-zero' },
    expectByVariant: {
      v1: { error: 'div-by-zero' },
      v2: { error: 'div-by-zero' },
      v3: { error: 'div-by-zero' },
    },
  },
  {
    id: 'edge-illegal',
    label: '1++ —— 非法表达式：v1 是操作数不够（栈下溢），v2/v3 是语法错误',
    input: { text: '1++', byVariant: { v1: { text: '1 + +' } } },
    expect: { error: 'syntax' },
    expectByVariant: {
      v1: { error: 'underflow' },
      v2: { error: 'syntax' },
      v3: { error: 'syntax' },
    },
  },
  {
    id: 'edge-unbalanced',
    label: '(1+2 —— 右括号缺失；v1 的类比输入是 1 2 + 3（剩两个值没合并）',
    input: { text: '(1+2', byVariant: { v1: { text: '1 2 + 3' } } },
    expect: { error: 'unbalanced' },
    expectByVariant: {
      v1: { error: 'operand-left' },
      v2: { error: 'unbalanced' },
      v3: { error: 'unbalanced' },
    },
  },
];

/* ------------------------------------------------------------------ 公用图层 */

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i += 1) if (i >= 0) out.push(i);
  return out;
};

/** style 1：词元表（当前词元 = 指针 + 红框） */
function tokensLayer(toks, at, title) {
  const values = toks.map((t) => t.text);
  return arrayLayer({
    id: 'in',
    title: title || '表达式词元',
    name: `共 ${values.length} 个词元`,
    values: [...values],
    labels: [...values],
    roles: {
      focus1: at == null ? [] : [at],
      done: at == null ? [] : range(0, at - 1),
      pointers: at == null ? [] : [{ id: 'p', label: 'p', index: at }],
    },
  });
}

/** style 7：操作数栈（top 红框；需要时把下面那个也标出来当"左值"） */
function operandStack(stk, o = {}) {
  const cells = stk.map((v, k) => ({ value: fmt(v), label: `#${k}` }));
  return stackLayer({
    id: 'stk',
    title: o.title || '操作数栈 S',
    name: o.name || 'S · 只放数字',
    cells,
    top: cells.length - 1,
    capacity: 8,
    bottomLabel: 'bottom（栈底）',
    topLabel: 'top',
    roles: {
      focus1: o.topFocus && cells.length ? [cells.length - 1] : [],
      focus2: o.second && cells.length > 1 ? [cells.length - 2] : [],
    },
  });
}

/** style 7：运算符栈（只有 v2 有） */
function operatorStack(op, o = {}) {
  const cells = op.map((c, k) => ({ value: c, label: `#${k}` }));
  return stackLayer({
    id: 'ops',
    title: o.title || '运算符栈 op',
    name: o.name || 'op · 只放运算符和左括号',
    cells,
    top: cells.length - 1,
    capacity: 8,
    bottomLabel: 'bottom（栈底）',
    topLabel: 'top',
    roles: { focus1: o.topFocus && cells.length ? [cells.length - 1] : [] },
  });
}

/* ------------------------------------------------------------------ 变体 1（后缀求值） */

function runV1(input) {
  const text = pickText(input, 'v1');
  const toks = postfixTokens(text);
  const n = toks.length;
  const L = LINES.v1;
  const steps = [];
  const stk = [];
  let pushes = 0;
  let pops = 0;
  let computes = 0;

  const snap = (at) => [
    tokensLayer(toks, at, '后缀表达式词元'),
    operandStack(stk, { topFocus: true }),
  ];
  const vars = (i, tok) => ({ mode: 'postfix', n, i: i == null ? null : i, token: tok || null, depth: stk.length, pushes, pops, computes });

  const finish = (result, note) => {
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note, vars: vars(null, null), layers: snap(null),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v1', sourceVersion: 'expression-evaluation-postfix-v1',
      lines: L, steps, result, meta: { pushes, pops, computes },
    });
  };

  const fail = (code, note, lineId, at) => {
    steps.push(step({
      event: 'error', lineId, note,
      vars: vars(at, at == null ? null : toks[at].text),
      layers: snap(at),
    }));
    return finish({ value: null, error: code }, `求值失败：${note}`);
  };

  steps.push(step({
    event: 'init', lineId: 'init',
    note: n === 0
      ? '空表达式：栈里什么都没有，无从下手。'
      : `后缀表达式的求值只有一条规则：数字压栈；遇到运算符就"弹右、弹左、算完压回"。扫完一遍栈里必须恰好剩一个值。`,
    vars: vars(null, null),
    layers: snap(null),
  }));

  if (n === 0) {
    return fail('empty', '空表达式：没有任何词元，栈里取不出一个结果。', 'end', null);
  }

  for (let i = 0; i < n; i++) {
    const t = toks[i];
    if (t.kind === 'num') {
      stk.push(t.value);
      pushes += 1;
      steps.push(step({
        event: 'push-operand', lineId: 'num',
        note: `读到操作数 ${t.text}：它右边的运算符还没出现，先压栈存着，等运算符来取。`,
        vars: vars(i, t.text),
        layers: snap(i),
      }));
      continue;
    }
    if (t.kind !== 'op') {
      return fail('bad-token', `词元 ${t.text} 既不是数字也不是四则运算符，后缀表达式非法。`, 'scan', i);
    }
    if (stk.length < 2) {
      return fail('underflow', `读到运算符 ${t.text} 时栈里只有 ${stk.length} 个操作数（要 2 个）：这是"栈下溢"，说明表达式少写了数。`, 'underflow', i);
    }
    const right = stk.pop();
    pops += 1;
    steps.push(step({
      event: 'pop-right', lineId: 'popr',
      note: `运算符 ${t.text} 先弹出栈顶 ${fmt(right)} 当**右操作数**：栈是后进先出的，越靠上的越是最近算好、也就越靠右的那个。`,
      vars: vars(i, t.text),
      layers: snap(i),
    }));
    const left = stk.pop();
    pops += 1;
    steps.push(step({
      event: 'pop-left', lineId: 'popl',
      note: `再弹出 ${fmt(left)} 当**左操作数**。顺序绝不能反：一旦反了，减法和除法会算出完全不同的答案（${fmt(left)} ${t.text} ${fmt(right)} ≠ ${fmt(right)} ${t.text} ${fmt(left)}）。`,
      vars: vars(i, t.text),
      layers: snap(i),
    }));
    if (t.text === '/' && right === 0) {
      return fail('div-by-zero', `右操作数是 0，${fmt(left)} / 0 没有定义——除零必须在这里当场拦住，不能让它变成 Infinity。`, 'div', i);
    }
    const v = apply(t.text, left, right);
    computes += 1;
    steps.push(step({
      event: 'compute', lineId: 'compute',
      note: `计算 ${fmt(left)} ${t.text} ${fmt(right)} = ${fmt(v)}：这一步把两个操作数折成一个。`,
      vars: vars(i, t.text),
      layers: snap(i),
    }));
    stk.push(v);
    pushes += 1;
    steps.push(step({
      event: 'push-result', lineId: 'pushr',
      note: `结果 ${fmt(v)} 压回栈顶：它现在是一个"现成的操作数"，等着被外层的运算符取走。`,
      vars: vars(i, t.text),
      layers: snap(i),
    }));
  }

  if (stk.length !== 1) {
    return fail(
      stk.length === 0 ? 'underflow' : 'operand-left',
      `扫描结束时栈里有 ${stk.length} 个值，而后缀表达式必须恰好留下 1 个（多了说明缺运算符，少了说明缺操作数）。`,
      'end',
      null,
    );
  }

  const value = fmt(stk[0]);
  return finish(
    { value, error: null },
    `求值完成：${text} = ${value}（压栈 ${pushes} 次、弹栈 ${pops} 次、运算 ${computes} 次）。`,
  );
}

/* ------------------------------------------------------------------ 变体 2（双栈中缀直接求值） */

function runV2(input) {
  const text = pickText(input, 'v2');
  const toks = infixTokens(text);
  const n = toks.length;
  const L = LINES.v2;
  const steps = [];
  const num = [];
  const op = [];
  let pushes = 0;
  let pops = 0;
  let computes = 0;
  let curAt = null;

  const snap = (at) => [
    tokensLayer(toks, at, '中缀词元'),
    operandStack(num, { topFocus: true }),
    operatorStack(op, { topFocus: true }),
  ];
  const vars = (tok) => ({
    mode: 'infix', n, i: curAt == null ? null : curAt, token: tok || null,
    numDepth: num.length, opDepth: op.length, pushes, pops, computes,
  });

  const finish = (result, note) => {
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note, vars: vars(null), layers: snap(null),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v2', sourceVersion: 'expression-evaluation-twostack-v1',
      lines: L, steps, result, meta: { pushes, pops, computes },
    });
  };

  /** 结一次账：弹右、弹左、算、压回。lineSet 让"由右括号触发"的那一次指向 ) 分支的代码行 */
  const applyTop = (lineSet = {}) => {
    const o = op.pop();
    if (num.length < 2) {
      throw new EvalErr('underflow', `运算符 ${o} 要两个操作数，可操作数栈里只有 ${num.length} 个：栈下溢，表达式非法。`, lineSet.popr || 'apply-popr');
    }
    const right = num.pop();
    pops += 1;
    steps.push(step({
      event: 'pop-right', lineId: lineSet.popr || 'apply-popr',
      note: `结算运算符 ${o}：先弹出 ${fmt(right)} 当右操作数。运算符栈决定"什么时候算"，操作数栈只负责"按顺序给出左右两个值"。`,
      vars: vars(o),
      layers: snap(curAt),
    }));
    const left = num.pop();
    pops += 1;
    steps.push(step({
      event: 'pop-left', lineId: 'apply-popl',
      note: `再弹出 ${fmt(left)} 当左操作数。两个栈各管一件事，所以这里弹出的顺序天然就是"右后左"，不会乱。`,
      vars: vars(o),
      layers: snap(curAt),
    }));
    if (o === '/' && right === 0) {
      throw new EvalErr('div-by-zero', `右操作数是 0，${fmt(left)} / 0 没有定义——双栈法必须在结算的这一刻就拦住除零。`, 'apply-div');
    }
    const v = apply(o, left, right);
    computes += 1;
    steps.push(step({
      event: 'compute', lineId: 'apply-push',
      note: `计算 ${fmt(left)} ${o} ${fmt(right)} = ${fmt(v)}。`,
      vars: vars(o),
      layers: snap(curAt),
    }));
    num.push(v);
    pushes += 1;
    steps.push(step({
      event: 'push-result', lineId: 'apply-push',
      note: `结果 ${fmt(v)} 压回操作数栈：对运算符栈来说这笔账结完了，对操作数栈来说多了一个"现成的值"。`,
      vars: vars(o),
      layers: snap(curAt),
    }));
  };

  steps.push(step({
    event: 'init', lineId: 'init',
    note: n === 0
      ? '空表达式：两个栈都是空的。'
      : `和 v1 的差别：输入是中缀，必须先处理优先级。这里用两个栈分工——操作数栈按出现顺序存值，运算符栈存"还没结的账"；每当来了一个不比自己低优先级的运算符（或右括号），就把栈顶那笔账结掉。左结合靠"同级也要先结账"保证。`,
    vars: vars(null),
    layers: snap(null),
  }));

  let value = null;
  let expectOperand = true;   // 位置检查：现在是否"该来一个操作数了"
  try {
    if (n === 0) throw new EvalErr('empty', '空表达式：没有任何词元可以求值。', 'end');
    for (let i = 0; i < n; i++) {
      curAt = i;
      const t = toks[i];
      if (t.kind === 'num') {
        if (!expectOperand) {
          throw new EvalErr('syntax', `下标 ${i} 的 ${t.text} 前面缺运算符：两个操作数不能直接挨着。`, 'num');
        }
        expectOperand = false;
        num.push(t.value);
        pushes += 1;
        steps.push(step({
          event: 'push-operand', lineId: 'num',
          note: `读到操作数 ${t.text}，压进操作数栈。它到底是"谁的左值"还没定，得看后面运算符栈怎么结账。`,
          vars: vars(t.text),
          layers: snap(i),
        }));
        continue;
      }
      if (t.kind === 'bad') {
        throw new EvalErr('bad-token', `词元 ${t.text} 既不是数字也不是运算符或括号。`, 'num');
      }
      if (t.kind === '(') {
        if (!expectOperand) {
          throw new EvalErr('syntax', `下标 ${i} 的左括号前面缺运算符。`, 'lparen');
        }
        op.push('(');
        steps.push(step({
          event: 'push-operand', lineId: 'lparen',
          note: '左括号压进运算符栈当分隔符：它不产生任何值（操作数栈不动），作用是不让括号外的运算符越过它去结账。',
          vars: vars('('),
          layers: snap(i),
        }));
        continue;
      }
      if (t.kind === ')') {
        if (expectOperand) {
          throw new EvalErr('syntax', `下标 ${i} 的右括号左边没有操作数：括号组是空的。`, 'rparen');
        }
        expectOperand = true;
        while (op.length && op[op.length - 1] !== '(') {
          applyTop({ popr: 'rparen-apply' });
        }
        if (op.length === 0) {
          throw new EvalErr('unbalanced', `右括号来了，但运算符栈里已经没有左括号可以和它配对：括号不配对。`, 'rparen');
        }
        op.pop();
        expectOperand = false;
        continue;
      }
      // 二元运算符：先把不比自己低的账结掉，再把自己记上
      if (expectOperand) {
        throw new EvalErr('syntax', `下标 ${i} 的运算符 ${t.text} 左边没有操作数（不支持一元运算符）。`, 'while-op');
      }
      expectOperand = true;
      while (op.length && op[op.length - 1] !== '(') {
        const top = op[op.length - 1];
        const higher = PREC[top] > PREC[t.text];
        const sameLeft = PREC[top] === PREC[t.text] && LEFT_ASSOC[t.text];
        if (!higher && !sameLeft) break;
        applyTop({ popr: 'while-op' });
      }
      op.push(t.text);
      steps.push(step({
        event: 'push-operand', lineId: 'op-push',
        note: `运算符 ${t.text} 记进运算符栈（操作数栈不动）。此后只要遇到"不比他更松"的运算符，就会先把它结掉——这就是优先级与左结合在这里的全部实现。`,
        vars: vars(t.text),
        layers: snap(i),
      }));
    }

    if (expectOperand) {
      throw new EvalErr('syntax', '表达式以运算符（或左括号）结尾：右边还缺一个操作数。', 'end');
    }
    while (op.length) {
      if (op[op.length - 1] === '(') {
        throw new EvalErr('unbalanced', '词元扫完了，运算符栈里还剩一个没闭合的左括号：少写了一个右括号。', 'flush');
      }
      applyTop({ popr: 'flush' });
    }
    if (num.length !== 1) {
      throw new EvalErr(
        num.length === 0 ? 'underflow' : 'operand-left',
        `结算完毕，操作数栈里剩了 ${num.length} 个值，必须恰好 1 个。`,
        'end',
      );
    }
    value = fmt(num[0]);
  } catch (e) {
    if (!(e instanceof EvalErr)) throw e;
    steps.push(step({
      event: 'error', lineId: e.lineId, note: e.message,
      vars: vars(curAt == null ? null : toks[curAt].text),
      layers: snap(curAt),
    }));
    return finish({ value: null, error: e.code }, `求值失败：${e.message}`);
  }

  return finish(
    { value, error: null },
    `求值完成：${text} = ${value}（压栈 ${pushes} 次、弹栈 ${pops} 次、运算 ${computes} 次；没有转过后缀，边走边算）。`,
  );
}

/* ------------------------------------------------------------------ 变体 3（递归下降） */

function runV3(input) {
  const text = pickText(input, 'v3');
  const toks = infixTokens(text);
  const n = toks.length;
  const L = LINES.v3;
  const steps = [];
  const stk = [];       // 每层递归里"已经算好、等着合并"的值
  let pushes = 0;
  let pops = 0;
  let computes = 0;
  let pos = 0;
  let rule = null;

  const snap = (at) => [
    tokensLayer(toks, at, '中缀词元'),
    operandStack(stk, { topFocus: true, second: stk.length > 1 }),
  ];
  const vars = (tok) => ({
    mode: 'infix', n, pos, token: tok || null, rule,
    depth: stk.length, pushes, pops, computes,
  });
  const emit = (event, lineId, note, tok) => {
    steps.push(step({ event, lineId, note, vars: vars(tok), layers: snap(pos) }));
  };

  const finish = (result, note) => {
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note, vars: vars(null), layers: snap(null),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v3', sourceVersion: 'expression-evaluation-recursive-descent-v1',
      lines: L, steps, result, meta: { pushes, pops, computes },
    });
  };

  const peek = () => toks[pos] || null;

  /** 一层合并：栈顶是右值（下层刚算好压上来的），下面是左值 */
  const combine = (o) => {
    const isExpr = rule === 'expr';
    if (stk.length < 2) {
      throw new EvalErr('underflow', `合并 ${o} 时操作数栈里只有 ${stk.length} 个值：栈下溢。`, isExpr ? 'expr-popr' : 'term-popr');
    }
    const right = stk.pop();
    pops += 1;
    emit('pop-right', isExpr ? 'expr-popr' : 'term-popr',
      `${rule} 层合并 ${o}：先弹出栈顶 ${fmt(right)} 当右操作数——它是下一层（${isExpr ? 'term' : 'factor'}）刚刚算好压上来的。`);
    const left = stk.pop();
    pops += 1;
    emit('pop-left', isExpr ? 'expr-popl' : 'term-popl',
      `${rule} 层：再弹出 ${fmt(left)} 当左操作数。左值一直在栈底等着，所以左结合是文法结构保证的，不需要比较优先级。`,
      o);
    if (o === '/' && right === 0) {
      throw new EvalErr('div-by-zero', `右操作数是 0，${fmt(left)} / 0 没有定义——除法在 term 层结算，就在这一层拦住。`, isExpr ? 'expr-calc-push' : 'term-calc-push');
    }
    const v = apply(o, left, right);
    computes += 1;
    emit('compute', isExpr ? 'expr-calc-push' : 'term-calc-push',
      `${rule} 层：计算 ${fmt(left)} ${o} ${fmt(right)} = ${fmt(v)}。`, o);
    stk.push(v);
    pushes += 1;
    emit('push-result', isExpr ? 'expr-calc-push' : 'term-calc-push',
      `${rule} 层：结果 ${fmt(v)} 压回栈顶，成为本层新的左值，继续和右边的 term 合并。`, o);
  };

  /* 第三层：factor —— 一个数字，或一个（递归回来的）括号组 */
  const factor = () => {
    rule = 'factor';
    const t = peek();
    if (!t) throw new EvalErr('syntax', '表达式在这里就结束了，但 factor 还需要一个数字或一个括号组。', 'factor-bad');
    if (t.kind === 'num') {
      stk.push(t.value);
      pushes += 1;
      const at = pos;
      pos += 1;
      steps.push(step({
        event: 'push-operand', lineId: 'factor-num',
        note: `进入 factor（第 3 层，最底层）：读到数字 ${t.text}，直接压栈——它本身就是一个算好的值，不需要再化简。`,
        vars: vars(t.text),
        layers: snap(at),
      }));
      return;
    }
    if (t.kind === '(') {
      pos += 1;
      emit('push-operand', 'factor-lp',
        '进入 factor：括号组。括号里交给 expr 递归处理，它算完会把一个值留在栈顶，优先级就由"谁在括号里"天然决定。');
      expr();
      const close = peek();
      if (!close || close.kind !== ')') {
        throw new EvalErr('unbalanced', '括号组没有闭合：缺少右括号。', 'factor-lp');
      }
      pos += 1;
      return;
    }
    throw new EvalErr('syntax', `factor 处读到 ${t.text}，既不是数字也不是左括号：语法错误。`, 'factor-bad');
  };

  /* 第二层：term —— 处理 * / */
  const term = () => {
    factor();
    rule = 'term';
    while (peek() && peek().kind === 'op' && (peek().text === '*' || peek().text === '/')) {
      const o = peek().text;
      pos += 1;
      rule = 'term';
      factor();
      combine(o);
    }
  };

  /* 第一层：expr —— 处理 + - */
  const expr = () => {
    term();
    rule = 'expr';
    while (peek() && peek().kind === 'op' && (peek().text === '+' || peek().text === '-')) {
      const o = peek().text;
      pos += 1;
      rule = 'expr';
      term();
      combine(o);
    }
  };

  steps.push(step({
    event: 'init', lineId: 'fn',
    note: n === 0
      ? '空表达式：expr 一进来就无词元可读。'
      : `这里既不查优先级表、也不用双栈：优先级写进文法层级里——expr 只认 + -，term 只认 * /，factor 只认数字和括号。乘除天然落在更深的 term 层里，所以一定先算；减法和除法同样天然左结合，因为左值一直在栈底等着右边先算完。`,
    vars: vars(null),
    layers: snap(null),
  }));

  let value = null;
  try {
    if (n === 0) throw new EvalErr('empty', '空表达式：expr → term → factor 立刻在 factor 处失败。', 'factor-bad');
    rule = 'expr';
    expr();
    if (pos < toks.length) {
      const t = toks[pos];
      throw new EvalErr(
        t.kind === ')' ? 'unbalanced' : 'syntax',
        `下标 ${pos} 的 ${t.text} 没有被任何一层消化：${t.kind === ')' ? '多了一个右括号。' : '表达式语法非法。'}`,
        'factor-bad',
      );
    }
    if (stk.length !== 1) {
      throw new EvalErr(
        stk.length === 0 ? 'underflow' : 'operand-left',
        `调用栈全部返回后，操作数栈里剩了 ${stk.length} 个值，必须恰好 1 个。`,
        'end',
      );
    }
    value = fmt(stk[0]);
  } catch (e) {
    if (!(e instanceof EvalErr)) throw e;
    steps.push(step({
      event: 'error', lineId: e.lineId, note: e.message,
      vars: vars(pos < toks.length ? toks[pos].text : null),
      layers: snap(pos < toks.length ? pos : null),
    }));
    return finish({ value: null, error: e.code }, `求值失败：${e.message}`);
  }

  return finish(
    { value, error: null },
    `求值完成：${text} = ${value}（expr/term/factor 三层递归，压栈 ${pushes} 次、弹栈 ${pops} 次、运算 ${computes} 次）。`,
  );
}

/* ------------------------------------------------------------------ 导出 */

const RUNNERS = { v1: runV1, v2: runV2, v3: runV3 };

export function run(variantId, input) {
  const fn = RUNNERS[variantId];
  if (!fn) throw new Error(`未知变体：${variantId}`);
  return fn(input || {});
}

export function sourceLines(variantId) {
  return LINES[variantId] || LINES.v1;
}
