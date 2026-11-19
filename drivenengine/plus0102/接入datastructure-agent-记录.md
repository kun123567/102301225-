# 接入记录：把 plus01&02 的 54 个示例接进 datastructure-agent

> 目标：**在这边也能切换 54 个示例**，且本项目既有前端样式与动画**一个都不改**。
> 结论：已接入并跑通（54/54 走宿主代码路径），既有 CSS 与核心可视化文件**未改动**。

## 1. 改动面（只加 + 4 处最小接缝）

| 类型 | 文件 | 改动 |
|---|---|---|
| 新增 | `frontend/vendor/plus/**`（85 文件 / 1.75 MB） | plus01&02 的 engine + catalog + 54 个算法 + 排版/适配模块（`step-adapter` / `host-frame` / `svg-stage` / `polish`） |
| 新增 | `frontend/src/features/visualization/ext/plus-bridge.js` | 54 例清单、本地生成 run、`createPlusView`（与 `createVisualization` 同接口）、菜单章节数据、plus 专属文案覆盖 |
| 新增 | `frontend/vendor/plus/app/plus-viz.css` | 非数组族（新增原型）的样式，选择器只用 `avc-* / plus-viz`，**不碰 `.bsviz-*`** |
| 改 1 行 | `frontend/index.html` | 引入 `plus-viz.css` |
| 改 +4 行 | `frontend/src/features/visualization/window.js` | `bindRun` 里加 `nextRun.plus → createPlusView(...)` 分支（+ import） |
| 改 +7 行 | `frontend/src/app.js` | `isPlus(algorithm)` 时本地 `buildPlusRun()`，不请求后端（+ import） |
| 改 +2 行 | `frontend/src/features/workbench/algorithm-menu.js` | `chapters.push(...plusMenuChapters())`（+ import） |

**未改动**：`visualization.css`、`window.css`、`workbench.css`、`index.js`（含 8 组 keyframes 与指针 FLIP）、`prototype-array.js`、`bfs-preview.js`、后端与 schema。

## 2. 两条可视化链路（按族自动选）

| 族 | 走哪条 | 样式来源 |
|---|---|---|
| 数组（style 1/5/6，且首层是一维数值、无其它族混层） | 本项目自己的 `createVisualization`，只把 `frameBuilder` 换成 `vendor/plus/app/host-frame.js` → 产出与 `prototype-array.js` **同结构**的 SVG 帧 | **本项目 visualization.css**（零改动） |
| 其它族（树/图/链表/栈/堆/矩阵…） | `vendor/plus/app/svg-stage.js`（新增原型 `avc-el`） | **新增** `plus-viz.css` |

切换判定：`plus-bridge.js` 的 `styleOf(trace)` —— 只要有任何一层不是数组类画法，或首层不是一维数值序列，就走新增原型（避免"多路归并"这类混合层只剩一半、以及二维矩阵被当成空数组）。

## 3. 验证（可复现）

```bat
:: 他们的静态检查 + 既有 node 测试
cd D:\.FZU\03Software\04\raw\datastructure-agent
npm run check                    → Static check passed: 216 JS files, 13 JSON files
node --test tests\*.test.mjs     → # tests 72 / # pass 72 / # fail 0

:: 起服务
set PORT=3101 && node backend\src\server.js
:: 资源全部 200
GET / , /src/features/visualization/ext/plus-bridge.js , /vendor/plus/app/svg-stage.js ,
    /vendor/plus/app/host-frame.js , /vendor/plus/app/plus-viz.css ,
    /vendor/plus/vendor/catalog/index.js , /vendor/plus/vendor/algorithms/a/insertion-sort.js

:: 54 个示例逐条走**宿主代码路径**（不是我的 stage）
cd D:\.FZU\03Software\04\merge01\code\plus01&02
node tools\host-integration-test.mjs
  A 7/7  B 8/8  C 5/5  D 8/8  E 9/9  F 7/7  G 10/10   → 合计 54/54，218 断言通过
```

菜单数据：`plusMenuChapters()` → **7 章 / 54 项**（按 A~G 包分组，章节名"示例库 · 比较排序"…）。

## 4. 已知限制（如实记）

1. **无浏览器验证**：沙箱里起不来浏览器，所以"点菜单切换"是靠"菜单数据 + 每条示例建视图 + 真出 DOM（`prototype-array` / `avc-el`）"验证的；页面上的点击链路需要你在真机点一遍。
2. **变体固定 v1**：他们的表单里没有"变体"字段，`buildPlusRun` 目前固定喂 `v1`（要三变体需要加一个下拉）。
3. **数组族文案**：本项目的 `describeStep` 是按二分查找语义写的，bridge 里用每步 `note` 覆盖了 `.bsviz-caption/.bsviz-status`（只在 plus 示例生效，`index.js` 未改）。
4. **图族**：仍走新增原型（本项目原生的 `buildGraphPreview` 需要 `run.graph`，我没有为 54 例造那个结构）。

## 5. 回退方式

- 只想恢复原样：把 `window.js` 的 `else if (nextRun.plus)` 分支删掉、`app.js` 的 `isPlus` 分支删掉、`algorithm-menu.js` 的 `chapters.push` 删掉、`index.html` 的 `plus-viz.css` link 删掉，再删掉 `frontend/vendor/plus/**` 与 `ext/plus-bridge.js`。
- 或者用版本控制：`git checkout -- frontend/src/app.js frontend/src/features/visualization/window.js frontend/src/features/workbench/algorithm-menu.js frontend/index.html`，再删新增文件/目录。
