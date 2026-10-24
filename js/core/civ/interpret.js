// V5-M6: 歴史認識（国家の解釈）と歴史表現物（年代記）。客観イベント（civ.events）とは別の層。
//   ・認識 civ.interpretations: 国家が事件をどう解釈しているか。政体・指導者が変わると「新しい認識」が前の認識を置き換える（supersedes）。事実のイベントは書き換えない。
//   ・表現物 civ.works: 国家が書く年代記など。事実との差（claims: 主張と実際）を構造で残す。v5.0.0 は決定論的なテンプレート生成（LLM 非依存）。
//   ・国家AIは認識（恨み＝grievance）を入力にする（actions.js）。
import { evMonth, getEvent } from "./graph.js";

export const STANCE = Object.freeze({ victory: "勝利の栄光", humiliation: "屈辱", lost_territory: "失われた領土", betrayal: "裏切り", reconciled: "和解", founding: "建国の物語", inconclusive: "決着のつかなかった戦争" });
const MAX_ACTIVE = 24, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (x) => Math.round(x * 100) / 100;

function addInterp(ctx, owner, ev, stance, valence, about, supersedes = null) {
  const { civ, ids } = ctx, id = ids.next("interp");
  civ.interpretations.push({ interpId: id, ownerId: owner.id, eventId: ev.eventId, stance, valence: r2(valence), about, since: civ.monthIndex, until: null, supersedes, basis: "rule" });
  (owner.interp ??= []).push(id);
  while (owner.interp.length > MAX_ACTIVE) { const old = getInterp(civ, owner.interp.shift()); if (old) old.until = civ.monthIndex; } // 古い認識は「薄れた」。記録は残る
  return id;
}
const interpPos = new WeakMap();
export function getInterp(civ, id) { let m = interpPos.get(civ); if (!m || m.n > civ.interpretations.length) { m = { n: 0, map: new Map() }; interpPos.set(civ, m); } for (; m.n < civ.interpretations.length; m.n++) m.map.set(civ.interpretations[m.n].interpId, civ.interpretations[m.n]); return m.map.get(id) ?? null; }
/** 国家が、ある相手に抱いている恨みの強さ（0〜1）。有効な認識のうち負のものの合計 */
export function grievance(civ, st, targetId) { let s = 0; for (const id of st.interp ?? []) { const x = getInterp(civ, id); if (x && x.valence < 0 && x.about.includes(targetId)) s -= x.valence; } return Math.min(1, s); }
/** 認識の一覧（国家別。有効なものと、置き換えられたものを両方） */
export const interpretationsOf = (civ, ownerId) => civ.interpretations.filter((x) => x.ownerId === ownerId);

const TEXT = {
  victory: (a, b, w) => `${a}の年代記は、${b}との戦争を栄光の勝利として記した。`,
  humiliation: (a, b, w) => `${a}では、${b}との戦争は屈辱の記憶として語られた。`,
  inconclusive: (a, b, w) => `${a}の記録は、${b}との戦争を、決着のつかなかったものとして記した。`,
  founding: (a) => `${a}の建国の物語が編まれた。`,
};
function addWork(ctx, author, ev, stance, text, claims) {
  const { civ, ids } = ctx, id = ids.next("work");
  civ.works.push({ workId: id, kind: "chronicle", authorId: author.id, date: { ...civ.date }, targetEventId: ev.eventId, stance, text, claims, fidelity: claims.some((c) => c.claimed !== c.actual) ? "distorted" : "faithful" });
}
const factionOf = (w, id) => (w.sides.a.includes(id) ? "a" : "d");

/** conflict フェーズの末尾: 今月増えたイベントから、認識と表現物を作り、政体・指導者が変わった国家の認識を更新する */
export function stepInterpretation(ctx) {
  const { civ } = ctx; const E = civ.events;
  for (; civ.interpCursor < E.length; civ.interpCursor++) {
    const ev = E[civ.interpCursor];
    if (ev.kind === "war_ended") {
      const wid = ev.participants.find((p) => p.role === "war")?.entityId, w = civ.wars[wid]; if (!w) continue;
      for (const bp of ev.participants.filter((p) => p.role === "belligerent")) {
        const s = civ.states[bp.entityId]; if (!s) continue; const side = factionOf(w, s.id), foe = civ.states[side === "a" ? w.defender : w.aggressor]; if (!foe || foe.id === s.id) continue;
        const lead = w.outcome === "aggressor_victory" ? "a" : w.outcome === "defender_victory" ? "d" : Math.abs(w.score) >= 25 ? (w.score > 0 ? "a" : "d") : null; // 講和・膠着でも、戦況が大きく傾いていれば優勢側の勝ちと受け止める
        const won = lead === side, lost = lead !== null && lead !== side;
        const stance = won ? "victory" : lost ? "humiliation" : "inconclusive";
        addInterp(ctx, s, ev, stance, won ? 0.6 : lost ? -0.7 : -0.1, [foe.id]);
        if (lost && ev.effects.some((e) => e.before === s.id)) addInterp(ctx, s, ev, "lost_territory", -0.8, [foe.id]);
        const k = won ? 0.7 : lost ? 1.6 : 1, tribal = s.polity === "tribal" ? 1 : 0; const f = tribal ? 1 : k;
        addWork(ctx, s, ev, stance, TEXT[stance](s.name, foe.name, w), [{ property: "war.casualties", claimed: Math.round(w.casualties * f), actual: Math.round(w.casualties) }, { property: "war.outcome", claimed: lost && !tribal ? "stalemate" : stance === "inconclusive" && (s.polity === "kingdom" || s.polity === "empire") ? (side === "a" ? "aggressor_victory" : "defender_victory") : w.outcome, actual: w.outcome }]);
      }
    } else if (ev.kind === "treaty_ended") {
      const br = ev.participants.find((p) => p.role === "breaker"); if (!br) continue;
      for (const p of ev.participants.filter((x) => x.role === "party")) { const s = civ.states[p.entityId]; if (s?.alive) addInterp(ctx, s, ev, "betrayal", -0.6, [br.entityId]); }
    } else if (ev.kind === "state_formed") {
      const sp = ev.participants.find((p) => p.role === "state"), s = civ.states[sp?.entityId]; if (s) { addInterp(ctx, s, ev, "founding", 0.5, []); addWork(ctx, s, ev, "founding", TEXT.founding(s.name), []); }
    }
  }
  for (const id in civ.states) { // 政体・指導者が変わった国家は、認識だけが変わる（事実のイベントは変えない）
    const st = civ.states[id]; if (!st.alive || !st.interpDirty) continue; st.interpDirty = false;
    const k = st.polity === "republic" ? 0.4 : st.polity === "empire" || st.polity === "kingdom" ? 1.1 : 0.6;
    for (const iid of [...(st.interp ?? [])]) {
      const x = getInterp(civ, iid); if (!x || x.until != null || x.valence >= 0) continue;
      const nv = clamp(x.valence * k, -1, 0), ev = getEvent(civ, x.eventId); x.until = civ.monthIndex; st.interp = st.interp.filter((q) => q !== iid);
      if (ev) addInterp(ctx, st, ev, Math.abs(nv) < 0.15 ? "reconciled" : x.stance, Math.abs(nv) < 0.15 ? 0 : nv, x.about, iid);
    }
  }
}
