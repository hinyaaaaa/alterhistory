// V5-M5: 戦争・条約・関係値（文明層の簡易モデル）。国家の軍事力は 人口×動員×技術。戦争は月ごとに戦況が動き、占領・講和で終わる。
// 旧エディタの戦争モデル（simulation）との統合は後続。ここでは AI 行動が一貫して使える最小の戦争・外交を持つ。
import { makeEvent } from "./events.js";
import { byState, neighborGroups } from "./spatial.js";
import { dominant } from "./cohorts.js";
import { hashSeed } from "./civ-state.js";
import { milMult } from "./techfx.js";
import { distKm } from "./states.js";
import { onTreatySigned, onTreatyEnded, callDependents, submitAfterWar } from "../wcde/dependency.js";
import { callPacts } from "../wcde/pacts.js";
import { recentEventsFor, asCauses, getEvent } from "./graph.js";
import { enqueue } from "./compaction-queue.js";
import { defaultGoals } from "../wcde/war-core.js";
import { callAlliances } from "../wcde/war-alliance.js";

/** 戦争の理由の表示名（v6.9.0）。旧版は AI の戦争がすべて「conquest」だった */
export const WAR_REASON_JA = Object.freeze({ conquest: "領土の征服", plunder: "略奪・遠征", succession: "王位継承をめぐる争い", religion: "宗教的な対立", trade_route: "交易路・資源をめぐる争い", maritime: "海上覇権をめぐる争い", revenge: "報復・失地の回復", independence: "独立・自治を求める戦争", unification: "統一を求める戦争", ideology: "体制・イデオロギーの対立", resource: "資源をめぐる争い", subjugation: "従属の強制", civil_war: "内戦・反乱", alliance: "同盟に基づく参戦", preventive: "予防戦争", defense: "防衛" });
/** v6.19.0: 戦争の理由の 8 分類（要件 §9）。復讐・領土回復は「口実」（w.pretext）として付き、分類そのものにはならない */
export const WAR_CLASS = Object.freeze({ conquest: "plunder", plunder: "plunder", revenge: "plunder", succession: "succession", religion: "religion", trade_route: "trade", maritime: "trade", independence: "independence", unification: "independence", civil_war: "independence", subjugation: "subjugation", alliance: "preventive", preventive: "preventive", defense: "preventive", ideology: "ideology", resource: "ideology" });
export const WAR_CLASS_JA = Object.freeze({ plunder: "略奪・征服", succession: "継承", religion: "宗教", trade: "通商・海上覇権", independence: "独立・統一", subjugation: "従属の強制・離脱", preventive: "同盟義務・予防戦争", ideology: "イデオロギー・資源" });
export const warClassOf = (reason) => WAR_CLASS[reason] ?? "plunder";
/** 同じ 2 国の再戦までの冷却（月）。古代ほど長く、近代は短い（疲弊・同盟の再編を挟む）。世界の年は 0=紀元前 3000 年ごろ */
export const rematchCooldown = (year) => (year < 3000 ? 480 : year < 4500 ? 300 : year < 4850 ? 180 : 120);
/** 戦争の最長（月）。古代 50 年・中世 25 年・近世 10 年・近代 6 年。参戦国が多い大戦（近代）は 20 年まで */
export const warMaxMonths = (year, nStates = 2) => (year < 3000 ? 600 : year < 4500 ? 300 : year < 4850 ? 120 : nStates >= 6 ? 240 : 72);
/** 条約の型（v6.16.0: 軍事・従属・経済・領土・王家の 5 分類。講和は戦争ごとの専用の手続き）。months: 既定の期間／needs: 双方が採用している技術／dep: 従属の種類（a が宗主、b が従う側） */
export const TREATY_CATS = Object.freeze({ mil: "軍事", dep: "従属", eco: "経済", land: "領土", dyn: "王家" });
export const TREATY = Object.freeze({
  alliance: { ja: "攻守同盟", cat: "mil", months: 480, merit: "参戦を頼める", cost: "相手の戦争に巻き込まれる" },
  defensive: { ja: "防衛同盟", cat: "mil", months: 360, needs: ["diplomacy"], merit: "攻められたとき助けが来る", cost: "守りの戦争にだけ参戦する" },
  nonaggression: { ja: "不可侵条約", cat: "mil", months: 240, merit: "隣国に攻められにくくなる", cost: "こちらも宣戦しにくい" },
  passage: { ja: "軍事通過権", cat: "mil", months: 240, needs: ["roads"], merit: "相手の領内を軍が通れる", cost: "相手が強いと内政が脅かされる" },
  garrison: { ja: "駐留協定", cat: "mil", months: 360, needs: ["standing_army"], merit: "守りが固くなる", cost: "駐留国の影響が強まる" },
  feudal: { ja: "封建契約", cat: "dep", dep: "vassal", months: 1200, needs: ["administration"], merit: "宗主は軍役と貢納を得る", cost: "従う側は自由を失う" },
  tribute: { ja: "朝貢", cat: "dep", dep: "tributary", months: 1200, needs: ["diplomacy"], merit: "名目の服属で、攻められにくい", cost: "貢ぎ物を納める" },
  protectorate: { ja: "保護条約", cat: "dep", dep: "protectorate", months: 1200, needs: ["diplomacy"], merit: "宗主が守ってくれる", cost: "外交権を失う" },
  trade: { ja: "通商条約", cat: "eco", months: 240, merit: "交易の収入が増える", cost: "相手への依存が深まる" },
  tariff: { ja: "関税協定", cat: "eco", months: 240, needs: ["coinage"], merit: "関税が下がる", cost: "自国の産業が競争にさらされる" },
  unequal: { ja: "不平等条約", cat: "eco", months: 480, needs: ["coinage", "diplomacy"], merit: "強い側が一方的に有利になる", cost: "弱い側は関税と裁判の権利を失う" },
  border: { ja: "国境画定", cat: "land", months: 600, needs: ["surveying"], merit: "国境の紛争が減る", cost: "主張を諦める" },
  sphere: { ja: "勢力圏協定", cat: "land", months: 360, needs: ["diplomacy"], merit: "互いの縄張りを認める", cost: "圏内の国は強国に従いやすい" },
  purchase: { ja: "領土の買収", cat: "land", months: 12, needs: ["coinage"], merit: "戦わずに土地を得る", cost: "国庫を失う" },
  cession: { ja: "領土の割譲", cat: "land", months: 12, merit: "相手の歓心を買う", cost: "土地と民を失う" },
  exchange: { ja: "領土の交換", cat: "land", months: 12, needs: ["surveying"], merit: "国境がすっきりする", cost: "手放す土地の民が不満を持つ" },
  marriage: { ja: "婚姻同盟", cat: "dyn", months: 600, needs: ["diplomacy"], merit: "王家が結ばれ、関係が深まる", cost: "継承をめぐる争いの火種になる" },
  union: { ja: "同君連合", cat: "dyn", dep: "union", months: 1200, needs: ["diplomacy"], merit: "一人の君主を戴き、一体で動く", cost: "従う側の独立性が薄れる" },
  succession_pact: { ja: "王位継承協定", cat: "dyn", months: 600, needs: ["law"], merit: "継承の争いが減る", cost: "継承権を認める" },
});
export const adjustRel = (a, b, d) => { const c = (v) => Math.max(-100, Math.min(100, v)); a.relations[b.id] = c((a.relations[b.id] ?? 0) + d); b.relations[a.id] = c((b.relations[a.id] ?? 0) + d); };
export const treatyBetween = (civ, a, b, type) => civ.activeTreatyIds.map((i) => civ.treaties[i]).find((t) => t.active && (!type || t.type === type) && ((t.a === a.id && t.b === b.id) || (t.a === b.id && t.b === a.id)));
export const atWarWith = (civ, a, b) => a.warIds.map((i) => civ.wars[i]).some((w) => w.sides.a.includes(b.id) || w.sides.d.includes(b.id));
export const strength = (civ, st) => st.army * milMult(st) * (1 + (st.defense + (st.milDef ?? 0)) * 0.5);
/** 隣接する国家（領域が接している）。月ごと・国家ごとに1回計算して使い回す */
export function neighborStates(ctx, st) {
  const cache = ctx._nbr && ctx._nbrMonth === ctx.civ.monthIndex ? ctx._nbr : (ctx._nbr = new Map(), ctx._nbrMonth = ctx.civ.monthIndex, ctx._nbr);
  if (cache.has(st.id)) return cache.get(st.id);
  const out = new Set(); for (const g of byState(ctx).get(st.id) ?? []) for (const o of neighborGroups(ctx, g)) { const s = ctx.civ.groups[o]?.stateId; if (s && s !== st.id && ctx.civ.states[s].alive) out.add(s); }
  const r = [...out].sort(); cache.set(st.id, r); return r;
}
export function signTreaty(ctx, type, a, b, { decisionId = null, provenance = "simulation", reverse = false, extra = null } = {}) {
  if (reverse) [a, b] = [b, a]; // 従属の条約は a が宗主・b が従う側（reverse: 提案した側が従う側になる）
  const { civ, ids } = ctx, T = TREATY[type], id = ids.next("treaty"), t = { id, type, a: a.id, b: b.id, signedAt: civ.monthIndex, expiresAt: civ.monthIndex + T.months, active: true }; if (extra) t.terms = extra;
  civ.treaties[id] = t; civ.activeTreatyIds.push(id); adjustRel(a, b, T.cat === "dep" ? 5 : type === "alliance" || type === "union" || type === "marriage" ? 25 : T.cat === "land" ? 5 : 15);
  const title = T.dep ? `${b.name}が${a.name}の${{ vassal: "封臣", tributary: "朝貢国", protectorate: "保護国", union: "同君連合の一員" }[T.dep]}となった（${T.ja}）` : `${a.name}と${b.name}が${T.ja}を結んだ`;
  const ev = makeEvent(civ, ids, { kind: "treaty_signed", title, participants: [{ entityId: a.id, role: "party" }, { entityId: b.id, role: "party" }, { entityId: id, role: "treaty" }], location: null, facts: { type, a: a.id, b: b.id }, provenance, why: "双方が条件に合意した（提案が受け入れられた）" });
  t.event = ev.eventId; onTreatySigned(ctx, t, a, b); return t;
}
export function endTreaty(ctx, t, why, byId = null) {
  const { civ, ids } = ctx; t.active = false; onTreatyEnded(ctx, t); t.endedAt = civ.monthIndex; enqueue(ctx, "treaty", t.id, civ.monthIndex); if (t.type === "nonaggression") for (const x of [t.a, t.b]) if (civ.states[x]) civ.states[x].lastNapEnd = civ.monthIndex; civ.activeTreatyIds = civ.activeTreatyIds.filter((i) => i !== t.id);
  makeEvent(civ, ids, { kind: "treaty_ended", title: `${TREATY[t.type].ja}が${why}`, participants: [{ entityId: t.id, role: "treaty" }, { entityId: t.a, role: byId === t.a ? "breaker" : "party" }, { entityId: t.b, role: byId === t.b ? "breaker" : "party" }], location: null, effects: byId ? [{ targetId: t.id, property: "broken_by", before: null, after: byId }] : [], why: String(why) });
}
/** 過去の同じ相手との戦争が、今回の宣戦の理由になっていれば「反応」として結ぶ（負けた側が仕掛けるなら根拠は strong） */
function revengeCauses(civ, atk, def) {
  const out = []; for (const ev of recentEventsFor(civ, [atk.id], ["war_ended"], 1200, 6)) { if (!ev.participants.some((p) => p.entityId === def.id)) continue; const w = civ.wars[ev.participants.find((p) => p.role === "war")?.entityId]; const lost = w && ((w.sides.a.includes(atk.id) && w.outcome === "defender_victory") || (w.sides.d.includes(atk.id) && w.outcome === "aggressor_victory")); out.push({ targetId: ev.eventId, relation: "reaction_to", basis: lost ? "strong" : "plausible" }); if (out.length >= 2) break; }
  return out;
}
export function warReasonFor(ctx, atk, def) { // v6.19.0: 史実の分類（8 分類）で、時代・状況から重みを付けて選ぶ（決定的）。復讐・失地回復は口実（warPretextFor）
  const { civ } = ctx, mi = civ.monthIndex, h = hashSeed(atk.id, def.id, mi >> 3) % 10007 / 10007, year = civ.date.year;
  const era = year < 1200 ? 0 : year < 3000 ? 1 : year < 4200 ? 2 : year < 4700 ? 3 : 4, cA = civ.groups[atk.capitalGroupId], cB = civ.groups[def.capitalGroupId];
  const wt = { conquest: era === 0 ? 3.2 : era === 1 ? 2.6 : era === 2 ? 2.0 : 1.4, plunder: era === 0 ? 1.6 : era === 1 ? 0.8 : 0.1, subjugation: era >= 1 && atk.army > def.army * 1.8 ? 1.2 : 0.3, preventive: def.army > atk.army * 1.2 && (atk.relations?.[def.id] ?? 0) < -10 ? 1.1 : 0.2 };
  if (def.dynastyChangedAt != null && mi - def.dynastyChangedAt < 240) wt.succession = 3.2; else if (def.leader && def.leader.deposed) wt.succession = 1.2; else wt.succession = era >= 1 ? 0.5 : 0.2;
  if (cA && cB && dominant(cA).religionId && dominant(cB).religionId && dominant(cA).religionId !== dominant(cB).religionId) wt.religion = era === 0 ? 0.6 : era <= 3 ? 2.6 : 0.8; else wt.religion = 0.2;
  const coastal = (c) => !!c && (ctx.world?.cell?.coastDist?.[c.cell] ?? 9) <= 1; wt.trade_route = (atk.econ?.trade || def.econ?.trade) && era >= 1 ? 1.8 : 0.3; wt.maritime = coastal(cA) && coastal(cB) && era >= 2 ? 1.6 : 0;
  wt.unification = era >= 3 && cA && cB && dominant(cA).cultureId && dominant(cA).cultureId === dominant(cB).cultureId ? 1.6 : 0; wt.ideology = era >= 4 ? 2.2 : era === 3 ? 0.4 : 0; wt.resource = era >= 3 ? 1.0 : 0;
  const ents = Object.entries(wt).filter(([, v]) => v > 0), tot = ents.reduce((a, [, v]) => a + v, 0); let x = h * tot; for (const [k, v] of ents) { x -= v; if (x <= 0) return k; } return "conquest";
}
/** 口実（理由とは別）: 近い過去に戦った相手なら報復、国土を失っていれば失地の回復 */
export function warPretextFor(ctx, atk, def) { const mi = ctx.civ.monthIndex; if ((atk.grudges?.[def.id] ?? 0) >= 0.25) return "revenge"; /* v7.0.0: 恨み（講和で失ったもの）が次の戦争の口実になる */ if (atk.lastWarWith?.[def.id] != null && mi - atk.lastWarWith[def.id] < 1200) return "revenge"; return null; }
export function declareWar(ctx, atk, def, { reason = "conquest", decisionId = null, provenance = "simulation", goals = null } = {}) {
  const { civ, ids, rng } = ctx; if (reason === "conquest") reason = warReasonFor(ctx, atk, def);
  const id = ids.next("war"), w = { id, aggressor: atk.id, defender: def.id, sides: { a: [atk.id], d: [def.id] }, startedAt: civ.monthIndex, status: "active", reason, score: 0, occupied: [], outcome: null, endedAt: null, casualties: 0 }; { const pt = warPretextFor(ctx, atk, def); if (pt) w.pretext = pt; w.cls = warClassOf(reason); }
  w.phase = "active"; w.goals = (goals ?? defaultGoals(reason, atk.id, def.id)).map((g) => ({ ...g })); w.surrender = {}; w.log = []; w.fronts = []; /* v7.0.0 */ civ.wars[id] = w; civ.activeWarIds.push(id); atk.warIds.push(id); def.warIds.push(id); adjustRel(atk, def, -40);
  const ev = makeEvent(civ, ids, { kind: "war_declared", title: `${atk.name}が${def.name}に宣戦した`, participants: [{ entityId: atk.id, role: "aggressor" }, { entityId: def.id, role: "defender" }, { entityId: id, role: "war" }], location: civ.groups[def.capitalGroupId] ? { cell: civ.groups[def.capitalGroupId].cell } : null, causes: revengeCauses(civ, atk, def), facts: { warId: id, aggressor: atk.id, defender: def.id }, provenance, why: `開戦の理由: ${WAR_REASON_JA[reason] ?? reason}${w.pretext === "revenge" ? "（口実: 近い過去に戦った相手への報復）" : ""}` });
  w.declaredEvent = ev.eventId;
  callAlliances(ctx, w, atk, def); // v7.0.0: 二国間の同盟と盟約を統一した「同盟」の参戦要請（義務の強さ・共通の敵・担当国の決断）
  callDependents(ctx, w, atk, def); // v6.16.0: 従属国の参戦
 // v6.16.0: 従属国・盟約の参戦
  ctx.warOps?.init(ctx, w); // v6.1.0 M6: WCDE の世界では、戦域・部隊・作戦を持つ戦争の記録にする
  return w;
}
export function endWar(ctx, w, outcome, terms = null) {
  const { civ, ids } = ctx; if (w.status !== "active") return; w.status = "ended"; w.outcome = outcome; w.endedAt = civ.monthIndex; civ.activeWarIds = civ.activeWarIds.filter((i) => i !== w.id);
  const all = [...w.sides.a, ...w.sides.d].map((i) => civ.states[i]); for (const s of all) s.warIds = s.warIds.filter((i) => i !== w.id);
  const atk = civ.states[w.aggressor], def = civ.states[w.defender]; const lead = outcome === "aggressor_victory" || (outcome === "negotiated" && w.score > 0);
  const gained = [], moved = []; const byDemands = terms?.kind === "conference" || terms?.kind === "demands"; /* v7.0.0: 講和会議・要求つきの講和は、領土の移転を要求の実行（war-peace.js）がすでに済ませている */ const settled = byDemands ? [] : ctx.warOps?.settle ? ctx.warOps.settle(ctx, w, outcome, terms) : null; // v6.1.0 M7: WCDE の世界では、占領した国家ごとに領土を移す
  if (settled) for (const x of settled) { gained.push(x.gid); moved.push(x); } else if (lead && atk?.alive) for (const gid of w.occupied) { const g = civ.groups[gid]; if (g && g.stateId === w.defender) { g.stateId = atk.id; gained.push(gid); } }
  if (!byDemands) submitAfterWar(ctx, w, outcome); // v6.16.0: 敗戦国が従属することがある
  for (const x of w.sides.a) for (const y of w.sides.d) { const X = civ.states[x], Y = civ.states[y]; if (X && Y) { (X.lastWarWith ??= {})[y] = civ.monthIndex; (Y.lastWarWith ??= {})[x] = civ.monthIndex; } } // v6.9.0: 同じ 2 国の再戦を抑える
  for (const s of all) { s.lastWarEnd = civ.monthIndex; s.stability = Math.max(0, s.stability - 0.04); if (s.campaign?.warId === w.id) s.campaign = null; }
  if (atk && def) adjustRel(atk, def, -10);
  makeEvent(civ, ids, { kind: "war_ended", title: `${atk?.name ?? "?"}と${def?.name ?? "?"}の戦争が終わった（${{ aggressor_victory: byDemands ? "攻撃側の勝利（講和会議）" : "攻撃側の勝利", defender_victory: byDemands ? "防衛側の勝利（講和会議）" : "防衛側の勝利", stalemate: "決着つかず", negotiated: terms?.kind === "cession" ? "講和（占領地の割譲）" : terms?.kind === "demands" ? "講和（要求つき）" : "講和", state_dissolved: "国家の消滅" }[outcome] ?? outcome}）`, participants: [{ entityId: w.id, role: "war" }, ...all.map((s) => ({ entityId: s.id, role: "belligerent" }))], location: null, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }], effects: gained.map((gid) => { const m = moved.find((x) => x.gid === gid); return { targetId: gid, property: "stateId", before: m?.from ?? w.defender, after: m?.to ?? atk.id }; }), facts: { warId: w.id, outcome, terms: terms?.kind ?? null, stateId: gained.length ? (moved[0]?.to ?? atk?.id ?? null) : null, cells: gained.slice(0, 24).map((gid) => civ.groups[gid]?.cell).filter(Number.isFinite) } });
  ctx.warOps?.finalize(ctx, w, outcome); // 作戦・部隊・戦域を片付け、代表的な戦いだけを資料に残す（領土の移転のあと）
}

/** 月次（conflict フェーズ）: 条約の期限・戦況・占領・講和。国家が滅びた戦争は終える */
export function stepWars(ctx) {
  const { world, civ, ids, rng } = ctx, mi = civ.monthIndex;
  if (mi % 12 === 0) { for (const i of [...civ.activeTreatyIds]) { const t = civ.treaties[i]; if (t.expiresAt <= mi || !civ.states[t.a]?.alive || !civ.states[t.b]?.alive) endTreaty(ctx, t, "期限を迎えた"); } for (const id in civ.states) { const s = civ.states[id]; if (s.alive) for (const k in s.relations) { s.relations[k] = Math.round(s.relations[k] * 0.9 * 10) / 10; if (Math.abs(s.relations[k]) < 1) delete s.relations[k]; } } }
  const groups = byState(ctx); ctx.warOps?.monthly(ctx);
  for (const wid of [...civ.activeWarIds]) {
    const w = civ.wars[wid], A = w.sides.a.map((i) => civ.states[i]).filter((s) => s.alive), D = w.sides.d.map((i) => civ.states[i]).filter((s) => s.alive);
    if (!civ.states[w.aggressor].alive || !civ.states[w.defender].alive || !A.length || !D.length) { endWar(ctx, w, "state_dissolved"); continue; }
    if (ctx.warOps) { ctx.warOps.step(ctx, w); continue; } // v6.1.0 M6: 作戦・会戦の戦争モデル（WCDE の世界）。v5 の世界は下の簡易モデル
    const sA = A.reduce((s, x) => s + strength(civ, x), 0), sD = D.reduce((s, x) => s + strength(civ, x), 0);
    w.score = Math.max(-100, Math.min(100, w.score + ((sA - sD) / (sA + sD + 1)) * 6 + (rng() - 0.5) * 3));
    const lossA = 0.0025 * (sD / (sA + sD + 1)), lossD = 0.0025 * (sA / (sA + sD + 1)); let dead = 0;
    for (const [side, loss] of [[A, lossA], [D, lossD]]) for (const s of side) { const gs = groups.get(s.id); if (!gs?.length) continue; const g = gs[Math.floor(rng() * gs.length)], l = g.pop * loss * 4; g.pop -= l; dead += l; }
    w.casualties += dead;
    if (mi % 3 === 0 && rng() < 0.4) makeEvent(civ, ids, { kind: "battle_fought", title: `${civ.states[w.aggressor].name}と${civ.states[w.defender].name}の戦闘`, participants: [{ entityId: w.id, role: "war" }, { entityId: w.aggressor, role: "aggressor" }, { entityId: w.defender, role: "defender" }], location: { cell: civ.groups[civ.states[w.defender].capitalGroupId]?.cell ?? null }, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }], effects: [{ targetId: w.id, property: "score", before: null, after: Math.round(w.score) }] });
    if (w.score >= 35 && w.occupied.length < 3 && rng() < 0.08) { // 占領: 防衛側のうち、攻撃側の首都に最も近い集団
      const cap = civ.groups[civ.states[w.aggressor].capitalGroupId]; const cand = D.flatMap((s) => groups.get(s.id) ?? []).filter((g) => !w.occupied.includes(g.id)); if (cap && cand.length) { cand.sort((a, b) => distKm(world, cap.cell, a.cell) - distKm(world, cap.cell, b.cell)); const g = cand[0]; w.occupied.push(g.id); makeEvent(civ, ids, { kind: "territory_occupied", title: "領土が占領された", participants: [{ entityId: g.id, role: "territory" }, { entityId: w.id, role: "war" }], location: { cell: g.cell }, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] }); }
    }
    const age = mi - w.startedAt;
    if (w.score >= 80) endWar(ctx, w, "aggressor_victory"); else if (w.score <= -80) endWar(ctx, w, "defender_victory"); else if (age > 120) endWar(ctx, w, "stalemate");
  }
}
