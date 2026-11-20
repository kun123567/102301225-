'use strict';
/**
 * selftest.js -- 后端自检（不经过浏览器，直接调 API）
 *   node server/selftest.js            # 跑全部样例
 *   node server/selftest.js 01_bubble  # 只跑名字匹配的样例
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8770);
const SAMPLES = path.resolve(__dirname, '..', 'samples');

function post(p, body) {
  const data = Buffer.from(JSON.stringify(body), 'utf8');
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: HOST, port: PORT, path: p, method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(txt)); } catch (e) { reject(new Error('非 JSON 响应: ' + txt.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}
function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: HOST, port: PORT, path: p }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
    }).on('error', reject);
  });
}

(async () => {
  const filter = process.argv[2] || '';
  console.log('== /api/health ==');
  const h = await get('/api/health');
  console.log('  cc    :', h.cc);
  console.log('  cxx   :', h.cxx);
  console.log('  linker:', h.linker);
  if (!h.ok) { console.error('  后端不完整，退出'); process.exit(1); }

  const files = fs.readdirSync(SAMPLES).filter(f => /\.(c|cpp)$/.test(f) && f.includes(filter)).sort();
  let bad = 0;
  for (const f of files) {
    const code = fs.readFileSync(path.join(SAMPLES, f), 'utf8');
    const lang = /\.cpp$/.test(f) ? 'cpp' : 'c';
    console.log('\n=== ' + f + ' (' + lang + ') ===');

    const c = await post('/api/compile', { code, lang });
    if (!c.ok) {
      bad++;
      console.log('  [编译失败]', (c.log || '').split('\n').slice(0, 4).join(' | '));
      continue;
    }
    console.log('  [编译通过] diags=' + (c.diags || []).length +
      '  函数=' + (c.structure.functions || []).map(x => x.name).join(',') +
      '  变量=' + (c.structure.vars || []).length);

    const r = await post('/api/run', { code, lang, stdin: '' });
    const head = (r.stdout || '').trim().split('\n').slice(0, 3).join(' ⏎ ');
    console.log('  [运行] ok=' + r.ok + ' exit=' + r.exitCode + ' ms=' + r.ms + ' 输出: ' + head);

    const t = await post('/api/trace', { code, lang, stdin: '', maxSteps: 3000 });
    if (!t.ok) {
      bad++;
      console.log('  [跟踪失败] stage=' + t.stage + ' ' + (t.log || '').slice(0, 200));
      continue;
    }
    const shapes = {};
    for (const e of t.events) if (e[0] === 'LE') shapes[e[1]] = e[2] + '/' + e[3];
    console.log('  [跟踪] steps=' + t.steps + ' events=' + t.events.length +
      ' truncated=' + t.truncated + ' mode=' + t.degradedMode +
      ' 结构=' + (JSON.stringify(shapes) || '{}'));
    if (!t.steps) { bad++; console.log('  !! 没有任何步骤事件'); }
  }
  console.log('\n== 结果 ==');
  console.log(bad === 0 ? '  全部通过' : '  失败样例数: ' + bad);
  process.exit(bad === 0 ? 0 : 2);
})().catch(e => { console.error(e); process.exit(1); });
