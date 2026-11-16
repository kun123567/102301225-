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

/** 这段代码看起来是 C++（只看内容，不看「编译语言」下拉）
 *
 * 与后端 `detect-engine.looksLikeCpp` 用同一套标记：为了在**运行前**就把语言下拉切对，
 * 不必等编译失败再靠后端重试（后端那条路仍在，双保险）。
 */
const CPP_MARKERS = [
  /\bclass\s+[A-Za-z_]\w*/,
  /\bnamespace\b/,
  /\btemplate\s*</,
  /\b(?:public|private|protected)\s*:/,
  /\bnullptr\b/,
  /#include\s*<(?:iostream|string|vector|map|queue|stack|algorithm|set|list)>/,
  /\bstd\s*::/,
  /[A-Za-z_]\w*\s*::\s*[A-Za-z_]\w*/,
  /\bnew\s+[A-Za-z_]\w*/,
  /\bcout\b|\bcin\b|\bcerr\b/,
];

export function looksLikeCpp(code) {
  const text = String(code ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  return CPP_MARKERS.some((re) => re.test(text));
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
      throw new Error(String(detail).slice(0, 420));   // 错误里带行号与可用库清单，别截太狠
    }
    const layerRun = data.layerRun;
    if (!layerRun || layerRun.ok !== true) {
      throw new Error(layerRun?.error || '这段代码没能折叠出可画的结构。');
    }
    /* 插桩是分级降级的（full → no-dump → trace-only）。降到 no-dump 时**一条结构事件都没有**，
       画面上就是"一张空图/什么都没有" —— 必须说出来，不能让用户对着空白猜。 */
    const degradedNote = data.degradedMode && data.degradedMode !== 'full'
      ? `插桩已降级（${data.degradedMode}）：这段代码里有插桩暂不支持的写法，所以只能看到执行到哪一行，`
        + '看不到变量和结构。把语句拆成一行一条、或用更朴素的写法，通常就能恢复完整结构。'
      : null;
    const sourceLines = String(code ?? '').split('\n').map((text, i) => ({ lineId: String(i + 1), text }));

    /* 纯数组的示例走**本项目的数组链路**（`.bsviz-*` + 8 组 keyframes + 指针 FLIP），
       结构族才走 plus 的 svg 卡片。为什么要分：
       数组窗口的"动画"是这套 CSS 带来的，全塞进 svg 卡片就只剩很淡的淡入，看起来像没有动画。 */
    const ARRAY_STYLES = new Set([1, 5, 6]);
    const allLayers = layerRun.steps.flatMap((step) => step.layers || []);
    const isArrayRun = allLayers.length > 0 && allLayers.every((layer) => ARRAY_STYLES.has(layer.style));
    const valuesOf = (layers) => {
      const layer = (layers || []).find((item) => Array.isArray(item.data && item.data.values));
      return layer ? layer.data.values.slice() : [];
    };
    /* 引擎每步给的"谁在动"：roles.pointers（数组游标 / 结构指针）与 roles.focus1（本步改的格子）。
       数组链路（.bsviz-*）原本只认二分查找的 L/R/M，这两个字段是**附加**的：
       老调用方不带就完全没有影响（见 vendor/plus/app/host-frame.js 的 normalize）。 */
    const rolesOf = (layers) => {
      const pointers = [];
      const focus = [];
      for (const layer of layers || []) {
        const roles = layer.roles || {};
        for (const p of roles.pointers || []) pointers.push({ id: p.id, label: p.label, index: p.index, node: p.node });
        for (const f of roles.focus1 || []) if (Number.isInteger(f)) focus.push(f);
      }
      return { pointers, focus: [...new Set(focus)] };
    };

    const lastIndex = layerRun.steps.length - 1;
    const steps = layerRun.steps.map((step, index) => {
      const line = step.lineId || '1';
      const values = valuesOf(step.layers);
      const prevValues = index > 0 ? valuesOf(layerRun.steps[index - 1].layers) : values;
      const changed = values.some((v, i) => v !== prevValues[i]);
      const roles = rolesOf(step.layers);
      return {
        schemaVersion: '1.0',
        algorithm: 'custom-engine',
        stepIndex: index,
        event: changed ? 'write' : 'step',
        sourceVersion: data.degradedMode || 'engine',
        lineId: line,
        /* 数组族：把值放进 step.array，本项目的 createVisualization 才能画格子；
           结构族留空、用 layers 走 svg 卡片 */
        array: isArrayRun ? values : [],
        target: null,
        variables: { line: Number(line) || 1, index: null, writes: 0 },
        /* 数组链路用的附加字段（不参与 Step v1 语义）：本步的游标 + 被改的格子 */
        pointers: isArrayRun ? roles.pointers : [],
        focus: isArrayRun ? roles.focus : [],
        description: '第 ' + line + ' 行',
        note: '第 ' + line + ' 行',
        done: index === lastIndex,
        result: index === lastIndex && isArrayRun ? values : null,
        layers: step.layers,
      };
    });
    return {
      /* 后端可能把 C 自动切成 C++ 编译（代码里是 class/new），把说明带上去让页面能提示 */
      notice: data.note || degradedNote || null,
      noticeIsInfo: Boolean(data.autoSwitched) && !degradedNote,
      langUsed: data.langUsed || language,
      runId: 'engine-' + now().toString(36),
      algorithm: 'custom-engine',
      plus: true,
      plusId: 'engine/program',
      uid: 'engine/program',
      variantId: 'engine',
      title: '自定义代码',
      /* 纯数组 → 走本项目数组链路（有自己的 CSS 动画与指针 FLIP）；其余走 plus 的 svg 卡片 */
      structure: isArrayRun ? 'array' : 'structure',
      style: layerRun.style,
      sourceVersion: '插桩 · ' + (data.degradedMode || 'full'),
      sourceLines,
      steps,
      rawSteps: steps,
      families: layerRun.families || [],
    };
  };
}
