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
import { createSimActions } from "./app/sim-actions.js";
import { createTimeActions } from "./app/time-actions.js";
import { initTimeBar } from "./ui/time-bar.js";
import { initMilitaryDialog } from "./ui/military-dialog.js";
import { initMilitaryPanel } from "./ui/panels/military-panel.js";
import { initWarsPanel } from "./ui/panels/wars-panel.js";
import { initAlliancesPanel } from "./ui/panels/alliances-panel.js";

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
    timeRunning: false, timeSpeed: 120000, hint: null,
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
  const simActions = createSimActions({ store, renderer });
  const timeActions = createTimeActions({ store, renderer });
  const editorPanel = initEditorPanel({ store, editActions });
  const militaryPanel = initMilitaryPanel({ store, simActions, editActions });
  const warsPanel = initWarsPanel({ store, simActions });
  const alliancesPanel = initAlliancesPanel({ store, simActions });
  const panels = { ...editorPanel, simActions, military: militaryPanel, wars: warsPanel, alliances: alliancesPanel };
  const deps = { store, viewport, renderer, actions, editActions, simActions, timeActions, panels, openFileDialog: files.open, openHelp: help.open };

  initBanner(deps);
  initToolbar(deps);
  initLegend(deps);
  initStatusBar(deps);
  initMapView(deps);
  const editMode = initEditMode(deps);
  const editToolbar = initEditToolbar({ store, editMode });
  const militaryDialog = initMilitaryDialog(deps);
  editMode.setMilitaryDialog(militaryDialog);
  initTimeBar({ store, timeActions });
  // 新しい地図を開いたら、時間の進行を止める（前の地図の進行を引き継がない）
  store.subscribe((_s, change) => { if (change.type === "replace") timeActions.stop(); });
  initShortcuts({ ...deps, editMode, editToolbar, timeActions, militaryDialog });

  new ResizeObserver(() => renderer.resize()).observe(byId("stage"));
  renderer.resize();

  // 開発時にコンソールから触れるように公開する
  globalThis.alterhistory = { store, viewport, renderer, actions, editActions, simActions, timeActions, militaryDialog };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
