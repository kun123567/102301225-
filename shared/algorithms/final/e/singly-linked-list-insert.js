// shared/algorithms/final/e/singly-linked-list-insert.js
const SOURCE_VERSION = 'singly-linked-list-insert-c-v1';
const NO_RESULT = Symbol('no-result');

const SOURCE_LINES = [
  { lineId: 'struct', text: 'struct Node { int value; Node* next; };' },
  { lineId: 'init', text: 'Node* list_insert(Node* head, int pos, int value) {' },
  { lineId: 'check', text: '  if(pos < 0) return head;   /* pos 必须是非负整数，且不超过表长 */' },
  { lineId: 'create', text: '  Node* newNode = new Node(); newNode->value = value; newNode->next = 0;' },
  { lineId: 'link-head', text: '  if(pos == 0){ newNode->next = head; return newNode; }' },
  { lineId: 'find-prev', text: '  Node* prev = head; for(int i=0;i<pos-1;i++){ if(prev == 0) return head; prev = prev->next; }' },
  { lineId: 'link-mid', text: '  if(prev == 0) return head; newNode->next = prev->next; prev->next = newNode;' },
  { lineId: 'done', text: '  return head;' },
  { lineId: 'close', text: '}' },
];

/**
 * 单链表插入：单次运行周期内节点 ID 稳定、绝不重分配/复用；输出值序列由 headId 顺 next 遍历产生
 * @param {{list:number[],pos:number,value:number}} input
 * @returns {{steps:any[],result:number[]|null,sourceVersion:string,sourceLines:typeof SOURCE_LINES}}
 */
export function generateSinglyLinkedInsertSteps({ list, pos, value }) {
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
      algorithm: 'singly-linked-list-insert',
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

  record('init', 'init', `原始链表 [${input.join(',')}]，在下标 ${pos} 处插入 ${value}`);

  if (!Number.isInteger(pos) || pos < 0 || pos > input.length) {
    record('error', 'check', `非法位置 pos=${pos}：必须是 0 到 ${input.length} 之间的整数`, {}, null);
    return { steps, result: null, sourceVersion: SOURCE_VERSION, sourceLines: SOURCE_LINES };
  }

  const newNodeId = nextAutoId++;
  nodes.push({ id: newNodeId, value, next: null });
  record('create_node', 'create', `新建节点 id=${newNodeId}, value=${value}（该 id 全局不再复用）`);

  if (pos === 0) {
    const oldHeadId = headId;
    nodes.find((n) => n.id === newNodeId).next = oldHeadId;
    headId = newNodeId;
    record(
      'link_head_insert',
      'link-head',
      `头插：新节点 ${newNodeId} 的 next 指向原头节点 ${oldHeadId === null ? '0' : oldHeadId}`
    );
  } else {
    let currId = headId;
    for (let i = 0; i < pos - 1; i++) {
      const cn = nodes.find((n) => n.id === currId);
      currId = cn.next;
    }
    const currNode = nodes.find((n) => n.id === currId);
    const newNode = nodes.find((n) => n.id === newNodeId);
    newNode.next = currNode.next;
    currNode.next = newNodeId;
    record(
      'link_mid_insert',
      'link-mid',
      `在节点 ${currId} 之后插入新节点 ${newNodeId}，只修改 next 指针，节点 id 全程不变`
    );
  }

  const finalResult = collectByHead();
  record('done', 'done', `插入完成，链表从 headId=${headId} 遍历得到 [${finalResult.join(',')}]`, {}, finalResult);
  return { steps, result: collectByHead(), sourceVersion: SOURCE_VERSION, sourceLines: SOURCE_LINES };
}
