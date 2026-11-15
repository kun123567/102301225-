/**
 * 引擎对外入口。
 *
 * 算法模块只依赖 `model.js` 的构造器；界面只依赖这里的 player / dispatch。
 * 分层的目的是让「复原的引擎」与「54 项算法内容」可以各自独立演进。
 */

export * from './model.js';
export { dispatch, drawLayer, rendererOf, collectNodes } from './dispatch.js';
export { createPlayer, drawTween, drawStatic, stepDuration } from './player.js';
export { P, paint2D, clearAll } from './prims.js';
export { THEME, MEMORY, ARRAY, LINK, UI, MAIN, stepDuration as durationOf, toneOf } from './theme.js';
