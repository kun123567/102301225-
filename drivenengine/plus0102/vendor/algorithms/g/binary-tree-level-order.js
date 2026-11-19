/**
 * G · 二叉树层序遍历（3 个代表性、彼此不同的实现）
 *
 * 三个版本输出的序列完全一样（层序是唯一的），差别在**怎么知道"一层结束"**：
 *   v1 单队列 + 层大小 —— 每轮先读 QueueLength 存进 size，for 只跑 size 次，天然就是一层；
 *   v2 双队列交替       —— 孩子一律进 next 队列，cur 一空就 swap(cur,next)，层号显式 +1；
 *   v3 带 null 哨兵版   —— 每层末尾压一个 NULL 当分隔符，出队撞到 NULL 就换层。
 *
 * 画面：主面板是树（style 9，节点上的 L1/L2 小标签 = 节点所在层），
 * 辅助面板是队列（style 3，队头 front / 队尾 rear 用文字指针标出）——v2 有两个队列面板。
 *
 * 契约（docs/04-轨迹契约.md）：每步都是完整快照；step.lineId 命中本变体自己的 sourceLines；
 * 最后一步 done=true 且 result 与样例 expect 深比较一致。
 */

import { trace, step, treeLayer, linkLayer } from '../../engine/model.js';
import { labelsOf } from '../_util.js';

export const meta = {
  id: 'g/binary-tree-level-order',
  variants: [
    { id: 'v1', name: '单队列 + 层大小', note: '出队前记录本层节点数，循环恰好处理一层，天然分层' },
    { id: 'v2', name: '双队列交替', note: 'cur/next 两队列交替，层结束即交换，层号显式递增' },
    { id: 'v3', name: '带 null 哨兵版', note: '每层后压入 null 作为分隔符，遇 null 即换层' },
  ],
};

/* ------------------------------------------------------------------ 样例树 */

/** 任务单指定的样例树：A 的左孩子 B、右孩子 C，B 的右孩子 D */
const SAMPLE_TREE = {
  nodes: [
    { id: 'A', label: 'A', left: 'B', right: 'C' },
    { id: 'B', label: 'B', right: 'D' },
    { id: 'C', label: 'C' },
    { id: 'D', label: 'D' },
  ],
  root: 'A',
};

export const samples = [
  {
    id: 'normal',
    label: '样例树 A(L:B, R:C) · B(R:D) → A,B,C,D（D 在第 3 层）',
    input: { tree: SAMPLE_TREE },
    expect: { order: ['A', 'B', 'C', 'D'], layers: [['A'], ['B', 'C'], ['D']] },
  },
  {
    id: 'edge-empty',
    label: '空树 {nodes:[], root:null} → 空序列、0 层',
    input: { tree: { nodes: [], root: null } },
    expect: { order: [], layers: [] },
  },
  {
    id: 'edge-single',
    label: '单节点树 A → [A]，只有一层',
    input: { tree: { nodes: [{ id: 'A', label: 'A' }], root: 'A' } },
    expect: { order: ['A'], layers: [['A']] },
  },
];

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'void LevelOrder(BiTree T) {' },
    { lineId: 'init', text: '  InitQueue(&Q);                        /* 空队列 */' },
    { lineId: 'enqroot', text: '  if (T) EnQueue(&Q, T);                 /* 根先进队，它一定是第 1 层 */' },
    { lineId: 'loop', text: '  while (!QueueEmpty(&Q)) {' },
    { lineId: 'size', text: '    int size = QueueLength(&Q);         /* 关键：先记下本层还有几个节点 */' },
    { lineId: 'for', text: '    while (size-- > 0) {                /* 只出队 size 次 —— 恰好一层 */' },
    { lineId: 'deq', text: '      BiTree p = DeQueue(&Q);' },
    { lineId: 'visit', text: '      visit(p);                         /* 出队时刻就是访问时刻 */' },
    { lineId: 'scan', text: '      /* p 的左右孩子都不是本层的人，排在队尾 = 下一层 */' },
    { lineId: 'enqL', text: '      if (p->lchild) EnQueue(&Q, p->lchild);   /* 先左 */' },
    { lineId: 'enqR', text: '      if (p->rchild) EnQueue(&Q, p->rchild);   /* 后右 */' },
    { lineId: 'forend', text: '    }   /* 队列里剩下的全是下一层节点 */' },
    { lineId: 'layerend', text: '    ++level;                            /* 换层（打印换行） */' },
    { lineId: 'loopend', text: '  }' },
    { lineId: 'ret', text: '}' },
  ],
  v2: [
    { lineId: 'fn', text: 'void LevelOrder_TwoQueues(BiTree T) {' },
    { lineId: 'init', text: '  InitQueue(&cur);  InitQueue(&nxt);      /* cur = 本层，nxt = 下一层 */' },
    { lineId: 'enqroot', text: '  if (T) EnQueue(&cur, T);' },
    { lineId: 'loop', text: '  while (!QueueEmpty(&cur)) {' },
    { lineId: 'deq', text: '    BiTree p = DeQueue(&cur);            /* 只从 cur 取，绝不从 nxt 取 */' },
    { lineId: 'visit', text: '    visit(p);' },
    { lineId: 'scan', text: '    /* p 的孩子不属于本层，直接塞进 nxt */' },
    { lineId: 'enqL', text: '    if (p->lchild) EnQueue(&nxt, p->lchild);' },
    { lineId: 'enqR', text: '    if (p->rchild) EnQueue(&nxt, p->rchild);' },
    { lineId: 'swap', text: '    if (QueueEmpty(&cur)) Swap(&cur, &nxt);  /* cur 空 = 本层走完，交换 */' },
    { lineId: 'layerend', text: '    ++level;                               /* 层号显式递增 */' },
    { lineId: 'loopend', text: '  }' },
    { lineId: 'ret', text: '}' },
  ],
  v3: [
    { lineId: 'fn', text: 'void LevelOrder_Sentinel(BiTree T) {' },
    { lineId: 'init', text: '  InitQueue(&Q);                          /* 空队列 */' },
    { lineId: 'enqroot', text: '  if (T) EnQueue(&Q, T);' },
    { lineId: 'sentinel1', text: '  if (T) EnQueue(&Q, NULL);               /* 第 1 层的结束哨兵 */' },
    { lineId: 'loop', text: '  while (!QueueEmpty(&Q)) {' },
    { lineId: 'deq', text: '    BiTree p = DeQueue(&Q);' },
    { lineId: 'isnull', text: '    if (p == NULL) {                     /* 撞到哨兵 = 一层结束 */' },
    { lineId: 'layerend', text: '      ++level;' },
    { lineId: 'relay', text: '      if (!QueueEmpty(&Q)) EnQueue(&Q, NULL);  /* 给下一层补哨兵 */' },
    { lineId: 'skip', text: '      continue;' },
    { lineId: 'endnull', text: '    }' },
    { lineId: 'visit', text: '    visit(p);' },
    { lineId: 'scan', text: '    /* 孩子排在哨兵后面 —— 所以它们天然属于下一层 */' },
    { lineId: 'enqL', text: '    if (p->lchild) EnQueue(&Q, p->lchild);' },
    { lineId: 'enqR', text: '    if (p->rchild) EnQueue(&Q, p->rchild);' },
    { lineId: 'loopend', text: '  }' },
    { lineId: 'ret', text: '}' },
  ],
};

/* ------------------------------------------------------------------ 小工具 */

/** 输入 → 受控的内部树结构（剪掉悬空引用 / 自环；重复 label 自动加 a/b 后缀） */
function buildTree(input) {
  const spec = (input && input.tree) || {};
  const list = Array.isArray(spec.nodes) ? spec.nodes.filter((n) => n && n.id != null) : [];
  const ids = list.map((n) => String(n.id));
  const labs = labelsOf(list.map((n, i) => (n.label != null && n.label !== '' ? n.label : ids[i])));
  const map = new Map();
  list.forEach((n, i) => {
    map.set(ids[i], {
      id: ids[i],
      label: String(labs[i]),
      left: n.left != null && n.left !== '' ? String(n.left) : null,
      right: n.right != null && n.right !== '' ? String(n.right) : null,
    });
  });
  for (const n of map.values()) {
    if (!n.left || !map.has(n.left) || n.left === n.id) n.left = null;
    if (!n.right || !map.has(n.right) || n.right === n.id) n.right = null;
  }
  const root = spec.root != null && map.has(String(spec.root)) ? String(spec.root) : (ids[0] ?? null);
  const edgeTags = {};
  for (const n of map.values()) {
    if (n.left) edgeTags[n.left] = 'L';
    if (n.right) edgeTags[n.right] = 'R';
  }
  return { map, root, ids, edgeTags };
}

/**
 * 面板工具：树面板（style 9）+ 队列面板（style 3）。
 * 每调用一次都新建 layer 对象 —— 快照必须独立（校验器会咬人）。
 */
function panelKit(t) {
  const lab = (id) => (id == null ? 'NULL' : (t.map.has(id) ? t.map.get(id).label : String(id)));

  // 静态层号（从根 BFS 一次算好，画成节点上的 L1/L2 小标签）
  const depthOf = new Map();
  if (t.root) {
    const q = [[t.root, 1]];
    while (q.length) {
      const [id, d] = q.shift();
      if (depthOf.has(id)) continue;
      depthOf.set(id, d);
      const n = t.map.get(id);
      if (n.left) q.push([n.left, d + 1]);
      if (n.right) q.push([n.right, d + 1]);
    }
  }

  const tree = (o = {}) => {
    const visited = o.visited || [];
    return treeLayer({
      id: 'main',
      title: 'BiTree',
      name: o.name || 'TiTree · 层序（按层从左到右）',
      roots: t.root ? [t.root] : [],
      nodes: t.ids.map((id) => {
        const n = t.map.get(id);
        const box = { id: n.id, label: n.label };
        if (n.left) box.left = n.left;
        if (n.right) box.right = n.right;
        const k = visited.indexOf(id);
        if (k >= 0) box.value = `第${k + 1}个`;
        const d = depthOf.get(id);
        if (d) box.badge = `L${d}`;
        return box;
      }),
      edgeTags: { ...t.edgeTags },
      threads: [],
      roles: o.roles || {},
    });
  };

  const queue = (o = {}) => {
    const items = o.items || [];
    const pointers = [];
    if (items.length) {
      pointers.push({ id: `${o.id}-front`, label: 'front', node: items[0].key });
      if (items.length > 1) pointers.push({ id: `${o.id}-rear`, label: 'rear', node: items[items.length - 1].key });
    }
    return linkLayer({
      id: o.id,
      title: o.title || '队列',
      name: o.name || '',
      nodes: items.map((it) => ({ id: it.key, value: it.label, label: it.label, badge: it.badge })),
      links: items.slice(0, -1).map((it, i) => ({ from: it.key, to: items[i + 1].key })),
      head: items.length ? items[0].key : null,
      order: items.map((it) => it.key),
      roles: { ...(o.roles || {}), pointers },
    });
  };

  return { lab, tree, queue, depthOf };
}

/* ------------------------------------------------------------------ 变体 1：单队列 + 层大小 */

function runV1(input) {
  const t = buildTree(input);
  const L = LINES.v1;
  const steps = [];
  const kit = panelKit(t);
  const lab = kit.lab;
  const order = [];   // 访问顺序
  const levels = [];  // 已完成的层（每层是 id 数组）
  const queue = [];   // [{key,id}]：队头 = 下一个出队
  let levelNo = 1;
  let size = 0;       // 本层节点数（循环前记下的 QueueLength）
  let seq = 0;

  const vars = (extra = {}) => ({
    n: t.ids.length,
    层号: t.root ? levelNo : '—',
    本层大小: size || '—',
    队列: queue.length ? queue.map((it) => lab(it.id)).join(' → ') : '（空）',
    已访问: order.length,
    输出: order.length ? order.map(lab).join(' → ') : '（空）',
    每层: levels.length ? levels.map((lv) => `[${lv.map(lab).join('')}]`).join(' ') : '（空）',
    ...extra,
  });

  const panels = (o = {}) => [
    kit.tree({ visited: [...order], name: 'TiTree · 层序（单队列 + 层大小）', roles: o.roles || {} }),
    kit.queue({
      id: 'Q',
      title: `队列 Q · 第 ${t.root ? levelNo : 1} 层进行中`,
      name: 'Queue Q（front = 下一个出队）',
      items: queue.map((it) => ({ key: it.key, label: lab(it.id), badge: `L${kit.depthOf.get(it.id) || '?'}` })),
      roles: o.queueRoles || {},
    }),
  ];

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: t.root
      ? `层序 = 逐层、从左到右。单队列技巧：每轮开头先读一次 QueueLength 存进 size，然后只出队 size 次——这恰好就是一层，不需要任何分隔符。`
      : '空树：队列一开始就是空的，while 一次都不进，一层也遍历不到。',
    vars: vars(),
    layers: panels(),
  }));

  if (!t.root) {
    const result = { order: [], layers: [] };
    steps.push(step({
      event: 'done',
      lineId: 'ret',
      done: true,
      result,
      note: '空树：order 与 layers 都是空的，直接结束。',
      vars: { n: 0, 层号: '—', 已访问: 0, 输出: '（空）', 每层: '（空）' },
      layers: panels({ roles: { done: [] } }),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v1', sourceVersion: 'bt-levelorder-size-v1', lines: L, steps, result, meta: { layers: 0 } });
  }

  queue.push({ key: `k${seq++}`, id: t.root });
  steps.push(step({
    event: 'enqueue',
    lineId: 'enqroot',
    note: `根 ${lab(t.root)} 先入队：它是第 1 层唯一的人，也必然是第一个出队的。`,
    vars: vars(),
    layers: panels({ roles: { focus1: [t.root] }, queueRoles: { focus1: [queue[0].key] } }),
  }));

  while (queue.length) {
    size = queue.length; // 本层节点数
    const cur = [];
    for (let i = 0; i < size; i++) {
      const it = queue.shift();
      const n = t.map.get(it.id);

      steps.push(step({
        event: 'dequeue',
        lineId: 'deq',
        note: `出队 ${n.label}：本层 size = ${size}（循环前就记好了），这是本层第 ${i + 1} 个、还剩 ${size - i - 1} 个同层节点——for 只跑 size 次，所以下一层的节点一个也不会被本轮碰上。`,
        vars: vars(),
        layers: panels({
          roles: { focus1: [it.id], done: [...order] },
          queueRoles: {},
        }),
      }));

      order.push(it.id);
      cur.push(it.id);
      steps.push(step({
        event: 'visit',
        lineId: 'visit',
        note: `访问 ${n.label}（总第 ${order.length} 个，第 ${levelNo} 层）：层序的访问时刻就是出队时刻，所以同层一定是"先入队者先访问"= 从左到右。`,
        vars: vars(),
        layers: panels({ roles: { focus1: [it.id], done: [...order] } }),
      }));

      const kids = [n.left, n.right].filter(Boolean);
      if (kids.length) {
        steps.push(step({
          event: 'enqueue-children',
          lineId: 'scan',
          note: `${n.label} 的孩子：${n.left ? `左 ${lab(n.left)}` : '左空'}、${n.right ? `右 ${lab(n.right)}` : '右空'}。它们不属于本层，只能排到队尾——于是队尾依次是"下一层从左到右"。`,
          vars: vars(),
          layers: panels({ roles: { focus2: [it.id], added: kids } }),
        }));

        if (n.left) {
          queue.push({ key: `k${seq++}`, id: n.left });
          const added = queue[queue.length - 1];
          steps.push(step({
            event: 'enqueue',
            lineId: 'enqL',
            note: `左孩子 ${lab(n.left)} 入队（先左）。按"先左后右"入队，下一层出队时就还是从左到右。`,
            vars: vars(),
            layers: panels({
              roles: { focus1: [n.left], focus2: [it.id] },
              queueRoles: { added: [added.key], focus1: [added.key] },
            }),
          }));
        }
        if (n.right) {
          queue.push({ key: `k${seq++}`, id: n.right });
          const added = queue[queue.length - 1];
          steps.push(step({
            event: 'enqueue',
            lineId: 'enqR',
            note: `右孩子 ${lab(n.right)} 入队（后右）：它会排在同层的左孩子后面出队，所以同一层内部顺序是左 → 右。`,
            vars: vars(),
            layers: panels({
              roles: { focus1: [n.right], focus2: [it.id] },
              queueRoles: { added: [added.key], focus1: [added.key] },
            }),
          }));
        }
      }
    }

    levels.push(cur); // 本层已经走完，先记进 layers，下面这一步才看得见它
    steps.push(step({
      event: 'layer-end',
      lineId: 'layerend',
      note: `第 ${levelNo} 层收工：${cur.map(lab).join(', ')}（${cur.length} 个，与循环前记下的 size = ${size} 一致）。此刻队列里剩下的 ${queue.length} 个节点全是下一层的，层号 +1 继续。`,
      vars: vars(),
      layers: panels({ roles: { done: [...order] } }),
    }));
    levelNo++;
  }

  const result = { order: order.map(lab), layers: levels.map((lv) => lv.map(lab)) };
  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: `层序完成：${result.order.join(', ')}，共 ${result.layers.length} 层（${result.layers.map((lv) => `[${lv.join('')}]`).join(' ')}）。全程只用了 size 这一个整数来分层。`,
    vars: { n: t.ids.length, 层号: '—', 本层大小: '—', 队列: '（空）', 已访问: order.length, 输出: result.order.join(' → '), 每层: result.layers.map((lv) => `[${lv.join('')}]`).join(' ') },
    layers: panels({ roles: { done: [...order] } }),
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v1',
    sourceVersion: 'bt-levelorder-size-v1',
    lines: L,
    steps,
    result,
    meta: { levels: result.layers.length },
  });
}

/* ------------------------------------------------------------------ 变体 2：双队列交替 */

function runV2(input) {
  const t = buildTree(input);
  const L = LINES.v2;
  const steps = [];
  const kit = panelKit(t);
  const lab = kit.lab;
  const order = [];
  const levels = [];
  let cur = [];   // 当前层队列
  let nxt = [];   // 下一层队列
  let level = []; // 当前层已访问的节点
  let levelNo = 1;
  let took = 0;   // 本层已出队个数
  let seq = 0;

  const itemsOf = (it) => ({ key: it.key, label: lab(it.id), badge: `L${kit.depthOf.get(it.id) || '?'}` });

  const vars = (extra = {}) => ({
    n: t.ids.length,
    层号: t.root ? levelNo : '—',
    本层已出队: took,
    cur: cur.length ? cur.map((it) => lab(it.id)).join(' → ') : '（空）',
    next: nxt.length ? nxt.map((it) => lab(it.id)).join(' → ') : '（空）',
    已访问: order.length,
    输出: order.length ? order.map(lab).join(' → ') : '（空）',
    每层: levels.length ? levels.map((lv) => `[${lv.map(lab).join('')}]`).join(' ') : '（空）',
    ...extra,
  });

  const panels = (o = {}) => [
    kit.tree({ visited: [...order], name: 'TiTree · 层序（cur / next 双队列交替）', roles: o.roles || {} }),
    kit.queue({
      id: 'cur',
      title: `cur（第 ${t.root ? levelNo : 1} 层）`,
      name: 'Queue cur = 当前层，只从它出队',
      items: cur.map(itemsOf),
      roles: o.curRoles || {},
    }),
    kit.queue({
      id: 'nxt',
      title: 'next（下一层）',
      name: 'Queue next = 下一层，本层节点一个都不许进它',
      items: nxt.map(itemsOf),
      roles: o.nxtRoles || {},
    }),
  ];

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: t.root
      ? '双队列版：cur 装"正在处理的这一层"，next 装"下一层"。只要 cur 里还有人就继续出队，孩子一律进 next——所以 cur 空了就意味着本层真的走完了，交换即可换层。'
      : '空树：cur 一开始就空，while 一次都不进。',
    vars: vars(),
    layers: panels(),
  }));

  if (!t.root) {
    const result = { order: [], layers: [] };
    steps.push(step({
      event: 'done',
      lineId: 'ret',
      done: true,
      result,
      note: '空树：order 与 layers 都是空的，直接结束。',
      vars: { n: 0, 层号: '—', 已访问: 0, 输出: '（空）', 每层: '（空）' },
      layers: panels(),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v2', sourceVersion: 'bt-levelorder-twoqueue-v1', lines: L, steps, result, meta: { levels: 0 } });
  }

  cur.push({ key: `k${seq++}`, id: t.root });
  steps.push(step({
    event: 'enqueue',
    lineId: 'enqroot',
    note: `根 ${lab(t.root)} 进 cur：第 1 层只有它。next 还是空的。`,
    vars: vars(),
    layers: panels({ roles: { focus1: [t.root] }, curRoles: { focus1: [cur[0].key] } }),
  }));

  while (cur.length) {
    const it = cur.shift();
    const n = t.map.get(it.id);
    took++;

    steps.push(step({
      event: 'dequeue',
      lineId: 'deq',
      note: `从 cur 出队 ${n.label}（本层第 ${took} 个）。next 面板里的 ${nxt.length} 个节点已经是下一层的了——两个队列各管一层，物理上不会混。`,
      vars: vars(),
      layers: panels({ roles: { focus1: [it.id], done: [...order] } }),
    }));

    order.push(it.id);
    level.push(it.id);
    steps.push(step({
      event: 'visit',
      lineId: 'visit',
      note: `访问 ${n.label}（总第 ${order.length} 个，第 ${levelNo} 层）：层号不需要靠分隔符猜，它由"这是第几次 swap"直接决定。`,
      vars: vars(),
      layers: panels({ roles: { focus1: [it.id], done: [...order] } }),
    }));

    const kids = [n.left, n.right].filter(Boolean);
    if (kids.length) {
      steps.push(step({
        event: 'enqueue-children',
        lineId: 'scan',
        note: `${n.label} 的孩子：${n.left ? `左 ${lab(n.left)}` : '左空'}、${n.right ? `右 ${lab(n.right)}` : '右空'}。注意它们去的是 next，而不是当前的 cur——这就是"双队列"与"单队列"最大的差别。`,
        vars: vars(),
        layers: panels({ roles: { focus2: [it.id], added: kids } }),
      }));

      if (n.left) {
        nxt.push({ key: `k${seq++}`, id: n.left });
        const added = nxt[nxt.length - 1];
        steps.push(step({
          event: 'enqueue',
          lineId: 'enqL',
          note: `左孩子 ${lab(n.left)} 进 next（先左）。`,
          vars: vars(),
          layers: panels({ roles: { focus1: [n.left], focus2: [it.id] }, nxtRoles: { added: [added.key], focus1: [added.key] } }),
        }));
      }
      if (n.right) {
        nxt.push({ key: `k${seq++}`, id: n.right });
        const added = nxt[nxt.length - 1];
        steps.push(step({
          event: 'enqueue',
          lineId: 'enqR',
          note: `右孩子 ${lab(n.right)} 进 next（后右）：next 里的顺序就是下一层的访问顺序。`,
          vars: vars(),
          layers: panels({ roles: { focus1: [n.right], focus2: [it.id] }, nxtRoles: { added: [added.key], focus1: [added.key] } }),
        }));
      }
    }

    if (!cur.length) {
      levels.push(level); // 本层走完，先记进 layers 再换层
      steps.push(step({
        event: 'layer-end',
        lineId: 'swap',
        note: `cur 已空 → 第 ${levelNo} 层结束：${level.map(lab).join(', ')}（${level.length} 个）。马上 swap(&cur, &next)：next 里那 ${nxt.length} 个节点成为新的当前层，层号 +1。`,
        vars: vars(),
        layers: panels({ roles: { done: [...order] } }),
      }));

      level = [];
      took = 0;
      levelNo++;
      const tmp = cur;
      cur = nxt;
      nxt = tmp;
      nxt.length = 0;
    }
  }

  const result = { order: order.map(lab), layers: levels.map((lv) => lv.map(lab)) };
  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: `层序完成：${result.order.join(', ')}，共 ${result.layers.length} 层（${result.layers.map((lv) => `[${lv.join('')}]`).join(' ')}）。分层靠"两个队列 + 一次 swap"，没有任何分隔标记。`,
    vars: { n: t.ids.length, 层号: '—', 本层已出队: 0, cur: '（空）', next: '（空）', 已访问: order.length, 输出: result.order.join(' → '), 每层: result.layers.map((lv) => `[${lv.join('')}]`).join(' ') },
    layers: panels({ roles: { done: [...order] } }),
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v2',
    sourceVersion: 'bt-levelorder-twoqueue-v1',
    lines: L,
    steps,
    result,
    meta: { levels: result.layers.length },
  });
}

/* ------------------------------------------------------------------ 变体 3：null 哨兵 */

function runV3(input) {
  const t = buildTree(input);
  const L = LINES.v3;
  const steps = [];
  const kit = panelKit(t);
  const lab = kit.lab;
  const order = [];
  const levels = [];
  const queue = []; // [{key,id|null}]，id == null 表示哨兵
  let level = [];
  let levelNo = 1;
  let seq = 0;
  let sentinels = 0;

  const itemsOf = (it) => (it.id == null
    ? { key: it.key, label: 'NULL', badge: '层分隔' }
    : { key: it.key, label: lab(it.id), badge: `L${kit.depthOf.get(it.id) || '?'}` });

  const vars = (extra = {}) => ({
    n: t.ids.length,
    层号: t.root ? levelNo : '—',
    队列: queue.length ? queue.map((it) => (it.id == null ? 'NULL' : lab(it.id))).join(' → ') : '（空）',
    哨兵数: sentinels,
    已访问: order.length,
    输出: order.length ? order.map(lab).join(' → ') : '（空）',
    每层: levels.length ? levels.map((lv) => `[${lv.map(lab).join('')}]`).join(' ') : '（空）',
    ...extra,
  });

  const panels = (o = {}) => [
    kit.tree({ visited: [...order], name: 'TiTree · 层序（NULL 哨兵分隔）', roles: o.roles || {} }),
    kit.queue({
      id: 'Q',
      title: `队列 Q · 第 ${t.root ? levelNo : 1} 层进行中`,
      name: 'Queue Q（NULL = 本层结束的哨兵）',
      items: queue.map(itemsOf),
      roles: o.queueRoles || {},
    }),
  ];

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: t.root
      ? '哨兵版：不数 size、也不开第二个队列，而是在每层末尾压一个 NULL 当"墙"。出队撞到 NULL 就说明上一层的节点全部处理完了。'
      : '空树：队列空，while 一次都不进。',
    vars: vars(),
    layers: panels(),
  }));

  if (!t.root) {
    const result = { order: [], layers: [] };
    steps.push(step({
      event: 'done',
      lineId: 'ret',
      done: true,
      result,
      note: '空树：order 与 layers 都是空的，直接结束。',
      vars: { n: 0, 层号: '—', 已访问: 0, 输出: '（空）', 每层: '（空）' },
      layers: panels(),
    }));
    return trace({ algorithmId: meta.id, variantId: 'v3', sourceVersion: 'bt-levelorder-sentinel-v1', lines: L, steps, result, meta: { levels: 0 } });
  }

  queue.push({ key: `k${seq++}`, id: t.root });
  steps.push(step({
    event: 'enqueue',
    lineId: 'enqroot',
    note: `根 ${lab(t.root)} 入队 —— 第 1 层暂时就它一个。`,
    vars: vars(),
    layers: panels({ roles: { focus1: [t.root] }, queueRoles: { focus1: [queue[0].key] } }),
  }));

  queue.push({ key: `n${seq++}`, id: null });
  sentinels++;
  steps.push(step({
    event: 'enqueue',
    lineId: 'sentinel1',
    note: '紧跟根之后压入第一个 NULL 哨兵：它就是"第 1 层到此为止"的界碑。后续孩子都会排在它后面，因此不会混进第 1 层。',
    vars: vars(),
    layers: panels({ queueRoles: { focus2: [queue[queue.length - 1].key], added: [queue[queue.length - 1].key] } }),
  }));

  while (queue.length) {
    const it = queue.shift();

    if (it.id == null) {
      levels.push(level); // 撞到哨兵 = 本层走完，先记进 layers
      steps.push(step({
        event: 'layer-end',
        lineId: 'layerend',
        note: `出队撞到 NULL 哨兵 → 第 ${levelNo} 层结束：${level.map(lab).join(', ')}（${level.length} 个）。层号 +1；队列里若还有人（${queue.length} 个），说明下一层已经就位。`,
        vars: vars(),
        layers: panels({ roles: { done: [...order] } }),
      }));
      level = [];
      levelNo++;

      if (queue.length) {
        queue.push({ key: `n${seq++}`, id: null });
        sentinels++;
        steps.push(step({
          event: 'enqueue',
          lineId: 'relay',
          note: '给下一层补一个新哨兵压到队尾：这样"换层"就能一直靠撞 NULL 来判定，而不是靠数个数。',
          vars: vars(),
          layers: panels({ queueRoles: { added: [queue[queue.length - 1].key], focus1: [queue[queue.length - 1].key] } }),
        }));
      }
      continue;
    }

    const n = t.map.get(it.id);
    steps.push(step({
      event: 'dequeue',
      lineId: 'deq',
      note: `出队 ${n.label}（第 ${levelNo} 层）。队列前面的 NULL 就是本层的墙——排在墙后面的都还是下一层。`,
      vars: vars(),
      layers: panels({ roles: { focus1: [it.id], done: [...order] } }),
    }));

    order.push(it.id);
    level.push(it.id);
    steps.push(step({
      event: 'visit',
      lineId: 'visit',
      note: `访问 ${n.label}（总第 ${order.length} 个，第 ${levelNo} 层）：出队即访问，与单队列版一致。`,
      vars: vars(),
      layers: panels({ roles: { focus1: [it.id], done: [...order] } }),
    }));

    const kids = [n.left, n.right].filter(Boolean);
    if (kids.length) {
      steps.push(step({
        event: 'enqueue-children',
        lineId: 'scan',
        note: `${n.label} 的孩子：${n.left ? `左 ${lab(n.left)}` : '左空'}、${n.right ? `右 ${lab(n.right)}` : '右空'}。它们入队时会被排在哨兵后面，所以在哨兵被弹出之前不会有人碰它们。`,
        vars: vars(),
        layers: panels({ roles: { focus2: [it.id], added: kids } }),
      }));

      if (n.left) {
        queue.push({ key: `k${seq++}`, id: n.left });
        const added = queue[queue.length - 1];
        steps.push(step({
          event: 'enqueue',
          lineId: 'enqL',
          note: `左孩子 ${lab(n.left)} 入队（先左）—— 它落在哨兵后面，属于下一层。`,
          vars: vars(),
          layers: panels({ roles: { focus1: [n.left], focus2: [it.id] }, queueRoles: { added: [added.key], focus1: [added.key] } }),
        }));
      }
      if (n.right) {
        queue.push({ key: `k${seq++}`, id: n.right });
        const added = queue[queue.length - 1];
        steps.push(step({
          event: 'enqueue',
          lineId: 'enqR',
          note: `右孩子 ${lab(n.right)} 入队（后右）：队尾顺序 = 下一层的从左到右顺序。`,
          vars: vars(),
          layers: panels({ roles: { focus1: [n.right], focus2: [it.id] }, queueRoles: { added: [added.key], focus1: [added.key] } }),
        }));
      }
    }
  }

  const result = { order: order.map(lab), layers: levels.map((lv) => lv.map(lab)) };
  steps.push(step({
    event: 'done',
    lineId: 'ret',
    done: true,
    result,
    note: `层序完成：${result.order.join(', ')}，共 ${result.layers.length} 层（${result.layers.map((lv) => `[${lv.join('')}]`).join(' ')}）。一共只用了 ${sentinels} 个 NULL 哨兵就把层次分开了。`,
    vars: { n: t.ids.length, 层号: '—', 队列: '（空）', 哨兵数: sentinels, 已访问: order.length, 输出: result.order.join(' → '), 每层: result.layers.map((lv) => `[${lv.join('')}]`).join(' ') },
    layers: panels({ roles: { done: [...order] } }),
  }));

  return trace({
    algorithmId: meta.id,
    variantId: 'v3',
    sourceVersion: 'bt-levelorder-sentinel-v1',
    lines: L,
    steps,
    result,
    meta: { levels: result.layers.length, sentinels },
  });
}

const RUNNERS = { v1: runV1, v2: runV2, v3: runV3 };

export function run(variantId, input) {
  const fn = RUNNERS[variantId];
  if (!fn) throw new Error(`未知变体：${variantId}`);
  return fn(input || {});
}

export function sourceLines(variantId) {
  return LINES[variantId] || LINES.v1;
}
