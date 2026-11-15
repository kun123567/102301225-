import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  PLUS_CASES, plusVariants, plusSamples, plusSampleText, plusParseText, buildPlusRun,
} from '../frontend/src/features/visualization/ext/plus-bridge.js';
import { createPlusSamples } from '../frontend/src/features/workbench/plus-samples.js';
import { plusStepVariables } from '../frontend/src/features/workbench/step-vars.js';
import { displaySourceLines } from '../frontend/src/features/workbench/display-source.js';

// 「填入示例」的数据来源：每个示例自带的 samples[]。
// 这份测试保证三件事，且对 54 个示例逐个验证，不做抽样：
//   1. 每个示例都有样例可填（没有样例 = 按钮点了没反应）；
//   2. 样例 → 文本 → 样例 往返不变（编辑框里看到的就是真正会跑的输入）；
//   3. 每份样例 × 每个变体都能跑出步骤（填进去的示例一定能出动画）。

const SAMPLES = [];
for (const item of PLUS_CASES) SAMPLES.push({ id: item.id, title: item.title, samples: await plusSamples(item.id) });

test('每个示例都有可填入的样例，且标签/文本非空', () => {
  assert.equal(SAMPLES.length, 54);
  for (const { id, samples } of SAMPLES) {
    assert.ok(samples.length >= 1, id + ' 没有样例');
    for (const sample of samples) {
      assert.equal(typeof sample.label, 'string', id + ' 样例缺少 label');
      assert.ok(sample.label.trim().length > 0, id + ' 样例 label 为空');
      assert.equal(typeof sample.text, 'string', id + ' 样例文本不是字符串');
      assert.ok(sample.input && typeof sample.input === 'object' && !Array.isArray(sample.input), id + ' 样例 input 不是对象');
    }
  }
});

test('样例文本按原样例形状往返，编辑框内容就是会跑的输入', () => {
  let checked = 0;
  for (const { id, samples } of SAMPLES) {
    for (const sample of samples) {
      const text = plusSampleText(sample.input);
      assert.equal(text, sample.text, id + ' 文本与样例不一致');
      assert.deepEqual(plusParseText(text, sample.input), sample.input, id + '/' + sample.id + ' 往返失败');
      checked++;
    }
  }
  assert.ok(checked >= 200, '样例总数偏少：' + checked);
});

test('单字段样例写成紧凑文本，结构型样例写成合法 JSON', () => {
  for (const { id, samples } of SAMPLES) {
    for (const sample of samples) {
      const keys = Object.keys(sample.input);
      const value = keys.length === 1 ? sample.input[keys[0]] : null;
      if (keys.length === 1 && typeof value === 'string') assert.ok(!sample.text.trim().startsWith('{'), id + ' 文本样例不该是 JSON');
      if (keys.length === 1 && Array.isArray(value) && value.every((n) => typeof n === 'number')) {
        assert.ok(!sample.text.trim().startsWith('{'), id + ' 数字数组样例应写成 "1, 2, 3"');
        assert.deepEqual(sample.text.trim() === '' ? [] : sample.text.split(',').map((n) => Number(n.trim())), value, id + ' 数组文本与样例不一致');
      }
      if (keys.length !== 1 || (keys.length === 1 && value && typeof value === 'object' && !Array.isArray(value))) {
        assert.doesNotThrow(() => JSON.parse(sample.text), id + ' 结构型样例文本不是合法 JSON');
      }
    }
  }
});

test('每份样例 × 每个变体都能跑出步骤', async () => {
  let combos = 0;
  for (const { id, samples } of SAMPLES) {
    const variants = plusVariants(id);
    assert.ok(variants.length >= 1 && variants.length <= 3, id + ' 变体数异常');
    for (const sample of samples) {
      const input = plusParseText(plusSampleText(sample.input), sample.input);
      for (const variant of variants) {
        const run = await buildPlusRun(id, variant.id, input);
        assert.ok(run.steps.length > 0, id + '/' + sample.id + '/' + variant.id + ' 没有步骤');
        assert.equal(run.plus, true);
        assert.equal(run.variantId, variant.id);
        assert.deepEqual(run.input, sample.input, id + ' 运行输入被替换');
        combos++;
      }
    }
  }
  assert.ok(combos >= 500, '覆盖组合偏少：' + combos);
});

test('非法文本给出中文提示，不静默跑错输入', () => {
  assert.throws(() => plusParseText('{"array":[1,2]', { array: [] }), /JSON/);
  assert.throws(() => plusParseText('1, x, 3', { array: [1, 2, 3] }), /数字/);
  assert.throws(() => plusParseText('[1,2,3]', { graph: {}, start: 'A' }), /JSON 对象/);
  assert.deepEqual(plusParseText('[3, 1]', { array: [] }), { array: [3, 1] });
  assert.deepEqual(plusParseText('([{}])', { text: '' }), { text: '([{}])' });
});

test('未知示例与未知变体立即报错，不会拿错样例', async () => {
  await assert.rejects(() => buildPlusRun('plus:no/such-case'), /没有这个示例/);
  await assert.rejects(() => buildPlusRun(PLUS_CASES[0].id, 'v9'), /没有这个变体/);
  await assert.rejects(() => plusSamples('plus:no/such-case'), /没有这个示例/);
});

/* --------------------------------------------------------------------------
 * 工作台接线（假 DOM）：attach / fill / read 这三个动作就是「填入示例 → 开始分析」
 * 在浏览器里真实走的路径，这里逐示例跑一遍，避免"数据对了但按钮没接上"。
 * ----------------------------------------------------------------------- */
class FakeEl {
  constructor(id) { this.id = id; this.value = ''; this.textContent = ''; this.title = ''; this.disabled = false; this.children = []; }
  replaceChildren(...kids) { this.children = kids; }
  get selectedOptions() { return this.children.filter((option) => option.value === this.value); }
}

function fakeDom() {
  const nodes = new Map();
  const doc = { createElement: () => ({ value: '', textContent: '', title: '' }) };
  const $ = (id) => {
    if (!nodes.has(id)) nodes.set(id, new FakeEl(id));
    return nodes.get(id);
  };
  const messages = [];
  return { $, doc, nodes, messages };
}

test('attach 后自动填入第 1 份样例，read 读回的正是这份样例', async () => {
  const dom = fakeDom();
  for (const id of ['plus-sample', 'plus-variant', 'plus-input', 'plus-help']) dom.$(id);
  const ui = createPlusSamples({ $: dom.$, doc: dom.doc, onMessage: (text, error) => dom.messages.push({ text, error }) });

  const samples = await plusSamples('plus:d/hash-linear-probing');
  await ui.attach('plus:d/hash-linear-probing');
  assert.equal(ui.samples().length, samples.length);
  assert.equal(dom.$('plus-sample').children.length, samples.length);
  assert.equal(dom.$('plus-variant').children.length, 3);
  assert.equal(dom.$('plus-variant').value, 'v1');
  assert.equal(dom.$('plus-input').value, samples[0].text);
  assert.deepEqual(ui.read(), { variant: 'v1', input: samples[0].input });
  assert.match(dom.$('plus-help').textContent, /第 1\//);

  // 换一份样例：文本、下拉、帮助、read() 一起跟着走
  ui.fill(3);
  assert.equal(dom.$('plus-input').value, samples[3].text);
  assert.equal(dom.$('plus-sample').value, '3');
  assert.match(dom.$('plus-help').textContent, /第 4\//);
  assert.deepEqual(ui.read().input, samples[3].input);

  // 换变体：只换 variantId，输入不变
  dom.$('plus-variant').value = 'v2';
  assert.deepEqual(ui.read(), { variant: 'v2', input: samples[3].input });
});

test('编辑框改成紧凑写法也能读回（数组/文本），坏文本给中文提示', async () => {
  const dom = fakeDom();
  const ui = createPlusSamples({ $: dom.$, doc: dom.doc });
  await ui.attach('plus:a/insertion-sort');
  dom.$('plus-input').value = '7, 11, 13';
  assert.deepEqual(ui.read().input, { array: [7, 11, 13] });
  dom.$('plus-input').value = '{"array":[3,2,1]}';
  assert.deepEqual(ui.read().input, { array: [3, 2, 1] });
  dom.$('plus-input').value = '{"array":[3,2,1';
  assert.throws(() => ui.read(), /JSON/);

  const dom2 = fakeDom();
  const ui2 = createPlusSamples({ $: dom2.$, doc: dom2.doc });
  await ui2.attach('plus:f/bracket-matching');
  dom2.$('plus-input').value = '(())';
  assert.deepEqual(ui2.read().input, { text: '(())' });
});

test('切走算法会作废未完成的载入，不会把上一个示例的样例填进来', async () => {
  const dom = fakeDom();
  const ui = createPlusSamples({ $: dom.$, doc: dom.doc });
  const first = ui.attach('plus:b/dijkstra');
  const second = ui.attach('plus:g/binary-search-tree');
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, [], '被作废的载入不应返回样例');
  assert.ok(b.length >= 3);
  assert.equal(ui.algorithm, 'plus:g/binary-search-tree');
  assert.deepEqual(ui.current().input, (await plusSamples('plus:g/binary-search-tree'))[0].input);
});

test('54 个示例逐个「attach → 填入 → read → 跑出步骤」全通', async () => {
  const dom = fakeDom();
  const ui = createPlusSamples({ $: dom.$, doc: dom.doc });
  let checked = 0;
  for (const item of PLUS_CASES) {
    await ui.attach(item.id);
    assert.ok(dom.$('plus-input').value.trim().length > 0 || ui.current().text === '', item.id + ' 填入示例后编辑框是空的');
    const { variant, input } = ui.read();
    const run = await buildPlusRun(item.id, variant, input);
    assert.ok(run.steps.length > 0, item.id + ' 填入示例后跑不出步骤');
    assert.equal(run.plusId, item.id);
    checked++;
  }
  assert.equal(checked, 54);
});

test('index.html 里确实有这三个控件（接线不会指向不存在的元素）', async () => {
  const html = await readFile(new URL('../frontend/index.html', import.meta.url), 'utf8');
  for (const id of ['plus-input-fields', 'plus-sample', 'plus-variant', 'plus-input', 'plus-help']) {
    assert.ok(html.includes('id="' + id + '"'), 'index.html 缺少 #' + id);
  }
});

/* --------------------------------------------------------------------------
 * 变量面板：54 个示例的每一步都要能落到 4 格里，不能出现 undefined。
 * （结构族的 step 只有 step.vars、没有 step.variables，面板必须两条路都认。）
 * ----------------------------------------------------------------------- */
test('54 个示例的每一步都能填满变量面板，且不出现 undefined', async () => {
  let steps = 0, structuralSteps = 0, arraySteps = 0, filledSteps = 0;
  for (const item of PLUS_CASES) {
    const samples = await plusSamples(item.id);
    let filledForItem = 0;
    for (const sample of samples) {
      const run = await buildPlusRun(item.id, 'v1', sample.input);
      for (const step of run.steps) {
        const panel = plusStepVariables(step, 4);
        assert.equal(panel.labels.length, 4, item.id + ' 标签数不是 4');
        assert.equal(panel.values.length, 4, item.id + ' 值数不是 4');
        for (const value of panel.values) {
          assert.notEqual(String(value), 'undefined', item.id + ' 面板出现 undefined');
          assert.notEqual(String(value), '[object Object]', item.id + ' 面板出现未格式化的对象');
        }
        for (const label of panel.labels) assert.ok(String(label).length > 0, item.id + ' 标签为空');
        if (panel.values.some((value) => String(value) !== '—')) { filledSteps++; filledForItem++; }
        steps++;
        if (step.vars) structuralSteps++; else if (step.variables) arraySteps++;
      }
    }
    // 个别 init/before 步骤变量全是 null（显示 "—" 是对的），但整个示例不能一格都填不上
    assert.ok(filledForItem > 0, item.id + ' 所有步骤的变量面板都是空的');
  }
  assert.ok(steps > 1000, '覆盖步数偏少：' + steps);
  assert.ok(filledSteps >= steps * 0.8, '变量面板大面积为空：' + filledSteps + '/' + steps);
  assert.ok(structuralSteps > 0 && arraySteps > 0, '两条变量来源都要覆盖到：结构 ' + structuralSteps + ' / 数组 ' + arraySteps);
});

test('plus 的中文说明不被当成 C 注释/字符串剥掉', () => {
  const note = '这就是"根先"：父节点一定早于左右孩子。';
  const plusRun = { algorithm: 'plus:g/binary-tree-preorder', plus: true, sourceLines: [{ lineId: 'visit', text: note }] };
  assert.equal(displaySourceLines(plusRun)[0].text, note);
  const cRun = { algorithm: 'binary-search', sourceLines: [{ lineId: 'cmp', text: 'if (a[mid] == target) // 命中' }] };
  assert.equal(displaySourceLines(cRun)[0].text, 'if (a[mid] == target)');
});

test('源码面板是真正的 C 代码（不是中文说明），且每一步都能对上源码行', async () => {
  for (const item of PLUS_CASES) {
    const run = await buildPlusRun(item.id, 'v1');
    assert.ok(run.sourceLines.length >= 5, item.id + ' 源码行太少：' + run.sourceLines.length);
    assert.ok(run.sourceLines.some((line) => /[;{}()]/.test(line.text)), item.id + ' 源码不像代码');
    const ids = new Set(run.sourceLines.map((line) => line.lineId));
    const missing = [...new Set(run.steps.map((step) => step.lineId))].filter((id) => !ids.has(id));
    assert.deepEqual(missing, [], item.id + ' 这些步骤的 lineId 在源码里找不到');
  }
});
