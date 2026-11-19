# 标注接口（ANNOTATION INTERFACE）

> 目的：把"气泡 / 徽标 / 区间框 / 边标签"这些**标注**做成**带接口的灵活结构**，
> 让任意「数据结构 × 算法」组合都能把标注交进来，而不用改渲染器或排版代码。

## 1. 三个来源，优先级从高到低

| 优先级 | 谁声明 | 形式 | 用途 |
|---|---|---|---|
| ① 最高 | 渲染器 | 图元上带 `meta: { role, id, target, anchor, priority }` | 渲染器知道自己画的是什么（推荐新渲染器都这么做） |
| ② | 算法 | `layer.annotations = [{ id, kind, target, text, anchor, priority }]` | 算法只想"标个指针"时，渲染器什么都不用画，排版层补出来 |
| ③ 最低 | 老渲染器 | 键名约定（`ptr-*` / `nb-*` / `cell-*` …）+ `registerProfile` | 现有 9 个渲染器不改代码继续工作（向后兼容） |

**未注册过的 style 只认 ①②**（`explicitOnly`）：没声明就一个像素都不动——不猜、不乱挪别人的图元。

## 2. 角色名（`kind` / `meta.role` 都用这套词）

`node` · `nodeLabel` · `nodeValue` · `badge` · `edge` · `edgeTag` · `pointer` · `anchor` · `decoration` · `header` · `mark`

同义词会自动归一（大小写/连字符无关）：`label→nodeLabel`、`pin|chip|pill|bubble→pointer`、`caption|title|heading→header`、`range→mark` …

## 3. 契约

### 3.1 渲染器侧：图元 `meta`

```js
P.chip(`ptr-${id}`, x, y, label, {
  meta: { role: 'pointer', id, target: 'n3', anchor: 'right', priority: 5 },
});
```

| 字段 | 说明 |
|---|---|
| `role` | 角色名（见 §2） |
| `id` | 这个图元自己的 id（去重、连线用） |
| `target` | **挂到谁身上**：结点 id / 格子 id（部件类角色必填：label/value/badge） |
| `anchor` | 期望方位：`above` / `below` / `left` / `right` / `inside`（软约束，撞了会就近让位） |
| `priority` | 越大越先占位（同一目标上多个气泡时决定谁先挑位置） |

### 3.2 算法侧：`layer.annotations`

```js
layer.annotations = [
  { id: 'cur',  kind: 'pointer', target: 'n3', text: 'cur', anchor: 'right', priority: 9 },
  { id: 'flag', kind: 'badge',   target: 'n3', text: '访问过' },
];
```

| 字段 | 说明 |
|---|---|
| `id` | 必填，唯一（渲染器如果已经画了同 id 的图元，这里会被跳过 → 幂等） |
| `kind` | `pointer`（默认）/ `badge` / `note` |
| `target` | 必填，指向的结点 / 格子 id |
| `text` | 气泡文字（缺省用 `id`） |
| `anchor` | 期望方位（同上） |
| `priority` | 越大越先占位 |
| `fill/stroke/color/size` | 可选，覆盖默认外观 |

**渲染器什么都不用做**：`classify()` 会调 `synthesizeAnnotations()` 把缺的标注补成 chip 图元，
再由 `float` / `badge` 两个 pass 摆到 `target` 的 `anchor` 方位。

## 4. 排版层怎么用这些声明

```
layer.annotations ─┐
                   ├─→ classify()  ─→  nodes / edges / floats(ownerId, prefer, priority, declared)
prim.meta.role ────┘                        │
键名约定(老渲染器) ─┘                        ├─→ passFloat：declared 的气泡**必须**落到 anchor 方位
                                            └─→ passBadge：徽标优先正上方，挡它的气泡让路
```

`declared` 的气泡有两条特权：
1. 候选位置**不受"只在原位附近找"的限制**（它本来就该挪到声明的方位）；
2. 平手时按**候选顺序**（`anchor` 优先）取胜，而不是"离原位近"。

## 5. 验证

```bat
node tools\annotation-interface-test.mjs
① 渲染器用 meta 声明（键名完全陌生、style 从未注册）→ 气泡按 anchor 落位、不压结点
② 算法声明 layer.annotations（渲染器一个标注都没画）→ 补出 3 个标注，cur 右 / prev 左 / badge 上
③ 老渲染器键名约定照旧（style 1 两气泡摊开、style 9 走 tidy 链）
                                                              13 通过 / 0 失败
node tools\generic-profile-test.mjs   （陌生命名 + 注册 profile 的完整路径）  12 / 0
node tools\card-height-test.mjs        （卡片高度跟内容）                    6 / 0
smoke 6/0 · smoke-shell 11/0 · smoke-app 19/0
```

## 7. 案例：`找倒数第 K 个结点` 的"答案"标签（2026 复查）

截图里结点 3 上方那个**"答案"**是 `data.nodes[].badge`，渲染器 `link-2d.js` 把它画成
`P.text('nb-<id>', cx, nodeBoxY - 10, badge)` —— **偏移 10px 是写死在渲染器里的**。所以：

| 环节 | 之前 | 现在 |
|---|---|---|
| 识别 | ✅ 已接口化：`roleOfPrim` → `{ role:'badge', id:'n3' }`（徽标不再限定 chip） | 不变 |
| 驱动 | ❌ style 3 的 pass 链只有 `header → float`，**没有 badge** → 排版层看得见、管不着 | ✅ `header → float → badge`，位置由 `POLICY.tidy.badgeGap` 决定（16px），撞了就左右/上下让位，挡它的气泡会被重排 |
| 几何 | 只支持圆（`n.body`） | `nodeGeom()` 支持**方框结点**（`nfill-*`）+ **text 徽标**（原来用 chipBox 量会偏大 14px） |

**两条来源产出一致**（实测同一层）：

```
A 现状 data.badge      badge @569,93   nodeBox.y=109  间距 10px  text="答案"
B 接口 annotations     badge @569,93   nodeBox.y=109  间距 10px  text="答案"
两条路径位置一致： true
```

也就是说，这段可视化现在可以二选一：渲染器继续画 `nb-*`（键名约定），或者算法层改写成
`layer.annotations=[{id:'ans',kind:'badge',target:'n2',text:'答案'}]` —— 排版结果完全相同。

## 8. 新增一个「数据结构 × 算法」要做什么

| 你的渲染器/算法 | 需要做的事 |
|---|---|
| 键名就用 `n-*` / `nb-*` / `ptr-*` 这套 | **什么都不用做** |
| 键名不同，但愿意在渲染器里写 `meta` | **什么都不用做**（推荐） |
| 键名不同，也不想改渲染器 | 算法层写 `layer.annotations` |
| 键名不同，且要整套排版策略（树整理、区间框贴格…） | `registerProfile(style, { passes, roles, policy })` —— 纯数据 |

## 9. 复核：C~F 结构级硬编码 = 0

`node tools\hardcode-audit.mjs --pkgs all` → **A7 B8 C5 D8 E9 F7 G10 全部 `●`**
（结构级缺口 0；剩下的是"内容级"键：值文字、框线、装饰点等，它们只当障碍，不需要角色）。

---

# 10. 渲染机制与动画挂载点已换成 DOM（为迁移到 datastructure-agent 铺路）

`raw/datastructure-agent` 的可视化是 **SVG 节点 + 8 组 CSS keyframes**，而 plus01&02 原来是
**canvas 整帧重绘 + 补间**。机制不同 → 逻辑搬不过去（一搬就得改它的样式与动画）。所以先在
plus01&02 把机制换掉：

| 维度 | 之前（canvas-stage.js） | 现在（svg-stage.js，默认） |
|---|---|---|
| 渲染机制 | `<canvas>` + `paint2D()` 画像素 | `<svg>` + 每个图元一个 `<g class="avc-el" data-avc-key=…>` |
| 位置动画 | 整帧重绘 / `drawTween` 补间 | `<g>` 的 `style.transform` + CSS `transition: transform` |
| 状态动画 | 无（只有颜色变化） | 元素上的 `avc-enter / avc-exit / avc-flash / avc-dim` 类（语义由**步进差分**推出） |
| DOM 身份 | 无（canvas 里没有元素） | 按 `prim.key` 复用同一节点 → 迁移后可直接映射到他们的 `bsviz-*` 类 |
| 高度自适应 | 130~300（按内容） | 同口径，SVG `viewBox` 跟随 |

实现（三个新文件）：

- `app/prim-dom.js`：图元 → SVG 元素（rect/circle/line/poly/text/chip），**定位一律用 `style.transform`**；
  子元素引用缓存在 `__avcParts`（不用 `:scope` 选择器，假 DOM 也稳）；导出 `ANIM` 常量与 `applyAnim/clearAnim`。
- `app/svg-stage.js`：与 `canvas-stage.js` **同接口**（`render/clear/resize/metrics/cardCount/host`），
  按 `prim.key` 做**增量差分**：新出现 → enter；消失 → 挂 exit 保留一帧再删；同 key 文本变 → flash；`opacity<1` → dim。
- `app/anim.css`：动画挂载点的 CSS 侧（`@keyframes avc-*` + `transition` + `prefers-reduced-motion` 降级）。

切换方式：默认 svg；`?render=canvas` 可切回旧的 canvas 机制做对照（`viz-window.js` 里的 `RENDER_MODE`）。

验证：`node tools\svg-stage-test.mjs` → **21 通过 / 0 失败**
（元素数、DOM 复用、transform 定位、enter/exit/flash/dim、高度自适应、`anim.css` 与 `ANIM` 常量不脱节）。
另有 `smoke-shell 11/0`、`smoke-app 19/0` 走的是真实 `viz-window.js` + 真实轨迹。

> 这一步**没有**改动任何既有视觉：卡片结构、卡头、右栏、时间轴都没动；新增的只有"图元变成 DOM 元素"
> 与"动画挂到元素上"。原来的 canvas 机制仍保留可用。

# 12. 再降一层：`html-stage`（HTML div + `.bsviz-*` + `data-anim` + FLIP）

> ⚠ 2026-11-16 回退记录：html 机制曾设成默认，导致**数组不可显示、树显示错误**，已回退
> （默认 `svg`，html 变 `?render=html` 实验态）。原因与修法见 §13。回退前的完整备份在
> `code/plus01&02.bak-20261116-0348`。

第 10 节换的是 **SVG**；但 `raw/datastructure-agent` 的**外壳与数组帧**是 **HTML `div` 盒子**
（`.bsviz-cell{flex:0 0 auto;width:96px;padding;border-radius;box-shadow}`）—— `flex/padding/border-radius`
在 SVG 上不生效。所以再补一层真正对齐它契约的 `html-stage`（**现在是默认**）：

| 维度 | svg-stage（第 10 节） | **html-stage（现在默认）** |
|---|---|---|
| 元素 | `<svg><g><rect>` | **`<div class="bsviz-cell">`** 等宿主类名 |
| 几何 | 我按 prims 算坐标 | **交给宿主的 CSS**（宽度/间距/圆角由它定），我只给语义 |
| 指针 | 自由坐标 chip | **宿主固定三行** `.bsviz-ptr-row > .bsviz-ptr-left/right/mid` |
| 动画挂载点 | `avc-*` 类 + transform transition | **`track[data-anim]=<事件名>`** + `bsviz-enter-<i%8>` + **指针 FLIP**（`element.animate`） |

实现：`app/host-profile.js`（宿主契约：类名清单 / 事件映射 / 指针侧规则）+ `app/html-stage.js`。

- **数组族**（style 1/5/6，23 案例）：输出 `.bsviz > .bsviz-track > .bsviz-cell(.bsviz-value/.bsviz-idx)`
  与状态类 `is-in-range / is-excluded / is-range-start / is-range-end / is-mid / is-found`
  —— 类名全部来自宿主 `visualization.css`，**它的样式与动画一行都不用改**。
- **其它族**（31 案例）：走**新增原型** `.bsviz-x > .bsviz-x-el[data-bsviz-kind]`（几何 inline），
  样式在新增的 `app/bsviz-extra.css`（**只新增、不重定义**宿主已有类）。

验证：`node tools\html-stage-test.mjs` → **20 通过 / 0 失败**：结构与类名对齐宿主契约、
状态类与该步语义一致、`track[data-anim]` 事件映射正确、**用到的宿主类名在其 CSS 里都存在**（交叉校验）、
新增原型 CSS 不重定义宿主类。切换：`?render=svg` / `?render=canvas` 可回退。

> 顺带收益：`cap` 登记为标题后，超长标题下的轴字母终于有落点 —— `visual-audit` 残余 **77 → 23**
> （剩下 23 全是 style 6 字符格的字号问题）。

## 11. 换机制后修掉的两个 bug（用户实测）

| 现象 | 根因 | 修法 |
|---|---|---|
| **按一次可视化变长一点**（每次 +14px，棘轮） | 高度自适应用"按**当前**高度量内容 → 想变高 → 再量"。而栈/堆的格高是 `(rect.h-90)/cap`，高度一变内容跟着变高 → 每次都再 +14px | 改成**探针两段式**：固定 300 量一次得 `want`；再用 `want` 量一次验证装得下（装不下就用满高）；**只画一次** |
| **播放/暂停不能切换** | 时间轴的播放键只发 `action='play'`，而 `main.js` 里 `play()` 在 `S.playing` 为真时 early-return → 永远暂停不了（`'pause'` 分支是死代码） | `main.js` 的 `'play'` 分支改成 `togglePlay()`；`'pause'` 仍走 `stop()`。状态由 main 裁决，窗口只负责发键 |
| 顺带：`flash/enter` 会被"回退重画"冲成 `move` | 画完发现装不下又重新画一帧，第二帧的差分全是"位置变了" | 与第 1 条同源：**一帧只画一次**（回退判断放在绘制之前用探针完成） |

回归测试：`node tools\playback-test.mjs` → **34 通过 / 0 失败**
（播放键必须是 toggle；同一步反复渲染高度幂等；高度在 [130,300] 且不裁内容；
同宽度 15 次"重排+重绘"高度不漂移；宽度 685→900→685 收敛且不裁；首帧全 enter 无 move 混入）

### 11.1 第一版没修好的两个原因（第二次修的）

| # | 我第一版的问题 | 症状 | 现在 |
|---|---|---|---|
| 1 | **参数顺序错**：`collectPrims(rec, layer, rect)` 被当成 `collectPrims(layer, rect)` 调用 → 探针拿到的"图层"其实是 rect → 布局抛错被吞 → 量出 0 → 所有卡被压到最小高 130 | 内容被裁 | 改名 `probePrims(layer, rect)` 并加断言"探针签名是 (layer, rect)" |
| 2 | **ResizeObserver 自回环**：我改卡片高度 → 卡片尺寸变 → RO 触发 → `relayout()` → 重绘 → 又量又改…每圈 +14px | **"按一次变长一点，滑动也一样"**（播放/拖动都会 redraw） | RO 只在**宽度**变化时重排（`roLastW` 守卫）；高度变化不再触发重排 |

另外把"收短就裁内容"变成不可能：定稿高度必须通过 `probePrims(want)` 的装得下校验，否则退回满高。

### 11.2 第三次修：找到"高度 ↔ 宽度 ↔ 滚动条"的正反馈

前两次我只盯着"高度怎么算"，漏了**宽度也在变**：

```
卡片变高 → .viewport-body 出现/消失纵向滚动条 → 内容宽度抖 ~15px
         → 布局随宽度重算 → 内容高变 → 卡片又变高 → 滚动条再抖 …
```

`roLastW` 拦不住，因为这次宽度是**真的**变了（不是误报）。四处同时处理：

| # | 改动 | 位置 |
|---|---|---|
| ① | `overflow-y: scroll` + **`scrollbar-gutter: stable`**：滚动条始终占位，内容宽度不再随高度变化 | `app/app.css` |
| ② | 布局宽度取**容器** `host.clientWidth`（不再用卡片自身 rect），且变化 **< 24px 视为抖动**沿用上次值 | `svg-stage.js › measure()` |
| ③ | 高度**迟滞 20px**：小于 20px 的变化不重排（吸收 1~2px 抖动） | `svg-stage.js › render()` |
| ④ | RO 只在**宽度**变化时重排（高度变化不回喂） | `viz-window.js` |

自检（`playback-test` 34/0）里新增了"宽度 685 ↔ 671（±14px 模拟滚动条抖动）反复渲染"：`lastW` 保持 685、卡高保持 200 不变。

### 11.3 真机还不对时，给我这两个数（不要我再猜）

诊断已经内置，两种方式任选：

1. **`http://127.0.0.1:5182/?debug=1`** —— 每张卡头右侧会显示真实 `宽x高`，按 3 次后截图即可；
2. 控制台执行 `__avcReport()` —— 返回每张卡的 `stageW / lastW / height / svgCssH / viewBox / elements`。

判读方式：`height` 在涨 = 高度决策问题；`lastW` 在变 = 宽度仍在抖（反馈没断）；
`elements` 在涨 = 元素在累积（另一类 bug）。

### 11.4 高度稳定之后暴露的"图形错位"（B 类并查集截图）

高度不涨了，但缩到 320 宽的卡片里出现三处错位，都不是渲染器画错，而是排版层的三个盲点：

| 现象 | 根因 | 修法 |
|---|---|---|
| 气泡 `下标 1` 落在两条边线中间（看着像错位） | 避让打分只把**文字/气泡/圆圈/框**当障碍，**线（边）没参与打分** | 打分加入"线段穿过候选盒"判定（`segHitsBox` 采样 12 段，比 bbox 精确）；只对**结构线**（`e-` / `te-` / `x-` / `th-`）生效，轴/网格/框线/连线本身不算，否则数组里的气泡永远"压线" |
| 指针线指向旧位置 | `anchorConnector` 只挪了**气泡那一端**，结点端还停在 tidy 前的旧圆心（`cx+8, cy-8`） | 有 owner 时**两端都重锚**：起点落在气泡边界、终点落在 owner 圆周；找不到 owner 的连线直接 `opacity=0`（宁可隐藏，不留一根指错方向的线） |
| 整体偏小/偏移 | 宽度用 `Math.max(320, host.clientWidth)` 硬托底，窄窗口下"按 320 排版、按 300 显示" | 宽度改用**卡片自身 rect**（下限 240）：卡片宽度由容器决定、与自身高度无关，滚动条抖动已由 `scrollbar-gutter:stable` + 24px 容差吸收 |

复查（54 案例 × 2 变体 × 全步 × 原生画法 + 强制画法 9，卡宽 320）：
**气泡压结构边线 = 0 处**；指针线端点脱钩从 119 降到 10（剩下的是 `b/topological-sort` 队列那根由渲染器画在结点框中心竖线上的连线，属 vendor 侧口径）。
`generic-profile` 的断言也同步到新契约：**线起点在气泡边界、终点在 owner 圆周**。

### 11.5 还有一根"悬空的线"——上一帧的 DOM 残留（不是图元）

把并查集 `parent[]` 每步的图元全打出来核对过：**每步只有 2 条边，没有多余线段**。
所以那根线不在图元里，而是**上一帧的 DOM 元素没被删掉**：

- 消失的图元原本只挂 `avc-exit` 类、指望 CSS 播完动画、**下一帧再删**；
- 一旦"这一层之后不再重绘"（暂停/单步停住），或 `anim.css` 因缓存没加载 → 元素就永久留在画布上，
  内联 `opacity` 还是 1 → 看起来就是一根**悬空错位的线**。

三道措施（缺一不可）：

| # | 措施 | 作用 |
|---|---|---|
| ① | 标 `exit` 时**内联 `opacity=0`** | 即使 CSS 动画没跑，也立刻不可见 |
| ② | **260ms 定时兜底删除** | 这一层不再重绘也会被清掉（不依赖下一帧） |
| ③ | 每帧开始**扫残留**：DOM 里有、本帧图元没有、且不在 exit 过程中 → 直接删 | 双保险，任何来源的残留都清 |

新增回归 `tools\dom-leftover-test.mjs`：5 个案例 × 全部步、**原生画法与强制画法 9 交替**，等 300ms 后断言
`DOM 元素数 == 本帧图元数` → 全绿（`dom-leftover-test` 现在是 11 个套件之一）。
`svg-stage-test` 21/0、`card-height-test` 6/0、`smoke-shell` 11/0、`smoke-app` 19/0。
# 13. 回退 + 修复：为什么 html 模式会让"数组消失、树变形"

## 13.1 回退

| 项 | 值 |
|---|---|
| 备份 | `code/plus01&02.bak-20261116-0348`（135 文件 / 2,172,194 B，含 html-stage 全套） |
| 默认机制 | `html` → **`svg`**（`viz-window.js` 的 `RENDER_MODE`）；`?render=html` 才进实验态；`?render=canvas` 仍可回退第一代 |

回退后立刻验证：`smoke-shell 11/0` + `smoke-app 19/0`，数组/图/树三层分别产出 **45 / 17 / 34** 个图元。

## 13.2 根因（两条，都是"我以为会生效"）

| 现象 | 根因 | 证据 |
|---|---|---|
| **数组不可显示** | `html-stage` 输出宿主的 `.bsviz-cell` 等类名，但 **plus01&02 页面没有加载宿主的 `visualization.css`** → 格子没有 `width/height/border`，塌成文字 | `app/*.css` 里 `.bsviz-cell` 命中数 = 0 |
| **树显示错误** | 通用原型把所有图元**一视同仁画成盒子**：`line` 变成 1px 方块、`text` 带边框、`circle` 变圆角方框 | `html-stage.js` 原来只有 `chip / text / else` 三个分支 |

## 13.3 修法

1. **新增 `app/bsviz-base.css`**：等价于宿主数组族样式的最小可用子集（`.bsviz-cell` 96px 宽 + 圆角 +
   状态类配色 + 三行指针 + 错峰入场）。**只给 plus01&02 独立预览用**，迁到宿主时不需要它。
2. **通用原型按图元类型分开渲染**：
   - `line/poly` → `.bsviz-x-line`：细长条 + `transform: rotate(角度)`（虚线用 `repeating-linear-gradient`）
   - `text` → `.bsviz-x-text`：无边框、无底色、按 prim 字号/字重
   - `circle` → `border-radius: 50%`；`rect` → 圆角盒；`chip` → 药丸
3. `html-stage-test` 加了三组断言（现在 **26 通过 / 0 失败**）：基础样式必须定义被用到的宿主类、
   线段必须带 `rotate`、文字必须无边框、圆必须 50% 圆角、**默认机制必须仍是 svg**。

## 13.4 现在的状态

```
html-stage-test 26/0 · svg-stage-test 21/0 · smoke-shell 11/0 · smoke-app 19/0 · smoke 6/0
driven-audit 0 组 · hardcode-audit A~G 全 ● · annotation-interface 13/0 · generic 12/0 · card-height 6/0
tree-audit 0 · overlap-audit 187→0（出界 0）· visual-audit 2756→23（"polish 后变多"=0）
```

- **页面默认走 svg**（你看到的是稳定态）。
- html 机制仍可用来看/验契约：`http://127.0.0.1:5182/?render=html`。
# 14. 结论（第三问）：能否替换 `datastructure-agent` 的前端逻辑而样式/动画零改动

## 14.1 一句话

**能替换"逻辑"，不能替换"渲染"。** 他们自己留了扩展点：
`index.js:352 const frame = frameBuilder(step, options) ?? buildFrame(step, options); track.replaceChildren(...frame.cells);`
—— 我只要产出 `{ cells:[Element], pointers:Map }`，**外壳/动画/FLIP/图例/说明/时间轴/全部 CSS 一行都不用动**。

## 14.2 已交付的证据（不是分析，是可跑的适配器 + 断言）

| 文件 | 作用 | 验证 |
|---|---|---|
| `app/step-adapter.js` | add01 trace → **Step v1**（他们的入参形状） | 3020 步中 **1330 步（44%，全部数组族）** 用现有 schema 就能表达 |
| `app/host-frame.js` | 用 plus01&02 的层 → **他们的帧结构**（`<svg class="prototype-array">` + `prototype-array-cell/value/axis` + `prototype-marker is-left/right/mid[data-ptr]`） | `tools/host-frame-test.mjs` **14/0** |
| `tools/host-frame-test.mjs` | 断言：帧结构一致 / 状态类与语义一致 / marker 带 `data-ptr`（FLIP 靠它）/ **我输出的每个类名都在他们的 visualization.css 里** | 用到的类：`prototype-array{,cell,value,axis}`、`prototype-marker`、`is-excluded`、`is-found`、`is-left/right` |

也就是说：**数组族（23 案例 / 1330 步）已经可以做到"我供内容，他们渲染"，样式动画零改动**。

## 14.3 边界（必须说清，否则又是"漏网"）

| 族 | 能否零改动替换 | 依据 |
|---|---|---|
| 数组（23 案例 / 1330 步） | ✅ | 帧契约已实现并自测通过；状态类/`data-anim`/FLIP 全部走宿主 |
| 图（8 案例 / 421 步） | ✅（另一条路） | 他们用 `buildGraphPreview(run.graph)` 接收图数据，SVG 由他们画；我只需产出 `run.graph` |
| 树 / 堆 / 链表 / 矩阵 / 栈 …（12 族 / 1269 步） | ❌ 需新增 | 他们的 CSS/DOM **没有这些族的类**；要显示必须新增原型 + CSS（plus01&02 里已备 `bsviz-x` 原型 + `bsviz-extra.css`，但这是**新增**，不是"零改动"） |

## 14.4 落地清单（真要做时，只碰这些文件）

```text
raw/datastructure-agent/
  frontend/src/features/visualization/window.js     ← 只改 1 行：frameBuilder: <我的帧构造器>
  frontend/src/features/visualization/<新>frame.js   ← 从 plus01&02 拷贝 host-frame.js（+ step-adapter.js）
  shared/algorithms/<新>                             ← 我的 54 案例步进源（或前端本地跑）
  （可选）frontend/src/features/visualization/<新>.css ← 只有要支持非数组族时才新增，旧 CSS 不动
```

**验收（写死三条）**：
1. `visualization.css` / `window.css` / `workbench.css` / `index.js` 动画段 / `window.js` 的 FLIP：**SHA-256 不变**；
2. 同一 step 的 DOM 快照（标签/类名/属性）与他们的 `buildPrototypeArrayFrame` 一致；
3. 他们自己的 `npm test`（含 `visualization-window.browser.mjs`）全绿。