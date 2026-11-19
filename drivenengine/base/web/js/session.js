/**
 * session.js -- 调试器内核（M2）
 *
 * 把 /api/trace 的事件流 fold 成"每一步的内存快照"：
 *   frames（活动记录：函数/深度/局部变量/模拟地址）
 *   heap（动态分配块，模拟地址 9996 起向低）
 *   lists（链表/树结点 + 形状）
 *
 * 设计要点（对齐 10_viz_principles）：
 *  - 原版"每帧重建对象列表再整幅重绘" → 这里等价为"每次 seek 重建 snapshot 对象"
 *  - 顺序单步必须 O(1)：缓存上一次状态，向前步进只在缓存上增量 apply；回退才重建
 *  - 地址是模拟的：栈区从 0 向高、堆区从 9996 向低（AnyviewC 十进制编址语义）
 *  - **显示栈与数据栈分离**：第 k 步的可见活动记录 = "第 k 条 S 事件到达那一刻的活帧"，
 *    因为 S 在语句执行前发出 —— 于是"单步停在 return 语句"时该帧仍可见（教学直觉），
 *    而变量归属仍按事件发生的真实深度（V 挂当前栈顶），不会挂错帧。
 *
 * 纯逻辑、无 DOM，node 可直接测。
 */
(function (global) {
  'use strict';
  const AVC = global.AVC = global.AVC || {};

  const FRAME_SLOT = 64;      // 每个活动记录预留 64 字节（模拟）
  const VAR_SLOT = 4;         // 每个变量占 4 字节（模拟）
  const HEAP_TOP = 9996;      // 堆区顶（向低分配）

  function newState() {
    return {
      seq: 0,                 // 已消费的事件下标
      step: -1,               // 已完成的步号（-1 = 还没执行任何语句）
      line: 0,
      frames: [],             // 数据栈：[{fn, depth, base, slot, addrMap, vars:Map}]
      display: [],            // 显示栈：本条语句开始时活帧的快照（引用同一批帧对象）
      sp: 0,
      heap: [],               // [{real, addr, size, state, line}]
      heapCursor: HEAP_TOP,
      lists: {},              // var -> {shape, count, nodes:[]}
      nxm: {},                // var -> [N/NE/M 事件]（统一图模型，V2）
      truncated: false,
    };
  }

  function frameVarAddr(frame, name) {
    let slot = frame.addrMap[name];
    if (slot == null) {
      slot = frame.slot++;
      frame.addrMap[name] = slot;
    }
    return frame.base + slot * VAR_SLOT;
  }

  function apply(st, ev) {
    switch (ev[0]) {
      case 'E': {
        const f = {
          fn: ev[2] || '?',
          depth: ev[1] | 0,
          base: st.sp,
          slot: 0,
          addrMap: {},
          vars: new Map(),
        };
        st.frames.push(f);
        st.sp += FRAME_SLOT;
        break;
      }
      case 'X': {
        if (st.frames.length) {
          st.frames.pop();
          st.sp = Math.max(0, st.sp - FRAME_SLOT);
        }
        break;
      }
      case 'S':
        st.step++;
        st.line = ev[1] | 0;
        // S 在语句执行前发出 → 此刻的活帧就是这一步"应该看见"的活动记录
        st.display = st.frames.slice();
        break;
      case 'V': {
        const f = st.frames[st.frames.length - 1];
        if (!f) break;
        f.vars.set(ev[2], { kind: ev[3], value: ev[4] });
        break;
      }
      case 'HA': {
        const real = ev[1], size = ev[2] || 4, line = ev[3] || 0;
        if (!real) break;
        const sz = Math.max(4, Math.ceil(size / 4) * 4);
        st.heapCursor -= sz;
        st.heap.push({ real, addr: st.heapCursor, size, state: 'used', line });
        break;
      }
      case 'HF': {
        const real = ev[1];
        for (let i = st.heap.length - 1; i >= 0; i--) {
          if (st.heap[i].real === real) { st.heap[i].state = 'freed'; break; }
        }
        break;
      }
      case 'L': {
        const v = ev[1];
        const L = st.lists[v] || (st.lists[v] = { shape: 'list', count: 0, nodes: [] });
        // 每次 dump 都是完整重发：idx=0 表示新一轮遍历开始 → 清掉旧结点，
        // 否则同一变量的结点会跨步无限累积（对应原版"重建对象列表"语义）
        if ((ev[2] | 0) === 0) L.nodes = [];
        L.nodes.push({ idx: ev[2] | 0, key: ev[3], ptr: ev[4], more: ev[5] ? 1 : 0 });
        break;
      }
      case 'LE': {
        const v = ev[1];
        const L = st.lists[v] || (st.lists[v] = { shape: 'list', count: 0, nodes: [] });
        L.count = ev[2] | 0;
        L.shape = ev[3] || 'list';
        break;
      }
      case 'LIMIT':
        st.truncated = true;
        break;
      /* ---- 统一图模型：N / NE / M（V2 采集层直接产出，不再经 L/LE）---- */
      case 'N': {
        const v = ev[1];
        const A = st.nxm[v] || (st.nxm[v] = []);
        // idx=0 表示"本轮完整 dump 开始"（同 L 事件的 L.nodes=[] 语义）：
        // 必须把上一轮的 N 与 NE 一起清掉，否则 fromEvents 会读到上一轮（甚至第一轮）
        // 的结点值 —— 表现就是"方框里的数字永远不变"。
        if ((ev[2] | 0) === 0) {
          for (let i = A.length - 1; i >= 0; i--) {
            if (A[i][0] === 'N' || A[i][0] === 'NE') A.splice(i, 1);
          }
        }
        A.push(['N', v, ev[2] | 0, ev[3]]);
        break;
      }
      case 'NE': {
        const v = ev[1];
        const A = st.nxm[v] || (st.nxm[v] = []);
        A.push(['NE', v, ev[2] | 0, ev[3] | 0, ev[4] || 'next']);
        break;
      }
      case 'M': {
        const v = ev[1];
        const A = st.nxm[v] || (st.nxm[v] = []);
        const kv = String(ev[2] || '');
        A.push(['M', v, kv]);
        // begin=1：本轮完整 dump 从这条 M 开始（采集层 __avc_len 发出）——
        // 必须清掉上一轮的 N/NE，否则结点值会冻结在早期轮次、边会无限累积。
        // len=0 也清（空容器不留残影）。
        if (/(?:^|;)begin=1(?:;|$)/.test(kv) || /(?:^|;)len=0(?:;|$)/.test(kv)) {
          for (let i = A.length - 1; i >= 0; i--) {
            if (A[i][0] === 'N' || A[i][0] === 'NE') A.splice(i, 1);
          }
        }
        break;
      }
      /* NM：结点语义属性（红黑 color / 线索 ltag）—— 与同一轮 N/NE 同生共死 */
      case 'NM': {
        const v = ev[1];
        const A = st.nxm[v] || (st.nxm[v] = []);
        A.push(['NM', v, ev[2] | 0, ev[3] || '']);
        break;
      }
      default:
        break;
    }
  }

  function snapshot(st) {
    const frames = st.display.map(f => {
      const vars = [];
      for (const [name, v] of f.vars) {
        vars.push({ name, kind: v.kind, value: v.value, addr: frameVarAddr(f, name) });
      }
      vars.sort((a, b) => a.addr - b.addr);
      return { fn: f.fn, depth: f.depth, base: f.base, sp: f.base + f.slot * VAR_SLOT, vars };
    });
    const lists = {};
    for (const k in st.lists) {
      const L = st.lists[k];
      lists[k] = { shape: L.shape, count: L.count, nodes: L.nodes.slice() };
    }
    const sp = frames.length ? frames[frames.length - 1].sp : 0;
    const nxm = {};
    for (const k in st.nxm) nxm[k] = st.nxm[k].slice();
    return {
      step: st.step,
      line: st.line,
      depth: frames.length,
      frames,
      heap: st.heap.map(h => ({ addr: h.addr, size: h.size, state: h.state, line: h.line })),
      lists,
      nxm,
      sp,
      heapCursor: st.heapCursor,
      truncated: st.truncated,
    };
  }

  function Session(trace) {
    this.events = (trace && trace.events) || [];
    this.structure = (trace && trace.structure) || null;
    this.truncated = !!(trace && trace.truncated);
    this.maxSteps = (trace && trace.maxSteps) || 0;
    this.totalSteps = 0;
    for (const e of this.events) if (e[0] === 'S') this.totalSteps++;
    this._st = newState();
    this._cacheStep = -1;
  }

  Session.prototype.reset = function () {
    this._st = newState();
    this._cacheStep = -1;
  };

  /** 推进到第 target 步（0 基），返回快照 */
  Session.prototype.snapshotAt = function (target) {
    target = Math.max(-1, Math.min(target, this.totalSteps - 1));
    if (target < this._cacheStep) this.reset();
    const st = this._st;
    while (st.step < target && st.seq < this.events.length) {
      apply(st, this.events[st.seq++]);
    }
    // 把当前步的剩余事件（变量快照、堆事件、函数进出）也消费掉
    while (st.step === target && st.seq < this.events.length) {
      const ev = this.events[st.seq];
      if (ev[0] === 'S') break;         // 下一条语句开始 → 停
      apply(st, this.events[st.seq++]);
    }
    this._cacheStep = st.step;
    return snapshot(st);
  };

  /** 从 from 之后找到第一条命中断点集合的行（用于"运行到断点"） */
  Session.prototype.nextBreakpointStep = function (from, bpSet) {
    if (!bpSet || !bpSet.size) return -1;
    let n = -1;
    for (const e of this.events) {
      if (e[0] !== 'S') continue;
      n++;
      if (n <= from) continue;
      if (bpSet.has(e[1])) return n;
    }
    return -1;
  };

  /** 只取"局部变量"（各帧合并），供变量观察窗使用 */
  Session.prototype.flattenVars = function (snap) {
    const out = [];
    for (const f of snap.frames) {
      for (const v of f.vars) out.push(Object.assign({ frame: f.fn, depth: f.depth }, v));
    }
    return out;
  };

  AVC.session = {
    create: (trace) => new Session(trace),
    Session,
    HEAP_TOP,
    FRAME_SLOT,
    VAR_SLOT,
  };
})(typeof window !== 'undefined' ? window : globalThis);
