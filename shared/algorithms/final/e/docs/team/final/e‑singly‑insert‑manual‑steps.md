# E包：单链表插入 人工步骤记录
模块：singly‑linked‑list‑insert.js
接口：generateSinglyLinkedInsertSteps({list, pos, value})

## 测试样例
输入：list=[1,3], pos=1, value=2
预期输出链表：[1,2,3]

## 人工分步记录（对应生成的steps轨迹）
1. init：原始链表 [1,3]，pos=1，待插入值=2；节点id：0→1→null
2. check‑pos：校验pos=1为合法整数，pos没有超出链表长度
3. create‑node：新建节点 newId=2，value=2，next=null
4. find‑pre：寻找pos‑1=0号前驱节点，curId=0
5. link：修改指针；新节点next指向原cur.next(1号)；cur(0号).next指向新节点2；
6. 重新刷新全部节点id与next指针：id0:1 next=2；id1:2 next=1；id2:3 next=null
7. sorted‑done：插入完成，最终链表 [1,2,3]

## 边界用例人工记录
1. 头插 pos=0：新建节点，新节点next指向原头，更新头指针
2. 尾插 pos=list.length：遍历到最后一个节点，挂上新节点
3. 非法输入：pos负数 / pos小数 / pos越界 → event:error，result=null

## 回放校验要点
1. 每一步array、nodes必须是快照副本，外部修改原始list，历史步骤帧不变化
2. error场景顶层result与最后一步step.result都为null
3. lineId与SOURCE_LINES C源码行一一对应，支持源码高亮定位
