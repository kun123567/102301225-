// @desc 循环队列 SqQueue：定长数组 + front/rear 下标，用 (rear+1)%MAX 判满
#include <stdio.h>

#define MAX 8            /* 数组容量 8，实际最多放 7 个元素（留一个空位判满） */

typedef struct {
    int data[MAX];       /* 数组窗重点看这 8 个格子 */
    int front;           /* 队头下标：出队位置，指向当前队头元素 */
    int rear;            /* 队尾下标：入队位置，指向下一个可写空位 */
} SqQueue;

/* 判满：rear 再走一格就撞上 front */
static int full(SqQueue *q)
{
    return (q->rear + 1) % MAX == q->front;
}

/* 判空：front 与 rear 重合 */
static int empty(SqQueue *q)
{
    return q->front == q->rear;
}

/* 入队：写到 rear 处，然后 rear 循环后移 */
static int enqueue(SqQueue *q, int key)
{
    if (full(q)) return 0;             /* 队满，拒绝入队 */
    q->data[q->rear] = key;
    q->rear = (q->rear + 1) % MAX;     /* 取模回绕 */
    return 1;
}

/* 出队：读 front 处，然后 front 循环后移 */
static int dequeue(SqQueue *q, int *out)
{
    if (empty(q)) return 0;            /* 队空，出队失败 */
    *out = q->data[q->front];
    q->data[q->front] = 0;             /* 清空该格，画面上能看出被弹出 */
    q->front = (q->front + 1) % MAX;
    return 1;
}

/* 打印整个数组窗与两个下标 */
static void show(SqQueue *q)
{
    printf("data = [");
    printf("%d %d %d %d %d %d %d %d]  front=%d rear=%d\n",
           q->data[0], q->data[1], q->data[2], q->data[3],
           q->data[4], q->data[5], q->data[6], q->data[7],
           q->front, q->rear);
}

int main(void)
{
    SqQueue q;
    int keys[5] = { 10, 20, 30, 40, 50 };
    int more[3] = { 60, 70, 80 };
    int i, v;

    /* ---- 第 0 步：初始化，front = rear = 0 表示空 ---- */
    q.front = 0;
    q.rear  = 0;
    for (i = 0; i < MAX; i++) q.data[i] = 0;
    printf("初始化: ");
    show(&q);

    /* ---- 第 1 步：入队 5 个，rear 依次 0->1->2->3->4->5 ---- */
    for (i = 0; i < 5; i++) {
        if (enqueue(&q, keys[i])) printf("入队 %d 成功: ", keys[i]);
        else                      printf("入队 %d 失败(队满): ", keys[i]);
        show(&q);
    }

    /* ---- 第 2 步：出队 2 个，front 依次 0->1->2 ---- */
    for (i = 0; i < 2; i++) {
        if (dequeue(&q, &v)) printf("出队 %d : ", v);
        else                 printf("出队失败(队空): ");
        show(&q);
    }

    /* ---- 第 3 步：再入队 3 个，rear 越过数组末尾后回绕到 0 ---- */
    for (i = 0; i < 3; i++) {
        if (enqueue(&q, more[i])) printf("入队 %d 成功: ", more[i]);
        else                      printf("入队 %d 失败(队满): ", more[i]);
        show(&q);
    }

    printf("结束时 空队列:%d 满队列:%d\n", empty(&q), full(&q));
    return 0;
}
