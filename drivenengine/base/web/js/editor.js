/**
 * editor.js -- 源码编辑器（M2，对应 CodeViewUnit）
 *
 * 结构：gutter(行号/断点点/三套行底色) + pre.highlight(高亮层) + textarea(输入层)
 * 关键约束（否则会错位）：两层必须字号/行高/内边距完全一致，滚动同步。
 *
 * 行底色三套（对齐 anyview.ini [Syntax]）：
 *   .line-hl.cur  当前执行行（SyntaxRunLineBkg）
 *   .line-hl.err  编译错误行（SyntaxErrLineBkg）
 *   .line-hl.bp   断点行（SyntaxBreadPointBkg）
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};
  const LINE_H = 19;

  function Editor(root) {
    this.root = root;
    this.gutter = root.querySelector('.gutter');
    this.ta = root.querySelector('textarea');
    this.pre = root.querySelector('pre.highlight');
    this.area = root.querySelector('.code-area');
    this.lang = 'c';
    this.lineCount = 1;
    this.curLine = 0;
    this.errLines = new Set();
    this.bps = new Set();
    this._onChange = null;
    this._onCursor = null;
    this._onGutter = null;
    this._buildOverlays();
    this._bind();
  }

  Editor.prototype._buildOverlays = function () {
    const mk = (cls) => {
      const d = document.createElement('div');
      d.className = 'line-hl ' + cls;
      this.area.insertBefore(d, this.area.firstChild);
      return d;
    };
    this.hlCur = mk('cur');
    this.hlErr = mk('err');
    this.hlBp = mk('bp');
  };

  Editor.prototype._bind = function () {
    const self = this;

    this.ta.addEventListener('input', () => {
      self.refresh();
      if (self._onChange) self._onChange(self.ta.value);
    });

    this.ta.addEventListener('scroll', () => self._syncScroll());
    this.ta.addEventListener('keyup', () => self._emitCursor());
    this.ta.addEventListener('click', () => self._emitCursor());
    this.ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = self.ta.selectionStart, t = self.ta.selectionEnd;
        const v = self.ta.value;
        self.ta.value = v.slice(0, s) + '    ' + v.slice(t);
        self.ta.selectionStart = self.ta.selectionEnd = s + 4;
        self.refresh();
        if (self._onChange) self._onChange(self.ta.value);
      }
    });

    this.gutter.addEventListener('click', (e) => {
      const ln = e.target.closest('.ln');
      if (!ln) return;
      const line = parseInt(ln.dataset.line, 10);
      if (self._onGutter) self._onGutter(line);
    });
  };

  Editor.prototype._syncScroll = function () {
    const top = this.ta.scrollTop, left = this.ta.scrollLeft;
    this.pre.scrollTop = top;
    this.pre.scrollLeft = left;
    this.gutter.scrollTop = top;
    this._placeOverlays();
  };

  Editor.prototype._emitCursor = function () {
    if (!this._onCursor) return;
    const pos = this.ta.selectionStart;
    const upto = this.ta.value.slice(0, pos);
    const lines = upto.split('\n');
    this._onCursor({ pos, line: lines.length, col: lines[lines.length - 1].length + 1 });
  };

  Editor.prototype.onChange = function (fn) { this._onChange = fn; return this; };
  Editor.prototype.onCursor = function (fn) { this._onCursor = fn; return this; };
  Editor.prototype.onGutter = function (fn) { this._onGutter = fn; return this; };

  Editor.prototype.getText = function () { return this.ta.value; };

  Editor.prototype.setText = function (text, lang) {
    this.ta.value = text || '';
    if (lang) this.lang = lang;
    this.curLine = 0;
    this.errLines = new Set();
    this.refresh();
    this.ta.scrollTop = 0;
    this._syncScroll();
  };

  Editor.prototype.setLang = function (lang) {
    this.lang = lang;
    this.refresh();
  };

  /** 重绘：高亮层 + 行号槽 + 三套行底色 */
  Editor.prototype.refresh = function () {
    const text = this.ta.value;
    this.pre.innerHTML = AVC.highlight.toHtml(text, this.lang);
    const n = (text.match(/\n/g) || []).length + 1;
    if (n !== this.lineCount) {
      this.lineCount = n;
      let html = '';
      for (let i = 1; i <= n; i++) {
        const cls = 'ln'
          + (this.bps.has(i) ? ' bp' : '')
          + (i === this.curLine ? ' cur' : '');
        html += '<div class="' + cls + '" data-line="' + i + '">' + i + '</div>';
      }
      this.gutter.innerHTML = html;
    } else {
      // 只更新类名，避免整块重建
      const rows = this.gutter.children;
      for (let i = 0; i < rows.length; i++) {
        const line = i + 1;
        rows[i].className = 'ln' + (this.bps.has(line) ? ' bp' : '') + (line === this.curLine ? ' cur' : '');
      }
    }
    this._placeOverlays();
  };

  Editor.prototype._placeOverlays = function () {
    const top = this.ta.scrollTop;
    const put = (el, line) => {
      if (!line || line < 1) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.top = (6 + (line - 1) * LINE_H - top) + 'px';
    };
    put(this.hlCur, this.curLine);
    put(this.hlErr, this._firstErr);
    put(this.hlBp, this._firstBp);
  };

  /** 设置当前执行行（0 = 不显示） */
  Editor.prototype.setCurrentLine = function (line) {
    this.curLine = line || 0;
    this.refresh();
    if (line > 0) this.scrollToLine(line);
  };

  /** 设置断点集合 */
  Editor.prototype.setBreakpoints = function (set) {
    this.bps = new Set(set || []);
    this._firstBp = this.bps.size ? Math.min.apply(null, [...this.bps]) : 0;
    this.refresh();
  };

  /** 设置错误行集合 */
  Editor.prototype.setErrorLines = function (lines) {
    this.errLines = new Set(lines || []);
    this._firstErr = this.errLines.size ? Math.min.apply(null, [...this.errLines]) : 0;
    this.refresh();
  };

  Editor.prototype.scrollToLine = function (line) {
    const target = (line - 1) * LINE_H;
    const view = this.ta.clientHeight;
    if (target < this.ta.scrollTop || target > this.ta.scrollTop + view - LINE_H * 2) {
      this.ta.scrollTop = Math.max(0, target - view / 2);
      this._syncScroll();
    }
  };

  Editor.prototype.gotoLine = function (line) {
    const start = AVC.doc.lineStart(this.ta.value, line);
    this.ta.focus();
    this.ta.selectionStart = this.ta.selectionEnd = start;
    this.scrollToLine(line);
    this._emitCursor();
  };

  AVC.editor = {
    LINE_H,
    mount: (root) => new Editor(root),
    Editor,
  };
})(typeof window !== 'undefined' ? window : globalThis);
