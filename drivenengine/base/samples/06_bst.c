// @desc 二叉排序树：插入与中序遍历（结构窗 · 可折叠树视图）
#include <stdio.h>
#include <stdlib.h>

struct TNode {
    int key;
    struct TNode *left;
    struct TNode *right;
};

static struct TNode *insert(struct TNode *root, int key)
{
    if (root == NULL) {
        root = (struct TNode *)malloc(sizeof(struct TNode));
        root->key = key;
        root->left = NULL;
        root->right = NULL;
        return root;
    }
    if (key < root->key) root->left = insert(root->left, key);
    else                 root->right = insert(root->right, key);
    return root;
}

static void inorder(struct TNode *root)
{
    if (root == NULL) return;
    inorder(root->left);
    printf("%d ", root->key);
    inorder(root->right);
}

int main(void)
{
    struct TNode *root = NULL;
    int keys[7] = { 45, 24, 53, 12, 37, 98, 61 };
    int i;

    for (i = 0; i < 7; i++) {
        root = insert(root, keys[i]);
    }
    printf("中序遍历: ");
    inorder(root);
    printf("\n");
    return 0;
}
