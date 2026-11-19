/** 算法包 C · 多路归并、外部排序与多路查找树（5 项 × 3 变体 = 15 个演示） */
export const PKG_C = {
  id: 'C',
  name: '多路归并与多路查找树',
  doc: 'docs/team/final/tasks/c-external-multiway.md',
  title: '多路归并、外部排序与多路查找树',
  items: [
    {
      id: 'multiway-merge', title: '多路平衡归并', points: 3,
      ds: ['sqlist', 'queue'], style: 1,
      focus: '趟次、段号、各段游标、候选首项、输出段',
      events: ['init', 'pass', 'cursor', 'compare', 'emit', 'round-end', 'done'],
      path: 'algorithms/c/multiway-merge.js',
      variants: [
        { id: 'v1', name: '二路逐对归并', note: '每趟把相邻两段归并成一段，展示段数逐趟减半' },
        { id: 'v2', name: 'k 路一次归并', note: '每批取 k 段，每次在 k 个当前首项里线性挑最小输出' },
        { id: 'v3', name: '败者树版', note: '用败者树在 O(log k) 内选出最小首项，展示内部结点与冠军' },
      ],
    },
    {
      id: 'replacement-selection', title: '置换选择', points: 3,
      ds: ['heap'], style: 8,
      focus: '读入值、活动项、冻结项、当前段末值、段切换',
      events: ['init', 'read', 'emit-min', 'freeze', 'activate', 'new-run', 'done'],
      path: 'algorithms/c/replacement-selection.js',
      variants: [
        { id: 'v1', name: '教材活动/冻结版', note: '活动区取最小输出；新读入值小于段末值则冻结，活动区空时解冻开新段' },
        { id: 'v2', name: '最小堆维护活动区', note: '活动区用小根堆，取最小 O(log M)，冻结项先留在堆里打标记' },
        { id: 'v3', name: '大根堆生成逆序段', note: '改用大根堆生成递减的顺串，用于对照"段内有序方向"的取舍' },
      ],
    },
    {
      id: 'optimal-merge-tree', title: '最佳归并树', points: 2,
      ds: ['tree'], style: 9,
      focus: '候选权重、选中的两棵子树、父节点、累计代价（WPL）',
      events: ['init', 'pick-min-two', 'merge', 'push-back', 'cost', 'done'],
      path: 'algorithms/c/optimal-merge-tree.js',
      variants: [
        { id: 'v1', name: '两路 Huffman 式', note: '反复取两个最小权重合成父节点，累计 WPL 即总读写代价' },
        { id: 'v2', name: 'k 路 + 补零虚段', note: 'k 路归并时先补 (k-1-(n-1)%(k-1))%(k-1) 个零权虚段，保证每次都能取满 k 个' },
        { id: 'v3', name: '最小堆实现的归并树', note: '候选集合用最小堆，逐步弹出两个最小并回填，树形结构与代价同 v1 但取数过程可见' },
      ],
    },
    {
      id: 'b-tree', title: 'B 树', points: 3,
      ds: ['tree', 'memcell'], style: 9,
      focus: '比较路径、键数组、孩子链接、提升键、根分裂',
      events: ['init', 'descend', 'probe-key', 'insert-key', 'split', 'promote', 'new-root', 'duplicate', 'done'],
      path: 'algorithms/c/b-tree.js',
      variants: [
        { id: 'v1', name: '插入 + 事后分裂', note: '按区间下降到叶插入，溢出后向上分裂并把中键提升给父结点（可能直到根）' },
        { id: 'v2', name: '自顶向下预分裂', note: '下降途中遇到满孩子先分裂再进入，插入时叶必有空间（CLRS 版）' },
        { id: 'v3', name: '自底向上批量装载', note: '键先排序，按阶数把叶填满后逐层向上建索引，展示批量建树与逐条插入的结构差异' },
      ],
    },
    {
      id: 'b-plus-tree', title: 'B+ 树', points: 3,
      ds: ['tree', 'memcell'], style: 9,
      focus: '定位叶节点、分隔键（父键复制）、叶链、内结点分裂与根变化',
      events: ['init', 'descend', 'probe-key', 'insert-leaf', 'split-leaf', 'copy-up', 'split-inner', 'new-root', 'leaf-scan', 'done', 'duplicate' ],
      path: 'algorithms/c/b-plus-tree.js',
      variants: [
        { id: 'v1', name: '自底向上分裂 + 父键复制', note: '插入总有叶，叶溢出按 ceil(n/2) 分裂，右叶首键复制到父结点，内结点溢出递归上推' },
        { id: 'v2', name: '自顶向下预分裂', note: '下降途中分裂满结点，父键先复制好再进入目标孩子，插入时叶必不溢出' },
        { id: 'v3', name: '叶链范围查询版', note: '结构同 v1，但插入结束后做一次 [lo,hi] 区间扫描，验证叶链有序与串联关系' },
      ],
    },
  ],
};
