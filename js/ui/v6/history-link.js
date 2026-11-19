// v6.20.0: 世界の履歴を、ブラウザの保存先（IndexedDB）へつなぐ。画面側の窓口。IndexedDB が使えない環境では、従来どおりメモリ上に持つ（機能は変わらない）。
import { S } from "./store.js";
import { notify } from "./notify.js";
import { workerCodec, attachStore, flushHistory, storeOf, historyStatus } from "../../core/civ/history-store.js";
import { openHistoryStore } from "../../io/history-store-idb.js";
let opening = null;
export function ensureStore() {
  opening ??= (async () => { let codec; try { if (typeof Worker !== "undefined") codec = workerCodec(new URL("dist/history-worker.js", document.baseURI).href); } catch { codec = undefined; }
    const st = await openHistoryStore({ codec, onStatus: (s) => { if (s.blocked) notify("error", s.blocked); } }); S.histStore = st; return st; })();
  return opening;
}
/** 読み込んだ・新しく作った世界へ保存先をつなぐ。使われなくなった世界の保存領域を掃除する */
export async function linkHistory(w) {
  const st = await ensureStore(); if (!st || !w || S.w !== w) return null; const civ = w.civ;
  if (storeOf(civ) !== st) attachStore(civ, st); await st.touch(civ.archive.storeId); st.prune(civ.archive.storeId).catch(() => {}); scheduleFlush(); return st;
}
/** 進行したあと、閉じた期間の履歴を、少しずつ外部へ移す（再入しない。失敗してもメモリ上の資料は残る） */
let busy = false, lastAt = -1e9;
export function scheduleFlush(force = false) {
  const w = S.w; if (!w || !storeOf(w.civ) || busy) return; if (!force && w.civ.monthIndex - lastAt < 12) return; busy = true; lastAt = w.civ.monthIndex;
  flushHistory(w.civ, { maxChunks: 2 }).then((r) => { if (r.error) notify("error", "履歴を外部保存へ移せませんでした（メモリ上に残しています）: " + r.error); }).catch(() => {}).finally(() => { busy = false; });
}
export const historyInfo = () => (S.w ? historyStatus(S.w.civ) : null);
