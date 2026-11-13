// v6.12.0: 決断（時間を止める選択の場面）を、既定の選択肢（先頭の選べるもの）で解決する試験用の補助。
import { dispatch, AUTHORITY as A } from "../../js/core/wcde/contract.js";
import { pendingOf } from "../../js/core/wcde/decision-state.js";
export const settle = (w, pick = null) => { let n = 0; for (let g = 0; pendingOf(w.civ).length && g < 60; g++) { const d = pendingOf(w.civ)[0], o = (pick?.(d) ?? d.options.find((x) => !x.disabled)); if (!o) break; const r = dispatch(w, { type: "decision.resolve", authority: A.PLAYER, decisionId: d.id, option: o.id ?? o }); if (!r.ok) break; n++; } return n; };
