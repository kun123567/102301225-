// @desc 稀疏矩阵三元组：4 个非零元存 trip[12][3]，按列主序转置并输出（二维数组窗看 trip）
#include <stdio.h>

int main(void)
{
    int trip[12][3];      /* 原矩阵三元组：[0]=行  [1]=列  [2]=值，行主序 */
    int trans[12][3];     /* 转置结果三元组，同样 行/列/值 */
    int num[8];           /* num[col]  = 第 col 列的非零元个数 */
    int cpot[8];          /* cpot[col] = 第 col 列在 trans 中的起始下标 */
    int rows = 4, cols = 5, n = 4;
    int i, j, t;

    /* 01 手工写入 4 个非零元（模拟从文件里读到的三元组表） */
    trip[0][0] = 0; trip[0][1] = 1; trip[0][2] = 3;
    trip[1][0] = 1; trip[1][1] = 3; trip[1][2] = 5;
    trip[2][0] = 2; trip[2][1] = 0; trip[2][2] = 7;
    trip[3][0] = 3; trip[3][1] = 4; trip[3][2] = 2;

    printf("原矩阵 4x5，非零元 %d 个，三元组 (行,列,值):\n", n);
    for (i = 0; i < n; i++)
        printf("  (%d,%d,%d)\n", trip[i][0], trip[i][1], trip[i][2]);

    /* 02 统计每一列有几个非零元 —— 这一步在改 num[] */
    for (j = 0; j < cols; j++) num[j] = 0;
    for (i = 0; i < n; i++) num[trip[i][1]] = num[trip[i][1]] + 1;

    printf("每列非零元个数 num[]: ");
    for (j = 0; j < cols; j++) printf("%d ", num[j]);
    printf("\n");

    /* 03 由 num 递推出每列的起始位置 cpot[]（转置表是按列主序排的） */
    cpot[0] = 0;
    for (j = 1; j < cols; j++) cpot[j] = cpot[j - 1] + num[j - 1];

    printf("每列起始位置 cpot[]: ");
    for (j = 0; j < cols; j++) printf("%d ", cpot[j]);
    printf("\n");

    /* 04 一趟顺序扫描原三元组，把它按 cpot 放到 trans 里；
          这一步同时改 trans[] 和 cpot[]（cpot 充当每列的写指针） */
    for (i = 0; i < n; i++) {
        j = trip[i][1];                 /* 原来的列，转置后变成行 */
        t = cpot[j];
        trans[t][0] = trip[i][1];       /* 行列互换 */
        trans[t][1] = trip[i][0];
        trans[t][2] = trip[i][2];       /* 值不变 */
        cpot[j] = cpot[j] + 1;          /* 该列的写指针后移一格 */
    }

    printf("转置后 5x4，三元组 (行,列,值):\n");
    for (i = 0; i < n; i++)
        printf("  (%d,%d,%d)\n", trans[i][0], trans[i][1], trans[i][2]);

    printf("稀疏度 = %d / %d\n", n, rows * cols);
    return 0;
}
