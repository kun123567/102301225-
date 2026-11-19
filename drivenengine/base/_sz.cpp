#include <bits/stdc++.h>
using namespace std;
vector<int> g[4];
queue<int> q;
int main()
{
    int i;
    g[1].push_back(2); g[1].push_back(3); g[2].push_back(1);
    q.push(7); q.push(8);
    printf("size()=%d (long)size=%ld iter=", (int)g[1].size(), (long)g[1].size());
    for (vector<int>::const_iterator it = g[1].begin(); it != g[1].end(); ++it) printf("%d,", *it);
    printf("\n");
    printf("q.size()=%d empty=%d front=%d\n", (int)q.size(), (int)q.empty(), (int)q.front());
    { queue<int> c = q; int n = 0; while (!c.empty() && n < 8) { printf("pop=%d ", (int)c.front()); c.pop(); ++n; } printf("\n"); }
    for (i = 0; i < 4; i++) printf("g[%d].size()=%d\n", i, (int)g[i].size());
    return 0;
}
