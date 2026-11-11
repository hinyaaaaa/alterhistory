// v6 M3: 国内政治。国家ごとに 支持勢力の支持と影響力・議会・正統性・疲労を持つ。
//   v6.1.0 M5: 支持勢力は固定 5 枠ではなく、国家の社会構造・技術・経済・宗教・政体から成立・消滅する（貴族・軍・民衆は常に、聖職者・商人・官僚・職人・遊牧氏族は条件を満たすとき）。
//   思想（ideas）は条件から自然に生まれ、接する国・交易相手・同盟国を通じて広がる（禁止はできない。寛容さが受け入れやすさを変える）。条約・指導者の継承（跡継ぎ）・封鎖も支持に効く。
//   経済・戦争・宗教・徴税・政体から支持が決まり、正統性が安定・徴税の上限・政権の存続（政変）に効く。
//   指導者個人の寿命・継承は states.js（v5）が扱う。ここは「政権を支える構造」を扱う。
import { byState } from "../../civ/spatial.js";
import { atWarWith, neighborStates } from "../../civ/diplomacy.js";
import { stateCan, fxSum } from "../../civ/tech.js";
import { makeEvent } from "../../civ/events.js";
import { hashSeed } from "../../civ/civ-state.js";
import { lifeScale } from "../../civ/species.js";
import { effective } from "./effective.js";
import { retitle, leaderName, leaderRng } from "./naming.js";

export const FACTIONS = Object.freeze({ nobility: "貴族・有力者", clergy: "聖職者", merchants: "商人", military: "軍", commoners: "民衆", bureaucrats: "官僚・書記", artisans: "職人・工房", clans: "遊牧氏族" });
export const CORE_FACTIONS = Object.freeze(["nobility", "military", "commoners"]);
export const POLITICS_PERIOD = 3;
/** 政体ごとの影響力の配分。同じ支持でも、政体によって誰の支持が効くかが違う。存在する勢力だけで合計 1 に正規化する */
const INFLUENCE = Object.freeze({
  tribal: { nobility: 0.3, clergy: 0.15, merchants: 0.05, military: 0.3, commoners: 0.2, bureaucrats: 0.04, artisans: 0.04, clans: 0.25 }, chiefdom: { nobility: 0.3, clergy: 0.15, merchants: 0.1, military: 0.3, commoners: 0.15, bureaucrats: 0.05, artisans: 0.05, clans: 0.2 },
  theocracy: { nobility: 0.15, clergy: 0.45, merchants: 0.1, military: 0.15, commoners: 0.15, bureaucrats: 0.1, artisans: 0.05, clans: 0.08 }, kingdom: { nobility: 0.35, clergy: 0.15, merchants: 0.1, military: 0.25, commoners: 0.15, bureaucrats: 0.12, artisans: 0.05, clans: 0.08 },
  empire: { nobility: 0.3, clergy: 0.1, merchants: 0.1, military: 0.35, commoners: 0.15, bureaucrats: 0.2, artisans: 0.05, clans: 0.08 }, republic: { nobility: 0.15, clergy: 0.1, merchants: 0.3, military: 0.1, commoners: 0.35, bureaucrats: 0.1, artisans: 0.1, clans: 0.05 },
});
const ASSEMBLY = Object.freeze({ tribal: "長老会", chiefdom: null, theocracy: "聖職者会議", kingdom: null, empire: null, republic: "市民議会" });
const infl = (polity) => INFLUENCE[polity] ?? INFLUENCE.tribal;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sat = (x, k = 1) => clamp(x / k);
const adopted = (st, k) => st.techAdopted?.[k] != null;

/** 社会構造（勢力が成立するかの入力）: 都市の人口割合・牧畜の人口割合 */
function socialOf(ctx, st) {
  const { civ } = ctx, gs = byState(ctx).get(st.id) ?? []; let tot = 0, city = 0, past = 0;
  for (const g of gs) { tot += g.pop; if (g.subsistence === "pastoral") past += g.pop; const sg = g.settlementId ? civ.settlements[g.settlementId]?.stage : null; if (sg === "town" || sg === "city") city += g.pop; }
  return { city: tot ? city / tot : 0, pastoral: tot ? past / tot : 0 };
}
/** この国家にいまある勢力（貴族・軍・民衆は常に。ほかは社会構造・技術・経済・宗教・政体が整うとき） */
export function factionKeys(ctx, st) {
  const so = socialOf(ctx, st), trade = Object.values(st.econ?.trade ?? {}).reduce((a, b) => a + b, 0), keys = [...CORE_FACTIONS];
  if (st.polity === "theocracy" || st.pop >= 2500 || st.magic) keys.push("clergy");
  if (trade > 0 || adopted(st, "coinage") || so.city > 0) keys.push("merchants");
  if (adopted(st, "record_keeping") || adopted(st, "writing") || adopted(st, "administration")) keys.push("bureaucrats");
  if (so.city > 0.05 && fxSum(ctx.civ, st, "ind") >= 0.1) keys.push("artisans");
  if (so.pastoral >= 0.3) keys.push("clans");
  return { keys, so };
}
const weightsOf = (polity, keys) => { const w = infl(polity); let t = 0; for (const k of keys) t += w[k] ?? 0.05; const o = {}; for (const k of keys) o[k] = (w[k] ?? 0.05) / t; return o; };

/** 正統性 = Σ 影響力 × 支持（支持が月の途中で変わったとき（懐柔など）にも、同じ式で更新する） */
export function recomputeLegitimacy(P) { let l = 0; for (const k of Object.keys(P.factions)) l += (P.factions[k].influence ?? 0) * P.factions[k].support; P.legitimacy = l; return l; }
export function initPolitics(st) {
  const f = {}; for (const k of ["nobility", "clergy", "merchants", "military", "commoners"]) f[k] = { support: 0.55 };
  return { factions: f, ideas: {}, assembly: ASSEMBLY[st.polity] ?? (adopted(st, "administration") ? "諮問会議" : null), legitimacy: 0.55, fatigue: 0, taxCeiling: 0.4, lastRegimeChange: -999 };
}

// ---- 思想。条件（政体・支持勢力・経済・戦争・制度）から自然に生まれる。禁止はできず、政策（寛容）が受け入れやすさを変える
export const IDEAS = Object.freeze({
  mercantilism: { ja: "商業主義", pro: { merchants: 0.12, artisans: 0.06 }, con: { nobility: -0.04 } },
  martialism: { ja: "尚武の気風", pro: { military: 0.12 }, con: { commoners: -0.05 } },
  egalitarianism: { ja: "平等主義", pro: { commoners: 0.12 }, con: { nobility: -0.08 } },
  piety: { ja: "敬虔主義", pro: { clergy: 0.12 }, con: { merchants: -0.04 } },
  legalism: { ja: "法治主義", pro: { bureaucrats: 0.12, merchants: 0.04 }, con: { clans: -0.05 } },
  traditionalism: { ja: "伝統主義", pro: { nobility: 0.12, clans: 0.05 }, con: { artisans: -0.04 } },
  reformism: { ja: "改革志向", pro: { artisans: 0.1, bureaucrats: 0.05 }, con: { nobility: -0.05 } },
});
function emergence(ctx, st, id, inf, trade) {
  const P = st.politics, x = st.military?.exp ?? {}, tax = st.policy.tax;
  switch (id) {
    case "mercantilism": return 0.9 * (inf.merchants ?? 0) + 0.4 * Math.min(1, trade) + (adopted(st, "coinage") ? 0.2 : 0);
    case "martialism": return 0.5 * sat(st.warIds.length, 3) + 0.4 * sat((x.won ?? 0) + (x.sieges ?? 0), 10) + 0.3 * (inf.military ?? 0);
    case "egalitarianism": return (st.polity === "republic" ? 0.55 : 0) + 0.4 * (1 - 2 * tax > 0 ? 1 - 2 * tax : 0) * effective(ctx.civ, st, "stability") + 0.2 * (1 - (st.policy.autonomy ?? 0));
    case "piety": return (st.polity === "theocracy" ? 0.7 : 0) + 0.6 * (inf.clergy ?? 0);
    case "legalism": return (adopted(st, "administration") ? 0.5 : 0) + (adopted(st, "writing") ? 0.15 : 0) + 0.4 * (inf.bureaucrats ?? 0);
    case "traditionalism": return (st.polity === "kingdom" ? 0.45 : 0) + 0.5 * (inf.nobility ?? 0) + 0.15 * (st.leader?.heir ? 1 : 0);
    case "reformism": return 0.5 * (1 - effective(ctx.civ, st, "stability")) * (1 - P.legitimacy * 0.5) + 0.25 * Math.min(1, trade) + 0.2 * sat(Object.keys(st.techAdopted ?? {}).length, 40);
  } return 0;
}
/** 思想の動き（3 か月ごと）: 条件から目標が決まり、接する国・交易相手・同盟国から広がる。最初に広まった国は世界で一度だけ記録に残る */
function stepIdeas(ctx, st, wts, trade) {
  const { civ, ids } = ctx, P = st.politics, W = civ.wcde, inf = {}; for (const k in P.factions) inf[k] = wts[k] ?? 0; const ideas = (P.ideas ??= {}), accept = 0.5 + 0.5 * (st.policy.tolerance ?? 0.5);
  const contacts = [...new Set([...(ctx.world?.mesh ? neighborStates(ctx, st) : []), ...Object.keys(st.econ?.trade ?? {})])].map((i) => civ.states[i]).filter((o) => o?.alive && o.politics), ally = new Set(civ.activeTreatyIds.map((i) => civ.treaties[i]).filter((t) => t.type === "alliance" && (t.a === st.id || t.b === st.id)).map((t) => (t.a === st.id ? t.b : t.a)));
  for (const id in IDEAS) {
    const cur = ideas[id] ?? 0, tgt = clamp(emergence(ctx, st, id, inf, trade)); let net = 0; for (const o of contacts) net = Math.max(net, (o.politics.ideas?.[id] ?? 0) * (ally.has(o.id) ? 0.9 : o.econ?.trade?.[st.id] ? 0.8 : 0.6));
    let nv = cur + 0.12 * (tgt - cur) + Math.max(0, net * accept - cur) * 0.2; if (tgt < cur) nv -= 0.015; nv = clamp(nv);
    if (nv < 0.03) delete ideas[id]; else ideas[id] = Math.round(nv * 1000) / 1000;
    const reg = ((W.ideas ??= {})); if (nv >= 0.35 && !reg[id]) { reg[id] = { at: civ.monthIndex, stateId: st.id }; makeEvent(civ, ids, { kind: "ideology_emerged", title: `${st.name}で「${IDEAS[id].ja}」が広まり始めた`, participants: [{ entityId: st.id, role: "state" }], facts: { idea: id, ja: IDEAS[id].ja, stateId: st.id }, provenance: "simulation" }); }
  }
}
export const ideasOf = (st) => Object.entries(st.politics?.ideas ?? {}).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, ja: IDEAS[id]?.ja ?? id, v }));
const treatiesOf = (civ, st) => { const o = { trade: 0, alliance: 0, nonaggression: 0 }; for (const i of civ.activeTreatyIds) { const t = civ.treaties[i]; if (t && (t.a === st.id || t.b === st.id) && t.type in o) o[t.type]++; } return o; };

/** 勢力ごとの支持の目標値（0〜1）。経済・戦争・宗教・徴税・安定・条約・継承・思想から */
export function supportTargets(ctx, st) {
  const { civ } = ctx, e = st.econ ?? {}, p = st.policy, war = st.warIds.length > 0, trade = Object.values(e.trade ?? {}).reduce((a, b) => a + b, 0), perCap = e.perCapita ?? 0.6;
  const fat = effective(civ, st, "fatigue"), tr = treatiesOf(civ, st), mi = civ.monthIndex, heir = st.leader?.heir ? 1 : 0, hered = st.polity === "kingdom" || st.polity === "empire" || st.polity === "chiefdom", blockaded = (st.blockade ?? 0) > mi;
  const t = {
    commoners: clamp(0.35 + 0.5 * effective(ctx.civ, st, "stability") + 0.25 * (e.foodBalance ?? 1) - 0.8 * p.tax - 0.4 * fat - 0.25 * p.mobilization),
    merchants: clamp(0.35 + 0.25 * Math.min(1, trade * 2) + 0.15 * (adopted(st, "coinage") ? 1 : 0) + 0.15 * (1 - p.tax * 2) - (war ? 0.15 : 0) + Math.min(0.12, 0.04 * tr.trade) - (blockaded ? 0.15 : 0) - (st.sanctions?.length ? 0.08 : 0)),
    clergy: clamp(0.3 + (st.polity === "theocracy" ? 0.35 : 0) + 0.2 * (1 - p.assimilation) + 0.15 * p.tolerance + (st.magic ? 0.1 : 0)),
    military: clamp(0.35 + 0.4 * p.mobilization + (war ? 0.15 : 0) + 0.15 * (st.treasury > 0 ? 1 : 0) - 0.3 * fat - Math.min(0.12, 0.04 * tr.nonaggression)),
    nobility: clamp(0.4 + 0.25 * (1 - p.tax) + 0.2 * effective(ctx.civ, st, "stability") + (adopted(st, "bureaucracy") ? -0.2 : 0) + 0.1 * p.autonomy + Math.min(0.09, 0.03 * tr.alliance) + (hered ? (heir ? 0.06 : -0.04) : 0)),
    bureaucrats: clamp(0.35 + 0.25 * (st.treasury > 0 ? 1 : 0) + 0.3 * effective(ctx.civ, st, "stability") + 0.2 * (adopted(st, "administration") ? 1 : 0) - 0.15 * (p.autonomy ?? 0)),
    artisans: clamp(0.35 + 0.3 * Math.min(1, trade * 2) + 0.25 * (1 - p.tax * 2) + 0.2 * Math.min(1, perCap) - (war ? 0.08 : 0)),
    clans: clamp(0.4 + 0.3 * (p.autonomy ?? 0) - 0.3 * (p.assimilation ?? 0) - 0.3 * p.tax + 0.1 * (war ? 1 : 0)),
  };
  for (const id in (st.politics?.ideas ?? {})) { const s = st.politics.ideas[id], d = IDEAS[id]; if (!d) continue; for (const k in d.pro) if (k in t) t[k] = clamp(t[k] + d.pro[k] * s); for (const k in d.con) if (k in t) t[k] = clamp(t[k] + d.con[k] * s); }
  return t;
}

export function stepPolitics(ctx) {
  const { civ, ids } = ctx, mi = civ.monthIndex; if (!civ.options.wcde || mi % POLITICS_PERIOD !== 0) return;
  for (const st of Object.values(civ.states)) {
    if (!st.alive) continue; const P = (st.politics ??= initPolitics(st));
    // 疲労: 戦争が長いほど溜まり、平時に抜ける
    P.fatigue = clamp(P.fatigue + (st.warIds.length ? 0.025 * st.warIds.length : -0.02));
    // 勢力の成立・消滅（社会構造が変わったとき）。消えた勢力は記録しない（正統性の計算から外れるだけ）
    const { keys } = factionKeys(ctx, st), w = weightsOf(st.polity, keys); for (const k of keys) P.factions[k] ??= { support: 0.5 }; for (const k of Object.keys(P.factions)) if (!keys.includes(k)) delete P.factions[k];
    const trade = Object.values(st.econ?.trade ?? {}).reduce((a, b) => a + b, 0); stepIdeas(ctx, st, w, trade);
    const tgt = supportTargets(ctx, st); let leg = 0;
    for (const k of keys) { const f = P.factions[k]; f.support = clamp(f.support + (tgt[k] - f.support) * 0.25); f.influence = Math.round(w[k] * 1000) / 1000; leg += f.influence * f.support; }
    P.legitimacy = leg; const legE = effective(civ, st, "legitimacy"); /* 以降の実効の判断は有効値（介入があれば通常値＋補正）で行う */ P.assembly = ASSEMBLY[st.polity] ?? (adopted(st, "administration") ? "諮問会議" : null);
    P.taxCeiling = Math.round((0.15 + 0.5 * legE) * 1000) / 1000; // 正統性が低いと、高い税は取れない（政策の実現可能性）
    st.stability = clamp(st.stability + (legE - 0.5) * 0.04);
    if (st.policy.tax > P.taxCeiling) st.policy.tax = Math.round(P.taxCeiling * 1000) / 1000;
    // 政変: 正統性が低く、軍か民衆の支持が離れているとき（長い間隔を置く）
    if (mi % 12 === 0 && !st.player && civ.wcde?.control?.stateId !== st.id) evolvePolity(ctx, st, P, legE); // 担当国家の政体は、プレイヤーが決める（AI は動かさない） // v6.9.0: 技術・規模・社会の変化による、危機によらない政体の移り変わり
    if (legE < 0.3 && mi - P.lastRegimeChange > 120 && ((hashSeed(st.id, mi) % 1000) / 1000) < 0.1 * (0.3 - legE) / 0.3 + 0.02) regimeChange(ctx, st);
  }
}

/** 政体の移り変わり（v6.9.0）。旧版は正統性が 0.3 を割る政変しか政体を変えず、5000 年経っても政体が固定されていた。
 *  年 1 回、技術（stateCan）・規模・支持勢力・宗教から起きうる変化を評価する。理由は、改革・宗教改革・世俗化・革命・軍の掌握・帝国の衰退のいずれか。 */
const POLITY_NEED = { chiefdom: "polity:chiefdom", theocracy: "polity:chiefdom", kingdom: "polity:kingdom", republic: "polity:republic", empire: "polity:empire" };
export function evolvePolity(ctx, st, P, legE) {
  const { civ } = ctx, mi = civ.monthIndex; if (mi - (P.lastRegimeChange ?? -9999) < 360) return; // 30 年は続く
  const can = (pl) => pl === "tribal" || stateCan(civ, st, POLITY_NEED[pl]), f = P.factions ?? {}, sup = (k) => f[k]?.support ?? 0.5, u = (hashSeed(st.id, mi, "evolve") % 10000) / 10000;
  const opts = []; // [到達先, 毎年の確率, 理由]
  const pol = st.polity, pop = st.pop, war = st.warIds.length > 0;
  const size = byState(ctx).get(st.id)?.length ?? 0; // v6.11.0: 領土の広さ（集団の数）による大国化。広い国が公国のままにならず、大陸ごとに王国・帝国が育つ
  if (pol === "chiefdom" && size >= 8 && can("kingdom")) opts.push(["kingdom", 0.06, "reform"]);
  if (pol === "kingdom" && size >= 24 && can("empire")) opts.push(["empire", 0.04, "conquest"]);
  if (pol === "tribal" && can("chiefdom") && pop > 2000) opts.push(["chiefdom", 0.02, "reform"]);
  if (pol === "chiefdom" && can("kingdom") && pop > 10000) opts.push(["kingdom", 0.012, "reform"]);
  if (pol === "chiefdom" && can("theocracy") && sup("clergy") > 0.6) opts.push(["theocracy", 0.006, "religious_reform"]);
  if (pol === "theocracy" && can("kingdom")) opts.push(["kingdom", 0.004, "secularization"]);
  if (pol === "theocracy" && can("republic") && sup("merchants") > 0.6) opts.push(["republic", 0.003, "secularization"]);
  if (pol === "kingdom" && can("empire") && pop > 60000 && war) opts.push(["empire", 0.008, "conquest"]);
  if (pol === "kingdom" && can("republic") && sup("merchants") > 0.62 && sup("commoners") > 0.55) opts.push(["republic", 0.007, "revolution"]);
  if (pol === "kingdom" && can("theocracy") && sup("clergy") > 0.7) opts.push(["theocracy", 0.003, "religious_reform"]);
  if (pol === "republic" && can("empire") && sup("military") > 0.65 && war) opts.push(["empire", 0.006, "military_takeover"]);
  if (pol === "republic" && can("kingdom") && sup("military") > 0.65) opts.push(["kingdom", 0.004, "military_takeover"]);
  if (pol === "empire" && st.stability < 0.5) opts.push(["kingdom", 0.012, "decline"]);
  if (pol === "empire" && can("republic") && sup("commoners") > 0.6 && sup("merchants") > 0.6) opts.push(["republic", 0.006, "revolution"]);
  let acc = 0; for (const [to, p, how] of opts) { acc += p; if (u < acc) { reformPolity(ctx, st, P, to, how); return; } }
}
const HOW_JA = { reform: "制度の改革", religious_reform: "宗教改革", secularization: "世俗化", conquest: "征服による大国化", revolution: "革命", military_takeover: "軍による権力の掌握", decline: "中央の衰退" };
/** 政体を変える（原因つきの出来事）。政変（regimeChange）と違い、指導者は必ずしも代わらない（革命・軍の掌握は代わる） */
export function reformPolity(ctx, st, P, to, how) {
  const { civ, ids } = ctx, mi = civ.monthIndex, before = st.polity, oldName = st.name;
  const war = civ.events.slice(-80).reverse().find((e) => (e.kind === "war_declared" || e.kind === "war_ended" || e.kind === "uprising" || e.kind === "famine") && e.participants.some((p) => p.entityId === st.id));
  st.polity = to; P.lastRegimeChange = mi; st.stability = clamp(st.stability + (how === "revolution" || how === "military_takeover" ? -0.2 : how === "decline" ? -0.1 : 0.02)); P.fatigue = Math.max(0, (P.fatigue ?? 0) - 0.2);
  const rt = before !== to ? retitle(st, to, civ.date.year) : null; if (rt) { st.name = rt.name; st.nameBase = rt.base; st.titleYear = rt.year; }
  if (how === "revolution" || how === "military_takeover") st.leader = { name: leaderName(st, ctx.nameGen?.person(civ, civ.groups[st.capitalGroupId], ctx.rng) ?? `${st.name}の新指導者`, leaderRng(civ, st, "regime")), bornAt: mi - Math.round((300 + Math.floor(ctx.rng() * 200)) * lifeScale(civ, { capitalGroupId: st.capitalGroupId })), heir: false, deposed: true, origin: how };
  makeEvent(civ, ids, { kind: "regime_change", title: `${oldName}で${HOW_JA[how]}が起き、政体が変わった${rt ? `。国号は${rt.name}と改まった` : ""}`, participants: [{ entityId: st.id, role: "state" }], effects: [{ targetId: st.id, property: "polity", before, after: to }, ...(rt ? [{ targetId: st.id, property: "name", before: oldName, after: rt.name }] : [])], causes: war ? [{ targetId: war.eventId ?? war.id, relation: "caused_by", basis: "plausible" }] : [], facts: { stateId: st.id, polity: to, name: st.name, by: how }, provenance: "simulation" });
}

/** 政変。離反した勢力（民衆・軍）と政体の技術的な可能性（stateCan）で結果が決まる: 民衆の蜂起→共和政（できるとき）／軍の掌握→帝政・王政（共和政・神権政から）／それ以外は宮廷の政変で政体は同じ */
export function regimeChange(ctx, st) {
  const { civ, ids } = ctx, P = st.politics, mi = civ.monthIndex, f = P.factions, who = f.commoners.support <= f.military.support ? "commoners" : "military";
  const before = st.polity, can = (pl) => (pl === "tribal" || stateCan(civ, st, { chiefdom: "polity:chiefdom", theocracy: "polity:chiefdom", kingdom: "polity:kingdom", republic: "polity:republic", empire: "polity:empire" }[pl]));
  let to = st.polity; if (who === "commoners" && (st.polity === "kingdom" || st.polity === "empire" || st.polity === "chiefdom") && can("republic")) to = "republic"; else if (who === "military" && (st.polity === "republic" || st.polity === "theocracy")) to = can("empire") && st.pop > 20000 ? "empire" : can("kingdom") ? "kingdom" : st.polity;
  const causes = []; const war = civ.events.slice(-60).reverse().find((e) => (e.kind === "war_declared" || e.kind === "war_ended") && e.participants.some((p) => p.entityId === st.id)); if (war) causes.push({ targetId: war.id, relation: "caused_by", basis: "plausible" });
  st.polity = to; P.lastRegimeChange = mi; st.stability = clamp(st.stability - 0.25); P.fatigue = Math.max(0, P.fatigue - 0.3);
  for (const k of Object.keys(f)) f[k].support = clamp(f[k].support + 0.15);
  if (who === "commoners" && f.nobility) f.nobility.support = clamp(f.nobility.support - 0.15); if (who === "military") f.military.support = clamp(f.military.support + 0.1);
  const how = who === "commoners" ? (before !== to ? "民衆の蜂起で政体が変わった" : "民衆の蜂起で政権が倒れた") : before !== to ? "軍が政権を握り政体が変わった" : "軍による宮廷の政変";
  const oldName = st.name, rt = before !== to ? retitle(st, to, civ.date.year) : null; if (rt) { st.name = rt.name; st.nameBase = rt.base; st.titleYear = rt.year; } // 政体が変わると、国号の称号も改まる（王国→帝国・共和国など）
  makeEvent(civ, ids, { kind: "regime_change", title: `${oldName}で政変が起きた（${how}）${rt ? `。国号は${rt.name}と改まった` : ""}`, participants: [{ entityId: st.id, role: "state" }], effects: [{ targetId: st.id, property: "polity", before, after: to }, ...(rt ? [{ targetId: st.id, property: "name", before: oldName, after: rt.name }] : []), { targetId: st.id, property: "stability", before: null, after: Math.round(st.stability * 100) / 100 }], causes, facts: { stateId: st.id, polity: to, name: st.name, by: who }, provenance: "simulation" });
  // 政変で指導者が代わる（新しい指導者は別の家系。出自の勢力を記録する。人物の記録は people.js が事実として残す）
  st.leader = { name: leaderName(st, ctx.nameGen?.person(civ, civ.groups[st.capitalGroupId], ctx.rng) ?? `${st.name}の新指導者`, leaderRng(civ, st, "regime")), bornAt: mi - Math.round((300 + Math.floor(ctx.rng() * 200)) * lifeScale(civ, { capitalGroupId: st.capitalGroupId })), heir: false, deposed: true, origin: who };
}
