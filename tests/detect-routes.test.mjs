/**
 * 复审报告的问题 2/3 回归测试（不需要起完整服务端，直接调处理函数）：
 *   ① 合法 JSON `null` / 数组 / 标量 → 必须 400，不能"静默结束不响应"
 *   ② 程序 exit(7) → stage 不再是 ok，带 abnormalExit，轨迹仍保留
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleDetect, handleDetectTrace } from '../backend/src/routes/detect.js';
import { engineHealth, traceProgram } from '../backend/src/custom-code/detect-engine.js';

const LOCAL_REQ = {
  url: '/api/detect',
  method: 'POST',
  headers: { host: '127.0.0.1:3101' },
  socket: { localAddress: '127.0.0.1', remoteAddress: '127.0.0.1' },
};

/** 收集 json() 的回调：记录状态码与 body */
function recorder() {
  const calls = [];
  const json = (response, status, body) => { calls.push({ status, body }); return { status, body }; };
  return { calls, json };
}

for (const bad of ['null', '[]', '"just a string"', '42', 'true']) {
  test(`请求体是合法 JSON 但不是对象（${bad}）→ 明确回 400，不能没有响应`, () => {
    for (const handler of [handleDetect, handleDetectTrace]) {
      const rec = recorder();
      const ret = handler(LOCAL_REQ, {}, bad, rec.json);
      if (ret && typeof ret.then === 'function') ret.then(() => {});
      assert.equal(rec.calls.length, 1, handler.name + ' 必须恰好回一次响应（不能静默返回）');
      assert.equal(rec.calls[0].status, 400, handler.name + ' 应回 400');
      assert.equal(rec.calls[0].body.error.code, 'INVALID_INPUT');
      assert.match(rec.calls[0].body.error.message, /\{\"code\"|null|数组|string|number|boolean/);
    }
  });
}

test('请求体不是合法 JSON → 400（原有行为保持不变）', () => {
  const rec = recorder();
  handleDetect(LOCAL_REQ, {}, '{oops', rec.json);
  assert.equal(rec.calls.length, 1);
  assert.equal(rec.calls[0].status, 400);
});

test('程序以非 0 状态退出（exit 7）：stage 不是 ok，轨迹仍保留并说明原因', { skip: !engineHealth().ok && '本机没有 third_party 工具链' }, async () => {
  const code = [
    '#include <stdio.h>',
    '#include <stdlib.h>',
    'int main(void)',
    '{',
    '    int a[3] = {1, 2, 3};',
    '    printf("%d\\n", a[0]);',
    '    exit(7);',
    '    return 0;',
    '}',
  ].join('\n');
  const trace = await traceProgram({ code, lang: 'c', maxSteps: 500, withLayers: true });
  assert.equal(trace.ok, true, '轨迹本身仍然可用');
  assert.equal(trace.exitCode, 7);
  assert.equal(trace.abnormalExit, true, '必须标出异常退出');
  assert.notEqual(trace.stage, 'ok', 'stage 不能还是 ok：' + trace.stage);
  assert.match(String(trace.exitNote), /exit 7|非 0/, '要有可读说明：' + trace.exitNote);
  assert.ok(trace.steps > 0, '退出前的轨迹应保留：' + trace.steps);
});

test('正常结束（return 0）不标异常', { skip: !engineHealth().ok && '本机没有 third_party 工具链' }, async () => {
  const trace = await traceProgram({ code: 'int main(void)\n{\n    return 0;\n}', lang: 'c', maxSteps: 100 });
  assert.equal(trace.ok, true);
  assert.equal(trace.exitCode, 0);
  assert.equal(trace.abnormalExit, false);
  assert.equal(trace.stage, 'ok');
});
