// 英語（ラテン文字）の都市名を、文化の系統に合わせたカタカナの名前に付け替える。
// 地図を開いたときに自動で、または手動で実行する。1回の操作として Undo で元の英語名に戻せる。
import { makeCommand, setProps } from "./commands.js";
import { suggestName } from "./naming.js";

const KANA_OR_KANJI = /[\u3040-\u30FF\u4E00-\u9FFF]/;
/** ラテン文字を含み、かな・漢字を含まない名前（= 英語名のまま） */
export const isLatinName = (name) => typeof name === "string" && /[A-Za-z]/.test(name) && !KANA_OR_KANJI.test(name);

/** 付け替え対象の都市の id 一覧 */
export function latinBurgIds(map) {
  const out = [];
  (map.pack.burgs ?? []).forEach((b, i) => { if (b && i > 0 && !b.removed && isLatinName(b.name)) out.push(i); });
  return out;
}

/** 英語名の都市すべてに、カタカナの名前を付ける。対象が無ければ null。 */
export function planKatakanaBurgs(map, rnd) {
  const ids = latinBurgIds(map);
  if (!ids.length) return null;
  const avoid = new Set(); // 今回付けた名前どうしが被らないように
  const parts = [];
  for (const id of ids) {
    const b = map.pack.burgs[id];
    const s = suggestName(map, { kind: "burg", rnd, cell: b.cell, avoid });
    avoid.add(s.name);
    parts.push(setProps(b, { name: s.name }));
  }
  return makeCommand(`英語の都市名をカタカナに（${ids.length}件）`, ["places"], parts);
}
