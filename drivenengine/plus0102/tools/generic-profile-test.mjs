/**
 * tools/generic-profile-test.mjs -- 证明"排版不依赖具体渲染器"
 *
 * 造一层**完全陌生命名**的图元（结点叫 vertex-*、标签叫 vlabel-*、徽标叫 vtag-*、边叫 link-*、
 * 边标签叫 ltag-*、气泡叫 pin-*，格子叫 slot-*），只注册一份 profile，然后断言：
 *
 *   ① 注册前：polish 不认识它们 → 坐标一个都不动（不会瞎猜、不会乱挪）
 *   ② 注册后：树整理生效（单孩子链变成台阶、孤立结点不再叠在一点、徽标落在结点上方）
 *   ③ 注册后：气泡落在自己锚点附近且不压别的图元，指示线跟着气泡走
 *
 * 这就是"将来识别任意 数据结构 × 算法 组合"的接入方式：**加数据，不改代码**。
 *
 * 用法：node tools/generic-profile-test.mjs
 */
import { registerProfile, profileOf } from '../app/layout-policy.js';
import { polishLayout } from '../app/canvas-stage.js';

const RECT = { x: 0, y: 0, w: 900, h: 320 };
let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* ---------- 造一层陌生命名的图元：3 个结点、2 条边（L 标签表示左孩子）、1 个孤立结点 ---------- */
const prim = (o) => ({ opacity: 1, z: 1, ...o });
function makeLayer() {
  return [
    // 标题
    prim({ kind: 'text', key: 'caption', x: 12, y: 14, text: '陌生渲染器 · 演示', align: 'left', font: '600 12px sans-serif', fill: '#111' }),
    // 结点（位置全是乱的：单链全在一条竖线上，孤立结点跟别的结点叠在一起）
    prim({ kind: 'circle', key: 'vertex-a', cx: 450, cy: 70, r: 16, fill: '#fff', stroke: '#333' }),
    prim({ kind: 'text', key: 'vlabel-a', x: 450, y: 70, text: 'A', font: '600 11px sans-serif', fill: '#111' }),
    prim({ kind: 'chip', key: 'vtag-a', x: 450, y: 42, text: 'root', size: 10, fill: '#eef', stroke: '#88f' }),
    prim({ kind: 'circle', key: 'vertex-b', cx: 450, cy: 150, r: 16, fill: '#fff', stroke: '#333' }),
    prim({ kind: 'text', key: 'vlabel-b', x: 450, y: 150, text: 'B', font: '600 11px sans-serif', fill: '#111' }),
    prim({ kind: 'circle', key: 'vertex-c', cx: 450, cy: 230, r: 16, fill: '#fff', stroke: '#333' }),
    prim({ kind: 'text', key: 'vlabel-c', x: 450, y: 230, text: 'C', font: '600 11px sans-serif', fill: '#111' }),
    prim({ kind: 'circle', key: 'vertex-x', cx: 450, cy: 70, r: 16, fill: '#fff', stroke: '#333' }),  // 与 A 叠死
    prim({ kind: 'text', key: 'vlabel-x', x: 450, y: 70, text: 'X', font: '600 11px sans-serif', fill: '#111' }),
    // 边（link-* 是我们没见过的名字）
    prim({ kind: 'line', key: 'link-a-b', x1: 450, y1: 86, x2: 450, y2: 134, stroke: '#bbb' }),
    prim({ kind: 'text', key: 'ltag-b', x: 440, y: 110, text: 'L', font: '600 10px sans-serif', fill: '#666' }),
    prim({ kind: 'line', key: 'link-b-c', x1: 450, y1: 166, x2: 450, y2: 214, stroke: '#bbb' }),
    prim({ kind: 'text', key: 'ltag-c', x: 440, y: 190, text: 'L', font: '600 10px sans-serif', fill: '#666' }),
    // 气泡（pin-*）+ 指示线（pinline-*），两个气泡指向同一个结点 → 应该被摊开
    prim({ kind: 'chip', key: 'pin-p', x: 484, y: 44, text: 'p', size: 11, fill: '#dfd', stroke: '#3a3' }),
    prim({ kind: 'line', key: 'pinline-p', x1: 470, y1: 52, x2: 462, y2: 62, stroke: '#3a3' }),
    prim({ kind: 'chip', key: 'pin-q', x: 484, y: 44, text: 'q', size: 11, fill: '#fdd', stroke: '#a33' }),
    prim({ kind: 'line', key: 'pinline-q', x1: 470, y1: 52, x2: 462, y2: 62, stroke: '#a33' }),
  ];
}
const snapshot = (list) => list.map((p) => JSON.stringify(p));

/* ---------- ① 不注册：应该原样不动 ---------- */
console.log('\n① 不注册 profile（未知命名）');
{
  const list = makeLayer();
  const before = snapshot(list);
  polishLayout(list, RECT, 99);                  // 99 = 从未注册过的 style
  const after = snapshot(list);
  ok('坐标完全没被动（不瞎猜）', before.join('|') === after.join('|'));
}

/* ---------- ② 注册一份 profile（纯数据），树整理与气泡摆位立即生效 ---------- */
registerProfile(99, {
  passes: ['tidy', 'float'],
  roles: {
    node: /^vertex-(.+)$/,
    nodeLabel: /^vlabel-(.+)$/,
    badge: /^vtag-(.+)$/,
    edge: /^link-(.+)$/,
    edgeTag: /^ltag-(.+)$/,
    connector: /^pinline-(.+)$/,
    headerText: /^caption$/,
    titleTop: /^caption$/,
    anchor: /^slot-(.+)$/,
  },
});

console.log('\n② 注册 profile 后（style 99，命名全是陌生的）');
const list = makeLayer();
polishLayout(list, RECT, 99);
const by = (k) => list.find((p) => p.key === k);
const circles = list.filter((p) => p.kind === 'circle');

ok('不再有结点重叠', new Set(circles.map((c) => Math.round(c.cx) + ',' + Math.round(c.cy))).size === circles.length,
  circles.map((c) => c.key + '@' + Math.round(c.cx) + ',' + Math.round(c.cy)).join(' '));
ok('单孩子链变成台阶（父结点不再压在同一条竖线上）',
  new Set(circles.map((c) => Math.round(c.cx))).size >= 3,
  [...new Set(circles.map((c) => Math.round(c.cx)))].join(','));
ok('徽标在结点正上方', by('vtag-a').y < by('vertex-a').cy - 16,
  `vtag-a.y=${Math.round(by('vtag-a').y)} vs cy=${Math.round(by('vertex-a').cy)}`);
ok('两个气泡被摊开（不再同点）', Math.abs(by('pin-p').x - by('pin-q').x) > 20,
  `p.x=${Math.round(by('pin-p').x)} q.x=${Math.round(by('pin-q').x)}`);
ok('气泡在自己的锚点附近（<80px）',
  Math.hypot(by('pin-p').x - by('vertex-a').cx, by('pin-p').y - by('vertex-a').cy) < 80);
{
  /* 新契约：指针线**两端都重锚**——起点落在气泡边界上，终点落在 owner 圆周上（不再只挪一端） */
  const chip = by('pin-p');
  const ln = by('pinline-p');
  const owner = by('vertex-a');
  const hw = (String(chip.text).length * (chip.size || 11) * 0.58 + 14) / 2 + 3;
  const hh = ((chip.size || 11) + 10) / 2 + 3;
  const onChipEdge = Math.abs(ln.x1 - chip.x) <= hw && Math.abs(ln.y1 - chip.y) <= hh;
  const onNodeRim = Math.abs(Math.hypot(ln.x2 - owner.cx, ln.y2 - owner.cy) - (owner.r || 16)) < 6;
  ok('指示线起点在气泡边界、终点在结点圆周', onChipEdge && onNodeRim,
    'line=' + Math.round(ln.x1) + ',' + Math.round(ln.y1) + '->' + Math.round(ln.x2) + ',' + Math.round(ln.y2));
}
ok('边重新连到结点上下沿', Math.abs(by('link-a-b').y1 - (by('vertex-a').cy + 16)) < 1.5,
  `y1=${Math.round(by('link-a-b').y1)}`);

/* ---------- ③ 现有 9 个渲染器都还认得（profile 表没被搞乱） ---------- */
console.log('\n③ 现有 style 的 profile');
for (const [style, expect] of [[1, 'mark'], [3, 'header'], [9, 'tidy'], [10, 'float']]) {
  ok(`style ${style} 含 ${expect} pass`, profileOf(style).passes.includes(expect), profileOf(style).passes.join(','));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
