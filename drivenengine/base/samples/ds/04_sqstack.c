// @desc 顺序栈 SqStack：定长数组 data[16] + 栈顶下标 top，压栈 4 个再弹栈 2 个
#include <stdio.h>

#define MAXSIZE 16

/* 顺序栈本体：data 存元素，top 是栈顶下标（top == -1 表示空栈，元素在 data[0..top]） */
typedef struct {
    int data[MAXSIZE];
    int top;
} SqStack;

/* 采集镜像同步：把 S->data / S->top 复制到 main 首层的 data[] 与 top，
 * 因为可视化采集层只观察"函数首层的普通变量"，看不到结构体字段。 */
static void sync_view(const SqStack *S, int data[], int *ptop)
{
    int i;
    for (i = 0; i < MAXSIZE; i++) data[i] = S->data[i];
    *ptop = S->top;
}

/* 压栈：top 先加一，再写入 data[top] */
static int push(SqStack *S, int x)
{
    if (S->top + 1 >= MAXSIZE) { printf("  压栈 %d 失败：栈满\n", x); return 0; }
    S->top = S->top + 1;        /* 栈顶上移一格 */
    S->data[S->top] = x;        /* 元素写到新的栈顶 */
    return 1;
}

/* 弹栈：取出 data[top]，清空该格，top 再减一 */
static int pop(SqStack *S, int *out)
{
    if (S->top < 0) { printf("  弹栈失败：栈空\n"); return 0; }
    *out = S->data[S->top];     /* 栈顶元素出栈 */
    S->data[S->top] = 0;        /* 清掉这一格，数组窗能看到它变回 0 */
    S->top = S->top - 1;        /* 栈顶下移一格 */
    return 1;
}

/* 从栈底到栈顶打印一遍 */
static void show(const SqStack *S)
{
    int i;
    printf("  top=%d  栈底->栈顶: ", S->top);
    for (i = 0; i <= S->top; i++) printf("%d ", S->data[i]);
    printf("\n");
}

int main(void)
{
    SqStack S;
    int data[MAXSIZE] = { 0 };   /* 采集镜像：与 S.data 同步，数组窗观察它 */
    int top = -1;                /* 采集镜像：与 S.top 同步，变量窗观察它 */
    int got = 0, i = 0, ok = 0;  /* 全部初始化，避免首帧显示垃圾值 */

    /* 初始化空栈 */
    S.top = -1;
    for (i = 0; i < MAXSIZE; i++) S.data[i] = 0;
    sync_view(&S, data, &top);
    printf("初始空栈：\n");
    show(&S);

    /* 第 1 步：压栈 4 个 —— 每次 top+1 并写入 data[top] */
    printf("依次压栈 5 15 25 35：\n");
    push(&S, 5);
    sync_view(&S, data, &top);
    push(&S, 15);
    sync_view(&S, data, &top);
    push(&S, 25);
    sync_view(&S, data, &top);
    push(&S, 35);
    sync_view(&S, data, &top);
    show(&S);

    /* 第 2 步：弹栈 2 个 —— 后进先出，先出 35 再出 25 */
    printf("弹栈两次：\n");
    got = 0;
    ok = pop(&S, &got);
    sync_view(&S, data, &top);
    printf("  第 1 次弹栈 ok=%d，出栈元素 = %d\n", ok, got);
    ok = pop(&S, &got);
    sync_view(&S, data, &top);
    printf("  第 2 次弹栈 ok=%d，出栈元素 = %d\n", ok, got);
    show(&S);

    /* 第 3 步：再压一个 99 覆盖刚空出来的格子位置 */
    printf("再压栈 99：\n");
    push(&S, 99);
    sync_view(&S, data, &top);
    show(&S);
    return 0;
}
