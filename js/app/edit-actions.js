import { planSetWorldInfo } from "../core/edit/world-info.js";
import { planChangeLeader, leaderCandidates, ensureLeaders } from "../core/edit/leaders.js";
import { planSetRegime, REGIME_BY_KEY } from "../core/edit/regimes.js";
import { planSetTechDoctrine, planSetMilitaryDoctrine, getTechDoctrine } from "../core/edit/doctrines.js";
// 編集アクション：編集ツールの操作を Store の commit に変換する。
// UI から呼ばれる。ロジック自体は core/edit/* にあり、ここは配線と通知だけ。

import { PAINT_KINDS, planPaint, planBiomePaint, planHeightPaint } from "../core/edit/paint.js";
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
import { planAddTemporaryZone, resolveZoneScope } from "../core/edit/zones.js";
import { getTechLevel, TECH_MIN, TECH_MAX } from "../core/edit/economy.js";
import { planSetDoctrine, getDoctrine, DOCTRINES, DEFAULT_DOCTRINE } from "../core/edit/military-doctrine.js";
import {
  suggestName as planSuggestName, isProvisional, planSetProvisional, withProvisional,

} from "../core/edit/naming.js";
import { suggestLabel } from "../core/edit/naming.js";
import { getLanguage, parentCultureOf, planSetLanguageWord, planRerollLanguageWord, planRegenerateLanguage } from "../core/edit/language.js";
import { lexiconRows, placeName as langPlace, personName as langPerson, renderWord as langRender, renderToken as langToken } from "../core/names/language.js";
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
    isProvisional(kind, id) { return withMap((map) => isProvisional(map, kind, id)) ?? false; },
    /** 仮の名前を確定する（名前は変えず、「仮」の印だけ外す） */
    confirmName(kind, id) { withMap((map) => safeRun("名前の確定", () => commitOrThrow(planSetProvisional(map, kind, id, false)))); },
    /** 文化の名前の系統（明示されたもの。無ければ null）と、実際に使われる系統 */

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
    /** 標高の調整（target: 1=上げる 2=下げる 3=ならす）。水域は変わらない（Undo可能） */
    paintHeight(target, cells) {
      withMap((map) => safeRun("標高の変更", () => {
        const { command } = planHeightPaint(map, { mode: target, cells });
        if (command) commitOrThrow(command);
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

    setWorldInfo(kind, id, patch) { return !!withMap((map) => { let ok = false; safeRun("情報の変更", () => { const c = planSetWorldInfo(map, kind, id, patch); if (c) { store.commit(c); rerender(); } ok = true; }); return ok; }); },
    /** 君主交代（国家の「操作」から）。成功なら true */
    leaderCandidates(stateId, opts) { return withMap((map) => leaderCandidates(map, stateId, opts)) ?? []; },
    changeLeader(stateId, opts) { return !!withMap((map) => { let ok = false; safeRun("指導者の交代", () => { store.commit(planChangeLeader(map, stateId, opts)); rerender(); ok = true; }); return ok; }); },
    // ---- ゾーン（疫病・災害の一時表示）。年表の「＋ 出来事を記録」から、選択だけで作る。確定するまで何も残さない ----
    /** 種類・範囲・期間を選んで確定する。年表に1件とゾーンが同時にでき、Undo は1回。成功なら zid、失敗なら null */
    recordZoneEvent({ type, scope, months, date = null } = {}) {
      return withMap((map) => {
        let zid = null;
        safeRun("疫病・災害の記録", () => {
          const sc = resolveZoneScope(map, scope);
          const r = planAddTemporaryZone(map, { type, cells: sc.cells, months, date, scopeName: sc.name, states: sc.states });
          store.commit(r.command); rerender(); zid = r.zid;
        });
        return zid;
      }) ?? null;
    },
    // --- 簡易言語（v2.7.0）---
    /** 文化の言語の表示用データ（音の体系・語順・系統・語根辞書・試しの名前）。言語が無い文化は null */
    languageView(cultureId, salt = 0) {
      return withMap((map) => {
        const lang = getLanguage(map, cultureId); if (!lang) return null;
        const pid = parentCultureOf(map, cultureId), parent = pid ? getLanguage(map, pid) : null, r = createRandom(cultureId * 7919 + 13 + salt * 101);
        const feat = [["river"], ["coast"], ["mountain"], ["forest"], [], []];
        return {
          id: cultureId, name: map.pack.cultures[cultureId].name, parentId: pid, parentName: pid ? map.pack.cultures[pid].name : null,
          order: lang.order, link: lang.link, phon: lang.phon, changes: (lang.changes ?? []).filter((c) => c.from === cultureId || c.from == null), allChanges: lang.changes ?? [],
          rows: lexiconRows(lang, parent), cats: { geo: "地形", place: "居住地・施設", qual: "性質", nat: "自然・物", soc: "人・社会" },
          samples: { places: feat.map((f) => langPlace(lang, r, f)), people: [langPerson(lang, r, "m").full, langPerson(lang, r, "f").full, langPerson(lang, r, "m").full] },
          example: (() => { const r = langRender(lang.lex.river), t = langRender(lang.lex.town), l = lang.link ? langToken(lang.link === "no" ? "no" : lang.link) : ""; return { river: r, town: t, joined: lang.order === "HM" ? t + l + r : r + l + t }; })(),
        };
      }) ?? null;
    },
    /** 語根辞書の語を手で直す（カタカナ 1〜8 文字）。直せたら true（不正な語は画面にエラーを出す） */
    setLanguageWord(cultureId, key, kana) {
      return withMap((map) => { let ok = false; safeRun("語の変更", () => { const c = planSetLanguageWord(map, cultureId, key, kana); if (c) commitOrThrow(c); ok = true; }); return ok; }) ?? false;
    },
    /** 語を、その言語の音の体系で作り直す */
    rerollLanguageWord(cultureId, key) {
      return withMap((map) => { let ok = false; safeRun("語の作り直し", () => { commitOrThrow(planRerollLanguageWord(map, cultureId, key, rnd)); ok = true; }); return ok; }) ?? false;
    },
    /** 言語を丸ごと作り直す（親の文化があれば、親から音変化で作り直す） */
    regenerateLanguage(cultureId) {
      return withMap((map) => { let ok = false; safeRun("言語の作り直し", () => { commitOrThrow(planRegenerateLanguage(map, cultureId, rnd)); ok = true; }); return ok; }) ?? false;
    },
    /** 同盟・ゾーン・最高神・時代の名前をランダムに作る（既存の名前と被らない） */
    suggestLabel(kind, ctx = {}) { return withMap((map) => suggestLabel(map, { kind, rnd, ...ctx })) ?? ""; },

    /** 国の税率・国庫（未設定なら政体から補った値） */
    getFinance(stateId) { return withMap((map) => { const s = map.pack.states[stateId]; return s ? getFinance(s) : null; }) ?? null; },
    /** patch: { salesTax?, pollTax?, treasury? }（Undo可能） */
    setFinance(stateId, patch) { withMap((map) => safeRun("財政の変更", () => commitOrThrow(planSetFinance(map, stateId, patch)))); },
    getTechLevel(stateId) { return withMap((map) => getTechLevel(map, stateId)) ?? null; },
    getTechDoctrine(stateId) { return withMap((map) => getTechDoctrine(map.pack.states[stateId])) ?? null; },
    /** patch: { agri?, ind?, transport?, comms?, medicine?, energy? }（各 1〜10。解禁条件なし。Undo可能） */
    setTechDoctrine(stateId, patch) {
      withMap((map) => safeRun("技術ドクトリンの変更", () => {
        const before = getTechLevel(map, stateId);
        commitEv(map, planSetTechDoctrine(map, stateId, patch), { type: "tech", title: `${nameOf(map.pack.states[stateId])}の技術ドクトリンが変わった`, detail: `技術水準 Lv${before} → Lv${getTechLevel(map, stateId)}` });
      }));
    },
    /** 指導者のいない国に初代を置く（年表には残さない）。置いたら true */
    ensureLeaders() { return !!withMap((map) => { const n = ensureLeaders(map); if (n) rerender(); return n; }); },
    setRegime(stateId, key) {
      withMap((map) => safeRun("政体の変更", () => {
        const from = map.pack.states[stateId]?.formName;
        commitEv(map, planSetRegime(map, stateId, key), { type: "regime", title: `${nameOf(map.pack.states[stateId])}の政体が変わった`, detail: `${from ?? "?"} → ${REGIME_BY_KEY[key]?.label ?? key}` });
      }));
    },
    /** { base?: 総合方針のキー, nodes?: 陸・海・空・固有の節のキー配列 }（解禁条件なし。Undo可能） */
    setMilitaryDoctrine(stateId, spec) {
      withMap((map) => safeRun("軍事ドクトリンの変更", () => commitEv(map, planSetMilitaryDoctrine(map, stateId, spec), { type: "doctrine", title: `${nameOf(map.pack.states[stateId])}が軍事ドクトリンを改めた`, detail: "" })));
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
