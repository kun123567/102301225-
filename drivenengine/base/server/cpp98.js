'use strict';
/**
 * cpp98.js -- C++11 → C++98 降级预处理（prototype01 兼容层）
 *
 * 背景：Open Watcom 的 C++ 前端只到 C++98。学生代码里高频出现的三样 C++11 写法会直接报错：
 *   ① `for (T v : expr)`          range-for   -> 下标循环
 *   ② `nullptr`                   关键字      -> 0
 *   ③ `ios::sync_with_stdio(false)` / `tie(nullptr)`
 *                                 旧式 iostream 不接受参数 -> 整行删除
 *
 * 设计原则：**只做语义等价的机械改写，并且把每条改写都写进编译日志**（不静默改源码）。
 * 无法安全改写时保持原样，让编译器报错，交由用户手改。
 */
'use strict';

/** 判断某位置是否位于字符串/字符字面量内（粗略但足够） */
function inString(line, pos) {
  let q = null;
  for (let i = 0; i < pos && i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '\\') { i++; continue; }
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
  }
  return !!q;
}

const RANGE_FOR = /^(\s*)for\s*\(\s*([A-Za-z_][\w:<>,\s\*&]*?)\s+([A-Za-z_]\w*)\s*:\s*(.+?)\s*\)\s*(\{)?\s*$/;
const IOS_TUNE = /^\s*(?:ios\s*::\s*sync_with_stdio|cin\s*\.\s*tie|cout\s*\.\s*tie|std\s*::\s*ios\s*::\s*sync_with_stdio)\s*\(/;

/**
 * @param {string} src
 * @returns {{code:string, notes:string[], changed:boolean}}
 */
function downgrade(src) {
  const lines = String(src).split(/\r?\n/);
  const notes = [];
  const out = [];
  let changed = false;
  let nNull = 0, nIos = 0, nRange = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    /* ---- ③ 旧式 iostream 不接受参数的加速调用：整行删除 ---- */
    if (IOS_TUNE.test(line) && /;\s*$/.test(line)) {
      nIos++;
      changed = true;
      out.push(/^(\s*)/.exec(line)[1] + '/* [prototype01] 已删除：本工具链的 iostream 为旧式实现，不支持 sync_with_stdio(bool)/tie(ptr) */');
      continue;
    }

    /* ---- ① range-for：仅当紧跟着块 '{' 时改写 ---- */
    const m = line.match(RANGE_FOR);
    if (m) {
      const indent = m[1], type = m[2].trim(), v = m[3], expr = m[4], brace = m[5];
      if (brace) {
        nRange++;
        changed = true;
        out.push(indent + 'for (int __avc_rf_i = 0; __avc_rf_i < (int)(' + expr + ').size(); ++__avc_rf_i) {');
        out.push(indent + '    ' + type + ' ' + v + ' = (' + expr + ')[' + '__avc_rf_i];');
        continue;
      }
      // 没有花括号：保守起见不改，只提示
      notes.push('第 ' + (i + 1) + ' 行 range-for 没有紧跟 { } 块，未自动降级，请手改为下标循环');
      out.push(line);
      continue;
    }

    /* ---- ② nullptr -> 0（跳过字符串/字符字面量） ---- */
    if (/\bnullptr\b/.test(line)) {
      let res = '', last = 0, mm;
      const re = /\bnullptr\b/g;
      while ((mm = re.exec(line))) {
        if (inString(line, mm.index)) continue;
        res += line.slice(last, mm.index) + '0';
        last = mm.index + 'nullptr'.length;
        nNull++;
      }
      if (last > 0) {
        res += line.slice(last);
        line = res;
        changed = true;
      }
    }

    out.push(line);
  }

  // 行内兜底：插桩后这些调用会被包进 { __avc_t(...); ... }，整行匹配失效，
  // 因此在代码区内再做一次"调用→空语句"替换（语义等价：它们只是加速开关）。
  let joined = out.join('\n');
  const before = joined;
  joined = joined.replace(/(?:std\s*::\s*)?ios\s*::\s*sync_with_stdio\s*\([^)]*\)\s*;/g, ';');
  joined = joined.replace(/\b(?:cin|cout)\s*\.\s*tie\s*\([^)]*\)\s*;/g, ';');
  if (joined !== before) {
    nIos++;
    changed = true;
  }

  if (nRange) notes.push('range-for 已降级为下标循环：' + nRange + ' 处');
  if (nNull) notes.push('nullptr 已替换为 0：' + nNull + ' 处');
  if (nIos) notes.push('已删除旧式 iostream 不支持的加速调用：' + nIos + ' 行');
  if (notes.length) notes.unshift('[prototype01 C++11→C++98 降级] 源码被机械改写（语义等价）：');

  return { code: joined, notes, changed };
}

module.exports = { downgrade };
