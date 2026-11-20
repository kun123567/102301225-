'use strict';
/**
 * compile.js -- 调用自编 Open Watcom 编译器完成 编译/链接/运行
 *
 * 命令行（已实测）：
 *   C    : bwcc386.exe -bt=nt -fo=main.obj main.c        (-q / -zq 都会报错，必须不带)
 *   C++  : wpp386.exe  -bt=nt -xs -fo=main.obj main.cpp  (-xs 开异常，libstdc++ 系 STL 需要)
 *   链接 : wcl386.exe  -l=nt  main.obj                   (输出 main.exe)
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const { toolchain, childEnv } = require('./env');
const cpp98 = require('./cpp98');

const BANNER = /^(Open Watcom|Version 2\.0|Copyright|Portions Copyright|Source code is available|See https:\/\/github)/;

function stripBanner(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter(l => !BANNER.test(l.trim()))
    .join('\n')
    .trim();
}

/**
 * 用"文件重定向"的方式起子进程：
 * 沙箱环境禁止管道 stdio（spawn 默认 'pipe' 会 EPERM），文件重定向在任何环境都稳。
 */
function run(exe, args, opts) {
  opts = opts || {};
  const cwd = opts.cwd || process.cwd();
  const tag = 'r' + (runSeq++).toString(36) + Date.now().toString(36).slice(-4);
  const outFile = path.join(cwd, `__out_${tag}.txt`);
  const errFile = path.join(cwd, `__err_${tag}.txt`);
  const inFile = path.join(cwd, `__in_${tag}.txt`);

  return new Promise((resolve) => {
    const t0 = Date.now();
    let fds = [];
    let child;
    try {
      if (opts.stdin != null) fs.writeFileSync(inFile, String(opts.stdin), 'utf8');
      const outFd = fs.openSync(outFile, 'w');
      const errFd = fs.openSync(errFile, 'w');
      const inFd = opts.stdin != null ? fs.openSync(inFile, 'r') : 'ignore';
      fds = [outFd, errFd].concat(typeof inFd === 'number' ? [inFd] : []);
      child = spawn(exe, args, {
        cwd,
        env: childEnv(null, opts.includeDirs),
        windowsHide: true,
        stdio: [inFd, outFd, errFd],
      });
    } catch (e) {
      for (const fd of fds) { try { fs.closeSync(fd); } catch (_) {} }
      return resolve({ code: -1, out: '', err: String(e), ms: 0 });
    }

    let finished = false, timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch (_) {}
    }, opts.timeoutMs || 20000);

    const readAll = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (_) { return ''; } };
    const done = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      for (const fd of fds) { try { fs.closeSync(fd); } catch (_) {} }
      const out = readAll(outFile), err = readAll(errFile);
      for (const f of [outFile, errFile, inFile]) { try { fs.unlinkSync(f); } catch (_) {} }
      resolve({
        code, out: out.length > 262144 ? out.slice(-204800) : out,
        err: err.length > 262144 ? err.slice(-204800) : err,
        ms: Date.now() - t0, timedOut,
      });
    };
    child.on('error', e => { try { fs.appendFileSync(errFile, '\n' + String(e)); } catch (_) {} done(-1); });
    child.on('close', code => done(code == null ? -1 : code));
  });
}
let runSeq = 0;

/** 解析 Watcom 错误行：  file.c(12): Error! E123: msg   /  file.c: 12: ... */
function parseDiagnostics(text) {
  const diags = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let m = t.match(/^(.*?)\((\d+)\)\s*:\s*(Error|Warning|Note|Fatal)\s*!?\s*([A-Z]\d+)?\s*:?\s*(.*)$/);
    if (!m) m = t.match(/^(.*?):(\d+):\s*(error|warning|note|fatal error)\s*:?\s*(.*)$/i);
    if (m) {
      diags.push({
        file: m[1].trim(), line: parseInt(m[2], 10),
        sev: /err|fatal/i.test(m[3]) ? 'error' : (/warn/i.test(m[3]) ? 'warning' : 'note'),
        code: (m[4] || '').trim(), message: (m[5] || '').trim(),
      });
    } else if (/^(Error|Warning|Fatal)/i.test(t)) {
      diags.push({ file: '', line: 0, sev: /warn/i.test(t) ? 'warning' : 'error', code: '', message: t });
    }
  }
  return diags;
}

/**
 * 编译一个源文件并链接成 exe
 * @param {object} o {workdir, source, lang:'c'|'cpp', exeName, extraDefines}
 */
async function build(o) {
  const workdir = o.workdir;
  const isCpp = o.lang === 'cpp';
  const comp = isCpp ? toolchain.cxx : toolchain.cc;
  const srcName = isCpp ? 'main.cpp' : 'main.c';
  const srcPath = path.join(workdir, srcName);
  const objName = 'main.obj';
  const exeName = o.exeName || 'main.exe';

  await fsp.mkdir(workdir, { recursive: true });

  // C++ 模式：先做 C++11→C++98 降级（Open Watcom 前端只到 C++98）
  let source = o.source;
  let downgradeNotes = [];
  if (isCpp) {
    try {
      const d = cpp98.downgrade(o.source);
      source = d.code;
      downgradeNotes = d.notes || [];
    } catch (_) {}
  }
  await fsp.writeFile(srcPath, source, 'utf8');

  // 注入兼容垫片：<bits/stdc++.h> 等 GCC 专有头（Open Watcom 没有）
  try {
    const compat = path.join(__dirname, '..', 'runtime', 'compat');
    if (fs.existsSync(compat)) {
      const dst = path.join(workdir, 'compat');
      await fsp.mkdir(dst, { recursive: true });
      await fsp.cp(compat, dst, { recursive: true, force: true });
    }
  } catch (_) {}
  const includeDirs = [path.join(workdir, 'compat')];

  if (!comp) {
    return { ok: false, stage: 'toolchain', log: '找不到 C/C++ 编译器（检查 04\\builder\\build\\binbuild 与 04\\owcpp\\boot）', diags: [] };
  }

  const cargs = ['-bt=nt'];
  if (isCpp) cargs.push('-xs');
  /* 本项目追加：C 默认按 C89 解析（声明必须写在语句前），学生会写 `for (int i = 0; ...)`。
     传 std:'c99' 时加 -za99（Watcom 的 C99 扩展开关）；不传则与原行为完全一致。 */
  if (!isCpp && o.std === 'c99') cargs.push('-za99');
  cargs.push('-fo=' + objName, srcName);

  const c = await run(comp, cargs, { cwd: workdir, timeoutMs: o.timeoutMs || 30000, includeDirs });
  const clog = stripBanner(c.out + '\n' + c.err);
  if (c.code !== 0 || !fs.existsSync(path.join(workdir, objName))) {
    return { ok: false, stage: 'compile', log: clog || ('编译器返回 ' + c.code), diags: parseDiagnostics(clog), ms: c.ms };
  }

  const l = await run(toolchain.linker, ['-l=nt', objName, '-fe=' + exeName], { cwd: workdir, timeoutMs: 30000, includeDirs });
  const llog = stripBanner(l.out + '\n' + l.err);
  const exePath = path.join(workdir, exeName);
  if (l.code !== 0 || !fs.existsSync(exePath)) {
    // 有的驱动版本不认 -fe，退回按 obj 名自动命名
    const l2 = await run(toolchain.linker, ['-l=nt', objName], { cwd: workdir, timeoutMs: 30000, includeDirs });
    const l2log = stripBanner(l2.out + '\n' + l2.err);
    const guess = path.join(workdir, 'main.exe');
    if (l2.code === 0 && fs.existsSync(guess)) {
      if (guess !== exePath) { try { fs.copyFileSync(guess, exePath); } catch (_) {} }
      return { ok: true, stage: 'link', log: (clog + '\n' + l2log).trim(), diags: [], exe: exePath };
    }
    return { ok: false, stage: 'link', log: (llog + '\n' + l2log).trim(), diags: parseDiagnostics(llog + '\n' + l2log), ms: l.ms };
  }
  const noteText = downgradeNotes.length ? ('\n' + downgradeNotes.join('\n')) : '';
  return { ok: true, stage: 'ok', log: (clog + '\n' + llog + noteText).trim(), diags: [], exe: exePath, downgradeNotes };
}

/** 运行可执行文件，返回 stdout/stderr/退出码 */
async function execute(exePath, workdir, opts) {
  opts = opts || {};
  const r = await run(exePath, [], {
    cwd: workdir,
    stdin: opts.stdin != null ? opts.stdin : '',
    timeoutMs: opts.timeoutMs || 8000,
  });
  return {
    stdout: r.out,
    stderr: r.err,
    exitCode: r.code,
    ms: r.ms,
    timedOut: !!r.timedOut,
  };
}

module.exports = { build, execute, run, parseDiagnostics, stripBanner };
