# 硬编码审计：C~F（以及 A~G 全量）

> 复现：`node tools\hardcode-audit.mjs`（键名/接口覆盖）、`node tools\driven-audit.mjs`（**驱动性：是不是真的由策略摆**）
> 判定基准：**排版层唯一识别入口** `roleOfPrim()`（`app/layout-policy.js`）——审计与代码用同一个函数。

## 0. 第一轮的结论是错的（记录在案）

第一轮我用"键名认不认识"当判据，得出"结构级硬编码 = 0"。**这个判据有洞**：
`找倒数第 K 个结点` 的"答案"徽标 `nb-*` 明明"认识"，但它的位置是渲染器写死的 `nodeBoxY - 10`，
style 3 的 pass 链里根本没有 `badge` —— **认识 ≠ 管得着**。

第二轮改成三条硬证据（判据写进接口 `ROLE_CLASS`）：

| 判据 | 含义 | 怎么看 |
|---|---|---|
| ① owner pass | 这个角色有没有 pass 负责摆 | `PASS_OWNS` 表 × 该 style 的 pass 链 |
| ② 扰动自愈 | 把它挪到别的图元身上，polish 能不能摆开 | 实测率 |
| ③ 默认位置归属 | 不扰动的一帧里，polish 会不会改它的坐标 | 改过 = 策略掌默认 |

## 1. 第二轮的判定（`driven-audit.mjs`，C~F 1513 层）

按 `ROLE_CLASS` 分档，**只有"标注/让位"类才判硬编码**：

```
档位         style 角色         样本  owner pass  自愈率   默认位置归属     结论
reserve     1   axisLabel   720   有         100%   策略 425/425层     ✓
reserve     1   header      360   有         100%   —                  ✓
annotation  1   mark         47   有         100%   策略 47/47层       ✓
annotation  1   markLabel    47   有         100%   策略 47/47层       ✓
annotation  1   pointer     467   有         100%   策略 144/144层     ✓
annotation  3   badge        97   有         100%   策略 60/60层       ✓   ← 这条就是上一轮漏掉的
annotation  3   pointer     208   有         100%   策略 71/71层       ✓
annotation  7   pointer      79   有         100%   —                  ✓
annotation  8   pointer      19   有         100%   策略 27/27层       ✓
annotation  9   badge       223   有         100%   策略 136/136层     ✓
annotation  9   edgeTag     108   有         100%   策略 65/65层       ✓
annotation  9   pointer     106   有         100%   策略 58/58层       ✓
annotation 10   badge        25   有         100%   策略 14/14层       ✓
annotation 10   pointer     102   有         100%   策略 51/51层       ✓
reserve    10   header      102   无         100%   —                  ✓

仍"硬编码"（annotation/reserve 且自愈率<20%）：0 组
```

（第一版审计里 pointer 只有 41~70%，那是我自己的度量 bug：把"气泡整个装进格子"算成了压叠，
与策略的 `containOk` 口径不一致；改齐后 100%。）

## 2. 所以"还有哪些可视化是硬编码"——准确答案

**标注（气泡/徽标/边标签/区间框/标题让位）：没有硬编码了**，C~F 全部由策略摆（并能自愈）。

**仍然是渲染器写死的是这 4 类**，且都属于"设计如此"或"成本不合理"：

| # | 仍然写死的东西 | 范围 | 为什么保留 |
|---|---|---|---|
| 1 | **结构布局**（结点/边/格的位置与形状） | style 1/3/6/7/8/10 全部；style 9 由 `tidy` 接管 | 那正是 06 复原目标：每族怎么画是渲染器的职责 |
| 2 | **标注的默认偏移**（`cell.y-14`、link `+34`、graph `nodeR+18`、stack `+34`…） | 6 个渲染器各一套 | 冲突时策略会修；"默认长什么样"算渲染器的设计，跨风格统一会改变现有观感 |
| 3 | **画法换算表**（`vendor/app/adapt.js`） | 下拉"画法"的 style 有损映射 | 固定表，属设计；扩就得改表 |
| 4 | **内容级文字/装饰**（`nft/tnv/tni/gv/cht/rht/tri/null/cap/bottom/link/ne/nf`） | 各渲染器 | 只当障碍参与压叠计算，登记角色不改变任何行为 |

## 3. 本轮真正修掉的东西

- `style 3`（链表）pass 链加 `badge`：`答案` 这类结点徽标改由策略摆（`badgeGap=16`，撞了让位）；
- `nodeGeom()`：徽标支持**方框结点**（`nfill-*`）与 **text 徽标**（原来按 chip 量会偏大 14px）；
- `ROLE_CLASS`（annotation / reserve / structure）写进接口，审计按档位用不同实验；
- `driven-audit.mjs`：扰动实验 + 默认归属，**发现漏网会 exit 1**（不再靠我口头保证）。

## 4. 结论

- **C~F 的标注类可视化：接口化、0 漏网**（自愈率 100%，默认位置由策略掌控）。
- **结构布局仍是渲染器硬编码**——这是刻意保留的设计，不是缺口。
- 想进一步"接口化"的下一步只有一件值得做：把标注的**默认偏移**也收进 `POLICY`（统一跨风格间距）。
