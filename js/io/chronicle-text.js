// クロニクル用のテキスト補助：ノート（HTML）を AI が読みやすい平文にする。
// 既存の notes.js の getNote / htmlToEditable を再利用し、重複実装を避ける。
//
// 純粋ロジック層：DOM に依存しない（正規表現のみ。DOMParser は使わない）。

import { getNote as getNoteRaw } from "../core/edit/notes.js";

export const getNote = getNoteRaw;

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/**
 * ノートの HTML を平文にする。段落・改行は改行として残す。
 * 見出し(<h1>〜)・リスト(<li>)・リンクなど、書式付きのノートでも情報が落ちないようにする
 * （既存の htmlToEditable は書式付きを HTML のまま返すため、AI 向けにはここで平文へ落とす）。
 */
export function htmlToEditableText(html) {
  return String(html ?? "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "・")
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "$2（$1）")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
