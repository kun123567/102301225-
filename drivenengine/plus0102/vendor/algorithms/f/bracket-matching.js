/**
 * F · 括号匹配（3 个代表性不同实现）
 *
 * 契约见 docs/04-轨迹契约.md：每步都是**完整快照**（layer 全部重建），
 * lineId 必须命中本变体自己的 sourceLines，末步 done=true 且 result 与 samples 的期望深比较一致。
 *
 * 三个变体的差别是真的差别，不是改名：
 *   v1 字符栈   —— 栈里只放括号字符，配对就是"右括号 == 栈顶"。报错只能报当前右括号的位置；
 *   v2 深度计数 —— 单类型括号根本不需要栈，一个计数器就够（所以栈层永远是空的）；
 *                  也正因为"只数个数、不记是谁"，它没法扩展到三类括号——`([)]` 会被它判成成功；
 *   v3 位置栈   —— 栈元素是 (字符, 下标)，报错时能指回"最近一个没有闭合的左括号"在原串的哪儿。
 *
 * result 统一为 { ok, error, index }，v3 额外给 openIndex：
 *   error: null（成功）| 'mismatch'（右括号和栈顶不是一对）
 *          | 'extra-close'（多余右括号）| 'leftover'（还有没闭合的左括号）
 *   index: 出错字符在输入串里的下标（'leftover' 时 v1/v2 给不出位置，填 -1）
 *   openIndex（仅 v3）: 相关的那个左括号下标
 */

import { trace, step, arrayLayer, stackLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'f/bracket-matching',
  variants: [
    { id: 'v1', name: '栈匹配三类括号' },
    { id: 'v2', name: '深度计数版（单类型）' },
    { id: 'v3', name: '栈 + 位置栈' },
  ],
};

const OPEN_CH = ['(', '[', '{'];
const CLOSE_CH = [')', ']', '}'];
const PAIR = { ')': '(', ']': '[', '}': '{' };
const isOpen = (c) => OPEN_CH.indexOf(c) >= 0;
const isClose = (c) => CLOSE_CH.indexOf(c) >= 0;

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'int match(char s[], int n) {' },
    { lineId: 'init', text: '  Stack S; initStack(&S);        /* 栈里只放左括号字符 */' },
    { lineId: 'scan', text: '  for (int i = 0; i < n; ++i) {' },
    { lineId: 'left', text: '    if (isOpen(s[i])) {' },
    { lineId: 'push', text: '      push(&S, s[i]);              /* 先记住，等它的右括号 */' },
    { lineId: 'right', text: '    } else if (isClose(s[i])) {' },
    { lineId: 'peek', text: '      if (isEmpty(&S)) return EXTRA_CLOSE;   /* 没有可以闭合的 */' },
    { lineId: 'pop', text: '      char t = pop(&S);            /* 栈顶 = 最近一个未闭合的左括号 */' },
    { lineId: 'cmp', text: '      if (!pair(t, s[i])) return MISMATCH;   /* 三类括号各自配对 */' },
    { lineId: 'scan-end', text: '  }' },
    { lineId: 'leftover', text: '  if (!isEmpty(&S)) return LEFTOVER;    /* 还有左括号没闭合 */' },
    { lineId: 'end', text: '  return OK;' },
  ],
  v2: [
    { lineId: 'fn', text: 'int depth_match(char s[]) {' },
    { lineId: 'init', text: '  int depth = 0;                 /* 单类型：一个计数器就够了 */' },
    { lineId: 'scan', text: '  for (int i = 0; s[i]; ++i) {' },
    { lineId: 'open', text: '    if (s[i] == \'(\') {' },
    { lineId: 'incr', text: '      ++depth;                    /* 深一层 */' },
    { lineId: 'close', text: '    } else if (s[i] == \')\') {' },
    { lineId: 'test', text: '      if (depth == 0) return EXTRA_CLOSE;' },
    { lineId: 'decr', text: '      --depth;                    /* 浅一层 */' },
    { lineId: 'skip', text: '    } else {' },
    { lineId: 'skip2', text: '      /* 别的字符它根本看不见：这就是无法扩展的地方 */' },
    { lineId: 'scan-end', text: '  }' },
    { lineId: 'leftover', text: '  if (depth > 0) return LEFTOVER;      /* 还有 depth 层没闭合 */' },
    { lineId: 'end', text: '  return OK;' },
  ],
  v3: [
    { lineId: 'fn', text: 'int match_pos(char s[], int n) {' },
    { lineId: 'init', text: '  Stack S; initStack(&S);        /* 每格 = (括号字符, 原串下标) */' },
    { lineId: 'scan', text: '  for (int i = 0; i < n; ++i) {' },
    { lineId: 'left', text: '    if (isOpen(s[i])) {' },
    { lineId: 'push', text: '      push(&S, (Item){ s[i], i }); /* 连"它在哪儿"一起记下 */' },
    { lineId: 'right', text: '    } else if (isClose(s[i])) {' },
    { lineId: 'empty', text: '      if (isEmpty(&S)) return EXTRA_CLOSE;' },
    { lineId: 'pop', text: '      Item it = pop(&S);' },
    { lineId: 'match', text: '      if (!pair(it.ch, s[i])) { bad = i; open = it.pos; return MISMATCH; }' },
    { lineId: 'scan-end', text: '  }' },
    { lineId: 'leftover', text: '  if (!isEmpty(&S)) { open = topPos(&S); return LEFTOVER; }' },
    { lineId: 'end', text: '  return OK;' },
  ],
};

/* ------------------------------------------------------------------ 样例 */

export const samples = [
  {
    id: 'normal',
    label: '([{}]) —— 三类括号嵌套，全部配对成功',
    input: { text: '([{}])' },
    expect: { ok: true, error: null, index: -1 },
  },
  {
    id: 'normal-round',
    label: '(()) —— 纯圆括号串（v2 计数器的主场）',
    input: { text: '(())' },
    expect: { ok: true, error: null, index: -1 },
  },
  {
    id: 'edge-mismatch',
    label: '([)] —— 下标 2 的 ) 撞上栈顶 [：错配（v2 会误判成成功）',
    input: { text: '([)]' },
    expect: { ok: false, error: 'mismatch', index: 2 },
    expectByVariant: {
      v1: { ok: false, error: 'mismatch', index: 2 },
      v2: { ok: true, error: null, index: -1 },
      v3: { ok: false, error: 'mismatch', index: 2, openIndex: 1 },
    },
  },
  {
    id: 'edge-type-mismatch',
    label: '(] —— 圆括号还没闭合就来了方括号',
    input: { text: '(]' },
    expect: { ok: false, error: 'mismatch', index: 1 },
    expectByVariant: {
      v1: { ok: false, error: 'mismatch', index: 1 },
      v2: { ok: false, error: 'leftover', index: -1 },
      v3: { ok: false, error: 'mismatch', index: 1, openIndex: 0 },
    },
  },
  {
    id: 'edge-extra-close',
    label: '()) —— 多出来一个右括号（三个变体结论一致）',
    input: { text: '())' },
    expect: { ok: false, error: 'extra-close', index: 2 },
  },
  {
    id: 'edge-leftover',
    label: '([ —— 扫描完还剩两个左括号没闭合',
    input: { text: '([' },
    expect: { ok: false, error: 'leftover', index: -1 },
    expectByVariant: {
      v1: { ok: false, error: 'leftover', index: -1 },
      v2: { ok: false, error: 'leftover', index: -1 },
      v3: { ok: false, error: 'leftover', index: 1, openIndex: 1 },
    },
  },
  {
    id: 'empty',
    label: '"" —— 空串（没有括号，视为匹配成功）',
    input: { text: '' },
    expect: { ok: true, error: null, index: -1 },
  },
];

/* ------------------------------------------------------------------ 公用图层 */

/** 已扫描过的下标 [0, k) */
function before(k) {
  const out = [];
  for (let t = 0; t < k; t++) out.push(t);
  return out;
}

/** style 1：输入串本身（当前下标用 i 指针 + 红框，已扫过的格子转绿） */
function textLayerOf(text, o = {}) {
  const src = [...text];
  const at = o.at == null ? null : o.at;
  return arrayLayer({
    id: 'text',
    title: '输入串 s[]',
    name: `char s[] = "${text}"`,
    values: src,
    labels: src,
    roles: {
      focus1: at == null ? [] : [at],
      done: (o.done || []).slice(),
      pointers: at == null ? [] : [{ id: 'i', label: 'i', index: at }],
    },
  });
}

/** style 7：栈。cells 由调用方给（v1 放字符，v3 放"字符 + 位置"） */
function stackLayerOf(o = {}) {
  const cells = (o.cells || []).map((c) => ({ value: c.value, label: c.label }));
  return stackLayer({
    id: 'stk',
    title: o.title || '栈 S',
    name: o.name || 'S',
    cells,
    top: cells.length - 1,
    capacity: o.capacity || 8,
    bottomLabel: 'bottom（栈底）',
    topLabel: 'top',
    roles: { focus1: o.focusTop && cells.length ? [cells.length - 1] : [] },
  });
}

/* ------------------------------------------------------------------ 变体 1（字符栈） */

function runV1(input) {
  const text = input.text == null ? '' : String(input.text);
  const src = [...text];
  const n = src.length;
  const L = LINES.v1;
  const steps = [];
  const stk = [];        // v1 的栈：只有字符
  let pushed = 0;
  let popped = 0;

  const snap = (o = {}) => [
    textLayerOf(text, { at: o.at, done: o.done || [] }),
    stackLayerOf({
      title: '左括号栈 S',
      name: 'S · 每格只有一个括号字符',
      cells: stk.map((c, k) => ({ value: c, label: `#${k}` })),
      capacity: Math.max(4, n),
      focusTop: !!o.topFocus,
    }),
  ];

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: n === 0
      ? '空串：一个字符都不用扫，栈自然是空的。'
      : `共 ${n} 个字符。规则只有一条：右括号必须和「栈顶那个左括号」是同一类型的一对。注意 v1 的栈里只有字符，没记位置。`,
    vars: { n, i: null, depth: 0, pushed: 0, popped: 0 },
    layers: snap(),
  }));

  const finish = (result, note) => {
    steps.push(step({
      event: 'done',
      lineId: 'end',
      done: true,
      result,
      note,
      vars: { n, i: null, depth: stk.length, pushed, popped },
      layers: snap({ done: before(n) }),
    }));
    return trace({
      algorithmId: meta.id,
      variantId: 'v1',
      sourceVersion: 'bracket-matching-charstack-v1',
      lines: L,
      steps,
      result,
      meta: { pushed, popped },
    });
  };

  for (let i = 0; i < n; i++) {
    const c = src[i];
    steps.push(step({
      event: 'scan',
      lineId: 'scan',
      note: isOpen(c)
        ? `读到 s[${i}] = ${c}：它是左括号，还没有被闭合，得先留在栈里等它的右括号。`
        : isClose(c)
          ? `读到 s[${i}] = ${c}：它是右括号，去栈顶找"是不是同一类型的一对"。`
          : `读到 s[${i}] = ${c}：不是括号，跳过（不影响栈）。`,
      vars: { n, i, depth: stk.length, pushed, popped },
      layers: snap({ at: i, done: before(i) }),
    }));

    if (isOpen(c)) {
      stk.push(c);
      pushed += 1;
      steps.push(step({
        event: 'push',
        lineId: 'push',
        note: `把 ${c} 压栈：它现在是"最近一个还没闭合的左括号"，下一个碰到的右括号必须和它配。`,
        vars: { n, i, depth: stk.length, pushed, popped },
        layers: snap({ at: i, done: before(i), topFocus: true }),
      }));
      continue;
    }
    if (!isClose(c)) continue;

    if (stk.length === 0) {
      steps.push(step({
        event: 'extra-close',
        lineId: 'peek',
        note: `栈已经空了，${c} 找不到可以闭合的左括号——多余的右括号，位置就在下标 ${i}。`,
        vars: { n, i, depth: 0, pushed, popped },
        layers: snap({ at: i, done: before(i) }),
      }));
      return finish(
        { ok: false, error: 'extra-close', index: i },
        `匹配失败：下标 ${i} 的 ${c} 是多余的右括号。`,
      );
    }

    const topCh = stk[stk.length - 1];
    const want = PAIR[c];
    if (topCh !== want) {
      steps.push(step({
        event: 'mismatch',
        lineId: 'cmp',
        note: `栈顶是 ${topCh}，而 ${c} 需要的是 ${want}：不是一对。错配位置在下标 ${i}的${c}，它想闭合的是下标靠前的 ${topCh}。`,
        vars: { n, i, depth: stk.length, pushed, popped },
        layers: snap({ at: i, done: before(i), topFocus: true }),
      }));
      return finish(
        { ok: false, error: 'mismatch', index: i },
        `匹配失败：下标 ${i} 的 ${c} 与栈顶的 ${topCh} 不配对。`,
      );
    }

    stk.pop();
    popped += 1;
    steps.push(step({
      event: 'match-pop',
      lineId: 'pop',
      note: `栈顶 ${topCh} 正好和 ${c} 是一对，弹栈——这一对消掉了，栈顶退回上一层。`,
      vars: { n, i, depth: stk.length, pushed, popped },
      layers: snap({ at: i, done: before(i) }),
    }));
  }

  if (stk.length > 0) {
    steps.push(step({
      event: 'leftover',
      lineId: 'leftover',
      note: `扫描结束，栈里还剩 ${stk.length} 个没闭合的左括号：${stk.join(' ')}。v1 的栈只存字符，只能报"还剩几个"，报不出它们在原串的哪个位置。`,
      vars: { n, i: null, depth: stk.length, pushed, popped },
      layers: snap({ done: before(n), topFocus: true }),
    }));
    return finish(
      { ok: false, error: 'leftover', index: -1 },
      `匹配失败：还有 ${stk.length} 个左括号没有闭合（v1 无法给出位置）。`,
    );
  }

  steps.push(step({
    event: 'ok',
    lineId: 'scan-end',
    note: n === 0
      ? '没有字符，也没有括号要配对：按惯例空串视为匹配成功。'
      : '扫描结束、栈也空了：每个左括号都在正确的层次上被同类型的右括号闭合。',
    vars: { n, i: null, depth: 0, pushed, popped },
    layers: snap({ done: before(n) }),
  }));
  return finish(
    { ok: true, error: null, index: -1 },
    n === 0 ? '匹配成功：空串。' : `匹配成功：${text} 的三类括号全部配对（压栈 ${pushed} 次、弹栈 ${popped} 次）。`,
  );
}

/* ------------------------------------------------------------------ 变体 2（深度计数，单类型） */

function runV2(input) {
  const text = input.text == null ? '' : String(input.text);
  const src = [...text];
  const n = src.length;
  const L = LINES.v2;
  const steps = [];
  let depth = 0;
  let opened = 0;
  let closed = 0;
  let skipped = 0;

  // v2 真的不用栈：栈层故意保持空，把 depth 写在图层名上做对照
  const snap = (o = {}) => [
    textLayerOf(text, { at: o.at, done: o.done || [] }),
    stackLayerOf({
      title: '这里本该是栈——单类型不需要它',
      name: `S 恒为空 · 计数器 depth = ${depth}（跳过 ${skipped} 个非圆括号字符）`,
      cells: [],
      capacity: Math.max(4, n),
    }),
  ];

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: n === 0
      ? '空串：depth 保持 0。'
      : `共 ${n} 个字符。只有一种括号时，"有没有闭合"等价于"深度回到 0 没有"，所以一个计数器 depth 就够，栈是多余的。`,
    vars: { n, i: null, depth: 0, opened: 0, closed: 0, skipped: 0 },
    layers: snap(),
  }));

  const finish = (result, note) => {
    steps.push(step({
      event: 'done',
      lineId: 'end',
      done: true,
      result,
      note,
      vars: { n, i: null, depth, opened, closed, skipped },
      layers: snap({ done: before(n) }),
    }));
    return trace({
      algorithmId: meta.id,
      variantId: 'v2',
      sourceVersion: 'bracket-matching-depth-v1',
      lines: L,
      steps,
      result,
      meta: { opened, closed, skipped },
    });
  };

  for (let i = 0; i < n; i++) {
    const c = src[i];
    if (c === '(') {
      steps.push(step({
        event: 'scan',
        lineId: 'scan',
        note: `读到 s[${i}] = ( ：它是圆括号，计数器管得着。`,
        vars: { n, i, depth, opened, closed, skipped },
        layers: snap({ at: i, done: before(i) }),
      }));
      const old = depth;
      depth += 1;
      opened += 1;
      steps.push(step({
        event: 'push',
        lineId: 'incr',
        note: `depth ${old} → ${depth}：又多了一层没有闭合的圆括号。注意这里没有压栈，只是把"欠了几个 ")" 记在计数器里。`,
        vars: { n, i, depth, opened, closed, skipped },
        layers: snap({ at: i, done: before(i) }),
      }));
      continue;
    }
    if (c === ')') {
      steps.push(step({
        event: 'scan',
        lineId: 'close',
        note: `读到 s[${i}] = ) ：它是圆括号的右半边，要看 depth 是否已经到 0。`,
        vars: { n, i, depth, opened, closed, skipped },
        layers: snap({ at: i, done: before(i) }),
      }));
      if (depth === 0) {
        steps.push(step({
          event: 'extra-close',
          lineId: 'test',
          note: `depth 已经是 0，这个 ) 没有对应的 ( —— 多余右括号，下标 ${i}。`,
          vars: { n, i, depth, opened, closed, skipped },
          layers: snap({ at: i, done: before(i) }),
        }));
        return finish(
          { ok: false, error: 'extra-close', index: i },
          `匹配失败：下标 ${i} 的 ) 是多余的右括号。`,
        );
      }
      const old = depth;
      depth -= 1;
      closed += 1;
      steps.push(step({
        event: 'match-pop',
        lineId: 'decr',
        note: `depth ${old} → ${depth}：闭合了一层。计数器只知道"少欠一个"，并不知道闭合的是哪一个 ( —— 这就是它和栈的差距。`,
        vars: { n, i, depth, opened, closed, skipped },
        layers: snap({ at: i, done: before(i) }),
      }));
      continue;
    }
    skipped += 1;
    steps.push(step({
      event: 'scan',
      lineId: 'skip',
      note: `s[${i}] = ${c}：计数器只认 ( 和 )，这个字符被直接跳过——它连"这里有个方括号"都不知道，所以 ([)] 这种错配它也发现不了。`,
      vars: { n, i, depth, opened, closed, skipped },
      layers: snap({ at: i, done: before(i) }),
    }));
  }

  if (depth > 0) {
    steps.push(step({
      event: 'leftover',
      lineId: 'leftover',
      note: `扫描结束，depth = ${depth}：还有 ${depth} 层圆括号没闭合。计数器只知道"欠 ${depth} 个 )"，不知道它们分别在哪个下标。`,
      vars: { n, i: null, depth, opened, closed, skipped },
      layers: snap({ done: before(n) }),
    }));
    return finish(
      { ok: false, error: 'leftover', index: -1 },
      `匹配失败：还有 ${depth} 层圆括号没有闭合（计数器给不出位置）。`,
    );
  }

  steps.push(step({
    event: 'ok',
    lineId: 'scan-end',
    note: skipped === 0
      ? '扫描结束，depth 正好回到 0：圆括号全部闭合。'
      : `扫描结束，depth 回到 0：圆括号都闭合了。但被它跳过的 ${skipped} 个非圆括号字符根本没有参与判断——换个括号类型这套逻辑就不成立了。`,
    vars: { n, i: null, depth, opened, closed, skipped },
    layers: snap({ done: before(n) }),
  }));
  return finish(
    { ok: true, error: null, index: -1 },
    n === 0 ? '匹配成功：空串。' : `匹配成功：圆括号层数回到 0（开了 ${opened} 层、关了 ${closed} 层，跳过 ${skipped} 个字符）。`,
  );
}

/* ------------------------------------------------------------------ 变体 3（栈 + 位置栈） */

function runV3(input) {
  const text = input.text == null ? '' : String(input.text);
  const src = [...text];
  const n = src.length;
  const L = LINES.v3;
  const steps = [];
  const stk = [];        // v3 的栈：{ ch, pos }
  let pushed = 0;
  let popped = 0;

  const snap = (o = {}) => [
    textLayerOf(text, { at: o.at, done: o.done || [] }),
    stackLayerOf({
      title: '左括号栈 S（字符 + 位置）',
      name: 'S · 每格左边是它在原串里的下标',
      cells: stk.map((it) => ({ value: it.ch, label: `@${it.pos}` })),
      capacity: Math.max(4, n),
      focusTop: !!o.topFocus,
    }),
  ];

  steps.push(step({
    event: 'init',
    lineId: 'init',
    note: n === 0
      ? '空串：栈是空的，等下也没有位置可报。'
      : `共 ${n} 个字符。和 v1 唯一的区别：栈里每个元素都带着自己在原串的下标，所以出问题时能精确指回"是哪个左括号没闭合"。`,
    vars: { n, i: null, depth: 0, pushed: 0, popped: 0 },
    layers: snap(),
  }));

  const finish = (result, note) => {
    steps.push(step({
      event: 'done',
      lineId: 'end',
      done: true,
      result,
      note,
      vars: { n, i: null, depth: stk.length, pushed, popped },
      layers: snap({ done: before(n) }),
    }));
    return trace({
      algorithmId: meta.id,
      variantId: 'v3',
      sourceVersion: 'bracket-matching-posstack-v1',
      lines: L,
      steps,
      result,
      meta: { pushed, popped },
    });
  };

  for (let i = 0; i < n; i++) {
    const c = src[i];
    steps.push(step({
      event: 'scan',
      lineId: 'scan',
      note: isOpen(c)
        ? `读到 s[${i}] = ${c}：左括号，除了字符本身，还要把它"站在下标 ${i}"这件事一起记下来。`
        : isClose(c)
          ? `读到 s[${i}] = ${c}：去栈顶核对类型；如果错了，栈顶那一格上的 @下标 就是"没闭合的左括号在哪"。`
          : `读到 s[${i}] = ${c}：不是括号，跳过。`,
      vars: { n, i, depth: stk.length, pushed, popped },
      layers: snap({ at: i, done: before(i) }),
    }));

    if (isOpen(c)) {
      stk.push({ ch: c, pos: i });
      pushed += 1;
      steps.push(step({
        event: 'push',
        lineId: 'push',
        note: `压入 (${c}, ${i})：格子左边写着 @${i}，表示这个 ${c} 来自原串下标 ${i}。位置信息就是这样被"随身携带"的。`,
        vars: { n, i, depth: stk.length, pushed, popped },
        layers: snap({ at: i, done: before(i), topFocus: true }),
      }));
      continue;
    }
    if (!isClose(c)) continue;

    if (stk.length === 0) {
      steps.push(step({
        event: 'extra-close',
        lineId: 'empty',
        note: `栈空：${c} 没有任何左括号可以闭合——多余右括号，位置在下标 ${i}。`,
        vars: { n, i, depth: 0, pushed, popped },
        layers: snap({ at: i, done: before(i) }),
      }));
      return finish(
        { ok: false, error: 'extra-close', index: i, openIndex: -1 },
        `匹配失败：下标 ${i} 的 ${c} 是多余的右括号。`,
      );
    }

    const top = stk[stk.length - 1];
    const want = PAIR[c];
    if (top.ch !== want) {
      steps.push(step({
        event: 'mismatch',
        lineId: 'match',
        note: `栈顶是 (@${top.pos}) ${top.ch}，而 ${c} 需要 ${want}：错配。于是一次报出两个位置——右括号在下标 ${i}，它想闭合的左括号在下标 ${top.pos}。`,
        vars: { n, i, depth: stk.length, pushed, popped },
        layers: snap({ at: i, done: before(i), topFocus: true }),
      }));
      return finish(
        { ok: false, error: 'mismatch', index: i, openIndex: top.pos },
        `匹配失败：下标 ${i} 的 ${c} 不配对；它所对应的左括号 ${top.ch} 在下标 ${top.pos}。`,
      );
    }

    stk.pop();
    popped += 1;
    steps.push(step({
      event: 'match-pop',
      lineId: 'pop',
      note: `弹出 (@${top.pos}) ${top.ch}——它和下标 ${i} 的 ${c} 配成一对，两个位置一起销账。`,
      vars: { n, i, depth: stk.length, pushed, popped },
      layers: snap({ at: i, done: before(i) }),
    }));
  }

  if (stk.length > 0) {
    const top = stk[stk.length - 1];
    steps.push(step({
      event: 'leftover',
      lineId: 'leftover',
      note: `扫描结束，栈里还剩 ${stk.length} 个未闭合左括号；栈顶是 (@${top.pos}) ${top.ch}，这就是"最近一个没有闭合的左括号"的精确位置。`,
      vars: { n, i: null, depth: stk.length, pushed, popped },
      layers: snap({ done: before(n), topFocus: true }),
    }));
    return finish(
      { ok: false, error: 'leftover', index: top.pos, openIndex: top.pos },
      `匹配失败：下标 ${top.pos} 的 ${top.ch} 没有闭合（栈里共剩 ${stk.length} 个）。`,
    );
  }

  steps.push(step({
    event: 'ok',
    lineId: 'scan-end',
    note: n === 0
      ? '空串：没有括号，也没有位置要报，按惯例视为匹配成功。'
      : '扫描结束、栈也空了：每个左括号都被同类型的右括号在对的层次上闭合。',
    vars: { n, i: null, depth: 0, pushed, popped },
    layers: snap({ done: before(n) }),
  }));
  return finish(
    { ok: true, error: null, index: -1, openIndex: -1 },
    n === 0 ? '匹配成功：空串。' : `匹配成功：${text} 三类括号全部配对（压栈 ${pushed} 次、弹栈 ${popped} 次）。`,
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
