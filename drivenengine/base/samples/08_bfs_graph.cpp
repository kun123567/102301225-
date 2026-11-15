// @desc 图的 BFS：邻接表（C++98 兼容版，可在本工具链直接编译）
//
// 相对原码的三处改写（Open Watcom C++ 前端只到 C++98）：
//   1) for (int v : g[u])      -> 下标循环（range-for 是 C++11 语法）
//   2) ios::sync_with_stdio(false); cin.tie(nullptr);  -> 删除（旧式 iostream 不接受这些参数）
//   3) sizeof 数组/类型照旧，memset 第三个参数用 sizeof(vis)
//
// 输入：n m，随后 m 行边 u v，最后一行 BFS 起点 s
// 例：4 4 / 1 2 / 1 3 / 2 4 / 3 4 / 1   ->  1 2 3 4
#include <bits/stdc++.h>
using namespace std;

const int N = 100010;

vector<int> g[N];   // 邻接表
bool vis[N];        // 访问标记数组

static void bfs(int s)
{
    queue<int> q;
    int k;

    vis[s] = true;      // 入队前标记，防止重复入队
    q.push(s);

    while (!q.empty()) {
        int u = q.front();
        q.pop();

        cout << u << " ";   // 访问当前结点

        /* 遍历 u 的所有邻接点（原 range-for 的下标写法） */
        for (k = 0; k < (int)g[u].size(); k++) {
            int v = g[u][k];
            if (!vis[v]) {
                vis[v] = true;   // 入队前标记
                q.push(v);
            }
        }
    }
}

int main()
{
    /* 本工具链的 iostream 是旧式实现：sync_with_stdio(bool)/tie() 不接受参数，
       这两句加速调用在此不可用，直接省略；如需更快请改用 scanf/printf。 */

    int n, m, i, s;

    cin >> n >> m;          // n 个顶点，m 条边，顶点编号 1~n
    for (i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        g[u].push_back(v);
        g[v].push_back(u);  // 无向图；若为有向图，删掉这一行
    }

    memset(vis, 0, sizeof(vis));

    cin >> s;               // BFS 起点
    bfs(s);
    cout << "\n";

    return 0;
}
