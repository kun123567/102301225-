// @desc 链队列 LinkQueue：单链表实现队列，front/rear 两个指针尾插入队、头删出队
#include <stdio.h>
#include <stdlib.h>

typedef struct QNode {
    int key;
    struct QNode *next;
} QNode;

/* 打印队列：从队头 front 顺着 next 走一遍 */
static void show(QNode *front, QNode *rear)
{
    QNode *p = front;
    printf("队列: front -> ");
    while (p) {
        printf("[%d] ", p->key);
        p = p->next;
    }
    printf("<- rear");
    if (front) printf("  (队头 %d, 队尾 %d)\n", front->key, rear->key);
    else       printf("  (空队列)\n");
}

int main(void)
{
    QNode *front = NULL;   /* 队头指针：出队从这里摘结点 */
    QNode *rear  = NULL;   /* 队尾指针：入队往这里挂结点 */
    QNode *p;
    QNode *newNode;
    int keys[4] = { 11, 22, 33, 44 };
    int i;

    /* ---- 第 1 步：入队 4 个（尾插，rear 后移）---- */
    for (i = 0; i < 4; i++) {
        newNode = (QNode *)malloc(sizeof(QNode));
        newNode->key  = keys[i];
        newNode->next = NULL;
        if (rear == NULL) {        /* 空队列：front 与 rear 同时指向新结点 */
            front = newNode;
            rear  = newNode;
        } else {                   /* 非空：挂到 rear 后面，rear 前移一位 */
            rear->next = newNode;
            rear = newNode;
        }
        printf("入队 %d 完成\n", keys[i]);
        show(front, rear);
    }

    /* ---- 第 2 步：出队 2 个（摘掉 front 结点，front 后移）---- */
    for (i = 0; i < 2; i++) {
        p = front;                 /* 暂存待删结点 */
        printf("出队 %d\n", p->key);
        front = front->next;       /* front 后移，队列少一个结点 */
        if (front == NULL) rear = NULL;   /* 队列已空：rear 也要清空 */
        free(p);                   /* 释放出队结点 */
        show(front, rear);
    }

    /* ---- 第 3 步：清空队列，验证 front/rear 归零 ---- */
    while (front) {
        p = front;
        front = front->next;
        free(p);
    }
    rear = NULL;
    printf("已清空全部结点, front 为空:%d, rear 为空:%d\n",
           front == NULL, rear == NULL);
    return 0;
}
