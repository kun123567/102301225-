# 示例库的「填入示例」（plus 54 个示例）

## 为什么要做

plus01&02 的 54 个示例接进工作台后，输入面板仍然是二分查找那套
（`#arrInput` 有序数组 + `#targetInput` 目标值），而 plus 的运行输入来自
`vendor/plus/vendor/algorithms/**` 每个模块自带的 `samples[]`。
结果是：**点「填入示例」填的是二分查找的 `1,3,5,7,9`，与实际跑的输入无关**，
图/树/字符串/哈希这些示例更是完全没法看输入是什么。

## 做法：用例库当数据源，不为 54 个示例写死输入

每个示例模块都导出 `samples: [{ id, label, input, expect }]`（1～7 份），
`label` 本身就是"这份输入是什么"的中文说明，`input` 是 `run(variant, input)` 的唯一入参。

所以工作台只加 3 个控件，数据全部来自样例库：

| 控件 | 作用 |
| --- | --- |
| `#plus-sample`（下拉） | 该示例的全部样例，选项文字就是样例的 `label` |
| `#plus-variant`（下拉） | 该示例的变体（`catalog` 里的 `variants`，1～3 个） |
| `#plus-input`（文本域，可编辑） | 当前样例的输入文本；改完直接跑 |

选算法时自动填入第 1 份样例，点「填入示例」重填当前那份 —— 54 个示例都是"合适的示例"，
新增示例（`catalog` 里加一条）自动就有可填的样例，不需要改代码。

### 文本形状（`plusSampleText` / `plusParseText`，`plus-bridge.js`）

| 样例输入 | 文本 |
| --- | --- |
| 单字段数字数组 `{"array":[3,1,3,2]}` | `3, 1, 3, 2`（也接受 `[3, 1]`） |
| 单字段字符串 `{"text":"([{}])"}` | `([{}])` |
| 多字段/图/树 `{"graph":{…},"start":"A"}` | 缩进 JSON |

反向解析按**原样例的形状**还原（不猜键名）；解析不了就给中文提示，绝不拿错输入去跑。

## 接线

- `frontend/src/features/workbench/plus-samples.js`：`createPlusSamples({ $, doc, onMessage, onReset })`
  → `attach(id)` / `detach()` / `fill(i)` / `fillCurrent()` / `read()`。
  逻辑与 DOM 解耦，可用假 DOM 在 node 里逐示例验证。
- `frontend/src/features/visualization/ext/plus-bridge.js`：新增 `plusSamples` / `plusVariants` /
  `plusSampleText` / `plusParseText` / `plusCase`，`buildPlusRun(id, variant, inputOverride)` 支持外部输入。
- `frontend/src/app.js`：`configureAlgorithm()` 里 attach/detach + 显示/隐藏 `#plus-input-fields`；
  `start()` 走 `plusUi.read()`；`#fillDemo` 在 plus 示例下重填样例。
- `frontend/src/features/workbench/step-vars.js`：`plusStepVariables(step, slots)` ——
  plus 运行的变量面板改成显示算法自己的变量（数组族 `step.variables`、结构族 `step.vars`），
  步骤说明用 `step.note`，不再显示二分查找语义的 `undefined`。
- `frontend/src/features/workbench/display-source.js`：plus 的"源码行"是中文说明、不是 C 代码，
  跳过引号/注释剥离（否则 `"根先"` 这类引号内容会被吃掉）。
- `frontend/index.html`：新增 `#plus-input-fields` 区块（默认 `hidden`）。
- `frontend/vendor/plus/app/plus-viz.css`：只新增 `#plus-*` / `.plus-input*` 规则，
  未改动本项目任何既有样式与动画。

## 验证

```bash
node --test tests/plus-samples.test.mjs   # 11 项
npm test                                  # 83 项全绿
npm run check                             # 静态检查
```

`tests/plus-samples.test.mjs` 覆盖：

1. 54 个示例都有样例，`label`/`text` 非空；
2. 样例 → 文本 → 样例 往返不变（共 200+ 份样例）；
3. 每份样例 × 每个变体都能跑出步骤（500+ 组合）；
4. 假 DOM 下 `attach → fill → read` 的行为（自动填第 1 份、切样例、切变体、切算法作废未完成载入）；
5. 54 个示例逐个 `attach → 填入 → read → 跑出步骤` 全通；
6. 54 个示例的每一步变量面板都能落格、不出现 `undefined` / `[object Object]`；
7. `index.html` 里确实有这 5 个控件 id；
8. plus 中文说明不被当成 C 注释剥掉。

## 已知边界

- 只覆盖 plus 示例（`plus:` 前缀）；二分查找 / 冒泡 / 图算法 / 自定义代码仍走原流程，未改动。
- 结构族（图/树/链表/矩阵…）的变量面板显示算法变量名本身，不做中文别名映射。

## 2026-11-16 修复：结构族"越往下越错位 / 最后看不见"

**现象**（B 树截图）：向下步进时结构图逐渐错位、最后整屏看不见。

**根因**：plus 的 SVG 渲染把「定位」和「状态动画」放在同一个 `<g>` 上。
`avc-enter` 的关键帧写的是 `transform: scale(0.86) → scale(1)` 且 `animation-fill-mode: both`，
而 **CSS 动画在层叠里高于 inline style** —— 动画结束后 `transform: scale(1)` 一直压着
`transform: translate(x,y)`，元素永久停在原点。B 树每分裂一次就有新结点/新标签进来，
"停在原点"的元素越来越多，于是错位越来越大、最后看不见。

**修法**（`vendor/plus/app/prim-dom.js` + `plus-viz.css`）：

```
<g class="avc-pos" data-avc-key="…" style="transform:translate(x,y)">   ← 只定位，带 transition
  <g class="avc-el">   ← 只挂 avc-enter / avc-exit / avc-flash / avc-dim
    <shape/>
  </g>
</g>
```

- 定位层 `.avc-pos`：唯一的 `transform` 来源 + `transition: transform`（位置补间仍生效）
- 动画层 `.avc-el`：所有 keyframes 都在这里，**任何关键帧都不写 `translate`**
- `avc-enter` / `avc-exit` 不再用 `animation-fill-mode: both`，动画结束立刻交还定位属性

**回归护栏**（`drivenengine/plus0102/tools/svg-stage-test.mjs`，29 项）：

- 元素外层是 `avc-pos`、内层是 `avc-el`；动画类不在定位层上；动画层不带 `translate`
- `anim.css` 里任何 keyframes 都不出现 `translate(`，且 enter/exit 不带 `both`
- `dom-geometry-test.mjs`：54 案例 / **40595 个图元**的 DOM 绝对几何与 prim 逐一对齐（含 2377 条箭头）

同一批还修掉两个会放大"看不见"的隐患：

1. **卡片宽度取材错误**：`svg-stage.measure()` 原先用 `getBoundingClientRect().width`，
   而 rect 会被宿主视口的 CSS transform（`fitView` 的 scale）一起缩放 →
   一边排版一边被缩放。改成优先用布局宽度 `clientWidth/offsetWidth`，rect 只在拿不到时兜底。
2. **结构卡被视口取景压成一点**：`window.js` 的 `fitView()` 会把整个 scene 乘上
   `min(cw/sw, ch/sh)*0.92`。结构族 plus 是文档流卡片，本就按容器宽排好版，
   继承/累乘上一轮的 scale 会让它越走越小。现在结构族 plus 运行（`run.plus && run.structure !== 'array'`）
   只把视图复位成 1:1；数组族 plus 仍走本项目数组链路、照旧自动取景。
3. **卡片自身样式缺失**：`.canvas-card / header` 原来只写在 plus01&02 的 `app.css` 里，
   本项目没有这些类。现在在 `plus-viz.css` 里补齐（选择器限定在 `.plus-viz` 下）。

## 2026-11-16 修复：代码面板显示的是中文说明

`buildPlusRun` 早期拿 `step.note` 当"源码行"，代码区显示的就是一句话说明。
实际上每个算法模块都导出 `sourceLines(variantId)`，返回**真正的 C/C++ 代码**
（8～19 行，`lineId` 与每一步一一对应）。现在直接用模块的 `sourceLines`，
note 只在模块没有源码时兜底。

- 覆盖：54/54 示例的 `sourceLines` 非空，且每一步的 `lineId` 都能在源码里找到（高亮不断行）
- `app.js` 的 `#source-file` 对 plus 示例显示 `<包>_<名>.cpp`
