// @desc 二叉排序树 BST：依次插入 8,3,10,1,6,14，中序遍历有序，最后查找 6
#include <stdio.h>
#include <stdlib.h>

typedef struct BSTNode {
    int key;
    struct BSTNode *left;    /* 比 key 小的都在左子树 */
    struct BSTNode *right;   /* 比 key 大的都在右子树 */
} BSTNode;

/* 插入：小的往左走、大的往右走，走到空位就挂新结点 */
static BSTNode *insert(BSTNode *root, int key)
{
    if (root == NULL) {
        root = (BSTNode *)malloc(sizeof(BSTNode));
        root->key   = key;
        root->left  = NULL;
        root->right = NULL;
        return root;
    }
    if (key < root->key)      root->left  = insert(root->left, key);
    else if (key > root->key) root->right = insert(root->right, key);
    /* key == root->key 视为重复，不插入 */
    return root;
}

/* 中序遍历：BST 的中序结果一定是升序 */
static void inOrder(BSTNode *t)
{
    if (t == NULL) return;
    inOrder(t->left);
    printf("%d ", t->key);
    inOrder(t->right);
}

/* 查找：每层只走一条路，边比较边往下 */
static BSTNode *search(BSTNode *root, int key, int *steps)
{
    BSTNode *p = root;
    *steps = 0;
    while (p) {
        (*steps)++;
        printf("  step %d: 访问 %d, 目标 %d%s\n",
               *steps, p->key, key,
               key == p->key ? " <- 命中" : (key < p->key ? " 往左" : " 往右"));
        if (key == p->key) return p;
        p = (key < p->key) ? p->left : p->right;
    }
    return NULL;
}

int main(void)
{
    BSTNode *root = NULL;   /* 结构窗能看到 root 树随插入逐步生长 */
    BSTNode *hit;
    int keys[6] = { 8, 3, 10, 1, 6, 14 };
    int i, steps;

    /* ---- 第 1 步：逐个插入，每插入一个都看一次树与中序 ---- */
    for (i = 0; i < 6; i++) {
        root = insert(root, keys[i]);
        printf("插入 %d 后: 根=%d 中序=", keys[i], root->key);
        inOrder(root);
        printf("\n");
    }

    /* ---- 第 2 步：查找 6，打印比较路径 ---- */
    printf("查找 6:\n");
    hit = search(root, 6, &steps);
    if (hit) printf("查找成功: key=%d, 比较 %d 次\n", hit->key, steps);
    else     printf("查找失败: 比较 %d 次\n", steps);

    printf("最终中序(升序): ");
    inOrder(root);
    printf("\n");
    return 0;
}
