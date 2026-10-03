// 旅（ジャーニー）の保存と編集。ALTERHISTORY の拡張データ ext.data.journeys に保存する。
//   journeys: [{ id, name, type, color, legs: [{ transport, from, to, path, distancePx, stayHours? }] }]
// from / to / path はセル番号。距離・所要時間は保存せず、毎回 core/sim/travel.js で計算する（縮尺や手段の速度を変えても追従）。
//
// Azgaar 本家の旅（L52）とは別物。本家の旅の行は、読み込んでも解釈せず、そのまま書き出しに戻す（失われない）。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand } from "./commands.js";
import { ensureExt } from "./ext.js";
import { TRANSPORT_BY_ID, findPath } from "../sim/travel.js";

export const MAX_JOURNEYS = 200;
const COLORS = ["#e4572e", "#29b6a6", "#f3a712", "#7e57c2", "#43a047", "#d81b60", "#1e88e5", "#8d6e63"];

export function listJourneys(map) { return map.ext?.data?.journeys ?? []; }
function writeJourneys(m, list) { const ext = ensureExt(m); ext.data.journeys = list; if (!list.length) delete ext.data.journeys; }
const nextId = (map) => { const l = listJourneys(map); return l.length ? Math.max(...l.map((j) => j.id)) + 1 : 1; };

/** 旅の一覧を丸ごと差し替えるコマンド（要素数が変わる追加・削除と、区間の変更に共通） */
function replaceCommand(map, label, after) {
  const before = listJourneys(map);
  return makeCommand(label, [], [{ apply: (m) => writeJourneys(m, after), revert: (m) => writeJourneys(m, before) }]);
}

/** 空の旅を作る */
export function planAddJourney(map, { name, type = "旅" } = {}) {
  const list = listJourneys(map);
  if (list.length >= MAX_JOURNEYS) throw new Error(`旅は${MAX_JOURNEYS}件までです`);
  const id = nextId(map);
  const j = { id, name: (name ?? "").trim() || `旅${id}`, type: (type ?? "").trim() || "旅", color: COLORS[(id - 1) % COLORS.length], legs: [] };
  return { command: replaceCommand(map, `旅「${j.name}」を作成`, [...list, j]), id };
}

export function planEditJourney(map, id, patch) {
  const list = listJourneys(map);
  const j = list.find((x) => x.id === id);
  if (!j) throw new Error("存在しない旅です");
  const next = { ...j };
  if (patch.name !== undefined) { const n = String(patch.name).trim(); if (!n) throw new Error("旅の名前を入力してください"); next.name = n; }
  if (patch.type !== undefined) next.type = String(patch.type).trim() || "旅";
  if (patch.color !== undefined) next.color = String(patch.color);
  if (JSON.stringify(next) === JSON.stringify(j)) return null;
  return replaceCommand(map, `旅「${next.name}」を編集`, list.map((x) => (x.id === id ? next : x)));
}

export function planRemoveJourney(map, id) {
  const list = listJourneys(map);
  const j = list.find((x) => x.id === id);
  if (!j) throw new Error("存在しない旅です");
  return replaceCommand(map, `旅「${j.name}」を削除`, list.filter((x) => x.id !== id));
}

/**
 * 区間を末尾に足す。from を省くと、前の区間の終点から始まる。
 * @returns コマンド。経路が見つからないときは例外（理由つき）
 */
export function planAddLeg(map, journeyId, { transport, from, to, stayHours }) {
  const list = listJourneys(map);
  const j = list.find((x) => x.id === journeyId);
  if (!j) throw new Error("存在しない旅です");
  const t = TRANSPORT_BY_ID[transport];
  if (!t) throw new Error("未知の移動手段です");
  const start = from ?? j.legs.at(-1)?.to;
  if (start == null) throw new Error("出発点がありません");
  const end = t.domain === "stay" ? start : to;
  const r = findPath(map, start, end, t);
  if (!r.ok) throw new Error(r.reason);
  const leg = { transport, from: start, to: end, path: r.path, distancePx: Math.round(r.distancePx * 100) / 100 };
  if (t.domain === "stay") leg.stayHours = Math.max(1, Math.round(Number(stayHours) || 24));
  const next = { ...j, legs: [...j.legs, leg] };
  return replaceCommand(map, `旅「${j.name}」に区間を追加`, list.map((x) => (x.id === journeyId ? next : x)));
}

/** 区間を1つ消す（後ろの区間の出発点は、そのままにする＝つながりが切れるときは呼び出し側が警告） */
export function planRemoveLeg(map, journeyId, index) {
  const list = listJourneys(map);
  const j = list.find((x) => x.id === journeyId);
  if (!j || !j.legs[index]) throw new Error("存在しない区間です");
  const next = { ...j, legs: j.legs.filter((_, i) => i !== index) };
  return replaceCommand(map, `旅「${j.name}」の区間を削除`, list.map((x) => (x.id === journeyId ? next : x)));
}

/** 区間の移動手段を変えて、経路を引き直す */
export function planChangeLegTransport(map, journeyId, index, transport) {
  const list = listJourneys(map);
  const j = list.find((x) => x.id === journeyId);
  const leg = j?.legs[index];
  if (!leg) throw new Error("存在しない区間です");
  const t = TRANSPORT_BY_ID[transport];
  if (!t) throw new Error("未知の移動手段です");
  if (leg.transport === transport) return null;
  const end = t.domain === "stay" ? leg.from : leg.to;
  const r = findPath(map, leg.from, end, t);
  if (!r.ok) throw new Error(r.reason);
  const nl = { ...leg, transport, to: end, path: r.path, distancePx: Math.round(r.distancePx * 100) / 100 };
  if (t.domain === "stay") nl.stayHours = leg.stayHours ?? 24; else delete nl.stayHours;
  const next = { ...j, legs: j.legs.map((l, i) => (i === index ? nl : l)) };
  return replaceCommand(map, `旅「${j.name}」の移動手段を変更`, list.map((x) => (x.id === journeyId ? next : x)));
}
