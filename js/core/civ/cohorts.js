// V5-M4: 人口コホート（文化・言語・宗教・種族ごとの人口の塊）。1つの集団・国家の中に複数が共存し、
// 同化・緊張・要求（自治など）が月次で動く。コホートの割合 share の合計は常に 1。
import { makeEvent } from "./events.js";
import { recentEventsFor, asCauses } from "./graph.js";
export const INTERESTS = Object.freeze({ autonomy: "自治", religious_freedom: "信仰の自由", language_rights: "言語の権利", tax_relief: "減税", land: "土地", security: "安全" });
export const dominant = (g) => { let b = g.cohorts[0]; for (const c of g.cohorts) if (c.share > b.share) b = c; return b; };
export const normalize = (g) => { let t = 0; for (const c of g.cohorts) t += c.share; for (const c of g.cohorts) c.share /= t || 1; };
/** 別の文化のコホートを移す（混血・移民）。すでにあれば割合を足す。返り値は新規に作ったか */
export function addCohort(g, from, share) {
  let c = g.cohorts.find((x) => x.cultureId === from.cultureId && x.religionId === from.religionId && x.speciesId === from.speciesId);
  const made = !c; if (!c) { c = { cultureId: from.cultureId, languageId: from.languageId, religionId: from.religionId, speciesId: from.speciesId, share: 0, tension: 0.1, interest: null }; g.cohorts.push(c); }
  const d = dominant(g); if (d === c) return made; const mv = Math.min(share, d.share * 0.5); d.share -= mv; c.share += mv; normalize(g); return made;
}
/** 国家の基準（首都集団の主流コホート）との違いから、緊張の目標値と要求を出す */
export function tensionTarget(c, ref, state) {
  const parts = { religion: c.religionId !== ref.religionId && c.religionId ? 0.3 : 0, language: c.languageId !== ref.languageId ? 0.25 : 0, culture: c.cultureId !== ref.cultureId ? 0.15 : 0, tax: state ? Math.max(0, state.policy.tax - 0.12) * 1.5 : 0, species: c.speciesId !== ref.speciesId ? 0.2 : 0 };
  if (state) { parts.religion *= 1 - 0.6 * state.policy.tolerance; parts.language *= 1 - 0.5 * state.policy.autonomy; }
  let t = 0.05, best = null, bv = 0; for (const [k, v] of Object.entries(parts)) { t += v; if (v > bv) { bv = v; best = k; } }
  const interest = { religion: "religious_freedom", language: "language_rights", culture: "autonomy", tax: "tax_relief", species: "autonomy" }[best] ?? null;
  return { target: Math.min(1, t), interest };
}
/** 月次: 少数コホートの緊張・同化・要求。ctx.civ.states を参照（国家に属さない集団は自分の主流を基準とする） */
export function stepCohorts(ctx) {
  const { civ, ids } = ctx, mi = civ.monthIndex; if (mi % 3 !== 0) return; // 3か月ごとにまとめて更新（緩やかな過程なので、率は3倍）
  for (const id in civ.groups) {
    const g = civ.groups[id]; if (g.cohorts.length < 2) continue;
    const st = g.stateId ? civ.states[g.stateId] : null, cap = st ? civ.groups[st.capitalGroupId] : null, ref = dominant(cap && cap.cohorts.length ? cap : g);
    const assim = st ? st.policy.assimilation : 0; let changed = false;
    for (const c of g.cohorts) {
      if (!st && c === dominant(g)) continue;
      const { target, interest } = tensionTarget(c, ref, st); const was = c.tension; c.tension += (target + assim * 0.2 - c.tension) * 0.14; c.interest = interest;
      if (c.tension < 0.5) c.demandSpent = false; // 要求の再発は、緊張が十分に下がってから（0.7 付近の揺れで同じ要求のイベントを量産しない）
      if (was < 0.7 && c.tension >= 0.7 && !c.demandSpent && (c.demandSpent = true)) makeEvent(civ, ids, { kind: "demand_raised", title: `少数の人々が「${INTERESTS[interest] ?? "改善"}」を求める`, participants: [{ entityId: g.id, role: "group" }, ...(st ? [{ entityId: st.id, role: "state" }] : [])], location: { cell: g.cell }, causes: [...asCauses(recentEventsFor(civ, [g.id], ["famine", "disaster_struck"], 36, 1), "contributed_to", "plausible"), ...(st ? asCauses(recentEventsFor(civ, [st.id], ["war_ended", "leader_succession"], 36, 1), "contributed_to", "plausible") : [])], effects: [{ targetId: g.id, property: "cohort_tension", before: Math.round(was * 100) / 100, after: Math.round(c.tension * 100) / 100 }] });
      const d = dominant(g); if (c !== d && c.speciesId === d.speciesId) { const mv = c.share * 0.0024 * (1 + 3 * assim); c.share -= mv; d.share += mv; changed = true; } // 同じ種族の少数は、ゆっくり多数派へ同化する
    }
    if (changed) { const before = g.cohorts.length; g.cohorts = g.cohorts.filter((c) => c.share >= 0.01 || c === dominant(g)); normalize(g); if (g.cohorts.length < before) makeEvent(civ, ids, { kind: "cohort_assimilated", title: "少数の人々が多数派へ溶け込んだ", participants: [{ entityId: g.id, role: "group" }], location: { cell: g.cell } }); }
  }
}
/** 国家の人口構成（文化・宗教・種族ごとの人数）。画面・AI・因果の入力 */
export function composition(civ, state) {
  const out = { culture: {}, religion: {}, species: {}, total: 0 };
  for (const id in civ.groups) { const g = civ.groups[id]; if (g.stateId !== state.id) continue; for (const c of g.cohorts) { const n = g.pop * c.share; out.total += n; out.culture[c.cultureId] = (out.culture[c.cultureId] ?? 0) + n; const r = c.religionId ?? "none"; out.religion[r] = (out.religion[r] ?? 0) + n; out.species[c.speciesId] = (out.species[c.speciesId] ?? 0) + n; } }
  return out;
}
