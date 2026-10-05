// 多国間同盟：既存の2国間 diplomacy（同盟/敵対など）とは別に、3カ国以上のグループを扱う。
//
// 保存場所: ALTERHISTORY拡張データ ext.data.alliances = [{ id, name, members:[stateId,...], formedAt, dissolvedAt }]
// formedAt/dissolvedAt は { year, month } | null（結成日・解消日）。世界の現在時刻から自動で記録する。
// Azgaar形式には無い概念のため、edit/ext.js の ensureExt と同様に拡張データに保存する。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand } from "./commands.js";
import { ensureExt } from "./ext.js";
import { diplomacyParts } from "./diplomacy.js";
import { BOND_BY_KEY } from "../sim/war-flow.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/** 盟主（同盟を主導する国）。未設定の同盟は、最初の加盟国 */
export const leaderOf = (a) => (a?.members?.includes(a.leader) ? a.leader : a?.members?.[0] ?? null);
const bondKey = (a) => (BOND_BY_KEY[a?.bond] ? a.bond : "standard");
export function listAlliances(map) {
  return map.ext?.data?.alliances ?? [];
}

function nextAllianceId(map) {
  const list = listAlliances(map);
  return list.length ? Math.max(...list.map((a) => a.id)) + 1 : 1;
}

/** 同盟を作る。メンバーは2カ国以上必須（ユーザー要件：3カ国以上を想定するが、2国も許容） */
export function planCreateAlliance(map, name, memberIds, date, bond = "standard", leader = null) {
  const uniq = [...new Set(memberIds)];
  if (uniq.length < 2) throw new Error("同盟には2カ国以上が必要です");
  for (const id of uniq) if (!isLive(map.pack.states[id])) throw new Error(`国家#${id}は存在しません`);
  if (!BOND_BY_KEY[bond]) throw new Error("同盟の拘束力は 緩やか・標準・強固 から選んでください");
  if (leader != null && !uniq.includes(leader)) throw new Error("盟主は加盟国の中から選んでください");
  const alliance = { id: nextAllianceId(map), name: name || "新しい同盟", members: uniq, bond, leader: leader ?? uniq[0], formedAt: date ?? null, dissolvedAt: null };
  const pairs = []; for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) pairs.push([uniq[i], uniq[j]]);
  const before = listAlliances(map);
  const write = (m, list) => { const ext = ensureExt(m); ext.data.alliances = list; if (!list.length) delete ext.data.alliances; };
  return {
    command: makeCommand(`同盟を結成（${alliance.name}）`, [], [{ apply: (m) => write(m, [...before, alliance]), revert: (m) => write(m, before) }, ...diplomacyParts(map, pairs, "Ally")]),
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
  const nextBond = patch.bond ?? bondKey(a);
  const nextLeader = nextMembers.includes(patch.leader) ? patch.leader : nextMembers.includes(leaderOf(a)) ? leaderOf(a) : nextMembers[0];
  if (patch.leader != null && !nextMembers.includes(patch.leader)) throw new Error("盟主は加盟国の中から選んでください");
  if (!BOND_BY_KEY[nextBond]) throw new Error("同盟の拘束力は 緩やか・標準・強固 から選んでください");
  if (nextName === a.name && nextBond === bondKey(a) && nextLeader === leaderOf(a) && JSON.stringify(nextMembers) === JSON.stringify(a.members)) return null;
  const before = list;
  const after = list.map((x) => (x.id === allianceId ? { ...x, name: nextName, members: nextMembers, bond: nextBond, leader: nextLeader } : x));
  const write = (m, v) => { ensureExt(m).data.alliances = v; };
  return makeCommand("同盟を編集", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
}

/** 同盟を解消する（解消日を記録して残す。一覧からは消えず「解消済み」として履歴に残る） */
export function planDissolveAlliance(map, allianceId, date) {
  const list = listAlliances(map);
  const a = list.find((x) => x.id === allianceId);
  if (!a) throw new Error("その同盟は存在しません");
  if (a.dissolvedAt) throw new Error("既に解消されています");
  const before = list;
  const after = list.map((x) => (x.id === allianceId ? { ...x, dissolvedAt: date ?? null } : x));
  const write = (m, v) => { ensureExt(m).data.alliances = v; };
  return makeCommand("同盟を解消", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
}

/** 指定国家が加盟している同盟の一覧（解消済みも含む。現存のものだけなら .filter(a => !a.dissolvedAt)） */
export function alliancesOf(map, stateId) {
  return listAlliances(map).filter((a) => a.members.includes(stateId));
}
