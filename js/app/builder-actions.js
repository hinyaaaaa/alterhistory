// 歴史ビルダーのアクション。「ボタン1つで、まず形になる」ための手順を1か所にまとめる。
//   国を建てる = 仮の名前で作成 → 塗るツールに切り替え → （おまかせなら）領土を自動で決める → 首都を置く
// 個々の編集は editActions（Undo 可能な commit）に任せ、ここは手順と配線だけを持つ。
// ロジック（領土・首都の選び方）は core/edit/territory.js。

import { pickAutoTerritory, pickCapitalCell, countFreeLand, TERRITORY_SIZES } from "../core/edit/territory.js";
import { listProvisional } from "../core/edit/naming.js";
import { createRandom } from "../core/random.js";
import { computeTrade, annualRevenue, tradePartners, GOODS } from "../core/sim/trade.js";

const KIND_LABEL = { state: "国家", culture: "文化", religion: "宗教" };
export const BUILDABLE = Object.freeze(["state", "religion", "culture"]);
export { TERRITORY_SIZES, KIND_LABEL };

export function createBuilderActions({ store, editActions, editMode, actions }) {
  const rnd = createRandom((Date.now() ^ 0x5bd1e995) >>> 0);
  const withMap = (fn) => { const m = store.getState().map; return m ? fn(m) : undefined; };

  // 塗っている間だけ、塗る対象の色分けに切り替える（宗教を塗るのに国家の色分けのままだと、
  // 塗った結果が見えない）。終わったら元の色分けに戻す。
  let savedOverlay = null;
  function showOverlay(kind) {
    const cur = store.getState().view.overlay;
    if (savedOverlay == null) savedOverlay = cur;
    if (cur !== kind) actions.setOverlay(kind);
  }
  function restoreOverlay() {
    if (savedOverlay != null && store.getState().view.overlay !== savedOverlay) actions.setOverlay(savedOverlay);
    savedOverlay = null;
  }

  /** 塗るツールに切り替え、塗り先を id に合わせる（地図編集パネルの選択欄も同期する） */
  function beginPaint(kind, id) {
    showOverlay(kind);
    const tool = `paint:${kind}`;
    editMode.setTool(tool);
    editMode.setTarget(id);
    window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool, target: id } }));
  }
  function endPaint() {
    restoreOverlay();
    editMode.setTool("select");
    window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: "select" } }));
  }

  return {
    KIND_LABEL, BUILDABLE, TERRITORY_SIZES,
    beginPaint, endPaint,

    /** 仮の名前で新規作成する。style を渡すと名前の雰囲気を指定できる（省略=おまかせ） */
    create(kind, { style } = {}) {
      const name = editActions.suggestName(kind, style ? { style } : {});
      const id = editActions.addEntity(kind, name); // 生成した名前のまま → 「仮」が付く
      return id ?? null;
    },

    /** 名前を引き直す（仮の名前になる。Undo で戻せる） */
    rerollName(kind, id, { style } = {}) {
      const v = editActions.suggestName(kind, style ? { style, id } : { id });
      if (v) editActions.renameEntity(kind, id, v);
      return v;
    },

    /** 空き地があるか（おまかせ領土が使えるかの判定用） */
    freeLand(kind) { return withMap((m) => countFreeLand(m, kind)) ?? 0; },

    /** 空き地から領土を自動で決めて塗る。{ok, count, reason} */
    autoClaim(kind, id, size = "m") {
      return withMap((map) => {
        const r = pickAutoTerritory(map, { kind, size, rnd });
        if (!r.cells.length) return { ok: false, count: 0, reason: r.reason ?? "no-free-land" };
        editActions.paintCells(kind, id, r.cells);
        return { ok: true, count: r.cells.length, reason: null };
      }) ?? { ok: false, count: 0, reason: "no-map" };
    },

    /** 首都がまだ無い国家に、領土の中央付近へ仮の名前で首都を置く。置けたら都市ID */
    autoCapital(stateId) {
      return withMap((map) => {
        const s = map.pack.states[stateId];
        if (!s || s.removed || !s.i) return null;
        const hasCapital = s.capital && map.pack.burgs[s.capital] && !map.pack.burgs[s.capital].removed;
        if (hasCapital) return null;
        const cell = pickCapitalCell(map, stateId);
        if (cell < 0) return null;
        return editActions.addBurg(cell, "", { capital: true }) ?? null;
      }) ?? null;
    },

    /** 世界の取引と、国ごとの収支（その時点の地図から毎回計算する） */
    economy() { return withMap((map) => { const trade = computeTrade(map); return { trade, revenue: (id) => annualRevenue(trade.states.get(id)), partners: (id) => tradePartners(trade, id), goods: GOODS }; }) ?? null; },

    /** 貿易の線を地図に出す（stateId=null で消す）。国の中心どうしを結ぶ */
    showTradeLines(stateId, eco = null) {
      const map = store.getState().map;
      if (!map || stateId == null) { actions.setView({ tradeLines: null }); return 0; }
      const { partners } = eco ?? this.economy();
      const pos = (id) => map.pack.states[id]?.pole ?? null;
      const from = pos(stateId);
      const lines = [];
      if (from) for (const p of partners(stateId)) {
        const to = pos(p.partner);
        if (!to) continue;
        const total = p.exportValue + p.importValue;
        lines.push({ x0: from[0], y0: from[1], x1: to[0], y1: to[1], w: Math.min(8, 1.5 + Math.sqrt(total) * 0.35), kind: p.exportValue >= p.importValue ? "export" : "import" });
      }
      actions.setView({ tradeLines: lines.length ? lines : null });
      return lines.length;
    },

    /** 仮の名前の一覧 */
    provisional() { return withMap((m) => listProvisional(m)) ?? []; },

    /** 仮の名前をすべて確定する（Undo は1回で戻る） */
    confirmAll() {
      const list = withMap((m) => listProvisional(m)) ?? [];
      if (!list.length) return 0;
      store.beginBatch("仮の名前をすべて確定");
      try { for (const { kind, id } of list) editActions.confirmName(kind, id); }
      finally { store.endBatch(); }
      return list.length;
    },
  };
}
