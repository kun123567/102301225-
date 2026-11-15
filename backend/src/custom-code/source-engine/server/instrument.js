'use strict';
/**
 * instrument.js -- 把 C/C++ 源码改写成"可跟踪"版本
 *
 * 核心思想（对应 AnyviewC 的 VM 不可用时的替代方案）：
 *   每条可执行语句前插 __avc_t(line)，语句后插变量快照 __avc_vi/vd/vs；
 *   函数入口插 __avc_e("f")，出口插 __avc_x()；
 *   链表/树变量插生成的 dump 函数调用。
 *
 * 安全性原则：所有插桩都包在独立块 { ... } 里，避免改变 if/else、循环体的归属。
 *   例：  if (a) x = 1;
 *   ->    if (a) { __avc_t(9); x = 1; __avc_vi(9,"x",(long)x); }
 *
 * 分析全部基于"去注释后的等行数副本"，因此行号与用户源码严格一致。
 */

const astLib = require('../web/js/ast.js');

const INT_TYPES = /^(unsigned|signed|short|long|int|char|size_t)\b/;
const FLT_TYPES = /^(float|double)\b/;

function stripComments(src) {
  let out = '';
  let i = 0, n = src.length, st = 0; // 0 code 1 line-comment 2 block-comment 3 string 4 char
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (st === 0) {
      if (c === '/' && c2 === '/') { st = 1; out += '  '; i += 2; continue; }
      if (c === '/' && c2 === '*') { st = 2; out += '  '; i += 2; continue; }
      if (c === '"') { st = 3; out += c; i++; continue; }
      if (c === "'") { st = 4; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (st === 1) { if (c === '\n') { st = 0; out += '\n'; i++; } else { out += ' '; i++; } continue; }
    if (st === 2) {
      if (c === '*' && c2 === '/') { st = 0; out += '  '; i += 2; continue; }
      out += (c === '\n' ? '\n' : ' '); i++; continue;
    }
    if (st === 3 || st === 4) {
      out += c;
      if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; }
      if ((st === 3 && c === '"') || (st === 4 && c === "'")) st = 0;
      i++; continue;
    }
  }
  return out;
}

function balanced(s) {
  let p = 0, b = 0, k = 0;
  for (const ch of s) {
    if (ch === '(') p++; else if (ch === ')') p--;
    else if (ch === '[') b++; else if (ch === ']') b--;
    else if (ch === '{') k++; else if (ch === '}') k--;
  }
  return p === 0 && b === 0 && k === 0;
}

/**
 * 解析一条结构体字段声明（支持多声明符：`int key, color;` / `struct T *left, *right;`）
 * 之前只按"最后一个词是名字"抓，遇到 `int key, color` 整条丢掉 ——
 * 红黑树的 color、线索树的 ltag 就这么丢的。
 */
function parseFieldDecls(text, selfNames) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || t.startsWith('#')) return [];
  const out = [];
  const segs = t.split(',');
  const head = segs[0].trim();
  const m = head.match(/^([A-Za-z_][\w\s]*?)\s*(\**)\s*([A-Za-z_]\w*)\s*(\[[^\]]*\])?$/);
  if (!m) return [];
  const baseType = m[1].trim().replace(/^(struct|union)\s+/, '');
  if (/^(typedef|return|struct|union|enum)$/.test(baseType)) return [];
  const mk = (stars, name, arr) => ({
    type: baseType, isPtr: !!stars, name,
    isArray: !!arr, array: arr || null,
    self: !!stars && selfNames.has(baseType),
  });
  out.push(mk(m[2], m[3], m[4]));
  for (let i = 1; i < segs.length; i++) {
    const mm = segs[i].trim().match(/^(\**)\s*([A-Za-z_]\w*)\s*(\[[^\]]*\])?$/);
    if (mm) out.push(mk(mm[1], mm[2], mm[3]));
  }
  return out;
}

/** 解析 struct/typedef struct，记录字段与自引用指针 */
function parseStructs(codeLines) {
  const structs = [];
  for (let i = 0; i < codeLines.length; i++) {
    const m = codeLines[i].match(/\b(struct|union)\s+([A-Za-z_]\w*)?\s*\{/);
    if (!m) continue;
    const tag = m[2] || ('anon' + i);
    let j = i, depth = 0, bodyStart = -1, end = -1;
    for (; j < codeLines.length; j++) {
      for (const ch of codeLines[j]) {
        if (ch === '{') { depth++; if (bodyStart < 0) bodyStart = j; }
        else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end >= 0) break;
    }
    if (bodyStart < 0 || end < 0) continue;
    // typedef 名
    const after = codeLines[end].match(/\}\s*([A-Za-z_]\w*)\s*;/);
    const alias = after ? after[1] : null;
    const selfNames = new Set([tag, alias].filter(Boolean));
    const fields = [];
    for (let k = bodyStart; k <= end; k++) {
      let seg = codeLines[k];
      if (k === bodyStart) seg = seg.slice(seg.indexOf('{') + 1);
      if (k === end) seg = seg.slice(0, seg.lastIndexOf('}'));
      for (const piece of seg.split(';')) {
        for (const f of parseFieldDecls(piece, selfNames)) fields.push(f);
      }
    }
    if (!fields.length) continue;
    const selfFields = fields.filter(f => f.self);                 // 所有自引用字段（含指针数组）
    const nextField = (selfFields.find(f => !f.isArray && /^(next|link|succ)$/i.test(f.name)) || null);
    const prevField = (selfFields.find(f => !f.isArray && /^(prev|prior)$/i.test(f.name)) || null);
    const leftField = selfFields.find(f => /^(left|lchild|llink)$/i.test(f.name)) || null;
    const rightField = selfFields.find(f => /^(right|rchild|rlink)$/i.test(f.name)) || null;
    const keyField = fields.find(f => !f.isPtr && !f.isArray && INT_TYPES.test(f.type)) ||
                     fields.find(f => !f.isPtr && !f.isArray) || null;
    /* 形状判定（比原来"只认 next / left-right"宽得多）：
     *   tree  —— left + right（红黑/线索树也是二叉树，只是多带 color/ltag 语义）
     *   list  —— 单一 forward 指针（next/link/succ），或 next + prev 双向链
     *   graph —— 其余多指针情形（firstchild+nextsibling、ptr[]、hp/tp、right/down、firstin/firstout…）
     *            交给"通用多指针 walker"发 N/NE 事件，由前端按图统计判形状
     */
    const forwardOnly = !!(nextField && selfFields.length === 1);
    const dlistOnly = !!(nextField && prevField && selfFields.length === 2);
    const singleSelf = selfFields.length === 1 ? selfFields[0] : null;
    const hasColor = fields.some(f => /^color$/i.test(f.name));
    const hasThreadTag = fields.some(f => /^(ltag|rtag)$/i.test(f.name));
    /* 单一"非数组"自指针 → 可以按单链走；单一是"指针数组"（ptr[]/child[]）→ 必须走多叉 walker。
     * 红黑树 / 线索树带 color / ltag 语义，改走通用 walker（N/NE + NM 事件），
     * 否则 L/LE 通道装不下"结点的属性"，角标就永远画不出来。
     * 没有任何自引用字段（SqStack/SqQueue 这种纯数组+下标）→ 不需要 dump（字段由 V 事件观测）。 */
    const shape = !selfFields.length ? null
      : ((leftField && rightField)
        ? ((hasColor || hasThreadTag) ? 'graph' : 'tree')
        : ((forwardOnly || dlistOnly || (singleSelf && !singleSelf.isArray)) ? 'list' : 'graph'));
    structs.push({
      tag, alias, start: i, end, fields, nextField, prevField, leftField, rightField, keyField, selfFields,
      hasColor, hasThreadTag,
      shape,
      // 生成 dump 时使用的 C 类型写法：匿名结构体只能用 typedef 别名
      ctype: (alias && /^anon/.test(tag)) ? alias : ('struct ' + tag),
    });
  }
  return structs;
}

/** 找函数定义（名字 + 函数体行区间） */
function parseFunctions(codeLines, structRanges) {
  const inStruct = (i) => structRanges.some(r => i >= r.start && i <= r.end);
  const fns = [];
  const skipKw = /^(if|for|while|switch|return|else|do|case|default|typedef|struct|union|enum|sizeof|goto|break|continue)\b/;
  for (let i = 0; i < codeLines.length; i++) {
    if (inStruct(i)) continue;
    const line = codeLines[i];
    if (!line.match(/\([^;]*\)\s*\{?\s*$/) && !line.match(/\([^;]*\)\s*$/)) continue;
    if (line.trim().startsWith('#') || skipKw.test(line.trim())) continue;
    if (line.includes(';') && !line.includes('{')) continue;      // 原型声明
    const nm = line.match(/([A-Za-z_]\w*)\s*\(/);
    if (!nm || skipKw.test(nm[1])) continue;
    // 函数体起点
    let bodyLine = -1;
    if (line.includes('{')) bodyLine = i;
    else {
      for (let k = i + 1; k < Math.min(i + 4, codeLines.length); k++) {
        if (codeLines[k].trim().startsWith('{')) { bodyLine = k; break; }
        if (codeLines[k].trim() !== '') break;
      }
    }
    if (bodyLine < 0) continue;
    // 匹配右花括号
    let depth = 0, end = -1;
    for (let k = bodyLine; k < codeLines.length; k++) {
      for (const ch of codeLines[k]) {
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = k; break; } }
      }
      if (end >= 0) break;
    }
    if (end < 0) continue;
    const params = (line.match(/\(([^)]*)\)/) || [])[1] || '';
    fns.push({ name: nm[1], start: i, bodyLine, end, params: params.trim(), ret: line.split(nm[1])[0].trim() });
    i = end;
  }
  return fns;
}

/* ---------------- C++ 容器（V2 采集层 b：STL 泛型） ---------------- */
/** 已知容器 → 采集类别；只列本工具链 <bits/stdc++.h> 垫片覆盖到的 */
const CXX_CTOR = {
  vector: 'seq', deque: 'seq', list: 'seq', set: 'seq', multiset: 'seq',
  queue: 'adapt', stack: 'adapt', priority_queue: 'adapt',
  map: 'map', multimap: 'map', unordered_map: 'map', unordered_set: 'seq',
  hash_map: 'map', hash_set: 'seq',
};
/** 元素类型白名单：不在其中的一律降级为只发 M(len)，绝不硬转 (long) */
const NUM_ELEM = /^(?:(?:unsigned|signed)\s+)?(?:char|short|int|long|float|double|bool|size_t|long\s+long|unsigned\s+long)$/;

function normType(s) {
  return String(s || '').replace(/^std\s*::\s*/, '').replace(/\bconst\b/g, '').replace(/\s+/g, ' ').trim();
}

/** vector<int> g[N]; / queue<int> q; / map<int,int> mp; → 记录数组（或 null） */
function parseCxxDecl(t) {
  const head = t.match(/^(?:std\s*::\s*)?([A-Za-z_]\w*)\s*</);
  if (!head || !CXX_CTOR[head[1]]) return null;
  const start = t.indexOf('<');
  let depth = 0, end = -1;
  for (let i = start; i < t.length; i++) {
    if (t[i] === '<') depth++;
    else if (t[i] === '>') { depth--; if (!depth) { end = i; break; } }
  }
  if (end < 0) return null;
  const targs = t.slice(start + 1, end);
  const typeText = t.slice(0, end + 1).replace(/\s+/g, ' ').trim();   // 保留用户写法（含 std::）
  const vm = t.slice(end + 1).match(/^\s*(?:[*&]\s*)?([A-Za-z_]\w*)\s*((?:\[[^\]]*\])*)/);
  if (!vm) return null;
  const args = targs.split(',').map(x => x.trim());
  return [{
    name: vm[1], kind: 'cxx', array: vm[2] || null,
    ctor: head[1], ctorKind: CXX_CTOR[head[1]],
    cxxType: typeText, targs: args,
    elem: normType(args[0]),
    elem2: args.length > 1 ? normType(args[1]) : null,
  }];
}

/**
 * C++ 容器的观测语句（内联生成，不依赖模板实例化）
 * 限流铁律：非空桶、结点≤32、边≤64、推不出元素类型 → 只发 M(len)
 */
function cxxWatchCalls(v, defines) {
  const q = (s) => '"' + s + '"';
  const n = v.name;
  const len = `__avc_len(${q(n)},(int)${n}.size());`;
  const numeric = NUM_ELEM.test(v.elem);
  const it = `${v.cxxType}::const_iterator`;

  /* ① 容器数组：vector<int> g[N] → 邻接表（顶点 = 桶下标，桶内元素 = 出边） */
  if (v.array) {
    const dims = arrayDims(v.array, defines);
    if (!dims) return [`__avc_len(${q(n)},0);`];
    const V = Math.min(dims[0], 32);
    if (!numeric) {
      return [`{ int _avc_u; __avc_len(${q(n)},${V}); for (_avc_u = 0; _avc_u < ${V}; _avc_u++)` +
        ` __avc_n(${q(n)},_avc_u,(long)${n}[_avc_u].size()); }`];
    }
    return [[`{ int _avc_u, _avc_ec = 0; __avc_len(${q(n)},${V});`,
      `for (_avc_u = 0; _avc_u < ${V}; _avc_u++) {`,
      `if (${n}[_avc_u].empty()) continue;`,                 // 只画非空桶（限流铁律）
      `__avc_n(${q(n)},_avc_u,(long)${n}[_avc_u].size());`,
      `for (${it} _avc_it = ${n}[_avc_u].begin(); _avc_it != ${n}[_avc_u].end() && _avc_ec < 64; ++_avc_it, ++_avc_ec)`,
      `__avc_edge(${q(n)},_avc_u,(int)(*_avc_it),"adj");`,
      `} }`].join(' ')];
  }

  if (!numeric && v.ctorKind !== 'map') return [len];

  /* ② 适配器：queue 用 front，stack / priority_queue 用 top（拷贝后弹空，不动原容器） */
  if (v.ctorKind === 'adapt') {
    const take = v.ctor === 'queue' ? 'front' : 'top';
    return [`{ ${v.cxxType} _avc_c = ${n}; int _avc_i = 0; ${len}` +
      ` while (!_avc_c.empty() && _avc_i < 32) { __avc_n(${q(n)},_avc_i,(long)_avc_c.${take}()); _avc_c.pop(); ++_avc_i; } }`];
  }

  /* ③ 关联容器：键可作 idx 时用键，否则顺序编号 */
  if (v.ctorKind === 'map') {
    if (!NUM_ELEM.test(v.elem2 || '')) return [len];
    const idx = NUM_ELEM.test(v.elem) ? '(int)_avc_it->first' : '_avc_i';
    return [`{ int _avc_i = 0; ${len} for (${it} _avc_it = ${n}.begin();` +
      ` _avc_it != ${n}.end() && _avc_i < 32; ++_avc_it, ++_avc_i)` +
      ` __avc_n(${q(n)},${idx},(long)_avc_it->second); }`];
  }

  /* ④ 序列容器：vector/deque 用下标，list/set 用迭代器 */
  if (v.ctor === 'vector' || v.ctor === 'deque') {
    return [`${len} { int _avc_i; for (_avc_i = 0; _avc_i < (int)${n}.size() && _avc_i < 32; _avc_i++)` +
      ` __avc_n(${q(n)},_avc_i,(long)${n}[_avc_i]); }`];
  }
  return [`{ int _avc_i = 0; ${len} for (${it} _avc_it = ${n}.begin();` +
    ` _avc_it != ${n}.end() && _avc_i < 32; ++_avc_it, ++_avc_i) __avc_n(${q(n)},_avc_i,(long)*_avc_it); }`];
}

/** 一行里花括号/圆括号/方括号的净增量（用于识别跨行初始化器的续行） */
function braceDelta(t) {
  let d = 0;
  for (const ch of String(t || '')) {
    if (ch === '{' || ch === '(' || ch === '[') d++;
    else if (ch === '}' || ch === ')' || ch === ']') d--;
  }
  return d;
}

/** 已知类型名（含用户 typedef）：用于识别"带初始化的声明" */
function typeNameSet(codeLines) {
  const s = new Set(['string', 'wstring', 'size_t', 'll', 'ull', 'pii', 'vi', 'ld', 'ull_t']);
  for (const l of codeLines) {
    const m = l.match(/^\s*typedef\b[^;]*?\b([A-Za-z_]\w*)\s*;/);
    if (m) s.add(m[1]);
  }
  return s;
}

/** `string s = "…";` / `ll big = …;` / `T x(v);` —— 带初始化的声明，
 *  绝不能被包进 `{ … }`，否则变量立刻出作用域（E029 就是这么来的）。 */
function declWithInit(t, types) {
  const m = String(t || '').match(/^([A-Za-z_]\w*)\s*(<[^;{}()]*>)?\s*[*&\s]\s*[A-Za-z_]\w*\s*(?:=|;|\(|\[|\{)/);
  return !!m && types.has(m[1]);
}

/** 解析声明语句里的变量 */
function parseDecl(line, structs) {
  const out = [];
  // `int* a = new int[n]` → `int *a = …`：类型与星号之间没有空格时，
  // 下面"类型 + 空格 + 声明符"的正则匹配不到，变量会被整个漏掉。
  const t = line.trim().replace(/^static\s+/, '').replace(/^const\s+/, '')
    .replace(/\b(unsigned|signed|short|long|int|char|float|double|bool|_Bool|size_t)\s*\*/g, '$1 *');
  const cx = parseCxxDecl(t);
  if (cx) return cx;
  // `PNode *head` / `BTNode *root`：用 typedef 别名代替 `struct Tag`（C 语言里最常见写法），
  // 也必须能认出来，否则链表/树一律采集不到（这是"换个代码就画不出"的头号原因）。
  const am = t.match(/^([A-Za-z_]\w*)\s*(\*+)?\s*(.+);$/);
  if (am && !/^(?:unsigned|signed|short|long|int|char|float|double|bool|_Bool|size_t|const|static|void|FILE)$/.test(am[1])) {
    const ast = structs.find(s => s.alias === am[1] || s.tag === am[1]);
    if (ast) {
      for (const d of am[3].split(',')) {
        const dm = d.trim().match(/^(\*+)?\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\])*)/);
        if (!dm) continue;
        const stars = (am[2] || '').length + (dm[1] || '').length;
        out.push({
          // `Node** p` 是"指针的指针"，不能当单指针喂给 walker（类型不匹配会编译失败）；
          // `HNode *ht[7]` 是"指针数组"（哈希桶 / 多级索引）：按数组逐元素采集，绝不当单结点 dump
          name: dm[2], kind: stars >= 2 ? 'ptr2' : (stars === 1 ? (dm[3] ? 'parr' : 'ptr') : 'struct'),
          structTag: ast.tag, array: dm[3] || null,
        });
      }
      return out;
    }
  }
  const sm = t.match(/^(struct|union)\s+([A-Za-z_]\w*)\s*(\*+)?\s*(.+);$/);
  if (sm) {
    const st = structs.find(s => s.tag === sm[2] || s.alias === sm[2]);
    for (const d of sm[4].split(',')) {
      const dm = d.trim().match(/^(\*+)?\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\])*)/);
      if (!dm) continue;
      const stars = (dm[1] || sm[3] || '').length;
      out.push({
        name: dm[2], kind: stars >= 2 ? 'ptr2' : (stars === 1 ? (dm[3] ? 'parr' : 'ptr') : 'struct'),
        structTag: sm[2], array: dm[3] || null,
      });
    }
    return out;
  }
  const tm = t.match(/^((?:unsigned|signed|short|long|int|char|float|double|bool|_Bool|size_t)(?:\s+(?:int|char|long|short))?)\s+(.+);$/);
  if (!tm) return out;
  const type = tm[1].trim();
  for (const d of tm[2].split(',')) {
    const dm = d.trim().match(/^(\*+)?\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\])*)\s*(?:=\s*(.*))?$/);
    if (!dm) continue;
    const isArr = !!dm[3];
    // `int* a = new int[n];` → 运行期长度的堆数组（数组窗要能看它）
    const nm = dm[1] && dm[4] ? dm[4].match(/^new\s+[A-Za-z_][\w:\s]*\s*\[([^\]]+)\]/) : null;
    if (nm) {
      out.push({ name: dm[2], kind: 'ptrarr', type, elem: type, lenExpr: nm[1].trim(), array: null });
      continue;
    }
    let kind = 'i';
    if (FLT_TYPES.test(type)) kind = 'd';
    if (dm[1]) kind = 'ptr';
    if (isArr && type === 'char') kind = 's';
    else if (isArr) kind = FLT_TYPES.test(type) ? 'da' : 'ia';
    out.push({ name: dm[2], kind, type, array: dm[3] || null });
  }
  return out;
}

function collectDefines(codeLines) {
  const map = {};
  for (const l of codeLines) {
    const m = l.match(/^\s*#\s*define\s+([A-Za-z_]\w*)\s+(\d+)\s*$/);
    if (m) map[m[1]] = parseInt(m[2], 10);
  }
  // const int N = 8;（含多声明符 const int N = 8, M = 4;）——数组尺寸常量最常见来源
  for (const l of codeLines) {
    const m = l.match(/^\s*(?:static\s+)?const\s+(?:unsigned\s+|signed\s+)?(?:int|long|short|size_t)\s+(.+?);/);
    if (!m) continue;
    for (const part of m[1].split(',')) {
      const d = part.match(/^\s*([A-Za-z_]\w*)\s*=\s*(\d+)\s*$/);
      if (d) map[d[1]] = parseInt(d[2], 10);
    }
  }
  return map;
}

function arrayDims(txt, defines) {
  const dims = [];
  const re = /\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(txt || ''))) {
    const expr = (m[1] || '').trim();
    let v = parseInt(expr, 10);
    if (!Number.isFinite(v) && defines && defines[expr]) v = defines[expr];
    if (!Number.isFinite(v) || v <= 0) return null;   // 尺寸未知 -> 不冒风险生成数组观察
    dims.push(Math.min(v, 16));
  }
  return dims.length ? dims : null;
}

function watchCalls(line, v) {
  const n = v.name;
  const L = line;
  const q = (s) => '"' + s + '"';
  // 结构体字段（S.data / S.top）：显示名带前缀，取值表达式走 `S.字段`
  const expr = v.fieldOf ? (v.fieldOf + '.' + v.fieldName) : n;
  if (v.kind === 'i') return [`__avc_vi(${L},${q(n)},(long)(${expr}));`];
  if (v.kind === 'd') return [`__avc_vd(${L},${q(n)},(double)(${expr}));`];
  if (v.kind === 's') {
    // 字符数组：既发整串（变量窗可读），也发逐下标（数组窗要按 a[i] 聚格）
    const calls = [`__avc_vs(${L},${q(n)},${expr});`];
    if (v.dims && v.dims.length) {
      for (let i = 0; i < v.dims[0]; i++) {
        calls.push(`__avc_vi(${L},${q(n + '[' + i + ']')},(long)(unsigned char)(${expr}[${i}]));`);
      }
    }
    return calls;
  }
  if (v.kind === 'ia' || v.kind === 'da') {
    const dims = v.dims;
    if (!dims) return [];
    const fn = v.kind === 'ia' ? '__avc_vi' : '__avc_vd';
    const cast = v.kind === 'ia' ? 'long' : 'double';
    const calls = [];
    if (dims.length === 1) {
      for (let i = 0; i < dims[0]; i++) calls.push(`${fn}(${L},${q(n + '[' + i + ']')},(${cast})(${expr}[${i}]));`);
    } else {
      for (let i = 0; i < dims[0]; i++)
        for (let j = 0; j < dims[1]; j++)
          calls.push(`${fn}(${L},${q(n + '[' + i + '][' + j + ']')},(${cast})(${expr}[${i}][${j}]));`);
    }
    return calls;
  }
  return [];
}

function genDump(structs) {
  const protos = [], defs = [];
  // 指针合法性守卫：dump 常在 free() 之后被调用（悬垂指针），
  // 直接解引用会访问违例崩溃，因此先把指针范围筛一遍。
  const guard = [
    'static int __avc_ptr_ok(const void* p)',
    '{',
    '    unsigned long v = (unsigned long)p;',
    '    return v > 0x1000UL && v < 0x7F000000UL;',
    '}',
    '',
  ].join('\n');
  /** 结点的语义标量（红黑 color / 线索 ltag）→ NM 事件，渲染器据此画角标 */
  const metaCall = (s, idxExpr, ptrExpr) => {
    const lines = [];
    if (s.hasColor) lines.push(`        __avc_metai(var, ${idxExpr}, "color", (long)${ptrExpr}->color);\n`);
    if (s.hasThreadTag) lines.push(`        __avc_metai(var, ${idxExpr}, "ltag", (long)${ptrExpr}->ltag);\n`);
    return lines.join('');
  };

  for (const s of structs) {
    if (!s.shape) continue;
    const tag = s.tag.replace(/\W/g, '_');
    const key = s.keyField ? 'p->' + s.keyField.name : '0';
    // 匿名结构体（typedef struct {…} SqStack;）没有可写的 `struct <tag>` 名字，
    // 生成代码必须用 typedef 别名，否则编译器报 "Parameter 2, pointer type mismatch"。
    const ct = s.ctype || ('struct ' + s.tag);
    if (s.shape === 'list' && s.nextField) {
      protos.push(`static void __avc_dump_${tag}(const char* var, ${ct}* head);`);
      defs.push(
        `static void __avc_dump_${tag}(const char* var, ${ct}* head)\n{\n` +
        `    ${ct}* p = head;\n    int i = 0;\n` +
        `    while (p != (${ct}*)0 && __avc_ptr_ok(p) && i < 24) {\n` +
        `        __avc_l(var, i, (long)(${key}), (unsigned long)p, (p->${s.nextField.name} != (${ct}*)0) ? 1 : 0);\n` +
        metaCall(s, 'i', 'p') +
        `        p = p->${s.nextField.name}; i++;\n    }\n` +
        `    __avc_le(var, i, "list");\n}\n`);
    } else if (s.shape === 'tree' && s.leftField && s.rightField) {
      protos.push(`static void __avc_dump_${tag}(const char* var, ${ct}* root);`);
      defs.push(
        `static void __avc_dump_${tag}(const char* var, ${ct}* root)\n{\n` +
        `    ${ct}* q[64];\n    int qn = 0, i = 0;\n` +
        `    if (root) { q[qn++] = root; }\n` +
        `    while (i < qn && i < 32) {\n` +
        `        ${ct}* p = q[i];\n` +
        `        int _avc_li = -1, _avc_ri = -1;\n` +
        `        if (!__avc_ptr_ok(p)) { i++; continue; }\n` +
        /* 子结点下标 = 它入队时的队列下标（BFS 序），必须**先入队再发结点事件**，
           否则发 L 的时候还不知道自己的孩子是几号，树就画不出来（旧实现只发 L，没有父子索引）。 */
        `        if (p->${s.leftField.name})  { if (qn < 64) { _avc_li = qn; q[qn++] = p->${s.leftField.name}; } }\n` +
        `        if (p->${s.rightField.name}) { if (qn < 64) { _avc_ri = qn; q[qn++] = p->${s.rightField.name}; } }\n` +
        `        __avc_l(var, i, (long)(${key}), (unsigned long)p, (_avc_li >= 0 || _avc_ri >= 0) ? 1 : 0);\n` +
        `        __avc_metai(var, i, "left", (long)_avc_li);\n` +
        `        __avc_metai(var, i, "right", (long)_avc_ri);\n` +
        metaCall(s, 'i', 'p') +
        `        i++;\n    }\n` +
        `    __avc_le(var, i, "tree");\n}\n`);
    } else {
      /* shape === 'graph'：通用多指针 walker（PLAN_DETECT §4.3 ②-a 的落地）
       * 对每个自引用字段（含指针数组）发一条 NE 边，一次覆盖：
       *   孩子-兄弟树 / B 树 ptr[] / Trie child[] / 广义表 hp-tp / 十字链 right-down / 图十字链 firstin-firstout
       * 结点序号 = BFS 队列下标，边指向"子结点入队时的下标"，因此边与结点天然对齐；
       * 队列去重（__avc_ptr_in）保证同一结点不会因为多条边被重复入队。
       */
      const edges = [];
      for (const f of (s.selfFields || [])) {
        if (f.isArray) {
          edges.push(`        for (_avc_k = 0; _avc_k < 8; _avc_k++) { ${ct}* _avc_c = p->${f.name}[_avc_k];` +
            ` if (_avc_c && __avc_ptr_ok(_avc_c) && qn < 64 && !__avc_ptr_in(q, qn, _avc_c))` +
            ` { __avc_edge(var, i, qn, "${f.name}"); q[qn++] = (void*)_avc_c; } }`);
        } else {
          edges.push(`        if (p->${f.name} && __avc_ptr_ok(p->${f.name}) && qn < 64 && !__avc_ptr_in(q, qn, p->${f.name}))` +
            ` { __avc_edge(var, i, qn, "${f.name}"); q[qn++] = (void*)p->${f.name}; }`);
        }
      }
      protos.push(`static void __avc_dump_${tag}(const char* var, ${ct}* root);`);
      defs.push(
        `static void __avc_dump_${tag}(const char* var, ${ct}* root)\n{\n` +
        `    void* q[64];\n    int qn = 0, i = 0, _avc_k = 0;\n` +
        `    __avc_len(var, 0);\n` +
        `    if (root && __avc_ptr_ok(root)) { q[qn++] = (void*)root; }\n` +
        `    while (i < qn && i < 32) {\n` +
        `        ${ct}* p = (${ct}*)q[i];\n` +
        `        if (!__avc_ptr_ok(p)) { i++; continue; }\n` +
        `        __avc_n(var, i, (long)(${key}));\n` +
        metaCall(s, 'i', 'p') +
        edges.join('\n') + '\n' +
        `        i++;\n    }\n` +
        `    __avc_end(var, i);\n}\n`);
    }
  }
  if (defs.length) defs.unshift(guard);
  return { protos, defs };
}

/**
 * 找与 `openIdx` 处的 '(' 配对的 ')'（跳过字符串/字符字面量）
 * @returns {number} 闭合位置，找不到返回 -1
 */
function matchParen(text, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** 按顶层分隔符切分（for 头的三段；括号/花括号/字符串里的不算） */
function splitTopLevel(text, sep) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === sep && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * 循环条件里打点：让 for / while **每轮**都发一个 S 事件
 *
 *   while (cond)        ->  while ((__avc_t(L), (cond)))
 *   for (a; cond; c)    ->  for (a; (__avc_t(L), (cond)); c)
 *   do { ... } while(x); ->  do { ... } while((__avc_t(L), (x)));
 *
 * 为什么用逗号表达式、不给循环体加花括号：
 *   · 单语句体 `for (...) a[i]=i*i;` 加花括号会改变 else 配对与作用域风险；
 *   · 逗号表达式只出现在已有的括号里，语法位置不变，C89/C++ 都合法（左边是 void 表达式）；
 *   · 循环头跨多行时无法安全改写 → 返回 null，由调用方按原样处理（不硬改）。
 *
 * @param {string} codeLine 去注释后的单行文本
 * @param {number} lineNo 行号（写进 S 事件）
 * @returns {string|null} 改写后的行；不是循环头 / 头跨行 / 空条件 → null
 */
function markLoopCondition(codeLine, lineNo) {
  const m = /^(\s*)(for|while)\b\s*\(/.exec(codeLine || '');
  if (!m) return null;
  const open = (codeLine || '').indexOf('(', m[1].length);
  if (open < 0) return null;
  const close = matchParen(codeLine, open);
  if (close < 0) return null;                 // 循环头跨行：不动
  const inner = codeLine.slice(open + 1, close);
  const rest = codeLine.slice(close + 1);
  const marker = `__avc_t(${lineNo})`;
  if (m[2] === 'while') {
    const cond = inner.trim();
    if (!cond) return null;
    return `${m[1]}while ((${marker}, (${cond})))${rest}`;
  }
  const parts = splitTopLevel(inner, ';');
  if (parts.length < 2) return null;
  const cond = parts[1].trim() || '1';        // for (;;) 也照样能出步
  const head = parts[0];
  const tail = parts.slice(2).join(';');
  return `${m[1]}for (${head}; (${marker}, (${cond})); ${tail})${rest}`;
}

/**
 * @param {string} source
 * @param {object} opt {withWatches:boolean, withDumps:boolean, withFrame:boolean, maxWatches:number}
 */
function instrument(source, opt) {
  opt = Object.assign({ withWatches: true, withDumps: true, withFrame: true, maxWatches: 16 }, opt || {});
  const raw = source.split(/\r?\n/);
  const code = stripComments(source).split(/\r?\n/);
  const structs = parseStructs(code);
  const defines = collectDefines(code);
  const typeSet = typeNameSet(code);
  const structRanges = structs.map(s => ({ start: s.start, end: s.end }));
  const fns = parseFunctions(code, structRanges);
  const inStruct = (i) => structRanges.some(r => i >= r.start && i <= r.end);

  // 作用域按花括号层级粗略估算
  const depthAt = (() => {
    const d = new Array(code.length).fill(0);
    let cur = 0;
    for (let i = 0; i < code.length; i++) {
      d[i] = cur;
      for (const ch of code[i]) {
        if (ch === '{') cur++;
        else if (ch === '}') cur--;
      }
    }
    return d;
  })();

  // 收集变量：全局 + 各函数体首层
  const vars = [];
  const globals = [];
  for (let i = 0; i < code.length; i++) {
    if (inStruct(i)) continue;
    const line = code[i];
    if (!/;\s*$/.test(line)) continue;
    if (/^\s*#/.test(line)) continue;
    const fn = fns.find(f => i > f.bodyLine && i < f.end);
    const baseDepth = fn ? depthAt[fn.bodyLine] + 1 : 0;
    if (depthAt[i] !== baseDepth) continue;      // 只取函数首层/全局
    const decls = parseDecl(line, structs);
    if (!decls.length) continue;
    for (const d of decls) {
      const st = d.structTag ? structs.find(s => s.tag === d.structTag) : null;
      const rec = Object.assign({}, d, {
        dims: arrayDims(d.array, defines),
        declLine: i + 1,
        scopeStart: fn ? fn.bodyLine : 0,
        scopeEnd: fn ? fn.end : code.length - 1,
        struct: st || null,
      });
      if (!fn) globals.push(rec);
      else vars.push(rec);

      /* 结构体字段也要能看见：S.data[i] / S.top
       * 此前只观测"函数首层普通变量"，于是 SqStack.data/SqList.elem 这类字段完全不可见，
       * samples/ds/04 与 09 只能手写 sync_view() 镜像绕过。这里按字段表补出"字段伪变量"：
       *   数组字段 → 逐元素 V 事件（显示名 S.data[i]，与普通数组同一个聚合通道）
       *   标量字段 → 单条 V 事件（S.top）
       * 只处理非指针字段（指针字段交给 dump 的 walker）。
       *
       * 注意：仅当该行是"纯声明行"时才生成。`Edge e; e.to = 7;` 这种一行多语句，
       * 插桩会把整行包进 `{ … }`，变量随块结束出作用域 —— 之后再引用就报 E029。
       */
      const pureDeclLine = astLib.isDeclLine(String(code[i] || '').trim()) ||
        declWithInit(String(code[i] || '').trim(), typeSet);
      if (rec.kind === 'struct' && st && d.kind !== 'ptr2' && pureDeclLine) {
        for (const f of (st.fields || [])) {
          if (f.isPtr) continue;
          const base = {
            name: rec.name + '.' + f.name, fieldOf: rec.name, fieldName: f.name,
            declLine: rec.declLine, scopeStart: rec.scopeStart, scopeEnd: rec.scopeEnd,
            struct: null, structTag: null,
          };
          const isNum = INT_TYPES.test(f.type);
          const isFloat = /^(float|double)$/i.test(String(f.type || '').trim());
          if (f.isArray) {
            const dims = arrayDims(f.array, defines);
            if (!dims) continue;
            const frec = Object.assign({}, base, { kind: isFloat ? 'da' : (isNum ? 'ia' : 's'), dims });
            (fn ? vars : globals).push(frec);
          } else {
            const frec = Object.assign({}, base, { kind: isFloat ? 'd' : (isNum ? 'i' : 's'), dims: null });
            (fn ? vars : globals).push(frec);
          }
        }
      }

      // `int* a = new int[n]`：长度是运行期值，且数组会在别的函数里被改（快排交换）。
      // 因此：① 记下"释放行"，释放之后绝不再解引用；② 允许在"声明它的函数"和
      // "参数表里出现同名指针的函数"里也 dump，看到交换过程。
      if (rec.kind === 'ptrarr') {
        const reFree = new RegExp('\\b(?:delete\\s*(?:\\[\\s*\\])?|free)\\s*\\(?\\s*' + rec.name + '\\b');
        let fi = -1;
        for (let k = i + 1; k < code.length; k++) if (reFree.test(code[k])) { fi = k; break; }
        rec.freeLine = fi >= 0 ? fi + 1 : code.length + 1;
        rec.looseFns = {};
        rec.declFn = fn ? fn.name : null;
        if (fn) rec.looseFns[fn.name] = 1;
        for (const f2 of fns) {
          const ps = Array.isArray(f2.params) ? f2.params.map(String) : String(f2.params || '').split(',');
          if (ps.some(p => new RegExp('\\b' + rec.name + '\\b').test(p))) rec.looseFns[f2.name] = 1;
        }
      }
    }
  }
  const allVars = globals.concat(vars);

  /* 数组参数（`void sort(int a[], int n)`）的元素 dump：
     局部数组由 watchCalls 逐元素发 V 事件，但**形参里的数组**不是变量声明，
     不进 vars 表，于是函数体内的每一步都看不到 a[ ] 的值 —— 自定义代码主线
     （学生写 `void sort(int a[], int n)`）正好卡在这里。
     这里按"数组形参 + 同名 int 形参当长度"生成 dump 调用，在每个插桩语句后发出。 */
  const paramArrays = {};
  for (const f of fns) {
    const ps = Array.isArray(f.params) ? f.params.map(String) : String(f.params || '').split(',');
    const arrays = [];
    const ints = [];
    for (const rawParam of ps) {
      const p = String(rawParam).trim();
      if (!p) continue;
      const arr = /^(?:const\s+)?(?:unsigned\s+|signed\s+)?(?:int|long|short|char|float|double|bool)\s+(\w+)\s*\[\s*\w*\s*\]$/.exec(p);
      if (arr) { arrays.push(arr[1]); continue; }
      const num = /^(?:const\s+)?(?:unsigned\s+|signed\s+)?int\s+(\w+)$/.exec(p);
      if (num) ints.push(num[1]);
    }
    if (arrays.length) paramArrays[f.name] = { arrays, len: ints[0] || null };
  }


  // 生成 dump 函数
  const dumps = opt.withDumps ? genDump(structs) : { protos: [], defs: [] };
  const dumpByTag = {};
  for (const s of structs) if (s.shape && opt.withDumps) dumpByTag[s.tag] = '__avc_dump_' + s.tag.replace(/\W/g, '_');

  // 函数入口的 __avc_e() 不能紧跟 '{' —— C89 要求声明在块首，
  // 而函数体通常先是 int a[N]; int i; 之类的声明。
  // 因此把进入点放在"最后一个前导声明之后、第一条语句之前"。
  // 声明行判定：C 基本类型 + struct/union/FILE + **C++ 模板/容器声明**（queue<int> q; 等）
  const DECL_START = /^(?:(?:unsigned|signed|short|long|int|char|float|double|bool|const|static|register|volatile|auto)\b|(?:struct|union|enum|class)\s+\w+|FILE\s*\*)/;
  const CXX_DECL = /^(?:std\s*::\s*)?[A-Za-z_]\w*(?:::\w+)*(?:\s*<[^;{}()]*>)?\s*[*&]*\s+[A-Za-z_]\w*\s*(?:=|;|\(|\[|\{)/;
  const enterAt = {};        // 行下标 -> 函数名（在该行前插入 __avc_e）
  const enterInline = {};    // bodyLine -> 函数名（空函数体，直接跟在 '{' 后）
  for (const f of fns) {
    let k = f.bodyLine + 1, found = -1, bd = 0;
    while (k <= f.end) {
      const t = code[k].trim();
      if (bd > 0) { bd += braceDelta(t); k++; continue; }   // 跨行声明/初始化器的续行
      if (!t || t.startsWith('#')) { k++; continue; }
      if (t === '}') break;                       // 空函数体 / 只有声明
      if (astLib.isDeclLine(t) || declWithInit(t, typeSet)) {
        bd += braceDelta(t);                      // `int a[3][3] = {` 之后是初始化器续行
        k++; continue;                            // 跳过前导声明
      }
      found = k; break;
    }
    if (found >= 0) enterAt[found] = f.name;
    else enterInline[f.bodyLine] = f.name;
  }

  const out = [];
  const slots = [];          // 每行输出在 out 中的下标（用于事后加前缀）
  const steps = [];
  const warnings = [];

  // 头部
  out.push('#include "avctrace.h"');
  // 运行期数组长度：静态变量用"变量名"命名，任何函数里都能安全引用（不必知道 n 的作用域）
  const lenSyms = {};
  for (const v of allVars) {
    if (v.kind !== 'ptrarr' || lenSyms[v.name]) continue;
    lenSyms[v.name] = '__avc_Len_' + v.name;
    out.push(`static int ${lenSyms[v.name]} = 0;`);
  }
  // dump 原型引用了 struct Tag，必须放在 struct 定义之后
  const protoAt = structs.length ? Math.max.apply(null, structs.map(s => s.end)) + 1 : 0;
  let protosEmitted = dumps.protos.length === 0;

  for (let i = 0; i < raw.length; i++) {
    if (!protosEmitted && i >= protoAt) {
      for (const p of dumps.protos) out.push(p);
      protosEmitted = true;
    }
    slots[i] = out.length;
    const orig = raw[i];
    const c = code[i];
    const lineNo = i + 1;
    const trimmed = c.trim();
    // 拼装插桩时必须用**去注释**的行：否则行尾 // 会把追加的 watch 与闭合 } 一起注释掉
    const codeLine = (c || '').replace(/\s+$/, '');

    /* ---- 循环头：把 __avc_t 塞进条件表达式，让 for/while **每轮**都发一次 S 事件 ----
       用逗号表达式而不是给循环体加花括号：单语句体、else 配对、do-while 尾巴都不受影响。
       块头行（`for (...) {`）以前完全不插桩，只有循环体内的行各自出步；现在每轮也能看到"判条件"这一步。 */
    const loopCode = markLoopCondition(codeLine, lineNo);
    if (loopCode && !enterInline[i] && !trimmed.startsWith('#')) {
      out.push(loopCode);
      steps.push(lineNo);
      continue;
    }

    // ---- 函数入口：空函数体时直接跟在 '{' 后 ----
    const inlineHere = enterInline[i];
    if (inlineHere && trimmed.includes('{')) {
      out.push(orig.replace('{', '{ ' + (opt.withFrame ? `__avc_e("${inlineHere}"); ` : '')));
      continue;
    }

    // ---- 普通语句插桩 ----
    // 只处理"完整的简单语句行"，并保证它是语句的起点：
    //   1) 去注释后非空、非预处理、非 case/default、非孤立花括号
    //   2) 以 ; 结尾且整行不含 '{'（含 { 的是块头，不能在行内塞进独立块）
    //   3) 括号/方括号配平（多行语句的中间行会被排除）
    //   4) 上一行必须是语句边界（; { } : 或空行/预处理），避免把续行当成新语句
    const startsWithContinuation = /^[,)\]}?+:*/=<>%&|"'.\-]/.test(trimmed);
    const prevBoundary = (() => {
      for (let k = i - 1; k >= 0; k--) {
        const t = code[k].trim();
        if (!t) continue;
        if (t.startsWith('#')) return true;
        return /[;{}:]$/.test(t) || t === 'else' || /^else\b/.test(t);
      }
      return true;
    })();

    // 只在函数体内部插桩（文件作用域的声明/原型不能变成语句块）
    const inFn = fns.find(f => i > f.bodyLine && i < f.end);
    // 声明语句：C89 要求声明位于块首，插桩时必须把声明放到最前面
    const declLike = astLib.isDeclLine(trimmed) || declWithInit(trimmed, typeSet);
    // 允许初始化器里的花括号，但禁止块头（if/for/while... {）
    const braceOk = !trimmed.includes('{') ||
      (/=[^;]*\{/.test(trimmed) && !/\b(if|for|while|switch|else|do|struct|union|enum)\b/.test(trimmed.split('{')[0]));

    const isStmt =
      !!inFn &&
      trimmed.length > 0 &&
      !trimmed.startsWith('#') &&
      /;\s*$/.test(trimmed) &&
      braceOk &&
      !trimmed.includes('}') &&
      !/^(case|default|else|do)\b/.test(trimmed) &&
      !/^while\s*\([^;]*\)\s*;\s*$/.test(trimmed) &&   // do-while 的尾巴，不能插
      !/^(typedef|struct|union|enum)\b/.test(trimmed) &&
      balanced(trimmed) &&
      !startsWithContinuation &&
      prevBoundary &&
      !inStruct(i) &&
      !fns.some(f => f.start === i);

    // 排除纯控制头（无分号的行已由上面过滤）
    if (!isStmt) {
      // 函数收尾：无 return 的函数在 } 前补 __avc_x()
      const fnEnd = fns.find(f => f.end === i);
      if (fnEnd && opt.withFrame) {
        const body = code.slice(fnEnd.bodyLine, fnEnd.end).join('\n');
        if (!/\breturn\b/.test(body)) {
          out.push(orig.replace('}', '__avc_x(); }'));
          continue;
        }
      }
      out.push(orig);
      continue;
    }

    // 需要插桩的行
    const visible = allVars.filter(v => {
      if (v.kind === 'ptrarr') {
        // 只在"未释放"区间内、且当前函数有同名指针（声明处或参数）时才 dump。
        // 注意不能用"全局行号 > 声明行"来判断别的函数——快排这类"辅助函数写在前面、
        // 被 main 调用修改同一块内存"的结构，函数体的行号会小于声明行。
        if (!inFn || !v.looseFns || !v.looseFns[inFn.name]) return false;
        if (inFn.name === v.declFn) return lineNo > v.declLine && lineNo < v.freeLine;
        return inFn.bodyLine < v.freeLine;      // 同名指针的辅助函数：整个函数体都允许
      }
      return v.declLine < lineNo && lineNo >= v.scopeStart && lineNo <= v.scopeEnd;
    });
    const isReturn = /^return\b/.test(trimmed);
    const isBreak = /^(break|continue)\b/.test(trimmed);

    let watches = [];
    if (opt.withWatches && !isReturn && !isBreak) {
      let usedVars = 0;
      for (const v of visible) {
        if (usedVars >= opt.maxWatches) break;
        usedVars++;                        // 预算按"变量"计，不按生成的调用条数计
        const st = v.struct;
        if (v.kind === 'cxx') {
          watches.push(...cxxWatchCalls(v, defines));
        } else if (v.kind === 'ptrarr') {
          // 长度符号只在声明它的函数里能被赋值（那里 lenExpr 在作用域内）
          const setLen = (inFn && inFn.name === v.declFn) ? `${lenSyms[v.name]} = (int)(${v.lenExpr}); ` : '';
          watches.push(`${setLen}if (${v.name}) { int _avc_i;` +
            ` for (_avc_i = 0; _avc_i < ${lenSyms[v.name]} && _avc_i < 16; _avc_i++)` +
            ` __avc_ai(${lineNo},"${v.name}",_avc_i,(long)${v.name}[_avc_i]); }`);
        } else if (v.kind === 'parr') {
          // 指针数组（哈希桶 ht[7]）：逐元素发 V 事件（名字 ht[i]），由数组窗聚合成"桶表"。
          // 以前它被当成单个结点 dump（__avc_dump_HNode("ht", ht)），把 7 个桶首指针当成一个结点走。
          const n = Math.min((v.dims && v.dims[0]) || 8, 16);
          const calls = [];
          for (let k = 0; k < n; k++) calls.push(`__avc_ai(${lineNo},"${v.name}",${k},(long)${v.name}[${k}]);`);
          watches.push(`{ ${calls.join(' ')} }`);
        } else if (v.kind === 'ptr' && st && st.shape && dumpByTag[st.tag]) {
          watches.push(`if (${v.name}) ${dumpByTag[st.tag]}("${v.name}", ${v.name});`);
        } else if (v.kind === 'struct' && st && st.shape && dumpByTag[st.tag]) {
          watches.push(`${dumpByTag[st.tag]}("${v.name}", &${v.name});`);
        } else {
          watches.push(...watchCalls(lineNo, v));
        }
      }
    }

    // 组装插入后的行
    /* 数组形参的逐元素 dump（放在语句之后 → 快照是"这一步做完"的状态） */
    const paramWatches = [];
    if (opt.withWatches && inFn && paramArrays[inFn.name] && !isReturn) {
      const info = paramArrays[inFn.name];
      const lenExpr = info.len ? `(${info.len})` : '24';
      for (const name of info.arrays) {
        paramWatches.push(`if (${name}) { int _avc_pa;` +
          ` for (_avc_pa = 0; _avc_pa < ${lenExpr} && _avc_pa < 24; _avc_pa++)` +
          ` __avc_ai(${lineNo},"${name}",_avc_pa,(long)${name}[_avc_pa]); }`);
      }
    }
    const wtail = (paramWatches.length || watches.length) ? ' ' + paramWatches.concat(watches).join(' ') : '';
    const isControl = /^(if|for|while|switch)\b/.test(trimmed);

    if (declLike) {
      // 声明行完全不插桩：一旦在声明后追加语句，后面的声明就不再处于块首（C89 违规），
      // 作用域也会被切断。变量值由紧随其后的语句快照体现。
      out.push(orig);
      continue;
    }
    if (isControl) {
      // 控制语句只在其前面插入一个独立的跟踪块，绝不包裹：
      //   { __avc_t(n); } if (q) printf(...);   -> else 仍能正确配对
      out.push(`{ __avc_t(${lineNo}); } ${codeLine}`);
    } else if (isReturn && opt.withFrame) {
      out.push(`{ __avc_t(${lineNo}); __avc_x(); ${codeLine} }`);
    } else {
      out.push(`{ __avc_t(${lineNo}); ${codeLine}${wtail} }`);
    }
    steps.push(lineNo);
  }

  // 追加 dump 函数定义
  for (const d of dumps.defs) out.push('', d);
  if (!protosEmitted) for (const p of dumps.protos) out.push(p);

  // 事后给"进入点"那一行加前缀（保证 E 事件在该函数第一条语句的 S 之前发出）
  if (opt.withFrame) {
    for (const key in enterAt) {
      const i = +key;
      if (slots[i] == null || out[slots[i]] == null) continue;
      out[slots[i]] = `__avc_e("${enterAt[i]}"); ` + out[slots[i]];
    }
  }

  return {
    code: out.join('\n'),
    meta: {
      steps: steps.length,
      structs: structs.map(s => ({ tag: s.tag, alias: s.alias, shape: s.shape, fields: s.fields })),
      functions: fns.map(f => ({ name: f.name, line: f.start + 1, params: f.params })),
      globals: globals.map(g => ({ name: g.name, kind: g.kind, line: g.declLine })),
      vars: allVars.map(v => ({
        name: v.name, kind: v.kind, declLine: v.declLine,
        structTag: v.structTag || null,
        shape: v.struct && v.struct.shape ? v.struct.shape : null,
        array: v.array,
      })),
      warnings,
    },
  };
}

module.exports = { instrument, stripComments, markLoopCondition };
