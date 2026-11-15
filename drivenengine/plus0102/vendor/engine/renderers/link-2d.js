/**
 * style 3 —— 链表 2D 渲染器（TLinkForm 复原，04_LINK_2D.md）
 *
 * 复原要点：
 *  · 节点 = 一个矩形，但用 4 条边分别画（逐边换色：LinkNodeFrame / LinkNodeLine / LinkHead）；
 *  · 边 = 直角折线（先竖后横），不是直线+贝塞尔；
 *  · 箭头 = 两段 3×5 像素短线；连接处小圆点用 LinkDot；
 *  · 头指针 / 引用头是独立的标记（LinkHead / LinkRefHead），不是节点的一部分；
 *  · LinkRoundShape / LinkLinkFirst 是两个独立开关（圆角、先画线还是先画节点）。
 */

import { LINK, UI } from '../theme.js';
import { P } from '../prims.js';
import { norm, stateOf, styleOf, borderWidth, toneFor, elbow } from './_shared.js';

export const STYLES = [3];

/** 沿 head → next 收集显示顺序（避免出现环时死循环） */
function chainOrder(data) {
  const map = new Map((data.nodes || []).map((n) => [n.id, n]));
  if (data.order) return data.order.filter((id) => map.has(id)).map((id) => map.get(id));
  const out = [];
  const seen = new Set();
  let cur = data.head ?? (data.nodes && data.nodes[0] && data.nodes[0].id);
  while (cur && map.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    out.push(map.get(cur));
    const link = (data.links || []).find((l) => l.from === cur && (l.type ?? 'next') === 'next');
    cur = link ? link.to : map.get(cur).next;
  }
  // 未被 head 链到的孤立节点也显示（画在最右边，标注孤立）
  for (const n of data.nodes || []) if (!seen.has(n.id)) out.push(n);
  return out;
}

export function layout(layer, rect, env = {}) {
  const { data, props } = layer;
  const roles = norm(layer.roles);
  const prims = [];
  const nodes = new Map();
  const list = chainOrder(data);
  if (data.name) prims.push(P.text('name', rect.x + 14, rect.y + 15, data.name, { align: 'left', fill: ARRAY_NAME(), size: 12 }));
  if (list.length === 0) {
    prims.push(P.rect('empty', rect.x + 24, rect.y + rect.h / 2 - 26, 220, 52, { r: 10, fill: '#fbfcfe', stroke: UI.border }));
    prims.push(P.text('empty-t', rect.x + 134, rect.y + rect.h / 2, data.head ? '头指针为空 head = NULL' : '空链表', { fill: UI.textMuted, size: 12 }));
    return { prims, nodes };
  }

  const nodeW = props.nodeW ?? 92;
  const nodeH = props.nodeH ?? 44;
  const gap = props.gap ?? 46;
  const pad = 18;
  const perRow = Math.max(1, Math.floor((rect.w - pad * 2 + gap) / (nodeW + gap)));
  const rows = Math.ceil(list.length / perRow);
  const rowGap = nodeH + 54;
  const totalH = rows * rowGap;
  const y0 = rect.y + Math.max(20, (rect.h - totalH) / 2 + 8);
  const round = props.roundShape ? 10 : 0;
  const linkFirst = !!props.linkFirst;

  const geo = new Map();
  list.forEach((n, i) => {
    const r = Math.floor(i / perRow);
    const c = i % perRow;
    const cntInRow = Math.min(perRow, list.length - r * perRow);
    const rowW = cntInRow * nodeW + (cntInRow - 1) * gap;
    const x = rect.x + (rect.w - rowW) / 2 + c * (nodeW + gap);
    const y = y0 + r * rowGap;
    geo.set(n.id, { x, y, w: nodeW, h: nodeH });
    nodes.set(`node:${n.id}`, { x: x + nodeW / 2, y: y + nodeH / 2 });
  });

  const drawLink = (fromId, toId, label) => {
    const a = geo.get(fromId);
    const b = geo.get(toId);
    if (!a || !b) return;
    const sameRow = Math.abs(a.y - b.y) < 1;
    const pts = sameRow
      ? [[a.x + a.w, a.y + a.h / 2], [b.x, b.y + b.h / 2]]
      : elbow(a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y, 'v');
    prims.push(P.poly(`link-${fromId}-${toId}`, pts, { stroke: LINK.LinkNodeLine, sw: 1.6, arrow: 'end', z: 1 }));
    const mid = pts[pts.length - 1];
    prims.push(P.circle(`dot-${fromId}-${toId}`, mid[0], mid[1], 3.2, { fill: LINK.LinkDot, z: 2 }));
    if (label) prims.push(P.text(`ll-${fromId}-${toId}`, (pts[0][0] + mid[0]) / 2, (pts[0][1] + mid[1]) / 2 - 9, label, { size: 10, fill: UI.textMuted }));
  };

  const drawNode = (n) => {
    const g = geo.get(n.id);
    const st = stateOf(roles, n.id);
    const s = styleOf(st);
    const fill = n.fill || (st === 'idle' ? LINK.LinkNode : s.fill);
    const stroke = st === 'idle' ? LINK.LinkNodeFrame : s.stroke;

    // 4 条边逐条画（复原"逐边换色"，因此不用 Rectangle）
    const edges = [
      [g.x, g.y, g.x + g.w, g.y],
      [g.x + g.w, g.y, g.x + g.w, g.y + g.h],
      [g.x + g.w, g.y + g.h, g.x, g.y + g.h],
      [g.x, g.y + g.h, g.x, g.y],
    ];
    prims.push(P.rect(`nfill-${n.id}`, g.x, g.y, g.w, g.h, { r: round, fill, stroke: 'none', opacity: s.opacity, z: 1 }));
    edges.forEach((e, i) => prims.push(P.line(`ne-${n.id}-${i}`, e[0], e[1], e[2], e[3], { stroke, sw: borderWidth(st), opacity: s.opacity, z: 2 })));

    // 数据域 / 指针域 分隔（有 fields 时按字段表切分，复原"字段表驱动"）
    const fields = n.fields || data.fields;
    if (fields && fields.length >= 2) {
      const fw = g.w / fields.length;
      fields.forEach((f, i) => {
        if (i > 0) prims.push(P.line(`nf-${n.id}-${i}`, g.x + fw * i, g.y, g.x + fw * i, g.y + g.h, { stroke, sw: 1, opacity: s.opacity, z: 2 }));
        const val = n[f.name] ?? (f.name === 'next' ? (n.next ?? '∧') : n.value);
        prims.push(P.text(`nft-${n.id}-${f.name}`, g.x + fw * (i + 0.5), g.y + g.h / 2, String(val), { size: 12, fill: st === 'idle' ? LINK.LinkNodeText : s.text, opacity: s.opacity }));
      });
    } else {
      prims.push(P.text(`nv-${n.id}`, g.x + g.w / 2, g.y + g.h / 2, String(n.value ?? n.label ?? n.id), { size: 14, fill: st === 'idle' ? LINK.LinkNodeText : s.text, opacity: s.opacity }));
    }
    if (n.badge) prims.push(P.text(`nb-${n.id}`, g.x + g.w / 2, g.y - 10, n.badge, { size: 10, fill: UI.textMuted }));
  };

  if (linkFirst) {
    for (const n of list) {
      const link = (data.links || []).find((l) => l.from === n.id);
      const tgt = link ? link.to : n.next;
      if (tgt) drawLink(n.id, tgt, link && link.label);
    }
    for (const n of list) drawNode(n);
  } else {
    for (const n of list) drawNode(n);
    for (const n of list) {
      const link = (data.links || []).find((l) => l.from === n.id);
      const tgt = link ? link.to : n.next;
      if (tgt) drawLink(n.id, tgt, link && link.label);
    }
  }

  // 尾结点的 NULL 标记
  const tail = list[list.length - 1];
  const tg = geo.get(tail.id);
  const tailNext = (data.links || []).find((l) => l.from === tail.id);
  if (!tailNext && !tail.next && tg) {
    prims.push(P.text('null', tg.x + tg.w + 18, tg.y + tg.h / 2, '∧', { size: 16, fill: LINK.LinkNodeLine }));
  }

  // 头指针标记（LinkHead，独立于节点）
  if (data.head) {
    const hg = geo.get(data.head);
    if (hg) {
      const tone = toneFor(0);
      prims.push(P.chip('head', hg.x + hg.w / 2, hg.y - 18, 'head', tone));
      prims.push(P.line('head-line', hg.x + hg.w / 2, hg.y - 10, hg.x + hg.w / 2, hg.y - 1, { stroke: tone.stroke, sw: 1, arrow: 'end' }));
    }
  } else if (list.length) {
    const hg = geo.get(list[0].id);
    prims.push(P.text('null-head', hg.x - 14, hg.y + hg.h / 2, 'head=∧', { size: 10, fill: UI.textMuted, align: 'right' }));
  }

  // 指针（prev / cur / next 之类）：文字一定在，颜色只是辅助
  roles.pointers.forEach((p, i) => {
    const g = geo.get(p.node);
    if (!g) return;
    const tone = toneFor(i + 1);
    const py = g.y + g.h + 16;
    prims.push(P.chip(`ptr-${p.id}`, g.x + g.w / 2, py, p.label, tone));
    prims.push(P.line(`ptr-line-${p.id}`, g.x + g.w / 2, py - 9, g.x + g.w / 2, g.y + g.h + 1, { stroke: tone.stroke, sw: 1, dash: [3, 2] }));
    nodes.set(`ptr:${p.id}`, { x: g.x + g.w / 2, y: py });
  });

  return { prims, nodes };
}

function ARRAY_NAME() {
  return '#b0197f';
}
