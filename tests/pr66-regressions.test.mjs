/**
 * PR #66 复审报告（04/06/PR-66-完整复审报告.md §3）的复现，转成正式回归。
 * 每个用例都对应报告里的一条问题编号，注释写明"原程序该输出什么"。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { engineHealth, traceProgram } from '../backend/src/custom-code/detect-engine.js';
import { compilerAvailable, runCustomCodeWithEngine } from '../backend/src/custom-code/runner.js';
import { createEngineProgramRun } from '../frontend/src/features/custom-code/engine-program.js';
import { describeStep, describeTransition } from '../frontend/src/features/visualization/index.js';

const ready = () => engineHealth().ok;
const skip = !ready() && '本机没有 third_party 工具链';

const runC = (code, extra = {}) => traceProgram({ code, lang: 'c', maxSteps: 2000, withLayers: true, ...extra });

/* ---------------- §3.1 下标里的函数不能调用两次 ---------------- */
test('§3.1 下标表达式有副作用时：原程序输出不变（不插写入标记）', { skip }, async () => {
  const cases = [
    {
      name: '函数调用下标',
      code: ['#include <stdio.h>', 'int cursor = 0;', 'int nextIndex(void)', '{', '    return cursor++;', '}', 'int main(void)', '{', '    int a[4] = {0, 0, 0, 0};', '    a[nextIndex()] = 7;', '    printf("%d %d %d\\n", cursor, a[0], a[1]);', '    return 0;', '}'],
      want: '1 7 0',
    },
    {
      name: '宏展开成调用',
      code: ['#include <stdio.h>', 'int cursor = 0;', 'int nextIndex(void)', '{', '    return cursor++;', '}', '#define IDX nextIndex()', 'int main(void)', '{', '    int a[4] = {0, 0, 0, 0};', '    a[IDX] = 9;', '    printf("%d %d %d\\n", cursor, a[0], a[1]);', '    return 0;', '}'],
      want: '1 9 0',
    },
    {
      name: '二维函数调用下标',
      code: ['#include <stdio.h>', 'int row = 0;', 'int nextRow(void)', '{', '    return row++;', '}', 'int main(void)', '{', '    int g[3][3] = {{0,0,0},{0,0,0},{0,0,0}};', '    g[nextRow()][1] = 5;', '    printf("%d %d %d\\n", row, g[0][1], g[1][1]);', '    return 0;', '}'],
      want: '1 5 0',
    },
  ];
  for (const item of cases) {
    const trace = await runC(item.code.join('\n'));
    assert.equal(trace.ok, true, item.name + ' 应能跑：' + String(trace.log || '').slice(0, 160));
    assert.equal(String(trace.stdout).replace(/\r/g, '').trim(), item.want, item.name + ' 的输出必须和原程序一致');
    assert.equal(trace.events.filter((e) => e[0] === 'W').length, 0, item.name + '：有副作用的下标不该发写入标记');
  }
});

test('§3.1 无副作用的下标仍然发写入标记（否则未初始化判断会退化）', { skip }, async () => {
  const code = ['#include <stdio.h>', 'int main(void)', '{', '    int a[6] = {0,0,0,0,0,0};', '    int i = 2;', '    a[i + 1] = 7;', '    a[0] = 1;', '    printf("%d %d\\n", a[0], a[3]);', '    return 0;', '}'].join('\n');
  const trace = await runC(code);
  assert.ok(trace.events.filter((e) => e[0] === 'W').length >= 2, '纯表达式下标应保留写入标记');
});

/* ---------------- §3.2 数组之间不共享长度线索 ---------------- */
test('§3.2 不同长度数组各自完整；无关的 n 不再裁剪数组', { skip }, async () => {
  const two = ['#include <stdio.h>', 'int main(void)', '{', '    int a[2] = {1, 2};', '    int b[4] = {10, 20, 30, 40};', '    printf("%d %d %d\\n", a[1], b[2], b[3]);', '    return 0;', '}'].join('\n');
  const t1 = await runC(two);
  const layers1 = t1.layerRun.steps.at(-1).layers;
  assert.deepEqual(layers1.find((l) => l.id === 'arr:a').data.values, [1, 2]);
  assert.deepEqual(layers1.find((l) => l.id === 'arr:b').data.values, [10, 20, 30, 40], 'b 不能被 a 的长度裁掉');

  const unrelated = ['#include <stdio.h>', 'int main(void)', '{', '    int n = 1;', '    int a[4] = {1, 2, 3, 4};', '    printf("%d %d\\n", n, a[3]);', '    return 0;', '}'].join('\n');
  const t2 = await runC(unrelated);
  assert.deepEqual(t2.layerRun.steps.at(-1).layers.find((l) => l.id === 'arr:a').data.values, [1, 2, 3, 4], '无关的 n=1 不能把 a 裁成一格');

  /* 真正的栈（top 是 s[top] 的下标）仍要跟着 top 裁 */
  const stack = ['#include <stdio.h>', 'int main(void)', '{', '    int s[16];', '    int top = -1;', '    int i;', '    for (i = 1; i <= 3; i++) {', '        top = top + 1;', '        s[top] = i * 10;', '    }', '    printf("%d\\n", s[top]);', '    return 0;', '}'].join('\n');
  const t3 = await runC(stack);
  const layer3 = t3.layerRun.steps.at(-1).layers[0];
  const cells = layer3.data.values || (layer3.data.cells || []).map((c) => c.value);
  assert.deepEqual(cells, [10, 20, 30], '顺序栈仍要按 top 裁到 3 格');
});

/* ---------------- §3.3 库函数写入 ---------------- */
test('§3.3 scanf / memcpy / memset 的写入进入记录（格子是已知值，不是 ? ）', { skip }, async () => {
  const scanfCode = ['#include <stdio.h>', 'int main(void)', '{', '    int a[2];', '    scanf("%d %d", &a[0], &a[1]);', '    printf("%d %d\\n", a[0], a[1]);', '    return 0;', '}'].join('\n');
  const t1 = await runC(scanfCode, { stdin: '7 8' });
  const l1 = t1.layerRun.steps.at(-1).layers.find((l) => l.id === 'arr:a');
  assert.deepEqual(l1.data.values, [7, 8]);
  assert.deepEqual(l1.data.labels, ['7', '8'], 'scanf 写过的格子不能显示成 ?');

  const memcpyCode = ['#include <stdio.h>', '#include <string.h>', 'int main(void)', '{', '    int a[3];', '    int b[3] = {7, 8, 9};', '    memcpy(a, b, sizeof(a));', '    printf("%d %d %d\\n", a[0], a[1], a[2]);', '    return 0;', '}'].join('\n');
  const t2 = await runC(memcpyCode);
  const l2 = t2.layerRun.steps.at(-1).layers.find((l) => l.id === 'arr:a');
  assert.deepEqual(l2.data.values, [7, 8, 9]);
  assert.deepEqual(l2.data.labels, ['7', '8', '9']);

  const memsetCode = ['#include <stdio.h>', '#include <string.h>', 'int main(void)', '{', '    int a[3];', '    memset(a, 0, sizeof(a));', '    printf("%d %d %d\\n", a[0], a[1], a[2]);', '    return 0;', '}'].join('\n');
  const t3 = await runC(memsetCode);
  const l3 = t3.layerRun.steps.at(-1).layers.find((l) => l.id === 'arr:a');
  assert.deepEqual(l3.data.labels, ['0', '0', '0'], 'memset 之后不该还是未知');

  const scanMatrix = ['#include <stdio.h>', 'int main(void)', '{', '    int g[2][2];', '    scanf("%d", &g[0][0]);', '    printf("%d\\n", g[0][0]);', '    return 0;', '}'].join('\n');
  const t4 = await runC(scanMatrix, { stdin: '7' });
  const mat = t4.layerRun.steps.at(-1).layers.find((l) => l.style === 2);
  assert.equal(mat.data.values[0][0], 7, '矩阵里被 scanf 写过的那格要显示真实值');
});

/* ---------------- §3.4 全局 / 结构体数组的初始化 ---------------- */
test('§3.4 全局数组按 C 规则零初始化；结构体数组字段继承初始化信息', { skip }, async () => {
  const globalCode = ['#include <stdio.h>', 'int a[3];', 'int main(void)', '{', '    printf("%d %d %d\\n", a[0], a[1], a[2]);', '    return 0;', '}'].join('\n');
  const t1 = await runC(globalCode);
  const l1 = t1.layerRun.steps.at(-1).layers.find((l) => l.id === 'arr:a');
  assert.deepEqual(l1.data.labels, ['0', '0', '0'], '全局 int a[3] 是隐式零初始化，不该是 ?');

  const structCode = ['#include <stdio.h>', 'struct Item { int key; int id; };', 'int main(void)', '{', '    struct Item a[2] = {{7, 0}, {8, 1}};', '    printf("%d %d %d %d\\n", a[0].key, a[0].id, a[1].key, a[1].id);', '    return 0;', '}'].join('\n');
  const t2 = await runC(structCode);
  const layers = t2.layerRun.steps.at(-1).layers;
  const key = layers.find((l) => l.id === 'arr:a.key');
  const id = layers.find((l) => l.id === 'arr:a.id');
  assert.deepEqual(key.data.values, [7, 8], 'a.key 应显示 7,8');
  assert.deepEqual(id.data.values, [0, 1], 'a.id 应显示 0,1');
});

/* ---------------- §3.8 局部 static 数组 ---------------- */
test('§3.8 局部 static 数组能插桩运行，且零初始化', { skip }, async () => {
  const code = ['#include <stdio.h>', 'int main(void)', '{', '    static int a[3];', '    printf("%d %d %d\\n", a[0], a[1], a[2]);', '    return 0;', '}'].join('\n');
  const trace = await runC(code);
  assert.equal(trace.ok, true, 'static 数组不该让插桩整体失败：' + trace.stage);
  assert.equal(trace.degradedMode, 'full');
  assert.equal(String(trace.stdout).replace(/\r/g, '').trim(), '0 0 0');
  const layer = trace.layerRun.steps.at(-1).layers.find((l) => l.id === 'arr:a');
  assert.deepEqual(layer.data.labels, ['0', '0', '0'], 'static 数组是零初始化，不该是 ?');
});

/* ---------------- §3.6 截断不能当完成 ---------------- */
test('§3.6 整程序轨迹被截断：末步 done=false、result=null、有截断提示', { skip }, async () => {
  const code = ['#include <stdio.h>', 'int main(void)', '{', '    int a[2] = {0, 0};', '    int i;', '    for (i = 0; i < 100; i++) {', '        a[0] = i;', '    }', '    printf("%d\\n", a[0]);', '    return 0;', '}'].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 50, withLayers: true });
  assert.equal(trace.truncated, true, '这次运行应被标记为截断');
  const run = await createEngineProgramRun({ request: async () => ({ ok: true, degradedMode: trace.degradedMode, truncated: trace.truncated, layerRun: trace.layerRun }) })({ code, language: 'c' });
  assert.equal(run.truncated, true);
  assert.equal(run.steps.at(-1).done, false, '截断时末步不能标成完成');
  assert.equal(run.steps.at(-1).result, null, '截断时不能把中间数组当最终结果');
  assert.match(String(run.notice), /截断/, '要给用户看得见的截断提示：' + run.notice);
});

/* ---------------- §3.7 函数模式异常退出 ---------------- */
test('§3.7 函数模式 exit(7)：保留异常标志与退出码，末步不完成、result 为 null', { skip: !(await compilerAvailable('c')) && '本机没有工具链' }, async () => {
  const run = await runCustomCodeWithEngine({ language: 'c', source: ['void sort(int a[], int n)', '{', '    a[0] = 7;', '    exit(7);', '}'].join('\n'), array: [1, 2] });
  assert.equal(run.abnormalExit, true, '必须带 abnormalExit');
  assert.equal(run.exitCode, 7);
  assert.equal(run.steps.at(-1).done, false, '异常退出时末步不能标成完成');
  assert.equal(run.result, null, '异常退出时不能把中间数组当最终结果');
  assert.deepEqual(run.lastObserved, [7, 2], '最后观测状态要保留');
  assert.match(String(run.notice), /exit 7/, '要有可读说明');

  const ok = await runCustomCodeWithEngine({ language: 'c', source: ['void sort(int a[], int n)', '{', '    a[0] = 9;', '}'].join('\n'), array: [1, 2] });
  assert.deepEqual(ok.result, [9, 2], '正常结束仍要给出最终结果');
  assert.equal(ok.steps.at(-1).done, true);
  assert.notEqual(ok.abnormalExit, true);
});

/* ---------------- §3.9 自定义代码的解释文案 ---------------- */
test('§3.9 自定义代码的说明不套二分查找字段（不出现 undefined）', () => {
  const step = { algorithm: 'custom-engine', stepIndex: 0, lineId: '7', variables: { line: 7, index: 2, writes: null }, array: [1, 2, 3], layers: [] };
  const text = describeStep(step);
  assert.match(text, /第 7 行/);
  assert.doesNotMatch(text, /undefined/);
  const first = describeTransition(null, step);
  assert.doesNotMatch(first, /undefined/, '首步说明不能出现 undefined：' + first);
  const later = describeTransition(step, { ...step, stepIndex: 1 });
  assert.doesNotMatch(later, /undefined/);
});

/* ---------------- §3.5 多个数组 / 字符与未知标签 ---------------- */
test('§3.5 多个数组走多卡视图（不丢第二个数组），字符与未知标签随步传递', { skip }, async () => {
  const code = ['#include <stdio.h>', 'int main(void)', '{', '    int a[2] = {1, 2};', '    int b[3] = {7, 8, 9};', '    int i;', '    for (i = 0; i < 2; i++) {', '        a[i] = b[i];', '    }', '    printf("%d %d\\n", a[0], a[1]);', '    return 0;', '}'].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 500, withLayers: true });
  const run = await createEngineProgramRun({ request: async () => ({ ok: true, degradedMode: trace.degradedMode, layerRun: trace.layerRun }) })({ code, language: 'c' });
  assert.equal(run.structure, 'structure', '多数组必须走多卡视图（数组链路一次只能画一个）');
  const ids = new Set(run.steps.flatMap((s) => (s.layers || []).map((l) => l.id)));
  assert.ok(ids.has('arr:a') && ids.has('arr:b'), '两个数组层都要在：' + [...ids].join(','));

  /* 单数组 + 字符数组：标签要跟着步骤走到前端 */
  const charCode = ['#include <stdio.h>', 'int main(void)', '{', '    char word[3] = "hi";', '    word[0] = word[1];', '    printf("%c%c\\n", word[0], word[1]);', '    return 0;', '}'].join('\n');
  const t2 = await traceProgram({ code: charCode, lang: 'c', maxSteps: 500, withLayers: true });
  const run2 = await createEngineProgramRun({ request: async () => ({ ok: true, degradedMode: t2.degradedMode, layerRun: t2.layerRun }) })({ code: charCode, language: 'c' });
  const last = run2.steps.at(-1);
  assert.ok(Array.isArray(last.labels) && last.labels.length, '字符标签必须随步传递：' + JSON.stringify(last.labels));
  assert.ok(last.labels.includes('h') || last.labels.includes('i'), '标签应是字符而不是 ASCII 数字：' + JSON.stringify(last.labels));
});
