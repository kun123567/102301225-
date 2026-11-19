# plus01&02 · 统一渲染端

> **基底 = add02；画 = add01；数据 = add01 的 54 个内置案例。单目录自包含，不依赖 `code/base`，也不依赖网络。**
> 位置：`D:\.FZU\03Software\04\merge01\code\plus01&02`（100 文件）

## 1. 怎么跑

```bat
cd D:\.FZU\03Software\04\merge01\code\plus01&02
node tools\smoke.mjs          :: ① 全量自检：54 案例 × 3 变体 × 全部步 都过一遍 9 个渲染器（不需要浏览器）
node tools\smoke-shell.mjs    :: ② 窗口壳 + 画布接线自检（假 DOM/假 canvas）
node tools\smoke-app.mjs      :: ③ 把 app/main.js 真正跑一遍（假 DOM：建目录/载案例/切变体/切画法）
node serve.mjs                :: 起静态服务 → 浏览器打开 http://127.0.0.1:5182/
```

> ES module 必须走 http（双击 `index.html` 会被 CORS 拦），所以有 `serve.mjs`。

## 2. 自检结果（本机实测）

```
✓ 依赖闭包：90 文件 / 152 条相对 import 全命中
✓ 案例装载：54 / 54 条
✓ 变体跑通：162 条（54 案例 × 3 变体）
✓ 步渲染：3020 步，累计 120,239 个图元（每一步都 ≥1 个图元）
✓ 结构-样式换算后可渲染：93 / 93 次（换到同族下一个画法）
✓ 覆盖到的 style：1×2628  2×120  3×463  5×42  6×394  7×672  8×219  9×936  10×421
  → 9 个渲染器全部被真实案例打到（1/2/3/5/6/7/8/9/10）
✓ 窗口壳：21/21 步在画布上产出图元；setRun/fitView/replay/destroy 正常
✓ 应用层（真跑 app/main.js）：7 包 / 54 案例 / 变体 3 / 样例 3 / 代码面板 10 行 / 切画法 1→5 换算 21 步 / 切变体后仍能跑
```

## 3. 谁贡献了什么（分工与出处）

| 层 | 来源 | 原样/改写 | 载体 |
|---|---|---|---|
| **窗口壳**（时间轴、transport、拖拽平移、Ctrl+滚轮缩放、Home/End、全屏、Esc） | add02 | **契约与类名照抄**，把视口从 DOM/SVG 换成 `<canvas>` | `app/viz-window.js`（新增，实现同一 API：`createVizWindow(host,{run,onSeek,onTransport}) → {setRun,setStep,fitView,replay,destroy,metrics}`） |
| 窗口/时间轴视觉样式 | add02 | 原样 | `vendor/shell/window.css` |
| add02 原 DOM/SVG 数组渲染器（未接线，保留对照/回退） | add02 | 原样 | `vendor/shell/{window,index,prototype-array,bfs-preview,graph-explanation,explanation-panel}.js` |
| add02 的算法元数据（`arraySearch` / `graphAlgorithm`） | add02 | 原样 | `vendor/workbench/{array-search,graph-algorithms}.js` |
| **画布层**（多图层一并绘制、按 `layer.style` 派发、相机/DPI/适配） | 新增 | 新增 | `app/canvas-stage.js` |
| **9 个渲染器**（style 1/2/3/5/6/7/8/9/10）+ 图元绘制 | add01 | **原样** | `vendor/engine/{dispatch,prims,renderers/*}.js` |
| **9 种图层契约**（array/matrix/grid/link/stack/heap/tree/graph + memCell） | add01 | 原样 | `vendor/engine/model.js` |
| 主题（AnyviewC 调色板） | add01 | 原样 | `vendor/engine/theme.js` |
| 播放/补间（`createPlayer`/`drawTween`） | add01 | 原样保留，当前界面用简化计时器 | `vendor/engine/player.js` |
| **目录**（7 包 54 案例 → 14 族 → 9 renderer 的显式登记表） | add01 | 原样 | `vendor/catalog/{index,a..g,datastructures}.js` |
| **结构-样式换算**（同族换画法，有损，界面标注） | add01 | 原样 | `vendor/app/adapt.js`（`adaptStepLayers`） |
| **全部内置案例**（54 × 3 变体，手写 JS 算法模块） | add01 | 原样 | `vendor/algorithms/**`（55 文件 / 31,897 行） |
| 装配（选案例/变体/样例/结构/画法/速度、步进、代码高亮、说明面板） | 新增 | 新增 | `app/main.js` + `index.html` + `app/app.css` |
| 全量自检（含假画布 `strictCtx`） | add01 的 fake-ctx + 新增脚本 | 复用 + 新增 | `vendor/tools/fake-ctx.mjs`、`tools/smoke.mjs`、`tools/smoke-shell.mjs` |

## 4. 界面怎么用

- **左栏**：7 个包（A 比较排序 / B 图 / C 外部排序 / D 查找 / E 线性 / F 串与表达式 / G 树），共 **54 条案例**；顶部搜索框按案例名或结构 id（`sort`、`hash`、`tree`…）过滤。
- **控制条**：变体（每条 3 个实现不同的版本）、样例、**结构**（该案例用到的族，如 `sqlist/stack`）、**画法**（`styleOptions(结构)`，同族可切换，切换会显示"有损换算 N 步"）、速度 1~5、上一步/播放/下一步。
- **中间**：add02 的窗口（时间轴可点击/拖动、`reset/prev/play/next/last`、拖拽平移、`Ctrl+滚轮`缩放、`Home` 复位、全屏），视口里是 canvas，由 add01 的渲染器按 `layer.style` 派发绘制。
- **右栏**：`sourceLines` 代码面板（当前步 `lineId` 高亮）、本步 `event`/`vars`、说明。
- **快捷键**：`←/→` 步进、`空格` 播放/暂停、`Home/End` 首末步、`Esc` 退出全屏。

## 5. 与 add01 / add02 的差别（明确边界）

| 项 | add01 原版 | add02 原版 | 本项目 |
|---|---|---|---|
| 入口 | `src/index.html`（目录）+ `src/viewer.html`（播放器） | `index.html`（演示壳） | **单页**：目录 + 播放器合一 |
| 画 | canvas 图元（9 renderer） | DOM/SVG（数组 + 图，2 类） | **canvas 图元（9 renderer，14 族全覆盖）** |
| 窗口 | 无独立窗口（播放条 + 5 个窗格） | 有（时间轴/缩放/全屏） | **沿用 add02 的窗口契约与样式** |
| 播放 | `createPlayer` + 补间（`drawTween`） | 宿主传 `onTransport` | 简化计时器（速度 1~5），`vendor/engine/player.js` 保留可切 |
| 后端 | 无 | 无（原项目有 backend，未截取） | **无**（不依赖 `code/base`，纯前端自包含） |

## 6. 目录结构

```
plus01&02/
  index.html            单页应用
  package.json          type: module（便于 node 自检）
  serve.mjs             零依赖静态服务（5182）
  app/
    main.js             装配：目录/变体/样例/结构/画法/速度/步进/代码/说明
    viz-window.js       窗口壳（add02 契约 + canvas 视口）
    canvas-stage.js     画布层（多图层、style 派发、相机、DPI）
    app.css             页面布局
  vendor/
    engine/             add01：9 renderer + prims + model + theme + player
    catalog/            add01：7 包 54 案例登记表 + 14 族 + 9 renderer 表
    algorithms/         add01：全部内置案例（54 条 × 3 变体）
    app/adapt.js        add01：结构-样式换算
    tools/fake-ctx.mjs  add01：假画布（供 node 自检）
    shell/              add02：窗口/数组渲染器原件（仅用其 window.css）
    workbench/          add02：array-search / graph-algorithms（纯数据）
  tools/
    smoke.mjs           全量自检（54×3×全步 → 9 renderer）
    smoke-shell.mjs     窗口壳 + 画布接线自检
```

## 7. 已知限制

1. **不接 C 代码**：本项目只用 add01 的 54 个内置案例；`code/base` 的编译器与识别层不参与（保持"完全不管 base 的渲染"）。
2. **不接 add02 的 DOM 数组渲染器**：它保留在 `vendor/shell/`（原样）但未接线 —— 统一视口只有 canvas；若要加"DOM 数组对照视图"，需要把 layer → `Step v1` 再走 `createVisualization`（约 40 行）。
3. **播放无补间**：add01 的 `createPlayer`/`drawTween` 原样在 `vendor/engine/player.js`，当前用简化定时器（每步整帧重绘），要补间可换成 player。
4. **结构-样式换算是有损的**（add01 的设计如此）：数组换链表会丢下标语义，界面会显示"换算 N 步"提示。
5. **大结构不下钻**：与 add01 一致（步数/结点规模上限由各案例自带样例决定）。
