// @desc 孩子兄弟表示法（双链树）：手工建树后先根遍历并统计度与深度（结构窗看 firstchild/nextsibling）
#include <stdio.h>
#include <stdlib.h>

typedef struct CSNode {
    int key;
    struct CSNode *firstchild;
    struct CSNode *nextsibling;
} CSNode;

static CSNode *newCS(int key)
{
    CSNode *p = (CSNode *)malloc(sizeof(CSNode));
    p->key = key;
    p->firstchild = NULL;
    p->nextsibling = NULL;
    return p;
}

/* 把 child 挂成 parent 的最后一个孩子：沿 nextsibling 走到尾巴再挂上 */
static void addChild(CSNode *parent, CSNode *child)
{
    CSNode *p = parent->firstchild;
    if (p == NULL) {
        parent->firstchild = child;     /* 第一个孩子只是 firstchild，不是兄弟 */
        return;
    }
    while (p->nextsibling != NULL) p = p->nextsibling;
    p->nextsibling = child;             /* 这一步在改 nextsibling 链 */
}

/* 先根遍历：先自己，再逐棵孩子的子树（孩子靠 nextsibling 串成兄弟链） */
static void preOrder(CSNode *p, int depth)
{
    CSNode *c;
    int i;
    if (p == NULL) return;
    for (i = 0; i < depth * 2; i++) putchar(' ');
    printf("%d\n", p->key);
    for (c = p->firstchild; c != NULL; c = c->nextsibling)
        preOrder(c, depth + 1);
}

/* 结点的度 = 孩子链上的结点个数 */
static int degree(CSNode *p)
{
    CSNode *c;
    int d = 0;
    if (p == NULL) return 0;
    for (c = p->firstchild; c != NULL; c = c->nextsibling) d++;
    return d;
}

int main(void)
{
    CSNode *root;
    CSNode *n2, *n3, *n4, *n5, *n6, *n7;
    int maxdeg = 0, d;

    /* 01 造 7 个结点：1 是根；1 的孩子 2,3,4；2 的孩子 5,6；3 的孩子 7 */
    root = newCS(1);
    n2 = newCS(2); n3 = newCS(3); n4 = newCS(4);
    n5 = newCS(5); n6 = newCS(6); n7 = newCS(7);

    /* 02 逐条挂孩子指针 —— 每挂一次画面上的 firstchild/nextsibling 就变一次 */
    addChild(root, n2);
    addChild(root, n3);
    addChild(root, n4);
    addChild(n2, n5);
    addChild(n2, n6);
    addChild(n3, n7);

    printf("先根遍历（缩进即层次）:\n");
    preOrder(root, 0);

    printf("各结点的度:\n");
    printf("  1 -> %d\n", degree(root));
    printf("  2 -> %d\n", degree(n2));
    printf("  3 -> %d\n", degree(n3));
    printf("  4 -> %d\n", degree(n4));
    printf("  7 -> %d\n", degree(n7));

    d = degree(root);
    if (d > maxdeg) maxdeg = d;
    d = degree(n2); if (d > maxdeg) maxdeg = d;
    d = degree(n3); if (d > maxdeg) maxdeg = d;
    printf("树的度 = %d\n", maxdeg);
    return 0;
}
