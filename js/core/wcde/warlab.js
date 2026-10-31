// v6 M7: 戦争研究所（予測）。仕様 §8。
//   ・二国が交戦したときの見通し（勝率・損耗・長期化・不確実性）を、現在の有効値（介入補正を含む）から決定的に算出する。純関数で、WorldState を変更しない。
//   ・AI の征服計画の判断（civ/ai.js の planCampaign）も、このモジュールの予測を使う。画面の数値と AI の判断材料を同じにするため（二重実装しない）。
//   ・予測は「確定した未来」ではない。不確実性（0〜1）と、勝率の幅（lo〜hi）を必ず添える。
//   ・入力が同じなら結果も同じ。キャッシュは「入力の署名」をキーにするので、入力が変われば古い値は使われない。
import { strength } from "../civ/diplomacy.js";
import { effective } from "./domains/effective.js";

export const WARLAB_MODEL = "warlab-1";
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const r3 = (x) => Math.round(x * 1000) / 1000;

/** 一国の戦力の入力（すべて有効値）。UI の「内訳」にもそのまま出す */
export function warInputs(civ, st) {
  const equip = effective(civ, st, "equipLevel"), readiness = effective(civ, st, "readiness"), fatigue = effective(civ, st, "fatigue"), industry = effective(civ, st, "industry");
  const sustain = clamp(st.treasury / (st.army * 0.05 + 10) / 24); // 国庫で何か月ぶん戦い続けられるか（24か月で満点）
  const base = strength(civ, st);
  return { army: st.army, equip: r3(equip), readiness: r3(readiness), fatigue: r3(fatigue), industry: Math.round(industry), stability: r3(st.stability), treasury: Math.round(st.treasury), sustain: r3(sustain), base: Math.round(base), power: Math.round(base * (1 - 0.3 * fatigue) * (0.85 + 0.15 * sustain)) };
}
const sig = (x) => [x.army, x.equip, x.readiness, x.fatigue, x.industry, x.stability, x.sustain, x.base].map((v) => Math.round(v * 100) / 100).join(",");

const logistic = (x) => 1 / (1 + Math.exp(-x));
/** 攻撃側 a が b に宣戦した場合の見通し */
export function predictWar(civ, aId, bId, cacheHost = null) {
  const a = civ.states[aId], b = civ.states[bId]; if (!a?.alive || !b?.alive || a.id === b.id) return null;
  const ia = warInputs(civ, a), ib = warInputs(civ, b), key = `${WARLAB_MODEL}|${aId}|${bId}|${sig(ia)}|${sig(ib)}`, cache = cacheHost ? (cacheHost._warlab ??= new Map()) : null;
  const hit = cache?.get(key); if (hit) return hit;
  const ratio = (ia.power + 1) / (ib.power + 1), lr = Math.log(ratio);
  // 不確実性: 練度が低い・安定していない・国力が小さい（情報が粗い）ほど大きい
  const unc = clamp(0.12 + 0.35 * (1 - (ia.readiness + ib.readiness) / 2) + 0.2 * (1 - (ia.stability + ib.stability) / 2) + 0.1 / (1 + Math.log10(1 + Math.min(ia.industry, ib.industry) / 1000)), 0.05, 0.9);
  const win = (l) => { const raw = logistic(1.6 * l), stale = 0.35 * Math.exp(-(l * l) / 0.5); return { a: (1 - stale) * raw, b: (1 - stale) * (1 - raw), s: stale }; };
  const mid = win(lr), lo = win(lr - unc), hi = win(lr + unc);
  const lossA = clamp(0.08 + 0.25 / (1 + ratio) + 0.1 * mid.s, 0.02, 0.6), lossB = clamp(0.08 + 0.25 * ratio / (1 + ratio) + 0.1 * mid.s, 0.02, 0.6); // 軍の何割を失う見込みか
  const months = Math.round(clamp(6 + 30 * mid.s + 14 * (1 - Math.abs(mid.a - mid.b)), 4, 72));
  const factors = [["army", "兵力"], ["equip", "装備水準"], ["readiness", "練度・即応"], ["fatigue", "疲労度"], ["sustain", "国庫の持久力"], ["power", "総合戦力"]].map(([k, ja]) => ({ key: k, ja, a: ia[k], b: ib[k] }));
  const out = { model: WARLAB_MODEL, month: civ.monthIndex, aId, bId, inputs: { a: ia, b: ib }, ratio: r3(ratio), pAWin: r3(mid.a), pBWin: r3(mid.b), pStalemate: r3(mid.s), pAWinRange: [r3(lo.a), r3(hi.a)], lossA: r3(lossA), lossB: r3(lossB), months, uncertainty: r3(unc), factors };
  if (cache) { if (cache.size > 4000) cache.clear(); cache.set(key, out); } return out;
}
