// マーカー：地図上の点情報（温泉・鉱山・古戦場など）。アイコンと文章を持てる。
//
// 公式 generators/markers-generator.ts の規則:
//   ・id は既存の最大 i + 1（連番でなくても、次の番号は「今の最大+1」）
//   ・削除は配列から取り除くだけ（他の削除済み実体のように removed フラグは付けない）
//   ・名前が無ければ種類から自動で付ける（例: "hot-springs" → "Hot springs"）
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setList, setProps } from "./commands.js";
import { removeLegacyNotesPart } from "./notes.js";

export const DEFAULT_MARKER_TYPES = Object.freeze([
  { type: "volcanoes", icon: "🌋", label: "火山" },
  { type: "hot-springs", icon: "♨️", label: "温泉" },
  { type: "water-sources", icon: "💧", label: "水源" },
  { type: "mines", icon: "⛏️", label: "鉱山" },
  { type: "bridges", icon: "🌉", label: "橋" },
  { type: "lighthouses", icon: "🚨", label: "灯台" },
  { type: "battlefields", icon: "⚔️", label: "古戦場" },
  { type: "ruins", icon: "🏛️", label: "遺跡" },
  { type: "statues", icon: "🗿", label: "像" },
  { type: "caves", icon: "🕳️", label: "洞窟" },
]);

/** "hot-springs" → "Hot springs"（公式 getDefaultMarkerName と同じ規則） */
export function defaultMarkerName(type) {
  if (!type) return "Marker";
  const s = type.replaceAll("-", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const isWater = (map, cell) => map.pack.cells.biome[cell] === 0;

/**
 * マーカーを追加する。
 * @param {{cell:number, type:string, icon:string, name?:string}} opts
 */
export function planAddMarker(map, { cell, type, icon, name }) {
  if (cell < 0 || cell >= map.pack.cells.biome.length) throw new Error("地図の外にはマーカーを置けません");
  const { p } = map.geometry.pack;
  const id = Math.max(-1, ...map.markers.map((m) => m.i)) + 1;
  const marker = { i: id, type: type || "marker", icon: icon || "📍", x: p[cell][0], y: p[cell][1], cell, name: name || defaultMarkerName(type) };
  const parts = [setList((m) => m.markers, (m, v) => { m.markers = v; }, [...map.markers, marker])];
  return { command: makeCommand("マーカーを追加", ["places"], parts), id };
}

/** マーカーを移動する（最寄りのセルに吸着させる） */
export function planMoveMarker(map, id, cell) {
  const marker = map.markers.find((m) => m.i === id);
  if (!marker) throw new Error("そのマーカーは存在しません");
  if (cell < 0 || cell >= map.pack.cells.biome.length) throw new Error("地図の外には移動できません");
  if (marker.cell === cell) return null;
  const { p } = map.geometry.pack;
  return makeCommand("マーカーを移動", ["places"], [setProps(marker, { cell, x: p[cell][0], y: p[cell][1] })]);
}

/** マーカーの見た目（種類・アイコン・名前）を変える */
export function planEditMarker(map, id, patch) {
  const marker = map.markers.find((m) => m.i === id);
  if (!marker) throw new Error("そのマーカーは存在しません");
  const next = {};
  if (patch.type !== undefined && patch.type !== marker.type) next.type = patch.type;
  if (patch.icon !== undefined && patch.icon !== marker.icon) next.icon = patch.icon;
  if (patch.name !== undefined && patch.name !== marker.name) next.name = patch.name || defaultMarkerName(patch.type ?? marker.type);
  if (!Object.keys(next).length) return null;
  return makeCommand("マーカーを編集", ["places"], [setProps(marker, next)]);
}

/** マーカーを削除する（文章も一緒に消える） */
export function planRemoveMarker(map, id) {
  const marker = map.markers.find((m) => m.i === id);
  if (!marker) throw new Error("そのマーカーは存在しません");
  const parts = [setList((m) => m.markers, (m, v) => { m.markers = v; }, map.markers.filter((mk) => mk.i !== id))];
  const notePart = removeLegacyNotesPart(map, "marker", id);
  if (notePart) parts.push(notePart);
  return makeCommand("マーカーを削除", ["places"], parts);
}
