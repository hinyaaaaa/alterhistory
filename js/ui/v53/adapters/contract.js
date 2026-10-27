// v5.3 UI ⇔ 本体の境界（アダプター契約）。UI はこの形のオブジェクトだけを見る。
//   ・mock-adapter.js … 単体で動作確認するための模擬世界
//   ・live-adapter.js … 既存の store / civActions / history-actions / timeActions / actions に接続
// v5.2 で地図・描画・履歴の保存形式が変わっても、直すのは live-adapter.js だけ。UI 側は変えない。
//
// 月の単位は「月インデックス = 年*12 + (月-1)」。
//
// @typedef Meta   { hasWorld, hasCiv, name, cells, first, now, view /* 過去閲覧中の月。現在なら null */, past, states, wars, events, population, land }
// @typedef Row    { id, title, sub?, tag?, tone?, badge? }
// @typedef Detail { kind, id, title, subtitle?, tag?, summary?, stats: [{ label, value, tone? }], related: [{ kind, id, label, relation? }],
//                   events?: [{ id, month, title, kind }], notice? }
// @typedef Action { id, label, enabled, reason?, danger? }
// @typedef Browse { label, domain, entity, count }   詳細に出す「関連を一覧で絞り込んで開く」入口（件数が多い関連は、詳細に全件を並べず、一覧へ絞り込んで辿る）
// list(kind, { query, filter, sort, offset, limit, entity?, range? }) → { total, rows, pending?, unsupported? }
//   entity … その国家・戦争が関わるものだけ（戦争・出来事）／range … 直近 N 年（"10" | "100" | "1000"。戦争・出来事）／pending … 検索が途中（同じ呼び出しを繰り返すと進む）
// （任意）world.openLegacy(kind, id) / world.legacyWindows() / world.openLegacyWindow(win)   従来ウィンドウへの橋渡し。Detail.legacy が true のとき、詳細に「従来の画面で編集」を出す
// bandBuckets({ from, to, buckets }) → [{ index, n, danger, month, title }]   年表の目印を区間ごとに束ねたもの（件数が多くても一定の計算量）
// search(text) → { groups: [{ kind, label, total, rows: [{ id, title, sub, kind? }] }], pending }   横断検索（国家・戦争・文化・出来事）
// @typedef Event  { id, month, kind, title, detail?, causeText?, actors?: [{ kind, id, name }], impact?: { popLossShare, territoryShare, actorPopShare, actorCount, ripple, player } }

export const ROOT_METHODS = ["meta", "subscribe", "setView", "list", "detail", "actions", "runAction", "band", "bandBuckets", "search", "newEvents", "worldScale", "layers", "toggleLayer"];
export const GROUPS = {
  time: ["isRunning", "start", "stop", "step", "speedPerYear", "setSpeedPerYear"],
  world: ["openFile", "newWorld", "fitView", "editMap"],
  start: ["state", "initialGroups", "chooseGroup", "begin", "run", "readiness", "found"],
  exports: ["describe", "chronicle", "ahmap", "obsidianEstimate", "obsidian", "png"],
};
/** 列挙する一覧の種類。未対応の種類は { total: 0, rows: [], unsupported: true } を返してよい */
export const LIST_KINDS = ["state", "war", "event", "treaty", "economy", "tech", "culture", "magic"];

/** 足りないメンバーの一覧を返す（空なら契約を満たしている）。モックと本物の両方をテストで検査する */
export function validateAdapter(a) {
  const missing = [];
  for (const m of ROOT_METHODS) if (typeof a?.[m] !== "function") missing.push(m);
  for (const [g, ms] of Object.entries(GROUPS)) for (const m of ms) if (typeof a?.[g]?.[m] !== "function") missing.push(`${g}.${m}`);
  return missing;
}
