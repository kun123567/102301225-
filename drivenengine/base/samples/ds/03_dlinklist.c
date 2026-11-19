// @desc 双向链表 DLinkList：建 4 个结点双向链接，正向/反向遍历后再尾部追加一个结点
#include <stdio.h>
#include <stdlib.h>

typedef struct DNode {
    int key;
    struct DNode *prev;   /* 前驱指针 */
    struct DNode *next;   /* 后继指针 */
} DNode;

/* 尾插一个结点：返回新的尾结点；tail 为 NULL 表示空表。
 * 结构窗会顺着 dhead 的 next 把整条链 walk 出来。 */
static struct DNode *append(struct DNode *tail, int key)
{
    struct DNode *p = (struct DNode *)malloc(sizeof(struct DNode));
    if (p == NULL) { printf("  malloc 失败\n"); return tail; }
    p->key = key;
    p->next = NULL;                    /* 新结点是尾，next 为空 */
    p->prev = tail;                    /* 反向指针指向前一个结点 */
    if (tail != NULL) tail->next = p;  /* 原尾结点的 next 指向新结点 */
    return p;
}

/* 正向遍历：dhead --- next ---> 表尾 */
static int show_forward(struct DNode *dhead)
{
    struct DNode *p = dhead;
    int n = 0;
    printf("  正向: ");
    while (p != NULL) {
        printf("%d <-> ", p->key);
        p = p->next;       /* 沿着 next 前进 */
        n++;
    }
    printf("NULL\n");
    return n;
}

/* 反向遍历：表尾 --- prev ---> dhead */
static void show_backward(struct DNode *dtail)
{
    struct DNode *p = dtail;
    printf("  反向: ");
    while (p != NULL) {
        printf("%d <-> ", p->key);
        p = p->prev;       /* 沿着 prev 后退 */
    }
    printf("NULL\n");
}

int main(void)
{
    /* 指针一律先置 NULL：采集层会顺着非空指针 walk，野指针会直接崩掉程序 */
    struct DNode *dhead = NULL, *dtail = NULL, *p = NULL, *q = NULL;
    int keys[4] = { 10, 20, 30, 40 };
    int i = 0, n = 0;

    /* 第 1 步：尾插 4 个结点，同时维护 prev 与 next 两个方向 */
    printf("建立双向链表 10 20 30 40：\n");
    for (i = 0; i < 4; i++) {
        dtail = append(dtail, keys[i]);
        if (dhead == NULL) dhead = dtail;   /* 第一个结点同时成为表头 */
    }
    n = show_forward(dhead);
    show_backward(dtail);
    printf("  结点数 = %d\n", n);

    /* 第 2 步：尾部再追加 50 —— 旧尾 40 的 next 与新结点 50 的 prev 同时改变 */
    printf("尾部追加 50：\n");
    dtail = append(dtail, 50);
    show_forward(dhead);
    show_backward(dtail);

    /* 第 3 步：正向遍历计数（每个结点执行一次 p = p->next） */
    n = 0;
    p = dhead;
    while (p != NULL) { n++; p = p->next; }
    printf("  再次统计结点数 = %d\n", n);

    /* 第 4 步：释放（先记下 next，再 free 当前结点） */
    p = dhead;
    while (p != NULL) {
        q = p;
        p = p->next;
        free(q);
        q = NULL;              /* 置空，避免采集层解引用悬垂指针 */
    }
    printf("  已释放全部结点\n");
    return 0;
}
