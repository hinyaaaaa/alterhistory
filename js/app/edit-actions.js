// 編集アクション：編集ツールの操作を Store の commit に変換する。
// UI から呼ばれる。ロジック自体は core/edit/* にあり、ここは配線と通知だけ。

import { PAINT_KINDS, planPaint, planBiomePaint } from "../core/edit/paint.js";
import { planAddMarker, planMoveMarker, planEditMarker, planRemoveMarker } from "../core/edit/markers.js";
import { planAddBurg, planMoveBurg, planRenameBurg, planRemoveBurg, planSetCapital, whyCannotRemoveBurg } from "../core/edit/burgs.js";
import { planSetNote, getNote, noteTarget } from "../core/edit/notes.js";
import { planSetAttributes, getAttributes } from "../core/edit/attributes.js";
import { planSetDiplomacy, getRelation } from "../core/edit/diplomacy.js";
import { planSetTechLevel, getTechLevel, TECH_MIN, TECH_MAX } from "../core/edit/economy.js";
import { planSetDoctrine, getDoctrine, DOCTRINES, DEFAULT_DOCTRINE } from "../core/edit/military-doctrine.js";
import { createRandom } from "../core/random.js";
import { cellIndexOf } from "../core/spatial.js";

export function createEditActions({ store, renderer }) {
  const rnd = createRandom(Date.now());
  const rerender = () => renderer.requestRender();
  const withMap = (fn) => { const m = store.getState().map; return m ? fn(m) : undefined; };

  const commitOrThrow = (plan) => { if (plan) { store.commit(plan); rerender(); } };
  const safeRun = (label, fn) => {
    try { fn(); }
    catch (e) { store.update((s) => { s.error = `${label}: ${e.message}`; }); }
  };

  return {
    /** 塗りブラシの1ストローク分のセルをまとめて塗る（Undo 1回にする） */
    paintCells(kind, target, cells, opts = {}) {
      withMap((map) => safeRun("塗り替え", () => {
        const { command, report } = planPaint(map, { kind, target, cells, force: opts.force });
        if (command) commitOrThrow(command);
        return report;
      }));
    },
    paintBiome(target, cells) {
      withMap((map) => safeRun("地形の変更", () => {
        const { command } = planBiomePaint(map, { target, cells });
        if (command) commitOrThrow(command);
      }));
    },

    addMarker(cell, opts) {
      return withMap((map) => { let out; safeRun("マーカーの追加", () => { const r = planAddMarker(map, { cell, ...opts }); commitOrThrow(r.command); out = r.id; }); return out; });
    },
    moveMarker(id, cell) { withMap((map) => safeRun("マーカーの移動", () => commitOrThrow(planMoveMarker(map, id, cell)))); },
    editMarker(id, patch) { withMap((map) => safeRun("マーカーの編集", () => commitOrThrow(planEditMarker(map, id, patch)))); },
    removeMarker(id) { withMap((map) => safeRun("マーカーの削除", () => commitOrThrow(planRemoveMarker(map, id)))); },

    addBurg(cell, name, opts = {}) {
      return withMap((map) => { let out; safeRun("都市の追加", () => { const r = planAddBurg(map, { cell, name, rnd, ...opts }); commitOrThrow(r.command); out = r.id; }); return out; });
    },
    moveBurg(id, cell) { withMap((map) => safeRun("都市の移動", () => commitOrThrow(planMoveBurg(map, id, cell)))); },
    renameBurg(id, name) { withMap((map) => safeRun("都市の改名", () => commitOrThrow(planRenameBurg(map, id, name)))); },
    removeBurg(id) { withMap((map) => safeRun("都市の削除", () => commitOrThrow(planRemoveBurg(map, id)))); },
    setCapital(stateId, burgId) { withMap((map) => safeRun("首都の変更", () => commitOrThrow(planSetCapital(map, stateId, burgId)))); },
    whyCannotRemoveBurg(id) { return withMap((map) => whyCannotRemoveBurg(map, id)) ?? "地図が読み込まれていません"; },

    getNote(type, id) { return withMap((map) => getNote(map, type, id)) ?? ""; },
    setNote(type, id, text) { withMap((map) => safeRun("文章の保存", () => commitOrThrow(planSetNote(map, type, id, text)))); },
    noteTarget(type, id) { return withMap((map) => noteTarget(map, type, id)) ?? null; },

    getAttributes(kind, id) { return withMap((map) => getAttributes(map, kind, id)) ?? []; },
    setAttributes(kind, id, entries) { withMap((map) => safeRun("属性の保存", () => commitOrThrow(planSetAttributes(map, kind, id, entries)))); },

    getRelation(a, b) { return withMap((map) => getRelation(map, a, b)) ?? null; },
    setDiplomacy(a, b, relation) { withMap((map) => safeRun("外交関係の変更", () => commitOrThrow(planSetDiplomacy(map, a, b, relation)))); },

    TECH_MIN, TECH_MAX,
    getTechLevel(stateId) { return withMap((map) => getTechLevel(map, stateId)) ?? null; },
    setTechLevel(stateId, value) { withMap((map) => safeRun("技術水準の変更", () => commitOrThrow(planSetTechLevel(map, stateId, value)))); },

    DOCTRINES,
    getDoctrine(stateId) { return withMap((map) => getDoctrine(map, stateId)) ?? DEFAULT_DOCTRINE; },
    setDoctrine(stateId, doctrineKey) { withMap((map) => safeRun("戦争ドクトリンの変更", () => commitOrThrow(planSetDoctrine(map, stateId, doctrineKey)))); },

    /** ブラシの半径(ワールド座標)内にあるセルIDを返す */
    cellsWithin(x, y, radius) { return withMap((map) => cellIndexOf(map).findWithin(x, y, radius)) ?? []; },
    /** (x, y) に最も近いセルID。地図が無ければ -1 */
    findCell(x, y) { return withMap((map) => cellIndexOf(map).find(x, y)) ?? -1; },
  };
}

export { PAINT_KINDS, TECH_MIN, TECH_MAX, DOCTRINES };
