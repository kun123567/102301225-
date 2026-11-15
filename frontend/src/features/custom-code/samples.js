/**
 * samples.js -- 「自定义代码」的示例库
 *
 * 两类示例，覆盖两条链路：
 *   mode:'program'   整程序（含 main）→ 引擎真编译 + 插桩 → 折叠成 layers → plus 渲染器
 *   mode:'function'  只写函数体（void f(int a[], int n)）→ 自动补 main 夹具 → 数组步骤
 *
 * 网上样例的来源都写在 `source` 里，文件本体放在 `frontend/samples/`（**verbatim，未改动**），
 * 测试会用 sha256 钉住"没被改过"这件事。
 */

export const CUSTOM_SAMPLES = Object.freeze([
  {
    id: 'web-ll-iitg',
    title: '单链表全操作（IIT Guwahati CS1109 课程代码）',
    language: 'c',
    mode: 'program',
    path: '/samples/ll-iitg.c',
    source: 'https://fac.iitg.ac.in/asahu/cs1109-25e/DSCode/LL.c',
    note: '322 行整程序：插入/删除/查找/反转/最值，用到 struct、malloc、函数指针、bool。原样使用，未做任何改写。',
    sha256: '5c5febb2a55a0a600749a8345b3fbf5e85a6dc4931c692eff22b864a4f8d1aaf',
    expect: { families: ['list'], minSteps: 50 },
  },
  {
    id: 'builtin-bubble',
    title: '函数体：冒泡排序（本仓自带，数组链路）',
    language: 'c',
    mode: 'function',
    note: '只写函数，输入数组用上方的「输入数组」框；自动补 main 夹具，按数组逐步回放。',
    code: [
      'void sort(int a[], int n) {',
      '  int i, j, tmp;',
      '  for (i = 0; i < n - 1; i++) {',
      '    for (j = 0; j < n - 1 - i; j++) {',
      '      if (a[j] > a[j + 1]) {',
      '        tmp = a[j];',
      '        a[j] = a[j + 1];',
      '        a[j + 1] = tmp;',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n'),
    expect: { families: ['array'], minSteps: 10 },
  },
]);

export function customSample(id) {
  return CUSTOM_SAMPLES.find((sample) => sample.id === id) || null;
}

/** 取示例源码：整程序示例从本地静态文件读（保持与网上原件逐字节一致），函数示例用内联文本 */
export async function loadCustomSample(id, fetchImpl = globalThis.fetch) {
  const sample = customSample(id);
  if (!sample) throw new Error('没有这个自定义代码示例：' + id);
  if (sample.mode === 'function') return { ...sample, code: sample.code };
  if (typeof fetchImpl !== 'function') throw new Error('示例需要浏览器环境读取源码文件。');
  const response = await fetchImpl(sample.path);
  if (!response || response.ok === false) throw new Error('读取示例源码失败：' + sample.path);
  const code = await response.text();
  return { ...sample, code };
}
