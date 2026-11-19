import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
function makeEl(tag) {
  const el = { tagName: String(tag || "div").toUpperCase(), className: "", textContent: "", dataset: {}, style: {}, attributes: {}, childNodes: [],
    classList: { _s: new Set(), add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); }, contains(c) { return this._s.has(c); } },
    setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k] ?? null; }, removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 301, height: 300 }; },
  };
  return el;
}
globalThis.window = globalThis; globalThis.devicePixelRatio = 1;
globalThis.document = { body: makeEl("body"), createElement: (t) => makeEl(t), createElementNS: (ns, t) => makeEl(t) };
globalThis.matchMedia = () => ({ matches: false });
const { createStage } = await import(pathToFileURL(join(ROOT, "app/svg-stage.js")).href);
const { ITEMS } = await import(pathToFileURL(join(ROOT, "vendor/catalog/index.js")).href);
const { adaptStepLayers } = await import(pathToFileURL(join(ROOT, "vendor/app/adapt.js")).href);
let bad = 0;
for (const uid of ["b/union-find", "b/topological-sort", "f/bracket-matching", "d/avl-tree", "g/threaded-binary-tree"]) {
  const it = ITEMS.find((i) => i.uid === uid);
  const mod = await import(pathToFileURL(join(ROOT, "vendor", it.path)).href);
  const tr = mod.run("v1", (mod.samples?.[0] || {}).input || {});
  const host = makeEl("div"); host.clientWidth = 301;
  const stage = createStage(host);
  for (const [si, st] of tr.steps.entries()) {
    // 模拟"用户切画法 9"：混合原生与强制转换
    const layers = si % 2 ? adaptStepLayers(st, 9, { props: {} }).layers : st.layers;
    const m = stage.render(layers, { animate: true });
    // 等 exit 兜底计时器跑完（260ms），DOM 元素数应等于本帧图元数
    await new Promise((r) => setTimeout(r, 300));
    let domEls = 0;
    for (const card of host.childNodes) {
      const svg = card.childNodes.find((c) => c.className === "avc-svg-wrap");
      if (svg && svg.childNodes[0] && svg.childNodes[0].childNodes[0]) domEls += svg.childNodes[0].childNodes[0].childNodes.length;
    }
    if (domEls !== m.prims) { bad++; console.log("  ✗ " + uid + " step" + si + " DOM=" + domEls + " prims=" + m.prims); }
  }
}
console.log(bad === 0 ? "  ✓ 所有步：DOM 元素数 == 本帧图元数（无残留）" : "  残留 " + bad + " 步");
process.exit(bad === 0 ? 0 : 1);
