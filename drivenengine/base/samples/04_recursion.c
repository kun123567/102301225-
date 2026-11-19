// @desc 递归：阶乘与斐波那契（栈区 活动记录/递归深度）
#include <stdio.h>

long fact(int n)
{
    long r;
    if (n <= 1) {
        r = 1;
    } else {
        r = n * fact(n - 1);
    }
    return r;
}

int fib(int n)
{
    int r;
    if (n < 2) {
        r = n;
    } else {
        r = fib(n - 1) + fib(n - 2);
    }
    return r;
}

int main(void)
{
    int i;
    long f;

    f = fact(5);
    printf("5! = %ld\n", f);

    for (i = 0; i <= 8; i++) {
        printf("fib(%d) = %d\n", i, fib(i));
    }
    return 0;
}
