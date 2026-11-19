# 可视化视窗（Viewport）—— 独立实施计划

> ## 📌 独立性声明
> **本文件是第三份独立计划**，不与 `PLAN.md`、`PLAN_DETECT.md` 合并，也不以它们为前提。
> · 里程碑编号自成体系：**V1 / V2 / V3 / V4 / V5**（V5 为后续阶段）
> · 引用其它文件仅作**出处说明**，不影响本文件单独执行；
> · 本文件范围内的 26 项清单与 shape/meta 对照已内联于 §7，无需翻阅其它文件。

---

## 0. 本次改动目的

### 0.1 一句话

> **把"识别出来的数据结构"变成"用户可切换、可配置、可并排观察的可视化视窗"——本期先做到「在视窗里切换你想看的数据结构」，并为「多个结构放进同一个可拖拽窗口、逐窗指定显示内容」预留接口。**

### 0.2 已定契约（**不可再改**）

```
① 采集层产出 N / E / M 三类事件
② 渲染器只按 shape ∈ {list, tree, graph, seq, stack, heap} 选绘画方式
③ 渲染器不认结构名（'btree' / 'trie' / 'rbtree' 只出现在登记表里）
```

> 契约由用户批准。任何实现不得引入"按结构名分派"的分支；新增结构只能新增登记行。

### 0.3 触发事实

当前状态（用户实测截图）：

- **识别已可用**：BFS 代码识别出 4 项（邻接表 96% / 队列 92% / 标记数组 88% / 一维数组 70%），带行号与置信度；
- **跟踪已可用**：36 步，运行栈出现 `main` / `bfs` 帧；
- **但可视化仍空**：`vector<int> g[N]`、`queue<int>`、`bool vis[N]` **没有产出 N/E/M 事件**（采集层无 STL dump），也**没有"选择看哪个结构"的界面**。

### 0.4 本期范围

| 做 | 不做（V5 及以后） |
|---|---|
| 定死 N/E/M 协议 + 统一图模型 | 多结构**同时**并排（可拖拽多窗口） |
| STL 泛型 dump + `new/delete` 挂钩 | 每个窗口独立的观感参数面板 |
| **单视窗 + 结构切换器**（核心） | 布局持久化到服务端 |
| 26 项 shape/meta 登记 + 回归矩阵 | 3D、打印、远程题单 |

---

## 1. 架构（四层 + 视窗）

```
源码
 ├─① 检测（AST/正则）─────────────────────────────────────┐
 └─② 跟踪（session）──► shape 判定 ──┐                    │
                                     ├─► 仲裁 arbitrate() ─► viewModels[]（候选清单）
                                     │                         │
 采集层（C/C++ dump）                                          ▼
   a 指针 walker  ─┐                             ┌──────────────────────────┐
   b STL 泛型     ─┼─► N/E/M 事件 ─► graph.js ──►│  Viewport（可切换视窗）  │
   c 声明驱动     ─┘   （协议）     （统一图模型）└────────────┬─────────────┘
                                                             ▼
                                          shape 分派（只认 6 种形状）
                                          list→graphView(chain)
                                          tree→graphView(hierarchical)
                                          graph→graphView(force)
                                          seq→arrayView
                                          stack/heap→stackheap
```

### 1.1 三期能力（同一套接口，逐期增强）

| 期 | 视窗形态 | 用户操作 |
|---|---|---|
| **V3（本期）** | 演示区内**单视窗** + 顶部**切换器**（下拉/标签） | 从识别出的候选里选一个看 |
| V5-a | **多视窗并排**（各自绝对定位、可拖拽、可缩放） | 拖拽摆位、每窗选自己的结构 |
| V5-b | 每视窗**独立观感配置**（画法/参数/配色） | 逐窗调参并持久化 |

---

## 2. 事件协议 N / E / M（**本期定死，之后只增不改**）

> 实际落地时的线上标签见 §12.1：边事件用 `NE`（`E` 已被"进入函数"占用），`M` 负责长度与元信息。

| 事件 | 行格式 | 说明 |
|---|---|---|
| **N** | `N\|var\|idx\|value\|kind` | 结点/元素。`idx` 是结构内序号（链表序、数组下标、堆序号、顶点号）；`kind` ∈ `i/d/s/none`（可选） |
| **E** | `E\|var\|from\|to\|edgeKind\|label` | 边。`from/to` 是 `idx`；`edgeKind` ∈ `next/prev/left/right/parent/child/adj/right-down/level/chain/hp/tp`；`label` 可选（如 B 树子指针序号） |
| **M** | `M\|var\|key=value;…` | 元信息（**无边结构全靠它**）：`len/top/size/degree/color/tag/bucket/vertex/edgeCount/capacity` |
| 复用 | `V\|line\|name\|kind\|value` | 标量变量（已有） |
| 复用 | `HA/HF` | 堆块分配/释放（已有） |
| 结束 | `NE\|var\|count` | 该变量本轮结束（替代/兼容现有 `LE`） |

**为什么这三类够用**（26 项全部可表达）：

| 结构族 | 表达方式 |
|---|---|
| 顺序表/顺序栈/循环队列/堆 | `N` + `M(len,top)`，**不发 E** |
| 单链表/循环链表 | `N` + `E(next)` / `E(prev,next)`；成环靠 `to` 回指 |
| 二叉树/线索/红黑/三叉 | `N` + `E(left,right[,parent])` + `M(color,tag)` |
| B-/B+/Trie/孩子树/双链树 | `N` + `E(child,label=k)` 或 `E(child,sibling)` + `M(degree)` |
| 邻接表/矩阵/图十字链 | `N(顶点)` + `E(adj)` / `E(right,down)` + `M(vertex,edgeCount)` |
| 堆/赫夫曼 | `N` + `M(size)`（父子由 idx 运算推出，**不发 E**） |
| 哈希（链式/开放） | `N(桶)` + `E(chain)` / `N` + `M(bucket)` |
| 并查集 | `N(parent[])` 或 `E(parent)` + `M(classId)` |
| 跳跃表 | `N` + `E(level)` + `M(levels)` |
| 广义表/多项式/索引表 | `N` + `E(hp,tp)` / `E(next)` |
| 稀疏矩阵十字链表 | `N(非零元)` + `E(right,down)` + `M(i,j,v)` |

---

## 3. 统一图模型 `graph.js`（前端唯一入口）

```js
// N/E/M 事件 → 渲染器可直接消费的模型
buildGraph(events, varName) -> {
  var: 'g',
  shape: 'graph',                 // 由仲裁层给出；渲染器只认它
  nodes: [{ idx, value, meta:{} }],
  edges: [{ from, to, kind, label }],
  meta:  { vertex:4, edgeCount:4, len:null, top:null, ... },
  stats: { nodeCount, edgeCount, cyclic }   // 给 UI 显示"判据"
}
```

- **渲染器禁止直接读 events**（同契约 ③）。
- `graph.js` 负责：按 var 分组、去重、建邻接表、算出/入度与环、给布局提供层次信息。

---

## 4. 视窗组件（V3 核心）

### 4.1 组成

```
┌ 视窗 ────────────────────────────────────────────────────────┐
│ [切换器 ▾ 邻接表 g]  [shape: graph ▾]  [参数…] [▣]            │ ← 工具条
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                渲染区（按 shape 分派）                        │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ 来源：运行时+静态 · 置信 96% · 依据：vector<T> g[N]           │ ← 状态行（可含 N/E/M 与 stats）
└──────────────────────────────────────────────────────────────┘
```

### 4.2 切换器（本期最关键的交互）

- **数据源**：`arbitrateAll()` 产出的 `viewModels[]`（每项 = 一个可看的结构）
- **展示形式**：V3 用 `<select>`（结构多时可用标签页），条目形如
  `邻接表 g (graph·运行时 96%)`、`队列 q (seq·静态 92%)`、`标记数组 vis (seq·静态 88%)`
- **行为**：切换后仅重绘渲染区，**不重跑 trace**（数据已在内存）
- **空态**：无候选时显示"本步没有可画的成果（需先按 F8 运行；STL 容器需采集层支持）"

### 4.3 每个视窗的设置（持久化）

```js
localStorage['avc.viewports'] = {
  active: 'g',
  items: { 'g': { shape:'graph', layout:'force', params:{nodeSize:1,spacing:1} },
           'vis': { shape:'seq', style:'grid' } }
}
```

- V3 只存"当前选中 + 每结构上次用的 shape/参数"；
- V5 扩展为 `bound: {x,y,w,h}` 供拖拽使用（**接口先留，不实现**）。

### 4.4 shape → 渲染器 + 所需 meta（分派表）

| shape | 渲染器 | 布局 | 依赖 meta | 代表结构 |
|---|---|---|---|---|
| `list` | graphView | chain（含折返的画环） | `len`、`edgeKind` | 线性表/链队列/多项式/索引表/广义表/双向/循环 |
| `tree` | graphView | hierarchical（层序） | `degree`、`color`、`tag` | 二叉树/线索/红黑/三叉/B-/B+/Trie/孩子树/双链树/赫夫曼 |
| `graph` | graphView | force / 环形 | `vertex`、`edgeCount` | 邻接表/邻接矩阵/图十字链/链式哈希 |
| `seq` | arrayView | 一维格子/网格/柱状 | `len`、`dims` | 顺序表/循环队列/短字符串/标记数组/开放寻址哈希 |
| `stack` | stackheap | 竖向堆叠 + top | `top`、`capacity` | 顺序栈 |
| `heap` | stackheap | 数组形态 / 完全二叉树 | `size` | 堆/赫夫曼 |

---

## 5. 采集层三期（协议的上游，决定"有没有 N/E/M"）

| 采集器 | 手段 | 覆盖 |
|---|---|---|
| **a 指针 walker**（已有） | 顺自引用字段遍历 + 环保护 + 指针合法性校验 | 链表族、树族、十字链、广义表 |
| **b STL 泛型**（本期新增） | 只用公有 API（`size/[]/front/pop`），生成 8 个模板 dump：`vector / deque / list / queue / stack / priority_queue / map,set / unordered_*` | `vector<int> g[N]`、`queue<int>`、`map` 作哈希、`priority_queue` 作堆 |
| **b' `new/delete` 挂钩** | 在 `avctrace.h` 里重载 `operator new/delete` → 复用 `HA/HF` | 堆窗可见 `vector` 扩容 |
| **c 声明驱动**（P4/后续） | `dsCatalog` 里每条登记 `node/keyField/childField/deg` → 同一份 walker + 不同参数 | B树/Trie/孩子树/并查集/跳跃表 |

**限流铁律**（否则 `g[100010]` 会拖死页面）：

- 数组型容器只 dump **非空桶**，边数上限 64、结点上限 32；
- 每步每个变量最多一次 dump；
- 元素类型推导失败 → **降级为只发 `M(len)`**（只显示长度），绝不因此编译失败。

---

## 6. 里程碑

| 里程碑 | 内容 | 完成判据 |
|---|---|---|
| **V1 协议与图模型** ✅ | 定死 N/E/M/NE；实现 `graph.js`；把现有 `L/LE` 事件**映射**成 N/E（不改后端即可先跑通 list/tree） | 现有 5 个样例在"临时映射"下能画出链表/树；`test-viewport.js` 中协议用例全绿 |
| **V2 采集层** ✅ | STL 泛型 dump（8 模板）+ `new/delete` + `arrayDims` 支持 `const int N=…` + 插桩白名单加 `bool` | **BFS 代码的 `vis` 出现在数组窗**；`queue q` 有 N/M；堆窗出现 `vector` 扩容块 |
| **V3 视窗 + 切换器**（本期核心） | 视窗组件、候选清单、切换器、空态、设置持久化、来源徽标 | BFS 代码下切换器列出 **4 项**，逐个切换都能正确渲染；刷新后记住上次选中 |
| **V4 26 项登记 + 回归** | `dsCatalog` 补 `shape/dump/emit`；`samples/ds/26_*.c` 回归矩阵 | 26 项每项断言 `shape + 关键 meta` 通过 |
| **V5（后续阶段，不在本期）** | 多视窗并存：绝对定位、拖拽、缩放、每窗指定结构、逐窗参数 | 拖两个窗口并存、各自显示不同结构且互不干扰 |

---

## 7. 26 项 → shape + meta 对照（登记表草案）

| # | 结构 | shape | 关键 meta / edgeKind | 采集器 |
|---|---|---|---|---|
| 1 | 线性表 `SqList/LStr` | seq / list | `len`；`next` | b / a |
| 2 | 顺序栈 `SqStack` | stack | `top` | b(seq) |
| 3 | 链队列 `LinkQueue` | list | `next`；`M(front,rear)` | a |
| 4 | 循环队列 `SqQueue` | seq | `len`、`front`、`rear`、`cyclic` | b |
| 5 | 短字符串 `SStr` | seq | `len` | b |
| 6 | 一元稀疏多项式 | list | `next`；`M(coef,exp)` | a |
| 7 | 索引表 `IdxList` | list | `next` | a |
| 8 | 跳跃表 `SkipList` | graph | `level`；`M(levels)` | c |
| 9 | 广义表 `GList` | list | `hp`、`tp` | a |
| 10 | 稀疏矩阵十字链表 | graph | `right`、`down`；`M(mu,nu,nnz)` | c |
| 11 | 三叉链表 | tree | `left/right` + `parent` | a |
| 12 | 双亲树 `PTree` | tree | `parent`；`M(n)` | c（parent 数组） |
| 13 | 孩子树 `CTree` | tree | `child`；`M(degree)` | c |
| 14 | 线索二叉树 `BiThrTree` | tree | `left/right`；`M(tag)` | a |
| 15 | B- 树 `BTree` | tree | `child`；`M(degree,keys)` | c |
| 16 | B+ 树 `BpTree` | tree | 同上 + `M(leafLink)` | c |
| 17 | 红黑树 `RBTree` | tree | `left/right`；`M(color)` | a |
| 18 | 堆 `Heap` | heap | `M(size)`（父子由 idx 推） | b(array) |
| 19 | 堆-赫夫曼树 | heap / tree | `M(size)`；可选 `left/right` | b + a |
| 20 | Trie 树 | tree | `child`；`M(char)` | c |
| 21 | 双链树 `DLTree` | tree | `child`、`sibling` | c |
| 22 | 邻接表 `ALGraph` | graph | `adj`；`M(vertex,edgeCount)` | **b（本期）** |
| 23 | 邻接矩阵 `MGraph` | graph | `adj`；`M(vertex,matrix=true)` | b(array2d) |
| 24 | 图十字链表 `OLGraph` | graph | `firstin`、`firstout` | c |
| 25 | 哈希表 `HashTab` | graph / seq | `chain`（链式）/ `bucket`（开放） | b / c |
| 26 | 并查集 `UFSet` | tree | `parent`；`M(classId)` | c |

---

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 采集层写错导致编译失败 | 每个 dump 函数独立 try（C 无异常则用**编译期开关 + 降级链**：`full → 无 STL → 仅标量`），任一级失败自动降级 |
| `g[100010]` 拖死页面 | 只 dump 非空桶 + 结点/边上限 + 每步单次 dump |
| C++ 元素类型无法推导 | 降级为 `M(len)` 只显示长度；UI 标注"仅长度" |
| 切换器候选随时间抖动 | 取"本轨迹内出现过的候选并集"，不随单步变化闪烁 |
| 协议被后续需求挤压 | 只允许**新增** edgeKind / meta key，不允许改 N/E/M 的字段位置与含义 |
| 与 V5 的多窗冲突 | Viewport 从一开始就是**可实例化组件**（`createViewport(opts)`），V3 只创建 1 个实例；V5 创建 N 个 + 加拖拽 |

---

## 9. 明确不做（本期）

| 不做 | 理由 |
|---|---|
| 多窗并排 / 拖拽 / 缩放 | 用户已明确"暂时这样，后面再做" → 归 V5 |
| 每窗独立配色面板 | 归 V5；本期沿用全局 theme |
| 3D 视图 | 全局范围外 |
| 采集层支持任意用户自定义结构 | 靠 V4 的登记表 + 声明驱动，不做通用形状分析 |

---

## 10. 一句话

> **本期交付"一个视窗 + 一个切换器"：识别出什么结构，就能在里面切换看什么；渲染只看 shape 不看结构名，所以 26 种结构共用 6 种画法；V5 再把同一个组件实例化成多个可拖拽窗口。**

---

## 11. V1 完成记录（已落盘、已验证）

### 11.1 新增/改动

| 文件 | 变更 |
|---|---|
| `web/js/graph.js` **新增** | N/E/M 唯一入口：`fromEvents` / `fromSnapshot`（V1 临时映射，V2 后退化为兜底）/ `fromArray`；`finalize` 算出 `stats{nodeCount,edgeCount,cyclic,maxOut,roots}` 并把 in/out 度写进 `node.meta`；`shapeFromCatalog(tplId)` 是**「26 项 → 6 shape」的唯一登记点**（新增结构只加一行） |
| `web/js/viewport.js` **新增** | `createViewport({host,onSelect})`：自绘切换器 + `shape:` 标签 + 统计行；`renderActive()` **只按 shape 分派**（seq→arrayView / stack·heap→stackheap / list·graph→linkView / tree→treeView）；`buildCandidates(snap,arbItems)` 把仲裁结论 ∪ 运行时数据去重排序（有数据优先 → 来源 → 置信度）并标 `hasData`；`setShape()` 支持手工改画法，偏好写 `localStorage['avc.viewports']`；`getRect/setRect` 为 V5 预埋 |
| `web/js/app.js` | `renderDsPane` 改为视窗驱动（`detect → shape.analyze → arbitrateAll → buildCandidates → viewport`），旧的渲染逻辑整体保留为 `renderDsPaneLegacy` 兜底 |
| `web/index.html` | 结构窗 header 的 `#dsPick` 移除（切换器移到视窗内自绘）；新增 `graph.js` / `viewport.js` 两个 `<script>` |
| `server/test-viewport.js` **新增** | 46 项断言（迷你 DOM，纯 node 跑，不依赖后端） |

### 11.2 顺带修掉的真 bug（阻塞 M2/插桩）

`web/js/ast.js` 的 `isDeclLine` 抓不住 **`struct Tag` 这种"两词类型"**：

```
struct Node *head = NULL, *p;   →  误判为 false
```

后果链：`instrument.js` 的"函数入口 `__avc_e` 放在前导声明之后"逻辑失效 → `__avc_e("create");` 被塞到 `struct Node *head…` **前面** → C89 报 `E1063/E1009` → 三级降级全失败 → `/api/trace` 返回 `stage:instrument` → M2「linked_list 跟踪成功」、`test-detect` D2 全部连带失败。

修法（`isDeclLine` 内加两条，仅**放宽**判定）：`^(struct|union|enum|class)\s+Tag\s*[*&]` 与 `…Tag\s+name\s*(?:\[\])*[;=,\[]`。

### 11.3 验证结果（全绿）

| 套件 | 结果 |
|---|---|
| `test-viewport.js`（新增 V1） | **46 / 0** |
| `test-m2.js` | **81 / 0**（修 bug 前 49/3） |
| `test-m3.js` | **29 / 0** |
| `test-m4m5.js` | **33 / 0** |
| `test-detect.js` | **38 / 0**（此前 36/37，也是同一个 `isDeclLine` bug） |

### 11.4 V1 已知边界（→ V2 补）

- `fromSnapshot` 仍是"读 `lists[]` 再拼 N/E"的**临时映射**；后端尚未真的发 `N/E/M`。
- 切换器**已能列出静态识别到但本步无采集数据**的结构（如 BFS 的 `q`/`vis`），点击只给可读提示——这正是 V2/V3 要填的洞。
- `seq` 仍走 `vmodel.groupArrays`（V 事件），未并入 `graph.fromArray`；V2 统一。

---

## 12. V2 完成记录（采集层）

### 12.1 协议落地（`runtime/avctrace.h`）

| 发射器 | 输出行 | 说明 |
|---|---|---|
| `__avc_n(var, idx, value)` | `N \| var \| idx \| value` | 结点 |
| `__avc_edge(var, from, to, kind)` | `NE \| var \| from \| to \| kind` | 边。**用 `NE` 而非 `E`**——`E \| depth \| fn` 已被"进入函数"占用 |
| `__avc_m(var, "k=v;…")` | `M \| var \| k=v` | 元信息 |
| `__avc_len(var, len)` | `M \| var \| len=n` | 元素类型推不出时的降级出口 |

`new/delete` 重载（`#ifdef __cplusplus` + `AVC_NO_NEW_HOOK` 开关）复用 `__avc_malloc/__avc_free` → 容器扩容进堆窗。**堆事件封顶 2000 条**：`vector<int> g[100010]` 一次构造就十万级 HA，不封顶会拖死 trace 与堆窗。

### 12.2 采集器（`server/instrument.js`）

| 能力 | 实现 |
|---|---|
| `bool` / `const int N=…` | `parseDecl` 基本类型加 `bool/_Bool`；`collectDefines` 额外收集 `const int N = 8;`（含多声明符）→ `arrayDims` 可解析 `vis[N]` |
| 8 类容器 | `parseCxxDecl` 认 `vector/deque/list/set/multiset/queue/stack/priority_queue/map/multimap/unordered_*(hash_*)`，保留用户写的类型文本用于 `::const_iterator` |
| 读取方式 | `vector/deque` 下标；`list/set` 迭代器；`queue` 拷贝后 `front/pop`；`stack/priority_queue` 拷贝后 `top/pop`；`map` 用**键作 idx**、值作结点值 |
| 邻接表 | `vector<int> g[N]` → 顶点=桶下标，桶内元素发 `NE(…,"adj")`；非空桶展开、顶点≤32、边≤64 |
| 限流铁律 | 结点≤32、边≤64；每步每变量一轮完整 dump（首条 `N` 的 idx=0 触发会话整轮替换）；元素类型不在数值白名单 → **只发 `M(len)`**，绝不硬转 `(long)` |
| 插桩预算修正 | `maxWatches` 原先按"生成的调用条数"计，一个 16 元素数组就把预算吃光、后面的 `g`/`q` 全丢；改为**按变量计** |

### 12.3 前端通道

- `session.js`：新增 `nxm[var] = [N/NE/M…]`；`N(idx=0)` 清掉上一轮 `NE`，`M(len=0)` 清掉上一轮结点（空容器不留残影）；`snapshot()` 带出 `nxm`。
- `graph.js`：`fromSnapshot` **首选 `snap.nxm`**，没有才回落到 `lists[]`；`fromEvents` 同时接受 `E` 与 `NE`。
- `viewport.js`：`buildCandidates` 把 `nxm` 也当数据源（有 `NE` → `graph`，纯 `N` → `list`），所以没有 `lists` 条目的 STL 容器也能进切换器。

### 12.4 验证

新增 `samples/09_stl_containers.cpp`（7 类容器 + `vector<string>` 降级样本）与 `server/test-v2.js`（**46 项**，真实调用自建 C++ 编译器）：

- 8 类容器全部出 `N`；`map` 键作 idx；`priority_queue` 按堆顶序；`vector<string>` 只出 `M(len)`
- BFS：`stdout="1 2 3 4"`、`degradedMode=full`、`steps=34`、事件 `{N:540, NE:208, M:49, V:645, HA:2000, S:34}`
- `snap.frames[].vars` 里出现 `vis[0..15]`（数组窗可见）；`graph.fromSnapshot(snap,'g')` 结点/边都 >0
- `/api/trace` 对 BFS **返回 `ok:true`**（此前是 `stage:instrument`）

回归：M2 **81/0**、M3 **29/0**、M4M5 **33/0**、V1 **46/0**、DETECT **38/0**、V2 **46/0**。

### 12.5 V2 已知边界（→ V3/V4）

- `list/set` 的迭代器类型直接抄用户写法，写成 `typedef` 别名的容器（`vi x;`）暂不识别。
- 嵌套容器（`vector<vector<int> >`）只发 `M(len)`。
- 邻接表的边目标是**顶点编号原值**（常见 1-based），与 0-based 结点序号可能不重合；渲染时悬空边被丢弃。

### 12.6 V2 收尾：三处真 bug（用户截图"数值永远不变"的根因）

用户用 BFS 原码实测，结构窗 16 个方框显示同一个值且单步不变化。定位出三个叠加缺陷：

| # | 缺陷 | 后果 | 修法 |
|---|---|---|---|
| 1 | 会话层"每轮重来"只清了 `NE`、没清 `N`；`graph.fromEvents` 又按 idx **保留首次出现** | 画面冻结在"第 0 步 g 还全空"的样子（全 0 方框） | 采集层每轮先发 `M \| var \| begin=1;len=n` 作**轮次标记**；会话层收标记清空该变量全部 `N/NE`；`fromEvents` 改**后到覆盖先到** |
| 2 | 邻接表对 `0..15` 每个桶都发 `N`，空的也发 | 16 个一模一样的方框（12 个是空桶） | 只画**非空桶**（`if (g[u].empty()) continue;`），与"限流铁律"一致 |
| 3 | 清边依赖 `N(idx=0)`，而只画非空桶后 0 号顶点常不存在 | 边跨步累积：8 → 208 | 改由 `begin=1` 清；`fromEvents` 再按 `from>to:kind` 去重 |

修复后实测（`samples/08_bfs_raw.cpp`，输入 `4 4 / 1 2 / 1 3 / 2 4 / 3 4 / 1`，36 步）：

| 步 | 行 | g（结点/边） | q | vis |
|---|---|---|---|---|
| 0 | 34 | 0n / 0e | — | `0000…` |
| 8 | 44 | 3n / 4e `1:2 2:1 3:1` | — | `0000…` |
| 14 | 44 | 4n / 8e `1:2 2:2 3:2 4:2` | — | `0000…` |
| 24 | 26 | 4n / 8e | `1n [2]` | `011100…` |
| 30 | 19 | 4n / 8e | `1n [4]` | `011110…` |
| 35 | 55 | 4n / 8e | `0n []` | `011110…` |

**语义提醒**：`g` 的结点值是**该顶点的度数**（桶大小），BFS 只读不写 `g`，所以它在读入阶段长完就不再变——这是对的；**随执行变化的是 `vis`（访问标记）与 `q`（队列）**，应在切换器里切到这两个看。

回归：`test-v2.js` 增至 **52 / 0**，新增 D 段 6 项断言（`begin=1` 标记、任一步边数 ≤8、结点值随步变化、第 0 步为空、中段出现非 0 度数、队列过程中出现元素）。
