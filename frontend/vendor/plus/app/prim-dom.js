/**
 * prim-dom.js -- 把 add01 的图元（prims）映射成 **SVG DOM 元素**，并给出动画挂载契约
 *
 * 为什么要有这一层：plus01&02 原来用 canvas 直接画像素，动画只能靠"整帧重绘 + 补间"。
 * 要迁移到 `raw/datastructure-agent`（SVG + CSS keyframes）而不改它的样式与动画，
 * 必须先在自己的工程里把渲染机制换成 SVG DOM、把动画挂载点换成"元素上的 CSS 类"。
 *
 * 结构（每个图元 = 一个 <g> 包裹层 + 内部形状）：
 *   <g class="avc-el" data-avc-kind="rect" data-avc-key="cell-0" style="transform: translate(24px,40px)">
 *     <rect x="0" y="0" width="97" height="78" rx="10"/>
 *   </g>
 *
 * · 包裹层用 `style.transform` 定位 → **位置变化可以由 CSS transition 补间**（挂载点 ①）
 * · 状态/事件类名由 svg-stage 打上：`avc-enter` / `avc-exit` / `avc-flash` / `avc-dim`（挂载点 ②）
 * · 内部形状只描述"以自己原点为基准"的几何，不参与定位
 */

const NS = 'http://www.w3.org/2000/svg';

/** 动画挂载契约：类名同时写进 class 与 data-avc-anim，CSS 与测试都读这两个 */
export const ANIM = Object.freeze({
  enter: 'avc-enter',
  exit: 'avc-exit',
  move: 'avc-move',
  flash: 'avc-flash',
  dim: 'avc-dim',
});

const attr = (el, k, v) => {
  if (v == null || v === '') el.removeAttribute(k);
  else el.setAttribute(k, String(v));
};
const kebabToCamel = (k) => k.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
const css = (el, k, v) => {
  if (!el.style) return;
  const prop = kebabToCamel(k);
  if (typeof el.style.setProperty === 'function') {
    if (v == null || v === '') el.style.removeProperty(k);
    else el.style.setProperty(k, String(v));
  } else if (v == null || v === '') {
    delete el.style[prop];
  } else {
    el.style[prop] = String(v);
  }
};

/** 图元 → 相对自身原点的"局部几何"（形状类型 + 需要的属性） */
function localShape(p, box) {
  switch (p.kind) {
    case 'rect':
      return { tag: 'rect', x: 0, y: 0, w: p.w, h: p.h, rx: p.r ?? 8 };
    case 'circle':
      return { tag: 'circle', cx: 0, cy: 0, r: p.r };
    case 'line': {
      const w = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
      const ang = Math.atan2(p.y2 - p.y1, p.x2 - p.x1) * 180 / Math.PI;
      return { tag: 'line', x1: 0, y1: 0, x2: w, y2: 0, rotate: ang, len: w };
    }
    case 'poly':
      return { tag: p.closed ? 'polygon' : 'polyline', points: (p.pts || []).map((q) => [q[0] - (p.pts[0]?.[0] || 0), q[1] - (p.pts[0]?.[1] || 0)]) };
    case 'chip':
      return { tag: 'chip', w: box.w, h: box.h, text: p.text, size: p.size || 11 };
    case 'text':
    default:
      return { tag: 'text', text: p.text, size: parseInt(String(p.font || '').match(/(\d+(?:\.\d+)?)px/)?.[1] || '11', 10), align: p.align || 'center', weight: /600|700/.test(String(p.font || '')) ? 600 : 400 };
  }
}

/** 一个图元在画布坐标系里的"原点"（包裹层的 translate） */
function originOf(p) {
  if (p.kind === 'circle') return { x: p.cx, y: p.cy };
  /* 线段的局部几何是"水平段 (0,0)->(len,0) 绕原点旋转"，
     所以原点**必须**是线段的真实起点 (x1,y1)。
     早期写成 min(x1,x2)/min(y1,y2)：只要线不是"从左往右/从上往下"画，
     旋转中心就错位，整根线被搬到别处 —— 屏幕上就是一根错位的短线。 */
  if (p.kind === 'line') return { x: p.x1, y: p.y1 };
  if (p.kind === 'poly') return { x: p.pts?.[0]?.[0] ?? 0, y: p.pts?.[0]?.[1] ?? 0 };
  if (p.kind === 'text') {
    // 文本用 text-anchor 对齐到 x，所以原点就是 (x, y)
    return { x: p.x, y: p.y };
  }
  return { x: p.x, y: p.y };
}

/**
 * 创建/更新一个图元对应的 <g>。若传了 existing 就**复用**（DOM 身份不变 → CSS transition 生效）。
 *
 * **两层结构（重要，别合并回去）**：
 *   <g class="avc-pos" data-avc-key="…" style="transform:translate(x,y)">   ← 只负责定位（CSS transition）
 *     <g class="avc-el">                                                    ← 只负责状态动画（avc-enter/flash…）
 *       <shape/>
 *     </g>
 *   </g>
 *
 * 为什么必须分层：CSS 动画（哪怕 `animation-fill-mode: both`）在层叠里**高于 inline style**。
 * 早期把 scale 弹入写在定位层上，`avc-enter` 播完后 `transform: scale(1)` 会一直压着
 * `translate(x,y)` —— 元素永久停在原点，越往下走"错位"的元素越多，最后整屏看不见。
 * 分层后动画层再怎么 scale 都动不到定位层的 translate。
 *
 * @returns {SVGGElement} 定位层（data-avc-key / data-avc-kind 都在它上面）
 */
export function upsertPrim(doc, existing, p, box) {
  const g = existing || doc.createElementNS(NS, 'g');
  if (!existing) {
    g.setAttribute('class', 'avc-pos');
    if (g.classList) g.classList.add('avc-pos');
  }
  /* 动画层：状态类名挂这里；定位层的 transform 不被任何 keyframes 覆盖 */
  let anim = g.__avcAnimEl;
  if (!anim) {
    anim = doc.createElementNS(NS, 'g');
    anim.setAttribute('class', 'avc-el');
    if (anim.classList) anim.classList.add('avc-el');
    anim.__avcParts = {};
    g.appendChild(anim);
    g.__avcAnimEl = anim;
  }
  /* 同一个 key 换了图元类型（text↔chip↔line…）时旧子元素必须清掉：
     否则一个 <g> 里会同时躺着一根旧线和一段新文字——屏幕上就是"多出来的一截线"。 */
  if (anim.__avcKind && anim.__avcKind !== p.kind) {
    const cs = anim.childNodes || [];
    while (cs.length) anim.removeChild(cs[0]);
    anim.__avcParts = {};
  }
  anim.__avcKind = p.kind;
  const parts = anim.__avcParts || (anim.__avcParts = {});
  /** 复用内部形状元素（存在 __avcParts 上，不用 :scope 选择器——假 DOM 也稳） */
  const child = (tag, realTag) => {
    if (!parts[tag]) { parts[tag] = doc.createElementNS(NS, realTag || tag); anim.appendChild(parts[tag]); }
    return parts[tag];
  };
  /** 箭头是可选的：不需要时必须从 DOM 摘掉（留着就是"多一根短线"） */
  const dropChild = (tag) => {
    const el = parts[tag];
    if (el && el.parentNode) el.parentNode.removeChild(el);
    delete parts[tag];
  };
  /* 箭头：与 canvas 的 drawArrowHead 完全同形——两条 5px 斜臂组成的 "V"（不是实心三角）。
     线段的局部坐标已旋转，所以端点就是 (len,0)，臂朝 -x 方向张开 ±0.45rad。 */
  const setArrow = (pts, rotateDeg = 0) => {
    if (!pts) { dropChild('arrow'); return; }
    const pl = child('arrow', 'polyline');
    pl.setAttribute('data-role', 'arrow');
    attr(pl, 'points', pts.map((q) => q[0].toFixed(2) + ',' + q[1].toFixed(2)).join(' '));
    attr(pl, 'fill', 'none');
    attr(pl, 'stroke', p.stroke || '#94a3b8');
    attr(pl, 'stroke-width', p.sw ?? 1.5);
    attr(pl, 'stroke-linecap', 'round');
    attr(pl, 'stroke-dasharray', '');
    // 旋转在包裹层是 translate、在子元素上是 rotate：箭头是 <line> 的兄弟节点，
    // 必须自己再转一次，否则箭头会躺在水平方向上（方向全错）。
    css(pl, 'transform-origin', '0 0');
    css(pl, 'transform', 'rotate(' + Number(rotateDeg).toFixed(2) + 'deg)');
  };
  g.setAttribute('data-avc-kind', p.kind);
  g.setAttribute('data-avc-key', p.key || '');

  const shape = localShape(p, box);
  // 内部形状（chip 需要两个子元素：底 + 字）
  if (shape.tag === 'chip') {
    const bg = child('rect');
    const tx = child('text');
    attr(bg, 'x', -shape.w / 2); attr(bg, 'y', -shape.h / 2);
    attr(bg, 'width', shape.w); attr(bg, 'height', shape.h);
    attr(bg, 'rx', shape.h / 2);
    attr(bg, 'fill', p.fill || '#e7f1fd');
    attr(bg, 'stroke', p.stroke || '#0b5cad');
    attr(bg, 'stroke-width', 1);
    attr(tx, 'text-anchor', 'middle'); attr(tx, 'dominant-baseline', 'central');
    attr(tx, 'font-size', shape.size); attr(tx, 'font-weight', 600);
    attr(tx, 'fill', p.color || p.stroke || '#0b5cad');
    if (tx.textContent !== String(shape.text)) tx.textContent = String(shape.text);
  } else if (shape.tag === 'text') {
    const tx = child('text');
    attr(tx, 'text-anchor', shape.align === 'left' ? 'start' : shape.align === 'right' ? 'end' : 'middle');
    attr(tx, 'dominant-baseline', 'central');
    attr(tx, 'font-size', shape.size);
    attr(tx, 'font-weight', shape.weight);
    attr(tx, 'fill', p.fill || '#172033');
    if (tx.textContent !== String(shape.text)) tx.textContent = String(shape.text);
  } else if (shape.tag === 'line') {
    const ln = child('line');
    attr(ln, 'x1', 0); attr(ln, 'y1', 0); attr(ln, 'x2', shape.x2); attr(ln, 'y2', 0);
    attr(ln, 'stroke', p.stroke || '#94a3b8');
    attr(ln, 'stroke-width', p.sw ?? 1.5);
    if (p.dash) attr(ln, 'stroke-dasharray', p.dash.join(' ')); else ln.removeAttribute('stroke-dasharray');
    css(ln, 'transform-origin', '0 0');
    css(ln, 'transform', 'rotate(' + shape.rotate.toFixed(2) + 'deg)');
    // canvas: if (p.arrow) drawArrowHead(...) —— 末端"V"形箭头，与 prims.js 同形
    if (p.arrow) {
      const s = 5, arc = 0.45;
      setArrow([[shape.x2 - s * Math.cos(arc), s * Math.sin(arc)], [shape.x2, 0], [shape.x2 - s * Math.cos(arc), -s * Math.sin(arc)]], shape.rotate);
    } else setArrow(null);
  } else if (shape.tag === 'polyline' || shape.tag === 'polygon') {
    const pl = child(shape.tag);
    attr(pl, 'points', shape.points.map((q) => q[0] + ',' + q[1]).join(' '));
    attr(pl, 'fill', p.fill || 'none');
    attr(pl, 'stroke', p.stroke || '#94a3b8');
    attr(pl, 'stroke-width', p.sw ?? 1.5);
    if (p.dash) attr(pl, 'stroke-dasharray', p.dash.join(' ')); else pl.removeAttribute('stroke-dasharray');
    // canvas: 折线只在 arrow==='end' 时画箭头，方向取"倒数第二点 → 最后一点"
    if (p.arrow === 'end' && shape.points.length > 1) {
      const n = shape.points.length;
      const [px, py] = shape.points[n - 2];
      const [lx, ly] = shape.points[n - 1];
      const a = Math.atan2(ly - py, lx - px), s = 5, arc = 0.45;
      setArrow([[lx - s * Math.cos(a - arc), ly - s * Math.sin(a - arc)], [lx, ly], [lx - s * Math.cos(a + arc), ly - s * Math.sin(a + arc)]]);
    } else setArrow(null);
  } else if (shape.tag === 'rect') {
    const r = child('rect');
    attr(r, 'x', 0); attr(r, 'y', 0);
    attr(r, 'width', shape.w); attr(r, 'height', shape.h);
    attr(r, 'rx', shape.rx ?? 0);
    attr(r, 'fill', p.fill || 'none');
    attr(r, 'stroke', p.stroke || 'none');
    attr(r, 'stroke-width', p.sw ?? 1);
    if (p.dash) attr(r, 'stroke-dasharray', p.dash.join(' ')); else r.removeAttribute('stroke-dasharray');
  } else if (shape.tag === 'circle') {
    const c = child('circle');
    attr(c, 'cx', 0); attr(c, 'cy', 0); attr(c, 'r', shape.r);
    attr(c, 'fill', p.fill || 'none');
    attr(c, 'stroke', p.stroke || 'none');
    attr(c, 'stroke-width', p.sw ?? 1.5);
  }

  // 定位层：只有 translate / 透明度 / 命中测试，绝不参与状态动画
  const o = originOf(p);
  css(g, 'transform', 'translate(' + o.x.toFixed(2) + 'px,' + o.y.toFixed(2) + 'px)');
  css(g, 'opacity', p.opacity == null ? 1 : p.opacity);
  css(g, 'pointer-events', 'none');
  return g;
}

/** 状态动画作用的元素（两层结构里的内层；旧结构兜底回退到自己） */
export function animTarget(el) {
  return (el && el.__avcAnimEl) || el;
}

/** 挂动画类（同一帧只保留一个 avc-* 状态） */
export function applyAnim(el, kind) {
  const target = animTarget(el);
  for (const cls of Object.values(ANIM)) target.classList.remove(cls);
  if (!kind || !ANIM[kind]) { target.removeAttribute('data-avc-anim'); return; }
  target.classList.add(ANIM[kind]);
  target.setAttribute('data-avc-anim', kind);
}

/** 清掉动画类（下一帧开始时调用，避免类名堆叠） */
export function clearAnim(el) {
  const target = animTarget(el);
  for (const cls of Object.values(ANIM)) target.classList.remove(cls);
  target.removeAttribute('data-avc-anim');
}
