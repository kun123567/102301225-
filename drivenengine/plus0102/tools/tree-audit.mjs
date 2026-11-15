/**
 * tools/tree-audit.mjs -- style 9（树 / TTreeForm canvas 后端）排布审计
 *
 * 检查 `vendor/engine/renderers/tree.js › layoutAsCanvas` 的排布缺陷，以及 `polishTreeCanvas` 的修复效果：
 *   ① 结点完全重叠：两个圆落在同一位置（孤立结点没被 assign → 全叠在 (500,62)）
 *   ② 塌成竖直单列：≥3 个圆但只有 1 个不同 x（单孩子链没左右偏移）
 *   ③ 圆与圆实质相交
 *   ④ badge 气泡与所在结点圆相交 / 与其他结点的文字、气泡相交
 *   ⑤ 指针气泡与其他图元相交
 *   ⑥ 出界（被画布裁掉）
 *
 * 对全部 style 9 的**每一层**统计"修（polishTreeCanvas）之前 / 之后"，输出两个数字。
 *
 * 用法：node tools/tree-audit.mjs [--verbose]
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const VERBOSE = process.argv.includes('--verbose');
const RECT = { x: 0, y: 0, w: 1000, h: 300 };

const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { dispatch } = await import(pathToFileURL(join(ROOT, 'vendor/engine/dispatch.js')).href);
const { polishTreeCanvas } = await import(pathToFileURL(join(ROOT, 'app/canvas-stage.js')).href);
const { primBox, overlapRatio } = await import(pathToFileURL(join(ROOT, 'app/layout-policy.js')).href);   // 与页面同一套几何

/* ---------------- bbox ---------------- */
function bbox(p) { return primBox(p); }
const area = (b) => Math.max(0, b.w) * Math.max(0, b.h);
function hit(a, b) { return overlapRatio(a, b) > 0.15; }

/* ---------------- 一层体检 ---------------- */
function check(prims) {
  const circles = prims.filter((p) => p.kind === 'circle');
  const badges = prims.filter((p) => p.kind === 'chip' && /^nb-/.test(p.key || ''));
  const ptrs = prims.filter((p) => p.kind === 'chip' && /^ptr-/.test(p.key || ''));
  const labels = prims.filter((p) => (p.kind === 'text' && /^(nv|nval)-/.test(p.key || '')));
  const tagsList = prims.filter((p) => (p.kind === 'text' && /^et-/.test(p.key || '')));
  const res = { stacked: 0, column: 0, circleHit: 0, badgeOnNode: 0, badgeText: 0, tagHit: 0, ptrHit: 0, oob: 0, worst: [] };

  // ① 完全重叠 / ② 单列
  const byPos = new Map();
  for (const c of circles) {
    const k = Math.round(c.cx) + ',' + Math.round(c.cy);
    byPos.set(k, (byPos.get(k) || 0) + 1);
  }
  res.stacked = [...byPos.values()].filter((n) => n > 1).length;
  if (circles.length >= 3 && new Set(circles.map((c) => Math.round(c.cx))).size === 1) res.column = 1;

  // ③ 圆与圆
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i];
      const b = circles[j];
      if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r - 0.5) res.circleHit++;
    }
  }
  // ④ badge × 自己的结点圆 / 别人的文字
  for (const b of badges) {
    const id = String(b.key).replace(/^nb-/, '');
    const own = circles.find((c) => c.key === 'n-' + id);
    if (own && hit(bbox(b), bbox(own))) res.badgeOnNode++;
    for (const q of [...labels, ...badges]) {
      if (q === b) continue;
      const qid = String(q.key || '').replace(/^(n|nb|nv|nval)-/, '');
      if (qid === id && !/^nv-/.test(q.key || '')) continue;   // 同一结点的 badge/值不算
      if (hit(bbox(b), bbox(q))) { res.badgeText++; res.worst.push('badge:' + b.key + '×' + q.key); }
    }
  }
  // ⑤ 指针气泡 × 其它非本组图元
  for (const p of ptrs) {
    const id = String(p.key).replace(/^ptr-/, '');
    for (const q of [...circles, ...badges, ...labels]) {
      const qid = String(q.key || '').replace(/^(n|nb|nv|nval)-/, '');
      if (qid === id) continue;
      if (hit(bbox(p), bbox(q))) { res.ptrHit++; res.worst.push('ptr:' + p.key + '×' + q.key); }
    }
  }
  // ⑤b 边标签（L/R）与 badge、结点文字、圆相交
  for (const t of tagsList) {
    for (const q of [...badges, ...labels, ...circles]) {
      const qid = String(q.key || '').replace(/^(n|nb|nv|nval)-/, '');
      if (qid === String(t.key).replace(/^et-/, '')) continue;      // 自己那条边的孩子结点不算
      if (hit(bbox(t), bbox(q))) { res.tagHit++; res.worst.push('tag:' + t.key + '×' + q.key); }
    }
  }
  // ⑥ 出界
  for (const p of prims) {
    const b = bbox(p);
    if (!b) continue;
    if (b.x < RECT.x - 2 || b.y < RECT.y - 2 || b.x + b.w > RECT.x + RECT.w + 2 || b.y + b.h > RECT.y + RECT.h + 2) res.oob++;
  }
  return res;
}

/* ---------------- 全量扫 ---------------- */
const keys = ['stacked', 'column', 'circleHit', 'badgeOnNode', 'badgeText', 'tagHit', 'ptrHit', 'oob'];
const before = Object.fromEntries(keys.map((k) => [k, 0]));
const after = Object.fromEntries(keys.map((k) => [k, 0]));
let layers = 0;
const worst = new Map();
const afterDetail = [];

for (const it of ITEMS) {
  let mod;
  try { mod = await import(pathToFileURL(join(ROOT, 'vendor', it.path)).href); } catch { continue; }
  const input = (mod.samples?.[0] || {}).input || {};
  for (const v of it.variants || []) {
    let trace;
    try { trace = mod.run(v.id, input); } catch { continue; }
    for (const st of trace.steps || []) {
      for (const layer of st.layers || []) {
        if (layer.style !== 9) continue;
        let out;
        try { out = dispatch(9).instance.layout(layer, RECT, { bg: '#ffffff' }); } catch { continue; }
        layers++;
        const p1 = (out.prims || []).slice();
        const r1 = check(p1);
        const p2 = p1.map((p) => ({ ...p }));
        polishTreeCanvas(p2, RECT);
        const r2 = check(p2);
        for (const k of keys) { before[k] += r1[k]; after[k] += r2[k]; }
        const bad = keys.reduce((s, k) => s + r1[k], 0);
        if (r2.badgeText + r2.ptrHit > 0 && afterDetail.length < 24) {
          afterDetail.push(it.uid + ' ' + v.id + ' :: ' + r2.worst.slice(0, 4).join(' | '));
        }
        if (bad > 0) worst.set(it.uid + ' ' + v.id, (worst.get(it.uid + ' ' + v.id) || 0) + bad);
      }
    }
  }
}

const rows = [
  ['① 结点完全重叠（多个圆同一点）', 'stacked'],
  ['② 塌成竖直单列（≥3 圆只 1 个 x）', 'column'],
  ['③ 圆与圆实质相交', 'circleHit'],
  ['④a badge 压在自己的结点圆上', 'badgeOnNode'],
  ['④b badge 与其它结点的文字/气泡相交', 'badgeText'],
  ['⑤b 边标签 L/R 与 badge / 文字 / 圆相交', 'tagHit'],
  ['⑤ 指针气泡与其它图元相交', 'ptrHit'],
  ['⑥ 出界（被画布裁掉）', 'oob'],
];
console.log('=== style 9（树）排布审计：54 案例 × 3 变体中的全部 style 9 层 ===');
console.log(`扫描 ${layers} 层\n`);
console.log('检查项'.padEnd(38) + '修前'.padStart(8) + '修后'.padStart(8));
for (const [label, k] of rows) {
  console.log(label.padEnd(38) + String(before[k]).padStart(8) + String(after[k]).padStart(8));
}
if (VERBOSE) {
  console.log('\n=== 修前问题最多的案例 ===');
  for (const [k, n] of [...worst.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log('  ' + String(n).padStart(4) + '  ' + k);
}
if (afterDetail.length) {
  console.log('\n=== 修后仍有撞的层（前 24 条） ===');
  for (const s of afterDetail) console.log('  ' + s);
}
const totalAfter = keys.reduce((s, k) => s + after[k], 0);
console.log('\n修后合计问题：' + totalAfter);
process.exit(totalAfter === 0 ? 0 : 2);
