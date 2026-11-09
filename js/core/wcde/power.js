// v6.1.0 M6: 戦力の共通定義。戦争研究所（予測・warlab.js）と実戦エンジン（warfare.js）は、必ずここの関数で戦力を出す（画面と AI と戦闘で別の数値を使わない。仕様 §8.4）。
//   陸の戦力 = 兵力 × 軍事倍率（技術の攻撃効果・軍事適性・装備・練度・ドクトリン）×（守りの加点）。海の戦力は水軍の規模 ×（海軍運用・海戦術）。
import { milMult } from "../civ/techfx.js";
import { stateCan } from "../civ/tech.js";
import { effective } from "./domains/effective.js";

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const navyShare = (st) => { const u = (st.military?.units ?? []).find((x) => x.kind === "navy"); return u && st.army > 0 ? clamp(u.size / Math.max(1, st.army)) : 0; };
export const landShare = (st) => 1 - navyShare(st);
export const fx = (st) => st.military?.fx ?? {};

/** v6.5.0: 編成（部隊の種類の配分）が陸の戦力に効く。歩兵だけの軍より、騎兵・銃兵・弓兵・守備兵が適度に混ざった軍のほうが強い（諸兵科連合 最大 +12%）。
 *  騎兵 +22%／銃兵 +35%／弓・投射兵 +10%（それぞれ配分に比例）。守備兵は攻めでは −10%、守りでは +45%（配分に比例）。編成を変えても、戦力は大きく振れない（おおむね ±10% 以内） */
export function armsMult(st, defending = false) {
  const us = (st.military?.units ?? []).filter((u) => u.kind !== "navy"), tot = us.reduce((a, u) => a + u.size, 0); if (!(tot > 0)) return 1;
  const sh = (k) => (us.find((u) => u.kind === k)?.size ?? 0) / tot, kinds = us.filter((u) => u.size / tot >= 0.1).length;
  return 1 + 0.04 * Math.min(3, Math.max(0, kinds - 1)) + 0.22 * Math.min(sh("cavalry"), 0.4) + 0.35 * Math.min(sh("firearms"), 0.5) + 0.1 * Math.min(sh("ranged"), 0.4) + sh("garrison") * (defending ? 0.45 : -0.1);
}
/** 陸の戦力（size を指定すると、その兵力ぶん）。守る側は防御の加点が付く */
export function landPower(civ, st, size = null, { defending = false } = {}) {
  const n = size ?? st.army * landShare(st);
  const attack = milMult(st, civ) * armsMult(st, defending) * (0.85 + 0.3 * effective(civ, st, "readiness"));
  const guard = defending ? 1 + ((st.defense ?? 0) + (st.milDef ?? 0)) * 0.5 : 1;
  return n * attack * guard;
}
/** 海の戦力。海戦術（war:naval）が無い水軍は弱い（沿岸の護衛程度） */
export function navalPower(civ, st, size = null) {
  const n = size ?? st.army * navyShare(st); if (!(n > 0)) return 0;
  const tech = stateCan(civ, st, "war:naval") ? 1.3 : stateCan(civ, st, "unit:navy") ? 1 : 0.4;
  return n * milMult(st, civ) * (1 + 1.2 * (fx(st).naval ?? 0)) * tech * (0.85 + 0.3 * effective(civ, st, "readiness"));
}
/** 補給の届く範囲（km）。技術（war:far）・兵站のドクトリン・政体で伸びる */
export const supplyRange = (civ, st) => 650 * (1 + 2.2 * (fx(st).logi ?? 0)) * (stateCan(civ, st, "war:far") ? 1.7 : 1) * (st.polity === "empire" ? 1.15 : 1);
/** 補給の度合い（0〜1）: 首都からの距離が範囲を超えるほど落ちる */
export const supplyAt = (civ, st, distKm) => clamp(1 - Math.max(0, distKm - supplyRange(civ, st)) / (supplyRange(civ, st) * 1.2));
/** 総合戦力（予測用）。陸 + 海の 0.35（陸戦の国と海戦の国を一つの値にまとめる）。疲労・国庫の持久力は warlab 側で重ねる */
export const totalPower = (civ, st) => landPower(civ, st) * 1 + navalPower(civ, st) * 0.35;
