// @desc 二叉树 BiTree：手工建一棵 7 结点完全二叉树，做前序/中序/后序递归遍历
#include <stdio.h>
#include <stdlib.h>

typedef struct BTNode {
    int key;
    struct BTNode *lchild;   /* 左孩子 */
    struct BTNode *rchild;   /* 右孩子 */
} BTNode;

/* 申请一个叶子结点 */
static BTNode *makeNode(int key)
{
    BTNode *p = (BTNode *)malloc(sizeof(BTNode));
    p->key    = key;
    p->lchild = NULL;
    p->rchild = NULL;
    return p;
}

/* 前序：根 -> 左 -> 右 */
static void preOrder(BTNode *t)
{
    if (t == NULL) return;
    printf("%d ", t->key);
    preOrder(t->lchild);
    preOrder(t->rchild);
}

/* 中序：左 -> 根 -> 右 */
static void inOrder(BTNode *t)
{
    if (t == NULL) return;
    inOrder(t->lchild);
    printf("%d ", t->key);
    inOrder(t->rchild);
}

/* 后序：左 -> 右 -> 根 */
static void postOrder(BTNode *t)
{
    if (t == NULL) return;
    postOrder(t->lchild);
    postOrder(t->rchild);
    printf("%d ", t->key);
}

int main(void)
{
    BTNode *root;    /* 结构窗从 root 顺着 lchild/rchild 走，就能画出整棵树 */
    BTNode *n2, *n3, *n4, *n5, *n6, *n7;

    /* ---- 第 1 步：建第 1 层（根）---- */
    root = makeNode(1);

    /* ---- 第 2 步：挂上 2、3 两个孩子 ---- */
    n2 = makeNode(2);
    n3 = makeNode(3);
    root->lchild = n2;
    root->rchild = n3;

    /* ---- 第 3 步：给 2 挂上 4、5 ---- */
    n4 = makeNode(4);
    n5 = makeNode(5);
    n2->lchild = n4;
    n2->rchild = n5;

    /* ---- 第 4 步：给 3 挂上 6、7，共 7 个结点（完全二叉树）---- */
    n6 = makeNode(6);
    n7 = makeNode(7);
    n3->lchild = n6;
    n3->rchild = n7;

    printf("树的形状(层序): 1 / (2 (4,5)) / (3 (6,7))\n");

    /* ---- 第 5 步：三种递归遍历，注意输出顺序的差别 ---- */
    printf("前序遍历(根左右): ");
    preOrder(root);
    printf("\n");

    printf("中序遍历(左根右): ");
    inOrder(root);
    printf("\n");

    printf("后序遍历(左右根): ");
    postOrder(root);
    printf("\n");

    printf("根=%d 左孩子=%d 右孩子=%d\n",
           root->key, root->lchild->key, root->rchild->key);
    return 0;
}
