// アクション：ユーザー操作の「意味」を実装する層。
// UI（DOM）は、ここの関数を呼ぶだけにする。UI にロジックを書かない。
//   依存: store / viewport / renderer / loader（すべて注入。テストで差し替え可能）

import { planKatakanaBurgs } from "../core/edit/katakana.js";
import { createRandom as createKanaRandom } from "../core/random.js";
import { entityPosition, ENTITY_KINDS } from "../core/query.js";
import { entityOutlineSegments, segmentsBounds } from "../render/edges.js";
import { loadMapFile, saveMapParts, AHMAP_EXT } from "../io/ahmap-file.js";
import { normalizeWorldSpec } from "../core/world/spec.js";
import { worldToMap } from "../core/world-bridge.js";
import { createGroupActions } from "./group-actions.js";
import { renderMapToCanvas, renderMapToSvg, canvasToPngBlob, exportFileName, todayString } from "../io/exporter.js";
import { viewToRenderOptions } from "../render/options.js";
import { DEFAULT_ANNOTATIONS } from "../render/layers/annotations.js";
import { buildChronicle, chronicleToMarkdown } from "../io/chronicle.js";
import { LAYERS, FILL_KEY, FILL_KINDS, isLayerOn, exclusiveFillPatch, snapshotFills } from "./layers.js";

// 「読み込み中」を先に描いてから重い処理を始める。タブが裏に回る・ウィンドウが隠れる・省電力で rAF が止まると来ないので、
// 一定時間（150ms）で必ず先へ進める（v5.2: Edge で生成後に「地図を準備中…」から進まないことがあった）
const nextPaint = () => new Promise((resolve) => { let done = false; const go = () => { if (!done) { done = true; resolve(); } }; if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 150); });

/** 地図を採用してから、その地図の初回の描画が終わるまでの「処理中」表示（v5.3.1: 採用しただけで処理中を消さない） */
const RENDER_BUSY = "地図を描画中…";

export const OVERLAYS = ["none", ...FILL_KINDS];
const LAYER_KEYS = new Set(LAYERS.map((l) => l.key));

const NOTICE_MS = 5000;
const PNG_SCALE = 2;

/**
 * @param deps.worldService  createWorldService() の戻り値（世界の生成。Worker で動く）
 * @param deps.download      (blob, fileName) => void   ブラウザのダウンロード
 * @param deps.createCanvas  (w, h) => Canvas            PNG 書き出し用
 */
export function createActions({ store, viewport, renderer, worldService, download, createCanvas, appVersion = "" }) {
  const rerender = () => renderer.requestRender();
  let noticeTimer = 0, genToken = 0, adoptSeq = 0;

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
    /** ファイル（.ahmap）を開く。失敗しても前の地図は残す。Azgaar の .map・旧 .ahmap は読み込まない */
    async openFile(file) {
      store.update((s) => { s.busy = `${file.name} を読み込み中…`; s.error = null; });
      await nextPaint(); // 「読み込み中」を先に表示してから重い処理を始める
      try {
        const { map, warnings } = await loadMapFile(file);
        store.update((s) => { s.busy = RENDER_BUSY; });
        await nextPaint(); // 「地図を描画中」を先に表示してから、重い描画を始める
        const rendered = await this.adoptMap(map, file.name, warnings);
        if (!rendered.ok) return; // 描画の失敗は adoptMap が画面（error）に出している
        const n = this.katakanaBurgs(file.name);
        if (n) showNotice(`英語名の都市 ${n} 件をカタカナにしました（「元に戻す」で英語名に戻せます）`);
      } catch (e) {
        store.update((s) => { s.busy = null; s.error = e.message; });
      }
    },

    /**
     * 作った・開いた地図を、画面の地図として採用する。
     * 戻り値は約束（Promise）で、その地図の初回の描画（タイルを描いて貼る）が終わったときに解決する:
     *   { ok: true, adoptMs, ...描画の内訳（setupMs・sceneMs・tileMs・blitMs・profile・presented） } / { ok: false, error }
     * 「処理中」は、データを採用した時点ではなく、描画が終わった時点で消す（描画中も処理中と分かるようにする）。
     * 描画の失敗は、成功扱いにせず、画面の error に出す。
     */
    adoptMap(map, fileName, warnings = []) {
      const t0 = performance.now(), my = ++adoptSeq;
      const prev = store.getState();
      viewport.setMapSize(map.meta.width || 2048, map.meta.height || 1024);
      const ticket = renderer.requestRender(); // 予約するだけ（描画は後続のフレーム）。完了は ticket で追う
      const tracked = typeof ticket?.then === "function";
      store.replace({ ...prev, map, fileName, warnings, error: null, notice: null, busy: tracked ? RENDER_BUSY : null, hover: null, groups: { selected: map.world?.entities?.start?.groupId ?? null, variant: 0 } });
      viewport.fit();
      const adoptMs = performance.now() - t0;
      if (!tracked) return Promise.resolve({ ok: true, adoptMs }); // 描画の完了を追えない描画器（テスト用の代役）
      const clear = (patch) => { if (my === adoptSeq) store.update((s) => { if (s.busy === RENDER_BUSY) s.busy = null; patch?.(s); }); };
      return ticket.then(
        (r) => { clear(); return { ok: true, adoptMs, ...r }; },
        (e) => { clear((s) => { s.error = `地図の描画に失敗しました: ${e.message}`; }); return { ok: false, error: e.message }; },
      );
    },

    /**
     * 新しい世界を作る（地図づくりは、国家・外交・戦争と同じ、このアプリの 1 つの機能）。
     * 生成 → 地図として採用 → 初期集団を選ぶ → 歴史が始まる、の流れの最初の段。
     */
    async newWorld(specInput) {
      const { spec, errors } = normalizeWorldSpec(specInput);
      if (errors.length) { store.update((s) => { s.error = "世界の設定が不正です: " + errors.join(" / "); }); return { ok: false, errors }; }
      const my = ++genToken, T0 = performance.now(), el = () => `${Math.round((performance.now() - T0) / 1000)}秒`, stages = [];
      store.update((s) => { s.busy = "世界を生成中…"; s.error = null; });
      try {
        // 経過時間を、待っている間も表示する（遅い端末で、止まっているのか進んでいるのかが分かる）。段階ごとの所要時間は console.info と最後の通知に残す
        let stageT = T0, stageName = "開始";
        const world = await worldService.generate(spec, { onProgress: (p) => { if (my !== genToken) return; const now = performance.now(); stages.push([stageName, now - stageT]); stageT = now; stageName = p.label ?? p.stage; store.update((s) => { s.busy = `世界を生成中: ${stageName}（${el()}経過）`; }); } });
        if (my !== genToken) return { ok: false, cancelled: true };
        const tGen = performance.now() - T0;
        world.entities.start = null;
        store.update((s) => { s.busy = `地図を準備中…（${el()}経過）`; });
        await nextPaint();
        const tMap0 = performance.now(), map = worldToMap(world), tMap = performance.now() - tMap0;
        store.update((s) => { s.busy = RENDER_BUSY; });
        await nextPaint(); // 「地図を描画中」を先に表示してから、重い描画を始める
        const rendered = await this.adoptMap(map, `${world.spec.worldSeed}.${AHMAP_EXT}`, []);
        if (my !== genToken) return { ok: false, cancelled: true };
        if (!rendered.ok) return { ok: false, error: rendered.error }; // 描画の失敗を成功扱いにしない（error は adoptMap が画面に出している）
        const sec = (ms) => (ms / 1000).toFixed(1), g = world.generation, total = performance.now() - T0;
        // 世界生成・地図変換・採用・初回の描画（タイルの描画・シーンの描画・貼り付け）を、別々の項目で出す（描画の完了は実際に描き終えた時点）
        const ms = (x) => Math.round(x ?? 0);
        console.info(`[世界生成] 合計 ${sec(total)}秒（生成 ${sec(tGen)}・地図化 ${sec(tMap)}・採用 ${sec(rendered.adoptMs)}・描画完了 ${sec(rendered.tileMs + rendered.blitMs)}）`,
          { 生成ms: ms(tGen), 地図化ms: ms(tMap), 採用ms: ms(rendered.adoptMs), タイル描画ms: ms(rendered.tileMs), シーン描画ms: ms(rendered.sceneMs), 貼り付けms: ms(rendered.blitMs), 準備ms: ms(rendered.setupMs), 層別: rendered.profile?.ms, 件数: rendered.profile?.counts },
          stages.filter(([, st]) => st >= 50).map(([n, st]) => `${n} ${sec(st)}秒`).join(" / "));
        rendered.presented?.then((pm) => { if (pm != null) console.info(`[世界生成] 描画の貼り付け後、画面に表示されるまで ${ms(pm)} ms`); });
        const timing = `（合計 ${sec(total)}秒: 生成 ${sec(tGen)}・地図化 ${sec(tMap)}・描画 ${sec(rendered.tileMs + rendered.blitMs)}）`;
        showNotice((g?.rejected?.length ? `統計の許容帯に入るまで ${g.attempts} 回作り直しました（破棄したシード: ${g.rejected.map((r) => r.seed).join("、")}）。使ったシード: ${g.seedUsed}` : "世界ができました。次は、歴史を始める初期集団を選びます") + timing);
        return { ok: true, map };
      } catch (e) {
        if (e.name === "Cancelled") { store.update((s) => { s.busy = null; }); return { ok: false, cancelled: true }; }
        store.update((s) => { s.busy = null; s.error = `世界の生成に失敗しました: ${e.message}`; });
        return { ok: false, error: e.message };
      }
    },
    cancelWorldGeneration() { genToken++; worldService.cancel(); store.update((s) => { s.busy = null; }); },

    ...createGroupActions({ store, rerender, showNotice }),

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

    /** .ahmap（v2）で保存する。世界の地理は正本のチャンク、国家運営層の状態は拡張チャンクに入る */
    saveNative() {
      return runExport("保存ファイル", async (map, fileName) => {
        const r = await saveMapParts(map, { appVersion, savedAt: todayString() });
        return { blob: new Blob(r.parts, { type: "application/octet-stream" }), name: exportFileName(map, fileName, AHMAP_EXT) };
      }, () => store.markSaved());
    },
    /**
     * クロニクル（.md 1ファイル）。Claude 等の AI に渡して歴史を読ませる・続きを書かせるための記録。
     * 年表（すべての操作を年月順に）・国家・戦争・同盟・文化/宗教（最高神つき）・ゾーン・都市などを、
     * 名前だけで読める形で丁寧に書く。アプリに戻すための完全データは、保存ファイル（.ahmap）のほうにある。
     */
    exportChronicle() {
      return runExport("クロニクル", (map, fileName) => {
        map.ext ??= { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
        const ch = buildChronicle(map, { fileName, includeCells: false, exportedAt: todayString() });
        const base = exportFileName(map, fileName, "x").replace(/\.x$/, "");
        return { blob: textBlob(chronicleToMarkdown(ch), "text/markdown"), name: `${base}.chronicle.md` };
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
