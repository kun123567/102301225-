/**
 * tools/visual-classes.mjs -- 把全量压叠按"图元类别对"归类，用来决定要不要修
 *   e.g. et-*×n-*  （边标签压在结点/边上）  24 处
 * 用法：node tools/visual-classes.mjs [--rect 685x300] [--after] [--top 24]
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const rectArg = (() => { const i = process.argv.indexOf('--rect'); return i >= 0 ? process.argv[i + 1] : '1000x300'; })();
const [rw, rh] = /^\d+x\d+$/.test(rectArg) ? rectArg.split('x').map(Number) : [1000, 300];
const RECT = { x: 0, y: 0, w: rw, h: rh };
const TOP = (() => { const i = process.argv.indexOf('--top'); return i >= 0 ? Number(process.argv[i + 1]) : 20; })();

const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { dispatch } = await import(pathToFileURL(join(ROOT, 'vendor/engine/dispatch.js')).href);
const { polishLayout } = await import(pathToFileURL(join(ROOT, 'app/canvas-stage.js')).href);

const textW = (s, size) => { let w = 0; for (const ch of String(s ?? '')) w += /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? size : size * 0.58; return w; };
const fontSize = (p) => { const m = String(p.font || '').match(/(\d+(?:\.\d+)?)px/); return m ? Number(m[1]) : 11; };
function box(p) {
  if (p.kind === 'rect') return { x: p.x, y: p.y, w: p.w, h: p.h };
  if (p.kind === 'circle') return { x: p.cx - p.r, y: p.cy - p.r, w: 2 * p.r, h: 2 * p.r };
  if (p.kind === 'chip') { const w = textW(p.text, p.size || 11) + 14, h = (p.size || 11) + 10; return { x: p.x - w / 2, y: p.y - h / 2, w, h }; }
  if (p.kind === 'text') { const s = fontSize(p), w = textW(p.text, s), a = p.align || 'center'; return { x: a === 'left' ? p.x : a === 'right' ? p.x - w : p.x - w / 2, y: p.y - s / 2, w, h: s + 2 }; }
  return null;
}
const ar = (b) => Math.max(0, b.w) * Math.max(0, b.h);
const ratio = (a, b) => { const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)); const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); const m = Math.min(ar(a), ar(b)); return m > 0 ? (w * h) / m : 0; };
const OWN_ALONE = /^(et|ptr-line|ptr|th|axis|name|depth|legend|mode|empty|tl)-?/;
function ownId(key) {
  const k = String(key || '');
  if (!k) return '';
  if (OWN_ALONE.test(k)) return '@' + k;
  let rest = k.replace(/-(data|next|prev)$/, '');
  let prev;
  do { prev = rest; rest = rest.replace(/^[a-z]+-/i, ''); } while (rest !== prev);
  return rest || k;
}
const isC = (p) => p.kind === 'rect' || p.kind === 'circle';
const cls = (key) => String(key || '').replace(/[\d,]+/g, '#').replace(/^(et|ptr-line|ptr|n|nb|nv|nval|nft|ne|nf|cell|bar|val|idx|b|v|col|row|sq|sf|s|g)-.*/, '$1-*');
const kk = (k) => (k || '').split('×')[0];

const buckets = new Map();
let layers = 0;
for (const it of ITEMS) {
  let mod; try { mod = await import(pathToFileURL(join(ROOT, 'vendor', it.path)).href); } catch { continue; }
  const input = (mod.samples?.[0] || {}).input || {};
  for (const v of it.variants || []) {
    let tr; try { tr = mod.run(v.id, input); } catch { continue; }
    for (const st of tr.steps || []) for (const layer of st.layers || []) {
      let out; try { out = dispatch(layer.style).instance.layout(layer, RECT, { bg: '#fff' }); } catch { continue; }
      layers++;
      const list = (out.prims || []).map((p) => ({ ...p }));
      if (!process.argv.includes('--raw')) polishLayout(list, RECT, layer.style);   // --raw = 看渲染器原始输出
      const ink = list.filter((p) => p && ['text', 'chip', 'circle', 'rect'].includes(p.kind) && !/^dot-/.test(p.key || ''));
      const bs = ink.map((p) => ({ p, b: box(p) })).filter((o) => o.b && o.b.w > 0 && o.b.h > 0);
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const A = bs[i];
          const B = bs[j];
          const r = ratio(A.b, B.b);
          if (r <= 0.15) continue;
          const ia = ownId(A.p.key);
          const ib = ownId(B.p.key);
          if (ia && ia === ib) continue;
          if (r > 0.85 && (isC(A.p) || isC(B.p))) continue;
          const a = cls(A.p.key) + '×' + cls(B.p.key);
          const b = cls(B.p.key) + '×' + cls(A.p.key);
          const key = buckets.has(a) ? a : buckets.has(b) ? b : a;
          const rec = buckets.get(key) || { n: 0, sample: '', style: layer.style };
          rec.n++;
          if (!rec.sample) rec.sample = `${it.uid} ${v.id} #${st.stepIndex ?? st.index ?? '?'} :: ${A.p.key}×${B.p.key}`;
          buckets.set(key, rec);
        }
      }
    }
  }
}
console.log(`=== polish 之后的压叠按类别（rect=${rw}x${rh}，${layers} 层）===`);
for (const [k, v] of [...buckets.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, TOP)) {
  console.log(`${String(v.n).padStart(5)}  style${String(v.style).padStart(2)}  ${k}`);
  console.log(`        例：${v.sample}`);
}
console.log('\n合计：' + [...buckets.values()].reduce((s, v) => s + v.n, 0));
void kk;
