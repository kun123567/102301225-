/**
 * engine-program.js -- 整程序模式的接线（从 app.js 抽出来，便于 headless 验证）
 *
 * 流程：用户代码 → `POST /api/detect/trace`（真编译 + 插桩 + 折叠 layers）
 *      → 组装成**与 plus 示例同形**的 run（`plus:true` / `structure:'structure'` / `rawSteps[].layers`）
 *      → 交给 `createPlusView` 渲染，完全不碰 Step v1 schema。
 *
 * 为什么要抽出来：这段是浏览器里最容易断的一环（行号映射、done 标记、字段名），
 * 抽成纯函数 + 注入 request 就能在 node 里逐条断言。
 */

/**
 * 这段代码是不是"整程序"（含 main）？
 *
 * 判定放宽到常见写法：`int main(`、`void main(`、`main (`（K&R 风格）。
 * 只出现在注释里的不算 —— 先去掉注释再判，避免把示例注释当成 entry。
 */
export function isProgramSource(code) {
  const text = String(code ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  return /(^|\n)\s*(?:(?:int|void)\s+)?main\s*\(/.test(text);
}

/** 这段代码看起来是"完整 C/C++ 源码"（带预处理/结构体定义），极简翻译器吃不下 */
export function looksLikeFullSource(code) {
  const text = String(code ?? '');
  return /^\s*#\s*(?:include|define)\b/m.test(text) || /\b(?:typedef|struct|class)\b/.test(text) || isProgramSource(text);
}

/**
 * @param {{request:Function, now?:Function}} deps request(path, {body, signal})
 * @returns {(input:{code:string, language?:string, signal?:AbortSignal}) => Promise<object>}
 */
export function createEngineProgramRun({ request, now = () => Date.now() } = {}) {
  if (typeof request !== 'function') throw new Error('createEngineProgramRun 需要 request(path, opts)');

  return async function runEngineProgram({ code, language = 'c', signal } = {}) {
    const data = await request('/api/detect/trace', {
      body: { code, language, maxSteps: 4000, withLayers: true },
      signal,
    });
    if (!data || data.ok !== true) {
      const detail = data?.error?.message || data?.log || '整程序跟踪失败。';
      throw new Error(String(detail).slice(0, 300));
    }
    const layerRun = data.layerRun;
    if (!layerRun || layerRun.ok !== true) {
      throw new Error(layerRun?.error || '这段代码没能折叠出可画的结构。');
    }
    const sourceLines = String(code ?? '').split('\n').map((text, i) => ({ lineId: String(i + 1), text }));
    const lastIndex = layerRun.steps.length - 1;
    const steps = layerRun.steps.map((step, index) => {
      const line = step.lineId || '1';
      return {
        schemaVersion: '1.0',
        algorithm: 'custom-engine',
        stepIndex: index,
        event: 'step',
        sourceVersion: data.degradedMode || 'engine',
        lineId: line,
        array: [],
        target: null,
        variables: { line: Number(line) || 1, index: null, writes: 0 },
        description: '第 ' + line + ' 行',
        note: '第 ' + line + ' 行',
        done: index === lastIndex,
        result: null,
        layers: step.layers,
      };
    });
    return {
      runId: 'engine-' + now().toString(36),
      algorithm: 'custom-engine',
      plus: true,
      plusId: 'engine/program',
      uid: 'engine/program',
      variantId: 'engine',
      title: '自定义代码',
      structure: 'structure',
      style: layerRun.style,
      sourceVersion: '插桩 · ' + (data.degradedMode || 'full'),
      sourceLines,
      steps,
      rawSteps: steps,
      families: layerRun.families || [],
    };
  };
}
