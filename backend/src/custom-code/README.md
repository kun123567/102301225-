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
  `a1ac75dcb7b915f759cb8f6cb73b5a2f9a279bfac92b1866dfccbc80e70140aa`（**按 LF 归一化**后计算 ——
  行尾随平台变（CRLF/LF）不算内容被改，代码本身被改才算；`.gitattributes` 里也给
  `/frontend/samples/**` 加了 `-text`，避免 git 转行尾）。
- 为了让它能编过，补了两个**兼容垫片**（`source-engine/runtime/compat/`，compile.js 会自动加进 INCLUDE）：
  `stdbool.h`（C99 bool/true/false）与 `stdint.h`（定宽类型）；另外 `traceProgram` 会去掉粘贴代码的 UTF-8 BOM
  （Watcom 会把 BOM 报成非法字符）。
- 实测：`ok:true` / `degradedMode:'full'` / **312 步 / 1690 事件** / `layerRun.style=3` / `families=['list']`，
  再经 vendor 的 svg-stage 渲染 40 步无异常、DOM 元素数 ≥ 图元数。

## 允许哪些库（实测清单，见 tests/custom-headers.test.mjs）

工具链自带的 Watcom 头文件是**裁剪版**（只有 `stdio.h`/`stdlib.h`/`limits.h` + C++ 的 `cstdio`/`cstdlib`），
但 `clib3r.lib` / `math387r.lib` 里的函数符号是齐的。所以本项目用 `source-engine/runtime/compat/` 补了**声明垫片**
（只声明、不实现，全部带 `extern "C"`），C 与 C++ 都能用：

| 头文件 | 来源 | 典型可用函数 |
| --- | --- | --- |
| `stdio.h` / `stdlib.h` / `limits.h` | 工具链自带 | printf/puts/sprintf/scanf/fopen/fgets、malloc/free/calloc/realloc、atoi/atof/abs/labs、qsort、rand/srand、exit/abort/getenv/system |
| `stdbool.h` / `stdint.h` | 本项目垫片 | `bool/true/false`、`int8_t…uint64_t`、`INT32_MAX` 等 |
| `string.h` | 本项目垫片 | strlen strcpy strncpy strcat strncat strcmp strncmp strchr strrchr strstr strpbrk strtok memcpy memmove memset memcmp memchr |
| `math.h` | 本项目垫片 | sqrt pow fabs fmod sin cos tan asin acos atan atan2 sinh cosh tanh exp log log10 floor ceil ldexp frexp modf hypot + `M_PI` |
| `ctype.h` | 本项目垫片 | isalnum isalpha iscntrl isdigit isgraph islower isprint ispunct isspace isupper isxdigit tolower toupper |
| `assert.h` | 本项目垫片 | `assert(expr)`（NDEBUG 时失效；失败打印 文件:行 后 abort） |
| `time.h` | 本项目垫片 | time clock difftime mktime ctime localtime gmtime strftime（时区细节不保证） |

**不可用**（实测 `unable to open`）：`iostream`、`vector`、`algorithm`、`queue`、`stack`、`map`、`cstring`、`cmath`、
`stddef.h`、`stdarg.h`、`malloc.h`、`conio.h`、`errno.h`；C++ 的 `std::string` / `std::vector` / `std::queue` / `std::map` 全部不可用。

注意：C++ 里 `#include <string>` **能编过**，但命中的是本项目的 C 垫片（拿到 C 字符串函数），
不是 STL 的 `std::string` —— 写 `std::string s;` 会报 `'std::string' has not been declared`。

## 每步指针 / 聚焦（"动画跟着执行走"，见 tests/engine-layers.test.mjs 第 8 节）

`layers[].roles` 现在除了 `focus1` 还会带 `pointers`，让渲染端的指针药丸**每步真的换位置**：

```
数组： roles.pointers = [{ id:'j', label:'j', index:2 }]      ← 用格子下标定位
链表/树：roles.pointers = [{ id:'cur', label:'cur', node:'n1' }] ← 用结点 id 定位
```

判据全部来自用户代码本身，**没有名字表**（否则换个写法就漏，和"识别任意组合"冲突）：

| 判据 | 为什么 | 反例（必须不画） |
| --- | --- | --- |
| 全文里被当成下标用过（`a[i]` 的 `i`），且出现在**当前这一行** | 这是"下标"的直接证据 | `sum += a[i]` 里的 `sum` |
| 当前行是 `for` / `while` 头 → 头里的标量都算计数器 | `for (j = 0; j < n-1-i; j++)` 的 `i` 只出现在条件里 | 长度标量 `n/len/size/count/front`（`LEN_DIRECT`） |
| 链表/树：各指针变量 dump 出来的**链头地址**对到本层结点地址上 | 插桩对每个指针变量各 dump 一条链，链头就是它指的位置 | 指针变 NULL（`LE count=0`）后不能还挂在旧结点 |

前端接线（`frontend/vendor/plus/app/host-frame.js`）：

- 名字是 `l/lo/left`、`r/hi/right`、`m/mid` 的仍走宿主三条语义行（L/R/M，零改动）；
- 其余名字用**同一套** `.prototype-marker` + `data-ptr=<变量名>`，只多一个 `is-free` 修饰类
  （配色在 `plus-viz.css`，只新增选择器），因此宿主的指针 FLIP（按 map 键量旧位置 → 新位置）直接生效；
- 本步改的格子加宿主已有的 `is-comparing`，并对"值变了的格子"做 `element.animate` 透明度过渡
  —— 与宿主 `prototype-array.js` 对写入格的做法一致；
- 这两处只在**带 `focus` 字段的步**（即自定义代码）里启用，54 个 plus 示例的代码路径一个字节都没变。

实测（冒泡 6 个元素）：49 步里 48 步有指针药丸，指针布局有 27 种不同组合（`j@0` → `j@2` → `i@0+j@0` …），
`t` 这类暂存值从不出现；链表样例 310 步全部带指针，`cur` / `newNode` / `head` 各自落在对的结点上。

## 类成员函数 / 多路结构（`class Trie` 这一类，见 tests/cpp-class.test.mjs）

力扣那种 `class Trie { Trie* children[26]; bool isEnd; void insert(...) {...} }` 原来只画出一张
"6 个结点摆一圈"的图，原因有三个，都修了：

| 问题 | 以前 | 现在 |
| --- | --- | --- |
| 成员函数体没插桩 | `parseFunctions` 把整个结构体区间跳过 → `insert` 里一条语句都不插，只有 `main` 里一次 dump | 类体"直接子层"（`depthAt == 类体深度+1`）也当函数定义；变量收集与语句插桩都放行（`!inStruct(i) \|\| insideFn(i)`） |
| dump 原型排在类后面 | 成员函数体里调用 `__avc_dump_Trie` 时原型还没出现 → `E029`，整条 full 链路失败并**静默降级**到 no-dump（屏幕上什么结构都没有） | 参数写 `struct Tag*` 的原型在文件头再前置声明一次（C/C++ 允许重复声明）；降级时前端会明说"插桩已降级" |
| 结点标签 / 布局没语义 | `NE` 先建结点时用下标当标签 → 全是 0,1,2,3；`layout:'circle'` 把 `a→p→p→l→e` 画成圆环 | 多路 walker 补发 `NM|var|idx|slot=k`（子结点挂在父结点指针数组第几格）与 `NM|var|idx|addr=<地址>`；槽位 + 源码里的 `- 'a'` 基准字符 → 结点直接标成字母；父子关系成树时按**层序坐标**摆（root 在上、孩子在下），只一条链就横着排（`layout:'line'`），不成树（有环/多父）才回到圆环 |

顺带：`addr` 让多路结构也能画指针 —— `node` 走到哪个结点，靠"该变量本轮 dump 的链头地址"对上结点地址，
所以 Trie 里 `node` / `t` 两个药丸会随 `insert` 一步步往下走。

实测（官方题解 Trie，插入 "apple" + "app"）：插桩 `full` 成功、**272 步**（原来 21 步）、**每步只剩 1 张卡**、
`graph:t` 结点标签 `#0 a p p l e`（`sub` 是槽位 `#0 #15 #15 #11 #4`）、`layout=line`（整棵是一条链）、
最后一步指针 `node→v3`、`t→v0`，`node` 一共走过 5 个不同结点；
分叉版（app/bat/cap）10 个结点按层展开：root(0.50,0) → 三个孩子 x=0/0.5/1 (y=0.33) → 叶子 (y=1)；
有环的邻接结构仍是 `layout=circle`（判据不成立就不硬套树布局）。

去重/折叠的三条规则（`dedupeStructures` + `pruneSubsetStructures`，都在 engine-layers.js）：

| 情形 | 处理 |
| --- | --- |
| `this:Trie` 与 `t` 是同一个对象（结点地址序列与边完全一致） | 只留一张，名字用**用户自己的变量**（`t`），`this` 的指针药丸并过去；同结点上只留一个标签 |
| `node` 的链是 `t` 的链的一段（地址集合是真子集） | 扔掉小卡，把 `node` 药丸按地址映射到大卡的对应结点上 |
| 两边地址没发全（早期步骤） | 不合并 —— 证明不了是同一批结点就不动 |

（这也顺手治了之前"链表样例每步 3～8 张卡"的问题：样例从 3～8 张降到 1～6 张，`head`/`cur` 落在同一张图上。）



## 类的成员数组 / 力扣 MinStack 那一类（见 tests/engine-layers.test.mjs 第 9 节）

力扣官方 MinStack 用的是 `std::stack<int>` 与 `std::min`，**本工具链没有 STL**（`<stack>`、`<algorithm>` 都 `unable to open`），
必须换成本项目的写法才能跑。替换关系（算法一字未改，只换容器/工具函数）：

| 原写法 | 改成 | 为什么 |
| --- | --- | --- |
| `stack<int> x_stack; stack<int> min_stack;` | `int data[64]; int mins[64]; int top;` | 没有 STL；两个栈 push/pop 同步，共用一个栈顶就够 |
| `min_stack.push(INT_MAX)` 当哨兵 | 用 `top < 0` 判空，空栈的最小值就是 x 自己 | 不需要哨兵，也不用 `limits.h` |
| `min(a, b)` | 手写 `if (x < m) { m = x; }` | `<algorithm>` 不可用 |
| `int top()` 方法 | 改名 `topValue()` | 成员 `top` 与新方法名撞车（C++ 不允许同名字段与方法） |
| 只有类、没有 `main` | 补 `main` + 一串 push/pop/printf | 自定义代码的整程序模式要 `int main(void)` |

插桩这边为此补了一条通用能力：**类的成员数组**会被插桩成带点的名字（`s.data[3]` / `s.top`），
所以 `ARRAY_ELEMENT_RE` 允许点号，长度/游标/栈队列判定都按**最后一段**匹配（`tailName`），
否则 `int data[64] + int top` 这种"成员栈"一辈子都裁不出实际元素、也画不出来。

实测（本文件样例）：`full` 插桩成功、20 步、每步 2 张卡（`stack:s.data` / `stack:s.mins`，竖版栈视图），
push -2 / 0 / -3 后两个栈是 `[-2,0,-3]` 与 `[-2,-2,-3]`，pop 一次回到 `[-2,0]` 与 `[-2,-2]`，
`top=1` 指向最后一个元素、`focus1` 高亮栈顶；输出 `-3 / 0 / -2` 与题解一致。
（限制：数组声明长度按 16 元素采样，声明 64 格时只 dump 前 16 格。）
## 可视化覆盖面审计（`npm run audit:viz`）

`scripts/custom-viz-audit.mjs` 用**一批互不相同的程序**（20 个案例）真编译 + 插桩 + 折叠，逐条检查：
能否出图、卡片类型对不对、有没有"声明长度泄漏"、有没有把未初始化栈垃圾或地址当数据摆出来、
指针药丸是否真的在动、程序输出是否仍然正确。案例只声明客观事实（程序打印什么、几步、该看到哪类卡），
**不声明变量叫什么名字** —— 换个命名还成立，才说明是自适应识别。

2026-11 这一轮扫出并修掉的（都是"看不见/看错"，不是样式问题）：

| 病症 | 根因 | 修法 |
| --- | --- | --- |
| 二维数组（矩阵转置、邻接矩阵、棋盘）**完全不出图** | 折叠层只认 `a[i]`，`a[i][j]` 连正则都不匹配 | 新增二维事件通道 → style 2 矩阵层；未初始化/未 dump 到的格子写 `·`，不把栈垃圾当数据 |
| 字符数组显示成 `104 101 108 108 111` | 元素按 int 发，看不出是 `hello` | 元素按声明类型标 `'c'` → 格子显示成字符；尾部 `\0` 裁掉 |
| 二维字符数组显示成**地址低字节**（44/47/50） | 只发 `g[i]`（整行指针转 char） | 按 `g[i][j]` 发，走矩阵层按字符显示 |
| 结构体数组（`Item a[4]` 排序）**整段 0 张卡** | 字段伪变量生成成 `a.key`——非法 C，插桩版编不过 → 降级 trace-only | 按元素展开成 `a.key[k]` / `a[0].key`；"key 列怎么移动"能一格格看 |
| 指针数组（`HNode* bucket[7]`、`Edge* adj[6]`）被画成一排**地址** | 元素按 `(long)` 发，折叠层当数值数组 | 类型标记 `'p'`，折叠层不建数值数组层（链已由 list/graph 层画） |
| 画面上出现 `4208300` / `1777952` 这类**未初始化垃圾** | 定长数组按声明长度 dump，只写了前几格 | 中间未写格写 `?`（柱高按 0），矩阵写 `·`；尾部仍按垃圾/长度规则裁 |
| 自定义代码跑 Trie/链表时标题写着"数组视图" | 窗口标题在 run 之前就固定成数组语义 | 按 `run.structure` 重挂标题与图例（结构视图／数组视图） |

顺手把"长度推断"从纯名字表改成两条腿：名字线索（`top/n/len…`）优先，**没有线索时用"写过的最大下标 + 1"**
（数据驱动）—— 所以 `int a[64]` 只写前 3 格时也只画 3 格，不靠变量名。

仍然保留的启发式（都是"读不出来就只能退化"，不是按案例写死）：

- 长度标量名字表 `LEN_DIRECT / LEN_PLUS_ONE`（`n/len/size/count/num/front`、`top/sp/rear/tail`）：不匹配就退到"写过的最大下标"。
- 栈/队列视图按 `top|sp` / `front+rear|head+tail` 判；都不叫这些名字时按普通数组画（仍能看值）。
- 垃圾判定 `|v| > 1e6`；字符基准只认唯一的 `- 'a'` 或 32..126 的数字字面量。
- 采样上限：一维数组 16 格、二维每维 16、结点 32、边 48（超出部分不采，不静默改数据结构）。
## 复审报告的四个问题（2026-11 第二轮，已修）

| 问题 | 实测现象 | 根因 | 修法 |
| --- | --- | --- | --- |
| 合法大整数被误删 | `int a[3] = {1, 2000000, 3000000}` 渲染成 `[1]` | 渲染层按 `|v| > 1e6` 判"未初始化垃圾"并裁掉尾巴 | **数值大小不再参与裁剪**。插桩新增三类记录：`W`（`a[i] = …` 真正写入的下标）、`I|…|1/2`（声明时就带初始化器 → 每格都已有值）、`I|…|0`（声明时没初始化器 → 写之前都是未知）。裁剪只看"长度线索 / 写过的最大下标 / 初始化长度"，打码只看"声明没初始化且还没写过" |
| 空请求一直没有响应 | `POST /api/detect` 带合法 JSON `null` → 客户端超时 | `JSON.parse('null')` 成功返回 `null`，处理函数 `if (!body) return;` 直接结束，**没发任何响应** | `parseBody` 统一校验：非对象（`null`/数组/标量）一律 400 `INVALID_INPUT` 并说明"收到的是 null" |
| 异常退出仍标为成功 | `exit(7)` 的程序返回 `ok:true, stage:"ok"` | 只看"跑完了"，没看退出码 | 退出码非 0 → `stage:'runtime-exit'` + `abnormalExit:true` + `exitNote`（轨迹仍保留），前端红字提示"程序异常退出（exit 7）：轨迹可能不完整" |
| 正式测试一项失败 | `npm test` 167/168，网上链表样例 sha256 对不上 | 哈希钉在**含 CRLF 的字节**上，换台机器/重新 checkout 行尾一变就不过 | 哈希改为按 **LF 归一化**计算并重新钉住；`.gitattributes` 给 `/frontend/samples/**` 加 `-text` |

新记录的事件格式（`trace.js` 已加进解析白名单）：

```
W|line|name|idx            a[i] = … 的分号前插入（下标是写入前的值，语法上不改变程序行为）
W|line|name|row|col        g[i][j] = …
I|line|name|1|n            声明带初始化器（int a[3] = {1,2,3};）→ n 格都算已初始化
I|line|name|2|rows|cols    二维同上
I|line|name|0              声明没初始化器（int b[9];）→ 写之前都是未知
```

安全边界：下标表达式里出现 `++ / -- / =`（有副作用）就**不发**写入标记（会被求值两次，改变程序行为）；
`a[i].key = …` 记到字段视图 `a.key` 上；整条结构体拷贝 `a[j] = a[j+1]` 给该元素的每个字段视图都记一笔；
结构体字段视图（`s.data`，写入发生在成员函数里、名字对不上）不发"未初始化"记录，交给构造函数。