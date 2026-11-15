// @desc 二叉排序树删除：建树后删除有两个孩子的结点，用右子树最小结点替换（结构窗看树变化）
#include <stdio.h>
#include <stdlib.h>

typedef struct BSTNode {
    int key;
    struct BSTNode *left;
    struct BSTNode *right;
} BSTNode;

static BSTNode *newNode(int key)
{
    BSTNode *p = (BSTNode *)malloc(sizeof(BSTNode));
    p->key = key;
    p->left = NULL;
    p->right = NULL;
    return p;
}

static BSTNode *insert(BSTNode *root, int key)
{
    if (root == NULL) return newNode(key);
    if (key < root->key)      root->left = insert(root->left, key);
    else if (key > root->key) root->right = insert(root->right, key);
    return root;
}

static void inorder(BSTNode *root)
{
    if (root == NULL) return;
    inorder(root->left);
    printf("%d ", root->key);
    inorder(root->right);
}

/* 右子树里的最小结点（一路往左走到底） */
static BSTNode *minNode(BSTNode *p)
{
    while (p != NULL && p->left != NULL) p = p->left;
    return p;
}

static BSTNode *delNode(BSTNode *root, int key)
{
    BSTNode *tmp;
    if (root == NULL) return NULL;
    if (key < root->key) {
        root->left = delNode(root->left, key);
    } else if (key > root->key) {
        root->right = delNode(root->right, key);
    } else {
        /* 找到要删的结点：下面三种情况都在改指针 */
        if (root->left == NULL) {          /* 只有右孩子（或叶子） */
            tmp = root->right; free(root); return tmp;
        }
        if (root->right == NULL) {         /* 只有左孩子 */
            tmp = root->left; free(root); return tmp;
        }
        /* 有两个孩子：拿右子树最小结点顶替，再删掉那个最小结点 */
        tmp = minNode(root->right);
        root->key = tmp->key;              /* 这一步在改 key */
        root->right = delNode(root->right, tmp->key);
    }
    return root;
}

int main(void)
{
    BSTNode *root = NULL;
    int keys[7];
    int i;

    keys[0] = 50; keys[1] = 30; keys[2] = 70; keys[3] = 20;
    keys[4] = 40; keys[5] = 60; keys[6] = 80;

    /* 01 依次插入建树，根 50 左右各两个孩子 */
    for (i = 0; i < 7; i++) root = insert(root, keys[i]);
    printf("删除前中序: ");
    inorder(root);
    printf("\n");

    /* 02 删除根 50：它有两个孩子，会被右子树最小值 60 替换 */
    root = delNode(root, 50);
    printf("删除 50 之后中序: ");
    inorder(root);
    printf("\n");
    if (root != NULL) printf("新的根 = %d\n", root->key);

    /* 03 再删一个只有一个孩子的结点 30，观察指针接续 */
    root = delNode(root, 30);
    printf("删除 30 之后中序: ");
    inorder(root);
    printf("\n");
    return 0;
}
