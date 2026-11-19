/**
 * arrayView.js -- 一维 / 二维数组视图（M3，对齐 02_ARRAY_1D / 03_ARRAY_2D）
 *
 * 一维形态 = Shape{0=矩形框,1=点} × ShowGrid × ShowLine（三个独立开关，共 8 组合）
 * 绘制顺序照抄原版：X 轴(含两段短线箭头) → Y 轴 → 刻度与刻度值 → 元素本体
 * 二维：DrawMode=1 柱状（SVG 柱）/ 3 曲面（等距线框）；另提供 sparse 稀疏矩阵网格
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};
  const SVGNS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    const n = document.createElementNS(SVGNS, name);
    for (const k in (attrs || {})) n.setAttribute(k, attrs[k]);
    return n;
  }
  function text(parent, x, y, s, cls) {
    const t = el('text', { x, y, class: cls || 'node-key' });
    t.textContent = s;
    parent.appendChild(t);
    return t;
  }

  /* ---------------------------------------------------------------- 一维 */
  /**
   * @param {HTMLElement} host
   * @param {object} arr  vmodel.groupArrays 的一项 {name,dims,cells}
   * @param {object} opts { shape, showGrid, showLine, focus:[nameA,nameB], changed:Set }
   */
  function render1D(host, arr, opts) {
    opts = opts || {};
    host.innerHTML = '';
    const shape = opts.shape != null ? opts.shape : AVC.theme.arr1.shape();
    const showGrid = opts.showGrid != null ? opts.showGrid : AVC.theme.arr1.showGrid();
    const showLine = opts.showLine != null ? opts.showLine : AVC.theme.arr1.showLine();

    const n = arr.dims[0] || arr.cells.length;
    const step = Math.max(26, Math.min(56, Math.floor(640 / Math.max(1, n))));
    const padL = 34, padB = 34, padT = 16;
    const W = padL + step * n + 16;
    const H = padT + 96 + padB;

    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H });
    const baseY = padT + 96;                 // X 轴基准 y

    /* 值域 → 像素（高度方向） */
    const nums = arr.cells.map(c => parseFloat(c.value)).filter(v => !isNaN(v));
    const maxV = nums.length ? Math.max.apply(null, nums.map(Math.abs)) : 1;
    const scale = (v) => (Math.abs(v) / (maxV || 1)) * 76;

    /* ① X 轴 + 两段短线箭头 + 标签 */
    const axisColor = AVC.theme.css('ArrOneCoor');
    svg.appendChild(el('line', { x1: padL, y1: baseY, x2: W - 10, y2: baseY, stroke: axisColor, 'stroke-width': 1 }));
    svg.appendChild(el('polyline', { points: (W - 10) + ',' + baseY + ' ' + (W - 13) + ',' + (baseY + 5), stroke: axisColor, fill: 'none' }));
    svg.appendChild(el('polyline', { points: (W - 10) + ',' + baseY + ' ' + (W - 13) + ',' + (baseY - 5), stroke: axisColor, fill: 'none' }));
    text(svg, W - 18, baseY - 8, 'X', 'node-key');

    /* ② Y 轴 */
    svg.appendChild(el('line', { x1: padL, y1: baseY, x2: padL, y2: padT - 2, stroke: axisColor, 'stroke-width': 1 }));
    svg.appendChild(el('polyline', { points: padL + ',' + (padT - 2) + ' ' + (padL - 5) + ',' + (padT + 4), stroke: axisColor, fill: 'none' }));
    svg.appendChild(el('polyline', { points: padL + ',' + (padT - 2) + ' ' + (padL + 5) + ',' + (padT + 4), stroke: axisColor, fill: 'none' }));
    text(svg, padL - 12, padT + 4, 'Y', 'node-key');

    /* ③ 网格（可选） */
    if (showGrid) {
      const gc = AVC.theme.css('ArrOneGrid');
      for (let i = 0; i <= n; i++) {
        const x = padL + i * step;
        svg.appendChild(el('line', { x1: x, y1: padT, x2: x, y2: baseY, stroke: gc, 'stroke-width': 0.6, 'stroke-dasharray': '3 3' }));
      }
    }

    /* ④ 元素本体 + 刻度 + 刻度值 */
    const f1 = AVC.theme.css('ArrOneFocus1');
    const f2 = AVC.theme.css('ArrOneFocus2');
    const fillNode = AVC.theme.css('MemNode');
    const frame = AVC.theme.css('MemFrame');
    const focus = opts.focus || [];

    const pts = [];
    for (let i = 0; i < n; i++) {
      const cell = arr.cells.find(c => c.i === i);
      const v = cell ? parseFloat(cell.value) : NaN;
      const cx = padL + i * step + step / 2;
      const h = isNaN(v) ? 0 : scale(v);
      const isF1 = focus[0] && cell && cell.name === focus[0];
      const isF2 = focus[1] && cell && cell.name === focus[1];
      const stroke = isF1 ? f1 : (isF2 ? f2 : frame);
      const strokeW = (isF1 || isF2) ? 2.2 : 1;

      if (shape === 1) {
        /* 点形态 */
        svg.appendChild(el('circle', {
          cx, cy: baseY - (isNaN(v) ? 0 : h), r: 3.5,
          fill: isF1 ? f1 : (isF2 ? f2 : fillNode), stroke, 'stroke-width': strokeW,
        }));
      } else {
        /* 矩形框形态：高度=值，宽度=步长*0.6 */
        const bw = Math.max(8, step * 0.6);
        const bh = Math.max(2, isNaN(v) ? 2 : h);
        svg.appendChild(el('rect', {
          x: cx - bw / 2, y: baseY - bh, width: bw, height: bh,
          fill: fillNode, stroke, 'stroke-width': strokeW, rx: 2,
        }));
      }
      pts.push(cx + ',' + (baseY - (isNaN(v) ? 0 : h)));

      /* 刻度线 + 刻度值（下标） */
      svg.appendChild(el('line', { x1: cx, y1: baseY, x2: cx, y2: baseY + 5, stroke: axisColor, 'stroke-width': 1 }));
      const tk = text(svg, cx, baseY + 17, String(i), 'node-key');
      tk.setAttribute('text-anchor', 'middle');
      /* 元素值标注 */
      if (cell) {
        const tv = text(svg, cx, baseY - (isNaN(v) ? 6 : h) - 5, String(cell.value), 'node-text');
        tv.setAttribute('text-anchor', 'middle');
        tv.style.fill = AVC.theme.css('ArrValue');
      }
    }

    /* ⑤ 连线（可选） */
    if (showLine && pts.length > 1) {
      svg.appendChild(el('polyline', { points: pts.join(' '), fill: 'none', stroke: AVC.theme.css('ArrOneLine'), 'stroke-width': 1.4 }));
    }

    /* 角标：数组名 + 形态说明 */
    const cap = text(svg, padL, H - 4,
      arr.name + '[' + n + ']  ' + (shape === 1 ? '点' : '矩形框') +
      (showGrid ? ' + 网格' : '') + (showLine ? ' + 连线' : ''), 'node-key');
    cap.style.fill = AVC.theme.css('ArrName');

    host.appendChild(svg);
  }

  /* ---------------------------------------------------------------- 二维 */
  function render2D(host, arr, opts) {
    opts = opts || {};
    host.innerHTML = '';
    const mode = opts.mode || 'bar';        // bar(柱状) | surface(曲面线框) | sparse(稀疏网格) | table(二维表格)
    const rows = arr.dims[0], cols = arr.dims[1] || 1;
    const get = (i, j) => {
      const c = arr.cells.find(x => x.i === i && x.j === j);
      return c ? parseFloat(c.value) : 0;
    };

    if (mode === 'sparse') return renderSparse(host, arr, opts);
    // GDI 不可用时的降级画法：真表格（DOM 网格，行列表头 + 全部单元格）
    if (mode === 'table' || mode === 'grid') return renderTable(host, arr, opts);

    const W = 460, H = 260, padL = 34, padB = 28, padT = 14;
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H });

    if (mode === 'surface') {
      /* 曲面 = 把每个数据点当三维顶点，用线连成网格（等价原版 GL_LINES 三向线） */
      const maxV = Math.max(1, ...arr.cells.map(c => Math.abs(parseFloat(c.value) || 0)));
      const dx = (W - padL - 24) / Math.max(1, cols);
      const dy = 26;                                  // 行方向的等距投影偏移
      const proj = (i, j, v) => {
        const x = padL + j * dx + i * dx * 0.45;
        const y = (H - padB) - i * dy - (Math.abs(v) / maxV) * 70;
        return [x, y];
      };
      const stroke = AVC.theme.css('ArrOneLine');
      const g = AVC.theme.css('ArrOneGrid');
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const p = proj(i, j, get(i, j));
          if (j + 1 < cols) {
            const q = proj(i, j + 1, get(i, j + 1));
            svg.appendChild(el('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke, 'stroke-width': 1.2 }));
          }
          if (i + 1 < rows) {
            const q = proj(i + 1, j, get(i + 1, j));
            svg.appendChild(el('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: g, 'stroke-width': 1 }));
            if (j + 1 < cols) {
              const q2 = proj(i + 1, j + 1, get(i + 1, j + 1));
              svg.appendChild(el('line', { x1: p[0], y1: p[1], x2: q2[0], y2: q2[1], stroke: g, 'stroke-width': 0.7, 'stroke-dasharray': '2 2' }));
            }
          }
          svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: 2.6, fill: AVC.theme.css('MemNode'), stroke }));
        }
      }
    } else {
      /* 柱状：每列一根柱，行方向分组 */
      const maxV = Math.max(1, ...arr.cells.map(c => Math.abs(parseFloat(c.value) || 0)));
      const bw = (W - padL - 20) / Math.max(1, cols);
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const v = get(i, j);
          const h = (Math.abs(v) / maxV) * (H - padB - padT - rows * 6);
          const x = padL + j * bw + i * 3;
          const y = H - padB - h - i * 6;
          svg.appendChild(el('rect', {
            x, y, width: Math.max(6, bw - 6), height: Math.max(1, h),
            fill: AVC.theme.css('MemNode'), stroke: AVC.theme.css('MemFrame'), 'stroke-width': 0.8, rx: 2,
          }));
          if (bw > 26) {
            const t = text(svg, x + Math.max(6, bw - 6) / 2, y - 3, String(v), 'node-key');
            t.setAttribute('text-anchor', 'middle');
          }
        }
      }
      /* 行/列标 */
      for (let j = 0; j < cols; j++) {
        const t = text(svg, padL + j * bw + bw / 2, H - padB + 14, 'c' + j, 'node-key');
        t.setAttribute('text-anchor', 'middle');
      }
      for (let i = 0; i < rows; i++) text(svg, 6, H - padB - 8 - i * 6, 'r' + i, 'node-key');
    }

    const cap = text(svg, padL, H - 4,
      arr.name + '[' + rows + '][' + cols + ']  ' +
      (mode === 'surface' ? '曲面线框（等距投影）' : '柱状'), 'node-key');
    cap.style.fill = AVC.theme.css('ArrName');
    host.appendChild(svg);
  }

  /** 稀疏矩阵：mu×nu 网格，非零元填值，零元留空（对齐 10.2.1 画法 B） */
  function renderSparse(host, arr, opts) {
    const rows = arr.dims[0], cols = arr.dims[1] || 1;
    const box = document.createElement('div');
    box.className = 'matrix';
    box.style.gridTemplateColumns = 'repeat(' + (cols + 1) + ', minmax(34px,1fr))';

    const corner = document.createElement('div');
    corner.className = 'mcell';
    corner.textContent = 'i\\j';
    box.appendChild(corner);
    for (let j = 0; j < cols; j++) {
      const h = document.createElement('div');
      h.className = 'mcell';
      h.style.background = '#eef3f9';
      h.textContent = String(j);
      box.appendChild(h);
    }
    let nonzero = 0;
    for (let i = 0; i < rows; i++) {
      const rh = document.createElement('div');
      rh.className = 'mcell';
      rh.style.background = '#eef3f9';
      rh.textContent = String(i);
      box.appendChild(rh);
      for (let j = 0; j < cols; j++) {
        const c = arr.cells.find(x => x.i === i && x.j === j);
        const d = document.createElement('div');
        d.className = 'mcell';
        if (c && parseFloat(c.value) !== 0) {
          d.textContent = String(c.value);
          d.style.background = AVC.theme.css('MemNode');
          nonzero++;
        } else {
          d.textContent = '';
          d.style.background = AVC.theme.css('MemEmpty');
        }
        box.appendChild(d);
      }
    }
    host.appendChild(box);
    const cap = document.createElement('div');
    cap.className = 'empty';
    cap.style.textAlign = 'left';
    cap.textContent = arr.name + ' 稀疏矩阵 ' + rows + '×' + cols + ' · 非零元 ' + nonzero + ' 个';
    host.appendChild(cap);
  }

  /* ---------------------------------------------------------------- 二维表格（GDI 降级画法） */
  /**
   * 二维表格：行列表头 + 每个单元格都画（含 0）。
   * 这是"图形 API 不可用时的降级画法"在浏览器里的等价物（DOM 网格），
   * 也是稀疏矩阵/邻接矩阵最省心的读法：格子对齐、值全在、可复制。
   * 大矩阵只画视口内的前 limit×limit 格（避免节点爆炸，见 docs 引用的虚拟滚动做法）。
   */
  function renderTable(host, arr, opts) {
    opts = opts || {};
    host.innerHTML = '';
    const rows = arr.dims[0] || 0, cols = arr.dims[1] || 1;
    const limit = Math.max(1, Math.min(opts.limit || 24, 64));
    const R = Math.min(rows, limit), C = Math.min(cols, limit);
    const get = (i, j) => {
      const c = (arr.cells || []).find(x => x.i === i && x.j === j);
      return c ? c.value : '';
    };

    const box = document.createElement('div');
    box.className = 'matrix';
    box.style.gridTemplateColumns = 'repeat(' + (C + 1) + ', minmax(34px,1fr))';

    const corner = document.createElement('div');
    corner.className = 'mcell';
    corner.textContent = 'i\\j';
    box.appendChild(corner);
    for (let j = 0; j < C; j++) {
      const h = document.createElement('div');
      h.className = 'mcell head';
      h.style.background = '#eef3f9';
      h.textContent = String(j);
      box.appendChild(h);
    }
    for (let i = 0; i < R; i++) {
      const rh = document.createElement('div');
      rh.className = 'mcell head';
      rh.style.background = '#eef3f9';
      rh.textContent = String(i);
      box.appendChild(rh);
      for (let j = 0; j < C; j++) {
        const v = get(i, j);
        const d = document.createElement('div');
        d.className = 'mcell';
        d.textContent = String(v);
        if (parseFloat(v) !== 0) d.style.background = AVC.theme.css('MemNode');
        box.appendChild(d);
      }
    }
    host.appendChild(box);

    const cap = document.createElement('div');
    cap.className = 'empty';
    cap.style.textAlign = 'left';
    cap.textContent = arr.name + ' 二维表格 ' + rows + '×' + cols +
      (R < rows || C < cols ? '（只画前 ' + R + '×' + C + ' 格）' : '') + ' · 共 ' + (arr.cells || []).length + ' 个已知单元';
    host.appendChild(cap);
  }

  /* ---------------------------------------------------------------- 哈希槽位（开放定址） */
  /**
   * 散列槽位表：每个槽一格，空槽 / 占用区分显示。
   * 开放定址的关键信息（哪个槽被谁占、探测到哪里）就靠这张格子表看。
   * @param {object} opts { occupied:(v)=>bool, probeFrom:number }
   */
  function renderHashSlots(host, arr, opts) {
    opts = opts || {};
    host.innerHTML = '';
    const n = arr.dims[0] || (arr.cells || []).length;
    const occupied = opts.occupied || ((v) => parseFloat(v) !== 0 && v !== '' && v != null);
    const box = document.createElement('div');
    box.className = 'cells';
    box.style.flexWrap = 'wrap';
    let used = 0;
    for (let i = 0; i < n; i++) {
      const c = (arr.cells || []).find(x => x.i === i);
      const v = c ? c.value : '';
      const busy = occupied(v);
      if (busy) used++;
      const cell = document.createElement('div');
      cell.className = 'cell ' + (busy ? 'node' : 'empty');
      cell.dataset.addr = String(i);
      cell.title = '槽位 ' + i + '：' + (busy ? ('占用 ' + v) : '空');
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = '#' + i;
      const vl = document.createElement('div');
      vl.className = 'vl';
      vl.textContent = busy ? String(v) : '·';
      vl.style.color = busy ? '' : '#a0aec0';
      cell.appendChild(nm);
      cell.appendChild(vl);
      if (busy) cell.style.background = AVC.theme.css('MemNode');
      box.appendChild(cell);
    }
    host.appendChild(box);

    const cap = document.createElement('div');
    cap.className = 'empty';
    cap.style.textAlign = 'left';
    cap.textContent = arr.name + ' 散列槽位 ' + n + ' 个 · 已占用 ' + used + ' · 空槽 ' + (n - used) +
      '（开放定址：冲突时按 (i+1)%M 线性探测下一个空槽）';
    host.appendChild(cap);
    return { slots: n, used, empty: n - used };
  }

  AVC.arrayView = { render1D, render2D, renderSparse, renderTable, renderHashSlots };
})(typeof window !== 'undefined' ? window : globalThis);
