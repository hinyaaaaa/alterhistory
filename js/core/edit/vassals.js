// 従属関係：傀儡・保護国・属国。敗戦国を併合せずに従わせる（HoI4 の傀儡にあたる）。
//   傀儡(puppet)     : 宗主国の戦争に必ず従って参戦する。貢納は重い(20%)
//   保護国(protectorate): 宗主国が守る。宗主国が攻める戦争には加わらないが、守る戦争には参戦する。貢納は軽い(8%)
//   属国(vassal)     : 自国の内政は保つが、宗主国の戦争に参戦し、貢納(12%)を納める
// 宗主国が消えた従属国は、自動的に独立に戻る（宗主国が実在するかで判定するので、後始末は要らない）。
// 純粋ロジック層：DOM に依存しない。
import { makeCommand, setProps } from "./commands.js";
import { diplomacyParts } from "./diplomacy.js";
import { officialName } from "../names.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
export const VASSAL_KINDS = Object.freeze([
  { key: "puppet", label: "傀儡", tribute: 0.2, joinsOffensive: true, desc: "宗主国の戦争に必ず従う。貢納が重い。" },
  { key: "protectorate", label: "保護国", tribute: 0.08, joinsOffensive: false, desc: "宗主国が守る。宗主国が攻める戦争には加わらず、守る戦争には参戦する。" },
  { key: "vassal", label: "属国", tribute: 0.12, joinsOffensive: true, desc: "内政は保つが、宗主国の戦争に従い、貢納を納める。" },
]);
export const VASSAL_BY_KEY = Object.fromEntries(VASSAL_KINDS.map((k) => [k.key, k]));

/** 実在する宗主国がいれば { overlord, kind }。いなければ null */
export function vassalInfo(map, id) {
  const st = map.pack.states[id], v = st?.vassal;
  if (!v || !isLive(st) || !isLive(map.pack.states[v.overlord]) || !VASSAL_BY_KEY[v.kind]) return null;
  return { overlord: v.overlord, kind: v.kind };
}
/** 宗主国の従属国の一覧（実在するものだけ） */
export function vassalsOf(map, overlordId) {
  return map.pack.states.filter((s) => isLive(s) && vassalInfo(map, s.i)?.overlord === overlordId).map((s) => ({ stateId: s.i, kind: s.vassal.kind }));
}
/** 最上位の宗主国（宗主国のさらに上がいれば辿る）。輪があれば打ち切る */
export function topOverlord(map, id) {
  let cur = id; const seen = new Set();
  while (!seen.has(cur)) { seen.add(cur); const v = vassalInfo(map, cur); if (!v) break; cur = v.overlord; }
  return cur;
}

export function planSetVassal(map, vassalId, overlordId, kind, date) {
  const V = map.pack.states[vassalId], O = map.pack.states[overlordId];
  if (!isLive(V) || !isLive(O)) throw new Error("存在しない国家です");
  if (vassalId === overlordId) throw new Error("自国を従属させることはできません");
  if (!VASSAL_BY_KEY[kind]) throw new Error("従属の種類は 傀儡・保護国・属国 から選んでください");
  if (topOverlord(map, overlordId) === vassalId) throw new Error("宗主国がすでに相手に従属しています（従属関係が輪になります）");
  const cur = vassalInfo(map, vassalId);
  if (cur && cur.overlord === overlordId && cur.kind === kind) return null;
  const label = VASSAL_BY_KEY[kind].label;
  return makeCommand(`${label}にする（${officialName(V)} → ${officialName(O)}）`, [], [setProps(V, { vassal: { overlord: overlordId, kind, since: date ?? null } })]);
}
export function planReleaseVassal(map, vassalId) {
  const V = map.pack.states[vassalId];
  if (!isLive(V) || !vassalInfo(map, vassalId)) throw new Error("従属していない国です");
  return makeCommand(`独立させる（${officialName(V)}）`, [], [setProps(V, { vassal: null })]);
}

/** 従属国の貢納：年ごとに、従属国の国庫から宗主国の国庫へ（従属国の通貨で計算し、宗主国の通貨に換算）。部品の配列を返す */
export function tributeParts(map, getTreasury, convert) {
  const parts = [];
  for (const s of map.pack.states) {
    const v = s && isLive(s) ? vassalInfo(map, s.i) : null; if (!v) continue;
    const rate = VASSAL_BY_KEY[v.kind].tribute, t = Math.max(0, getTreasury(s)), amount = Math.round(t * rate * 100) / 100;
    if (amount <= 0) continue;
    parts.push({ from: s.i, to: v.overlord, amount, received: Math.round(convert(map, s.i, v.overlord, amount) * 100) / 100 });
  }
  return parts;
}

/** 年ごとの貢納を1つのコマンドにまとめる（国庫を、従属国から宗主国へ）。無ければ null */
export function planTribute(map, getTreasury, convert) {
  const list = tributeParts(map, getTreasury, convert);
  if (!list.length) return null;
  const delta = new Map();
  for (const t of list) { delta.set(t.from, (delta.get(t.from) ?? 0) - t.amount); delta.set(t.to, (delta.get(t.to) ?? 0) + t.received); }
  const parts = [...delta].map(([id, d]) => setProps(map.pack.states[id], { treasury: Math.round((getTreasury(map.pack.states[id]) + d) * 100) / 100 }));
  return makeCommand("従属国の貢納", [], parts);
}
