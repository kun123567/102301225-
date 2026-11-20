// shared/algorithms/final/e/sparse-matrix-transpose.js
const SOURCE_VERSION = 'sparse-matrix-transpose-c-v3';
const NO_RESULT = Symbol('no-result');
// JS 与 C++ 展示源码使用同一尺寸约定：列数上限 64（C++ 计数表固定 int num[64] / cpos[64]）
const MAX_COLS = 64;

// 展示源码只用裸 C++，不引入 <algorithm>（Open Watcom 打不开该头文件），排序用手写插入排序
const SOURCE_LINES = [
  { lineId: 'struct', text: 'struct Triple { int i; int j; double e; };' },
  { lineId: 'same-coord', text: 'bool sameCoord(const Triple& a, const Triple& b) { return a.i == b.i && a.j == b.j; }' },
  { lineId: 'row-sort', text: 'void rowSort(Triple t[], int n) { for(int k=1;k<n;k++){ Triple key=t[k]; int p=k-1; while(p>=0 && (t[p].i>key.i || (t[p].i==key.i && t[p].j>key.j))){ t[p+1]=t[p]; p--; } t[p+1]=key; } }' },
  { lineId: 'init', text: 'int sparse_transpose(int rows, int cols, Triple t[], int n, Triple out[]) {' },
  { lineId: 'validate-dims', text: '  if(rows < 0 || cols < 0 || cols > 64) return -3;   /* 尺寸校验：列数上限 64，与 JS 一致 */' },
  { lineId: 'validate', text: '  for(int k=0;k<n;k++) if(t[k].i<0 || t[k].i>=rows || t[k].j<0 || t[k].j>=cols) return -1;' },
  { lineId: 'duplicate-check', text: '  for(int a=0;a<n;a++) for(int b=a+1;b<n;b++) if(sameCoord(t[a],t[b])) return -2;  /* 坐标必须唯一 */' },
  { lineId: 'normalize-sort', text: '  rowSort(t, n);                                  /* 输入行优先规范化（i 升，i 同则 j 升） */' },
  { lineId: 'count-column', text: '  int num[64], cpos[64]; for(int c=0;c<cols;c++) num[c]=0; for(int k=0;k<n;k++) num[t[k].j]++;   /* 原矩阵各列非零个数 */' },
  { lineId: 'start-pos', text: '  cpos[0]=0; for(int c=1;c<cols;c++) cpos[c]=cpos[c-1]+num[c-1];   /* 各列在输出中的起始下标 */' },
  { lineId: 'write-out', text: '  for(int k=0;k<n;k++){ int col=t[k].j; out[cpos[col]].i=t[k].j; out[cpos[col]].j=t[k].i; out[cpos[col]].e=t[k].e; cpos[col]++; }' },
  { lineId: 'done', text: '  return n;' },
  { lineId: 'close', text: '}' },
];

/**
 * 稀疏矩阵快速转置：列计数 -> 起始下标前缀和 -> 按原矩阵行优先逐项写入
 * 帧契约：originalTriples 固定保存调用方原始输入；triples 保存当前(规范化后)行优先快照，
 * 因此所有用 k 指向当前三元组的帧，variables.triples[k] 必然与 k 指向的是同一项。
 * @param {{rows:number,cols:number,triples:{i:number,j:number,e:number}[]}} input
 */
export function generateSparseMatrixTransposeSteps(input) {
  const steps = [];
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const payload = input && typeof input === 'object' ? input : {};
  const rows = payload.rows;
  const cols = payload.cols;
  const rawTriples = Array.isArray(payload.triples) ? payload.triples : null;

  // 原始输入的快照（不读字段，避免 null/非对象条目在拷贝阶段抛错）
  const originalTriples = rawTriples
    ? rawTriples.map((t) => (t && typeof t === 'object' ? { i: t.i, j: t.j, e: t.e } : null))
    : [];
  // 所有 k 索引指向的当前快照；规范化后整体替换为行优先顺序
  let currentTriples = clone(originalTriples);

  function record(event, lineId, description, vars = {}, finalResult = NO_RESULT) {
    const done = finalResult !== NO_RESULT;
    steps.push({
      schemaVersion: '1.0',
      algorithm: 'sparse-matrix-transpose',
      stepIndex: steps.length,
      sourceVersion: SOURCE_VERSION,
      event,
      lineId,
      variables: {
        rows,
        cols,
        originalTriples: clone(originalTriples),
        triples: clone(currentTriples),
        ...clone(vars),
      },
      description,
      done,
      result: done ? clone(finalResult) : null,
    });
  }

  const fail = () => ({ steps, result: null, sourceVersion: SOURCE_VERSION, sourceLines: SOURCE_LINES });

  record(
    'init',
    'init',
    `入参 rows=${String(rows)}, cols=${String(cols)}, 三元组${rawTriples ? ` ${rawTriples.length} 个` : '不是数组'}`
  );

  // 尺寸与输入形状：全部放在分配计数表之前校验
  if (!Number.isInteger(rows) || rows < 0) {
    record('error', 'validate-dims', `非法行数 rows=${String(rows)}：必须是非负整数`, {}, null);
    return fail();
  }
  if (!Number.isInteger(cols) || cols < 0 || cols > MAX_COLS) {
    record('error', 'validate-dims', `非法列数 cols=${String(cols)}：必须是 0 到 ${MAX_COLS} 之间的整数`, {}, null);
    return fail();
  }
  if (!rawTriples) {
    record('error', 'validate-dims', 'triples 必须是三元组数组', {}, null);
    return fail();
  }

  for (let idx = 0; idx < rawTriples.length; idx++) {
    const t = rawTriples[idx];
    if (!t || typeof t !== 'object') {
      record('error', 'validate', `第 ${idx + 1} 个三元组不是对象`, {}, null);
      return fail();
    }
  }

  for (const t of rawTriples) {
    if (!Number.isInteger(t.i) || !Number.isInteger(t.j) || t.i < 0 || t.j < 0 || t.i >= rows || t.j >= cols) {
      record('error', 'validate', `非法行列坐标 (${String(t.i)},${String(t.j)})：必须是 [0,${rows}) x [0,${cols}) 内的整数`, {}, null);
      return fail();
    }
    if (typeof t.e !== 'number' || !Number.isFinite(t.e)) {
      record('error', 'validate', `非法元素值 e=${String(t.e)}：必须是有限数值`, {}, null);
      return fail();
    }
  }

  const seen = new Set();
  for (const t of rawTriples) {
    const key = t.i + ',' + t.j;
    if (seen.has(key)) {
      record('error', 'duplicate-check', `重复坐标 (${t.i},${t.j})：同一位置只能有一个非零元素`, {}, null);
      return fail();
    }
    seen.add(key);
  }

  // 规范化后所有 k 都指向这一份快照
  currentTriples = rawTriples
    .map((t) => ({ i: t.i, j: t.j, e: t.e }))
    .sort((a, b) => (a.i !== b.i ? a.i - b.i : a.j - b.j));
  record('normalize_sort', 'normalize-sort', '输入三元组按行优先（i 升，i 相同则 j 升）规范化排序', {});

  const num = new Array(cols).fill(0);
  for (let k = 0; k < currentTriples.length; k++) {
    const col = currentTriples[k].j;
    num[col] += 1;
    record(
      'count_column',
      'count-column',
      `第 ${k + 1} 个三元组在原矩阵第 ${col} 列，num[${col}] = ${num[col]}`,
      { num: [...num], col, k }
    );
  }

  const cpos = new Array(cols).fill(0);
  for (let c = 1; c < cols; c++) cpos[c] = cpos[c - 1] + num[c - 1];
  record('start_positions', 'start-pos', `原列计数 [${num.join(',')}]，各列输出起始下标 [${cpos.join(',')}]`, {
    num: [...num],
    cpos: [...cpos],
  });

  const out = new Array(currentTriples.length).fill(null).map(() => ({ i: null, j: null, e: null }));
  const cursor = [...cpos];
  for (let k = 0; k < currentTriples.length; k++) {
    const t = currentTriples[k];
    const col = t.j;
    const pos = cursor[col];
    out[pos] = { i: t.j, j: t.i, e: t.e };
    cursor[col] += 1;
    record(
      'write_out',
      'write-out',
      `(${t.i},${t.j},${t.e}) 交换坐标后写入输出第 ${pos} 位，cpos[${col}] 前进到 ${cursor[col]}`,
      { out: clone(out), cpos: [...cursor], col, pos, k }
    );
  }

  const result = { rows: cols, cols: rows, triples: clone(out) };
  record(
    'done',
    'done',
    `${cols} 行 ${rows} 列转置完成，三元组 [${out.map((t) => `(${t.i},${t.j},${t.e})`).join(' ')}]`,
    { num: [...num], cpos: [...cursor], out: clone(out) },
    result
  );
  return { steps, result: { rows: cols, cols: rows, triples: clone(out) }, sourceVersion: SOURCE_VERSION, sourceLines: SOURCE_LINES };
}
