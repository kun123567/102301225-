/**
 * step-vars.js -- plus 示例的变量面板
 *
 * plus 的每一步带的是**算法自己的变量**：
 *   数组族（insertion-sort 等）：step.variables = { n, i, j, moved, … }
 *   结构族（树/图/栈/哈希…）：  step.vars      = { 当前: 'A', 栈深: 1, 输出: 'A', … }
 * 名字本来就是中文/短标识，不做别名映射，也不为 54 个示例写死映射表：
 * 照原样取前 N 个，面板标签跟着变量名走。
 *
 * 单独成模块是为了能 headless 逐示例验证（tests/plus-samples.test.mjs），
 * 避免"面板显示 undefined"这类问题只能靠肉眼看。
 */

/** 一个值怎么显示在 4 格里 */
export function formatStepValue(value) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length ? value.join('、') : '空';
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

/**
 * @param {object} step  trace 的一步（step.vars 或 step.variables）
 * @param {number} slots 面板格子数（本项目是 4）
 * @returns {{labels: string[], values: Array<string|number>}}
 */
export function plusStepVariables(step, slots = 4) {
  const source = (step && (step.vars || step.variables)) || {};
  const labels = [];
  const values = [];
  for (const [key, value] of Object.entries(source)) {
    if (labels.length >= slots) break;
    if (value === undefined) continue;
    labels.push(key);
    values.push(formatStepValue(value));
  }
  while (labels.length < slots) { labels.push('—'); values.push('—'); }
  return { labels, values };
}
