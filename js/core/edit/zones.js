// ゾーン：侵攻・反乱・疫病・災害など、「ある範囲で起きている出来事」を表すセルの集まり。
// Azgaar 本家と同じ形式（map.zones = [{ name, type, color, cells:[セル番号], hidden? }]）で保存するので、.map に書き出しても互換。
// 本家が作った zones（color が "url(#hatchN)" の斜線パターン）も、そのまま読み書きできる。表示だけは種類ごとの色で描く。
// ゾーンの識別は配列の添字（本家のデータには安定した番号が無いため）。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand } from "./commands.js";

export const ZONE_TYPES = Object.freeze([
  { id: "Invasion", label: "侵攻", color: "#d6453d" },
  { id: "Rebels", label: "反乱", color: "#e8913a" },
  { id: "Proselytism", label: "布教", color: "#5aa9d6" },
  { id: "Crusade", label: "聖戦", color: "#a3243b" },
  { id: "Disease", label: "疫病", color: "#7cb342" },
  { id: "Disaster", label: "災害", color: "#8d6e63" },
  { id: "Eruption", label: "噴火", color: "#ff5722" },
  { id: "Avalanche", label: "雪崩", color: "#90a4ae" },
  { id: "Fault", label: "断層", color: "#6d4c41" },
  { id: "Flood", label: "洪水", color: "#1e88e5" },
  { id: "Tsunami", label: "津波", color: "#00acc1" },
  { id: "Fire", label: "大火", color: "#ef6c00" },
  { id: "Custom", label: "その他", color: "#ab47bc" },
]);
export const ZONE_TYPE_BY_ID = Object.freeze(Object.fromEntries(ZONE_TYPES.map((t) => [t.id, t])));
export const MAX_ZONES = 300;

/** 表示に使う色。本家の斜線パターン（url(...)）や未設定のときは、種類の色 */
export function zoneColor(zone) {
  if (typeof zone?.color === "string" && /^#[0-9a-f]{3,8}$/i.test(zone.color)) return zone.color;
  return ZONE_TYPE_BY_ID[zone?.type]?.color ?? "#ab47bc";
}
export function zoneLabel(zone) { return ZONE_TYPE_BY_ID[zone?.type]?.label ?? zone?.type ?? "ゾーン"; }

export function listZones(map) { return (map.zones ?? []).map((z, index) => ({ ...z, index })).filter((z) => z && Array.isArray(z.cells)); }

function replace(map, label, after) {
  const before = map.zones ?? [];
  return makeCommand(label, [], [{ apply: (m) => { m.zones = after; }, revert: (m) => { m.zones = before; } }]);
}

export function planAddZone(map, { name, type = "Custom", cells = [] } = {}) {
  const list = map.zones ?? [];
  if (list.length >= MAX_ZONES) throw new Error(`ゾーンは${MAX_ZONES}件までです`);
  const t = ZONE_TYPE_BY_ID[type] ?? ZONE_TYPE_BY_ID.Custom;
  const zone = { name: (name ?? "").trim() || `${t.label}${list.length + 1}`, type: t.id, cells: [...new Set(cells)], color: t.color };
  return { command: replace(map, `ゾーン「${zone.name}」を作成`, [...list, zone]), index: list.length };
}

export function planEditZone(map, index, patch) {
  const list = map.zones ?? [];
  const z = list[index];
  if (!z) throw new Error("存在しないゾーンです");
  const next = { ...z };
  if (patch.name !== undefined) { const n = String(patch.name).trim(); if (!n) throw new Error("ゾーンの名前を入力してください"); next.name = n; }
  if (patch.type !== undefined) {
    if (!ZONE_TYPE_BY_ID[patch.type]) throw new Error("未知のゾーンの種類です");
    next.type = patch.type;
    // 種類を変えたら、色も種類の色に合わせる（色を直接指定した場合はそちらを優先）
    if (patch.color === undefined) next.color = ZONE_TYPE_BY_ID[patch.type].color;
  }
  if (patch.color !== undefined) next.color = String(patch.color);
  if (patch.hidden !== undefined) { if (patch.hidden) next.hidden = true; else delete next.hidden; }
  if (JSON.stringify(next) === JSON.stringify(z)) return null;
  return replace(map, `ゾーン「${next.name}」を編集`, list.map((x, i) => (i === index ? next : x)));
}

export function planRemoveZone(map, index) {
  const list = map.zones ?? [];
  const z = list[index];
  if (!z) throw new Error("存在しないゾーンです");
  return replace(map, `ゾーン「${z.name}」を削除`, list.filter((_, i) => i !== index));
}

/** セルを足す／消す。変化が無ければ null。mode: "add" | "erase" */
export function planPaintZone(map, index, cells, mode = "add") {
  const list = map.zones ?? [];
  const z = list[index];
  if (!z) throw new Error("存在しないゾーンです");
  const n = map.pack.cells.biome.length;
  const valid = cells.filter((c) => Number.isInteger(c) && c >= 0 && c < n);
  const cur = new Set(z.cells);
  let changed = false;
  for (const c of valid) {
    if (mode === "erase") { if (cur.delete(c)) changed = true; }
    else if (!cur.has(c)) { cur.add(c); changed = true; }
  }
  if (!changed) return null;
  const next = { ...z, cells: [...cur] };
  return replace(map, `ゾーン「${z.name}」を${mode === "erase" ? "消す" : "塗る"}`, list.map((x, i) => (i === index ? next : x)));
}

/**
 * 種になるセルから、まとまった範囲を自動で決める（「おまかせ」用）。
 * 種から近い順に、乱数でゆらしながら隣へ広げる。landOnly=true なら陸だけ。
 * @returns {number[]} セル番号（種を含む）
 */
export function growZoneCells(map, seed, size, rnd, { landOnly = true } = {}) {
  const { biome } = map.pack.cells;
  const { c: adj } = map.geometry.pack.cells;
  const p = map.geometry.pack.p;
  const ok = (i) => (landOnly ? biome[i] !== 0 : true);
  if (seed == null || seed < 0 || !ok(seed)) return [];
  const want = Math.max(1, Math.round(size));
  const inSet = new Set([seed]);
  const frontier = new Set(adj[seed].filter(ok));
  const [sx, sy] = p[seed];
  while (inSet.size < want && frontier.size) {
    let best = -1, bestKey = Infinity;
    for (const j of frontier) {
      const key = Math.hypot(p[j][0] - sx, p[j][1] - sy) * (0.75 + 0.5 * rnd.next());
      if (key < bestKey) { bestKey = key; best = j; }
    }
    frontier.delete(best);
    if (inSet.has(best)) continue;
    inSet.add(best);
    for (const j of adj[best]) if (ok(j) && !inSet.has(j)) frontier.add(j);
  }
  return [...inSet];
}
