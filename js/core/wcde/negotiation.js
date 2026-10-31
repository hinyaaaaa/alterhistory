// v6 M7: 外交交渉（条約）と講和。仕様 §9。
//   ・提案 → 相手の評価 → 受諾／拒否／別条件の提示 → 直前の再検証 → 適用、の順に進む。評価は決定的（乱数なし）で、理由（要因の一覧）を必ず記録する。
//   ・講和は条約の枠に入れない。戦争ごとの専用の手続き（proposePeace）で、受諾されたときだけ戦争が終わる。講和条件は「白紙講和」と「賠償」。
//   ・プレイヤーの行動も AI の行動も、同じ入口（civ の sign_treaty / sue_for_peace の実行）を通って、ここの評価を受ける。
//   ・提案の記録は civ.wcde.diplomacy.proposals に残す（拒否も残す）。履歴は消さない。
import { TREATY, treatyBetween, atWarWith, signTreaty, endWar, strength } from "../civ/diplomacy.js";
import { grievance } from "../civ/interpret.js";

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const r2 = (x) => Math.round(x * 100) / 100;
export const initDiplomacy = () => ({ proposals: [] });
const ledger = (civ) => (civ.wcde.diplomacy ??= initDiplomacy());
export const proposalsOf = (civ) => ledger(civ).proposals;
export const TREATY_THRESHOLD = { nonaggression: -20, trade: -20, alliance: 10 }; // 相手との関係の最低線（v5 から引き継ぐ基準。ここを 0 点とする）

/** 条約提案の評価（何も変えない）。{ accept, score, factors, counter, hard } */
export function evaluateTreaty(civ, from, to, type) {
  const f = [], add = (ja, v) => { f.push({ ja, v: r2(v) }); return v; }; const T = TREATY[type]; if (!T) return { accept: false, score: -9, factors: [{ ja: "その種類の条約はない", v: -9 }], hard: true, counter: null };
  const rel = to.relations[from.id] ?? 0; let s = add("相手から見た関係", (rel - TREATY_THRESHOLD[type]) / 20);
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

/** 講和提案の評価。terms: { kind: "white" | "reparations", amount } */
export function evaluatePeace(civ, war, proposer, other, terms = { kind: "white" }) {
  const f = [], add = (ja, v) => { f.push({ ja, v: r2(v) }); return v; };
  const otherIsAttacker = war.aggressor === other.id, otherLead = otherIsAttacker ? war.score : -war.score; // 相手から見た戦況（正なら相手が優勢）
  let s = add("戦況（劣勢なら講和したい）", -otherLead / 40);
  s += add("疲労", (other.politics?.fatigue ?? 0) * 1.0); s += add("国内の不安定", (1 - other.stability) * 0.8);
  if (other.treasury < 0) s += add("国庫の枯渇", 0.5);
  const age = Math.max(0, civ.monthIndex - war.startedAt); s += add("戦争の長期化", clamp(age / 60, 0, 1.5));
  let need = 0.2; if (terms.kind === "reparations") { const pay = clamp((terms.amount ?? 0) / (Math.max(0, otherLead > 0 ? proposer.treasury : other.treasury) + 1), 0, 2); need += add("賠償の重さ", 1.5 * pay) ; }
  s -= need; f.push({ ja: "受け入れの基準", v: r2(-need) });
  return { accept: s >= 0, score: r2(s), factors: f };
}

const record = (ctx, rec) => { const id = ctx.ids.next("proposal"); ledger(ctx.civ).proposals.push({ id, at: ctx.civ.monthIndex, ...rec }); return id; };
const failure = (error, extra = {}) => ({ ok: false, error, diplomacyFailure: true, ...extra });

/** 条約の提案（civ の sign_treaty の実行から呼ばれる）。受諾なら直前に再検証して締結する */
export function negotiateTreaty(ctx, from, to, type, c = {}) {
  const civ = ctx.civ, ev = evaluateTreaty(civ, from, to, type), base = { kind: "treaty", type, from: from.id, to: to.id, score: ev.score, factors: ev.factors, counter: ev.counter };
  if (!ev.accept) { record(ctx, { ...base, status: ev.counter ? "countered" : "rejected" }); return failure(ev.counter ? `別の条件ならば受け入れる（${TREATY[ev.counter.type].ja}）` : "相手に受け入れられなかった", { targetId: to.id, counter: ev.counter }); }
  // 直前の再検証（評価から適用までの間に条件が変わっていないか）
  if (!from.alive || !to.alive || atWarWith(civ, from, to) || treatyBetween(civ, from, to, type)) { record(ctx, { ...base, status: "failed_recheck" }); return failure("条件が変わり、締結できなかった", { targetId: to.id }); }
  signTreaty(ctx, type, from, to, { decisionId: c.decisionId, provenance: c.provenance }); record(ctx, { ...base, status: "accepted" }); return { ok: true, effects: [], silent: true, targetId: to.id };
}

/** 講和の提案（civ の sue_for_peace の実行から呼ばれる）。受諾されたときだけ戦争が終わる */
export function negotiatePeace(ctx, proposer, war, c = {}) {
  const civ = ctx.civ; if (!war || war.status !== "active" || !proposer.warIds.includes(war.id)) return { ok: false, error: "その戦争は進行中ではない" };
  const otherId = war.sides.a.includes(proposer.id) ? war.defender : war.aggressor, other = civ.states[otherId]; if (!other?.alive) return { ok: false, error: "相手が存在しない" };
  const terms = c.terms?.kind === "reparations" ? { kind: "reparations", amount: Math.max(0, Number(c.terms.amount) || 0) } : { kind: "white" };
  const ev = evaluatePeace(civ, war, proposer, other, terms), base = { kind: "peace", warId: war.id, from: proposer.id, to: otherId, terms, score: ev.score, factors: ev.factors };
  if (!ev.accept) { record(ctx, { ...base, status: "rejected" }); return failure("講和は受け入れられなかった", { targetId: war.id }); }
  if (war.status !== "active") { record(ctx, { ...base, status: "failed_recheck" }); return failure("条件が変わり、講和できなかった", { targetId: war.id }); }
  // 原子的に適用: 賠償は戦況で不利な側から有利な側へ。国庫を超える額は動かさない
  if (terms.kind === "reparations") { const aheadId = war.score >= 0 ? war.aggressor : war.defender, payer = civ.states[aheadId === war.aggressor ? war.defender : war.aggressor], getter = civ.states[aheadId]; const amt = Math.min(terms.amount, Math.max(0, payer.treasury)); payer.treasury -= amt; getter.treasury += amt; base.terms = { ...terms, paid: Math.round(amt) }; }
  endWar(ctx, war, "negotiated"); record(ctx, { ...base, status: "accepted" }); return { ok: true, effects: [], silent: true, targetId: war.id };
}
