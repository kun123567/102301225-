'use strict';
/**
 * trace.js -- 解析 __avc_trace.txt 为紧凑事件数组（前端负责 fold 成每一步的快照）
 *
 * 事件编码：
 *   ['E', depth, func]            进入函数
 *   ['X', depth]                  离开函数
 *   ['S', line]                   即将执行第 line 行
 *   ['V', line, name, kind, val]  变量值
 *   ['HA', addr, size, line]      堆分配
 *   ['HF', addr, line]            堆释放
 *   ['L', var, idx, key, ptr, more] 链表/树结点
 *   ['LE', var, count, shape]
 *   ['W', line, name, idx] / ['W', line, name, row, col]  数组写入标记
 *   ['I', line, name, shape, n]      声明记录（是否带初始化器）
 *   ['LIMIT']
 */
function parseTrace(text) {
  const events = [];
  let steps = 0, truncated = false;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const p = line.split('|');
    switch (p[0]) {
      case 'E': events.push(['E', +p[1] || 0, p[2] || '?']); break;
      case 'X': events.push(['X', +p[1] || 0]); break;
      case 'S': events.push(['S', +p[1] || 0]); steps++; break;
      case 'V': events.push(['V', +p[1] || 0, p[2] || '', p[3] || 'i', p.slice(4).join('|')]); break;
      case 'H':
        if (p[1] === 'A') events.push(['HA', Number(p[2]) || 0, +p[3] || 0, +p[4] || 0]);
        else events.push(['HF', Number(p[2]) || 0, +p[3] || 0]);
        break;
      case 'L':
        events.push(['L', p[1] || '', +p[2] || 0, p[3] || '', Number(p[4]) || 0, +p[5] || 0]);
        break;
      case 'LE': events.push(['LE', p[1] || '', +p[2] || 0, p[3] || 'list']); break;
      /* N / NE / M：统一图模型（PLAN_VIEWPORT §2）
       *   N|var|idx|value      NE|var|from|to|kind      M|var|k=v;k=v */
      case 'N': events.push(['N', p[1] || '', +p[2] || 0, p[3] == null ? '' : p[3]]); break;
      case 'NE': events.push(['NE', p[1] || '', +p[2] || 0, +p[3] || 0, p[4] || 'next']); break;
      case 'M': events.push(['M', p[1] || '', p.slice(2).join('|')]); break;
      /* NM|var|idx|key=value —— 结点语义属性（红黑 color / 线索 ltag），渲染器画角标用 */
      case 'NM': events.push(['NM', p[1] || '', +p[2] || 0, p.slice(3).join('|') || '']); break;
      /* W|line|name|idx  /  W|line|name|row|col —— 数组写入标记（`a[i] = …` 真正被写的下标）。
       * 判断"这格是不是未初始化"只认它和下面的 I 记录，不再拿数值大小猜。 */
      case 'W': events.push(['W', +p[1] || 0, p[2] || '', p[3] === '' ? -1 : Number(p[3]), p[4] === undefined ? undefined : Number(p[4])]); break;
      /* I|line|name|shape[|n]  —— 声明记录：0=声明时没初始化器、1/2=声明时就带初始化器 */
      case 'I': events.push(['I', +p[1] || 0, p[2] || '', p[3] == null ? '0' : String(p[3]), p[4] === undefined ? undefined : Number(p[4]), p[5] === undefined ? undefined : Number(p[5])]); break;
      case 'LIMIT': truncated = true; break;
      default: break;
    }
  }
  return { events, steps, truncated };
}

module.exports = { parseTrace };
