// @desc 邻接表 ALGraph：vector<int> g[N] 手工加 5 条无向边，从 1 号顶点做 BFS
//
// 只用到 vector / queue 两个容器（Open Watcom 的 C++ 前端只到 C++98，
// 因此不用 range-for、不用 auto、不用花括号初始化）。
#include <stdio.h>
#include <vector>
#include <queue>

using namespace std;

const int N = 8;        /* 顶点 0..7，本题实际用 1..6 */

vector<int> g[N];       /* 邻接表：g[u] 里是 u 的所有邻接点（自动画成图） */
bool vis[N];            /* 访问标记，数组窗可见 */
int order[N];           /* BFS 的访问顺序，数组窗可见 */
int orderCnt = 0;       /* 已访问顶点数 */

/* 加一条无向边：两个方向都要挂 */
static void add_edge(int u, int v)
{
    g[u].push_back(v);
    g[v].push_back(u);
}

/* 从 s 出发的 BFS：队列里放待访问的顶点 */
static void bfs(int s)
{
    queue<int> q;
    int k, u, v;

    vis[s] = true;          /* 入队前先打标记，防止重复入队 */
    q.push(s);
    orderCnt = 0;

    while (!q.empty()) {
        u = q.front();      /* 出队：当前这一步要访问的顶点 */
        q.pop();

        order[orderCnt] = u;   /* 改数组：记录访问顺序 */
        orderCnt++;

        /* 遍历 u 的所有邻接点（C++98：下标循环，不用 range-for） */
        for (k = 0; k < (int)g[u].size(); k++) {
            v = g[u][k];
            if (!vis[v]) {
                vis[v] = true;   /* 入队前标记，同时改 vis 数组 */
                q.push(v);       /* 入队：图 + 队列同时变化 */
            }
        }
    }
}

int main(void)
{
    int i = 0;

    /* 5 条无向边：1-2 1-3 2-4 3-4 5-6（顶点 5、6 自成一棵，用来体现"不连通"） */
    add_edge(1, 2);
    add_edge(1, 3);
    add_edge(2, 4);
    add_edge(3, 4);
    add_edge(5, 6);

    printf("邻接表:\n");
    for (i = 0; i < N; i++) {
        size_t k;
        if (g[i].empty()) continue;
        printf("  %d ->", i);
        for (k = 0; k < g[i].size(); k++) printf(" %d", g[i][k]);
        printf("\n");
    }

    bfs(1);                 /* 从 1 号顶点出发 */

    printf("BFS 从 1 出发的访问顺序:");
    for (i = 0; i < orderCnt; i++) printf(" %d", order[i]);
    printf("\n");
    printf("可到达 %d 个顶点（5、6 不连通，故只有 4 个）\n", orderCnt);

    return 0;
}
