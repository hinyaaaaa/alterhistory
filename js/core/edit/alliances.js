// 多国間同盟：既存の2国間 diplomacy（同盟/敵対など）とは別に、3カ国以上のグループを扱う。
//
// 保存場所: ALTERHISTORY拡張データ ext.data.alliances = [{ id, name, members:[stateId,...] }]
// Azgaar形式には無い概念のため、edit/attributes.js と同様に拡張データに保存する。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand } from "./commands.js";
import { ensureExt } from "./attributes.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

export function listAlliances(map) {
  return map.ext?.data?.alliances ?? [];
}

function nextAllianceId(map) {
  const list = listAlliances(map);
  return list.length ? Math.max(...list.map((a) => a.id)) + 1 : 1;
}

/** 同盟を作る。メンバーは2カ国以上必須（ユーザー要件：3カ国以上を想定するが、2国も許容） */
export function planCreateAlliance(map, name, memberIds) {
  const uniq = [...new Set(memberIds)];
  if (uniq.length < 2) throw new Error("同盟には2カ国以上が必要です");
  for (const id of uniq) if (!isLive(map.pack.states[id])) throw new Error(`国家#${id}は存在しません`);
  const alliance = { id: nextAllianceId(map), name: name || "新しい同盟", members: uniq };
  const before = listAlliances(map);
  const write = (m, list) => { const ext = ensureExt(m); ext.data.alliances = list; if (!list.length) delete ext.data.alliances; };
  return {
    command: makeCommand(`同盟を結成（${alliance.name}）`, [], [{ apply: (m) => write(m, [...before, alliance]), revert: (m) => write(m, before) }]),
    id: alliance.id,
  };
}

/** メンバーの加入・脱退・名前変更 */
export function planEditAlliance(map, allianceId, patch) {
  const list = listAlliances(map);
  const a = list.find((x) => x.id === allianceId);
  if (!a) throw new Error("その同盟は存在しません");
  const nextMembers = patch.members ? [...new Set(patch.members)] : a.members;
  if (nextMembers.length < 2) throw new Error("同盟には2カ国以上が必要です");
  const nextName = patch.name !== undefined ? patch.name : a.name;
  if (nextName === a.name && JSON.stringify(nextMembers) === JSON.stringify(a.members)) return null;
  const before = list;
  const after = list.map((x) => (x.id === allianceId ? { ...x, name: nextName, members: nextMembers } : x));
  const write = (m, v) => { ensureExt(m).data.alliances = v; };
  return makeCommand("同盟を編集", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
}

/** 同盟を解消する */
export function planDissolveAlliance(map, allianceId) {
  const list = listAlliances(map);
  if (!list.some((a) => a.id === allianceId)) throw new Error("その同盟は存在しません");
  const before = list;
  const after = list.filter((a) => a.id !== allianceId);
  const write = (m, v) => { const ext = ensureExt(m); ext.data.alliances = v; if (!v.length) delete ext.data.alliances; };
  return makeCommand("同盟を解消", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
}

/** 指定国家が加盟している同盟の一覧 */
export function alliancesOf(map, stateId) {
  return listAlliances(map).filter((a) => a.members.includes(stateId));
}
