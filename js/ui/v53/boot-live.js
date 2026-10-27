// v5.3 UI を、現行の本体につないで起動する入口。Agent 1 が UI を再設計するとき、main.js からこの 1 関数を呼ぶだけでよい。
//
//   import { bootV53 } from "./ui/v53/boot-live.js";
//   const v53 = bootV53({ root: document.getElementById("v53-root"), store, civActions, history, timeActions, actions, groupActions,
//                         stageEl: document.getElementById("stage"), panels, highlight, createCanvas: createBrowserCanvas,
//                         download: downloadBlob, appVersion: APP_VERSION, openFileDialog: () => document.getElementById("file-input").click() });
//
//   ・stageEl … 本体の地図の入れ物（#stage）。そのまま中央に差し込む。地図の描画基盤（v5.2 で改修予定）には触れない
//   ・panels  … 既存の panels.openEntity を、新しい右ドックへ向ける（地図で国家・戦争を選んだとき）。省略可
//   ・index.html には css/v53.css と、フォント（Zen Old Mincho / Zen Kaku Gothic New / JetBrains Mono）の読み込みを足す（preview/v53.html を参照）
import { mountV53 } from "./index.js";
import { createLiveAdapter, createLiveMapPort } from "./adapters/live-adapter.js";

export function bootV53({ root, store, civActions, history, timeActions, actions, groupActions = null, stageEl, panels = null, highlight = null, createCanvas = null, download, appVersion = "", openFileDialog = null, editMap = null, legacy = null, ...rest }) {
  const adapter = createLiveAdapter({ store, civActions, history, timeActions, actions, groupActions, createCanvas, appVersion, openFileDialog, editMap, legacy });
  const map = createLiveMapPort({ stageEl, panels, highlight, owns: (kind, id) => { const c = store.getState().map?.civ; return !!c && !!(kind === "state" ? c.states : c.wars)?.[id]; } });
  const app = mountV53({ root, adapter, map, download, ...rest });
  return { ...app, adapter, map };
}
