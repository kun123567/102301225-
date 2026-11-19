/**
 * tools/overlap-audit.mjs -- 全量"图元重叠"审计（纯 node，不画像素，只算 bbox）
 *
 * 检查四类重叠（都是"标注压结构/标注压标注"）：
 *   ① 指针气泡 `ptr-*`  × 区间框 `range`
 *   ② 指针气泡 `ptr-*`  × 指针气泡（同一层内互相压）
 *   ③ 区间标签 `range-label` × X 轴线 `axis-x`
 *   ④ 区间标签 `range-label` × 下标文字 `idx-*`
 *
 * 对 54 案例 × 3 变体的**每一步**统计"修（polishLayout）之前 / 之后"的重叠数，
 * 用来证明微调真的把画布内的相压清掉了，而不是靠肉眼。
 *
 * 用法：node tools/overlap-audit.mjs [--verbose]
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const VERBOSE = process.argv.includes('--verbose');
// 画布尺寸可覆盖：--rect 685x300（贴近用户实际窗口里的卡片宽度，卡片高固定 300）
const rectArg = (process.argv.find((a) => a.startsWith('--rect')) || '').split('=')[1]
  || process.argv[process.argv.indexOf('--rect') + 1];
const [rw, rh] = /^\d+x\d+$/.test(rectArg || '') ? rectArg.split('x').map(Number) : [1000, 300];
const RECT = { x: 0, y: 0, w: rw, h: rh };

const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { dispatch } = await import(pathToFileURL(join(ROOT, 'vendor/engine/dispatch.js')).href);
const { polishLayout } = await import(pathToFileURL(join(ROOT, 'app/canvas-stage.js')).href);

/* ---------------- bbox ---------------- */
function textWidth(s, size) {
  let w = 0;
  for (const ch of String(s ?? '')) w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? size : size * 0.55;
  return w;
}
function bbox(p) {
  if (!p) return null;
  if (p.kind === 'rect') return { x: p.x, y: p.y, w: p.w, h: p.h };
  if (p.kind === 'chip') {
    const w = textWidth(p.text, p.size || 11) + 14, h = (p.size || 11) + 10;
    return { x: p.x - w / 2, y: p.y - h / 2, w, h };
  }
  if (p.kind === 'text') {
    const size = 11, w = textWidth(p.text, size), h = size + 2;
    const align = p.align || 'center';
    const x = align === 'right' ? p.x - w : align === 'left' ? p.x : p.x - w / 2;
    return { x, y: p.y - h / 2, w, h };
  }
  if (p.kind === 'line') {
    return { x: Math.min(p.x1, p.x2), y: Math.min(p.y1, p.y2), w: Math.abs(p.x2 - p.x1) || 1, h: Math.abs(p.y2 - p.y1) || 1 };
  }
  return null;
}
const area = (b) => Math.max(0, b.w) * Math.max(0, b.h);
function inter(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}
/** 有实质重叠（>15% 较小面积）才算 */
function overlaps(a, b) {
  const ia = inter(a, b);
  const min = Math.min(area(a), area(b));
  return min > 0 && ia / min > 0.15;
}
/** 交集 / 较小面积 */
function ratioOf(a, b) {
  const min = Math.min(area(a), area(b));
  return min > 0 ? inter(a, b) / min : 0;
}

/* ---------------- 检查一层 ---------------- */
function checkLayer(prims) {
  const chips = prims.filter((p) => p.kind === 'chip' && /^ptr-/.test(p.key || ''));
  const range = prims.find((p) => p.key === 'range');
  const label = prims.find((p) => p.key === 'range-label');
  const axis = prims.find((p) => p.key === 'axis-x');
  const idxs = prims.filter((p) => /^idx-/.test(p.key || ''));
  // 结点框 / 格子框：气泡压上去就是"错位"（链表的 next/cur 被推进框里那次就是这一类）
  const boxes = prims.filter((p) => p.kind === 'rect' && p.key !== 'range');
  let n = 0;
  const hits = [];
  if (range) {
    const rb = bbox(range);
    for (const c of chips) if (overlaps(bbox(c), rb)) { n++; hits.push(c.key + '×range'); }
  }
  for (let i = 0; i < chips.length; i++) {
    for (let j = i + 1; j < chips.length; j++) {
      if (overlaps(bbox(chips[i]), bbox(chips[j]))) { n++; hits.push(chips[i].key + '×' + chips[j].key); }
    }
  }
  // 气泡压到"结点框 / 格子框"上：只有**半压**（跨在边框上）才算错位；
  // 整个装进框里属于"贴在格子里当小徽标"，是允许的画法（polish 的 relocateFloatingChips 就是这个口径）。
  for (const c of chips) {
    const cb = bbox(c);
    for (const b of boxes) {
      const bb = bbox(b);
      const r = ratioOf(cb, bb);
      if (r > 0.15 && r <= 0.85) { n++; hits.push(c.key + '×' + b.key); }
    }
  }
  if (label && axis && overlaps(bbox(label), bbox(axis))) { n++; hits.push('range-label×axis-x'); }
  if (label) for (const t of idxs) if (overlaps(bbox(label), bbox(t))) { n++; hits.push('range-label×' + t.key); }
  return { n, hits };
}

/* ---------------- 出界检查（气泡摊开后不许被画布裁掉） ---------------- */
function outOfBounds(prims, rect, pad = 2) {
  const bad = [];
  for (const p of prims) {
    const b = bbox(p);
    if (!b) continue;
    if (b.x < rect.x - pad || b.y < rect.y - pad || b.x + b.w > rect.x + rect.w + pad || b.y + b.h > rect.y + rect.h + pad) {
      bad.push(p.key || p.kind);
    }
  }
  return bad;
}

/* ---------------- 全量扫 ---------------- */
let cases = 0, steps = 0, before = 0, after = 0, oob = 0, oobBefore = 0;
const perCase = new Map();
const samples = [];
const oobSamples = [];

for (const item of ITEMS) {
  let mod;
  try { mod = await import(pathToFileURL(join(ROOT, 'vendor', item.path)).href); } catch { continue; }
  const input = (mod.samples?.[0] || {}).input || {};
  for (const v of item.variants || [{ id: 'v1' }]) {
    cases++;
    let trace;
    try { trace = mod.run(v.id, input); } catch { continue; }
    for (const st of trace.steps || []) {
      steps++;
      for (const layer of st.layers || []) {
        let out;
        try { out = dispatch(layer.style).instance.layout(layer, RECT, { bg: '#ffffff' }); } catch { continue; }
        const p1 = (out.prims || []).slice();
        const r1 = checkLayer(p1);
        // 复制一份再 polish（polishLayout 会就地改坐标）
        const p2 = p1.map((p) => ({ ...p }));
        polishLayout(p2, RECT, layer.style);
        const r2 = checkLayer(p2);
        before += r1.n;
        after += r2.n;
        const oobKeys = outOfBounds(p2, RECT);
        if (outOfBounds(p1, RECT).length) oobBefore++;
        if (oobKeys.length) {
          oob++;
          if (oobSamples.length < 5) oobSamples.push(item.uid + ' ' + v.id + ' :: ' + oobKeys.slice(0, 4).join(','));
        }
        if (r1.n > 0) {
          const key = item.uid + ' ' + v.id;
          perCase.set(key, (perCase.get(key) || 0) + r1.n);
          if (samples.length < 6) samples.push({ key, step: st.stepIndex ?? st.index, before: r1.hits.slice(0, 4), after: r2.hits.slice(0, 4) });
        }
      }
    }
  }
}

console.log('=== 图元重叠审计（54 案例 × 3 变体）===');
console.log(`扫描 ${cases} 变体 / ${steps} 步`);
console.log(`修（polishLayout）之前的重叠：${before} 处`);
console.log(`修之后的重叠：            ${after} 处`);
console.log(`出界（被画布裁掉）步数：修前 ${oobBefore} 步 → 修后 ${oob} 步`);
if (oobSamples.length) for (const s of oobSamples) console.log('  ' + s);
console.log('涉及案例数：' + perCase.size);
if (VERBOSE) {
  for (const [k, n] of [...perCase.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log('  ' + String(n).padStart(4) + '  ' + k);
}
console.log('\n=== 样例（修前 → 修后）===');
for (const s of samples) {
  console.log(`  ${s.key} #${s.step}`);
  console.log('     before: ' + (s.before.join(' , ') || '—'));
  console.log('     after : ' + (s.after.join(' , ') || '（无重叠）'));
}
process.exit(after === 0 ? 0 : 2);
