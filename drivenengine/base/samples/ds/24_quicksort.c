// @desc 快速排序（手写 int stack[12] 显式栈模拟递归）：数组窗能同时看到 a 的划分过程与栈里待处理的区间
#include <stdio.h>

#define N 12

int main(void)
{
    int a[N] = { 33, 7, 91, 25, 60, 4, 78, 16, 55, 42, 88, 11 };
    int stack[N];              /* 显式栈：成对存放待处理区间的 [lo, hi] */
    int top = 0;               /* 栈顶，指向下一个空槽，所以栈内元素个数 = top */
    int lo = 0, hi = N - 1;    /* 本轮正在处理的区间 */
    int ol, oh;                /* 划分前的区间备份，只用于打印 */
    int i, j, pivot, t;
    int l, r, leftLen, rightLen;
    int k, pass = 0;

    printf("原始数组: ");
    for (k = 0; k < N; k++) printf("%d ", a[k]);
    printf("\n");

    for (;;) {
        if (lo < hi) {
            /* ===== 一趟划分：以中间元素为基准，把区间切成左小右大两半 ===== */
            ol = lo;
            oh = hi;
            i = lo;
            j = hi;
            pivot = a[(lo + hi) / 2];
            while (i <= j) {
                while (a[i] < pivot) i++;      /* 左边本来就在"小"的一侧，跳过 */
                while (a[j] > pivot) j--;      /* 右边本来就在"大"的一侧，跳过 */
                if (i <= j) {
                    t = a[i];                  /* 找到一对逆序元素，交换它们 */
                    a[i] = a[j];
                    a[j] = t;
                    i++;
                    j--;
                }
            }
            /* 划分结束: [ol, j] 全部 <= pivot，[i, oh] 全部 >= pivot */
            leftLen = j - ol + 1;
            rightLen = oh - i + 1;

            /* 关键技巧：先压"短"的一段，长的一段用循环继续做（尾递归消去），
               这样栈深不会超过 log2(N) 对，int stack[12] 就够用 */
            if (leftLen < rightLen) {
                l = ol;
                r = j;          /* 左段短 -> 入栈等着以后处理 */
                lo = i;
                hi = oh;        /* 右段长 -> 下一轮接着划分 */
            } else {
                l = i;
                r = oh;         /* 右段短 -> 入栈 */
                lo = ol;
                hi = j;         /* 左段长 -> 下一轮接着划分 */
            }
            if (l < r) {         /* 长度 >= 2 的区间才值得入栈 */
                stack[top++] = l;
                stack[top++] = r;
            }

            pass++;
            printf("第 %d 趟: 区间[%d,%d] pivot=%d 划分后 a = ", pass, ol, oh, pivot);
            for (k = 0; k < N; k++) printf("%d ", a[k]);
            printf("\n          压栈后 stack(成对) = ");
            for (k = 0; k + 1 < top; k += 2) printf("[%d,%d] ", stack[k], stack[k + 1]);
            if (top == 0) printf("空");
            printf("\n");
            continue;           /* 回去处理 lo..hi 那个"长"的区间 */
        }

        /* 当前区间长度不足 2，已经有序 —— 从显式栈里弹一段出来当新任务 */
        if (top == 0) break;    /* 栈空且没有待处理区间 => 整体有序，结束 */
        hi = stack[--top];      /* 后进先出：先弹 hi，再弹 lo */
        lo = stack[--top];
    }

    printf("排序结果: ");
    for (k = 0; k < N; k++) printf("%d ", a[k]);
    printf("\n");
    return 0;
}
