// @desc 快速排序（堆数组 int* a = new int[n]）：验证"运行期长度数组"的可视化
// 输入：n，随后 n 个整数
// 例：5 / 42 32 5 1 1  ->  1 1 5 32 42
#include <iostream>

// 快速排序（原地排序，升序）
// 参数：a 为数组，left/right 为当前处理区间的下标
void quickSort(int a[], int left, int right) {
    if (left >= right) return;              // 区间内不足 2 个元素，已有序

    int i = left, j = right;
    int pivot = a[(left + right) / 2];      // 取中间元素为基准

    while (i <= j) {
        while (a[i] < pivot) ++i;           // 从左找 >= pivot 的元素
        while (a[j] > pivot) --j;           // 从右找 <= pivot 的元素
        if (i <= j) {
            int t = a[i];
            a[i] = a[j];
            a[j] = t;
            ++i;
            --j;
        }
    }

    // 此时 [left, j] 都 <= pivot，[i, right] 都 >= pivot
    quickSort(a, left, j);
    quickSort(a, i, right);
}

int main() {
    int n;
    std::cout << "输入元素个数: ";
    if (!(std::cin >> n) || n <= 0) {
        std::cout << "输入无效" << std::endl;
        return 0;
    }

    int* a = new int[n];                    // 不用 vector，手动申请内存
    std::cout << "输入 " << n << " 个整数: ";
    for (int i = 0; i < n; ++i) std::cin >> a[i];

    quickSort(a, 0, n - 1);

    std::cout << "排序结果: ";
    for (int i = 0; i < n; ++i) {
        if (i) std::cout << ' ';
        std::cout << a[i];
    }
    std::cout << std::endl;

    delete[] a;                             // 释放内存
    return 0;
}
