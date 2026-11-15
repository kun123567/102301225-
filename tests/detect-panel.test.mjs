import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createDetectPanel } from '../frontend/src/features/custom-code/detect-panel.js';

// 「自动识别」面板的接线：去抖、过期结果丢弃、空代码、请求失败、点条目跳行。
// 用假 DOM，不需要浏览器。

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.textContent = '';
    this.className = '';
    this.type = '';
    this.value = '';
    this.listeners = new Map();
    this.classList = {
      _s: new Set(),
      add: (...names) => names.forEach((n) => this.classList._s.add(n)),
      remove: (...names) => names.forEach((n) => this.classList._s.delete(n)),
      contains: (n) => this.classList._s.has(n),
    };
  }
  append(...kids) { this.children.push(...kids); kids.forEach((k) => { k.parent = this; }); }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  fire(type) { for (const fn of this.listeners.get(type) || []) fn({ type, target: this }); }
}

function fakeDoc() {
  const inputs = new Map();
  const codeInput = new FakeEl('textarea');
  codeInput.value = '';
  inputs.set('code-input', codeInput);
  const doc = {
    createElement: (tag) => new FakeEl(tag),
    getElementById: (id) => inputs.get(id) || null,
  };
  return { doc, codeInput };
}

test('点「识别结构」把编辑器里的代码发到 /api/detect，并把结果画成条目', async () => {
  const { doc, codeInput } = fakeDoc();
  const mount = new FakeEl('div');
  mount.ownerDocument = doc;
  codeInput.value = 'vector<int> g[10];';
  const calls = [];
  const panel = createDetectPanel({
    mount,
    request: async (path, opts) => {
      calls.push({ path, opts });
      return { ok: true, count: 1, items: [{ name: 'g', templateId: 'algraph', logical: 'graph', conf: 0.96, source: 'ast', line: 3, why: 'vector 的数组' }] };
    },
  });

  const head = mount.children[0];
  const button = head.children[2];
  button.fire('click');
  await delay(20);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/detect');
  assert.deepEqual(calls[0].opts.body, { code: 'vector<int> g[10];' });
  const list = mount.children[1];
  assert.equal(list.children.length, 1, '应渲染 1 个条目');
  assert.match(list.children[0].children[0].textContent, /g/);
  assert.match(list.children[0].children[1].textContent, /图形/);
  assert.match(list.children[0].children[1].textContent, /置信 0.96/);
  assert.equal(panel.getState().count, 1);
});

test('连打代码只发最后一次请求，过期结果不覆盖新结果', async () => {
  const { doc } = fakeDoc();
  const mount = new FakeEl('div');
  mount.ownerDocument = doc;
  const seen = [];
  let release = null;
  const panel = createDetectPanel({
    mount,
    request: async (path, opts) => {
      seen.push(opts.body.code);
      if (opts.body.code.includes('SLOW')) await new Promise((r) => { release = r; });
      const count = opts.body.code.includes('SLOW') ? 9 : 1;
      return { ok: true, count, items: [{ name: opts.body.code.trim(), conf: 0.9, source: 'ast', line: 1 }] };
    },
  });

  panel.analyze('first');
  panel.analyze('second');
  await delay(700);                       // 去抖窗口 + 请求
  assert.deepEqual(seen, ['second'], '去抖应只发最后一次：' + JSON.stringify(seen));

  // 慢请求还没回来时又改了代码 → 慢结果必须被丢弃
  panel.analyze('SLOW one');
  await delay(700);
  assert.equal(seen.at(-1), 'SLOW one');
  panel.analyze('fast');
  await delay(700);
  assert.equal(panel.getState().count, 1, '过期结果不该覆盖：' + JSON.stringify(panel.getState()));
  release?.();
  await delay(30);
  assert.equal(panel.getState().count, 1);
});

test('空代码不发请求、状态清空；请求失败要说人话', async () => {
  const { doc } = fakeDoc();
  const mount = new FakeEl('div');
  mount.ownerDocument = doc;
  let calls = 0;
  const panel = createDetectPanel({
    mount,
    request: async () => { calls += 1; throw new Error('无法连接服务，请检查后端是否已启动。'); },
  });

  await panel.analyze('   ');
  await delay(700);
  assert.equal(calls, 0, '空代码不该发请求');
  assert.equal(panel.getState().count, 0);

  const failingMount = new FakeEl('div');
  failingMount.ownerDocument = doc;
  const failing = createDetectPanel({ mount: failingMount, request: () => Promise.reject(new Error('无法连接服务，请检查后端是否已启动。')) });
  failing.analyze('int x;');
  await delay(700);
  const state = failing.getState();
  assert.equal(state.count, 0);
  assert.match(state.error, /无法连接服务/);
});

test('识别到 0 项时给明确文案（不是空白）', async () => {
  const { doc } = fakeDoc();
  const mount = new FakeEl('div');
  mount.ownerDocument = doc;
  const panel = createDetectPanel({ mount, request: async () => ({ ok: true, count: 0, items: [] }) });
  panel.analyze('int x = 1;');
  await delay(700);
  const head = mount.children[0];
  assert.match(head.children[1].textContent, /没有识别到/);
  assert.equal(head.children[1].dataset.tone, 'warn');
  assert.equal(mount.children[1].children.length, 0);
});

test('点条目把源码跳行信息交给 onJumpLine', async () => {
  const { doc } = fakeDoc();
  const mount = new FakeEl('div');
  mount.ownerDocument = doc;
  const jumped = [];
  const panel = createDetectPanel({
    mount,
    request: async () => ({ ok: true, count: 1, items: [{ name: 'q', templateId: 'linkqueue', conf: 0.92, source: 'ast', line: 7 }] }),
    onJumpLine: (line) => jumped.push(line),
  });
  panel.analyze('queue<int> q;');
  await delay(700);
  const item = mount.children[1].children[0];
  assert.ok(item.classList.contains('is-clickable'));
  item.fire('click');
  assert.deepEqual(jumped, [7]);
});
