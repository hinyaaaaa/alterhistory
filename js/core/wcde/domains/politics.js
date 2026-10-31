// v6 M3: 国内政治。国家ごとに 支持勢力（貴族・聖職者・商人・軍・民衆）の支持と影響力・議会・正統性・疲労を持つ。
//   経済・戦争・宗教・徴税・政体から支持が決まり、正統性が安定・徴税の上限・政権の存続（政変）に効く。
//   指導者個人の寿命・継承は states.js（v5）が扱う。ここは「政権を支える構造」を扱う。
import { byState } from "../../civ/spatial.js";
import { atWarWith } from "../../civ/diplomacy.js";
import { makeEvent } from "../../civ/events.js";
import { hashSeed } from "../../civ/civ-state.js";
import { lifeScale } from "../../civ/species.js";
import { effective } from "./effective.js";

export const FACTIONS = Object.freeze({ nobility: "貴族・有力者", clergy: "聖職者", merchants: "商人", military: "軍", commoners: "民衆" });
export const POLITICS_PERIOD = 3;
/** 政体ごとの影響力の配分（合計 1）。同じ支持でも、政体によって誰の支持が効くかが違う */
const INFLUENCE = Object.freeze({
  tribal: { nobility: 0.3, clergy: 0.15, merchants: 0.05, military: 0.3, commoners: 0.2 }, chiefdom: { nobility: 0.3, clergy: 0.15, merchants: 0.1, military: 0.3, commoners: 0.15 },
  theocracy: { nobility: 0.15, clergy: 0.45, merchants: 0.1, military: 0.15, commoners: 0.15 }, kingdom: { nobility: 0.35, clergy: 0.15, merchants: 0.1, military: 0.25, commoners: 0.15 },
  empire: { nobility: 0.3, clergy: 0.1, merchants: 0.1, military: 0.35, commoners: 0.15 }, republic: { nobility: 0.15, clergy: 0.1, merchants: 0.3, military: 0.1, commoners: 0.35 },
});
const ASSEMBLY = Object.freeze({ tribal: "長老会", chiefdom: null, theocracy: "聖職者会議", kingdom: null, empire: null, republic: "市民議会" });
const infl = (polity) => INFLUENCE[polity] ?? INFLUENCE.tribal;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const adopted = (st, k) => st.techAdopted?.[k] != null;

/** 正統性 = Σ 影響力 × 支持（支持が月の途中で変わったとき（懐柔など）にも、同じ式で更新する） */
export function recomputeLegitimacy(P) { let l = 0; for (const k of Object.keys(FACTIONS)) l += (P.factions[k].influence ?? 0) * P.factions[k].support; P.legitimacy = l; return l; }
export function initPolitics(st) {
  const f = {}; for (const k of Object.keys(FACTIONS)) f[k] = { support: 0.55 };
  return { factions: f, assembly: ASSEMBLY[st.polity] ?? (adopted(st, "administration") ? "諮問会議" : null), legitimacy: 0.55, fatigue: 0, taxCeiling: 0.4, lastRegimeChange: -999 };
}

/** 勢力ごとの支持の目標値（0〜1）。経済・戦争・宗教・徴税・安定から */
export function supportTargets(ctx, st) {
  const { civ } = ctx, e = st.econ ?? {}, p = st.policy, war = st.warIds.length > 0, trade = Object.values(e.trade ?? {}).reduce((a, b) => a + b, 0), perCap = e.perCapita ?? 0.6;
  const fat = effective(civ, st, "fatigue");
  return {
    commoners: clamp(0.35 + 0.5 * st.stability + 0.25 * (e.foodBalance ?? 1) - 0.8 * p.tax - 0.4 * fat - 0.25 * p.mobilization),
    merchants: clamp(0.35 + 0.25 * Math.min(1, trade * 2) + 0.15 * (adopted(st, "coinage") ? 1 : 0) + 0.15 * (1 - p.tax * 2) - (war ? 0.15 : 0)),
    clergy: clamp(0.3 + (st.polity === "theocracy" ? 0.35 : 0) + 0.2 * (1 - p.assimilation) + 0.15 * p.tolerance + (st.magic ? 0.1 : 0)),
    military: clamp(0.35 + 0.4 * p.mobilization + (war ? 0.15 : 0) + 0.15 * (st.treasury > 0 ? 1 : 0) - 0.3 * fat),
    nobility: clamp(0.4 + 0.25 * (1 - p.tax) + 0.2 * st.stability + (adopted(st, "bureaucracy") ? -0.2 : 0) + 0.1 * p.autonomy),
  };
}

export function stepPolitics(ctx) {
  const { civ, ids } = ctx, mi = civ.monthIndex; if (!civ.options.wcde || mi % POLITICS_PERIOD !== 0) return;
  for (const st of Object.values(civ.states)) {
    if (!st.alive) continue; const P = (st.politics ??= initPolitics(st));
    // 疲労: 戦争が長いほど溜まり、平時に抜ける
    P.fatigue = clamp(P.fatigue + (st.warIds.length ? 0.025 * st.warIds.length : -0.02));
    const tgt = supportTargets(ctx, st), w = infl(st.polity); let leg = 0;
    for (const k of Object.keys(FACTIONS)) { const f = P.factions[k]; f.support = clamp(f.support + (tgt[k] - f.support) * 0.25); f.influence = w[k]; leg += f.influence * f.support; }
    P.legitimacy = leg; const legE = effective(civ, st, "legitimacy"); /* 以降の実効の判断は有効値（介入があれば通常値＋補正）で行う */ P.assembly = ASSEMBLY[st.polity] ?? (adopted(st, "administration") ? "諮問会議" : null);
    P.taxCeiling = Math.round((0.15 + 0.5 * legE) * 1000) / 1000; // 正統性が低いと、高い税は取れない（政策の実現可能性）
    st.stability = clamp(st.stability + (legE - 0.5) * 0.04);
    if (st.policy.tax > P.taxCeiling) st.policy.tax = Math.round(P.taxCeiling * 1000) / 1000;
    // 政変: 正統性が低く、軍か民衆の支持が離れているとき（長い間隔を置く）
    if (legE < 0.3 && mi - P.lastRegimeChange > 120 && ((hashSeed(st.id, mi) % 1000) / 1000) < 0.1 * (0.3 - legE) / 0.3 + 0.02) regimeChange(ctx, st);
  }
}

export function regimeChange(ctx, st) {
  const { civ, ids } = ctx, P = st.politics, mi = civ.monthIndex, f = P.factions, who = f.commoners.support <= f.military.support ? "commoners" : "military";
  const before = st.polity, to = who === "commoners" && (st.polity === "kingdom" || st.polity === "empire" || st.polity === "chiefdom") ? "republic" : st.polity;
  const causes = []; const war = civ.events.slice(-60).reverse().find((e) => (e.kind === "war_declared" || e.kind === "war_ended") && e.participants.some((p) => p.entityId === st.id)); if (war) causes.push({ targetId: war.id, relation: "caused_by", basis: "plausible" });
  st.polity = to; P.lastRegimeChange = mi; st.stability = clamp(st.stability - 0.25); P.fatigue = Math.max(0, P.fatigue - 0.3);
  for (const k of Object.keys(f)) f[k].support = clamp(f[k].support + 0.15);
  makeEvent(civ, ids, { kind: "regime_change", title: `${st.name}で政変が起きた（${who === "commoners" ? "民衆の離反" : "軍の離反"}${before !== to ? "・政体が変わった" : ""}）`, participants: [{ entityId: st.id, role: "state" }], effects: [{ targetId: st.id, property: "polity", before, after: to }, { targetId: st.id, property: "stability", before: null, after: Math.round(st.stability * 100) / 100 }], causes, provenance: "simulation" });
  // 政変で指導者が代わる（新しい指導者は別の家系。人物の記録は people.js が事実として残す）
  st.leader = { name: ctx.nameGen?.person(civ, civ.groups[st.capitalGroupId], ctx.rng) ?? `${st.name}の新指導者`, bornAt: mi - Math.round((300 + Math.floor(ctx.rng() * 200)) * lifeScale(civ, { capitalGroupId: st.capitalGroupId })), heir: false, deposed: true };
}
