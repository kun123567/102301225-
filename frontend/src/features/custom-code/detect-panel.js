/**
 * detect-panel.js -- 自定义代码的「自动识别」面板
 *
 * 数据来自后端 `POST /api/detect`（base 的识别器：声明表 + 语义 + 兜底正则），
 * 纯静态、毫秒级、不改用户代码。识别结果回答"这段代码用了哪些数据结构"，
 * 后续按 templateId 选画法（这一步先只做识别展示，不动渲染）。
 *
 * 契约：
 *   createDetectPanel({ mount, request, onJumpLine }) -> {
 *     analyze(code), clear(), destroy(), getState()
 *   }
 *   · 输入去抖 600ms，只认最后一次
 *   · 空代码 / 识别不到 / 请求失败 都要有明确文案，不静默
 */

const DEBOUNCE_MS = 600;

const LOGICAL_TEXT = { linear: '线性', tree: '树形', graph: '图形', set: '集合' };
const SOURCE_TEXT = { ast: '声明表', semantic: '语义', regex: '文本规则' };

export function createDetectPanel({ mount, request, onJumpLine = () => {} } = {}) {
  if (!mount) throw new Error('createDetectPanel 需要一个挂载点');
  if (typeof request !== 'function') throw new Error('createDetectPanel 需要 request(path, opts)');

  const doc = mount.ownerDocument || globalThis.document;
  if (!doc || typeof doc.createElement !== 'function') throw new Error('createDetectPanel 拿不到 document（挂载点没有 ownerDocument）');
  mount.replaceChildren();

  const head = doc.createElement('div');
  head.className = 'detect-head';
  const title = doc.createElement('span');
  title.className = 'detect-title';
  title.textContent = '自动识别：这段代码用了哪些数据结构';
  const status = doc.createElement('span');
  status.className = 'detect-status muted';
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'secondary detect-run';
  button.textContent = '识别结构';
  head.append(title, status, button);

  const list = doc.createElement('ul');
  list.className = 'detect-list';

  const help = doc.createElement('p');
  help.className = 'detect-help muted';
  help.textContent = '静态识别，不编译、不改你的代码；识别不到的写法会在下面说明。';

  mount.append(head, list, help);

  let timer = null;
  let generation = 0;
  let last = { code: '', count: 0, items: [] };
  let busy = false;

  function setStatus(text, tone = '') {
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function renderItem(item) {
    const li = doc.createElement('li');
    li.className = 'detect-item';
    li.dataset.template = item.templateId || '';

    const name = doc.createElement('b');
    name.textContent = item.name || '（未命名）';
    const meta = doc.createElement('span');
    meta.className = 'detect-meta';
    const parts = [];
    if (item.logical) parts.push(LOGICAL_TEXT[item.logical] || item.logical);
    if (typeof item.conf === 'number') parts.push('置信 ' + item.conf.toFixed(2));
    if (item.source) parts.push('来源 ' + (SOURCE_TEXT[item.source] || item.source));
    if (Number.isInteger(item.line) && item.line > 0) parts.push('第 ' + item.line + ' 行');
    meta.textContent = parts.join(' · ');

    li.append(name, meta);
    if (item.why) {
      const why = doc.createElement('span');
      why.className = 'detect-why';
      why.textContent = item.why;
      li.append(why);
    }
    if (Number.isInteger(item.line) && item.line > 0) {
      li.classList.add('is-clickable');
      li.addEventListener('click', () => onJumpLine(item.line));
    }
    return li;
  }

  function paint(result) {
    list.replaceChildren(...(result.items || []).map(renderItem));
    if (!result.count) {
      setStatus('没有识别到明确的数据结构', 'warn');
      help.textContent = '可能是：代码没写完、只用了基本变量，或写法超出当前判据（26 项目录以外）。';
      return;
    }
    setStatus('识别到 ' + result.count + ' 项');
    const weak = (result.items || []).filter((it) => typeof it.conf === 'number' && it.conf < 0.8).length;
    help.textContent = weak
      ? '有 ' + weak + ' 项置信度偏低（<0.8），运行后可用指针/入出度事实复核。'
      : '全部来自声明表或语义判据，可直接用于选择画法。';
  }

  async function run(code) {
    const text = String(code || '');
    const mine = ++generation;
    if (!text.trim()) {
      last = { code: '', count: 0, items: [] };
      list.replaceChildren();
      setStatus('等代码…');
      help.textContent = '静态识别，不编译、不改你的代码；识别不到的写法会在下面说明。';
      return last;
    }
    busy = true;
    setStatus('识别中…');
    try {
      const result = await request('/api/detect', { body: { code: text } });
      if (mine !== generation) return last;                  // 已经又改了代码，丢弃过期结果
      last = { code: text, count: result.count || 0, items: result.items || [] };
      paint(last);
      return last;
    } catch (error) {
      if (mine !== generation) return last;
      last = { code: text, count: 0, items: [], error: error.message };
      list.replaceChildren();
      setStatus('识别失败', 'bad');
      help.textContent = error.message;
      return last;
    } finally {
      if (mine === generation) busy = false;
    }
  }

  function analyze(code) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; run(code); }, DEBOUNCE_MS);
  }

  function clear() {
    if (timer) { clearTimeout(timer); timer = null; }
    generation += 1;
    last = { code: '', count: 0, items: [] };
    list.replaceChildren();
    setStatus('');
    help.textContent = '静态识别，不编译、不改你的代码；识别不到的写法会在下面说明。';
  }

  button.addEventListener('click', () => {
    if (timer) { clearTimeout(timer); timer = null; }
    const source = doc.getElementById && doc.getElementById('code-input');
    run(source ? source.value : last.code);
  });

  return {
    analyze,
    clear,
    destroy() {
      if (timer) clearTimeout(timer);
      timer = null;
      generation += 1;
      mount.replaceChildren();
    },
    getState() { return { ...last, busy }; },
  };
}
