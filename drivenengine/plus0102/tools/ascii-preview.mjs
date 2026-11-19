/**
 * tools/ascii-preview.mjs -- 把某一层的最终图元画成 ASCII，用来在没有浏览器时"看"排布
 * 用法：node tools/ascii-preview.mjs <uid> [variantId] [stepIndex] [cols] [rows]
 *   例：node tools/ascii-preview.mjs d/avl-tree v1 9
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const [uid, variant = 'v1', stepArg = '0', colsArg = '100', rowsArg = '30'] = process.argv.slice(2);
const COLS = Number(colsArg);
const ROWS = Number(rowsArg);
const RECT = { x: 0, y: 0, w: 1000, h: 300 };

const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { dispatch } = await import(pathToFileURL(join(ROOT, 'vendor/engine/dispatch.js')).href);
const { polishLayout } = await import(pathToFileURL(join(ROOT, 'app/canvas-stage.js')).href);

const item = ITEMS.find((i) => i.uid === uid);
if (!item) { console.error('没有这个案例：' + uid); process.exit(1); }
const mod = await import(pathToFileURL(join(ROOT, 'vendor', item.path)).href);
const input = (mod.samples?.[0] || {}).input || {};
const trace = mod.run(variant, input);
const step = trace.steps[Number(stepArg)];
if (!step) { console.error('没有这一步'); process.exit(1); }

const sx = COLS / RECT.w;
const sy = ROWS / RECT.h;
const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
const put = (x, y, ch) => {
  const c = Math.round(x * sx);
  const r = Math.round(y * sy);
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = ch;
};
const putText = (x, y, text) => {
  const c0 = Math.round(x * sx);
  const r = Math.round(y * sy);
  if (r < 0 || r >= ROWS) return;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const c = c0 + i;
    if (c >= 0 && c < COLS) grid[r][c] = s[i];
  }
};

console.log(`uid=${uid} variant=${variant} step=${stepArg} (${step.note ? step.note.slice(0, 56) : ''}…)`);
for (const layer of step.layers || []) {
  const out = dispatch(layer.style).instance.layout(layer, RECT, { bg: '#fff' });
  polishLayout(out.prims || [], RECT, layer.style);
  grid.forEach((row) => row.fill(' '));
  for (const p of (out.prims || [])) {
    if (p.kind === 'line') {
      const n = Math.max(Math.abs(p.x2 - p.x1), Math.abs(p.y2 - p.y1)) / 8;
      for (let i = 0; i <= n; i++) put(p.x1 + (p.x2 - p.x1) * (i / n), p.y1 + (p.y2 - p.y1) * (i / n), '·');
    } else if (p.kind === 'circle') {
      const c = Math.round(p.cx * sx);
      const r = Math.round(p.cy * sy);
      const rr = Math.max(1, Math.round(p.r * sx));
      for (let a = 0; a < 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        const cc = Math.round(c + Math.cos(t) * rr);
        const rr2 = Math.round(r + Math.sin(t) * (p.r * sy));
        if (rr2 >= 0 && rr2 < ROWS && cc >= 0 && cc < COLS) grid[rr2][cc] = 'o';
      }
    } else if (p.kind === 'chip') {
      putText(p.x - 2, p.y, '[' + p.text + ']');
    } else if (p.kind === 'text') {
      putText(p.align === 'right' ? p.x - String(p.text).length : p.align === 'left' ? p.x : p.x - String(p.text).length / 2, p.y, p.text);
    } else if (p.kind === 'rect') {
      const c0 = Math.round(p.x * sx);
      const c1 = Math.round((p.x + p.w) * sx);
      const r0 = Math.round(p.y * sy);
      const r1 = Math.round((p.y + p.h) * sy);
      for (let c = c0; c <= c1; c++) { put(c / sx, p.y, '-'); put(c / sx, p.y + p.h, '-'); }
      for (let r = r0; r <= r1; r++) { put(p.x, r / sy, '|'); put(p.x + p.w, r / sy, '|'); }
    }
  }
  console.log('\n--- layer ' + (layer.id || '?') + ' (style ' + layer.style + ') ---');
  console.log(grid.map((row) => row.join('').replace(/\s+$/, '')).join('\n'));
}
