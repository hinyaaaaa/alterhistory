// v6 M7: 外交交渉（条約）と講和。仕様 §9。
//   ・提案 → 相手の評価 → 受諾／拒否／別条件の提示 → 直前の再検証 → 適用、の順に進む。評価は決定的（乱数なし）で、理由（要因の一覧）を必ず記録する。
//   ・講和は条約の枠に入れない。戦争ごとの専用の手続き（proposePeace）で、受諾されたときだけ戦争が終わる。講和条件は「白紙講和」と「賠償」。
//   ・プレイヤーの行動も AI の行動も、同じ入口（civ の sign_treaty / sue_for_peace の実行）を通って、ここの評価を受ける。
//   ・提案の記録は civ.wcde.diplomacy.proposals に残す（拒否も残す）。履歴は消さない。
import { TREATY, treatyBetween, atWarWith, signTreaty, endWar, strength } from "../civ/diplomacy.js";
import { grievance } from "../civ/interpret.js";
import { effective } from "./domains/effective.js";
import { totalPower } from "./power.js";
import { leaveWar, warSide, placeName } from "./warfare.js";

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const r2 = (x) => Math.round(x * 100) / 100;
export const initDiplomacy = () => ({ proposals: [] });
const ledger = (civ) => (civ.wcde.diplomacy ??= initDiplomacy());
export const proposalsOf = (civ) => ledger(civ).proposals;
export const TREATY_THRESHOLD = { nonaggression: -20, trade: -20, alliance: 10 }; // 相手との関係の最低線（v5 から引き継ぐ基準。ここを 0 点とする）

/** 条約を結べる状況か（技術・経済・外交の実行条件。AI もプレイヤーも同じ検査）。理由があれば文字列、無ければ null */
export function treatyFeasible(civ, from, to, type) {
  const mi = civ.monthIndex;
  if (!from.alive || !to.alive) return "相手が存在しない"; if (atWarWith(civ, from, to)) return "交戦中の相手とは結べない";
  if (type === "trade") { if ((from.blockade ?? 0) > mi || (to.blockade ?? 0) > mi) return "封鎖中は通商協定を結べない"; if ((to.sanctions?.[from.id] ?? 0) > mi || (from.sanctions?.[to.id] ?? 0) > mi) return "制裁中は通商協定を結べない"; if (!(from.econ && to.econ)) return "経済の算出が済んでいない"; }
  if (type === "alliance" && (from.polity === "tribal" || to.polity === "tribal") && !(from.techAdopted?.record_keeping != null || from.techAdopted?.writing != null)) return "部族の連合には、約束を記す仕組み（記録）が要る";
  return null;
}
/** 条約提案の評価（何も変えない）。{ accept, score, factors, counter, hard } */
export function evaluateTreaty(civ, from, to, type) {
  const f = [], add = (ja, v) => { f.push({ ja, v: r2(v) }); return v; }; const T = TREATY[type]; { const nf = T ? treatyFeasible(civ, from, to, type) : null; if (nf) return { accept: false, score: -9, factors: [{ ja: nf, v: -9 }], hard: true, counter: null }; } if (!T) return { accept: false, score: -9, factors: [{ ja: "その種類の条約はない", v: -9 }], hard: true, counter: null };
  const rel = effective(civ, to, "relation", from.id); let s = add("相手から見た関係", (rel - TREATY_THRESHOLD[type]) / 20);
  const gr = grievance(civ, to, from.id); if (gr > 0.5) return { accept: false, score: -9, factors: [{ ja: "歴史的な恨みが深い", v: -9 }], hard: true, counter: null };
  if (gr > 0) s += add("過去の恨み", -3 * gr);
  const sf = strength(civ, from), st = strength(civ, to), rf = (sf + 1) / (st + 1);
  if (type === "nonaggression") s += add(rf > 1 ? "相手が強いので不可侵を受け入れたい" : "こちらが強いので不可侵を受け入れにくい", clamp(Math.log(rf), -1, 1) * 0.5);
  if (type === "alliance") { const hot = to.warIds.length > 0 ? 0.6 : 0; if (hot) s += add("交戦中で味方がほしい", hot); s += add("戦力の釣り合い", clamp(Math.log(rf), -1, 1) * 0.3); }
  if (type === "trade") { const ratio = (from.econ?.industry ?? 1) / ((to.econ?.industry ?? 1) + 1); s += add("交易の見込み", clamp(Math.log1p(Math.min(ratio, 1 / Math.max(ratio, 0.01))), 0, 1) * 0.5); }
  if (to.stability < 0.3) s += add("国内が不安定", -0.5);
  for (const t of civ.activeTreatyIds.map((i) => civ.treaties[i])) if (t.active && t.type === "alliance") { const ally = t.a === to.id ? t.b : t.b === to.id ? t.a : null; if (ally && civ.states[ally]?.alive && atWarWith(civ, from, civ.states[ally])) return { accept: false, score: -9, factors: [{ ja: "相手の同盟国と交戦中", v: -9 }], hard: true, counter: null }; }
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
  let need = 0.2; const otherPays = lead < 0 || (lead === 0 && other.treasury < proposer.treasury);
  if (terms.kind === "reparations") { const pay = clamp((terms.amount ?? 0) / (Math.max(0, otherPays ? other.treasury : proposer.treasury) + 1), 0, 2); need += otherPays ? add("賠償の重さ", 1.5 * pay) : -add("賠償を受け取れる", 0.5 * pay); }
  else if (terms.kind === "cession") { need += add("土地を失う（割譲）", 2.5 * occ.lost) - add("占領地を保持できる", 1.2 * occ.held); }
  else if (occ.held > 0) need += add("占領地を返す（白紙講和）", 1.5 * occ.held);
  s -= need; return { accept: s >= 0, score: r2(s), factors: f };
}

/** 提案の記録（履歴は消さない）。残すのは結果だけ（提案・受諾・拒否・別条件・不成立・単独講和）。相手の評価の点数・要因・理由は保存しない（仕様 §2.5・§9） */
const record = (ctx, rec) => { const id = ctx.ids.next("proposal"), { factors, score, ...rest } = rec; ledger(ctx.civ).proposals.push({ id, at: ctx.civ.monthIndex, ...rest }); return id; };
/** 互換: 記録に評価の要因は残さない（常に空）。画面の「相手の評価」は、提案の前に evaluateTreaty / evaluatePeace を呼んで、その場で出す */
export const factorsOf = () => [];
const failure = (error, extra = {}) => ({ ok: false, error, diplomacyFailure: true, ...extra });

/** 条約の提案（civ の sign_treaty の実行から呼ばれる）。受諾なら直前に再検証して締結する */
export function negotiateTreaty(ctx, from, to, type, c = {}) {
  const civ = ctx.civ, ev = evaluateTreaty(civ, from, to, type), base = { kind: "treaty", type, from: from.id, to: to.id, counter: ev.counter ? { type: ev.counter.type } : null };
  if (!ev.accept) { record(ctx, { ...base, status: ev.counter ? "countered" : "rejected" }); return failure(ev.counter ? `別の条件ならば受け入れる（${TREATY[ev.counter.type].ja}）` : "相手に受け入れられなかった", { targetId: to.id, counter: ev.counter }); }
  // 直前の再検証（評価から適用までの間に条件が変わっていないか）
  if (treatyFeasible(civ, from, to, type) || treatyBetween(civ, from, to, type)) { record(ctx, { ...base, status: "failed_recheck" }); return failure("条件が変わり、締結できなかった", { targetId: to.id }); }
  signTreaty(ctx, type, from, to, { decisionId: c.decisionId, provenance: c.provenance }); record(ctx, { ...base, status: "accepted" }); return { ok: true, effects: [], silent: true, targetId: to.id };
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
  const k = c.terms?.kind, terms = k === "reparations" ? { kind: "reparations", amount: Math.max(0, Number(c.terms.amount) || 0) } : k === "cession" ? { kind: "cession" } : k === "white" ? { kind: "white" } : defaultTerms(civ, war, proposer);
  if (!principal && terms.kind === "cession") terms.kind = "white"; // 単独講和は土地を動かさない（戦争全体の整理は主たる交戦国の講和・終戦で行う）
  const ev = evaluatePeace(civ, war, proposer, other, terms), base = { kind: "peace", warId: war.id, from: proposer.id, to: otherId, terms, separate: !principal };
  if (!ev.accept) { record(ctx, { ...base, status: "rejected" }); return failure("講和は受け入れられなかった", { targetId: war.id }); }
  if (war.status !== "active") { record(ctx, { ...base, status: "failed_recheck" }); return failure("条件が変わり、講和できなかった", { targetId: war.id }); }
  if (terms.kind === "reparations") { const ahead = war.score >= 0 ? "a" : "d", payerSide = ahead === "a" ? "d" : "a", payer = civ.states[payerSide === mySide ? proposer.id : otherId], getter = civ.states[payer.id === proposer.id ? otherId : proposer.id]; const amt = Math.min(terms.amount, Math.max(0, payer.treasury)); payer.treasury -= amt; getter.treasury += amt; base.terms = { ...terms, paid: Math.round(amt) }; }
  { /* v6.5.0: 講和条約の名前は、史実のように地名から付く（負けた側の首都の地名。単独講和は「単独講和条約」） */
    const loser = civ.states[war.score >= 0 ? war.defender : war.aggressor], cap = civ.groups[loser?.capitalGroupId] ?? civ.groups[proposer.capitalGroupId]; base.name = `${cap ? placeName(ctx, cap) : "名もなき地"}${principal ? "条約" : "単独講和条約"}`; }
  if (!principal) { leaveWar(ctx, war, proposer); proposer.lastWarEnd = civ.monthIndex; record(ctx, { ...base, status: "accepted" }); return { ok: true, effects: [], silent: true, targetId: war.id, separate: true }; }
  endWar(ctx, war, "negotiated", terms); record(ctx, { ...base, status: "accepted" }); return { ok: true, effects: [], silent: true, targetId: war.id };
}
