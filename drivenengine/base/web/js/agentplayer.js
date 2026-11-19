/**
 * agentplayer.js -- B 包步骤流回放器（代码 + 可视化同步）
 *
 * 数据：data/agent-b.json（server/agent-adapter.js 生成）
 *   algorithms[].sourceLines = [{lineId, text}]   ← 上游源码行表（含多行文本）
 *   algorithms[].steps[].lineId                   ← 本步运行到哪一行
 * 渲染：完全复用 prototype01 视窗组件（viewport.js），渲染器只按 shape 分派
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};
  const $ = (s) => document.querySelector(s);

  const S = { data: null, algo: null, idx: 0, timer: null, vp: null, rows: [] };

  /* ---------------- 代码面板 ---------------- */
  /** 把 sourceLines 摊平成"显示行"，每行记住自己的 lineId 与序号 */
  function flattenSource(sourceLines) {
    const rows = [];
    (sourceLines || []).forEach(item => {
      const parts = String(item.text == null ? '' : item.text).split('\n');
      parts.forEach(t => rows.push({ lineId: item.lineId, text: t }));
    });
    return rows;
  }

  function buildCodePanel() {
    const host = $('#code');
    host.innerHTML = '';
    S.rows = flattenSource(S.algo && S.algo.sourceLines);
    if (!S.rows.length) {
      host.innerHTML = '<div class="kv" style="color:#98a2b3">该算法未提供源码行表</div>';
      return;
    }
    S.rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'ln';
      row.dataset.lineId = r.lineId;
      row.dataset.idx = String(i);
      const no = document.createElement('span');
      no.className = 'no';
      no.textContent = String(i + 1);
      const tx = document.createElement('span');
      tx.className = 'tx';
      tx.textContent = r.text;
      row.appendChild(no);
      row.appendChild(tx);
      host.appendChild(row);
    });
  }

  /** 高亮本步运行部位（lineId 相同的显示行全部点亮；多行块整体点亮） */
  function highlight(lineId, stepIndex, total) {
    const host = $('#code');
    const rows = host.querySelectorAll('.ln');
    let first = null, hit = -1;
    rows.forEach((row, i) => {
      const on = row.dataset.lineId === lineId;
      row.classList.toggle('cur', on);
      row.classList.toggle('done', !on && (i / Math.max(1, rows.length) * total) < stepIndex);
      if (on) { hit = i; if (!first) first = row; }
    });
    if (first && first.scrollIntoView) {
      try { first.scrollIntoView({ block: 'nearest' }); } catch (_) { }
    }
    return hit;
  }

  /* ---------------- 单步渲染 ---------------- */
  function render() {
    const a = S.algo;
    if (!a || !a.steps.length) return;
    const snap = a.steps[S.idx];
    $('#stepNow').textContent = String(S.idx + 1);
    $('#stepAll').textContent = String(a.steps.length);
    $('#evNow').textContent = snap.event || '—';
    $('#evTag').textContent = snap.event || 'step';
    $('#descText').textContent = snap.desc || '';
    $('#track').value = String(S.idx);

    const hit = highlight(snap.lineId, S.idx, a.steps.length);
    $('#lineNow').textContent = (hit >= 0 ? '第 ' + (hit + 1) + ' 行 · ' : '') + (snap.lineId || '—');

    const cs = AVC.viewport.buildCandidates(snap, []);
    S.vp.setCandidates(cs);
    S.vp.update(snap);
  }

  function goto(i) {
    if (!S.algo) return;
    S.idx = Math.max(0, Math.min(i, S.algo.steps.length - 1));
    render();
  }

  function play() {
    if (S.timer) { stop(); return; }
    $('#btnPlay').textContent = '⏸ 暂停';
    S.timer = setInterval(() => {
      if (S.idx >= S.algo.steps.length - 1) { stop(); return; }
      goto(S.idx + 1);
    }, 700);
  }
  function stop() {
    if (S.timer) clearInterval(S.timer);
    S.timer = null;
    $('#btnPlay').textContent = '▶ 播放';
  }

  function selectAlgo(key) {
    stop();
    S.algo = S.data.algorithms.find(x => x.key === key) || S.data.algorithms[0];
    S.idx = 0;
    $('#track').max = String(S.algo.steps.length - 1);
    $('#meta').textContent = S.algo.title + ' · ' + S.algo.steps.length + ' 步 · 代码 ' +
      (S.algo.sourceLines ? flattenSource(S.algo.sourceLines).length : 0) + ' 行';
    buildCodePanel();
    render();
  }

  async function boot() {
    S.vp = AVC.viewport.create({ host: $('#vizHost') });

    const res = await fetch('data/agent-b.json', { cache: 'no-store' });
    S.data = await res.json();
    const sel = $('#algo');
    S.data.algorithms.forEach(a => {
      const o = document.createElement('option');
      o.value = a.key;
      o.textContent = a.title + '（' + a.steps.length + ' 步）';
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => selectAlgo(sel.value));
    $('#btnFirst').addEventListener('click', () => { stop(); goto(0); });
    $('#btnPrev').addEventListener('click', () => { stop(); goto(S.idx - 1); });
    $('#btnNext').addEventListener('click', () => { stop(); goto(S.idx + 1); });
    $('#btnLast').addEventListener('click', () => { stop(); goto(S.algo.steps.length - 1); });
    $('#btnPlay').addEventListener('click', play);
    $('#track').addEventListener('input', () => { stop(); goto(Number($('#track').value)); });

    // 支持 ?algo=bfs&step=20 直接定位（自动化验收用）
    const qs = new URLSearchParams(location.search);
    const pick = qs.get('algo');
    selectAlgo((pick && S.data.algorithms.some(a => a.key === pick)) ? pick : S.data.algorithms[0].key);
    const st = Number(qs.get('step'));
    if (isFinite(st) && st > 0) goto(st - 1);
    global.__agentPlayer = S;
  }

  AVC.agentPlayer = { boot, S, flattenSource };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
