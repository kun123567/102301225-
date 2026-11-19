// shared/algorithms/final/e/array-list-reverse.js
const SOURCE_VERSION = 'array-list-reverse-c-v1';
const SOURCE_LINES = [
  { lineId: 'init', text: 'void array_reverse(int arr[], int len) {' },
  { lineId: 'loop-swap', text: '  for(int i=0;i<len/2;i++){ int t=arr[i]; arr[i]=arr[len-1-i]; arr[len-1-i]=t; }' },
  { lineId: 'done', text: '}' },
];

/**
 * 顺序表原地逆置 二次复审修复版
 * @param {{list:number[]}} input
 * @returns {{steps:any[],result:number[],sourceVersion:string,sourceLines:typeof SOURCE_LINES}}
 */
export function generateArrayListReverseSteps(input) {
  const { list } = input;
  const steps = [];
  const arr = JSON.parse(JSON.stringify(list));
  const len = arr.length;

  function record(event, lineId, description, extraVars = {}) {
    const done = event === 'sorted';
    const snapArr = JSON.parse(JSON.stringify(arr));
    steps.push({
      schemaVersion: '1.0',
      algorithm: 'array-list-reverse',
      stepIndex: steps.length,
      sourceVersion: SOURCE_VERSION,
      event,
      lineId,
      array: snapArr,
      variables: { arr: snapArr, len, ...extraVars },
      description,
      done,
      result: done ? JSON.parse(JSON.stringify(arr)) : null
    });
  }

  record('init', 'init', `原始数组 [${arr.join(',')}]，原地逆置`);
  if(len <= 1){
    record('sorted','done',`无需逆置 [${arr.join(',')}]`);
    return {steps, result:[...arr], sourceVersion:SOURCE_VERSION, sourceLines:SOURCE_LINES};
  }

  for(let i=0; i < Math.floor(len/2); i++){
    const j = len - 1 - i;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    record('loop-swap','loop-swap',`交换下标${i}与${j}，数组[${arr.join(',')}]`,{i,j});
  }

  record('sorted','done',`逆置完成：[${arr.join(',')}]`);
  return { steps, result:[...arr], sourceVersion:SOURCE_VERSION, sourceLines: SOURCE_LINES };
}
