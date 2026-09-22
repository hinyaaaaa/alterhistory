// ノート（文章）：国家・属州・文化・宗教・都市・マーカーに付ける自由な文章。
//
// 保存場所は、ファイルの版で違う（公式のソースで確認）:
//   ・v1.152.0 以降: 各実体の `note` フィールド（HTML 文字列）
//   ・それ以前    : 別の配列 notes = [{id, name, legend}]。id は "marker3" "burg12" "state5" など
//     公式は古い形式を読み込むとき、この id を実体に対応付けて新形式へ移す。
//     そのため、id の書き方を公式の規則（map-entities.ts の ELEMENT_PATTERNS）に合わせる。
//     合わない id で書くと、公式で開いたときに文章が失われる。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setProps, setList } from "./commands.js";
import { PAINT_KINDS } from "./paint.js";

export const NOTE_TYPES = ["state", "province", "culture", "religion", "burg", "marker"];
export const MAX_NOTE = 20000;

const isLive = (e) => !!e && typeof e === "object" && !e.removed;
const isLegacy = (map) => map.settings.format === "legacy";

/** 種類とIDから、ノートを持つ実体を取り出す。無ければ null */
export function noteTarget(map, type, id) {
  if (type === "marker") return map.markers.find((m) => m.i === id) ?? null;
  if (type === "burg") { const b = map.pack.burgs[id]; return isLive(b) && b.i ? b : null; }
  const def = PAINT_KINDS[type];
  if (!def) return null;
  const e = map.pack[def.list][id];
  return isLive(e) && e.i ? e : null;
}

/** 旧形式で、この実体のノートに使われうる id（公式が同じ実体として読む書き方すべて） */
const legacyIds = (type, id) => {
  const ids = [`${type}${id}`];
  if (type === "state" || type === "province" || type === "burg") ids.push(`${type}Label${id}`);
  return ids;
};
const findLegacy = (map, type, id) => {
  const ids = legacyIds(type, id);
  return map.notes.findIndex((n) => n && ids.includes(n.id));
};

export function getNote(map, type, id) {
  const t = noteTarget(map, type, id);
  if (!t) return "";
  if (!isLegacy(map)) return typeof t.note === "string" ? t.note : "";
  const idx = findLegacy(map, type, id);
  return idx >= 0 ? map.notes[idx].legend ?? "" : "";
}

/** 旧形式の見出し（公式では、マーカーの名前は見出しがすべて） */
const titleOf = (type, t) => (t.name ? String(t.name) : type);

/** ノートを書き換える。text が空ならノートを消す。変更が無ければ null */
export function planSetNote(map, type, id, text) {
  if (!NOTE_TYPES.includes(type)) throw new Error(`ノートを付けられない種類です: ${type}`);
  const t = noteTarget(map, type, id);
  if (!t) throw new Error("ノートを付ける対象が存在しません");
  const value = String(text ?? "");
  if (value.length > MAX_NOTE) throw new Error(`文章が長すぎます（${MAX_NOTE}文字まで）`);
  if (value === getNote(map, type, id)) return null;

  if (!isLegacy(map)) {
    return makeCommand("文章の変更", [], [setProps(t, { note: value === "" ? undefined : value })]);
  }
  const idx = findLegacy(map, type, id);
  const next = map.notes.slice();
  if (idx >= 0) {
    // マーカーは、見出し（名前）もこの行が持つので、文章が空でも行は残す
    if (value === "" && type !== "marker") next.splice(idx, 1);
    else next[idx] = { ...next[idx], legend: value };
  } else if (value !== "") {
    next.push({ id: `${type}${id}`, name: titleOf(type, t), legend: value });
  }
  return makeCommand("文章の変更", [], [setList((m) => m.notes, (m, v) => { m.notes = v; }, next)]);
}

/** 実体を削除するとき、その旧形式ノートを取り除く部品 */
export function removeLegacyNotesPart(map, type, id) {
  if (!isLegacy(map)) return null;
  const ids = legacyIds(type, id);
  if (!map.notes.some((n) => n && ids.includes(n.id))) return null;
  return setList((m) => m.notes, (m, v) => { m.notes = v; }, map.notes.filter((n) => !(n && ids.includes(n.id))));
}

// ---------- 画面の入力欄 ↔ 保存する HTML ----------
//
// 保存されている文章は HTML。書式（見出し・リンクなど）を含むものを、平文の入力欄で編集して
// 保存すると書式が壊れる。そこで、書式を含むかどうかを判定し、含む場合は HTML のまま編集させる。

const SIMPLE_TAGS = /<(?!\/?(?:br|p)\b)[a-z!][^>]*>/i;
const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** @returns {{text:string, rich:boolean}} rich=true は「書式(HTML)を含む」 */
export function htmlToEditable(html) {
  const s = String(html ?? "");
  if (!s) return { text: "", rich: false };
  if (SIMPLE_TAGS.test(s)) return { text: s, rich: true };
  const text = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/?p[^>]*>/gi, "")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m]);
  return { text, rich: false };
}

export function editableToHtml(text, rich) {
  const s = String(text ?? "").replace(/\r\n?/g, "\n");
  if (rich) return s;
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}
