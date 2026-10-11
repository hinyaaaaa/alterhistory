// ゾーン（疫病・災害の一時表示）の範囲を描く層。期間のあるゾーンは、期間の間だけ出る。書き出し画像にも入る。
import { addCellPath } from "./terrain.js";
import { buildBoundarySegments, strokeSegments } from "../edges.js";
import { zoneColor, zoneActive } from "../../core/edit/zones.js";

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

/**
 * ゾーン: 範囲を半透明で塗り、縁を引く。
 *   ・期間のあるゾーンは、期間の間だけ出す（過ぎたら自動で消える。記録は年表と保存データに残る）
 *   ・focus（ゾーンの id）は、年表で選んでいるゾーン。期間が過ぎて消えていても、選んでいる間は輪郭を赤い線で出す
 */
export function drawZones(ctx, map, vp, { focus = null } = {}) {
  const zones = map.zones ?? [];
  if (!zones.length) return;
  const { cells, vertices } = map.geometry.pack;
  const n = map.pack.cells.biome.length;
  const now = map.worldTime ?? null;
  zones.forEach((z) => {
    if (!z || !Array.isArray(z.cells) || !z.cells.length) return;
    const isFocus = !!focus && z.zid === focus;
    const active = !z.hidden && zoneActive(z, now);
    if (!active && !isFocus) return;
    const color = zoneColor(z);
    if (active) {
      ctx.globalAlpha = isFocus ? 0.55 : 0.42;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const i of z.cells) if (i >= 0 && i < n) addCellPath(ctx, cells, vertices, i);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const segs = zoneEdges(map, z);
    ctx.strokeStyle = isFocus ? "#e5483a" : color;       // 年表で選んだゾーンは、赤い線で強調する
    ctx.lineWidth = (isFocus ? 3.4 : 1.4) / vp.k;
    ctx.lineJoin = "round";
    strokeSegments(ctx, segs);
  });
  ctx.globalAlpha = 1;
}
