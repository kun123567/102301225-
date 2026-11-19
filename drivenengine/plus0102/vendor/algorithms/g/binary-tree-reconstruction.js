/**
 * G · 二叉树重建（3 个代表性、彼此不同的实现）
 *
 * 重建的唯一依据：**中序 + 任一序**。中序负责"根的左右各有几个节点"，
 * 另一序负责"子树里谁是根"。三个版本的差别在"根从哪头取"和"根的位置怎么找"：
 *   v1 前序 + 中序递归   —— 前序首项为根，在中序区间里**线性扫描**定位，O(n²)；
 *   v2 后序 + 中序递归   —— 后序末项为根，右区间下表要退一格（pr-1），展示下标推进差异；
 *   v3 前序 + 中序哈希   —— 预存中序 value→下标 的映射，定位 O(1)，总复杂度 O(n)。
 *
 * 画面：主面板是"已重建的部分"（style 9，紫色粗边 = 本步新挂的边），
 * 辅助面板是递归调用栈（style 7），区间一律写成字符串摆进 vars。
 *
 * 契约（docs/04-轨迹契约.md）：每步都是完整快照；step.lineId 命中本变体自己的 sourceLines；
 * 最后一步 done=true 且 result 与样例 expect 深比较一致。
 */

import { trace, step, treeLayer, stackLayer } from '../../engine/model.js';

export const meta = {
  id: 'g/binary-tree-reconstruction',
  variants: [
    { id: 'v1', name: '前序 + 中序递归', note: '前序首项为根，在中序当前区间定位后切分左右区间递归' },
    { id: 'v2', name: '后序 + 中序递归', note: '后序末项为根，同样用中序切分；展示与前序版的下标推进差异' },
    { id: 'v3', name: '前序 + 中序 + 哈希索引', note: '预存中序 value→下标 的映射，定位根 O(1)，总复杂度 O(n)' },
  ],
};

/* ------------------------------------------------------------------ 错误文案（三个变体共用，便于样例共用同一份 expect） */

const MSG_LEN = '序列不一致：两份序列长度不同，区间无法一一对应';
const MSG_SET = '序列不一致：两份序列的节点集合不同，无法确定唯一的树';
const MSG_DUP = '中序含重复值：根的位置不唯一，重建结果不唯一';

/* ------------------------------------------------------------------ 样例 */

export const samples = [
  {
    id: 'normal',
    label: '前序 A,B,D,C + 中序 B,D,A,C → 重建 A(L:B(R:D), R:C)',
    input: {
      preorder: ['A', 'B', 'D', 'C'],
      inorder: ['B', 'D', 'A', 'C'],
      postorder: ['D', 'B', 'C', 'A'],
    },
    expect: { root: 'A', edges: [['A', 'B'], ['A', 'C'], ['B', 'D']] },
  },
  {
    id: 'edge-mismatch',
    label: '前序 A,B,D + 中序 A,B,C（同一批节点都凑不齐）→ error',
    input: {
      preorder: ['A', 'B', 'D'],
      inorder: ['A', 'B', 'C'],
      postorder: ['D', 'B', 'A'],
    },
    expect: { error: MSG_SET },
  },
  {
    id: 'edge-single',
    label: '单节点：前序 [A] + 中序 [A] → 只有根、没有边',
    input: { preorder: ['A'], inorder: ['A'], postorder: ['A'] },
    expect: { root: 'A', edges: [] },
  },
];

/* ------------------------------------------------------------------ 展示代码 */

const LINES = {
  v1: [
    { lineId: 'fn', text: 'BiTree Build(char pre[], int pl, int pr, char in[], int il, int ir) {' },
    { lineId: 'check', text: '  /* 入口校验：pre 与 in 必须是同一批节点，否则切出来的区间对不上 */' },
    { lineId: 'guard', text: '  if (pl > pr) return NULL;                       /* 区间为空：这棵子树不存在 */' },
    { lineId: 'root', text: '  BiTree T = newNode(pre[pl]);                    /* ① 前序首项就是根 */' },
    { lineId: 'loc', text: '  int k = Index(in, il, ir, pre[pl]);             /* ② 在中序区间 il..ir 里线性查找根 */' },
    { lineId: 'split', text: '  int leftLen = k - il;                           /* ③ 左子树的节点个数 */' },
    { lineId: 'left', text: '  T->lchild = Build(pre, pl+1, pl+leftLen, in, il, k-1);      /* ④ 左区间 */' },
    { lineId: 'right', text: '  T->rchild = Build(pre, pl+leftLen+1, pr, in, k+1, ir);      /* ⑤ 右区间 */' },
    { lineId: 'ret', text: '  return T;' },
    { lineId: 'main', text: '/* main: Build(pre,0,3, in,0,3) —— 期望重建 A(L:B(R:D), R:C) */' },
  ],
  v2: [
    { lineId: 'fn', text: 'BiTree BuildPost(char post[], int pl, int pr, char in[], int il, int ir) {' },
    { lineId: 'check', text: '  /* 入口校验：post 与 in 必须是同一批节点 */' },
    { lineId: 'guard', text: '  if (pl > pr) return NULL;' },
    { lineId: 'root', text: '  BiTree T = newNode(post[pr]);                   /* ① 后序末项才是根 */' },
    { lineId: 'loc', text: '  int k = Index(in, il, ir, post[pr]);            /* ② 同样在中序里定位根 */' },
    { lineId: 'split', text: '  int leftLen = k - il;                           /* ③ 左子树节点个数 */' },
    { lineId: 'left', text: '  T->lchild = BuildPost(post, pl, pl+leftLen-1, in, il, k-1);   /* ④ 左区间 = 前 leftLen 个 */' },
    { lineId: 'right', text: '  T->rchild = BuildPost(post, pl+leftLen, pr-1, in, k+1, ir);   /* ⑤ 右区间：末项 pr 是根，要退一格 */' },
    { lineId: 'ret', text: '  return T;' },
    { lineId: 'main', text: '/* main: BuildPost(post,0,3, in,0,3) —— 期望重建 A(L:B(R:D), R:C) */' },
  ],
  v3: [
    { lineId: 'fn', text: 'BiTree BuildHash(char pre[], int pl, int pr, char in[], int il, int ir, int map[]) {' },
    { lineId: 'init', text: '  /* 先扫一遍中序：map[in[i]] = i，O(n) 建表一次，之后定位全 O(1) */' },
    { lineId: 'check', text: '  /* 入口校验：pre 与 in 必须是同一批节点 */' },
    { lineId: 'guard', text: '  if (pl > pr) return NULL;' },
    { lineId: 'root', text: '  BiTree T = newNode(pre[pl]);                    /* ① 前序首项就是根 */' },
    { lineId: 'loc', text: '  int k = map[pre[pl]];                           /* ② 定位 O(1)：查表，不扫区间 */' },
    { lineId: 'split', text: '  int leftLen = k - il;' },
    { lineId: 'left', text: '  T->lchild = BuildHash(pre, pl+1, pl+leftLen, in, il, k-1, map);' },
    { lineId: 'right', text: '  T->rchild = BuildHash(pre, pl+leftLen+1, pr, in, k+1, ir, map);' },
    { lineId: 'ret', text: '  return T;' },
    { lineId: 'main', text: '/* main: 建表 + BuildHash(pre,0,3, in,0,3, map) —— 期望 A(L:B(R:D), R:C) */' },
  ],
};

/* ------------------------------------------------------------------ 输入预处理 */

function toSeq(v) {
  return Array.isArray(v) ? v.filter((x) => x != null && x !== '').map((x) => String(x)) : [];
}

/** 入口校验：长度一致 → 节点集合一致 → 中序无重复 */
function checkSeq(seq, ino) {
  if (seq.length !== ino.length) return MSG_LEN;
  const a = [...seq].sort();
  const b = [...ino].sort();
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return MSG_SET;
  const seen = new Set();
  for (const v of ino) {
    if (seen.has(v)) return MSG_DUP;
    seen.add(v);
  }
  return null;
}

/* 下面两组只做一件事：输入里缺了本变体要用的主序列时，用中序 + 另一种序列把它反推出来，
 * 保证 v2 在只给了前序的输入上也能演示（反推用的树与重建算法本身无关，只是取序列）。 */

function treeFromPreIn(pre, ino) {
  let i = 0;
  const rec = (il, ir) => {
    if (il > ir || i >= pre.length) return null;
    const v = pre[i++];
    let k = -1;
    for (let j = il; j <= ir; j++) if (ino[j] === v) { k = j; break; }
    if (k < 0) return null;
    return { v, l: rec(il, k - 1), r: rec(k + 1, ir) };
  };
  return rec(0, ino.length - 1);
}

function treeFromPostIn(post, ino) {
  let i = post.length - 1;
  const rec = (il, ir) => {
    if (il > ir || i < 0) return null;
    const v = post[i--];
    let k = -1;
    for (let j = il; j <= ir; j++) if (ino[j] === v) { k = j; break; }
    if (k < 0) return null;
    const r = rec(k + 1, ir);
    const l = rec(il, k - 1);
    return { v, l, r };
  };
  return rec(0, ino.length - 1);
}

function preorderOf(node, out = []) {
  if (!node) return out;
  out.push(node.v);
  preorderOf(node.l, out);
  preorderOf(node.r, out);
  return out;
}

function postorderOf(node, out = []) {
  if (!node) return out;
  postorderOf(node.l, out);
  postorderOf(node.r, out);
  out.push(node.v);
  return out;
}

/* ------------------------------------------------------------------ 主体（三个变体共用同一套步进框架） */

function runReconstruct(input, cfg) {
  const L = cfg.lines;
  const steps = [];
  const ino = toSeq(input.inorder);
  const preRaw = toSeq(input.preorder);
  const postRaw = toSeq(input.postorder);
  const seqName = cfg.mode === 'post' ? 'post' : 'pre';

  let seq = cfg.mode === 'post' ? postRaw : preRaw;
  let derived = false;
  if (!seq.length) {
    if (cfg.mode === 'post' && preRaw.length) {
      seq = postorderOf(treeFromPreIn(preRaw, ino));
      derived = seq.length > 0;
    } else if (cfg.mode !== 'post' && postRaw.length) {
      seq = preorderOf(treeFromPostIn(postRaw, ino));
      derived = seq.length > 0;
    }
  }

  const err = ino.length === 0 && seq.length === 0 ? null : checkSeq(seq, ino);

  const hash = new Map();
  ino.forEach((v, i) => { if (!hash.has(v)) hash.set(v, i); });

  const built = new Map();  // id → {id,label,left,right}
  const edgeList = [];      // 挂接顺序
  const frames = [];        // 递归帧（栈底 → 栈顶）
  let rootId = null;
  let scan = 0;             // 中序线性扫描的比较次数
  let hits = 0;             // 哈希命中次数

  const tagsOf = () => {
    const tags = {};
    for (const n of built.values()) {
      if (n.left) tags[n.left] = 'L';
      if (n.right) tags[n.right] = 'R';
    }
    return tags;
  };

  const treePanel = (o = {}) => treeLayer({
    id: 'main',
    title: 'Rebuilt Tree',
    name: o.name || 'TTree · 已重建的部分（紫色粗边 = 本步新挂的边）',
    roots: rootId ? [rootId] : [],
    nodes: [...built.values()].map((n) => {
      const box = { id: n.id, label: n.label };
      if (n.left) box.left = n.left;
      if (n.right) box.right = n.right;
      return box;
    }),
    edgeTags: tagsOf(),
    extraEdges: o.extraEdges || null,
    roles: o.roles || {},
  });

  const stackPanel = () => stackLayer({
    id: 'rec',
    title: '递归栈',
    name: 'Build 调用栈（栈底 → 栈顶）',
    cells: frames.map((f, i) => ({ value: f.id, label: `帧${i + 1}` })),
    top: frames.length ? frames.length - 1 : null,
    capacity: Math.max(4, ino.length),
    roles: { pointers: frames.length ? [{ id: 'top', label: 'top', index: frames.length - 1 }] : [] },
  });

  const seg = (name, a, b) => (a > b ? `${name}[空]` : `${name}[${a}..${b}]`);

  const vars = (o = {}) => {
    const out = { 根: o.root ?? '—' };
    out[cfg.mode === 'post' ? '后序区间' : '前序区间'] = o.seg ?? '—';
    out['中序区间'] = o.inSeg ?? '—';
    out['左区间长度'] = o.leftLen ?? '—';
    out['左区间'] = o.leftSeg ?? '—';
    out['右区间'] = o.rightSeg ?? '—';
    out['递归栈'] = frames.length ? frames.map((f) => f.id).join(' > ') : '（空）';
    out['已建节点'] = built.size;
    out['新增边'] = edgeList.length;
    out['中序扫描次数'] = scan;
    if (cfg.mode === 'hash') out['哈希命中'] = hits;
    return out;
  };

  const baseVars = {
    ...vars({}),
    输入序列: `${seqName} = [${seq.join(',')}]`,
    中序序列: `in = [${ino.join(',')}]`,
    节点数: ino.length,
  };

  steps.push(step({
    event: 'init',
    lineId: 'fn',
    note: ino.length === 0 && seq.length === 0
      ? '没有给序列：两份都是空的，重建出来只能是空树。'
      : `${cfg.mode === 'post' ? '后序' : '前序'}定"谁是根"，中序定"左右各有几个节点"。${derived ? '（本次输入没给本变体要用的主序列，已按中序 + 另一个序列反推出等价的序列，仅用于演示。）' : ''}${cfg.mode === 'hash' ? '哈希版先把中序扫一遍建 value→下标 的表，后面定位根就都是 O(1)。' : ''}`,
    vars: baseVars,
    layers: [treePanel(), stackPanel()],
  }));

  if (err) {
    steps.push(step({
      event: 'error',
      lineId: 'check',
      note: `${err}。重建的前提是两份序列描述同一棵树：长度要一样、节点集合要完全一致、中序里不能有重复值。这里对不上，任何切分都会推到错误的区间，所以直接报错而不是硬凑一棵树。`,
      vars: baseVars,
      layers: [treePanel(), stackPanel()],
    }));
    const result = { error: err };
    steps.push(step({
      event: 'done',
      lineId: 'main',
      done: true,
      result,
      note: '序列不自洽，重建终止：result 里只带 error，不给 root / edges —— 不假装成功。',
      vars: baseVars,
      layers: [treePanel(), stackPanel()],
    }));
    return trace({ algorithmId: meta.id, variantId: cfg.variantId, sourceVersion: cfg.sourceVersion, lines: L, steps, result, meta: { error: err } });
  }

  const build = (sL, sR, iL, iR, parentId, side) => {
    const val = cfg.mode === 'post' ? seq[sR] : seq[sL];
    const node = { id: val, label: val, left: null, right: null };
    built.set(node.id, node);
    if (parentId) {
      built.get(parentId)[side] = node.id;
      edgeList.push([parentId, node.id]);
    } else {
      rootId = node.id;
    }
    frames.push({ id: node.id, sL, sR, iL, iR });

    steps.push(step({
      event: 'take-root',
      lineId: 'root',
      note: cfg.mode === 'post'
        ? `这一段的根是后序区间的**末项** post[${sR}] = ${node.label}（后序"左右根"把根压在最后）。${parentId ? `它由父节点 ${parentId} 的${side === 'right' ? '右' : '左'}区间交出。` : '它是整棵树的根。'}`
        : `这一段的根是前序区间的**首项** pre[${sL}] = ${node.label}（前序"根左右"把根放在最前）。${parentId ? `它由父节点 ${parentId} 的${side === 'right' ? '右' : '左'}区间交出。` : '它是整棵树的根。'}`,
      vars: vars({ root: node.label, seg: seg(seqName, sL, sR), inSeg: seg('in', iL, iR) }),
      layers: [treePanel({ roles: { focus1: [node.id], added: [node.id] } }), stackPanel()],
    }));

    let k = -1;
    if (cfg.mode === 'hash') {
      const hit = hash.get(node.id);
      k = hit == null ? -1 : hit;
      if (k >= 0) hits++;
    } else {
      for (let j = iL; j <= iR; j++) {
        scan++;
        if (ino[j] === node.id) { k = j; break; }
      }
    }

    if (k < iL || k > iR) {
      steps.push(step({
        event: 'error',
        lineId: 'check',
        note: `${node.label} 在中序区间 in[${iL}..${iR}] 里找不到位置：序列不自洽，重建只能中止。`,
        vars: vars({ root: node.label, seg: seg(seqName, sL, sR), inSeg: seg('in', iL, iR) }),
        layers: [treePanel(), stackPanel()],
      }));
      frames.pop();
      return node;
    }

    steps.push(step({
      event: 'locate-inorder',
      lineId: 'loc',
      note: cfg.mode === 'hash'
        ? `哈希直接给出位置：map[${node.label}] = ${k}，一次中序比较都不做（中序扫描次数不增长）。这就是它把 O(n²) 降到 O(n) 的地方。`
        : `在 in[${iL}..${iR}] 里从头找 ${node.label}：落在 in[${k}]，比较了 ${k - iL + 1} 次。根左边是左子树、右边是右子树 —— 中序独有的性质。`,
      vars: vars({ root: node.label, seg: seg(seqName, sL, sR), inSeg: seg('in', iL, iR) }),
      layers: [treePanel({ roles: { focus1: [node.id] } }), stackPanel()],
    }));

    const leftLen = k - iL;
    const rightLen = iR - k;
    steps.push(step({
      event: 'split',
      lineId: 'split',
      note: `leftLen = k - il = ${k} - ${iL} = ${leftLen}：左子树 ${leftLen} 个节点、右子树 ${rightLen} 个。中序两段定长度，主序列的区间长度必须跟着它走 —— 这就是"切分"。`,
      vars: vars({
        root: node.label,
        seg: seg(seqName, sL, sR),
        inSeg: seg('in', iL, iR),
        leftLen,
        leftSeg: seg('in', iL, k - 1),
        rightSeg: seg('in', k + 1, iR),
      }),
      layers: [treePanel({ roles: { focus1: [node.id] } }), stackPanel()],
    }));

    const leftS = cfg.mode === 'post' ? [sL, sL + leftLen - 1] : [sL + 1, sL + leftLen];
    let leftChild = null;
    if (leftLen > 0) leftChild = build(leftS[0], leftS[1], iL, k - 1, node.id, 'left');
    steps.push(step({
      event: 'attach-left',
      lineId: 'left',
      note: leftChild
        ? `左子树返回，它的根是 ${leftChild.id}——子帧已出栈，本帧 ${node.label} 恢复控制权，执行 T->lchild = ${leftChild.id}：新增一条边 ${node.label} → ${leftChild.id}（紫边）。`
        : `左区间为空（leftLen = 0）→ T->lchild = NULL：这条边不存在，画面上什么也不加。${cfg.mode === 'post' ? '' : '（前序版此时 pl+1 > pl+leftLen 成立，递归在 guard 处立刻返回 NULL。）'}`,
      vars: vars({
        root: node.label,
        seg: seg(seqName, sL, sR),
        inSeg: seg('in', iL, iR),
        leftLen,
        leftSeg: seg('in', iL, k - 1),
        rightSeg: seg('in', k + 1, iR),
      }),
      layers: [
        treePanel({
          extraEdges: leftChild ? [{ from: node.id, to: leftChild.id }] : null,
          roles: leftChild ? { focus1: [node.id], focus2: [leftChild.id] } : { focus1: [node.id] },
        }),
        stackPanel(),
      ],
    }));

    const rightS = cfg.mode === 'post' ? [sL + leftLen, sR - 1] : [sL + leftLen + 1, sR];
    let rightChild = null;
    if (rightLen > 0) rightChild = build(rightS[0], rightS[1], k + 1, iR, node.id, 'right');
    steps.push(step({
      event: 'attach-right',
      lineId: 'right',
      note: rightChild
        ? `右子树返回，根是 ${rightChild.id}：T->rchild = ${rightChild.id}，新增边 ${node.label} → ${rightChild.id}。${cfg.mode === 'post' ? '注意后序版右区间的末项是 pr-1——根自己占掉了 pr。' : ''}`
        : `右区间为空（rightLen = 0）→ T->rchild = NULL：${node.label} 没有右孩子。`,
      vars: vars({
        root: node.label,
        seg: seg(seqName, sL, sR),
        inSeg: seg('in', iL, iR),
        leftLen,
        leftSeg: seg('in', iL, k - 1),
        rightSeg: seg('in', k + 1, iR),
      }),
      layers: [
        treePanel({
          extraEdges: rightChild ? [{ from: node.id, to: rightChild.id }] : null,
          roles: rightChild ? { focus1: [node.id], focus2: [rightChild.id] } : { focus1: [node.id] },
        }),
        stackPanel(),
      ],
    }));

    frames.pop();
    return node;
  };

  if (ino.length) build(0, seq.length - 1, 0, ino.length - 1, null, null);

  const edges = [...edgeList].sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  const result = { root: rootId, edges };
  steps.push(step({
    event: 'done',
    lineId: 'main',
    done: true,
    result,
    note: rootId
      ? `重建完成：根 = ${rootId}，新增 ${edges.length} 条边（${edges.map((e) => `${e[0]}→${e[1]}`).join('，')}）。${cfg.mode === 'hash' ? `中序扫描次数 ${scan}（定位全靠哈希），哈希命中 ${hits} 次。` : `中序线性扫描共 ${scan} 次比较。`}`
      : '两份序列都为空：重建结果是空树（root = null，没有边）。',
    vars: { ...vars({}), 结果根: rootId ?? 'null', 结果边数: edges.length },
    layers: [treePanel({ roles: { done: [...built.keys()] } }), stackPanel()],
  }));

  return trace({
    algorithmId: meta.id,
    variantId: cfg.variantId,
    sourceVersion: cfg.sourceVersion,
    lines: L,
    steps,
    result,
    meta: { nodes: built.size, edges: edges.length, scan, hits },
  });
}

/* ------------------------------------------------------------------ 三个变体 */

function runV1(input) {
  return runReconstruct(input, { variantId: 'v1', mode: 'pre', lines: LINES.v1, sourceVersion: 'bt-rebuild-pre-in-v1' });
}

function runV2(input) {
  return runReconstruct(input, { variantId: 'v2', mode: 'post', lines: LINES.v2, sourceVersion: 'bt-rebuild-post-in-v1' });
}

function runV3(input) {
  return runReconstruct(input, { variantId: 'v3', mode: 'hash', lines: LINES.v3, sourceVersion: 'bt-rebuild-hash-v1' });
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
