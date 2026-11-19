// @desc 顺序串 SStr：求长度、取子串、比较字符串，并在 s 上做删除，数组窗看字符变化
#include <stdio.h>

/* 顺序串用定长字符数组存储，'\0' 结尾 */
char s[16] = "DataStruct";
char sub[16];        /* 取子串的目标缓冲 */
char cmp[16] = "Database";   /* 用来和 s 比较 */

/* 求串长：数到 '\0' 为止 */
static int sstr_len(const char *t)
{
    int n = 0;
    while (t[n] != '\0') n++;
    return n;
}

/* 取子串：从 pos 开始取 len 个字符，放到 dst 里 */
static void sstr_sub(const char *src, int pos, int len, char *dst)
{
    int i = 0;
    while (i < len && src[pos + i] != '\0') {
        dst[i] = src[pos + i];        /* 逐个字符搬过去 */
        i++;
    }
    dst[i] = '\0';                    /* 补结尾符 */
}

/* 比较：返回 <0 / 0 / >0（和 strcmp 语义一致） */
static int sstr_cmp(const char *a, const char *b)
{
    int i = 0;
    while (a[i] != '\0' && b[i] != '\0') {
        if (a[i] != b[i]) return (unsigned char)a[i] - (unsigned char)b[i];
        i++;
    }
    return (unsigned char)a[i] - (unsigned char)b[i];
}

/* 删除前 pos 个字符（后面的字符整体前移） */
static void sstr_delete_head(char *t, int pos)
{
    int i = 0;
    int k;
    while (t[pos + i] != '\0') {
        t[i] = t[pos + i];            /* 改 t[i]：字符整体左移 */
        i++;
    }
    t[i] = '\0';
    for (k = i + 1; k < 16; k++) t[k] = '\0';   /* 清掉左移后残留的旧字符 */
}

int main(void)
{
    int len;
    int k;

    printf("串 s = \"%s\"\n", s);
    for (k = 0; k < 12; k++) printf("%c ", s[k] == '\0' ? '_' : s[k]);
    printf("\n");

    /* 1) 求长度 */
    len = sstr_len(s);
    printf("[1] 长度 len = %d\n", len);

    /* 2) 取子串：从下标 4 开始取 6 个字符 -> "Struct" */
    sstr_sub(s, 4, 6, sub);
    printf("[2] 子串 s[4..9] = \"%s\"（长度 %d）\n", sub, sstr_len(sub));

    /* 3) 比较：'S'(83) < 'b'(98)，所以 s < cmp */
    k = sstr_cmp(s, cmp);
    printf("[3] cmp(\"%s\", \"%s\") = %d\n", s, cmp, k);
    if (k < 0) printf("    s 更小：第 5 个字符 'S' < 'b'\n");
    else if (k > 0) printf("    s 更大\n");
    else printf("    两串相等\n");

    /* 4) 删除 s 的前 4 个字符，s 变成 "Struct"（数组窗能看到字符整体左移） */
    sstr_delete_head(s, 4);
    printf("[4] 删前 4 字符后 s = \"%s\"（长度 %d）\n", s, sstr_len(s));
    for (k = 0; k < 12; k++) printf("%c ", s[k] == '\0' ? '_' : s[k]);
    printf("\n");

    return 0;
}
