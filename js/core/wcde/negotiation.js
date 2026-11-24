// v6 M7: 外交交渉（条約）と講和。仕様 §9。
//   ・提案 → 相手の評価 → 受諾／拒否／別条件の提示 → 直前の再検証 → 適用、の順に進む。評価は決定的（乱数なし）で、理由（要因の一覧）を必ず記録する。
//   ・講和は条約の枠に入れない。戦争ごとの専用の手続き（proposePeace）で、受諾されたときだけ戦争が終わる。講和条件は「白紙講和」と「賠償」。
//   ・プレイヤーの行動も AI の行動も、同じ入口（civ の sign_treaty / sue_for_peace の実行）を通って、ここの評価を受ける。
//   ・提案の記録は civ.wcde.diplomacy.proposals に残す（拒否も残す）。履歴は消さない。
import { stateFx } from "./statefx.js";
import { TECH } from "../civ/tech.js";
import { hashSeed } from "../civ/civ-state.js";
import { REGIMES, regimeOf } from "./regimes.js";
import { depFeasible, pickBorderGroup } from "./dependency.js";
import { TREATY, treatyBetween, atWarWith, signTreaty, endWar, strength } from "../civ/diplomacy.js";
import { grievance } from "../civ/interpret.js";
import { effective } from "./domains/effective.js";
import { totalPower } from "./power.js";
import { leaveWar, warSide, placeName } from "./warfare.js";
import { warSupport, goalsOf, surrenderRec, sideOf as wsideOf } from "./war-core.js";
import { proposeWithDemands, concludeWithDemands } from "./war-peace.js";

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const r2 = (x) => Math.round(x * 100) / 100;
export const initDiplomacy = () => ({ proposals: [] });
const ledger = (civ) => (civ.wcde.diplomacy ??= initDiplomacy());
export const proposalsOf = (civ) => ledger(civ).proposals;
export const TREATY_THRESHOLD = { nonaggression: -20, trade: -20, alliance: 10, defensive: 0, passage: 5, garrison: 20, tariff: -10, unequal: -40, border: -30, sphere: -10, marriage: 10, union: 20, succession_pact: 10, purchase: -30, cession: -30, exchange: -30, feudal: 0, tribute: 0, protectorate: 0 }; // 相手との関係の最低線（v5 から引き継ぐ基準。ここを 0 点とする）
/** 君主の気質（個性）。条約の受け入れやすさが、種類ごとに変わる。決定的（指導者の名前から決まる） */
export const TEMPERS = Object.freeze([
  { ja: "好戦的", mil: -0.3, eco: 0, land: -0.1, dyn: 0, over: 0.3, sub: -0.4 }, { ja: "慎重", mil: -0.2, eco: 0.2, land: 0, dyn: 0.1, over: -0.2, sub: -0.1 }, { ja: "外交的", mil: 0.25, eco: 0.25, land: 0.2, dyn: 0.25, over: 0.1, sub: 0.1 },
  { ja: "野心的", mil: 0, eco: 0, land: -0.2, dyn: 0.1, over: 0.4, sub: -0.6 }, { ja: "商人肌", mil: -0.1, eco: 0.5, land: 0, dyn: 0, over: 0, sub: 0 }, { ja: "誇り高い", mil: 0, eco: -0.1, land: -0.2, dyn: 0, over: 0.2, sub: -0.9 }, { ja: "温厚", mil: 0.1, eco: 0.1, land: 0.1, dyn: 0.2, over: -0.3, sub: 0.1 },
]);
export const temperOf = (st) => TEMPERS[hashSeed(st.id, st.leader?.name ?? "", "temper") % TEMPERS.length];
const heredityOf = (st) => !!REGIMES[regimeOf(st)]?.heredity || regimeOf(st) === "elective_monarchy";
const activeOf = (civ, a, b, type) => treatyBetween(civ, a, b, type);

/** 条約を結べる状況か（技術・経済・外交の実行条件。AI もプレイヤーも同じ検査）。理由があれば文字列、無ければ null。o.reverse: 提案した側が従う側（従属・同君連合） */
export function treatyFeasible(civ, from, to, type, o = {}) {
  const mi = civ.monthIndex, T = TREATY[type]; if (!T) return "その種類の条約はない";
  if (!from.alive || !to.alive) return "相手が存在しない"; if (atWarWith(civ, from, to)) return "交戦中の相手とは結べない";
  for (const k of T.needs ?? []) for (const s of [from, to]) if (s.techAdopted?.[k] == null) return `技術「${TECH[k]?.ja ?? k}」が要る（${s.name}）`;
  const dep = (x, y) => depFeasible(civ, x, y); if (T.cat === "dep" && T.dep !== "union") { const w = dep(o.reverse ? to : from, o.reverse ? from : to); if (w) return w; }
  if ((type === "alliance" || type === "defensive") && (from.dependency?.overlord === to.id || to.dependency?.overlord === from.id)) return "従属関係にある国とは結べない";
  if (type === "trade" || type === "tariff") { if ((from.blockade ?? 0) > mi || (to.blockade ?? 0) > mi) return "封鎖中は結べない"; if ((to.sanctions?.[from.id] ?? 0) > mi || (from.sanctions?.[to.id] ?? 0) > mi) return "制裁中は結べない"; if (!(from.econ && to.econ)) return "経済の算出が済んでいない"; }
  if (type === "nonaggression") { const n = (st) => civ.activeTreatyIds.reduce((c, i) => { const t = civ.treaties[i]; return c + (t.active && t.type === "nonaggression" && (t.a === st.id || t.b === st.id) ? 1 : 0); }, 0); if (n(from) >= 2 || n(to) >= 2) return "不可侵条約はすでに多く、これ以上は結べない"; if ((from.lastNapEnd ?? -9999) + 240 > mi || (to.lastNapEnd ?? -9999) + 240 > mi) return "不可侵条約が切れて間もない"; } // v6.9.0: 不可侵条約は国あたり 2 件まで、失効後 20 年は再締結しない
  if ((type === "alliance" || type === "defensive") && (from.polity === "tribal" || to.polity === "tribal") && !(from.techAdopted?.record_keeping != null || from.techAdopted?.writing != null)) return "部族の連合には、約束を記す仕組み（記録）が要る";
  if (T.cat === "dyn") { if (!heredityOf(from) || !heredityOf(to)) return "王家のない国とは結べない"; if (type === "union") { if (o.reverse ? depFeasible(civ, to, from) : depFeasible(civ, from, to)) return depFeasible(civ, o.reverse ? to : from, o.reverse ? from : to); if (!activeOf(civ, from, to, "marriage")) return "先に婚姻同盟が要る"; } if (type === "succession_pact" && !(activeOf(civ, from, to, "marriage") || activeOf(civ, from, to, "union"))) return "婚姻か同君連合の結びつきが要る"; }
  if (type === "sphere" && strength(civ, from) < strength(civ, to) * 0.5 && strength(civ, to) < strength(civ, from) * 0.5) return "力が近い国どうしでは結べない";
  return null;
}
/** 領土の条約の対象（国境で接した、渡せる土地）。ctx が要る。{ terms } か { error } */
export function territorialPlan(ctx, from, to, type) {
  if (!["purchase", "cession", "exchange"].includes(type)) return { terms: null }; const civ = ctx.civ;
  if (type === "purchase") { const g = pickBorderGroup(ctx, to, from); if (!g) return { error: "売ってもらえる土地がない（国境に接した、首都以外の土地が要る）" }; const price = Math.round(Math.max(1, from.treasury * 0.25)); if (from.treasury < price || price < 1) return { error: "国庫が足りない" }; return { terms: { groupId: g.id, price } }; }
  if (type === "cession") { const g = pickBorderGroup(ctx, from, to); return g ? { terms: { groupId: g.id } } : { error: "渡せる土地がない（国境に接した、首都以外の土地が要る）" }; }
  const g1 = pickBorderGroup(ctx, from, to), g2 = pickBorderGroup(ctx, to, from); void civ; return g1 && g2 ? { terms: { groupId: g1.id, groupId2: g2.id } } : { error: "交換できる土地がない" };
}
/** 条約提案の評価（何も変えない）。{ accept, score, factors, counter, hard } o: { reverse, terms } */
export function evaluateTreaty(civ, from, to, type, o = {}) {
  const f = [], add = (ja, v) => { f.push({ ja, v: r2(v) }); return v; }, T = TREATY[type], hard = (ja) => ({ accept: false, score: -9, factors: [{ ja, v: -9 }], hard: true, counter: null });
  if (!T) return hard("その種類の条約はない"); { const nf = treatyFeasible(civ, from, to, type, o); if (nf) return hard(nf); }
  const rel = effective(civ, to, "relation", from.id), isDep = T.cat === "dep" && type !== "union", over = o.reverse ? to : from, sub = o.reverse ? from : to, rf = (strength(civ, over) + 1) / (strength(civ, sub) + 1), lg = Math.log(rf);
  const gr = grievance(civ, to, from.id); if (gr > 0.5 && !(isDep && !o.reverse)) return hard("歴史的な恨みが深い");
  const tp = temperOf(to), catKey = isDep ? (o.reverse ? "over" : "sub") : T.cat === "mil" ? "mil" : T.cat === "eco" ? "eco" : T.cat === "land" ? "land" : "dyn";
  let s = 0; if (isDep) s += add("相手から見た関係", rel / 60); else s = add("相手から見た関係", (rel - (TREATY_THRESHOLD[type] ?? -20)) / 20);
  if (gr > 0 && !isDep) s += add("過去の恨み", -3 * gr); { const dp = stateFx(from).dipl; if (dp) s += add("使節・外交の働き", dp); }
  if (tp[catKey]) s += add(`君主の気質（${tp.ja}）`, tp[catKey]);
  const sf = strength(civ, from), st = strength(civ, to), rft = (sf + 1) / (st + 1);
  if (type === "nonaggression") s += add(rft > 1 ? "相手が強いので不可侵を受け入れたい" : "こちらが強いので不可侵を受け入れにくい", clamp(Math.log(rft), -1, 1) * 0.5);
  if (type === "alliance" || type === "defensive") { const hot = to.warIds.length > 0 ? 0.6 : 0; if (hot) s += add("交戦中で味方がほしい", hot); s += add("戦力の釣り合い", clamp(Math.log(rft), -1, 1) * 0.3); }
  if (type === "trade" || type === "tariff") { const ratio = (from.econ?.industry ?? 1) / ((to.econ?.industry ?? 1) + 1); s += add("交易の見込み", clamp(Math.log1p(Math.min(ratio, 1 / Math.max(ratio, 0.01))), 0, 1) * 0.5); }
  if (type === "passage") s += add("相手の軍が入ってくる不安", clamp(-Math.log(rft), -1, 1) * 0.3);
  if (type === "garrison") s += add(to.warIds.length ? "戦時の守りがほしい" : "外国の軍を置きたくない", to.warIds.length ? 0.6 : -0.3);
  if (type === "unequal") s += add("力の差による圧力", clamp(lg - 0.7, -1.5, 1.5) * 0.9 - 0.3);
  if (type === "sphere") s += add("力の差", clamp(Math.log(rft), -1, 1) * 0.4 - 0.1);
  if (type === "border") s += add("国境を安定させたい", 0.5);
  if (type === "marriage") s += add("王家の結びつき", 0.3);
  if (type === "union") s += add("力の差（従う側になる）", o.reverse ? 0.3 : clamp(lg, 0, 1.5) * 0.5 - 0.5);
  if (type === "succession_pact") s += add("継承の安定", 0.2);
  if (isDep) { const k = { feudal: [0.9, 1.1], tribute: [0.8, 0.8], protectorate: [0.7, 0.9] }[type]; if (o.reverse) s += add("宗主になる利益", 0.5 + 0.2 * clamp(lg, -2, 2) + (lg < 0 ? -1 : 0)); else { s += add("力の差（逆らえない）", k[0] * clamp(lg, -1, 2.5) - k[1]); if (to.warIds.length && type === "protectorate") s += add("戦時の守りがほしい", 0.8); } }
  if (type === "purchase" && o.terms) { const g = civ.groups[o.terms.groupId]; s += add("代価の見返り", clamp(Math.log(Math.max(1, o.terms.price) / Math.max(1, (g?.pop ?? 1) * 0.004)), -1.5, 1.5)); }
  if (type === "cession") s += add("贈り物と受け取る", 0.8);
  if (type === "exchange" && o.terms) { const g1 = civ.groups[o.terms.groupId], g2 = civ.groups[o.terms.groupId2]; s += add("交換の釣り合い", (g1?.pop ?? 0) >= (g2?.pop ?? 0) ? 0.4 : -0.4); }
  if (to.stability < 0.3) s += add("国内が不安定", -0.5);
  for (const t of civ.activeTreatyIds.map((i) => civ.treaties[i])) if (t.active && t.type === "alliance") { const ally = t.a === to.id ? t.b : t.b === to.id ? t.a : null; if (ally && civ.states[ally]?.alive && atWarWith(civ, from, civ.states[ally])) return hard("相手の同盟国と交戦中"); }
  const accept = s >= 0; let counter = null; if (!accept && type === "alliance" && s > -1) { const alt = evaluateTreaty(civ, from, to, "nonaggression"); if (alt.accept) counter = { type: "nonaggression", note: "同盟は難しいが、不可侵ならば受け入れる" }; }
  return { accept, score: r2(s), factors: f, counter, hard: false };
}

/** 講和提案の評価（何も変えない。評価の中身は保存しない）。terms: { kind: "white" | "reparations" | "cession", amount }
 *  v6.1.0 M7: 新しい戦争モデルの状態（部隊の戦力比・占領・首都の陥落・封鎖・損耗・疲労・長期化）から、相手（other）が受け入れるかを決める。
 *  白紙講和＝占領地を返し合う／賠償＝白紙＋支払い／割譲＝占領した土地を占領した側のものにする（現状の保持） */
export function occupationShares(civ, war, side) {
  // side 陣営の国家の土地のうち、敵に占領されている割合（lost）と、side が占領している敵の土地の割合（held）
  const ops = war.ops; if (!ops || ops.ended) return { lost: 0, held: 0, capitalLost: false };
  const mine = new Set(war.sides[side]), foeIds = new Set(war.sides[side === "a" ? "d" : "a"]); let lost = 0, held = 0, tot = 0, totFoe = 0, capLost = false;
  for (const g of Object.values(civ.groups)) { if (!g.stateId) continue; if (mine.has(g.stateId)) tot++; else if (foeIds.has(g.stateId)) totFoe++; }
  for (const gid of war.occupied) { const g = civ.groups[gid]; if (!g?.stateId) continue; const s = ops.occ[gid]; if (mine.has(g.stateId) && s !== side) { lost++; if (civ.states[g.stateId]?.capitalGroupId === gid) capLost = true; } else if (foeIds.has(g.stateId) && s === side) held++; }
  return { lost: lost / (tot + 1), held: held / (totFoe + 1), capitalLost: capLost, lostN: lost, heldN: held };
}
export function evaluatePeace(civ, war, proposer, other, terms = { kind: "white" }) {
  const f = [], add = (ja, v) => { f.push({ ja, v: r2(v) }); return v; }, side = warSide(war, other.id) ?? (war.aggressor === other.id ? "a" : "d"), foe = side === "a" ? "d" : "a";
  const power = (ids) => ids.map((i) => civ.states[i]).filter((s) => s?.alive).reduce((a, s) => a + totalPower(civ, s), 0), adv = clamp(Math.log((power(war.sides[side]) + 1) / (power(war.sides[foe]) + 1)), -2, 2);
  const lead = side === "a" ? war.score : -war.score, occ = occupationShares(civ, war, side);
  let s = add("戦力の差（劣勢なら講和したい）", -0.6 * adv); s += add("戦況（劣勢なら講和したい）", -lead / 40);
  s += add("占領された土地", 3 * occ.lost); if (occ.capitalLost) s += add("首都の陥落", 1.2); s += add("占領している土地（有利なうちは続けたい）", -2 * occ.held);
  if ((other.blockade ?? 0) > civ.monthIndex) s += add("海上封鎖", 0.4);
  s += add("疲労", effective(civ, other, "fatigue") * 1.0); s += add("国内の不安定", (1 - effective(civ, other, "stability")) * 0.8);
  if (other.treasury < 0) s += add("国庫の枯渇", 0.5); s += add("戦争の損耗", (other.warLoss ?? 0) * 1.5);
  s += add("戦争の長期化", clamp(Math.max(0, civ.monthIndex - war.startedAt) / 60, 0, 1.5));
  { // v7.0.0: 戦争支持（民意）と、達成できそうな戦争目的が、受諾の理由に加わる
    const sup = war.surrender?.[other.id]?.support ?? warSupport({ civ }, war, other); s += add("戦争支持（低いほど講和したい）", clamp((50 - sup) / 60, -1, 1));
    const mine = goalsOf(war, other.id); if (mine.length) { let hope = 0; for (const id of war.sides[foe]) { const r = war.surrender?.[id]; if (r) hope = Math.max(hope, r.vpPct / Math.max(1, r.limit)); } if (hope >= 0.5) s += add("達成できそうな戦争目的（続けたい）", -1.5 * hope); else if (hope < 0.15 && civ.monthIndex - war.startedAt > 24) s += add("戦争目的の達成は見込めない", 0.6); }
    if (war.surrender?.[other.id]?.capitulated) s += add("すでに降伏している", 3);
  }
  let need = 0.2; const otherPays = lead < 0 || (lead === 0 && other.treasury < proposer.treasury);
  if (terms.kind === "reparations") { const pay = clamp((terms.amount ?? 0) / (Math.max(0, otherPays ? other.treasury : proposer.treasury) + 1), 0, 2); need += otherPays ? add("賠償の重さ", 1.5 * pay) : -add("賠償を受け取れる", 0.5 * pay); }
  else if (terms.kind === "cession") { need += add("土地を失う（割譲）", 2.5 * occ.lost) - add("占領地を保持できる", 1.2 * occ.held); }
  else if (occ.held > 0) need += add("占領地を返す（白紙講和）", 1.5 * occ.held);
  s -= need; const reasons = [...f].filter((x) => x.v !== 0).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3).map((x) => `${x.ja}（${x.v > 0 ? "講和に傾く" : "続けたい"}）`); return { accept: s >= 0, score: r2(s), factors: f, reasons };
}

/** 提案の記録（履歴は消さない）。残すのは結果だけ（提案・受諾・拒否・別条件・不成立・単独講和）。相手の評価の点数・要因・理由は保存しない（仕様 §2.5・§9） */
export const recordProposal = (ctx, rec) => record(ctx, rec); // v6.12.0: 決断（decisions.js）が、申し出の結果を同じ台帳に残す
const record = (ctx, rec) => { const id = ctx.ids.next("proposal"), { factors, score, ...rest } = rec; ledger(ctx.civ).proposals.push({ id, at: ctx.civ.monthIndex, ...rest }); return id; };
/** 互換: 記録に評価の要因は残さない（常に空）。画面の「相手の評価」は、提案の前に evaluateTreaty / evaluatePeace を呼んで、その場で出す */
export const factorsOf = () => [];
const failure = (error, extra = {}) => ({ ok: false, error, diplomacyFailure: true, ...extra });

/** 条約の提案（civ の sign_treaty の実行や、外交画面の提案から呼ばれる）。受諾なら直前に再検証して締結する。c: { reverse, decisionId, provenance } */
export function negotiateTreaty(ctx, from, to, type, c = {}) {
  if (!c.reverse) { const r = ctx.decisions?.offerTreaty(ctx, from, to, type); if (r) return r; } // v6.12.0: 担当国への申し出は、勝手に結ばず決断にする
  const civ = ctx.civ, plan = territorialPlan(ctx, from, to, type), base = { kind: "treaty", type, from: from.id, to: to.id, counter: null }; if (plan.error) return failure(plan.error, { targetId: to.id });
  const o = { reverse: !!c.reverse, terms: plan.terms }, ev = evaluateTreaty(civ, from, to, type, o); base.counter = ev.counter ? { type: ev.counter.type } : null;
  if (!ev.accept) { record(ctx, { ...base, status: ev.counter ? "countered" : "rejected" }); return failure(ev.counter ? `別の条件ならば受け入れる（${TREATY[ev.counter.type].ja}）` : ev.hard ? ev.factors[0].ja : "相手に受け入れられなかった", { targetId: to.id, counter: ev.counter }); }
  // 直前の再検証（評価から適用までの間に条件が変わっていないか）
  if (treatyFeasible(civ, from, to, type, o) || treatyBetween(civ, from, to, type)) { record(ctx, { ...base, status: "failed_recheck" }); return failure("条件が変わり、締結できなかった", { targetId: to.id }); }
  signTreaty(ctx, type, from, to, { decisionId: c.decisionId, provenance: c.provenance, reverse: !!c.reverse, extra: plan.terms }); record(ctx, { ...base, status: "accepted" }); return { ok: true, effects: [], silent: true, targetId: to.id };
}

/** 状況に応じた講和条件（条件を指定しないとき。AI もこれを使う）: 占領で優位なら割譲、劣勢で国庫に余裕があれば賠償、そのほかは白紙 */
export function defaultTerms(civ, war, proposer) {
  const side = warSide(war, proposer.id) ?? "a", o = occupationShares(civ, war, side); if (o.heldN > o.lostN) return { kind: "cession" }; return { kind: "white" };
}

/** 講和の提案（civ の sue_for_peace の実行から呼ばれる）。受諾されたときだけ戦争が終わる。
 *  主たる交戦国（開戦国・受けて立った国）の講和は戦争全体を終える。同盟側の参戦国の講和は、その国だけが抜ける（単独講和）。 */
export function negotiatePeace(ctx, proposer, war, c = {}) {
  const civ = ctx.civ; if (!war || war.status !== "active" || !proposer.warIds.includes(war.id)) return { ok: false, error: "その戦争は進行中ではない" };
  const mySide = warSide(war, proposer.id); if (!mySide) return { ok: false, error: "その戦争の参戦国ではない" }; const foe = mySide === "a" ? "d" : "a", foePrincipal = foe === "a" ? war.aggressor : war.defender, principal = proposer.id === war.aggressor || proposer.id === war.defender;
  const otherId = c.withId && war.sides[foe].includes(c.withId) ? c.withId : foePrincipal, other = civ.states[otherId]; if (!other?.alive) return { ok: false, error: "相手が存在しない" };
  if (c.terms?.demands && !c.forceAccept) { // v7.0.0: 要求つきの講和（併合・従属化・割譲・解放など）。受諾は理由つきで返す
    const r = proposeWithDemands(ctx, proposer, war, { demands: c.terms.demands, withId: c.withId }); if (!r.ok) return { ok: false, error: r.error };
    if (!r.accepted) return failure(`講和は受け入れられなかった（理由: ${r.reasons.slice(0, 3).join("、")}）`, { targetId: war.id, reasons: r.reasons, pct: r.pct });
    concludeWithDemands(ctx, war, r.mySide, r.demands, r.reasons[0] ?? ""); return { ok: true, effects: [], silent: true, targetId: war.id, pct: r.pct, reasons: r.reasons };
  }
  const k = c.terms?.kind, terms = k === "reparations" ? { kind: "reparations", amount: Math.max(0, Number(c.terms.amount) || 0) } : k === "cession" ? { kind: "cession" } : k === "white" ? { kind: "white" } : defaultTerms(civ, war, proposer);
  if (!principal && terms.kind === "cession") terms.kind = "white"; // 単独講和は土地を動かさない（戦争全体の整理は主たる交戦国の講和・終戦で行う）
  if (!c.forceAccept) { const r = ctx.decisions?.offerPeace(ctx, proposer, war, other, terms); if (r) return r; } // v6.12.0: 担当国への講和の申し入れは、決断にする
  const ev = c.forceAccept ? { accept: true } : evaluatePeace(civ, war, proposer, other, terms), base = { kind: "peace", warId: war.id, from: proposer.id, to: otherId, terms, separate: !principal };
  if (!ev.accept) { record(ctx, { ...base, status: "rejected" }); return failure(`講和は受け入れられなかった（理由: ${(ev.reasons ?? []).join("、") || "—"}）`, { targetId: war.id, reasons: ev.reasons ?? [] }); }
  if (war.status !== "active") { record(ctx, { ...base, status: "failed_recheck" }); return failure("条件が変わり、講和できなかった", { targetId: war.id }); }
  if (terms.kind === "reparations") { const ahead = war.score >= 0 ? "a" : "d", payerSide = ahead === "a" ? "d" : "a", payer = civ.states[payerSide === mySide ? proposer.id : otherId], getter = civ.states[payer.id === proposer.id ? otherId : proposer.id]; const amt = Math.min(terms.amount, Math.max(0, payer.treasury)); payer.treasury -= amt; getter.treasury += amt; base.terms = { ...terms, paid: Math.round(amt) }; }
  { /* v6.5.0: 講和条約の名前は、史実のように地名から付く（負けた側の首都の地名。単独講和は「単独講和条約」） */
    const loser = civ.states[war.score >= 0 ? war.defender : war.aggressor], cap = civ.groups[loser?.capitalGroupId] ?? civ.groups[proposer.capitalGroupId]; base.name = `${cap ? placeName(ctx, cap) : "名もなき地"}${principal ? "条約" : "単独講和条約"}`; }
  if (!principal) { leaveWar(ctx, war, proposer); proposer.lastWarEnd = civ.monthIndex; record(ctx, { ...base, status: "accepted" }); return { ok: true, effects: [], silent: true, targetId: war.id, separate: true }; }
  endWar(ctx, war, "negotiated", terms); record(ctx, { ...base, status: "accepted" }); return { ok: true, effects: [], silent: true, targetId: war.id };
}
/** v6.20.1: アルゴリズム国家が講和を持ちかける価値があるか（相手が受け入れる条件か）。受けられない講和を毎月出し続けない */
export function peaceWorthProposing(civ, proposer, war) {
  if (!war || war.status !== "active") return false; if (civ.monthIndex - war.startedAt < 3) return false; // 宣戦したその月に引き分け講和で終わる、をなくす（3 か月は戦う）
  const mySide = warSide(war, proposer.id); if (!mySide) return false; const foe = mySide === "a" ? "d" : "a", other = civ.states[foe === "a" ? war.aggressor : war.defender]; if (!other?.alive) return false;
  return evaluatePeace(civ, war, proposer, other, defaultTerms(civ, war, proposer)).accept;
}
