/* math.h -- 兼容垫片（只补声明；符号在 math387r.lib / clib3r.lib 里，实测可链接） */
#ifndef __AVC_COMPAT_MATH_H
#define __AVC_COMPAT_MATH_H

#ifdef __cplusplus
extern "C" {
#endif

double sqrt(double);
double pow(double, double);
double fabs(double);
double fmod(double, double);
double sin(double);
double cos(double);
double tan(double);
double asin(double);
double acos(double);
double atan(double);
double atan2(double, double);
double sinh(double);
double cosh(double);
double tanh(double);
double exp(double);
double log(double);
double log10(double);
double floor(double);
double ceil(double);
double ldexp(double, int);
double frexp(double, int*);
double modf(double, double*);
double hypot(double, double);

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
#ifndef M_E
#define M_E 2.7182818284590452354
#endif
#ifndef HUGE_VAL
#define HUGE_VAL (1.0e+308)
#endif


#ifdef __cplusplus
}
#endif
#endif /* __AVC_COMPAT_MATH_H */
