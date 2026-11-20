// shared/algorithms/final/e/array-list-delete-range.js
const SOURCE_VERSION = 'array-list-delete-range-c-v1';
const SOURCE_LINES = [
  { lineId: 'init', text: 'void array_delete_range(int arr[], int &len, int left, int right) {' },
  { lineId: 'input-check', text: '  if(left<0 || right>=len || left>right) return;' },
  { lineId: 'calc-del', text: '  int del = right - left + 1;' },
  { lineId: 'move-loop', text: '  for(int i = right + 1; i < len; i++) arr[i-del] = arr[i];' },
  { lineId: 'update-len', text: '  len = len - del;' },
  { lineId: 'done', text: '}' },
];

/**
 * 顺序表闭区间[left,right]删除，修复record result契约
 * @param {{list:number[],left:number,right:number}} input
 * @returns {{steps:any[],result:number[]|null,sourceVersion:string,sourceLines:typeof SOURCE_LINES}}
 */
export function generateArrayListDeleteRangeSteps(input) {
  const { list, left, right } = input;
  const steps = [];
  const arr = JSON.parse(JSON.stringify(list));
  let len = arr.length;
  const maxSize = arr.length;

  function record(event, lineId, description, extraVars = {}) {
    const done = event === 'sorted' || event === 'error';
    const arrSnap = JSON.parse(JSON.stringify(arr));
    steps.push({
      schemaVersion: '1.0',
      algorithm: 'array-list-delete-range',
      stepIndex: steps.length,
      sourceVersion: SOURCE_VERSION,
      event,
      lineId,
      array: arrSnap,
      variables: {
        arr: arrSnap,
        maxSize,
        length: len,
        left,
        right,
        ...extraVars
      },
      description,
      done,
      result: done ? (event === 'error' ? null : JSON.parse(JSON.stringify(arrSnap.slice(0, len)))) : null
    });
  }

  record('init', 'init', `顺序表删除闭区间[${left},${right}]，原始数组[${arr.join(',')}]`);

  if (!Number.isInteger(left) || !Number.isInteger(right)) {
    record('error', 'input-check', `非法输入：left=${left}, right=${right} 必须为整数`);
    return { steps, result: null, sourceVersion: SOURCE_VERSION, sourceLines: SOURCE_LINES };
  }
  if (left < 0 || right >= len || left > right) {
    record('error', 'input-check', `区间[${left},${right}]越界或者非法`);
    return { steps, result: null, sourceVersion: SOURCE_VERSION, sourceLines: SOURCE_LINES };
  }

  const delCount = right - left + 1;
  record('calc-del', 'calc-del', `待删除元素个数 del=${delCount}`, { delCount });

  for (let i = right + 1; i < len; i++) {
    arr[i - delCount] = arr[i];
    record('move-loop', 'move-loop', `将下标${i}的元素移动至下标${i - delCount}`, { src:i, dst:i-delCount });
  }
  len = len - delCount;
  record('update-len', 'update-len', `更新逻辑长度 len=${len}`);

  record('sorted', 'done', `区间删除完成，有效结果 [${arr.slice(0,len).join(',')}]`);
  const finalRes = JSON.parse(JSON.stringify(arr.slice(0, len)));
  return { steps, result: finalRes, sourceVersion: SOURCE_VERSION, sourceLines: SOURCE_LINES };
}


