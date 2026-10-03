// 編集アクション：編集ツールの操作を Store の commit に変換する。
// UI から呼ばれる。ロジック自体は core/edit/* にあり、ここは配線と通知だけ。

import { PAINT_KINDS, planPaint, planBiomePaint } from "../core/edit/paint.js";
import { planAddMarker, planMoveMarker, planEditMarker, planRemoveMarker } from "../core/edit/markers.js";
import { planAddBurg, planMoveBurg, planRenameBurg, planRemoveBurg, planSetCapital, whyCannotRemoveBurg } from "../core/edit/burgs.js";
import { planSetNote, getNote, noteTarget } from "../core/edit/notes.js";
import { planSetDiplomacy, getRelation } from "../core/edit/diplomacy.js";
import { planRenameEntity, planAddEntity, planAddProvince, planRemoveEntity } from "../core/edit/entities.js";
import { planDeclareIndependence, planMergeStates } from "../core/edit/sovereignty.js";
import { listEras, eraAt, planSetEra, planRemoveEra } from "../core/edit/eras.js";
import { planSetFinance, getFinance } from "../core/edit/finance.js";
import { planSetEntityProfile, planSetOrigin, planSetBurgProfile, originTree, descendantsOf } from "../core/edit/profile.js";
import { planAddJourney, planEditJourney, planRemoveJourney, planAddLeg, planRemoveLeg, planChangeLegTransport } from "../core/edit/journeys.js";
import { planAddZone, planEditZone, planRemoveZone, planPaintZone, growZoneCells } from "../core/edit/zones.js";
import { planSetTechLevel, getTechLevel, TECH_MIN, TECH_MAX } from "../core/edit/economy.js";
import { planSetDoctrine, getDoctrine, DOCTRINES, DEFAULT_DOCTRINE } from "../core/edit/military-doctrine.js";
import {
  suggestName as planSuggestName, isProvisional, planSetProvisional, withProvisional,
  getNameStyle, styleOfCulture, planSetNameStyle, NAME_STYLES, STYLE_KEYS,
} from "../core/edit/naming.js";
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
  const currentDate = () => store.getState().map?.worldTime ?? { year: 1, month: 1 };

  // ---- 名前の仮生成 ----
  // 生成した名前は「最近提案した名前」として覚えておく。あとでその名前がそのまま確定（追加・改名）
  // されたら「仮」の印を付け、ユーザーが手で書き換えた名前には付けない。
  // こうすると UI 側は「生成ボタンで入力欄を埋める」だけでよく、仮かどうかを意識しなくて済む。
  const suggested = new Map(); // 名前 → { kind, extra }
  const MAX_REMEMBERED = 200;
  function suggestName(kind, ctx = {}) {
    return withMap((map) => {
      const r = planSuggestName(map, { kind, rnd, ...ctx });
      if (suggested.size >= MAX_REMEMBERED) suggested.delete(suggested.keys().next().value);
      suggested.set(r.name, { kind, extra: r.extra });
      return r.name;
    }) ?? "";
  }
  const takeSuggested = (name, kind) => {
    const s = suggested.get((name ?? "").trim());
    return s && s.kind === kind ? s : null;
  };
  /** 名前が空なら仮の名前を作る。{name, provisional, extra} を返す */
  function resolveName(kind, name, ctx) {
    const trimmed = (name ?? "").trim();
    if (!trimmed) {
      const gen = suggestName(kind, ctx);
      return { name: gen, provisional: !!gen, extra: suggested.get(gen)?.extra };
    }
    const s = takeSuggested(trimmed, kind);
    return { name: trimmed, provisional: !!s, extra: s?.extra };
  }

  return {
    suggestName,
    NAME_STYLES, STYLE_KEYS,
    isProvisional(kind, id) { return withMap((map) => isProvisional(map, kind, id)) ?? false; },
    /** 仮の名前を確定する（名前は変えず、「仮」の印だけ外す） */
    confirmName(kind, id) { withMap((map) => safeRun("名前の確定", () => commitOrThrow(planSetProvisional(map, kind, id, false)))); },
    /** 文化の名前の系統（明示されたもの。無ければ null）と、実際に使われる系統 */
    getNameStyle(cultureId) { return withMap((map) => getNameStyle(map, cultureId)) ?? null; },
    effectiveNameStyle(cultureId) { return withMap((map) => styleOfCulture(map, cultureId)) ?? "western"; },
    setNameStyle(cultureId, style) { withMap((map) => safeRun("名前の系統の変更", () => commitOrThrow(planSetNameStyle(map, cultureId, style)))); },

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

    /** name が空なら、その土地の文化に合わせた仮の名前を付ける */
    addBurg(cell, name, opts = {}) {
      return withMap((map) => { let out; safeRun("都市の追加", () => {
        const n = resolveName("burg", name, { cell });
        const r = planAddBurg(map, { cell, name: n.name, rnd, ...opts });
        commitOrThrow(n.provisional ? withProvisional(map, r.command, "burg", r.id, true) : r.command);
        out = r.id;
      }); return out; });
    },
    moveBurg(id, cell) { withMap((map) => safeRun("都市の移動", () => commitOrThrow(planMoveBurg(map, id, cell)))); },
    renameBurg(id, name) {
      withMap((map) => safeRun("都市の改名", () => {
        const plan = planRenameBurg(map, id, name);
        commitOrThrow(withProvisional(map, plan, "burg", id, !!takeSuggested(name, "burg")));
      }));
    },
    removeBurg(id) { withMap((map) => safeRun("都市の削除", () => commitOrThrow(planRemoveBurg(map, id)))); },
    setCapital(stateId, burgId) { withMap((map) => safeRun("首都の変更", () => commitOrThrow(planSetCapital(map, stateId, burgId)))); },
    whyCannotRemoveBurg(id) { return withMap((map) => whyCannotRemoveBurg(map, id)) ?? "地図が読み込まれていません"; },

    getNote(type, id) { return withMap((map) => getNote(map, type, id)) ?? ""; },
    setNote(type, id, text) { withMap((map) => safeRun("文章の保存", () => commitOrThrow(planSetNote(map, type, id, text)))); },
    noteTarget(type, id) { return withMap((map) => noteTarget(map, type, id)) ?? null; },

    getRelation(a, b) { return withMap((map) => getRelation(map, a, b)) ?? null; },
    setDiplomacy(a, b, relation) { withMap((map) => safeRun("外交関係の変更", () => commitOrThrow(planSetDiplomacy(map, a, b, relation, currentDate())))); },

    /** 国家・文化・宗教・属州の名前を変える（都市は renameBurg を使う） */
    renameEntity(kind, id, name) {
      withMap((map) => safeRun("名前の変更", () => {
        const plan = planRenameEntity(map, kind, id, name);
        commitOrThrow(withProvisional(map, plan, kind, id, !!takeSuggested(name, kind)));
      }));
    },

    /** 国家・文化・宗教・属州を削除する（Undo で戻せる）。成功したら true */
    removeEntity(kind, id) {
      return withMap((map) => { let ok = false; safeRun("削除", () => { commitOrThrow(planRemoveEntity(map, kind, id)); ok = true; }); return ok; }) ?? false;
    },

    /** 国家・文化・宗教を新規作成する。まだどのセルも持たない状態で作られるので、
     *  続けて「塗る」ツールでセルに塗って地図上に反映する必要がある */
    addEntity(kind, name) {
      return withMap((map) => { let out; safeRun(`${{ state: "国家", culture: "文化", religion: "宗教" }[kind] ?? "実体"}の新規作成`, () => {
        // 名前が空、または生成ボタンの名前のままなら「仮」。国家の政体・宗教の神名も一緒に付く
        const n = resolveName(kind, name, {});
        const r = planAddEntity(map, { kind, name: n.name, rnd, extra: n.extra });
        commitOrThrow(n.provisional ? withProvisional(map, r.command, kind, r.id, true) : r.command);
        out = r.id;
      }); return out; });
    },
    /** 属州を新規作成する（所属する国家を指定する） */
    addProvince(stateId, name) {
      return withMap((map) => { let out; safeRun("属州の新規作成", () => {
        const n = resolveName("province", name, { stateId });
        const r = planAddProvince(map, { state: stateId, name: n.name, rnd });
        commitOrThrow(n.provisional ? withProvisional(map, r.command, "province", r.id, true) : r.command);
        out = r.id;
      }); return out; });
    },

    /** 属州を独立させ、新しい国家として切り出す */
    declareIndependence(provinceId, name) {
      return withMap((map) => { let out; safeRun("属州の独立", () => {
        const stateId = map.pack.provinces[provinceId]?.state;
        const n = resolveName("state", name, { stateId });
        const r = planDeclareIndependence(map, { provinceId, name: n.name, rnd, date: currentDate() });
        commitOrThrow(n.provisional ? withProvisional(map, r.command, "state", r.id, true) : r.command);
        out = r.id;
      }); return out; });
    },
    /** 国家を統合する（from を to に併合し、from は解散する） */
    mergeStates(from, to) { withMap((map) => safeRun("国家の統合", () => commitOrThrow(planMergeStates(map, { from, to, date: currentDate() })))); },

    /** 時代区分（江戸時代・近代など）の一覧・追加・編集・削除 */
    listEras() { return withMap((map) => listEras(map)) ?? []; },
    eraAt(year) { return withMap((map) => eraAt(map, year)) ?? null; },
    setEra(opts) { withMap((map) => safeRun("時代の設定", () => commitOrThrow(planSetEra(map, opts)))); },
    removeEra(id) { withMap((map) => safeRun("時代の削除", () => commitOrThrow(planRemoveEra(map, id)))); },

    TECH_MIN, TECH_MAX,
    // ---- 政治・文化の深さ（種類・政体・起源・都市の設備） ----
    setEntityProfile(kind, id, patch) { withMap((map) => safeRun("設定の変更", () => commitOrThrow(planSetEntityProfile(map, kind, id, patch)))); },
    setOrigin(kind, id, parentId) { withMap((map) => safeRun("起源の変更", () => commitOrThrow(planSetOrigin(map, kind, id, parentId)))); },
    originOf(kind, id) { return withMap((map) => originTree(map, kind).parent.get(id) ?? 0) ?? 0; },
    descendantsOf(kind, id) { return withMap((map) => descendantsOf(map, kind, id)) ?? []; },
    setBurgProfile(id, patch) { withMap((map) => safeRun("都市の設定", () => commitOrThrow(planSetBurgProfile(map, id, patch)))); },

    // ---- 旅 ----
    addJourney(opts) { return withMap((map) => { let id = null; safeRun("旅の作成", () => { const r = planAddJourney(map, opts); store.commit(r.command); rerender(); id = r.id; }); return id; }) ?? null; },
    editJourney(id, patch) { withMap((map) => safeRun("旅の編集", () => commitOrThrow(planEditJourney(map, id, patch)))); },
    removeJourney(id) { withMap((map) => safeRun("旅の削除", () => commitOrThrow(planRemoveJourney(map, id)))); },
    /** 区間を足す。成功なら true。経路が無いときは理由を画面に出して false */
    addLeg(id, leg) { return withMap((map) => { let ok = false; safeRun("区間の追加", () => { commitOrThrow(planAddLeg(map, id, leg)); ok = true; }); return ok; }) ?? false; },
    removeLeg(id, index) { withMap((map) => safeRun("区間の削除", () => commitOrThrow(planRemoveLeg(map, id, index)))); },
    changeLegTransport(id, index, transport) { withMap((map) => safeRun("移動手段の変更", () => commitOrThrow(planChangeLegTransport(map, id, index, transport)))); },

    // ---- ゾーン ----
    addZone(opts) { return withMap((map) => { let idx = null; safeRun("ゾーンの作成", () => { const r = planAddZone(map, opts); store.commit(r.command); rerender(); idx = r.index; }); return idx; }) ?? null; },
    /** 種のセルから範囲を自動で決めて、新しいゾーンを作る（おまかせ） */
    addZoneAround(cell, { type, size = 24, name } = {}) {
      return withMap((map) => {
        const cells = growZoneCells(map, cell, size, rnd);
        if (!cells.length) { store.update((s) => { s.error = "ゾーンを作れませんでした（そこは水の上か、地図の外です）"; }); return null; }
        let idx = null;
        safeRun("ゾーンの作成", () => { const r = planAddZone(map, { name, type, cells }); store.commit(r.command); rerender(); idx = r.index; });
        return idx;
      }) ?? null;
    },
    editZone(index, patch) { withMap((map) => safeRun("ゾーンの編集", () => commitOrThrow(planEditZone(map, index, patch)))); },
    removeZone(index) { withMap((map) => safeRun("ゾーンの削除", () => commitOrThrow(planRemoveZone(map, index)))); },
    paintZone(index, cells, mode) { withMap((map) => safeRun("ゾーンを塗る", () => commitOrThrow(planPaintZone(map, index, cells, mode)))); },

    /** 国の税率・国庫（未設定なら政体から補った値） */
    getFinance(stateId) { return withMap((map) => { const s = map.pack.states[stateId]; return s ? getFinance(s) : null; }) ?? null; },
    /** patch: { salesTax?, pollTax?, treasury? }（Undo可能） */
    setFinance(stateId, patch) { withMap((map) => safeRun("財政の変更", () => commitOrThrow(planSetFinance(map, stateId, patch)))); },
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
