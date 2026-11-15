/**
 * stackheap.js -- 栈 / 堆三视图（M3）
 *
 * 一个基类 + 三个变体（对齐 06_STACK_HEAP.md）：
 *   STACK     运行栈：竖向堆叠 + top/DL 高亮（程序内存语义）
 *   DS_STACK  数据结构栈 SqStack：base/top 指针 + 下标（数组形态）
 *   DS_HEAP   数据结构堆 Heap：数组形态 + 大/小根堆树形（variants）
 * 三者共用 memcell 的格子原语，差别只在排列与来源。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  /* ---------------- 运行栈（活动记录） ---------------- */
  function renderStack(host, snap, structure, opts) {
    opts = opts || {};
    host.innerHTML = '';
    if (!snap || !snap.frames.length) {
      host.innerHTML = '<div class="empty">调用栈为空（程序未开始或已结束）</div>';
      return;
    }
    const attr = AVC.memcell.DEFAULT_ATTR();
    const prev = opts.prev || [];
    const changed = new Set();
    // 值变化高亮：与上一步同一变量比较
    const prevMap = {};
    prev.forEach(f => f.vars.forEach(v => { prevMap[f.fn + '/' + v.name] = v.value; }));

    snap.frames.forEach((f, i) => {
      const box = document.createElement('div');
      box.className = 'frame' + (f.depth > 1 ? ' recursive' : '');

      const head = document.createElement('header');
      head.innerHTML = '<span>' + f.fn + '</span>' +
        '<span class="d">depth=' + f.depth + '</span>' +
        '<span class="ra">base=' + f.base + ' · sp=' + f.sp + '</span>';
      box.appendChild(head);

      const cells = f.vars.map(v => {
        const key = f.fn + '/' + v.name;
        if (prevMap[key] !== undefined && prevMap[key] !== v.value) changed.add(v.addr);
        return { addr: v.addr, name: v.name, value: v.value, state: 'node' };
      });
      // 焦点 = 当前帧
      if (i === snap.frames.length - 1 && cells.length) cells[0] = Object.assign({}, cells[0], { state: 'focus' });

      const holder = document.createElement('div');
      holder.className = 'cells';
      cells.forEach(c => {
        if (changed.has(c.addr)) c.changed = true;
        holder.appendChild(AVC.memcell.cellEl(c, attr));
      });
      if (!cells.length) {
        const e = document.createElement('div');
        e.className = 'empty';
        e.textContent = '（无局部变量快照）';
        holder.appendChild(e);
      }
      box.appendChild(holder);
      host.appendChild(box);
    });
  }

  /* ---------------- 数据结构栈（SqStack） ---------------- */
  function renderDSStack(host, snap, structure, opts) {
    opts = opts || {};
    host.innerHTML = '';
    const arrs = AVC.vmodel.groupArrays(snap);
    // 优先用用户指定的变量；否则取最后一个一维数组（顺序栈常叫 st/base/stack/elem）
    const name = opts.varName && arrs[opts.varName] ? opts.varName : null;
    let arr = name ? arrs[name] : null;
    if (!arr) {
      const keys = Object.keys(arrs).filter(k => !arrs[k].twoD);
      const guess = keys.find(k => /st|stack|elem|base|data/i.test(k)) || keys[keys.length - 1];
      arr = guess ? arrs[guess] : null;
    }
    if (!arr) {
      host.innerHTML = '<div class="empty">无可视化的一维数组作为顺序栈<br>（在「跟踪设置」里指定变量，或让程序声明 <code>int st[N]</code>）</div>';
      return;
    }

    // top 指针：从快照里找同名标量（top/tp）
    const rows = AVC.vmodel.watchTable(snap, structure);
    const topRow = rows.find(r => /^(top|tp)$/i.test(r.name));
    const top = topRow ? parseInt(topRow.value, 10) : arr.dims[0] - 1;

    const attr = AVC.memcell.DEFAULT_ATTR();
    const title = document.createElement('div');
    title.style.cssText = 'font:11px var(--mono);color:#52606d;padding:2px 4px 6px';
    title.textContent = arr.name + '（顺序栈）· top=' + (isNaN(top) ? '?' : top) +
      ' · 容量 ' + arr.dims[0];
    host.appendChild(title);

    const holder = document.createElement('div');
    holder.className = 'cells';
    for (let i = 0; i < arr.dims[0]; i++) {
      const cell = arr.cells.find(c => c.i === i);
      const used = (isNaN(top) ? true : i <= top);
      holder.appendChild(AVC.memcell.cellEl({
        addr: i * 4,
        name: arr.name + '[' + i + ']' + (i === top ? ' ⇠top' : ''),
        value: used && cell ? cell.value : '',
        state: !used ? 'empty' : (i === top ? 'focus' : 'node'),
      }, attr));
    }
    host.appendChild(holder);
  }

  /* ---------------- 数据结构堆（Heap） ---------------- */
  function renderDSHeap(host, snap, structure, opts) {
    opts = opts || {};
    host.innerHTML = '';
    const arrs = AVC.vmodel.groupArrays(snap);
    const name = opts.varName && arrs[opts.varName] ? opts.varName : null;
    let arr = name ? arrs[name] : null;
    if (!arr) {
      const keys = Object.keys(arrs).filter(k => !arrs[k].twoD);
      const guess = keys.find(k => /heap|h|elem|data/i.test(k)) || keys[keys.length - 1];
      arr = guess ? arrs[guess] : null;
    }
    if (!arr) {
      host.innerHTML = '<div class="empty">无可视化的一维数组作为堆（Heap）<br>（在「跟踪设置」里指定变量，如 <code>int h[N]</code>）</div>';
      return;
    }

    const shape = opts.shape || 'array';   // array | tree
    const attr = AVC.memcell.DEFAULT_ATTR();

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:6px;align-items:center;padding:2px 4px 6px;font:11px var(--ui)';
    bar.innerHTML = '<b>' + arr.name + '</b>（堆）· 容量 ' + arr.dims[0] +
      '　<select id="dsHeapShape" class="mini-select">' +
      '<option value="array"' + (shape === 'array' ? ' selected' : '') + '>数组形态</option>' +
      '<option value="tree"' + (shape === 'tree' ? ' selected' : '') + '>大根堆树形</option>' +
      '</select>';
    host.appendChild(bar);

    if (shape === 'array') {
      const holder = document.createElement('div');
      holder.className = 'cells';
      for (let i = 0; i < arr.dims[0]; i++) {
        const cell = arr.cells.find(c => c.i === i);
        holder.appendChild(AVC.memcell.cellEl({
          addr: i * 4, name: arr.name + '[' + i + ']',
          value: cell ? cell.value : '', state: cell ? 'node' : 'empty',
        }, attr));
      }
      host.appendChild(holder);
    } else {
      // 树形：完全二叉树按 i → 2i+1 / 2i+2 排布（SVG 简易层次图）
      AVC.dsView.paintHeapTree(host, arr);
    }

    const sel = host.querySelector('#dsHeapShape');
    if (sel) sel.addEventListener('change', () => {
      renderDSHeap(host, snap, structure, Object.assign({}, opts, { shape: sel.value }));
    });
  }

  /* ---------------- 堆块（动态分配堆，另一种语义） ---------------- */
  function renderHeapBlocks(host, snap) {
    host.innerHTML = '';
    if (!snap || !snap.heap.length) {
      host.innerHTML = '<div class="empty">尚未 malloc（堆区从 9999 向低地址分配）</div>';
      return;
    }
    const sorted = snap.heap.slice().sort((a, b) => b.addr - a.addr);
    sorted.forEach(h => {
      const row = document.createElement('div');
      row.className = 'heap-block' + (h.state === 'freed' ? ' freed' : '');
      const barW = Math.max(6, Math.min(120, h.size * 2));
      row.innerHTML =
        '<span class="addr">@' + h.addr + '</span>' +
        '<span class="size">' + h.size + ' B</span>' +
        '<span class="heap-bar" style="width:' + barW + 'px"></span>' +
        '<span class="st">' + (h.state === 'used' ? '使用中' : '已释放') + '</span>' +
        '<span class="size">行 ' + h.line + '</span>';
      host.appendChild(row);
    });
  }

  AVC.stackheap = { renderStack, renderDSStack, renderDSHeap, renderHeapBlocks };
})(typeof window !== 'undefined' ? window : globalThis);
