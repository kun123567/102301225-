/**
 * tools/driven-audit.mjs -- "这个可视化是不是真的由接口/策略驱动？"（v2：按角色责任分档）
 *
 * v1 只用"扰动后能不能自愈"一刀切，把**本该由渲染器负责的结构**（结点/边/格的位置）
 * 也算成"硬编码"，导致结论失真。v2 改成读 `ROLE_CLASS` 分档做不同实验：
 *
 *   annotation（标注：气泡/徽标/边标签/区间框）
 *       实验：把它挪到别的图元身上 → polish 必须自己摆开
 *       （`mark`/`markLabel` 判"是否重新贴回它圈的那一格"，因为它本来就该压着格框）
 *   reserve（标题/轴字母）
 *       实验：把一个气泡挪到标题身上 → polish 必须把**气泡**让开（标题本身不必移动）
 *   structure（结点/边/格）
 *       渲染器职责，不判定（只统计"有没有 tidy 接管"）
 *
 * 自愈率 < 20% 且属于 annotation/reserve ⇒ **该可视化仍靠渲染器写死的位置**。
 *
 * 用法：node tools/driven-audit.mjs [--pkgs C,D,E,F|all] [--verbose]
 */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const argv = process.argv.slice(2);
const pkgsArg = (() => { const i = argv.indexOf('--pkgs'); return i >= 0 ? argv[i + 1] : 'C,D,E,F'; })();
const VERBOSE = argv.includes('--verbose');
const WANT = pkgsArg === 'all' ? null : new Set(pkgsArg.split(',').map((s) => s.trim().toUpperCase()));

const { ITEMS } = await import(pathToFileURL(join(ROOT, 'vendor/catalog/index.js')).href);
const { dispatch } = await import(pathToFileURL(join(ROOT, 'vendor/engine/dispatch.js')).href);
const { polishLayout } = await import(pathToFileURL(join(ROOT, 'app/canvas-stage.js')).href);
const { roleOfPrim, profileOf, primBox, overlapRatio, ROLE_CLASS } = await import(pathToFileURL(join(ROOT, 'app/layout-policy.js')).href);

const RECT = { x: 0, y: 0, w: 685, h: 300 };
const EPS = 0.15;

const PASS_OWNS = {
  mark: ['mark', 'markLabel', 'anchor'],
  tidy: ['node', 'nodeBox', 'nodeLabel', 'nodeValue', 'edge', 'edgeTag'],
  badge: ['badge'],
  float: ['pointer', 'connector'],
  header: ['header', 'axisLabel'],
};
const ownersOf = (role) => Object.keys(PASS_OWNS).filter((ps) => PASS_OWNS[ps].includes(role));

const stats = new Map();
const defaultOwn = new Map();     // ${style}| -> 未扰动时被策略改过坐标的层数 / 层数
/** 默认位置归属：未扰动的一帧里，polish 有没有改过它（改过=策略掌默认，没改=渲染器掌默认） */
const itemGaps = new Map();
const bump = (style, role, covered, healed) => {
  const k = style + '|' + role;
  const s = stats.get(k) || { style, role, trials: 0, healed: 0, covered: false, cls: ROLE_CLASS[role] || '?' };
  s.trials += 1;
  s.healed += healed ? 1 : 0;
  s.covered = s.covered || covered;
  stats.set(k, s);
};
const markGap = (uid, what) => {
  if (!itemGaps.has(uid)) itemGaps.set(uid, new Set());
  itemGaps.get(uid).add(what);
};

const boxOf = (p, P) => primBox(p, P);
const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const shift = (p, dx, dy) => {
  if (p.kind === 'circle') { p.cx += dx; p.cy += dy; }
  else if (p.kind === 'line') { p.x1 += dx; p.y1 += dy; p.x2 += dx; p.y2 += dy; }
  else if (p.kind === 'poly') { for (const q of p.pts) { q[0] += dx; q[1] += dy; } }
  else { p.x += dx; p.y += dy; }
};
const cloneList = (raw) => raw.map((p) => ({ ...p, meta: p.meta ? { ...p.meta } : p.meta, pts: p.pts ? p.pts.map((q) => [...q]) : p.pts }));

/** 最坏重叠比（排除"自己属于同一 owner"的情况由调用方决定） */
function worstOverlap(list, target, P, ignore = new Set()) {
  const tb = primBox(target, P);
  if (!tb) return 0;
  let worst = 0;
  for (const q of list) {
    if (q === target || ignore.has(q)) continue;
    if (!['text', 'chip', 'circle', 'rect'].includes(q.kind)) continue;
    const qb = primBox(q, P);
    if (!qb) continue;
    const r = overlapRatio(tb, qb);
    // 与策略同口径：框只算"半压边框"（整个装进框里 = 贴着格子当徽标，是允许的画法）
    const counted = q.kind === 'rect' ? (r > EPS && r <= (P.containOk || 0.85)) : r > EPS;
    if (counted && r > worst) worst = r;
  }
  return worst;
}

let layersSeen = 0;
for (const it of ITEMS) {
  const pkg = String(it.uid).split('/')[0].toUpperCase();
  if (WANT && !WANT.has(pkg)) continue;
  let mod;
  try { mod = await import(pathToFileURL(join(ROOT, 'vendor', it.path)).href); } catch { continue; }
  const input = (mod.samples?.[0] || {}).input || {};
  for (const v of it.variants || []) {
    let trace;
    try { trace = mod.run(v.id, input); } catch { continue; }
    for (const st of (trace.steps || []).slice(0, 10)) {
      for (const layer of st.layers || []) {
        const style = layer.style;
        const prof = profileOf(style);
        const P = prof.policy;
        let raw;
        try { raw = dispatch(style).instance.layout(layer, RECT, { bg: '#fff' }).prims || []; } catch { continue; }
        layersSeen += 1;

        // 无人为扰动的一帧：看 polish 会不会改这些标注的坐标
        const base = cloneList(raw);
        polishLayout(base, RECT, style, layer);
        const defaultMoved = new Map();
        raw.forEach((p, i) => {
          const hit = roleOfPrim(p, style);
          if (!hit) return;
          const a = p; const b = base[i];
          const ax = a.kind === 'circle' ? a.cx : a.x; const ay = a.kind === 'circle' ? a.cy : a.y;
          const bx = b.kind === 'circle' ? b.cx : b.x; const by = b.kind === 'circle' ? b.cy : b.y;
          if (typeof ax !== 'number' || typeof bx !== 'number') return;
          if (Math.abs(ax - bx) > 0.5 || Math.abs(ay - by) > 0.5) defaultMoved.set(hit.role, (defaultMoved.get(hit.role) || 0) + 1);
        });
        for (const [role, n] of defaultMoved) {
          const k = style + '|' + role;
          const d = defaultOwn.get(k) || { style, role, movedLayers: 0, layers: 0 };
          d.movedLayers += n > 0 ? 1 : 0;
          d.layers += 1;
          defaultOwn.set(k, d);
        }
        const byRole = new Map();
        for (const p of raw) {
          const hit = roleOfPrim(p, style);
          if (!hit) continue;
          if (!byRole.has(hit.role)) byRole.set(hit.role, []);
          if (byRole.get(hit.role).length < 2) byRole.get(hit.role).push(p);
        }

        for (const [role, prims] of byRole) {
          const cls = ROLE_CLASS[role] || 'structure';
          if (cls === 'structure') continue;                        // 渲染器职责，不判定
          const covered = ownersOf(role).some((ps) => (prof.passes || []).includes(ps));

          if (cls === 'annotation') {
            for (const target of prims) {
              const list = cloneList(raw);
              const t = list[raw.indexOf(target)];
              const tb = boxOf(t, P);
              if (!tb) continue;
              const tc = center(tb);
              // ① 区间框/标签：挪到画布远角，期望被"贴回"它圈住的格子
              if (role === 'mark' || role === 'markLabel') {
                shift(t, RECT.x + 40 - tc.x, RECT.y + 30 - tc.y);
                polishLayout(list, RECT, style, layer);
                const tb2 = boxOf(t, P);
                // 判定：重新落在某个 anchor（格容器）的边上/正下方
                const anchors = list.filter((q) => q !== t && (roleOfPrim(q, style) || {}).role === 'anchor');
                const ok = role === 'mark'
                  ? anchors.some((a) => { const ab = boxOf(a, P); return ab && Math.abs(tb2.y - ab.y) < 3 && Math.abs(tb2.h - ab.h) < 3; })
                  : Math.abs(tb2.y - (RECT.y + 30)) > 3;              // 至少没留在角落
                bump(style, role, covered, ok);
                if (!ok) markGap(it.uid, role + '@s' + style);
                continue;
              }
              // ② 气泡/徽标/边标签：挪到最近图元身上
              let victim = null;
              let bestD = Infinity;
              for (const q of list) {
                if (q === t) continue;
                if (!['text', 'chip', 'circle', 'rect'].includes(q.kind)) continue;
                const qb = boxOf(q, P);
                if (!qb) continue;
                const d = Math.abs(center(qb).x - tc.x) + Math.abs(center(qb).y - tc.y);
                if (d < bestD) { bestD = d; victim = q; }
              }
              if (!victim) continue;
              const vc = center(boxOf(victim, P));
              shift(t, vc.x - tc.x, vc.y - tc.y);
              const before = worstOverlap(list, t, P);
              if (before <= EPS) continue;
              polishLayout(list, RECT, style, layer);
              const after = worstOverlap(list, t, P);
              let ok = after <= EPS;
              // 区间的"徽标"类：允许它压住自己 owner 的结点框（badge 贴着结点是正常）
              if (!ok && role === 'badge') {
                const owner = roleOfPrim({ key: t.key, kind: t.kind }, style);
                void owner;
              }
              bump(style, role, covered, ok);
              if (!ok) markGap(it.uid, role + '@s' + style);
            }
          } else if (cls === 'reserve') {
            // 把气泡挪到标题/轴字母身上 → 期望气泡被让开
            const floats = raw.filter((p) => (roleOfPrim(p, style) || {}).role === 'pointer');
            if (!floats.length) continue;
            for (const head of prims) {
              const list = cloneList(raw);
              const t = list[raw.indexOf(floats[0])];
              const tb = boxOf(t, P);
              const hb = boxOf(list[raw.indexOf(head)], P);
              if (!tb || !hb) continue;
              const tc = center(tb);
              const hc = center(hb);
              shift(t, hc.x - tc.x, hc.y - tc.y);
              polishLayout(list, RECT, style, layer);
              const after = worstOverlap(list, t, P, new Set([list[raw.indexOf(head)]]));
              const stillOnHead = overlapRatio(boxOf(t, P), primBox(list[raw.indexOf(head)], P)) > EPS;
              const ok = !stillOnHead;
              bump(style, role, covered, ok);
              if (!ok) markGap(it.uid, role + '@s' + style);
              void after;
            }
          }
        }
      }
    }
  }
}

const rows = [...stats.values()].sort((a, b) => a.style - b.style || a.role.localeCompare(b.role));
console.log(`=== 驱动性审计 v2（包：${pkgsArg}，扫描 ${layersSeen} 层）===`);
console.log('分档：annotation=必须由策略摆；reserve=策略要给"让位"；structure=渲染器职责（不判）\n');
console.log('档位         style 角色         样本  owner pass  自愈率   默认位置归属     结论');
for (const r of rows) {
  const rate = r.trials ? r.healed / r.trials : 0;
  const verdict = rate < 0.2 ? '✗ 位置仍写死在渲染器' : rate < 0.8 ? '△ 部分依赖策略' : '✓ 策略驱动';
  const d = defaultOwn.get(r.style + '|' + r.role);
  const defOwner = d ? (d.movedLayers > 0 ? '策略 ' + d.movedLayers + '/' + d.layers + '层' : '渲染器 ' + d.layers + '层未动') : '—';
  console.log('  ' + r.cls.padEnd(10) + String(r.style).padStart(3) + '   ' + r.role.padEnd(11) +
    String(r.trials).padStart(4) + '   ' + (r.covered ? '有' : '无').padEnd(9) +
    (rate * 100).toFixed(0).padStart(4) + '%   ' + defOwner.padEnd(16) + verdict);
}

const hard = rows.filter((r) => r.trials && r.healed / r.trials < 0.2);
console.log(`\n=== 仍"硬编码"（annotation/reserve 且自愈率<20%）: ${hard.length} 组 ===`);
for (const r of hard) console.log(`  style ${r.style} ${r.role} (${r.cls})  样本 ${r.trials}  owner: ${ownersOf(r.role).join('/') || '—'}  链: ${profileOf(r.style).passes.join('→')}`);

if (itemGaps.size) {
  const byPkg = new Map();
  for (const [uid, roles] of itemGaps) {
    const pkg = uid.split('/')[0].toUpperCase();
    if (!byPkg.has(pkg)) byPkg.set(pkg, []);
    byPkg.get(pkg).push({ uid, roles: [...roles].sort() });
  }
  console.log('\n=== 受影响的案例 ===');
  for (const pkg of [...byPkg.keys()].sort()) {
    console.log(`--- ${pkg} 类 ---`);
    for (const r of byPkg.get(pkg).sort((a, b) => a.uid.localeCompare(b.uid))) console.log(`  ${r.uid.padEnd(32)} ${r.roles.join(' ')}`);
  }
}
if (VERBOSE) {
  console.log('\n明细：');
  for (const r of rows) console.log(`  ${r.style}|${r.role} ${r.healed}/${r.trials} covered=${r.covered}`);
}
process.exit(hard.length ? 1 : 0);
