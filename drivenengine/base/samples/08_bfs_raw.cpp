// @desc 图的 BFS：邻接表 + range-for + nullptr（C++11 语法探测）
#include <bits/stdc++.h>
using namespace std;

const int N = 100010;

vector<int> g[N];   // 邻接表
bool vis[N];        // 访问标记数组

// 从起点 s 开始进行 BFS
void bfs(int s) {
    queue<int> q;

    vis[s] = true;  // 入队前标记，防止重复入队
    q.push(s);

    while (!q.empty()) {
        int u = q.front();
        q.pop();

        cout << u << " ";  // 访问当前结点

        // 遍历 u 的所有邻接点
        for (int v : g[u]) {
            if (!vis[v]) {
                vis[v] = true;  // 入队前标记
                q.push(v);
            }
        }
    }
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    cin >> n >> m;  // n 个顶点，m 条边，顶点编号 1~n

    for (int i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        g[u].push_back(v);
        g[v].push_back(u);  // 无向图；若为有向图，删掉这一行
    }

    memset(vis, false, sizeof(vis));

    int s;
    cin >> s;  // BFS 起点

    bfs(s);
    cout << "\n";

    return 0;
}
