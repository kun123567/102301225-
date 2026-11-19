/**
 * F · 中缀转后缀（3 个代表性不同实现）
 *
 * 契约见 docs/04-轨迹契约.md：每步都是**完整快照**（layer 全部重建），
 * lineId 必须命中本变体自己的 sourceLines，末步 done=true 且 result 与样例期望深比较一致。
 *
 * 三个变体的差别是真的差别，不是改名：
 *   v1 调度场（运算符栈）—— 一个栈 + 一个 prec() 函数；运算符"更急"就先弹出去。
 *   v2 优先级表驱动     —— 代码里没有 prec()，只有 isp（栈内）/ icp（栈外）两张静态表；
 *                          比较动作退化成"两个数字谁大"，画面里多一张被点亮的表。
 *   v3 从右向左求前缀再反转 —— 反向扫描（并把 ) 当成"开始"）得到前缀的逆序 rev；
 *                          再用第二个栈把 rev 合并成后缀。栈的内容和扫描方向都不同。
 *
 * result = { postfix: string[], error: null | 'unbalanced-open' | 'unbalanced-close'
 *                                              | 'bad-char' | 'bad-expr' }
 * 出错时 postfix 是"已经输出的部分"，样例只核对 error 键。
 */

import { trace, step, arrayLayer, stackLayer, gridLayer } from '../../engine/model.js';

export const meta = {
  id: 'f/infix-to-postfix',
  variants: [
    { id: 'v1', name: '调度场（运算符栈）' },
    { id: 'v2', name: '优先级表驱动' },
    { id: 'v3', name: '从右向左求前缀再反转' },
  ],
};

/* ------------------------------------------------------------------ 词元 / 优先级 */

const OP_CHARS = '+-*/';
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };
/** 本批四个运算符都是左结合：同级时栈顶（左边的）先算 */
const LEFT_ASSOC = { '+': true, '-': true, '*': true, '/': true };
/** v2 的两张表：isp 管"已经在栈里的"，icp 管"正要进来的" */
const ISP = { '+': 3, '-': 3, '*': 5, '/': 5, '(': 1 };
const ICP = { '+': 2, '-': 2, '*': 4, '/': 4, '(': 6, ')': 1 };
const PREC_ROWS = [
  ['+', '3', '2'],
  ['-', '3', '2'],
  ['*', '5', '4'],
  ['/', '5', '4'],
  ['(', '1', '6'],
  [')', '—', '1'],
];

/** 词元化：多位数认成一整块，其它字符单独成词元 */
function tokenize(text) {
  const s = String(text);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n') { i += 1; continue; }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < s.length && s[j] >= '0' && s[j] <= '9') j += 1;
      out.push({ text: s.slice(i, j), kind: 'num', pos: i });
      i = j;
      continue;
    }
    if (OP_CHARS.indexOf(c) >= 0) { out.push({ text: c, kind: 'op', pos: i }); i += 1; continue; }
    if (c === '(') { out.push({ text: c, kind: '(', pos: i }); i += 1; continue; }
    if (c === ')') { out.push({ text: c, kind: ')', pos: i }); i += 1; continue; }
    out.push({ text: c, kind: 'bad', pos: i });
    i += 1;
  }
  return out;
}

const kindName = (t) => (t.kind === 'num' ? '操作数' : t.kind === 'op' ? '运算符'
  : t.kind === '(' ? '左括号' : t.kind === ')' ? '右括号' : '无法识别的字符');

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'int to_postfix(char s[], char out[]) {' },
    { lineId: 'init', text: '  Stack S; initStack(&S);            /* S 里只放运算符和左括号 */' },
    { lineId: 'scan', text: '  for (int i = 0; i < n; ++i) {       /* 从左到右读词元 */' },
    { lineId: 'num', text: '    if (isOperand(t)) out[k++] = t;    /* 操作数直接进输出 */' },
    { lineId: 'lparen', text: "    else if (t == '(') push(&S, '(');/* 左括号先存着，等它的右括号 */" },
    { lineId: 'rparen', text: "    else if (t == ')') {            /* 括号里的运算符全部结清 */" },
    { lineId: 'pop2paren', text: "      while (top(&S) != '(') out[k++] = pop(&S);" },
    { lineId: 'noparen', text: '      if (isEmpty(&S)) return UNBALANCED_CLOSE;' },
    { lineId: 'poplparen', text: "      pop(&S);                     /* 丢掉左括号本身 */" },
    { lineId: 'op', text: '    } else {                        /* 运算符：先看谁更急 */' },
    { lineId: 'while-op', text: "      while (!isEmpty(&S) && top(&S) != '(' &&" },
    { lineId: 'cond', text: '             (prec(top) > prec(t) || (prec(top) == prec(t) && leftAssoc(t))))' },
    { lineId: 'pop-op', text: '        out[k++] = pop(&S);         /* 更急的先算，先出 */' },
    { lineId: 'push-op', text: '      push(&S, t);' },
    { lineId: 'scan-end', text: '  }' },
    { lineId: 'flush', text: '  while (!isEmpty(&S)) {           /* 收尾：剩下的全是运算符 */' },
    { lineId: 'flush-open', text: "    if (top(&S) == '(') return UNBALANCED_OPEN;" },
    { lineId: 'flush-pop', text: '    out[k++] = pop(&S);' },
    { lineId: 'end', text: '  return OK;' },
  ],
  v2: [
    { lineId: 'fn', text: 'int to_postfix_table(char s[], char out[]) {' },
    { lineId: 'init', text: '  Stack S; initStack(&S);            /* 没有 prec() 函数，只有表 */' },
    { lineId: 'table', text: '  /* static: +,- isp 3 / icp 2 ; *,/ isp 5 / icp 4 ; ( isp 1 / icp 6 */' },
    { lineId: 'scan', text: '  for (int i = 0; i < n; ++i) {' },
    { lineId: 'num', text: '    if (isOperand(t)) out[k++] = t;' },
    { lineId: 'lparen', text: "    else if (t == '(') push(&S, '(');   /* icp 6 比谁都大，必然入栈 */" },
    { lineId: 'rparen', text: "    else if (t == ')') {             /* 右括号不收表管 */" },
    { lineId: 'pop2paren', text: "      while (top(&S) != '(') out[k++] = pop(&S);" },
    { lineId: 'noparen', text: '      if (isEmpty(&S)) return UNBALANCED_CLOSE;' },
    { lineId: 'poplparen', text: "      pop(&S);" },
    { lineId: 'op', text: '    } else {' },
    { lineId: 'icp', text: '      int in = icp(t);                /* 栈外优先级：查表 */' },
    { lineId: 'isp', text: '      while (!isEmpty(&S) && in < isp(top(&S)))  /* 栈内优先级：查表 */' },
    { lineId: 'pop', text: '        out[k++] = pop(&S);           /* 谁的数大谁先出 */' },
    { lineId: 'push', text: '      push(&S, t);' },
    { lineId: 'scan-end', text: '  }' },
    { lineId: 'flush', text: "  while (!isEmpty(&S)) { if (top(&S)=='(') return UNBALANCED_OPEN; out[k++] = pop(&S); }" },
    { lineId: 'end', text: '  return OK;' },
  ],
  v3: [
    { lineId: 'fn', text: 'int to_postfix_mirror(char s[], char out[]) {' },
    { lineId: 'init', text: '  Stack S; initStack(&S);            /* 第一遍：从右往左扫 */' },
    { lineId: 'rscan', text: '  for (int i = n - 1; i >= 0; --i) {' },
    { lineId: 'num', text: '    if (isOperand(t)) rev[k++] = t;' },
    { lineId: 'rparen', text: "    else if (t == ')') push(&S, ')');   /* 反向扫描里 ) 才是\"开始\" */" },
    { lineId: 'lparen', text: "    else if (t == '(') {               /* 弹到最近的 ) */" },
    { lineId: 'lparen-pop', text: "      while (top(&S) != ')') rev[k++] = pop(&S);" },
    { lineId: 'lparen-close', text: "      pop(&S);                         /* 丢掉配对的那个 ) */" },
    { lineId: 'op', text: '    } else {' },
    { lineId: 'rop-pop', text: "      while (!isEmpty(&S) && top(&S) != ')' && prec(top) > prec(t)) rev[k++] = pop(&S);" },
    { lineId: 'rop-push', text: '      push(&S, t);' },
    { lineId: 'rscan-end', text: '  }' },
    { lineId: 'flush', text: '  while (!isEmpty(&S)) {             /* rev = 前缀表达式的逆序 */' },
    { lineId: 'flush-pop', text: "    if (top(&S) == ')') return UNBALANCED_CLOSE;" },
    { lineId: 'flush-out', text: '    rev[k++] = pop(&S);' },
    { lineId: 'merge-init', text: '  Stack M; initStack(&M);            /* 第二遍：把 rev 合并回后缀 */' },
    { lineId: 'merge', text: '  for (int j = 0; j < k; ++j) {' },
    { lineId: 'merge-num', text: '    if (isOperand(rev[j])) push(&M, rev[j]);' },
    { lineId: 'merge-op', text: '    else { L = pop(&M); R = pop(&M); push(&M, L + R + rev[j]); }' },
    { lineId: 'end', text: '  return OK;' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

const SAMPLE_TEXT = '12+3*(4-2)';

export const samples = [
  {
    id: 'normal',
    label: `${SAMPLE_TEXT}（期望 12 3 4 2 - * +）`,
    input: { text: SAMPLE_TEXT },
    expect: { postfix: ['12', '3', '4', '2', '-', '*', '+'], error: null },
  },
  {
    id: 'edge-unbalanced-open',
    label: "12+(3*4 —— 少一个右括号，扫描完 '(' 还在栈里",
    input: { text: '12+(3*4' },
    expect: { error: 'unbalanced-open' },
  },
  {
    id: 'edge-unbalanced-close',
    label: "12) —— 多一个右括号，栈里没有 '(' 可以和它配",
    input: { text: '12)' },
    expect: { error: 'unbalanced-close' },
  },
  {
    id: 'edge-single',
    label: '7 —— 只有一个操作数，输出就是它自己',
    input: { text: '7' },
    expect: { postfix: ['7'], error: null },
  },
  {
    id: 'edge-empty',
    label: '空串 —— 没有词元，输出为空',
    input: { text: '' },
    expect: { postfix: [], error: null },
  },
];

/* ------------------------------------------------------------------ 公用图层 */

const range = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i += 1) if (i >= 0) out.push(i);
  return out;
};

/** style 1：输入词元表（当前词元 = 指针 + 红框，已读过的转绿） */
function inputLayer(tokens, at) {
  const values = tokens.map((t) => t.text);
  return arrayLayer({
    id: 'in',
    title: '输入（中缀，已切成词元）',
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

/** style 1：输出序列（后缀，最新的一个标蓝 added） */
function outLayer(out, o = {}) {
  return arrayLayer({
    id: 'out',
    title: o.title || '输出序列（后缀）',
    name: o.name || `postfix[${out.length}]`,
    values: [...out],
    labels: [...out],
    roles: { added: out.length ? [out.length - 1] : [] },
  });
}

/** style 7：运算符栈（v1/v2 用，v3 的两遍扫描也各有一个自己的栈） */
function opStackLayer(stk, o = {}) {
  const cells = stk.map((c, k) => ({ value: c, label: `#${k}` }));
  return stackLayer({
    id: o.id || 'ops',
    title: o.title || '运算符栈 S',
    name: o.name || 'S · 只放运算符和左括号',
    cells,
    top: cells.length - 1,
    capacity: 8,
    bottomLabel: 'bottom（栈底）',
    topLabel: 'top',
    roles: { focus1: o.topFocus && cells.length ? [cells.length - 1] : [] },
  });
}

/** style 6：v2 的 isp / icp 优先级表，按行点亮 */
function precTableLayer(o = {}) {
  const rowKeys = (op) => {
    const r = PREC_ROWS.findIndex((row) => row[0] === op);
    return r < 0 ? [] : [`${r},0`, `${r},1`, `${r},2`];
  };
  const roles = {};
  if (o.incoming) roles.focus1 = rowKeys(o.incoming);
  if (o.inStack) roles.focus2 = rowKeys(o.inStack);
  return gridLayer({
    id: 'tbl',
    title: '优先级表（isp 栈内 / icp 栈外）',
    name: 'static table',
    values: PREC_ROWS.map((row) => [row[1], row[2]]),
    rowLabels: PREC_ROWS.map((row) => row[0]),
    colLabels: ['isp（栈内）', 'icp（栈外）'],
    roles,
  });
}

/* ------------------------------------------------------------------ 变体 1（调度场） */

function runV1(input) {
  const text = input.text == null ? '' : String(input.text);
  const tokens = tokenize(text);
  const n = tokens.length;
  const L = LINES.v1;
  const steps = [];
  const stk = [];
  const out = [];
  let pushed = 0;
  let popped = 0;

  const snap = (o = {}) => [
    inputLayer(tokens, o.at),
    opStackLayer(stk, { topFocus: o.topFocus }),
    outLayer(out),
  ];
  const vars = (o = {}) => ({ n, i: o.i == null ? null : o.i, token: o.token || null, outLen: out.length, depth: stk.length, pushed, popped });

  const finish = (result, note) => {
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note, vars: vars(), layers: snap(),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v1', sourceVersion: 'infix-to-postfix-shunting-yard-v1',
      lines: L, steps, result, meta: { pushed, popped },
    });
  };

  const fail = (code, note, lineId, at) => {
    steps.push(step({
      event: 'error', lineId, note,
      vars: vars({ i: at, token: at != null ? tokens[at].text : null }),
      layers: snap({ at, topFocus: true }),
    }));
    return finish({ postfix: [...out], error: code }, `转换失败：${note}`);
  };

  steps.push(step({
    event: 'init', lineId: 'init',
    note: n === 0
      ? '空串：没有词元，输出序列就是空的。'
      : `调度场只有一条主线：操作数直接进输出，运算符先进栈；栈顶那个"更急"（优先级更高，或同级但先来）的运算符必须先出栈——这正好保住左结合。`,
    vars: vars(),
    layers: snap(),
  }));

  for (let i = 0; i < n; i++) {
    const t = tokens[i];
    const scanLine = t.kind === ')' ? 'rparen' : t.kind === '(' ? 'lparen' : t.kind === 'op' ? 'op' : 'scan';
    steps.push(step({
      event: 'token', lineId: scanLine,
      note: `读到第 ${i} 个词元 ${t.text}（${kindName(t)}，原串下标 ${t.pos}）：先判断它该进输出还是先进栈。`,
      vars: vars({ i, token: t.text }),
      layers: snap({ at: i }),
    }));

    if (t.kind === 'num') {
      out.push(t.text);
      steps.push(step({
        event: 'operand-out', lineId: 'num',
        note: `${t.text} 是操作数：它的左右邻居都由运算符决定，所以不需要等，直接写进输出序列。`,
        vars: vars({ i, token: t.text }),
        layers: snap({ at: i }),
      }));
      continue;
    }

    if (t.kind === 'bad') {
      return fail('bad-char', `词元 ${t.text} 既不是数字也不是四则运算符或括号，无法进入表达式。`, 'scan', i);
    }

    if (t.kind === '(') {
      stk.push('(');
      pushed += 1;
      steps.push(step({
        event: 'paren-open', lineId: 'lparen',
        note: '左括号直接入栈当"分隔符"：它不参与比优先级，作用是拦住括号外面的运算符，不让它们越过括号边界。',
        vars: vars({ i, token: t.text }),
        layers: snap({ at: i, topFocus: true }),
      }));
      continue;
    }

    if (t.kind === ')') {
      let closed = false;
      while (stk.length) {
        if (stk[stk.length - 1] === '(') { closed = true; break; }
        const top = stk.pop();
        popped += 1;
        out.push(top);
        steps.push(step({
          event: 'pop-op', lineId: 'pop2paren',
          note: `右括号要求"括号里的运算先算完"，所以先弹出栈顶 ${top} 写进输出；它在括号内部，本来就该先出。`,
          vars: vars({ i, token: t.text }),
          layers: snap({ at: i }),
        }));
      }
      if (!closed) {
        return fail('unbalanced-close', `下标 ${t.pos} 的右括号找不到与之配对的左括号（栈里已经没有 '(' 了）。`, 'noparen', i);
      }
      stk.pop();
      popped += 1;
      steps.push(step({
        event: 'paren-close', lineId: 'poplparen',
        note: "左括号和右括号之间的运算符已经全部结清，现在把左括号本身也弹掉——这对括号消失，栈顶回到外层。",
        vars: vars({ i, token: t.text }),
        layers: snap({ at: i }),
      }));
      continue;
    }

    // 运算符
    while (stk.length) {
      const top = stk[stk.length - 1];
      if (top === '(') break;
      const higher = PREC[top] > PREC[t.text];
      const sameLeft = PREC[top] === PREC[t.text] && LEFT_ASSOC[t.text];
      if (!higher && !sameLeft) break;
      stk.pop();
      popped += 1;
      out.push(top);
      steps.push(step({
        event: 'pop-op', lineId: 'pop-op',
        note: higher
          ? `栈顶 ${top} 的优先级（${PREC[top]}）比当前 ${t.text}（${PREC[t.text]}）高：它更急，必须先算完才能轮到 ${t.text}。`
          : `栈顶 ${top} 与当前 ${t.text} 同级，而四则运算左结合：左边那个先算，所以先把 ${top} 弹出去。`,
        vars: vars({ i, token: t.text }),
        layers: snap({ at: i }),
      }));
    }
    stk.push(t.text);
    pushed += 1;
    steps.push(step({
      event: 'push-op', lineId: 'push-op',
      note: stk.length === 1
        ? `栈里没有比 ${t.text} 更急的运算符了，${t.text} 入栈，等它的右操作数先输出。`
        : `栈顶不满足"更急或同级左结合"，${t.text} 入栈等着；它现在压在里面那些运算符的上面。`,
      vars: vars({ i, token: t.text }),
      layers: snap({ at: i, topFocus: true }),
    }));
  }

  while (stk.length) {
    const top = stk[stk.length - 1];
    if (top === '(') {
      return fail('unbalanced-open', '扫描结束，栈里还留着一个没被闭合的左括号——括号不配对。', 'flush-open', null);
    }
    stk.pop();
    popped += 1;
    out.push(top);
    steps.push(step({
      event: 'pop-op', lineId: 'flush-pop',
      note: `全部词元已读完，栈里剩下的 ${top} 一定在"更右边没有东西"的位置，直接从栈顶往栈底依次输出。`,
      vars: vars(),
      layers: snap({ topFocus: true }),
    }));
  }

  return finish(
    { postfix: [...out], error: null },
    n === 0 ? '转换完成：空串对应空后缀。' : `转换完成：${out.join(' ')}（压栈 ${pushed} 次、弹栈 ${popped} 次）。`,
  );
}

/* ------------------------------------------------------------------ 变体 2（优先级表驱动） */

function runV2(input) {
  const text = input.text == null ? '' : String(input.text);
  const tokens = tokenize(text);
  const n = tokens.length;
  const L = LINES.v2;
  const steps = [];
  const stk = [];
  const out = [];
  let pushed = 0;
  let popped = 0;
  let looks = 0;

  const snap = (o = {}) => [
    inputLayer(tokens, o.at),
    opStackLayer(stk, { topFocus: o.topFocus }),
    outLayer(out),
    precTableLayer({ incoming: o.incoming, inStack: o.inStack }),
  ];
  const vars = (o = {}) => ({ n, i: o.i == null ? null : o.i, token: o.token || null, outLen: out.length, depth: stk.length, pushed, popped, looks });

  const finish = (result, note) => {
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note, vars: vars(), layers: snap(),
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v2', sourceVersion: 'infix-to-postfix-table-v1',
      lines: L, steps, result, meta: { pushed, popped, looks },
    });
  };

  const fail = (code, note, lineId, at) => {
    steps.push(step({
      event: 'error', lineId, note,
      vars: vars({ i: at, token: at != null ? tokens[at].text : null }),
      layers: snap({ at, topFocus: true }),
    }));
    return finish({ postfix: [...out], error: code }, `转换失败：${note}`);
  };

  steps.push(step({
    event: 'init', lineId: 'init',
    note: n === 0
      ? '空串：没有词元可查表。'
      : `和 v1 的差别在"决定要不要弹栈"这一步：v1 调 prec() 写死比较，这里只查两张表——isp 是已经在栈里的优先级，icp 是正要进来的优先级。左结合不是靠 if 判断，而是靠同一运算符 isp > icp（+,- 是 3 对 2，*,/ 是 5 对 4）。`,
    vars: vars(),
    layers: snap(),
  }));

  for (let i = 0; i < n; i++) {
    const t = tokens[i];
    const scanLine = t.kind === ')' ? 'rparen' : t.kind === '(' ? 'lparen' : t.kind === 'op' ? 'op' : 'scan';
    steps.push(step({
      event: 'token', lineId: scanLine,
      note: `读到第 ${i} 个词元 ${t.text}（${kindName(t)}）：${t.kind === 'op' ? `按 icp 表它是 ${ICP[t.text]}` : '先看它属于哪一类'}。`,
      vars: vars({ i, token: t.text }),
      layers: snap({ at: i, incoming: t.kind === 'op' ? t.text : null }),
    }));

    if (t.kind === 'num') {
      out.push(t.text);
      steps.push(step({
        event: 'operand-out', lineId: 'num',
        note: `${t.text} 是操作数：任何运算符都不影响它的位置，直接进输出。`,
        vars: vars({ i, token: t.text }),
        layers: snap({ at: i }),
      }));
      continue;
    }

    if (t.kind === 'bad') {
      return fail('bad-char', `词元 ${t.text} 不在表里，也不是数字：表达式非法。`, 'scan', i);
    }

    if (t.kind === '(') {
      stk.push('(');
      pushed += 1;
      steps.push(step({
        event: 'paren-open', lineId: 'lparen',
        note: '左括号 icp = 6，比任何栈内 isp（最大 5）都大，所以查表的结果必然是不弹、直接入栈——它天然是"分隔符"。',
        vars: vars({ i, token: t.text }),
        layers: snap({ at: i, incoming: '(', topFocus: true }),
      }));
      continue;
    }

    if (t.kind === ')') {
      let closed = false;
      while (stk.length) {
        if (stk[stk.length - 1] === '(') { closed = true; break; }
        const top = stk.pop();
        popped += 1;
        out.push(top);
        steps.push(step({
          event: 'pop-op', lineId: 'pop2paren',
          note: `右括号不看表，规则是"一路弹到最近的左括号"：栈顶 ${top} 先出。`,
          vars: vars({ i, token: t.text }),
          layers: snap({ at: i }),
        }));
      }
      if (!closed) {
        return fail('unbalanced-close', '右括号来了，但栈里已经没有左括号可以配——不配对。', 'noparen', i);
      }
      stk.pop();
      popped += 1;
      steps.push(step({
        event: 'paren-close', lineId: 'poplparen',
        note: '括号区间结算完毕，把左括号本身弹掉（isp = 1 的那个分隔符不再需要）。',
        vars: vars({ i, token: t.text }),
        layers: snap({ at: i }),
      }));
      continue;
    }

    // 运算符：纯粹查表比较
    const inP = ICP[t.text];
    while (stk.length) {
      const top = stk[stk.length - 1];
      if (top === '(') break;
      looks += 1;
      if (!(inP < ISP[top])) break;
      stk.pop();
      popped += 1;
      out.push(top);
      steps.push(step({
        event: 'pop-op', lineId: 'pop',
        note: `查表：icp(${t.text}) = ${inP} < isp(${top}) = ${ISP[top]} → 栈顶更急，${top} 必须先进输出。`,
        vars: vars({ i, token: t.text }),
        layers: snap({ at: i, inStack: top, incoming: t.text }),
      }));
    }
    stk.push(t.text);
    pushed += 1;
    const topNow = stk.length > 1 ? stk[stk.length - 2] : null;
    steps.push(step({
      event: 'push-op', lineId: 'isp',
      note: topNow == null
        ? `栈空：${t.text}（icp ${inP}）没有对手，入栈。`
        : `查表：icp(${t.text}) = ${inP}，栈顶 ${topNow} 的 isp = ${ISP[topNow]}，${inP} < ${ISP[topNow]} 不成立 → 不弹，${t.text} 入栈。`,
      vars: vars({ i, token: t.text }),
      layers: snap({ at: i, inStack: topNow, incoming: t.text, topFocus: true }),
    }));
  }

  while (stk.length) {
    const top = stk[stk.length - 1];
    if (top === '(') {
      return fail('unbalanced-open', '扫描结束，栈里还留着左括号：少了一个右括号。', 'flush', null);
    }
    stk.pop();
    popped += 1;
    out.push(top);
    steps.push(step({
      event: 'pop-op', lineId: 'flush',
      note: `收尾阶段表已经用不上了：剩下的运算符从栈顶往栈底全部弹出，顺序自然满足优先级。`,
      vars: vars(),
      layers: snap({ topFocus: true }),
    }));
  }

  return finish(
    { postfix: [...out], error: null },
    n === 0 ? '转换完成：空串对应空后缀。' : `转换完成：${out.join(' ')}（查表 ${looks} 次、压栈 ${pushed} 次、弹栈 ${popped} 次）。`,
  );
}

/* ------------------------------------------------------------------ 变体 3（从右向左 → 前缀逆序 → 合并） */

function runV3(input) {
  const text = input.text == null ? '' : String(input.text);
  const tokens = tokenize(text);
  const n = tokens.length;
  const L = LINES.v3;
  const steps = [];
  const rev = [];       // 第一遍的输出：前缀表达式的逆序
  const stk = [];       // 第一遍的运算符栈
  const merge = [];     // 第二遍的合并栈，每格是"已经拼好的后缀片段"
  let pushed = 0;
  let popped = 0;

  const vars = (o = {}) => ({
    n,
    i: o.i == null ? null : o.i,
    token: o.token || null,
    revLen: rev.length,
    depth: stk.length,
    mergeDepth: merge.length,
    pass: o.pass || 1,
    pushed,
    popped,
  });

  const pass1Layers = (o = {}) => [
    inputLayer(tokens, o.at),
    opStackLayer(stk, { id: 'ops', title: '第一遍的运算符栈 S', name: 'S · 反向扫描时 ) 才是开始', topFocus: o.topFocus }),
    outLayer(rev, { title: 'rev[]（前缀的逆序）', name: `rev[${rev.length}]` }),
  ];
  const pass2Layers = (o = {}) => [
    inputLayer(tokens, null),
    outLayer(rev, { title: 'rev[]（从这串开始合并）', name: `rev[${rev.length}]` }),
    opStackLayer(merge.map((f) => f.join(' ')), {
      id: 'mrg', title: '合并栈 M（每格是拼好的后缀片段）', name: `M · 深度 ${merge.length}`, topFocus: o.topFocus,
    }),
    outLayer(merge.length ? merge[merge.length - 1] : [], { title: '输出序列（后缀）', name: 'postfix[]' }),
  ];

  const finish = (result, note) => {
    steps.push(step({
      event: 'done', lineId: 'end', done: true, result,
      note, vars: vars({ pass: 2 }),
      layers: [
        inputLayer(tokens, null),
        outLayer(rev, { title: 'rev[]（前缀的逆序）', name: `rev[${rev.length}]` }),
        outLayer(result.postfix, { title: result.error ? '输出序列（已算出的部分）' : '输出序列（后缀）', name: 'postfix[]' }),
      ],
    }));
    return trace({
      algorithmId: meta.id, variantId: 'v3', sourceVersion: 'infix-to-postfix-mirror-v1',
      lines: L, steps, result, meta: { pushed, popped },
    });
  };

  const fail = (code, note, lineId, layers) => {
    steps.push(step({
      event: 'error', lineId, note, vars: vars(),
      layers: layers || pass1Layers({ topFocus: true }),
    }));
    return finish({ postfix: [...rev], error: code }, `转换失败：${note}`);
  };

  steps.push(step({
    event: 'init', lineId: 'init',
    note: n === 0
      ? '空串：两遍扫描都没有词元。'
      : `这里换一个方向：从右往左扫，得到的序列 rev 是"前缀表达式的逆序"。第二遍再用一个栈把 rev 合并回后缀。注意 rev 不能直接拿来当后缀——它每个运算符的左右子树是反的，必须靠合并栈换回来。`,
    vars: vars(),
    layers: pass1Layers(),
  }));

  /* ---- 第一遍：右 → 左，产出 rev（= 前缀的逆序） ---- */
  for (let i = n - 1; i >= 0; i--) {
    const t = tokens[i];
    const scanLine = t.kind === ')' ? 'rparen' : t.kind === '(' ? 'lparen' : t.kind === 'op' ? 'op' : 'rscan';
    steps.push(step({
      event: 'token', lineId: scanLine,
      note: `逆序读到第 ${i} 个词元 ${t.text}（${kindName(t)}）：反向扫描时左右角色互换，')' 反倒成了"开始"，'(' 成了"结算"。`,
      vars: vars({ i, token: t.text }),
      layers: pass1Layers({ at: i }),
    }));

    if (t.kind === 'num') {
      rev.push(t.text);
      steps.push(step({
        event: 'operand-out', lineId: 'num',
        note: `${t.text} 是操作数：逆序输出它，于是 rev 里操作数的先后顺序是反的——后面合并时会被换回来。`,
        vars: vars({ i, token: t.text }),
        layers: pass1Layers({ at: i }),
      }));
      continue;
    }

    if (t.kind === 'bad') {
      return fail('bad-char', `词元 ${t.text} 既不是数字也不是运算符或括号。`, 'rscan');
    }

    if (t.kind === ')') {
      stk.push(')');
      pushed += 1;
      steps.push(step({
        event: 'paren-open', lineId: 'rparen',
        note: '反向扫描里 ) 是"一组的开始"，先入栈当作分隔符。',
        vars: vars({ i, token: t.text }),
        layers: pass1Layers({ at: i, topFocus: true }),
      }));
      continue;
    }

    if (t.kind === '(') {
      let closed = false;
      while (stk.length) {
        if (stk[stk.length - 1] === ')') { closed = true; break; }
        const top = stk.pop();
        popped += 1;
        rev.push(top);
        steps.push(step({
          event: 'pop-op', lineId: 'lparen-pop',
          note: `遇到 '(' 说明这一组要结算了：把栈顶 ${top} 弹进 rev。`,
          vars: vars({ i, token: t.text }),
          layers: pass1Layers({ at: i }),
        }));
      }
      if (!closed) {
        return fail('unbalanced-open', '反向扫到 ( 时栈里没有与它配对的 )，说明原式少写了一个右括号。', 'lparen');
      }
      stk.pop();
      popped += 1;
      steps.push(step({
        event: 'paren-close', lineId: 'lparen-close',
        note: '把配对的那个 ) 也弹掉：这一对括号在 rev 里已经完成使命。',
        vars: vars({ i, token: t.text }),
        layers: pass1Layers({ at: i }),
      }));
      continue;
    }

    // 运算符（反向栈里用"严格大于"就够了：左结合在镜面里反过来）
    while (stk.length) {
      const top = stk[stk.length - 1];
      if (top === ')') break;
      if (!(PREC[top] > PREC[t.text])) break;
      stk.pop();
      popped += 1;
      rev.push(top);
      steps.push(step({
        event: 'pop-op', lineId: 'rop-pop',
        note: `栈顶 ${top}（优先级 ${PREC[top]}）严格高于 ${t.text}（${PREC[t.text]}）→ 先出。这里只认"严格大于"，因为方向反了，同级运算符的先后也反过来了。`,
        vars: vars({ i, token: t.text }),
        layers: pass1Layers({ at: i }),
      }));
    }
    stk.push(t.text);
    pushed += 1;
    steps.push(step({
      event: 'push-op', lineId: 'rop-push',
      note: `${t.text} 入栈；它要等左边那些"不更急"的运算符处理完才轮到。`,
      vars: vars({ i, token: t.text }),
      layers: pass1Layers({ at: i, topFocus: true }),
    }));
  }

  while (stk.length) {
    const top = stk[stk.length - 1];
    if (top === ')') {
      return fail('unbalanced-close', '第一遍收尾时栈里还剩 )：原式多了一个右括号。', 'flush-pop');
    }
    stk.pop();
    popped += 1;
    rev.push(top);
    steps.push(step({
      event: 'pop-op', lineId: 'flush-out',
      note: `收尾：${top} 弹进 rev。到此 rev = [${rev.join(' ')}]，把它整体倒过来就是前缀表达式。`,
      vars: vars(),
      layers: pass1Layers({ topFocus: true }),
    }));
  }

  /* ---- 第二遍：把 rev 从左往右合并成后缀 ---- */
  steps.push(step({
    event: 'init', lineId: 'merge-init',
    note: `第一遍结束，rev = [${rev.join(' ')}]。它整体反转才是前缀；但"反转"的正确做法不是把列表倒过来（那会把每个运算符的左右子树一起换掉，算出错的结果），而是用合并栈按 rev 的顺序把片段拼起来。`,
    vars: vars({ pass: 2 }),
    layers: pass2Layers(),
  }));

  for (let j = 0; j < rev.length; j++) {
    const tok = rev[j];
    if (OP_CHARS.indexOf(tok) < 0) {
      merge.push([tok]);
      steps.push(step({
        event: 'operand-out', lineId: 'merge-num',
        note: `${tok} 压进合并栈，成为一段"已经成立的后缀片段"。`,
        vars: vars({ pass: 2 }),
        layers: pass2Layers({ topFocus: true }),
      }));
      continue;
    }
    if (merge.length < 2) {
      return fail('bad-expr', `合并时 ${tok} 需要两个操作数，但栈里只剩 ${merge.length} 个：rev 不是合法前缀的逆序。`, 'merge', pass2Layers());
    }
    const left = merge.pop();
    const right = merge.pop();
    const frag = [...left, ...right, tok];
    merge.push(frag);
    steps.push(step({
      event: 'pop-op', lineId: 'merge-op',
      note: `遇到 ${tok}：先弹出的 [${left.join(' ')}] 是左片段，后弹出的 [${right.join(' ')}] 是右片段，拼成 [${frag.join(' ')}] —— 顺序就是"左 右 运算符"，正是后缀的定义。`,
      vars: vars({ pass: 2 }),
      layers: pass2Layers(),
    }));
    steps.push(step({
      event: 'push-op', lineId: 'merge-op',
      note: `把拼好的片段 [${frag.join(' ')}] 压回合并栈。`,
      vars: vars({ pass: 2 }),
      layers: pass2Layers({ topFocus: true }),
    }));
  }

  if (merge.length > 1) {
    return fail('bad-expr', `合并结束时栈里有 ${merge.length} 段片段而不是 1 段：rev 没能拼成一个表达式。`, 'merge-op', pass2Layers());
  }

  const postfix = merge.length === 1 ? [...merge[0]] : [];
  return finish(
    { postfix, error: null },
    n === 0 ? '转换完成：空串对应空后缀。' : `转换完成：${postfix.join(' ')}（两遍扫描，压栈 ${pushed} 次、弹栈 ${popped} 次）。`,
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
