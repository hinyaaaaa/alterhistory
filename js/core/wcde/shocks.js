// v6.17.0: 国名・政体・指導者・国旗の変更の代償（時間とともに薄れる正統性の低下）。依存なし（effective.js から読まれる）。
//   st.shocks = [{ kind, at, legit, years }]。残りは線形に薄れる。同じ種類の変更が続くほど大きくなる（累積）。
export const SHOCK_MAX = 12;
export const shockLegit = (st, mi) => { let s = 0; for (const x of st?.shocks ?? []) { const d = (mi - x.at) / Math.max(1, x.years * 12); if (d < 1) s += x.legit * (1 - Math.max(0, d)); } return s; };
export const recentShocks = (st, kind, mi, years = 60) => (st?.shocks ?? []).filter((x) => x.kind === kind && mi - x.at < years * 12).length;
export function addShock(st, mi, kind, legit, years) { const a = (st.shocks ??= []); a.push({ kind, at: mi, legit: Math.round(legit * 1000) / 1000, years }); while (a.length > SHOCK_MAX) a.shift(); return a[a.length - 1]; }
export const shockLeft = (st, mi) => (st?.shocks ?? []).filter((x) => mi - x.at < x.years * 12).map((x) => ({ kind: x.kind, legit: x.legit * (1 - (mi - x.at) / (x.years * 12)), left: Math.ceil((x.years * 12 - (mi - x.at)) / 12) }));
