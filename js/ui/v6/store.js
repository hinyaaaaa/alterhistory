// v6 UI の状態（画面の一時状態だけ。世界の正本は w にあり、ここには置かない）
import { dispatch, AUTHORITY as A } from "../../core/wcde/contract.js";
import { notify } from "./notify.js";
export const S = { w: null, hub: null, sel: null, tab: "politics", map: null, timer: null, notice: "", q: "", tl: { type: "events", kind: "", text: "", entity: "", from: "", to: "" }, fileWarn: [], layerOpen: null, war: null, entity: { culture: null, language: null, religion: null }, tech: null, doc: null, fin: false, hooks: {} };
/** 操作の名前（通常通知の文面）。操作の結果は、成功も失敗も、短く具体的に通知する */
const LABEL = { "state.act": "国家の行動", "state.reorganize": "編制の変更", "state.adoptDoctrine": "ドクトリンの取得", "diplomacy.peace": "講和の申し入れ", "war.direct": "戦争の方針の指示", "creator.intervene": "介入", "creator.catastrophe": "災厄", "creator.editState": "国家の編集", "creator.rename": "名前の編集", "creator.cancelIntervention": "介入の取り消し", "control.take": "国家の担当", "control.release": "担当の解除", "calendar.edit": "暦の表示名の変更", "creator.techGrant": "技術の付与" };
const tell = (c, r, quiet) => { const n = LABEL[c.type] ?? c.type; if (!r.ok) notify("error", `${n}に失敗: ${r.error ?? "不明なエラー"}`); else if (!quiet && LABEL[c.type]) notify("ok", `${n}を実行しました`); };
export const run = (c) => { const r = dispatch(S.w, { authority: A.ADMIN, ...c }); S.notice = r.ok ? "" : r.error ?? "失敗"; if (!r.ok && !["clock.run", "clock.setSpeed", "news.ack"].includes(c.type)) tell(c, r); else if (r.ok && LABEL[c.type]) tell(c, r); return r; };
/** 担当国家の行動（権限は担当）。失敗は理由を表示する */
export const act = (c) => { const r = dispatch(S.w, { authority: A.PLAYER, ...c }); S.notice = r.ok ? "" : r.error ?? "失敗"; tell(c, r); S.hooks.render?.(); return r; };
export const creator = (c) => { const r = dispatch(S.w, { authority: A.CREATOR, ...c }); S.notice = r.ok ? "" : r.error ?? "失敗"; tell(c, r); S.hooks.render?.(); return r; };
export const stateName = (id) => S.w.civ.states[id]?.name ?? id;
export const aliveStates = () => Object.values(S.w.civ.states).filter((s) => s.alive);
export const controlled = () => S.w.civ.wcde.control.stateId;
