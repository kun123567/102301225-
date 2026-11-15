/**
 * app.js -- M2 装配层（对应原版主控的最小版本）
 *
 * M2 范围：编辑 → 编译 → 运行 → 跟踪单步 的完整闭环
 *   · 编辑器（gutter/高亮/断点/三套行底色）
 *   · 编译诊断双击跳行（信息窗）
 *   · 跟踪回放（session + vmodel）：当前行高亮 + 运行栈/变量/堆/结构摘要
 * M3/M4 落地后，这里的 _renderDemo() 会换成 memcell/stackheap/arrayView/linkView/treeView。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));

  const S = {
    doc: null,
    ed: null,
    session: null,
    step: -1,
    timer: null,
    rate: 0,
    busy: false,
    trace: null,
    lastSnap: null,
  };

  /* ---------------- 状态栏 / 信息窗 ---------------- */
  function setState(text, kind) {
    const el = $('#stState');
    el.textContent = text;
    el.className = kind || '';
  }
  function setTraceInfo(text) {
    $('#traceInfo').textContent = text;
  }
  function showPane(name) {
    $$('#ioWin .tabbtn').forEach(b => b.classList.toggle('active', b.dataset.iotab === name));
    $$('#ioWin .io-pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + name));
  }
  function logLine(s) {
    const el = $('#pane-log');
    el.textContent += (el.textContent ? '\n' : '') + s;
    el.scrollTop = el.scrollHeight;
  }
  function clearLog() { $('#pane-log').textContent = ''; }

  function renderDiags(diags, log) {
    const ul = $('#diagList');
    ul.innerHTML = '';
    (diags || []).forEach(d => {
      const li = document.createElement('li');
      li.className = d.sev === 'error' ? 'err' : (d.sev === 'warning' ? 'warning' : '');
      li.innerHTML = '<span class="ln">' + (d.line ? '行 ' + d.line : '—') + '</span>' +
        '<span class="sev">' + (d.sev === 'error' ? '错误' : (d.sev === 'warning' ? '警告' : '提示')) + '</span>' +
        '<span class="msg"></span>';
      li.querySelector('.msg').textContent = (d.code ? d.code + ': ' : '') + d.message;
      if (d.line > 0) {
        li.addEventListener('click', () => { S.ed.gotoLine(d.line); showPane('err'); });
      }
      ul.appendChild(li);
    });
    $('#rawLog').textContent = log || '';
  }

  /* ---------------- 编译 / 运行 ---------------- */
  async function doCompile(silent) {
    const f = S.doc.active();
    if (!f) return null;
    setState('编译中…', 'busy');
    try {
      const r = await AVC.api.compile(S.ed.getText(), f.lang);
      S.doc.setCompileResult(f.id, r);
      S.ed.setErrorLines(f.errorLines);
      renderDiags(r.diags, r.log);
      if (r.ok) {
        renderStructure(r.structure);   // 程序结构 + 数据结构静态检测（M6）
        setState('编译通过（' + ((r.structure && r.structure.functions) || []).length + ' 个函数）', 'ok');
        if (!silent) showPane('err');
      } else {
        setState(r.stage === 'compile' ? '编译失败' : ('失败：' + r.stage), 'err');
        showPane('err');
      }
      return r;
    } catch (e) {
      setState('编译请求失败：' + e.message, 'err');
      return null;
    }
  }


  /** 编译后在桌面新开控制台窗口运行（真交互：cin/scanf 会等你键入） */
  async function doConsoleRun() {
    const f = S.doc.active();
    if (!f) return;
    setState('编译中（控制台运行）…', 'busy');
    stopTrace(false);
    try {
      const r = await AVC.api.runConsole(S.ed.getText(), f.lang);
      if (!r.ok) {
        renderDiags(r.diags, r.log);
        setState('编译失败（控制台运行）', 'err');
        showPane('err');
        return;
      }
      const out = $('#pane-out');
      out.textContent = '⚠ 已在新打开的控制台窗口里启动程序。\n' +
        '· 输入直接在那个窗口里敲（cin/scanf 会真的等待）；\n' +
        '· 该窗口的输入输出不会被本页面捕获；\n' +
        '· 想在本页面看输出与可视化，请用「运行」+ 下方 stdin 文本框，或「下一行」单步。\n\n' +
        '工作目录：' + r.dir;
      showPane('out');
      setState('已弹出控制台窗口（去那个窗口输入）', 'ok');
    } catch (e) {
      setState('控制台运行失败：' + e.message, 'err');
    }
  }


  /** 源码是否需要 stdin（cin / scanf / getchar 等） */
  function needsStdin(text) {
    return /\bcin\s*>>|\bscanf\s*\(|\bgetchar\s*\(|\bgets\s*\(|\bfgets\s*\([^,]+,\s*[^,]+,\s*stdin\s*\)|\bgetline\s*\(\s*cin/.test(text);
  }

  async function doRun() {
    const f = S.doc.active();
    if (!f) return;
    // 程序要读输入但 stdin 为空 → 直接跑会因读失败/未初始化变量而崩溃，先引导用户填
    if (needsStdin(S.ed.getText()) && !($('#pane-in').value || '').trim()) {
      showPane('in');
      setState('该程序需要输入：请在「输入(stdin)」页填好数据再运行', 'err');
      $('#pane-in').focus();
      return;
    }
    setState('运行中…', 'busy');
    stopTrace(false);
    try {
      const r = await AVC.api.run(S.ed.getText(), f.lang, $('#pane-in').value || '');
      if (!r.ok) {
        renderDiags(r.diags, r.log);
        setState('编译失败', 'err');
        showPane('err');
        return;
      }
      const out = $('#pane-out');
      out.textContent = (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '') +
        (r.hint ? '\n\n⚠ 诊断：' + r.hint : '');
      showPane('out');
      setState(r.exitCode === 0
        ? ('运行结束：exit=0（' + r.ms + ' ms）')
        : ('运行崩溃：exit=' + r.exitCode + (r.hint ? ' · 见输出页诊断' : '')),
        r.exitCode === 0 ? 'ok' : 'err');
    } catch (e) {
      setState('运行请求失败：' + e.message, 'err');
    }
  }

  /* ---------------- 跟踪（调试器）---------------- */
  async function ensureTrace(force) {
    if (S.trace && !force) return S.trace;
    const f = S.doc.active();
    setState('插桩编译中…', 'busy');
    const t = await AVC.api.trace(S.ed.getText(), f.lang, $('#pane-in').value || '', 4000);
    if (!t.ok) {
      renderDiags(t.diags, t.log);
      setState('无法跟踪：' + (t.stage || ''), 'err');
      showPane('err');
      return null;
    }
    S.trace = t;
    S.session = AVC.session.create(t);
    S.step = -1;
    clearLog();
    logLine('插桩模式：' + (t.degradedMode || 'full') +
      ' · 步数=' + t.steps + (t.truncated ? '（已截断）' : ''));
    if (t.stdout) {
      $('#pane-out').textContent = t.stdout + (t.stderr ? '\n[stderr]\n' + t.stderr : '');
    }
    setState('跟踪就绪：共 ' + t.steps + ' 步', 'ok');
    return t;
  }

  /** 渲染当前步：编辑器行高亮 + 运行栈/变量/堆/结构摘要（M2 用日志面板代替图形面板） */
  function renderStep() {
    if (!S.session) return;
    const snap = S.session.snapshotAt(S.step);
    S.lastSnap = snap;
    S.ed.setCurrentLine(snap.line);
    setTraceInfo('第 ' + (snap.step + 1) + ' / ' + S.session.totalSteps + ' 步 · 行 ' + snap.line +
      ' · 栈深 ' + snap.depth);

    // 运行栈
    const lines = [];
    lines.push('【运行栈】sp=' + snap.sp + '  帧数=' + snap.depth);
    snap.frames.forEach((fr, i) => {
      const vars = fr.vars.map(v => v.name + '=' + v.value + '@' + v.addr).join('  ');
      lines.push('  ' + (i === snap.frames.length - 1 ? '▶' : ' ') + ' ' +
        fr.fn + '(depth=' + fr.depth + ', base=' + fr.base + ')  ' + vars);
    });

    // 数组（聚合）
    const arrs = AVC.vmodel.groupArrays(snap);
    const keys = Object.keys(arrs);
    if (keys.length) {
      lines.push('【数组】');
      keys.forEach(k => {
        const a = arrs[k];
        lines.push('  ' + k + ' [' + a.dims.join('×') + '] : ' +
          a.cells.slice(0, 12).map(c => (c.j == null ? '' : c.i + ',') + '[' + c.name.replace(/^[^\[]+/, '') + ']=' + c.value).join(' '));
      });
    }

    // 堆
    if (snap.heap.length) {
      lines.push('【堆】' + snap.heap.length + ' 块（heapCursor=' + snap.heapCursor + '）');
      snap.heap.forEach(h => lines.push('  @' + h.addr + ' ' + h.size + 'B ' +
        (h.state === 'used' ? '使用中' : '已释放') + ' (分配于行 ' + h.line + ')'));
    }

    // 结构（链表/树）
    const ls = Object.keys(snap.lists || {});
    if (ls.length) {
      lines.push('【结构】');
      ls.forEach(k => {
        const L = snap.lists[k];
        lines.push('  ' + k + ' (' + L.shape + ', ' + L.count + ' 结点) : ' +
          L.nodes.slice(0, 12).map(n => n.key).join(' → ') + (L.nodes.length > 12 ? ' …' : ''));
      });
    }

    const el = $('#pane-log');
    el.textContent = lines.join('\n');
    el.scrollTop = 0;
    renderDemo(snap);
  }

  /* ---------------- M3：演示区渲染器装配 ---------------- */
  const DS_PARAMS = { gap: 26, nodeW: 62, nodeH: 30, scale: 1, round: false, linkFirst: false };
  const UI = { arrayPick: '', dsPick: '', prev: null, focus: [] };

  function refreshPickers(snap) {
    const arrs = AVC.vmodel.groupArrays(snap);
    const pick = $('#arrayPick');
    const keys = Object.keys(arrs);
    pick.innerHTML = '';
    if (!keys.length) {
      pick.innerHTML = '<option value="">（无可视数组）</option>';
      UI.arrayPick = '';
    } else {
      keys.forEach(k => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = k + (arrs[k].twoD ? ' [' + arrs[k].dims.join('×') + ']' : ' [' + arrs[k].dims[0] + ']');
        pick.appendChild(o);
      });
      UI.arrayPick = keys.indexOf(UI.arrayPick) >= 0 ? UI.arrayPick : keys[0];
      pick.value = UI.arrayPick;
    }

    const ds = $('#dsPick');
    if (!ds) { if (dsVP) { dsVP.update(snap); } return; }
    const listKeys = Object.keys(snap.lists || {});
    ds.innerHTML = '';
    if (!listKeys.length) {
      ds.innerHTML = '<option value="">（无可视结构）</option>';
      UI.dsPick = '';
    } else {
      listKeys.forEach(k => {
        const L = snap.lists[k];
        const o = document.createElement('option');
        o.value = k;
        o.textContent = k + ' (' + L.shape + ' · ' + (L.count || L.nodes.length) + ')';
        ds.appendChild(o);
      });
      UI.dsPick = listKeys.indexOf(UI.dsPick) >= 0 ? UI.dsPick : listKeys[0];
      ds.value = UI.dsPick;
    }
  }

  function renderArrayPane(snap) {
    const host = $('#arrayBody');
    if (!host) return;
    const arrs = AVC.vmodel.groupArrays(snap);
    const arr = arrs[UI.arrayPick];
    if (!arr) { host.innerHTML = '<div class="empty">本步没有可画的数组</div>'; return; }

    const style = ($('#arrayStyle') && $('#arrayStyle').value) || 'rect';
    if (arr.twoD) {
      const mode = style === 'surface' ? 'surface' : (style === 'sparse' ? 'sparse' : 'bar');
      AVC.arrayView.render2D(host, arr, { mode });
      return;
    }
    /* 一维：把下拉项映射成三个独立开关（Shape / ShowGrid / ShowLine） */
    const t = AVC.theme.arr1;
    let shape = t.shape(), grid = t.showGrid(), line = t.showLine();
    if (style === 'point') shape = 1;
    else if (style === 'rect') shape = 0;
    else if (style === 'grid') grid = true;
    else if (style === 'line') { line = true; grid = true; }
    AVC.arrayView.render1D(host, arr, { shape, showGrid: grid, showLine: line, focus: UI.focus });
  }

  /* V1/V3：视窗化演示区（切换器列出全部候选结构，按 shape 分派渲染） */
  let dsVP = null;

  function renderDsPane(snap) {
    const host = $('#dsBody');
    if (!host) return;
    if (!AVC.viewport || !AVC.graph) { renderDsPaneLegacy(snap); return; }
    if (!dsVP) {
      dsVP = AVC.viewport.create({ host, onSelect: v => { UI.dsPick = v; } });
    }
    const code = S.ed ? S.ed.getText() : '';
    const astItems = (AVC.detect && code) ? AVC.detect.detect(code) : [];
    const shapeRes = AVC.shape ? AVC.shape.analyze(snap, S.trace && S.trace.structure) : null;
    const manual = AVC.dialogs ? AVC.dialogs.loadTrack() : {};
    const arb = AVC.arbitrate ? AVC.arbitrate.arbitrateAll(astItems, shapeRes, manual) : [];
    dsVP.setCandidates(AVC.viewport.buildCandidates(snap, arb));
    dsVP.update(snap);
    UI.dsPick = dsVP.getActive() || '';
  }

  /** 老实现保留作兜底（AVC.viewport 缺失时） */
  function renderDsPaneLegacy(snap) {
    const host = $('#dsBody');
    if (!host) return;
    const L = (snap.lists || {})[UI.dsPick];
    if (!L) { host.innerHTML = '<div class="empty">自动识别到的链表 / 树会在这里绘制</div>'; return; }
    const track = AVC.dialogs.loadTrack();
    const tpl = track[UI.dsPick];
    const renderer = (tpl && tpl.renderer) ? tpl.renderer
      : (L.shape === 'tree' ? 'treeView' : 'linkView');
    const vobj = AVC.vmodel.objFromList(UI.dsPick, snap, S.trace && S.trace.structure,
      { logical: L.shape === 'tree' ? 'tree' : 'linear' });
    if (!vobj) { host.innerHTML = '<div class="empty">无法构建该变量的可视化对象</div>'; return; }

    if (renderer === 'dsStack') { AVC.stackheap.renderDSStack(host, snap, S.trace && S.trace.structure, { varName: UI.dsPick }); return; }
    if (renderer === 'dsHeap') { AVC.stackheap.renderDSHeap(host, snap, S.trace && S.trace.structure, { varName: UI.dsPick }); return; }
    if (renderer === 'arrayView') {
      const arrs = AVC.vmodel.groupArrays(snap);
      const arr = arrs[UI.dsPick];
      if (arr) { arr.twoD ? AVC.arrayView.render2D(host, arr, { mode: 'matrix' === (tpl && tpl.variants && tpl.variants[0]) ? 'sparse' : 'bar' }) : AVC.arrayView.render1D(host, arr, {}); return; }
    }
    if (renderer === 'treeView' || vobj.kind === 'tree') AVC.treeView.render(host, vobj, { emptyText: '树为空' });
    else AVC.linkView.paint(host, vobj, DS_PARAMS);
  }

  /** 把一步快照画到演示区四窗（M3 核心） */
  function renderDemo(snap) {
    refreshPickers(snap);
    renderArrayPane(snap);
    renderDsPane(snap);
    AVC.stackheap.renderStack($('#stackBody'), snap, S.trace && S.trace.structure,
      { prev: (UI.prev && UI.prev.frames) || [] });
    AVC.stackheap.renderHeapBlocks($('#heapBody'), snap);
    UI.prev = snap;
  }

  async function stepOnce(kind) {
    if (S.busy) return;
    S.busy = true;
    try {
      const t = await ensureTrace(false);
      if (!t) return;
      if (kind === 'over') {
        S.step = Math.min(S.step + 1, S.session.totalSteps - 1);
      } else if (kind === 'into') {
        // 行级"进入"：若下一步行号属于被调函数（深度增加），行为等同下一行；
        // 若深度不变（同一帧），跳到"下一次深度增加"的步。
        const snap0 = S.session.snapshotAt(S.step);
        let i = S.step + 1;
        while (i < S.session.totalSteps) {
          const prevS = S.session.snapshotAt(i - 1);
          const cur = S.session.snapshotAt(i);
          if (cur.depth > prevS.depth || cur.line === snap0.line) break;
          i++;
        }
        S.step = Math.min(i, S.session.totalSteps - 1);
      }
      renderStep();
    } finally {
      S.busy = false;
    }
  }

  function autoRun() {
    pauseAuto();
    const ms = Math.max(20, 520 - parseInt($('#speed').value, 10) * 5);
    S.rate = ms;
    S.timer = setInterval(async () => {
      if (S.busy) return;
      if (!S.session) { await stepOnce('over'); return; }
      if (S.step >= S.session.totalSteps - 1) { pauseAuto(); setState('已运行到结束', 'ok'); return; }
      await stepOnce('over');
    }, ms);
    setState('定速运行中…（' + ms + ' ms/步）', 'busy');
  }
  function pauseAuto() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
  }
  function stopTrace(resetLine) {
    pauseAuto();
    S.session = null; S.trace = null; S.step = -1; S.lastSnap = null;
    if (resetLine !== false) S.ed.setCurrentLine(0);
    setTraceInfo('未调试');
  }

  /* ---------------- 装配 ---------------- */
  function bindToolbar() {
    $$('#runbar button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        switch (act) {
          case 'compile': doCompile(); break;
          case 'compileRun': doCompile(true).then(r => { if (r && r.ok) doRun(); }); break;
          case 'run': doRun(); break;
          case 'consoleRun': doConsoleRun(); break;
          case 'stepOver': pauseAuto(); stepOnce('over'); break;
          case 'stepInto': pauseAuto(); stepOnce('into'); break;
          case 'autoRun': autoRun(); break;
          case 'pause': pauseAuto(); setState('已暂停', ''); break;
          case 'stop': stopTrace(); setState('已停止', ''); break;
          default: break;
        }
      });
    });
    $('#speed').addEventListener('input', () => {
      $('#speedVal').textContent = $('#speed').value;
      if (S.timer) autoRun();
    });
    $$('#ioWin .tabbtn').forEach(b => b.addEventListener('click', () => showPane(b.dataset.iotab)));
    $('#btnClearIo').addEventListener('click', () => {
      $('#pane-out').textContent = ''; $('#pane-log').textContent = '';
      $('#rawLog').textContent = ''; $('#diagList').innerHTML = '';
    });
    $('#lang').addEventListener('change', () => {
      const f = S.doc.active();
      if (f) { f.lang = $('#lang').value; S.ed.setLang(f.lang); }
      stopTrace();
      S.trace = null;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'F8') { e.preventDefault(); pauseAuto(); stepOnce('over'); }
      if (e.key === 'F5') { e.preventDefault(); doRun(); }
      if (e.key === 'F7') { e.preventDefault(); doCompile(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveLocal(); }
    });

    $('#btnSave').addEventListener('click', saveLocal);
    $('#btnOpen').addEventListener('click', openLocal);

    /* M3：演示区交互 */
    // 这一整段都是"锦上添花"的演示控件：任何一个元素缺失都不许中断 bindToolbar()，
    // 否则后面的键盘快捷键与 boot() 后半段（后端探测、样例载入）会一起静默失效。
    try {
    const reArray = () => { if (S.lastSnap) renderArrayPane(S.lastSnap); };
    const reDs = () => { if (S.lastSnap) renderDsPane(S.lastSnap); };
    $('#arrayPick').addEventListener('change', () => { UI.arrayPick = $('#arrayPick').value; reArray(); });
    $('#arrayStyle').addEventListener('change', reArray);
    // 结构窗的切换器已由视窗组件（viewport.js）在 dsBody 内自绘，
    // 因此 #dsPick 可能不存在——这里必须判空，否则一个缺失元素会中断整个 bindToolbar()，
    // 连带后面的演示区按钮、键盘快捷键与 boot() 后半段（后端探测/样例载入）全部失效。
    const dsPickEl = $('#dsPick');
    if (dsPickEl) dsPickEl.addEventListener('change', () => { UI.dsPick = dsPickEl.value; reDs(); });
    $('#dsNodeSize').addEventListener('click', () => {
      DS_PARAMS.scale = DS_PARAMS.scale >= 1.55 ? 0.7 : +(DS_PARAMS.scale + 0.15).toFixed(2);
      reDs();
    });
    $('#dsNodeShape').addEventListener('click', () => {
      DS_PARAMS.round = !DS_PARAMS.round;
      DS_PARAMS.nodeW = DS_PARAMS.round ? 56 : 62;
      reDs();
    });
    $('#dsReset').addEventListener('click', () => {
      Object.assign(DS_PARAMS, { gap: 26, nodeW: 62, nodeH: 30, scale: 1, round: false, linkFirst: false });
      reDs();
    });
    } catch (e) {
      if (global.console) console.warn('[app] 演示区控件装配失败（不影响编译/运行/F5-F8）：', e && e.message);
    }
  }

  async function saveLocal() {
    const f = S.doc.active();
    if (!f) return;
    try {
      if (global.showSaveFilePicker) {
        const h = await global.showSaveFilePicker({
          suggestedName: f.name,
          types: [{ description: 'C source', accept: { 'text/plain': ['.c', '.cpp', '.h'] } }],
        });
        const w = await h.createWritable();
        await w.write(S.ed.getText());
        await w.close();
        S.doc.markSaved(f.id, S.ed.getText());
        setState('已保存到 ' + h.name, 'ok');
      } else {
        const blob = new Blob([S.ed.getText()], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = f.name;
        a.click();
        URL.revokeObjectURL(a.href);
        S.doc.markSaved(f.id, S.ed.getText());
        setState('已下载 ' + f.name, 'ok');
      }
    } catch (e) {
      setState('保存取消/失败：' + e.message, 'err');
    }
  }

  function openLocal() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.c,.cpp,.h,.txt';
    inp.onchange = () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        const f = S.doc.add({ name: file.name, path: '', text: String(rd.result),
          lang: /\.cpp$/i.test(file.name) ? 'cpp' : 'c' });
        $('#lang').value = f.lang;
        S.ed.setText(f.text, f.lang);
        stopTrace();
        setState('已打开 ' + file.name, 'ok');
      };
      rd.readAsText(file, 'utf-8');
    };
    inp.click();
  }

  /* ---------------- 内置样例切换器 ----------------
   * 以前只有 boot() 里"自动载入第一个样例"，界面上没有任何切换入口
   * （文件 → 内置样例… 还被错误地绑成了"打开本地文件"）。
   * 现在：工具栏一个下拉 + 文件菜单项都走 loadSample()，载入后自动插桩并停在第 1 步。
   */
  async function loadSample(file, title) {
    try {
      setState('正在载入样例 ' + file + ' …', '');
      const s = await AVC.api.sample(file);
      const f = S.doc.add({ name: s.file, text: s.code, lang: s.lang });
      $('#lang').value = f.lang;
      S.ed.setText(f.text, f.lang);
      $('#editorTitle').textContent = f.name;
      $('#editorPath').textContent = '内置样例 · ' + (title || s.file);
      $('#stFile').textContent = f.name;
      const pick = $('#samplePick');
      if (pick) pick.value = f.name;
      logLine('已载入内置样例：' + f.name);

      // 载入即插桩编译并停在第 1 步，四个演示窗立刻有内容（否则要按 F8 才画）
      logLine('正在自动跟踪（插入跟踪点并编译）…');
      try {
        const t = await ensureTrace(true);
        if (t && S.session && S.session.totalSteps > 0) {
          S.step = 0;
          renderStep();
          logLine('已停在第 1 / ' + S.session.totalSteps + ' 步，点「下一行」继续。');
        }
      } catch (e) {
        logLine('自动跟踪失败（可手动按 F8）：' + e.message);
      }
      setState('样例就绪：' + f.name, 'ok');
      return f;
    } catch (e) {
      setState('载入样例失败：' + e.message, 'err');
      return null;
    }
  }

  /** 用 /api/samples 填充工具栏下拉：samples/ds/ 的 26 例题单独一组 */
  async function fillSamplePicker() {
    const sel = $('#samplePick');
    if (!sel) return [];
    let list = [];
    try { list = (await AVC.api.samples()).samples || []; } catch (e) { return []; }
    sel.innerHTML = '';
    const groups = [
      ['数据结构例题（26 项）', list.filter(s => /^ds\//.test(s.file))],
      ['基础样例', list.filter(s => !/^ds\//.test(s.file))],
    ];
    for (const [label, arr] of groups) {
      if (!arr.length) continue;
      const og = document.createElement('optgroup');
      og.label = label;
      for (const s of arr) {
        const o = document.createElement('option');
        o.value = s.file;
        o.textContent = (s.title || s.file).replace(/^［数据结构］/, '');
        o.title = s.file;
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
    sel.addEventListener('change', () => {
      const file = sel.value;
      if (!file) return;
      const meta = list.find(x => x.file === file);
      loadSample(file, meta && meta.title);
    });
    return list;
  }


  /** 语法嗅探：明显是 C++ 的代码不要在 C 模式下编译（否则 E1091 之类） */
  function looksCpp(text) {
    return /#\s*include\s*[<"](bits\/|vector|iostream|string|map|set|queue|stack|algorithm|sstream|fstream|cstdio)/.test(text)
      || /\busing\s+namespace\b/.test(text)
      || /\btemplate\s*</.test(text)
      || /\b(std::|cout|cin|endl|vector\s*<|string\s+)/
      .test(text)
      || /\bclass\s+\w+/.test(text)
      || /for\s*\([^;)]*:[^;)]*\)/.test(text)
      || /\bnullptr\b/.test(text);
  }

  /** 若当前是 C 但代码是 C++，自动切到 C++ 并提示 */
  function autoLang(text) {
    const f = S.doc.active();
    if (!f || f.lang === 'cpp') return false;
    if (!looksCpp(text)) return false;
    f.lang = 'cpp';
    const sel = $('#lang');
    if (sel) sel.value = 'cpp';
    S.ed.setLang('cpp');
    setState('检测到 C++ 语法，已自动切到 C++ 模式', 'ok');
    return true;
  }


  /** 程序结构窗：函数表 + 数据结构静态检测（不依赖 trace） */
  function renderStructure(structure) {
    const host = $('#structBody');
    if (!host) return;
    host.innerHTML = '';

    if (AVC.detect) {
      const box = document.createElement('div');
      AVC.detect.render(box, S.ed.getText(), {
        onPick: (it) => { S.ed.gotoLine(it.line); setState('已定位：' + it.zh + '（行 ' + it.line + '）', 'ok'); },
      });
      host.appendChild(box);
    }

    if (structure && (structure.functions || []).length) {
      const fns = document.createElement('div');
      fns.style.cssText = 'margin-top:8px;border-top:1px solid #e3e8ee;padding-top:6px';
      fns.innerHTML = '<div style="font-weight:600;padding:2px 4px 4px;color:#334155">函数（' +
        structure.functions.length + '）</div>';
      const ul = document.createElement('ul');
      ul.style.cssText = 'list-style:none;margin:0;padding:0;font:12px var(--mono)';
      structure.functions.forEach(f => {
        const li = document.createElement('li');
        li.style.cssText = 'padding:2px 6px;cursor:pointer;color:#0b62a4';
        li.textContent = f.name + '(' + (f.params || '') + ')  行 ' + f.line;
        li.addEventListener('click', () => S.ed.gotoLine(f.line));
        ul.appendChild(li);
      });
      fns.appendChild(ul);
      host.appendChild(fns);
    }
  }

  /* ---------------- M4：外壳（菜单 / 视图 / 对话框） ---------------- */
  const HELP_TEXT = [
    'prototype01 = 编辑器 + 编译器 + 调试器 + 可视化（AnyviewC 样品）',
    '',
    '1) 编辑：左侧行号可点，设/取消断点；三套行底色分别是「当前执行行 / 编译错误行 / 断点行」。',
    '2) 编译：F7。错误在「输入输出 / 编译信息」里，双击可跳行。',
    '3) 运行：F5 连续运行；F8 单步（基于插桩 trace 回放，不是真调试器 API）。',
    '4) 演示区四窗：数组（一维/二维/稀疏）、结构（链表/树）、运行栈（活动记录）、堆（malloc 块）。',
    '5) 工具→跟踪设置：为变量手工指定可视结构种类（26 项，按逻辑结构分组）。',
    '6) 工具→配置：配色（键名对齐 anyview.ini）与速度三档。',
  ].join('\n');
  const HELP_KEYS = 'F7 编译　F5 运行　F8 下一行　F11 进入函数\nCtrl+S 保存　Ctrl+O 打开　Ctrl+F 查找　Ctrl+G 跳行';
  const ABOUT_TEXT = 'prototype01\n\n后端：Open Watcom V2（由 04\\builder 源码自编的 bwcc386 / wpp386 + wcl386）\n前端：零依赖 HTML/JS\n可视化方法：对齐 .bench/00_report/AnyviewC.re.db 与 .bench/10_viz_principles';

  function insertAtCursor(src) {
    const ta = $('#code');
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + src + ta.value.slice(e);
    ta.selectionStart = ta.selectionEnd = s + src.length;
    S.ed.refresh();
    const f = S.doc.active();
    if (f) S.doc.setText(f.id, ta.value);
    setState('已插入类型定义', 'ok');
  }

  function findText(next) {
    const q = (findText._q != null) ? findText._q : prompt('查找内容：');
    if (q == null || q === '') return;
    findText._q = q;
    const ta = $('#code');
    const from = next ? ta.selectionEnd : 0;
    const i = ta.value.indexOf(q, from);
    if (i < 0) { setState('未找到：' + q, 'err'); return; }
    ta.focus();
    ta.selectionStart = i; ta.selectionEnd = i + q.length;
    S.ed.scrollToLine(AVC.doc.lineOf(ta.value, i));
    setState('找到：' + q, 'ok');
  }

  function replaceText() {
    const q = prompt('查找内容：');
    if (!q) return;
    const r = prompt('替换为：', '') || '';
    const ta = $('#code');
    const n = ta.value.split(q).length - 1;
    ta.value = ta.value.split(q).join(r);
    S.ed.refresh();
    const f = S.doc.active();
    if (f) S.doc.setText(f.id, ta.value);
    setState('已替换 ' + n + ' 处', 'ok');
  }

  function zoom(dir) {
    const root = document.documentElement;
    const cur = parseFloat(root.style.getPropertyValue('--ui-zoom') || '13');
    const v = Math.max(10, Math.min(20, cur + dir));
    root.style.setProperty('--ui-zoom', v);
    document.body.style.fontSize = v + 'px';
    setState('字号 ' + v + 'px', '');
  }

  function openTrackSettings() {
    AVC.dialogs.openTrackSettings({
      snapshot: S.lastSnap,
      structure: S.trace && S.trace.structure,
    });
  }

  function bindShell() {
    AVC.viewmgr.load();
    AVC.viewmgr.apply();
    AVC.viewmgr.bindMaxButtons();

    AVC.menubar.register({
      'file.new': () => {
        const f = S.doc.add({ name: 'untitled.c', text: '', lang: 'c' });
        $('#lang').value = f.lang; S.ed.setText('', 'c'); stopTrace();
        $('#editorTitle').textContent = f.name;
      },
      'file.open': openLocal,
      // 文件 → 内置样例…：不是"打开本地文件"，而是把焦点交给工具栏的样例下拉
      'file.sample': () => {
        const sel = $('#samplePick');
        if (!sel) return openLocal();
        sel.focus();
        if (typeof sel.showPicker === 'function') { try { sel.showPicker(); return; } catch (e) { /* 老浏览器 */ } }
        sel.size = Math.min(12, sel.options.length || 12);
        setState('样例下拉已展开：选一项即载入（再点一次收起）', 'ok');
        sel.onblur = () => { sel.size = 0; sel.onblur = null; };
      },
      'file.save': saveLocal,
      'file.saveAs': saveLocal,
      'file.close': () => {
        const f = S.doc.active(); if (!f) return;
        S.doc.close(f.id);
        const n = S.doc.active();
        if (n) { S.ed.setText(n.text, n.lang); $('#editorTitle').textContent = n.name; }
        else S.ed.setText('', 'c');
      },
      'file.closeAll': () => {
        S.doc.files.slice().forEach(f => S.doc.close(f.id));
        S.ed.setText('', 'c'); $('#editorTitle').textContent = '未命名.c';
      },
      'edit.undo': () => document.execCommand && document.execCommand('undo'),
      'edit.redo': () => document.execCommand && document.execCommand('redo'),
      'edit.cut': () => document.execCommand && document.execCommand('cut'),
      'edit.copy': () => document.execCommand && document.execCommand('copy'),
      'edit.paste': () => document.execCommand && document.execCommand('paste'),
      'edit.selectAll': () => { const ta = $('#code'); ta.focus(); ta.select(); },
      'search.find': () => { findText._q = null; findText(false); },
      'search.findNext': () => findText(true),
      'search.replace': replaceText,
      'search.goto': () => { const n = parseInt(prompt('跳转到行号：') || '', 10); if (n > 0) S.ed.gotoLine(n); },
      'run.compile': () => doCompile(),
      'run.compileRun': () => doCompile(true).then(r => { if (r && r.ok) doRun(); }),
      'run.run': doRun,
      'run.console': doConsoleRun,
      'run.auto': autoRun,
      'run.pause': () => { pauseAuto(); setState('已暂停', ''); },
      'run.stop': () => { stopTrace(); setState('已停止', ''); },
      'run.stepOver': () => { pauseAuto(); stepOnce('over'); },
      'run.stepInto': () => { pauseAuto(); stepOnce('into'); },
      'run.speedUp': () => { const s = $('#speed'); s.value = Math.min(100, (+s.value) + 10); $('#speedVal').textContent = s.value; },
      'run.speedDown': () => { const s = $('#speed'); s.value = Math.max(1, (+s.value) - 10); $('#speedVal').textContent = s.value; },
      'tool.config': () => AVC.dialogs.openConfig({
        onApply: () => { AVC.theme.apply(); if (S.lastSnap) renderDemo(S.lastSnap); },
      }),
      'tool.datastruct': () => AVC.dialogs.openDataStruct({ onInsert: insertAtCursor }),
      'tool.track': openTrackSettings,
      'view.restore': () => AVC.viewmgr.restoreLayout(),
      'view.fontBig': () => zoom(1),
      'view.fontSmall': () => zoom(-1),
      'help.doc': () => AVC.dialogs.openText('使用说明', HELP_TEXT),
      'help.keys': () => AVC.dialogs.openText('快捷键', HELP_KEYS),
      'app.about': () => AVC.dialogs.openText('关于 prototype01', ABOUT_TEXT),
    });

    AVC.menubar.bind();
    const b = $('#btnTrackSettings');
    if (b) b.addEventListener('click', openTrackSettings);
  }

  async function boot() {
    if (AVC.theme && AVC.theme.apply) AVC.theme.apply();
    bindShell();
    S.doc = AVC.doc.create();
    S.ed = AVC.editor.mount($('#editorWin'));

    S.ed.onChange((text) => {
      const f = S.doc.active();
      if (f) S.doc.setText(f.id, text);
      autoLang(text);          // C++ 代码自动切语言，避免 E1091
      if (AVC.detect) renderStructure(null);   // 边写边检测数据结构
      S.trace = null;          // 源码变更 → 旧 trace 失效
    });
    S.ed.onCursor((p) => {
      $('#stPos').textContent = '行 ' + p.line + ', 列 ' + p.col;
    });
    S.ed.onGutter((line) => {
      const f = S.doc.active();
      if (!f) return;
      const on = S.doc.toggleBreakpoint(f.id, line);
      S.ed.setBreakpoints(f.breakpoints);
      setState('断点' + (on ? '已设置' : '已取消') + '：行 ' + line, '');
    });

    bindToolbar();

    // 后端探测
    try {
      const h = await AVC.api.health();
      $('#stBackend').textContent = 'C: ' + (h.cc ? h.cc.split('\\').pop() : '—') +
        ' · C++: ' + (h.cxx ? h.cxx.split('\\').pop() : '—');
      setState('就绪', 'ok');
    } catch (e) {
      $('#stBackend').textContent = '后端不可达';
      setState('后端不可达：' + e.message, 'err');
    }

    // 内置样例：先把工具栏下拉填满，再载入第一个
    const sampleList = await fillSamplePicker().catch(() => []);
    try {
      const first = (sampleList && sampleList[0]) || (await AVC.api.samples()).samples[0];
      if (first) {
        const loaded = await loadSample(first.file, first.title);
        if (!loaded) throw new Error('首个样例载入失败');
      }
    } catch (e) { /* 样例加载失败不阻断 */ }

    showPane('out');
    logLine('M2 骨架已就绪：编辑 → 编译(F7) → 运行(F5) → 下一行(F8)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
