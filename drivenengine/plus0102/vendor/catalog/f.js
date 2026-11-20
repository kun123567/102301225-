/** 算法包 F · 字符串、栈与有向无环图应用（7 项 × 3 变体 = 21 个演示） */
export const PKG_F = {
  id: 'F',
  name: '串、栈与 DAG 应用',
  doc: 'docs/team/final/tasks/f-string-stack-dag.md',
  title: '字符串、栈与有向无环图应用',
  items: [
    {
      id: 'bracket-matching', title: '括号匹配', points: 1,
      ds: ['stack', 'string'], style: 7,
      focus: '当前下标与字符、栈内容、错配位置、结束时剩余左括号',
      events: ['init', 'scan', 'push', 'match-pop', 'mismatch', 'extra-close', 'leftover', 'ok', 'done'],
      path: 'algorithms/f/bracket-matching.js',
      variants: [
        { id: 'v1', name: '栈匹配三类括号', note: '左括号入栈，右括号核对栈顶后弹栈；遇错配立即定位下标' },
        { id: 'v2', name: '深度计数版（单类型）', note: '只用计数器处理同一种括号，展示"单类型不需要栈"以及为何无法扩展' },
        { id: 'v3', name: '栈 + 位置栈', note: '栈里同时记录字符与下标，报错时给出最近未匹配左括号的精确位置' },
      ],
    },
    {
      id: 'infix-to-postfix', title: '中缀转后缀', points: 2,
      ds: ['stack', 'string'], style: 7,
      focus: '当前词元、运算符栈、输出序列、括号与结合性处理',
      events: ['init', 'token', 'operand-out', 'push-op', 'pop-op', 'paren-open', 'paren-close', 'error', 'done'],
      path: 'algorithms/f/infix-to-postfix.js',
      variants: [
        { id: 'v1', name: '调度场（运算符栈）', note: '操作数直接输出；运算符按优先级弹栈后再入栈；右括号弹到左括号' },
        { id: 'v2', name: '优先级表驱动', note: '用 icp（栈内）/ isp（栈外）优先级表查表决定入栈还是弹出，便于扩展运算符' },
        { id: 'v3', name: '从右向左求前缀再反转', note: '反向扫描得到前缀表达式再整体反转，得到后缀，展示等价性' },
      ],
    },
    {
      id: 'expression-evaluation', title: '表达式求值', points: 2,
      ds: ['stack'], style: 7,
      focus: '操作数栈、弹出左右值、运算与结果压回、除零与栈下溢',
      events: ['init', 'push-operand', 'pop-right', 'pop-left', 'compute', 'push-result', 'error', 'done'],
      path: 'algorithms/f/expression-evaluation.js',
      variants: [
        { id: 'v1', name: '后缀表达式求值', note: '数字入栈；运算符先弹右值再弹左值，算出结果压回；结束时栈中恰有一个值' },
        { id: 'v2', name: '双栈中缀直接求值', note: '操作数栈 + 运算符栈边走边算，不需要先转后缀' },
        { id: 'v3', name: '递归下降解析求值', note: 'expr → term → factor 三层递归，展示语法树式求值顺序与结合性' },
      ],
    },
    {
      id: 'naive-string-match', title: '朴素模式匹配', points: 1,
      ds: ['string'], style: 1,
      focus: '对齐起点、主串下标、模式下标、失配位置与下次起点',
      events: ['init', 'align', 'compare', 'mismatch', 'shift', 'hit', 'done'],
      path: 'algorithms/f/naive-string-match.js',
      variants: [
        { id: 'v1', name: '双层循环', note: '外层枚举起点，内层逐字符比较；失配则起点加一（无信息复用）' },
        { id: 'v2', name: '提前剪枝版', note: '起点最多到 n-m，比较前先消除长度不足的无效起点' },
        { id: 'v3', name: '全量匹配版', note: '记录所有（可重叠）匹配起点，返回下标列表，用于与 KMP 对照结果一致' },
      ],
    },
    {
      id: 'kmp', title: 'KMP', points: 2,
      ds: ['string'], style: 1,
      focus: '预处理表（next / nextval）、比较位置、失配回退、匹配起点、重叠匹配',
      events: ['init', 'build-table', 'table-value', 'compare', 'mismatch', 'fallback', 'hit', 'done'],
      path: 'algorithms/f/kmp.js',
      variants: [
        { id: 'v1', name: 'next 前缀长度表', note: '构建最长相等真前后缀长度表；失配时模式下标回退到 next[j-1]（不回溯主串）' },
        { id: 'v2', name: 'nextval 优化版', note: '在 next 基础上跳过"回退后仍相同"的位置，同一次用例对照两种跳转' },
        { id: 'v3', name: '自动机（DFA）版', note: '把模式编译成状态转移表，主串指针只前进，展示 O(n) 与空间换时间' },
      ],
    },
    {
      id: 'expression-dag', title: '表达式有向无环图', points: 3,
      ds: ['graph', 'linkedlist'], style: 10,
      focus: '公共子表达式共享、依赖边、求值顺序、缓存命中、无效依赖',
      events: ['init', 'new-node', 'reuse-node', 'add-edge', 'topo', 'evaluate', 'cache-hit', 'error', 'done'],
      path: 'algorithms/f/expression-dag.js',
      variants: [
        { id: 'v1', name: '哈希表去重（CSE）', note: '(op, 左id, 右id) 作键查表；已存在则复用节点，实现公共子表达式共享' },
        { id: 'v2', name: '递归下降 + 记忆化', note: '直接对语法树递归求值，用 map 记忆 (op,左,右) 结果，命中即复用' },
        { id: 'v3', name: '后缀式栈式建 DAG', note: '扫描后缀表达式，用栈取操作数建节点，建节点前先查重，最后按逆后序求值' },
      ],
    },
    {
      id: 'critical-path', title: '关键路径', points: 2,
      ds: ['graph', 'grid2d'], style: 10,
      focus: '拓扑序、最早时间 ve、最迟时间 vl、时差、关键边、多条关键路径',
      events: ['init', 'topo', 've', 'reverse-topo', 'vl', 'slack', 'critical-edge', 'cycle', 'done'],
      path: 'algorithms/f/critical-path.js',
      variants: [
        { id: 'v1', name: '拓扑序 ve + 逆拓扑 vl', note: '正序求最早发生时间，逆序求最迟发生时间，时差为 0 的活动即关键活动' },
        { id: 'v2', name: 'DFS 记忆化最长路', note: '记忆化求每个事件的最长前驱路径长度作为 ve，再反推 vl' },
        { id: 'v3', name: 'AOE 表 + 关键路径枚举', note: '输出活动表并枚举所有时差为 0 的路径（多条关键路径都要列出）' },
      ],
    },
  ],
};
