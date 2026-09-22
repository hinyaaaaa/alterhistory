// シーン合成：どの層を、どの順で描くか。
// Canvas 2D コンテキストを受け取るだけの関数なので、ブラウザでも Node（テスト）でも同じコードで動く。
// 状態を変更しない（読むだけ）。

import { drawTerrain } from "./layers/terrain.js";
import { drawPolitics, drawCoast } from "./layers/politics.js";
import { drawRivers, drawRoutes } from "./layers/lines.js";
import { drawBurgs, drawLabels } from "./layers/places.js";

export const DEFAULT_RENDER_OPTIONS = Object.freeze({
  base: "biome",          // "biome" | "height"
  overlay: "state",       // "none" | "state" | "culture" | "religion" | "province"
  coast: true,
  rivers: true,
  routes: { roads: true, trails: true, searoutes: true },
  burgs: true,
  labels: { states: true, burgs: true },
  background: "#2f4a72",
});

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} map       形状(map.geometry)が取り付け済みの MapData
 * @param {object} vp        createViewport の戻り値
 * @param {object} [options] DEFAULT_RENDER_OPTIONS の一部を上書き
 * @param {number} [dpr]     デバイスピクセル比
 */
export function drawScene(ctx, map, vp, options = {}, dpr = 1) {
  const o = { ...DEFAULT_RENDER_OPTIONS, ...options };
  if (!map?.geometry) throw new Error("形状が未構築です（buildGeometry を先に呼んでください）");

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = o.background;
  ctx.fillRect(0, 0, vp.screenWidth * dpr, vp.screenHeight * dpr);

  ctx.save();
  vp.apply(ctx, dpr);
  drawTerrain(ctx, map, vp, o.base);
  if (o.overlay !== "none") drawPolitics(ctx, map, vp, o.overlay);
  if (o.coast) drawCoast(ctx, map, vp);
  if (o.rivers) drawRivers(ctx, map, vp);
  if (o.routes) drawRoutes(ctx, map, vp, o.routes);
  if (o.burgs) drawBurgs(ctx, map, vp);
  if (o.labels) drawLabels(ctx, map, vp, o.labels);
  ctx.restore();
}
