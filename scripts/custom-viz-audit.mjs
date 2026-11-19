/**
 * custom-viz-audit.mjs —— 自定义代码可视化的**覆盖面审计**（只读：真编译 + 插桩 + 折叠，不写业务文件）
 *
 *   node scripts/custom-viz-audit.mjs            # 全表
 *   node scripts/custom-viz-audit.mjs 二维数组    # 只跑名字含该子串的案例
 *
 * 每个案例只声明"客观事实"（程序打印什么、几步、期望看到哪类卡），
 * **不声明"应该用什么名字"** —— 名字一变还成立，才说明识别是自适应的。
 */
import { engineHealth, traceProgram } from '../backend/src/custom-code/detect-engine.js';

const CASES = [
  {
    id: 'array-bubble',
    title: '一维数组 · 冒泡排序',
    lang: 'c',
    expect: { stdout: '123579', kinds: ['array'], minSteps: 20 },
    code: `#include <stdio.h>
void bubble(int a[], int n)
{
    int i, j, t;
    for (i = 0; i < n - 1; i++) {
        for (j = 0; j < n - 1 - i; j++) {
            if (a[j] > a[j + 1]) {
                t = a[j];
                a[j] = a[j + 1];
                a[j + 1] = t;
            }
        }
    }
}
int main(void)
{
    int a[6] = {5, 2, 9, 1, 7, 3};
    int i;
    bubble(a, 6);
    for (i = 0; i < 6; i++) {
        printf("%d", a[i]);
    }
    return 0;
}`,
  },
  {
    id: 'array-binsearch',
    title: '一维数组 · 二分查找（lo/hi/mid 游标）',
    lang: 'c',
    expect: { stdout: '4', kinds: ['array'], minSteps: 5, pointers: true },
    code: `#include <stdio.h>
int main(void)
{
    int a[8] = {1, 3, 5, 7, 9, 11, 13, 15};
    int n = 8, key = 9, lo = 0, hi = 7, mid = -1;
    while (lo <= hi) {
        mid = (lo + hi) / 2;
        if (a[mid] == key) {
            break;
        }
        if (a[mid] < key) {
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    printf("%d\\n", mid);
    return 0;
}`,
  },
  {
    id: 'stack-named-len',
    title: '顺序栈 · 长度变量叫 m（不在名字表里）',
    lang: 'c',
    expect: { stdout: '30 20 10', kinds: ['array'], minSteps: 6 },
    code: `#include <stdio.h>
int main(void)
{
    int s[32];
    int m = 0;
    int i;
    for (i = 1; i <= 3; i++) {
        m = m + 1;
        s[m - 1] = i * 10;
    }
    while (m > 0) {
        printf("%d ", s[m - 1]);
        m = m - 1;
    }
    return 0;
}`,
  },
  {
    id: 'queue-front-rear',
    title: '循环队列 · front/rear',
    lang: 'c',
    expect: { stdout: '10 20', kinds: ['array'], minSteps: 6, pointers: true },
    code: `#include <stdio.h>
int main(void)
{
    int q[8];
    int front = 0, rear = 0, i;
    for (i = 1; i <= 3; i++) {
        q[rear] = i * 10;
        rear = (rear + 1) % 8;
    }
    for (i = 1; i <= 2; i++) {
        printf("%d ", q[front]);
        front = (front + 1) % 8;
    }
    return 0;
}`,
  },
  {
    id: 'matrix-2d',
    title: '二维数组 · 矩阵转置',
    lang: 'c',
    expect: { stdout: '147258369', kinds: ['matrix'], minSteps: 4 },
    code: `#include <stdio.h>
int main(void)
{
    int a[3][3] = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
    int b[3][3];
    int i, j;
    for (i = 0; i < 3; i++) {
        for (j = 0; j < 3; j++) {
            b[j][i] = a[i][j];
        }
    }
    for (i = 0; i < 3; i++) {
        for (j = 0; j < 3; j++) {
            printf("%d", b[i][j]);
        }
    }
    return 0;
}`,
  },
  {
    id: 'char-array',
    title: '字符数组 · 字符串反转',
    lang: 'c',
    expect: { stdout: 'olleh', kinds: ['array'], minSteps: 4 },
    code: `#include <stdio.h>
int main(void)
{
    char s[16] = "hello";
    int i = 0, j = 4, t;
    while (i < j) {
        t = s[i];
        s[i] = s[j];
        s[j] = t;
        i = i + 1;
        j = j - 1;
    }
    for (i = 0; i < 5; i++) {
        printf("%c", s[i]);
    }
    return 0;
}`,
  },
  {
    id: 'list-single',
    title: '单链表 · 头插 + 遍历',
    lang: 'c',
    expect: { stdout: '3 2 1 ', kinds: ['list'], minSteps: 8, pointers: true },
    code: `#include <stdio.h>
#include <stdlib.h>
typedef struct Node {
    int val;
    struct Node* next;
} Node;
Node* push(Node* head, int v)
{
    Node* n = (Node*)malloc(sizeof(Node));
    n->val = v;
    n->next = head;
    return n;
}
int main(void)
{
    Node* head = 0;
    Node* p = 0;
    head = push(head, 1);
    head = push(head, 2);
    head = push(head, 3);
    p = head;
    while (p != 0) {
        printf("%d ", p->val);
        p = p->next;
    }
    return 0;
}`,
  },
  {
    id: 'list-double',
    title: '双向链表 · prev/next',
    lang: 'c',
    expect: { stdout: '2 1 1 2 ', kinds: ['list', 'graph'], minSteps: 8 },
    code: `#include <stdio.h>
#include <stdlib.h>
typedef struct DNode {
    int val;
    struct DNode* prev;
    struct DNode* next;
} DNode;
int main(void)
{
    DNode* a = (DNode*)malloc(sizeof(DNode));
    DNode* b = (DNode*)malloc(sizeof(DNode));
    DNode* p = 0;
    a->val = 1; a->prev = 0; a->next = b;
    b->val = 2; b->prev = a; b->next = 0;
    p = b;
    while (p != 0) {
        printf("%d ", p->val);
        p = p->prev;
    }
    p = a;
    while (p != 0) {
        printf("%d ", p->val);
        p = p->next;
    }
    return 0;
}`,
  },
  {
    id: 'tree-binary',
    title: '二叉树 · 中序遍历',
    lang: 'c',
    expect: { stdout: '1 2 3 4 5 ', kinds: ['tree'], minSteps: 8 },
    code: `#include <stdio.h>
#include <stdlib.h>
typedef struct T {
    int key;
    struct T* left;
    struct T* right;
} T;
T* ins(T* root, int k)
{
    if (root == 0) {
        T* n = (T*)malloc(sizeof(T));
        n->key = k; n->left = 0; n->right = 0;
        return n;
    }
    if (k < root->key) {
        root->left = ins(root->left, k);
    } else {
        root->right = ins(root->right, k);
    }
    return root;
}
void walk(T* p)
{
    if (p == 0) {
        return;
    }
    walk(p->left);
    printf("%d ", p->key);
    walk(p->right);
}
int main(void)
{
    T* root = 0;
    root = ins(root, 3);
    root = ins(root, 1);
    root = ins(root, 5);
    root = ins(root, 2);
    root = ins(root, 4);
    walk(root);
    return 0;
}`,
  },
  {
    id: 'graph-adjlist',
    title: '图 · 邻接表（指针数组 + 边表）',
    lang: 'c',
    expect: { stdout: '2', kinds: ['graph', 'list'], minSteps: 4 },
    code: `#include <stdio.h>
#include <stdlib.h>
typedef struct Edge {
    int to;
    struct Edge* next;
} Edge;
Edge* adj[6];
void addEdge(int u, int v)
{
    Edge* e = (Edge*)malloc(sizeof(Edge));
    e->to = v;
    e->next = adj[u];
    adj[u] = e;
}
int main(void)
{
    int deg = 0;
    Edge* p = 0;
    addEdge(0, 1);
    addEdge(0, 2);
    addEdge(1, 3);
    p = adj[0];
    while (p != 0) {
        deg = deg + 1;
        p = p->next;
    }
    printf("%d\\n", deg);
    return 0;
}`,
  },
  {
    id: 'graph-matrix',
    title: '图 · 邻接矩阵（int g[n][n]）',
    lang: 'c',
    expect: { stdout: '3', kinds: ['matrix'], minSteps: 4 },
    code: `#include <stdio.h>
int main(void)
{
    int g[4][4];
    int i, j, cnt = 0;
    for (i = 0; i < 4; i++) {
        for (j = 0; j < 4; j++) {
            g[i][j] = 0;
        }
    }
    g[0][1] = 1; g[0][2] = 1; g[1][2] = 1;
    for (i = 0; i < 4; i++) {
        for (j = 0; j < 4; j++) {
            if (g[i][j] != 0) {
                cnt = cnt + 1;
            }
        }
    }
    printf("%d\\n", cnt);
    return 0;
}`,
  },
  {
    id: 'hash-chain',
    title: '哈希表 · 拉链（指针数组当桶）',
    lang: 'c',
    expect: { stdout: '3', kinds: ['graph', 'list', 'array'], minSteps: 4 },
    code: `#include <stdio.h>
#include <stdlib.h>
typedef struct HNode {
    int key;
    struct HNode* next;
} HNode;
HNode* bucket[7];
void insert(int k)
{
    int h = k % 7;
    HNode* n = (HNode*)malloc(sizeof(HNode));
    n->key = k;
    n->next = bucket[h];
    bucket[h] = n;
}
int countAt(int h)
{
    int c = 0;
    HNode* p = bucket[h];
    while (p != 0) {
        c = c + 1;
        p = p->next;
    }
    return c;
}
int main(void)
{
    insert(10);
    insert(17);
    insert(3);
    printf("%d\\n", countAt(3));
    return 0;
}`,
  },
  {
    id: 'union-find',
    title: '并查集 · parent 数组',
    lang: 'c',
    expect: { stdout: '3', kinds: ['array'], minSteps: 6 },
    code: `#include <stdio.h>
int parent[6];
int find(int x)
{
    while (parent[x] != x) {
        x = parent[x];
    }
    return x;
}
int main(void)
{
    int i, cnt = 0;
    for (i = 0; i < 6; i++) {
        parent[i] = i;
    }
    parent[1] = 0;
    parent[2] = 0;
    parent[4] = 3;
    for (i = 0; i < 6; i++) {
        if (find(i) == i) {
            cnt = cnt + 1;
        }
    }
    printf("%d\\n", cnt);
    return 0;
}`,
  },
  {
    id: 'cpp-class-stack',
    title: 'C++ 类的成员数组 · MinStack',
    lang: 'cpp',
    expect: { stdout: '-3 -2 ', kinds: ['stack'], minSteps: 8 },
    code: `#include <stdio.h>
class MinStack {
private:
    int data[32];
    int mins[32];
    int top;
public:
    MinStack() {
        top = -1;
    }
    void push(int x) {
        int m;
        if (top < 0) {
            m = x;
        } else {
            m = mins[top];
            if (x < m) {
                m = x;
            }
        }
        top = top + 1;
        data[top] = x;
        mins[top] = m;
    }
    void pop() {
        if (top >= 0) {
            top = top - 1;
        }
    }
    int getMin() {
        return mins[top];
    }
};
int main(void)
{
    MinStack s;
    s.push(-2);
    s.push(0);
    s.push(-3);
    printf("%d ", s.getMin());
    s.pop();
    printf("%d ", s.getMin());
    return 0;
}`,
  },
  {
    id: 'array-written-extent',
    title: '数组 · 只写前几格（普通数组按声明范围展示，未写格标 ?）',
    lang: 'c',
    /* 普通数组不再按"写过的最大下标"裁剪（评审报告 §2）：声明 64 → 采样 16 格全部列出，
       写过的 3 格是真实值、其余标 ?；所以这里的上限是**采样上限 16**。 */
    expect: { stdout: '0 1 2 ', kinds: ['array'], minSteps: 4, maxCells: 16 },
    code: `#include <stdio.h>
int main(void)
{
    int a[64];
    int cnt = 0;
    int i;
    for (i = 0; i < 3; i++) {
        a[cnt] = i;
        cnt = cnt + 1;
    }
    for (i = 0; i < 3; i++) {
        printf("%d ", a[i]);
    }
    return 0;
}`,
  },
  {
    id: 'bool-visited',
    title: 'bool 数组 · 访问标记（BFS/DFS 常见）',
    lang: 'cpp',
    expect: { stdout: '3', kinds: ['array'], minSteps: 6 },
    code: `#include <stdio.h>
int main(void)
{
    bool seen[6];
    int i, cnt = 0;
    for (i = 0; i < 6; i++) {
        seen[i] = false;
    }
    seen[1] = true;
    seen[4] = true;
    seen[5] = true;
    for (i = 0; i < 6; i++) {
        if (seen[i]) {
            cnt = cnt + 1;
        }
    }
    printf("%d\\n", cnt);
    return 0;
}`,
  },
  {
    id: 'char-stack',
    title: '字符栈 · 括号匹配（char s[] + top）',
    lang: 'c',
    expect: { stdout: 'OK', kinds: ['array', 'stack'], minSteps: 8 },
    code: `#include <stdio.h>
int main(void)
{
    char st[16];
    int top = -1;
    char text[8] = "((()))";
    int i, ok = 1;
    for (i = 0; text[i] != 0; i++) {
        if (text[i] == '(') {
            top = top + 1;
            st[top] = text[i];
        } else {
            if (top < 0) {
                ok = 0;
            } else {
                top = top - 1;
            }
        }
    }
    if (top >= 0) {
        ok = 0;
    }
    if (ok) {
        printf("OK");
    } else {
        printf("BAD");
    }
    return 0;
}`,
  },
  {
    id: 'struct-array',
    title: '结构体数组 · 按 key 冒泡（学生表那类）',
    lang: 'c',
    expect: { stdout: '1 3 4 ', kinds: ['array'], minSteps: 8 },
    code: `#include <stdio.h>
typedef struct Item {
    int key;
    int aux;
} Item;
int main(void)
{
    Item a[4];
    int i, j;
    a[0].key = 3; a[0].aux = 30;
    a[1].key = 1; a[1].aux = 10;
    a[2].key = 4; a[2].aux = 40;
    for (i = 0; i < 3; i++) {
        for (j = 0; j < 2 - i; j++) {
            if (a[j].key > a[j + 1].key) {
                Item t = a[j];
                a[j] = a[j + 1];
                a[j + 1] = t;
            }
        }
    }
    for (i = 0; i < 3; i++) {
        printf("%d ", a[i].key);
    }
    return 0;
}`,
  },
  {
    id: 'two-lists',
    title: '同类型两个链表 · head1 / head2',
    lang: 'c',
    expect: { stdout: '2 ', kinds: ['list'], minSteps: 6 },
    code: `#include <stdio.h>
#include <stdlib.h>
typedef struct N {
    int v;
    struct N* next;
} N;
int main(void)
{
    N* head1 = (N*)malloc(sizeof(N));
    N* head2 = (N*)malloc(sizeof(N));
    N* p = 0;
    head1->v = 1; head1->next = 0;
    head2->v = 2; head2->next = 0;
    p = head2;
    while (p != 0) {
        printf("%d ", p->v);
        p = p->next;
    }
    (void)head1;
    return 0;
}`,
  },
  {
    id: 'matrix-char',
    title: '二维字符数组 · 棋盘/迷宫',
    lang: 'c',
    expect: { stdout: '3', kinds: ['matrix'], minSteps: 4 },
    code: `#include <stdio.h>
int main(void)
{
    char g[3][3];
    int i, j, cnt = 0;
    for (i = 0; i < 3; i++) {
        for (j = 0; j < 3; j++) {
            g[i][j] = '.';
        }
    }
    g[0][0] = '#';
    g[1][1] = '#';
    g[2][2] = '#';
    for (i = 0; i < 3; i++) {
        for (j = 0; j < 3; j++) {
            if (g[i][j] == '#') {
                cnt = cnt + 1;
            }
        }
    }
    printf("%d\\n", cnt);
    return 0;
}`,
  },
];

const kindOf = (layer) => {
  if (layer.style === 1 || layer.style === 5 || layer.style === 6) return 'array';
  if (layer.style === 2 || layer.style === 4) return 'matrix';
  if (layer.style === 3) return 'list';
  if (layer.style === 7) return 'stack';
  if (layer.style === 9) return 'tree';
  if (layer.style === 10) return 'graph';
  return 'style' + layer.style;
};

if (!engineHealth().ok) {
  console.error('本机没有 third_party 工具链，无法审计。');
  process.exit(2);
}

const filter = process.argv[2] || '';
const rows = [];
for (const item of CASES) {
  if (filter && !(item.id + item.title).includes(filter)) continue;
  let row = { id: item.id, title: item.title, state: '?', detail: '' };
  try {
    const trace = await traceProgram({ code: item.code, lang: item.lang, maxSteps: 4000, withLayers: true });
    if (trace.ok !== true) {
      row.state = 'BLOCKED';
      row.detail = '编译/运行失败：' + String(trace.log || '').split('\n').find((l) => /Error!/.test(l)) || '';
      rows.push(row);
      continue;
    }
    const steps = trace.layerRun && trace.layerRun.steps ? trace.layerRun.steps : [];
    const kinds = new Set();
    let maxCards = 0;
    let withPtr = 0;
    let junk = null;          // 画面上出现的未初始化垃圾（|v| > 1e6）
    let blankLabels = 0;      // 结点标签是空的
    let maxCells = 0;         // 一维数组最多画了几格（检查"声明长度泄漏"）
    for (const step of steps) {
      maxCards = Math.max(maxCards, step.layers.length);
      const k = new Set(step.layers.map(kindOf));
      for (const x of k) kinds.add(x);
      if (step.layers.some((l) => (l.roles.pointers || []).length)) withPtr += 1;
      for (const layer of step.layers) {
        if (layer.style === 1) maxCells = Math.max(maxCells, (layer.data.values || []).length);
        if (layer.style === 7) maxCells = Math.max(maxCells, (layer.data.cells || []).length);
        const flat = [];
        if (Array.isArray(layer.data.values)) {
          for (const v of layer.data.values) {
            if (Array.isArray(v)) flat.push(...v); else flat.push(v);
          }
        }
        if (Array.isArray(layer.data.cells)) for (const c of layer.data.cells) flat.push(c && c.value !== undefined ? c.value : c);
        for (const v of flat) {
          if (typeof v === 'number' && Math.abs(v) > 1e6 && junk == null) junk = layer.id + '=' + v;
        }
        for (const node of layer.data.nodes || []) {
          /* style 3 的结点字段叫 value，style 9/10 叫 label —— 两种都算"标签" */
          const text = node.label != null ? node.label : node.value;
          if (text == null || text === '' || text === 'undefined') blankLabels += 1;
        }
      }
    }
    const problems = [];
    if (trace.degradedMode !== 'full') problems.push('插桩降级=' + trace.degradedMode);
    if (!steps.length) problems.push('没有任何可画的步骤');
    if (steps.length && maxCards === 0) problems.push('每步 0 张卡');
    const want = item.expect.kinds || [];
    if (want.length && !want.some((k) => kinds.has(k))) problems.push('期望看到 ' + want.join('/') + '，实际 ' + ([...kinds].join('/') || '无'));
    if (item.expect.minSteps && steps.length < item.expect.minSteps) problems.push('步数偏少 ' + steps.length + ' < ' + item.expect.minSteps);
    if (item.expect.pointers && !withPtr) problems.push('全程没有指针药丸');
    if (item.expect.maxCells && maxCells > item.expect.maxCells) problems.push('声明长度泄漏：一维数组画了 ' + maxCells + ' 格（应 ≤ ' + item.expect.maxCells + '）');
    if (junk) problems.push('画出了未初始化垃圾 ' + junk);
    if (blankLabels) problems.push('有 ' + blankLabels + ' 个结点标签是空的');
    const out = String(trace.stdout || '').replace(/\r/g, '').replace(/\n/g, ' ').trim();
    if (item.expect.stdout != null && out !== String(item.expect.stdout).trim()) problems.push('输出不符：' + JSON.stringify(out));
    row.state = problems.length ? 'PROBLEM' : 'OK';
    row.detail = problems.length ? problems.join('；') : `卡=${[...kinds].join('/')} 步=${steps.length} 最多${maxCards}张 指针${withPtr}步`;
    row.kinds = [...kinds];
  } catch (error) {
    row.state = 'ERROR';
    row.detail = error.message.slice(0, 160);
  }
  rows.push(row);
}

const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - [...String(s)].reduce((w, c) => w + (c.charCodeAt(0) > 127 ? 2 : 1), 0)));
for (const row of rows) {
  console.log(`${row.state === 'OK' ? '  ' : '!!'} ${pad(row.state, 8)} ${pad(row.title, 34)} ${row.detail}`);
}
const bad = rows.filter((r) => r.state !== 'OK');
console.log(`\n合计 ${rows.length} 个案例，通过 ${rows.length - bad.length}，有问题 ${bad.length}`);
process.exit(bad.length ? 1 : 0);
