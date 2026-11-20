// @desc 顺序表 SqList：定长数组 elem[16] + 长度 length，演示插入、删除、按值查找
#include <stdio.h>

#define MAXSIZE 16

/* 顺序表 = 定长数组 elem + 当前长度 length。
 * 两者都声明在 main 首层，数组窗可直接观察 elem 的变化、变量窗观察 length。 */

/* 在第 i 个位置（合法范围 1..length+1）插入 x：elem[i-1..length-1] 整体后移一格 */
static int list_insert(int elem[], int *plen, int i, int x)
{
    int k;
    if (*plen >= MAXSIZE) { printf("  插入 %d 失败：表满\n", x); return 0; }
    if (i < 1 || i > *plen + 1) { printf("  插入 %d 失败：位置 %d 非法\n", x, i); return 0; }
    for (k = *plen; k >= i; k--)
        elem[k] = elem[k - 1];      /* 从尾部开始逐个后移，腾出第 i 个位置 */
    elem[i - 1] = x;                /* 写入新元素 */
    (*plen)++;                      /* 长度加一 */
    return 1;
}

/* 删除第 i 个元素（1..length），被删的值由 out 带回 */
static int list_delete(int elem[], int *plen, int i, int *out)
{
    int k;
    if (i < 1 || i > *plen) { printf("  删除失败：位置 %d 非法\n", i); return 0; }
    *out = elem[i - 1];             /* 先记下被删元素 */
    for (k = i; k < *plen; k++)
        elem[k - 1] = elem[k];      /* 后面的元素整体前移一格 */
    (*plen)--;                      /* 长度减一 */
    return 1;
}

/* 按值查找：返回 0 基下标，找不到返回 -1 */
static int list_find(int elem[], int len, int x)
{
    int k;
    for (k = 0; k < len; k++)
        if (elem[k] == x) return k;
    return -1;
}

static void show(int elem[], int len)
{
    int k;
    printf("  length=%d  elem=", len);
    for (k = 0; k < len; k++) printf("%d ", elem[k]);
    printf("\n");
}

int main(void)
{
    int elem[MAXSIZE] = { 12, 25, 37, 48, 59 };  /* 初始 5 个元素，其余位置为 0 */
    int length = 5;                              /* 当前有效长度 */
    int pos = 0, got = 0, ok = 0;                /* 全部初始化，避免首帧显示垃圾值 */

    printf("初始顺序表：\n");
    show(elem, length);

    /* 第 1 步：在第 3 个位置插入 99 —— elem[2..5] 全部后移，length 5 -> 6 */
    printf("插入 99 到第 3 个位置：\n");
    ok = list_insert(elem, &length, 3, 99);
    printf("  插入返回 %d\n", ok);
    show(elem, length);

    /* 第 2 步：删除第 1 个元素 12 —— elem[1..] 全部前移，length 6 -> 5 */
    printf("删除第 1 个元素：\n");
    got = 0;
    ok = list_delete(elem, &length, 1, &got);
    printf("  删除返回 %d，被删元素 = %d\n", ok, got);
    show(elem, length);

    /* 第 3 步：按值查找 48（存在）与 100（不存在） */
    pos = list_find(elem, length, 48);
    printf("按值查找 48 -> 下标 %d\n", pos);
    pos = list_find(elem, length, 100);
    printf("按值查找 100 -> 下标 %d（-1 表示不存在）\n", pos);
    return 0;
}
