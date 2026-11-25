// v7: 国の指標の推移（画面の読み取りモデル。世界には書かない）。月が進むたびに 1 点ずつ記録し、直近 24 か月だけ持つ。
//   「先月の変化」「前月との差」「12 か月の推移」の元になる。世界を読み込み直すと空に戻る（推移はそこから貯まる）。
import { totalPower } from "../../core/wcde/power.js";
import { effective } from "../../core/wcde/domains/effective.js";
import { taxMult } from "../../core/civ/techfx.js";
const KEEP = 24;
const store = new WeakMap(); // civ → { [stateId]: [{m, pop, treasury, stability, power, legit, tax, trade}] }
export function sample(civ, st) {
  if (!st) return [];
  let all = store.get(civ);
  if (!all) store.set(civ, (all = {}));
  const a = (all[st.id] ??= []);
  if (a.length && a[a.length - 1].m === civ.monthIndex) return a;
  const tax = st.pop * st.policy.tax * 0.0012 * taxMult(st),
    trade = effective(civ, st, "tradeIncome") ?? 0;
  let power = 0;
  try { power = totalPower(civ, st); } catch { /* 軍が未編成 */ }
  a.push({ m: civ.monthIndex, pop: st.pop, treasury: st.treasury, stability: st.stability, power, legit: st.politics ? effective(civ, st, "legitimacy") : 0, tax, trade });
  if (a.length > KEEP) a.shift();
  return a;
}
export const prevOf = (a) => (a.length >= 2 ? a[a.length - 2] : null);
