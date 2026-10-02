// 旅の線とゾーンの範囲を描く層。どちらも「地図に重ねる情報」で、書き出し画像にも入る。
import { addCellPath } from "./terrain.js";
import { buildBoundarySegments, strokeSegments } from "../edges.js";
import { zoneColor } from "../../core/edit/zones.js";
import { listJourneys } from "../../core/edit/journeys.js";

/** 縁の計算結果。ゾーンの編集は別オブジェクトに差し替える（コマンド）ので、オブジェクトの同一性で十分 */
const edgeCache = new WeakMap();
function zoneEdges(map, z) {
  const hit = edgeCache.get(z);
  if (hit && hit.geometry === map.geometry) return hit.segs;
  const n = map.pack.cells.biome.length;
  const inside = new Uint8Array(n);
  for (const i of z.cells) if (i >= 0 && i < n) inside[i] = 1;
  const segs = buildBoundarySegments(map.geometry, inside, () => true);
  edgeCache.set(z, { geometry: map.geometry, segs });
  return segs;
}

/** ゾーン: 範囲を半透明で塗り、縁を引く。selected は縁を太く */
export function drawZones(ctx, map, vp, { selected = null } = {}) {
  const zones = map.zones ?? [];
  if (!zones.length) return;
  const { cells, vertices } = map.geometry.pack;
  const n = map.pack.cells.biome.length;
  zones.forEach((z, index) => {
    if (!z || z.hidden || !Array.isArray(z.cells) || !z.cells.length) return;
    const color = zoneColor(z);
    ctx.globalAlpha = index === selected ? 0.6 : 0.42;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const i of z.cells) if (i >= 0 && i < n) addCellPath(ctx, cells, vertices, i);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 縁取り: ゾーン内か外かが変わる辺だけ
    const segs = zoneEdges(map, z);
    ctx.strokeStyle = color;
    ctx.lineWidth = (index === selected ? 2.6 : 1.4) / vp.k;
    ctx.lineJoin = "round";
    strokeSegments(ctx, segs);
  });
  ctx.globalAlpha = 1;
}

/** 旅: 区間ごとの経路を、旅の色で描く。陸は実線、水は破線、空は点線、滞在は丸。選択中は太く */
export function drawJourneys(ctx, map, vp, { selected = null } = {}) {
  const journeys = listJourneys(map);
  if (!journeys.length) return;
  const p = map.geometry.pack.p;
  const k = vp.k;
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const j of journeys) {
    const sel = j.id === selected;
    const w = (sel ? 3.2 : 2) / k;
    for (const leg of j.legs ?? []) {
      const pts = (leg.path ?? []).map((c) => p[c]).filter(Boolean);
      if (leg.transport === "stay") {
        if (pts[0]) { ctx.fillStyle = j.color; ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 4 / k, 0, Math.PI * 2); ctx.fill(); }
        continue;
      }
      if (pts.length < 2) continue;
      const dash = leg.transport === "air" ? [1, 5] : leg.transport === "sail" || leg.transport === "galley" ? [6, 4] : [];
      for (const [style, width] of [["rgba(10,12,16,0.7)", w + 2 / k], [j.color, w]]) {
        ctx.strokeStyle = style; ctx.lineWidth = width;
        ctx.setLineDash(dash.map((d) => d / k));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let t = 1; t < pts.length; t++) ctx.lineTo(pts[t][0], pts[t][1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // 出発点（白丸）と到着点（旗代わりの塗り丸）
    const first = j.legs?.[0], last = j.legs?.at(-1);
    const a = first && p[first.from], z = last && p[last.to];
    if (a) { ctx.fillStyle = "#fff"; ctx.strokeStyle = j.color; ctx.lineWidth = 2 / k; ctx.beginPath(); ctx.arc(a[0], a[1], 4.2 / k, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (z) { ctx.fillStyle = j.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6 / k; ctx.beginPath(); ctx.arc(z[0], z[1], 4.6 / k, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }
  ctx.restore();
}
