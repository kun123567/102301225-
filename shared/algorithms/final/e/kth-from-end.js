// shared/algorithms/final/e/kth-from-end.js
const SOURCE_VERSION = 'kth-from-end-c-v1';
const NO_RESULT = Symbol('no-result');

const SOURCE_LINES = [
  { lineId: 'struct', text: 'struct Node { int value; Node* next; };' },
  { lineId: 'init', text: 'int kth_from_end(Node* head, int k) {' },
  { lineId: 'check', text: '  if(k <= 0 || head == 0) return -1;' },
  { lineId: 'fast', text: '  Node* fast = head; Node* slow = head;' },
  { lineId: 'fast-forward', text: '  for(int i=0;i<k;i++){ if(fast == 0) return -1; fast = fast->next; }' },
  { lineId: 'move-both', text: '  while(fast != 0){ fast = fast->next; slow = slow->next; }' },
  { lineId: 'done', text: '  return slow ? slow->value : -1;' },
  { lineId: 'close', text: '}' },
];

/**
 * 倒数第 k 个节点：快慢指针；错误分支顶层 result 与末步 result 结构完全一致
 * @param {{list:number[],k:number}} input
 * @returns {{steps:any[],result:{nodeId:number|null,value:number|null},sourceVersion:string,sourceLines:typeof SOURCE_LINES}}
 */
export function generateKthFromEndSteps({ list, k }) {
  const steps = [];
  const input = Array.isArray(list) ? [...list] : [];
  let autoId = 0;
  const nodes = input.map((v) => ({ id: autoId++, value: v, next: null }));
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i].next = nodes[i + 1].id;
  }
  let headId = nodes.length ? nodes[0].id : null;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function record(event, lineId, description, vars = {}, finalResult = NO_RESULT) {
    const done = finalResult !== NO_RESULT;
    const nodesSnap = clone(nodes);
    steps.push({
      schemaVersion: '1.0',
      algorithm: 'kth-from-end',
      stepIndex: steps.length,
      sourceVersion: SOURCE_VERSION,
      event,
      lineId,
      nodes: nodesSnap,
      variables: { nodes: nodesSnap, headId, ...clone(vars) },
      description,
      done,
      result: done ? clone(finalResult) : null,
    });
  }

  record('init', 'init', `链表 [${input.join(',')}]，查找倒数第 ${k} 个节点`);

  if (!Number.isInteger(k) || k <= 0 || k > input.length) {
    const errResult = { nodeId: null, value: null };
    record('error', 'check', `非法 k=${k}：必须是 1 到 ${input.length} 之间的整数`, {}, errResult);
    return { steps, result: errResult, sourceVersion: SOURCE_VERSION, sourceLines: SOURCE_LINES };
  }

  let fastId = headId;
  let slowId = headId;
  for (let s = 0; s < k; s++) {
    const nd = nodes.find((x) => x.id === fastId);
    fastId = nd.next;
  }
  record(
    'fast_forward',
    'fast-forward',
    `快指针先走 ${k} 步：fast=${fastId === null ? '0' : fastId}，slow=${slowId}`,
    { fastId, slowId }
  );

  while (fastId !== null) {
    const fnd = nodes.find((x) => x.id === fastId);
    const snd = nodes.find((x) => x.id === slowId);
    fastId = fnd.next;
    slowId = snd.next;
    record(
      'move_both',
      'move-both',
      `快慢指针同步后移：fast=${fastId === null ? '0' : fastId}，slow=${slowId === null ? '0' : slowId}`,
      { fastId, slowId }
    );
  }

  const targetNode = nodes.find((x) => x.id === slowId);
  const okResult = { nodeId: targetNode.id, value: targetNode.value };
  record(
    'done',
    'done',
    `找到倒数第 ${k} 个节点：id=${targetNode.id}, value=${targetNode.value}`,
    { fastId, slowId },
    okResult
  );
  return { steps, result: { nodeId: targetNode.id, value: targetNode.value }, sourceVersion: SOURCE_VERSION, sourceLines: SOURCE_LINES };
}
