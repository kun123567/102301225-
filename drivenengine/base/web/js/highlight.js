/**
 * highlight.js -- C/C++ 语法高亮（M2）
 *
 * 对应 anyview.ini [Syntax] 段：关键字/数字/字符串/注释/pre 处理器，以及
 * Style（字形）——关键字加粗、注释斜体由 CSS 类承担，颜色由 theme 注入。
 * 纯字符串函数，返回转义后的 HTML，node 侧可测。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  const KEYWORDS = ('auto break case const continue default do else enum extern for goto if ' +
    'inline register restrict return sizeof static struct switch typedef union volatile while ' +
    '_Bool _Complex _Imaginary').split(' ');
  const KW = new Set(KEYWORDS);
  const TYPES = new Set(('void char short int long float double signed unsigned size_t ssize_t ' +
    'int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t bool ' +
    'FILE ptrdiff_t wchar_t').split(' '));
  const CXX_KW = new Set(('class public private protected virtual override final template typename ' +
    'namespace using new delete this nullptr true false try catch throw constexpr ' +
    'operator friend explicit mutable static_cast dynamic_cast reinterpret_cast const_cast ' +
    'std string vector map set cout cin endl').split(' '));

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const RE = new RegExp([
    '(\\/\\*[\\s\\S]*?\\*\\/)',              // 1 块注释
    '(\\/\\/[^\\n]*)',                       // 2 行注释
    '("(?:\\\\.|[^"\\\\\\n])*")',            // 3 字符串
    "('(?:\\\\.|[^'\\\\\\n])*')",            // 4 字符
    '(^[ \\t]*#[^\\n]*)',                    // 5 预处理（行首）
    '(\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[fFuUlL]*\\b)', // 6 数字
    '([A-Za-z_]\\w*)',                       // 7 标识符
  ].join('|'), 'gm');

  /**
   * @param {string} src
   * @param {'c'|'cpp'} lang
   * @returns {string} 带 span 的 HTML（保留原始空白与换行）
   */
  function toHtml(src, lang) {
    const isCpp = lang === 'cpp';
    let out = '';
    let last = 0;
    RE.lastIndex = 0;
    let m;
    while ((m = RE.exec(src))) {
      if (m.index > last) out += esc(src.slice(last, m.index));
      const tok = m[0];
      let cls = '';
      if (m[1] || m[2]) cls = 'tk-com';
      else if (m[3] || m[4]) cls = 'tk-str';
      else if (m[5]) cls = 'tk-pp';
      else if (m[6]) cls = 'tk-num';
      else if (m[7]) {
        const id = tok;
        // 后面紧跟 '(' 视为函数名
        const rest = src.slice(m.index + tok.length);
        const isCall = /^\s*\(/.test(rest);
        if (KW.has(id)) cls = 'tk-kw';
        else if (isCpp && CXX_KW.has(id)) cls = 'tk-kw';
        else if (TYPES.has(id)) cls = 'tk-type';
        else if (/^[A-Z_][A-Z0-9_]*$/.test(id)) cls = 'tk-pp';   // 宏
        else if (isCall) cls = 'tk-fn';
      }
      out += cls ? '<span class="' + cls + '">' + esc(tok) + '</span>' : esc(tok);
      last = m.index + tok.length;
      RE.lastIndex = last;
    }
    out += esc(src.slice(last));
    return out;
  }

  AVC.highlight = { toHtml, escapeHtml: esc };
})(typeof window !== 'undefined' ? window : globalThis);
