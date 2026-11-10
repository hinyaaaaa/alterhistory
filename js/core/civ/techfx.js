// 技術の効果（他のモジュールから参照する小さな関数）。値は techtree.js の fx から導く。v6.1.0 M3。
import { TECH, fxOf } from "./tech.js";
export const has = (g, key) => g.tech.known[key] != null;
/** 収容力への倍率（v6.8.0）。新石器以降（列 3 以降）の技術の cap の和 s から、史実の人口の伸び（農耕→鉄器→農業革命→産業・化学肥料）に沿う倍率を引く。
 *  旧版は 1.4 で飽和（上限 2.4 倍）する式だったうえ、収容力の計算に掛かっていなかった（人口が 5000 年経っても伸びない原因）。s=0.37（農耕・牧畜・保存・住居）を 1 とし、全部そろう s≈2.35 で約 470 倍（現代の人口密度）。 */
const DM_POINTS = Object.freeze([[0.37, 0], [0.6, 0.9], [0.86, 2.0], [1.02, 2.6], [1.2, 3.0], [1.37, 3.45], [1.57, 4.0], [1.92, 4.9], [2.1, 5.4], [2.35, 6.15], [3, 6.8]]); // [s, ln 倍率]
export const densityMultOf = (s) => { if (s <= DM_POINTS[0][0]) return 1; for (let i = 1; i < DM_POINTS.length; i++) { const [x1, y1] = DM_POINTS[i], [x0, y0] = DM_POINTS[i - 1]; if (s <= x1) return Math.exp(y0 + ((s - x0) / (x1 - x0)) * (y1 - y0)); } return Math.exp(DM_POINTS[DM_POINTS.length - 1][1]); };
const dmMemo = new WeakMap(); // 知識が変わると cand の配列が作り直される。その配列を鍵に使い回す
export const densityMult = (g) => { const c = g.tech.cand; let v = c ? dmMemo.get(c) : undefined; if (v === undefined) { let s = 0; for (const k in g.tech.known) { const t = TECH[k]; if (t && t.col >= 3 && t.fx.cap) s += t.fx.cap; } v = densityMultOf(s); if (c) dmMemo.set(c, v); } return v; };
/** 軍事力の倍率（国家が採用した技術の攻撃の効果から）。martial は人口加重の軍事適性（states.js が更新。既定 1） */
export const milMult = (state, civ = null) => { let s = 0; for (const k in state.techAdopted) { const t = TECH[k]; if (t) s += fxOf(civ, t).off ?? 0; } return (state.martial ?? 1) * (1 + s) * (1 + (state.milBonus ?? 0)); };
/** 税収の倍率 */
export const taxMult = (state, civ = null) => { let s = 0; for (const k in state.techAdopted) { const t = TECH[k]; if (t) s += fxOf(civ, t).tax ?? 0; } return 1 + s; };
/** 防御の技術の効果の和（城壁など） */
export const defFx = (state, civ = null) => { let s = 0; for (const k in state.techAdopted) { const t = TECH[k]; if (t) s += fxOf(civ, t).def ?? 0; } return s; };
