/**
 * tools/host-integration-test.mjs -- 在**他们仓库的代码路径**上跑一遍 54 个示例
 *
 * 目的：验证"接入后能在这边切换 54 个示例"——不是看我自己的 stage，而是走
 *   datastructure-agent 的 `createVisualization`（数组族，含它的 CSS/动画链路）
 *   与 `plus-bridge` 的新增原型（其它族）。
 *
 * 用法：node tools/host-integration-test.mjs
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOST = 'D:\\.FZU\\03Software\\04\\raw\\datastructure-agent\\frontend';
const url = (p) => pathToFileURL(join(HOST, p)).href;

let pass = 0;
let fail = 0;
const ok = (s, cond, extra) => {
  if (cond) { pass += 1; }
  else { fail += 1; console.log('  ✗ ' + s + (extra ? '  → ' + extra : '')); }
};

/* ---------------- 假 DOM（够 index.js / svg-stage 用） ---------------- */
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), className: '', textContent: '', dataset: {}, style: {}, attributes: {}, childNodes: [],
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, on) { on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (on ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); },
    },
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') { this.className = String(v); if (this.classList) for (const c of String(v).split(/\s+/).filter(Boolean)) this.classList.add(c); } },
    getAttribute(k) { return this.attributes[k] ?? null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; },
    append(...cs) { cs.forEach((c) => this.appendChild(c)); },
    prepend(...cs) { cs.reverse().forEach((c) => this.childNodes.unshift(c)); },
    insertBefore(c, ref) { const i = this.childNodes.indexOf(ref); this.childNodes.splice(i < 0 ? 0 : i, 0, c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); return c; },
    replaceChildren(...cs) { this.childNodes = []; cs.forEach((c) => this.appendChild(c)); },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {},
    focus() {}, dispatchEvent() { return true; }, closest() { return null; },
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 900, height: 320, right: 900, bottom: 320 }; },
    animate() { return { cancel() {}, finished: Promise.resolve() }; },
    getContext() { return null; },
    get firstChild() { return this.childNodes[0] || null; },
    get children() { return this.childNodes; },
    width: 900, height: 320,
  };
  return el;
}
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.location = { href: 'http://127.0.0.1:3000/', search: '' };
globalThis.document = {
  body: makeEl('body'),
  createElement: (t) => makeEl(t),
  createElementNS: (ns, t) => makeEl(t),
  querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {},
};
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '', fontSize: '12px' });

const { PLUS_CASES, buildPlusRun, createPlusView } = await import(url('src/features/visualization/ext/plus-bridge.js'));

console.log('=== 在 datastructure-agent 的代码路径上跑 54 个示例 ===');
const byPkg = new Map();
const failures = [];

for (const c of PLUS_CASES) {
  const pkg = c.pkg;
  const rec = byPkg.get(pkg) || { total: 0, ok: 0, steps: 0 };
  rec.total += 1;
  try {
    const run = await buildPlusRun(c.id, 'v1');
    ok(c.id + ' 生成 run', !!run && Array.isArray(run.steps) && run.steps.length > 0, 'steps=' + (run && run.steps.length));
    const host = makeEl('div');
    host.clientWidth = 900;
    const view = createPlusView(host, run, { explainContainer: null });
    ok(c.id + ' 建视图', !!view && typeof view.showStep === 'function');
    view.showStep(run.steps[0], { stepIndex: 0 });
    const mid = Math.min(3, run.steps.length - 1);
    view.showStep(run.steps[mid], { stepIndex: mid });
    // 断言"真的画了"：宿主 DOM 里有 prototype-array（数组族）或 avc-el（其它族的新增原型）
    const collect = (node, out = []) => { for (const ch of node.childNodes || []) { out.push(ch); collect(ch, out); } return out; };
    const all = collect(host);
    const hasArrayFrame = all.some((n) => String(n.className || '').includes('prototype-array'));
    const hasGenericFrame = all.some((n) => String(n.className || '').includes('avc-el'));
    ok(c.id + ' 能显示两步', all.length > 0 && (hasArrayFrame || hasGenericFrame),
      'nodes=' + all.length + ' array=' + hasArrayFrame + ' generic=' + hasGenericFrame);
    // 至少要有 DOM 产出（数组族=prototype-array 的 svg；其它族=avc-el / canvas-card）
    const count = (node, n = 0) => (node.childNodes || []).reduce((acc, ch) => acc + 1 + count(ch), n);
    const rendered = count(host);
    ok(c.id + ' 有 DOM 产出', rendered > 0, 'nodes=' + rendered);
    view.destroy();
    rec.ok += 1;
    rec.steps += run.steps.length;
  } catch (e) {
    failures.push(c.id + ' :: ' + (e && e.message));
    console.log('  ✗ ' + c.id + '  → ' + (e && e.message));
  }
  byPkg.set(pkg, rec);
}

console.log('\n包  | 示例数 | 通过 | 步数合计');
for (const [pkg, r] of [...byPkg.entries()].sort()) {
  console.log(`  ${pkg}  |  ${String(r.total).padStart(2)}   | ${String(r.ok).padStart(2)}  | ${r.steps}`);
}
const totalOk = [...byPkg.values()].reduce((s, r) => s + r.ok, 0);
console.log(`\n合计：${totalOk} / ${PLUS_CASES.length} 个示例在宿主代码路径上跑通`);
if (failures.length) { console.log('失败明细：'); failures.slice(0, 12).forEach((f) => console.log('  - ' + f)); }

console.log('\n补充：数组族的步骤文案应来自 plus 示例的 note（不是二分查找语义）');
{
  const { buildPlusRun, createPlusView } = await import(url('src/features/visualization/ext/plus-bridge.js'));
  const run = await buildPlusRun('plus:a/insertion-sort', 'v1');
  const host = makeEl('div'); host.clientWidth = 900;
  const host2 = makeEl('div');
  // explainContainer 用独立容器，便于抓 .bsviz-caption / .bsviz-status
  host.querySelector = (sel) => host2.querySelector(sel);
  const cap = makeEl('p'); cap.className = 'bsviz-caption';
  const st = makeEl('p'); st.className = 'bsviz-status';
  host2.querySelector = (sel) => (sel === '.bsviz-caption' ? cap : sel === '.bsviz-status' ? st : null);
  const view = createPlusView(host, run, { explainContainer: host2 });
  view.showStep(run.steps[2], { stepIndex: 2 });
  const note = String((run.rawSteps[2] || {}).note || '');
  ok('caption 被覆盖为"第 N 步：事件"', /^第 3 步：/.test(String(cap.textContent || '')), String(cap.textContent));
  ok('status 显示该步 note', note.slice(0, 12) === String(st.textContent || '').slice(0, 12), String(st.textContent).slice(0, 30));
  view.destroy();
}
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
