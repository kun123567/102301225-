import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHarness, engineTraceToRun } from '../backend/src/custom-code/function-harness.js';
import { engineHealth } from '../backend/src/custom-code/detect-engine.js';
import { CodeRunError, runCustomCodeWithEngine } from '../backend/src/custom-code/runner.js';

// 步骤2：只写函数也能用引擎 —— 自动 main 夹具 + 引擎事件映射回 custom-array 的 steps。

const compilerReady = () => {
  try { return engineHealth().ok; } catch { return false; }
};

const BUBBLE = [
  'void sort(int a[], int n) {',
  '  int i, j, tmp;',
  '  for (i = 0; i < n - 1; i++) {',
  '    for (j = 0; j < n - 1 - i; j++) {',
  '      if (a[j] > a[j + 1]) {',
  '        tmp = a[j];',
  '        a[j] = a[j + 1];',
  '        a[j + 1] = tmp;',
  '      }',
  '    }',
  '  }',
  '}',
].join('\n');

test('夹具：识别入口函数、记住前导行数（行号才能换算回用户源码）', () => {
  const harness = buildHarness({ source: BUBBLE, array: [5, 1, 4, 2] });
  assert.equal(harness.ok, true, harness.error);
  assert.equal(harness.entry, 'sort');
  assert.equal(harness.arrayParam, 'a');
  assert.equal(harness.lenParam, 'n');
  assert.equal(harness.preludeLines, 4);
  assert.match(harness.code, /static int avc_input_data\[\] = \{5, 1, 4, 2\};/);
  assert.match(harness.code, /static int avc_input_len = 4;/);
  assert.match(harness.code, /sort\(avc_input_data, avc_input_len\);/);
  // 用户源码必须原样保留，行数不变
  assert.deepEqual(harness.sourceLines.length, BUBBLE.split('\n').length);
});

test('夹具：没有可调用入口时给出能照做的提示，而不是抛栈', () => {
  const bad = buildHarness({ source: 'int a[3];\nvoid f() { }', array: [1] });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /int a\[\], int n/);
  assert.equal(buildHarness({ source: '   ', array: [] }).ok, false);
});

test('事件映射：初始数组、按行归属、只统计真实变化、第一个变化元素进 index', () => {
  const harness = { preludeLines: 4, sourceLines: ['void f(int a[], int n) {', '  a[0] = 9;', '  a[1] = a[0];', '}'], arrayParam: 'a', entry: 'f' };
  const trace = {
    events: [
      ['S', 5],                 // → 用户第 1 行
      ['V', 5, 'a[0]', 'i', '1'],
      ['V', 5, 'a[1]', 'i', '2'],  // 与初值一致 → 不算写入
      ['S', 6],                 // → 用户第 2 行
      ['V', 6, 'a[0]', 'i', '9'],
      ['V', 6, 'a[1]', 'i', '2'],
      ['S', 7],                 // → 用户第 3 行
      ['V', 7, 'a[0]', 'i', '9'],
      ['V', 7, 'a[1]', 'i', '9'],
      ['S', 9],                 // 收尾（main）→ 不属于用户步骤
    ],
  };
  const run = engineTraceToRun({ trace, harness, initialArray: [1, 2] });
  assert.equal(run.ok, true, run.error);
  assert.deepEqual(run.steps.map((step) => step.lineId), ['1', '2', '3']);
  assert.deepEqual(run.steps[0].array, [1, 2], '第一步就是初始数组');
  assert.equal(run.steps[0].event, 'step');
  assert.deepEqual(run.steps[1].array, [9, 2]);
  assert.equal(run.steps[1].event, 'write');
  assert.equal(run.steps[1].variables.index, 0);
  assert.deepEqual(run.steps[2].array, [9, 9]);
  assert.equal(run.writes, 2, '只有 2 次真实变化');
  assert.equal(run.result[0], 9);
  assert.equal(run.steps.at(-1).done, true);
  assert.match(run.steps[1].description, /A\[0\] = 9/);
});

test('事件映射：没有任何变化时给"拆行"提示（不静默交付空回放）', () => {
  const harness = { preludeLines: 2, sourceLines: ['void f(int a[], int n) {', '}'], arrayParam: 'a', entry: 'f' };
  const run = engineTraceToRun({ trace: { events: [['S', 3]] }, harness, initialArray: [7] });
  assert.equal(run.ok, true);
  assert.equal(run.writes, 0);
  assert.match(run.notice, /拆成一行一句/);
});

test('事件映射：用户代码一行都没跑到时报错，不返回空 run', () => {
  const harness = { preludeLines: 2, sourceLines: ['void f(int a[], int n) {', '}'], arrayParam: 'a', entry: 'f' };
  const run = engineTraceToRun({ trace: { events: [['S', 1], ['S', 9]] }, harness, initialArray: [1] });
  assert.equal(run.ok, false);
  assert.match(run.error, /没在用户代码里记录到任何步骤/);
});

test('引擎链路端到端：函数体 → 真编译插桩 → custom-array steps（冒泡真的排好）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const run = await runCustomCodeWithEngine({ language: 'c', source: BUBBLE, array: [5, 1, 4, 2] });
  assert.equal(run.algorithm, 'custom-array');
  assert.equal(run.sourceVersion, 'local-engine-c-v1');
  assert.deepEqual(run.result, [1, 2, 4, 5], '最终数组必须有序');
  assert.ok(run.steps.length >= 15, '步数偏少：' + run.steps.length);
  assert.deepEqual(run.steps[0].array, [5, 1, 4, 2], '第一步是输入数组本身');
  assert.equal(run.steps[0].done, false);
  assert.equal(run.steps.at(-1).done, true);
  assert.ok(run.writes >= 3, '至少有几次真实写入：' + run.writes);
  // 每步都要能对上用户源码行：lineId 都是 "1".."12"
  for (const step of run.steps) {
    assert.ok(/^\d+$/.test(step.lineId), 'lineId 必须是行号：' + step.lineId);
    assert.ok(run.sourceLines.some((line) => line.lineId === step.lineId), 'lineId 不在源码行里：' + step.lineId);
    assert.equal(typeof step.variables.line, 'number');
    assert.ok(step.variables.index === null || (step.variables.index >= 0 && step.variables.index < step.array.length));
  }
  // 循环每轮都要出步：内层 for 那一行（第 4 行）出现次数远多于 1
  const innerLoopLine = run.steps.filter((step) => step.lineId === '4').length;
  assert.ok(innerLoopLine >= 3, '内层循环应每轮出步，实际 ' + innerLoopLine);
});

test('引擎链路：写法超出插桩支持时给出可行动的错误码', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  await assert.rejects(
    () => runCustomCodeWithEngine({ language: 'c', source: 'int main(void){return 0;}', array: [1, 2] }),
    (error) => error instanceof CodeRunError && error.code === 'HARNESS_FAILED' && /int a\[\], int n/.test(error.message),
  );
  await assert.rejects(
    () => runCustomCodeWithEngine({ language: 'c', source: BUBBLE, array: 'not-an-array' }),
    (error) => error instanceof CodeRunError && error.code === 'INVALID_INPUT',
  );
});

/* ---------------- 整程序误入极简翻译器的防护（用户实测过的坑） ---------------- */
import { isProgramSource, looksLikeFullSource } from '../frontend/src/features/custom-code/engine-program.js';

test('整程序判定：int main / void main / main( 都算，注释里的不算', () => {
  assert.equal(isProgramSource('#include <stdio.h>\nint main(void) { return 0; }'), true);
  assert.equal(isProgramSource('void main() { }'), true);
  assert.equal(isProgramSource('main() { }'), true);
  assert.equal(isProgramSource('// int main(void)\nvoid f(int a[], int n) { }'), false);
  assert.equal(isProgramSource('/* int main(void) */\nvoid f(int a[], int n) { }'), false);
});

test('完整源码判定：#include / struct / typedef / main 都算，纯函数体不算', () => {
  assert.equal(looksLikeFullSource('#include <stdio.h>\nint f(void){ return 0; }'), true);
  assert.equal(looksLikeFullSource('typedef struct Node { int k; } Node;'), true);
  assert.equal(looksLikeFullSource('int main(void){ return 0; }'), true);
  assert.equal(looksLikeFullSource('void sort(int a[], int n) {\n  int t = 0;\n}'), false);
});

test('极简模式收到整程序时，给出"该用整程序模式"的指引，而不是翻译器的字符错误', async () => {
  const { runCustomCode } = await import('../backend/src/custom-code/runner.js');
  const program = '#include <stdio.h>\nint main(void) { printf("hi\\n"); return 0; }';
  await assert.rejects(
    () => runCustomCode({ language: 'c', source: program, array: [1, 2] }),
    (error) => error instanceof CodeRunError && error.code === 'PROGRAM_MODE_REQUIRED' && /函数体/.test(error.message),
  );
  // 超长整程序也要先被判成"整程序"，而不是撞 5000 字符长度上限
  const longProgram = '#include <stdio.h>\nint main(void) {\n' + '  int x = 0;\n'.repeat(800) + '  return x;\n}';
  await assert.rejects(
    () => runCustomCode({ language: 'c', source: longProgram, array: [1, 2] }),
    (error) => error instanceof CodeRunError && error.code === 'PROGRAM_MODE_REQUIRED',
  );
  // 纯函数体不受这条防护影响：要么正常跑，要么是翻译器自己的错误，绝不能是 PROGRAM_MODE_REQUIRED
  try {
    const run = await runCustomCode({ language: 'c', source: 'void sort(int a[], int n) {\n  int t = 0;\n}', array: [1] });
    assert.ok(Array.isArray(run.steps) && run.steps.length > 0, '纯函数体应能跑出步骤');
  } catch (error) {
    assert.ok(error instanceof CodeRunError, '只允许 CodeRunError');
    assert.notEqual(error.code, 'PROGRAM_MODE_REQUIRED', '纯函数体不该被当成整程序');
  }
});
