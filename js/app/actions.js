// アクション：ユーザー操作の「意味」を実装する層。
// UI（DOM）は、ここの関数を呼ぶだけにする。UI にロジックを書かない。
//   依存: store / viewport / renderer / loader（すべて注入。テストで差し替え可能）

import { planKatakanaBurgs } from "../core/edit/katakana.js";
import { createRandom as createKanaRandom } from "../core/random.js";
import { entityPosition, ENTITY_KINDS } from "../core/query.js";
import { entityOutlineSegments, segmentsBounds } from "../render/edges.js";
import { serializeAzgaar } from "../io/azgaar-writer.js";
import { renderMapToCanvas, renderMapToSvg, canvasToPngBlob, exportFileName, todayString } from "../io/exporter.js";
import { viewToRenderOptions } from "../render/options.js";
import { DEFAULT_ANNOTATIONS } from "../render/layers/annotations.js";
import { buildChronicle, serializeChronicle, chronicleToMarkdown } from "../io/chronicle.js";
import { LAYERS, FILL_KEY, FILL_KINDS, isLayerOn, exclusiveFillPatch, snapshotFills } from "./layers.js";

const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

export const OVERLAYS = ["none", ...FILL_KINDS];
const LAYER_KEYS = new Set(LAYERS.map((l) => l.key));

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
  async function runExport(label, produce, onDone) {
    const { map, fileName } = store.getState();
    if (!map) return;
    store.update((s) => { s.busy = `${label}を作成中…`; s.error = null; });
    await nextPaint();
    try {
      const { blob, name } = await produce(map, fileName);
      download(blob, name);
      onDone?.();
      store.update((s) => { s.busy = null; });
      showNotice(`${name} を書き出しました（${(blob.size / 1024 / 1024).toFixed(1)} MB）`);
    } catch (e) {
      store.update((s) => { s.busy = null; s.error = `${label}に失敗しました: ${e.message}`; });
    }
  }

  const textBlob = (text, type) => new Blob([text], { type });
  const renderOpts = () => viewToRenderOptions(store.getState().view);
  const annotationOpts = () => ({ ...DEFAULT_ANNOTATIONS, ...(store.getState().exportOpts ?? {}) });

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
        // 英語の都市名のカタカナ化は必須の自動処理（切り替えは無い）。1回の操作として Undo で戻せる
        const n = this.katakanaBurgs(file.name);
        if (n) showNotice(`英語名の都市 ${n} 件をカタカナにしました（「元に戻す」で英語名に戻せます）`);
      } catch (e) {
        store.update((s) => { s.busy = null; s.error = e.message; });
      }
    },

    /** 英語名の都市をカタカナにする（地図を開くたびに自動で呼ばれる）。付け替えた件数を返す（Undo 1回で戻る） */
    katakanaBurgs(seedText = "katakana") {
      const map = store.getState().map;
      if (!map) return 0;
      const cmd = planKatakanaBurgs(map, createKanaRandom(`${seedText}:${map.pack.burgs.length}`));
      if (!cmd) return 0;
      store.commit(cmd);
      rerender();
      return cmd.parts.length;
    },

    fit() { viewport.fit(); rerender(); },

    zoomBy(factor) {
      viewport.zoomAt(viewport.screenWidth / 2, viewport.screenHeight / 2, factor);
      renderer.interact();
    },
    zoomAt(sx, sy, factor) { viewport.zoomAt(sx, sy, factor); renderer.interact(); },
    pan(dx, dy) { viewport.pan(dx, dy); renderer.interact(); },

    setView(patch) { store.update((s) => Object.assign(s.view, patch)); rerender(); },
    /** 色分けを1種類だけにする（"none" なら全部消す）。絵を塗る間の切り替えなどに使う */
    setOverlay(kind) { if (OVERLAYS.includes(kind)) this.setView(exclusiveFillPatch(kind === "none" ? null : kind)); },
    /** 色分けの on/off と凡例の種類をまとめて取り出す／戻す */
    getFills() { return snapshotFills(store.getState().view); },
    restoreFills(snap) { if (snap) this.setView({ ...snap }); },
    /** レイヤー（地形・標高・国家・文化・宗教・属州・国境・海岸線・河川・道路・都市・ゾーン・旅の線・名前）を1つ切り替える。独立なので、他は変わらない */
    toggle(name) {
      if (!LAYER_KEYS.has(name)) return;
      const view = store.getState().view;
      const on = !isLayerOn(view, name);
      const patch = { [name]: on };
      // 色分けをオンにしたら、凡例もその種類に切り替える（いま見たいのはそれ）
      const kind = FILL_KINDS.find((k) => FILL_KEY[k] === name);
      if (kind && on) patch.legendKind = kind;
      this.setView(patch);
    },
    /** 凡例に出す色分けの種類を選ぶ（オンの色分けの中から） */
    setLegendKind(kind) { if (FILL_KINDS.includes(kind)) this.setView({ legendKind: kind }); },

    /** 凡例の項目を選んだとき、その場所へ移動する */
    locate(entity) {
      const map = store.getState().map;
      const pos = map && entityPosition(map, entity);
      if (!pos) return;
      viewport.centerOn(pos[0], pos[1], Math.max(viewport.k, viewport.fitK * 3));
      rerender();
    },

    /**
     * 凡例の項目を選んだとき、その実体の外周がちょうど画面に収まるように移動・拡大縮小する。
     * （固定倍率で中心へ寄せるだけだと、大きな国では境界線が画面の外に出てしまい、強調が見えない）
     * 小さな実体は、見失わない程度（全体表示の8倍まで）に拡大する。外周が求まらなければ locate と同じ動き。
     * @returns {boolean} 外周に合わせて動かせたか
     */
    /** 国・州・文化・宗教を選んだとき。ズームや移動はせず、今の地図の状態のまま強調だけする
     *  （強調は ui/highlight.js が行うので、ここでは対象が存在するかだけ返す） */
    focusEntity(kind, entity) {
      const map = store.getState().map;
      return !!(map?.geometry && ENTITY_KINDS[kind] && entity);
    },

    /** ALTERHISTORY 形式で保存（Azgaar 形式の上位互換。Azgaar でも開ける） */
    saveNative() {
      return runExport("保存ファイル", (map, fileName) => {
        map.ext ??= { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
        map.ext.data ??= {};
        map.ext.data.worldTime = { ...map.worldTime };
        return {
          blob: textBlob(serializeAzgaar(map, { native: true, exportedAt: todayString() }), "text/plain"),
          name: exportFileName(map, fileName, "map"),
        };
      }, () => store.markSaved());
    },
    /** Azgaar 互換の .map（ALTERHISTORY の目印・拡張データを含めない） */
    saveAzgaar() {
      return runExport("Azgaar互換ファイル", (map, fileName) => ({
        blob: textBlob(serializeAzgaar(map, { native: false, exportedAt: todayString() }), "text/plain"),
        name: exportFileName(map, fileName, "map", "_azgaar"),
      }));
    },
    /**
     * AI 向けセーブデータ（クロニクル）。Claude 等にアップロードして歴史を構築してもらうための書き出し。
     *   .chronicle.json … 全情報（ID を名前に解決済み・年表・国家別集約・セル単位の完全データ）
     *   .chronicle.md   … 同じ内容の読み物版（AI にも人間にも読みやすい要約）
     * 2 ファイルを 1 回の操作でダウンロードする。
     */
    exportChronicle() {
      return runExport("AI用クロニクル", (map, fileName) => {
        map.ext ??= { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
        const ch = buildChronicle(map, { fileName, exportedAt: todayString() });
        const base = exportFileName(map, fileName, "x").replace(/\.x$/, "");
        // 2 つ目（読み物版）は先にダウンロードを発火し、1 つ目（JSON）を runExport の標準経路で返す
        download(textBlob(chronicleToMarkdown(ch), "text/markdown"), `${base}.chronicle.md`);
        return { blob: textBlob(serializeChronicle(ch), "application/json"), name: `${base}.chronicle.json` };
      });
    },
    exportPng() {
      return runExport("PNG画像", async (map, fileName) => ({
        blob: await canvasToPngBlob(renderMapToCanvas(map, renderOpts(), { scale: PNG_SCALE, createCanvas, annotations: annotationOpts() })),
        name: exportFileName(map, fileName, "png"),
      }));
    },
    exportSvg() {
      return runExport("SVG画像", (map, fileName) => ({
        blob: textBlob(renderMapToSvg(map, renderOpts(), { annotations: annotationOpts() }), "image/svg+xml"),
        name: exportFileName(map, fileName, "svg"),
      }));
    },

    /** 書き出し画像に入れるもの（題名・凡例・スケールバー）の切替 */
    setExportOption(name, on) {
      if (!(name in DEFAULT_ANNOTATIONS)) return;
      store.update((s) => { s.exportOpts = { ...DEFAULT_ANNOTATIONS, ...(s.exportOpts ?? {}), [name]: !!on }; });
    },

    setHover(cellInfo) {
      store.update((s) => { s.hover = cellInfo; });
    },
    dismissMessage() { store.update((s) => { s.error = null; s.warnings = []; s.notice = null; }); },
  };
}
