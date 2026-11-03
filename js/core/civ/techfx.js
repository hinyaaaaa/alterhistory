// 技術の効果（他のモジュールから参照する小さな関数）。値は techtree.js の fx から導く。v6.1.0 M3。
import { TECH, fxOf } from "./tech.js";
export const has = (g, key) => g.tech.known[key] != null;
/** 収容力への倍率。新石器以降（列 3 以降）の技術だけが効く（採集・農耕・牧畜そのものの効果は、生業ごとの密度の式に入っている）。和は逓減する（上限は約 2.4 倍） */
const dmMemo = new WeakMap(); // 知識が変わると cand の配列が作り直される。その配列を鍵に使い回す
export const densityMult = (g) => { const c = g.tech.cand; let v = c ? dmMemo.get(c) : undefined; if (v === undefined) { let s = 0; for (const k in g.tech.known) { const t = TECH[k]; if (t && t.col >= 3 && t.fx.cap) s += t.fx.cap; } v = 1 + 1.4 * (1 - Math.exp(-s / 1.4)); if (c) dmMemo.set(c, v); } return v; };
/** 軍事力の倍率（国家が採用した技術の攻撃の効果から）。martial は人口加重の軍事適性（states.js が更新。既定 1） */
export const milMult = (state, civ = null) => { let s = 0; for (const k in state.techAdopted) { const t = TECH[k]; if (t) s += fxOf(civ, t).off ?? 0; } return (state.martial ?? 1) * (1 + s) * (1 + (state.milBonus ?? 0)); };
/** 税収の倍率 */
export const taxMult = (state, civ = null) => { let s = 0; for (const k in state.techAdopted) { const t = TECH[k]; if (t) s += fxOf(civ, t).tax ?? 0; } return 1 + s; };
/** 防御の技術の効果の和（城壁など） */
export const defFx = (state, civ = null) => { let s = 0; for (const k in state.techAdopted) { const t = TECH[k]; if (t) s += fxOf(civ, t).def ?? 0; } return s; };
