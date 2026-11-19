/**
 * tools/annotation-interface-test.mjs -- 验证"标注是带接口的结构"
 *
 * 标注（气泡/徽标）有三个来源，**优先级从高到低**：
 *   ① 图元上带 `meta: { role, id, target, anchor, priority }`   ← 渲染器接口
 *   ② 算法层 `layer.annotations = [{ id, kind, target, text, anchor, priority }]`
 *      （渲染器没画就由 synthesizeAnnotations 补出来）            ← 算法接口
 *   ③ 键名约定（`ptr-*` / `nb-*` …）+ registerProfile            ← 老渲染器兼容
 *
 * 这里断言：①② 两条路径**完全不需要**键名约定、也不需要注册 profile 就能被正确摆放；
 * ③ 仍然照旧（现有 9 个渲染器不受影响）。
 *
 * 用法：node tools/annotation-interface-test.mjs
 */
import { polishLayout } from '../app/canvas-stage.js';
import { ANNOTATION_KINDS, normalizeRole, profileOf } from '../app/layout-policy.js';

const RECT = { x: 0, y: 0, w: 900, h: 320 };
let pass = 0;
let fail = 0;
const ok = (s, cond, extra) => {
  if (cond) { pass += 1; console.log('  ✓ ' + s); }
  else { fail += 1; console.log('  ✗ ' + s + (extra ? '  → ' + extra : '')); }
};
const chipOf = (list, text) => list.find((p) => p.kind === 'chip' && p.text === text);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ============================================================ ① 渲染器接口：meta ========= */
console.log('\n① 渲染器用 meta 声明（键名完全陌生、style 未注册）');
{
  // 结点用 key 'v1'，标签 'l1' —— 不符合任何键名约定
  const node = { kind: 'circle', key: 'v1', cx: 400, cy: 120, r: 18, fill: '#fff', stroke: '#333', meta: { role: 'node', id: 'v1' } };
  const label = { kind: 'text', key: 'l1', x: 400, y: 120, text: 'A', font: '600 12px sans-serif', fill: '#111', meta: { role: 'label', id: 'v1' } };
  // 气泡：key 'whatever'，靠 meta 说明"我是标在 v1 右侧的指针"
  const pin = {
    kind: 'chip', key: 'whatever', x: 400, y: 120, text: 'p', size: 11, fill: '#dfd', stroke: '#3a3',
    meta: { role: 'pointer', id: 'p', target: 'v1', anchor: 'right', priority: 5 },
  };
  const list = [node, label, pin];
  polishLayout(list, RECT, 7777);                      // 7 谁也没注册过
  const p = chipOf(list, 'p');
  ok('气泡被认出来并离开了结点中心', dist(p, { x: node.cx, y: node.cy }) > 25, `dist=${Math.round(dist(p, { x: node.cx, y: node.cy }))}`);
  ok('落在了声明的"右侧"方向', p.x > node.cx + 18 && Math.abs(p.y - node.cy) < 6, `chip=${Math.round(p.x)},${Math.round(p.y)} node=${node.cx},${node.cy}`);
  ok('气泡不压结点圆', Math.hypot(p.x - node.cx, p.y - node.cy) >= node.r + 10);
  ok('meta.role 同义词归一（pill→pointer / caption→header）', normalizeRole('pill') === ANNOTATION_KINDS.POINTER && normalizeRole('caption') === ANNOTATION_KINDS.HEADER);
}

/* ============================================================ ② 算法接口：layer.annotations ========= */
console.log('\n② 算法声明 layer.annotations（渲染器只画了结点，一个标注都没画）');
{
  const prims = [
    { kind: 'circle', key: 'v1', cx: 200, cy: 140, r: 18, fill: '#fff', stroke: '#333', meta: { role: 'node', id: 'v1' } },
    { kind: 'circle', key: 'v2', cx: 400, cy: 140, r: 18, fill: '#fff', stroke: '#333', meta: { role: 'node', id: 'v2' } },
    { kind: 'line', key: 'l', x1: 218, y1: 140, x2: 382, y2: 140, stroke: '#bbb', meta: { role: 'edge', id: 'e1' } },
  ];
  const layer = {
    id: 'demo',
    style: 7777,
    annotations: [
      { id: 'cur', kind: 'pointer', target: 'v2', text: 'cur', anchor: 'right', priority: 9 },
      { id: 'prev', kind: 'pointer', target: 'v1', text: 'prev', anchor: 'left' },
      { id: 'flag', kind: 'badge', target: 'v2', text: '访问过' },
    ],
  };
  polishLayout(prims, RECT, 7777, layer);
  const cur = chipOf(prims, 'cur');
  const prev = chipOf(prims, 'prev');
  const flag = chipOf(prims, '访问过');
  ok('三个标注都被补成了图元', !!(cur && prev && flag), `cur=${!!cur} prev=${!!prev} flag=${!!flag}`);
  ok('cur 挂在 v2 右侧', cur && cur.x > 400 + 18 && Math.abs(cur.y - 140) < 8, cur && `chip=${Math.round(cur.x)},${Math.round(cur.y)}`);
  ok('prev 挂在 v1 左侧', prev && prev.x < 200 - 18 && Math.abs(prev.y - 140) < 8, prev && `chip=${Math.round(prev.x)},${Math.round(prev.y)}`);
  ok('优先级高的先占位（cur 在最贴近 v2 的位置）', cur && Math.abs(cur.x - 400) <= Math.abs((prev ? prev.x : 0) - 200) + 40);
  ok('徽标不压自己的结点', flag && Math.hypot(flag.x - 400, flag.y - 140) >= 18 + 8, flag && `d=${Math.round(Math.hypot(flag.x - 400, flag.y - 140))}`);
  // 幂等：再跑一次不应重复补
  const before = prims.length;
  polishLayout(prims, RECT, 7777, layer);
  ok('重复渲染不会重复补标注（幂等）', prims.length === before, `before=${before} after=${prims.length}`);
}

/* ============================================================ ③ 兼容：老键名 + profile ========= */
console.log('\n③ 老渲染器（键名约定）仍然照旧');
{
  ok('style 9 仍走 tidy→…→float', profileOf(9).passes.includes('tidy') && profileOf(9).passes.includes('float'), profileOf(9).passes.join(','));
  ok('未注册 style 只认 meta（explicitOnly），不猜键名', profileOf(4242).explicitOnly === true);
  const prims = [
    { kind: 'chip', key: 'ptr-lo', x: 100, y: 40, text: 'lo', size: 11, fill: '#ddf', stroke: '#55a' },
    { kind: 'chip', key: 'ptr-hi', x: 100, y: 40, text: 'hi', size: 11, fill: '#ddf', stroke: '#55a' },
    { kind: 'rect', key: 'cell-0', x: 60, y: 60, w: 80, h: 40 },
  ];
  polishLayout(prims, RECT, 1);                        // style 1 = 老键名约定
  const a = chipOf(prims, 'lo');
  const b = chipOf(prims, 'hi');
  ok('同格两个气泡被摊开（键名路径）', Math.abs(a.x - b.x) > 20, `dx=${Math.round(Math.abs(a.x - b.x))}`);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
