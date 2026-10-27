// v5.3 UI 共通: 月インデックス・数値の表示整形。
// 月インデックス = 年 * 12 + (月 - 1)。core/civ/tick.js の monthIndex と同じ規約。
export const monthOf = (year, month = 1) => year * 12 + (month - 1);
export const yearOfMonth = (mi) => Math.floor(mi / 12);
export const monthNumber = (mi) => ((mi % 12) + 12) % 12 + 1;
export const fmtMonth = (mi) => (mi == null || !Number.isFinite(mi) ? "—" : `${yearOfMonth(mi)}年${monthNumber(mi)}月`);
export const fmtYear = (mi) => (mi == null || !Number.isFinite(mi) ? "—" : `${yearOfMonth(mi)}年`);

/** 人口・件数など。1万以上は「万」「億」で短く */
export function fmtNum(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, "")}億`;
  if (a >= 1e4) return `${(n / 1e4).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "")}万`;
  return Math.round(n).toLocaleString("ja-JP");
}
export const fmtPct = (x, digits = 0) => (x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(digits)}%`);
export const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${n} B`);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
