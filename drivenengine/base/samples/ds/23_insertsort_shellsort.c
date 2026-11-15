// @desc 希尔排序（缩小增量的插入排序）：int a[12] 乱序数组按 gap = 6、3、1 分组各做一趟插入排序，每趟打印
#include <stdio.h>

#define N 12

int main(void)
{
    int a[N] = { 70, 3, 95, 41, 12, 66, 28, 84, 7, 53, 39, 17 };
    int gap, i, j, t, k, pass = 0;

    printf("原始数组: ");
    for (k = 0; k < N; k++) printf("%d ", a[k]);
    printf("\n");

    /* 增量序列: 6 -> 3 -> 1，gap 越大元素跳得越远，先把大的往后粗调 */
    for (gap = N / 2; gap > 0; gap /= 2) {
        printf("--- 增量 gap=%d：下标相差 gap 的元素归为一组 ---\n", gap);
        for (i = 0; i < gap; i++) {
            printf("  第 %d 组:", i);
            for (j = i; j < N; j += gap) printf(" a[%d]=%d", j, a[j]);
            printf("\n");
        }

        /* 对每一组做直接插入排序（组内元素在 a 里相隔 gap） */
        for (i = gap; i < N; i++) {
            t = a[i];                     /* 待插入的元素 */
            j = i - gap;
            while (j >= 0 && a[j] > t) {
                a[j + gap] = a[j];        /* 比 t 大的元素往后挪一格（跨 gap 步） */
                j -= gap;
            }
            a[j + gap] = t;               /* 把 t 放进空出来的位置 —— 这一步在改 a */
        }

        pass++;
        printf("第 %d 趟 gap=%d 结果: ", pass, gap);
        for (k = 0; k < N; k++) printf("%d ", a[k]);
        printf("\n");
    }

    printf("排序完成：gap=1 的最后一趟就是普通的直接插入排序，\n");
    printf("前面几趟已经让数组\"大致有序\"，所以最后一趟只需很少的移动。\n");
    return 0;
}
