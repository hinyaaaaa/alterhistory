// v6 M5: 担当国家と創造主権限。
//   ・担当できる国家は同時に最大1つ（担当国家の命令は player_order）。担当が無いとき（創造主モード）は、すべての国家が AI で動く。
//   ・表示する国家と担当する国家は別（表示は UI の状態で、世界を変えない）。
//   ・創造主は、担当の有無にかかわらず、どの国家・文化・言語・宗教にも直接の編集ができる（編集は記録に残り、シミュレーションの事実とは区別される）。
//     計算で決まる値（産業力・軍事能力など）は、ここでは直接変えない（M6 の介入として、記録・期間・因果つきで扱う）。
import { POLITY } from "../civ/states.js";
import { makeEvent } from "../civ/events.js";

const fail = (error) => ({ ok: false, error });
export const controlledState = (civ) => { const id = civ.wcde.control.stateId; return id ? civ.states[id] ?? null : null; };

/** 国家を担当する（同時に1つ。別の国家を担当していたら、その担当を外して付け替える） */
/** 担当が変わるとき: 戦争の方針（プレイヤーの高位の指示）と、国家の計画中の戦略を捨てる。戦争の作戦そのものは残る（AI が同じ経路で続ける） */
function dropPlayerPlans(civ, st) { st.strategy = null; st.campaign = null; for (const id of civ.activeWarIds) { const o = civ.wars[id]?.ops; if (o?.direction) delete o.direction[st.id]; } }
export function takeControl(w, stateId) {
  const { civ } = w, st = civ.states[stateId]; if (!st?.alive) return fail("その国家は存在しません");
  // 担当の切替: 前の担当国家は AI に戻る（AI が自分の方針で再開できるよう、プレイヤーの戦争の方針・計画中の戦略は破棄する）。新しい担当国家の進行中の戦略もいったん捨てる
  for (const s of Object.values(civ.states)) if (s.player && s.id !== stateId) { s.player = false; dropPlayerPlans(civ, s); }
  dropPlayerPlans(civ, st); st.player = true; civ.wcde.control.stateId = stateId; civ.wcde.control.since = civ.monthIndex; w.sim.ctx._byState = null;
  return { ok: true, stateId };
}
export function releaseControl(w) {
  const { civ } = w; for (const s of Object.values(civ.states)) { if (s.player) dropPlayerPlans(civ, s); s.player = false; } civ.wcde.control.stateId = null; civ.wcde.control.since = null; return { ok: true };
}
/** 担当国家が滅びたら、担当を外す（記録に残す）。tick の最後に呼ぶ */
export function syncControl(civ) {
  const id = civ.wcde.control.stateId; if (id && !civ.states[id]?.alive) { civ.wcde.log = (civ.wcde.log ?? []).concat([{ at: civ.monthIndex, type: "control.lost", ok: true, stateId: id }]).slice(-500); civ.wcde.control.stateId = null; civ.wcde.control.since = null; }
}

/** 創造主の編集（直接設定できる項目だけ）。範囲・型を検証し、変更前後を記録する */
const FIELDS = {
  name: { get: (s) => s.name, set: (s, v) => { s.name = v; s.nameBase = null; /* 創造主が付けた名前は、政体が変わっても自動では改めない */ }, check: (v) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 30 ? v.trim() : null },
  polity: { get: (s) => s.polity, set: (s, v) => { s.polity = v; }, check: (v) => (v in POLITY ? v : null) },
  "policy.tax": { get: (s) => s.policy.tax, set: (s, v) => { s.policy.tax = v; }, check: (v) => (typeof v === "number" && v >= 0.02 && v <= 0.4 ? v : null) },
  "policy.mobilization": { get: (s) => s.policy.mobilization, set: (s, v) => { s.policy.mobilization = v; }, check: (v) => (typeof v === "number" && v >= 0 && v <= 1 ? v : null) },
  "policy.tolerance": { get: (s) => s.policy.tolerance, set: (s, v) => { s.policy.tolerance = v; }, check: (v) => (typeof v === "number" && v >= 0 && v <= 1 ? v : null) },
  "policy.assimilation": { get: (s) => s.policy.assimilation, set: (s, v) => { s.policy.assimilation = v; }, check: (v) => (typeof v === "number" && v >= 0 && v <= 1 ? v : null) },
  "policy.autonomy": { get: (s) => s.policy.autonomy, set: (s, v) => { s.policy.autonomy = v; }, check: (v) => (typeof v === "number" && v >= 0 && v <= 1 ? v : null) },
  treasury: { get: (s) => s.treasury, set: (s, v) => { s.treasury = v; }, check: (v) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e7 ? v : null) },
  stability: { get: (s) => s.stability, set: (s, v) => { s.stability = v; }, check: (v) => (typeof v === "number" && v >= 0 && v <= 1 ? v : null) },
  "leader.name": { get: (s) => s.leader.name, set: (s, v) => { s.leader.name = v; }, check: (v) => (typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 30 ? v.trim() : null) },
};
export const EDITABLE_STATE_FIELDS = Object.freeze(Object.keys(FIELDS));
export function creatorEditState(w, { stateId, changes }) {
  const { civ } = w, st = civ.states[stateId]; if (!st?.alive) return fail("その国家は存在しません"); if (!changes || typeof changes !== "object" || !Object.keys(changes).length) return fail("変更がありません");
  const plan = []; for (const [k, raw] of Object.entries(changes)) { const f = FIELDS[k]; if (!f) return fail(`「${k}」は創造主の直接編集の対象ではありません（編集できる項目: ${EDITABLE_STATE_FIELDS.join("・")}）`); const v = f.check(raw); if (v == null) return fail(`「${k}」の値が不正です`); plan.push([k, f, v]); }
  const done = []; for (const [k, f, v] of plan) { const before = f.get(st); f.set(st, v); if (k === "leader.name") { st.leader.name = v; st.leader.renamedByCreator = true; /* 別人への交代ではなく、同じ人物の名前の変更として人物の記録へ反映する（people.js） */ } done.push({ targetId: stateId, property: k, before, after: v }); }
  (civ.wcde.edits ??= []).push(...done.map((d) => ({ at: civ.monthIndex, authority: "creator_intervention", ...d }))); if (civ.wcde.edits.length > 2000) civ.wcde.edits.splice(0, civ.wcde.edits.length - 2000);
  // v6.1.0 M7: 創造主の直接編集は、介入の台帳（civ.wcde.edits）にだけ残す。世界の事実の出来事（civ.events）とは混ぜない
  w.sim.ctx._byState = null; return { ok: true, edited: done.map((d) => d.property) };
}
/** 文化・言語・宗教の名前の編集（定義の編集。歴史の事実は変えない） */
export function creatorRename(w, { kind, id, name }) {
  const { civ } = w, table = { culture: civ.cultures, language: civ.languages, religion: civ.religions }[kind]; if (!table) return fail("対象は culture / language / religion");
  const e = table[id]; if (!e) return fail("その定義がありません"); const n = typeof name === "string" ? name.trim() : ""; if (!n || n.length > 30) return fail("名前は 1〜30 文字");
  const before = e.name; e.name = n; if (kind === "culture") e.nameFixed = true;
  (civ.wcde.edits ??= []).push({ at: civ.monthIndex, authority: "creator_intervention", targetId: id, property: "name", before, after: n });
  return { ok: true };
}
