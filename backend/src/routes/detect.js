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

function parseBody(raw, response, json) {
  try { return JSON.parse(raw); }
  catch {
    json(response, 400, { error: { code: 'INVALID_INPUT', message: '请求体不是合法 JSON。' } });
    return null;
  }
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
    return json(response, result.ok ? 200 : 422, result);
  } catch (error) {
    return json(response, 400, { error: { code: 'TRACE_FAILED', message: error.message } });
  }
}
