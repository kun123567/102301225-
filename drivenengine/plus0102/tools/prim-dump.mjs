/**
 * tools/prim-dump.mjs -- 打印某案例某一步的最终图元（polish 之后），排查用
 * 用法：node tools/prim-dump.mjs <uid> [variantId] [stepIndex] [styleFilter] [--style N]
 *   --style N：先按页面"画法"把每层换算成 style N（复现截图现场用）
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const argv = process.argv.slice(2);
const fi = argv.indexOf('--style');
const forceStyle = fi >= 0 ? Number(argv[fi + 1]) : null;
const pos = argv.filter((a, i) => !a.startsWith('--style') && (fi < 0 || i !== fi + 1));
const [uid, variant = 'v1', stepArg = '0', styleArg = ''] = pos;
const RECT = { x: 0, y: 0, w: 1000, h: 300 };

const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { dispatch } = await import(pathToFileURL(join(ROOT, 'vendor/engine/dispatch.js')).href);
const { polishLayout } = await import(pathToFileURL(join(ROOT, 'app/canvas-stage.js')).href);

const item = ITEMS.find((i) => i.uid === uid);
if (!item) { console.error('没有这个案例：' + uid); process.exit(1); }
const mod = await import(pathToFileURL(join(ROOT, 'vendor', item.path)).href);
const trace = mod.run(variant, (mod.samples?.[0] || {}).input || {});
const step = trace.steps[Number(stepArg)];
if (!step) { console.error('没有这一步'); process.exit(1); }
if (forceStyle != null) {
  const { adaptStepLayers } = await import(pathToFileURL(join(ROOT, 'vendor/app/adapt.js')).href);
  step.layers = adaptStepLayers(step, forceStyle, { props: {} }).layers;
}
console.log(`uid=${uid} variant=${variant} step=${stepArg} · ${(step.note || '').slice(0, 60)}`);

for (const layer of step.layers || []) {
  if (styleArg && String(layer.style) !== styleArg) continue;
  const out = dispatch(layer.style).instance.layout(layer, RECT, { bg: '#fff' });
  polishLayout(out.prims || [], RECT, layer.style);
  console.log(`\n--- layer ${layer.id} style ${layer.style} · ${(out.prims || []).length} prims ---`);
  for (const p of out.prims || []) {
    if (p.kind === 'rect') console.log(`  rect   ${p.key}  x=${r(p.x)} y=${r(p.y)} w=${r(p.w)} h=${r(p.h)}`);
    else if (p.kind === 'circle') console.log(`  circle ${p.key}  c=${r(p.cx)},${r(p.cy)} r=${p.r}`);
    else if (p.kind === 'line') console.log(`  line   ${p.key}  ${r(p.x1)},${r(p.y1)} -> ${r(p.x2)},${r(p.y2)}${p.dash ? ' [dash]' : ''}`);
    else if (p.kind === 'chip') console.log(`  chip   ${p.key}  c=${r(p.x)},${r(p.y)} "${p.text}"`);
    else if (p.kind === 'text') console.log(`  text   ${p.key}  ${r(p.x)},${r(p.y)} "${p.text}"`);
    else console.log(`  ${p.kind} ${p.key}`);
  }
}
function r(v) { return Math.round(v * 10) / 10; }
