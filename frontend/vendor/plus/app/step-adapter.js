/**
 * app/step-adapter.js -- 把 add01 的 trace-v1 步进，适配成 datastructure-agent 的 **Step v1** 契约
 *
 * 用途：把 plus01&02 的 54 案例 × 3 变体接进 `raw/datastructure-agent` 的可视化窗口时，
 * 它的渲染层（SVG 原型 + CSS keyframes）**一行都不用改**，只吃这里产出的 Step。
 *
 * datastructure-agent 的现有契约（shared/schemas/step.schema.json）是**二分查找专用**：
 *   { schemaVersion, algorithm, stepIndex, event, sourceVersion, lineId,
 *     array, target, variables:{left,right,mid}, done, result }   additionalProperties:false
 * 所以：
 *   · 数组类案例 → 可直接映射（array / target / variables / done / result 都有对应）
 *   · 其它族     → 必须**扩展 schema**（structure / layers / note），因为 `additionalProperties:false`
 *
 * 这个文件只做"数据形状转换"，不碰任何样式或动画。
 */

const NUMBERISH = (v) => typeof v === 'number' && Number.isFinite(v);

/** 从一层的 data 里抽"一维数值序列"（数组类渲染器都能提供） */
function valuesOf(layer) {
  const d = (layer && layer.data) || {};
  if (Array.isArray(d.values)) return Array.isArray(d.values[0]) ? null : d.values.map((v) => (NUMBERISH(v) ? v : null));
  if (Array.isArray(d.cells)) return d.cells.map((c) => (c && NUMBERISH(c.value) ? c.value : null));
  if (Array.isArray(d.array)) return d.array.map((v) => (NUMBERISH(v) ? v : null));
  return null;
}

/** 结构族（按渲染器 style 判定，与 datastructure-agent 的"原型"一一对应） */
export const STYLE_FAMILY = {
  1: 'array', 5: 'array', 6: 'array',
  2: 'matrix',
  3: 'linked-list',
  7: 'stack',
  8: 'heap',
  9: 'tree',
  10: 'graph',
};

/** 现有 SVG 原型覆盖的族（其余都要新写原型，但**不改**现有 CSS） */
export const COVERED_BY_EXISTING_PROTOTYPE = new Set(['array', 'graph']);

/**
 * 把一步 trace 转成 Step v1（+ 扩展字段）
 * @param {object} step      trace.steps[i]：{ event, lineId, note, vars, layers[], done, result }
 * @param {object} ctx       { uid, variantId, title }
 * @returns {{ step: object, family: string, usesExt: string[], lossy: string[] }}
 */
export function toStepV1(step, ctx = {}) {
  const layers = (step && step.layers) || [];
  const main = layers[0] || null;
  const family = STYLE_FAMILY[main && main.style] || 'unknown';
  const values = main ? valuesOf(main) : null;

  // 现有的数值变量（datastructure-agent 的 variables 只认对象里的数值）
  const variables = {};
  for (const [k, v] of Object.entries((step && step.vars) || {})) {
    if (NUMBERISH(v)) variables[k] = v;
  }
  // 数组类的区间就是 left/right（他们的原型用这三个值画高亮框）
  const target = NUMBERISH(step && step.vars && step.vars.target) ? step.vars.target : null;

  const out = {
    schemaVersion: '1.0',
    algorithm: ctx.uid || 'unknown',
    stepIndex: ctx.stepIndex != null ? ctx.stepIndex : 0,
    event: step && step.event ? String(step.event) : 'none',
    sourceVersion: ctx.variantId || 'v1',
    lineId: step && step.lineId ? String(step.lineId) : '-',
    array: values || [],
    target,
    variables,
    done: !!(step && step.done),
    result: (step && step.result !== undefined ? step.result : null),
  };
  const usesExt = [];
  const lossy = [];

  // 数组类：区间（left/right/mid）由 marks 提供给他们的 range-flash / mid-pulse
  if (family === 'array') {
    const marks = (main && main.data && main.data.marks) || {};
    if (marks.range) {
      const [l, r] = marks.range;
      if (NUMBERISH(l)) out.variables.left = l;
      if (NUMBERISH(r)) out.variables.right = r;
    }
    if (NUMBERISH(marks.pointer)) out.variables.mid = marks.pointer;
  } else {
    // 其它族：现有 schema 表达不了 → 必须扩展
    usesExt.push('structure', 'layers');
    if (main && main.data) {
      const need = Object.keys(main.data).filter((k) => !['name'].includes(k));
      if (need.length) usesExt.push('data{' + need.join(',') + '}');
    }
    if (step && step.note) usesExt.push('note');
    if (!values) lossy.push('array（该族没有一维数值序列，array 填空）');
  }
  if (!values && family === 'array') lossy.push('array（这一层没有 values）');

  out.structure = family;
  out.layers = layers;
  if (step && step.note) out.note = step.note;

  return { step: out, family, usesExt: [...new Set(usesExt)], lossy };
}
