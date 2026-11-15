/**
 * treeView.js -- 树 / 图视图（M3，对齐 07_TREE_GRAPH）
 *
 * 关键取舍（照原版）：**不自绘**。原版用 TTreeView 控件，绘图 API 调用为 0；
 * 这里用可折叠 DOM 树（<ul>/<li>），免费得到折叠、滚动、键盘导航、就地编辑。
 *   · 只有两个状态图标：叶子 / 有子
 *   · 文本 = 名字 + 分隔 + 值
 *   · 兄弟按 key 排序（TreeView1Compare）
 *   · 双击就地编辑 → 写回可视化层（不改程序内存）
 *   · 按需重建（不是每帧）
 *
 * 另外提供 paintHeapTree()：把"顺序存储的堆"按 i→2i+1/2i+2 画成完全二叉树。
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

  /* ---------------- 可折叠 DOM 树 ---------------- */
  function nodeText(n) {
    const key = n.keyName || 'key';
    return n.valueText != null ? n.valueText : (n.name + ': ?');
  }

  function buildLi(n, opts, container) {
    const li = document.createElement('li');
    li.dataset.nodeId = n.name;

    const row = document.createElement('div');
    row.className = 'tree node fn';

    const icon = document.createElement('span');
    icon.className = 'kind';
    const kids = (n.children || []).filter(Boolean);
    icon.textContent = kids.length ? '▾' : '·';       // 14/15 两个状态的等价物
    if (kids.length) row.classList.add('has-children');

    const label = document.createElement('span');
    label.textContent = nodeText(n);

    row.appendChild(icon);
    row.appendChild(label);
    // 语义角标：红黑树 color（0=黑 1=红）/ 线索树 ltag（0=指针 1=线索）
    // 采集层用 NM 事件发来这些属性（meta.color / meta.ltag），这里只认 meta，不认结构名。
    const meta = (n && n.meta) || {};
    if (meta.color != null && meta.color !== '') {
      const isRed = String(meta.color) === '1';
      const badge = document.createElement('span');
      badge.className = 'badge color';
      badge.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;margin-left:4px;' +
        'background:' + (isRed ? '#e5484d' : '#22272e');
      badge.title = isRed ? '红结点（color=1）' : '黑结点（color=0）';
      badge.textContent = '';
      row.appendChild(badge);
    }
    if (meta.ltag != null && meta.ltag !== '') {
      const tag = document.createElement('span');
      tag.className = 'badge thread';
      tag.style.cssText = 'margin-left:4px;font:10px var(--mono);color:#8250df';
      tag.textContent = String(meta.ltag) === '1' ? '线索' : '指针';
      tag.title = String(meta.ltag) === '1' ? 'ltag=1：左指针是线索（指向前驱）' : 'ltag=0：左指针是孩子';
      row.appendChild(tag);
    }
    li.appendChild(row);

    if (kids.length) {
      const ul = document.createElement('ul');
      ul.className = 'children';
      kids.forEach((c, i) => ul.appendChild(buildLi(c, opts, container, i)));
      li.appendChild(ul);
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        ul.style.display = ul.style.display === 'none' ? '' : 'none';
        icon.textContent = ul.style.display === 'none' ? '▸' : '▾';
      });
    }

    row.addEventListener('click', () => {
      li.classList.toggle('sel');
      if (opts && opts.onPick) opts.onPick(n);
    });

    // 就地编辑（TreeView1Edited 的等价物）：只改显示，注明不改程序内存
    row.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const cur = label.textContent;
      const inp = document.createElement('input');
      inp.value = cur;
      inp.style.cssText = 'font:11px var(--mono);width:80px';
      label.textContent = '';
      label.appendChild(inp);
      inp.focus(); inp.select();
      const commit = () => {
        label.textContent = inp.value || cur;
        if (opts && opts.onEdit) opts.onEdit(n, inp.value);
      };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') inp.blur();
        if (ev.key === 'Escape') { label.textContent = cur; }
      });
    });

    return li;
  }

  /**
   * @param {HTMLElement} host
   * @param {object} vobj   vmodel.objFromList 产物（kind='tree'|'list'）
   * @param {object} opts   { forest:boolean, onPick, onEdit, emptyText }
   */
  function render(host, vobj, opts) {
    opts = opts || {};
    host.innerHTML = '';
    if (!vobj || !(vobj.children || []).length) {
      host.innerHTML = '<div class="empty">' + (opts.emptyText || '树为空（root == NULL）') + '</div>';
      return;
    }
    const nodes = vobj.children.slice();

    const ul = document.createElement('ul');
    ul.className = 'tree';
    ul.style.listStyle = 'none';
    ul.style.margin = '0';
    ul.style.padding = '0 0 0 4px';

    if (vobj.kind === 'tree') {
      // BFS 序号还原层级：只有"没被当作别人孩子"的结点才是根
      const childSet = new Set();
      nodes.forEach(n => {
        if (n.meta.left) childSet.add(n.meta.left.meta.idx);
        if (n.meta.right) childSet.add(n.meta.right.meta.idx);
      });
      const roots = nodes.filter(n => !childSet.has(n.meta.idx));
      (roots.length ? roots : [nodes[0]]).forEach(r => ul.appendChild(buildLi(r, opts, host)));
    } else {
      // 线性结构用树呈现：链式展开成一列
      let cur = nodes[0];
      let guard = 0;
      while (cur && guard++ < 40) {
        ul.appendChild(buildLi(cur, opts, host));
        cur = nodes[guard];
        if (cur) break;   // 列表默认只展一层，避免与结构窗重复
      }
      // 简化：直接把所有结点平铺
      ul.innerHTML = '';
      nodes.forEach(n => ul.appendChild(buildLi(n, opts, host)));
    }

    host.appendChild(ul);
  }

  /** 森林视图（并查集 UFSet）：每个根一棵树 */
  function renderForest(host, roots, opts) {
    opts = opts || {};
    host.innerHTML = '';
    if (!roots || !roots.length) {
      host.innerHTML = '<div class="empty">' + (opts.emptyText || '无等价类') + '</div>';
      return;
    }
    const wrap = document.createElement('div');
    roots.forEach((r, i) => {
      const box = document.createElement('div');
      box.className = 'frame';
      const h = document.createElement('header');
      h.innerHTML = '<span>class #' + i + '</span><span class="ra">root=' + (r.valueText || '') + '</span>';
      box.appendChild(h);
      const host2 = document.createElement('div');
      host2.style.padding = '2px 6px';
      const ul = document.createElement('ul');
      ul.className = 'tree';
      ul.style.listStyle = 'none';
      ul.appendChild(buildLi(r, opts, host2));
      host2.appendChild(ul);
      box.appendChild(host2);
      wrap.appendChild(box);
    });
    host.appendChild(wrap);
  }

  /* ---------------- 堆（顺序存储）→ 完全二叉树 ---------------- */
  function paintHeapTree(host, arr) {
    const n = arr.dims[0] || arr.cells.length;
    const get = (i) => {
      const c = arr.cells.find(x => x.i === i);
      return c ? parseFloat(c.value) : null;
    };
    const levels = Math.max(1, Math.ceil(Math.log2(n + 1)));
    const W = Math.max(320, 60 * Math.pow(2, Math.min(levels - 1, 4)));
    const H = 42 * levels + 16;
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H });

    const pos = (i) => {
      const lv = Math.floor(Math.log2(i + 1));
      const inLevel = i - (Math.pow(2, lv) - 1);
      const cnt = Math.pow(2, lv);
      const x = (W / (cnt + 1)) * (inLevel + 1);
      const y = 20 + lv * 42;
      return [x, y];
    };

    const cFrame = AVC.theme.css('LinkNodeFrame');
    const cNode = AVC.theme.css('LinkNode');
    const cLine = AVC.theme.css('LinkNodeLine');

    for (let i = 0; i < n; i++) {
      const v = get(i);
      const p = pos(i);
      [2 * i + 1, 2 * i + 2].forEach(c => {
        if (c < n) {
          const q = pos(c);
          svg.appendChild(el('line', { x1: p[0], y1: p[1] + 12, x2: q[0], y2: q[1] - 12, stroke: cLine, 'stroke-width': 1.2 }));
        }
      });
      svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: 12, fill: cNode, stroke: cFrame, 'stroke-width': 1.2 }));
      const t = el('text', { x: p[0], y: p[1], class: 'node-text' });
      t.textContent = v == null ? '' : String(v);
      svg.appendChild(t);
      const it = el('text', { x: p[0] + 13, y: p[1] + 12, class: 'node-key', 'font-size': 8 });
      it.textContent = '[' + i + ']';
      svg.appendChild(it);
    }
    host.appendChild(svg);
  }

  AVC.treeView = { render, renderForest, paintHeapTree };
  AVC.dsView = AVC.dsView || {};
  AVC.dsView.paintHeapTree = paintHeapTree;
})(typeof window !== 'undefined' ? window : globalThis);
