// @desc 数组排序对照：冒泡排序，每轮把当前最大值冒到末尾并输出（数组窗逐轮变化）
#include <stdio.h>

/* 写死一组打乱的数据，方便一键运行观察 */
int a[10] = { 5, 2, 9, 1, 7, 3, 8, 6, 0, 4 };

static void dump(const char *tag)
{
    int i;
    printf("%-12s ", tag);
    for (i = 0; i < 10; i++) printf("%2d ", a[i]);
    printf("\n");
}

int main(void)
{
    int i;
    int j;
    int tmp;
    int swapped;

    dump("初始");
    printf("--------------------------------------\n");

    /* 冒泡：第 i 轮结束，末尾 i+1 个元素已就位 */
    for (i = 0; i < 9; i++) {
        swapped = 0;
        for (j = 0; j < 9 - i; j++) {
            if (a[j] > a[j + 1]) {
                tmp = a[j];                    /* 交换相邻两个元素 */
                a[j] = a[j + 1];
                a[j + 1] = tmp;
                swapped = 1;
            }
        }
        printf("第 %d 轮后  ", i + 1);
        for (j = 0; j < 10; j++) printf("%2d ", a[j]);
        printf("   已定 a[%d] = %d\n", 9 - i, a[9 - i]);

        if (!swapped) {                        /* 本轮无交换，说明已经有序 */
            printf("第 %d 轮无交换，提前结束\n", i + 1);
            break;
        }
    }

    printf("--------------------------------------\n");
    dump("最终");
    return 0;
}
