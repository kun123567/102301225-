// @desc 大顶堆 Heap：数组层序存完全二叉树，插入 5 个值向上调整，再删除堆顶向下调整
//
// 完全二叉树用数组存（下标从 1 开始）：
//   结点 i 的父 = i/2，左孩子 = 2i，右孩子 = 2i+1
// 大顶堆性质：任一结点都不小于它的孩子 => data[1] 就是最大值。
#include <stdio.h>

#define MAXSIZE 16

typedef struct {
    int data[MAXSIZE];   /* 层序存储：data[1] 是堆顶，data[0] 空着不用 */
    int size;            /* 当前元素个数 */
} Heap;

/* 采集镜像同步：可视化采集层只观察"函数首层的普通变量"，看不到结构体字段，
 * 因此把 h->data / h->size 复制到 main 里的 data[] 与 size，数组窗观察它们。 */
static void sync_view(const Heap *h, int data[], int *psize)
{
    int i;
    for (i = 0; i < MAXSIZE; i++) data[i] = h->data[i];
    *psize = h->size;
}

/* 向上调整：新元素 data[i] 比父结点大就交换，一路浮到合适位置 */
static void sift_up(Heap *h, int i)
{
    int t;

    while (i > 1 && h->data[i / 2] < h->data[i]) {
        t = h->data[i / 2];          /* 这一步在改数组：父子交换 */
        h->data[i / 2] = h->data[i];
        h->data[i] = t;
        i = i / 2;                   /* 继续比上一层 */
    }
}

/* 插入：先放到数组末尾，再向上调整；size 加 1 */
static void insert(Heap *h, int key)
{
    h->size++;
    h->data[h->size] = key;
    sift_up(h, h->size);
}

/* 向下调整：data[i] 与"较大的那个孩子"交换，一路沉到叶子或满足堆序 */
static void sift_down(Heap *h, int i)
{
    int t, big;

    for (;;) {
        big = i;
        if (2 * i <= h->size && h->data[2 * i] > h->data[big]) big = 2 * i;
        if (2 * i + 1 <= h->size && h->data[2 * i + 1] > h->data[big]) big = 2 * i + 1;
        if (big == i) break;         /* 父已是三者中最大，停止下沉 */
        t = h->data[i];              /* 改数组：父与较大孩子交换 */
        h->data[i] = h->data[big];
        h->data[big] = t;
        i = big;
    }
}

/* 删除堆顶：末尾元素顶到 data[1]，size 减 1，再向下调整 */
static int pop_top(Heap *h)
{
    int top = h->data[1];

    h->data[1] = h->data[h->size];   /* 改数组：尾元素覆盖堆顶 */
    h->size--;
    sift_down(h, 1);
    return top;
}

/* 层序打印，顺便看清数组里发生了什么 */
static void show(const char *tag, Heap *h)
{
    int i;

    printf("%s size=%d :", tag, h->size);
    for (i = 1; i <= h->size; i++) printf(" %d", h->data[i]);
    printf("\n");
}

int main(void)
{
    Heap h;                                 /* 堆本体：h.data[] 就是完全二叉树的数组 */
    int data[MAXSIZE] = { 0 };              /* 采集镜像：与 h.data 同步，数组窗观察它 */
    int size = 0;                           /* 采集镜像：与 h.size 同步 */
    int keys[5] = { 12, 7, 30, 25, 18 };    /* 写死的数据，不读 stdin */
    int i, top = 0;

    h.size = 0;
    for (i = 0; i < MAXSIZE; i++) h.data[i] = 0;

    /* ① 逐个插入 5 个值：每次 insert 都要向上调整，数组随之变化 */
    printf("依次插入 12 7 30 25 18:\n");
    for (i = 0; i < 5; i++) {
        insert(&h, keys[i]);
        sync_view(&h, data, &size);          /* 同步镜像，单步时数组窗看到变化 */
        show("插入后", &h);
    }

    /* ② 删除堆顶（最大值）：尾元素顶上 + 向下调整 */
    top = pop_top(&h);
    sync_view(&h, data, &size);
    printf("弹出的堆顶 = %d\n", top);
    show("删顶后", &h);

    /* ③ 再删一次，验证堆序仍然成立 */
    top = pop_top(&h);
    sync_view(&h, data, &size);
    printf("弹出的堆顶 = %d\n", top);
    show("删顶后", &h);

    printf("堆顶 data[1] = %d，元素个数 size = %d\n", data[1], size);
    return 0;
}
