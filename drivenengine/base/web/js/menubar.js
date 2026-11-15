/**
 * menubar.js -- 菜单栏（M4）
 *
 * 7 个菜单、约 45 条命令（对齐 Helpdoc 第七章）。
 * 命令不在这里实现，而是由 app.js 注册到 AVC.menubar.commands。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  const sep = () => ({ sep: true });

  const MENUS = [
    {
      key: 'file', label: '文件', items: [
        { cmd: 'file.new', label: '新建', kbd: 'Ctrl+N' },
        { cmd: 'file.open', label: '打开…', kbd: 'Ctrl+O' },
        { cmd: 'file.sample', label: '内置样例…' },
        { cmd: 'file.save', label: '保存', kbd: 'Ctrl+S' },
        { cmd: 'file.saveAs', label: '另存为…' },
        sep(),
        { cmd: 'file.close', label: '关闭' },
        { cmd: 'file.closeAll', label: '关闭全部' },
        sep(),
        { cmd: 'app.about', label: '关于 prototype01' },
      ],
    },
    {
      key: 'edit', label: '编辑', items: [
        { cmd: 'edit.undo', label: '撤销', kbd: 'Ctrl+Z' },
        { cmd: 'edit.redo', label: '重做', kbd: 'Ctrl+Y' },
        sep(),
        { cmd: 'edit.cut', label: '剪切', kbd: 'Ctrl+X' },
        { cmd: 'edit.copy', label: '复制', kbd: 'Ctrl+C' },
        { cmd: 'edit.paste', label: '粘贴', kbd: 'Ctrl+V' },
        { cmd: 'edit.selectAll', label: '全选', kbd: 'Ctrl+A' },
      ],
    },
    {
      key: 'search', label: '查找', items: [
        { cmd: 'search.find', label: '查找…', kbd: 'Ctrl+F' },
        { cmd: 'search.findNext', label: '向下查找', kbd: 'F3' },
        sep(),
        { cmd: 'search.replace', label: '替换…' },
        { cmd: 'search.goto', label: '跳到指定行…', kbd: 'Ctrl+G' },
      ],
    },
    {
      key: 'run', label: '运行', items: [
        { cmd: 'run.compile', label: '编译', kbd: 'F7' },
        { cmd: 'run.compileRun', label: '编译并运行', kbd: 'Ctrl+F5' },
        { cmd: 'run.run', label: '运行（用 stdin 文本框喂输入）', kbd: 'F5' },
        { cmd: 'run.console', label: '控制台运行（新窗口，可键盘输入）', kbd: 'Ctrl+F9' },
        sep(),
        { cmd: 'run.stepOver', label: '下一行', kbd: 'F8' },
        { cmd: 'run.stepInto', label: '进入函数', kbd: 'F11' },
        { cmd: 'run.stepInstr', label: '单指令', kbd: 'F10', disabled: '样品未实现（行级单步替代）' },
        sep(),
        { cmd: 'run.auto', label: '定速运行' },
        { cmd: 'run.pause', label: '暂停' },
        { cmd: 'run.stop', label: '停止' },
        sep(),
        { cmd: 'run.speedUp', label: '加速' },
        { cmd: 'run.speedDown', label: '减速' },
      ],
    },
    {
      key: 'tool', label: '工具', items: [
        { cmd: 'tool.config', label: '配置（配色 / 速度）' },
        { cmd: 'tool.datastruct', label: '数据结构（插入类型定义）' },
        { cmd: 'tool.track', label: '跟踪设置' },
      ],
    },
    { key: 'view', label: '视图', items: [] },   // 运行时由 viewmgr 填充
    {
      key: 'help', label: '帮助', items: [
        { cmd: 'help.doc', label: '使用说明' },
        { cmd: 'help.keys', label: '快捷键' },
        sep(),
        { cmd: 'app.about', label: '关于' },
      ],
    },
  ];

  const commands = {};      // cmd -> fn
  let openKey = null;

  function register(map) {
    Object.assign(commands, map || {});
  }

  function clearDropdown() {
    const host = document.getElementById('dropdownHost');
    if (host) host.innerHTML = '';
    document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
    openKey = null;
  }

  function buildItems(menu) {
    if (menu.key === 'view' && AVC.viewmgr) {
      const items = [];
      ['编辑', '演示'].forEach(g => {
        items.push({ grp: g });
        AVC.viewmgr.menuItems().filter(w => w.group === g).forEach(w => {
          items.push({
            cmd: 'view.toggle:' + w.key,
            label: (w.checked ? '✓ ' : '　') + w.name,
            disabled: w.disabled,
          });
        });
      });
      items.push(sep());
      items.push({ cmd: 'view.fontBig', label: '文字放大' });
      items.push({ cmd: 'view.fontSmall', label: '文字缩小' });
      items.push({ cmd: 'view.restore', label: '恢复窗体位置' });
      return items;
    }
    return menu.items;
  }

  function showMenu(menuEl, menu) {
    const host = document.getElementById('dropdownHost');
    if (!host) return;
    host.innerHTML = '';
    const dd = document.createElement('div');
    dd.className = 'dropdown';
    const rect = menuEl.getBoundingClientRect();
    dd.style.left = rect.left + 'px';
    dd.style.top = (rect.bottom + 2) + 'px';

    for (const it of buildItems(menu)) {
      if (it.sep) { const h = document.createElement('div'); h.className = 'hr'; dd.appendChild(h); continue; }
      if (it.grp) { const g = document.createElement('div'); g.className = 'grp'; g.textContent = it.grp; dd.appendChild(g); continue; }
      const row = document.createElement('div');
      row.className = 'item' + (it.disabled ? ' disabled' : '');
      row.innerHTML = '<span></span><span class="kbd"></span>';
      row.firstChild.textContent = it.label;
      row.lastChild.textContent = it.kbd || '';
      if (it.disabled) row.title = it.disabled;
      row.addEventListener('click', () => {
        if (it.disabled) return;
        clearDropdown();
        runCommand(it.cmd);
      });
      dd.appendChild(row);
    }

    host.appendChild(dd);
    menuEl.classList.add('open');
    openKey = menu.key;
  }

  function runCommand(cmd) {
    if (!cmd) return false;
    if (cmd.startsWith('view.toggle:')) {
      const key = cmd.split(':')[1];
      if (AVC.viewmgr) AVC.viewmgr.toggleByKey(key);
      return true;
    }
    const fn = commands[cmd];
    if (typeof fn === 'function') { fn(); return true; }
    if (global.console) console.warn('[menubar] 未实现的命令:', cmd);
    return false;
  }

  function bind() {
    document.querySelectorAll('#menus .menu').forEach(menuEl => {
      const key = menuEl.dataset.menu;
      const menu = MENUS.find(m => m.key === key);
      if (!menu) return;
      menuEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (openKey === key) { clearDropdown(); return; }
        clearDropdown();
        showMenu(menuEl, menu);
      });
      menuEl.addEventListener('mouseenter', () => {
        if (openKey && openKey !== key) { clearDropdown(); showMenu(menuEl, menu); }
      });
    });
    document.addEventListener('click', clearDropdown);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') clearDropdown();
      if (e.ctrlKey || e.metaKey) {
        const map = { n: 'file.new', o: 'file.open', s: 'file.save', f: 'search.find', g: 'search.goto' };
        const cmd = map[e.key.toLowerCase()];
        if (cmd) { e.preventDefault(); runCommand(cmd); }
      }
    });
  }

  AVC.menubar = { MENUS, register, bind, runCommand, clearDropdown, commands };
})(typeof window !== 'undefined' ? window : globalThis);
