/* assert.h -- 兼容垫片
 *
 * 自定义代码里常写 assert(...) 做边界检查。这里给最小实现：
 *   - 定义 NDEBUG 时彻底失效（与标准一致）
 *   - 否则打印 文件:行: 断言失败 后 abort()
 * abort() 是 clib3r.lib 里的标准符号（stdlib.h 已声明），不需要额外库。
 */
#ifndef __AVC_COMPAT_ASSERT_H
#define __AVC_COMPAT_ASSERT_H


#include <stdio.h>
#include <stdlib.h>
#ifdef __cplusplus
extern "C" {
#endif

#ifdef NDEBUG
#define assert(expr) ((void)0)
#else
#define assert(expr) \
  ((expr) ? (void)0 : (void)(printf("%s:%d: 断言失败：%s\n", __FILE__, __LINE__, #expr), abort()))
#endif


#ifdef __cplusplus
}
#endif
#endif /* __AVC_COMPAT_ASSERT_H */
