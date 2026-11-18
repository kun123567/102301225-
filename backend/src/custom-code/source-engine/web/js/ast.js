/**
 * ast.js -- 轻量声明解析器（D1）
 *
 * 单源 UMD：node 侧 require 给插桩器用，浏览器侧挂到 AVC.ast 给检测用。
 * 「一份解析器」是硬约束：否则插桩与检测会给出不同结论，最难排查。
 *
 * 只解析"声明子集"（够覆盖教学/竞赛代码），不追求完整 C++ 语法：
 *   · typedef / using 别名展开
 *   · 模板类型（vector<int>、嵌套 <...>）
 *   · 多维数组（int m[3][4]）
 *   · 多声明符（int a[3], b, *p;）
 *   · 结构体字段表（含 offset/size）
 *   · 函数区间（start/bodyLine/end）
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const g = root || (typeof globalThis !== 'undefined' ? globalThis : this);
  g.AVC = g.AVC || {};
  g.AVC.ast = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const KW_STMT = /^(if|for|while|switch|return|else|do|case|default|break|continue|goto|throw|try|catch)\b/;
  const TYPE_WORDS = /^(?:const|static|register|volatile|inline|extern|unsigned|signed|short|long|int|char|float|double|bool|void|auto|size_t|wchar_t|FILE)$/;
  const WIDTH = { char: 1, bool: 1, short: 2, int: 4, long: 4, float: 4, double: 8, void: 0, size_t: 4, wchar_t: 2 };

  /* ---------------- 去注释（保留行数与字符串） ---------------- */
  function stripComments(src) {
    let out = '', st = 0, i = 0, n = src.length;
    while (i < n) {
      const c = src[i], c2 = src[i + 1];
      if (st === 0) {
        if (c === '/' && c2 === '/') { st = 1; out += '  '; i += 2; continue; }
        if (c === '/' && c2 === '*') { st = 2; out += '  '; i += 2; continue; }
        if (c === '"' || c === "'") { st = c === '"' ? 3 : 4; out += c; i++; continue; }
        out += c; i++; continue;
      }
      if (st === 1) { if (c === '\n') { st = 0; out += '\n'; } else out += ' '; i++; continue; }
      if (st === 2) { if (c === '*' && c2 === '/') { st = 0; out += '  '; i += 2; } else { out += (c === '\n' ? '\n' : ' '); i++; } continue; }
      out += c;
      if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; }
      if ((st === 3 && c === '"') || (st === 4 && c === "'")) st = 0;
      i++;
    }
    return out;
  }

  function typeWidth(baseType, isPtr) {
    if (isPtr) return 4;
    const t = String(baseType || '').toLowerCase().replace(/^(struct|union|enum|class)\s+/, '');
    return WIDTH[t] != null ? WIDTH[t] : 4;
  }

  /* ---------------- typedef / using ---------------- */
  function collectTypedefs(codeLines) {
    const map = {};
    codeLines.forEach(l => {
      // typedef struct X *LinkList;  /  typedef unsigned long long ll;
      const m = l.match(/^\s*typedef\s+([\s\S]+?)\s*([A-Za-z_]\w*)\s*;?\s*$/);
      if (m && !/\{/.test(m[1])) {
        const def = m[1].trim();
        const u = l.match(/^\s*using\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s*;?\s*$/);
        map[m[2]] = parseTypeText(def);
        return;
      }
      const u = l.match(/^\s*using\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s*;?\s*$/);
      if (u) map[u[1]] = parseTypeText(u[2]);
    });
    return map;
  }

  /** "struct Node *" / "vector<int>" / "unsigned long long" → 结构化类型 */
  function parseTypeText(text) {
    const t = String(text || '').trim().replace(/\s+/g, ' ');
    let ptrDepth = 0, tt = t;
    while (/\*\s*$/.test(tt)) { ptrDepth++; tt = tt.replace(/\*\s*$/, '').trim(); }
    const sm = tt.match(/^(struct|union|enum|class)\s+([A-Za-z_]\w*)$/);
    if (sm) return { type: tt, baseType: sm[2], structTag: sm[2], isStruct: true, ptrDepth, inner: [] };
    const tm = tt.match(/^([A-Za-z_][\w:]*)\s*<\s*([\s\S]*)\s*>$/);
    if (tm) {
      const inner = splitTemplateArgs(tm[2]);
      return { type: t, baseType: tm[1], inner, ptrDepth, isTemplate: true };
    }
    return { type: tt, baseType: tt.split(' ').pop(), ptrDepth };
  }

  function splitTemplateArgs(s) {
    const out = []; let depth = 0, cur = '';
    for (const ch of s) {
      if (ch === '<') depth++;
      if (ch === '>') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  /* ---------------- 声明行判定（插桩与检测共用） ---------------- */
  /**
   * 这一行是否是"声明/定义"而不是"语句"？
   * 覆盖：C 基本类型、struct/union/enum/class、FILE*、**C++ 模板/容器**、typedef/using
   */
  function isDeclLine(line) {
    const t = String(line || '').trim();
    if (!t || t.startsWith('#') || t.startsWith('//')) return false;
    if (KW_STMT.test(t)) return false;
    if (/^(typedef|using)\b/.test(t)) return true;
    if (/^(struct|union|enum|class)\s+\w+\s*[{;]/.test(t)) return true;
    // struct/union/enum Tag 作类型的声明（Tag 是"两词类型"，下面的通用正则抓不住）：
    //   struct Node *head = NULL, *p;   /   struct Node head;   /   union U *q;
    if (/^(struct|union|enum|class)\s+[A-Za-z_]\w*\s*[*&]/.test(t)) return true;
    if (/^(struct|union|enum|class)\s+[A-Za-z_]\w*\s+[A-Za-z_]\w*\s*(?:\[[^\]]*\]\s*)*[;=,\[]/.test(t)) return true;
    // 声明必须以 ; 或 { 或 = 结尾（不含函数调用）
    if (!/[;{=)]\s*$/.test(t)) return false;
    /* 多词类型说明符：`static int a[3];` / `const unsigned long b = 0;` / `static struct Node n;`
       —— 下面的通用正则只认"一个类型词 + 名字"，三词以上就漏了，
       漏掉的声明会被当成语句包进块里（`{ __avc_t(4); static int a[3]; }`），
       作用域一变，后面的 `a[0]` 直接编不过 → 整段代码报 stage:"instrument"。
       逐个剥前缀再判（一次只剥一个词）：`unsigned long x` 剥到 `long x` 才成立。 */
    let rest = t;
    for (let n = 0; n < 6; n++) {
      const mq = rest.match(/^(?:static|extern|const|register|volatile|inline|unsigned|signed|short|long|struct|union|enum|class)\s+/);
      if (!mq) break;
      rest = rest.slice(mq[0].length);
      if (rest && isDeclLine(rest)) return true;
    }
    // 形如 `TYPE name...` 或 `TYPE *name ...`
    const m = t.match(/^((?:[\w:]+\s*::\s*)?[A-Za-z_][\w:]*)(\s*<[^;{}()]*>)?\s*([*&\s]+)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*(?:=|;|\(|\{|,)/);
    if (!m) return false;
    const head = m[1];
    if (TYPE_WORDS.test(head)) return true;                 // int / char / unsigned long ...
    if (m[2]) return true;                                  // 带模板参数：vector<int> q;
    if (/^\s*[*&]/.test(m[3] || '')) return true;            // Node *p;
    if (/^[A-Z][A-Za-z0-9_]*$/.test(head) && !/\(/.test(t)) return true; // 大写开头的别名约定
    return false;
  }

  /* ---------------- 解析一条声明 ---------------- */
  function parseDecl(line, typedefs) {
    const t = String(line || '').trim().replace(/^(static|extern|const|register|volatile)\s+/, '');
    const isStructPtr = /^(struct|union)\s+\w+\s*[*&]/.test(t);
    if (!isStructPtr && !isDeclLine(t)) return [];
    const semi = t.search(/;|\{/);
    const body = semi >= 0 ? t.slice(0, semi) : t;

    // struct/union 变量
    const sm = body.match(/^(struct|union)\s+([A-Za-z_]\w*)\s*(.*)$/);
    if (sm) {
      const rest = sm[3].trim();
      if (!rest) return [];         // 结构体定义本身
      return splitDeclarators(rest).map(d => {
        const info = parseTypeText(sm[1] + ' ' + sm[2] + ' ' + (d.stars || '').trim());
        return mkDecl(d.name, info.type, info, d.dims, sm[2], d.stars);
      });
    }

    // 找到"类型部分"与"声明符部分"的分界
    let typeText = '', rest = '';
    const tm = body.match(/^((?:const\s+|unsigned\s+|signed\s+|short\s+|long\s+)*[A-Za-z_][\w:]*(?:\s*<[^;{}]*>)?(?:\s*::\s*[A-Za-z_]\w*)*)\s*([*&\s]*)(.+)$/);
    if (!tm) return [];
    typeText = (tm[1] + ' ' + (tm[2] || '')).trim();
    rest = tm[3].trim();
    if (rest.startsWith('{') || rest === '') return [];

    const info = parseTypeText(typeText);
    // typedef 别名展开
    const alias = typedefs && (typedefs[info.baseType] || typedefs[info.type]);
    if (alias) {
      info.baseType = alias.baseType || info.baseType;
      info.structTag = alias.structTag || info.structTag;
      info.ptrDepth += alias.ptrDepth || 0;
      if (alias.inner) info.inner = alias.inner;
    }

    return splitDeclarators(rest).map(d => mkDecl(d.name, typeText, info, d.dims, info.structTag, d.stars));
  }

  /** "a[3][4], *p, q = 0" → [{name,dims,stars,init}] */
  function splitDeclarators(rest) {
    const out = []; let depth = 0, cur = '';
    for (const ch of rest) {
      if (ch === '(' || ch === '[' || ch === '{' || ch === '<') depth++;
      if (ch === ')' || ch === ']' || ch === '}' || ch === '>') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur);

    return out.map(seg => {
      const s = seg.trim();
      const nameM = s.match(/^([*&\s]*)([A-Za-z_]\w*)\s*((?:\[[^\]]*\])*)\s*(?:=\s*([\s\S]*))?$/);
      if (!nameM) return null;
      const dims = [];
      const re = /\[([^\]]*)\]/g; let m;
      while ((m = re.exec(nameM[3] || ''))) dims.push(m[1].trim());
      return { name: nameM[2], stars: nameM[1] || '', dims, init: nameM[4] || null };
    }).filter(Boolean);
  }

  function mkDecl(name, typeText, info, dims, structTag, extraStars) {
    const st = (extraStars || '').match(/\*/g);
    const ptrDepth = (info.ptrDepth || 0) + (st ? st.length : 0);
    return {
      name,
      typeText,
      type: info.type,
      baseType: info.baseType,
      inner: info.inner || [],
      isTemplate: !!info.isTemplate,
      isStruct: !!info.isStruct,
      structTag: structTag || info.structTag || null,
      ptrDepth: ptrDepth,
      dims: dims || [],
      isArray: (dims || []).length > 0,
    };
  }

  /* ---------------- 结构体字段表 ---------------- */
  function parseStructs(codeLines) {
    const structs = {};
    for (let i = 0; i < codeLines.length; i++) {
      const m = codeLines[i].match(/\b(struct|union)\s+([A-Za-z_]\w*)?\s*\{/);
      if (!m) continue;
      const tag = m[2] || ('anon' + i);
      let depth = 0, end = -1;
      for (let k = i; k < codeLines.length; k++) {
        for (const ch of codeLines[k]) {
          if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) { end = k; break; } }
        }
        if (end >= 0) break;
      }
      if (end < 0) continue;
      const fields = [];
      let off = 0;
      for (let k = i; k <= end; k++) {
        let seg = codeLines[k];
        if (k === i) seg = seg.slice(seg.indexOf('{') + 1);
        if (k === end) seg = seg.slice(0, seg.lastIndexOf('}'));
        for (const piece of seg.split(';')) {
          const p = piece.trim();
          if (!p || p.startsWith('#')) continue;
          const decls = parseDecl(p + ';', null);
          for (const d of decls) {
            const w = typeWidth(d.baseType, d.ptrDepth > 0);
            const align = Math.min(w, 8);
            if (off % align) off += align - (off % align);
            fields.push({
              name: d.name, type: d.typeText, baseType: d.baseType,
              ptrDepth: d.ptrDepth, isArray: d.isArray, dims: d.dims,
              self: d.ptrDepth > 0 && (d.baseType === tag || d.structTag === tag),
              offset: off, size: w,
            });
            off += w;
          }
        }
      }
      structs[tag] = { tag, fields, size: off, line: i + 1, alias: null };
      // typedef struct { … } SqQueue;  —— 尾别名是教科书代码唯一的"类型名线索"，
      // 必须记住它，否则 SqQueue Q; 这种声明既没有 structTag、也命中不了 cTypes 表。
      const tail = String(codeLines[end] || '').match(/\}\s*([A-Za-z_]\w*)\s*;/);
      if (tail) structs[tag].alias = tail[1];
    }
    return structs;
  }

  /* ---------------- 函数区间 ---------------- */
  function parseFunctions(codeLines) {
    const fns = [];
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      if (!/\)\s*\{?\s*$/.test(line) || KW_STMT.test(line.trim())) continue;
      if (isDeclLine(line) && !/\)/.test(line)) continue;
      const nm = line.match(/([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{?\s*$/);
      if (!nm || KW_STMT.test(nm[1])) continue;
      let bodyLine = line.includes('{') ? i : -1;
      if (bodyLine < 0) {
        for (let k = i + 1; k < Math.min(i + 4, codeLines.length); k++) {
          if (codeLines[k].trim().startsWith('{')) { bodyLine = k; break; }
          if (codeLines[k].trim() !== '') break;
        }
      }
      if (bodyLine < 0) continue;
      let depth = 0, end = -1;
      for (let k = bodyLine; k < codeLines.length; k++) {
        for (const ch of codeLines[k]) {
          if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) { end = k; break; } }
        }
        if (end >= 0) break;
      }
      if (end < 0) continue;
      fns.push({ name: nm[1], params: nm[2].trim(), start: i, bodyLine, end });
      i = end;
    }
    return fns;
  }


  /* ================= D4：tree-sitter WASM provider（懒加载 + 自动回落） ================= */
  let TS = null;              // { Parser, cpp, c }
  let TS_STATE = 'idle';      // idle | loading | ready | failed

  /**
   * 启用 tree-sitter（浏览器端）。失败不抛出，返回 false 并保持 self 解析器可用。
   * @param {object} opts { base:'vendor/tree-sitter/' }
   */
  async function enableTreeSitter(opts) {
    if (TS_STATE === 'ready') return true;
    if (TS_STATE === 'loading') return false;
    TS_STATE = 'loading';
    const base = (opts && opts.base) || 'vendor/tree-sitter/';
    try {
      if (typeof WebTreeSitter === 'undefined') {
        if (typeof document === 'undefined') { TS_STATE = 'failed'; return false; }
        await new Promise((res, rej) => {
          const sc = document.createElement('script');
          sc.src = base + 'tree-sitter.js';
          sc.onload = res; sc.onerror = () => rej(new Error('tree-sitter.js 加载失败'));
          document.head.appendChild(sc);
        });
      }
      const Parser = await WebTreeSitter();
      // 不同版本 init 签名不同，两种都试
      try { await Parser.init({ locateFile: (f) => base + f }); }
      catch (e) { await Parser.init(); }
      const cpp = await Parser.Language.load(base + 'tree-sitter-cpp.wasm');
      let c = null;
      try { c = await Parser.Language.load(base + 'tree-sitter-c.wasm'); } catch (e) { c = null; }
      TS = { Parser, cpp, c };
      TS_STATE = 'ready';
      return true;
    } catch (e) {
      TS_STATE = 'failed';
      TS = null;
      return false;
    }
  }

  function tsState() { return TS_STATE; }

  /** 用 tree-sitter 的 AST 提取声明（只做"边界识别"，类型解析仍复用 parseDecl） */
  function parseWithTreeSitter(src, isCpp) {
    if (!TS) return null;
    const parser = new TS.Parser();
    try {
      parser.setLanguage(isCpp ? TS.cpp : (TS.c || TS.cpp));
      const tree = parser.parse(String(src));
      const root = tree.rootNode;
      const decls = [], structs = {}, fns = [];
      const clean = (t) => String(t).replace(/\s+/g, ' ').trim();

      for (const n of root.descendantsOfType('declaration')) {
        const txt = clean(n.text);
        for (const d of parseDecl(txt.endsWith(';') ? txt : txt + ';', {})) {
          d.scope = 'global';
          d.declLine = n.startPosition.row + 1;
          decls.push(d);
        }
      }
      for (const n of root.descendantsOfType('struct_specifier')) {
        const nameNode = n.childForFieldName ? n.childForFieldName('name') : null;
        const tag = nameNode ? nameNode.text : ('anon' + n.startPosition.row);
        const lines = String(src).split(/\r?\n/).slice(n.startPosition.row, n.endPosition.row + 1);
        const parsed = parseStructs(lines);
        const key = Object.keys(parsed)[0];
        if (key) {
          structs[tag] = parsed[key];
          structs[tag].line = n.startPosition.row + 1;
        }
      }
      for (const n of root.descendantsOfType('function_definition')) {
        const head = String(src).slice(n.startIndex, n.startIndex + 200);
        const nm = head.match(/([A-Za-z_]\w*)\s*\(/);
        if (!nm) continue;
        fns.push({ name: nm[1], params: '', start: n.startPosition.row, bodyLine: n.startPosition.row, end: n.endPosition.row });
      }
      try { tree.delete(); } catch (e) {}
      return { decls, structs, fns };
    } catch (e) {
      try { parser.delete(); } catch (e2) {}
      return null;
    }
  }

  /** 探测 vendor 目录是否已放齐（浏览器端用 fetch HEAD） */
  async function tsAssetsReady(base) {
    base = base || 'vendor/tree-sitter/';
    const files = ['tree-sitter.js', 'tree-sitter.wasm', 'tree-sitter-cpp.wasm'];
    try {
      for (const f of files) {
        const r = await fetch(base + f, { method: 'HEAD' });
        if (!r.ok) return false;
      }
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- 总入口 ---------------- */
  /**
   * typedef struct { … } SqQueue; 之后写 `SqQueue Q;` 的声明，structTag 是空的
   * （parseDecl 只认 `struct X` 写法与无花括号的 typedef 别名）。
   * 这里把"别名 → tag"的关系补回声明上，检测层才能用结构体字段模式判型。
   */
  function linkAlias(decls, structs) {
    const aliasToTag = {};
    for (const t in (structs || {})) {
      const s = structs[t];
      if (s && s.alias) aliasToTag[s.alias] = t;
    }
    const aliasNames = Object.keys(aliasToTag);
    if (!aliasNames.length) return;
    for (const d of decls || []) {
      if (d.structTag) continue;
      const t = aliasToTag[d.baseType];
      if (t) { d.structTag = t; d.structAlias = d.baseType; }
    }
  }

  function parse(src, opts) {
    opts = opts || {};
    const isCpp = /#include\s*<bits|using\s+namespace|#include\s*<[\w/]+>|template\s*</.test(String(src));
    const ts = (TS_STATE === 'ready') ? parseWithTreeSitter(src, isCpp) : null;
    const code = stripComments(String(src || ''));
    const lines = code.split(/\r?\n/);
    const typedefs = collectTypedefs(lines);
    const structs = parseStructs(lines);
    const fns = parseFunctions(lines);
    const decls = [];
    const inFn = (i) => fns.find(f => i > f.bodyLine && i < f.end) || null;

    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      if (!isDeclLine(t)) return;
      if (/\b(struct|union)\b[^;]*\{/.test(t)) return;       // 结构体定义不是变量
      for (const d of parseDecl(t, typedefs)) {
        const fn = inFn(i);
        d.scope = fn ? fn.name : 'global';
        d.declLine = i + 1;
        decls.push(d);
      }
    });
    linkAlias(decls, structs);

    if (ts && (ts.decls.length || ts.fns.length)) {
      // tree-sitter 结论优先：同名声明覆盖，函数/结构体合并
      const seen = new Set(ts.decls.map(d => d.scope + '/' + d.name));
      for (const d of decls) if (!seen.has(d.scope + '/' + d.name)) ts.decls.push(d);
      linkAlias(ts.decls, Object.assign({}, structs, ts.structs));
      return {
        decls: ts.decls,
        structs: Object.assign({}, structs, ts.structs),
        fns: ts.fns.length ? ts.fns : fns,
        typedefs,
        provider: 'tree-sitter',
        degraded: false,
      };
    }
    return { decls, structs, fns, typedefs, provider: 'self', degraded: false };
  }

  return { parse, enableTreeSitter, tsState, tsAssetsReady, parseDecl, parseStructs, parseFunctions, parseTypeText, isDeclLine, stripComments, typeWidth, collectTypedefs };
});
