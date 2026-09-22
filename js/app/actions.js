// アクション：ユーザー操作の「意味」を実装する層。
// UI（DOM）は、ここの関数を呼ぶだけにする。UI にロジックを書かない。
//   依存: store / viewport / renderer / loader（すべて注入。テストで差し替え可能）

import { entityPosition } from "../core/query.js";
import { serializeAzgaar } from "../io/azgaar-writer.js";
import { renderMapToCanvas, renderMapToSvg, canvasToPngBlob, exportFileName, todayString } from "../io/exporter.js";
import { viewToRenderOptions } from "../render/options.js";

const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

export const OVERLAYS = ["none", "state", "culture", "religion", "province"];
export const TOGGLES = ["coast", "rivers", "routes", "burgs", "labels"];

const NOTICE_MS = 5000;
const PNG_SCALE = 2;

/**
 * @param deps.download      (blob, fileName) => void   ブラウザのダウンロード
 * @param deps.createCanvas  (w, h) => Canvas            PNG 書き出し用
 */
export function createActions({ store, viewport, renderer, load, Delaunator, download, createCanvas }) {
  const rerender = () => renderer.requestRender();
  let noticeTimer = 0;

  const showNotice = (text) => {
    store.update((s) => { s.notice = text; });
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => store.update((s) => { s.notice = null; }), NOTICE_MS);
  };

  /**
   * 書き出しの共通処理。「処理中」を先に表示し、失敗は画面に出す（黙って失敗しない）。
   * 地図が無いときは何もしない。
   */
  async function runExport(label, produce) {
    const { map, fileName } = store.getState();
    if (!map) return;
    store.update((s) => { s.busy = `${label}を作成中…`; s.error = null; });
    await nextPaint();
    try {
      const { blob, name } = await produce(map, fileName);
      download(blob, name);
      store.update((s) => { s.busy = null; });
      showNotice(`${name} を書き出しました（${(blob.size / 1024 / 1024).toFixed(1)} MB）`);
    } catch (e) {
      store.update((s) => { s.busy = null; s.error = `${label}に失敗しました: ${e.message}`; });
    }
  }

  const textBlob = (text, type) => new Blob([text], { type });
  const renderOpts = () => viewToRenderOptions(store.getState().view);

  return {
    /** ファイルを開く。失敗しても前の地図は残す */
    async openFile(file) {
      store.update((s) => { s.busy = `${file.name} を読み込み中…`; s.error = null; });
      await nextPaint(); // 「読み込み中」を先に表示してから重い処理を始める
      try {
        const { map, warnings } = await load(file, Delaunator);
        const prev = store.getState();
        viewport.setMapSize(map.meta.width || 1280, map.meta.height || 774);
        store.replace({ ...prev, map, fileName: file.name, warnings, error: null, notice: null, busy: null, hover: null });
        viewport.fit();
        rerender();
      } catch (e) {
        store.update((s) => { s.busy = null; s.error = e.message; });
      }
    },

    fit() { viewport.fit(); rerender(); },

    zoomBy(factor) {
      viewport.zoomAt(viewport.screenWidth / 2, viewport.screenHeight / 2, factor);
      renderer.interact();
    },
    zoomAt(sx, sy, factor) { viewport.zoomAt(sx, sy, factor); renderer.interact(); },
    pan(dx, dy) { viewport.pan(dx, dy); renderer.interact(); },

    setView(patch) { store.update((s) => Object.assign(s.view, patch)); rerender(); },
    setOverlay(kind) { if (OVERLAYS.includes(kind)) this.setView({ overlay: kind }); },
    toggle(name) {
      if (!TOGGLES.includes(name)) return;
      this.setView({ [name]: !store.getState().view[name] });
    },
    toggleBase() { this.setView({ base: store.getState().view.base === "biome" ? "height" : "biome" }); },

    /** 凡例の項目を選んだとき、その場所へ移動する */
    locate(entity) {
      const map = store.getState().map;
      const pos = map && entityPosition(map, entity);
      if (!pos) return;
      viewport.centerOn(pos[0], pos[1], Math.max(viewport.k, viewport.fitK * 3));
      rerender();
    },

    /** ALTERHISTORY 形式で保存（Azgaar 形式の上位互換。Azgaar でも開ける） */
    saveNative() {
      return runExport("保存ファイル", (map, fileName) => ({
        blob: textBlob(serializeAzgaar(map, { native: true, exportedAt: todayString() }), "text/plain"),
        name: exportFileName(map, fileName, "map"),
      }));
    },
    /** Azgaar 互換の .map（ALTERHISTORY の目印・拡張データを含めない） */
    saveAzgaar() {
      return runExport("Azgaar互換ファイル", (map, fileName) => ({
        blob: textBlob(serializeAzgaar(map, { native: false, exportedAt: todayString() }), "text/plain"),
        name: exportFileName(map, fileName, "map", "_azgaar"),
      }));
    },
    exportPng() {
      return runExport("PNG画像", async (map, fileName) => ({
        blob: await canvasToPngBlob(renderMapToCanvas(map, renderOpts(), { scale: PNG_SCALE, createCanvas })),
        name: exportFileName(map, fileName, "png"),
      }));
    },
    exportSvg() {
      return runExport("SVG画像", (map, fileName) => ({
        blob: textBlob(renderMapToSvg(map, renderOpts()), "image/svg+xml"),
        name: exportFileName(map, fileName, "svg"),
      }));
    },

    setHover(cellInfo) {
      store.update((s) => { s.hover = cellInfo; });
    },
    dismissMessage() { store.update((s) => { s.error = null; s.warnings = []; s.notice = null; }); },
  };
}
