// @desc 折半查找：有序数组上用 low/high/mid 不断收缩区间找目标值，并用 vis 标出每次比较过的中点
#include <stdio.h>

#define N 12

int main(void)
{
    int a[N] = {3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47};
    int vis[N];                 /* 第 step 次比较命中的下标记到这里，单步时能看到变化 */
    int low, high, mid;
    int key = 31;               /* 要查找的值，写死方便一键运行 */
    int i, step, found;

    /* 初始化标记数组：0 表示该下标还没被比较过 */
    for (i = 0; i < N; i++) {
        vis[i] = 0;
    }

    printf("有序数组: ");
    for (i = 0; i < N; i++) {
        printf("%d ", a[i]);
    }
    printf("\n查找目标 key = %d\n", key);

    low = 0;
    high = N - 1;
    step = 0;
    found = -1;

    /* 每轮循环：算 mid -> 打印当前区间 -> 比较 a[mid] -> 收缩 low/high 或直接命中退出 */
    while (low <= high) {
        mid = (low + high) / 2;
        step++;
        vis[mid] = step;        /* 这一步在改 vis：记下本次比较用的是哪个下标 */

        printf("第%d步: low=%d high=%d mid=%d a[mid]=%d", step, low, high, mid, a[mid]);
        if (a[mid] == key) {
            printf("  => 相等, 命中\n");
            found = mid;
            break;              /* 找到就跳出，区间不再变化 */
        } else if (a[mid] < key) {
            printf("  => 偏小, 丢左半\n");
            low = mid + 1;      /* 这一步在改 low：丢掉 [low, mid] */
        } else {
            printf("  => 偏大, 丢右半\n");
            high = mid - 1;     /* 这一步在改 high：丢掉 [mid, high] */
        }
    }

    printf("循环结束: low=%d high=%d\n", low, high);

    if (found >= 0) {
        printf("查找成功: key=%d 位于下标 %d\n", key, found);
    } else {
        printf("查找失败: key=%d 不在数组中\n", key);
    }

    /* 回放一遍 vis，看看都探过哪些位置 */
    printf("比较标记 vis: ");
    for (i = 0; i < N; i++) {
        printf("%d ", vis[i]);
    }
    printf("\n共比较 %d 次\n", step);
    return 0;
}
