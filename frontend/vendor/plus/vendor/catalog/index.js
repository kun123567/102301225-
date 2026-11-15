/**
 * 目录（1 级 = 主题包，2 级 = 算法条目，点击 → 可视化界面）。
 *
 * 这是整个项目的唯一范围来源：docs 的两张总表、README 目录、界面下拉全部由它生成，
 * 避免「文档写一套、代码做另一套」。运行 `npm run docs` 重新生成。
 */
import { PKG_A } from './a.js';
import { PKG_B } from './b.js';
import { PKG_C } from './c.js';
import { PKG_D } from './d.js';
import { PKG_E } from './e.js';
import { PKG_F } from './f.js';
import { PKG_G } from './g.js';
import { DATA_STRUCTURES, DS_BY_ID, RENDERERS, BACKENDS, FAMILY_RULE, resolveStyle, styleOptions } from './datastructures.js';

export const PACKAGES = [PKG_A, PKG_B, PKG_C, PKG_D, PKG_E, PKG_F, PKG_G];
// 数据结构侧的工具也从这里再导出：界面与文档只认一个入口，
// 避免出现"从 index.js 导入了 datastructures.js 才有的名字"这类链接期错误（整页会静默失效）。
export { DATA_STRUCTURES, DS_BY_ID, RENDERERS, BACKENDS, FAMILY_RULE, resolveStyle, styleOptions };

/** 展开成扁平条目表：[{ pkg, itemId, uid, title, ... }] */
export const ITEMS = PACKAGES.flatMap((pkg) =>
  pkg.items.map((item) => ({
    ...item,
    pkg: pkg.id,
    pkgName: pkg.name,
    uid: `${pkg.id.toLowerCase()}/${item.id}`,
    variantCount: item.variants.length,
  })),
);

export const ITEM_BY_UID = Object.fromEntries(ITEMS.map((it) => [it.uid, it]));

export const TOTALS = {
  packages: PACKAGES.length,
  items: ITEMS.length,
  variants: ITEMS.reduce((n, it) => n + it.variants.length, 0),
  points: ITEMS.reduce((n, it) => n + (it.points || 0), 0),
  dataStructures: DATA_STRUCTURES.length,
};

export function itemOf(uid) {
  return ITEM_BY_UID[uid] || null;
}

/** 界面「数据结构」下拉：条目涉及的结构 + 可切换样式 */
export function dsOptionsFor(uid) {
  const item = itemOf(uid);
  if (!item) return [];
  return item.ds.map((id) => DS_BY_ID[id]).filter(Boolean);
}

/** 目录分组：按主题包，供 README 与 index.html 渲染 */
export function groupedCatalog() {
  return PACKAGES.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    title: pkg.title,
    doc: pkg.doc,
    items: pkg.items.map((item) => ({
      uid: `${pkg.id.toLowerCase()}/${item.id}`,
      title: item.title,
      points: item.points,
      variants: item.variants,
      ds: item.ds,
      style: item.style,
      focus: item.focus,
    })),
  }));
}
