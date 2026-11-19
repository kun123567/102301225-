/**
 * layout-policy.js -- 图元"角色约定 + 排布策略"（本项目里**唯一**允许写死键名与数字的地方）
 *
 * ## 为什么要有这一层
 *
 * polish 做的是"对渲染器产出的图元做坐标后处理"。如果键名（`nv-` / `nb-` / `cell-` / `range-label`…）
 * 和偏移量（-16 / 22 / 46 / 70 / 0.6 格…）散落在各个函数里，那就只有这 9 个渲染器能吃到效果：
 * 将来接入新的"数据结构 × 算法"组合，渲染器换了图元命名，polish 就完全失效，只能回来改代码。
 *
 * 所以这里把两类东西**集中声明**，让 polish 全部由"角色"驱动：
 *
 *   ① `ROLES`  —— 键名 → 语义（结点 / 结点标签 / 值 / 徽标 / 边 / 边标签 / 浮动标注 / 连接线 /
 *                  格容器 / 标注框 / 标注标签 / 轴标签 / 标题 / 装饰）
 *   ② `POLICY` —— 数字（间距、换行步长、搜索半径、行距、留白、权重…）
 *
 * ## 新渲染器怎么接
 *
 *   · **符合约定**（键名是 `n-<id>` / `nv-<id>` / `nb-<id>` / `ptr-<id>` 这种）→ 零配置，
 *     默认策略就会替它摆气泡；
 *   · **命名不同** → 注册一份 profile（纯数据，不动代码），例如：
 *
 *     import { registerProfile } from './layout-policy.js';
 *     registerProfile(11, {
 *       roles: { node: /^vertex-(.+)$/, nodeLabel: /^vlabel-(.+)$/, badge: /^vtag-(.+)$/ },
 *       passes: ['tidy', 'float'],
 *     });
 *
 *   之后 style 11 的层就会自动走"树的整理 + 气泡摆位"，与现有 9 个渲染器同一套算法。
 */

/* ============================================================ ① 角色约定 ========= */

/**
 * 标注的**规范角色名**（接口的一部分）。三个来源都可以用这几个词，互不知道对方怎么实现：
 *   · 算法：`layer.annotations = [{ id, kind, target, text, anchor, priority }]`
 *           （声明式；渲染器没画的话由 `synthesizeAnnotations()` 补出来）
 *   · 渲染器：`P.chip(key, x, y, text, { meta: { role: 'pointer', target: 'n3', anchor: 'right' } })`
 *   · 老渲染器：什么都不写 → 退回下面的 `ROLES` 键名约定（向后兼容）
 */
export const ANNOTATION_KINDS = Object.freeze({
  NODE: 'node', NODE_BOX: 'nodeBox', NODE_LABEL: 'nodeLabel', NODE_VALUE: 'nodeValue',
  BADGE: 'badge', EDGE: 'edge', EDGE_TAG: 'edgeTag',
  POINTER: 'pointer', ANCHOR: 'anchor', DECORATION: 'decoration', HEADER: 'header', MARK: 'mark',
});

/** meta.role 的写法归一（'label' / 'pin' / 'chip' 都认） */
const META_ROLE_ALIAS = {
  node: ANNOTATION_KINDS.NODE, circle: ANNOTATION_KINDS.NODE, vertex: ANNOTATION_KINDS.NODE,
  nodebox: ANNOTATION_KINDS.NODE_BOX, box: ANNOTATION_KINDS.NODE_BOX, frame: ANNOTATION_KINDS.NODE_BOX,
  label: ANNOTATION_KINDS.NODE_LABEL, nodelabel: ANNOTATION_KINDS.NODE_LABEL,
  value: ANNOTATION_KINDS.NODE_VALUE, nodevalue: ANNOTATION_KINDS.NODE_VALUE,
  badge: ANNOTATION_KINDS.BADGE, tag: ANNOTATION_KINDS.EDGE_TAG, edgetag: ANNOTATION_KINDS.EDGE_TAG,
  edge: ANNOTATION_KINDS.EDGE, link: ANNOTATION_KINDS.EDGE,
  pointer: ANNOTATION_KINDS.POINTER, pin: ANNOTATION_KINDS.POINTER, chip: ANNOTATION_KINDS.POINTER, pill: ANNOTATION_KINDS.POINTER, bubble: ANNOTATION_KINDS.POINTER,
  anchor: ANNOTATION_KINDS.ANCHOR, cell: ANNOTATION_KINDS.ANCHOR,
  decoration: ANNOTATION_KINDS.DECORATION, deco: ANNOTATION_KINDS.DECORATION,
  header: ANNOTATION_KINDS.HEADER, title: ANNOTATION_KINDS.HEADER, caption: ANNOTATION_KINDS.HEADER, heading: ANNOTATION_KINDS.HEADER,
  mark: ANNOTATION_KINDS.MARK, range: ANNOTATION_KINDS.MARK,
};

export function normalizeRole(role) {
  if (!role) return null;
  const k = String(role).toLowerCase().replace(/[-_\s]/g, '');
  return META_ROLE_ALIAS[k] || null;
}

/**
 * 角色的**责任分档**（接口的一部分，审计与文档都读它）
 *
 *   annotation —— 人加的标注（气泡/徽标/边标签/区间框）：**必须**由策略摆，位置不能写死在渲染器里
 *   reserve    —— 标题/轴字母：渲染器画它在角落即可，但策略要**替它留出干净区域**（别让标注压上去）
 *   structure  —— 结点/边/格：**渲染器负责**（那是 06 复原目标）；策略只在 tidy 类风格里接管
 */
export const ROLE_CLASS = Object.freeze({
  badge: 'annotation', pointer: 'annotation', edgeTag: 'annotation', mark: 'annotation', markLabel: 'annotation',
  header: 'reserve', axisLabel: 'reserve',
  node: 'structure', nodeBox: 'structure', nodeLabel: 'structure', nodeValue: 'structure', edge: 'structure', anchor: 'structure',
});
export const ROLES = {
  node: /^n-(.+)$/,                 // 结点本体（circle）
  nodeBox: /^nfill-(.+)$/,         // 结点本体（方框表示，如链表结点）
  nodeLabel: /^nv-(.+)$/,           // 结点里的字
  nodeValue: /^nval-(.+)$/,         // 结点下方的小字（h=3 / #1 …）
  badge: /^nb-(.+)$/,               // 结点上方的徽标气泡
  edge: /^(e|x|th)-(.+)$/,          // 边（父子 / 线索 / 新增）
  edgeTag: /^et-(.+)$/,             // 边上的标签（L / R / 权重…）
  floatChip: null,                  // 浮动标注：默认"所有 chip 都是"（新渲染器零配置即生效）
  connector: /^ptr-line-(.+)$/,     // 浮动标注的指示线
  anchor: /^cell-(.+)$/,            // 格容器（一维数组、栈、堆的单元）
  markBox: /^range$/,               // 标注框（区间框）
  markLabel: /^range-label$/,       // 标注框的文字
  axisLabel: /^axis-[xy]-label$/,   // 坐标轴字母
  headerText: /^(name|depth|legend|mode|empty|tl|treelabel|cap)$/,   // 所有标题/图例类（避让权重高）
  titleTop: /^(name|depth|legend|mode|empty|tl|cap)$/,           // 顶部标题（内容让位以它为准）
  decoration: /^dot-/,              // 装饰点（点在框线上，不算压叠）
  movableText: null,                // 默认只挪 chip；需要时可在 profile 里放开某些文字
};

/* ============================================================ ② 排布策略 ========= */

const basePolicy = () => ({
  eps: 0.15,                        // 交集 / 较小面积 超过这个比例才算"压叠"
  containOk: 0.85,                  // 装进框里超过这个比例算正常（贴着格子的徽标）
  header: { band: 30, pad: 4, weight: 3, minTitlePx: 10 },   // minTitlePx：标题缩字的下限（宁缩小不删字）
  chip: { pad: 14, sizeFallback: 11, charRatio: 0.58 },
  cluster: { radius: 40, gap: 46, gapPad: 10, rowStep: 22 },
  search: { limit: 170, dySteps: [14, 28, 42, 56, 70], dxUnits: [0, 1, 1.6, 2.6] },
  mark: { radiusCap: 10, labelGap: 66 },
  float: { edgeClearance: 4 },      // 气泡与线（边/连线）的最小间隙：压线要算碰撞
  /* 线索虚线（`th-*`）与树边实线挤在一起时的处理：距离 < touch 就沿法向弯出去 bow。
     中序线索化里 "C 的左链指向前驱 A" 恰好和 A→C 这条树边连同一对结点，
     不弯开就变成"虚线压在实线上"，看不出哪条是线索。 */
  thread: { touch: 7, bow: 13 },
  exitRetain: 0,                    // 消失图元的 DOM 保留时长（0 = 立即删；>0 才播淡出，见 anim.css）
  tidy: {
    singleChildShift: 0.6,          // 单孩子：父结点朝孩子反侧偏的"格数"
    minSep: 18,                     // 同层最小间距（叠加在两个半径之上）
    gapX: { min: 20, max: 70 },
    levelGap: { pad: 110, min: 50, max: 110 },
    top: 62,                        // 第一层的 y
    sideRoom: 40,                   // 画布左右为气泡预留
    tagOffset: 13,                  // 边标签离边的法向距离
    tagAt: [0.5, 0.34, 0.66],       // 边标签沿边的位置
    valueGap: 11,                   // 结点值文字离圆底的距离
    badgeGap: 16,                   // 徽标离圆顶的距离
  },
});

/** 各 style 用哪些 pass、要不要覆盖默认策略（**纯数据**，新增渲染器只需往这里加一行或 registerProfile） */
const PROFILES = new Map();

export function registerProfile(style, patch = {}) {
  const cur = PROFILES.get(style) || {};
  const next = {
    ...cur,
    ...patch,
    roles: { ...ROLES, ...(cur.roles || {}), ...(patch.roles || {}) },
    policy: { ...basePolicy(), ...(cur.policy || {}), ...(patch.policy || {}) },
    passes: patch.passes || cur.passes || ['float'],
  };
  PROFILES.set(style, next);
  return next;
}

/** 取某个 style 的 profile；没注册过的 style 也有一份"默认可跑"的（只做气泡摆位） */
export function profileOf(style) {
  if (PROFILES.has(style)) return PROFILES.get(style);
  // 未注册的 style：**只认 meta 显式声明**（不猜键名），所以 float pass 照跑，explicitOnly 打开
  return { roles: { ...ROLES }, policy: basePolicy(), passes: ['float', 'badge'], registered: false, explicitOnly: true };
}

/* 现有 9 个渲染器：只用声明式配置描述"谁需要哪些 pass"，没有逻辑分支 */
/* 各渲染器的"结构级键名"补登记（纯数据；不改它们的画法，只是让排版层看得见） */
// style 2 / 6（二维表格）：g-* 是格子框，ch-/rh- 是表头框
registerProfile(2, { passes: ['float'], roles: { anchor: /^g-(.+)$/ } });
registerProfile(6, { passes: ['mark', 'header', 'float'], roles: { anchor: /^g-(.+)$/ } });
// style 3（链表）：结点是方框 nfill-*；徽标 nb-* 是 text（badge 角色已不限定 chip）
registerProfile(3, { passes: ['header', 'float', 'badge'], roles: { nodeBox: /^nfill-(.+)$/, connector: /^(?:ptr-line|head-line)-(.+)$/ } });   // badge：链表结点的'答案/标记'也交给策略摆
// style 8（栈/堆）：堆模式里还有一棵树 tn-* / te-*
registerProfile(8, { passes: ['float', 'header', 'float'], roles: { node: /^tn-(.+)$/, edge: /^te-(.+)$/ } });
// style 10（图）：结点下方子标签 ns-*
registerProfile(10, { passes: ['float', 'badge'], roles: { nodeValue: /^ns-(.+)$/ } });
registerProfile(1, { passes: ['mark', 'header', 'float'] });
registerProfile(2, { passes: ['float'] });
registerProfile(5, { passes: ['mark', 'header', 'float'] });
registerProfile(6, { passes: ['mark', 'header', 'float'] });
registerProfile(7, { passes: ['float', 'header', 'float'] });   // 先摆气泡：能塞进格子就不必整体下移
registerProfile(8, { passes: ['float', 'header', 'float'] });
registerProfile(9, { passes: ['tidy', 'header', 'float', 'badge', 'float'] });   // 顺序有讲究：先整理→顶部让位→气泡摆位→徽标收尾
registerProfile(10, { passes: ['float', 'badge'] });

/* ============================================================ ③ 几何工具 ========= */

/** 文本宽度估算：CJK / 全角按整字号，其余按 charRatio 字号 */
export function textW(s, size, policy) {
  const z = size || (policy && policy.chip.sizeFallback) || 11;
  const ratio = (policy && policy.chip.charRatio) || 0.58;
  let w = 0;
  for (const ch of String(s ?? '')) w += /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? z : z * ratio;
  return w;
}

export function chipBox(p, policy) {
  const pad = (policy && policy.chip.pad) || 14;
  const w = textW(p.text, p.size || (policy && policy.chip.sizeFallback) || 11, policy) + pad;
  const h = (p.size || 11) + 10;
  return { x: p.x - w / 2, y: p.y - h / 2, w, h };
}

export function fontSize(p) {
  const m = String(p.font || '').match(/(\d+(?:\.\d+)?)px/);
  return m ? Number(m[1]) : 11;
}

export function primBox(p, policy) {
  if (!p) return null;
  if (p.kind === 'circle') return { x: p.cx - p.r, y: p.cy - p.r, w: 2 * p.r, h: 2 * p.r };
  if (p.kind === 'chip') return chipBox(p, policy);
  if (p.kind === 'rect') return { x: p.x, y: p.y, w: p.w, h: p.h };
  if (p.kind === 'line') {
    return { x: Math.min(p.x1, p.x2), y: Math.min(p.y1, p.y2), w: Math.abs(p.x2 - p.x1) || 1, h: Math.abs(p.y2 - p.y1) || 1 };
  }
  if (p.kind === 'poly' && Array.isArray(p.pts)) {
    const xs = p.pts.map((q) => q[0]);
    const ys = p.pts.map((q) => q[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) || 1, h: Math.max(...ys) - Math.min(...ys) || 1 };
  }
  if (p.kind === 'text') {
    const size = fontSize(p);
    const w = textW(p.text, size, policy);
    const align = p.align || 'center';
    const x = align === 'left' ? p.x : align === 'right' ? p.x - w : p.x - w / 2;
    return { x, y: p.y - size / 2, w, h: size + 2 };
  }
  return null;
}

export function overlapRatio(a, b) {
  if (!a || !b) return 0;
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const min = Math.min(a.w * a.h, b.w * b.h);
  return min > 0 ? (w * h) / min : 0;
}

export function hits(a, b, policy) {
  const eps = (policy && policy.eps) || 0.15;
  return overlapRatio(a, b) > eps;
}

export function translate(p, dx, dy) {
  if (!p) return p;
  if (p.kind === 'rect' || p.kind === 'text' || p.kind === 'chip') { p.x += dx; p.y += dy; }
  else if (p.kind === 'circle') { p.cx += dx; p.cy += dy; }
  else if (p.kind === 'line') { p.x1 += dx; p.y1 += dy; p.x2 += dx; p.y2 += dy; }
  else if (p.kind === 'poly' && Array.isArray(p.pts)) { for (const q of p.pts) { q[0] += dx; q[1] += dy; } }
  return p;
}

/* ============================================================ ③.5 标注接口 ========= */

/** 各类标注的默认外观（渲染器/算法都可以覆盖） */
const ANNOTATION_LOOK = {
  pointer: { fill: '#e7f1fd', stroke: '#0b5cad', color: '#0b5cad', size: 11 },
  badge: { fill: '#eee9ff', stroke: '#5b46b8', color: '#3f2f93', size: 10 },
  note: { fill: '#fff7e0', stroke: '#a86b00', color: '#7a4d00', size: 10 },
};

/**
 * synthesizeAnnotations -- 把**算法层声明的标注**补成图元（接口的"声明式"那一半）
 *
 * 契约（`layer.annotations[]`）：
 *   { id: string,                 // 唯一 id（用于去重与连线）
 *     kind?: 'pointer'|'badge'|'note',   // 默认 pointer
 *     target: string|number,      // 指向的结点 id / 格子 id
 *     text?: string,              // 气泡上写的字（缺省用 id）
 *     anchor?: 'above'|'below'|'left'|'right'|'inside',  // 期望方位（软约束）
 *     priority?: number,          // 越大越先占位（默认 0）
 *     fill?/stroke?/color?/size?: 覆盖外观 }
 *
 * 幂等：渲染器已经画过同 id 的图元（带 meta.id 或 key 后缀 = id）就跳过。
 * @returns {Array} 新补出来的图元（同时已 append 到 prims）
 */
export function synthesizeAnnotations(layer, prims, rect) {
  const anns = layer && Array.isArray(layer.annotations) ? layer.annotations : null;
  if (!anns || !anns.length) return [];
  const seen = new Set();
  for (const p of prims) {
    const id = (p.meta && p.meta.id) || null;
    if (id) seen.add(String(id));
    const k = String(p.key || '');
    const m = /^(?:ptr|nb|pin|badge)-(.+)$/.exec(k);
    if (m) seen.add(m[1]);
  }
  const out = [];
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  anns.forEach((a, i) => {
    if (!a) return;
    const id = a.id != null ? String(a.id) : 'ann' + i;
    if (seen.has(id)) return;
    const kind = String(a.kind || 'pointer');
    const look = ANNOTATION_LOOK[kind] || ANNOTATION_LOOK.pointer;
    const prim = {
      kind: 'chip',
      key: (kind === 'badge' ? 'nb-' : 'ptr-') + id,
      x: a.x != null ? a.x : cx,
      y: a.y != null ? a.y : cy,
      text: a.text != null ? String(a.text) : id,
      size: a.size || look.size,
      fill: a.fill || look.fill,
      stroke: a.stroke || look.stroke,
      color: a.color || look.color,
      opacity: 1,
      z: 4,
      meta: { role: kind === 'badge' ? ANNOTATION_KINDS.BADGE : ANNOTATION_KINDS.POINTER, id, target: a.target, anchor: a.anchor, priority: a.priority },
    };
    prims.push(prim);
    out.push(prim);
    seen.add(id);
  });
  return out;
}
/* ============================================================ ④ 角色识别 ========= */

/**
 * classify -- 把一层图元按"角色"分组
 *
 * 只依赖 profile.roles 与几何，不认识任何具体渲染器：
 *   nodes     Map(id → {id, body, label, value, badge})
 *   edges     [{kind, from, to, prim}]
 *   tags      Map(childId → prim)
 *   floats    [{prim, ownerId, connector}]      ← 浮动标注（气泡）+ 它的指示线
 *   anchors   [{prim, id}]                      ← 格容器
 *   marks     [{box, label}]                    ← 标注框（区间框）与其文字
 *   axisLabels/headers/decos
 *   ink       参与压叠计算的图元（不含装饰点）
 */
/**
 * roleOfPrim -- **唯一识别入口**：一个图元是什么角色？
 *
 * 顺序（也是优先级）：meta.role → profile.roles 键名约定 → 通用规则（`<id>-line` 连线、chip 兜底）
 * 排版层（classify）和审计工具（tools/hardcode-audit.mjs）都调它，避免两边判断不一致。
 *
 * @returns {{role:string, id:string}|null}  id 是"挂到谁身上"（部件类）或自身 id（结构类）
 */
export function roleOfPrim(p, style, opt = {}) {
  if (!p) return null;
  const prof = profileOf(style);
  const R = prof.roles || ROLES;
  const k = String(p.key || '');
  const metaRole = normalizeRole(p.meta && p.meta.role);
  const metaId = (p.meta && (p.meta.id || p.meta.node)) || null;
  const metaTarget = p.meta && p.meta.target != null ? String(p.meta.target) : null;
  if (metaRole) return { role: metaRole, id: metaTarget || metaId || k, self: metaId || k };
  if (opt.metaOnly) return null;                       // 未注册 style：只认 meta

  const hit = (re, kind) => {
    if (!re || (kind && p.kind !== kind)) return null;
    const m = re.exec(k);
    return m ? m[m.length - 1] : null;
  };
  let id;
  if ((id = hit(R.node, 'circle'))) return { role: 'node', id };
  if ((id = hit(R.nodeBox, 'rect'))) return { role: 'nodeBox', id };
  if ((id = hit(R.nodeValue, 'text'))) return { role: 'nodeValue', id };
  if ((id = hit(R.nodeLabel, 'text'))) return { role: 'nodeLabel', id };
  if ((id = hit(R.badge))) return { role: 'badge', id };            // 徽标不限 chip（有的画成 text）
  if (hit(R.markLabel, 'text')) return { role: 'markLabel', id: k };
  if (hit(R.axisLabel, 'text')) return { role: 'axisLabel', id: k };
  if (hit(R.headerText, 'text')) return { role: 'header', id: k };
  if (hit(R.decoration)) return { role: 'decoration', id: k };
  if ((id = hit(R.connector, 'line'))) return { role: 'connector', id };
  if (p.kind === 'line' && /^(.+)-line$/.test(k)) return { role: 'connector', id: /^(.+)-line$/.exec(k)[1] };
  if (R.edge && p.kind === 'line') {
    const m = R.edge.exec(k);
    if (m) {
      const g = m.slice(1);
      // 两个捕获组时第一组是边类型（e/x/th…），一个捕获组时一律当树边
      return { role: 'edge', id: g[g.length - 1], kind: g.length >= 2 ? g[0] : 'e', from: p.meta && p.meta.from, to: p.meta && p.meta.to };
    }
  }
  if ((id = hit(R.edgeTag, 'text'))) return { role: 'edgeTag', id };
  if (hit(R.markBox, 'rect')) return { role: 'mark', id: k };
  if ((id = hit(R.anchor, 'rect'))) return { role: 'anchor', id };
  if (p.kind === 'chip' && (!R.floatChip || R.floatChip.test(k))) return { role: 'pointer', id: k };
  if (hit(R.movableText, 'text')) return { role: 'pointer', id: k };
  return null;
}
export function classify(prims, rect, style, layer) {
  const profile = profileOf(style);
  const R = profile.roles;
  const P = profile.policy;
  const list = (prims || []).filter(Boolean);
  // 算法层可以直接声明标注（渲染器没画就补出来）
  if (layer) synthesizeAnnotations(layer, list, rect);
  const role = (re, kind, prim) => {
    if (!re) return null;
    if (kind && prim.kind !== kind) return null;
    const m = re.exec(prim.key || '');
    return m ? m : null;
  };
  /** 取最后一个捕获组当 id/路径（profile 里可以写 /^link-(.+)$/ 这种单组正则） */
  const idOf = (m) => m[m.length - 1];

  const nodes = new Map();
  const ensure = (id) => {
    let n = nodes.get(id);
    if (!n) { n = { id }; nodes.set(id, n); }
    return n;
  };
  const edges = [];
  const tags = new Map();
  const connectors = new Map();
  const floatPrims = [];
  const anchors = [];
  const marks = [];
  const axisLabels = [];
  const headers = [];
  const decos = [];

  // —— 第 1 遍：**唯一识别入口 `roleOfPrim()`**（meta → 角色表 → 通用规则）
  //    审计工具也用同一个函数，避免"代码认识、审计说没认识"这种两套判断。
  const explicitOnly = !!profile.explicitOnly;
  for (const p of list) {
    const hit = roleOfPrim(p, style, { metaOnly: explicitOnly });
    if (!hit) continue;
    const k = p.key || '';
    switch (hit.role) {
      case 'node': ensure(hit.id).body = p; break;
      case 'nodeBox': ensure(hit.id).box = p; break;
      case 'nodeLabel': ensure(hit.id).label = p; break;
      case 'nodeValue': ensure(hit.id).value = p; break;
      case 'badge': ensure(hit.id).badge = p; break;
      case 'decoration': decos.push(p); break;
      case 'header': headers.push(p); break;
      case 'axisLabel': axisLabels.push(p); break;
      case 'markLabel': break;                                  // 等 marks 汇总
      case 'anchor': anchors.push({ prim: p, id: hit.id }); break;
      case 'connector': connectors.set(hit.id, p); break;
      case 'pointer': if (!floatPrims.includes(p)) floatPrims.push(p); break;
      default: break;
    }
    void k;
  }
  // 未被角色吃掉的 chip 一律当浮动标注（渲染器的"标注类"图元多为 chip，这是最稳的兜底）
  // 但**未注册的 style 不这么做**：那时只认 meta 显式声明，绝不猜（不瞎挪别人的图元）
  for (const p of explicitOnly ? [] : list) {
    if (p.kind === 'chip' && !floatPrims.includes(p) && ![...nodes.values()].some((n) => n.badge === p)) floatPrims.push(p);
  }

  // —— 第 2 遍：边与边标签（同样走 roleOfPrim；端点按"已知结点 id"反查切点，id 里可能带 '-'）
  const ids = new Set([...nodes.entries()].filter(([, n]) => n.body || n.box).map(([id]) => id));
  for (const p of list) {
    const hit = roleOfPrim(p, style, { metaOnly: explicitOnly });
    if (!hit) continue;
    if (hit.role === 'edge') {
      if (hit.from && hit.to && ids.has(String(hit.from)) && ids.has(String(hit.to))) {
        edges.push({ kind: hit.kind || 'e', from: String(hit.from), to: String(hit.to), prim: p });
        continue;
      }
      const rest = String(hit.id || '');
      for (let i = 1; i < rest.length - 1; i++) {
        if (rest[i] !== '-') continue;
        const a = rest.slice(0, i);
        const b = rest.slice(i + 1);
        if (ids.has(a) && ids.has(b)) { edges.push({ kind: hit.kind || 'e', from: a, to: b, prim: p }); break; }
      }
    } else if (hit.role === 'edgeTag' && ids.has(hit.id)) {
      tags.set(hit.id, p);
    }
  }

  // —— 标注框 + 它的文字
  const markBox = explicitOnly ? null : list.find((p) => role(R.markBox, 'rect', p));
  const markLabel = list.find((p) => role(R.markLabel, 'text', p));
  if (markBox || markLabel) marks.push({ box: markBox, label: markLabel });

  // —— 标题兜底：没被角色认出、但坐落在画布顶部带里的左对齐文字（新渲染器常见）
  const band = rect.y + (P.header.band || 30);
  for (const p of list) {
    if (p.kind !== 'text' || headers.includes(p)) continue;
    if ([...nodes.values()].some((n) => n.label === p || n.value === p)) continue;
    if ([...tags.values()].includes(p) || axisLabels.includes(p) || p === markLabel) continue;
    const b = primBox(p, P);
    if (b && b.y + b.h <= band && (p.align === 'left' || b.x < rect.x + rect.w * 0.5)) headers.push(p);
  }

  // —— 浮动标注归属：**先看指示线指向哪里**（线头落在哪个结点/格子上），其次才看"正上/正下方最近"
  //    归属决定两件事：① 同归属的气泡要摊开；② 换位时相对"锚"来给候选位置。
  //    注意不能拿气泡自己的 id 当归属（`ptr-lo` 和 `ptr-hi` 指向同一格却是两个 id）。
  const floats = floatPrims.map((p) => ({
    prim: p, ownerId: null, ownerKey: null, anchorPoint: null, connector: null,
    // 接口部分：meta 里声明了目标/方位/优先级就直接用，不再猜
    prefer: (p.meta && p.meta.anchor) || null,
    priority: (p.meta && p.meta.priority) || 0,
    declared: !!(p.meta && (p.meta.target != null || p.meta.anchor)),   // 声明式：必须落到声明方位
  }));
  const byIdKey = (p) => String(p.key || '').replace(/^[a-z-]+?-(?=\d|[a-z])/, '');
  const boxOfOwner = (id) => {
    const n = nodes.get(id);
    if (n && n.body) return primBox(n.body, P);
    if (n && n.box) return primBox(n.box, P);
    const a = anchors.find((x) => x.id === id);
    return a ? primBox(a.prim, P) : null;
  };
  const nearOwner = (pt) => {
    let best = null;
    for (const id of [...ids, ...anchors.map((a) => a.id)]) {
      const b = boxOfOwner(id);
      if (!b) continue;
      const dx = Math.max(0, Math.max(b.x - pt.x, pt.x - (b.x + b.w)));
      const dy = Math.max(0, Math.max(b.y - pt.y, pt.y - (b.y + b.h)));
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { id, d };
    }
    return best && best.d <= 14 ? best.id : null;
  };
  for (const f of floats) {
    const meta = f.prim.meta || {};
    if (meta.target != null && boxOfOwner(String(meta.target))) {   // ① 渲染器/算法直接给了 target
      f.ownerId = String(meta.target);
      f.ownerKey = f.ownerId;
      continue;
    }
    const pid = f.prim.key || '';
    for (const [cid, line] of connectors) {
      if (pid.endsWith('-' + cid) || pid.replace(/^[a-z]+-/, '') === cid) { f.connector = line; break; }
    }
    if (f.connector) {
      const cb = primBox(f.prim, P);
      const cxm = cb.x + cb.w / 2;
      const cym = cb.y + cb.h / 2;
      const d1 = Math.hypot(f.connector.x1 - cxm, f.connector.y1 - cym);
      const d2 = Math.hypot(f.connector.x2 - cxm, f.connector.y2 - cym);
      const far = d2 >= d1 ? { x: f.connector.x2, y: f.connector.y2 } : { x: f.connector.x1, y: f.connector.y1 };
      f.anchorPoint = far;
      f.ownerId = nearOwner(far);
      f.ownerKey = f.ownerId || ('pt:' + Math.round(far.x) + ',' + Math.round(far.y));
    }
    if (!f.ownerId) {
      const cb = primBox(f.prim, P);
      let best = null;
      const consider = (id, box) => {
        if (!box) return;
        const dx = Math.abs((box.x + box.w / 2) - (cb.x + cb.w / 2));
        const dy = Math.abs((box.y + box.h / 2) - (cb.y + cb.h / 2));
        const score = dx * 2 + dy;
        if (!best || score < best.score) best = { id, score, dx };
      };
      for (const [id, n] of nodes) consider(id, n.body ? primBox(n.body, P) : null);
      for (const a of anchors) consider(a.id, primBox(a.prim, P));
      if (best && best.dx < 60) { f.ownerId = best.id; f.ownerKey = f.ownerKey || best.id; }
    }
  }

  const ink = list.filter((p) => ['text', 'chip', 'circle', 'rect'].includes(p.kind) && !decos.includes(p));
  return { list, nodes, ids, edges, tags, floats, connectors, anchors, marks, axisLabels, headers, decos, ink, profile, role: byIdKey, rect };
}
