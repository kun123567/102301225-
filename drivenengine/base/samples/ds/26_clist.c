// @desc 循环链表：typedef CNode 建 5 个结点并让尾结点指回头结点，遍历整整一圈，再删除结点后重新遍历
#include <stdio.h>
#include <stdlib.h>

typedef struct CNode {
    int key;
    struct CNode *next;         /* 尾结点的 next 指回头结点，形成环 */
} CNode;

/* 尾部插入 n 个结点，最后把尾的 next 接回 head */
static CNode *build(int n)
{
    CNode *head = NULL, *tail = NULL, *p;
    int i;

    for (i = 1; i <= n; i++) {
        p = (CNode *)malloc(sizeof(CNode));
        p->key = i * 10;
        p->next = NULL;
        if (head == NULL) {
            head = p;           /* 第一个结点当表头 */
        } else {
            tail->next = p;     /* 这一步在改 tail->next：把新结点挂到尾巴后面 */
        }
        tail = p;
    }
    if (tail != NULL) tail->next = head;    /* 关键一步：首尾相连，尾指回头 */
    return head;
}

/* 从 head 出发走一圈：回到 head 就停（不用 NULL 结尾） */
static void walk(CNode *head)
{
    CNode *p = head;
    int cnt = 0;

    if (head == NULL) { printf("空表\n"); return; }
    printf("一圈: ");
    do {
        printf("%d -> ", p->key);
        p = p->next;
        cnt++;
    } while (p != head && cnt < 100);
    printf("(head)\n共 %d 个结点\n", cnt);
}

/* 删除 key 结点：环里只需要一个前驱指针，删头结点时要把尾重新接好 */
static CNode *del(CNode *head, int key)
{
    CNode *prev, *p;

    if (head == NULL) return NULL;
    if (head->key == key) {             /* 要删的正好是表头 */
        if (head->next == head) {       /* 只有一个结点：断开环 */
            free(head);
            return NULL;
        }
        prev = head;
        while (prev->next != head) {    /* prev 走到尾结点 */
            prev = prev->next;
        }
        p = head;
        prev->next = head->next;        /* 尾改指新头，环依然闭合 */
        head = head->next;
        free(p);
        return head;
    }
    prev = head;
    p = head->next;
    while (p != head && p->key != key) {
        prev = p;
        p = p->next;
    }
    if (p == head) { printf("未找到 key=%d\n", key); return head; }
    prev->next = p->next;               /* 这一步在改 prev->next：把 p 从环里摘掉 */
    free(p);
    return head;
}

/* 全部释放：必须先把尾结点的 next 置 NULL 断环，再顺序释放，否则会绕圈/重复释放 */
static void destroy(CNode *head)
{
    CNode *p, *tail;

    if (head == NULL) return;
    tail = head;
    while (tail->next != head) tail = tail->next;   /* 找到尾结点 */
    tail->next = NULL;                  /* 断环，链表退化成 NULL 结尾 */
    p = head;
    while (p != NULL) {
        tail = p->next;
        free(p);
        p = tail;
    }
}

int main(void)
{
    CNode *head;

    head = build(5);                    /* 建表：10 20 30 40 50，尾 50 指回 10 */
    walk(head);                         /* 遍历一整圈 */

    head = del(head, 30);               /* 删除中间结点，prev->next 跳过它 */
    walk(head);

    head = del(head, 10);               /* 删除表头，尾结点要重新指回新头 */
    walk(head);

    destroy(head);
    printf("已释放全部结点\n");
    return 0;
}
