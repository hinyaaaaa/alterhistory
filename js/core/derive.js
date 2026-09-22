// 派生データの構築：保存されていない情報（セル形状）を、保存された情報から作る。
//
// 純粋ロジック層：DOM に依存しない。Delaunator は引数で受け取る。

import { buildVoronoi, rebuildPack, applyVertexOverrides } from "./geometry.js";

export class GeometryError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "GeometryError";
    this.detail = detail;
  }
}

/**
 * MapData の grid からセル形状を再構築し、map.geometry に取り付ける。
 *
 * 再構築したセル数が、保存済みの属性配列の長さと一致しなければエラーにする。
 * 一致しないまま描画すると、国家・文化などの色が別のセルに塗られ、
 * エラーも出ずに「間違った地図」が表示されてしまうため。
 *
 * @returns 取り付けた geometry（副作用: map.geometry を設定）
 */
export function buildGeometry(map, Delaunator) {
  const g = map.grid;
  if (!g.points.length || !g.boundary.length) {
    throw new GeometryError("gridに点または境界が無いため、セル形状を作れません");
  }
  if (g.h.length !== g.points.length || g.t.length !== g.points.length || g.f.length !== g.points.length) {
    throw new GeometryError("gridの高さ・海岸距離・地形IDの長さが点の数と一致しません", {
      points: g.points.length, h: g.h.length, t: g.t.length, f: g.f.length,
    });
  }

  const gridVoronoi = buildVoronoi(g.points, g.boundary, Delaunator);
  const pack = rebuildPack(
    { points: g.points, boundary: g.boundary, spacing: g.spacing, features: g.features, h: g.h, f: g.f, t: g.t },
    gridVoronoi,
    Delaunator
  );

  const saved = map.pack.cells.state.length || map.pack.cells.biome.length;
  if (saved && pack.p.length !== saved) {
    throw new GeometryError(
      `再構築したセル数(${pack.p.length})が保存済みのセル数(${saved})と一致しません。` +
      "このファイルは未対応の生成方式か、破損している可能性があります",
      { rebuilt: pack.p.length, saved }
    );
  }

  // 手で動かされた頂点を重ねる（何件適用でき、何件できなかったかを記録する）
  const overrideReport = applyVertexOverrides(pack.vertices, map.graphOverride);

  map.geometry = { gridVoronoi, pack, overrideReport };
  return map.geometry;
}
