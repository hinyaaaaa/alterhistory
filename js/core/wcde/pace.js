// v7.1.0: 「決断」の出し方。毎月のように時間が止まって選ばされるのを防ぐ。
//   重い決断（継承・宣戦・降伏・講和・反乱など）は必ず出す。軽い決断（小さな出来事・条約の申し出・盟約の誘い・会戦）は、
//   既定（standard）では一定の間隔を空け、その間の分は「顧問」が既定の選び方で処理して、年表と報せに残す。
//   モード: calm 重い決断だけ／standard 軽い決断は間隔を空ける（既定）／all すべて自分で決める（旧来）
export const PACE_MODES = Object.freeze({ calm: "静か", standard: "標準", all: "すべて" });
/** 軽い決断ごとの、続けて出さない間隔（月）。standard のとき */
const GAP = Object.freeze({ event: 30, treaty_offer: 18, pact_invite: 36, pact_merge: 36, omen: 48, battle: 8, peace_offer: 0 });
/** 重い決断（常に出す） */
const HEAVY = new Set(["succession", "war_incoming", "ally_call", "rebellion", "commander_death", "surrender_call", "conference", "peace_terms", "peace_offer"]);
export const paceOf = (civ) => (civ.wcde.pace ??= { mode: "standard", last: {} });
export function setPace(civ, mode) { if (!PACE_MODES[mode]) return false; paceOf(civ).mode = mode; return true; }
/** 出してよいか。spec.heavy: その決断が重いと呼び出し側が示したとき（大きな出来事など） */
export function worthAsking(civ, spec) {
  const p = paceOf(civ), mi = civ.monthIndex; if (p.mode === "all" || HEAVY.has(spec.kind) || spec.heavy) return true; if (p.mode === "calm" || spec.kind === "battle") return false; // 会戦は「すべて」のときだけ。ほかは戦況ボードの方針で動く
  const gap = GAP[spec.kind] ?? 24; return mi - (p.last[spec.kind] ?? -9999) >= gap;
}
export const noteAsked = (civ, kind) => { paceOf(civ).last[kind] = civ.monthIndex; };
