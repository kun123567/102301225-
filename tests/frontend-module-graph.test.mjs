import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * 前端模块图必须能"链接"起来 —— 每个具名导入都必须在目标模块里真的导出。
 *
 * 这条测试是被一次真实事故逼出来的：`app.js` 从 `engine-program.js` 导入了
 * `looksLikeCpp`，但那个模块当时并没有这个导出。ES module 在**链接阶段**就抛
 * `does not provide an export named 'looksLikeCpp'`，于是整个 app.js 不执行 ——
 * 页面看着还在，但所有按钮都不响应（"什么都不能交互"）。
 * 静态检查（`node --check`）只查语法、不查导出，所以必须在这里拦。
 */

const FRONTEND = fileURLToPath(new URL('../frontend/', import.meta.url));

async function collect(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await collect(p));
    else if (entry.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('前端所有具名导入都能在目标模块里解析（缺导出会让整页失去交互）', async () => {
  const files = [
    ...await collect(path.join(FRONTEND, 'src')),
    ...await collect(path.join(FRONTEND, 'vendor', 'plus', 'app')),
  ];
  assert.ok(files.length >= 20, '扫到的前端模块太少：' + files.length);

  const problems = [];
  let checked = 0;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)) {
      const [, names, spec] = match;
      const target = path.resolve(path.dirname(file), spec);
      if (!target.startsWith(FRONTEND)) continue;          // 只查仓内模块
      let mod;
      try {
        mod = await import(pathToFileURL(target).href);
      } catch (error) {
        problems.push(`${path.relative(FRONTEND, file)} → ${spec} 加载失败：${String(error.message).split('\n')[0]}`);
        continue;
      }
      for (const raw of names.split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        checked += 1;
        if (!(name in mod)) problems.push(`${path.relative(FRONTEND, file)} 从 ${spec} 导入了不存在的导出 '${name}'`);
      }
    }
  }
  assert.deepEqual(problems, [], '前端模块图断链（页面会失去交互）：\n' + problems.join('\n'));
  assert.ok(checked >= 80, '检查的具名导入偏少：' + checked);
});

test('app.js 引用的 DOM id 在 index.html 里都存在（点不到控件 = 交互坏）', async () => {
  const app = await readFile(path.join(FRONTEND, 'src', 'app.js'), 'utf8');
  const html = await readFile(path.join(FRONTEND, 'index.html'), 'utf8');
  const ids = [...new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]))];
  assert.ok(ids.length >= 25, 'app.js 引用的 id 偏少：' + ids.length);
  const missing = ids.filter((id) => !html.includes('id="' + id + '"'));
  assert.deepEqual(missing, [], 'index.html 缺少这些 id：' + missing.join(', '));
});
