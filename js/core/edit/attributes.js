// 追加の属性：技術水準・政体・軍事・戦争など、ユーザーが自由に決める「名前と値」の組。
//
// Azgaar 形式には無い情報なので、ALTERHISTORY の拡張データ（ext.data.attributes）に保存する。
//   ext.data.attributes["state:3"] = { "技術水準": "中世", "政体": "封建制" }
// キーは「種類:ID」。値の意味は決めない（将来、生成や配置の入力として使えるようにするため）。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand } from "./commands.js";

export const ATTR_KINDS = ["state", "culture", "religion", "province"];
export const MAX_ATTRS = 40;
const MAX_LEN = 200;

export function ensureExt(map) {
  if (!map.ext) map.ext = { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
  map.ext.data ??= {};
  return map.ext;
}

const keyOf = (kind, id) => `${kind}:${id}`;

/** 実体の属性を [キー, 値] の配列で返す（追加した順） */
export function getAttributes(map, kind, id) {
  return Object.entries(map.ext?.data?.attributes?.[keyOf(kind, id)] ?? {});
}

/** 入力の行（[キー, 値]）を整える。空のキーは除き、同じキーは後のものを採用する */
export function normalizeAttributes(entries) {
  const out = new Map();
  for (const [k, v] of entries) {
    const key = String(k ?? "").trim();
    if (!key) continue;
    if (key.length > MAX_LEN) throw new Error(`属性の名前が長すぎます（${MAX_LEN}文字まで）`);
    const val = String(v ?? "").trim();
    if (val.length > MAX_LEN) throw new Error(`属性「${key}」の値が長すぎます（${MAX_LEN}文字まで）`);
    out.set(key, val);
  }
  if (out.size > MAX_ATTRS) throw new Error(`属性は ${MAX_ATTRS} 個までです`);
  return Object.fromEntries(out);
}

const sameObj = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]); };

/** 属性を丸ごと置き換える。変更がなければ null */
export function planSetAttributes(map, kind, id, entries) {
  if (!ATTR_KINDS.includes(kind)) throw new Error(`属性を付けられない種類です: ${kind}`);
  const after = normalizeAttributes(entries);
  const before = Object.fromEntries(getAttributes(map, kind, id));
  if (sameObj(before, after)) return null;
  const key = keyOf(kind, id);
  const write = (m, obj) => {
    const ext = ensureExt(m);
    ext.data.attributes ??= {};
    if (Object.keys(obj).length) ext.data.attributes[key] = { ...obj };
    else delete ext.data.attributes[key];
    if (!Object.keys(ext.data.attributes).length) delete ext.data.attributes;
  };
  return makeCommand("属性の変更", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
}

/** 実体を統合・削除するとき、その属性を取り除く部品 */
export function removeAttributesPart(map, kind, id) {
  const before = getAttributes(map, kind, id);
  if (!before.length) return null;
  const key = keyOf(kind, id);
  const obj = Object.fromEntries(before);
  return {
    apply: (m) => { const a = m.ext?.data?.attributes; if (a) { delete a[key]; if (!Object.keys(a).length) delete m.ext.data.attributes; } },
    revert: (m) => { const ext = ensureExt(m); ext.data.attributes ??= {}; ext.data.attributes[key] = { ...obj }; },
  };
}
