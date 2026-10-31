// v6 UI の状態（画面の一時状態だけ。世界の正本は w にあり、ここには置かない）
import { dispatch, AUTHORITY as A } from "../../core/wcde/contract.js";
export const S = { w: null, hub: null, sel: null, tab: "politics", map: null, timer: null, notice: "", q: "", tl: { type: "events", kind: "", text: "", entity: "", from: "", to: "" }, fileWarn: [], layerOpen: null, war: null, entity: { culture: null, language: null, religion: null }, tech: null, doc: null, fin: false, hooks: {} };
export const run = (c) => { const r = dispatch(S.w, { authority: A.ADMIN, ...c }); S.notice = r.ok ? "" : r.error ?? "失敗"; return r; };
/** 担当国家の行動（権限は担当）。失敗は理由を表示する */
export const act = (c) => { const r = dispatch(S.w, { authority: A.PLAYER, ...c }); S.notice = r.ok ? "" : r.error ?? "失敗"; S.hooks.render?.(); return r; };
export const creator = (c) => { const r = dispatch(S.w, { authority: A.CREATOR, ...c }); S.notice = r.ok ? "" : r.error ?? "失敗"; S.hooks.render?.(); return r; };
export const stateName = (id) => S.w.civ.states[id]?.name ?? id;
export const aliveStates = () => Object.values(S.w.civ.states).filter((s) => s.alive);
export const controlled = () => S.w.civ.wcde.control.stateId;
