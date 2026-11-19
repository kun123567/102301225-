// @desc STL 容器采集验证：vector / list / set / queue / stack / priority_queue / map
// 用途：V2 采集层（b STL 泛型）的端到端样本——每个容器都应有 N/M 事件，
//       不认识的元素类型应降级为只发 M(len) 而不是编译失败。
#include <bits/stdc++.h>
using namespace std;

int main()
{
    vector<int> v;
    list<int> ls;
    set<int> st;
    queue<int> q;
    stack<int> sk;
    priority_queue<int> pq;
    map<int, int> mp;
    vector<string> names;      /* 元素类型非数值 -> 只发 M(len) */
    int i;

    for (i = 1; i <= 5; i++) {
        v.push_back(i * 10);
        ls.push_back(i * 10);
        st.insert(i);
    }
    for (i = 1; i <= 3; i++) {
        q.push(i);
        sk.push(i);
        pq.push(i * 7);
        mp[i] = i * i;
    }
    names.push_back(string("ab"));

    cout << v.size() << " " << q.size() << " " << mp[3] << " " << pq.top() << endl;
    return 0;
}
