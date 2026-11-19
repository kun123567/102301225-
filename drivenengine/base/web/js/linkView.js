/**
 * linkView.js -- 链表 2D 视图（M3，对齐 04_LINK_2D）
 *
 * 三段式：数据 → layout() 算 (x,y,w,h) → paint() 出 SVG
 * 细节照抄原版：
 *   · 节点 = 4 条独立边（可逐边换色：NodeFrame / RefHeadLine / NodeLine / Dot）
 *   · 边 = 直角折线（先竖后横），不是贝塞尔
 *   · 箭头 = 两段短线 + 连接处圆点
 *   · 头指针标记 LinkHead/LinkHeadText
 *   · 7 个 2D 参数：间距± / 结点± / 缩放± / 复位
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};
  const SVGNS = 'http://www.w3.org/2000/svg';
  function el(n, a) {
    const x = document.createElementNS(SVGNS, n);
    for (const k in (a || {})) x.setAttribute(k, a[k]);
    return x;
  }

  const DEFAULT_PARAMS = { gap: 26, nodeW: 62, nodeH: 30, scale: 1, round: false, linkFirst: false };

  /**
   * 布局：树按 BFS 层次；链表按一行排列
   * @returns {Array} [{x,y,w,h,node,level}]
   */
  function layout(vobj, params) {
    const p = Object.assign({}, DEFAULT_PARAMS, params || {});
    const nodes = vobj.children || [];
    const out = [];
    const W = p.nodeW * p.scale, H = p.nodeH * p.scale;

    if (vobj.kind === 'graph') {
      // 图 = 环形布局（顶点围一圈），边按真实邻接关系画；这是"图"与"链"的根本区别
      const n = nodes.length || 1;
      const R = Math.max(64, n * 26);
      const cx = R + W / 2 + 24, cy = R + H / 2 + 24;
      nodes.forEach((nd, k) => {
        const a = (Math.PI * 2 * k) / n - Math.PI / 2;
        out.push({
          node: nd,
          x: cx + R * Math.cos(a) - W / 2,
          y: cy + R * Math.sin(a) - H / 2,
          w: W, h: H, level: 0, idx: nd.meta.idx,
        });
      });
      return out;
    }

    if (vobj.kind === 'tree') {
      const levels = [];
      nodes.forEach(n => {
        const i = n.meta.idx;
        const lv = Math.floor(Math.log2(i + 1));
        (levels[lv] = levels[lv] || []).push({ node: n, idxInLevel: levels[lv].length });
      });
      levels.forEach((arr, lv) => {
        const totalW = arr.length * (W + p.gap);
        arr.forEach((item, k) => {
          out.push({
            node: item.node,
            x: 12 + k * (W + p.gap) + (lv % 2 ? p.gap : 0),
            y: 12 + lv * (H + p.gap + 10),
            w: W, h: H, level: lv, idx: item.node.meta.idx,
          });
        });
      });
      return out;
    }

    nodes.forEach((n, k) => {
      out.push({
        node: n,
        x: 14 + k * (W + p.gap),
        y: 18,
        w: W, h: H, level: 0, idx: k,
      });
    });
    return out;
  }

  /** 绘制 */
  function paint(host, vobj, params, opts) {
    opts = opts || {};
    host.innerHTML = '';
    const p = Object.assign({}, DEFAULT_PARAMS, params || {});
    const boxes = layout(vobj, p);
    if (!boxes.length) {
      host.innerHTML = '<div class="empty">' + (opts.emptyText || '链表为空（head == NULL）') + '</div>';
      return;
    }

    const maxX = Math.max.apply(null, boxes.map(b => b.x + b.w)) + 16;
    const maxY = Math.max.apply(null, boxes.map(b => b.y + b.h)) + 30;
    const svg = el('svg', { viewBox: '0 0 ' + maxX + ' ' + maxY, width: '100%', height: Math.min(320, maxY) });

    const cFrame = AVC.theme.css('LinkNodeFrame');
    const cNode = AVC.theme.css('LinkNode');
    const cLine = AVC.theme.css('LinkNodeLine');
    const cDot = AVC.theme.css('LinkDot');
    const cHead = AVC.theme.css('LinkHead');
    const cHeadText = AVC.theme.css('LinkHeadText');
    const cText = AVC.theme.css('LinkNodeText');
    const cRefHead = AVC.theme.css('LinkRefHeadLine');

    /* 先线后点 / 先点后线（LinkLinkFirst） */
    const drawEdges = () => {
      boxes.forEach((b, i) => {
        const n = b.node;
        const targets = [];
        if (vobj.kind === 'tree') {
          if (n.meta.left) targets.push({ to: n.meta.left, kind: 'left' });
          if (n.meta.right) targets.push({ to: n.meta.right, kind: 'right' });
        } else if (vobj.kind === 'graph') {
          const es = (vobj.meta && vobj.meta.edges) || [];
          for (const e of es) {
            if (e.from !== n.meta.idx) continue;
            const tb = boxes.find(x => x.node.meta.idx === e.to);
            if (tb) targets.push({ to: tb.node, kind: e.kind });
          }
        } else if (i + 1 < boxes.length) {
          targets.push({ to: n, kind: 'next' });   // 单链表：指向下一个盒子
        }
        targets.forEach(t => {
          let tgt;
          if (vobj.kind === 'tree') tgt = boxes.find(x => x.node === t.to);
          else tgt = boxes[i + 1];
          if (!tgt) return;

          /* 直角折线：先竖后横（tree 走层间竖线） */
          let pts;
          if (vobj.kind === 'tree') {
            const x1 = b.x + b.w / 2, y1 = b.y + b.h;
            const x2 = tgt.x + tgt.w / 2, y2 = tgt.y;
            const midY = (y1 + y2) / 2;
            pts = [[x1, y1], [x1, midY], [x2, midY], [x2, y2]];
          } else {
            const x1 = b.x + b.w, y1 = b.y + b.h / 2;
            const x2 = tgt.x, y2 = tgt.y + tgt.h / 2;
            const midX = (x1 + x2) / 2;
            pts = [[x1, y1], [midX, y1], [midX, y2], [x2, y2]];
          }
          const color = (t.kind === 'left' || t.kind === 'right') ? cLine : (opts.edgeKind === 'down' ? cRefHead : cLine);
          svg.appendChild(el('polyline', {
            points: pts.map(q => q[0] + ',' + q[1]).join(' '),
            fill: 'none', stroke: color, 'stroke-width': 1.4,
          }));

          /* 箭头：两段短线（3×5 比例）+ 连接处圆点 */
          const a = pts[pts.length - 2], bb = pts[pts.length - 1];
          const ang = Math.atan2(bb[1] - a[1], bb[0] - a[0]);
          const L = 6;
          [-0.45, 0.45].forEach(d => {
            svg.appendChild(el('line', {
              x1: bb[0], y1: bb[1],
              x2: bb[0] - L * Math.cos(ang + d), y2: bb[1] - L * Math.sin(ang + d),
              stroke: color, 'stroke-width': 1.4,
            }));
          });
          svg.appendChild(el('circle', { cx: bb[0], cy: bb[1], r: 1.8, fill: cDot }));
        });
      });
    };

    const drawNodes = () => {
      boxes.forEach((b, i) => {
        const n = b.node;
        const isHead = i === 0 && vobj.kind !== 'tree';
        const frameColor = isHead ? cHead : cFrame;
        /* 4 条独立边（便于逐边换色） */
        const x = b.x, y = b.y, w = b.w, h = b.h;
        svg.appendChild(el('rect', {
          x, y, width: w, height: h,
          fill: cNode, stroke: 'none',
          rx: p.round ? 8 : 2,
        }));
        const edges = [
          [x, y, x + w, y], [x + w, y, x + w, y + h],
          [x + w, y + h, x, y + h], [x, y + h, x, y],
        ];
        edges.forEach(e => svg.appendChild(el('line', {
          x1: e[0], y1: e[1], x2: e[2], y2: e[3], stroke: frameColor, 'stroke-width': 1.4,
        })));

        const t = el('text', { x: x + w / 2, y: y + h / 2, class: 'node-text' });
        t.textContent = String(n.valueText);
        t.style.fill = cText || '#0b3d91';
        svg.appendChild(t);

        /* 头指针标记 */
        if (isHead) {
          const ht = el('text', { x: x + 2, y: y - 5, class: 'node-key' });
          ht.textContent = 'head';
          ht.style.fill = cHeadText;
          svg.appendChild(ht);
        }
        /* 结点序号 */
        const it = el('text', { x: x + 3, y: y + h - 3, class: 'node-key', 'font-size': 8 });
        it.textContent = '#' + (n.meta && n.meta.idx != null ? n.meta.idx : i);
        svg.appendChild(it);
      });
    };

    if (p.linkFirst) { drawEdges(); drawNodes(); } else { drawNodes(); drawEdges(); }

    /* NULL 终止标记 */
    if (vobj.kind !== 'tree') {
      const last = boxes[boxes.length - 1];
      const nt = el('text', { x: last.x + last.w + 10, y: last.y + last.h / 2 + 4, class: 'null-mark' });
      nt.textContent = 'NULL';
      svg.appendChild(nt);
    }

    host.appendChild(svg);
  }

  AVC.linkView = { layout, paint, DEFAULT_PARAMS };
})(typeof window !== 'undefined' ? window : globalThis);
