// v7.2.0: 政体の移り変わりを「局面」にする。旧版は、年に 1 回のさいころで政体が突然変わり、前兆も原因も選択もなかった。
//   ・新しい 3 つの数値（国内政治 st.politics）: unrest 民衆の不満（革命の機運）／reformMood 改革の機運／militaryRise 軍の台頭。正統性・安定度と合わせて見る。
//   ・局面（st.arc）: 前兆（記録だけ。条件が消えれば自然に消える）→ 危機（担当国は決断、アルゴリズム国家は同じ式で自動）→ 決着（原因つきで年表に残る）。
//       種類: reform 制度改革／revolution 革命／coup 軍の掌握／election 選挙（どの勢力が勝つか）
//   ・誘導: 担当国が政体を変えたいとき（state.setRegime）は、一瞬で変えず、局面を始める。危機で方法（穏当・動員・軍）を選び、成功の見込みは見えるが、失敗もある。
//   ・WCDE が起こす危機: 不満・軍の台頭・改革の機運が高いと、前兆→危機が起きる。選択（抑える・懐柔・受け入れる・放置）に失敗すると、革命・クーデターになる。
//   ・政体を変える経路はここに一本化する（旧 stepRegimeEvolution の確率判定・politics.js の政変・evolvePolity は呼ばない）。
import { hashSeed } from "../civ/civ-state.js";
import { makeEvent, withCause } from "../civ/events.js";
import { enthrone } from "../civ/states.js";
import { REGIMES, regimeOf, officeJa, regimeGate } from "./regimes.js";
import { regimeCandidates, switchRegime, familyOf, changeScale, pressureOf, playerRegimeOptions } from "./regime-evolution.js";
import { effective } from "./domains/effective.js";
import { initPolitics } from "./domains/politics.js";
import { registerDecision, raise, DECISION_HOOKS } from "./decisions.js";
import { isLive } from "./decision-state.js";
import { addShock } from "./shocks.js";
import { neighborStates } from "../civ/diplomacy.js";

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v), r3 = (x) => Math.round(x * 1000) / 1000;
const U = (civ, st, ...k) => (hashSeed(civ.historySeed, "trn", st.id, ...k) % 1000003) / 1000003;
const scaleOf = (st) => 20 + (st.pop ?? 0) * 0.0003;
const cause = (id) => (id ? [{ targetId: id, relation: "caused_by", basis: "direct" }] : []);

export const ARC_KINDS = Object.freeze({
  revolution: { ja: "革命", how: "revolution", driver: "unrest", omen: "民衆の不満が限界に近づいている" },
  coup: { ja: "軍の掌握", how: "military_takeover", driver: "militaryRise", omen: "軍の一部が不穏な動きを見せている" },
  reform: { ja: "制度改革", how: "reform", driver: "reformMood", omen: "改革を求める声が、官僚・商人・議員のあいだで強まっている" },
  election: { ja: "選挙", how: null, driver: null, omen: "選挙の時期が近づき、各派が動き出した" },
});
export const METRIC_JA = Object.freeze({ unrest: "民衆の不満", reformMood: "改革の機運", militaryRise: "軍の台頭" });
/** 起きる条件（しきい値）。前兆の間にこれを大きく下回れば、局面は自然に消える */
const THRESH = { revolution: 0.55, coup: 0.5, reform: 0.33 };
/** 選挙のある政体 */
export const ELECTED = Object.freeze(new Set(["parliamentary_republic", "presidential_republic", "semi_presidential", "parliamentary_monarchy", "consociational_republic", "dominant_party", "dual_monarchy"]));
/** 選挙で争う勢力のまとまり（政党の代わり）。fac は支持勢力、ide は勝ったあとの国家思想 */
export const BLOCS = Object.freeze({
  conservative: { ja: "保守派", fac: ["nobility", "clergy"], ide: "conservative" },
  business: { ja: "実業派", fac: ["merchants", "artisans", "bureaucrats"], ide: "liberal" },
  populist: { ja: "民衆派", fac: ["commoners"], ide: "socialist" },
  military: { ja: "国防派", fac: ["military"], ide: "militarist" },
});
const lv = (p) => (p >= 0.7 ? "見込みは高い" : p >= 0.45 ? "五分五分" : p >= 0.25 ? "見込みは低い" : "ほぼ望めない");
const lvB = (x) => (x >= 0.5 ? "優勢" : x >= 0.38 ? "有力" : x >= 0.25 ? "劣勢" : "弱い");

// ---- 数値の更新（3 か月ごと）
export function stepMetrics(ctx, st) {
  const { civ } = ctx, P = st.politics; if (!P?.factions) return; const f = P.factions, sup = (k) => f[k]?.support ?? 0.5, legE = effective(civ, st, "legitimacy"), war = st.warIds.length > 0, mi = civ.monthIndex;
  const mod = ["merchants", "artisans", "bureaucrats"].filter((k) => f[k]).map(sup), avgMod = mod.length ? mod.reduce((a, b) => a + b, 0) / mod.length : 0.5, ideas = P.ideas ?? {};
  if (mi % 12 === 0 || P.bestGap == null) { // 年 1 回: 時代の新しい政体との段差・近隣の様子（重い計算なので毎期は行わない）
    const cands = regimeCandidates(ctx, st, 0.3), cur = regimeOf(st); let gap = 0; for (const c of cands) if (c.gap > gap) gap = c.gap; P.bestGap = gap;
    const nbs = neighborStates(ctx, st); let newer = 0; for (const n of nbs) { const o = civ.states[n]; if (o?.alive && changeScale(cur, regimeOf(o)) > 0 && (REGIMES[regimeOf(o)] && familyOf(regimeOf(o)) !== familyOf(cur))) newer++; } P.nbNewer = nbs.length ? newer / nbs.length : 0;
  }
  const unrestT = clamp(0.55 * (1 - sup("commoners")) + 0.25 * (P.fatigue ?? 0) + 0.15 * (1 - st.stability) + (st.treasury < 0 ? 0.1 : 0) + (st.policy.tax > 0.3 ? 0.08 : 0));
  const reformT = clamp(0.38 * Math.min(1, (P.bestGap ?? 0) / 3) + 0.2 * Math.max(0, (avgMod - 0.5) * 2) + 0.25 * Math.max(ideas.reformism ?? 0, 0.7 * (ideas.egalitarianism ?? 0)) + 0.17 * (P.nbNewer ?? 0));
  const milT = clamp(0.5 * Math.max(0, (sup("military") - 0.4) / 0.6) + 0.2 * (war ? 1 : 0) + 0.15 * clamp(P.fatigue ?? 0) + 0.15 * (1 - legE));
  P.unrest = r3(clamp((P.unrest ?? 0.25) + (unrestT - (P.unrest ?? 0.25)) * 0.2)); P.reformMood = r3(clamp((P.reformMood ?? 0.15) + (reformT - (P.reformMood ?? 0.15)) * 0.2)); P.militaryRise = r3(clamp((P.militaryRise ?? 0.2) + (milT - (P.militaryRise ?? 0.2)) * 0.2));
}
/** 3 つの数値。civ を渡すと有効値（創造主の介入を含む）。渡さなければ通常値 */
export const metricsOf = (st, civ = null) => civ ? { unrest: effective(civ, st, "unrest"), reformMood: effective(civ, st, "reformMood"), militaryRise: effective(civ, st, "militaryRise") } : { unrest: st.politics?.unrest ?? 0, reformMood: st.politics?.reformMood ?? 0, militaryRise: st.politics?.militaryRise ?? 0 };

// ---- 目標の政体の選び方
function pickTarget(ctx, st, kind, key) {
  const { civ } = ctx, cur = regimeOf(st), curF = familyOf(cur), pr = pressureOf(ctx, st);
  let c = regimeCandidates(ctx, st, Math.max(pr, kind === "reform" ? 0.2 : 0.6)).filter((x) => x.id !== cur);
  if (kind === "coup") c = c.filter((x) => familyOf(x.id) === "aut"); else if (kind === "revolution") c = c.filter((x) => familyOf(x.id) !== curF || x.gap > 0); else c = c.filter((x) => familyOf(x.id) !== "aut" && changeScale(cur, x.id) <= 0.6 && x.gap >= 0); // 改革: 時代とともに上の政体へ（独裁・統制は改革ではない）
  if (!c.length) return null;
  // 多様性の補正（v7.2.0）: 隣国と同じ政体を選びやすい重みが連鎖して、世界が 1 つの政体に染まるのを防ぐ。世界で多い政体ほど割り引き、改革では「同じ段の横滑り」より上の政体へ進むほうを選びやすくする
  const share = {}; let nAlive = 0; for (const o of Object.values(civ.states)) if (o.alive) { const r = regimeOf(o); share[r] = (share[r] ?? 0) + 1; nAlive++; }
  c = c.map((x) => ({ ...x, w: x.w / (1 + 4 * ((share[x.id] ?? 0) / Math.max(1, nAlive))) * (kind === "reform" && x.gap < 1 ? 0.35 : 1) }));
  const tot = c.reduce((a, x) => a + x.w, 0); let x = U(civ, st, civ.monthIndex, "tg", kind, key ?? "") * tot, pick = c[c.length - 1]; for (const e of c) { x -= e.w; if (x <= 0) { pick = e; break; } } return pick.id;
}
/** 革命を和らげた「譲歩」の行き先（革命の目標より小さな変更） */
function softerTarget(ctx, st, to) { const cur = regimeOf(st); const c = regimeCandidates(ctx, st, 0.3).filter((x) => x.id !== cur && changeScale(cur, x.id) < changeScale(cur, to) && x.gap >= 0).sort((a, b) => b.w - a.w); return c[0]?.id ?? null; }

// ---- 局面の開始・前兆
function newId(civ) { civ.wcde.arcSeq = (civ.wcde.arcSeq ?? 0) + 1; return civ.wcde.arcSeq; }
/** 局面を始める。by: wcde（国の事情で起きる）／player（担当国が政体を変えようとしている）。delay: 前兆から危機までの月数 */
export function igniteArc(ctx, st, { kind, to = null, by = "wcde", delay = null, note = null }) {
  const { civ, ids } = ctx, mi = civ.monthIndex, K = ARC_KINDS[kind]; if (!K || st.arc) return null; const P = (st.politics ??= initPolitics(st));
  if (kind !== "election" && !to) to = pickTarget(ctx, st, kind); if (kind !== "election" && !to) return null;
  const d = delay ?? 3 + Math.floor(U(civ, st, mi, "dl", kind) * 10), from = regimeOf(st), id = newId(civ);
  const title = kind === "election" ? `${st.name}で${K.omen}` : by === "player" ? `${st.name}の指導部は、「${REGIMES[to].ja}」への移行に向けて動き出した` : `${st.name}で${K.omen}（${REGIMES[from].ja}の先行きに不安）`;
  const ev = makeEvent(civ, ids, { kind: "regime_omen", title, participants: [{ entityId: st.id, role: "state" }], location: civ.groups[st.capitalGroupId] ? { cell: civ.groups[st.capitalGroupId].cell } : null, facts: { stateId: st.id, arc: kind, from, to, by, ...metricsOf(st, civ) }, why: note ?? (K.driver ? `${METRIC_JA[K.driver]}が ${Math.round((P[K.driver] ?? 0) * 100)}%（基準 ${Math.round((THRESH[kind] ?? 0) * 100)}%）に達した` : "定期の選挙"), provenance: by === "player" ? "player" : "simulation" });
  st.arc = { id, kind, from, to, by, stage: "omen", startAt: mi, crisisAt: mi + d, par: ev.eventId };
  return st.arc;
}

// ---- 危機の選択肢と、成功の見込み
const sup = (st, k) => st.politics?.factions?.[k]?.support ?? 0.5;
/** 危機の選択肢（成功の見込みつき）。incumbent: 政権の側（WCDE が起こした局面）／pursuit: 担当国が自分で政体を変えようとしている局面 */
export function arcOptions(ctx, st) {
  const { civ } = ctx, a = st.arc, legE = effective(civ, st, "legitimacy"), S = scaleOf(st), M = metricsOf(st, civ), scale = a.to ? changeScale(a.from, a.to) : 0.2, treasuryOk = st.treasury > S * 1.5, dr = ARC_KINDS[a.kind]?.driver ? M[ARC_KINDS[a.kind].driver] : 0;
  if (a.kind === "election") return electionOptions(ctx, st);
  const soft = a.by === "wcde" ? softerTarget(ctx, st, a.to) : null;
  if (a.by === "player") {
    const legal = clamp(0.3 + 0.45 * M.reformMood + 0.2 * legE - 0.35 * scale), mob = clamp(0.25 + 0.5 * M.unrest + 0.15 * sup(st, "commoners") - 0.2 * scale - 0.2 * (legE - 0.5)), force = clamp(0.15 + 0.6 * sup(st, "military") + 0.25 * M.militaryRise - 0.2 * scale);
    return [
      { id: "legal", ja: "議会・合議で穏当に進める", p: legal, hint: `${lv(legal)}。成功すれば代償は小さい。失敗しても大事にはならない`, how: "reform" },
      { id: "mobilize", ja: "民衆と勢力を動員して押し切る", p: mob, hint: `${lv(mob)}。成功すれば革命になる。失敗すれば弾圧で安定度を失う`, how: "revolution" },
      { id: "force", ja: "軍を動かして権力を握る", p: force, hint: `${lv(force)}。成功すれば軍が実権を握る。失敗すれば軍の支持を失う`, how: "military_takeover" },
      { id: "withdraw", ja: "いまは見送る", p: 1, hint: "代償なし。しばらくは再び試せない", how: null },
    ];
  }
  const mil = sup(st, "military"), dying = a.kind === "coup" ? "粛清して抑える" : a.kind === "revolution" ? "武力で鎮圧する" : "改革派を抑える";
  const resist = clamp(0.2 + 0.45 * mil + 0.15 * (1 - dr) + 0.1 * legE - (a.kind === "coup" ? 0.15 : 0)), bargain = clamp(0.3 + (treasuryOk ? 0.3 : -0.1) + 0.2 * legE - 0.2 * dr), wait = clamp(0.35 + 0.5 * dr - 0.3 * legE);
  const accTo = a.kind === "revolution" && soft ? soft : a.to;
  return [
    { id: "accept", ja: a.kind === "reform" ? `改革を受け入れ、「${REGIMES[accTo].ja}」へ移る` : `先手を打ち、「${REGIMES[accTo].ja}」へ穏当に移る`, p: 0.92, to: accTo, hint: `代償は小さい。政体が${REGIMES[a.from].ja}から${REGIMES[accTo].ja}へ変わる`, how: "reform" },
    { id: "resist", ja: dying, p: resist, hint: `${lv(resist)}。成功すれば当面は収まるが正統性を失う。失敗すれば${ARC_KINDS[a.kind].ja}が起きる`, how: ARC_KINDS[a.kind].how },
    { id: "bargain", ja: "有力者を懐柔する（国庫を使う）", p: bargain, hint: `${lv(bargain)}。国庫を使う。失敗すれば金も失い、${ARC_KINDS[a.kind].ja}が起きる`, how: ARC_KINDS[a.kind].how },
    { id: "wait", ja: "何もしない", p: 1 - wait, hint: `${Math.round(wait * 100) >= 55 ? "危うい" : "様子を見る"}。放置すると${ARC_KINDS[a.kind].ja}になりうる`, how: ARC_KINDS[a.kind].how },
  ];
}
function blocPower(st, id) {
  const f = st.politics.factions, B = BLOCS[id], ks = B.fac.filter((k) => f[k]); if (!ks.length) return null; let s = 0, w = 0; for (const k of ks) { s += (f[k].influence ?? 0.1) * f[k].support; w += f[k].influence ?? 0.1; }
  const P = st.politics, M = metricsOf(st); let v = w ? (s / w) * 0.6 + Math.min(0.4, w) * 0.5 : 0; if (P.ruling === id) v += 0.04; if (id === "military" && st.warIds.length) v += 0.05; if (id === "populist") v += 0.1 * M.unrest; if (id === "business") v += 0.05 * M.reformMood; return v;
}
function electionOptions(ctx, st) {
  const S = scaleOf(st), cost = Math.round(S * 0.4), opts = [];
  for (const id of Object.keys(BLOCS)) { const v = blocPower(st, id); if (v == null) continue; opts.push({ id: "back_" + id, ja: `${BLOCS[id].ja}を後押しする`, p: v, bloc: id, hint: `いまの勢い: ${lvB(v)}。国庫 ${cost} を使う。勝てば恩義、負ければ干渉が露見して正統性を失う`, cost }); }
  opts.push({ id: "neutral", ja: "中立を保つ", p: 0, hint: "費用なし。結果は各派の勢いで決まる" }); return opts;
}

// ---- 決着
function turnLeader(ctx, st) { const { civ } = ctx; if (st.player && isLive(civ) && DECISION_HOOKS.succession(ctx, st, "coup")) return; enthrone(ctx, st, { kin: false }); if (st.leader) st.leader.title = officeJa(REGIMES[regimeOf(st)].ruler); }
function costOf(scale, violent) { return { legit: r3((0.04 + 0.3 * scale) * (violent ? 1 : 0.5)), years: Math.round(6 + 30 * scale), stab: r3((violent ? 0.04 : 0.01) + (violent ? 0.12 : 0.05) * scale) }; }
function endArc(ctx, st, extra = {}) { const P = st.politics; P.arcEnd = ctx.civ.monthIndex; if (extra.metric) P[extra.metric] = r3(clamp((P[extra.metric] ?? 0) - (extra.drop ?? 0.2))); st.arc = null; }
function commitChange(ctx, st, arc, to, how, parId) {
  const { civ } = ctx, mi = civ.monthIndex, scale = changeScale(arc.from, to), violent = how === "revolution" || how === "military_takeover", c = costOf(scale, violent);
  const r = withCause(parId, () => switchRegime(ctx, st, to, how)); if (!r) { endArc(ctx, st); return null; }
  addShock(st, mi, "regime", c.legit, c.years); st.stability = clamp(st.stability - c.stab * 0.5); const P = st.politics; P.unrest = r3(violent ? clamp(P.unrest * 0.6) : clamp(P.unrest * 0.5)); P.reformMood = 0.1; P.militaryRise = r3(how === "military_takeover" ? 0.5 : clamp((P.militaryRise ?? 0) * 0.6));
  if (violent) turnLeader(ctx, st); else if (st.leader) st.leader.title = officeJa(REGIMES[to].ruler); endArc(ctx, st); ctx._byState = null; return r;
}
function failEvent(ctx, st, arc, title, facts = {}) { return makeEvent(ctx.civ, ctx.ids, { kind: "regime_arc_result", title, participants: [{ entityId: st.id, role: "state" }], facts: { stateId: st.id, arc: arc.kind, ...facts }, causes: cause(arc.par), provenance: st.player ? "player" : "simulation" }); }
function resolveRegime(ctx, st, arc, optId) {
  const { civ } = ctx, opts = arcOptions(ctx, st), o = opts.find((x) => x.id === optId) ?? opts[opts.length - 1], mi = civ.monthIndex, roll = U(civ, st, mi, "res", arc.id, o.id), K = ARC_KINDS[arc.kind], P = st.politics, S = scaleOf(st);
  if (arc.by === "player") {
    if (o.id === "withdraw") { failEvent(ctx, st, arc, `${st.name}は、「${REGIMES[arc.to].ja}」への移行をいったん見送った`, { option: o.id }); P.arcEnd = mi - 120; endArc(ctx, st); return "見送った"; }
    if (roll < o.p) { const r = commitChange(ctx, st, arc, arc.to, o.how, arc.par); return r ? `成功。政体が${REGIMES[r.from].ja}から${REGIMES[r.to].ja}へ移った` : "成功したが、移れなかった"; }
    if (o.id === "legal") { addShock(st, mi, "regime", 0.03, 4); failEvent(ctx, st, arc, `${st.name}の「${REGIMES[arc.to].ja}」への移行は、議会で行き詰まった`, { option: o.id }); endArc(ctx, st); return "失敗。議論は行き詰まった"; }
    if (o.id === "mobilize") { st.stability = clamp(st.stability - 0.1); P.unrest = r3(clamp(P.unrest + 0.1)); addShock(st, mi, "regime", 0.08, 8); failEvent(ctx, st, arc, `${st.name}の動員は弾圧され、「${REGIMES[arc.to].ja}」への移行は失敗した`, { option: o.id }); endArc(ctx, st); return "失敗。弾圧で安定度を失った"; }
    const f = P.factions?.military; if (f) f.support = clamp(f.support - 0.25); st.stability = clamp(st.stability - 0.12); addShock(st, mi, "regime", 0.1, 8); failEvent(ctx, st, arc, `${st.name}で軍が動こうとしたが、計画は露見して失敗した`, { option: o.id }); endArc(ctx, st); return "失敗。軍の支持を失った";
  }
  // 政権の側
  if (o.id === "accept") { const r = commitChange(ctx, st, arc, o.to, "reform", arc.par); return r ? `政体が${REGIMES[r.from].ja}から${REGIMES[r.to].ja}へ移った` : "移れなかった"; }
  if (o.id === "bargain") { st.treasury -= S * 1.5; }
  const held = o.id === "wait" ? roll < o.p : roll < o.p; // wait の p は「何も起きない見込み」
  if (held) {
    const metric = K.driver; if (o.id === "resist") { addShock(st, mi, "regime", 0.04, 6); st.stability = clamp(st.stability - 0.02); } if (o.id === "bargain") { const fk = arc.kind === "coup" ? "military" : arc.kind === "revolution" ? "commoners" : "bureaucrats", f = P.factions?.[fk]; if (f) f.support = clamp(f.support + 0.06); }
    failEvent(ctx, st, arc, `${st.name}で${K.ja}の動きは収まった（${o.id === "resist" ? "力で抑えた" : o.id === "bargain" ? "有力者を懐柔した" : "自然に静まった"}）`, { option: o.id, held: true }); endArc(ctx, st, { metric, drop: o.id === "wait" ? 0.08 : 0.2 }); return "収まった";
  }
  const how = K.how === "reform" ? "reform" : K.how, to = arc.to; failEvent(ctx, st, arc, `${st.name}で${o.id === "resist" ? "鎮圧に失敗し" : o.id === "bargain" ? "懐柔は実らず" : "放置されたまま"}、${K.ja}が起きた`, { option: o.id, held: false });
  const r = commitChange(ctx, st, arc, to, how, arc.par); return r ? `${K.ja}が起き、政体が${REGIMES[r.from].ja}から${REGIMES[r.to].ja}へ移った` : "起きたが、政体は変わらなかった";
}
function resolveElection(ctx, st, arc, optId) {
  const { civ } = ctx, P = st.politics, mi = civ.monthIndex, opts = electionOptions(ctx, st), o = opts.find((x) => x.id === optId) ?? opts[opts.length - 1], S = scaleOf(st), backed = o.bloc ?? null, noise = (id) => (U(civ, st, mi, "el", arc.id, id) - 0.5) * 0.12;
  if (backed) st.treasury -= o.cost;
  const power = {}; for (const id of Object.keys(BLOCS)) { const v = blocPower(st, id); if (v != null) power[id] = v + (backed === id ? 0.09 : 0) + noise(id) + (regimeOf(st) === "dominant_party" && P.ruling === id ? 0.3 : 0); }
  const ranked = Object.entries(power).sort((a, b) => b[1] - a[1]); const win = ranked[0][0], margin = ranked[1] ? ranked[0][1] - ranked[1][1] : 1;
  for (const [id, B] of Object.entries(BLOCS)) for (const k of B.fac) { const f = P.factions[k]; if (!f) continue; f.support = clamp(f.support + (id === win ? 0.06 : -0.025) + (backed === id && id === win ? 0.03 : 0) - (backed === id && id !== win ? 0.03 : 0)); }
  P.ruling = win; if (BLOCS[win].ide) st.stateIdeology = BLOCS[win].ide; P.nextElection = mi + 12 * (4 + Math.floor(U(civ, st, mi, "ne") * 3));
  let note = `${BLOCS[win].ja}が勝った`; if (backed) { if (backed === win) note += "。後押しした勢力が勝ち、恩義を得た"; else { addShock(st, mi, "regime", 0.03, 4); st.stability = clamp(st.stability - 0.02); note += `。後押しした${BLOCS[backed].ja}は敗れ、干渉が露見した`; } }
  if (margin < 0.03) { P.unrest = r3(clamp(P.unrest + 0.05)); note += "。僅差で紛糾した"; }
  const ev = makeEvent(civ, ctx.ids, { kind: "election_held", title: `${st.name}の選挙で${BLOCS[win].ja}が勝った${backed ? (backed === win ? "（支援した勢力が勝利）" : `（支援した${BLOCS[backed].ja}は敗北）`) : ""}`, participants: [{ entityId: st.id, role: "state" }], facts: { stateId: st.id, winner: win, backed, margin: r3(margin), power: Object.fromEntries(ranked.map(([k, v]) => [k, r3(v)])) }, causes: cause(arc.par), provenance: st.player ? "player" : "simulation" });
  if (win === "military" && st.politics.factions.military && st.politics.factions.military.support > 0.6 && regimeOf(st) !== "military_junta" && U(civ, st, mi, "mc") < 0.4) { st.arc = null; const a = igniteArc(ctx, st, { kind: "coup", delay: 6, note: "選挙で国防派が勝ち、軍の発言力が増した" }); if (a) a.par = ev.eventId; } else { P.arcEnd = mi; st.arc = null; }
  return note;
}
function resolveArc(ctx, st, optId) { const arc = st.arc; return arc.kind === "election" ? resolveElection(ctx, st, arc, optId) : resolveRegime(ctx, st, arc, optId); }

/** アルゴリズム国家の選び方: 損得に国ごとのゆらぎを足す */
function autoPick(ctx, st) {
  const { civ } = ctx, arc = st.arc, opts = arcOptions(ctx, st), mi = civ.monthIndex, n = (id) => (U(civ, st, mi, "ap", arc.id, id) - 0.5) * 0.4;
  if (arc.kind === "election") { const f = opts.filter((x) => x.bloc); return U(civ, st, mi, "bk", arc.id) < 0.25 && f.length ? f.sort((a, b) => b.p - a.p)[0].id : "neutral"; }
  const scale = arc.to ? changeScale(arc.from, arc.to) : 0.2, Cv = 0.3 + 1.4 * scale, Cp = 0.1 + 0.5 * scale; let best = opts[0].id, bv = -1e9;
  for (const o of opts) { const v = o.id === "accept" ? -Cp : o.id === "wait" ? -(1 - o.p) * Cv : -(1 - o.p) * Cv - (o.id === "bargain" ? 0.15 : 0.1); if (v + n(o.id) > bv) { bv = v + n(o.id); best = o.id; } }
  if (arc.by === "player") { const c = opts.filter((o) => o.id !== "withdraw").sort((a, b) => b.p - a.p)[0]; return c && c.p >= 0.3 ? c.id : "withdraw"; }
  return best;
}
registerDecision("transition", (ctx, d, opt) => {
  const st = ctx.civ.states[d.stateId], arc = st?.arc; if (!st?.alive || !arc || arc.id !== d.payload.arcId || arc.stage !== "crisis") return { ok: true, note: "局面はすでに過ぎていた" };
  if (!arcOptions(ctx, st).some((x) => x.id === opt)) return { ok: false, error: "その選択肢はありません" }; return { ok: true, note: resolveArc(ctx, st, opt) };
});
const TITLE = { revolution: "民衆が蜂起しようとしている", coup: "軍が政権を狙っている", reform: "改革派が動き出した", election: "選挙の日が来た" };
function openCrisis(ctx, st) {
  const { civ } = ctx, arc = st.arc; arc.stage = "crisis"; const opts = arcOptions(ctx, st);
  if (st.player && isLive(civ)) {
    const M = metricsOf(st, civ), head = arc.by === "player" ? `「${REGIMES[arc.to].ja}」への移行を進めている。どの方法で進めるか。` : arc.kind === "election" ? "各派が票を争っている。誰かを後押しするか、中立を保つか。" : `${ARC_KINDS[arc.kind].omen}。放っておくと、政体が${REGIMES[arc.from].ja}から${REGIMES[arc.to].ja}へ変わりうる。`;
    const d = raise(ctx, { kind: "transition", heavy: true, key: `tr|${st.id}|${arc.id}`, stateId: st.id, title: arc.by === "player" ? `${st.name}の政体移行（${ARC_KINDS[arc.kind].ja}）` : `${st.name}で${TITLE[arc.kind]}`, body: `${head}　不満 ${Math.round(M.unrest * 100)}％・改革の機運 ${Math.round(M.reformMood * 100)}％・軍の台頭 ${Math.round(M.militaryRise * 100)}％。`, options: opts.map((o) => ({ id: o.id, ja: o.ja, hint: o.hint })), payload: { arcId: arc.id } });
    if (d) return; }
  resolveArc(ctx, st, autoPick(ctx, st));
}

// ---- 担当国が政体を変えようとする（一瞬では変わらない）
export function pursueRegime(ctx, st, to) {
  const { civ } = ctx, mi = civ.monthIndex, fail = (error) => ({ ok: false, error }); if (!st?.alive) return fail("その国家は存在しません"); if (st.arc) return fail("いま進行中の政局があります。決着がつくまで待ってください");
  const P = (st.politics ??= initPolitics(st)); if (mi - (P.arcEnd ?? -9999) < 24) return fail("直前の政局から間もないため、しばらくは動けません");
  const opt = playerRegimeOptions(ctx, st).find((x) => x.id === to); if (!opt) return fail("その政体へは、いまは移れません");
  const from = regimeOf(st), cf = familyOf(from), tf = familyOf(to), kind = tf === "aut" && cf !== "aut" ? "coup" : opt.scale >= 0.45 ? "revolution" : "reform";
  if (regimeGate(civ, civ.groups[st.capitalGroupId], to)) return fail("その政体へは、いまは移れません");
  const a = igniteArc(ctx, st, { kind: opt.scale <= 0.2 ? "reform" : kind, to, by: "player", delay: 2 }); if (!a) return fail("政局を始められませんでした");
  return { ok: true, pending: true, arc: { kind: a.kind, to: a.to, crisisAt: a.crisisAt }, scale: opt.scale };
}

// ---- 3 か月ごとの進行
function stepState(ctx, st) {
  const { civ } = ctx, mi = civ.monthIndex, P = (st.politics ??= initPolitics(st)); if (!P.factions) return; stepMetrics(ctx, st); const arc = st.arc;
  if (arc) {
    if (arc.stage === "omen") {
      const K = ARC_KINDS[arc.kind], dr = K.driver ? effective(civ, st, K.driver) : 1;
      if (arc.by === "wcde" && K.driver && dr < THRESH[arc.kind] * 0.75 && mi >= arc.startAt + 3) { makeEvent(civ, ctx.ids, { kind: "regime_arc_result", title: `${st.name}の${K.ja}の兆しは、情勢の変化で消えた`, participants: [{ entityId: st.id, role: "state" }], facts: { stateId: st.id, arc: arc.kind, defused: true }, causes: cause(arc.par), provenance: "simulation" }); P.arcEnd = mi; st.arc = null; return; }
      if (mi >= arc.crisisAt) openCrisis(ctx, st);
    } else if (arc.stage === "crisis" && !(st.player && isLive(civ))) resolveArc(ctx, st, autoPick(ctx, st)); // 決断が流れた（担当を外した等）ときは自動で決着
    return;
  }
  if (mi - (P.lastRegimeChange ?? -9999) < 240 || mi - (P.arcEnd ?? -9999) < 60) return;
  const reg = regimeOf(st);
  if (ELECTED.has(reg)) { P.nextElection ??= mi + 12 * (2 + Math.floor(U(civ, st, "ne0") * 4)); if (mi >= P.nextElection) { igniteArc(ctx, st, { kind: "election", delay: 3 }); return; } } else if (P.nextElection != null) delete P.nextElection;
  const legE = effective(civ, st, "legitimacy"), u = U(civ, st, mi, "hz"), M = metricsOf(st, civ), hz = {
    revolution: Math.max(0, M.unrest - THRESH.revolution) * Math.max(0, 0.55 - legE) * 2 * (st.stability < 0.5 ? 1 : 0.4),
    coup: reg === "military_junta" ? 0 : Math.max(0, M.militaryRise - THRESH.coup) * Math.max(0, 0.6 - legE) * 2,
    reform: Math.max(0, M.reformMood - THRESH.reform) * 0.25 * (1 - 0.5 * clamp(0.5 * legE + 0.3 * st.stability + 0.2 * sup(st, "nobility"))),
  };
  let x = u; for (const k of ["revolution", "coup", "reform"]) { if (x < hz[k]) { igniteArc(ctx, st, { kind: k }); return; } x -= hz[k]; }
}
export function stepTransitions(ctx) { const { civ } = ctx; if (!civ.options.wcde || civ.monthIndex % 3 !== 0) return; for (const st of Object.values(civ.states)) if (st.alive) stepState(ctx, st); }

/** 画面用: 国の政情（3 つの数値と進行中の局面） */
export function situationOf(st) {
  const M = metricsOf(st), a = st.arc; return { ...M, arc: a ? { kind: a.kind, ja: ARC_KINDS[a.kind].ja, stage: a.stage, by: a.by, to: a.to ? REGIMES[a.to]?.ja : null, crisisAt: a.crisisAt } : null, nextElection: st.politics?.nextElection ?? null, ruling: st.politics?.ruling ? BLOCS[st.politics.ruling]?.ja : null };
}
