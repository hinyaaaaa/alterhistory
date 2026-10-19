// 国家の自律行動の設定（v3.0.0）。保存先: ext.data.ai = { enabled, tempo, verbs, players }
//   ・players: 「プレイヤー国」。ユーザーが自分で動かす国。ここに入っていない国が、自律して動く。
//     プレイヤー国を1つも決めていない地図では、自律行動は動かない（従来どおり、すべて手動）。
//   ・tempo: 判断の速さ（慎重・ふつう・積極）。1か国あたりの判断の間隔・年間の新しい戦争の数・宣戦の意欲に効く。
//   ・verbs: どの行動を自律させるか（技術の採用・条約・宣戦・講和）。
//   ・targetPlayers: プレイヤー国にも宣戦するか（既定は する。重みは自律国どうしより低い）。
// 純粋ロジック層：DOM に依存しない。
import { makeCommand } from "../edit/commands.js";
import { ensureExt } from "../edit/ext.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/**
 * 判断の速さ。think = 1か国が判断する間隔（月）。war = 宣戦の意欲の倍率。
 * warRate = 自律する国1つあたり、100年に何回、新しい戦争を始めるかの目安（世界全体の宣戦の最短の間隔は、国の数で決まる）。
 * 人が動かすのと同じくらいの頻度（国あたり、数十年に1回の戦争）になるよう決めてある。
 */
export const TEMPOS = Object.freeze({
  cautious: Object.freeze({ key: "cautious", label: "慎重", think: 12, war: 0.6, warRate: 1.5 }),
  normal: Object.freeze({ key: "normal", label: "ふつう", think: 6, war: 1, warRate: 3 }),
  active: Object.freeze({ key: "active", label: "積極", think: 3, war: 1.5, warRate: 6 }),
});
export const AI_VERBS = Object.freeze([
  { key: "tech", label: "技術の採用" }, { key: "treaty", label: "条約（締結・更新）" }, { key: "war", label: "宣戦" }, { key: "peace", label: "講和" },
]);
const DEFAULT_VERBS = Object.freeze({ tech: true, treaty: true, war: true, peace: true });

export function getAi(map) {
  const s = map?.ext?.data?.ai ?? {};
  return {
    enabled: s.enabled !== false, tempo: TEMPOS[s.tempo] ? s.tempo : "normal", targetPlayers: s.targetPlayers !== false,
    verbs: { ...DEFAULT_VERBS, ...(s.verbs ?? {}) },
    players: [...new Set(s.players ?? [])].filter((id) => isLive(map?.pack?.states?.[id])),
  };
}
const isDefault = (v) => v.enabled && v.tempo === "normal" && v.targetPlayers && !v.players.length && Object.values(v.verbs).every(Boolean);
const write = (m, v) => { const x = ensureExt(m); if (!v || isDefault(v)) delete x.data.ai; else x.data.ai = v; };

/** 設定を変える（部分指定でよい。Undo 可） */
export function planSetAi(map, patch) {
  const raw = map.ext?.data?.ai, cur = getAi(map);
  const next = { ...cur, ...patch, verbs: { ...cur.verbs, ...(patch.verbs ?? {}) } };
  if (!TEMPOS[next.tempo]) throw new Error("判断の速さは 慎重・ふつう・積極 から選んでください");
  next.players = [...new Set(next.players)].filter((id) => isLive(map.pack.states[id]));
  const cmd = makeCommand("国家の自律行動の設定", [], [{ apply: (m) => write(m, next), revert: (m) => { const x = ensureExt(m); if (raw === undefined) delete x.data.ai; else x.data.ai = raw; } }]);
  return cmd;
}

/** 国を、プレイヤー国にする／やめる */
export function planSetPlayer(map, stateId, on) {
  if (!isLive(map.pack.states[stateId])) throw new Error("その国はありません");
  const cur = getAi(map).players, next = on ? [...cur, stateId] : cur.filter((id) => id !== stateId);
  return planSetAi(map, { players: next });
}

export const playerIds = (map) => getAi(map).players;
export const isPlayer = (map, id) => getAi(map).players.includes(id);
/** 自律して動く国か（有効で、プレイヤー国が決まっていて、その国がプレイヤー国ではない） */
export function isAutonomous(map, id, ai = getAi(map)) {
  return ai.enabled && ai.players.length > 0 && isLive(map.pack.states[id]) && !ai.players.includes(id);
}
