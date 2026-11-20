/**
 * plus-samples.js -- 示例库的「填入示例」逻辑（与 DOM 结构解耦，便于 headless 测试）
 *
 * 为什么单独一层：plus01&02 的 54 个示例各自带 1～7 份样例（{id,label,input}），
 * 「填入示例」= 把选中的样例写进编辑框，「开始分析」= 把编辑框文本按原样例形状还原成输入。
 * 这套逻辑不碰渲染，只碰 3 个控件（#plus-sample / #plus-variant / #plus-input），
 * 所以可以脱离浏览器用假 DOM 逐示例验证（tests/plus-samples.test.mjs）。
 *
 * 契约：
 *   attach(id)      切到某个 plus 示例：清空控件、铺变体下拉、异步铺样例下拉并自动填入第 1 份
 *   detach()        切走：作废未完成的载入
 *   fill(i)         填入第 i 份样例（默认当前那份）
 *   fillCurrent()   重填当前样例
 *   read()          读回 {variant, input}，供 buildPlusRun 使用；文本坏了抛中文错误
 */

import { plusCase, plusVariants, plusSamples, plusParseText } from '../visualization/ext/plus-bridge.js';

const FIELD_IDS = ['plus-sample', 'plus-variant', 'plus-input'];

export function createPlusSamples({
  $,
  doc = globalThis.document,
  onMessage = () => {},
  onReset = () => {},
} = {}) {
  if (typeof $ !== 'function') throw new Error('createPlusSamples 需要一个 $("#id") 取值函数');
  for (const id of FIELD_IDS) {
    if (!$(id)) throw new Error('缺少示例输入控件 #' + id);
  }

  let algorithm = null;
  let list = [];
  let index = 0;
  let token = 0;

  const variantValue = () => $('plus-variant').value || 'v1';

  function setVariantOptions(id) {
    const variants = plusVariants(id);
    const select = $('plus-variant');
    select.replaceChildren(...variants.map((variant) => {
      const option = doc.createElement('option');
      option.value = variant.id;
      option.textContent = variant.name;
      if (variant.note) option.title = variant.note;
      return option;
    }));
    select.value = variants[0].id;
    select.disabled = variants.length < 2;
  }

  function setSampleOptions() {
    const select = $('plus-sample');
    select.replaceChildren(...list.map((sample) => {
      const option = doc.createElement('option');
      option.value = String(sample.index);
      option.textContent = sample.label;
      return option;
    }));
    select.disabled = list.length < 2;
  }

  function fill(step, { silent = false } = {}) {
    const target = Number.isInteger(step) ? step : index;
    const sample = list[target];
    if (!sample) return false;
    index = target;
    $('plus-sample').value = String(target);
    $('plus-input').value = sample.text;
    $('plus-help').textContent = `第 ${target + 1}/${list.length} 份示例：${sample.label}`
      + (sample.expectError ? '（这份样例演示报错/容错分支）' : '');
    onReset();
    if (!silent) onMessage('示例已填入，可以改输入或直接点「开始分析」。');
    return true;
  }

  async function load(id) {
    const mine = ++token;
    let loaded = [];
    try { loaded = await plusSamples(id); }
    catch (error) { if (mine === token) onMessage(error.message, true); return []; }
    if (mine !== token || id !== algorithm) return [];          // 已经切走了，丢弃结果
    list = loaded;
    setSampleOptions();
    if (!list.length) { $('plus-help').textContent = '这个示例没有自带样例输入。'; return list; }
    fill(0, { silent: true });
    onMessage('示例已填入，点「开始分析」查看过程。');
    return list;
  }

  return {
    get algorithm() { return algorithm; },
    samples: () => list.slice(),
    current: () => list[index] || null,
    attach(id) {
      algorithm = id;
      list = [];
      index = 0;
      token++;                                                  // 作废上一次未完成的载入
      $('plus-sample').replaceChildren();
      $('plus-input').value = '';
      $('plus-help').textContent = '正在载入示例…';
      setVariantOptions(id);
      return load(id);
    },
    detach() {
      algorithm = null;
      list = [];
      index = 0;
      token++;
    },
    fill,
    fillCurrent() { return fill(index); },
    read() {
      const sample = list[index] || {};
      return { variant: variantValue(), input: plusParseText($('plus-input').value, sample.input || {}) };
    },
  };
}

export { plusCase };
