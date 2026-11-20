/**
 * viewmgr.js -- 视图管理（M4，对应「视图」菜单）
 *
 * 负责 10 个窗的显隐 / 最大化 / 恢复布局，并持久化到 localStorage。
 * 对应原版：视图菜单 11 项 + 各窗左上角全屏/还原按钮。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};
  const KEY = 'avc.viewpref';

  const WINDOWS = [
    { key: 'editor', id: 'editorWin', name: '源文件窗口', group: '编辑' },
    { key: 'structure', id: 'structureWin', name: '程序结构窗口', group: '编辑' },
    { key: 'io', id: 'ioWin', name: '输入输出窗口', group: '编辑' },
    { key: 'demoArea', id: 'demoArea', name: '演示窗口', group: '演示' },
    { key: 'array', id: 'winArray', name: '数组窗口', group: '演示' },
    { key: 'ds', id: 'winDS', name: '数据结构窗口', group: '演示' },
    { key: 'stack', id: 'winStack', name: '栈窗口', group: '演示' },
    { key: 'heap', id: 'winHeap', name: '堆窗口', group: '演示' },
    { key: 'ds3d', id: null, name: '三维数据结构窗口', group: '演示', disabled: '样品未实现（2D 已覆盖）' },
    { key: 'info', id: 'ioWin', name: '信息窗口', group: '编辑', alias: 'err' },
  ];

  const state = { hidden: {}, maxed: null };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(state, JSON.parse(raw));
    } catch (_) {}
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }
  function elOf(w) { return w.id ? document.getElementById(w.id) : null; }

  function setVisible(w, on) {
    const el = elOf(w);
    if (!el) return;
    el.style.display = on ? '' : 'none';
    state.hidden[w.key] = !on;
    save();
  }
  function isVisible(w) {
    const el = elOf(w);
    return !!el && el.style.display !== 'none';
  }

  function maximize(winEl) {
    if (!winEl) return;
    const on = !winEl.classList.contains('maximized');
    document.querySelectorAll('.win.maximized').forEach(x => x.classList.remove('maximized'));
    if (on) winEl.classList.add('maximized');
    state.maxed = on ? winEl.id : null;
    save();
  }

  function restoreLayout() {
    state.hidden = {}; state.maxed = null; save();
    WINDOWS.forEach(w => {
      const el = elOf(w);
      if (el) { el.style.display = ''; el.classList.remove('maximized'); }
    });
  }

  /** 绑定所有 .ico[data-max] 的最大化按钮 */
  function bindMaxButtons() {
    document.querySelectorAll('.ico[data-max]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => maximize(document.getElementById(btn.dataset.max)));
    });
  }

  function apply() {
    WINDOWS.forEach(w => {
      const el = elOf(w);
      if (!el || w.disabled) return;
      if (state.hidden[w.key]) el.style.display = 'none';
    });
    if (state.maxed) {
      const m = document.getElementById(state.maxed);
      if (m) m.classList.add('maximized');
    }
    bindMaxButtons();
  }

  /** 给「视图」菜单用的条目（含勾选状态） */
  function menuItems() {
    return WINDOWS.map(w => Object.assign({}, w, {
      checked: w.disabled ? false : isVisible(w),
    }));
  }

  function toggleByKey(key) {
    const w = WINDOWS.find(x => x.key === key);
    if (!w || w.disabled) return false;
    setVisible(w, !isVisible(w));
    return true;
  }

  AVC.viewmgr = {
    WINDOWS, load, save, apply, maximize, restoreLayout,
    toggleByKey, menuItems, setVisible, isVisible, bindMaxButtons,
  };
})(typeof window !== 'undefined' ? window : globalThis);
