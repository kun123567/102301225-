// @desc 单链表 LinkList：头插法建立 5 个结点，遍历输出，再删除一个结点
#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int key;
    struct Node *next;
} Node;

/* 头插：新结点成为新表头，返回新的 head（结构窗会顺着 head 的 next 一路走） */
static struct Node *push_front(struct Node *head, int key)
{
    struct Node *p = (struct Node *)malloc(sizeof(struct Node));
    if (p == NULL) { printf("  malloc 失败\n"); return head; }
    p->key = key;          /* 1. 填数据域 */
    p->next = head;        /* 2. 新结点的 next 指向原表头 */
    return p;              /* 3. 新结点成为表头 */
}

/* 遍历：沿 next 走到底，顺便统计结点数 */
static int show(struct Node *head)
{
    struct Node *p = head;
    int n = 0;
    printf("  链表: ");
    while (p != NULL) {
        printf("%d -> ", p->key);
        p = p->next;       /* 每一步 p 后移一个结点 */
        n++;
    }
    printf("NULL\n");
    return n;
}

/* 删除第一个 key 等于给定值的结点，返回（可能改变的）head */
static struct Node *remove_key(struct Node *head, int key)
{
    struct Node *p = head, *pre = NULL, *q = NULL;
    while (p != NULL && p->key != key) {
        pre = p;           /* pre 始终是 p 的前驱 */
        p = p->next;
    }
    if (p == NULL) { printf("  没找到 key=%d，链表不变\n", key); return head; }
    q = p;                      /* q 记住要摘下来的结点 */
    if (pre == NULL) head = q->next;   /* 摘的是首结点：head 后移 */
    else pre->next = q->next;          /* 否则前驱直接指向 q 的后继 */
    printf("  已摘除结点 key=%d\n", q->key);
    free(q);
    q = NULL;                   /* 置空，避免采集层解引用悬垂指针 */
    p = NULL;                   /* 同上 */
    return head;
}

int main(void)
{
    /* 指针一律先置 NULL：采集层会顺着非空指针 walk，野指针会直接崩掉程序 */
    struct Node *head = NULL, *p = NULL;
    int keys[5] = { 11, 22, 33, 44, 55 };
    int i = 0, n = 0;

    /* 第 1 步：头插 5 个结点 —— 注意链表顺序与插入顺序相反 */
    printf("依次头插 11 22 33 44 55：\n");
    for (i = 0; i < 5; i++)
        head = push_front(head, keys[i]);
    n = show(head);
    printf("  结点数 = %d\n", n);

    /* 第 2 步：遍历找 key=44 的结点（只读，不改链表） */
    p = head;
    while (p != NULL && p->key != 44) p = p->next;
    if (p != NULL) printf("遍历找到 key=44\n");
    else printf("遍历没找到 key=44\n");

    /* 第 3 步：删除 key=33 的结点 —— 前驱 44 的 next 改为指向 22 */
    printf("删除 key=33：\n");
    head = remove_key(head, 33);
    n = show(head);
    printf("  结点数 = %d\n", n);

    /* 第 4 步：删除 key=55（首结点）—— head 本身后移 */
    printf("删除 key=55（首结点）：\n");
    head = remove_key(head, 55);
    show(head);
    return 0;
}
