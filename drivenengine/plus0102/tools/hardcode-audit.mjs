/**
 * tools/hardcode-audit.mjs -- "还有哪些可视化是硬编码的"审计
 *
 * 判定口径（两种"硬编码"分开报）：
 *   A. **图元命名级**：某个案例产出的键名，能不能被通用角色接口（ROLES / profile.roles）认识？
 *      不能认识 → 那部分可视化只能由该渲染器自己负责，排版层完全管不到 = 硬编码在渲染器里。
 *   B. **代码分支级**：代码里有没有按"案例 uid / family 名 / 具体键名"写死的分支。
 *      这里扫 app/*.js（排版层）与 vendor/engine/renderers/*.js（渲染器）里的字面量。
 *
 * 输出：
 *   ① 按包（A~G，默认 C~F）逐条：样式、图元键前缀、未识别键、结论
 *   ② 未识别键的汇总（哪些键是谁也不认识的）
 *   ③ 代码分支级命中（文件:行 + 片段）
 *
 * 用法：
 *   node tools/hardcode-audit.mjs                 # 默认 C~F
 *   node tools/hardcode-audit.mjs --pkgs C,D,E,F
 *   node tools/hardcode-audit.mjs --pkgs all --verbose
 */
import { join, resolve } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const argv = process.argv.slice(2);
const pkgsArg = (() => { const i = argv.indexOf('--pkgs'); return i >= 0 ? argv[i + 1] : 'C,D,E,F'; })();
const VERBOSE = argv.includes('--verbose');
const WANT = pkgsArg === 'all' ? null : new Set(pkgsArg.split(',').map((s) => s.trim().toUpperCase()));

const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { dispatch } = await import(pathToFileURL(join(ROOT, 'vendor/engine/dispatch.js')).href);
const { adaptStepLayers } = await import(pathToFileURL(join(ROOT, 'vendor/app/adapt.js')).href);
const { profileOf, ROLES, roleOfPrim } = await import(pathToFileURL(join(ROOT, 'app/layout-policy.js')).href);

const RECT = { x: 0, y: 0, w: 1000, h: 300 };

/* ---------------- 键名 → 是否被角色接口认识 ---------------- */
const keyPrefix = (k) => {
  const s = String(k || '');
  if (!s) return '(no-key)';
  const m = /^([A-Za-z][A-Za-z0-9]*)(?:[-_]|$)/.exec(s);
  return m ? m[1] + '-*' : s;
};
/**
 * 这套键名在某个 style 里是否被认识 —— **直接调排版层同一个 roleOfPrim()**
 * （唯一识别入口，避免"代码认识、审计说没认识"这种两套判断）
 */
function recognized(style, key, prim) {
  return !!roleOfPrim(prim || { key, kind: 'text' }, style);
}
/**
 * "内容 / 装饰"键：只作为**障碍**参与压叠计算，**不需要**语义角色。
 * 判定依据（已核对渲染器源码）：
 *   link-…   箭头折线          ne-… / nf-…   结点框线与字段分隔线
 *   nft-… / tnv-… / tni-… / gv-… / rht-… / cht-… / tri-… / null-…   文字
 *   ch-… / rh-…   表头背景框    cap-… / bottom-…   栈底/栈顶盖
 *   s-… / sf-…    稀疏点        dot-…   框线装饰点    grid-/idx-/val-…   轴与下标
 */
const CONTENT_OR_DECO = /^(?:link|ll|ne|nf|nft|null|tnv|tni|ch|rh|gv|gx|gy|rht|cht|tri|cap|bottom|top|s|sf|dot|grid|idx|val|sq|row|col|bar|b|v|bg|pill|cell-l|cell-v|cell-a|cell-b)(?:-|$)/;
/** 已知但只是标题/轴之类（角色表里已有对应项，这里只做兜底） */
const KNOWN_NEUTRAL = /^(name|depth|legend|mode|empty|tl|treelabel|axis-)/;

/* ---------------- 逐案例采集 ---------------- */
const rows = [];
const unrecognizedByKey = new Map();     // key-prefix -> 出现的案例数
const unrecognizedByItem = new Map();

for (const it of ITEMS) {
  const pkg = String(it.uid).split('/')[0].toUpperCase();
  if (WANT && !WANT.has(pkg)) continue;
  let mod;
  try { mod = await import(pathToFileURL(join(ROOT, 'vendor', it.path)).href); } catch { continue; }
  const input = (mod.samples?.[0] || {}).input || {};
  const styles = new Set();
  const keys = new Map();       // key -> {style, count}
  for (const v of it.variants || []) {
    let trace;
    try { trace = mod.run(v.id, input); } catch { continue; }
    for (const st of trace.steps || []) {
      for (const layer of st.layers || []) {
        styles.add(layer.style);
        let out;
        try { out = dispatch(layer.style).instance.layout(layer, RECT, { bg: '#fff' }); } catch { continue; }
        for (const p of out.prims || []) {
          const k = p.key || '(no-key)';
          const rec = keys.get(k) || { style: layer.style, count: 0, prim: p };
          rec.count += 1;
          keys.set(k, rec);
        }
      }
    }
  }
  const unknown = [];      // 结构级：排版层看不见结构 = 真缺口
  const content = [];      // 内容/装饰级：不需要角色，只当障碍
  for (const [k, rec] of keys) {
    if (recognized(rec.style, k, rec.prim)) continue;
    if (KNOWN_NEUTRAL.test(k)) continue;
    if (CONTENT_OR_DECO.test(k)) { content.push(k); continue; }
    unknown.push(k);
    const pref = keyPrefix(k);
    unrecognizedByKey.set(pref, (unrecognizedByKey.get(pref) || 0) + 1);
  }
  if (unknown.length) unrecognizedByItem.set(it.uid, unknown);
  rows.push({ uid: it.uid, pkg, title: it.title, styles: [...styles].sort((a, b) => a - b), keys: keys.size, unknown, content });
}

/* ---------------- 结论分级 ---------------- */
/**
 * 三档：
 *   ● 全通用 —— 所有有意义的键名都被角色接口认识（排版层能管）
 *   ◐ 部分 —— 关键语义键不认识（排版层看不见那部分）
 *   ○ 专有 —— 该案例的语义键基本都在专有前缀里（只能由渲染器自己负责）
 */
const grade = (r) => {
  if (!r.unknown.length) return '●';
  return r.unknown.length >= 3 ? '○' : '◐';
};
const gradeNote = (r) => (r.unknown.length ? '结构级缺口' : (r.content.length ? '仅内容/装饰键' : '全通用'));

const byPkg = new Map();
for (const r of rows) {
  if (!byPkg.has(r.pkg)) byPkg.set(r.pkg, []);
  byPkg.get(r.pkg).push(r);
}

console.log(`=== 可视化"硬编码"审计（包：${pkgsArg}）===`);
console.log(`判定：图元键名是否被通用角色接口（ROLES/profile.roles）认识；● 全通用  ◐ 部分  ○ 专有\n`);
for (const pkg of [...byPkg.keys()].sort()) {
  const list = byPkg.get(pkg);
  const cnt = { '●': 0, '◐': 0, '○': 0 };
  for (const r of list) cnt[grade(r)] += 1;
  console.log(`--- ${pkg} 类：${list.length} 条  ●${cnt['●']}  ◐${cnt['◐']}  ○${cnt['○']} ---`);
  for (const r of list) {
    const st = r.styles.join('/');
    const uniq = [...new Set(r.unknown.map(keyPrefix))].sort();
    console.log(`  ${grade(r)} ${r.uid.padEnd(30)} style ${st.padEnd(6)} 键 ${String(r.keys).padStart(3)} 个` +
      (uniq.length ? `   未识别前缀: ${uniq.join(' ')}` : ''));
    if (VERBOSE && r.unknown.length) console.log('        未识别键: ' + [...new Set(r.unknown)].slice(0, 14).join(', '));
  }
  console.log('');
}

console.log('=== 未识别键前缀汇总（谁都不认识 ⇒ 只能硬编码在该渲染器里）===');
for (const [k, n] of [...unrecognizedByKey.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)} 次  ${k}`);
}

/* ---------------- B. 代码分支级：扫字面量 ---------------- */
console.log('\n=== 代码里的"按案例/按族"字面量分支 ===');
const OWN_UID = /(['"`])([a-g])\/([a-z0-9-]+)\1/g;          // 'c/b-tree' 这种
const OWN_FAMILY = /\b(b-tree|bplus|btree|avl|red-black|huffman|critical-path|threaded|union-find|hash-|replacement-selection|optimal-merge)\b/;
const files = [];
for (const dir of ['app', join('vendor', 'engine', 'renderers')]) {
  const abs = join(ROOT, dir);
  for (const f of readdirSync(abs)) if (f.endsWith('.js')) files.push(join(dir, f));
}
let hits = 0;
for (const rel of files) {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(?:\*|\/\/)/.test(line)) return;                  // 注释不算
    const uid = OWN_UID.test(line);
    OWN_UID.lastIndex = 0;
    const fam = OWN_FAMILY.test(line);
    if (!uid && !fam) return;
    hits += 1;
    if (hits <= 24) console.log(`  ${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
  });
}
console.log(`  合计 ${hits} 处（注释已排除）`);
console.log('\n说明：渲染器里的"怎么画"必然是按族写死的（那是 06 的复原目标）；');
console.log('      本表关心的是**排版/识别层**有没有按案例开分支，以及哪些语义键还进不了通用接口。');
