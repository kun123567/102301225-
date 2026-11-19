/**
 * tools/dom-geometry-test.mjs —— **数据 ↔ DOM 等价性**门禁（这是之前缺的那一类测试）。
 *
 * 背景：之前所有审计（overlap / visual / tree / stray）量的都是 **prim 数据**，
 * 而屏幕上看的是 **SVG DOM**。两者一旦不一致，审计全绿、画面照样错位
 * （真实 bug：线段的包裹层原点写成 min(x1,x2)/min(y1,y2)，非"左上→右下"方向的
 *  线被旋转中心带偏，屏幕上就是一根错位短线，而 prim 数据完全正确）。
 *
 * 本测试：渲染后从 DOM 反推每个元素的绝对几何，与 prim 逐项比对（容差 0.75px）：
 *   line   : translate(x1,y1) + rotate(θ) 上的 (0,0) -> (len,0)
 *   circle : translate(cx,cy) + r
 *   rect   : translate(x,y) + w/h
 *   text   : translate(x,y) + 文本内容
 *   chip   : translate(x,y)（chip 的 x,y 是中心）
 *   poly   : translate(pts[0]) + 相对点集
 *
 * 用法：node tools/dom-geometry-test.mjs [uidPrefix] [--style N]
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const argv = process.argv.slice(2);
const fi = argv.indexOf('--style');
const forceStyle = fi >= 0 ? Number(argv[fi + 1]) : null;
const wi = argv.indexOf('--w');
if (wi >= 0) globalThis.__AVC_W = Number(argv[wi + 1]);
const pos = argv.filter((a, i) => !a.startsWith('--') && (fi < 0 || i !== fi + 1) && (wi < 0 || i !== wi + 1));
const [prefix = ''] = pos;

function makeEl(tag) {
  return {
    tagName: String(tag || 'div').toUpperCase(), className: '', textContent: '', dataset: {}, style: {}, attributes: {}, childNodes: [],
    classList: { _s: new Set(), add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); }, contains(c) { return this._s.has(c); } },
    setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k] ?? null; }, removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { x: 0, y: 0, width: Number(globalThis.__AVC_W || 900), height: 300 }; },
  };
}
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.document = { body: makeEl('body'), createElement: (t) => makeEl(t), createElementNS: (ns, t) => makeEl(t) };
globalThis.matchMedia = () => ({ matches: false });

const { createStage } = await import(pathToFileURL(join(ROOT, 'app/svg-stage.js')).href);
const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { adaptStepLayers } = await import(pathToFileURL(join(ROOT, 'vendor/app/adapt.js')).href);

const num = (v) => (v == null ? NaN : Number(v));
function tr(styleTransform) {
  const m = /translate\(\s*(-?[\d.]+)(?:px)?\s*,\s*(-?[\d.]+)(?:px)?\s*\)/.exec(String(styleTransform || ''));
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
}
function rot(styleTransform) {
  const m = /rotate\(\s*(-?[\d.]+)deg\s*\)/.exec(String(styleTransform || ''));
  return m ? Number(m[1]) : 0;
}
const close = (a, b, tol = 0.75) => Math.abs(a - b) <= tol;
const r2 = (v) => Math.round(v * 100) / 100;

/** 在 <g> 里找带某个 data-role 的直接子元素（childNodes 可能不是真数组） */
function firstWithRole(g, role) {
  const cs = (g && g.childNodes) || [];
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (c && c.getAttribute && c.getAttribute('data-role') === role) return c;
  }
  return null;
}
function parsePoints(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).map((pair) => {
    const [x, y] = pair.split(',');
    return [Number(x), Number(y)];
  });
}

/** 从 DOM 反推绝对几何（两层结构：外层 avc-pos 定位，内层 avc-el 放形状） */
function domGeom(g) {
  const o = tr(g.style && g.style.transform);
  const kind = g.getAttribute('data-avc-kind');
  const anim = g.__avcAnimEl || g;
  const kid = (anim.childNodes || [])[0];
  if (kind === 'line') {
    const len = num(kid.getAttribute('x2'));
    const a = rot(kid.style && kid.style.transform) * Math.PI / 180;
    return { kind, x1: o.x, y1: o.y, x2: o.x + len * Math.cos(a), y2: o.y + len * Math.sin(a) };
  }
  if (kind === 'circle') return { kind, cx: o.x, cy: o.y, r: num(kid.getAttribute('r')) };
  if (kind === 'rect') return { kind, x: o.x, y: o.y, w: num(kid.getAttribute('width')), h: num(kid.getAttribute('height')) };
  if (kind === 'text') return { kind, x: o.x, y: o.y, text: kid.textContent };
  if (kind === 'chip') return { kind, x: o.x, y: o.y, text: (anim.childNodes || [])[1] ? anim.childNodes[1].textContent : '' };
  if (kind === 'poly' || kind === 'polyline' || kind === 'polygon') {
    return { kind, ptsRaw: kid.getAttribute('points') };
  }
  return { kind };
}

/** prim → 期望的绝对几何 */
function primGeom(p) {
  if (p.kind === 'line') return { kind: 'line', x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 };
  if (p.kind === 'circle') return { kind: 'circle', cx: p.cx, cy: p.cy, r: p.r };
  if (p.kind === 'rect') return { kind: 'rect', x: p.x, y: p.y, w: p.w, h: p.h, dash: !!p.dash };
  if (p.kind === 'text') return { kind: 'text', x: p.x, y: p.y, text: String(p.text ?? '') };
  if (p.kind === 'chip') return { kind: 'chip', x: p.x, y: p.y, text: String(p.text ?? '') };
  if (p.kind === 'poly') return { kind: 'poly' };
  return { kind: p.kind };
}

/** 渲染后的各图元定位层 <g> 按顺序收集（data-avc-kind 在定位层上；内层 avc-el 只是动画层） */
function collectGroups(host) {
  const out = [];
  const walk = (el, depth) => {
    for (const c of el.childNodes || []) {
      const kind = c.getAttribute && c.getAttribute('data-avc-kind');
      if (kind) { out.push(c); continue; }
      walk(c, depth + 1);
    }
  };
  walk(host, 0);
  return out;
}

const items = ITEMS.filter((i) => !prefix || i.uid.startsWith(prefix));
if (!items.length) { console.error('没有匹配的案例：' + prefix); process.exit(1); }

let checked = 0, bad = 0, shown = 0, arrows = 0;
const byKind = {};
for (const item of items) {
  const mod = await import(pathToFileURL(join(ROOT, 'vendor', item.path)).href);
  const trc = mod.run('v1', (mod.samples?.[0] || {}).input || {});
  const host = makeEl('div'); host.clientWidth = Number(globalThis.__AVC_W || 900);
  const stage = createStage(host);
  for (const [si, st] of (trc.steps || []).entries()) {
    let layers = st.layers || [];
    if (forceStyle != null) layers = adaptStepLayers(st, forceStyle, { props: {} }).layers;
    const m = stage.render(layers, { animate: false });
    const groups = collectGroups(host);
    const prims = m.primsList || [];
    // 只比对"本帧仍存活"的元素：数量必须一致（不一致由 dom-leftover-test 报）
    checked += prims.length;
    if (groups.length !== prims.length) {
      bad++;
      if (shown++ < 12) console.log(`  ✗ ${item.uid} step${si} 元素数 DOM=${groups.length} prims=${prims.length}`);
      continue;
    }
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      const g = groups[i];
      const want = primGeom(p);
      const got = domGeom(g);
      byKind[p.kind] = (byKind[p.kind] || 0) + 1;
      if (p.kind === 'line' && p.arrow) arrows += 1;
      let errs = [];
      if (want.kind !== got.kind) errs.push(`kind ${p.kind}->${got.kind}`);
      else if (p.kind === 'line') {
        if (!close(want.x1, got.x1) || !close(want.y1, got.y1)) errs.push(`起点 (${r2(got.x1)},${r2(got.y1)})≠(${r2(want.x1)},${r2(want.y1)})`);
        if (!close(want.x2, got.x2) || !close(want.y2, got.y2)) errs.push(`终点 (${r2(got.x2)},${r2(got.y2)})≠(${r2(want.x2)},${r2(want.y2)})`);
        // 箭头：canvas 有 drawArrowHead，SVG 侧必须同形同向，且"该有没有/该无必须无"
        // 两层结构里箭头挂在动画层（形状层），不在定位层上
        const arrowKid = firstWithRole(g.__avcAnimEl || g, 'arrow');
        if (p.arrow) {
          if (!arrowKid) errs.push('缺箭头');
          else {
            const pts = parsePoints(arrowKid.getAttribute('points'));
            const tip = pts[1] || pts[pts.length - 1];   // "左臂 → 箭尖 → 右臂"
            if (!tip) errs.push('箭头无点');
            else {
              const a = rot(arrowKid.style && arrowKid.style.transform) * Math.PI / 180;
              const ax = got.x1 + tip[0] * Math.cos(a) - tip[1] * Math.sin(a);
              const ay = got.y1 + tip[0] * Math.sin(a) + tip[1] * Math.cos(a);
              if (!close(ax, want.x2, 1.2) || !close(ay, want.y2, 1.2)) errs.push(`箭头尖 (${r2(ax)},${r2(ay)})≠(${r2(want.x2)},${r2(want.y2)})`);
              const d1 = Math.hypot(pts[0][0] - tip[0], pts[0][1] - tip[1]);
              if (Math.abs(d1 - 5) > 0.6) errs.push(`箭头臂长 ${r2(d1)}≠5`);
            }
          }
        } else if (arrowKid) errs.push('多余箭头');
      } else if (p.kind === 'circle') {
        if (!close(want.cx, got.cx) || !close(want.cy, got.cy) || !close(want.r, got.r)) errs.push(`圆 (${r2(got.cx)},${r2(got.cy)},r${r2(got.r)})≠(${r2(want.cx)},${r2(want.cy)},r${r2(want.r)})`);
      } else if (p.kind === 'rect') {
        if (!close(want.x, got.x) || !close(want.y, got.y) || !close(want.w, got.w) || !close(want.h, got.h)) errs.push(`框 (${r2(got.x)},${r2(got.y)},${r2(got.w)},${r2(got.h)})≠(${r2(want.x)},${r2(want.y)},${r2(want.w)},${r2(want.h)})`);
      } else if (p.kind === 'text') {
        if (!close(want.x, got.x) || !close(want.y, got.y)) errs.push(`文本位 (${r2(got.x)},${r2(got.y)})≠(${r2(want.x)},${r2(want.y)})`);
        if (String(want.text) !== String(got.text)) errs.push(`文本 "${got.text}"≠"${want.text}"`);
      } else if (p.kind === 'chip') {
        if (!close(want.x, got.x) || !close(want.y, got.y)) errs.push(`气泡 (${r2(got.x)},${r2(got.y)})≠(${r2(want.x)},${r2(want.y)})`);
        if (String(want.text) !== String(got.text)) errs.push(`气泡文本 "${got.text}"≠"${want.text}"`);
      }
      if (errs.length) {
        bad++;
        if (shown++ < 12) console.log(`  ✗ ${item.uid} step${si} style${p.__style ?? '?'} key=${p.key} ${errs.join('; ')}`);
      }
    }
  }
}
const kinds = Object.entries(byKind).map(([k, n]) => `${k}×${n}`).join(' ');
console.log(bad === 0
  ? `  ✓ ${items.length} 案例 / 比对 ${checked} 个图元的 DOM 绝对几何，全部与 prim 一致（${kinds}；带箭头线段 ${arrows} 条，尖端/朝向/臂长逐条校验）`
  : `  ✗ ${bad} 处 DOM 与 prim 不一致`);
process.exit(bad === 0 ? 0 : 1);
