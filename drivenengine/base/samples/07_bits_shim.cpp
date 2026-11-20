// @desc 竞赛模板：bits/stdc++.h 兼容垫片验证（C++）
// 说明：<bits/stdc++.h> 是 GCC 专有头，本工具链没有；
//       prototype01 会在编译前把它注入为兼容垫片（runtime\compat\bits\stdcpp.h）。
#include <bits/stdc++.h>
using namespace std;

typedef long long ll;

struct Edge {
    int to, w;
    bool operator<(const Edge& o) const { return w > o.w; }
};

int main()
{
    vector<int> v;
    v.push_back(3); v.push_back(1); v.push_back(2);
    sort(v.begin(), v.end());

    map<string, int> m;
    m["alpha"] = 1;
    m["beta"] = 2;

    priority_queue<Edge> pq;
    Edge e; e.to = 7; e.w = 5; pq.push(e);

    string s = "bits/stdc++.h works";
    ll big = 1000000007LL * 3;

    printf("%s\n", s.c_str());
    printf("vector: %d %d %d\n", v[0], v[1], v[2]);
    printf("map: size=%d alpha=%d\n", (int)m.size(), m["alpha"]);
    printf("priority_queue top: to=%d w=%d\n", pq.top().to, pq.top().w);
    printf("ll = %lld\n", big);
    cout << "cout ok: " << v.size() << " " << m.size() << endl;
    return 0;
}
