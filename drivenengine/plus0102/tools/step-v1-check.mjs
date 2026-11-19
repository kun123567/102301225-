/**
 * tools/step-v1-check.mjs -- 迁移可行性量化：plus01&02 的步进能不能塞进 datastructure-agent 的 Step v1
 *
 * 回答的问题（`raw/datastructure-agent` 要接 plus01&02 的 54 案例时）：
 *   ① 有多少步能**只用现有 schema 字段**表达（= 现有 SVG 原型 + CSS 动画直接能吃）
 *   ② 有多少步必须**扩展 schema**（族不是 array/graph）
 *   ③ 需要新写几个 SVG 原型、各自多少案例
 *
 * 用法：node tools/step-v1-check.mjs [--pkgs C,D,E,F|all]
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const argv = process.argv.slice(2);
const pkgsArg = (() => { const i = argv.indexOf('--pkgs'); return i >= 0 ? argv[i + 1] : 'all'; })();
const WANT = pkgsArg === 'all' ? null : new Set(pkgsArg.split(',').map((s) => s.trim().toUpperCase()));

const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { toStepV1, COVERED_BY_EXISTING_PROTOTYPE } = await import(pathToFileURL(join(ROOT, 'app/step-adapter.js')).href);

const byFamily = new Map();       // family -> { cases:Set, steps, extSteps, extFields:Set }
let totalSteps = 0;
let compatSteps = 0;
const lossyNotes = new Map();

for (const it of ITEMS) {
  const pkg = String(it.uid).split('/')[0].toUpperCase();
  if (WANT && !WANT.has(pkg)) continue;
  let mod;
  try { mod = await import(pathToFileURL(join(ROOT, 'vendor', it.path)).href); } catch { continue; }
  const input = (mod.samples?.[0] || {}).input || {};
  for (const v of it.variants || []) {
    let trace;
    try { trace = mod.run(v.id, input); } catch { continue; }
    (trace.steps || []).forEach((st, i) => {
      const { family, usesExt, lossy } = toStepV1(st, { uid: it.uid, variantId: v.id, stepIndex: i });
      totalSteps += 1;
      if (!usesExt.length) compatSteps += 1;
      const rec = byFamily.get(family) || { cases: new Set(), steps: 0, extSteps: 0, extFields: new Set() };
      rec.cases.add(it.uid);
      rec.steps += 1;
      if (usesExt.length) rec.extSteps += 1;
      usesExt.forEach((f) => rec.extFields.add(f.split('{')[0]));
      byFamily.set(family, rec);
      for (const l of lossy) lossyNotes.set(l, (lossyNotes.get(l) || 0) + 1);
    });
  }
}

console.log(`=== Step v1 迁移可行性（包：${pkgsArg}）===`);
console.log(`总步数 ${totalSteps}，其中**只用现有 schema 字段**就能表达：${compatSteps}（${(compatSteps / totalSteps * 100).toFixed(1)}%）\n`);
console.log('族            案例  步数   要扩 schema 的步   需要的扩展字段            现有 SVG 原型');
for (const [family, r] of [...byFamily.entries()].sort((a, b) => b[1].steps - a[1].steps)) {
  const covered = COVERED_BY_EXISTING_PROTOTYPE.has(family);
  console.log(`  ${family.padEnd(12)} ${String(r.cases.size).padStart(3)}  ${String(r.steps).padStart(5)}   ${String(r.extSteps).padStart(6)}            ${[...r.extFields].join(',').padEnd(22)} ${covered ? '有（直接复用）' : '✗ 需新写'}`);
}
if (lossyNotes.size) {
  console.log('\n有损点：');
  for (const [k, n] of lossyNotes) console.log(`  ${n} 步：${k}`);
}
const needPrototype = [...byFamily.keys()].filter((f) => !COVERED_BY_EXISTING_PROTOTYPE.has(f));
console.log(`\n结论：需要新写 ${needPrototype.length} 个 SVG 原型（${needPrototype.join(' / ')}）；` +
  `现有 array / graph 两个原型可原样复用。`);
