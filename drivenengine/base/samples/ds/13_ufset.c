// @desc 并查集 UFSet：初始化 + 3 次 union + 2 次 find（含路径压缩），数组窗看 parent 变化
#include <stdio.h>

/* parent[i] == i 表示 i 是树根；否则 parent[i] 指向父结点 */
int parent[10];

static void show(const char *tag, int n)
{
    int i;
    printf("%-10s parent[] = ", tag);
    for (i = 0; i < n; i++) printf("%2d ", parent[i]);
    printf("\n");
}

/* 初始化：每个元素自成一个集合，自己是自己的根 */
static void uf_init(int n)
{
    int i;
    for (i = 0; i < n; i++) parent[i] = i;   /* 改 n 个格子 */
}

/* 查找 + 路径压缩：把查找路径上的结点直接挂到根上 */
static int uf_find(int x)
{
    if (parent[x] == x) return x;            /* 找到根 */
    parent[x] = uf_find(parent[x]);          /* 改 parent[x]：压缩这一层 */
    return parent[x];
}

/* 合并：把 b 的根挂到 a 的根下面 */
static void uf_union(int a, int b)
{
    int ra, rb;
    ra = uf_find(a);
    rb = uf_find(b);
    if (ra == rb) return;                    /* 已同集合 */
    parent[ra] = rb;                          /* 改 1 个格子：真正的合并 */
}

int main(void)
{
    int i;
    int r;

    uf_init(8);
    show("init", 8);

    /* 3 次 union：故意连成 0 -> 1 -> 2 -> 3 的长链 */
    uf_union(0, 1);
    show("union(0,1)", 8);

    uf_union(1, 2);
    show("union(1,2)", 8);

    uf_union(2, 3);                           /* 此时 0、1、2 都间接指向 3 */
    show("union(2,3)", 8);

    /* 第 1 次 find：走 0->1->2->3，回溯时把 0、1、2 全部压到根 3 */
    r = uf_find(0);
    printf("find(0) = %d\n", r);
    show("find(0)", 8);

    /* 第 2 次 find：路径已被压缩，一步命中（parent[1] 已直接指向根） */
    r = uf_find(1);
    printf("find(1) = %d\n", r);
    show("find(1)", 8);

    /* 收尾：打印每个元素的根，直观看出谁和谁同集合 */
    printf("元素  : ");
    for (i = 0; i < 8; i++) printf("%2d ", i);
    printf("\n集合根: ");
    for (i = 0; i < 8; i++) printf("%2d ", uf_find(i));
    printf("\n");

    return 0;
}
