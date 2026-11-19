import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dataStructures, detectStatic, engineHealth, traceProgram,
} from '../backend/src/custom-code/detect-engine.js';

// 「自动识别」= base 的识别器 + 本仓库 third_party 里的 Open Watcom。
// 这里逐条验证：静态识别（不编译）与整程序插桩跟踪（真编译）都能用，且不误报注释。

const compilerReady = () => {
  try { return engineHealth().ok; } catch { return false; }
};

test('识别器就绪：26 项目录 + 本仓库 third_party 工具链', () => {
  const health = engineHealth();
  assert.ok(health.cc && /bwcc386\.exe$/i.test(health.cc), '找不到 C 编译器：' + health.cc);
  assert.ok(health.linker && /wcl386\.exe$/i.test(health.linker), '找不到链接器：' + health.linker);
  const catalog = dataStructures();
  assert.equal(catalog.length, 26, '数据结构目录应为 26 项');
  for (const item of catalog) assert.ok(item.id && item.name, '目录项缺少 id/名称');
});

test('D1 硬用例：typedef 指针别名 / STL 队列 / 嵌套模板 / 结构体二叉树', () => {
  const cases = [
    ['typedef struct Node *LinkList;\nLinkList head;', 'ast'],
    ['#include <queue>\nusing namespace std;\nqueue<int> q;', 'ast'],
    ['vector<vector<pair<int, int>>> g;', 'ast'],
    ['struct T { int key; struct T *left, *right; };', 'ast'],
  ];
  for (const [code, expectSource] of cases) {
    const result = detectStatic(code);
    assert.ok(result.count >= 1, '没识别出来：' + code);
    assert.ok(result.items.some((it) => it.source === expectSource), '应至少有一条来自 ' + expectSource + '：' + JSON.stringify(result.items));
    for (const item of result.items) {
      assert.ok(item.templateId, '缺 templateId');
      assert.ok(typeof item.conf === 'number' && item.conf > 0 && item.conf <= 1, '置信度越界');
    }
  }
});

test('注释里的声明不误报，纯基本变量不瞎报', () => {
  assert.equal(detectStatic('// vector<int> g[N]\nint x = 1;').count, 0);
  assert.equal(detectStatic('/* queue<int> q; */\nint a = 2;').count, 0);
  assert.equal(detectStatic('int main(void) { int i = 0; return i; }').count, 0);
});

test('用户那段 BFS 代码：邻接表 + 队列 + 标记数组都在 AST 通道里', () => {
  const bfs = [
    '#include <vector>', '#include <queue>', 'using namespace std;',
    'const int N = 100;', 'vector<int> g[N];', 'bool vis[N];', 'queue<int> q;',
    'int main() { q.push(1); vis[1] = true; return 0; }',
  ].join('\n');
  const result = detectStatic(bfs);
  const names = result.items.map((it) => it.name).join(',');
  assert.ok(result.count >= 3, '识别项偏少：' + names);
  assert.ok(result.items.every((it) => it.source === 'ast'), '这段代码应该走声明表：' + names);
  assert.ok(!result.items.some((it) => /^(int|char|bool|double|float)$/i.test(it.name)), '类型词不该当结构名：' + names);
});

test('静态识别有输入护栏：超长代码直接拒绝', () => {
  assert.throws(() => detectStatic('x'.repeat(20001)), /过长/);
});

test('整程序：真编译 + 插桩 + 运行，拿到真实事件与结构声明', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    '#include <stdlib.h>',
    'typedef struct Node { int key; struct Node *next; } Node;',
    'static Node *head = NULL;',
    'static void push_front(int k) {',
    '  Node *p = (Node*)malloc(sizeof(Node));',
    '  p->key = k; p->next = head; head = p;',
    '}',
    'int main(void) {',
    '  int i; Node *q;',
    '  for (i = 1; i <= 4; i++) push_front(i * 10);',
    '  q = head;',
    '  while (q) { printf("%d ", q->key); q = q->next; }',
    '  printf("\\n");',
    '  return 0;',
    '}',
  ].join('\n');
  const result = await traceProgram({ code, lang: 'c', maxSteps: 4000 });
  assert.equal(result.ok, true, '跟踪失败：' + (result.log || '').slice(0, 200));
  assert.ok(result.steps > 5, '步数偏少：' + result.steps);
  assert.ok(result.events.length > 20, '事件偏少：' + result.events.length);
  const kinds = new Set(result.events.map((event) => event[0]));
  assert.ok(kinds.has('S'), '缺少 S（行）事件');
  assert.ok(kinds.has('L') || kinds.has('LE'), '缺少链表结点事件（L/LE）');
  assert.equal(result.degradedMode, 'full', '应该是完整插桩，不该降级：' + result.degradedMode);
  const node = (result.structure?.structs || []).find((item) => item.tag === 'Node');
  assert.ok(node, '没解析出 Node 结构体');
  assert.equal(node.shape, 'list', 'Node 应判为 list');
  assert.ok(node.fields.some((field) => field.name === 'next' && field.self), 'next 应标为自引用');
  assert.match(String(result.stdout), /40 30 20 10/);
});

test('整程序：C99 写法（循环内声明）也能跑，编译器报告要带行号', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const c99 = [
    '#include <stdio.h>',
    'int main(void) {',
    '  int sum = 0;',
    '  for (int i = 1; i <= 3; i++) sum += i;',
    '  printf("%d\\n", sum);',
    '  return 0;',
    '}',
  ].join('\n');
  const ok = await traceProgram({ code: c99, lang: 'c', maxSteps: 500 });
  assert.equal(ok.ok, true, 'C99 写法应能编译：' + String(ok.log || '').slice(0, 200));
  assert.match(String(ok.stdout), /6/);

  const bad = await traceProgram({ code: 'int main(void) { return missing_symbol; }', lang: 'c' });
  assert.equal(bad.ok, false);
  assert.equal(bad.stage, 'compile');
  assert.ok(Array.isArray(bad.diags) && bad.diags.length > 0, '编译失败要给出诊断');
  assert.ok(bad.diags.some((diag) => Number.isInteger(diag.line) && diag.line > 0), '诊断要带行号');
});

/* ---------------- 步骤1：循环体插桩（每轮都出步） ---------------- */

import { createRequire } from 'node:module';
const requireCjs = createRequire(import.meta.url);
const { markLoopCondition } = requireCjs('../backend/src/custom-code/source-engine/server/instrument.js');

test('循环条件改写：for / while / do-while 尾巴都能打点，switch 与跨行头不动', () => {
  assert.equal(markLoopCondition('  for (i=0;i<3;i++) a[i]=i*i;', 5), '  for (i=0; (__avc_t(5), (i<3)); i++) a[i]=i*i;');
  assert.equal(markLoopCondition('  while (i < n);', 9), '  while ((__avc_t(9), (i < n)));');
  assert.equal(markLoopCondition('  for (int i = 0; i < n; i++) {', 3), '  for (int i = 0; (__avc_t(3), (i < n));  i++) {');
  assert.equal(markLoopCondition('  for (;;) {', 4), '  for (; (__avc_t(4), (1)); ) {');
  for (const line of ['  switch (x) {', '  do {', '  for (i = 0;', '  int x = 1;', '  while (a[i]) p++;']) {
    if (!/^(\s*)while/.test(line)) assert.equal(markLoopCondition(line, 1), null, line);
  }
  assert.equal(markLoopCondition('  while (a[i]) p++;', 2), '  while ((__avc_t(2), (a[i]))) p++;');
});

test('循环体：单语句 for 每轮出步（3 轮 → 至少 3 次行事件）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    'int main(void){',
    '  int i;',
    '  int a[3];',
    '  for (i=0;i<3;i++) a[i]=i*i;',
    '  printf("%d %d %d\\n", a[0],a[1],a[2]);',
    '  return 0;',
    '}',
  ].join('\n');
  const result = await traceProgram({ code, lang: 'c', maxSteps: 2000 });
  assert.equal(result.ok, true, String(result.log || '').slice(0, 200));
  const loopLine = result.events.filter((event) => event[0] === 'S' && event[1] === 5).length;
  assert.ok(loopLine >= 3, '第 5 行的 for 应该每轮出步，实际只出现 ' + loopLine + ' 次');
  assert.match(String(result.stdout), /0 1 4/, '结果不能因为插桩而变样');
});

test('循环体：花括号 while 的条件与循环体都按轮重复，do-while 的尾巴也打点', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const braced = [
    '#include <stdio.h>',
    'int main(void){',
    '  int i = 0, sum = 0;',
    '  while (i < 4) {',
    '    sum += i;',
    '    i++;',
    '  }',
    '  printf("%d\\n", sum);',
    '  return 0;',
    '}',
  ].join('\n');
  const a = await traceProgram({ code: braced, lang: 'c', maxSteps: 2000 });
  assert.equal(a.ok, true, String(a.log || '').slice(0, 200));
  const cond = a.events.filter((event) => event[0] === 'S' && event[1] === 4).length;
  const body = a.events.filter((event) => event[0] === 'S' && event[1] === 5).length;
  assert.ok(cond >= 4, 'while 条件应每轮打点：' + cond);
  assert.ok(body >= 4, '循环体应每轮出步：' + body);
  assert.match(String(a.stdout), /^6\b/, '求和结果必须是 6');

  const dountil = [
    '#include <stdio.h>',
    'int main(void){',
    '  int i = 0;',
    '  do {',
    '    i++;',
    '  } while (i < 3);',
    '  printf("%d\\n", i);',
    '  return 0;',
    '}',
  ].join('\n');
  const b = await traceProgram({ code: dountil, lang: 'c', maxSteps: 2000 });
  assert.equal(b.ok, true, String(b.log || '').slice(0, 200));
  const tail = b.events.filter((event) => event[0] === 'S' && event[1] === 5).length;
  assert.ok(tail >= 2, 'do-while 的 while 尾巴应重复打点：' + tail);
  assert.match(String(b.stdout), /^3\b/);
});

/* ---------------- 「是不是栈/队列」：后端识别必须给结论 ---------------- */
test('后端识别：数组条目一律给出栈/队列/普通数组的结论（含否定结论）', () => {
  const stack = detectStatic(['int main(void) {', '  int s[8];', '  int top = -1;', '  top = top + 1;', '  s[top] = 3;', '  return s[top];', '}'].join('\n'));
  assert.equal(stack.count, 1, '同名条目应去重：' + JSON.stringify(stack.items.map((i) => i.name)));
  assert.equal(stack.items[0].role.kind, 'stack');
  assert.match(stack.items[0].role.zh, /栈/);
  assert.match(stack.items[0].role.direction, /LIFO|末尾/);
  assert.ok(stack.items[0].role.confidence >= 0.8);
  assert.deepEqual(stack.summary.stacks, ['s']);

  const queue = detectStatic(['int main(void) {', '  int q[8];', '  int front = 0, rear = 0;', '  q[rear] = 7;', '  rear = (rear + 1) % 8;', '  return q[front];', '}'].join('\n'));
  assert.equal(queue.items[0].role.kind, 'queue');
  assert.match(queue.items[0].role.zh, /队列/);
  assert.match(queue.items[0].role.direction, /FIFO|队头/);
  assert.deepEqual(queue.summary.queues, ['q']);

  const plain = detectStatic(['int main(void) {', '  int a[4];', '  int i;', '  for (i = 0; i < 4; i++) {', '    a[i] = i;', '  }', '  return a[3];', '}'].join('\n'));
  assert.equal(plain.items[0].role.kind, 'array', '没有游标就是普通数组');
  assert.match(plain.items[0].role.zh, /普通数组/);
  assert.equal(plain.items[0].role.direction, '');
  assert.deepEqual(plain.summary.arrays, ['a']);
});

test('后端识别：接雨水这类"只把中间结果放数组"的代码，逐个数组都给"普通数组"结论', () => {
  const code = [
    'int trap(int height[], int n) {',
    '  int leftMax[32], rightMax[32], ans = 0, i;',
    '  leftMax[0] = height[0];',
    '  for (i = 1; i < n; ++i) {',
    '    leftMax[i] = leftMax[i - 1];',
    '  }',
    '  return ans;',
    '}',
  ].join('\n');
  const result = detectStatic(code);
  assert.ok(result.count >= 2, '至少识别出 leftMax/rightMax：' + result.count);
  for (const item of result.items) {
    assert.equal(item.role.kind, 'array', item.name + ' 不该被判成栈/队列');
    assert.match(item.role.zh, /普通数组/);
  }
  assert.equal(result.summary.stacks.length + result.summary.queues.length, 0);
});

test('后端识别：链表/树这类非数组结构不会被说成"普通数组"', () => {
  const code = [
    'typedef struct QNode { int d; struct QNode *next; } QNode;',
    'typedef struct { QNode *front, *rear; } LinkQueue;',
    'int main(void) {',
    '  LinkQueue q;',
    '  q.front = 0;',
    '  return 0;',
    '}',
  ].join('\n');
  const result = detectStatic(code);
  const node = result.items.find((item) => item.name === 'QNode');
  assert.ok(node, '应识别出 QNode：' + JSON.stringify(result.items.map((i) => i.name)));
  assert.equal(node.role.kind, 'structure', '结点结构不能被说成普通数组');
  const queueItem = result.items.find((item) => item.templateId === 'linkqueue');
  assert.ok(queueItem, '应识别出链队列');
  assert.equal(queueItem.role.kind, 'queue');
  assert.match(queueItem.role.zh, /链队列/);
});

test('同名条目去重：留结论更具体的那条（栈 > 结构 > 普通数组）', () => {
  const stack = detectStatic(['int main(void) {', '  int s[8];', '  int top = -1;', '  s[top] = 1;', '  return 0;', '}'].join('\n'));
  assert.equal(stack.count, 1);
  assert.equal(stack.found >= stack.count, true);
  assert.equal(stack.items[0].templateId, 'sqstack', '应保留顺序栈模板那条');
});

/* ---------------- 422 要说人话（之前页面只显示"请求失败（422）"） ---------------- */
test('编译失败的消息：带行号、缺头文件时给替代写法与可用库清单', async () => {
  const { describeTraceFailure } = await import('../backend/src/routes/detect.js');

  const missingHeader = describeTraceFailure({
    ok: false,
    stage: 'compile',
    diags: [{ sev: 'error', line: 1, message: "col(17) unable to open 'vector'" }],
    log: '',
  });
  assert.match(missingHeader, /第 1 行/);
  assert.match(missingHeader, /vector/);
  assert.match(missingHeader, /定长数组|malloc/, '缺失 STL 头时要给能照做的替代写法：' + missingHeader);
  assert.match(missingHeader, /可用：stdio\.h/, '要列出本机可用的头文件');

  const syntax = describeTraceFailure({ ok: false, stage: 'compile', diags: [{ sev: 'error', line: 7, message: 'Missing operand' }] });
  assert.equal(syntax, '第 7 行：Missing operand');

  const instrument = describeTraceFailure({ ok: false, stage: 'instrument', log: '插桩版本编译失败：XXX', diags: [] });
  assert.match(instrument, /插桩/);

  const toolchain = describeTraceFailure({ ok: false, stage: 'toolchain', log: '未找到本机工具链。' });
  assert.match(toolchain, /工具链/);

  const fallback = describeTraceFailure({ ok: false, stage: 'link', log: 'wlink: undefined symbol _foo\n第二行', diags: [] });
  assert.match(fallback, /wlink/);
});

test('整程序编译失败时，结果里既有 error.message 也有人能读的诊断行号', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const bad = await traceProgram({ code: 'int main(void) {\n  int x = ;\n  return 0;\n}', lang: 'c' });
  assert.equal(bad.ok, false);
  assert.equal(bad.stage, 'compile');
  assert.ok(bad.diags.length > 0, '必须有诊断');
  assert.ok(bad.diags.some((d) => Number.isInteger(d.line) && d.line > 0), '诊断要带行号：' + JSON.stringify(bad.diags.slice(0, 2)));
  const { describeTraceFailure } = await import('../backend/src/routes/detect.js');
  const msg = describeTraceFailure(bad);
  assert.match(msg, /第 2 行/, '消息里要出现出错行号：' + msg);
});
