#include "avctrace.h"
#include <vector>
#include <queue>
using namespace std;

const int N = 100010;
vector<int> g[N];

int main()
{
    int u;
    g[1].push_back(2); g[1].push_back(3);
    g[2].push_back(1); g[2].push_back(4);
    g[3].push_back(1); g[3].push_back(4);
    g[4].push_back(2); g[4].push_back(3);
    __avc_t(1);
    { int _avc_u, _avc_ec = 0; __avc_len("g",16);
      for (_avc_u = 0; _avc_u < 16; _avc_u++) {
        printf("u=%d size=%d | ", _avc_u, (int)g[_avc_u].size());
        __avc_n("g", _avc_u, (long)g[_avc_u].size());
        for (vector<int>::const_iterator it = g[_avc_u].begin(); it != g[_avc_u].end() && _avc_ec < 64; ++it, ++_avc_ec)
            __avc_edge("g", _avc_u, (int)(*it), "adj");
      } }
    printf("\n");
    return 0;
}
