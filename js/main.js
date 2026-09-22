// 組み立て（Composition Root）。各部品を作って配線するだけ。ロジックは持たない。
//
// 依存の向き:  ui → app(actions) → core / render / io
import { createStore } from "./core/store.js";
import { createViewport } from "./render/viewport.js";
import { createRenderer } from "./render/renderer.js";
import { viewToRenderOptions } from "./render/options.js";
import { loadFromFile } from "./io/loader.js";
import { createActions } from "./app/actions.js";
import { byId } from "./ui/dom.js";
import { downloadBlob, createBrowserCanvas } from "./ui/download.js";
import { initMapView } from "./ui/map-view.js";
import { initToolbar } from "./ui/toolbar.js";
import { initLegend } from "./ui/legend.js";
import { initStatusBar } from "./ui/status-bar.js";
import { initBanner } from "./ui/banner.js";
import { initFileInput } from "./ui/file-input.js";
import { initShortcuts, initHelpDialog } from "./ui/shortcuts.js";
import { createEditActions } from "./app/edit-actions.js";
import { initEditMode } from "./ui/edit-mode.js";
import { initEditToolbar } from "./ui/edit-toolbar.js";
import { initEditorPanel } from "./ui/panels/editor-panel.js";

function start() {
  const Delaunator = globalThis.Delaunator;
  if (!Delaunator) {
    document.body.textContent = "内部エラー: js/vendor/delaunator.min.js を読み込めませんでした。フォルダ構成を確認してください。";
    return;
  }

  const store = createStore({
    map: null, fileName: "", warnings: [], error: null, notice: null, busy: null, hover: null,
    view: { overlay: "state", base: "biome", coast: true, rivers: true, routes: true, burgs: true, labels: true },
    editTool: "select", brushRadius: 40,
  });
  const viewport = createViewport(1280, 774);
  const renderer = createRenderer({
    canvas: byId("map-canvas"),
    viewport,
    getMap: () => store.getState().map,
    getOptions: () => viewToRenderOptions(store.getState().view),
  });
  const actions = createActions({
    store, viewport, renderer, load: loadFromFile, Delaunator,
    download: downloadBlob, createCanvas: createBrowserCanvas,
  });

  const help = initHelpDialog();
  const files = initFileInput({ actions });
  const editActions = createEditActions({ store, renderer });
  const panels = initEditorPanel({ store, editActions });
  const deps = { store, viewport, renderer, actions, editActions, panels, openFileDialog: files.open, openHelp: help.open };

  initBanner(deps);
  initToolbar(deps);
  initLegend(deps);
  initStatusBar(deps);
  initMapView(deps);
  const editMode = initEditMode(deps);
  const editToolbar = initEditToolbar({ store, editMode });
  initShortcuts({ ...deps, editMode, editToolbar });

  new ResizeObserver(() => renderer.resize()).observe(byId("stage"));
  renderer.resize();

  // 開発時にコンソールから触れるように公開する
  globalThis.alterhistory = { store, viewport, renderer, actions };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
