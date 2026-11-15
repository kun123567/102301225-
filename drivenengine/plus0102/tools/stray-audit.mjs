/**
 * tools/stray-audit.mjs -- 找出"悬空线段/孤立方块"证据。
 *
 * 判据（不猜 key，只量几何）：
 *   1) line 的两个端点都不贴着任何圆节点（距离 > r + tol）=> 悬空线
 *   2) line 的两个端点都不贴着任何 rect（框类，如矩阵单元）=> 悬空线
 *   3) chip / text 的包围盒与所有其它图元都不接触 => 孤立物
 * 输出命中明细：step / layer / key / 几何，便于对照截图定位。
 *
 * 用法：
 *   node tools/stray-audit.mjs               # 全案例扫描，只打印有命中的
 *   node tools/stray-audit.mjs <uid> [variant] [--style N] [--all]  # 单案例（--all 打印全部图元）
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const argv = process.argv.slice(2);
const fi = argv.indexOf('--style');
const forceStyle = fi >= 0 ? Number(argv[fi + 1]) : null;
const wi = argv.indexOf('--w');
const sz = argv.indexOf('--sizes');
/* 多尺寸扫描：**卡片真实尺寸只有 ~300×217**，排版分支（换行 / 标题让位 / 内容整体下移）
   只在"窄且矮"的卡片里才走到——只量 1000×300 会漏掉整类 bug
   （"落点小圆比箭头高 35.5px" 就是这么漏的：那次下移就发生在 301×217 上）。 */
const sizes = sz >= 0
  ? String(argv[sz + 1]).split(',').map((s) => s.split('x').map(Number)).map(([w, h]) => ({ w, h }))
  : (wi >= 0
    ? String(argv[wi + 1]).split(',').map((w) => ({ w: Number(w), h: 300 }))
    : [{ w: 301, h: 217 }, { w: 300, h: 160 }, { w: 300, h: 300 }, { w: 480, h: 260 }, { w: 900, h: 300 }]);
const all = argv.includes('--all');
const pos = argv.filter((a, i) => !a.startsWith('--') && (fi < 0 || i !== fi + 1) && (wi < 0 || i !== wi + 1) && (sz < 0 || i !== sz + 1));
const [uid, variant = 'v1'] = pos;

let RECT = { x: 0, y: 0, w: 1000, h: 300 };
const TOL = 6;

const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { dispatch } = await import(pathToFileURL(join(ROOT, 'vendor/engine/dispatch.js')).href);
const { polishLayout } = await import(pathToFileURL(join(ROOT, 'app/canvas-stage.js')).href);
const { adaptStepLayers } = await import(pathToFileURL(join(ROOT, 'vendor/app/adapt.js')).href);

const r = (v) => Math.round(v * 10) / 10;

function circleOf(p) {
  return p.kind === 'circle' ? { x: p.cx, y: p.cy, r: p.r || 0 } : null;
}
function boxOf(p) {
  if (p.kind === 'rect') return { x: p.x, y: p.y, w: p.w, h: p.h };
  if (p.kind === 'chip') {
    const w = p.w ?? 40, h = p.h ?? 20;
    return { x: p.x - w / 2, y: p.y - h / 2, w, h };
  }
  return null;
}
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function toBox(x, y, b) {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}
function segToBox(x1, y1, x2, y2, b) {
  let best = Infinity;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    best = Math.min(best, toBox(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, b));
  }
  return best;
}

function auditLayer(layer, stepIdx) {
  const out = dispatch(layer.style).instance.layout(layer, RECT, { bg: '#fff' });
  const prims = out.prims || [];
  polishLayout(prims, RECT, layer.style);
  const circles = prims.map(circleOf).filter(Boolean);
  const boxes = prims.map(boxOf).filter(Boolean);
  const hits = [];
  const lines = prims.filter((p) => p.kind === 'line');

  for (const ln of lines) {
    // 端点贴圆？
    const nearCircle = (x, y) =>
      circles.some((c) => Math.abs(dist(x, y, c.x, c.y) - c.r) <= TOL + 2 || dist(x, y, c.x, c.y) <= c.r + TOL);
    const e1 = nearCircle(ln.x1, ln.y1);
    const e2 = nearCircle(ln.x2, ln.y2);
    // 线段是否穿过/贴着某个框（矩阵网格线、框类连线的合法形态）
    const onBox = boxes.some((b) => segToBox(ln.x1, ln.y1, ln.x2, ln.y2, b) <= TOL);
    // 端点贴着另一个 line 的交点也算合法（分叉/折线）
    const nearOtherLine = (x, y, self) =>
      lines.some((o) => o !== self && segToBox(x, y, x, y, { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1) || 1, h: Math.abs(o.y2 - o.y1) || 1 }) <= TOL);
    const orphan = !onBox && !(e1 && e2) && !nearOtherLine(ln.x1, ln.y1, ln) && !nearOtherLine(ln.x2, ln.y2, ln);
    const len = dist(ln.x1, ln.y1, ln.x2, ln.y2);
    if (orphan && (e1 || e2 || len < 140 || all)) {
      hits.push(`  悬空线  step ${stepIdx} layer ${layer.id} style ${layer.style}  key=${ln.key}  (${r(ln.x1)},${r(ln.y1)})->(${r(ln.x2)},${r(ln.y2)}) len=${r(len)} dash=${!!ln.dash} endNearCircle=${e1}/${e2} onBox=${onBox}`);
    }
  }
  /* 落点小圆必须贴在自己的折线末端：`dot-<a>-<b>` ↔ `link-<a>-<b>`。
     这是"图层整体平移漏掉某个元素"的最小可判据（用户报的"忽然飞起来的灰点"）。 */
  const byKey = new Map(prims.map((p) => [String(p.key), p]));
  for (const p of prims) {
    const m = /^dot-(.+)$/.exec(String(p.key || ''));
    if (!m || p.kind !== 'circle') continue;
    const link = byKey.get('link-' + m[1]);
    if (!link || link.kind !== 'poly' || !(link.pts || []).length) continue;
    const tip = link.pts[link.pts.length - 1];
    dotChecks += 1;
    const d = dist(p.cx, p.cy, tip[0], tip[1]);
    if (d > 1.5) hits.push(`  落点离群  step ${stepIdx} w${RECT.w} layer ${layer.id} style ${layer.style}  key=${p.key}  圆(${r(p.cx)},${r(p.cy)}) 但折线末端(${r(tip[0])},${r(tip[1])}) 差 ${r(d)}px`);
  }

  /* 线索虚线不许和树边实线挤在同一条走廊里（虚压实则读者分不清哪条是线索）。
     判据：虚线中段与任一实线相交、或最近距离 < 2px。 */
  const segsOf = (p) => {
    if (p.kind === 'line') return [[p.x1, p.y1, p.x2, p.y2]];
    if (p.kind === 'poly' && Array.isArray(p.pts)) {
      const out2 = [];
      for (let i = 1; i < p.pts.length; i++) out2.push([p.pts[i - 1][0], p.pts[i - 1][1], p.pts[i][0], p.pts[i][1]]);
      return out2;
    }
    return [];
  };
  const crossed = (a, b) => {
    const [ax, ay, bx, by] = a, [cx, cy, dx2, dy2] = b;
    const d = (bx - ax) * (dy2 - cy) - (by - ay) * (dx2 - cx);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((cx - ax) * (dy2 - cy) - (cy - ay) * (dx2 - cx)) / d;
    const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  const dashed = prims.filter((p) => p.dash && (p.kind === 'line' || p.kind === 'poly'));
  const solidSegs = prims.filter((p) => !p.dash && p.kind === 'line').flatMap(segsOf)
    .concat(prims.filter((p) => !p.dash && p.kind === 'poly').flatMap(segsOf));
  const distPointSeg = (px, py, s) => {
    const vx = s[2] - s[0], vy = s[3] - s[1];
    const vl2 = vx * vx + vy * vy || 1;
    let t = ((px - s[0]) * vx + (py - s[1]) * vy) / vl2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (s[0] + vx * t), py - (s[1] + vy * t));
  };
  /* 沿**整条**虚线的弧长取样（不是逐段取中点）：逐段会把"贴近结点出口"的那一小段
     当成问题——线索和树边都从同一个结点出发，端点附近必然贴着，那不是缺陷。
     真正要抓的是"中段整段压在一起"（虚压在实上，读者分不清哪条是线索）。 */
  const samplePolyline = (segs, u) => {
    const lens = segs.map((s) => Math.hypot(s[2] - s[0], s[3] - s[1]));
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    let want = total * u;
    for (let i = 0; i < segs.length; i++) {
      if (want <= lens[i] || i === segs.length - 1) {
        const t = lens[i] ? Math.min(1, want / lens[i]) : 0;
        const s = segs[i];
        return [s[0] + (s[2] - s[0]) * t, s[1] + (s[3] - s[1]) * t];
      }
      want -= lens[i];
    }
    return [segs[0][0], segs[0][1]];
  };
  for (const dp of dashed) {
    if (!/^th-/.test(String(dp.key || ''))) continue;
    const segs = segsOf(dp);
    if (!segs.length) continue;
    threadChecks += 1;

    /* ① 压线：中段 9 个采样点里有 ≥35% 贴着某条实线 —— 这才是"虚线压在实线上"。
       单纯相交（一两处穿过）是树图里必然的，不算缺陷。 */
    let hug = 0;
    for (let k = 1; k <= 9; k++) {
      const [px, py] = samplePolyline(segs, k / 10);
      for (const s of solidSegs) if (distPointSeg(px, py, s) < 2) { hug += 1; break; }
    }
    if (hug / 9 >= 0.35) hits.push(`  线索压实线  step ${stepIdx} ${RECT.w}x${RECT.h} layer ${layer.id} style ${layer.style}  key=${dp.key}  中段 ${Math.round(hug / 9 * 100)}% 贴着实线`);

    /* ② 出入点：线索必须从结点**侧面**进出（不再和树边抢上下沿）。
       判据：每个端点都落在一个圆的左右侧边框上（|y-cy|≤4 且 ||x-cx|-r|≤4）。 */
    const ends = [segs[0].slice(0, 2), [segs[segs.length - 1][2], segs[segs.length - 1][3]]];
    for (const [ex, ey] of ends) {
      const cc = circles.find((q) => Math.hypot(q.x - ex, q.y - ey) <= q.r + 4);
      if (!cc) continue;
      const onSide = Math.abs(ey - cc.y) <= 4 && Math.abs(Math.abs(ex - cc.x) - cc.r) <= 4;
      if (!onSide) {
        hits.push(`  线索非侧面出入  step ${stepIdx} ${RECT.w}x${RECT.h} layer ${layer.id} style ${layer.style}  key=${dp.key}  端点(${r(ex)},${r(ey)}) 不在圆(${r(cc.x)},${r(cc.y)},r${cc.r}) 的左右侧边`);
        break;
      }
    }
  }

  /* 结点值文本必须落在自己的结点体里：`nv-<id>` ↔ `n-<id>`(圆) / `nfill-<id>`(框)。
     同一个"图层被平移/重排却漏掉某个元素"的 bug 类，这是第二根探针。 */
  for (const p of prims) {
    if (p.kind !== 'text') continue;
    const m = /^nv-(.+)$/.exec(String(p.key || ''));
    if (!m) continue;
    const id = m[1];
    const body = byKey.get('n-' + id) || byKey.get('nfill-' + id) || byKey.get('tn-' + id) || byKey.get('cn-' + id);
    if (!body) continue;
    let inside = false;
    if (body.kind === 'circle') inside = dist(p.x, p.y, body.cx, body.cy) <= body.r + 2;
    else if (body.kind === 'rect') inside = p.x >= body.x - 2 && p.x <= body.x + body.w + 2 && p.y >= body.y - 2 && p.y <= body.y + body.h + 2;
    if (!inside) {
      labelChecks += 1;
      hits.push(`  值文本离体  step ${stepIdx} w${RECT.w} layer ${layer.id} style ${layer.style}  key=${p.key}  文本(${r(p.x)},${r(p.y)}) 结点体不在附近`);
    } else labelChecks += 1;
  }

  if (all) {
    for (const p of prims) {
      if (p.kind === 'line') continue;
      const c = circleOf(p);
      const b = boxOf(p);
      const geo = c ? `c=${r(c.x)},${r(c.y)} r=${r(c.r)}` : b ? `x=${r(b.x)} y=${r(b.y)} w=${r(b.w)} h=${r(b.h)}` : p.kind === 'text' ? `x=${r(p.x)} y=${r(p.y)} "${p.text}"` : '';
      hits.push(`  [all] ${p.kind.padEnd(6)} key=${p.key}  ${geo}`);
    }
  }
  return { hits, n: prims.length };
}

const items = uid ? ITEMS.filter((i) => i.uid === uid) : ITEMS;
if (!items.length) { console.error('没有这个案例：' + uid); process.exit(1); }

let totalHits = 0, totalSteps = 0, totalPrims = 0, dotChecks = 0, labelChecks = 0, threadChecks = 0;
for (const sz2 of sizes) {
  RECT = { x: 0, y: 0, w: sz2.w, h: sz2.h };
  for (const item of items) {
    const mod = await import(pathToFileURL(join(ROOT, 'vendor', item.path)).href);
    const trace = mod.run(variant, (mod.samples?.[0] || {}).input || {});
    (trace.steps || []).forEach((step, si) => {
      let layers = step.layers || [];
      if (forceStyle != null) layers = adaptStepLayers(step, forceStyle, { props: {} }).layers;
      for (const layer of layers) {
        const { hits, n } = auditLayer(layer, si);
        totalSteps++;
        totalPrims += n;
        if (hits.length) {
          if (totalHits === 0) console.log(`\n=== ${item.uid} (${item.title || ''}) ===`);
          totalHits += hits.length;
          for (const h of hits) console.log(h);
        }
      }
    });
  }
}
console.log(`\n扫描：${items.length} 案例 × ${sizes.length} 尺寸(${sizes.map((s) => s.w + 'x' + s.h).join('/')}) / ${totalSteps} 层步 / ${totalPrims} 图元 / 落点圆校验 ${dotChecks} 对 / 值文本校验 ${labelChecks} 个 / 线索虚线校验 ${threadChecks} 条 —— 命中 ${totalHits} 条`);
