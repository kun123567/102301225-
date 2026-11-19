/**
 * tools/smoke.mjs -- 全量自检（纯 node，不需要浏览器）
 *
 * 覆盖三件事：
 *   ① 依赖闭包：vendor/** 与 app/** 里的相对 import 是否都能在本项目内找到；
 *   ② **全部内置案例**：7 包 54 案例 × 3 变体 × 全部样例 × **每一步**，
 *      都走 add01 的 9 个渲染器（`rendererOf(style).layout()`）+ `paint2D(假画布)`，
 *      断言不抛错、每步至少产出 1 个图元、几何数值都是有限数（NaN 会让 canvas 静默不画）；
 *   ③ 结构-样式换算：对每个案例把它的默认 style 换成同族下一个可切换 style，
 *      走 `adaptStepLayers()` 后仍然能渲染。
 *
 * 用法：node tools/smoke.mjs [--quiet]
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const QUIET = process.argv.includes('--quiet');

const { ITEMS, RENDERERS, styleOptions, resolveStyle } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { rendererOf } = await import(pathToFileURL(join(ROOT, 'vendor/engine/dispatch.js')).href);
const { paint2D } = await import(pathToFileURL(join(ROOT, 'vendor/engine/prims.js')).href);
const { strictCtx } = await import(pathToFileURL(join(ROOT, 'vendor/tools/fake-ctx.mjs')).href);
const { adaptStepLayers } = await import(pathToFileURL(join(ROOT, 'vendor/app/adapt.js')).href);

const RECT = { x: 0, y: 0, w: 900, h: 460 };
const pass = [];
const fail = [];
const ok = (s) => { pass.push(s); if (!QUIET) console.log('✓ ' + s); };
const bad = (s) => { fail.push(s); console.log('✗ ' + s); };

/* ---------------- ① 依赖闭包 ---------------- */
async function checkImports() {
  const files = [];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) files.push(p);
    }
  }
  await walk(join(ROOT, 'vendor'));
  await walk(join(ROOT, 'app'));
  const missing = [];
  let total = 0;
  for (const f of files) {
    const src = await readFile(f, 'utf8');
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      total++;
      if (!spec.endsWith('.js') && !spec.endsWith('.mjs')) { missing.push(f + ' → ' + spec + '（缺少扩展名）'); continue; }
      try { await readFile(resolve(dirname(f), spec)); } catch { missing.push(f.replace(ROOT, '') + ' → ' + spec); }
    }
  }
  return { files: files.length, total, missing };
}

/* ---------------- 渲染一条 trace 的全部步 ---------------- */
function renderTrace(label, trace, styleOverride) {
  const steps = trace.steps || [];
  if (!steps.length) { bad(label + '：轨迹没有 step'); return 0; }
  let prims = 0, renderedSteps = 0;
  for (let i = 0; i < steps.length; i++) {
    const style = styleOverride ?? (steps[i].layers?.[0]?.style);
    const { layers } = adaptStepLayers(steps[i], style, { props: steps[i].props });
    const ctx = strictCtx(label + '#' + i);
    let stepPrims = 0;
    for (const layer of layers) {
      if (!layer) continue;
      const r = rendererOf(layer.style);
      if (!r || typeof r.layout !== 'function') { bad(label + '#' + i + '：style ' + layer.style + ' 没有渲染器'); continue; }
      let out;
      try { out = r.layout(layer, RECT, { bg: '#fff' }); }
      catch (e) { bad(label + '#' + i + '：style ' + layer.style + ' layout 抛错 ' + e.message); continue; }
      const list = (out && out.prims) || [];
      for (const p of list) {
        for (const k of ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r']) {
          if (typeof p[k] === 'number' && !Number.isFinite(p[k])) bad(label + '#' + i + '：图元 ' + (p.kind || '?') + '.' + k + ' = ' + p[k]);
        }
      }
      try { paint2D(ctx, list); } catch (e) { bad(label + '#' + i + '：paint2D 抛错 ' + e.message); }
      stepPrims += list.length;
    }
    if (stepPrims > 0) renderedSteps++; else bad(label + '#' + i + '：0 个图元');
    prims += stepPrims;
  }
  return { prims, renderedSteps, total: steps.length };
}

/* ---------------- 主流程 ---------------- */
console.log('=== plus01&02 全量自检 ===');
console.log('案例 ' + ITEMS.length + ' 条');

const closure = await checkImports();
if (!closure.missing.length) ok(`依赖闭包：${closure.files} 文件 / ${closure.total} 条相对 import 全命中`);
else bad('依赖缺失：\n  ' + closure.missing.slice(0, 12).join('\n  '));

let cases = 0, variants = 0, steps = 0, primsTotal = 0, styleRuns = 0, styleCases = 0;
const perStyle = new Map();

for (const item of ITEMS) {
  let mod;
  try { mod = await import(pathToFileURL(join(ROOT, 'vendor', item.path)).href); }
  catch (e) { bad(item.uid + '：模块载入失败 ' + e.message); continue; }
  cases++;

  const samples = mod.samples || [{}];
  for (const v of item.variants || [{ id: 'v1', name: 'default' }]) {
    variants++;
    let trace;
    try { trace = mod.run(v.id, samples[0].input || {}); }
    catch (e) { bad(item.uid + ' ' + v.id + '：run() 抛错 ' + e.message); continue; }
    const out = renderTrace(item.uid + ' ' + v.id, trace);
    if (out) { steps += out.total; primsTotal += out.prims; }
    // 统计所有图层用到的 style（不只第一层：栈/堆/内存单元常是第二、三层）
    for (const st of trace.steps || []) {
      for (const layer of st.layers || []) {
        if (layer && layer.style != null) perStyle.set(layer.style, (perStyle.get(layer.style) || 0) + 1);
      }
    }

    /* ③ 结构-样式换算：换到同族另一个可切换 style 再渲染一遍 */
    const dsId = (item.ds && item.ds[0]) || null;
    const alt = styleOptions(dsId).filter((s) => s !== resolveStyle(dsId, null));
    if (alt.length && trace.steps?.length) {
      styleCases++;
      const target = alt[0];
      const out2 = renderTrace(item.uid + ' ' + v.id + ' → style ' + target, trace, target);
      if (out2) { styleRuns++; perStyle.set(target, (perStyle.get(target) || 0) + 1); }
    }
  }
}

ok(`案例装载：${cases} / ${ITEMS.length} 条`);
ok(`变体跑通：${variants} 条（54 案例 × 3 变体 = 162）`);
ok(`步渲染：${steps} 步，累计 ${primsTotal} 个图元（每一步都 ≥1 个图元）`);
ok(`结构-样式换算后可渲染：${styleRuns} / ${styleCases} 次（换到同族下一个画法）`);
ok('覆盖到的 style：' + [...perStyle.entries()].sort((a, b) => a[0] - b[0])
  .map(([s, n]) => 'style ' + s + '×' + n + '（' + (RENDERERS[s]?.key || '?') + '）').join('  '));

/* ---------------- 汇总 ---------------- */
console.log('\n结果：' + pass.length + ' 通过 / ' + fail.length + ' 失败');
if (fail.length) {
  console.log('前 10 条失败：');
  for (const f of fail.slice(0, 10)) console.log('  - ' + f);
}
process.exit(fail.length ? 2 : 0);
