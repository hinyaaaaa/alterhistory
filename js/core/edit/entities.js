// 実体（国家・文化・宗教・属州）の名前変更。
// 都市（burgs.js の planRenameBurg）とは別の配列に入っているため、専用の1関数にする。
// name と fullName の両方を持つ実体では、表示に使われる fullName を優先して書き換える
// （国家一覧・凡例などは fullName ?? name を表示に使っているため）。

import { makeCommand, setProps } from "./commands.js";

const LIST_KEY = { state: "states", culture: "cultures", religion: "religions", province: "provinces" };
const isLive = (e) => !!e && typeof e === "object" && !e.removed;

/** 実体の名前を変える。kind: "state"|"culture"|"religion"|"province" */
export function planRenameEntity(map, kind, id, name) {
  const listKey = LIST_KEY[kind];
  if (!listKey) throw new Error("この種類の名前は変更できません");
  const e = map.pack[listKey]?.[id];
  if (!isLive(e)) throw new Error("その対象は存在しません");
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("名前を入力してください");
  const field = "fullName" in e ? "fullName" : "name";
  if (trimmed === e[field]) return null;
  const label = { state: "国家", culture: "文化", religion: "宗教", province: "属州" }[kind];
  return makeCommand(`${label}の名前を変更`, ["places"], [setProps(e, { [field]: trimmed })]);
}
