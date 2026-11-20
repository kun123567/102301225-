'use strict';
/**
 * test-m4m5.js -- M4（菜单/视图/对话框）+ M5（dsCatalog/配色）冒烟测试
 * node 环境 + 极简 DOM/localStorage shim，不需要浏览器与后端。
 */
const path = require('path');
const WEB = path.resolve(__dirname, '..', 'web', 'js');

/* ---------- shim ---------- */
function mkNode(tag) {
  const n = {
    tagName: tag, children: [], dataset: {}, attrs: {}, _text: '', _html: '',
    style: { cssText: '', setProperty() {}, getPropertyValue() { return ''; } },
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, on) { const has = this._s.has(c); const v = on === undefined ? !has : on; v ? this._s.add(c) : this._s.delete(c); return v; },
    },
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, bottom: 0, top: 0, right: 0 }; },
    focus() {}, select() {},
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); this.children = []; },
    get firstChild() { return this.children[0]; }, get lastChild() { return this.children[this.children.length - 1]; },
  };
  return n;
}
const registry = {};
function reg(id) { return registry[id] || (registry[id] = mkNode('div')); }
global.document = {
  documentElement: mkNode('html'),
  body: mkNode('body'),
  createElement: (t) => mkNode(t),
  createElementNS: (ns, t) => mkNode(t),
  createTextNode: (t) => { const n = mkNode('#text'); n.textContent = t; return n; },
  getElementById: (id) => reg(id),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  execCommand() { return true; },
};
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.window = global;

for (const f of ['theme.js', 'doc.js', 'highlight.js', 'vmodel.js', 'session.js',
  'memcell.js', 'stackheap.js', 'arrayView.js', 'linkView.js', 'treeView.js',
  'dsCatalog.js', 'viewmgr.js', 'menubar.js', 'dialogs.js']) {
  require(path.join(WEB, f));
}
const AVC = global.AVC;

let pass = 0, fail = 0;
function ok(c, n, e) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e ? '  [' + e + ']' : '')); } }
function eq(a, b, n) { ok(a === b, n, 'got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b)); }

console.log('===== M4 + M5 冒烟测试 =====');

console.log('\n[1] dsCatalog 26 项模板（PLAN §10 分类）');
const cat = AVC.dsCatalog;
eq(cat.ITEMS.length, 26, '模板总数 = 26（25 条 DB 条目 + 并查集拆分）');
eq(cat.GROUPS.length, 4, '四个逻辑结构分组');
eq(cat.GROUPS[0].items.length, 10, '线性结构 10 项');
eq(cat.GROUPS[1].items.length, 11, '树形结构 11 项');
eq(cat.GROUPS[2].items.length, 3, '图形结构 3 项');
eq(cat.GROUPS[3].items.length, 2, '集合结构 2 项（哈希表 + 并查集）');
eq(cat.findByCType('SqStack').renderer, 'dsStack', 'SqStack → dsStack 渲染器');
eq(cat.findByCType('struct BiTNode'), null, '未登记类型返回 null（不误判）');
eq(cat.findByCType('Heap').renderer, 'dsHeap', 'Heap → dsHeap');
eq(cat.byId('sparsematrix').variants.join('/'), 'cross/matrix', '稀疏矩阵两种画法');
eq(cat.byId('ufset').logical, 'set', '并查集归集合结构');
eq(cat.PROTOS.length, 4, '4 个通用原型（单链/双链/二叉树/顺序表）');
ok(Object.keys(cat.TYPE_SRC).length >= 5, '类型定义源码片段 ≥5 项');

console.log('\n[2] viewmgr 视图管理（10 个窗）');
eq(AVC.viewmgr.WINDOWS.length, 10, 'WINDOWS = 10 项（含 3D 占位与信息窗）');
AVC.viewmgr.load();
AVC.viewmgr.apply();
reg('winArray').style.display = '';
AVC.viewmgr.toggleByKey('array');
eq(reg('winArray').style.display, 'none', '隐藏数组窗');
AVC.viewmgr.toggleByKey('array');
eq(reg('winArray').style.display, '', '再次切换恢复显示');
eq(AVC.viewmgr.toggleByKey('ds3d'), false, '3D 窗为占位，不参与切换');
AVC.viewmgr.maximize(reg('editorWin'));
ok(reg('editorWin').classList.contains('maximized'), '最大化生效');
AVC.viewmgr.restoreLayout();
ok(!reg('editorWin').classList.contains('maximized'), '恢复布局清掉最大化');
eq(AVC.viewmgr.menuItems().length, 10, '视图菜单条目数 = 10');

console.log('\n[3] menubar 7 个菜单 + 命令分发');
eq(AVC.menubar.MENUS.length, 7, '七个菜单（文件/编辑/查找/运行/工具/视图/帮助）');
const cmds = [];
AVC.menubar.register({ 'run.compile': () => cmds.push('compile'), 'app.about': () => cmds.push('about') });
eq(AVC.menubar.runCommand('run.compile'), true, '已注册命令可执行');
eq(cmds[0], 'compile', '命令确实被调用');
eq(AVC.menubar.runCommand('not.exist'), false, '未注册命令返回 false');
eq(AVC.menubar.runCommand('view.toggle:stack'), true, 'view.toggle:* 走视图管理器');
eq(AVC.viewmgr.isVisible(AVC.viewmgr.WINDOWS.find(w => w.key === 'stack')), false, '栈窗被切换为隐藏');

console.log('\n[4] dialogs 跟踪设置持久化');
eq(typeof AVC.dialogs.loadTrack, 'function', 'loadTrack 可用');
AVC.dialogs.saveTrack({ a: { id: 'sqstack', logical: 'linear', renderer: 'dsStack' } });
eq(AVC.dialogs.loadTrack().a.renderer, 'dsStack', '跟踪设置写入/读回一致');
AVC.dialogs.saveTrack({});
eq(Object.keys(AVC.dialogs.loadTrack()).length, 0, '清除设置生效');

console.log('\n[5] theme 配色（M5）');
eq(AVC.theme.css('LinkNode') === '#00ffff' || AVC.theme.css('LinkNode') === AVC.theme.css('MemNode'), true,
  'LinkNode 与 MemNode 同源（16776960 → clAqua #00ffff）');
AVC.theme.set('MemFocus', '#123456');
eq(AVC.theme.css('MemFocus'), '#123456', 'set 后 css() 返回新值');
AVC.theme.set('MemFocus', AVC.theme.INI.MemFocus);
ok(AVC.theme.get('SpeedIndex') >= 1 && AVC.theme.get('SpeedIndex') <= 5, 'SpeedIndex 在 1..5');
ok(AVC.theme.stepInterval() >= 50 && AVC.theme.stepInterval() <= 2000, '帧间隔落在 [MinTime,MaxTime]');

console.log('\n===== 结果 =====');
console.log('  通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 2 : 0);
