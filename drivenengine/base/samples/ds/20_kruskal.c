// @desc Kruskal 最小生成树：edge[12][3] 存边(u,v,w)，parent[8] 并查集按权选边（二维 + 一维数组窗）
#include <stdio.h>

/* 并查集找根：顺着 parent 一路往上跳，直到自己是自己的父亲 */
static int findRoot(int parent[], int x)
{
    while (parent[x] != x) x = parent[x];
    return x;
}

/* 整行交换，用于按权值排序（三个元素(u,v,w)必须一起搬） */
static void swapRow(int e[][3], int a, int b)
{
    int k, t;
    for (k = 0; k < 3; k++) {
        t = e[a][k];
        e[a][k] = e[b][k];
        e[b][k] = t;
    }
}

int main(void)
{
    int edge[12][3] = {
        {0, 1, 6}, {0, 2, 1}, {0, 3, 5},
        {1, 2, 5}, {1, 4, 3},
        {2, 3, 5}, {2, 4, 6}, {2, 5, 4},
        {3, 5, 2},
        {4, 5, 6}
    };
    int parent[8];
    int n = 10;          /* 有效边数 */
    int nv = 6;          /* 顶点编号 0..5 */
    int i, j, cnt = 0, total = 0, ru, rv;

    /* 01 把没用到的 2 行标成 -1，方便在数组窗里看清只有前 10 行是边 */
    for (i = n; i < 12; i++) {
        edge[i][0] = -1; edge[i][1] = -1; edge[i][2] = -1;
    }

    /* 02 并查集初始化：每个顶点各自成一个集合 */
    for (i = 0; i < 8; i++) parent[i] = i;

    /* 03 按权值升序冒泡排序 —— 每交换一次 edge 的两行都会变 */
    for (i = 0; i < n - 1; i++)
        for (j = 0; j < n - 1 - i; j++)
            if (edge[j][2] > edge[j + 1][2]) swapRow(edge, j, j + 1);

    printf("按权值排序后的边 (u,v,w):\n");
    for (i = 0; i < n; i++)
        printf("  (%d,%d,%d)\n", edge[i][0], edge[i][1], edge[i][2]);

    /* 04 从小到大扫边：两端不在同一集合就选中并合并，否则跳过（会成环） */
    printf("选边过程:\n");
    for (i = 0; i < n; i++) {
        ru = findRoot(parent, edge[i][0]);
        rv = findRoot(parent, edge[i][1]);
        if (ru != rv) {
            parent[ru] = rv;                  /* 这一步在改 parent[] */
            total += edge[i][2];
            cnt++;
            printf("  选中 (%d,%d,%d)  累计权 = %d\n",
                   edge[i][0], edge[i][1], edge[i][2], total);
            if (cnt == nv - 1) {
                printf("  已选够 %d 条边，Kruskal 提前结束\n", nv - 1);
                break;
            }
        } else {
            printf("  跳过 (%d,%d,%d)  两端已连通，会成环\n",
                   edge[i][0], edge[i][1], edge[i][2]);
        }
    }

    printf("parent[] 最终形态: ");
    for (i = 0; i < nv; i++) printf("%d ", parent[i]);
    printf("\n最小生成树总权值 = %d，边数 = %d\n", total, cnt);
    return 0;
}
