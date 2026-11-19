/* time.h -- 兼容垫片
 *
 * 只做"够用"的声明：time()/clock()/difftime() 这些符号在 clib3r.lib 里（实测可链接）。
 * struct tm 的字段按 Watcom 的顺序给出，方便用户代码读常见字段。
 * 注意：这是最薄的一层，locale/时区相关（localtime 的细节）不保证可用。
 */
#ifndef __AVC_COMPAT_TIME_H
#define __AVC_COMPAT_TIME_H

#include <stdio.h>   /* 取 size_t（strftime 用） */

#ifdef __cplusplus
extern "C" {
#endif

#ifndef __AVC_COMPAT_TIME_T
#define __AVC_COMPAT_TIME_T
typedef long time_t;
#endif

#ifndef __AVC_COMPAT_CLOCK_T
#define __AVC_COMPAT_CLOCK_T
typedef long clock_t;
#endif

#ifndef CLOCKS_PER_SEC
#define CLOCKS_PER_SEC 1000L
#endif

struct tm {
  int tm_sec;
  int tm_min;
  int tm_hour;
  int tm_mday;
  int tm_mon;
  int tm_year;
  int tm_wday;
  int tm_yday;
  int tm_isdst;
};

time_t time(time_t*);
clock_t clock(void);
double difftime(time_t, time_t);
time_t mktime(struct tm*);

char* ctime(const time_t*);
struct tm* localtime(const time_t*);
struct tm* gmtime(const time_t*);
size_t strftime(char*, size_t, const char*, const struct tm*);

#ifdef __cplusplus
}
#endif

#endif /* __AVC_COMPAT_TIME_H */
