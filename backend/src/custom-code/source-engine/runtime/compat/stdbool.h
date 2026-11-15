/* stdbool.h -- 兼容垫片（Watcom 的头文件集是裁剪版，没有 C99 的 <stdbool.h>）
   compile.js 会把 runtime/compat 复制进工作目录并加到 INCLUDE，所以用户代码里的
   #include <stdbool.h> 能直接解析。只定义标准宏，不做别的事。 */
#ifndef __AVC_COMPAT_STDBOOL_H
#define __AVC_COMPAT_STDBOOL_H

#ifndef __cplusplus
#ifndef bool
#define bool int
#endif
#ifndef true
#define true 1
#endif
#ifndef false
#define false 0
#endif
#define __bool_true_false_are_defined 1
#endif /* !__cplusplus */

#endif /* __AVC_COMPAT_STDBOOL_H */