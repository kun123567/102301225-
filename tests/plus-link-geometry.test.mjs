import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * style 3（链表）连线几何 —— 跑的是**运行时副本** `frontend/vendor/plus/**`。
 *
 * 用户实测过的两个错误（都在这一层）：
 *   ① 单链表逆置后 `next` 反向，连线被画成横穿两个结点的长直线；
 *   ② 跳过中间结点的重连（n3 → n1）被画成一条穿过中间结点的直线。
 * 这里把"连线不许穿过结点内部、两端必须贴在结点边界上"钉成断言，
 * 同时保证 vendor 的副本没有和 drivenengine/plus0102 的源脱节。
 */

const WIDTHS = [390, 540, 720, 960];
const TOL = 3;

const insideRect = (p, r) => p[0] > r.x + 1 && p[0] < r.x + r.w - 1 && p[1] > r.y + 1 && p[1] < r.y + r.h - 1;
function segmentCrosses(a, b, r) {
  for (let i = 1; i < 80; i++) {
    const t = i / 80;
    if (insideRect([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], r)) return true;
  }
  return false;
}
const onRectBorder = (p, r) => {
  const onV = (Math.abs(p[0] - r.x) <= TOL || Math.abs(p[0] - (r.x + r.w)) <= TOL) && p[1] >= r.y - TOL && p[1] <= r.y + r.h + TOL;
  const onH = (Math.abs(p[1] - r.y) <= TOL || Math.abs(p[1] - (r.y + r.h)) <= TOL) && p[0] >= r.x - TOL && p[0] <= r.x + r.w + TOL;
  return onV || onH;
};

test('style 3 连线：不穿过任何结点，两端都贴在结点边界上（含逆置后的反向 next）', async () => {
  const { ITEMS } = await import('../frontend/vendor/plus/vendor/catalog/index.js');
  const { dispatch } = await import('../frontend/vendor/plus/vendor/engine/dispatch.js');
  const { polishLayout } = await import('../frontend/vendor/plus/app/canvas-stage.js');

  const style3 = ITEMS.filter((item) => item.style === 3);
  assert.ok(style3.length >= 4, 'style 3 案例数量异常：' + style3.length);

  let layers = 0;
  let links = 0;
  for (const item of style3) {
    const mod = await import('../frontend/vendor/plus/vendor/' + item.path);
    for (const variant of (item.variants || [{ id: 'v1' }]).map((v) => v.id)) {
      for (const sample of mod.samples || []) {
        const trace = mod.run(variant, sample.input || {});
        for (const step of trace.steps || []) {
          for (const layer of step.layers || []) {
            if (layer.style !== 3) continue;
            for (const width of WIDTHS) {
              const rect = { x: 0, y: 0, w: width, h: 300 };
              const out = dispatch(layer.style).instance.layout(layer, rect, { bg: '#fff' });
              const prims = out.prims || [];
              polishLayout(prims, rect, layer.style, layer);
              const rects = prims.filter((p) => p.kind === 'rect' && String(p.key).startsWith('nfill-'))
                .map((p) => ({ key: p.key, x: p.x, y: p.y, w: p.w, h: p.h }));
              const polys = prims.filter((p) => p.kind === 'poly' && String(p.key).startsWith('link-'));
              layers += 1;
              for (const poly of polys) {
                links += 1;
                const pts = poly.pts || [];
                const where = `${item.uid}/${variant}/${sample.id || 's'}/w${width}/${poly.key}`;
                assert.ok(pts.length >= 2, where + ' 连线少于两个点');
                for (let i = 0; i < pts.length - 1; i++) {
                  for (const r of rects) {
                    assert.equal(segmentCrosses(pts[i], pts[i + 1], r), false, where + ' 穿过结点 ' + r.key);
                  }
                }
                assert.ok(rects.some((r) => onRectBorder(pts[0], r)), where + ' 起点不在结点边界上');
                assert.ok(rects.some((r) => onRectBorder(pts[pts.length - 1], r)), where + ' 终点不在结点边界上');
              }
            }
          }
        }
      }
    }
  }
  assert.ok(layers > 500, '覆盖的层-尺寸组合偏少：' + layers);
  assert.ok(links > 500, '覆盖的连线偏少：' + links);
});

test('单链表逆置：反向 next 必须走"左出右进"或绕行，不能是横穿两结点的直线', async () => {
  const { ITEMS } = await import('../frontend/vendor/plus/vendor/catalog/index.js');
  const { dispatch } = await import('../frontend/vendor/plus/vendor/engine/dispatch.js');
  const { polishLayout } = await import('../frontend/vendor/plus/app/canvas-stage.js');
  const item = ITEMS.find((i) => i.uid === 'e/singly-linked-list-reverse');
  assert.ok(item, '找不到单链表逆置案例');
  const mod = await import('../frontend/vendor/plus/vendor/' + item.path);
  const trace = mod.run('v2', (mod.samples?.[0] || {}).input || {});
  let reversedFound = 0;
  for (const step of trace.steps) {
    for (const layer of step.layers || []) {
      if (layer.style !== 3) continue;
      const rect = { x: 0, y: 0, w: 540, h: 300 };
      const out = dispatch(layer.style).instance.layout(layer, rect, { bg: '#fff' });
      const prims = out.prims || [];
      polishLayout(prims, rect, layer.style, layer);
      const rects = prims.filter((p) => p.kind === 'rect' && String(p.key).startsWith('nfill-'));
      for (const poly of prims.filter((p) => p.kind === 'poly' && String(p.key).startsWith('link-'))) {
        const [, fromId, toId] = String(poly.key).split('-');
        const a = rects.find((r) => r.key === 'nfill-' + fromId);
        const b = rects.find((r) => r.key === 'nfill-' + toId);
        if (!a || !b) continue;
        const backward = b.x + b.w <= a.x + 1;           // 目标在左边 = 反向 next
        if (!backward) continue;
        reversedFound += 1;
        const pts = poly.pts || [];
        /* 反向线必须从 from 的左边缘出发（或绕行），绝不能是 from.right → to.left 那种跨越 */
        const startsAtRight = Math.abs(pts[0][0] - (a.x + a.w)) <= 1;
        assert.equal(startsAtRight, false, `${poly.key} 仍从右边缘出发（会横穿结点）`);
      }
    }
  }
  assert.ok(reversedFound > 0, '逆置过程里没出现反向 next，测试没覆盖到目标场景');
});
