// @desc 链地址法哈希表：HNode* ht[7] 七个桶，插入 5 个键，逐桶遍历同义词链
//
// 冲突处理：hash(key) = key % 7 相同的关键字挂到同一个桶的链上（头插法）。
// 结构窗顺着指针把当前遍历到的那条链画出来（结点 + 箭头）。
#include <stdio.h>
#include <stdlib.h>

#define HASHSIZE 7

typedef struct HNode {
    int key;
    struct HNode *next;
} HNode;

HNode *ht[HASHSIZE];        /* 桶数组：ht[i] 是同义词链的头指针，空桶为 NULL */

/* 除留余数法 */
static int hash(int key)
{
    return key % HASHSIZE;
}

/* 插入：同键则不重复插；否则头插到对应桶
 * （指针写成 struct HNode * 而不是 HNode *：采集层靠"struct 标签 + 指针变量"顺着
 *   next 把链 walk 出来，写在函数首层的指针局部变量会被逐结点 dump） */
static void insert_key(int key)
{
    struct HNode *p = NULL;
    int idx = hash(key);

    for (p = ht[idx]; p != NULL; p = p->next)
        if (p->key == key) return;         /* 已有同键，跳过 */

    /* 用 calloc 先把 key/next 清零：采集层会在每条语句后 dump 指针变量，
     * 若用 malloc，中间态里的垃圾 next 会被画成假结点 */
    p = (HNode *)calloc(1, sizeof(HNode));
    p->key = key;                          /* ① 填 key */
    p->next = ht[idx];                     /* ② 指针改向：新结点指向原链头 */
    ht[idx] = p;                           /* ③ 桶头换人，头插完成 */
}

/* 逐桶遍历：单步时可见 p 沿链一跳一跳前进 */
static void traverse(void)
{
    struct HNode *p = NULL;
    int i, cnt = 0;

    for (i = 0; i < HASHSIZE; i++) {
        printf("桶 %d:", i);
        cnt = 0;
        for (p = ht[i]; p != NULL; p = p->next) {
            printf(" %d ->", p->key);      /* 边遍历边打印，画面随之刷新 */
            cnt++;
        }
        printf(" NULL (%d 个)\n", cnt);
    }
}

int main(void)
{
    int keys[5] = { 22, 41, 53, 46, 30 };  /* 22%7=1 41%7=6 53%7=4 46%7=4 30%7=2 */
    struct HNode *p = NULL;                /* 结构窗顺着它 dump 当前这条链 */
    int i, found = 0;

    /* ① 清空 7 个桶 */
    for (i = 0; i < HASHSIZE; i++) ht[i] = NULL;

    /* ② 插入 5 个键：53 与 46 冲突，会同挂在桶 4 上 */
    for (i = 0; i < 5; i++) insert_key(keys[i]);

    /* ③ 逐桶遍历，看每个桶挂了几条同义词 */
    printf("哈希表（桶数 %d）:\n", HASHSIZE);
    traverse();

    /* ④ 查找 46：沿桶 4 的链一路比较 */
    found = 0;
    for (p = ht[hash(46)]; p != NULL; p = p->next) {
        if (p->key == 46) { found = 1; break; }
    }
    printf("查找 46: %s\n", found ? "找到" : "未找到");

    /* 示例程序不逐一 free，进程退出后由系统回收 */
    return 0;
}
