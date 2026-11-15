# custom-code：编译器与「自动识别」

本目录有两条**互不影响**的自定义代码链路：

| 链路 | 入口 | 编译器 | 能做什么 |
| --- | --- | --- | --- |
| **极简模式**（既有） | `runner.js` + `compile-source.js` | `third_party/open-watcom/builder/.../bwcc386.exe` | 用户写一个 `void sort(int a[], int n)` 函数体，由自制子集翻译器包成 C，产出 `write/condition` 事件（只有一维 int 数组） |
| **自动识别**（本批新增） | `detect-engine.js` + `source-engine/` | 同上 | 任意教学级 C/C++：静态识别结构（不编译）+ 整程序真编译插桩（拿真实指针/堆/行事件） |

## 自动识别怎么用

```
GET  /api/detect/health     工具链 + 26 项数据结构目录
POST /api/detect            {code}            → 静态识别（毫秒级，不起进程）
POST /api/detect/trace      {code, language}  → 真编译 + 插桩 + 运行，返回事件与结构声明
```

三个接口都只接受**本机**工作台的请求（`acceptsLocalCode`，与 custom-array 同一把锁）。

前端：`frontend/src/features/custom-code/detect-panel.js`（`#detect-panel`），
选到「自定义代码」后自动识别，输入去抖 600ms，点条目跳到源码行。

## 实现构成

```
detect-engine.js              ESM 门面：detectStatic / traceProgram / engineHealth / dataStructures
source-engine/                base（drivenengine/base）的原样拷贝，CJS，带自己的 package.json
  server/instrument.js        AST 声明表 + 插桩改写（39 KB）
  server/compile.js           编译/链接/运行（文件重定向 stdio，沙箱友好）
  server/env.js               工具链定位（**本项目追加** third_party/open-watcom 探测）
  server/trace.js             __avc_trace.txt → 紧凑事件数组
  server/cpp98.js             C++11→C++98 降级（Watcom 前端只到 C++98）
  web/js/{ast,dsCatalog,detect}.js  识别器（IIFE + AVC 全局命名空间）
  runtime/avctrace.h          插桩运行时（**本项目改动**：去掉未使用的 <string.h>）
```

## 相对 base 的三处必要改动（都已落地）

1. **工具链定位**：`env.js` 的探测列表增加 `<仓库>/third_party/open-watcom`
   —— 本仓库的工具链就在那里，不改它找不到编译器。
2. **补齐官方 Watcom 运行库**：`third_party/open-watcom/owcpp/boot/lib386/` 里原来只有
   `nt/{clib3r,kernel32,plbx3r,user32}`，插桩运行时用 `%.6g` 打印 double，
   链接需要 `math387r.lib` + `emu387.lib` + `noemu387.lib`（合计 84 KB，官方产物）。
   补上之前的表现是：`file clib3r.lib(setefg.c): undefined symbol _EFG_Format_`。
3. **`avctrace.h` 去掉 `#include <string.h>`**：该头文件只用 `sprintf`（来自 stdio），
   而 `third_party` 的头文件是裁剪版（只有 6 个）。去掉后无需扩充头文件集合。

另外 `compile.js` 新增可选 `std: 'c99'`（传给编译器 `-za99`）：
C 默认按 C89 解析（声明必须写在语句前），学生会写 `for (int i = 0; ...)`。
自动识别链路默认开启 C99；极简模式那条链路不受影响。

## 实测基线（本机，raw 工具链）

| 场景 | 结果 |
| --- | --- |
| 静态识别：`typedef struct Node *LinkList` / `queue<int>` / 嵌套模板 / `struct T{key,left,right}` | 全部识别，来源 `ast` |
| 静态识别：注释里的 `vector<int> g[N]`、纯 int 变量 | 0 项（不误报） |
| 用户那段 BFS（`vector<int> g[N]; bool vis[N]; queue<int> q;`） | 3 项，全部 `ast`，置信 0.88~0.96 |
| 整程序插桩（链表 4 结点） | 421 ms / 16 步 / 207 事件（E5 S16 HA4 L150 LE25 X5 V2），`degradedMode: full`，结构 `Node:list{key,next*}` |
| C99 写法（循环内声明） | 编译通过、可插桩、可运行 |

测试：`tests/detect.test.mjs`（7 项）、`tests/detect-panel.test.mjs`（5 项，假 DOM）。

## 边界（写明，不静默）

- **只支持整程序**（含 `main`）；极简模式的"函数体 + 自动 main 夹具"仍是旧链路。
- 目标代码 32 位 PE（Watcom 无 x64 后端），Win64 靠 WOW64 跑。
- 插桩是**源码改写**：不支持的写法会按 `full → no-dump → trace-only` 降级，
  仍失败则返回 `stage: 'instrument'` 并在 `degradedMode: null` 中体现，不假装成功。
- 静态识别是启发式：同构结构（三叉链表 vs 图十字链、双链树 vs 孩子兄弟）在代码层面不可区分，
  需要运行时形状判定（base 的 `shape.js`）或人工指定兜底。
- 本批**只做识别**：识别结果尚未驱动渲染（下一步才是 `trace → layers[]` 接 plus 渲染器）。

## 步骤1：循环体插桩（for/while 每轮出步）

`source-engine/server/instrument.js` 新增 `markLoopCondition()`：把打点塞进**循环条件表达式**，
不改语句结构：

```
while (cond)          →  while ((__avc_t(L), (cond)))
for (a; cond; c)      →  for (a; (__avc_t(L), (cond)); c)
do { … } while (cond) →  do { … } while ((__avc_t(L), (cond)))
```

- 只有一个 `for` 语句的循环（`for (...) a[i]=i*i;`）以前整段只有 **1** 个 S 事件，现在每轮一个（3 轮 → 4 次，含最后一次判假）。
- `switch` / 跨行循环头不动（返回 `null`，按原样处理）。
- 实测 26 个 C 样例全部编译/插桩/运行通过，输出语义不变（冒泡结果仍有序、二分仍命中）。

## 步骤2：函数体 + 自动 main 夹具（接上引擎）

`function-harness.js`：

```
buildHarness({source, array})   找 `void f(int a[], int n)` 入口 → 拼 include/输入数组/main 夹具，
                                记住前导行数（把引擎行号换算回用户源码行号）
engineTraceToRun({trace,…})     引擎事件 → custom-array 的 steps（array / variables{line,index,writes}）
```

`runner.js` 新增 `runCustomCodeWithEngine()`；`POST /api/algorithms/custom-array/runs` 带
`mode:'engine'` 就走这条链路，**不带仍是老的极简翻译器**（老行为零改动）。前端先试引擎，
失败时回退极简模式并说明原因（不静默换引擎）。

同时给插桩补了**数组形参的元素 dump**（`void f(int a[], int n)` 里的 `a` 不是变量声明，原来完全看不到
`a[]` 的值）：

```c
if (a) { int _avc_pa; for (_avc_pa = 0; _avc_pa < (n) && _avc_pa < 24; _avc_pa++)
           __avc_ai(line, "a", _avc_pa, (long)a[_avc_pa]); }
```

实测（冒泡，输入 5,1,4,2）：25 步 / 8 次写入 / 最终 `[1,2,4,5]`，第一步就是输入数组本身，
行号严格落在用户源码 1..12 内，`variables.index` 恒在数组范围内（既有 `validateRun` 通过）。

**已知边界**：插桩按"一条语句一行"工作，`if (...) { a=x; b=y; }` 挤在一行时那两行不会被插桩 →
引擎会返回 0 次写入并在 `notice` 里要求拆行（前端会红字提示），不静默交付空回放。

## 步骤3：trace → layers[] 适配器（接进 plus 渲染器，不改 Step v1 schema）

`engine-layers.js` 把引擎事件折叠成 plus 只认的 `layers[]`（`{id,title,style,props,data,roles}`）：

| 引擎事件 | 判据 | 折叠成 |
| --- | --- | --- |
| `V name[i]` | 数组元素快照 | **style 1**（值 + 聚焦本步第一个变化的元素） |
| `L` + `LE(shape=list)` | 结点 + 后继 | **style 3**（nodes/links/head） |
| `L` + `NM(left/right)` + `LE(shape=tree)` | 父子索引 | **style 9**（nodes 带 left/right + 唯一 root） |
| `N` + `NE` | 图结点与边 | **style 10**（nodes/edges） |

配套改动：

- 插桩的**树 dump 新增父子索引**：`NM|var|idx|left=<子结点BFS下标>` / `right=…`
  （原来只发 `L`，没有父子关系，树根本画不出来；`07_bitree.c` 实测 7 结点、root 唯一）。
- **指针去重**：walker 追到野指针/环时会走满上限（表现为"永远 24 个结点"）。
  适配器按 `L` 里的地址去重，遇到重复地址即截断 —— 网上样例的结点数从 24 降到 1~5（真实长度）。
- 悬空孩子引用会被裁掉并记 `data.truncatedChildren`（`MAX_NODES=32` 与运行时上限一致）。
- `POST /api/detect/trace` 支持 `withLayers:true`，返回 `layerRun`（每步一层）；请求体上限从 10KB 放宽到 256KB。
- 前端 `engine-program.js`（`runEngineProgram`）把 `layerRun` 组装成 `plus:true / structure:'structure'` 的 run，
  直接交给 `createPlusView`（svg-stage）渲染；`app.js` 里"写了 `int main` 就是整程序模式"。

## 步骤4：网上真实样例 + 端到端测试

- 样例：`frontend/samples/ll-iitg.c` —— IIT Guwahati CS1109 课程代码
  <https://fac.iitg.ac.in/asahu/cs1109-25e/DSCode/LL.c>（322 行，插入/删除/查找/反转/最值，
  用到 struct、malloc、函数指针、bool）。**原样保存，未改动**，测试用 sha256 钉住：
  `5c5febb2a55a0a600749a8345b3fbf5e85a6dc4931c692eff22b864a4f8d1aaf`。
- 为了让它能编过，补了两个**兼容垫片**（`source-engine/runtime/compat/`，compile.js 会自动加进 INCLUDE）：
  `stdbool.h`（C99 bool/true/false）与 `stdint.h`（定宽类型）；另外 `traceProgram` 会去掉粘贴代码的 UTF-8 BOM
  （Watcom 会把 BOM 报成非法字符）。
- 实测：`ok:true` / `degradedMode:'full'` / **312 步 / 1690 事件** / `layerRun.style=3` / `families=['list']`，
  再经 vendor 的 svg-stage 渲染 40 步无异常、DOM 元素数 ≥ 图元数。
