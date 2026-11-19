/**
 * memcell.js -- 内存单元格原语（M3）
 *
 * 对应 MemCellUnit：**栈、堆、内存三个视图共用同一套格子绘制**，
 * 差别只在"排列方向"（栈=竖向堆叠、堆=按地址稀疏、内存=连续网格）。
 *
 * 格子契约（对齐 08_MEMORY_CELL.md）：
 *   { attr: 外观属性集, addr, name, value, state }
 *   state: 'empty' | 'node' | 'focus' | 'freed' | 'invalid'
 *   attr : { min, max, labelWidth, nameWidth, valueWidth, addrWidth }
 *   地址越界（< min || > max）直接不画 —— 由背景体现"非法区"。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  const DEFAULT_ATTR = () => ({
    min: 0,
    max: Number(AVC.theme.get('MaxMemory')) || 10000,
    labelWidth: Number(AVC.theme.get('MemLabelWidth')) || 70,
    nameWidth: Number(AVC.theme.get('MemNameWidth')) || 70,
    valueWidth: Number(AVC.theme.get('MemValueWidth')) || 70,
    addrWidth: Number(AVC.theme.get('MemAddrWidth')) || 35,
  });

  function inRange(cell, attr) {
    const a = attr || DEFAULT_ATTR();
    return cell.addr >= a.min && cell.addr <= a.max;
  }

  /** 单格 DOM */
  function cellEl(cell, attr) {
    const a = attr || DEFAULT_ATTR();
    const el = document.createElement('div');
    el.className = 'cell ' + (cell.state || 'node');
    el.dataset.addr = String(cell.addr);
    el.title = (cell.name || '') + ' @' + cell.addr + ' = ' + (cell.value == null ? '' : cell.value);

    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = cell.name != null && cell.name !== '' ? cell.name : '\u00a0';
    nm.style.maxWidth = a.nameWidth + 'px';

    const ad = document.createElement('div');
    ad.className = 'ad';
    ad.textContent = String(cell.addr);
    ad.style.minWidth = a.addrWidth + 'px';

    const vl = document.createElement('div');
    vl.className = 'vl';
    vl.textContent = cell.value == null ? '' : String(cell.value);
    vl.style.maxWidth = (a.valueWidth + 8) + 'px';

    el.appendChild(nm);
    el.appendChild(ad);
    el.appendChild(vl);

    if (cell.state === 'focus') el.style.outline = '2px solid ' + AVC.theme.css('MemFocus');
    if (cell.changed) el.classList.add('changed');
    return el;
  }

  /**
   * 批量渲染（重建式：先清空容器再铺 —— 等价原版"重建对象列表再整幅重绘"）
   * @param {HTMLElement} host
   * @param {Array} cells
   * @param {object} attr
   * @param {object} opts { layout:'grid'|'column', changed:Set(addr) }
   */
  function render(host, cells, attr, opts) {
    opts = opts || {};
    const a = attr || DEFAULT_ATTR();
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = opts.layout === 'column' ? 'cells cells-col' : 'cells';

    let shown = 0, hidden = 0;
    for (const c of cells) {
      if (!inRange(c, a)) { hidden++; continue; }
      if (opts.changed && opts.changed.has(c.addr)) c.changed = true;
      wrap.appendChild(cellEl(c, a));
      shown++;
    }
    host.appendChild(wrap);

    if (hidden) {
      const tip = document.createElement('div');
      tip.className = 'empty';
      tip.style.padding = '4px 8px';
      tip.textContent = '（' + hidden + ' 个单元在合法地址范围 [' + a.min + ',' + a.max + '] 之外，按原版语义不绘制）';
      host.appendChild(tip);
    }
    if (!shown && !hidden) {
      host.innerHTML = '<div class="empty">' + (opts.emptyText || '暂无可显示单元') + '</div>';
    }
    return shown;
  }

  /**
   * 从 session 快照 + vmodel 表格造出格子数组
   * @param {object} snap      session.snapshotAt()
   * @param {object} structure 静态结构
   * @param {object} opts      { focusNames:Set }
   */
  function cellsFromSnapshot(snap, structure, opts) {
    opts = opts || {};
    const rows = AVC.vmodel.watchTable(snap, structure);
    const out = [];
    for (const r of rows) {
      out.push({
        addr: r.addr,
        name: r.name,
        value: r.value,
        state: (opts.focusNames && opts.focusNames.has(r.name)) ? 'focus' : 'node',
        frame: r.frame,
      });
    }
    return out;
  }

  /**
   * 结点对象表：把 dump 出来的结点（lists[] / nxm 图模型）列成"对象表格"。
   * 之前只有 cellsFromSnapshot（变量行），结点本身没有 cells 化入口，
   * 于是"结点对象表"这种视图做不出来。
   * @param {Array} nodes [{idx,key/value,ptr,more}] 或 N 结点 [{idx,value,meta}]
   * @param {object} opts { addrOf:(node)=>number, stateOf:(node)=>'node'|'focus'|'freed' }
   */
  function cellsFromList(nodes, opts) {
    opts = opts || {};
    const out = [];
    (nodes || []).forEach((n, k) => {
      const idx = n.idx != null ? n.idx : k;
      const val = n.key != null ? n.key : (n.value != null ? n.value : '');
      const addr = opts.addrOf ? opts.addrOf(n, k) : (n.ptr != null && n.ptr !== 0 ? n.ptr : (idx + 1) * 4);
      out.push({
        addr,
        name: '#' + idx,
        value: String(val),
        state: opts.stateOf ? opts.stateOf(n, k) : (n.state || 'node'),
        kind: 'node',
        idx,
      });
    });
    return out;
  }

  AVC.memcell = { DEFAULT_ATTR, cellEl, render, cellsFromSnapshot, cellsFromList, inRange };
})(typeof window !== 'undefined' ? window : globalThis);
