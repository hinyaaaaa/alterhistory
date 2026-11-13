// v6.12.0: 役職と国策の効果を合わせた、国家の小さなバフ・デバフ。シミュレーションの各所（税収・軍事・安定度・勢力の支持・条約・偵察）は、ここだけを見る。
//   アルゴリズム国家（役職も国策も持たない）は、すべて 0 になる（従来の挙動を変えない）。
import { officeEffects } from "./regimes.js";
import { policyEffects } from "./policies.js";
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), r4 = (x) => Math.round(x * 10000) / 10000, ZERO = Object.freeze({ stab: 0, tax: 0, mil: 0, def: 0, dipl: 0, scout: 0, tech: 0, fac: Object.freeze({}), office: null, policy: null });
export function stateFx(st, mi = null) {
  if (!st.offices?.length && !st.focus && typeof st.leader?.skill !== "number") return ZERO;
  const a = officeEffects(st, mi), b = policyEffects(st), fac = {}; for (const src of [a.fac, b.fac]) for (const [k, v] of Object.entries(src)) fac[k] = r4(clamp((fac[k] ?? 0) + v, -0.15, 0.15));
  const tech = clamp(a.tech + b.tech, -0.12, 0.12);
  return { stab: r4(clamp(a.stab + b.stab + 0.5 * (a.cult + b.cult), -0.08, 0.08)), tax: r4(clamp(a.tax + b.tax + 0.5 * tech, -0.15, 0.15)), mil: r4(clamp(a.mil + b.mil, -0.1, 0.12)), def: b.def, dipl: r4(clamp(a.dipl + b.dipl, -0.3, 0.35)), scout: r4(clamp(a.scout + b.scout, -0.25, 0.3)), tech: r4(tech), fac, office: a, policy: b };
}
/** 安定度の目標への加減（旧来の OFFICE_STABILITY の置き換え） */
export const stateStability = (st) => stateFx(st).stab;
