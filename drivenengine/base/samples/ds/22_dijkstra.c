// @desc Dijkstra 单源最短路：int w[6][6] 带权邻接矩阵 + int dist[6] 暂定距离 + int vis[6] 已确定标记
#include <stdio.h>

#define N 6
#define INF 9999

int main(void)
{
    /* 无向带权图，w[u][v] == INF 表示 u、v 之间没有边 */
    int w[N][N] = {
        { 0,   7,   9,   INF, INF, 14  },   /* 0 的邻居: 1(7) 2(9) 5(14) */
        { 7,   0,   10,  15,  INF, INF },   /* 1: 0 2 3 */
        { 9,   10,  0,   11,  INF, 2   },   /* 2: 0 1 3 5 */
        { INF, 15,  11,  0,   6,   INF },   /* 3: 1 2 4 */
        { INF, INF, INF, 6,   0,   9   },   /* 4: 3 5 */
        { 14,  INF, 2,   INF, 9,   0   }    /* 5: 0 2 4 */
    };
    int dist[N];                /* dist[i] = 目前已知的 0 到 i 的最短距离 */
    int vis[N] = { 0, 0, 0, 0, 0, 0 };   /* vis[i] == 1 表示 i 的距离已最终确定 */
    int i, j, u, k, best, step = 0;

    for (i = 0; i < N; i++) dist[i] = INF;   /* 一开始都不可达 */
    dist[0] = 0;                            /* 源点 0 到自己是 0 */

    for (k = 0; k < N; k++) {
        /* 1) 在还没确定的顶点里，挑 dist 最小的那个 */
        u = -1;
        best = INF;
        for (i = 0; i < N; i++)
            if (!vis[i] && dist[i] < best) {
                best = dist[i];
                u = i;
            }
        if (u < 0) break;              /* 剩下的顶点都不连通，提前结束 */

        vis[u] = 1;                    /* 2) u 的最短距离从此定死，不再改动 */

        /* 3) 用 u 当"中转站"松弛它的邻居：绕道 u 会不会更近？ */
        for (j = 0; j < N; j++) {
            if (!vis[j] && w[u][j] < INF && dist[u] + w[u][j] < dist[j])
                dist[j] = dist[u] + w[u][j];   /* 这一行就是在改 dist 数组 */
        }

        step++;
        printf("第 %d 步: 确定顶点 %d (dist=%d)，此时 dist = ", step, u, dist[u]);
        for (j = 0; j < N; j++) {
            if (dist[j] >= INF) printf("inf ");
            else printf("%d ", dist[j]);
        }
        printf("\n");
    }

    printf("从 0 到各顶点的最短距离: ");
    for (i = 0; i < N; i++) printf("%d ", dist[i]);
    printf("\n");
    return 0;
}
