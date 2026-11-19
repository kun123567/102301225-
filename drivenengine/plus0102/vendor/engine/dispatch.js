/**
 * 渲染器分派中枢（01_RENDER_DISPATCH.md 复原）
 *
 * AnyviewC 的做法：`sub_59F354` 用一个 switch 把宿主上**预先创建并常驻**的渲染器实例
 * 写进 `panel[197]`；`sub_59F2A0` 再统一调 `renderer->VMT+0x40(self, x, y)`。
 * 切形态的代价 = 写一个 dword，所以数组 ↔ 链表切换没有闪烁。
 *
 * 这里保持同一契约：
 *   · 渲染器实例常驻（模块级单例）；
 *   · 每个渲染器只实现一个 `layout(layer, rect, env)`，签名等价于 `draw(self, x, y)`；
 *   · 分派只用 style 号，不查表结构、不做注册中心。
 */

import * as oneArray from './renderers/one-array.js';
import * as twoArray from './renderers/two-array.js';
import * as link2d from './renderers/link-2d.js';
import * as stackHeap from './renderers/stack-heap.js';
import * as tree from './renderers/tree.js';
import * as graph from './renderers/graph.js';
import { paint2D, clearAll, collectNodes } from './prims.js';
import { RENDERERS } from '../catalog/datastructures.js';

/** style → 渲染器实例（复原 sub_59F354 的 switch） */
const REGISTRY = {
  1: oneArray,
  2: twoArray,
  3: link2d,
  5: oneArray,
  6: { layout: twoArray.layoutGrid },
  7: stackHeap,
  8: { layout: stackHeap.layoutHeap },
  9: tree,
  10: graph,
};

export function rendererOf(style) {
  return REGISTRY[style] || REGISTRY[5];
}

/** 复原 sub_59F354：把宿主面板的 [197] 槽指向对应实例 */
export function dispatch(style) {
  const r = rendererOf(style);
  return { style, instance: r, cls: RENDERERS[style]?.cls || 'TOneArrayForm' };
}

/**
 * 复原 sub_59F2A0：统一绘制入口。
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,w:number,h:number}} rect 面板客户区
 * @param {object} layer 场景图层
 * @param {object} env { bg, cam, theme }
 */
export function drawLayer(ctx, rect, layer, env = {}) {
  const r = dispatch(layer.style);
  clearAll(ctx, rect, env.bg || '#ffffff');
  const { prims, nodes } = r.instance.layout(layer, rect, env);
  paint2D(ctx, prims);
  return { prims, nodes: nodes || collectNodes(prims), cls: r.cls };
}

export { collectNodes };
