/**
 * tools/link-crossing-test.mjs —— style 3（链表）连线的几何回归
 *
 * 起因（用户实测）：单链表逆置之后 `next` 反向，早期 drawLink 只会画"右 → 左"的同行直线，
 * 反向指针就被画成一条**横穿两个结点**的长线。这条测试把"连线不许穿过结点内部"钉死：
 *
 *   ① 每个 link-* 折线的每一段都不许穿过任何 nfill-* 矩形的内部（内缩 1px 判定）
 *   ② 每条连线两端都必须贴在某个结点的边界上（±3px），否则就是"凭空飘出来的线"
 *   ③ 覆盖：所有 style 3 案例 × 全部变体 × 全部样例 × 全部步骤 × 4 种卡片宽度
 *
 * 用法：node tools/link-crossing-test.mjs
 */
import { ITEMS } from '../vendor/catalog/index.js';
import { dispatch } from '../vendor/engine/dispatch.js';
import { polishLayout } from '../app/canvas-stage.js';

const WIDTHS = [390, 540, 720, 960];
const TOL = 3;
let pass = 0;
const fails = [];

const ok = (label, extra) => { pass += 1; if (process.env.VERBOSE) console.log('  ✓ ' + label); };
const bad = (label, extra) => { fails.push(label + (extra ? '  → ' + extra : '')); };

const insideRect = (p, r) => p[0] > r.x + 1 && p[0] < r.x + r.w - 1 && p[1] > r.y + 1 && p[1] < r.y + r.h - 1;
function segmentCrosses(a, b, r) {
  const steps = 80;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (insideRect([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], r)) return true;
  }
  return false;
}
const onRectBorder = (p, r) => {
  const onV = (Math.abs(p[0] - r.x) <= TOL || Math.abs(p[0] - (r.x + r.w)) <= TOL) && p[1] >= r.y - TOL && p[1] <= r.y + r.h + TOL;
  const onH = (Math.abs(p[1] - r.y) <= TOL || Math.abs(p[1] - (r.y + r.h)) <= TOL) && p[0] >= r.x - TOL && p[0] <= r.x + r.w + TOL;
  return onV || onH;
};

const style3 = ITEMS.filter((it) => it.style === 3 || (Array.isArray(it.style) && it.style.includes(3)));
if (!style3.length) { console.error('没有 style 3 的案例'); process.exit(1); }

let layersChecked = 0;
let linksChecked = 0;

for (const item of style3) {
  const mod = await import('../vendor/' + item.path);
  const variants = (item.variants || [{ id: 'v1' }]).map((v) => v.id);
  const samples = mod.samples || [];
  for (const variant of variants) {
    for (const sample of samples) {
      const trace = mod.run(variant, sample.input || {});
      for (const [si, step] of (trace.steps || []).entries()) {
        for (const layer of step.layers || []) {
          if (layer.style !== 3) continue;
          for (const w of WIDTHS) {
            const rect = { x: 0, y: 0, w, h: 300 };
            const out = dispatch(layer.style).instance.layout(layer, rect, { bg: '#fff' });
            const prims = out.prims || [];
            polishLayout(prims, rect, layer.style, layer);
            const rects = prims.filter((p) => p.kind === 'rect' && String(p.key).startsWith('nfill-'))
              .map((p) => ({ key: p.key, x: p.x, y: p.y, w: p.w, h: p.h }));
            const polys = prims.filter((p) => p.kind === 'poly' && String(p.key).startsWith('link-'));
            layersChecked += 1;
            if (!polys.length) continue;
            for (const poly of polys) {
              const pts = poly.pts || [];
              linksChecked += 1;
              const where = `${item.uid}/${variant}/${sample.id || 's'}/step${si}/w${w}/${poly.key}`;
              if (pts.length < 2) { bad(where + ' 连线少于两个点'); continue; }
              for (let i = 0; i < pts.length - 1; i++) {
                for (const r of rects) {
                  if (segmentCrosses(pts[i], pts[i + 1], r)) bad(where + ' 穿过结点 ' + r.key);
                }
              }
              if (!rects.some((r) => onRectBorder(pts[0], r))) bad(where + ' 起点不在任何结点边界上');
              if (!rects.some((r) => onRectBorder(pts[pts.length - 1], r))) bad(where + ' 终点不在任何结点边界上');
            }
          }
        }
      }
    }
  }
  ok(item.uid + ' 扫描完成');
}

console.log(`style 3 案例 ${style3.length} 个 / 检查 ${layersChecked} 个层-尺寸组合 / ${linksChecked} 条连线`);
if (fails.length) {
  console.log(`\n✗ 问题 ${fails.length} 条（列出前 12 条）：`);
  fails.slice(0, 12).forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log(`✓ 没有一条连线穿过结点，且两端都贴在结点上（${pass} 项断言）`);
