# prototype01 — AnyviewC 风格的 C 语言可视化学习环境（样品）

**编辑器 + 编译器 + 调试器 + 数据结构可视化**，前端零依赖 HTML/JS，
后端直接调用**由 `04\builder` 源码自编出来的 Open Watcom 编译器**。

```
04\prototype01\
  start.bat            一键启动（清残留 → 起服务 → 健康检查 → 开浏览器）
  PLAN.md              设计计划 v1→v2 + §10 分类 + §11~13 里程碑执行记录
  server\              env / compile / instrument / trace / server / selftest / test-m2,m3,m4m5
  runtime\             avctrace.h   插桩运行时（注入被测程序）
  web\                 index.html + css/app.css + js/(17 个模块)
  samples\             5 个内置样例（冒泡 / 链表 / 递归 / 矩阵 / 二叉排序树）
  workspace\           运行期临时目录（自动清理）
```

## 一、启动

**双击 `start.bat`**，或手动：

```bat
cd D:\.FZU\00Item\04\prototype01
node server/server.js
:: 浏览器打开 http://127.0.0.1:8770/
```

> 端口被占：`set PORT=8775 && node server/server.js`
> **注意**：改过 `server\*.js` 后必须先杀掉旧进程（`start.bat` 已自动做），否则会连到旧版本。

## 二、后端（自编编译器）

| 用途 | 路径 |
|---|---|
| C 编译器 | `04\builder\build\binbuild\bwcc386.exe`（由 `bld\cc` 源码编出） |
| C++ 编译器 | `04\owcpp\out\wpp386.exe`（由 `bld\plusplus` 源码编出） |
| 链接器/头/库 | `04\owcpp\boot\binnt64\{wcl386.exe, h, lib386}` |

接口：`/api/health`、`/api/samples`、`/api/sample`、`/api/compile`、`/api/run`、`/api/trace`。

## 三、怎么用

| 操作 | 快捷键 | 说明 |
|---|---|---|
| **切换样例** | 顶部右侧「样例」下拉 | 26 项数据结构例题（`samples/ds/`）+ 基础样例；选中即插桩编译并停在第 1 步，四个演示窗立刻有内容（菜单「文件 → 内置样例…」等同） |
| 编译 | `F7` | 错误落在「编译信息」页，**双击跳行** |
| 运行 | `F5` | 连续运行，stdout 进「输出」页 |
| 下一行 / 进入函数 | `F8` / `F11` | 基于**插桩 trace 回放**（不是真调试器 API） |
| 定速运行 / 暂停 / 停止 | 运行栏 | 速度 = `SpeedIndex(1..5)` 与 `MinTime/MaxTime` 插值 |
| 设断点 | 点行号 | 三套行底色：当前执行行 / 编译错误行 / 断点行 |
| 跟踪设置 | 工具菜单 / 程序结构窗 ⚙ | 为变量**手工指定** 26 种可视结构之一（按逻辑结构分组） |
| 配置 | 工具菜单 | 配色（键名对齐 `anyview.ini`）+ 速度 |
| 视图 | 视图菜单 | 10 个窗的显隐 / 最大化 / 恢复布局（本地持久化） |

**演示区四窗**：数组（一维 矩形框/点 × 网格 × 连线；二维 柱状/曲面等距线框/稀疏网格）、
结构（链表结点+直角折线+箭头；树为可折叠 DOM）、运行栈（活动记录，地址 0→高）、
堆（malloc 块，模拟地址 9999→低）。

## 四、自测

```bat
node server/selftest.js          :: 5 个样例 × 编译/运行/跟踪
node server/test-m2.js           :: 81 项（模型层 / 调试器内核）
node server/test-m3.js           :: 29 项（5 个渲染器，DOM shim）
node server/test-m4m5.js         :: 33 项（菜单 / 视图 / 对话框 / 26 项目录 / 配色）
```

> `test-m2/m3` 需要服务已启动（默认 8770，可用 `set PORT=8775`）。

## 五、已知边界

- 目标代码 **只有 32 位**（PE Machine `0x014C`，Win64 靠 WOW64 运行）——Open Watcom 无 x64 后端。
- 调试基于**源码插桩 + 事件回放**：无真断点寄存器，`单指令` 未实现（行级替代）。
- 3D 数据结构窗、打印、远程题库/登录：范围外（见 `PLAN.md` §1 / §13.2）。
- 参考资料笔误一处：`10_COLOR_INI.md` 把 `MemNode=16776960` 注为"黄"，实际是 Delphi `clAqua`（青），代码按 BGR 正确转换。
