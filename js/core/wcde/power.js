// v6.1.0 M6: 戦力の共通定義。戦争研究所（予測・warlab.js）と実戦エンジン（warfare.js）は、必ずここの関数で戦力を出す（画面と AI と戦闘で別の数値を使わない。仕様 §8.4）。
//   陸の戦力 = 兵力 × 軍事倍率（技術の攻撃効果・軍事適性・装備・練度・ドクトリン）×（守りの加点）。海の戦力は水軍の規模 ×（海軍運用・海戦術）。
import { milMult } from "../civ/techfx.js";
import { stateCan } from "../civ/tech.js";
import { effective } from "./domains/effective.js";
import { UNIT_TYPES, serviceOf, headsOf } from "./orbat.js";

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
/** v6.13.0: 軍ごとの割合（海軍・空軍の人数 ÷ 総兵力）。陸はその残り */
export const navyShare = (st) => (st.army > 0 ? clamp(headsOf(st, "sea") / Math.max(1, st.army)) : 0);
export const airShare = (st) => (st.army > 0 ? clamp(headsOf(st, "air") / Math.max(1, st.army)) : 0);
export const spaceShare = (st) => (st.army > 0 ? clamp(headsOf(st, "space") / Math.max(1, st.army)) : 0);
export const landShare = (st) => Math.max(0, 1 - navyShare(st) - airShare(st) - spaceShare(st));
export const fx = (st) => st.military?.fx ?? {};

/** 編成（陸軍の兵種の人数）が陸の戦力に効く。歩兵だけの軍より、騎兵・銃兵・砲兵・機甲などが適度に混ざった軍のほうが強い（諸兵科連合 最大 +12%）。
 *  v6.5.0 の騎兵 +22%／銃兵 +35%／弓・投射兵 +10%（人数の割合に比例）に加え、v6.13.0 で 砲兵・機甲・機械化・特殊・海兵・自律・強化装甲を足した。
 *  守備兵は攻めでは −10%、守りでは +45%。予備役は攻めで弱く（−15%）、守りで少し粘る（+10%）。編成を変えても、戦力は大きく振れない（おおむね ±10〜15% 以内）。
 *  ドクトリンの機甲運用（armor）は、機甲・機械化の割合に応じて効く。 */
const COEF = Object.freeze({ cavalry: [0.22, 0.4], firearms: [0.35, 0.5], ranged: [0.1, 0.4], artillery: [0.45, 0.25], armor: [0.9, 0.25], mechanized: [0.5, 0.25], special: [0.8, 0.05], marine: [0.3, 0.1], autonomous: [1.0, 0.2], powered: [1.2, 0.1] });
export function armsMult(st, defending = false) {
  const us = (st.military?.units ?? []).filter((u) => serviceOf(u.kind) === "land"), tot = us.reduce((a, u) => a + u.size, 0); if (!(tot > 0)) return 1;
  const sh = (k) => (us.find((u) => u.kind === k)?.size ?? 0) / tot, kinds = us.filter((u) => u.size / tot >= 0.1).length;
  let m = 1 + 0.04 * Math.min(3, Math.max(0, kinds - 1)); for (const k in COEF) m += COEF[k][0] * Math.min(sh(k), COEF[k][1]);
  m += sh("garrison") * (defending ? 0.45 : -0.1) + sh("levy") * (defending ? 0.1 : -0.15);
  m += (fx(st).armor ?? 0) * Math.min(0.6, sh("armor") + sh("mechanized") + sh("powered")) * 2;
  return m;
}
/** 航空支援（0〜0.45）。空軍の人数（兵種ごとの重み）÷ 陸の人数 の比と、ドクトリンの航空運用。戦闘では、両軍の差が地上戦の戦力に掛かる（制空権） */
const AIR_W = Object.freeze({ air_corps: 0.6, fighter: 1.0, bomber: 0.9, helicopter: 0.8, drone: 0.7, missile: 0.9, strategic: 0.3, cyber: 0.4, orbital: 0.6, satellite: 0.5 });
export function airPower(st) { let p = 0; for (const u of st.military?.units ?? []) if (AIR_W[u.kind]) p += u.size * AIR_W[u.kind]; return p; }
export function airSupport(st) {
  const ap = airPower(st); if (!(ap > 0)) return 0; const land = Math.max(1, st.army * landShare(st));
  return clamp((2 * ap) / (land + ap) * (1 + 2 * (fx(st).air ?? 0)), 0, 0.45);
}
/** 戦略抑止（0〜0.2）。戦略ロケット（核戦力）の規模。守りの戦力に加わる */
export function deterrence(st) { const n = (st.military?.units ?? []).find((u) => u.kind === "strategic")?.size ?? 0; return clamp(Math.sqrt(n) / 600, 0, 0.2); }
/** 海軍の構成（主力艦・潜水艦・空母の割合）が海の戦力に効く */
export function navalMix(st) {
  const us = (st.military?.units ?? []).filter((u) => serviceOf(u.kind) === "sea"), tot = us.reduce((a, u) => a + u.size, 0); if (!(tot > 0)) return 1;
  const sh = (k) => (us.find((u) => u.kind === k)?.size ?? 0) / tot;
  return 1 + 0.35 * Math.min(sh("capital_ship"), 0.4) + 0.3 * Math.min(sh("submarine"), 0.3) * (1 + 3 * (fx(st).subs ?? 0)) + 0.5 * Math.min(sh("carrier"), 0.2) * (1 + 2 * (fx(st).air ?? 0));
}
/** 陸の戦力（size を指定すると、その兵力ぶん）。守る側は防御の加点が付く */
export function landPower(civ, st, size = null, { defending = false } = {}) {
  const n = size ?? st.army * landShare(st);
  const attack = milMult(st, civ) * armsMult(st, defending) * (0.85 + 0.3 * effective(civ, st, "readiness"));
  const guard = defending ? 1 + ((st.defense ?? 0) + (st.milDef ?? 0)) * 0.5 + deterrence(st) : 1;
  return n * attack * guard * (1 + (fx(st).mob ?? 0)); // v6.18.0: 人海戦術は、同じ兵力でも多く動員して戦う
}
/** 海の戦力。海戦術（war:naval）が無い水軍は弱い（沿岸の護衛程度） */
export function navalPower(civ, st, size = null) {
  const n = size ?? st.army * navyShare(st); if (!(n > 0)) return 0;
  const tech = stateCan(civ, st, "war:naval") ? 1.3 : stateCan(civ, st, "unit:navy") ? 1 : 0.4;
  return n * milMult(st, civ) * (1 + 1.2 * (fx(st).naval ?? 0)) * tech * navalMix(st) * (1 + 0.9 * (fx(st).mob ?? 0)) * (0.85 + 0.3 * effective(civ, st, "readiness")); // v6.18.0: 人海戦術の海軍は、艦を多く動員する
}
/** 補給の届く範囲（km）。技術（war:far）・兵站のドクトリン・政体で伸びる */
export const supplyRange = (civ, st) => 650 * (1 + 2.2 * (fx(st).logi ?? 0)) * (stateCan(civ, st, "war:far") ? 1.7 : 1) * (st.polity === "empire" ? 1.15 : 1);
/** 補給の度合い（0〜1）: 首都からの距離が範囲を超えるほど落ちる */
export const supplyAt = (civ, st, distKm) => clamp(1 - Math.max(0, distKm - supplyRange(civ, st)) / (supplyRange(civ, st) * 1.2));
/** 総合戦力（予測用）。陸 + 海の 0.35（陸戦の国と海戦の国を一つの値にまとめる）。疲労・国庫の持久力は warlab 側で重ねる */
export const totalPower = (civ, st) => landPower(civ, st) * 1 + navalPower(civ, st) * 0.35;
