// shared/algorithms/final/e/singly-linked-list-delete.js
const SOURCE_VERSION = 'singly-linked-list-delete-c-v1';
const NO_RESULT = Symbol('no-result');

const SOURCE_LINES = [
  { lineId: 'struct', text: 'struct Node { int value; Node* next; };' },
  { lineId: 'init', text: 'Node* list_delete(Node* head, int pos) {' },
  { lineId: 'check', text: '  if(pos < 0 || head == 0) return head;   /* pos 必须是非负整数且在表内 */' },
  { lineId: 'delete-head', text: '  if(pos == 0){ Node* d = head; head = head->next; delete d; return head; }' },
  { lineId: 'find-prev', text: '  Node* prev = head; for(int i=0;i<pos-1;i++){ if(prev == 0) return head; prev = prev->next; }' },
  { lineId: 'delete-mid', text: '  if(prev == 0 || prev->next == 0) return head; Node* d = prev->next; prev->next = d->next; delete d;' },
  { lineId: 'done', text: '  return head;' },
  { lineId: 'close', text: '}' },
];

/**
 * 单链表删除：被删节点 id 永久废弃、不回收不复用；结果由 headId 顺 next 遍历产生
 * @param {{list:number[],pos:number}} input
 * @returns {{steps:any[],result:number[]|null,sourceVersion:string,sourceLines:typeof SOURCE_LINES}}
 */
export function generateSinglyLinkedListDeleteSteps({ list, pos }) {
  const steps = [];
  const input = Array.isArray(list) ? [...list] : [];
  let nextAutoId = 0;
  let nodes = input.map((v) => ({ id: nextAutoId++, value: v, next: null }));
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
      algorithm: 'singly-linked-list-delete',
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

  record('init', 'init', `原始链表 [${input.join(',')}]，删除下标 ${pos} 处的节点`);

  if (!Number.isInteger(pos) || pos < 0 || pos >= input.length) {
    record('error', 'check', `非法位置 pos=${pos}：必须是 0 到 ${input.length - 1} 之间的整数`, {}, null);
    return { steps, result: null, sourceVersion: SOURCE_VERSION, sourceLines: SOURCE_LINES };
  }

  if (pos === 0) {
    const oldHeadId = headId;
    const oldHead = nodes.find((n) => n.id === oldHeadId);
    headId = oldHead.next;
    record(
      'delete_head',
      'delete-head',
      `删除头节点 ${oldHeadId}（该 id 永久废弃不复用），新头节点 ${headId === null ? '0' : headId}`
    );
  } else {
    let prevId = headId;
    for (let i = 0; i < pos - 1; i++) {
      prevId = nodes.find((n) => n.id === prevId).next;
    }
    const prev = nodes.find((n) => n.id === prevId);
    const delId = prev.next;
    const delNd = nodes.find((n) => n.id === delId);
    prev.next = delNd.next;
    record(
      'delete_mid',
      'delete-mid',
      `删除节点 ${delId}（该 id 永久废弃不复用），前驱 ${prevId} 的 next 改为 ${delNd.next === null ? '0' : delNd.next}`
    );
  }

  const finalResult = collectByHead();
  record('done', 'done', `删除完成，链表从 headId=${headId} 遍历得到 [${finalResult.join(',')}]`, {}, finalResult);
  return { steps, result: collectByHead(), sourceVersion: SOURCE_VERSION, sourceLines: SOURCE_LINES };
}
