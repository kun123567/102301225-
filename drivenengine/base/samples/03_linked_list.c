// @desc 单链表：头插建表、遍历、查找（结构窗 结点+箭头）
#include <stdio.h>
#include <stdlib.h>

struct Node {
    int data;
    struct Node *next;
};

static struct Node *create(int n)
{
    struct Node *head = NULL, *p;
    int i;
    for (i = 1; i <= n; i++) {
        p = (struct Node *)malloc(sizeof(struct Node));
        p->data = i * 10;
        p->next = head;
        head = p;
    }
    return head;
}

static void show(struct Node *head)
{
    struct Node *p = head;
    printf("链表: ");
    while (p) {
        printf("%d -> ", p->data);
        p = p->next;
    }
    printf("NULL\n");
}

static struct Node *find(struct Node *head, int key)
{
    struct Node *p = head;
    while (p && p->data != key) p = p->next;
    return p;
}

int main(void)
{
    struct Node *head, *q;

    head = create(5);
    show(head);

    q = find(head, 30);
    if (q) printf("找到结点 %d\n", q->data);
    else   printf("未找到\n");

    /* 释放 */
    while (head) {
        q = head;
        head = head->next;
        free(q);
    }
    printf("已释放全部结点，head = %d\n", head == NULL);
    return 0;
}
