// @desc 拓扑排序（Kahn 算法）：int g[8][8] 邻接矩阵 + int indeg[8] 入度数组，每步删掉一个入度为 0 的顶点
#include <stdio.h>

#define V 8

int main(void)
{
    /* 有向图 0..7，g[u][v] == 1 表示有一条 u -> v 的边 */
    int g[V][V] = {
        { 0, 1, 1, 0, 0, 0, 0, 0 },   /* 0 -> 1, 0 -> 2 */
        { 0, 0, 0, 1, 0, 0, 0, 0 },   /* 1 -> 3 */
        { 0, 0, 0, 1, 0, 1, 0, 0 },   /* 2 -> 3, 2 -> 5 */
        { 0, 0, 0, 0, 1, 0, 0, 0 },   /* 3 -> 4 */
        { 0, 0, 0, 0, 0, 0, 0, 1 },   /* 4 -> 7 */
        { 0, 0, 0, 0, 0, 0, 1, 0 },   /* 5 -> 6 */
        { 0, 0, 0, 0, 0, 0, 0, 1 },   /* 6 -> 7 */
        { 0, 0, 0, 0, 0, 0, 0, 0 }    /* 7 没有出边 */
    };
    /* indeg[v] 是顶点 v 的入度，即 g 第 v 列上 1 的个数 */
    int indeg[V] = { 0, 1, 1, 2, 1, 1, 1, 2 };
    int q[V];        /* 入度为 0 的顶点队列 */
    int order[V];    /* 拓扑排序结果 */
    int head = 0, tail = 0, cnt = 0;
    int u, v, k, step = 0;

    printf("入度初值: ");
    for (v = 0; v < V; v++) printf("%d ", indeg[v]);
    printf("\n");

    /* 第 0 步：所有入度为 0 的顶点先入队 */
    for (v = 0; v < V; v++)
        if (indeg[v] == 0) q[tail++] = v;

    while (head < tail) {
        u = q[head++];              /* 队头顶点没有前驱了，可以输出 */
        order[cnt++] = u;
        step++;
        /* 关键的一步：把 u 的所有出边"删掉"，即后继入度各减 1 */
        for (v = 0; v < V; v++) {
            if (g[u][v]) {
                indeg[v]--;
                if (indeg[v] == 0) q[tail++] = v;   /* 入度减到 0 就入队 */
            }
        }
        printf("第 %d 步: 输出 %d，剩余入度 ", step, u);
        for (k = 0; k < V; k++) printf("%d ", indeg[k]);
        printf("\n");
    }

    if (cnt < V) {                  /* 输出的顶点少于 V 个 => 图里有环 */
        printf("图中有环，无法完成拓扑排序\n");
        return 0;
    }

    printf("拓扑序列: ");
    for (k = 0; k < V; k++) printf("%d ", order[k]);
    printf("\n");
    return 0;
}
