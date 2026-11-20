// @desc 邻接矩阵 MGraph：int m[6][6] 存 4 个顶点 4 条无向边，输出矩阵并统计度数
//
// 无向图的邻接矩阵对称：m[i][j] == m[j][i] == 1 表示 i、j 之间有边。
// 顶点 i 的度数 = 第 i 行里 1 的个数（有向图则要分开数出度/入度）。
#include <stdio.h>

#define MAXV 6      /* 矩阵容量，本题只用前 4 个顶点 */

int main(void)
{
    int m[MAXV][MAXV];      /* 邻接矩阵：二维数组窗直接看这里 */
    int deg[MAXV];          /* 每个顶点的度数 */
    int n = 4;              /* 实际顶点数 0..3 */
    int i = 0, j = 0;

    /* ① 先全部清零 —— 单步时能看到矩阵一格格被填 0 */
    for (i = 0; i < MAXV; i++)
        for (j = 0; j < MAXV; j++)
            m[i][j] = 0;

    /* ② 加 4 条无向边：0-1、0-2、1-3、2-3（无向边要写对称的两个位置） */
    m[0][1] = 1; m[1][0] = 1;
    m[0][2] = 1; m[2][0] = 1;
    m[1][3] = 1; m[3][1] = 1;
    m[2][3] = 1; m[3][2] = 1;

    /* ③ 输出矩阵（只看实际用到的 n 行 n 列） */
    printf("邻接矩阵 %dx%d:\n", n, n);
    for (i = 0; i < n; i++) {
        for (j = 0; j < n; j++) printf("%3d", m[i][j]);
        printf("\n");
    }

    /* ④ 逐行数 1，得到每个顶点的度数；同时累加得到边数的两倍 */
    for (i = 0; i < MAXV; i++) deg[i] = 0;

    for (i = 0; i < n; i++) {
        for (j = 0; j < n; j++) {
            if (m[i][j] == 1) deg[i]++;      /* 改数组：deg 随扫描逐格累加 */
        }
    }

    printf("各顶点度数:");
    for (i = 0; i < n; i++) printf(" deg[%d]=%d", i, deg[i]);
    printf("\n");
    printf("边数 = %d（度数之和 %d 的一半）\n",
           (deg[0] + deg[1] + deg[2] + deg[3]) / 2,
           deg[0] + deg[1] + deg[2] + deg[3]);

    return 0;
}
