import assert from 'node:assert/strict';
import { test } from 'node:test';
import { engineHealth, traceProgram } from '../backend/src/custom-code/detect-engine.js';

/**
 * C++ 类/结构体的插桩支持（力扣 Trie 那一类代码）
 *
 * 处理过的三个坑，每个都有对应断言：
 *   ① 结构体扫描原来只认 `struct|union`，`class Trie` 认不出来 → 现在 class 一起认；
 *   ② 类体里 public:/private: 与成员函数体会被当成字段，dump 代码去访问 `p->i` 直接编不过
 *      → 现在只取类体第一层的声明；
 *   ③ 生成出来的 dump 是普通函数，读 private 成员报 E148 → C++ 下临时放开可见性。
 */

const compilerReady = () => {
  try { return engineHealth().ok; } catch { return false; }
};

const TRIE_CLASS = [
  '#include <stdio.h>',
  'class Trie {',
  'private:',
  '  Trie* children[26];',
  '  bool isEnd;',
  '  Trie* searchPrefix(const char* prefix) {',
  '    Trie* node = this;',
  '    int i;',
  '    for (i = 0; prefix[i] != 0; i++) {',
  "      int ch = prefix[i] - 'a';",
  '      if (node->children[ch] == 0) {',
  '        return 0;',
  '      }',
  '      node = node->children[ch];',
  '    }',
  '    return node;',
  '  }',
  'public:',
  '  Trie() {',
  '    int i;',
  '    for (i = 0; i < 26; i++) {',
  '      children[i] = 0;',
  '    }',
  '    isEnd = false;',
  '  }',
  '  void insert(const char* word) {',
  '    Trie* node = this;',
  '    int i;',
  '    for (i = 0; word[i] != 0; i++) {',
  "      int ch = word[i] - 'a';",
  '      if (node->children[ch] == 0) {',
  '        node->children[ch] = new Trie();',
  '      }',
  '      node = node->children[ch];',
  '    }',
  '    node->isEnd = true;',
  '  }',
  '  bool search(const char* word) {',
  '    Trie* node = this->searchPrefix(word);',
  '    return node != 0 && node->isEnd;',
  '  }',
  '  bool startsWith(const char* prefix) {',
  '    return this->searchPrefix(prefix) != 0;',
  '  }',
  '};',
  'int main(void) {',
  '  Trie* t = new Trie();',
  '  t->insert("apple");',
  '  t->insert("app");',
  '  printf("%d %d %d\\n", (int)t->search("app"), (int)t->search("appl"), (int)t->startsWith("app"));',
  '  return 0;',
  '}',
].join('\n');

test('C++ class（private 成员 + 成员函数）能插桩跟踪，并画成图', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const trace = await traceProgram({ code: TRIE_CLASS, lang: 'cpp', maxSteps: 4000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').split('\n').filter((l) => /Error!/.test(l)).slice(0, 2).join(' | '));
  assert.equal(trace.degradedMode, 'full', '应完整插桩（含 dump），不该降级：' + trace.degradedMode);
  assert.match(String(trace.stdout), /1 0 1/, 'Trie 的判题结果必须是 1 0 1');
  assert.ok(trace.steps > 50, '步数偏少：' + trace.steps);
  assert.ok(trace.layerRun && trace.layerRun.ok, '折叠失败：' + (trace.layerRun && trace.layerRun.error));
  assert.ok(trace.layerRun.families.includes('graph'), 'Trie 应折叠成图：' + trace.layerRun.families.join(','));
  const biggest = trace.layerRun.steps
    .flatMap((step) => step.layers)
    .reduce((best, layer) => (!best || (layer.data.nodes || []).length > (best.data.nodes || []).length ? layer : best), null);
  assert.ok(biggest, '没有任何层');
  assert.equal(biggest.style, 10, 'Trie 应走图视图（style 10）');
  /* "apple" + "app" 共享前缀：root→a→p→p→l→e 共 6 个结点、5 条边 */
  assert.equal(biggest.data.nodes.length, 6, '结点数应为 6：' + JSON.stringify(biggest.data.nodes.map((n) => n.label)));
  assert.equal(biggest.data.edges.length, 5, '边数应为 5（共享前缀不重复）：' + JSON.stringify(biggest.data.edges));
  const ids = new Set(biggest.data.nodes.map((n) => n.id));
  assert.ok(biggest.data.edges.every((e) => ids.has(e.from) && ids.has(e.to)), '边必须连到真实结点');
  assert.equal(new Set(biggest.data.edges.map((e) => e.from + '>' + e.to)).size, biggest.data.edges.length, '不该有重复边');
});

test('Trie：结点按"父结点槽位"标成字母、树形布局、node 指针随执行移动', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const trace = await traceProgram({ code: TRIE_CLASS, lang: 'cpp', maxSteps: 4000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  assert.equal(trace.degradedMode, 'full', '必须完整插桩（降级就没有结构事件了）：' + trace.degradedMode);

  /* ① 成员函数体也插桩了：函数里的局部变量（i / isEnd）会逐步出现 */
  const scalarNames = new Set((trace.events || []).filter((e) => e[0] === 'V').map((e) => e[2]));
  assert.ok(scalarNames.has('i'), '成员函数里的 i 应该有事件：' + [...scalarNames].join(','));
  assert.ok(trace.steps > 200, '步数应覆盖成员函数体（现在 ' + trace.steps + ' 步）');

  /* ② 结点标签 = 父结点 children[k] 的字母（不是 0,1,2,3 编号） */
  const tLayers = trace.layerRun.steps.flatMap((step) => step.layers.filter((l) => l.id === 'graph:t'));
  const grown = tLayers.reduce((best, l) => (!best || l.data.nodes.length > best.data.nodes.length ? l : best), null);
  assert.ok(grown, '没有 graph:t 层');
  assert.deepEqual(grown.data.nodes.map((n) => n.label), ['#0', 'a', 'p', 'p', 'l', 'e'],
    'Trie 的结点标签应是自己字母：' + JSON.stringify(grown.data.nodes.map((n) => n.label)));
  assert.ok(['tree', 'line'].includes(grown.data.layout),
    '有父子关系的多路结构必须按层级/链摆，不能画成圆环：' + grown.data.layout);
  if (grown.data.layout === 'tree') {
    assert.ok(grown.data.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)), '树布局要给每个结点 x/y');
  }

  /* ③ node 指针真的在移动（不是每步都指根） */
  const targets = new Set(tLayers.flatMap((l) => (l.roles.pointers || []).filter((p) => p.id === 'node').map((p) => p.node)));
  assert.ok(targets.size >= 3, 'node 指针应走过多个结点：' + [...targets].join(','));

  /* ④ 只剩一张卡：`node` 的子树是整棵树的一段、`this` 与 `t` 是同一个对象，
        都该并到同一张图上（否则屏幕上三四张几乎一样的图） */
  const cardCounts = trace.layerRun.steps.map((step) => step.layers.length);
  assert.equal(Math.max(...cardCounts), 1, '每步应只剩 1 张结构卡：' + JSON.stringify([...new Set(cardCounts)]));
});

test('类体里的成员函数局部变量不会被当成字段（否则 dump 会访问 p->i 编不过）', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const trace = await traceProgram({ code: TRIE_CLASS, lang: 'cpp', maxSteps: 500 });
  assert.equal(trace.ok, true);
  const trie = (trace.structure?.structs || []).find((item) => item.tag === 'Trie');
  assert.ok(trie, '没解析出 Trie 结构体');
  assert.equal(trie.shape, 'graph', 'Trie 有指针数组 children[26] → 多指针图');
  assert.deepEqual(trie.fields.map((f) => f.name), ['children', 'isEnd'], '字段只能是 children / isEnd：' + JSON.stringify(trie.fields.map((f) => f.name)));
  assert.ok(trie.fields[0].isArray && trie.fields[0].self, 'children 应标成"自引用指针数组"');
});

test('C++ struct 版（成员 public）同样能跑能画', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const code = TRIE_CLASS
    .replace('class Trie {', 'struct Trie {')
    .replace('private:', '')
    .replace('public:', '');
  const trace = await traceProgram({ code, lang: 'cpp', maxSteps: 4000, withLayers: true });
  assert.equal(trace.ok, true, String(trace.log || '').slice(0, 200));
  assert.equal(trace.degradedMode, 'full');
  assert.ok(trace.layerRun.families.includes('graph'), 'struct 版也应折叠成图：' + trace.layerRun.families.join(','));
});

test('语言选错（C）也能跑：后端按 C++ 自动重试，并带上说明', { skip: !compilerReady() && '本机没有 third_party 工具链' }, async () => {
  const { looksLikeCpp } = await import('../backend/src/custom-code/detect-engine.js');
  assert.equal(looksLikeCpp('class Trie { };'), true);
  assert.equal(looksLikeCpp('int main(){ Trie* t = new Trie(); }'), true);
  assert.equal(looksLikeCpp('#include <stdio.h>\nstruct N { int k; };'), false, 'C 的 struct 不该被判成 C++');
  assert.equal(looksLikeCpp('int main(void){ int a[3]; return 0; }'), false);
  assert.equal(looksLikeCpp('// class Trie\nint main(void){ return 0; }'), false, '注释里的 class 不算');

  const trace = await traceProgram({ code: TRIE_CLASS, lang: 'c', maxSteps: 2000, withLayers: true });
  assert.equal(trace.ok, true, '按 C 发送 C++ 代码应自动重试成功：' + String(trace.log || '').slice(0, 160));
  assert.equal(trace.langUsed, 'cpp');
  assert.equal(trace.autoSwitched, true);
  assert.match(String(trace.note), /C\+\+/, '要说明已自动按 C++ 编译：' + trace.note);
  assert.match(String(trace.stdout), /1 0 1/);
});
