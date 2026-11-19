/**
 * 数据结构样式换算（界面「数据结构 / 样式」下拉的实现）
 *
 * 需求：界面里要能切换**数据结构**（进而切换渲染器）而不换算法。
 * 做法：把任意图层归一成一份"中间表示"（canonical），再按目标 style 重新造图层。
 * 换算是有损的（数组没有指针、树没有顺序），所以：
 *   · 每次换算都在界面上注明「已按 X → Y 换算」，不假装无损；
 *   · 算法自身的默认样式永远不会被改写，换算只发生在显示层。
 */

import { arrayLayer, matrixLayer, gridLayer, linkLayer, stackLayer, heapLayer, treeLayer, graphLayer } from '../engine/model.js';

/** 任意图层 → 中间表示 */
export function canonical(layer) {
  const d = layer.data || {};
  const roles = layer.roles || {};
  const out = { name: d.name || layer.title || '', roles, values: null, labels: null, matrix: null, chain: null, cells: null, roots: null, graph: null };

  if (Array.isArray(d.values)) {
    if (Array.isArray(d.values[0])) out.matrix = d.values;
    else {
      out.values = d.values;
      out.labels = d.labels || null;
    }
  }
  if (Array.isArray(d.tree)) {
    out.values = d.values || d.tree;
    out.labels = d.labels || null;
    out.heapTree = d.tree;
  }
  if (Array.isArray(d.cells)) out.cells = d.cells;
  if (Array.isArray(d.nodes)) {
    out.nodes = d.nodes;
    out.edges = d.edges || d.links || null;
    out.head = d.head ?? null;
    out.roots = d.roots || null;
    out.threads = d.threads || null;
    out.extraEdges = d.extraEdges || null;
    out.edgeTags = d.edgeTags || null;
  }
  if (d.triples) out.triples = d.triples;
  if (Array.isArray(d.edges) && Array.isArray(d.nodes)) out.graph = { nodes: d.nodes, edges: d.edges };
  return out;
}

const val = (v) => (v === null || v === undefined ? '·' : v);

/** 中间表示 → 目标 style 的图层 */
export function rebuild(canon, style, base = {}) {
  const { roles, name } = canon;
  const id = base.id || 'main';
  const title = base.title || name;

  if (style === 1 || style === 5) {
    if (canon.matrix) {
      const values = canon.matrix.flat();
      const labels = values.map((v, i) => `${Math.floor(i / canon.matrix[0].length)},${i % canon.matrix[0].length}`);
      return arrayLayer({ id, title, name, values, labels, roles, props: base.props });
    }
    if (canon.values) return arrayLayer({ id, title, name, values: canon.values.map(val), labels: canon.labels, roles, props: base.props });
    if (canon.cells) return arrayLayer({ id, title, name, values: canon.cells.map((c) => val(c.value)), labels: canon.cells.map((c, i) => c.label ?? String(i)), roles });
    if (canon.heapTree) return arrayLayer({ id, title, name, values: canon.heapTree.map(val), roles });
    if (canon.nodes) return arrayLayer({ id, title, name, values: canon.nodes.map((n) => val(n.value ?? n.label ?? n.id)), labels: canon.nodes.map((n) => String(n.label ?? n.id)), roles });
  }

  if (style === 6 || style === 2) {
    const mk = style === 6 ? gridLayer : matrixLayer;
    if (canon.matrix) return mk({ id, title, name, values: canon.matrix, roles });
    const flat = canon.values || canon.heapTree || (canon.cells || []).map((c) => c.value) || (canon.nodes || []).map((n) => n.value ?? n.label);
    if (flat) return mk({ id, title, name, values: [flat.map(val)], roles, colLabels: (canon.labels || []).map(String) });
  }

  if (style === 3) {
    if (canon.nodes && !canon.graph) {
      const nodes = canon.nodes.map((n) => ({ id: n.id, value: n.value ?? n.label ?? n.id, label: n.label, fields: base.fields }));
      const links = nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id }));
      return linkLayer({ id, title, name: name || 'linked list', nodes, links, head: canon.head || nodes[0]?.id, roles });
    }
    const seq = canon.values || canon.heapTree || (canon.cells || []).map((c) => c.value) || (canon.graph ? canon.graph.nodes.map((n) => n.label ?? n.id) : null);
    if (seq) {
      const nodes = seq.map((v, i) => ({ id: `n${i}`, value: val(v) }));
      const links = nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id }));
      return linkLayer({ id, title, name: name || '链式展开', nodes, links, head: nodes[0]?.id, roles: remapIndexRoles(roles, nodes) });
    }
  }

  if (style === 7) {
    const seq = canon.values || canon.heapTree || (canon.cells || []).map((c) => c.value) || (canon.nodes || []).map((n) => n.value ?? n.label);
    if (seq) {
      const cells = seq.map((v, i) => ({ value: val(v), label: canon.labels ? canon.labels[i] : String(i) }));
      const top = Math.max(0, Math.min(cells.length - 1, base.top ?? cells.length - 1));
      return stackLayer({ id, title, name: name || '栈', cells, top, capacity: Math.max(cells.length, 8), roles });
    }
  }

  if (style === 8) {
    if (canon.cells) return heapLayer({ id, title, name: name || 'heap', cells: canon.cells, tree: canon.heapTree || null, roles });
    const seq = canon.values || canon.heapTree || (canon.nodes || []).map((n) => n.value ?? n.label);
    if (seq) return heapLayer({ id, title, name: name || '堆', cells: seq.map((v, i) => ({ label: `[${i}]`, value: val(v) })), tree: seq.map(val), roles });
  }

  if (style === 9) {
    if (canon.nodes && canon.roots) {
      return treeLayer({
        id, title, name,
        nodes: canon.nodes, roots: canon.roots,
        edgeTags: canon.edgeTags, threads: canon.threads, extraEdges: canon.extraEdges, roles,
      });
    }
    // 数组 → 完全二叉树（堆的形态）；链式 → 右斜树
    const seq = canon.values || canon.heapTree || (canon.cells || []).map((c) => c.value) || (canon.nodes || []).map((n) => n.value ?? n.label);
    if (seq) {
      const nodes = seq.map((v, i) => ({ id: `t${i}`, label: val(v), left: 2 * i + 1 < seq.length ? `t${2 * i + 1}` : undefined, right: 2 * i + 2 < seq.length ? `t${2 * i + 2}` : undefined }));
      return treeLayer({ id, title, name: name || '完全二叉树形态', nodes, roots: ['t0'], roles: remapIndexRoles(roles, nodes) });
    }
    if (canon.graph) {
      const byId = new Map(canon.graph.nodes.map((n, i) => [n.id, i]));
      const nodes = canon.graph.nodes.map((n) => ({ id: n.id, label: n.label ?? n.id }));
      const roots = canon.graph.nodes.filter((n) => !canon.graph.edges.some((e) => e.to === n.id)).map((n) => n.id);
      for (const e of canon.graph.edges) {
        const p = nodes[byId.get(e.from)];
        if (p && !p.children) p.children = [];
        if (p && !p.children.includes(e.to)) p.children.push(e.to);
      }
      return treeLayer({ id, title, name, nodes, roots: roots.length ? roots : [nodes[0]?.id], roles });
    }
  }

  if (style === 10) {
    if (canon.graph) return graphLayer({ id, title, name, nodes: canon.graph.nodes, edges: canon.graph.edges, roles });
    if (canon.nodes && canon.edges) {
      const edges = canon.edges.map((e) => ({ from: e.from, to: e.to, w: e.w, state: e.state, directed: e.directed }));
      return graphLayer({ id, title, name, nodes: canon.nodes, edges, roles });
    }
    const seq = canon.values || canon.heapTree || (canon.nodes || []).map((n) => n.value ?? n.label);
    if (seq) {
      const nodes = seq.map((v, i) => ({ id: `g${i}`, label: val(v) }));
      const edges = nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id }));
      return graphLayer({ id, title, name: name || '链式图', nodes, edges, roles: remapIndexRoles(roles, nodes) });
    }
  }
  return null;
}

/** 下标型角色 → 节点 id 型角色（换算后角色不丢） */
function remapIndexRoles(roles, nodes) {
  // 角色可能写成数字 / 数组 / Set，统一宽容化：一次换算不能把整页搞崩
  const toList = (v) => (Array.isArray(v) ? v : v == null ? [] : v instanceof Set ? [...v] : [v]);
  const map = (arr) => toList(arr).map((i) => nodes[i] && nodes[i].id).filter(Boolean);
  const pointers = (roles.pointers || []).map((p) => (p.index != null && nodes[p.index] ? { ...p, node: nodes[p.index].id, index: undefined } : p));
  return { ...roles, focus1: map(roles.focus1), focus2: map(roles.focus2), done: map(roles.done), excluded: map(roles.excluded), swap: map(roles.swap), pointers };
}

/** 把一整步的所有图层换算到目标 style（保留每层原本的语义标题） */
export function adaptStepLayers(step, targetStyle, opts = {}) {
  if (!targetStyle || !step) return { layers: step.layers, converted: false };
  let converted = false;
  const layers = step.layers.map((l) => {
    if (l.style === targetStyle) return l;
    const c = canonical(l);
    const layer = rebuild(c, targetStyle, { id: l.id, title: l.title, props: opts.props });
    if (!layer) return l;
    converted = true;
    return { ...layer, props: { ...layer.props, ...(opts.props || {}) } };
  });
  return { layers, converted };
}
