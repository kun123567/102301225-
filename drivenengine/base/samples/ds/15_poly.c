// @desc 一元稀疏多项式：单链表按指数降序有序插入新项并输出（结构窗看链的走动与接链）
#include <stdio.h>
#include <stdlib.h>

typedef struct PNode {
    int coef;                 /* 系数 */
    int exp;                  /* 指数 */
    struct PNode *next;       /* 下一个结点 */
} PNode;

/* 造一个新结点 */
static PNode *poly_new(int coef, int exp)
{
    PNode *p = (PNode *)malloc(sizeof(PNode));
    p->coef = coef;
    p->exp = exp;
    p->next = NULL;
    return p;
}

/* 按指数从大到小有序插入；指数相同则合并系数（系数为 0 时删掉该结点） */
static PNode *poly_insert(PNode *head, int coef, int exp)
{
    PNode *pre = NULL;
    PNode *cur = head;
    PNode *p;

    while (cur != NULL && cur->exp > exp) {   /* 找插入位置：前驱 pre、后继 cur */
        pre = cur;
        cur = cur->next;
    }
    if (cur != NULL && cur->exp == exp) {     /* 同指数，合并系数 */
        cur->coef += coef;
        if (cur->coef == 0) {                 /* 系数抵消，摘掉这个结点 */
            if (pre == NULL) head = cur->next;
            else             pre->next = cur->next;
            free(cur);
        }
        return head;
    }

    p = poly_new(coef, exp);
    p->next = cur;                            /* 改 p->next 与 pre->next（或 head） */
    if (pre == NULL) head = p;
    else             pre->next = p;
    return head;
}

/* 打印多项式，形如 3x^5 - 2x^2 + 7 */
static void poly_print(const char *tag, PNode *head)
{
    PNode *cur = head;
    int first = 1;

    printf("%-16s f(x) = ", tag);
    if (cur == NULL) {
        printf("0\n");
        return;
    }
    while (cur != NULL) {
        if (!first) fputs(cur->coef > 0 ? " + " : " - ", stdout);
        else if (cur->coef < 0) putchar('-');
        printf("%d", cur->coef > 0 ? cur->coef : -cur->coef);
        if (cur->exp == 1)      printf("x");
        else if (cur->exp != 0) printf("x^%d", cur->exp);
        first = 0;
        cur = cur->next;
    }
    printf("\n");
}

int main(void)
{
    PNode *head = NULL;   /* 头指针：采集层顺着它 walk 出整条链 */

    /* 建 3 项多项式（乱序插入，靠有序插入自动排好） */
    head = poly_insert(head, -2, 2);
    poly_print("插入 -2x^2", head);

    head = poly_insert(head, 3, 5);
    poly_print("插入 3x^5", head);

    head = poly_insert(head, 7, 0);
    poly_print("插入 7", head);

    /* 再按指数有序插入新项：插在中间 */
    head = poly_insert(head, 5, 3);
    poly_print("插入 5x^3", head);

    /* 插入同指数项：与 3x^5 合并系数 -> 8x^5 */
    head = poly_insert(head, 5, 5);
    poly_print("插入 5x^5", head);

    /* 插入相反数：8x^5 + (-8x^5) = 0，该结点被删除 */
    head = poly_insert(head, -8, 5);
    poly_print("插入 -8x^5", head);

    return 0;
}
