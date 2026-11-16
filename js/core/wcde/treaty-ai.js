// v6.16.0: アルゴリズム国家の外交（新しい種類の条約）。年 1 回、各国が近隣の国に提案する。
//   提案の前に実行条件と相手の評価を調べ、受けられそうなものだけを出す（断られる提案を履歴に積まない）。担当国への提案は決断になる。
import { TREATY, atWarWith, neighborStates, strength, treatyBetween } from "../civ/diplomacy.js";
import { hashSeed } from "../civ/civ-state.js";
import { negotiateTreaty, evaluateTreaty, treatyFeasible, territorialPlan } from "./negotiation.js";
import { depFeasible } from "./dependency.js";

const WEIGHTS = [["defensive", 0.15], ["tariff", 0.1], ["border", 0.12], ["sphere", 0.06], ["passage", 0.05], ["garrison", 0.03], ["marriage", 0.12], ["succession_pact", 0.04], ["union", 0.05], ["unequal", 0.03], ["purchase", 0.02]];
const activeCount = (civ, id) => civ.activeTreatyIds.reduce((c, i) => { const t = civ.treaties[i]; return c + (t.active && (t.a === id || t.b === id) ? 1 : 0); }, 0);
function depKind(civ, A) { const yr = civ.date.year; const ok = (k) => !TREATY[k].needs?.some((n) => A.techAdopted?.[n] == null); const c = []; if (ok("feudal") && yr < 4600) c.push("feudal"); if (ok("tribute") && yr < 4400) c.push("tribute"); if (ok("protectorate") && yr >= 3500) c.push("protectorate"); return c; }
export function stepTreatyAI(ctx) {
  const { civ } = ctx, mi = civ.monthIndex; if (!civ.options.wcde || mi % 12 !== 5) return;
  for (const A of Object.values(civ.states)) {
    if (!A.alive || A.player || A.dependency || A.techAdopted?.diplomacy == null || activeCount(civ, A.id) >= 6) continue; const u = (hashSeed(A.id, mi, "tai") % 100000) / 100000; if (u >= 0.2) continue;
    const nb = neighborStates(ctx, A).map((i) => civ.states[i]).filter((s) => s.alive && !atWarWith(civ, A, s)); if (!nb.length) continue; const B = nb[hashSeed(A.id, mi, "tpick") % nb.length];
    // 従属を迫る: 国力が大きく上回るとき
    if (strength(civ, A) > strength(civ, B) * 2.5 && !depFeasible(civ, A, B)) { const ks = depKind(civ, A); if (ks.length && (hashSeed(A.id, mi, "dep") % 100) < 25) { const k = ks[hashSeed(B.id, mi, "dk") % ks.length]; if (!treatyFeasible(civ, A, B, k) && evaluateTreaty(civ, A, B, k).accept) { negotiateTreaty(ctx, A, B, k, { provenance: "simulation" }); continue; } } }
    let x = ((hashSeed(A.id, mi, "tw") % 100000) / 100000) * WEIGHTS.reduce((a, w) => a + w[1], 0), type = WEIGHTS[0][0]; for (const [k, w] of WEIGHTS) { x -= w; if (x <= 0) { type = k; break; } }
    if (treatyBetween(civ, A, B, type) || treatyFeasible(civ, A, B, type)) continue; const plan = territorialPlan(ctx, A, B, type); if (plan.error || !evaluateTreaty(civ, A, B, type, { terms: plan.terms }).accept) continue;
    negotiateTreaty(ctx, A, B, type, { provenance: "simulation" });
  }
}
void depFeasible;
