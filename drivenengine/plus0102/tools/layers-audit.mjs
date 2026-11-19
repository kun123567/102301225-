// 对比：06 的 viewer「每层一张 canvas」 vs plus01&02「所有层叠在一张 canvas」
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));  // plus01&02/
const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);

const check = async (uid) => {
  const item = ITEMS.find((i) => i.uid === uid);
  const mod = await import(pathToFileURL(join(ROOT, 'vendor', item.path)).href);
  const trace = mod.run(item.variants[0].id, (mod.samples[0] || {}).input || {});
  const counts = new Map();
  for (const st of trace.steps || []) {
    const n = (st.layers || []).length;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  const st0 = trace.steps.find((s) => (s.layers || []).length > 1) || trace.steps[0];
  console.log(`\n=== ${uid} · ${trace.steps.length} 步 ===`);
  console.log('每步 layer 数分布：' + [...counts.entries()].map(([n, c]) => n + ' 层 × ' + c + ' 步').join('，'));
  console.log('示例步（#0）的 layers：');
  for (const l of st0.layers || []) {
    console.log('  id=' + (l.id || '?') + '  style=' + l.style + '  kind=' + (l.data?.kind || Object.keys(l.data || {}).join('/')) +
      '  name=' + (l.data?.name || '') + '  values=' + JSON.stringify(l.data?.values || l.data?.cells?.length || l.data?.nodes?.length || ''));
  }
};

for (const uid of ['a/binary-insertion-sort', 'a/insertion-sort', 'f/bracket-matching', 'b/bfs', 'c/b-tree', 'd/hash-linear-probing']) {
  try { await check(uid); } catch (e) { console.log(uid + ' 失败：' + e.message); }
}

// 统计全部案例：一步最多几层、平均几层
let maxLayers = 0, stepsWithMulti = 0, stepsAll = 0; const multiCases = new Map();
for (const item of ITEMS) {
  const mod = await import(pathToFileURL(join(ROOT, 'vendor', item.path)).href);
  const trace = mod.run(item.variants[0].id, (mod.samples[0] || {}).input || {});
  for (const st of trace.steps || []) {
    stepsAll++;
    const n = (st.layers || []).length;
    maxLayers = Math.max(maxLayers, n);
    if (n > 1) { stepsWithMulti++; multiCases.set(item.uid, (multiCases.get(item.uid) || 0) + 1); }
  }
}
console.log('\n=== 全局统计（54 案例 × v1）===');
console.log('单步最大 layer 数：' + maxLayers);
console.log('多 layer 的步：' + stepsWithMulti + ' / ' + stepsAll);
console.log('涉及案例数：' + multiCases.size);
console.log([...multiCases.entries()].slice(0, 12).map(([k, n]) => '  ' + k + '：' + n + ' 步').join('\n'));
