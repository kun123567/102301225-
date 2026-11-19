/**
 * dialogs.js -- 对话框（M4/M5）
 *
 * 四个：跟踪设置（4 区：程序结构 / 跟踪字段 / 逻辑分类 / 画法选择）、
 *       数据结构源码插入、配置（配色 25 项 + 速度三档）、文本（帮助/关于）。
 * 跟踪设置与配色都持久化到 localStorage。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};
  const TK = 'avc.track';

  function host() { return document.getElementById('dialogHost'); }

  function open(opts) {
    const h = host();
    if (!h) return;
    h.innerHTML = '';
    const dlg = document.createElement('div');
    dlg.className = 'dialog';

    const head = document.createElement('header');
    head.textContent = opts.title || '';
    dlg.appendChild(head);

    const body = document.createElement('div');
    body.className = 'body';
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    dlg.appendChild(body);

    const foot = document.createElement('div');
    foot.className = 'footer';
    const close = () => { h.classList.remove('show'); h.innerHTML = ''; };
    (opts.footer || [{ label: '关闭' }]).forEach(f => {
      const b = document.createElement('button');
      b.textContent = f.label;
      if (f.primary) b.className = 'primary';
      b.addEventListener('click', () => {
        const keep = f.onClick ? f.onClick() === false : false;
        if (!keep) close();
      });
      foot.appendChild(b);
    });
    dlg.appendChild(foot);

    h.appendChild(dlg);
    h.classList.add('show');
    h.onclick = (e) => { if (e.target === h) close(); };
    return { close, body };
  }

  /* ---------------- 跟踪设置 ---------------- */
  function loadTrack() {
    try { return JSON.parse(localStorage.getItem(TK) || '{}'); } catch (e) { return {}; }
  }
  function saveTrack(obj) {
    try { localStorage.setItem(TK, JSON.stringify(obj)); } catch (e) {}
  }

  function openTrackSettings(ctx) {
    ctx = ctx || {};
    const snap = ctx.snapshot;
    const structure = ctx.structure;
    const cands = (snap && AVC.vmodel) ? AVC.vmodel.candidates(snap, structure) : [];
    const track = loadTrack();

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:240px 1fr;gap:14px;min-height:300px';

    /* 左：跟踪字段 */
    const left = document.createElement('div');
    left.innerHTML = '<div style="font-weight:600;margin-bottom:6px">跟踪字段</div>';
    const list = document.createElement('div');
    list.style.cssText = 'border:1px solid #e3e8ee;border-radius:6px;padding:4px;max-height:280px;overflow:auto;font:12px var(--mono)';
    if (!cands.length) {
      list.innerHTML = '<div class="empty">先在「下一行」里跑若干步，<br>这里会列出可跟踪的变量</div>';
    } else {
      cands.forEach(c => {
        const row = document.createElement('div');
        row.className = 'node';
        row.dataset.name = c.name;
        row.style.cssText = 'padding:3px 6px;border-radius:4px;cursor:pointer;display:flex;gap:6px';
        row.innerHTML = '<span>' + c.name + '</span><span class="kind">' + c.category + ' · ' + c.detail + '</span>';
        row.addEventListener('click', () => {
          list.querySelectorAll('.node').forEach(x => { x.style.background = ''; });
          row.style.background = '#e8f0fe';
          cur = c.name;
          renderRight();
        });
        list.appendChild(row);
      });
    }
    left.appendChild(list);

    /* 右：逻辑分类 + 26 模板 */
    const right = document.createElement('div');
    let cur = cands.length ? cands[0].name : '';

    function renderRight() {
      right.innerHTML = '';
      const t1 = document.createElement('div');
      t1.style.cssText = 'font-weight:600;margin-bottom:6px';
      t1.textContent = cur ? ('变量 ' + cur + ' 的可视结构种类（单选）') : '可选的视结构种类';
      right.appendChild(t1);

      const cat = AVC.dsCatalog;
      (cat ? cat.GROUPS : []).forEach(g => {
        const gd = document.createElement('div');
        gd.style.cssText = 'margin:6px 0 2px;font-size:11px;color:#7b8794';
        gd.textContent = g.name + '（' + g.items.length + '）';
        right.appendChild(gd);
        const box = document.createElement('div');
        box.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
        g.items.forEach(it => {
          const lab = document.createElement('label');
          lab.style.cssText = 'display:flex;align-items:center;gap:4px;border:1px solid #c9d2dc;border-radius:5px;padding:2px 6px;font:11px var(--mono);cursor:pointer';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'dsType';
          radio.value = it.id;
          const chosen = track[cur] && track[cur].id === it.id;
          radio.checked = !!chosen;
          radio.addEventListener('change', () => {
            if (!cur) return;
            track[cur] = { id: it.id, logical: it.logical, renderer: it.renderer, variants: it.variants };
            saveTrack(track);
          });
          lab.appendChild(radio);
          lab.appendChild(document.createTextNode(it.zh));
          if (it.note) lab.title = it.note;
          box.appendChild(lab);
        });
        right.appendChild(box);
      });

      const tip = document.createElement('div');
      tip.className = 'empty';
      tip.style.textAlign = 'left';
      tip.textContent = '说明：原版靠用户手工指定为主、自动识别为辅（07_TREE_GRAPH §5）；此设置保存在浏览器本地。';
      right.appendChild(tip);
    }

    wrap.appendChild(left);
    wrap.appendChild(right);
    renderRight();

    open({
      title: '跟踪设置（可视结构种类）',
      body: wrap,
      footer: [
        { label: '清除全部设置', onClick: () => { saveTrack({}); return false; } },
        { label: '完成', primary: true },
      ],
    });
  }

  /* ---------------- 数据结构源码插入 ---------------- */
  function openDataStruct(ctx) {
    ctx = ctx || {};
    const wrap = document.createElement('div');
    const cat = AVC.dsCatalog;
    const names = cat ? Object.keys(cat.TYPE_SRC) : [];
    wrap.innerHTML = '<div style="margin-bottom:8px;font-size:12px;color:#52606d">选择要插入到光标处的类型定义（演示用节选）</div>';
    const sel = document.createElement('select');
    sel.style.cssText = 'font:12px var(--mono);padding:4px;width:100%';
    names.forEach(n => {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
    const pre = document.createElement('pre');
    pre.style.cssText = 'background:#fbfcfd;border:1px solid #e3e8ee;border-radius:6px;padding:8px;font:12px/1.5 var(--mono);max-height:240px;overflow:auto;white-space:pre-wrap';
    const refresh = () => { pre.textContent = cat.TYPE_SRC[sel.value] || ''; };
    sel.addEventListener('change', refresh);
    wrap.appendChild(sel);
    wrap.appendChild(pre);
    refresh();

    open({
      title: '数据结构类型定义',
      body: wrap,
      footer: [
        { label: '取消' },
        {
          label: '插入到编辑器', primary: true,
          onClick: () => { if (ctx.onInsert) ctx.onInsert(pre.textContent); },
        },
      ],
    });
  }

  /* ---------------- 配置：配色 + 速度 ---------------- */
  const COLOR_KEYS = [
    ['Memory', ['MemBkg', 'MemFrame', 'MemNode', 'MemEmpty', 'MemFocus', 'MemInvalid']],
    ['Array', ['ArrName', 'ArrBracket', 'ArrValue', 'ArrOneCoor', 'ArrOneFocus1', 'ArrOneFocus2', 'ArrOneGrid', 'ArrOneLine']],
    ['Link', ['LinkNode', 'LinkNodeFrame', 'LinkNodeLine', 'LinkDot', 'LinkHead', 'LinkHeadText']],
    ['Syntax', ['SyntaxRunLineBkg', 'SyntaxErrLineBkg', 'SyntaxBreadPointBkg']],
  ];

  function openConfig(ctx) {
    ctx = ctx || {};
    const t = AVC.theme;
    const wrap = document.createElement('div');

    COLOR_KEYS.forEach(([grp, keys]) => {
      const h = document.createElement('div');
      h.style.cssText = 'font-weight:600;margin:8px 0 4px';
      h.textContent = '[' + grp + ']';
      wrap.appendChild(h);
      const box = document.createElement('div');
      box.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
      keys.forEach(k => {
        const lab = document.createElement('label');
        lab.style.cssText = 'display:flex;align-items:center;gap:5px;font:11px var(--mono);border:1px solid #e3e8ee;border-radius:5px;padding:2px 6px';
        const inp = document.createElement('input');
        inp.type = 'color';
        inp.value = t.css(k);
        inp.addEventListener('change', () => { t.set(k, '#' + inp.value.replace('#', '')); if (ctx.onApply) ctx.onApply(); });
        lab.appendChild(inp);
        lab.appendChild(document.createTextNode(k));
        box.appendChild(lab);
      });
      wrap.appendChild(box);
    });

    const h2 = document.createElement('div');
    h2.style.cssText = 'font-weight:600;margin:12px 0 4px';
    h2.textContent = '[Main] 速度三档（SpeedIndex 1..5）';
    wrap.appendChild(h2);
    const rng = document.createElement('input');
    rng.type = 'range'; rng.min = 1; rng.max = 5; rng.value = t.get('SpeedIndex');
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font:11px var(--mono);margin-left:8px';
    const upd = () => {
      t.set('SpeedIndex', Number(rng.value));
      lbl.textContent = '当前 ' + rng.value + ' → 间隔 ' + t.stepInterval() + ' ms';
    };
    rng.addEventListener('input', () => { upd(); if (ctx.onApply) ctx.onApply(); });
    upd();
    wrap.appendChild(rng);
    wrap.appendChild(lbl);

    open({
      title: '配置（配色与速度，键名对齐 anyview.ini）',
      body: wrap,
      footer: [
        { label: '恢复默认', onClick: () => { Object.keys(t.INI).forEach(k => t.set(k, t.INI[k])); if (ctx.onApply) ctx.onApply(); } },
        { label: '完成', primary: true },
      ],
    });
  }

  function openText(title, html) {
    open({ title, body: '<div style="font:13px/1.7 var(--ui);white-space:pre-wrap">' + html + '</div>' });
  }

  AVC.dialogs = { open, openTrackSettings, openDataStruct, openConfig, openText, loadTrack, saveTrack };
})(typeof window !== 'undefined' ? window : globalThis);
