// V5-M7: 文明状態のチャンク保存。イベント・判断記録は100年ごとの期間チャンク（閉じた期間は再圧縮を省ける）、履歴（月次状態）は2つのチャンク（索引・Float64）、残りは核（civ.state）。
//   旧形式（v4.2.0: civ.state 1つの JSON に全部）も読める（decodeCivChunks が自動判定）。
import { encodeHistory, decodeHistory } from "./history.js";
import { migrateCiv, CIV_STATE_VERSION } from "./civ-state.js";

export const PERIOD_MONTHS = 1200;
export const PREFIX = "civ.";
const enc = new TextEncoder(), dec = new TextDecoder();
const key = (mi) => { const k = Math.floor(mi / PERIOD_MONTHS); return k < 0 ? `n${String(-k).padStart(4, "0")}` : `p${String(k).padStart(4, "0")}`; };
const keyNum = (s) => (s[0] === "n" ? -1 : 1) * Number(s.slice(1));
const closed = new WeakMap(); // civ → Map(チャンク名 → {n, bytes})。閉じた期間は件数が変わらなければ再利用（イベント改名などは invalidateChunks）
export const invalidateChunks = (civ) => closed.delete(civ);
const evMi = (e) => e.date.year * 12 + e.date.month - 1;

function periodChunks(civ, name, list, mi) {
  const out = {}, groups = new Map(), cache = closed.get(civ) ?? (closed.set(civ, new Map()), closed.get(civ)), cur = key(civ.monthIndex);
  for (const x of list) { const k = key(mi(x)); (groups.get(k) ?? groups.set(k, []).get(k)).push(x); }
  for (const [k, arr] of groups) { const nm = `${PREFIX}${name}.${k}`, hit = cache.get(nm); if (k !== cur && hit && hit.n === arr.length) { out[nm] = hit.bytes; continue; } const bytes = enc.encode(JSON.stringify(arr)); out[nm] = bytes; if (k !== cur) cache.set(nm, { n: arr.length, bytes }); }
  return out;
}
/** 文明状態 → { チャンク名: bytes } */
export function encodeCivChunks(civ) {
  const { events, decisions, history, ...core } = civ; core.chunked = { events: events.length, decisions: decisions.length, history: !!history };
  const out = { "civ.state": enc.encode(JSON.stringify(core)), ...periodChunks(civ, "events", events, evMi), ...periodChunks(civ, "decisions", decisions, (d) => evMi(d)) };
  if (history) { const h = encodeHistory(history); out["civ.history.index"] = h.index; out["civ.history.data"] = h.data; }
  return out;
}
/** get(name) → bytes|undefined、names → 拡張チャンク名の一覧 */
export function decodeCivChunks(get, names) {
  const core = JSON.parse(dec.decode(get("civ.state"))); if (!core || typeof core.version !== "number") throw new Error("文明状態が壊れています");
  if (core.version > CIV_STATE_VERSION) throw new Error(`新しすぎる文明状態の版です（${core.version}）`);
  if (core.chunked) {
    const load = (name) => names.filter((n) => n.startsWith(`${PREFIX}${name}.`)).sort((a, b) => keyNum(a.split(".").pop()) - keyNum(b.split(".").pop())).flatMap((n) => JSON.parse(dec.decode(get(n))));
    core.events = load("events"); core.decisions = load("decisions");
    if (core.events.length !== core.chunked.events || core.decisions.length !== core.chunked.decisions) throw new Error(`履歴チャンクの件数が合いません（イベント ${core.events.length}/${core.chunked.events}・判断 ${core.decisions.length}/${core.chunked.decisions}）`);
    if (core.chunked.history) { const i = get("civ.history.index"), d = get("civ.history.data"); if (!i || !d) throw new Error("月次履歴のチャンクが見つかりません"); core.history = decodeHistory(i, d); }
    delete core.chunked;
  }
  return migrateCiv(core);
}
