// 時代区分：「江戸時代」「近代」のような名前を、任意の年の範囲に自由に設定できるようにする。
//
// 保存場所: ALTERHISTORY拡張データ ext.data.eras = [{ id, name, fromYear }]
// 「fromYear年から、次の時代の開始年の前年まで」がその時代。最後の時代は無期限に続く。
// Azgaar形式には無い概念のため、edit/ext.js の ensureExt と同様に拡張データに保存する。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand } from "./commands.js";
import { ensureExt } from "./ext.js";

export function listEras(map) {
  const list = map.ext?.data?.eras ?? [];
  return list.slice().sort((a, b) => a.fromYear - b.fromYear);
}

function nextEraId(map) {
  const list = listEras(map);
  return list.length ? Math.max(...list.map((e) => e.id)) + 1 : 1;
}

/** 指定した年がどの時代に属すかを返す（無ければ null） */
export function eraAt(map, year) {
  const list = listEras(map);
  let current = null;
  for (const e of list) { if (e.fromYear <= year) current = e; else break; }
  return current;
}

/** 時代を追加する（同じ開始年が既にあれば、名前を上書きする） */
export function planSetEra(map, { id, name, fromYear }) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("時代の名前を入力してください");
  const year = Math.max(1, Math.round(Number(fromYear) || 1));
  const before = listEras(map);
  const existing = id != null ? before.find((e) => e.id === id) : null;
  let after;
  if (existing) {
    after = before.map((e) => (e.id === existing.id ? { ...e, name: trimmed, fromYear: year } : e));
  } else {
    after = [...before, { id: nextEraId(map), name: trimmed, fromYear: year }];
  }
  const write = (m, v) => { ensureExt(m).data.eras = v; };
  return makeCommand(existing ? `時代を編集（${trimmed}）` : `時代を追加（${trimmed}）`, [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
}

/** 時代を削除する */
export function planRemoveEra(map, id) {
  const before = listEras(map);
  if (!before.some((e) => e.id === id)) throw new Error("その時代は存在しません");
  const after = before.filter((e) => e.id !== id);
  const write = (m, v) => { const ext = ensureExt(m); ext.data.eras = v; if (!v.length) delete ext.data.eras; };
  return makeCommand("時代を削除", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
}
