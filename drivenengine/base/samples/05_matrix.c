// @desc 二维矩阵：转置与求和（数组窗 · 二维柱状 / 曲面线框）
#include <stdio.h>

#define R 3
#define C 4

int main(void)
{
    int m[R][C];
    int t[C][R];
    int i, j, sum = 0;

    for (i = 0; i < R; i++)
        for (j = 0; j < C; j++)
            m[i][j] = i * C + j + 1;

    for (i = 0; i < R; i++)
        for (j = 0; j < C; j++)
            t[j][i] = m[i][j];

    for (i = 0; i < R; i++)
        for (j = 0; j < C; j++)
            sum += m[i][j];

    printf("原矩阵:\n");
    for (i = 0; i < R; i++) {
        for (j = 0; j < C; j++) printf("%4d", m[i][j]);
        printf("\n");
    }
    printf("转置矩阵:\n");
    for (i = 0; i < C; i++) {
        for (j = 0; j < R; j++) printf("%4d", t[i][j]);
        printf("\n");
    }
    printf("元素和 = %d\n", sum);
    return 0;
}
