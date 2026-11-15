import { join } from "node:path";
import { pathToFileURL } from "node:url";
const HOST = "D:\\.FZU\\03Software\\04\\raw\\datastructure-agent\\frontend";
function makeEl(tag) {
  const el = { tagName: String(tag || "div").toUpperCase(), className: "", textContent: "", dataset: {}, style: {}, attributes: {}, childNodes: [],
    classList: { _s: new Set(), add(...c){c.forEach(x=>this._s.add(x));}, remove(...c){c.forEach(x=>this._s.delete(x));}, toggle(c,on){on?this._s.add(c):this._s.delete(c);}, contains(c){return this._s.has(c);} },
    setAttribute(k,v){ this.attributes[k]=String(v); if(k==="class"){ this.className=String(v); for(const c of String(v).split(/\s+/).filter(Boolean)) this.classList.add(c);} },
    getAttribute(k){ return this.attributes[k] ?? null; }, removeAttribute(k){ delete this.attributes[k]; },
    appendChild(c){ this.childNodes.push(c); c.parentNode=this; return c; }, append(...cs){ cs.forEach(c=>this.appendChild(c)); },
    prepend(...cs){ cs.reverse().forEach(c=>this.childNodes.unshift(c)); }, replaceChildren(...cs){ this.childNodes=[]; cs.forEach(c=>this.appendChild(c)); },
    removeChild(c){ const i=this.childNodes.indexOf(c); if(i>=0)this.childNodes.splice(i,1); return c; }, remove(){ if(this.parentNode)this.parentNode.removeChild(this); },
    querySelector(){ return null; }, querySelectorAll(){ return []; }, addEventListener(){}, removeEventListener(){},
    getBoundingClientRect(){ return { x:0,y:0,left:0,top:0,width:900,height:320,right:900,bottom:320 }; },
    animate(){ return { cancel(){}, finished: Promise.resolve() }; }, width:900, height:320,
  };
  return el;
}
globalThis.window = globalThis; globalThis.devicePixelRatio = 1;
globalThis.location = { href: "http://127.0.0.1/", search: "" };
globalThis.document = { body: makeEl("body"), createElement:(t)=>makeEl(t), createElementNS:(ns,t)=>makeEl(t), querySelector:()=>null, querySelectorAll:()=>[], getElementById:()=>null, addEventListener(){} };
globalThis.ResizeObserver = class { observe(){} disconnect(){} };
globalThis.CustomEvent = class { constructor(t,o){ this.type=t; this.detail=o&&o.detail; } };
globalThis.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){} });

const { buildPlusRun, createPlusView } = await import(pathToFileURL(join(HOST, "src/features/visualization/ext/plus-bridge.js")).href);
for (const id of ["plus:c/multiway-merge", "plus:e/sparse-matrix-transpose"]) {
  const run = await buildPlusRun(id, "v1");
  console.log("---", id, "structure:", run.structure, "style:", run.style, "steps:", run.steps.length);
  const layers0 = (run.rawSteps[0] && run.rawSteps[0].layers) || [];
  console.log("   first step layers:", layers0.map(l => l.id + ":s" + l.style + ":" + JSON.stringify(Object.keys(l.data||{}).slice(0,4))).join(" | "));
  const host = makeEl("div"); host.clientWidth = 900;
  const view = createPlusView(host, run, { explainContainer: null });
  view.showStep(run.steps[0], { stepIndex: 0 });
  const walk = (n, d=0, out=[]) => { for (const c of n.childNodes||[]) { out.push("  ".repeat(d) + (c.tagName||"?") + " [" + (c.className||"") + "]" + (c.textContent ? " “"+String(c.textContent).slice(0,60)+"”" : "")); walk(c, d+1, out); } return out; };
  console.log(walk(host).slice(0, 12).join("\n"));
}
