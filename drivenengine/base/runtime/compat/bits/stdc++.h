// bits/stdc++.h -- Open Watcom 兼容垫片（prototype01 提供）
//
// 说明：GCC/libstdc++ 的 <bits/stdc++.h> 是**非标准**的统一包含头，
//       Open Watcom 没有它。此文件由 prototype01 在编译前注入到工作目录，
//       让"竞赛模板"里 #include <bits/stdc++.h> 的代码可以直接编译。
//
// 注意：Open Watcom 的 C++ 头采用 8.3 短文件名，长名不保证存在
//       （例：unordered_map → <unorderm>，type_traits → <type_tra>）。

#ifndef AVC_BITS_STDCPP_H
#define AVC_BITS_STDCPP_H

/* ---- C 标准库 ---- */
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <cctype>
#include <climits>
#include <cfloat>
#include <ctime>
#include <cassert>
#include <cstddef>
#include <cstdarg>
#include <cstdint>

/* ---- 容器 ---- */
#include <vector>
#include <list>
#include <deque>
#include <queue>
#include <stack>
#include <set>
#include <map>
#include <bitset>
#include <string>

/* ---- 算法与工具 ---- */
#include <algorithm>
#include <functional>
#include <iterator>
#include <memory>
#include <utility>
#include <numeric>
#include <limits>
#include <complex>
#include <valarray>

/* ---- 输入输出 ---- */
#include <iostream>
#include <sstream>
#include <fstream>
#include <iomanip>
#include <ios>
#include <istream>
#include <ostream>

/* ---- C++11（本工具链为 libstdc++ 移植，8.3 短名）---- */
#include <array>
#include <tuple>
#include <ratio>
#include <chrono>
#include <atomic>
#include <mutex>
#include <thread>
#include <future>
#include <regex>
#include <unorderm>     /* unordered_map */
#include <unorders>     /* unordered_set */
#include <type_tra>     /* type_traits */
#include <typeinfo>
#include <typeinde>     /* typeindex */
#include <exceptio>     /* exception */
#include <initiali>     /* initializer_list */
#include <function>     /* 函数对象 */
#include <system_e>     /* system_error */
#include <conditio>     /* condition_variable */

/* 该工具链确实没有的头（若用到请改用其它写法）：
 *   <filesystem>  <charconv>  <any>  <optional>  <variant>  <string_view> */

/* 竞赛模板常用别名 */
typedef long long ll;
typedef unsigned long long ull;
typedef std::pair<int, int> pii;
typedef std::vector<int> vi;
#define all(x) (x).begin(), (x).end()

#endif /* AVC_BITS_STDCPP_H */
