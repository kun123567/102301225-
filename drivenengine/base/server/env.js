'use strict';
/**
 * env.js -- 后端工具链定位与环境变量
 *
 * 后端 = 本仓库自编的 Open Watcom 编译器（builder 源码编出来的产物）：
 *   C    : 04\builder\build\binbuild\bwcc386.exe
 *   C++  : 04\builder\build\binbuild\bwpp386.exe  (或 04\owcpp\out\wpp386.exe)
 * 链接器/库/头文件来自解包的官方包（自举用）：
 *   04\owcpp\boot\{binnt64,h,lib386}
 *
 * 可用环境变量覆盖：
 *   AVC_CC   AVC_CXX   AVC_LINK   AVC_WATCOM
 */
const fs = require('fs');
const path = require('path');

/**
 * 工具链根目录定位（工程被整体复制到别处后仍要能找到自编编译器）
 *
 * 旧实现把 ROOT 写死成 `<工程>/../../../`（= D:\.FZU\00Item），工程一旦搬到
 * `...\04\merge01\code\base\`，三级上跳落到 merge01，编译器就全部找不到。
 * 现改为"候选根目录逐个探测"，命中判据是该目录下直接存在：
 *   builder\build\binbuild\bwcc386.exe  或  owcpp\boot\binnt64\wcl386.exe  或  owcpp\out\wpp386.exe
 * 探测顺序：
 *   1) 环境变量 AVC_ROOT（显式指定，最优先）
 *   2) 本文件向上逐级祖先目录，以及每个祖先下的 `04`、`00Item\04`
 *   3) 兜底：三级上跳（保持旧行为，找不到时行为与从前一致）
 */
function isToolchainRoot(dir) {
  if (!dir) return false;
  try {
    if (fs.existsSync(path.join(dir, 'builder', 'build', 'binbuild', 'bwcc386.exe'))) return true;
    if (fs.existsSync(path.join(dir, 'owcpp', 'boot', 'binnt64', 'wcl386.exe'))) return true;
    if (fs.existsSync(path.join(dir, 'owcpp', 'out', 'wpp386.exe'))) return true;
  } catch (_) { /* 权限不足或不存在 —— 视为不是工具链根 */ }
  return false;
}

function findToolchainRoot() {
  const cands = [];
  if (process.env.AVC_ROOT) cands.push(path.resolve(process.env.AVC_ROOT));
  let dir = path.resolve(__dirname, '..');
  for (let i = 0; i < 8; i++) {
    cands.push(dir, path.join(dir, '04'), path.join(dir, '00Item', '04'));
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  for (const c of cands) if (isToolchainRoot(c)) return c;
  return path.resolve(__dirname, '..', '..', '..');
}

const ROOT = findToolchainRoot(); // 形如 D:\.FZU\00Item\04
const P = (...a) => path.join(ROOT, ...a);

const candidates = {
  cc: [
    process.env.AVC_CC,
    P('builder', 'build', 'binbuild', 'bwcc386.exe'),
    P('owcpp', 'boot', 'binnt64', 'wcc386.exe'),
  ],
  cxx: [
    process.env.AVC_CXX,
    P('owcpp', 'out', 'wpp386.exe'),
    P('builder', 'build', 'binbuild', 'bwpp386.exe'),
    P('owcpp', 'boot', 'binnt64', 'wpp386.exe'),
  ],
  watcom: [
    process.env.AVC_WATCOM,
    P('owcpp', 'boot'),
  ],
};

function firstExisting(list) {
  for (const p of list) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

const watcom = firstExisting(candidates.watcom);
const cc = firstExisting(candidates.cc);
const cxx = firstExisting(candidates.cxx);

const toolchain = {
  root: ROOT,
  watcom,
  cc,
  cxx,
  linker: watcom ? path.join(watcom, 'binnt64', 'wcl386.exe') : null,
  wlink: watcom ? path.join(watcom, 'binnt64', 'wlink.exe') : null,
  include: watcom ? [path.join(watcom, 'h'), path.join(watcom, 'h', 'nt')] : [],
  lib: watcom ? [path.join(watcom, 'lib386'), path.join(watcom, 'lib386', 'nt')] : [],
};

/** 子进程环境：给编译器/链接器准备 PATH/INCLUDE/LIB */
function childEnv(extra, extraDirs) {
  const env = Object.assign({}, process.env);
  env.WATCOM = toolchain.watcom || '';
  const dirs = toolchain.include.concat(extraDirs || []);
  env.INCLUDE = dirs.join(';');
  env.LIB = toolchain.lib.join(';');
  env.LIBPATH = env.LIB;
  env.PATH = [
    toolchain.watcom ? path.join(toolchain.watcom, 'binnt64') : '',
    toolchain.watcom ? path.join(toolchain.watcom, 'binnt') : '',
    env.PATH || '',
  ].filter(Boolean).join(path.delimiter);
  if (extra) Object.assign(env, extra);
  return env;
}

/** 健康检查结果，供 /api/health 使用 */
function health() {
  return {
    ok: !!(toolchain.cc && toolchain.linker),
    cc: toolchain.cc,
    cxx: toolchain.cxx,
    linker: toolchain.linker,
    watcom: toolchain.watcom,
  };
}

module.exports = { toolchain, childEnv, health, ROOT };
