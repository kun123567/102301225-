/**
 * shape.js -- 运行时形状判定（D2）
 *
 * 三条输入通道，都要吃：
 *   lists[]  —— 结构体 dump 的 L/LE 事件（链表 / 二叉树，含 more 尾标记）
 *   nxm{}    —— N/NE/M 统一图模型（STL 容器、邻接表、结构体多指针 walker）
 *   frames[] —— V 事件聚合出的数组（a[i] / m[i][j]）
 *
 * 判定顺序：静态结构（structure）给"候选形状" → 运行时图统计（outDeg/inDeg/环/根数）给"事实" → 合并出结论。
 * 输出：{ [varName]: { shape, conf, evidence:{...} }, ... } + graph 汇总 + summary
 *
 * shape 取值：list / clist / btree / mway / ctree / forest / graph / cross / seq / seq2d / unknown
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  /** 环检测：结点根据 ptr 序号连成链，找重复 ptr */
  function hasCycle(nodes) {
    const seen = new Set();
    for (const n of nodes) {
      if (!n.ptr) continue;
      if (seen.has(n.ptr)) return true;
      seen.add(n.ptr);
    }
    return false;
  }

  /* ---------------- lists[] 通道（结构体 dump） ---------------- */
  function classifyList(name, L, declHint) {
    const nodes = L.nodes || [];
    const n = nodes.length;
    if (n === 0) return { shape: 'unknown', conf: 0, evidence: { nodes: 0, reason: '空结构' } };
    if (n === 1) return { shape: L.shape === 'tree' ? 'btree' : 'list', conf: 0.6, evidence: { nodes: 1, reason: '单结点，判据不足' } };

    const cyc = hasCycle(nodes);
    const shape = L.shape || 'list';

    // 树：dump 已按 BFS 序号给出（2i+1 / 2i+2）
    if (shape === 'tree') {
      let levels = 0;
      for (const x of nodes) levels = Math.max(levels, Math.floor(Math.log2(x.idx + 1)) + 1);
      const full = n === (1 << levels) - 1;
      return {
        shape: 'btree',
        conf: cyc ? 0.55 : 0.92,
        evidence: { nodes: n, levels, full, cycle: cyc, reason: full ? '满二叉树（BFS 序号连续）' : '二叉树（BFS 序号跳空）' },
      };
    }

    // 链：outDeg 由 more 位推
    let out1 = 0, out0 = 0;
    for (const x of nodes) { if (x.more) out1++; else out0++; }
    if (cyc) {
      return { shape: 'clist', conf: 0.88, evidence: { nodes: n, cycle: true, reason: 'ptr 出现重复 → 有环' } };
    }
    if (out0 !== 1) {
      return { shape: 'list', conf: 0.6, evidence: { nodes: n, tails: out0, reason: '尾结点数异常（可能未走完或已断开）' } };
    }
    return { shape: 'list', conf: 0.9, evidence: { nodes: n, tails: out0, cycle: false, reason: 'outDeg≤1 且唯一尾结点' } };
  }

  /* ---------------- 静态结构提示：变量属于哪种结构体 ---------------- */
  function structHintOf(varName, structure) {
    const vars = (structure && structure.vars) || [];
    const v = vars.find(x => x.name === varName);
    if (!v || !v.structTag) return null;
    const st = ((structure && structure.structs) || []).find(s => s.tag === v.structTag);
    if (!st) return null;
    const fields = st.fields || [];
    const has = (re) => fields.some(f => re.test(String(f.name || '').toLowerCase()));
    const selfArr = fields.filter(f => f.isPtr && f.self && f.isArray);
    return {
      tag: v.structTag,
      fields,
      multiPtr: selfArr.length > 0,                                   // ptr[] / child[]：多叉
      binary: has(/^(left|lchild|llink)$/) && has(/^(right|rchild|rlink)$/),  // 二叉（单/双孩子都算）
      childSibling: has(/^firstchild$/) && has(/^nextsibling$/),       // 孩子-兄弟
      cross: has(/^right$/) && has(/^down$/),
      color: has(/^color$/),
      thread: has(/^ltag$/) || has(/^rtag$/),
      parentPtr: has(/^(parent|pa|p)$/),
    };
  }

  /* ---------------- nxm 通道（N/NE/M 统一图模型） ---------------- */
  /**
   * @param {Array} events ['N',var,idx,value] / ['NE',var,from,to,kind] / ['M',var,'k=v;k=v']
   */
  function classifyGraph(varName, events, structure) {
    const G = AVC.graph;
    if (!G) return null;
    const g = G.fromEvents(events, varName, 'graph');
    const n = g.nodes.length;
    const e = g.edges.length;
    const s = g.stats || {};
    const hint = structHintOf(varName, structure);
    if (!n) return { shape: 'unknown', conf: 0, evidence: { nodes: 0, reason: '空结构' } };

    // 纯 N 序列（vector<int>/queue/stack 的采集结果）→ 线性序列
    if (!e) {
      return { shape: 'seq', conf: 0.78, evidence: { nodes: n, edges: 0, reason: '只有结点、没有边 → 线性序列（容器内容）' } };
    }

    // ① 静态结构优先：孩子-兄弟 / 十字链 / 多叉子指针数组
    if (hint && hint.childSibling) {
      return { shape: 'ctree', conf: 0.9, evidence: { nodes: n, edges: e, maxOut: s.maxOut, reason: '结构体含 firstchild + nextsibling → 孩子-兄弟表示（森林）' } };
    }
    if (hint && hint.cross) {
      return { shape: 'cross', conf: 0.9, evidence: { nodes: n, edges: e, reason: '结构体含 right + down → 十字链表' } };
    }
    if (hint && hint.multiPtr) {
      return { shape: 'mway', conf: 0.9, evidence: { nodes: n, edges: e, maxOut: s.maxOut, reason: '结构体含子指针数组（ptr[]/child[]）→ 多叉树' } };
    }
    // 二叉结构（left+right）：出度可能是 0/1/2，纯统计分不出"只有一个孩子的二叉树"和"链",
    // 必须靠静态字段模式兜住 —— 这是 ①层给 ②层的 hint，不是猜。
    if (hint && hint.binary) {
      const kind = hint.color ? '红黑树（color 角标）' : (hint.thread ? '线索二叉树（ltag 角标）' : '普通二叉树');
      return { shape: 'btree', conf: 0.9, evidence: { nodes: n, edges: e, maxOut: s.maxOut, reason: '结构体含 left + right → ' + kind } };
    }

    // ② 纯图统计
    if ((s.maxOut || 0) >= 3) {
      return { shape: 'mway', conf: 0.86, evidence: { nodes: n, edges: e, maxOut: s.maxOut, reason: '最大出度 ≥3 → 多叉树/图' } };
    }
    if (s.cyclic) {
      if ((s.maxOut || 0) <= 1) {
        return { shape: 'clist', conf: 0.86, evidence: { nodes: n, edges: e, cycle: true, reason: '出度 ≤1 且有环 → 循环链表' } };
      }
      return { shape: 'graph', conf: 0.86, evidence: { nodes: n, edges: e, cycle: true, maxOut: s.maxOut, reason: '有环且出度 >1 → 图' } };
    }
    const roots = (s.roots || []).length;
    if ((s.maxOut || 0) === 2 && roots === 1) {
      return { shape: 'btree', conf: 0.9, evidence: { nodes: n, edges: e, levels: 0, reason: '唯一根 + 出度 2 + 无环 → 二叉树' } };
    }
    if (roots > 1) {
      return { shape: 'graph', conf: 0.85, evidence: { nodes: n, edges: e, roots, reason: '多个入度 0 的根 → 图（或森林）' } };
    }
    return { shape: 'list', conf: 0.88, evidence: { nodes: n, edges: e, tails: roots, reason: '唯一根 + 出度 ≤1 + 无环 → 单链表' } };
  }

  /* ---------------- 数组通道 ---------------- */
  function classifyArray(arr) {
    if (!arr) return null;
    // 双亲数组（parent[] / fa[]）→ 森林（并查集的物理形态）
    const forest = parentForestOf(arr);
    if (forest) return forest;

    if (arr.twoD) {
      const nonzero = (arr.cells || []).filter(c => parseFloat(c.value) !== 0).length;
      const total = (arr.cells || []).length;
      const sparse = total > 0 && nonzero / total < 0.5;
      return {
        shape: sparse ? 'cross' : 'seq2d',
        conf: 0.8,
        evidence: { dims: arr.dims, nonzero, total, reason: sparse ? '非零元 < 50%（疑似稀疏矩阵）' : '二维数组' },
      };
    }
    return { shape: 'seq', conf: 0.75, evidence: { dims: arr.dims, reason: '一维数组' } };
  }

  /** 数组像不像"双亲表示"：名字像 + 值全是合法下标 → 判 forest */
  function parentForestOf(arr) {
    if (!arr || arr.twoD || !/^(fa|father|parent|uf|ufa|pa)$/i.test(arr.name || '')) return null;
    const vals = (arr.cells || []).map(c => parseInt(c.value, 10)).filter(v => !isNaN(v));
    if (vals.length < 2) return null;
    const n = vals.length;
    const inRange = vals.every(v => v >= -1 && v < n);
    if (!inRange) return null;
    const roots = vals.filter((v, i) => v === i || v === -1).length;
    return {
      shape: 'forest', conf: 0.85,
      evidence: { dims: arr.dims, nodes: n, roots, reason: 'parent[] 每个值都是合法父下标（' + roots + ' 个根）→ 双亲表示 / 并查集森林' },
    };
  }

  /** parent[] → 森林模型（供 treeView.renderForest 用） */
  function parentToForest(snap, varName, structure) {
    const arrs = AVC.vmodel ? AVC.vmodel.groupArrays(snap) : {};
    const arr = arrs[varName];
    if (!arr) return null;
    const vals = (arr.cells || []).map(c => ({ i: c.i, v: parseInt(c.value, 10) }));
    const n = vals.length;
    const parent = new Array(n).fill(-1);
    for (const x of vals) if (x.i < n) parent[x.i] = isNaN(x.v) ? -1 : x.v;
    const nodes = [];
    for (let i = 0; i < n; i++) nodes.push({ idx: i, value: String(arr.cells.find(c => c.i === i).value), meta: { idx: i, parent: parent[i] } });
    const children = nodes.map(() => []);
    const roots = [];
    for (let i = 0; i < n; i++) {
      const p = parent[i];
      if (p === i || p === -1 || p >= n) roots.push(nodes[i]);
      else children[p].push(nodes[i]);
    }
    return { var: varName, kind: 'forest', nodes, roots, children, depth: forestDepth(parent, n) };
  }
  function forestDepth(parent, n) {
    let max = 0;
    for (let i = 0; i < n; i++) {
      let d = 0, cur = i, guard = 0;
      while (parent[cur] != null && parent[cur] !== cur && parent[cur] >= 0 && guard++ < n) { cur = parent[cur]; d++; }
      max = Math.max(max, d + 1);
    }
    return max;
  }

  /* ---------------- 零入度集合（拓扑排序语义） ---------------- */
  /**
   * 从快照里的入度数组找出"入度为 0 的顶点集合"（拓扑排序每一轮的可选集合）
   * @param {object} snap 会话快照
   * @param {string|object} which 数组名（缺省猜 indeg/inDegree/deg）
   * @returns {{name:string, zeros:Array<number>, all:Array<object>}|null}
   */
  function zeroInDegree(snap, which) {
    const arrs = AVC.vmodel ? AVC.vmodel.groupArrays(snap || {}) : {};
    const name = typeof which === 'string' ? which
      : (Object.keys(arrs).find(k => /^(indeg|indegree|degree|in)$/i.test(k)) || null);
    const arr = name ? arrs[name] : null;
    if (!arr) return null;
    const all = (arr.cells || []).map(c => ({ vertex: c.i, indeg: parseInt(c.value, 10) }));
    const zeros = all.filter(x => x.indeg === 0).map(x => x.vertex);
    return { name, zeros, all, reason: '入度为 0 的顶点：' + (zeros.join(',') || '（无）') };
  }

  /**
   * 对一个快照做整体判定
   * @param {object} snap session.snapshotAt() 结果
   * @param {object} structure 静态结构（用于取 structTag / 字段模式）
   * @returns {object} { byVar: {name:{shape,conf,evidence}}, graph:{nodes,edges,cycle}, summary }
   */
  function analyze(snap, structure) {
    const byVar = {};
    if (!snap) return { byVar, graph: { nodes: 0, edges: 0, cycle: false }, summary: 'no snapshot' };

    let nodeCnt = 0, edgeCnt = 0, anyCycle = false;

    for (const name in (snap.lists || {})) {
      const L = snap.lists[name];
      const r = classifyList(name, L);
      byVar[name] = r;
      nodeCnt += L.nodes.length;
      edgeCnt += L.nodes.filter(x => x.more).length;
      if (r.evidence && r.evidence.cycle) anyCycle = true;
    }

    // N/NE/M 通道（STL 容器 / 邻接表 / 多指针 walker）
    for (const name in (snap.nxm || {})) {
      const A = snap.nxm[name];
      if (!A || !A.length) continue;
      const r = classifyGraph(name, A, structure);
      if (!r) continue;
      if (!byVar[name] || (byVar[name].conf || 0) < r.conf) byVar[name] = r;
      const ns = A.filter(x => x[0] === 'N').length;
      const es = A.filter(x => x[0] === 'NE' || x[0] === 'E').length;
      nodeCnt += ns; edgeCnt += es;
      if (r.evidence && r.evidence.cycle) anyCycle = true;
    }

    // 数组类（V 事件聚合）
    const arrs = AVC.vmodel ? AVC.vmodel.groupArrays(snap) : {};
    for (const k in arrs) {
      const r = classifyArray(arrs[k]);
      if (r && !byVar[k]) byVar[k] = r;
    }

    // 只有堆块、没有可判定结构 → graph / unknown
    if (!Object.keys(byVar).length && snap.heap && snap.heap.length) {
      const used = snap.heap.filter(h => h.state === 'used');
      byVar['<heap>'] = {
        shape: used.length > 2 ? 'graph' : 'unknown',
        conf: 0.4,
        evidence: { blocks: snap.heap.length, used: used.length, reason: '只看到堆块，未见指针链' },
      };
    }

    return {
      byVar,
      graph: { nodes: nodeCnt, edges: edgeCnt, cycle: anyCycle },
      summary: nodeCnt ? ('图：' + nodeCnt + ' 结点 / ' + edgeCnt + ' 边' + (anyCycle ? ' / 含环' : '')) : '无可判定的指针图',
    };
  }

  AVC.shape = {
    analyze, classifyList, classifyGraph, classifyArray, hasCycle,
    parentToForest, parentForestOf, zeroInDegree, structHintOf, forestDepth,
  };
})(typeof window !== 'undefined' ? window : globalThis);
