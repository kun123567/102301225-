/**
 * function-harness.js -- 「只写函数体」也能用引擎：自动生成 main 夹具 + 把引擎事件映射回数组步骤
 *
 * 学生写的是：
 *     void sort(int a[], int n) { ... }
 * 引擎要的是**整程序**。所以这里做两件事：
 *   1) buildHarness：拼出 `#include <stdio.h> / 输入数组 / 你的函数 / main(){ sort(data, len); }`
 *      并记下前导行数，好把引擎行号换算回用户源码行号。
 *   2) engineTraceToRun：把引擎事件（S 行 / V 变量）折叠成 custom-array 的 Step 形状，
 *      这样既有的数组可视化链路（含样式与动画）一行都不用改。
 *
 * 为什么不改 Step v1 schema：`shared/schemas/step.schema.json` 是公共接口且
 * `additionalProperties:false`；沿用 custom-array 的 `{array, variables:{line,index,writes}}`
 * 就能直接复用，渲染侧零改动。
 */

const ENTRY_RE = /(?:^|\n)\s*(?:void|int)\s+([A-Za-z_]\w*)\s*\(\s*(?:const\s+)?int\s+([A-Za-z_]\w*)\s*\[\s*\]\s*,\s*(?:const\s+)?int\s+([A-Za-z_]\w*)\s*\)\s*\{/;

/** 夹具里用的名字：避开引擎运行时的 __avc_* 保留前缀 */
const DATA_NAME = 'avc_input_data';
const LEN_NAME = 'avc_input_len';

/**
 * 从"只写函数"的源码拼出可编译的整程序
 * @param {{source:string, array:number[]}} input
 * @returns {{ok:true, code:string, entry:string, arrayParam:string, lenParam:string, preludeLines:number, sourceLines:Array}|{ok:false, error:string}}
 */
export function buildHarness({ source, array } = {}) {
  const text = String(source ?? '');
  if (!text.trim()) return { ok: false, error: '请先输入代码。' };
  const match = ENTRY_RE.exec(text);
  if (!match) {
    return {
      ok: false,
      error: '没找到可调用的入口函数。请写成 `void 名字(int a[], int n) { ... }`（数组形参 + 长度形参）。',
    };
  }
  const entry = match[1];
  const arrayParam = match[2];
  const lenParam = match[3];
  const values = (Array.isArray(array) ? array : []).map((v) => (v === -2147483648 ? '(-2147483647 - 1)' : String(v)));
  const prelude = [
    '#include <stdio.h>',
    '#include <stdlib.h>',
    `static int ${DATA_NAME}[] = {${values.join(', ') || '0'}};`,
    `static int ${LEN_NAME} = ${values.length};`,
  ];
  const epilogue = [
    'int main(void) {',
    `  ${entry}(${DATA_NAME}, ${LEN_NAME});`,
    '  return 0;',
    '}',
  ];
  return {
    ok: true,
    code: prelude.concat(text.split('\n'), epilogue).join('\n'),
    entry,
    arrayParam,
    lenParam,
    preludeLines: prelude.length,
    epilogueLines: epilogue.length,
    sourceLines: text.split('\n'),
  };
}

const ARRAY_ELEMENT_RE = /^([A-Za-z_]\w*)\[(\d+)\]$/;

/**
 * 引擎事件 → custom-array 的 run（steps[].array / variables{line,index,writes}）
 *
 * 事件语义（avctrace.h）：S|line = 即将执行；V|line|name|kind|value = 语句执行后的快照。
 * 所以每一步的数组状态 = "这一步执行完之后"，与既有 custom-array 的 write 语义一致。
 *
 * @param {{trace:object, harness:object, initialArray?:number[], sourceVersion?:string}} input
 */
export function engineTraceToRun({ trace, harness, initialArray = [], sourceVersion = 'local-engine-v1' } = {}) {
  const preludeLines = harness?.preludeLines ?? 0;
  const userLines = harness?.sourceLines?.length ?? 0;
  const sourceLines = (harness?.sourceLines || []).map((text, i) => ({ lineId: String(i + 1), text: String(text) }));
  const paramName = harness?.arrayParam || null;

  const steps = [];
  /* 初值必须来自用户填的输入数组：否则第一条 V 快照会把"全部元素都算成写入"，
     前面那些还没 dump 的步骤又会退化成最终状态。 */
  let state = Array.isArray(initialArray) && initialArray.length ? [...initialArray] : null;
  let writes = 0;
  let current = null;
  const vars = new Map();        // 本步观察到的普通变量（i / j / tmp …）

  const toUserLine = (engineLine) => {
    const line = Number(engineLine) - preludeLines;
    if (!Number.isInteger(line)) return null;
    if (line < 1 || line > userLines) return null;   // 前导 / 收尾（main）行不算用户步骤
    return line;
  };

  const note = (step, text) => {
    if (!step) return;
    step.description = step.description ? step.description + ' ' + text : text;
  };

  for (const event of trace?.events || []) {
    const kind = event[0];
    if (kind === 'S') {
      const line = toUserLine(event[1]);
      if (line == null) { current = null; continue; }
      vars.clear();
      current = {
        schemaVersion: '1.0',
        algorithm: 'custom-array',
        sourceVersion,
        event: 'step',
        lineId: String(line),
        stepIndex: steps.length,
        array: state ? [...state] : [],
        variables: { line, index: null, writes },
        description: `第 ${line} 行`,
        done: false,
        result: null,
      };
      steps.push(current);
      continue;
    }
    if (kind !== 'V') continue;
    const [, , name, valueKind, rawValue] = event;
    const element = ARRAY_ELEMENT_RE.exec(String(name || ''));
    if (element && (!paramName || element[1] === paramName)) {
      const index = Number(element[2]);
      const value = Number(rawValue);
      if (!Number.isFinite(value)) continue;
      if (!state) state = new Array(Math.max(index + 1, 1)).fill(null);
      while (state.length <= index) state.push(null);
      const changed = state[index] !== value;
      state[index] = value;
      if (current) {
        current.array = [...state];
        if (changed) {
          writes += 1;
          current.event = 'write';
          if (current.variables.index == null) current.variables.index = index;   // 记第一个变化的元素
          current.variables.writes = writes;
          note(current, `A[${index}] = ${value}`);
        }
      }
      continue;
    }
    vars.set(String(name), rawValue);
  }

  if (!steps.length) {
    return { ok: false, error: '引擎没在用户代码里记录到任何步骤（可能函数没被调用，或写法超出插桩支持）。' };
  }
  for (const step of steps) step.array = (step.array || []).map((v) => (v == null ? 0 : v));

  const last = steps[steps.length - 1];
  /* 只有"正常跑完、没被截断"时，末步才算完成、末态才算结果（评审报告 §3.6/§3.7）。
     截断（步数超过 maxSteps）或异常退出（exit 7 / abort / 超时）时：
       · 播放器可以播到轨迹末尾，但 done 不能为 true；
       · 那个数组只是"最后观测到的状态"，不能当 result（否则用户会把中间态当答案）。 */
  const truncated = Boolean(trace?.truncated);
  const abnormalExit = Boolean(trace?.abnormalExit);
  const exitCode = Number.isFinite(trace?.exitCode) ? trace.exitCode : null;
  const completed = !truncated && !abnormalExit;
  last.done = completed;
  last.result = completed && last.array.length ? [...last.array] : null;
  last.lastObserved = last.array.length ? [...last.array] : null;
  /* 有步骤但一次数组变化都没有 —— 不假装知道原因，两个可能都说清楚，并给出能照做的动作：
     ① 这段代码本来就不改输入数组（只把中间结果放在别的数组/标量里，如"接雨水"的 leftMax/rightMax）
        → 想看中间数组请用整程序模式；
     ② 有语句写在同一行的花括号里（`{ a[0]=1; }`），插桩按"一条语句一行"工作，这类不会被单独插桩
        → 拆成一行一句。检测到 ② 时附上行数，让用户知道去哪改。 */
  const packedLines = (harness?.sourceLines || []).filter((text) => {
    const code = String(text).replace(/\/\/.*$/, '');
    const open = code.indexOf('{');
    if (open < 0) return false;
    const close = code.lastIndexOf('}');
    const body = close > open ? code.slice(open + 1, close) : code.slice(open + 1);
    return (body.match(/;/g) || []).length >= 1;      // 花括号里还有语句 → 那一句不会被单独插桩
  }).length;
  const notice = abnormalExit
    ? `函数以非 0 状态退出（exit ${exitCode}）：轨迹只到退出前，末态不是函数的最终结果。`
    : (truncated
      ? '轨迹被截断（步数超过上限）：末态是最后观测到的状态，不是函数的最终结果。'
      : (writes !== 0 ? null
        : '本次没有记录到数组变化。两种常见原因：① 这段代码没有修改输入数组（结果算在别的变量里）——'
          + '想看中间数组请用整程序模式（保留 `int main`）；② 有语句写在同一行的花括号里，插桩只按"一条语句一行"工作——'
          + '把它们拆成一行一句再试。'
          + (packedLines > 0 ? '（检测到 ' + packedLines + ' 行属于第 ② 种）' : '')));
  return {
    ok: true,
    algorithm: 'custom-array',
    sourceVersion,
    sourceLines,
    steps,
    /* 截断/异常退出时不给"最终结果"，只给最后观测（lastObserved） */
    result: completed ? last.result : null,
    lastObserved: last.lastObserved,
    writes,
    truncated,
    abnormalExit,
    exitCode,
    notice,
    meta: { entry: harness?.entry || null, engineSteps: steps.length, finalArray: completed ? last.result : null, writes, truncated, abnormalExit, exitCode },
  };
}
