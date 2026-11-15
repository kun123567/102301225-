prototype01 / D4 —— tree-sitter WASM 手动放置说明
=================================================

把下列文件放进本目录（web\vendor\tree-sitter\）后，D4 自动启用；
缺少任一文件时，ast.js 会自动回落到内置的轻量解析器（D1），功能不变、精度下降。

必需文件（3 个）
----------------
1) tree-sitter.wasm        tree-sitter 运行时（C 核心编成的 wasm）
2) tree-sitter.js          tree-sitter 的 JS 加载器/绑定（与上面的 wasm 同包）
3) tree-sitter-cpp.wasm    C++ 语法（grammar）wasm

建议再加（可选，处理 .c 文件更快更稳）
4) tree-sitter-c.wasm      C 语法 wasm

来源（任选其一，取包内同名文件即可）
------------------------------------
A. npm 包（推荐，包内路径固定）
   · web-tree-sitter            -> tree-sitter.wasm 、 tree-sitter.js（也可能是 web-tree-sitter.* 前缀，按包内实际文件名为准）
   · tree-sitter-wasms          -> out/tree-sitter-cpp.wasm 、 out/tree-sitter-c.wasm
   · @vscode/tree-sitter-wasm   -> 只含各语法 wasm（c / cpp / ...），不含运行时

B. 浏览器直接下（unpkg，路径随版本可能变化，先用 browse 页确认）
   · https://unpkg.com/browse/web-tree-sitter/
   · https://unpkg.com/browse/tree-sitter-wasms/out/
   若 unpkg 打不开，可到 GitHub 的 tree-sitter 组织仓库里找对应 tag 的产物。

C. 自己编（不推荐，需要 emscripten）

体积参考（用于判断下载是否完整）
--------------------------------
   tree-sitter.wasm       数十 KB ~ 200 KB
   tree-sitter.js         200 KB ~ 400 KB
   tree-sitter-c.wasm     300 KB ~ 600 KB
   tree-sitter-cpp.wasm   1.5 MB ~ 3 MB（C++ 语法较大，属正常）

许可证
------
tree-sitter 与各 grammar 均为 MIT。请一并放入 LICENSE 文件，并在 README 注明来源与版本。

放置后的验证
------------
   node server/test-detect.js
应看到 D4 用例（函数指针数组 / 多层 typedef+模板 / 语法不完整容错 / 增量解析）由
provider=tree-sitter 通过；若仍显示 provider=self，说明文件名或路径不对。

注意
----
· 本目录**不走 CDN**（离线也要能用），所以必须是本地文件。
· 不要改动文件名：ast.js 按上述名字查找。
