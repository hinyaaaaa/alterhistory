// 書き出し用の付属物：題名・凡例・スケールバー。
// 画面表示には使わない（画面にはサイドバーの凡例がある）。PNG と SVG の書き出しにだけ焼き込む。
//
// Canvas と SVG 記録コンテキストの両方で動くよう、使う命令を絞っている
// （fillRect / beginPath / moveTo / lineTo / closePath / fill / stroke / fillText / strokeText / measureText）。
// 座標は「地図の画素」（書き出し画像の 1 倍サイズ）。dpr 倍して出力する。
//
// 純粋ロジック：DOM に依存しない。map を変更しない。

import { listEntities, ENTITY_KINDS } from "../../core/query.js";
import { eraAt } from "../../core/edit/eras.js";

const FONT = '"Yu Gothic UI","Meiryo","Hiragino Sans","Noto Sans CJK JP",sans-serif';
const PANEL_BG = "rgba(20,22,28,0.80)";
const PANEL_LINE = "rgba(201,162,75,0.9)";
const TEXT = "#f1ecdc";
const MAX_LEGEND = 14;

export const DEFAULT_ANNOTATIONS = Object.freeze({ title: true, legend: true, scaleBar: true });

/** 縮尺 { unit, perPixel }。無ければ null（1 画素 = perPixel unit） */
export function getScale(map) {
  const d = map?.settings?.options?.units?.distance;
  const perPixel = Number(d?.scale);
  if (!d || !Number.isFinite(perPixel) || perPixel <= 0) return null;
  return { unit: String(d.unit || "km"), perPixel };
}

/** 1・2・5 ×10^n のうち、targetPx 画素に最も近い長さ（実距離）を選ぶ */
export function niceDistance(perPixel, targetPx) {
  const raw = perPixel * targetPx;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  let best = pow, bestErr = Infinity;
  for (const m of [1, 2, 5, 10]) {
    const v = m * pow, err = Math.abs(v - raw);
    if (err < bestErr) { bestErr = err; best = v; }
  }
  return { distance: best, px: best / perPixel };
}

const fmt = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL_LINE; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = PANEL_BG; ctx.fillRect(x, y, w, h);
}

function text(ctx, s, x, y, size, { bold = false, align = "left", color = TEXT } = {}) {
  ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/** 題名（左上）: 地図の名前・年月・時代 */
export function drawTitle(ctx, map, w, u) {
  const name = (map.meta?.name || "").trim();
  const t = map.worldTime;
  const era = t ? eraAt(map, t.year) : null;
  const dateText = t ? `${t.year}年${t.month}月${era ? `（${era.name}）` : ""}` : "";
  if (!name && !dateText) return null;
  const pad = 8 * u, big = 17 * u, small = 12 * u, m = 12 * u;
  ctx.font = `bold ${big}px ${FONT}`;
  const wName = name ? ctx.measureText(name).width : 0;
  ctx.font = `${small}px ${FONT}`;
  const wDate = dateText ? ctx.measureText(dateText).width : 0;
  const bw = Math.max(wName, wDate) + pad * 2;
  const bh = (name ? big : 0) + (dateText ? small : 0) + pad * 2 + (name && dateText ? 3 * u : 0);
  panel(ctx, m, m, bw, bh);
  let y = m + pad;
  if (name) { text(ctx, name, m + pad, y + big / 2, big, { bold: true }); y += big + 3 * u; }
  if (dateText) text(ctx, dateText, m + pad, y + small / 2, small, { color: "#d9c58a" });
  return { x: m, y: m, w: bw, h: bh };
}

/** 凡例（左下）: 今の色分けの実体の一覧。多いときは大きい順に MAX_LEGEND 件 */
export function drawLegend(ctx, map, overlay, h, u) {
  if (!overlay || overlay === "none" || !ENTITY_KINDS[overlay]) return null;
  const all = listEntities(map, overlay);
  if (!all.length) return null;
  const shown = all.slice(0, MAX_LEGEND);
  const rest = all.length - shown.length;
  const title = `凡例：${ENTITY_KINDS[overlay].label}`;
  const row = 15 * u, chip = 10 * u, pad = 8 * u, size = 11.5 * u, m = 12 * u;

  ctx.font = `bold ${12 * u}px ${FONT}`;
  let maxW = ctx.measureText(title).width;
  ctx.font = `${size}px ${FONT}`;
  for (const e of shown) maxW = Math.max(maxW, ctx.measureText(e.name).width + chip + 6 * u);
  if (rest > 0) maxW = Math.max(maxW, ctx.measureText(`ほか ${rest} 件`).width);
  const bw = maxW + pad * 2;
  const bh = pad * 2 + 16 * u + shown.length * row + (rest > 0 ? row : 0);
  const x = m, y = h - m - bh;
  panel(ctx, x, y, bw, bh);
  text(ctx, title, x + pad, y + pad + 6 * u, 12 * u, { bold: true, color: "#e6c877" });
  let cy = y + pad + 16 * u;
  for (const e of shown) {
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x + pad - 1, cy + (row - chip) / 2 - 1, chip + 2, chip + 2);
    ctx.fillStyle = e.color; ctx.fillRect(x + pad, cy + (row - chip) / 2, chip, chip);
    text(ctx, e.name, x + pad + chip + 6 * u, cy + row / 2, size);
    cy += row;
  }
  if (rest > 0) text(ctx, `ほか ${rest} 件`, x + pad, cy + row / 2, size, { color: "#a9a493" });
  return { x, y, w: bw, h: bh };
}

/** スケールバー（右下）。縮尺が無ければ描かず null */
export function drawScaleBar(ctx, map, w, h, u) {
  const sc = getScale(map);
  if (!sc) return null;
  const { distance, px } = niceDistance(sc.perPixel, w * 0.13);
  const segs = 4, segW = px / segs, barH = 5 * u, pad = 8 * u, m = 12 * u;
  const label = `${fmt(distance)} ${sc.unit}`;
  ctx.font = `${11 * u}px ${FONT}`;
  const lw = ctx.measureText(label).width;
  const bw = Math.max(px, lw / 2 + px) + pad * 2 + 4 * u;
  const bh = pad * 2 + barH + 14 * u;
  const x = w - m - bw, y = h - m - bh;
  panel(ctx, x, y, bw, bh);
  const bx = x + pad + 2 * u, by = y + pad + 12 * u;
  ctx.fillStyle = "#000"; ctx.fillRect(bx - 1, by - 1, px + 2, barH + 2);
  for (let i = 0; i < segs; i++) { ctx.fillStyle = i % 2 ? "#222" : "#f1ecdc"; ctx.fillRect(bx + i * segW, by, segW, barH); }
  text(ctx, "0", bx, y + pad + 5 * u, 11 * u, { align: "center" });
  text(ctx, label, bx + px, y + pad + 5 * u, 11 * u, { align: "center" });
  return { x, y, w: bw, h: bh, distance, unit: sc.unit };
}

/**
 * 付属物をまとめて描く。drawScene の後に呼ぶ。
 * @param {object} opts { title, legend, scaleBar } 各 boolean
 * @param {string} overlay 今の色分け
 * @param {number} dpr 出力倍率
 */
export function drawAnnotations(ctx, map, { w, h, dpr = 1, overlay, options = DEFAULT_ANNOTATIONS }) {
  const u = Math.max(0.6, w / 1280); // 地図の大きさに対する文字の比率を一定に保つ
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const done = {};
  if (options.title) done.title = drawTitle(ctx, map, w, u);
  if (options.legend) done.legend = drawLegend(ctx, map, overlay, h, u);
  if (options.scaleBar) done.scaleBar = drawScaleBar(ctx, map, w, h, u);
  ctx.restore();
  return done;
}
