// ゾーン：侵攻・反乱・疫病・災害など、「ある範囲で起きている出来事」を表すセルの集まり。
// Azgaar 本家と同じ形式（map.zones = [{ name, type, color, cells:[セル番号], hidden? }]）で保存するので、.map に書き出しても互換。
// 本家が作った zones（color が "url(#hatchN)" の斜線パターン）も、そのまま読み書きできる。表示だけは種類ごとの色で描く。
// ゾーンの識別は配列の添字（本家のデータには安定した番号が無いため）。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand } from "./commands.js";
import { withEvent } from "./history-log.js";

export const ZONE_TYPES = Object.freeze([
  { id: "Invasion", label: "侵攻", color: "#d6453d" },
  { id: "Rebels", label: "反乱", color: "#e8913a" },
  { id: "Proselytism", label: "布教", color: "#5aa9d6" },
  { id: "Crusade", label: "聖戦", color: "#a3243b" },
  { id: "Disease", label: "疫病", color: "#7cb342" },
  { id: "Disaster", label: "災害", color: "#8d6e63" },
  { id: "Eruption", label: "火山", color: "#ff5722" },
  { id: "Quake", label: "地震", color: "#b07a3c" },
  { id: "Famine", label: "飢饉", color: "#a1887f" },
  { id: "Drought", label: "干ばつ", color: "#d4a24c" },
  { id: "Storm", label: "嵐", color: "#5c7cfa" },
  { id: "Avalanche", label: "雪崩", color: "#90a4ae" },
  { id: "Fault", label: "断層", color: "#6d4c41" },
  { id: "Flood", label: "洪水", color: "#1e88e5" },
  { id: "Tsunami", label: "津波", color: "#00acc1" },
  { id: "Fire", label: "大火", color: "#ef6c00" },
  { id: "Custom", label: "その他", color: "#ab47bc" },
]);
export const ZONE_TYPE_BY_ID = Object.freeze(Object.fromEntries(ZONE_TYPES.map((t) => [t.id, t])));
export const MAX_ZONES = 300;

/** 疫病・災害として手で記録できる種類（選択式）。ほかの種類は、読み込んだ地図のゾーンを表示するためだけに残してある */
export const TEMP_ZONE_TYPES = Object.freeze(["Disease", "Quake", "Flood", "Famine", "Drought", "Eruption", "Fire", "Storm"]);
/** 続く期間の選択肢（月数） */
export const ZONE_PERIODS = Object.freeze([
  { months: 3, label: "3か月" }, { months: 6, label: "半年" }, { months: 12, label: "1年" }, { months: 24, label: "2年" }, { months: 60, label: "5年" },
]);

const monthKey = (t) => t.year * 12 + (t.month - 1);
export const addMonthsTo = (t, n) => { const k = monthKey(t) + n; return { year: Math.floor(k / 12), month: (k % 12) + 1 }; };

/** いま（now）このゾーンを地図に出すか。期間の無いゾーン（読み込んだ地図のもの）は、いつでも出す */
export function zoneActive(zone, now) {
  if (!zone?.endAt) return true;
  if (!now) return true;
  const k = monthKey(now);
  return k < monthKey(zone.endAt) && (!zone.startAt || k >= monthKey(zone.startAt));
}

/** 表示に使う色。本家の斜線パターン（url(...)）や未設定のときは、種類の色 */
export function zoneColor(zone) {
  if (typeof zone?.color === "string" && /^#[0-9a-f]{3,8}$/i.test(zone.color)) return zone.color;
  return ZONE_TYPE_BY_ID[zone?.type]?.color ?? "#ab47bc";
}
export function zoneLabel(zone) { return ZONE_TYPE_BY_ID[zone?.type]?.label ?? zone?.type ?? "ゾーン"; }

export function listZones(map) { return (map.zones ?? []).map((z, index) => ({ ...z, index })).filter((z) => z && Array.isArray(z.cells)); }
/** 出来事が持つゾーンの id から、ゾーンを探す（期間が過ぎて表示から外れていても見つかる） */
export function findZoneByZid(map, zid) { return zid ? (map.zones ?? []).find((z) => z && z.zid === zid) ?? null : null; }

function nextZid(map) {
  let max = 0;
  for (const z of map.zones ?? []) { const m = /^z(\d+)$/.exec(z?.zid ?? ""); if (m) max = Math.max(max, +m[1]); }
  return `z${max + 1}`;
}

/** 範囲の選択（国全体・属州を選ぶ・地図で囲む）から、セルと名前、関係する国を決める */
export function resolveZoneScope(map, scope) {
  const c = map.pack.cells, n = c.biome.length, out = { cells: [], name: "", states: [] };
  if (scope?.kind === "state") {
    const st = map.pack.states[scope.id]; if (!st || st.removed || !(st.i > 0)) throw new Error("存在しない国家です");
    for (let i = 0; i < n; i++) if (c.state[i] === scope.id && c.biome[i] !== 0) out.cells.push(i);
    out.name = st.fullName ?? st.name; out.states = [scope.id];
  } else if (scope?.kind === "provinces") {
    const ids = new Set(scope.ids ?? []); const names = [];
    for (const id of ids) { const p = map.pack.provinces[id]; if (p && !p.removed) names.push(p.fullName ?? p.name); }
    if (!names.length) throw new Error("属州を選んでください");
    const st = new Set();
    for (let i = 0; i < n; i++) if (ids.has(c.province[i]) && c.biome[i] !== 0) { out.cells.push(i); if (c.state[i] > 0) st.add(c.state[i]); }
    out.name = names.length > 2 ? `${names[0]}ほか${names.length - 1}州` : names.join("・"); out.states = [...st];
  } else if (scope?.kind === "cells") {
    const st = new Set();
    for (const i of scope.cells ?? []) if (Number.isInteger(i) && i >= 0 && i < n && c.biome[i] !== 0) { out.cells.push(i); if (c.state[i] > 0) st.add(c.state[i]); }
    out.name = scope.name || (st.size === 1 ? (map.pack.states[[...st][0]]?.name ?? "指定の範囲") : "指定の範囲"); out.states = [...st];
  } else throw new Error("範囲を選んでください");
  if (!out.cells.length) throw new Error("範囲に陸のセルがありません");
  return out;
}

function replace(map, label, after) {
  const before = map.zones ?? [];
  return makeCommand(label, [], [{ apply: (m) => { m.zones = after; }, revert: (m) => { m.zones = before; } }]);
}

/**
 * 疫病・災害のゾーンを、期間つきで作る（一時表示）。年表に1件（テンプレートの文）とゾーンが同時にできる。
 * logEvent=false のときは、呼び出し側（自然発生の疫病など）が年表の記録を持つので、ゾーンだけ作る。
 * @returns {{command, zid, zone}}
 */
export function planAddTemporaryZone(map, { type, cells, months, date = null, name = "", scopeName = "", states = [], logEvent = true } = {}) {
  const t = ZONE_TYPE_BY_ID[type]; if (!t) throw new Error("未知のゾーンの種類です");
  if (!Array.isArray(cells) || !cells.length) throw new Error("範囲が空です");
  if (!ZONE_PERIODS.some((p) => p.months === months)) throw new Error("期間は 3か月・半年・1年・2年・5年 から選んでください");
  const list = map.zones ?? [];
  if (list.length >= MAX_ZONES) throw new Error(`ゾーンは${MAX_ZONES}件までです`);
  const start = date ?? map.worldTime ?? { year: 1, month: 1 };
  const zid = nextZid(map);
  const zone = { name: name || `${scopeName || "指定の範囲"}の${t.label}`, type: t.id, cells: [...new Set(cells)], color: t.color, zid, startAt: { ...start }, endAt: addMonthsTo(start, months) };
  const cmd = replace(map, `${zone.name}（${t.label}）を記録`, [...list, zone]);
  const periodLabel = ZONE_PERIODS.find((p) => p.months === months).label;
  const command = logEvent
    ? withEvent(map, cmd, { type: "zone-start", title: `${scopeName || "指定の範囲"}で${t.label}が発生`, detail: `${periodLabel}続く / ${zone.cells.length}セル`, date: start, cell: zone.cells[0], states, zoneId: zid })
    : cmd;
  return { command, zid, zone };
}
