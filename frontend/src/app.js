import { createRun, requestJSON } from './services/api.js';
import { createGraphForm } from './features/workbench/bfs-form.js';
import { displaySourceLines, displayLineId } from './features/workbench/display-source.js';
import { arraySearch } from './features/workbench/array-search.js';
import { createAlgorithmMenu } from './features/workbench/algorithm-menu.js';
import { graphAlgorithm } from './features/workbench/graph-algorithms.js';
import { parseInput, validateRun } from './features/workbench/input.js';
import { describeStep } from './features/visualization/index.js';
import { createVizWindow } from './features/visualization/window.js';
import { isPlus, buildPlusRun, plusCase } from './features/visualization/ext/plus-bridge.js';
import { createPlusSamples } from './features/workbench/plus-samples.js';
import { plusStepVariables } from './features/workbench/step-vars.js';
import { createDetectPanel } from './features/custom-code/detect-panel.js';
import { createEngineProgramRun, isProgramSource, looksLikeFullSource } from './features/custom-code/engine-program.js';
import { CUSTOM_SAMPLES, customSample, loadCustomSample } from './features/custom-code/samples.js';
import { createPlayback } from './features/playback/index.js';
import { createExercises } from './features/exercises/index.js';
import { createAgentChat } from './features/agent/panel.js';
import { createWorkbenchUI } from './features/workbench/ui.js';

const $ = id => document.getElementById(id);
let selectedAlgorithm = 'binary-search';
const isSorting = () => selectedAlgorithm === 'bubble-sort';
const selectedGraph = () => graphAlgorithm(selectedAlgorithm);
const isCustom = () => selectedAlgorithm === 'custom-array';
const variableIds = ['varLeft', 'varRight', 'varMid', 'varValue'];
const binaryHelp = $('input-help').textContent;
let run = null, playback = null, viz = null, pending = null, generation = 0;
let currentContext = null;
let practiceTopic = 'binary-search';
const speedMs = 1000;
const graphForm = createGraphForm({ message, onChange: updateGraphDraft });
const runButtonLabel = () => selectedGraph() ? (run ? '重新运行' : '运行 ' + selectedGraph().name) : isCustom() ? '编译并运行' : '开始分析';
const ui = createWorkbenchUI({
  onNavigate(page, algorithm) {
    if (page !== 'workbench' && playback?.getState().playing) playback.pause();
    if (algorithm && selectedAlgorithm !== algorithm) {
      selectedAlgorithm = algorithm;
      configureAlgorithm();
    }
  },
});
const algorithmMenu = createAlgorithmMenu($('algorithm-menu'), algorithm => {
  if (algorithm === selectedAlgorithm) return;
  selectedAlgorithm = algorithm;
  configureAlgorithm();
  ui.navigate('workbench', { algorithm, replace: true });
});
algorithmMenu.setSelected(selectedAlgorithm);
function mountWindow() {
  $('visualization-panel').replaceChildren();
  viz = createVizWindow($('visualization-panel'), {
    algorithm: selectedAlgorithm,
    onSeek(index) { playback?.seek(index); },
    onTransport(action) { playback?.[action]?.(); }
  });
}
const listeners = new Set();
const sourceNodes = new Map();
const agent = createAgentChat($('agent-panel'), {embedded:true,onBeforeSend:()=>playback?.pause()});

// 07 may subscribe immediately on mount, including the current initial step.
export function subscribeStep(listener) {
  listeners.add(listener); listener(currentContext);
  return () => listeners.delete(listener);
}
const exercises = createExercises($('exercise-mount'), {
  onBeforeAnswer: () => playback?.pause(),
  recordsContainer: $('records-mount'),
  onPracticeRequested: () => ui.navigate('practice'),
  onTopicChanged(topic) {
    practiceTopic = topic;
    $('exercise-title').textContent = topic === 'bubble-sort' ? '冒泡排序过程题' : '二分查找过程题';
    updatePracticeContext(currentContext);
  },
});
const unsubscribeExercises = subscribeStep(exercises.setContext);
function updatePracticeContext(context) {
  const linked = context?.algorithm === practiceTopic ? context : null;
  $('exercise-context').textContent = linked ? `当前运行：第 ${linked.stepIndex+1} 步 / 共 ${linked.total} 步。题目仍使用自己的固定情境。`
    : context ? '当前运行属于另一算法，可以独立完成本题。' : '当前无工作台运行，可独立完成固定题练习。';
  const host = $('exercise-mount');
  if (linked) { host.dataset.runId=linked.runId; host.dataset.stepIndex=String(linked.stepIndex); }
  else { delete host.dataset.runId;delete host.dataset.stepIndex; }
}
function publish(context) {
  currentContext = context;
  agent.setContext(isCustom() ? null : context);
  ui.setContext(context);
  updatePracticeContext(context);
  for (const listener of listeners) { try { listener(context); } catch(error) { console.error('步骤订阅失败',error); } }
  document.dispatchEvent(new CustomEvent('workbench:step',{detail:context}));
}
function message(text, error=false) { $('msgBox').textContent=text;$('msgBox').className=error?'error':''; }
function clearRun({ keepRequest = false } = {}) {
  if (!keepRequest) { generation++; pending?.abort(); pending=null; }
  playback?.destroy(); viz?.destroy(); playback=null;viz=null;run=null;
  sourceNodes.clear(); $('code-lines').replaceChildren();
  const placeholder=document.createElement('li');placeholder.textContent='开始分析后显示对应源码。';$('code-lines').append(placeholder);
  mountWindow();
  for (const id of variableIds) $(id).textContent = '—';
  if (selectedAlgorithm === 'binary-search') $('varMid').textContent = '未计算';
  $('stepText').textContent='尚未开始';$('step-description').textContent='';$('source-version').textContent='C/C++';
  $('startBtn').disabled=false;$('startBtn').textContent=runButtonLabel();$('run-form').removeAttribute('aria-busy');
  publish(null);
}
function render(state) {
  if(!run || state.runId!==run.runId || !state.step)return;
  const step=state.step;
  viz.setStep(step, state);
  const { left, right, mid, pass, index, sortedFrom, line, writes } = step.variables || {};   // plus 结构族只有 step.vars
  let values;
  if (run.graph) {
    values = selectedGraph().fields.map(([key]) => {
      const value = step.variables[key];
      if (key === 'matrix') {
        const nodes = run.graph.nodes;
        return ['列顺序：' + nodes.join('、'), ...value.map((row, index) => nodes[index] + '：' + row)].join('\n');
      }
      if (key === 'currentEdge' && value) {
        const [from, to, weight] = value;
        return from + (run.graph.directed ? ' → ' : ' — ') + to + (weight === undefined ? '' : '（' + weight + '）');
      }
      if (Array.isArray(value)) return value.join('、') || '空';
      if (value && typeof value === 'object') {
        return run.graph.nodes.map(node => node + '：' + (value[node] ?? '—')).join('、');
      }
      return value ?? '—';
    });
  } else if (run.plus) {
    // plus 示例：变量来自算法模块自己（数组族 step.variables / 结构族 step.vars），
    // 标签跟着变量名走，不为 54 个示例写死映射。格式化在 workbench/step-vars.js。
    const panel = plusStepVariables(step, variableIds.length);
    values = panel.values;
    panel.labels.forEach((label, i) => { $(variableIds[i]).previousElementSibling.textContent = label; });
  } else if (arraySearch(run.algorithm)) {
    const { index, current, comparisons, blockIndex, blockMax } = step.variables;
    values = run.algorithm === 'block-search'
      ? [blockIndex ?? '—', blockMax ?? '—', index ?? '—', current ?? '—']
      : [index ?? '—', current ?? '—', step.target, comparisons];
  } else if (run.algorithm === 'custom-array') values = [line, index ?? '—', index === null ? '—' : step.array[index], writes];
  else if (run.algorithm === 'bubble-sort') values = [pass || '—', index ?? '—', index === null ? '—' : index + 1, step.array.length - sortedFrom];
  else values = [left, right, mid ?? '未计算', mid === null ? '—' : step.array[mid]];
  variableIds.forEach((id, i) => { $(id).textContent = values[i]; });
  $('stepText').textContent=`第 ${state.stepIndex+1} 步 / 共 ${state.total} 步`;
  $('step-description').textContent = run.graph ? step.description : run.plus ? String(step.note || step.event || '') : describeStep(step);
  const activeId = displayLineId(run.algorithm, step.lineId);
  for(const [lineId,node] of sourceNodes){const active=lineId===activeId;node.classList.toggle('active',active);if(active)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');}
  if (run.algorithm === 'custom-array') {
    const list = $('code-lines');
    const activeLine = sourceNodes.get(step.lineId).getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (activeLine.top < viewport.top) list.scrollTop += activeLine.top - viewport.top;
    else if (activeLine.bottom > viewport.bottom) list.scrollTop += activeLine.bottom - viewport.bottom;
  }
  publish({runId:run.runId,algorithm:run.algorithm,stepIndex:state.stepIndex,step,total:state.total,playing:state.playing,sourceVersion:run.sourceVersion});
}
async function start(event) {
  event.preventDefault();
  const graph = selectedGraph();
  if (graph && pending) return;
  if (!graph) clearRun();
  const algorithm = selectedAlgorithm;
  let input;
  try {
    input = isPlus(algorithm) ? plusUi.read()
      : graph ? graphForm.read() : parseInput($('arrInput').value, $('targetInput').value, algorithm);
  } catch (error) {
    message(error.message, true);
    return;
  }
  if (!input) return;
  const custom = algorithm === 'custom-array';
  if (custom) {
    input.language = $('code-language').value;
    input.source = $('code-input').value;
    if (!input.source.trim()) { message('请输入代码，或先填入示例。', true); return; }
  }
  const ticket=generation;const controller=new AbortController();pending=controller;
  message(custom ? '正在编译并记录实际执行步骤…' : '正在生成执行步骤…');
  $('startBtn').disabled=true;$('startBtn').textContent=custom?'编译运行中…':'分析中…';$('run-form').setAttribute('aria-busy','true');
  try{
    // plus01&02 demo library: build the run locally (no backend), same shape as a server run.
    let result;
    if (isPlus(algorithm)) {
      result = await buildPlusRun(algorithm, input.variant || 'v1', input.input);
    } else if (custom) {
      /* 写了 int main 的整程序 → 走引擎 + 结构渲染（数组/链表/树/图 → plus 渲染器）；
         只写函数 → 引擎链路自动补 main 夹具并映射成数组步骤；
         引擎不支持这段写法时回退极简子集翻译器，并把原因说出来，不静默换引擎。 */
      const isProgram = isProgramSource(input.source);
      const fullSource = looksLikeFullSource(input.source);
      try {
        result = isProgram
          ? await runEngineProgram({ code: input.source, language: input.language, signal: controller.signal })
          : validateRun(await createRun({ ...input, mode: 'engine' }, controller.signal, algorithm), algorithm);
      } catch (engineError) {
        if (engineError.name === 'AbortError') throw engineError;
        if (isProgram) throw engineError;          // 整程序模式没有极简回退（翻译器只认函数体）
        /* 带 #include / struct 但没有 main：极简翻译器必然报"不支持的字符"，
           这类错误对用户没有信息量，直接换成能照做的指引。 */
        if (fullSource) {
          throw new Error('这段代码含 #include / struct，但没找到 main。整程序模式需要 `int main(void) { … }`；'
            + '如果只想验证函数，请只保留 `void f(int a[], int n) { … }`（去掉 #include 与其他函数）。'
            + '（引擎原话：' + engineError.message + '）');
        }
        result = validateRun(await createRun(input, controller.signal, algorithm), algorithm);
        message('引擎模式不支持这段代码（' + engineError.message + '），已回退到极简模式。', true);
      }
    } else {
      result = validateRun(await createRun(input, controller.signal, algorithm), algorithm);
    }
    if(ticket!==generation)return;
    if (graph) clearRun({ keepRequest: true });
    run=result;$('code-lines').replaceChildren();
    for(const line of displaySourceLines(run)){const node=document.createElement('li');node.textContent=line.text;node.dataset.lineId=line.lineId;sourceNodes.set(line.lineId,node);$('code-lines').append(node);}
    $('source-version').textContent=custom ? `${input.language === 'c' ? 'C' : 'C++'} · ${run.sourceVersion || 'Open Watcom'}` : isPlus(algorithm) ? `示例库 · ${run.sourceVersion}` : `C/C++ · ${run.sourceVersion}`;
    viz.setRun(run);
    playback=createPlayback({runId:run.runId,steps:run.steps,intervalMs:speedMs,onStepChange:render});
    render({...playback.getState(),step:run.steps[0]});
    if (graph) {
      graphForm.summarize(run.graph);
      message('');
    } else {
      message(run.notice ? run.notice : '运行已创建。从第 1 步开始，可单步查看或播放。', Boolean(run.notice));
    }
  }catch(error){if(ticket!==generation||error.name==='AbortError')return;if (!graph) clearRun();message(error.message,true);}
  finally{if(ticket===generation){pending=null;$('startBtn').disabled=false;$('startBtn').textContent=runButtonLabel();$('run-form').removeAttribute('aria-busy');}}
}
$('run-form').addEventListener('submit',start);

/**
 * 整程序模式：把代码交给引擎（真编译 + 插桩），后端顺手折叠成 plus 的 layers[]，
 * 这里组装成**与 plus 示例同形**的 run，交给 createPlusView 渲染 —— 不改 Step v1 schema。
 * 具体实现与断言在 features/custom-code/engine-program.js。
 */
const runEngineProgram = createEngineProgramRun({ request: requestJSON });

/* ---------------- plus01&02 示例库：填入示例 / 读回输入 ----------------
 * 逻辑在 features/workbench/plus-samples.js（可 headless 测）；这里只负责接线：
 * 切算法时 attach/detach，点「填入示例」重填当前样例，提交前 read() 出 {variant,input}。
 * ---------------------------------------------------------------------- */
const plusUi = createPlusSamples({ $, doc: document, onMessage: message, onReset: () => clearRun() });

/* 自动识别面板：base 的识别器（后端 /api/detect）。点条目跳到对应源码行。 */
const detectPanel = createDetectPanel({
  mount: $('detect-panel'),
  request: requestJSON,
  onJumpLine(line) {
    const input = $('code-input');
    if (!input || !Number.isInteger(line)) return;
    const lines = String(input.value || '').split('\n');
    const before = lines.slice(0, Math.max(0, line - 1)).join('\n');
    input.focus();
    const start = before.length ? before.length + 1 : 0;
    const length = (lines[line - 1] || '').length;
    if (typeof input.setSelectionRange === 'function') input.setSelectionRange(start, start + length);
    message('已定位到第 ' + line + ' 行。');
  },
});

function configureAlgorithm() {
  const sorting = isSorting();
  const custom = isCustom();
  const graph = selectedGraph();
  const search = arraySearch(selectedAlgorithm);
  const plus = isPlus(selectedAlgorithm);
  graphForm.setAlgorithm(graph);
  $('arrInput').closest('label').hidden = Boolean(graph) || plus;
  $('input-help').hidden = Boolean(graph) || plus;
  $('run-form').classList.toggle('bfs-input', Boolean(graph));
  $('plus-input-fields').hidden = !plus;
  $('run-form').classList.toggle('plus-input', plus);
  $('code-panel').classList.toggle('graph-workspace', Boolean(graph));
  $('code-panel').classList.toggle('floyd-workspace', selectedAlgorithm === 'floyd');
  $('workbench-footer-detail').textContent = graph ? '图结构和步骤来自本次运行' : plus ? '输入取自示例库样例，可自由修改' : '数组下标从 0 开始';
  $('visualization-panel').setAttribute('aria-label', graph ? graph.name + ' 执行过程，可用左右方向键单步操作' : '数组动画，可用左右方向键单步操作');
  $('workbench-heading').textContent = graph?.title ?? search?.title ?? (custom ? '自定义代码' : sorting ? '冒泡排序' : plus ? plusCase(selectedAlgorithm)?.title ?? '示例' : '二分查找');
  $('source-file').textContent = graph ? selectedAlgorithm.replace('-', '_') + '.cpp'
    : plus ? plusCase(selectedAlgorithm)?.uid.replace('/', '_') + '.cpp'
    : search?.file ?? (custom ? '用户源码' : sorting ? 'bubble_sort.cpp' : 'binary_search.cpp');
  $('array-label').textContent = selectedAlgorithm === 'block-search' ? '分块数组' : custom || search ? '输入数组' : sorting ? '待排序数组' : '有序数组';
  $('arrInput').value = '';
  $('arrInput').placeholder = search ? '例如：' + search.example : sorting || custom ? '例如：5, 1, 4, 2' : '例如：1, 3, 5, 7, 9';
  $('target-field').hidden = sorting || custom || Boolean(graph) || plus;
  $('custom-code-fields').hidden = !custom;
  $('run-form').classList.toggle('sorting-input', sorting || custom);
  $('input-help').textContent = custom ? '本机 Windows 编译运行。最多 24 个 32 位整数，逗号分隔；留空为空数组。'
    : sorting ? '最多 24 个安全整数，逗号分隔；留空为空数组。允许负数和重复值。' : search?.help ?? binaryHelp;
  const labels = graph ? graph.fields.map(([, label]) => label) : custom ? ['源码行', '写入下标', '写入值', '写入次数']
    : selectedAlgorithm === 'block-search' ? ['当前块', '块最大值', '数组下标', '当前元素']
    : search ? ['当前下标', '当前元素', '目标值', '比较次数']
    : plus ? ['变量 1', '变量 2', '变量 3', '变量 4']
    : sorting ? ['轮次', 'i', 'i + 1', '已就位'] : ['left', 'right', 'mid', 'A[mid]'];
  variableIds.forEach((id, i) => { $(id).previousElementSibling.textContent = labels[i]; });
  if (plus) plusUi.attach(selectedAlgorithm);
  else plusUi.detach();
  /* 自定义代码：自动识别面板（静态、不编译）—— 切到自定义代码就先把已有代码识别一遍 */
  if (custom) detectPanel.analyze($('code-input').value);
  else detectPanel.clear();
  algorithmMenu.setSelected(selectedAlgorithm);
  ui.setAlgorithm(selectedAlgorithm);
  clearRun();
  if (!custom && !graph && !search) exercises.setTopic(selectedAlgorithm);
  message('');
}
function updateGraphDraft() {
  if (pending) {
    generation++;
    pending.abort();
    pending = null;
    $('startBtn').disabled = false;
    $('startBtn').textContent = runButtonLabel();
    $('run-form').removeAttribute('aria-busy');
  }
  message(run ? '输入已更改，点击「重新运行」应用。' : '');
}
function invalidateInput() {
  const old = Boolean(run || pending);
  if (old) clearRun();
  message(old ? (isCustom() ? '输入已更改，请重新编译运行。' : '输入已更改，请重新开始分析。') : '');
}
for (const id of ['arrInput','targetInput','code-input','plus-input']) $(id).addEventListener('input', invalidateInput);
$('code-input').addEventListener('input', () => { if (isCustom()) detectPanel.analyze($('code-input').value); });
$('code-language').addEventListener('change', invalidateInput);
$('plus-sample').addEventListener('change', () => { plusUi.fill(Number($('plus-sample').value) || 0); });
$('plus-variant').addEventListener('change', () => { invalidateInput(); message('已切到变体「' + $('plus-variant').selectedOptions[0]?.textContent + '」，点「开始分析」重跑。'); });
$('fillDemo').addEventListener('click', () => {
  if (isPlus(selectedAlgorithm)) {            // 示例库：重填该示例自带的那份样例
    if (plusUi.samples().length) plusUi.fillCurrent();
    else plusUi.attach(selectedAlgorithm);
    return;
  }
  if (isCustom()) {                           // 自定义代码：从示例库读取（含网上的整程序样例）
    applyCustomSample($('custom-sample').value || CUSTOM_SAMPLES[0].id);
    return;
  }
  if (selectedGraph()) {
    updateGraphDraft();
    graphForm.fillDemo();
    message('示例顶点和边已填入，点「下一步」查看。');
    return;
  }
  clearRun();
  $('arrInput').value = arraySearch(selectedAlgorithm)?.example ?? (isSorting() ? '5,1,4,2' : '1,3,5,7,9');
  $('targetInput').value = '7';
  message('示例已填入，点击开始分析。');
});

/* ---------------- 自定义代码示例库 ---------------- */
$('custom-sample').replaceChildren(...CUSTOM_SAMPLES.map((sample) => {
  const option = document.createElement('option');
  option.value = sample.id;
  option.textContent = sample.title;
  if (sample.source) option.title = sample.source;
  return option;
}));

async function applyCustomSample(id) {
  const sample = customSample(id);
  if (!sample) return;
  try {
    const loaded = await loadCustomSample(id);
    $('code-input').value = loaded.code;
    $('code-language').value = loaded.language || 'c';
    if (loaded.mode === 'function' && !$('arrInput').value) $('arrInput').value = '5,1,4,2';
  } catch (error) {
    message('示例加载失败：' + error.message, true);
    return;
  }
  clearRun();
  detectPanel.analyze($('code-input').value);
  message(sample.source
    ? '已填入网上样例（来源：' + sample.source + '），点「开始分析」运行。'
    : '示例已填入，可以修改代码或直接编译运行。');
}
$('visualization-panel').addEventListener('keydown',event=>{
  if(event.target.closest('input,textarea,select,button,a,[contenteditable]')||!playback)return;
  if(event.key==='ArrowLeft'){event.preventDefault();playback.prev();}
  else if(event.key==='ArrowRight'){event.preventDefault();playback.next();}
  else if(event.key===' '){event.preventDefault();playback.getState().playing?playback.pause():playback.play();}
});
requestJSON('/api/health').then(data=>{$('service-status').textContent=data.mode==='mock'?'服务已连接 · 辅导为 Mock 开发模板':data.modelCallsEnabled?'服务已连接 · 辅导使用真实模型':'服务已连接 · 模型未配置，动画仍可使用';}).catch(()=>{$('service-status').textContent='服务未连接，请按启动说明重试。';});
window.addEventListener('pagehide',()=>{generation++;pending?.abort();playback?.destroy();viz?.destroy();ui.destroy();algorithmMenu.destroy();agent.destroy();unsubscribeExercises();exercises.destroy();detectPanel.destroy();listeners.clear();},{once:true});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
mountWindow();
publish(null);
ui.start();
