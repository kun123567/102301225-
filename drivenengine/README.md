# drivenengine —— 驱动本仓库的两个引擎源码

这两个目录原本在仓库**外面**（`04\merge01\code\`），现在整体搬进本仓库，作为"自定义代码自动识别与可视化"的引擎来源。
它们**不是运行时依赖**：运行时不读这里，而是读本仓库里已经 vendor 好的副本（见下表）。搬进来是为了**可追溯**——
引擎改了、或要看原始实现时，源头就在仓库里。

| 目录 | 原来在哪 | 是什么 | 运行时的副本 |
| --- | --- | --- | --- |
| `base/` | `04\merge01\code\base`（= prototype01） | **后端引擎**：自编 Open Watcom 编译器接线、源码插桩（`server/instrument.js`）、事件解析（`server/trace.js`）、静态识别器（`web/js/{ast,dsCatalog,detect}.js`）、插桩运行时头 `runtime/avctrace.h` | `backend/src/custom-code/source-engine/`（CJS 原样拷贝 + 三处本项目补丁） |
| `plus0102/` | `04\merge01\code\plus01&02` | **可视化引擎**：54 个算法示例、`layers[]` 契约、9 个渲染器、布局策略与打磨（`app/layout-policy.js`、`polish-passes.js`）、SVG 舞台与动画挂载点（`svg-stage.js`、`prim-dom.js`、`anim.css`） | `frontend/vendor/plus/{app,vendor}/**` + `frontend/vendor/plus/app/plus-viz.css` |

## 关系图

```
用户贴的 C/C++ 代码
      │
      ▼
backend/src/custom-code/detect-engine.js ──(require)──► source-engine/  ← 来自 drivenengine/base
      │                                                    ├─ server/instrument.js   插桩
      │                                                    ├─ server/compile.js      编译/链接/运行
      │                                                    └─ web/js/detect.js       静态识别
      ▼
backend/src/custom-code/engine-layers.js  ── 事件 → layers[]（style 1/3/9/10）
      │
      ▼
frontend/src/features/custom-code/engine-program.js ──► createPlusView ──► frontend/vendor/plus/app/svg-stage.js
                                                                          （来自 drivenengine/plus0102）
```

## 相对原位置的改动（两处，都在副本里，不在本目录）

1. `source-engine/server/env.js`：工具链探测新增 `<仓库>/third_party/open-watcom`
   —— 本仓库的编译器在 `third_party/`，不是 `04\builder`。
2. `source-engine/runtime/avctrace.h` 去掉未使用的 `<string.h>`；`source-engine/runtime/compat/{stdbool.h,stdint.h}`
   是本项目新增的兼容垫片（原 base 没有）。
3. `source-engine/server/instrument.js` 三处增强：循环条件打点（每轮出步）、树的 `NM left/right` 父子索引、
   数组形参逐元素 dump；`compile.js` 新增可选 `std=c99`（`-za99`）。

## 已知遗留（不影响运行）

- **`base/package.json` 是本仓库新增的一个文件**（内容只有 `"type": "commonjs"`）：
  base 的 `.js` 全是 CommonJS，而本仓库根 `package.json` 是 `"type": "module"`，
  不声明就会被当 ESM 解析、`require` 直接报错。加上之后 base 自己的脚本（`node server/selftest.js` 等）仍可运行。
- base 自带的 `server/env.js` 会**优先**探到外部真实工具链 `D:\.FZU\00Item\04\...`（它的探测列表里没有 `third_party`）；
  本项目运行时用的是 `backend/src/custom-code/source-engine/`，
  那份 `env.js` **已打补丁**优先找 `<仓库>/third_party/open-watcom`。两边都能编译，只是用的编译器副本不同。
- `base/server/agent-adapter.js` 里有一个指向**别的仓库**的环境变量默认值（`AGENT_REPO`），属于 base 原有的"辅导"功能，
  本项目没用到（没 vendor 这个文件）。
- `base/start.bat`、`base/README.md` 里的启动说明仍按 base 独立运行写；本仓库不通过它们启动。
- `plus0102/tools/*.mjs` 里有几处指向本仓库 `frontend/` 的**绝对路径**（`dbg-host2.mjs`、`host-integration-test.mjs` 等），
  它们是从 plus01&02 移植集成测试时写死的；只有在 plus0102 目录里手动跑那些测试才用得到。
- 兄弟目录 `04\merge01\code\plus01&02.bak-20261116-0348` 是搬进来的 **plus0102 的备份**（回滚用），仍留在原处。
