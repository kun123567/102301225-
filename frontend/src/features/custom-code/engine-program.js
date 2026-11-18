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

  return async function runEngineProgram({ code, language = 'c', signal, stdin = '' } = {}) {
    const data = await request('/api/detect/trace', {
      body: { code, language, maxSteps: 4000, withLayers: true, ...(stdin ? { stdin } : {}) },
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
    /* 程序异常退出（exit(7) / 崩溃 / 超时）不是"运行成功"：轨迹还能看，但必须说明它不完整。 */
    const exitNote = data.abnormalExit
      ? (data.exitNote || `程序异常退出（exit ${data.exitCode}）：轨迹可能不完整。`)
      : null;
    const sourceLines = String(code ?? '').split('\n').map((text, i) => ({ lineId: String(i + 1), text }));

    /* 纯数组的示例走**本项目的数组链路**（`.bsviz-*` + 8 组 keyframes + 指针 FLIP），
       结构族才走 plus 的 svg 卡片。为什么要分：
       数组窗口的"动画"是这套 CSS 带来的，全塞进 svg 卡片就只剩很淡的淡入，看起来像没有动画。
       **只有"每步恰好一个数组层"时才走数组链路**：宿主的数组视图一次只能画一个数组，
       多数组时（评审报告 §3.5）以前只取第一个、后面那个直接消失 —— 那种情况交给 svg 卡片，
       每层一张卡，名称/字符标签/未知标记都保留。 */
    const ARRAY_STYLES = new Set([1, 5, 6]);
    const allLayers = layerRun.steps.flatMap((step) => step.layers || []);
    const singleArray = layerRun.steps.every((step) => (step.layers || []).filter((l) => ARRAY_STYLES.has(l.style)).length <= 1);
    const isArrayRun = allLayers.length > 0 && singleArray && allLayers.every((layer) => ARRAY_STYLES.has(layer.style));
    const arrayLayerOf = (layers) => (layers || []).find((item) => Array.isArray(item.data && item.data.values)) || null;
    const valuesOf = (layers) => {
      const layer = arrayLayerOf(layers);
      return layer ? layer.data.values.slice() : [];
    };
    /* 标签（字符数组的 `h`/`i`、未初始化格的 `?`）与数组名必须一起带给宿主：
       只传数值的话（评审报告 §3.5）浏览器里会把 `h` 画成 104、把 `?` 画成 0。 */
    const labelsOf = (layers) => {
      const layer = arrayLayerOf(layers);
      return layer && Array.isArray(layer.data.labels) ? layer.data.labels.slice() : [];
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
    /* 轨迹被截断（步骤超过 maxSteps）时，末步**不是**程序的最终结果：
       播放器可以"播到轨迹末尾"，但不能标成 done，也不能把中间状态当 result（评审报告 §3.6）。 */
    const truncated = Boolean(data.truncated);
    const steps = layerRun.steps.map((step, index) => {
      const line = step.lineId || '1';
      const values = valuesOf(step.layers);
      const prevValues = index > 0 ? valuesOf(layerRun.steps[index - 1].layers) : values;
      const changed = values.some((v, i) => v !== prevValues[i]);
      const roles = rolesOf(step.layers);
      const layer = arrayLayerOf(step.layers);
      const isLast = index === lastIndex;
      /* 变量面板只显示**可证实**的东西：本步行号、当前聚焦格、游标。
         以前 `writes: 0` 是写死的，明明有写入也显示 0（评审报告 §3.9）。 */
      const focusIndex = roles.focus.length ? roles.focus[0] : null;
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
        arrayName: layer ? String(layer.title || layer.id || '').replace(/^arr:/, '') : null,
        labels: isArrayRun ? labelsOf(step.layers) : [],
        target: null,
        /* 没实现的统计就写 null，不冒充 0 */
        variables: {
          line: Number(line) || 1,
          index: focusIndex,
          writes: isLast && !truncated ? 0 : null,
          pointers: roles.pointers.map((p) => (p.index != null ? p.id + '=' + p.index : p.id)),
        },
        /* 数组链路用的附加字段（不参与 Step v1 语义）：本步的游标 + 被改的格子 */
        pointers: isArrayRun ? roles.pointers : [],
        focus: isArrayRun ? roles.focus : [],
        description: '第 ' + line + ' 行',
        note: '第 ' + line + ' 行',
        done: isLast && !truncated && !data.abnormalExit,
        /* 截断 / 异常退出时不能把这一步的数组当成"程序的最终结果" */
        result: isLast && isArrayRun && !truncated && !data.abnormalExit ? values : null,
        layers: step.layers,
      };
    });
    const truncatedNote = truncated
      ? `轨迹被截断（只采到前 ${layerRun.steps.length} 步）：末步是最后观测到的状态，不是程序的最终结果。`
      : null;
    /* §4 的三条"限制要写在界面上"：没有结构 / 有采样上限 / 用了 stdin 但页面没有输入框 */
    const noStructureNote = allLayers.length === 0
      ? '这段代码没有可展示的数据结构（只有标量与行轨迹）——空白不是故障。'
      : null;
    const sampledNote = allLayers.some((l) => (l.data && Array.isArray(l.data.values) && l.data.values.length >= 16)
      || (l.data && Array.isArray(l.data.cells) && l.data.cells.length >= 16))
      ? '数组按最多 16 格采样显示（更长的数组只画前 16 格），不是完整输入。'
      : null;
    const stdinNote = /\b(?:scanf|fscanf|gets|getchar|cin)\s*[\(>]/.test(String(code || '')) && !stdin
      ? '这段代码要读标准输入，但当前页面没有 stdin 输入框：请把数据直接写在代码里（或从接口带 stdin 参数）。'
      : null;
    return {
      /* 说明优先级：异常退出 > 截断 > 没有结构 > 插桩降级 > 采样上限 > stdin > 后端其它说明 */
      notice: exitNote || truncatedNote || noStructureNote || degradedNote || sampledNote || stdinNote || data.note || null,
      noticeIsInfo: Boolean(data.autoSwitched || noStructureNote || sampledNote || stdinNote) && !degradedNote && !exitNote && !truncated,
      abnormalExit: Boolean(data.abnormalExit),
      truncated,
      exitCode: data.exitCode ?? null,
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
