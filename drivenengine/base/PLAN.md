# prototype01 实施计划（v2 · 已并入 `10_viz_principles`）

> **版本说明**：v1 为基线（凭 Helpdoc + re.db 推导）；v2 依据
> `.bench\10_viz_principles\00~11` 共 13 篇反编译原理文档做**实质修订**。
> 凡 v1 与 v2 冲突处，**以 v2 为准**（第 9 章逐条列出被推翻的结论）。

> 目标：用 `04\builder` 源码编出的 Open Watcom 编译器做后端，HTML/JS 复刻 AnyviewC
> 「编辑器 + 编译器 + 调试器」三合一的 C 语言可视化学习环境。
> 参考：`Helpers\Helpdoc.htm`（界面与语义）、`instructions.htm`（操作流）、
> `.bench\00_report\AnyviewC.re.db`（可视化方法表）、`.bench\10_viz_principles\*.md`（渲染原理，待并入）。

---

## 1. 范围

| | 内容 |
|---|---|
| **做** | 自由编程 + 内置样例库；C 与 C++ 双语言；编辑器/编译/运行/单步跟踪；栈区·堆区·数组·数据结构四类可视化；25 种数据结构的可视种类选择；链表 2D 观感参数；配色面板；本地文件打开/保存 |
| **不做（明确降级并标注）** | 远程题库与登录、三维数据结构窗（9 个 3D 参数 + 圆柱/球/曲面）、打印/打印设置、指令级单步（用行级替代）、真实字节码 VM |
| **约束** | 前端零依赖、纯静态；后端零 npm 依赖、仅监听 127.0.0.1；所有产物可删可重生成 |

## 2. 后端接口（已实现并自测通过）

| 接口 | 入参 | 出参 |
|---|---|---|
| `GET /api/health` | — | `{ok, cc, cxx, linker, watcom}` |
| `GET /api/samples` / `GET /api/sample?name=` | — | 样例清单 / 单个样例源码 |
| `POST /api/compile` | `{code, lang}` | `{ok, stage, log, diags[], structure}` |
| `POST /api/run` | `{code, lang, stdin}` | `{ok, stdout, stderr, exitCode, ms}` |
| `POST /api/trace` | `{code, lang, stdin, maxSteps}` | `{ok, events[], steps, truncated, degradedMode, structure, stdout}` |

**后端组成**：`env.js`（工具链定位）→ `compile.js`（编译/链接/运行/诊断解析）→ `instrument.js`（插桩）＋ `trace.js`（事件解析）→ `server.js`（路由）。自测：`node server/selftest.js`。

**跟踪事件协议**（`runtime\avctrace.h` 与 `trace.js` 成对）：

| 事件 | 含义 |
|---|---|
| `E|depth|func` / `X|depth` | 进入 / 离开函数 |
| `S|line` | 即将执行第 line 行 |
| `V|line|name|kind|val` | 变量快照（i/d/s） |
| `H|A|addr|size|line` / `H|F|addr|line` | 堆分配 / 释放 |
| `L|var|idx|key|ptr|more` / `LE|var|count|shape` | 链表/树结点与结束标记 |
| `LIMIT` | 步数超限，程序被中止 |

## 3. 模块划分（4 层 / 26 个）

### 3.1 后端（5 文件 / 3 模块）

| # | 模块 | 文件 | 状态 |
|---|---|---|---|
| 1 | toolchain | `server\env.js` | ✅ 完成 |
| 2 | compiler | `server\compile.js` | ✅ 完成 |
| 3 | tracer | `server\instrument.js` + `server\trace.js` | ✅ 完成（三级降级：full→no-dump→trace-only） |

### 3.2 前端内核（4）

| # | 模块 | 文件 | 职责 |
|---|---|---|---|
| 4 | doc | `web\js\doc.js` | 多文件标签、内容、光标、断点集、脏标记 |
| 5 | **session（调试器内核）** | `web\js\session.js` | 事件 fold → 快照；活动记录栈；堆表；结构表；步进/进入/定速/暂停/停止/断点命中 |
| 6 | highlight | `web\js\highlight.js` | C/C++ 语法高亮（可配色） |
| 7 | api | `web\js\api.js` | HTTP 客户端封装 |

### 3.3 编辑域（4）

| # | 模块 | 文件 | 对应原版 |
|---|---|---|---|
| 8 | editor | `web\js\editor.js` | `CodeViewUnit`：行号、断点、当前行高亮、编辑/撤销/查找替换/跳行 |
| 9 | structureWin | `web\js\structureWin.js` | 程序结构窗：函数/全局变量树 |
| 10 | ioWin | `web\js\ioWin.js` | `InputOutputFormUnit`：stdout / stdin |
| 11 | infoWin | `web\js\infoWin.js` | `InfoOutputFormUnit`：编译诊断（双击定位）、执行历程 |

### 3.4 演示域（6 + 3 新增 = 9）

| # | 模块 | 文件 | 对应原版 |
|---|---|---|---|
| 12 | memcell | `web\js\memcell.js` | `MemCellUnit`：格左名 · 格中值 · 格右侧十进制地址 |
| 13 | stackView | `web\js\stackView.js` | 运行栈：活动记录、递归深度、RA/DL |
| 14 | heapView | `web\js\heapView.js` | 动态分配堆：地址 9999 递减、释放态 |
| 15 | arrayView | `web\js\arrayView.js` | `ArrayOneFormUnit`+`ArrayTwoFormUnit`：一维/二维 |
| 16 | dsView | `web\js\dsView.js` | `Link2DUnit`+`NewLinkFormUnit`+`TreeFormUnit`：链表+树 SVG |
| 21 | **arrayStyles** | 并入 15 | 一维画法：矩形块/矩形块8/点/网格/线框；二维：方柱 |
| 22 | **dsStackView** | `web\js\dsStackView.js` | `TDSStackForm`：数据结构栈（`SqStack` base/top） |
| 23 | **dsHeapView** | `web\js\dsHeapView.js` | `THeapForm`：数据结构堆（Heap 数组 + 大/小根堆树形） |
| 26 | **lookParams** | 并入 16 | 链表 2D：间距±、结点±、缩放±、复位 |

### 3.5 主控（5 + 2 新增 = 7）

| # | 模块 | 文件 | 职责 |
|---|---|---|---|
| 17 | menubar | `web\js\menubar.js` | 7 个菜单、约 110 条命令注册与分发 |
| 18 | runbar | `web\js\runbar.js` | 9 个按钮 + 速度条 |
| 19 | viewmgr | `web\js\viewmgr.js` | 10 个窗的显隐 / 最大化 / 恢复布局 |
| 20 | dialogs | `web\js\dialogs.js` | 跟踪设置、数据结构源码插入、配置 |
| 24 | **theme** | `web\js\theme.js` | 85 项配色（13 组）中的 5 组 ≈25 项 → CSS 变量/SVG |
| 25 | **dsCatalog** | `web\js\dsCatalog.js` | 25 组 `data_structures` + 18 `typedefs` 的可视种类表 |
| — | app | `web\js\app.js` | 装配、命令路由、快捷键、启动自检 |

## 4. 内存与栈区语义（照抄原版）

- 地址空间 **0..9999 十进制**；**栈区从 0 向高**、**堆区从 9999 向低**（模拟地址，非真实指针）
- 单元格 = 一矩形格：**格左变量/分量名、格内值、格侧地址**
- 活动记录：参数 + 局部变量 + `RA`（返回地址）+ `DL`（链栈指针）→ 递归可视化
- 程序输出进「输入输出窗」，编译诊断进「信息窗」，二者独立

## 5. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| **M1（已完成）** | 后端 5 文件 + 插桩 + 事件协议 + 5 个样例端到端通过 | `selftest.js` 全绿：编译/运行/跟踪均有数据，链表 5 结点、树 7 结点 |
| **M2** | 前端骨架：`index.html` + `app.css` + `api/doc/session/highlight/editor` | 能编辑、编译、单步，编辑器高亮当前行与断点 |
| **M3** | 演示域 P0：`memcell/stackView/heapView/arrayView(5 画法)/dsView(链表+树)+lookParams` | 冒泡排序单步时数组格子逐个变黄；链表/树随运行增删 |
| **M4** | 编辑域四窗 + 主控（菜单/运行栏/视图管理/对话框） | 10 个窗可显隐、最大化、恢复；错误双击跳行 |
| **M5** | P1：`theme` 配色 25 项、`dsCatalog` 25 种结构、`dsStackView`/`dsHeapView`、树结点就地编辑 | 25 种结构都能选中并渲染；配色即时生效 |
| **M6** | 收尾：`README.md`、`start.bat`、`selftest` 纳入前端冒烟、目录整洁化 | 一键启动，文档齐全 |

## 6. 目录约定

```
04\prototype01\
  PLAN.md  README.md  start.bat
  server\   env.js compile.js instrument.js trace.js server.js selftest.js
  runtime\  avctrace.h
  web\      index.html  css\app.css  js\{api,doc,session,highlight,editor,structureWin,ioWin,infoWin,
                                         memcell,stackView,heapView,arrayView,dsView,dsStackView,
                                         dsHeapView,menubar,runbar,viewmgr,dialogs,theme,dsCatalog,app}.js
  samples\  01_bubble.c 03_linked_list.c 04_recursion.c 05_matrix.c 06_bst.c
  workspace\ （运行期临时目录，自动清理）
```

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 插桩改变语义 | 声明行不插、控制语句只前置独立块、逐级降级编译（已有三级） |
| 步数爆炸（大循环） | `maxSteps` 上限 + `LIMIT` 事件 + 前端截断提示 |
| 沙箱禁止管道 stdio | 子进程用文件重定向（已实现） |
| 编译器对编码敏感 | 所有注入/样例源码保持纯 ASCII，中文只出现在 `.md`/`.html` |
| 可视化与实体不符 | 每个渲染器都要有"已知答案"的样例做回归（如 nqueens=92、20!=…） |

---

## 8. 待并入：`.bench\10_viz_principles\*.md`

（下一步逐篇阅读 00~11 共 13 个 md，把渲染原理、坐标系、配色 ini、对象模型等硬结论校准进本计划；
本文件会在阅读后追加 **v2 修订** 章节，并回填上表对应模块的实现要点。）

---
---

# 9. v2 修订（依据 `.bench\10_viz_principles\*.md`）

## 9.0 被推翻的 6 条 v1 结论

| v1 说法 | v2 事实（原理文档依据） |
|---|---|
| 渲染器 **9 个** | **8 个**。style 5 只是 `sub_59F354` 的 `else` 兜底分支，`TOneArrayForm` 同时承担 style 1/5（`01_RENDER_DISPATCH.md` §1） |
| 一维数组有 **6 种画法** | 是 **`Shape{0=矩形框,1=点} × ShowGrid × ShowLine` = 8 种组合**，菜单只暴露 4 个入口（`02_ARRAY_1D.md` §1、`01` §5） |
| 树用 **SVG 自绘布局** | **不能自绘**：原版走 `TTreeView` 控件，本单元绘图 API 调用 **0 次**（`07_TREE_GRAPH.md` §1） |
| 运行栈 / 动态堆 与 数据结构栈 / 堆 是 4 个独立渲染器 | 是**同一基类** `TStackHeapForm` 派生 `TStackForm` / `TDSStackForm` / `THeapForm`，且**格子的绘制原语全部下沉到 `MemCellUnit`**（`06_STACK_HEAP.md` §1–3） |
| 可视化靠"自动识别数据结构" | **主要是用户手工指定**（`TTrackForm` 的 `ListView_LinkType`），自动识别为辅（`07` §5） |
| 速度是一个滑块 | 是 **`SpeedIndex`(1..5) + `MinTime`/`MaxTime`** 三档联动，按数据规模插值（`10_COLOR_INI.md` [Main]） |

## 9.1 架构对齐：补上原版最本质的**模型层**

原版四层（`00_PRINCIPLE_OVERVIEW.md` §1）：

```
① 数据源(VM 符号/内存快照) → ② 模型层(字段表 kind/offset) → ③ 渲染器(VMT+0x40) → ④ 后端(Canvas|GL|TreeView)
```

prototype01 的等价映射（**新增 1 个模块**）：

| 原版层 | prototype01 | 说明 |
|---|---|---|
| ① 数据源 | `trace` 事件流（`session.js` fold） | 已有 |
| ② 模型层 | **`web/js/vmodel.js`（新增）** | 由事件 + 静态结构表构建 **VObj**：`{kind, name, offset, size, valueText, fields[], children[]}` |
| ③ 渲染器层 | 各 `*View.js`，统一接口 `render(vobj, host, params)` | 对齐 `VMT+0x40 draw(self,x,y)` |
| ④ 后端层 | **Canvas / SVG / DOM 树** 三选一 | 分别对应 TCanvas / OpenGL / TTreeView |

**硬约束**：所有渲染器**只消费 VObj**，不得直接读 `events`。这是原版能把 25 种结构塞进 8 个渲染器的根本原因（`09_OBJECT_MODEL.md` §2）。
`memcell` 是唯一的"格子绘制原语"，栈/堆/内存三视图共用（`06` §2、`08` §4）。

## 9.2 模块表 v2（26 → 27，含合并/改名）

| 层 | # | 模块 | 文件 | v2 变化 |
|---|---|---|---|---|
| 后端 | 1–3 | toolchain / compiler / tracer | `env.js` `compile.js` `instrument.js`+`trace.js` | 增 3 处事件（见 9.9） |
| 内核 | 4 | doc | `doc.js` | 增"错误行"状态 |
| | 5 | session | `session.js` | fold 后交 vmodel |
| | 6 | highlight | `highlight.js` | 配色键改 `Syntax*` |
| | 7 | api | `api.js` | — |
| | **27** | **vmodel（新增）** | `vmodel.js` | 字段表 + kind/offset/size |
| 编辑域 | 8–11 | editor / structureWin / ioWin / infoWin | 同名 | 结构窗与跟踪设置合并数据源 |
| 演示域 | 12 | memcell | `memcell.js` | **唯一格子原语**（含 TMemCellAttribute） |
| | 13–14 + 22–23 | **stackheap（合并）** | `stackheap.js` | `TStackHeapForm` 基类 + 3 变体：`stack`(运行栈) / `dsStack`(SqStack) / `dsHeap`(Heap) |
| | 15 | arrayView | `arrayView.js` | Shape×Grid×Line + 轴/刻度/双焦点 |
| | 16 | linkView | `linkView.js`（原 dsView 拆出链表） | 三段式 + 四边着色 + 7 参数 |
| | **新** | treeView | `treeView.js`（从 dsView 拆出） | **可折叠 DOM 树** |
| 主控 | 17–20, 24–26 | menubar / runbar / viewmgr / dialogs / theme / dsCatalog / lookParams | 同名 | 配色键名与 ini 对齐；速度三档 |

## 9.3 一维数组（对齐 `02_ARRAY_1D.md`）

**形态 = `Shape` × `ShowGrid` × `ShowLine`**（3 个独立属性，不是一个枚举），默认 `Shape=0, Grid=1, Line=0`。

绘制顺序（必须照抄，决定观感是否"像"）：

1. **X 轴**（基准 y = 上边距 + 高 + 1）→ 轴身两段 → **箭头 = 两段 3×5 像素短线** → 标签 `X`
2. **Y 轴**（含 ±1px 的双线加粗替代）→ 箭头 → 标签 `Y`
3. **刻度线 + 刻度值**：下标字符串按 `TextWidth/2` 居中，`step += 单元格步长`
4. **元素本体**：矩形框 or 圆点；`showValue` 开关决定是否标注数值

**参数（照 ini 命名）**：`cellStep(+56)`、`tickLen(+60)`、`originX(+68)`、`valueScale(+88)`、`showValue(+92)`。
**双焦点**：`ArrOneFocus1`（当前元素，红）与 `ArrOneFocus2`（比较/交换目标，品红）必须**分开高亮**——排序演示的核心体验（`10_COLOR_INI.md` [Array]）。
→ 后端需产"焦点对"事件（见 9.9 增强 ①）。

## 9.4 二维数组（对齐 `03_ARRAY_2D.md`）

`DrawMode{0=圆柱,1=柱状,2=球,3=曲面}`，数据**统一按 `double` 读**。

| 模式 | 2D 原型处置 |
|---|---|
| 1 柱状 `mmArrTwoColumn` | ✅ **P0 实现**（SVG 矩形柱，高度=值×缩放） |
| 3 曲面 `mmArrTwoSurface` | 🟡 **实现为线框网格**：SVG 等距投影画 横/竖/斜 三类线（等价原版 `GL_LINES` 三向连线，`03` §3.1） |
| 0 圆柱 / 2 球 | ❌ 标注降级（GLU 依赖） |

## 9.5 链表 2D（对齐 `04_LINK_2D.md`）

**三段式**：数据 → `layout()` 算 (x,y,w,h) → `paint()` 出像素。

| 原版做法 | prototype01 做法 |
|---|---|
| 节点框 = `MoveTo/LineTo` 手画 4 条边（**逐边换色**） | SVG `<line>` ×4，可分别取 `NodeFrame` / `RefHeadLine` / `NodeLine` / `Dot` 色 |
| 边 = **直角折线**（先竖后横），非贝塞尔 | SVG `<polyline>`，拐点对齐网格 |
| 箭头 = **两段 3×5 短线** + 连接处圆点(`Ellipse`) | `<polyline>` 两段 + `<circle>` |
| 头指针标记 | `LinkHead/LinkHeadLine/LinkHeadText` 专用色 + "head" 标签 |
| 布局/绘制分离（Link2DUnit ↔ NewLinkFormUnit） | `layout()` / `paint()` 两个函数，便于单测 |

**7 个 2D 参数**（`mmLink_*`）：`Interval±`、`Node±`、`Scale±`、`Restore`；另有 `LinkRoundShape`(圆角)、`LinkLinkFirst`(先画线还是先画点)、`LinkEquateTree`(降级关闭)。

## 9.6 树 / 图（对齐 `07_TREE_GRAPH.md`）—— 改技术路线

**不自绘**：用可折叠 DOM 树（`<ul>/<li>` 或 `<details>`），得到折叠、滚动、键盘导航、就地编辑全部免费。

| 原版 | prototype01 |
|---|---|
| `TTreeNode.SetData(数据对象指针)` | `<li data-node-id>`，点击回查 VObj |
| `SetStateIndex(14 叶子 / 15 有子)` —— **只有两个状态图标** | 两种 CSS 图标，不引入更多图标集 |
| 文本 = `vmt[3]`(ToString) + 名字+分隔+值 | `name: value` 模板 |
| `TreeView1Compare` 兄弟排序 | 按 `key` 排序 |
| `TreeView1Edited` 就地编辑 → **写回模型** | 双击改值（仅可视化层，注明不改程序内存） |
| `FormShow` 按需重建（**不是每帧**） | 仅在数据变化时重建 DOM |

刷新策略对照（`07` §4）——实现时必须区分，否则大结构会卡：

| 视图族 | 刷新策略 |
|---|---|
| 栈/堆/内存 | 每次变化：重建格子对象列表 + 整幅重绘 |
| 数组/链表 | 每次变化：整幅重绘（几何现算） |
| **树/图** | **数据变化时重建节点，绘制交给控件** |

## 9.7 栈 / 堆（对齐 `06_STACK_HEAP.md` + `08_MEMORY_CELL.md`）

**一个基类 + 三个变体 + 唯一格子原语**：

```
stackheap.js
  ├ STACK      运行栈：竖向堆叠，top/DL 高亮
  ├ DS_STACK   数据结构栈(SqStack)：base/top 指针 + 下标
  └ DS_HEAP    数据结构堆(Heap)：按地址稀疏摆放，空洞用 MemEmpty
memcell.js  ← 三者共用 drawCell(cell, attr)
```

**格子的属性集 `TMemCellAttribute`**（必须实现，否则不一致）：

- 地址 ∈ `[attr.min, attr.max]` 才画，**越界直接跳过**（由背景色体现非法区）
- 三态填充：`MemEmpty`(空闲白) / `MemNode`(有值黄) / `MemFocus`(焦点红)
- **四列列宽**：`MemLabelWidth=70` / `MemNameWidth=70` / `MemValueWidth=70` / `MemAddrWidth=35`
- 框色 `MemFrame`

**重建式刷新**（`sub_59A434` + `sub_59A324`）：每次数据变化 → 释放旧格子 → 清列表 → 重铺背景（脏标志）→ 逐格重画；`Canvas.Lock` 用"一次 `requestAnimationFrame` 内批量 DOM 更新"等价替代。

## 9.8 配色 / 参数（对齐 `10_COLOR_INI.md`）—— `theme.js` 的键名表

`anyview.ini` 共 7 段，**直接作为我的配置面板分组与 CSS 变量命名**：

| 段 | 关键键（prototype01 必须支持） |
|---|---|
| `[Main]` | `MinTime=50` `MaxTime=2000` `SpeedIndex=4` `MaxMemory=10000` `MaxStrLen=256` |
| `[Memory]` | `MemBkg` `MemFrame` `MemNode` `MemEmpty` `MemInvalid` `MemFocus` + 4 个列宽 |
| `[Array]` | `ArrBkg` `ArrName` `ArrBracket` `ArrValue`；`ArrOneBkg` `ArrOneCoor` `ArrOneFocus1` `ArrOneFocus2` `ArrOneGrid` `ArrOneLine` `ArrOneShape` `ArrOneShowGrid` `ArrOneShowLine`；`ArrTwoShape` |
| `[Link]` | `LinkBkg` `LinkHead` `LinkHeadLine` `LinkHeadText` `LinkRefHead` `LinkRefHeadLine` `LinkNodeFrame` `LinkNode` `LinkNodeLine` `LinkNodeText` `LinkDot` `LinkRoundShape` `LinkLinkFirst` `LinkEquateTree` |
| `[Syntax]` | `Style` `CommentText/Style` `KeywordText/Style` `NumberText/Style` `StringText/Style` **`RunLineBkg`（当前执行行）** **`ErrLineBkg`（出错行）** **`BreadPointBkg`（断点行）** |
| `[Edit]` | `ShowLineNumber` `TabStops=3` `UndoLimit=65535` `RightMargin=80` |

**两个必须照抄的语义**：

1. **执行行 / 错误行 / 断点行是三套独立底色** —— 这是"代码行 ↔ 指令地址（AddrTable）"在编辑器侧的投影，也是调试器与编辑器的联动接口。我的编辑器必须补"错误行"高亮（v1 只有执行行与断点）。
2. **速度 = `SpeedIndex`(1..5) + `MinTime`/`MaxTime`**：帧间隔按当前数据规模在两者间插值；UI 上"加速/减速"改的是 `SpeedIndex`，不是单一毫秒数。

## 9.9 对后端的三处增强（v1 未覆盖）

| # | 增强 | 原因 |
|---|---|---|
| ① | 新增事件 `W|line|exprA|exprB`：语句涉及的两个比较/交换目标（"焦点对"） | 支撑 `ArrOneFocus1/Focus2` 双焦点（9.3） |
| ② | 插桩期静态导出 **struct 字段表**（name/offset/size）到 `structure.vmodel` | 模型层需要 `kind/offset/size`（`09` §1），运行时不必再传 |
| ③ | `session` 提供 `addressOf(name)`：按帧内偏移累加出模拟地址 | 与 `MemCell` 的"地址列"、`MemMaxMemory=10000` 对齐 |

## 9.10 交互（对齐 `00` §2 / `01` §6）

- **命中测试 = 面板标识比对**（`[233]`栈 `[234]`堆 `[235]`数组 `[236]`链表），不做全局坐标反算 → `viewmgr` 用 `windowKey` 比对即可
- **同一格在任何视图里长得一样**（因共用 `memcell`），从而支持"栈里点变量 → 数组/内存视图同步高亮"
- `TTrackForm` 的四区结构即"跟踪设置"面板：`TreeView_Prog`(程序结构) / `TreeView_TrackPos`(跟踪位置) / `TreeView_TrackField`(跟踪字段) / `ListView_LinkType`(该字段用哪种画法)

## 9.11 里程碑调整
| 阶段 | v1 | v2 调整 |
|---|---|---|
| M2 | 前端骨架 | **+ `vmodel.js`**（先有模型再造视图，否则每个视图都要解析事件） |
| M3 | 四个渲染器 | **改为**：`memcell` → `stackheap`(3 变体) → `arrayView`(轴/刻度/双焦点/8 组合) → `linkView`(三段式) → `treeView`(DOM) |
| M4 | 主控 + 编辑四窗 | **+ 错误行/执行行/断点行三套底色** |
| M5 | theme 25 项 + dsCatalog | **改为按 ini 7 段分组**；`SpeedIndex` 三档替换单滑块 |
| M6 | 收尾 | 不变；增"三项增强(9.9)"回归用例 |

## 9.12 明确不做（每项都有原理依据）

| 不做 | 依据 |
|---|---|
| 3D 链表（球+锥+display list）与 `mmOpenGL_*` 8 参数 | `05_LINK_3D.md`：依赖 GLU/GL 显示列表，Web 侧要引入 WebGL，超样品范围 |
| 二维数组的圆柱/球 | `03` §3.2/§3.3：`gluCylinder` / `gluSphere` |
| `LinkEquateTree`（等价树一起画） | `04` §3：需要求解等价关系，非渲染问题 |
| 打印 / 打印设置 | `mmPrint*`，与学习环境无关 |
| 远程题库 / 登录 | 已定范围 |
| 真实 `SyntaxStyle` 多方案 | `10` [Syntax]：只实现"Turbo C 风格"一套 + 可改色 |

## 9.13 v2 一句话总结

> prototype01 = **一份 VObj 字段表模型** + **1 个格子原语 + 5 个渲染器（数组/链表/树/栈/堆，共 3 变体）**
> + **3 套后端（SVG / Canvas / DOM 树）** + **ini 7 段配色** + **重建式刷新**。
> 这与原版"统一模型 + 统一接口 + 三后端 + 每帧重建"的结构一一对应，只是把 VM 换成了我们自编编译器的插桩 trace。

---

# 10. 数据结构**逻辑结构分类**（dsCatalog 的一级分组）

> **口径**：DB 的 `data_structures` 共 **25 条条目**；其中 `PTree;UFSet;` 一条含两种逻辑结构，
> 拆为两条 → **26 条模板**。本章按 26 条模板分类。

## 10.1 先定判据：三层必须分开

| 层 | 判据 | 影响什么 |
|---|---|---|
| **逻辑结构** | 元素之间**直接前驱/后继的数量**：一对一 / 一对多 / 多对多 / 无约束 | **本章分类**（教学口径） |
| **存储结构** | 顺序(数组) / 链式(指针) / 索引 / 散列 | 只影响"怎么画"，**不改变分类** |
| **渲染器** | 由"形状类别"决定（`04_LINK_2D.md` §5） | 与逻辑结构**不总一致**（跳跃表逻辑线性，原版却用树渲染器） |

> 本章按**逻辑结构**（教材口径）分类，§10.4 另标注 5 个"逻辑结构 ≠ 渲染器/≠存储"的边界项。

## 10.2 分类结果：**线性 10 · 树形 11 · 图形 3 · 集合 2 = 26 条模板**（源自 25 条 DB 条目）

### ① 线性结构（一对一，10 项）

| # | 结构 | C 类型 | 原版渲染器 | v2 渲染器 | dump 族 |
|---|---|---|---|---|---|
| 1 | 线性表 | `SqList;LStr;` | Link | `linkView` | A（链式）/ E（顺序） |
| 2 | 顺序栈 | `SqStack;` | **TDSStack** | `stackheap`·dsStack | E |
| 3 | 链队列 | `LinkQueue;NLinkList;` | Link | `linkView` | A |
| 4 | 循环队列 | `SqQueue;CTagQueue;CLenQueue;` | Link | `linkView` / `arrayView` | A / E |
| 5 | 短字符串 | `SStr;` | OneArray/TwoArray | `arrayView` | E |
| 6 | 一元稀疏多项式 | `PolyStruct;Poly;` | Link | `linkView` | A |
| 7 | 索引表 | `IdxList;` | Link | `linkView` | A |
| 8 | 跳跃表 | `SkipList;` | Tree | `treeView`（**逻辑仍线性**） | B / D |
| 9 | 广义表 | `GList;` | Link | `linkView` | B（`hp`/`tp` 双指针） |
| 10 | 稀疏矩阵十字链表 | *（DB 空）* | Link | `linkView`（十字链）/ `arrayView`（稀疏矩阵）**两种画法** | B / E |

> 末三行是"线性结构的推广"：跳跃表＝多层有序链表；广义表＝可递归嵌套的表；稀疏矩阵＝数组（线性表的推广）。

### ② 树形结构（一对多，11 项）

| # | 结构 | C 类型 | 原版渲染器 | v2 渲染器 | dump 族 |
|---|---|---|---|---|---|
| 11 | 三叉链表 | *（DB 空）* | Tree | `treeView` | C（+`parent`） |
| 12 | 双亲树 | `PTree;`（DB 原为 `PTree;UFSet;`，拆出并查集） | Tree | `treeView` | E（`parent[]` 数组） |
| 13 | 孩子树 | `CTree;` | Tree | `treeView` | D（子指针数组） |
| 14 | 线索二叉树 | `BiThrTree;` | Tree | `treeView` | C（+`ltag`/`rtag`） |
| 15 | B- 树 | `BTree;` | Tree | `treeView` | D（`ptr[]`+`key[]`） |
| 16 | B+ 树 | `BpTree;` | Tree | `treeView` | D |
| 17 | 红黑树 | `RBTree;` | Tree | `treeView` | C（+`color` 角标） |
| 18 | 堆 | `Heap;` | **THeap** | `stackheap`·dsHeap（数组形态）＋`treeView`（树形态） | E |
| 19 | 堆-赫夫曼树 | `HFTree;HFTNode;Heap;` | **THeap** | dsHeap ＋ `treeView` | E + C |
| 20 | Trie 树 | `TrieNode;TrieTree;` | Tree | `treeView` | D |
| 21 | 双链树 | `DLTree;DLTNode;` | Link | `linkView` / `treeView` | B（`firstchild`/`nextsibling`） |

> 堆的逻辑结构是**完全二叉树**（一对多），数组只是存储；故两种形态都要提供。

### ③ 图形结构（多对多，3 项）

| # | 结构 | C 类型 | 原版渲染器 | v2 渲染器 | dump 族 |
|---|---|---|---|---|---|
| 22 | 邻接表 | `ALGraph;` | Tree | `treeView`（顶点→边）/ `linkView` | F（两级） |
| 23 | 邻接矩阵 | `MGraph;MG;` | Tree | `arrayView`（矩阵）/ `treeView` | E |
| 24 | 图十字链表 | `OLGraph;` | Tree | `treeView` | B（`firstin`/`firstout` 双链） |

### ④ 集合结构（松散关系，2 项）

| # | 结构 | C 类型 | 原版渲染器 | v2 渲染器 | dump 族 |
|---|---|---|---|---|---|
| 25 | 哈希表 | `OpenHashTab;ChainHashTab;ChainHT;OpenHT;` | Link | `linkView`（桶+链）/ `arrayView`（开放寻址） | F / E |
| 26 | 并查集 | `UFSet;`（DB 原为 `PTree;UFSet;`，由双亲树条目拆出） | Tree | `treeView`（森林：每棵树 = 一个等价类） | E（`parent[]`） |

> **集合结构的判据**：元素之间只有"同属一个集合"的关联，**没有前驱/后继约束**。
> - `哈希表`：键→值映射；同桶内元素只是"碰撞关系"，不构成前后继。桶+链是该集合的**存储表示**。
> - `并查集 UFSet`：本质是**等价类的划分**（`Find`/`Union`），`parent[]` 只是"划分的存储表示"；
>   渲染按**森林**展示——每棵树一个等价类，根结点标 `class #k`，`Union` 时两棵树合并可直观看到。
>
> 这是 26 条模板里**仅有的两个"无前后继约束"**的结构；其余 24 条都是一对一/一对多/多对多。

### 10.2.1 稀疏矩阵十字链表：**两种画法**（按你的要求单列）

同一份数据（`mu × nu` 矩阵、非零元三元组 `(i, j, v)`、行头 `rhead[]` / 列头 `chead[]`），提供两种可切换画法：

| | **画法 A：十字链视图（网状）** | **画法 B：稀疏矩阵视图（网格）** |
|---|---|---|
| 渲染器 | `linkView`（B 族：双后继） | `arrayView`（E 族，新增 `sparse` 模式） |
| 画什么 | 结点框 + 两条**异色**链：`right`（行方向，蓝 = `LinkNodeLine`）、`down`（列方向，品红 = `ArrOneLine`）；行/列表头结点用 `LinkHead` 色并标 `rh[i]` / `ch[j]` | `mu × nu` 网格：非零元填值并高亮，零元用 `MemEmpty` 留空；行标 `i`、列标 `j` |
| 观察价值 | 看清 `right`/`down` 两条链如何**共享同一批非零元结点**（十字结构） | 看清矩阵的稀疏分布与非零元数值（逻辑视图） |
| 布局规则 | 结点 (x, y) 由 `(i, j)` 定网格交点；缺行/缺列处断开 | 固定 `mu` 行 × `nu` 列等宽格子 |
| 容量上限 | 结点 24（与 dump 上限一致） | 行 16 × 列 16（与 `arrayView` 二维上限一致） |
| 切换入口 | 结构窗下拉「画法：十字链 ⇄ 稀疏矩阵」→ `variants: ['cross','matrix']` | 同左 |
| dump 族 | B（`right`/`down` 双指针遍历） | E（二维数组探针 + 非零判定） |

> **为什么两种都要**：十字链是**存储表示**、稀疏矩阵是**逻辑结构**。
> 原版只给了 Link 一种（`04_LINK_2D.md` §5），原型补上矩阵形态，正好演示"同一数据的逻辑/存储双视角"。
> 默认画法取 **A（十字链）**，与原版一致；B 作为教学补充。

## 10.3 分类 × 渲染器 × dump 族 交叉表（工作量一览）

| 逻辑结构 | 项数 | 落到渲染器 | 主要 dump 族 | 备注 |
|---|---|---|---|---|
| 线性 | 10 | `linkView` 7 · `stackheap` 1 · `arrayView` 1 · `treeView` 1 | **A×5**、B×3、E×3 | A 族已实现，是主力 |
| 树形 | 11 | `treeView` 9 · `stackheap` 2 · `linkView` 1 | **C×3、D×4**、E×3、B×1 | D 族（多子）是新缺口 |
| 图形 | 3 | `treeView` 3 · `arrayView` 1 | **F×1**、B×2、E×1 | F 族（两级）是新缺口 |
| 集合 | 2 | `linkView` / `arrayView` / `treeView` | F / E | 哈希表 F/E、并查集 E |

→ **A/C/E 三族即可覆盖 17 项**（当前开箱可用）；**B/D/F 三族是缺口，覆盖剩余 9 项**
（跳跃表、广义表、稀疏矩阵A、孩子树、B-、B+、Trie、双链树、邻接表、图十字链 —— 其中稀疏矩阵可由 B 形态改用 B 画法）。

## 10.4 五个边界项（逻辑结构 ≠ 渲染器 / ≠ 存储）

| 结构 | 争议点 | 计划处置（已定稿） |
|---|---|---|
| 稀疏矩阵十字链表 | 教材归"数组"章（线性推广）；但十字链有 `right`+`down` **两个后继**，视觉上像网状 | 归**线性**；**给两种画法**：A 十字链视图（`linkView`, B 族）/ B 稀疏矩阵视图（`arrayView`, E 族），默认 A，见 §10.2.1 |
| 跳跃表 | 逻辑是**多层有序链表**（线性）；原版却用 `TTreeForm` 渲染 | 归**线性**；渲染器用 `treeView`（贴合直觉），条目写明"逻辑线性 / 渲染树" |
| 广义表 | 元素串成线性（`tail`），但元素可为子表（`head`）→ **递归/可嵌套** | 归**线性**；dump 用 B 族 `hp`/`tp`，树上展成两层 |
| 双亲树 + 并查集 | DB 把 `PTree;UFSet;` 合并成一条；但**双亲树是树形、并查集是"集合的划分"** | **已拆分**：`PTree`→树形(#12)、`UFSet`→集合(#26)；故 25 条 DB 条目 = **26 条模板** |
| 堆 / 邻接矩阵 | 逻辑结构（树 / 图）与存储结构（一维数组 / 二维数组）不一致 | 各给**两种画法**（数组形态 + 结构形态），用户在跟踪设置里选 |

## 10.5 对 `dsCatalog.js` 的落地要求

```js
// 一级分组 = 本章四类；二级 = 26 条模板（25 条 DB 条目 + 并查集拆分）
GROUPS = [
  { key:'linear', name:'线性结构（一对一）',   items: 10 },
  { key:'tree',   name:'树形结构（一对多）',   items: 11 },
  { key:'graph',  name:'图形结构（多对多）',   items: 3  },
  { key:'set',    name:'集合结构（松散关系）', items: 2  },  // 哈希表 + 并查集
];
```

每条模板必须携带 5 个字段，才能"选中即画"：

| 字段 | 示例 | 用途 |
|---|---|---|
| `logical` | `linear` / `tree` / `graph` / `set` | 一级分组（本章） |
| `cTypes` | `['SqList','LStr']` | 与源码类型名匹配（辅助自动识别） |
| `renderer` | `linkView` / `treeView` / `arrayView` / `dsStack` / `dsHeap` | 默认画法 |
| `dumpFamily` | `A`/`B`/`C`/`D`/`E`/`F` | 决定后端生成哪种遍历函数（见 §9.9 ②） |
| `variants` | `['array']` / `['array','tree']` / **`['cross','matrix']`** | 多形态可切换（堆、邻接矩阵、**稀疏矩阵**） |

**不在 26 条模板内但必须具备**的通用原型（不占 ds.ini 名额，是上面 17 项的同构基础）：
单链表（A）、双向链表（B）、普通二叉树（C）、顺序表（E）。

---

# 11. M2 执行记录（已完成）

**验收**：`node server/test-m2.js` → **81 项断言全绿**（doc / highlight / vmodel / session + 3 个真实 trace）。

**交付**：`web/js/{api,doc,highlight,vmodel,session,editor,app}.js`（7 个）+ `server/test-m2.js`；`index.html` 脚本清单同步。

| 验收组 | 覆盖内容 |
|---|---|
| doc | 多文件、脏标记、断点增删、错误行只收 error、行号工具 |
| highlight | 关键字/数字/注释/字符串/C++ 关键字、HTML 转义 |
| session（合成） | 帧栈、递归深度、模拟地址（栈 0→高）、堆（9996→低）、回退重建 |
| session（真实） | 79 步数组全程、5 结点链表、7 结点树、堆 5 块全释放 |
| vmodel | struct 布局（`Node{data@0,next@4}` size=8）、数组聚合、VObj 字段表、2i+1/2i+2 树关系 |

## 11.1 M2 期间发现并修复的 5 个真 Bug（都影响 M3，必须记住）

| # | Bug | 症状 | 修法 |
|---|---|---|---|
| 1 | 入口插桩被 `balanced('{')` 守卫挡住 | trace 里**一个 E 事件都没有** → 活动记录永远为空 | 该守卫对单独 `{` 恒为假；改为只要求该行含 `{` |
| 2 | `__avc_e()` 紧跟 `{` | 违反 **C89 声明必须在块首** → `int a[N];` 报 `Missing '}'` | 把进入点挪到"最后一个前导声明之后、第一条语句之前"（`enterAt` + 事后加前缀） |
| 3 | dump 在 `free()` 之后被调用 | 悬垂指针解引用 → 进程崩溃（`referenced memory at 0x0000010c`） | 生成 `__avc_ptr_ok()` 范围守卫，`> 0x1000 && < 0x7F000000` 才解引用 |
| 4 | 链表 dump 跨步累积 | `head` 结点数一路增长，永远不等于实际长度 | `L` 事件 idx==0 时清空该变量的结点表（等价原版"重建对象列表"） |
| 5 | 出栈时机会扭曲教学语义 | 单步停在 `return` 时活动记录已消失 | **显示栈**与数据栈分离：`S` 到达时快照活帧，变量仍按真实深度归属 |

## 11.2 环境坑（复现时必看）

- 沙箱里 `Start-Process node` 起的服务会随命令结束被回收；**必须用后台作业**或"起服务 + 跑测试"放在同一条命令里。
- 端口上可能残留**旧版本**服务进程（本机 8770 曾残留），导致"代码改了但行为不变"。验证前先 `netstat -ano | findstr :8770` 确认 PID 并 `taskkill /F /PID`，或直接换端口（`PORT=8773 node server/server.js`）。

单链表（A）、双向链表（B）、普通二叉树（C）、顺序表（E）。

---

## 10.6 本章变更记录（v2.1）

| # | 变更 | 原因 |
|---|---|---|
| 1 | **稀疏矩阵十字链表改为一物两画法**：A 十字链视图（`linkView`/B 族）+ B 稀疏矩阵视图（`arrayView`/E 族），默认 A，见 §10.2.1 | 你的指示：给两种画法；同时区分"存储表示"与"逻辑结构"两个观察视角 |
| 2 | **并查集从 `双亲树` 条目拆出**，单列为集合结构 #26 | 采纳上一轮建议：`UFSet` 本质是等价类划分（集合结构），`PTree` 才是树形 |
| 3 | 分类总数改为 **线性 10 · 树形 11 · 图形 3 · 集合 2 = 26 条模板**（源自 25 条 DB 条目） | 由变更 2 导致 |
| 4 | §10.3 覆盖结论更新：**A/C/E 覆盖 17 项，B/D/F 覆盖剩余 9 项** | 条目数与族归属重算 |
| 5 | `dsCatalog` 的 `variants` 字段增加 `['cross','matrix']` 示例 | 支撑变更 1 的画法切换 |
| 6 | §10.4 五个边界项全部标注"已定稿"，不再是待议 | 本章定稿 |

**对实现的净影响**：
- `arrayView` 增加 `sparse` 模式（只画非零元 + 网格标尺）→ 约 +40 行
- `linkView` 支持 `edgeKind` 双色边（`right` 蓝 / `down` 品红）→ 与 §9.2 的 B 族共用
- `treeView` 增加"森林"渲染（并查集：多棵树 + 根结点 `class #k` 角标）→ 约 +30 行
- 后端 dump 生成器：B 族需支持"两个具名后继按 `edgeKind` 标注"（同一份代码同时服务广义表/十字链/图十字链/双链树）




---

# 12. M3 执行记录（已完成）

**验收**：`node server/test-m3.js` → **29 项全绿**；`node server/test-m2.js` 回归 **81 项全绿**。

| 模块 | 文件 | 对齐原版 | 关键实现 |
|---|---|---|---|
| 配色 | `theme.js` | `anyview.ini` 7 段 | 键名沿用 ini；Delphi `TColor` 0x00BBGGRR → CSS；速度三档 `MinTime/MaxTime/SpeedIndex` |
| 格子原语 | `memcell.js` | `MemCellUnit` | 三段式（名/值/地址）；`state ∈ empty/node/focus/freed`；**地址越界不绘制** |
| 栈堆 | `stackheap.js` | `TStackHeapForm` + 3 变体 | `renderStack`(活动记录) / `renderDSStack`(SqStack) / `renderDSHeap`(Heap 数组+树形) / `renderHeapBlocks`(malloc 块) |
| 数组 | `arrayView.js` | `TOneArrayForm`/`TTwoArrayForm` | 一维 `Shape×ShowGrid×ShowLine` + X/Y 轴 + 两段短线箭头 + 刻度 + 双焦点；二维 柱状/曲面等距线框/稀疏网格 |
| 链表 | `linkView.js` | `TLinkForm` | 三段式 layout→paint；**4 条独立边**；直角折线；两段短线箭头+圆点；head 标记；7 参数 |
| 树 | `treeView.js` | `TTreeForm` | **可折叠 DOM 树**（不自绘，绘图 API=0 的原版路线）；两状态图标；就地编辑；森林；`paintHeapTree`(i→2i+1/2i+2) |

**M3 期间发现的问题（含一处参考资料错误）**：

| # | 问题 | 结论 |
|---|---|---|
| 1 | `int m[R][C]` 被解析成一维 | declarator 正则只抓第一处方括号 → 改为捕获连续多个 `[...]` |
| 2 | 报告 `10_COLOR_INI.md` 把 `MemNode=16776960` 标注为"黄" | `0x00FFFF00` 在 Delphi 是 **clAqua（青）**；`clYellow = 0x0000FFFF`。`theme.js` 按 BGR 正确转成 `#00ffff`，测试注释已标明该报告笔误 |

**未做（明确留在 M4/M5）**：菜单栏 45 条命令、视图显隐/最大化管理、跟踪设置对话框、26 项 `dsCatalog`、配色面板 UI、§9.9 的三处后端增强（焦点对事件 `W`、静态 struct 偏移表、`session.addressOf`）。

---

# 13. M4 + M5 执行记录（已完成）

**验收**：`node server/test-m4m5.js` → **33 项全绿**（M2 81 项、M3 29 项保持全绿）。

| 里程碑 | 模块 | 交付 |
|---|---|---|
| M4 | `menubar.js` | 7 个菜单、约 45 条命令；命令由 `app.js` 注册到 `AVC.menubar.commands`；视图菜单运行时由 `viewmgr` 动态填充；Ctrl+N/O/S/F/G 快捷键 |
| M4 | `viewmgr.js` | 10 个窗的显隐 / 最大化 / 恢复布局；本地持久化（`avc.viewpref`）；绑定各窗 `▣` 按钮；3D 窗占位不参与切换 |
| M4 | `dialogs.js` | ①跟踪设置（左：跟踪字段，右：26 项模板按逻辑结构分组单选，持久化 `avc.track`）②数据结构类型定义插入 ③配置（配色 + 速度三档）④帮助/关于 |
| M5 | `dsCatalog.js` | **26 条模板**（线性 10 / 树形 11 / 图形 3 / 集合 2）+ 4 个通用原型；每条带 `logical/cTypes/renderer/dumpFamily/variants`；`findByCType()` 供自动识别 |
| M5 | `theme.js`（扩展） | 配置面板按 ini 分段改色，`theme.apply()` 即时写 CSS 变量并触发重绘；速度用 `SpeedIndex(1..5)` + `MinTime/MaxTime` 插值 |

## 13.1 联动关系（M3 ↔ M5）

`renderDsPane()` 现在会查 `avc.track` 里用户为某变量指定的模板：
- `renderer = dsStack / dsHeap / arrayView / treeView / linkView` 分别走对应渲染器；
- 未指定时按 `lists[].shape` 自动回落（tree → `treeView`，其余 → `linkView`）。
这就是原版 `TTrackForm.ListView_LinkType` 的等价物：**手工指定为主，自动识别为辅**。

## 13.2 仍未做（明确遗留）

| 项 | 原因 |
|---|---|
| §9.9 三处后端增强：`W` 焦点对事件、静态 struct 偏移表下发、`session.addressOf()` | 需改 `instrument.js` 与 `trace.js`；当前偏移在前端 `vmodel.structLayout()` 现算，已够 M3 使用 |
| 双焦点真值（`ArrOneFocus1/2`） | 现用"本步变化 + 相邻元素"近似；要精确须后端发 `W` 事件 |
| 浏览器端人工验收（截图级） | 沙箱内无图形浏览器；已用 DOM shim 覆盖渲染器逻辑（29 项）+ 菜单/视图/对话框（33 项） |
| 打印 / 3D / 远程题库 | 范围外（PLAN §1） |
