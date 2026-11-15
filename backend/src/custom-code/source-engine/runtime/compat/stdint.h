/* stdint.h -- 兼容垫片（同上：裁剪版头文件里没有 C99 的 <stdint.h>）
   只给教学代码最常用的定宽类型与最值宏。 */
#ifndef __AVC_COMPAT_STDINT_H
#define __AVC_COMPAT_STDINT_H

typedef signed char        int8_t;
typedef unsigned char      uint8_t;
typedef short              int16_t;
typedef unsigned short     uint16_t;
typedef int                int32_t;
typedef unsigned int       uint32_t;
typedef __int64            int64_t;
typedef unsigned __int64   uint64_t;
typedef int                intptr_t;
typedef unsigned int       uintptr_t;

#define INT8_MIN   (-128)
#define INT8_MAX   127
#define UINT8_MAX  255u
#define INT16_MIN  (-32768)
#define INT16_MAX  32767
#define UINT16_MAX 65535u
#define INT32_MIN  (-2147483647 - 1)
#define INT32_MAX  2147483647
#define UINT32_MAX 4294967295u

#endif /* __AVC_COMPAT_STDINT_H */