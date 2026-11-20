/**
 * vmodel.js -- 可视化数据模型层（M2，对应原版 TCustomPointObj/Fields）
 *
 * 原版契约（09_OBJECT_MODEL.md §1）：任何被画出来的东西都是
 *    "一串带 kind 与 offset 的字段项"。
 * 本模块负责把 (静态 structure + 运行时 snapshot) 变成 VObj：
 *
 *   VObj = { kind, name, offset, size, valueText, fields[], children[], meta }
 *
 * 渲染器只消费 VObj，不得直接读 events —— 这是"8 个渲染器支撑 26 种结构"的前提。
 * 纯逻辑，无 DOM。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  /* ---------------- 类型宽度（Watcom 32 位目标） ---------------- */
  const WIDTH = {
    char: 1, signed: 4, unsigned: 4, short: 2, int: 4, long: 4,
    float: 4, double: 8, void: 0, size_t: 4,
  };
  function typeWidth(typeText, isPtr) {
    if (isPtr) return 4;
    const t = String(typeText || '').replace(/\b(struct|union|enum)\b\s*/g, '').trim().toLowerCase();
    for (const k in WIDTH) if (t === k || t.startsWith(k + ' ')) return WIDTH[k];
    return 4;   // 自定义类型/未知 → 按 4 字节
  }

  /* ---------------- 结构体布局（name/offset/size） ---------------- */
  /**
   * @param {object} structure  /api/trace 返回的 structure（含 structs[].fields[]）
   * @returns {Object} tag -> { size, fields:[{name,type,offset,size,isPtr,self,isArray}] }
   */
  function structLayout(structure) {
    const out = {};
    const structs = (structure && structure.structs) || [];
    for (const s of structs) {
      let off = 0;
      const fields = [];
      for (const f of (s.fields || [])) {
        const w = typeWidth(f.type, f.isPtr);
        const align = Math.min(w, 8);
        if (off % align) off += align - (off % align);
        fields.push({
          name: f.name, type: f.type, offset: off, size: w,
          isPtr: !!f.isPtr, self: !!f.self, isArray: !!f.isArray,
          key: !f.isPtr && !f.isArray,                 // 可作"键域"（配合 keyField）
        });
        off += w;
      }
      // 结构体按最大成员对齐
      const maxAlign = fields.reduce((m, f) => Math.max(m, Math.min(f.size, 8)), 1);
      if (off % maxAlign) off += maxAlign - (off % maxAlign);
      out[s.tag] = { tag: s.tag, alias: s.alias || null, size: off, fields, shape: s.shape || null };
    }
    return out;
  }

  /* ---------------- 数组聚合：a[0..7] / m[1][2] / S.data[0]（结构体字段数组） ---------------- */
  const RE_IDX = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\[(\d+)\](?:\[(\d+)\])?$/;

  /**
   * 从快照里把"逐元素 V 事件"聚合成数组
   * @returns {Object} base -> { name, dims:[r,c?], cells:[{idx,key,name,value,kind}], kind }
   */
  function groupArrays(snapshot) {
    const out = {};
    const frames = (snapshot && snapshot.frames) || [];
    // 同名数组可能同时出现在多个栈帧里（全局数组、指针参数、递归改写同一块内存）。
    // 只取**最内层**（最后出现的）那一份；否则各帧的值会交错成一个乱序长数组，
    // 表现就是"数组窗里一堆重复/错位的数字，或者数组窗干脆显示不出来"。
    const owner = {};
    for (let fi = 0; fi < frames.length; fi++) {
      for (const v of frames[fi].vars) {
        const mm = RE_IDX.exec(v.name);
        if (mm) owner[mm[1]] = fi;
      }
    }
    for (let fi = 0; fi < frames.length; fi++) {
      const f = frames[fi];
      for (const v of f.vars) {
        const m = RE_IDX.exec(v.name);
        if (!m) continue;
        const base = m[1];
        if (owner[base] !== fi) continue;
        const i = +m[2];
        const j = m[3] == null ? null : +m[3];
        const A = out[base] || (out[base] = { name: base, kind: v.kind, dims: [], cells: [], frame: f.fn });
        if (j == null) {
          A.dims[0] = Math.max(A.dims[0] || 0, i + 1);
          A.cells.push({ i, j: null, name: v.name, value: v.value, kind: v.kind });
        } else {
          A.dims[0] = Math.max(A.dims[0] || 0, i + 1);
          A.dims[1] = Math.max(A.dims[1] || 0, j + 1);
          A.cells.push({ i, j, name: v.name, value: v.value, kind: v.kind });
        }
      }
    }
    for (const k in out) {
      out[k].cells.sort((a, b) => (a.i - b.i) || ((a.j || 0) - (b.j || 0)));
      out[k].twoD = out[k].dims.length > 1;
    }
    return out;
  }

  /* ---------------- 结构（链表/树/栈/堆/集合） ---------------- */
  const SHAPE_BY_LOGICAL = { linear: 'list', tree: 'tree', graph: 'graph', set: 'set' };

  /**
   * 把 lists 里的一个变量变成 VObj 树
   * @param {string} name
   * @param {object} snapshot session 快照
   * @param {object} structure 静态结构
   * @param {object} opts { logical:'linear'|'tree'|'graph'|'set', layout }
   */
  function objFromList(name, snapshot, structure, opts) {
    opts = opts || {};
    const L = (snapshot.lists || {})[name];
    if (!L) return null;
    const shape = L.shape || (opts.logical ? SHAPE_BY_LOGICAL[opts.logical] : 'list');
    const layout = structLayout(structure);
    const tag = findStructTagOfVar(name, structure);
    const lay = tag ? layout[tag] : null;
    const keyField = lay ? lay.fields.find(f => f.key) : null;

    const nodes = L.nodes.map(n => ({
      kind: 'node',
      name: name + '#' + n.idx,
      offset: lay ? lay.size * n.idx : 4 * n.idx,   // 结点序号×结点大小（近似）
      size: lay ? lay.size : 4,
      valueText: String(n.key),
      keyName: keyField ? keyField.name : 'key',
      fields: lay ? lay.fields.map(f => ({
        name: f.name, offset: f.offset, size: f.size, kind: f.isPtr ? 'ptr' : 'int',
        valueText: f.name === (keyField && keyField.name) ? String(n.key) : (f.isPtr ? '(ptr)' : '?'),
      })) : [],
      children: [],
      meta: { idx: n.idx, key: n.key, ptr: n.ptr, more: n.more, shape },
    }));

    // 树：按 BFS 序号还原父子（i → 2i+1 / 2i+2）
    if (shape === 'tree') {
      for (const nd of nodes) {
        const i = nd.meta.idx;
        nd.meta.left = nodes[2 * i + 1] || null;
        nd.meta.right = nodes[2 * i + 2] || null;
      }
    }

    return {
      kind: shape,
      name,
      offset: 0,
      size: lay ? lay.size : 4,
      valueText: 'count=' + (L.count || nodes.length),
      fields: [],
      children: nodes,
      meta: { count: L.count || nodes.length, shape, tag, logical: opts.logical || null },
    };
  }

  /** 变量名 → 结构体 tag（依据 structure.vars[].structTag） */
  function findStructTagOfVar(name, structure) {
    const vars = (structure && structure.vars) || [];
    const v = vars.find(x => x.name === name);
    return v ? v.structTag : null;
  }

  /* ---------------- 变量观察表（扁平） ---------------- */
  /**
   * @returns {Array} [{frame,depth,name,kind,value,addr,offset,size}]
   */
  function watchTable(snapshot, structure) {
    const layout = structLayout(structure);
    const out = [];
    for (const f of (snapshot.frames || [])) {
      for (const v of f.vars) {
        const tag = findStructTagOfVar(v.name, structure);
        const lay = tag ? layout[tag] : null;
        out.push({
          frame: f.fn, depth: f.depth,
          name: v.name, kind: v.kind, value: v.value, addr: v.addr,
          offset: 0, size: lay ? lay.size : 4,
          isAggregate: RE_IDX.test(v.name),
          structTag: tag,
        });
      }
    }
    return out;
  }

  /* ---------------- 候选可视化对象（供"跟踪设置"下拉） ---------------- */
  /**
   * 列出当前快照里"可以画"的对象，按 logical 分类标注
   * @returns {Array} [{name, category:'array'|'list'|'tree'|'stack'|'heap'|'set'|'scalar', detail}]
   */
  function candidates(snapshot, structure) {
    const arrs = groupArrays(snapshot);
    const out = [];
    for (const k in arrs) {
      const a = arrs[k];
      out.push({
        name: k,
        category: a.twoD ? 'array2' : (/^s$/.test(a.kind) ? 'string' : 'array1'),
        detail: a.twoD ? a.dims[0] + '×' + a.dims[1] : a.dims[0] + ' 个元素',
      });
    }
    for (const name in (snapshot.lists || {})) {
      const L = snapshot.lists[name];
      out.push({
        name,
        category: L.shape === 'tree' ? 'tree' : 'list',
        detail: (L.count || L.nodes.length) + ' 个结点',
      });
    }
    return out;
  }

  AVC.vmodel = {
    WIDTH, typeWidth,
    structLayout, groupArrays, objFromList, watchTable, candidates,
    findStructTagOfVar, SHAPE_BY_LOGICAL,
  };
})(typeof window !== 'undefined' ? window : globalThis);
