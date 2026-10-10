// 共通の初期設定：国家・文化・宗教・属州を「入力して確定」で作る。
//
// 方針:
//   ・確定するまで、地図にも年表にも何も残さない（入力中の国名の試行錯誤は記録されない）。
//   ・確定すると、作成・色・政体や種類・起源・おまかせ領土・首都までを「全部成功か全部取り消し」で行い、
//     年表には最終的な内容で「建国」などを1件だけ残す。Undo も1回で全部戻る。
//   ・確定後の改名・政変などは、これまで通り別の出来事として記録される。
// ロジックは core/edit/* の plan 関数に任せ、ここは手順と配線だけを持つ。

import { planAddEntity, planAddProvince, pickNewColor } from "../core/edit/entities.js";
import { planSetEntityProfile, planSetOrigins } from "../core/edit/profile.js";
import { planPaint } from "../core/edit/paint.js";
import { pickAutoTerritory, pickCapitalCell, countFreeLand, TERRITORY_SIZES } from "../core/edit/territory.js";
import { planAddBurg } from "../core/edit/burgs.js";
import { suggestName as planSuggestName } from "../core/edit/naming.js";
import { planLogEvent } from "../core/edit/history-log.js";
import { createRandom } from "../core/random.js";

export const SETUP_KINDS = Object.freeze(["state", "culture", "religion", "province"]);
export const SETUP_LABEL = Object.freeze({ state: "国家", culture: "文化", religion: "宗教", province: "属州" });
export { TERRITORY_SIZES };

const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
const nameOf = (e) => e?.fullName ?? e?.name ?? "";

/**
 * @param {{store:object, renderer?:{requestRender:()=>void}}} deps
 */
export function createSetupActions({ store, renderer }) {
  const rnd = createRandom((Date.now() ^ 0x2f6e2b1) >>> 0);
  const rerender = () => renderer?.requestRender?.();
  const mapOf = () => store.getState().map;

  return {
    SETUP_KINDS, SETUP_LABEL, TERRITORY_SIZES,

    /** 入力欄を埋めるための名前の案（地図は変えない）。{ name, extra } */
    suggest(kind, ctx = {}) {
      const map = mapOf(); if (!map) return null;
      const r = planSuggestName(map, { kind, rnd, ...ctx });
      return { name: r.name, extra: r.extra ?? {} };
    },
    /** 色の初期値（新しい実体らしい色を自動で選ぶ） */
    suggestColor(kind) {
      const map = mapOf(); if (!map) return "#888888";
      return pickNewColor(map, kind, rnd);
    },
    /** おまかせ領土に使える空き地があるか */
    freeLand(kind) { const map = mapOf(); return map && kind !== "province" ? countFreeLand(map, kind) : 0; },
    /** 属州の所属先・起源の選択肢 */
    choices(kind) {
      const map = mapOf(); if (!map) return [];
      const list = { state: map.pack.states, culture: map.pack.cultures, religion: map.pack.religions }[kind] ?? [];
      return list.filter(isLive).map((e) => ({ id: e.i, name: nameOf(e) }));
    },

    /**
     * 確定：入力された内容で新しい実体を作る。途中で失敗したら、何も作らなかったことになる。
     * @param {"state"|"culture"|"religion"|"province"} kind
     * @param {{name?:string, color?:string, form?:string, formName?:string, type?:string, deity?:string,
     *          origins?:number[], stateId?:number, territory?:"later"|"s"|"m"|"l", capital?:boolean, baseExtra?:object}} spec
     * @returns {{id:number, name:string, claimed:number, warning:string|null, capital:string|null}}
     */
    create(kind, spec = {}) {
      if (!SETUP_KINDS.includes(kind)) throw new Error(`この種類は作れません: ${kind}`);
      if (!mapOf()) throw new Error("地図を開いてください");
      const label = SETUP_LABEL[kind];
      const out = store.transaction(`${label}を新規作成`, () => {
        const commit = (plan) => { if (plan) store.commit(plan); };

        // 名前：空欄ならおまかせ（このときだけ、生成された政体・神名もそのまま使う）
        let name = (spec.name ?? "").trim(), extra = {};
        if (!name) {
          const g = planSuggestName(mapOf(), { kind, rnd, stateId: spec.stateId });
          name = g.name; extra = g.extra ?? {};
        } else if (spec.baseExtra && typeof spec.baseExtra === "object") {
          extra = spec.baseExtra; // 🎲 で決めた名前のまま確定されたときは、その案の付属項目（国の短い名前など）も使う
        }

        // 作成
        let id;
        if (kind === "province") {
          const r = planAddProvince(mapOf(), { state: Number(spec.stateId), name, rnd, color: spec.color });
          commit(r.command); id = r.id;
        } else {
          const r = planAddEntity(mapOf(), { kind, name, rnd, extra, color: spec.color });
          commit(r.command); id = r.id;
        }

        // 政体・種類・最高神（入力されたものだけ。値の検査は planSetEntityProfile に任せる）
        const patch = {};
        const take = (...keys) => { for (const k of keys) if (typeof spec[k] === "string" && spec[k].trim()) patch[k] = spec[k].trim(); };
        if (kind === "state") take("form", "formName", "type");
        else if (kind === "culture") take("type");
        else if (kind === "religion") take("type", "deity");
        if (Object.keys(patch).length) commit(planSetEntityProfile(mapOf(), kind, id, patch));

        // 起源（文化・宗教）
        if ((kind === "culture" || kind === "religion") && Array.isArray(spec.origins) && spec.origins.some((o) => Number(o) > 0)) {
          commit(planSetOrigins(mapOf(), kind, id, spec.origins.map(Number)));
        }

        // おまかせ領土
        let claimed = 0, warning = null;
        if (kind !== "province" && spec.territory && spec.territory !== "later") {
          const pick = pickAutoTerritory(mapOf(), { kind, size: spec.territory, rnd, ownCells: [] });
          if (!pick.cells.length) warning = "no-free-land";
          else {
            const p = planPaint(mapOf(), { kind, target: id, cells: pick.cells });
            if (p.command) { commit(p.command); claimed = p.report?.changed ?? pick.cells.length; }
          }
        }

        // 首都（国家で、領土が決まったときだけ）
        let capital = null, capitalCell;
        if (kind === "state" && spec.capital && claimed > 0) {
          const cell = pickCapitalCell(mapOf(), id);
          if (cell >= 0) {
            const bn = planSuggestName(mapOf(), { kind: "burg", rnd, cell }).name;
            const b = planAddBurg(mapOf(), { cell, name: bn, capital: true, rnd });
            commit(b.command); capital = bn; capitalCell = cell;
          }
        }

        // 年表には、最終的な内容で1件だけ
        const ent = mapOf().pack[{ state: "states", culture: "cultures", religion: "religions", province: "provinces" }[kind]][id];
        const finalName = nameOf(ent);
        const bits = [];
        if (kind === "state") { if (ent.formName) bits.push(`政体: ${ent.formName}`); }
        if (kind === "religion" && ent.deity) bits.push(`最高神: ${ent.deity}`);
        if (claimed) bits.push(`領土: ${claimed}セル`);
        if (capital) bits.push(`首都: ${capital}`);
        const ownerName = kind === "province" ? nameOf(mapOf().pack.states[Number(spec.stateId)]) : "";
        const title = {
          state: `国家「${finalName}」が建国された`,
          culture: `文化「${finalName}」が誕生した`,
          religion: `宗教「${finalName}」が誕生した`,
          province: `属州「${finalName}」が${ownerName}に設置された`,
        }[kind];
        commit(planLogEvent(mapOf(), {
          type: `created-${kind}`, title, detail: bits.length ? bits.join(" / ") : undefined,
          states: kind === "state" ? [id] : kind === "province" ? [Number(spec.stateId)] : undefined,
          cell: capitalCell,
        }));
        return { id, name: finalName, claimed, warning, capital };
      });
      rerender();
      return out;
    },
  };
}
