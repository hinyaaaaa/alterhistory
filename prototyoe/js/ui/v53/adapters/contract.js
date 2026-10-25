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
// @typedef Event  { id, month, kind, title, detail?, causeText?, actors?: [{ kind, id, name }], impact?: { popLossShare, territoryShare, actorPopShare, actorCount, ripple, player } }

export const ROOT_METHODS = ["meta", "subscribe", "setView", "list", "detail", "actions", "runAction", "band", "newEvents", "worldScale", "layers", "toggleLayer"];
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
