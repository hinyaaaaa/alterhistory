// 組み立て（Composition Root）。各部品を作って配線するだけ。ロジックは持たない。
//
// 依存の向き:  ui → app(actions) → core / render / io
import { applyMapBalance } from "./core/edit/balance-setting.js";
import { createStore } from "./core/store.js";
import { createViewport } from "./render/viewport.js";
import { createRenderer } from "./render/renderer.js";
import { viewToRenderOptions } from "./render/options.js";
import { createActions } from "./app/actions.js";
import { byId } from "./ui/dom.js";
import { downloadBlob, createBrowserCanvas } from "./ui/download.js";
import { initMapView } from "./ui/map-view.js";
import { initFontsSync } from "./ui/fonts-sync.js";
import { initChrome } from "./ui/chrome.js";
import { initSettingsWindows } from "./ui/settings-windows.js";
import { initEntityLists } from "./ui/entity-list-window.js";
import { initGenealogy } from "./ui/genealogy-window.js";
import { initTimelineWindow } from "./ui/timeline-window.js";
import { initNuclearWindow } from "./ui/nuclear-window.js";
import { initCovertWindow } from "./ui/covert-window.js";
import { makeDraggable, makeResizable } from "./ui/windows.js";
import { initHighlight } from "./ui/highlight.js";
import { initToolbar } from "./ui/toolbar.js";
import { initStatusBar } from "./ui/status-bar.js";
import { initBanner } from "./ui/banner.js";
import { initFileInput } from "./ui/file-input.js";
import { initShortcuts } from "./ui/shortcuts.js";
import { initHub } from "./ui/hub.js";
import { initNews } from "./ui/news.js";
import { initHoverConnector } from "./ui/hover-connector.js";
import { initWarStatus } from "./ui/war-status.js";
import { createEditActions } from "./app/edit-actions.js";
import { initEditMode } from "./ui/edit-mode.js";
import { initEditToolbar } from "./ui/edit-toolbar.js";
import { initEditPanel } from "./ui/edit-panel.js";
import { createBuilderActions } from "./app/builder-actions.js";
import { createSetupActions } from "./app/setup-actions.js";
import { initSetupWindow } from "./ui/setup-window.js";
import { initRebellionWindow } from "./ui/rebellion-window.js";
import { alertDialog } from "./ui/dialogs.js";
import { initWorkWindows } from "./ui/work-windows.js";
import { initNationWindow } from "./ui/nation-window.js";
import { createEconomyView } from "./ui/economy-view.js";
import { initEditorPanel } from "./ui/panels/editor-panel.js";
import { createSimActions } from "./app/sim-actions.js";
import { createTimeActions } from "./app/time-actions.js";
import { createCivActions } from "./app/civ-actions.js";
import { initCivWindow } from "./ui/civ-window.js";
import { createHistoryActions } from "./app/history-actions.js";
import { initHistoryWindow } from "./ui/history-window.js";
import { createAutoCheck } from "./app/auto-check.js";
import { initTimeBar } from "./ui/time-bar.js";
import { initWarsPanel } from "./ui/panels/wars-panel.js";
import { initWarOutcome } from "./ui/war-outcome-window.js";
import { createWorldService } from "./app/world-service.js";
import { visibleGroups } from "./app/group-actions.js";
import { openNewWorldDialog } from "./ui/world-new-dialog.js";
import { initGroupsPanel } from "./ui/groups-panel.js";
import worldWorkerSource from "./generated/worldgen-worker.txt";
import { bootV53 } from "./ui/v53/boot-live.js";
import { APP_VERSION } from "./version.js";

function start() {
  const store = createStore({
    map: null, fileName: "", warnings: [], error: null, notice: null, busy: null, hover: null,
    view: { biomes: true, heights: false, states: true, cultures: false, religions: false, provinces: false, borders: true, coast: true, rivers: true, routes: true, burgs: true, labels: true, legendKind: "state" },
    editTool: "select", brushRadius: 40,
    timeRunning: false, timeSpeed: 120000, hint: null,
    exportOpts: { title: true, legend: true, scaleBar: true },
  });
  const viewport = createViewport(1280, 774);
  const renderer = createRenderer({
    canvas: byId("map-canvas"),
    viewport,
    getMap: () => store.getState().map,
    getOptions: () => ({ ...viewToRenderOptions(store.getState().view), groups: visibleGroups(store.getState()) }),
  });
  // 世界の生成は Worker で行う（画面が止まらない・中断できる）。地図づくりは国家や戦争と同じ、このアプリの 1 つの機能
  const createWorldWorker = () => {
    if (typeof Worker === "undefined") return null;
    const url = URL.createObjectURL(new Blob([worldWorkerSource], { type: "text/javascript" }));
    const w = new Worker(url); const t = w.terminate.bind(w); w.terminate = () => { t(); URL.revokeObjectURL(url); }; return w;
  };
  const worldService = createWorldService({ createWorker: createWorldWorker });
  const actions = createActions({
    store, viewport, renderer, worldService, appVersion: APP_VERSION,
    download: downloadBlob, createCanvas: createBrowserCanvas,
  });
  const files = initFileInput({ actions });

  const editActions = createEditActions({ store, renderer });
  const simActions = createSimActions({ store, renderer });
  const autoCheck = createAutoCheck({ store }); // データ検査の窓は無い。操作後と5年ごとに、問題があるときだけ右下に出す
  const civActions = createCivActions({ store });
  const timeActions = createTimeActions({ store, renderer, simActions, autoCheck, civActions });
  let highlightRef = null; // 講和の割譲区画を赤く強調するために、あとで入る
  const warOutcome = initWarOutcome({ store, simActions, getHighlight: () => highlightRef });
  let winsRef = null;
  const warsPanel = initWarsPanel({ store, simActions, getOutcome: () => warOutcome, getDiplomacy: () => panels.diplomacy });
  // editMode は editorPanel より後に作るが、editorPanel（国家タブの属州サブタブ）から
  // 「属州を塗るツールに切り替える」ために参照したいので、後で編集パネルに差し込む
  let editModeRef = null;
  let openSetupRef = null; // 共通の初期設定ウィンドウ（ウィンドウ管理ができたあとで入る）
  const openSetup = (kind, opts) => (openSetupRef ? openSetupRef(kind, opts) : Promise.resolve(null));
  let openRebellionRef = null; // 反乱・独立ウィンドウ
  const openRebellion = (opts) => openRebellionRef?.(opts);
  const editorPanel = initEditorPanel({
    store, editActions, panels: null, openSetup, openRebellion,
    editMode: { setTool: (t) => editModeRef?.setTool(t) },
  });
  const panels = {
    ...editorPanel, simActions, wars: warsPanel,
  };
  editorPanel.setPanels?.(panels); // editor-panel.js 内で使う panels（wars/alliances/military）を後から渡す
  const highlight = initHighlight({ store, viewport, renderer }); highlightRef = highlight; // 一覧・地図クリックで、ズームせずに境界線を光らせる
  const wins = initSettingsWindows({ store, panels, editorPanel, editActions, actions, warOutcome }); // 設定メニューと、戦争・外交・軍事のウィンドウ
  winsRef = wins;
  initHub({ store, wins }); // 左ハブ。ファイル・地図・各窓の入口（ボタンの id を持つので、ツールバー等の配線より先に作る）
  const newWorld = () => openNewWorldDialog({ actions, store });
  byId("btn-new-world").addEventListener("click", newWorld);
  byId("btn-new-world-empty").addEventListener("click", newWorld);
  const builderActions = createBuilderActions({ store, editActions, editMode: { setTool: (t) => editModeRef?.setTool(t), setTarget: (t) => editModeRef?.setTarget(t) }, actions });
  const setupActions = createSetupActions({ store, renderer });
  const setupWindow = initSetupWindow({
    wins, setupActions, store,
    onCreated: (_kind, _id, r) => { if (r?.warning === "no-free-land") alertDialog("空き地（無所属の陸）が無かったため、領土は決まっていません。地図編集の塗りツールで決めてください。"); },
  });
  openSetupRef = setupWindow.open;
  openRebellionRef = initRebellionWindow({ wins, store, simActions, setupActions }).open;
  initEntityLists({ store, wins, panels, editActions, highlight, builderActions, openSetup });
  initGenealogy({ store, wins, editActions });
  initTimelineWindow({ store, wins, editActions, viewport, renderer, actions });
  initCivWindow({ store, wins, civActions });
  const history = createHistoryActions({ store, civActions }); // V5-M10: 歴史ビューア（検索・一覧・過去の閲覧）
  initHistoryWindow({ store, wins, history, civActions });
  initNuclearWindow({ store, simActions, wins });
  initCovertWindow({ store, simActions, wins });
  // 地図上の国・州などを選んだときも、ズームせず強調だけする
  const rawOpen = panels.openEntity;
  let nationRef = null; // 国家タブ（あとで入る）。国家を選んだときは、サイドバーではなく国家タブの詳細を開く
  panels.openEntity = (kind, id) => { if (["culture", "religion", "province"].includes(kind)) highlight.show(kind, id); if (kind === "state" && nationRef) { nationRef.openState(id); return; } return rawOpen(kind, id); };
  for (const [id, head] of [["sidebar", "#editor-panel"], ["edit-panel", ".editor-header"]]) {
    const root = byId(id);
    // sidebar の中身(editor-panel)は描き直されるので、ドラッグはパネル全体の上端を掴む形にする
    makeDraggable(root, id === "sidebar" ? root : root.querySelector(head), byId("stage"), id === "sidebar" ? ".editor-header" : null);
    makeResizable(root, byId("stage")); // 大きさも自由に変えられる
  }
  const deps = { store, viewport, renderer, actions, editActions, simActions, timeActions, panels, wins, openSetup, openFileDialog: files.open };

  deps.highlight = highlight;
  initBanner(deps);
  initToolbar(deps);
  initStatusBar(deps);
  initMapView(deps);
  initNews(deps);
  initHoverConnector(deps);
  initWarStatus(deps);
  initChrome(deps);
  initFontsSync(deps);
  const editMode = initEditMode(deps);
  editModeRef = editMode;
  initGroupsPanel({ store, actions, viewport, renderer, editMode }); // 初期集団を選ぶ（世界ができて、開始集団が決まるまで）
  const editToolbar = initEditToolbar({ store, editMode, editActions, openSetup });
  const editPanel = initEditPanel();
  // 右のパネルは × で小さくでき、元の場所（右端）の小さなボタンで開き直せる

  const economyView = createEconomyView({ store, editActions, builderActions });
  initWorkWindows({ store, wins, views: { economy: economyView } });
  nationRef = initNationWindow({ store, wins, editActions, simActions, setupActions, economyView, openSetup, getWarsPanel: () => warsPanel, openRebellion, getHighlight: () => highlightRef });
  // 属州タブの「この属州を塗り直す」ボタンから、地図編集パネルを開いてツール欄を同期する
  window.addEventListener("request-edit-panel-open", () => editPanel.open());
  window.addEventListener("request-edit-panel-sync", (e) => {
    if (e.detail?.tool && editMode.tool !== e.detail.tool) { editMode.setTool(e.detail.tool); editPanel.open(); } // 国家タブの「領土を塗る」「都市を置く」など、外からツールを選ぶ
    editToolbar.fillTargets(e.detail?.tool ?? editMode.tool);
    editToolbar.sync();
    if (e.detail?.target != null) editToolbar.setTargetValue(e.detail.target);
  });
  initTimeBar({ store, timeActions, editActions, simActions });
  // 新しい地図を開いたら、時間の進行を止める（前の地図の進行を引き継がない）
  // 地図を開いたら、シミュレーションの数値（バランス設定）を「既定値＋その地図の上書き値」にそろえる
  store.subscribe((s, change) => { if (change.type === "replace") { timeActions.stop(); applyMapBalance(s.map); } });
  // 元に戻す／やり直すでデータは戻るが、地図は自分では描き直さないので、ここで必ず描き直す（直さないと画面だけ編集後のまま残る）
  store.subscribe((_s, change) => { if (change.type === "undo" || change.type === "redo") renderer.requestRender(); });
  // v5.3: Space は v5.3 のアダプター経由（重大イベントの確認待ちの間は時間を再開させない）。ほかのショートカットは従来のまま
  let v53 = null;
  const v53Time = { ...timeActions, start: () => (v53 ? v53.adapter.time.start() : timeActions.start()), stop: () => (v53 ? v53.adapter.time.stop() : timeActions.stop()), isRunning: () => timeActions.isRunning() };
  initShortcuts({ ...deps, editMode, editToolbar, timeActions: v53Time });

  // ---- v5.3 UI（ドック方式）。地図（#stage）を中央に差し込み、左レール・右ドック・時間軸・通知を組み立てる ----
  // 従来のウィンドウ（手動で作った国家の編集・外交・軍事・年表など）は、機能を失わないよう「世界」の入口から開ける
  const LEGACY_WINDOWS = [["nation", "国家（手動作成の編集）"], ["diplomacy", "外交"], ["war", "戦争・軍事"], ["economy", "経済・交易"], ["list-culture", "文化"], ["list-religion", "宗教"], ["timeline", "年表（従来）"], ["settings", "詳細設定"]];
  document.body.classList.add("v53-on");
  v53 = bootV53({
    root: byId("v53-root"), store, civActions, history, timeActions, actions, groupActions: actions,
    stageEl: byId("stage"), panels, highlight, createCanvas: createBrowserCanvas, download: downloadBlob, appVersion: APP_VERSION,
    openFileDialog: files.open, editMap: () => byId("btn-edit-mode")?.click(), keyboard: false,
    legacy: { openWindow: (id) => wins.open(id), windows: LEGACY_WINDOWS.map(([id, label]) => ({ id, label })) }, // 従来のウィンドウは「手動で作った国家」用。文明シミュレーションの国家は載らない（国家の詳細は右ドック）
  });
  byId("stage").append(byId("sidebar"), byId("edit-panel")); // 従来の編集パネルも、地図の上に重ねる（ドラッグ範囲は #stage のまま）

  new ResizeObserver(() => renderer.resize()).observe(byId("stage"));
  renderer.resize();

  // 開発時にコンソールから触れるように公開する
  globalThis.alterhistory = { v53, civActions, history, worldService, wins, panels, setupActions, openSetup, openRebellion, store, viewport, renderer, actions, highlight: deps.highlight, editActions, simActions, timeActions, editorPanel, builderActions };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
