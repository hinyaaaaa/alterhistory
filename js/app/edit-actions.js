// 編集アクション：編集ツールの操作を Store の commit に変換する。
// UI から呼ばれる。ロジック自体は core/edit/* にあり、ここは配線と通知だけ。

import { PAINT_KINDS, planPaint, planBiomePaint } from "../core/edit/paint.js";
import { planAddMarker, planMoveMarker, planEditMarker, planRemoveMarker } from "../core/edit/markers.js";
import { planAddBurg, planMoveBurg, planRenameBurg, planRemoveBurg, planSetCapital, whyCannotRemoveBurg } from "../core/edit/burgs.js";
import { planSetNote, getNote, noteTarget } from "../core/edit/notes.js";
import { planSetDiplomacy, getRelation } from "../core/edit/diplomacy.js";
import { diplomacyMismatches, planReconcileDiplomacy } from "../core/edit/relations.js";
import { planRenameEntity, planAddEntity, planAddProvince, planRemoveEntity } from "../core/edit/entities.js";
import { planDeclareIndependence, planMergeStates } from "../core/edit/sovereignty.js";
import { listEras, eraAt, planSetEra, planRemoveEra } from "../core/edit/eras.js";
import { planSetFinance, getFinance } from "../core/edit/finance.js";
import { planSetEntityProfile, planSetOrigin, planSetOrigins, planSetBurgProfile, originTree, descendantsOf } from "../core/edit/profile.js";
import { planAddJourney, planEditJourney, planRemoveJourney, planAddLeg, planRemoveLeg, planChangeLegTransport } from "../core/edit/journeys.js";
import { planAddZone, planEditZone, planRemoveZone, planPaintZone, growZoneCells, zoneLabel } from "../core/edit/zones.js";
import { planSetTechLevel, getTechLevel, TECH_MIN, TECH_MAX } from "../core/edit/economy.js";
import { planSetDoctrine, getDoctrine, DOCTRINES, DEFAULT_DOCTRINE } from "../core/edit/military-doctrine.js";
import {
  suggestName as planSuggestName, isProvisional, planSetProvisional, withProvisional,
  getNameStyle, styleOfCulture, planSetNameStyle, NAME_STYLES, STYLE_KEYS,
} from "../core/edit/naming.js";
import { suggestLabel } from "../core/edit/naming.js";
import { withEvent, planLogEvent } from "../core/edit/history-log.js";
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
  // ---- 歴史ログ：アクションごとに「何が起きたか」を年表に残す（Undo で一緒に戻る） ----
  const KIND_JP = { state: "国家", culture: "文化", religion: "宗教", province: "属州" };
  const LIST_OF = { state: "states", culture: "cultures", religion: "religions", province: "provinces" };
  const nameOf = (e) => e?.fullName ?? e?.name ?? "（不明）";
  const entOf = (map, kind, id) => map.pack[LIST_OF[kind]]?.[id];
  /** 計画（コマンド）に出来事を足して commit する。plan が null（変化なし）なら何もしない */
  const NOTE_JP = { state: "国家", culture: "文化", religion: "宗教", province: "属州", burg: "都市", marker: "マーカー", world: "世界" };
  const markerOf = (map, id) => (map.markers ?? []).find((m) => m && m.i === id);
  const markerName = (map, id) => markerOf(map, id)?.name || markerOf(map, id)?.type || "マーカー";
  const stateAtCell = (map, cell) => { const s = cell != null ? map.pack.cells.state[cell] : 0; return s ? [s] : []; };
  const noteTargetName = (map, type, id) => { const list = { state: map.pack.states, culture: map.pack.cultures, religion: map.pack.religions, province: map.pack.provinces, burg: map.pack.burgs }[type]; return list ? nameOf(list[id]) : (type === "marker" ? markerName(map, id) : ""); };
  const commitEv = (map, plan, ev) => commitOrThrow(plan && ev ? withEvent(map, plan, ev) : plan);

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
        if (command) {
          const who = target > 0 ? nameOf(entOf(map, kind, target)) : null;
          const ev = report.changed > 0 && KIND_JP[kind]
            ? { type: "territory", mergeKey: `paint:${kind}:${target}`, count: report.changed, title: who ? `${KIND_JP[kind]}「${who}」の領土が広がった` : `${KIND_JP[kind]}の支配が外れた土地が出た（無所属化）` }
            : null;
          commitEv(map, command, ev);
        }
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
      return withMap((map) => { let out; safeRun("マーカーの追加", () => {
        const r = planAddMarker(map, { cell, ...opts });
        const label = opts?.name || opts?.type || "マーカー";
        commitEv(map, r.command, { type: "marker-added", title: `マーカー「${label}」が置かれた`, cell, states: stateAtCell(map, cell) });
        out = r.id;
      }); return out; });
    },
    moveMarker(id, cell) { withMap((map) => safeRun("マーカーの移動", () => commitEv(map, planMoveMarker(map, id, cell), { type: "marker-moved", title: `マーカー「${markerName(map, id)}」が移された`, cell, states: stateAtCell(map, cell) }))); },
    editMarker(id, patch) { withMap((map) => safeRun("マーカーの編集", () => { const m = markerOf(map, id); commitEv(map, planEditMarker(map, id, patch), { type: "marker-edited", title: `マーカー「${markerName(map, id)}」が書き換えられた`, detail: patch?.name != null && m && patch.name !== m.name ? `「${m.name ?? ""}」→「${patch.name}」` : undefined, cell: m?.cell, states: stateAtCell(map, m?.cell) }); })); },
    removeMarker(id) { withMap((map) => safeRun("マーカーの削除", () => { const m = markerOf(map, id); commitEv(map, planRemoveMarker(map, id), { type: "marker-removed", title: `マーカー「${markerName(map, id)}」が取り除かれた`, cell: m?.cell, states: stateAtCell(map, m?.cell) }); })); },
    /** 手書きの出来事を年表に足す。date を省くと今の日付。cell・states は、地図での位置と関係する国（任意） */
    addHistoryEvent({ title, detail, date, cell, states }) {
      return withMap((map) => safeRun("出来事の記録", () => {
        const t = String(title ?? "").trim(); if (!t) throw new Error("出来事の題を入れてください");
        commitOrThrow(planLogEvent(map, { type: "manual", title: t, detail: String(detail ?? "").trim() || undefined, date, cell, states }));
      }));
    },

    /** name が空なら、その土地の文化に合わせた仮の名前を付ける */
    addBurg(cell, name, opts = {}) {
      return withMap((map) => { let out; safeRun("都市の追加", () => {
        const n = resolveName("burg", name, { cell });
        const r = planAddBurg(map, { cell, name: n.name, rnd, ...opts });
        const st = map.pack.states[map.pack.cells.state[cell]];
        const cmd = withEvent(map, r.command, { type: "created-burg", title: `${opts.capital ? "首都" : "都市"}「${n.name}」が建設された`, detail: st && st.i ? `所属: ${nameOf(st)}` : undefined });
        commitOrThrow(n.provisional ? withProvisional(map, cmd, "burg", r.id, true) : cmd);
        out = r.id;
      }); return out; });
    },
    moveBurg(id, cell) { withMap((map) => safeRun("都市の移動", () => commitOrThrow(planMoveBurg(map, id, cell)))); },
    renameBurg(id, name) {
      withMap((map) => safeRun("都市の改名", () => {
        const before = map.pack.burgs[id]?.name;
        const plan = planRenameBurg(map, id, name);
        const cmd = plan && withEvent(map, plan, { type: "rename-burg", title: `都市の改名: 「${before}」→「${(name ?? "").trim()}」` });
        commitOrThrow(withProvisional(map, cmd, "burg", id, !!takeSuggested(name, "burg")));
      }));
    },
    removeBurg(id) { withMap((map) => safeRun("都市の削除", () => commitEv(map, planRemoveBurg(map, id), { type: "removed-burg", title: `都市「${map.pack.burgs[id]?.name}」が失われた` }))); },
    setCapital(stateId, burgId) {
      withMap((map) => safeRun("首都の変更", () => {
        const st = map.pack.states[stateId], old = map.pack.burgs[st?.capital]?.name;
        commitEv(map, planSetCapital(map, stateId, burgId), { type: "capital", title: `${nameOf(st)}が「${map.pack.burgs[burgId]?.name}」に遷都した`, detail: old ? `旧首都: ${old}` : undefined });
      }));
    },
    whyCannotRemoveBurg(id) { return withMap((map) => whyCannotRemoveBurg(map, id)) ?? "地図が読み込まれていません"; },

    getNote(type, id) { return withMap((map) => getNote(map, type, id)) ?? ""; },
    setNote(type, id, text) {
      withMap((map) => safeRun("文章の保存", () => {
        const plan = planSetNote(map, type, id, text);
        const label = NOTE_JP[type] ?? type;
        const who = noteTargetName(map, type, id);
        commitEv(map, plan, plan && { type: "note", title: `${label}${who ? `「${who}」` : ""}の記録が書き換えられた`, ref: ["state", "culture", "religion", "province", "burg"].includes(type) ? { kind: type, id } : undefined });
      }));
    },
    noteTarget(type, id) { return withMap((map) => noteTarget(map, type, id)) ?? null; },

    /** 外交表が、同盟・従属・戦争（正本）と食い違っている組の数 */
    diplomacyMismatchCount() { return withMap((map) => diplomacyMismatches(map).length) ?? 0; },
    /** 外交表を、同盟・従属・戦争に合わせて直す。直した組の数を返す（無ければ 0） */
    reconcileDiplomacy() { return withMap((map) => { const n = diplomacyMismatches(map).length; if (n) safeRun("外交表の修正", () => { const c = planReconcileDiplomacy(map); if (c) commitOrThrow(c); }); return n; }) ?? 0; },
    getRelation(a, b) { return withMap((map) => getRelation(map, a, b)) ?? null; },
    setDiplomacy(a, b, relation) { withMap((map) => safeRun("外交関係の変更", () => commitOrThrow(planSetDiplomacy(map, a, b, relation, currentDate())))); },

    /** 国家・文化・宗教・属州の名前を変える（都市は renameBurg を使う） */
    renameEntity(kind, id, name) {
      withMap((map) => safeRun("名前の変更", () => {
        const before = nameOf(entOf(map, kind, id));
        const plan = planRenameEntity(map, kind, id, name);
        const ev = { type: `rename-${kind}`, title: `${KIND_JP[kind]}の改名: 「${before}」→「${(name ?? "").trim()}」`, ref: { kind, id, from: before, to: (name ?? "").trim() } };
        commitOrThrow(withProvisional(map, plan && withEvent(map, plan, ev), kind, id, !!takeSuggested(name, kind)));
      }));
    },

    /** 国家・文化・宗教・属州を削除する（Undo で戻せる）。成功したら true */
    removeEntity(kind, id) {
      return withMap((map) => { let ok = false; safeRun("削除", () => {
        const before = nameOf(entOf(map, kind, id));
        commitEv(map, planRemoveEntity(map, kind, id), { type: `removed-${kind}`, title: `${KIND_JP[kind]}「${before}」が消滅した（削除）`, ref: { kind, id, from: before } });
        ok = true;
      }); return ok; }) ?? false;
    },

    /** 国家・文化・宗教を新規作成する。まだどのセルも持たない状態で作られるので、
     *  続けて「塗る」ツールでセルに塗って地図上に反映する必要がある */
    addEntity(kind, name) {
      return withMap((map) => { let out; safeRun(`${{ state: "国家", culture: "文化", religion: "宗教" }[kind] ?? "実体"}の新規作成`, () => {
        // 名前が空、または生成ボタンの名前のままなら「仮」。国家の政体・宗教の神名も一緒に付く
        const n = resolveName(kind, name, {});
        const r = planAddEntity(map, { kind, name: n.name, rnd, extra: n.extra });
        const title = { state: `国家「${n.name}」が建国された`, culture: `文化「${n.name}」が誕生した`, religion: `宗教「${n.name}」が誕生した` }[kind] ?? `${n.name}が誕生した`;
        const detail = kind === "religion" && n.extra?.deity ? `最高神: ${n.extra.deity}` : undefined;
        const cmd = withEvent(map, r.command, { type: `created-${kind}`, title, detail });
        commitOrThrow(n.provisional ? withProvisional(map, cmd, kind, r.id, true) : cmd);
        out = r.id;
      }); return out; });
    },
    /** 属州を新規作成する（所属する国家を指定する） */
    addProvince(stateId, name) {
      return withMap((map) => { let out; safeRun("属州の新規作成", () => {
        const n = resolveName("province", name, { stateId });
        const r = planAddProvince(map, { state: stateId, name: n.name, rnd });
        const cmd = withEvent(map, r.command, { type: "created-province", title: `属州「${n.name}」が${nameOf(map.pack.states[stateId])}に設置された` });
        commitOrThrow(n.provisional ? withProvisional(map, cmd, "province", r.id, true) : cmd);
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
    setEntityProfile(kind, id, patch) {
      withMap((map) => safeRun("設定の変更", () => {
        const e = entOf(map, kind, id), who = nameOf(e);
        const FIELD = { deity: "最高神", form: "政体", formName: "政体名", type: "種類" };
        const parts = Object.entries(patch).filter(([k, v]) => FIELD[k] && e && String(e[k] ?? "") !== String(v ?? "").trim()).map(([k, v]) => `${FIELD[k]}: ${e[k] ?? "未設定"} → ${String(v).trim()}`);
        const ev = parts.length ? { type: `profile-${kind}`, title: `${KIND_JP[kind]}「${who}」の${Object.keys(patch).filter((k) => FIELD[k]).map((k) => FIELD[k]).join("・")}が変わった`, detail: parts.join(" / ") } : null;
        commitEv(map, planSetEntityProfile(map, kind, id, patch), ev);
      }));
    },
    setOrigin(kind, id, parentId) { this.setOrigins(kind, id, parentId ? [parentId] : [0]); },
    setOrigins(kind, id, parentIds) {
      withMap((map) => safeRun("起源の変更", () => {
        const parents = parentIds.map((p) => (p ? nameOf(entOf(map, kind, p)) : "共通の祖")).join("・");
        commitEv(map, planSetOrigins(map, kind, id, parentIds), { type: `origin-${kind}`, title: `${KIND_JP[kind]}「${nameOf(entOf(map, kind, id))}」の起源が「${parents}」になった` });
      }));
    },
    originsOf(kind, id) { return withMap((map) => originTree(map, kind).parents.get(id) ?? [0]) ?? [0]; },
    originOf(kind, id) { return withMap((map) => originTree(map, kind).parent.get(id) ?? 0) ?? 0; },
    descendantsOf(kind, id) { return withMap((map) => descendantsOf(map, kind, id)) ?? []; },
    setBurgProfile(id, patch) { withMap((map) => safeRun("都市の設定", () => commitOrThrow(planSetBurgProfile(map, id, patch)))); },

    // ---- 旅 ----
    addJourney(opts) { return withMap((map) => { let id = null; safeRun("旅の作成", () => { const r = planAddJourney(map, opts); store.commit(withEvent(map, r.command, { type: "journey", title: `旅「${opts?.name ?? "名もなき旅"}」が始まった` })); rerender(); id = r.id; }); return id; }) ?? null; },
    editJourney(id, patch) { withMap((map) => safeRun("旅の編集", () => commitOrThrow(planEditJourney(map, id, patch)))); },
    removeJourney(id) { withMap((map) => safeRun("旅の削除", () => commitOrThrow(planRemoveJourney(map, id)))); },
    /** 区間を足す。成功なら true。経路が無いときは理由を画面に出して false */
    addLeg(id, leg) { return withMap((map) => { let ok = false; safeRun("区間の追加", () => { commitOrThrow(planAddLeg(map, id, leg)); ok = true; }); return ok; }) ?? false; },
    removeLeg(id, index) { withMap((map) => safeRun("区間の削除", () => commitOrThrow(planRemoveLeg(map, id, index)))); },
    changeLegTransport(id, index, transport) { withMap((map) => safeRun("移動手段の変更", () => commitOrThrow(planChangeLegTransport(map, id, index, transport)))); },

    // ---- ゾーン ----
    addZone(opts) {
      return withMap((map) => {
        let idx = null;
        safeRun("ゾーンの作成", () => {
          const name = (opts?.name ?? "").trim() || suggestLabel(map, { kind: "zone", rnd, type: opts?.type ?? "Custom", cell: opts?.cells?.[0] });
          const r = planAddZone(map, { ...opts, name });
          store.commit(withEvent(map, r.command, { type: "created-zone", title: `ゾーン「${name}」（${zoneLabel({ type: opts?.type ?? "Custom" })}）が発生した` }));
          rerender(); idx = r.index;
        });
        return idx;
      }) ?? null;
    },
    /** 種のセルから範囲を自動で決めて、新しいゾーンを作る（おまかせ） */
    addZoneAround(cell, { type, size = 24, name } = {}) {
      return withMap((map) => {
        const cells = growZoneCells(map, cell, size, rnd);
        if (!cells.length) { store.update((s) => { s.error = "ゾーンを作れませんでした（そこは水の上か、地図の外です）"; }); return null; }
        let idx = null;
        safeRun("ゾーンの作成", () => {
          const nm2 = (name ?? "").trim() || suggestLabel(map, { kind: "zone", rnd, type: type ?? "Custom", cell });
          const r = planAddZone(map, { name: nm2, type, cells });
          store.commit(withEvent(map, r.command, { type: "created-zone", title: `ゾーン「${nm2}」（${zoneLabel({ type: type ?? "Custom" })}）が発生した`, detail: `${cells.length}セル` }));
          rerender(); idx = r.index;
        });
        return idx;
      }) ?? null;
    },
    editZone(index, patch) {
      withMap((map) => safeRun("ゾーンの編集", () => {
        const z = map.zones?.[index];
        const renamed = z && patch.name !== undefined && String(patch.name).trim() !== z.name;
        const retyped = z && patch.type !== undefined && patch.type !== z.type;
        const ev = renamed || retyped ? { type: "edit-zone", title: `ゾーン「${z.name}」が${renamed ? `「${String(patch.name).trim()}」と改称` : `${zoneLabel({ type: patch.type })}に変化`}された` } : null;
        commitEv(map, planEditZone(map, index, patch), ev);
      }));
    },
    removeZone(index) { withMap((map) => safeRun("ゾーンの削除", () => commitEv(map, planRemoveZone(map, index), { type: "removed-zone", title: `ゾーン「${map.zones?.[index]?.name}」が収束した` }))); },
    /** 同盟・ゾーン・最高神・時代の名前をランダムに作る（既存の名前と被らない） */
    suggestLabel(kind, ctx = {}) { return withMap((map) => suggestLabel(map, { kind, rnd, ...ctx })) ?? ""; },
    paintZone(index, cells, mode) { withMap((map) => safeRun("ゾーンを塗る", () => commitOrThrow(planPaintZone(map, index, cells, mode)))); },

    /** 国の税率・国庫（未設定なら政体から補った値） */
    getFinance(stateId) { return withMap((map) => { const s = map.pack.states[stateId]; return s ? getFinance(s) : null; }) ?? null; },
    /** patch: { salesTax?, pollTax?, treasury? }（Undo可能） */
    setFinance(stateId, patch) { withMap((map) => safeRun("財政の変更", () => commitOrThrow(planSetFinance(map, stateId, patch)))); },
    getTechLevel(stateId) { return withMap((map) => getTechLevel(map, stateId)) ?? null; },
    setTechLevel(stateId, value) {
      withMap((map) => safeRun("技術水準の変更", () => {
        const before = getTechLevel(map, stateId);
        commitEv(map, planSetTechLevel(map, stateId, value), { type: "tech", title: `${nameOf(map.pack.states[stateId])}の技術水準が変わった`, detail: `Lv${before} → Lv${value}` });
      }));
    },

    DOCTRINES,
    getDoctrine(stateId) { return withMap((map) => getDoctrine(map, stateId)) ?? DEFAULT_DOCTRINE; },
    setDoctrine(stateId, doctrineKey) {
      withMap((map) => safeRun("戦争ドクトリンの変更", () => {
        const label = (k) => DOCTRINES.find?.((d) => d.key === k)?.label ?? DOCTRINES[k]?.label ?? k;
        commitEv(map, planSetDoctrine(map, stateId, doctrineKey), { type: "doctrine", title: `${nameOf(map.pack.states[stateId])}が戦争ドクトリンを改めた`, detail: `${label(getDoctrine(map, stateId))} → ${label(doctrineKey)}` });
      }));
    },

    /** ブラシの半径(ワールド座標)内にあるセルIDを返す */
    cellsWithin(x, y, radius) { return withMap((map) => cellIndexOf(map).findWithin(x, y, radius)) ?? []; },
    /** (x, y) に最も近いセルID。地図が無ければ -1 */
    findCell(x, y) { return withMap((map) => cellIndexOf(map).find(x, y)) ?? -1; },
  };
}

export { PAINT_KINDS, TECH_MIN, TECH_MAX, DOCTRINES };
