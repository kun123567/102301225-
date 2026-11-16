/* ctype.h -- 兼容垫片（只补声明；符号在 clib3r.lib 里，实测可链接） */
#ifndef __AVC_COMPAT_CTYPE_H
#define __AVC_COMPAT_CTYPE_H

#ifdef __cplusplus
extern "C" {
#endif

int isalnum(int);
int isalpha(int);
int iscntrl(int);
int isdigit(int);
int isgraph(int);
int islower(int);
int isprint(int);
int ispunct(int);
int isspace(int);
int isupper(int);
int isxdigit(int);
int tolower(int);
int toupper(int);


#ifdef __cplusplus
}
#endif
#endif /* __AVC_COMPAT_CTYPE_H */
