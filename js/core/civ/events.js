// v5: イベントの正本レコード（指示書 §8.1 の最小形。M6 で因果グラフ・索引へ拡張する）。
// IDは発行時の連番。タイトル・年月から識別子を作らない。原因はIDで持つ（文字列の逆引きをしない）。
export const RELATIONS = Object.freeze(["caused_by", "contributed_to", "reaction_to", "enabled_by", "part_of", "succeeded_by", "influenced_by", "related_to"]);
export const BASES = Object.freeze(["direct", "strong", "plausible", "contested", "unknown"]);
export function makeEvent(civ, ids, { kind, title, participants = [], location = null, causes = [], effects = [], decisionId = null, provenance = "simulation" }) {
  for (const c of causes) { if (!RELATIONS.includes(c.relation)) throw new Error(`未知の関係: ${c.relation}`); if (!BASES.includes(c.basis)) throw new Error(`未知の根拠: ${c.basis}`); }
  const ev = { eventId: ids.next("event"), date: { ...civ.date }, kind, title, participants, location, causes, effects, decisionId, provenance };
  civ.events.push(ev); return ev;
}
