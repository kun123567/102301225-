/**
 * 算法模块公用小工具（所有包共用，改这里会影响 54 项内容，慎改）。
 *
 * 约定：
 *  · 输入一律是普通 JSON 对象（数组用 `array`，字符串用 `text`，图用 `nodes/edges` …）；
 *  · 输出 result 一律是普通 JSON 对象，便于 README/校验器直接打印与深比较；
 *  · 重复值一律加字母后缀（3a/3b）用于核对稳定性——绝不能靠颜色区分重复元素。
 */

/** 给重复值打标签：[3,1,3,2] → { values:[3,1,3,2], labels:['3a','1','3b','2'] } */
export function tagDuplicates(values, render = (v) => String(v)) {
  const seen = new Map();
  const labels = values.map((v) => {
    const key = typeof v === 'object' ? JSON.stringify(v) : String(v);
    const idx = (seen.get(key) || 0) + 1;
    seen.set(key, idx);
    return idx === 1 && values.filter((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x)) === key).length === 1
      ? render(v)
      : `${render(v)}${String.fromCharCode(96 + idx)}`;
  });
  return { values: [...values], labels };
}

/** 纯数字数组的标签：单值不带后缀，重复值带 a/b/c */
export function labelsOf(values, fmt = (v) => String(v)) {
  const count = new Map();
  for (const v of values) count.set(String(v), (count.get(String(v)) || 0) + 1);
  const used = new Map();
  return values.map((v) => {
    const k = String(v);
    if (count.get(k) === 1) return fmt(v);
    const n = (used.get(k) || 0) + 1;
    used.set(k, n);
    return `${fmt(v)}${String.fromCharCode(96 + n)}`;
  });
}

export function parseArray(text, { min = -999, max = 999, allowEmpty = true, maxLen = 24 } = {}) {
  if (typeof text !== 'string') throw new Error('输入必须是字符串');
  const t = text.replace(/[，、;；]/g, ',').trim();
  if (!t) {
    if (allowEmpty) return [];
    throw new Error('输入不能为空');
  }
  const parts = t.split(/[\s,]+/).filter(Boolean);
  if (parts.length > maxLen) throw new Error(`元素过多（上限 ${maxLen}）`);
  return parts.map((p) => {
    if (!/^-?\d+$/.test(p)) throw new Error(`不是整数：${p}`);
    const n = Number(p);
    if (n < min || n > max) throw new Error(`超出范围 [${min}, ${max}]：${n}`);
    return n;
  });
}

export function parseNumber(text, { min = -999, max = 999, name = '数值' } = {}) {
  if (!/^-?\d+$/.test(String(text).trim())) throw new Error(`${name}必须是整数`);
  const n = Number(String(text).trim());
  if (n < min || n > max) throw new Error(`${name}超出范围 [${min}, ${max}]`);
  return n;
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** 数组样例：正常 + 边界（任务单要求的"每组至少一个正常和一个边界样例"） */
export function arraySamples(normal, edge, { expectNormal, expectEdge, normalLabel, edgeLabel } = {}) {
  return [
    {
      id: 'normal',
      label: normalLabel || `[${normal.join(',')}]`,
      input: { array: normal },
      expect: expectNormal,
    },
    {
      id: 'edge',
      label: edgeLabel || `[${edge.join(',')}]`,
      input: { array: edge },
      expect: expectEdge,
    },
  ];
}

/** 生成"哈希/矩阵"等场景里常用的字母标签 */
export function letter(i) {
  return String.fromCharCode(65 + i);
}

/** 稳定排序的期望结果（按原下标打标签后排序） */
export function stableSorted(values) {
  const labels = labelsOf(values);
  const idx = values.map((v, i) => i).sort((x, y) => (values[x] - values[y]) || (x - y));
  return { array: idx.map((i) => values[i]), labels: idx.map((i) => labels[i]) };
}
