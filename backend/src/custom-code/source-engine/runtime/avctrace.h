/* avctrace.h -- prototype01 可视化跟踪运行时（由服务端注入，不修改用户源码）
 *
 * 设计目标：让"单步执行/变量观察/内存可视化"在不接真实调试器的前提下可用。
 * 做法：由 instrument.js 在每个语句前后插入 __avc_*() 调用，运行时把事件写入
 *       CWD 下的 __avc_trace.txt，服务端解析成"步骤数组"交给前端回放。
 *
 * 事件协议（每行一条）：
 *   E|depth|func              进入函数
 *   X|depth                   离开函数
 *   S|line                    即将执行第 line 行
 *   V|line|name|kind|value    kind: i=整数 d=浮点 s=字符串
 *   H|A|addr|size|line        堆分配
 *   H|F|addr|line             堆释放
 *   L|var|idx|key|more        链表/树结点（more=1 表示还有后继）
 *   LE|var|count|shape        shape: list / tree
 *   LIMIT                     步数超限，程序被中止
 *
 * 注意：文件必须是纯 ASCII。Watcom 编译器对编码敏感。
 */
#ifndef AVC_TRACE_H
#define AVC_TRACE_H

#include <stdio.h>
#include <stdlib.h>

static FILE* __avc_fp    = (FILE*)0;
static int   __avc_steps = 0;
static int   __avc_depth = 0;
static int   __avc_limit = 20000;
/* 堆事件限流：vector<int> g[100010] 这种全局大数组构造会瞬间产生十万级 HA，
 * 不封顶会把 trace 文件和堆窗一起拖死。前 2000 条足够看清分配格局。 */
static int   __avc_heap_n = 0;
static int   __avc_heap_limit = 2000;

static void __avc_open(void)
{
    if (!__avc_fp) __avc_fp = fopen("__avc_trace.txt", "wb");
}
static void __avc_out(const char* s)
{
    if (!__avc_fp) return;
    fputs(s, __avc_fp);
    fputc('\n', __avc_fp);
    fflush(__avc_fp);
}

static void __avc_e(const char* fn)
{
    char b[400];
    __avc_open();
    __avc_depth++;
    sprintf(b, "E|%d|%s", __avc_depth, fn);
    __avc_out(b);
}
static void __avc_x(void)
{
    char b[64];
    if (__avc_depth <= 0) return;
    sprintf(b, "X|%d", __avc_depth);
    __avc_out(b);
    __avc_depth--;
}
static void __avc_t(int line)
{
    char b[64];
    __avc_open();
    if (++__avc_steps > __avc_limit) {
        __avc_out("LIMIT");
        if (__avc_fp) fclose(__avc_fp);
        __avc_fp = (FILE*)0;
        exit(0);
    }
    sprintf(b, "S|%d", line);
    __avc_out(b);
}
static void __avc_vi(int line, const char* n, long v)
{
    char b[600];
    sprintf(b, "V|%d|%s|i|%ld", line, n, v);
    __avc_out(b);
}
static void __avc_vd(int line, const char* n, double v)
{
    char b[600];
    sprintf(b, "V|%d|%s|d|%.6g", line, n, v);
    __avc_out(b);
}
static void __avc_vs(int line, const char* n, const char* v)
{
    char b[1024];
    if (!v) v = "(null)";
    sprintf(b, "V|%d|%s|s|%s", line, n, v);
    __avc_out(b);
}

/* ---- 堆事件：先把真正的 malloc 抓在手里，再定义宏，避免自递归 ---- */
static void* (__avc_rmalloc)(unsigned n)              { return malloc(n); }
static void* (__avc_rcalloc)(unsigned n, unsigned m)  { return calloc(n, m); }
static void* (__avc_rrealloc)(void* p, unsigned n)    { return realloc(p, n); }
static void  (__avc_rfree)(void* p)                   { free(p); }

static void* __avc_malloc(unsigned n, int line)
{
    void* p = __avc_rmalloc(n);
    char b[200];
    if (__avc_heap_n++ >= __avc_heap_limit) return p;
    __avc_open();
    sprintf(b, "H|A|%lu|%u|%d", (unsigned long)p, n, line);
    __avc_out(b);
    return p;
}
static void* __avc_calloc(unsigned n, unsigned m, int line)
{
    void* p = __avc_rcalloc(n, m);
    char b[200];
    if (__avc_heap_n++ >= __avc_heap_limit) return p;
    __avc_open();
    sprintf(b, "H|A|%lu|%u|%d", (unsigned long)p, n * m, line);
    __avc_out(b);
    return p;
}
static void* __avc_realloc(void* q, unsigned n, int line)
{
    void* p = __avc_rrealloc(q, n);
    char b[200];
    if (__avc_heap_n++ >= __avc_heap_limit) return p;
    __avc_open();
    if (q) { sprintf(b, "H|F|%lu|%d", (unsigned long)q, line); __avc_out(b); }
    sprintf(b, "H|A|%lu|%u|%d", (unsigned long)p, n, line);
    __avc_out(b);
    return p;
}
static void __avc_free(void* p, int line)
{
    char b[200];
    if (__avc_heap_n++ >= __avc_heap_limit) { __avc_rfree(p); return; }
    __avc_open();
    sprintf(b, "H|F|%lu|%d", (unsigned long)p, line);
    __avc_out(b);
    __avc_rfree(p);
}

#define malloc(n)     __avc_malloc((unsigned)(n), __LINE__)
#define calloc(n, m)  __avc_calloc((unsigned)(n), (unsigned)(m), __LINE__)
#define realloc(p, n) __avc_realloc((p), (unsigned)(n), __LINE__)
#define free(p)       __avc_free((p), __LINE__)

/* ---- 链表/树结点输出 ---- */
static void __avc_l(const char* var, int idx, long key, unsigned long ptr, int more)
{
    char b[600];
    sprintf(b, "L|%s|%d|%ld|%lu|%d", var, idx, key, ptr, more);
    __avc_out(b);
}
static void __avc_le(const char* var, int count, const char* shape)
{
    char b[400];
    sprintf(b, "LE|%s|%d|%s", var, count, shape);
    __avc_out(b);
}

/* ---- 统一图模型事件 N / NE / M（PLAN_VIEWPORT §2）----
 * 采集层只发这三类；渲染器只按 shape 分派，不认识结构名。
 *   N|var|idx|value        结点
 *   NE|var|from|to|kind    边（用 NE 以免与函数进入事件 E|depth|fn 冲突）
 *   M|var|k=v;k=v          元信息
 */
static void __avc_n(const char* var, int idx, long value)
{
    char b[600];
    __avc_open();
    sprintf(b, "N|%s|%d|%ld", var, idx, value);
    __avc_out(b);
}
static void __avc_edge(const char* var, int from, int to, const char* kind)
{
    char b[600];
    __avc_open();
    sprintf(b, "NE|%s|%d|%d|%s", var, from, to, kind ? kind : "next");
    __avc_out(b);
}
static void __avc_m(const char* var, const char* kvs)
{
    char b[600];
    __avc_open();
    sprintf(b, "M|%s|%s", var, kvs ? kvs : "");
    __avc_out(b);
}
/* 单个结点的语义属性（红黑树 color、线索树 ltag…）：
 *   NM|var|idx|key=value
 * 渲染器据此画角标（颜色点 / 线索标记），不必知道结构名。 */
static void __avc_metai(const char* var, int idx, const char* key, long v)
{
    char b[300];
    __avc_open();
    sprintf(b, "NM|%s|%d|%s=%ld", var, idx, key ? key : "k", v);
    __avc_out(b);
}
/* 运行期长度的数组元素（`int* a = new int[n]` 这类）：
 * 名字要带下标，但下标是运行期变量，所以由这里拼 "a[i]" 再发普通 V 事件。 */
static void __avc_ai(int line, const char* name, int idx, long v)
{
    char b[600];
    __avc_open();
    sprintf(b, "V|%d|%s[%d]|i|%ld", line, name, idx, v);
    __avc_out(b);
}

/* 字符数组的元素：和 __avc_ai 一样，只是类型标记写 'c'
 * （`char s[] = "hello"` 画成 104/101/108… 谁也认不出，标成字符才看得懂）。 */
static void __avc_aic(int line, const char* name, int idx, long v)
{
    char b[600];
    __avc_open();
    sprintf(b, "V|%d|%s[%d]|c|%ld", line, name, idx, v);
    __avc_out(b);
}

/* 二维字符数组的元素（`char g[3][3]` 这种棋盘/迷宫）：名字要带两个下标，
 * 以前只发 `g[0]`（整行指针转 char）—— 画出来是 44/47/50 这种地址低字节，纯属错误数据。 */
static void __avc_aic2(int line, const char* name, int r, int c, long v)
{
    char b[600];
    __avc_open();
    sprintf(b, "V|%d|%s[%d][%d]|c|%ld", line, name, r, c, v);
    __avc_out(b);
}

/* 指针数组的元素（`HNode* bucket[7]`、`Edge* adj[6]`）：类型标记 'p'。
 * 值是**地址**不是数据 —— 折成数值数组会把 15278504 这种地址当数据画出来，
 * 屏幕上就是一堆无意义的巨大数字。折叠层看到 'p' 就不建数值数组层。 */
static void __avc_aip(int line, const char* name, int idx, unsigned long p)
{
    char b[600];
    __avc_open();
    sprintf(b, "V|%d|%s[%d]|p|%lu", line, name, idx, p);
    __avc_out(b);
}

/* 指针是否已在 BFS 队列里：多指针结构（孩子-兄弟、图十字链）同一结点会被多条边指到，
 * 不去重就会重复入队 → 结点数爆炸、边数翻倍。 */
static int __avc_ptr_in(void* const* q, int n, const void* p)
{
    int i;
    for (i = 0; i < n; i++) if (q[i] == p) return 1;
    return 0;
}

/* 一轮 dump 的**开始标记** + 长度：元素类型推不出时也发它（只显示长度）。
 * begin=1 是给会话层的"本轮从这里重来"信号——不能靠 N(idx=0) 判断，
 * 因为邻接表/稀疏结构的 0 号结点可能根本不存在。 */
static void __avc_len(const char* var, int len)
{
    char b[200];
    __avc_open();
    sprintf(b, "M|%s|begin=1;len=%d", var, len);
    __avc_out(b);
}

/* 一轮 dump 的**收尾长度**：只报最终结点数，不带 begin 标记。
 * （走 walker 的结构先 __avc_len(var,0) 开轮，逐结点发 N/NE/NM，最后用本函数收尾；
 *   若收尾也用 __avc_len，它会再带一次 begin=1，把刚发的结点整轮清掉。） */
static void __avc_end(const char* var, int len)
{
    char b[200];
    __avc_open();
    sprintf(b, "M|%s|len=%d", var, len);
    __avc_out(b);
}

/* ---- new / delete 挂钩：让 C++ 容器扩容也进堆窗（复用 HA/HF）---- */
#ifdef __cplusplus
#ifndef AVC_NO_NEW_HOOK
void* operator new(size_t sz)
{
    void* p = __avc_malloc((unsigned)sz, 0);
    if (!p) { __avc_out("LIMIT"); exit(1); }
    return p;
}
void operator delete(void* p)
{
    if (p) __avc_free(p, 0);
}
void* operator new[](size_t sz) { return operator new(sz); }
void operator delete[](void* p)  { operator delete(p); }
#endif
#endif

#endif /* AVC_TRACE_H */
