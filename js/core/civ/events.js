import { mediaOf } from "./archive.js";
// v5: イベントの正本レコード（指示書 §8.1 の最小形。M6 で因果グラフ・索引へ拡張する）。
// IDは発行時の連番。タイトル・年月から識別子を作らない。原因はIDで持つ（文字列の逆引きをしない）。
export const RELATIONS = Object.freeze(["caused_by", "contributed_to", "reaction_to", "enabled_by", "part_of", "succeeded_by", "influenced_by", "related_to"]);
export const BASES = Object.freeze(["direct", "strong", "plausible", "contested", "unknown"]);
// 根拠（basis）は「関係の確からしさの帯」。校正された確率ではない（指示書 §8.3）。ユーザー編集の因果は causes[].userEdited: true で区別する。
// v6.20.1: ある出来事の「効果」として同じ処理の中で起きる出来事（選択肢の効果で起きる政変・戦争など）には、その出来事を直接の原因として結ぶ
let AMBIENT = null;
export function withCause(eventId, fn) { const p = AMBIENT; AMBIENT = eventId; try { return fn(); } finally { AMBIENT = p; } }
export function makeEvent(civ, ids, { kind, title, participants = [], location = null, causes = [], effects = [], provenance = "simulation", facts = null, decisionId = null, why = null }) {
  void decisionId; // v6.1.0: AI の判断は保存しない。出来事は結果だけを持つ
  for (const c of causes) { if (!RELATIONS.includes(c.relation)) throw new Error(`未知の関係: ${c.relation}`); if (!BASES.includes(c.basis)) throw new Error(`未知の根拠: ${c.basis}`); }
  // v6.1.0 §11.3: 因果リンクは、直接かつ明確に対応付けられるもの（direct）だけを保存する。推測（strong・plausible・contested・unknown）は、確定した歴史のように残さない
  const direct = causes.filter((c) => c.basis === "direct"); if (AMBIENT && !direct.some((c) => c.targetId === AMBIENT)) direct.push({ targetId: AMBIENT, relation: "caused_by", basis: "direct" });
  const ev = { eventId: ids.next("event"), date: { ...civ.date }, kind, title, participants, location, causes: direct, effects, provenance, media: mediaOf(civ, participants, kind) };
  if (facts) ev.facts = facts;
  if (why) ev.why = why; // v6.20.1: 先行する出来事がなくても、起きた理由（シミュレーションが知っている直接の条件）を一言で残す。推測ではなく、その処理が実際に使った条件だけを書く
  civ.events.push(ev); return ev;
}
