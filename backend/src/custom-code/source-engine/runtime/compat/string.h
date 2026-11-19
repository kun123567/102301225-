/* string.h -- 兼容垫片
 *
 * 为什么需要：third_party 里的 Watcom 头文件是**裁剪版**（只有 stdio/stdlib/limits），
 * 但 clib3r.lib 里这些函数符号都在（实测逐个链接通过）。
 * 所以这里只补声明、不实现 —— 用户代码写 #include <string.h> 就能过编译。
 *
 * 只声明"确认可链接"的函数；没有把握的（strdup/strlwr 这类扩展）不放进来，
 * 免得用户写完在链接期才炸。
 */
#ifndef __AVC_COMPAT_STRING_H
#define __AVC_COMPAT_STRING_H

#include <stdio.h>   /* 取 size_t / NULL（必须在 extern "C" 之外：C++ 下 stdio.h 里有 std:: 声明） */

#ifdef __cplusplus
extern "C" {
#endif

char*  strcpy(char*, const char*);
char*  strncpy(char*, const char*, size_t);
char*  strcat(char*, const char*);
char*  strncat(char*, const char*, size_t);
int    strcmp(const char*, const char*);
int    strncmp(const char*, const char*, size_t);
size_t strlen(const char*);
char*  strchr(const char*, int);
char*  strrchr(const char*, int);
char*  strstr(const char*, const char*);
char*  strpbrk(const char*, const char*);
char*  strtok(char*, const char*);

void*  memcpy(void*, const void*, size_t);
void*  memmove(void*, const void*, size_t);
void*  memset(void*, int, size_t);
int    memcmp(const void*, const void*, size_t);
void*  memchr(const void*, int, size_t);


#ifdef __cplusplus
}
#endif
#endif /* __AVC_COMPAT_STRING_H */
