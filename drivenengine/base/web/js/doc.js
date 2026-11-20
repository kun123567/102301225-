/**
 * doc.js -- 文档模型（M2）
 *
 * 对应原版 CodeViewUnit 的数据侧：多文件标签、内容、光标、断点集、脏标记、错误行。
 * 纯数据 + 事件订阅，不碰 DOM，便于 node 侧单测。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  let seq = 0;

  function createFile(opts) {
    opts = opts || {};
    return {
      id: 'f' + (++seq),
      name: opts.name || 'untitled.c',
      path: opts.path || '',
      lang: opts.lang || (/\.cpp$/i.test(opts.name || '') ? 'cpp' : 'c'),
      text: opts.text || '',
      dirty: false,
      savedText: opts.text || '',
      cursor: 0,
      // 断点用"行号集合"表示（1 基，与源码行号一致）
      breakpoints: new Set(),
      // 错误行（SyntaxErrLine 底色）
      errorLines: new Set(),
      // 最近一次编译得到的结构信息（functions/globals/vars/structs）
      structure: null,
      compileLog: '',
      diags: [],
    };
  }

  function Doc() {
    this.files = [];
    this.activeId = null;
    this._subs = [];
  }

  Doc.prototype.subscribe = function (fn) {
    this._subs.push(fn);
    return () => {
      const i = this._subs.indexOf(fn);
      if (i >= 0) this._subs.splice(i, 1);
    };
  };
  Doc.prototype._emit = function (kind, payload) {
    for (const fn of this._subs.slice()) {
      try { fn(kind, payload, this); } catch (e) { /* 订阅者异常不影响模型 */ }
    }
  };

  Doc.prototype.active = function () {
    return this.files.find(f => f.id === this.activeId) || null;
  };

  Doc.prototype.add = function (opts) {
    const f = createFile(opts);
    this.files.push(f);
    this.activeId = f.id;
    this._emit('add', f);
    this._emit('active', f);
    return f;
  };

  Doc.prototype.close = function (id) {
    const i = this.files.findIndex(f => f.id === id);
    if (i < 0) return;
    const [f] = this.files.splice(i, 1);
    if (this.activeId === f.id) {
      this.activeId = this.files.length ? this.files[Math.max(0, i - 1)].id : null;
      this._emit('active', this.active());
    }
    this._emit('close', f);
  };

  Doc.prototype.activate = function (id) {
    if (!this.files.some(f => f.id === id)) return;
    this.activeId = id;
    this._emit('active', this.active());
  };

  Doc.prototype.setText = function (id, text) {
    const f = this.files.find(x => x.id === id);
    if (!f || f.text === text) return;
    f.text = text;
    f.dirty = f.text !== f.savedText;
    this._emit('text', f);
  };

  Doc.prototype.markSaved = function (id, savedText) {
    const f = this.files.find(x => x.id === id);
    if (!f) return;
    if (typeof savedText === 'string') f.savedText = savedText;
    f.dirty = f.text !== f.savedText;
    this._emit('saved', f);
  };

  Doc.prototype.setCursor = function (id, pos) {
    const f = this.files.find(x => x.id === id);
    if (!f) return;
    f.cursor = pos;
    this._emit('cursor', f);
  };

  Doc.prototype.toggleBreakpoint = function (id, line) {
    const f = this.files.find(x => x.id === id);
    if (!f || !(line > 0)) return false;
    if (f.breakpoints.has(line)) f.breakpoints.delete(line);
    else f.breakpoints.add(line);
    this._emit('breakpoints', f);
    return f.breakpoints.has(line);
  };

  Doc.prototype.setBreakpoints = function (id, lines) {
    const f = this.files.find(x => x.id === id);
    if (!f) return;
    f.breakpoints = new Set(lines || []);
    this._emit('breakpoints', f);
  };

  Doc.prototype.setCompileResult = function (id, r) {
    const f = this.files.find(x => x.id === id);
    if (!f) return;
    f.compileLog = (r && r.log) || '';
    f.diags = (r && r.diags) || [];
    f.structure = (r && r.structure) || null;
    f.errorLines = new Set(f.diags.filter(d => d.sev === 'error' && d.line > 0).map(d => d.line));
    this._emit('compiled', f);
  };

  /** 行号工具：字符偏移 -> 行号（1 基） */
  function lineOf(text, pos) {
    let line = 1;
    for (let i = 0; i < pos && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
    return line;
  }
  /** 行首偏移 */
  function lineStart(text, line) {
    let n = 1, i = 0;
    while (n < line && i < text.length) {
      if (text.charCodeAt(i) === 10) n++;
      i++;
    }
    return Math.min(i, text.length);
  }

  AVC.doc = {
    Doc, createFile, lineOf, lineStart,
    create: () => new Doc(),
  };
})(typeof window !== 'undefined' ? window : globalThis);
