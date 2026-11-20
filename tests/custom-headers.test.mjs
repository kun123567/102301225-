import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { engineHealth, traceProgram } from '../backend/src/custom-code/detect-engine.js';

/**
 * 「自定义代码」允许用哪些库 —— 这张测试就是那份清单的可执行版本。
 *
 * 背景：third_party 里的 Open Watcom 头文件是**裁剪版**（原本只有 stdio/stdlib/limits），
 * 但 clib3r.lib / math387r.lib 里的函数符号是齐的。所以本项目补了 compat 垫片，
 * 把"能链接但没声明"的那些头补回来。
 *
 * 允许：stdio.h stdlib.h limits.h stdbool.h stdint.h string.h math.h ctype.h assert.h time.h
 *       （C++ 另有 cstdio cstdlib）
 * 不允许：iostream vector string algorithm queue stack map cstring cmath，以及
 *       stddef.h stdarg.h malloc.h float.h conio.h signal.h setjmp.h locale.h errno.h（未提供垫片）
 */

const requireCjs = createRequire(import.meta.url);
const ENGINE = '../backend/src/custom-code/source-engine/';
const { build, run } = requireCjs(ENGINE + 'server/compile.js');

const compilerReady = () => {
  try { return engineHealth().ok; } catch { return false; }
};

const ALLOWED_C = ['stdio.h', 'stdlib.h', 'limits.h', 'stdbool.h', 'stdint.h', 'string.h', 'math.h', 'ctype.h', 'assert.h', 'time.h'];
const ALLOWED_CPP = ['cstdio', 'cstdlib'];
/* 明确不可用（实测 E059/E1055）。注意 <string> 不在这个表里：
   Watcom 的 C++ 会把 <string> 解析到我们的 C 垫片 string.h，拿到的是 C 函数，**不是** std::string。 */
const NOT_AVAILABLE_C = ['iostream', 'vector', 'algorithm', 'queue', 'stack', 'map', 'cstring', 'cmath', 'stddef.h', 'stdarg.h', 'malloc.h', 'conio.h', 'errno.h'];
const NOT_AVAILABLE_STL = ['std::string', 'std::vector<int>', 'std::queue<int>', 'std::map<int,int>'];

async function buildOne(dir, name, source, lang = 'c') {
  return build({ workdir: path.join(dir, name), source, lang, exeName: 'm.exe', std: lang === 'c' ? 'c99' : undefined });
}

test('允许的头文件逐个可用（含 compat 垫片）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hdr-allowed-'));
  try {
    for (const header of ALLOWED_C) {
      const r = await buildOne(dir, 'h_' + header.replace(/\W/g, '_'), `#include <${header}>\nint main(void){ return 0; }\n`);
      assert.equal(r.ok, true, `<${header}> 不可用：` + String(r.log || '').split('\n').filter((l) => /Error/.test(l)).slice(0, 1).join(''));
    }
    for (const header of ALLOWED_CPP) {
      const r = await buildOne(dir, 'h_' + header, `#include <${header}>\nint main(){ return 0; }\n`, 'cpp');
      assert.equal(r.ok, true, `<${header}> 不可用：` + String(r.log || '').split('\n').filter((l) => /Error/.test(l)).slice(0, 1).join(''));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('允许的头文件可以一起用，并且真的能跑（string/math/ctype/assert/sizeof 常量）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hdr-together-'));
  try {
    const source = [
      '#include <stdio.h>', '#include <stdlib.h>', '#include <limits.h>', '#include <stdbool.h>', '#include <stdint.h>',
      '#include <string.h>', '#include <math.h>', '#include <ctype.h>', '#include <assert.h>', '#include <time.h>',
      'int main(void) {',
      '  char b[64]; int32_t n; bool ok;',
      '  strcpy(b, "abc");',
      '  strcat(b, "def");',
      '  n = (int32_t)strlen(b);',
      '  ok = (n == 6);',
      '  assert(ok);',
      '  printf("%s %d %d %d\\n", b, (int)n, (int)sqrt(9.0), toupper(\'a\'));',
      '  return 0;',
      '}',
    ].join('\n');
    const workdir = path.join(dir, 'together');
    const r = await build({ workdir, source, lang: 'c', exeName: 'm.exe', std: 'c99' });
    assert.equal(r.ok, true, String(r.log || '').split('\n').filter((l) => /Error/.test(l)).slice(0, 2).join(''));
    const ex = await run(r.exe, [], { cwd: workdir, timeoutMs: 5000 });
    assert.match(String(ex.out), /abcdef 6 3 65/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('不支持的头文件明确失败（边界要有据可查，不是靠猜）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hdr-denied-'));
  try {
    for (const header of NOT_AVAILABLE_C) {
      const lang = /^(iostream|vector|string|algorithm|queue|stack|map|cstring|cmath)$/.test(header) ? 'cpp' : 'c';
      const r = await buildOne(dir, 'd_' + header.replace(/\W/g, '_'), `#include <${header}>\nint main(void){ return 0; }\n`, lang);
      assert.equal(r.ok, false, `<${header}> 现在竟然可用了？请同步更新允许清单`);
      assert.match(String(r.log || ''), /unable to open|E059|E1055/, `<${header}> 的失败原因不是"找不到头文件"`);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('C++ 里 <string> 命中的是 C 垫片，不是 STL：C 函数能用，std::string/vector/queue/map 都不行', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'stl-denied-'));
  try {
    // C 字符串函数在 C++ 里必须能链接（这是 extern "C" 起作用的地方）
    const cstr = await buildOne(dir, 'cstr_ok', '#include <string.h>\nint main(){ return (int)strlen("abc"); }\n', 'cpp');
    assert.equal(cstr.ok, true, '<string.h> 在 C++ 下应可用：' + String(cstr.log || '').split('\n').filter((l) => /Error|undefined/.test(l)).slice(0, 1).join(''));

    for (const expr of NOT_AVAILABLE_STL) {
      const src = ['#include <string>', '#include <vector>', '#include <queue>', '#include <map>',
        `int main(){ ${expr.replace(/^(std::[\w]+)(<[^>]*>)?/, (m, type) => type + ' x;')} return 0; }`].join('\n');
      const r = await buildOne(dir, 'stl_' + expr.replace(/\W/g, '_'), src + '\n', 'cpp');
      assert.equal(r.ok, false, `${expr} 竟然可用了？说明 STL 已接入，请更新文档`);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('端到端：用 string.h + math.h + assert.h 的链表程序能插桩跟踪并折叠出层', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    '#include <stdlib.h>',
    '#include <string.h>',
    '#include <math.h>',
    '#include <assert.h>',
    'typedef struct Node { int key; struct Node *next; } Node;',
    'static Node *head = NULL;',
    'static void push(int k) {',
    '  Node *p = (Node*)malloc(sizeof(Node));',
    '  assert(p != NULL);',
    '  p->key = k;',
    '  p->next = head;',
    '  head = p;',
    '}',
    'int main(void) {',
    '  char buf[32];',
    '  int i;',
    '  for (i = 1; i <= 3; i++) push(i * (int)sqrt(4.0));',
    '  strcpy(buf, "nodes=");',
    '  printf("%s\\n", buf);',
    '  return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 4000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 240));
  assert.equal(trace.degradedMode, 'full');
  assert.ok(trace.steps > 5, '步数偏少：' + trace.steps);
  assert.ok(trace.layerRun && trace.layerRun.ok, '折叠失败：' + (trace.layerRun && trace.layerRun.error));
  assert.ok(trace.layerRun.families.includes('list'), '应折叠出链表：' + trace.layerRun.families.join(','));
  assert.match(String(trace.stdout), /nodes=/);
});
