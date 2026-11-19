/**
 * 算法包 A · 比较排序（7 项 × 3 变体 = 21 个演示）
 * 范围来源：docs/team/final/tasks/a-sorting-workbench.md
 *
 * 字段说明（其它包同构）：
 *   id/title/points   —— 任务单原条目与积分
 *   ds                —— 该算法用到的主数据结构族（决定默认样式）
 *   style             —— 默认面板渲染器（AnyviewC style 号）
 *   focus             —— 动画必须让观众看到的东西（动画验收线）
 *   events            —— 语义事件枚举（轨迹里只能出现这些 + 通用 init/done）
 *   variants          —— 3 个代表性且彼此不同的实现，同一入口内可切换
 *   path              —— 实现模块（相对 src/）
 */
export const PKG_A = {
  id: 'A',
  name: '比较排序',
  doc: 'docs/team/final/tasks/a-sorting-workbench.md',
  title: '比较排序',
  items: [
    {
      id: 'insertion-sort', title: '直接插入排序', points: 1,
      ds: ['sqlist'], style: 1,
      focus: '待插入值（暂存）、已排序前缀、右移搬移、落位空位',
      events: ['init', 'pick', 'compare', 'shift', 'place', 'pass-end', 'done', 'swap' ],
      path: 'algorithms/a/insertion-sort.js',
      variants: [
        { id: 'v1', name: '教材右移版', note: '保存 a[i] 到 temp，从右往左把大于它的项右移，再把 temp 落位' },
        { id: 'v2', name: '哨兵版', note: 'a[0] 作哨兵存待插入值，省掉下标越界判断，从 a[i-1] 起比较' },
        { id: 'v3', name: '交换上浮版', note: '不搬移整段，改为相邻交换让元素一步步"冒"到正确位置' },
      ],
    },
    {
      id: 'binary-insertion-sort', title: '折半插入排序', points: 1,
      ds: ['sqlist'], style: 1,
      focus: '折半查找的 lo/hi/mid、确定插入位置、整段右移',
      events: ['init', 'pick', 'probe', 'narrow', 'shift', 'place', 'pass-end', 'done'],
      path: 'algorithms/a/binary-insertion-sort.js',
      variants: [
        { id: 'v1', name: '上界二分版', note: '在有序前缀找第一个严格大于 temp 的位置（upper bound），保证稳定' },
        { id: 'v2', name: '下界二分版', note: '找第一个不小于 temp 的位置（lower bound），相等元素插在已有相等元素之前' },
        { id: 'v3', name: '哨兵折半版', note: 'a[0] 作哨兵，折半区间基于 a[1..i-1]，搬移时同样带上哨兵位' },
      ],
    },
    {
      id: 'shell-sort', title: '希尔排序', points: 2,
      ds: ['sqlist'], style: 1,
      focus: 'gap 变化、同组下标、组内比较与移动、最后一轮 gap=1',
      events: ['init', 'gap', 'group', 'compare', 'shift', 'place', 'gap-end', 'done'],
      path: 'algorithms/a/shell-sort.js',
      variants: [
        { id: 'v1', name: '折半增量 n/2', note: 'gap = n/2, n/4, … ,1，组内做直接插入' },
        { id: 'v2', name: 'Knuth 序列 3h+1', note: 'gap 取 1,4,13,40… 中不超过 n 的最大值后回退，理论比较次数更少' },
        { id: 'v3', name: 'Hibbard 序列 2^k-1', note: 'gap 取 1,3,7,15…，相邻增量互质以减少重复比较' },
      ],
    },
    {
      id: 'quick-sort', title: '快速排序', points: 2,
      ds: ['sqlist', 'stack'], style: 1,
      focus: '枢轴值、扫描位置、分区边界、待处理区间（递归栈）',
      events: ['init', 'pivot', 'compare', 'swap', 'partition-end', 'push', 'pop', 'done'],
      path: 'algorithms/a/quick-sort.js',
      variants: [
        { id: 'v1', name: 'Lomuto 末元素枢轴', note: '单向扫描 + 分界指针 i，枢轴取区间末元素，最后一交换定枢轴位置' },
        { id: 'v2', name: 'Hoare 双指针', note: '左右指针向中间夹，交换逆序对，最后按 j 切分（不是末尾枢轴法）' },
        { id: 'v3', name: '三路划分版', note: '把区间分成 <pivot / =pivot / >pivot 三段，全相等输入一趟结束' },
      ],
    },
    {
      id: 'selection-sort', title: '简单选择排序', points: 1,
      ds: ['sqlist'], style: 1,
      focus: '已排序区、扫描位置、候选最小位置、每轮至多一次交换',
      events: ['init', 'candidate', 'compare', 'swap', 'pass-end', 'done'],
      path: 'algorithms/a/selection-sort.js',
      variants: [
        { id: 'v1', name: '标准单向后选择', note: '每轮从未排序区首项开始记候选最小，扫描完交换到区首' },
        { id: 'v2', name: '双向选择版', note: '一轮同时找最小与最大，分别放到两端，轮数减半' },
        { id: 'v3', name: '零自交换版', note: '记录最小下标，仅当 min≠i 时才交换，最小已在原位时不产生交换事件' },
      ],
    },
    {
      id: 'heap-sort', title: '堆排序', points: 2,
      ds: ['sqlist', 'heap'], style: 8,
      focus: '有效堆范围、父子比较、下沉路径、已排序后缀、堆性质检查',
      events: ['init', 'build', 'compare', 'swap', 'sift', 'shrink', 'done'],
      path: 'algorithms/a/heap-sort.js',
      variants: [
        { id: 'v1', name: '大根堆递归下沉', note: '从 n/2-1 倒序建堆，交换堆顶与有效区末项后递归下沉，升序输出' },
        { id: 'v2', name: '大根堆迭代下沉', note: '下沉改为 while 循环沿父子下标 2i+1/2i+2 走，不压调用栈' },
        { id: 'v3', name: '小根堆降序输出', note: '建小根堆，堆顶（最小值）换到末尾，得到降序序列，用于对照"堆性质与输出方向"' },
      ],
    },
    {
      id: 'merge-sort', title: '归并排序', points: 2,
      ds: ['sqlist', 'stack'], style: 1,
      focus: '拆分边界、两侧游标、临时数组内容、写回下标、递归栈',
      events: ['init', 'split', 'compare', 'take-left', 'take-right', 'write-back', 'merge-end', 'done'],
      path: 'algorithms/a/merge-sort.js',
      variants: [
        { id: 'v1', name: '递归二分 + 临时数组', note: '自顶向下拆成两半，双游标合并进临时区后写回原区间' },
        { id: 'v2', name: '自底向上迭代', note: '不递归：宽度 1,2,4… 逐趟两两归并，展示趟次与段对' },
        { id: 'v3', name: '原地插入式归并', note: '不用临时数组：右侧元素逐个向左插入到正确位置，展示搬移代价' },
      ],
    },
  ],
};
