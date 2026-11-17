/**
 * routes/detect.js -- 「自动识别」的两个接口
 *
 *   GET  /api/detect/health   工具链与目录是否就绪（识别不需要编译器，跟踪需要）
 *   POST /api/detect          只有代码 → 静态识别（毫秒级，不起进程）
 *   POST /api/detect/trace    整程序 → 真编译 + 插桩 + 运行，返回真实执行事件
 *
 * 三个接口都只在**本机**工作台可用（与 custom-array 同一把锁），不接受跨站请求。
 */

import { acceptsLocalCode } from '../custom-code/runner.js';
import { dataStructures, detectStatic, engineHealth, traceProgram } from '../custom-code/detect-engine.js';

function localOnly(request, response, json) {
  if (acceptsLocalCode(request)) return false;
  json(response, 403, { error: { code: 'LOCAL_ONLY', message: '请从本机工作台使用自动识别。' } });
  return true;
}

/** 解析请求体：非法 JSON、以及**合法但不是对象**（`null` / `[]` / `"x"` / `3`）都明确回 400。
 *  以前 JSON.parse('null') 成功返回 null，调用方 `if (!body) return;` 就悄悄结束了 ——
 *  客户端等到超时也收不到任何响应（审计报告里的"空请求一直没有响应"）。 */
function parseBody(raw, response, json) {
  let body;
  try { body = JSON.parse(raw); }
  catch {
    json(response, 400, { error: { code: 'INVALID_INPUT', message: '请求体不是合法 JSON。' } });
    return null;
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    json(response, 400, {
      error: {
        code: 'INVALID_INPUT',
        message: '请求体必须是 JSON 对象（形如 {"code":"…"}）' + (body === null ? '，收到的是 null。' : '，收到的是 ' + (Array.isArray(body) ? '数组' : typeof body) + '。'),
      },
    });
    return null;
  }
  return body;
}

export function handleDetectHealth(request, response, json) {
  if (localOnly(request, response, json)) return;
  const health = engineHealth();
  return json(response, 200, {
    ok: health.ok,
    toolchain: health,
    catalog: { count: dataStructures().length, items: dataStructures() },
  });
}

export function handleDetect(request, response, raw, json) {
  if (localOnly(request, response, json)) return;
  const body = parseBody(raw, response, json);
  if (!body) return;
  try {
    const result = detectStatic(body.code);
    return json(response, 200, result);
  } catch (error) {
    return json(response, 400, { error: { code: 'DETECT_FAILED', message: error.message } });
  }
}

/* 允许的头文件（与 tests/custom-headers.test.mjs 保持一致）——编译失败时直接告诉用户能用什么 */
const ALLOWED_HEADERS = 'stdio.h / stdlib.h / limits.h / string.h / math.h / ctype.h / assert.h / time.h / stdbool.h / stdint.h（C++ 另有 cstdio、cstdlib；STL 不可用）';

/* 常见 STL 头缺失 → 给出本地能用的写法（比"编译失败"有用得多） */
const STL_HINTS = {
  vector: '用定长数组 `T name[N]`（或 `malloc`）代替 vector<T>，长度自己用变量记',
  string: '用 `const char*` + `#include <string.h>` 里的 strlen/strcpy/strcmp 代替 string',
  queue: '用数组 + front/rear 两个下标自己写队列（前端会把它画成队列视图）',
  stack: '用数组 + top 下标自己写栈（前端会把它画成栈视图）',
  map: '用两个平行数组（键数组 + 值数组）或线性查找代替 map',
  iostream: '用 `#include <stdio.h>` 的 printf/scanf 代替 iostream',
  algorithm: '排序自己写（插入/冒泡/快排都可以），`sort` 不提供',
  cstring: '改成 `#include <string.h>`（C 版本可用）',
  cmath: '改成 `#include <math.h>`（C 版本可用）',
};

/**
 * 把 traceProgram 的失败结果翻成一句人话（带行号）。
 * 之前 422 只回 `{ok:false, stage, log, diags}`，前端只认 `error.message`，
 * 于是用户在页面上只看到"请求失败（422）"，看不到真正的编译错误。
 */
export function describeTraceFailure(result) {
  const stage = result && result.stage;
  const diags = (result && result.diags) || [];
  const first = diags.find((d) => d && d.sev === 'error') || diags[0];
  if (stage === 'compile' && first) {
    const head = first.line ? '第 ' + first.line + ' 行：' : '';
    const missing = /unable to open '([^']+)'/i.exec(String(first.message || ''));
    if (missing) {
      const header = missing[1];
      const base = String(header).replace(/\.h$/, '');
      const hint = STL_HINTS[header] || STL_HINTS[base] || '';
      return head + first.message
        + '　—— 本地工具链没有这个头文件：' + header + '。'
        + (hint ? hint + '。' : '')
        + '可用：' + ALLOWED_HEADERS;
    }
    const cppAsC = /misspelled data type near '(class|namespace|template|bool)'|'class' has not been declared|unexpected token.*class/i.test(String(first.message || ''));
    if (cppAsC) {
      return head + first.message + '　—— 这段代码是 C++，本地已尝试按 C++ 重编；若仍失败，请检查是否用了 STL（vector/string/map…）。';
    }
    return head + String(first.message || '编译失败。');
  }
  if (stage === 'instrument') {
    const raw = String(result.log || '').trim();
    return raw || '插桩版本编译失败：这段代码用了插桩暂不支持的写法（可先看静态识别结果）。';
  }
  if (stage === 'toolchain') return String(result.log || '未找到本机工具链。');
  const lines = String((result && result.log) || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2);
  return lines.join(' ') || '编译失败。';
}

function failureCode(stage) {
  if (stage === 'instrument') return 'INSTRUMENT_FAILED';
  if (stage === 'toolchain') return 'COMPILER_UNAVAILABLE';
  if (stage === 'link') return 'LINK_ERROR';
  return 'COMPILE_ERROR';
}

export async function handleDetectTrace(request, response, raw, json) {
  if (localOnly(request, response, json)) return;
  const body = parseBody(raw, response, json);
  if (!body) return;
  try {
    const result = await traceProgram({
      code: body.code,
      lang: body.language ?? body.lang ?? 'c',
      maxSteps: body.maxSteps,
      stdin: body.stdin,
      withLayers: Boolean(body.withLayers),
    });
    if (result.ok) return json(response, 200, result);
    /* 失败也要把细节带回去：错误消息给 UI，diags/log 留给控制台与测试 */
    return json(response, 422, {
      ...result,
      error: { code: failureCode(result.stage), message: describeTraceFailure(result) },
    });
  } catch (error) {
    return json(response, 400, { error: { code: 'TRACE_FAILED', message: error.message } });
  }
}
