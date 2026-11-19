// @desc 数组与冒泡排序（一维数组可视化）
#include <stdio.h>

#define N 8

int main(void)
{
    int a[N] = { 49, 38, 65, 97, 76, 13, 27, 49 };
    int i, j, t, swapped;

    printf("排序前: ");
    for (i = 0; i < N; i++) printf("%d ", a[i]);
    printf("\n");

    for (i = 0; i < N - 1; i++) {
        swapped = 0;
        for (j = 0; j < N - 1 - i; j++) {
            if (a[j] > a[j + 1]) {
                t = a[j];
                a[j] = a[j + 1];
                a[j + 1] = t;
                swapped = 1;
            }
        }
        if (!swapped) break;
    }

    printf("排序后: ");
    for (i = 0; i < N; i++) printf("%d ", a[i]);
    printf("\n");
    return 0;
}
