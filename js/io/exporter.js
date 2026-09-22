// 書き出し：地図全体を PNG / SVG にする。
//
// ・画面のズーム状態に関係なく、常に地図全体を出力する
// ・表示設定（色分け・河川など）は、今の画面と同じにする
// ・PNG は高解像度（scale 倍）で出力する。文字や線の太さは、拡大しても地図に対する比率が変わらない
//
// 純粋ロジック：Canvas は createCanvas で受け取る（ブラウザでも Node でも動く）。

import { createViewport } from "../render/viewport.js";
import { drawScene } from "../render/scene.js";
import { createSvgContext } from "../render/svg-context.js";

/** 出力用のビューポート: 地図全体を等倍(k=1)で収める */
function wholeMapViewport(map) {
  const w = map.meta.width || 1280;
  const h = map.meta.height || 774;
  const vp = createViewport(w, h);
  vp.resize(w, h);
  vp.fit(0);
  return { vp, w, h };
}

/**
 * @param {number} scale  解像度の倍率（既定 2）
 * @param {(w:number,h:number)=>any} createCanvas
 * @returns Canvas（呼び出し側が PNG に変換する）
 */
export function renderMapToCanvas(map, renderOptions, { scale = 2, createCanvas }) {
  const { vp, w, h } = wholeMapViewport(map);
  const canvas = createCanvas(Math.round(w * scale), Math.round(h * scale));
  drawScene(canvas.getContext("2d"), map, vp, renderOptions, scale);
  return canvas;
}

/** @returns {string} SVG 文書 */
export function renderMapToSvg(map, renderOptions) {
  const { vp, w, h } = wholeMapViewport(map);
  const ctx = createSvgContext(w, h);
  drawScene(ctx, map, vp, renderOptions, 1);
  return ctx.toString();
}

/** ブラウザの Canvas → PNG の Blob */
export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") { reject(new Error("この環境では PNG を作れません")); return; }
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG の作成に失敗しました（画像が大きすぎる可能性があります）"))), "image/png");
  });
}

/** ファイル名に使えない文字を除く */
export function sanitizeFileName(name) {
  const s = String(name ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return s.slice(0, 80);
}

/** 書き出しファイル名。地図の名前 → 開いたファイル名 → "map" の順で決める */
export function exportFileName(map, openedFileName, ext, suffix = "") {
  const fromFile = String(openedFileName ?? "").replace(/\.gz$/i, "").replace(/\.(map|png|svg)$/i, "");
  const base = sanitizeFileName(map?.meta?.name) || sanitizeFileName(fromFile) || "map";
  return `${base}${suffix}.${ext}`;
}

/** ヘッダーの日付形式（Azgaar と同じ YYYY-M-D） */
export function todayString(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
