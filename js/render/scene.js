// シーン合成：どの層を、どの順で描くか。
// Canvas 2D コンテキストを受け取るだけの関数なので、ブラウザでも Node（テスト）でも同じコードで動く。
// 状態を変更しない（読むだけ）。

import { drawTerrain } from "./layers/terrain.js";
import { drawPolitics, drawCoast } from "./layers/politics.js";
import { drawRivers, drawRoutes } from "./layers/lines.js";
import { drawBurgs, drawLabels } from "./layers/places.js";
import { drawTradeLines } from "./layers/trade-lines.js";
import { drawZones, drawJourneys } from "./layers/journeys-zones.js";

export const DEFAULT_RENDER_OPTIONS = Object.freeze({
  terrain: "biome",       // "biome" | "height" | "both" | "none"（旧オプション base も受け付ける）
  fills: null,            // 色分けの種類の配列（描く順）。null のときは旧オプション overlay（1種類）を使う
  borders: true,          // 国家の色分けを消していても国境だけ引く
  coast: true,
  rivers: true,
  routes: { roads: true, trails: true, searoutes: true },
  burgs: true,
  zones: false,           // ゾーン（侵攻・疫病など）。画面では既定で表示する（options.js）
  journeys: false,        // 旅の線。同上
  labels: { states: true, burgs: "auto" },
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
  // 旧オプション（base / overlay）との互換: 古い形で渡されても動く（overlay 省略時は国家のみ）
  const terrain = options.terrain ?? (options.base === "height" ? "height" : "biome");
  const fills = Array.isArray(options.fills) ? options.fills
    : options.overlay === undefined ? ["state"]
    : options.overlay === "none" ? [] : [options.overlay];
  drawTerrain(ctx, map, vp, terrain);
  // 色分けは重ねて描く。2つ以上のときは下の層が見えるよう、少し薄くする
  const alpha = fills.length > 1 ? 0.4 : 0.55;
  for (const kind of fills) {
    // 文化・宗教の破線の境界は、単独のときだけ引く（重ねると線が混ざって読めなくなる）
    drawPolitics(ctx, map, vp, kind, { alpha, lines: kind === "state" || kind === "province" || fills.length === 1 });
  }
  // 国家の色分けが無くても、国境だけは引ける（Azgaar の「境界」レイヤー）
  if (o.borders && !fills.includes("state")) drawPolitics(ctx, map, vp, "state", { fill: false });
  if (o.coast) drawCoast(ctx, map, vp);
  if (o.rivers) drawRivers(ctx, map, vp);
  if (o.routes) drawRoutes(ctx, map, vp, o.routes);
  if (o.zones) drawZones(ctx, map, vp, { selected: o.zoneSelected ?? null });
  if (o.tradeLines) drawTradeLines(ctx, vp, o.tradeLines);
  if (o.journeys) drawJourneys(ctx, map, vp, { selected: o.journeySelected ?? null });
  if (o.burgs) drawBurgs(ctx, map, vp, { auto: o.labels?.burgs === "auto" });
  if (o.labels) drawLabels(ctx, map, vp, o.labels);
  ctx.restore();
}
