# 接入清单（plus01&02 ← add02 基底 + add01 能力）

原则：**add02 做壳、add01 做画与数据；两个源工程都不改，只搬运 + 一层薄适配。**

## 1. 从 add02 搬来的（6 文件）

| 文件 | 用途 | 是否接线 |
|---|---|---|
| `src/features/visualization/window.css` | → `vendor/shell/window.css` | ✅ 页面直接引入（窗口/时间轴/视口类名一致） |
| `src/features/visualization/window.js` | → `vendor/shell/window.js` | ⬜ 保留原件（DOM/SVG 视口），本项目用同契约的 canvas 版 `app/viz-window.js` |
| `src/features/visualization/index.js` | → `vendor/shell/index.js` | ⬜ 保留（DOM 数组渲染器，供对照/回退） |
| `src/features/visualization/{prototype-array,bfs-preview,graph-explanation,explanation-panel}.js` | → `vendor/shell/` | ⬜ 保留 |
| `src/features/workbench/{array-search,graph-algorithms}.js` | → `vendor/workbench/` | ✅（被 `vendor/shell/*` 依赖，闭包完整） |

**沿用的 add02 契约**（本项目 `createVizWindow` 与它同名同义）：

```js
const vw = createVizWindow(host, { run, onSeek, onTransport });
// → { el, setRun, setStep, fitView, replay, destroy }   （本项目额外给 redraw / metrics，便于自检）
```

交互语义照抄：时间轴点击/拖动/`←→`/`Home`/`End`；transport `reset/prev/play/next/last`；
`Ctrl+滚轮`缩放、拖拽平移、全屏（`Esc` 退出）。**唯一区别：视口里是 `<canvas>` 而不是 DOM/SVG 数组视图。**

## 2. 从 add01 搬来的（91 文件）

| 目录 | 规模 | 作用 | 改动 |
|---|---|---|---|
| `src/engine/` | 13 文件 | 9 个渲染器（style 1/2/3/5/6/7/8/9/10）+ `prims` 图元绘制 + `model` 九种图层构造器 + `theme` + `player`（含补间） | **零改动** |
| `src/catalog/` | 9 文件 | 7 包 54 案例登记表、14 族表、9 renderer 表、`resolveStyle/styleOptions` | **零改动** |
| `src/algorithms/` | 55 文件 / 31,897 行 | **全部内置案例**（54 条 × 3 变体），每条的 `run()` 产出 `trace-v1` | **零改动** |
| `src/app/adapt.js` | 1 文件 | 结构-样式换算（`canonical` / `rebuild` / `adaptStepLayers`） | **零改动** |
| `src/tools/fake-ctx.mjs` | 1 文件 | 假画布 context（node 自检用，非法值会抛） | **零改动** |

之所以能"零改动"，是因为搬运时**保持了相对深度**：`vendor/algorithms/a/x.js` 里 `../../engine/model.js`、`vendor/engine/dispatch.js` 里 `../catalog/datastructures.js`、`vendor/app/adapt.js` 里 `../engine/model.js` 全都自然命中。

## 3. 新写的（3 文件 + 1 页面 + 2 自检）

| 文件 | 行数量级 | 职责 |
|---|---|---|
| `app/viz-window.js` | ~230 行 | add02 窗口契约的 canvas 实现：模板/类名照抄 add02，视口换 `<canvas>`，时间轴/transport/缩放/全屏全部接线 |
| `app/canvas-stage.js` | ~110 行 | 画布层：高 DPI、**多图层一并绘制**（add01 的 `drawLayer` 每层会 `clearAll`，所以这里自己"清一次 + 逐层 layout+paint"）、按 `layer.style` 派发、相机（缩放/平移） |
| `app/main.js` | ~260 行 | 装配：目录/搜索、变体、样例、结构（ds）、画法（style）、速度、步进/播放、代码面板（`lineId` 高亮）、本步变量、说明 |
| `index.html` + `app/app.css` | — | 三栏布局（目录 / 窗口 / 代码+说明） |
| `tools/smoke.mjs` | ~150 行 | **全量自检**：54×3 变体 × 全部步 → 9 renderer，断言图元非空、几何值有限；再跑一遍"换画法" |
| `tools/smoke-shell.mjs` | ~140 行 | 窗口壳 + 画布接线自检（假 DOM + `strictCtx`），断言每步都有图元、`setRun/fitView/destroy` 正常 |
| `tools/dom-geometry-test.mjs` | ~170 行 | **数据 ↔ DOM 等价门禁**：渲染后从 `<g>` 的 `transform`/子元素反推绝对几何，与 prim 逐项比对（54 案例 / 40,595 图元，容差 0.75px） |
| `tools/stray-audit.mjs` | ~120 行 | **悬空线段审计**：线两端都不贴圆/框 → 判为"错位短线"，逐条报 key + 几何 |

## 4. 关键适配点（为什么不能直接 `drawLayer`）

1. **多图层**：add01 的 `dispatch.drawLayer(ctx, rect, layer, env)` 内部会 `clearAll()`，一个 step 有多层时只有最后一层能留下。
   → `app/canvas-stage.js` 自己实现"清一次 → 每层 `rendererOf(style).layout()` → `paint2D()`"。
2. **不用 add01 的 app.js**：它的 `viewer.js/catalog.js` 依赖自己的页面与 DOM id；本项目只要它的"目录数据 + 引擎 + 换算"。
3. **换算入口**：切"画法"时对每步调 `adaptStepLayers(step, targetStyle)`，并统计 `converted` 步数显示在界面上（add01 原设计就是"有损但明示"）。
4. **壳与画的边界**：壳只认 `run.steps[i]`（`layers` + `note` + `lineId`）与 `onSeek/onTransport`；画只认 `layer.style` 与 `layer.data`。两边不互相 import。

## 5. 验证命令与结果

```bat
node tools\smoke.mjs               :: 6 通过 / 0 失败
node tools\smoke-shell.mjs         :: 11 通过 / 0 失败
node tools\svg-stage-test.mjs      :: 21 通过 / 0 失败
node tools\dom-geometry-test.mjs   :: 54 案例 / 40,595 图元，DOM 绝对几何与 prim 全部一致
node tools\dom-leftover-test.mjs   :: 每步 DOM 元素数 == 本帧图元数（无残留）
node tools\playback-test.mjs       :: 34 通过 / 0 失败
node tools\stray-audit.mjs         :: 54 案例 / 1,783 层步 / 40,595 图元 —— 悬空线 0 条
node serve.mjs                     :: http://127.0.0.1:5182/   （HTTP 逐资源校验：/、/app/*、/vendor/**
                                   ::  /vendor/engine/*、/vendor/catalog/*、/vendor/algorithms/* 全部 200）
```

`smoke.mjs` 实测：依赖闭包 90 文件 / 152 import 全命中；54/54 案例、162/162 变体、**3020 步**、
**120,239 个图元**、每步 ≥1 图元；换画法 93/93 次可渲染；9 个 style 全被打到（1/2/3/5/6/7/8/9/10）。
