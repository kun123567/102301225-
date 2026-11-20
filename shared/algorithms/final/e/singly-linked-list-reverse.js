// shared/algorithms/final/e/singly-linked-list-reverse.js
const SOURCE_VERSION = 'singly-linked-list-reverse-c-v1';
const NO_RESULT = Symbol('no-result');

const SOURCE_LINES = [
  { lineId: 'struct', text: 'struct Node { int value; Node* next; };' },
  { lineId: 'init', text: 'Node* list_reverse(Node* head) {' },
  { lineId: 'reverse-init', text: '  Node* prev = 0; Node* curr = head;' },
  { lineId: 'reverse-loop', text: '  while(curr != 0){ Node* nxt = curr->next;' },
  { lineId: 'reverse-link', text: '    curr->next = prev; prev = curr; curr = nxt; }' },
  { lineId: 'done', text: '  return prev;' },
  { lineId: 'close', text: '}' },
];

/**
 * 单链表逆置：只反转 next 指针，节点 id / value 全程不变；结果由 headId 顺 next 遍历产生
 * @param {{list:number[]}} input
 * @returns {{steps:any[],result:number[],sourceVersion:string,sourceLines:typeof SOURCE_LINES}}
 */
export function generateSinglyLinkedListReverseSteps({ list }) {
  const steps = [];
  const input = Array.isArray(list) ? [...list] : [];
  let nextAutoId = 0;
  const nodes = input.map((v) => ({ id: nextAutoId++, value: v, next: null }));
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
      algorithm: 'singly-linked-list-reverse',
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

  const collectByHead = () => {
    const arr = [];
    let cid = headId;
    while (cid !== null) {
      const nd = nodes.find((x) => x.id === cid);
      if (!nd) break;
      arr.push(nd.value);
      cid = nd.next;
    }
    return arr;
  };

  record('init', 'init', `原始链表 [${input.join(',')}]，开始原地逆置`);

  let prevId = null;
  let currId = headId;
  let round = 0;
  while (currId !== null) {
    const currNode = nodes.find((n) => n.id === currId);
    const nextSaveId = currNode.next;
    currNode.next = prevId;
    round += 1;
    record(
      'reverse_link',
      'reverse-link',
      `第 ${round} 步：节点 ${currId}（value=${currNode.value}）的 next 由 ${nextSaveId === null ? '0' : nextSaveId} 改为 ${prevId === null ? '0' : prevId}`,
      { headId: currId, prevId, currId, nextId: nextSaveId }
    );
    prevId = currId;
    currId = nextSaveId;
  }
  headId = prevId;

  const finalResult = collectByHead();
  record(
    'done',
    'done',
    `逆置完成，新头节点 headId=${headId === null ? '0' : headId}，节点 id 与 value 一一对应，链为 [${finalResult.join(',')}]`,
    {},
    finalResult
  );
  return { steps, result: collectByHead(), sourceVersion: SOURCE_VERSION, sourceLines: SOURCE_LINES };
}
