/**
 * dsCatalog.js -- 数据结构目录（M5）
 *
 * 26 条模板 = DB 的 25 条 data_structures + 并查集拆分（PLAN §10）。
 * 一级分组按**逻辑结构**：线性 10 / 树形 11 / 图形 3 / 集合 2。
 * 每条的 5 个字段见 PLAN §10.5：logical / cTypes / renderer / dumpFamily / variants。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  const S = (id, zh, cTypes, logical, renderer, dumpFamily, variants, note) =>
    ({ id, zh, cTypes, logical, renderer, dumpFamily, variants: variants || [], note: note || '' });

  const ITEMS = [
    /* ① 线性（一对一） */
    S('sqlist', '线性表', ['SqList', 'LStr'], 'linear', 'linkView', 'A', ['list', 'array'], '顺序/链式皆有'),
    S('sqstack', '顺序栈', ['SqStack'], 'linear', 'dsStack', 'E', ['array'], 'top 指针高亮'),
    S('linkqueue', '链队列', ['LinkQueue', 'NLinkList'], 'linear', 'linkView', 'A'),
    S('sqqueue', '循环队列', ['SqQueue', 'CTagQueue', 'CLenQueue'], 'linear', 'linkView', 'A', ['list', 'array'], '或按数组环看待'),
    S('sstr', '短字符串', ['SStr'], 'linear', 'arrayView', 'E', ['string']),
    S('poly', '一元稀疏多项式', ['PolyStruct', 'Poly'], 'linear', 'linkView', 'A', [], 'coef/exp 作键'),
    S('idxlist', '索引表', ['IdxList'], 'linear', 'linkView', 'A'),
    S('skiplist', '跳跃表', ['SkipList'], 'linear', 'treeView', 'B', ['list', 'tree'], '逻辑线性 / 渲染树'),
    S('glist', '广义表', ['GList'], 'linear', 'linkView', 'B', [], 'hp/tp 双指针，可嵌套'),
    S('sparsematrix', '稀疏矩阵十字链表', [], 'linear', 'linkView', 'B', ['cross', 'matrix'], '两种画法：十字链 / 稀疏矩阵'),

    /* ② 树形（一对多） */
    S('trifurcate', '三叉链表', [], 'tree', 'treeView', 'C', [], 'DB 无类型名，需手工指定'),
    S('ptree', '双亲树', ['PTree'], 'tree', 'treeView', 'E', [], 'parent[] 数组'),
    S('ctree', '孩子树', ['CTree'], 'tree', 'treeView', 'D'),
    S('bithrtree', '线索二叉树', ['BiThrTree'], 'tree', 'treeView', 'C', [], 'ltag/rtag'),
    S('btree', 'B- 树', ['BTree'], 'tree', 'treeView', 'D', [], 'ptr[]+key[]'),
    S('bptree', 'B+ 树', ['BpTree'], 'tree', 'treeView', 'D'),
    S('rbtree', '红黑树', ['RBTree'], 'tree', 'treeView', 'C', [], 'color 角标'),
    S('heap', '堆', ['Heap'], 'tree', 'dsHeap', 'E', ['array', 'tree'], '逻辑=完全二叉树，存储=数组'),
    S('hufftree', '堆-赫夫曼树', ['HFTree', 'HFTNode', 'Heap'], 'tree', 'dsHeap', 'E', ['array', 'tree']),
    S('trie', 'Trie 树', ['TrieNode', 'TrieTree'], 'tree', 'treeView', 'D'),
    S('dltree', '双链树', ['DLTree', 'DLTNode'], 'tree', 'linkView', 'B', ['list', 'tree'], 'firstchild/nextsibling'),

    /* ③ 图形（多对多） */
    S('algraph', '邻接表', ['ALGraph'], 'graph', 'treeView', 'F', ['tree', 'list'], '顶点→边两级'),
    S('mgraph', '邻接矩阵', ['MGraph', 'MG'], 'graph', 'arrayView', 'E', ['matrix', 'tree']),
    S('olgraph', '图十字链表', ['OLGraph'], 'graph', 'treeView', 'B', [], 'firstin/firstout'),

    /* ④ 集合（松散关系） */
    S('hashtab', '哈希表', ['OpenHashTab', 'ChainHashTab', 'ChainHT', 'OpenHT'], 'set', 'linkView', 'F', ['list', 'array']),
    S('ufset', '并查集', ['UFSet'], 'set', 'treeView', 'E', ['forest'], '等价类划分（由双亲树条目拆出）'),
  ];

  /* 不在 26 项内的通用原型 */
  const PROTOS = [
    S('proto-list', '单链表（原型）', [], 'linear', 'linkView', 'A'),
    S('proto-dlist', '双向链表（原型）', [], 'linear', 'linkView', 'B'),
    S('proto-bitree', '普通二叉树（原型）', [], 'tree', 'treeView', 'C'),
    S('proto-seq', '顺序表（原型）', [], 'linear', 'arrayView', 'E'),
  ];

  const GROUPS = [
    { key: 'linear', name: '线性结构（一对一）', items: ITEMS.filter(x => x.logical === 'linear') },
    { key: 'tree', name: '树形结构（一对多）', items: ITEMS.filter(x => x.logical === 'tree') },
    { key: 'graph', name: '图形结构（多对多）', items: ITEMS.filter(x => x.logical === 'graph') },
    { key: 'set', name: '集合结构（松散关系）', items: ITEMS.filter(x => x.logical === 'set') },
  ];

  /** 按 C 类型名反查模板（自动识别用） */
  function findByCType(typeName) {
    if (!typeName) return null;
    const t = String(typeName).replace(/\b(struct|union)\s+/g, '').trim();
    return ITEMS.find(x => x.cTypes.some(c => c.toLowerCase() === t.toLowerCase())) || null;
  }
  function byId(id) { return ITEMS.find(x => x.id === id) || null; }
  function byLogical(k) { return ITEMS.filter(x => x.logical === k); }

  /* 「工具→数据结构」可插入的类型定义源码（节选，演示用） */
  const TYPE_SRC = {
    SqList: 'typedef struct {\n    ElemType elem[MAXSIZE];\n    int length;\n} SqList;\n',
    SqStack: 'typedef struct {\n    ElemType stack[MAXSIZE];\n    int top;\n} SqStack;\n',
    LinkQueue: 'typedef struct QNode {\n    ElemType data;\n    struct QNode *next;\n} QNode, *QueuePtr;\n\ntypedef struct {\n    QueuePtr front, rear;\n} LinkQueue;\n',
    BiTree: 'typedef struct BiTNode {\n    ElemType data;\n    struct BiTNode *lchild, *rchild;\n} BiTNode, *BiTree;\n',
    ALGraph: 'typedef struct ArcNode {\n    int adjvex;\n    struct ArcNode *nextarc;\n} ArcNode;\n\ntypedef struct VNode {\n    VertexType data;\n    ArcNode *firstarc;\n} VNode, AdjList[MAXVEX];\n\ntypedef struct {\n    AdjList vertices;\n    int vexnum, arcnum;\n} ALGraph;\n',
    Heap: 'typedef struct {\n    ElemType elem[MAXSIZE];\n    int size;\n} Heap;\n',
  };

  AVC.dsCatalog = { ITEMS, PROTOS, GROUPS, TYPE_SRC, findByCType, byId, byLogical };
})(typeof window !== 'undefined' ? window : globalThis);
