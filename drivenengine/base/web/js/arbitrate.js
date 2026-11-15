/**
 * arbitrate.js -- 三层结论仲裁（D3）
 *
 * 优先级：③ 手工指定（1.0） > ② 运行时堆图（≥0.85 采信） > ① AST 静态（兜底）
 * 冲突策略：② 能推翻 ①（内存事实优先于文本推测），但要标注来源以便用户复核。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  /** shape（运行时的形态词） → dsCatalog 模板 id */
  const SHAPE2TPL = {
    list: 'proto-list',
    clist: 'proto-list',
    btree: 'proto-bitree',
    mway: 'btree',
    graph: 'algraph',
    cross: 'sparsematrix',
    seq: 'proto-seq',
    seq2d: 'mgraph',
    unknown: null,
  };

  /**
   * @param {string} name 变量名
   * @param {object|null} astItem ①的结果（detect.js 的一项）
   * @param {object|null} rtItem  ②的结果（shape.js 的 byVar[name]）
   * @param {object|null} manual  ③的结果（avc.track[name]）
   */
  function arbitrate(name, astItem, rtItem, manual) {
    if (manual && (manual.id || manual.renderer)) {
      return {
        name,
        templateId: manual.id || null,
        renderer: manual.renderer || 'linkView',
        conf: 1.0,
        source: 'manual',
        why: '用户在跟踪设置中手工指定',
        evidence: null,
      };
    }

    let rt = null;
    if (rtItem) {
      const tplId = rtItem.templateId || SHAPE2TPL[rtItem.shape] || null;
      const tpl = tplId && AVC.dsCatalog ? AVC.dsCatalog.byId(tplId) : null;
      if (tpl || tplId) {
        rt = {
          name,
          templateId: tplId,
          renderer: (tpl && tpl.renderer) || 'linkView',
          conf: rtItem.conf || 0.8,
          source: 'runtime',
          why: (rtItem.evidence && rtItem.evidence.reason) || ('运行时判定为 ' + rtItem.shape),
          evidence: rtItem.evidence || null,
        };
      }
    }

    const ast = astItem ? {
      name,
      templateId: astItem.templateId || null,
      renderer: astItem.renderer || 'linkView',
      conf: astItem.conf || 0.6,
      source: 'ast',
      why: astItem.why || '源码类型/写法匹配',
      evidence: { line: astItem.line, text: astItem.text },
    } : null;

    if (rt && ast) {
      if (rt.templateId === ast.templateId) {
        return Object.assign({}, rt, {
          conf: Math.min(0.99, Math.max(rt.conf, ast.conf) + 0.05),
          source: 'ast+runtime',
          why: '静态与运行时一致：' + rt.why,
        });
      }
      if ((rt.conf || 0) < 0.85) {
        return Object.assign({}, ast, { source: 'ast', why: (ast.why || '') + '（运行时判据不足，采用静态）' });
      }
      return Object.assign({}, rt, {
        source: 'runtime(override ast)',
        why: rt.why + '；与静态推测（' + (ast.templateId || '?') + '）不一致，已按内存事实采信运行时',
        conflict: { ast: ast.templateId, runtime: rt.templateId },
      });
    }
    if (rt && rt.conf >= 0.85) return rt;
    if (ast && rt) return Object.assign({}, ast, { source: 'ast', why: ast.why + '（运行时判据不足，采用静态）' });
    if (ast) return ast;
    if (rt) return rt;
    return { name, templateId: null, renderer: null, conf: 0, source: 'none', why: '未识别，请在跟踪设置里指定' };
  }

  /** 批量仲裁：把 detect 结果、shape 结果、手工设置合并成每变量一个结论 */
  function arbitrateAll(astItems, shapeResult, manualMap) {
    manualMap = manualMap || {};
    const byName = {};
    (astItems || []).forEach(it => {
      if (!it.name) return;
      byName[it.name] = byName[it.name] || {};
      if (!byName[it.name].ast || it.conf > byName[it.name].ast.conf) byName[it.name].ast = it;
    });
    const rt = (shapeResult && shapeResult.byVar) || {};
    for (const k in rt) {
      byName[k] = byName[k] || {};
      byName[k].runtime = rt[k];
    }
    for (const k in manualMap) {
      byName[k] = byName[k] || {};
      byName[k].manual = manualMap[k];
    }
    const out = [];
    for (const name in byName) {
      out.push(arbitrate(name, byName[name].ast, byName[name].runtime, byName[name].manual));
    }
    const order = { manual: 0, 'ast+runtime': 1, runtime: 2, 'runtime(override ast)': 3, ast: 4, none: 5 };
    out.sort((a, b) => (order[a.source] - order[b.source]) || (b.conf - a.conf));
    return out;
  }

  /** 来源徽标（给 UI 用） */
  function badge(source) {
    switch (source) {
      case 'manual': return { text: '手选', color: '#1a7f37' };
      case 'ast+runtime': return { text: '静态+运行时', color: '#1f6feb' };
      case 'runtime': return { text: '运行时', color: '#8250df' };
      case 'runtime(override ast)': return { text: '运行时(已修正静态)', color: '#bf3989' };
      case 'ast': return { text: '静态', color: '#9a6700' };
      default: return { text: '未识别', color: '#7b8794' };
    }
  }

  AVC.arbitrate = { arbitrate, arbitrateAll, badge, SHAPE2TPL };
})(typeof window !== 'undefined' ? window : globalThis);
