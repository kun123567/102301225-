/**
 * tools/visual-audit.mjs -- 全量"任意两个图元压在一起"审计（不挑配对）
 *
 * 之前的 overlap-audit / tree-audit 都是"按已知问题挑配对"——挑漏了就会显示 0
 * （链表 next/cur 被推进结点框那次就是漏在"气泡×结点框"上）。这个工具改成**两两全比**：
 *
 *   · 只比"有墨水的东西"：text / chip / circle / rect（线、折线不算，斜线 bbox 太假）
 *   · 视为正常、不计入：
 *       - 同一个 id 的图元（`nv-n3` 在 `n-n3` 里、`nft-n1-data` 在 `nfill-n1` 里、`cell-v-0` 在 `cell-0` 里）
 *       - 容器（rect/circle）**绝大部分**装着一个标签（交集 / 较小面积 > 0.85）
 *   · 计入"压叠"：交集 / 较小面积 在 0.15 ~ 0.85 之间（半压），或文字×文字（无论如何）
 *   · 另外统计出界
 *
 * 输出：修（polishLayout）前 / 后的压叠总数、按案例 Top、以及每条的 key 对，便于定位。
 *
 * 用法：node tools/visual-audit.mjs [--rect 685x300] [--verbose] [--only uid]
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const VERBOSE = process.argv.includes('--verbose');
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? process.argv[i + 1] : null;
})();
const rectArg = (() => {
  const i = process.argv.indexOf('--rect');
  return i >= 0 ? process.argv[i + 1] : '1000x300';
})();
const [rw, rh] = /^\d+x\d+$/.test(rectArg) ? rectArg.split('x').map(Number) : [1000, 300];
const RECT = { x: 0, y: 0, w: rw, h: rh };

const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { dispatch } = await import(pathToFileURL(join(ROOT, 'vendor/engine/dispatch.js')).href);
const { polishLayout } = await import(pathToFileURL(join(ROOT, 'app/canvas-stage.js')).href);

/* ---------------- 文本宽估算（CJK 整字宽） ---------------- */
function textW(s, size) {
  let w = 0;
  for (const ch of String(s ?? '')) w += /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? size : size * 0.58;
  return w;
}
function fontSize(p) {
  const m = String(p.font || '').match(/(\d+(?:\.\d+)?)px/);
  return m ? Number(m[1]) : 11;
}
function box(p) {
  if (p.kind === 'rect') return { x: p.x, y: p.y, w: p.w, h: p.h };
  if (p.kind === 'circle') return { x: p.cx - p.r, y: p.cy - p.r, w: 2 * p.r, h: 2 * p.r };
  if (p.kind === 'chip') {
    const w = textW(p.text, p.size || 11) + 14;
    const h = (p.size || 11) + 10;
    return { x: p.x - w / 2, y: p.y - h / 2, w, h };
  }
  if (p.kind === 'text') {
    const size = fontSize(p);
    const w = textW(p.text, size);
    const align = p.align || 'center';
    const x = align === 'left' ? p.x : align === 'right' ? p.x - w : p.x - w / 2;
    return { x, y: p.y - size / 2, w, h: size + 2 };
  }
  return null;
}
const area = (b) => Math.max(0, b.w) * Math.max(0, b.h);
function ratio(a, b) {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const min = Math.min(area(a), area(b));
  return min > 0 ? (w * h) / min : 0;
}
/**
 * 图元的"归属"：把"同一个东西的多个部件"归到一起（框 + 柱 + 值 + 下标）
 *   cell-v-0 / cell-0 / bar-0 / val-0 / idx-0 / cell-l-0  →  '0'
 *   nft-n1-data / nv-n1 / nval-n1 / nb-n1 / n-n1        →  'n1'
 * 但"标注类"要单独算：et-（边标签）、ptr-（指针气泡）、ptr-line-、axis-、标题类 —— 它们压到谁都是问题。
 */
const OWN_ALONE = /^(et|ptr-line|ptr|th|axis|name|depth|legend|mode|empty|tl)-?/;
function ownId(key) {
  const k = String(key || '');
  if (!k) return '';
  if (OWN_ALONE.test(k)) return '@' + k;                  // 标注：永远不跟别人合并
  let rest = k.replace(/-(data|next|prev)$/, '');
  let prev;
  do {
    prev = rest;
    rest = rest.replace(/^[a-z]+-/i, '');                 // 逐段去掉字母前缀
  } while (rest !== prev);
  return rest || k;
}
const isContainer = (p) => p.kind === 'rect' || p.kind === 'circle';

function check(prims, rect) {
  const ink = prims.filter((p) => p && ['text', 'chip', 'circle', 'rect'].includes(p.kind) && !/^dot-/.test(p.key || ''));
  const boxes = ink.map((p) => ({ p, b: box(p) })).filter((o) => o.b && o.b.w > 0 && o.b.h > 0);
  const hits = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i];
      const B = boxes[j];
      const r = ratio(A.b, B.b);
      if (r <= 0.15) continue;
      const ia = ownId(A.p.key);
      const ib = ownId(B.p.key);
      if (ia && ia === ib) continue;                                  // 同一 id 的标签/框/字
      // 装着（>85%）且外面那个是框/圆 → 有意为之（柱在格子里、字在框里、点在图元里…）
      if (r > 0.85 && (isContainer(A.p) || isContainer(B.p))) continue;
      hits.push(`${A.p.key}×${B.p.key}(${Math.round(r * 100)}%)`);
    }
  }
  let oob = 0;
  for (const { b } of boxes) {
    if (b.x < rect.x - 2 || b.y < rect.y - 2 || b.x + b.w > rect.x + rect.w + 2 || b.y + b.h > rect.y + rect.h + 2) oob++;
  }
  return { n: hits.length, hits, oob };
}

let layers = 0;
let before = 0;
let after = 0;
let oobBefore = 0;
let oobAfter = 0;
const perCase = new Map();
const samples = [];
const regress = new Map();

for (const it of ITEMS) {
  if (ONLY && it.uid !== ONLY) continue;
  let mod;
  try { mod = await import(pathToFileURL(join(ROOT, 'vendor', it.path)).href); } catch { continue; }
  const input = (mod.samples?.[0] || {}).input || {};
  for (const v of it.variants || []) {
    let trace;
    try { trace = mod.run(v.id, input); } catch { continue; }
    for (const st of trace.steps || []) {
      for (const layer of st.layers || []) {
        let out;
        try { out = dispatch(layer.style).instance.layout(layer, RECT, { bg: '#ffffff' }); } catch { continue; }
        layers++;
        const p1 = (out.prims || []).slice();
        const r1 = check(p1, RECT);
        const p2 = p1.map((p) => ({ ...p }));
        polishLayout(p2, RECT, layer.style);
        const r2 = check(p2, RECT);
        before += r1.n;
        after += r2.n;
        oobBefore += r1.oob;
        oobAfter += r2.oob;
        if (r1.n || r2.n) {
          const k = it.uid + ' ' + v.id;
          perCase.set(k, (perCase.get(k) || 0) + r1.n);
          if (r2.n > r1.n) regress.set(k, (regress.get(k) || 0) + (r2.n - r1.n));
          if (samples.length < 14) samples.push({ k, style: layer.style, step: st.stepIndex ?? st.index ?? '?', before: r1.hits.slice(0, 3), after: r2.hits.slice(0, 3) });
        }
      }
    }
  }
}

console.log(`=== 全量压叠复查（任意两个有墨水的图元） rect=${rw}x${rh} ===`);
console.log(`扫描 ${layers} 层`);
console.log(`压叠：   修前 ${before} 处 → 修后 ${after} 处`);
console.log(`出界：   修前 ${oobBefore} 处 → 修后 ${oobAfter} 处`);
console.log(`polish 之后变多的案例：${regress.size}`);
if (regress.size) for (const [k, n] of [...regress].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   +${n}  ${k}`);
if (VERBOSE) {
  console.log('\n=== 修前压叠最多的案例 ===');
  for (const [k, n] of [...perCase.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)) console.log(`   ${String(n).padStart(4)}  ${k}`);
}
console.log('\n=== 样例（修前 → 修后）===');
for (const s of samples) {
  console.log(`  ${s.k} style${s.style} #${s.step}`);
  console.log(`     before: ${s.before.join(' , ') || '—'}`);
  console.log(`     after : ${s.after.join(' , ') || '—'}`);
}
process.exit(after > before ? 2 : 0);
