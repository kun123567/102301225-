/**
 * api.js -- 后端 HTTP 客户端（M2）
 * 无依赖，浏览器与 node 均可加载（node 测试时注入 globalThis.fetch）。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  const BASE = '';

  async function req(path, opts) {
    const r = await fetch(BASE + path, opts);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) {
      throw new Error('非 JSON 响应（HTTP ' + r.status + '）: ' + text.slice(0, 200));
    }
    if (!r.ok && !data.error) throw new Error('HTTP ' + r.status);
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  function post(path, body) {
    return req(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body || {}),
    });
  }

  AVC.api = {
    health: () => req('/api/health'),
    samples: () => req('/api/samples'),
    sample: (name) => req('/api/sample?name=' + encodeURIComponent(name)),
    compile: (code, lang) => post('/api/compile', { code, lang }),
    run: (code, lang, stdin, timeoutMs) => post('/api/run', { code, lang, stdin, timeoutMs }),
    trace: (code, lang, stdin, maxSteps) => post('/api/trace', { code, lang, stdin, maxSteps }),
    runConsole: (code, lang) => post('/api/runconsole', { code, lang }),
  };
})(typeof window !== 'undefined' ? window : globalThis);
