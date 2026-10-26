// シーン合成：どの層を、どの順で描くか。
// Canvas 2D コンテキストを受け取るだけの関数なので、ブラウザでも Node（テスト）でも同じコードで動く。
// 状態を変更しない（読むだけ）。

import { drawTerrain } from "./layers/terrain.js";
import { drawPolitics, drawCoast } from "./layers/politics.js";
import { drawRivers, drawRoutes } from "./layers/lines.js";
import { drawBurgs, drawLabels } from "./layers/places.js";
import { drawTradeLines } from "./layers/trade-lines.js";
import { drawZones } from "./layers/zones.js";
import { drawGroups } from "./layers/groups.js";
import { warpContext } from "./warp-ctx.js";

export const DEFAULT_RENDER_OPTIONS = Object.freeze({
  terrain: "biome",       // "biome" | "height" | "both" | "none"（旧オプション base も受け付ける）
  fills: null,            // 色分けの種類の配列（描く順）。null のときは旧オプション overlay（1種類）を使う
  borders: true,          // 国家の色分けを消していても国境だけ引く
  coast: true,
  rivers: true,
  routes: { roads: true, trails: true, searoutes: true },
  burgs: true,
  zones: false,           // ゾーン（侵攻・疫病など）。画面では既定で表示する（options.js）
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

  // 球面世界は、経度の継ぎ目の外側の繰り返し（n = -1, 0, 1）ごとに描く。各回は [0, W) の帯に切り取る（二重塗りを防ぐ）。
  //   描画は sim 座標のまま行い、y だけを warpContext が円筒図法へ変える。球面世界でなければ 1 回だけ（従来どおり）。
  //   世界の一部しか画面にかからない回（拡大・継ぎ目の外側の細い繰り返し）は、地形・境界が見える所だけを描くので軽い。
  for (const n of vp.copyOffsets()) drawCopy(ctx, map, vp.shifted(n), o, options, dpr);
}

function drawCopy(ctx, map, v, o, options, dpr) {
  ctx.save();
  v.apply(ctx, dpr);
  if (v.proj) {
    // 帯に切り取る。両端を少し（0.6 sim 画素）はみ出させて、継ぎ目に細い線が出ないようにする（SVG など clip が無い出力では、書き出しの枠が切り取る）
    if (typeof ctx.clip === "function") { ctx.beginPath(); ctx.rect(-0.6, v.proj.top, v.mapWidth + 1.2, v.proj.totalHeight); ctx.clip(); }
    fillPolarBands(ctx, map, v);
  }
  const c = warpContext(ctx, v);
  drawLayers(c, map, v, o, options);
  ctx.restore();
}

/** 極域バンド（緯度 ±80° の外）の下地。極に近いセルのうち最も多いバイオームの色で塗る（セルの描画が届かない端の隙間を埋める） */
const bandCache = new WeakMap();
function polarColors(map) {
  const stamp = `${map.rev?.terrain ?? 0}`, hit = bandCache.get(map.geometry);
  if (hit && hit.stamp === stamp) return hit.colors;
  const P = map.geometry.pack.p, biome = map.pack.cells.biome, H = map.meta.height, lim = (10 / 180) * H; // 緯度 80° より極側（sim の y）
  const tally = [new Map(), new Map()];
  for (let i = 0; i < P.length; i++) { const y = P[i][1], side = y < lim ? 0 : y > H - lim ? 1 : -1; if (side < 0) continue; const m = tally[side]; m.set(biome[i], (m.get(biome[i]) ?? 0) + 1); }
  const colors = tally.map((m) => { let best = 0, bn = -1; for (const [b, n] of m) if (n > bn) { bn = n; best = b; } return bn < 0 ? null : best === 0 ? "#5a82ad" : (map.biomesData[best]?.color ?? null); }); // 海は地形層の「外洋」と同じ色
  bandCache.set(map.geometry, { stamp, colors }); return colors;
}
function fillPolarBands(ctx, map, v) {
  const [north, south] = polarColors(map), pr = v.proj;
  if (north) { ctx.fillStyle = north; ctx.fillRect(-1, pr.top, v.mapWidth + 2, -pr.top + 0.5); }
  if (south) { ctx.fillStyle = south; ctx.fillRect(-1, pr.height - 0.5, v.mapWidth + 2, pr.band + 0.5); }
}

function drawLayers(ctx, map, vp, o, options) {
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
  if (o.zones) drawZones(ctx, map, vp, { focus: o.zoneFocus ?? null });
  if (o.tradeLines) drawTradeLines(ctx, vp, o.tradeLines);
  if (o.burgs) drawBurgs(ctx, map, vp, { auto: o.labels?.burgs === "auto" });
  if (o.labels) drawLabels(ctx, map, vp, o.labels);
  if (o.groups?.length) drawGroups(ctx, map, vp, o.groups); // 初期集団の印（歴史が始まる前）
}
