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
import { initLegend } from "./ui/legend.js";
import { initFontsSync } from "./ui/fonts-sync.js";
import { initChrome } from "./ui/chrome.js";
import { initSidebarToggle } from "./ui/sidebar-toggle.js";
import { initPanelDock } from "./ui/panel-dock.js";
import { initSettingsWindows } from "./ui/settings-windows.js";
import { initHighlight } from "./ui/highlight.js";
import { initToolbar } from "./ui/toolbar.js";
import { initStatusBar } from "./ui/status-bar.js";
import { initBanner } from "./ui/banner.js";
import { initFileInput } from "./ui/file-input.js";
import { initShortcuts, initHelpDialog } from "./ui/shortcuts.js";
import { createEditActions } from "./app/edit-actions.js";
import { initEditMode } from "./ui/edit-mode.js";
import { initEditToolbar } from "./ui/edit-toolbar.js";
import { initEditPanel } from "./ui/edit-panel.js";
import { createBuilderActions } from "./app/builder-actions.js";
import { initHistoryBuilder } from "./ui/history-builder.js";
import { createEconomyView } from "./ui/economy-view.js";
import { createTravelView } from "./ui/travel-view.js";
import { initEditorPanel } from "./ui/panels/editor-panel.js";
import { createSimActions } from "./app/sim-actions.js";
import { createTimeActions } from "./app/time-actions.js";
import { initTimeBar } from "./ui/time-bar.js";
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
    view: { biomes: true, heights: false, states: true, cultures: false, religions: false, provinces: false, borders: true, coast: true, rivers: true, routes: true, burgs: true, labels: true, burgLabels: "auto", legendKind: "state" },
    editTool: "select", brushRadius: 40,
    timeRunning: false, timeSpeed: 120000, hint: null,
    exportOpts: { title: true, legend: true, scaleBar: true },
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
  const militaryPanel = initMilitaryPanel({ store, simActions, editActions });
  const warsPanel = initWarsPanel({ store, simActions });
  const alliancesPanel = initAlliancesPanel({ store, simActions });
  // editMode は editorPanel より後に作るが、editorPanel（国家タブの属州サブタブ）から
  // 「属州を塗るツールに切り替える」ために参照したいので、後で編集パネルに差し込む
  let editModeRef = null;
  const editorPanel = initEditorPanel({
    store, editActions, panels: null,
    editMode: { setTool: (t) => editModeRef?.setTool(t) },
  });
  const panels = {
    ...editorPanel, simActions, military: militaryPanel, wars: warsPanel, alliances: alliancesPanel,
    // edit-mode.js が地図クリックを「部隊の配置/移動」として消費するために使う
    regimentPending: () => militaryPanel.regimentPending(),
    consumeRegimentPlacement: (cell) => militaryPanel.consumeRegimentPlacement(cell),
  };
  editorPanel.setPanels?.(panels); // editor-panel.js 内で使う panels（wars/alliances/military）を後から渡す
  initSettingsWindows({ store, panels, editorPanel, editActions, actions }); // 設定メニューと、戦争・外交・軍事のウィンドウ
  const deps = { store, viewport, renderer, actions, editActions, simActions, timeActions, panels, openFileDialog: files.open, openHelp: help.open };

  deps.highlight = initHighlight(deps); // 凡例の項目を押したとき、境界線を赤く光らせる
  initBanner(deps);
  initToolbar(deps);
  initStatusBar(deps);
  initMapView(deps);
  initLegend(deps);
  initSidebarToggle(deps);
  initChrome(deps);
  initFontsSync(deps);
  const editMode = initEditMode(deps);
  editModeRef = editMode;
  const editToolbar = initEditToolbar({ store, editMode, editActions });
  const editPanel = initEditPanel();
  // 右のパネルは × で小さくでき、元の場所（右端）の小さなボタンで開き直せる
  initPanelDock([
    { panel: "edit-panel", close: "edit-panel-close", tab: "tab-edit-panel", open: "btn-edit-mode" },
    { panel: "builder-panel", close: "builder-close", tab: "tab-builder-panel", open: "btn-builder" },
  ]);
  const builderActions = createBuilderActions({ store, editActions, editMode, actions });
  const economyView = createEconomyView({ store, editActions, builderActions });
  const travelView = createTravelView({ store, editActions, editMode, viewport, actions });
  const historyBuilder = initHistoryBuilder({ store, viewport, renderer, editActions, builderActions, editMode, panels, views: { economy: economyView, travel: travelView } });
  // 属州タブの「この属州を塗り直す」ボタンから、地図編集パネルを開いてツール欄を同期する
  window.addEventListener("request-edit-panel-open", () => editPanel.open());
  window.addEventListener("request-edit-panel-sync", (e) => {
    editToolbar.fillTargets(e.detail?.tool ?? editMode.tool);
    editToolbar.sync();
    if (e.detail?.target != null) editToolbar.setTargetValue(e.detail.target);
  });
  initTimeBar({ store, timeActions, editActions });
  // 新しい地図を開いたら、時間の進行を止める（前の地図の進行を引き継がない）
  store.subscribe((_s, change) => { if (change.type === "replace") timeActions.stop(); });
  initShortcuts({ ...deps, editMode, editToolbar, timeActions });

  new ResizeObserver(() => renderer.resize()).observe(byId("stage"));
  renderer.resize();

  // 開発時にコンソールから触れるように公開する
  globalThis.alterhistory = { store, viewport, renderer, actions, highlight: deps.highlight, editActions, simActions, timeActions, editorPanel, builderActions, historyBuilder };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
