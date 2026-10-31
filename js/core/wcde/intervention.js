// v6 M6: 創造主の介入（一時的な補正と、漸進的な収束）。仕様 §4。
//   ・創造主は、WCDE が計算する値（産業力・財政・軍事能力・正統性など）を直接指定できる。指定値は「有効値」としてシミュレーション・AI・戦争研究所が実際に読む（表示だけの上書きではない）。
//   ・永続的な固定ではない。介入の瞬間に「指定値 − 通常計算値」を初期補正量として記録し、補正だけを月ごとに半減期 H で減らす（残存 = 初期補正 × 0.5^(経過月/H)。経過月から直接求めるので、保存・復元後も同じ値）。
//   ・通常計算値の更新は介入中も続く（有効値 = 通常値(t) + 残存補正(t)）。通常値へ介入後の値を取り込まない。
//   ・介入中に実際に起きた結果（生産・投資・人口・損失・外交など）は世界の事実として残り、補正の減衰では巻き戻さない（補正は有効値にだけ効く）。
//   ・同じ国・同じ項目への再介入は、前の介入を「置き換え済み」にして、新しい通常値から数え直す（補正の二重適用・自己増殖はしない）。
//   ・介入は civ.wcde.interventions に記録し、歴史の事実（events）とは混ぜない。実行可能な不整合（産業力と技術の食い違いなど）は黙って直さない。NaN・Infinity・型の不一致・存在しない対象は拒否する。
import { FIELDS, nominalOf } from "./domains/effective.js";

export const MAX_REASON = 200;
export const initInterventions = () => ({ records: [] });
const ledger = (civ) => (civ.wcde.interventions ??= initInterventions());
export const interventionsOf = (civ) => ledger(civ).records;
export const activeInterventions = (civ) => ledger(civ).records.filter((r) => r.status === "active");
const fin = (x) => typeof x === "number" && Number.isFinite(x);

/** 残存補正（経過月から直接求める。決定的） */
export const residualAt = (rec, monthIndex) => rec.residual0 * Math.pow(0.5, Math.max(0, monthIndex - rec.startMonth) / rec.halfLife);

/** 有効な介入から、読み取り用の補正の表（civ.wcde.adjust）を作り直す。派生データで、正本は records */
export function rebuildAdjust(civ) {
  const adj = (civ.wcde.adjust ??= {}); for (const k of Object.keys(adj)) delete adj[k];
  for (const r of ledger(civ).records) if (r.status === "active") (adj[r.targetId] ??= {})[r.field] = { add: r.residual };
}

/** 検証だけ（何も変えない）。{ ok, error } または { ok, plan } */
export function planIntervention(w, { stateId, field, value, reason = "", halfLifeMonths = null }) {
  const { civ } = w, fail = (error) => ({ ok: false, error }), f = FIELDS[field];
  if (!f) return fail(`「${field}」は介入できる項目ではありません（${Object.keys(FIELDS).join("・")}）`);
  const st = civ.states[stateId]; if (!st?.alive) return fail("その国家は存在しません");
  if (!fin(value)) return fail("値が数値ではありません（NaN・Infinity・型の不一致は介入できません）");
  if (value < f.min || value > f.max) return fail(`${f.ja}は ${f.min}〜${f.max} の範囲で指定してください`);
  if (typeof reason !== "string" || reason.length > MAX_REASON) return fail(`理由の注釈は ${MAX_REASON} 文字までの文字列です`);
  let half = f.half; if (halfLifeMonths != null) { if (!fin(halfLifeMonths) || halfLifeMonths < 1 || halfLifeMonths > 1200) return fail("減衰の半減期は 1〜1200 か月"); half = halfLifeMonths; }
  const nominal = nominalOf(civ, st, field); if (!fin(nominal)) return fail(`${f.ja}はまだ算出されていません（次の月次処理のあとで介入できます）`);
  const residual0 = value - nominal; if (Math.abs(residual0) < f.eps) return fail(`指定値が通常計算値（${Math.round(nominal * 1000) / 1000}）とほぼ同じです`);
  return { ok: true, plan: { st, f, nominal, residual0, half, reason: reason.trim() } };
}

/** 介入を作る。同じ国・同じ項目の有効な介入は「置き換え済み」にする。{ ok, id, nominal, residual0 } */
export function createIntervention(w, args, authority = "creator_intervention") {
  const p = planIntervention(w, args); if (!p.ok) return p;
  const { civ } = w, { st, nominal, residual0, half, reason } = p.plan, L = ledger(civ), mi = civ.monthIndex, id = w.sim.ctx.ids.next("intervention");
  let supersedes = null; for (const r of L.records) if (r.status === "active" && r.targetId === st.id && r.field === args.field) { r.status = "superseded"; r.endedAt = mi; r.supersededBy = id; supersedes = r.id; }
  L.records.push({ id, targetId: st.id, field: args.field, nominalAtStart: nominal, target: args.value, residual0, residual: residual0, startMonth: mi, halfLife: half, mode: "add", status: "active", authority, reason, supersedes, endedAt: null, changes: [{ at: mi, target: args.value }] });
  rebuildAdjust(civ); return { ok: true, id, nominal, residual0, supersedes };
}

/** 創造主が介入を取り消す（残りの補正を取り除く。すでに起きた結果は戻さない）。AI は呼べない（命令の権限表） */
export function cancelIntervention(w, { id }) {
  const { civ } = w, r = ledger(civ).records.find((x) => x.id === id); if (!r) return { ok: false, error: "その介入はありません" }; if (r.status !== "active") return { ok: false, error: `その介入はすでに終わっています（${r.status}）` };
  r.status = "cancelled"; r.endedAt = civ.monthIndex; rebuildAdjust(civ); return { ok: true, id };
}

/** tick 手順 2（clock の直後）: 介入補正の減衰。当月に使う有効値をここで確定する */
export function stepInterventions(ctx) {
  const { civ } = ctx; if (!civ.options.wcde) return; const L = civ.wcde.interventions; if (!L) return; let changed = false; const mi = civ.monthIndex;
  for (const r of L.records) {
    if (r.status !== "active") continue; changed = true;
    if (!civ.states[r.targetId]?.alive) { r.status = "target_gone"; r.endedAt = mi; continue; }
    const res = residualAt(r, mi); if (Math.abs(res) < Math.max(FIELDS[r.field].eps, 1e-3 * Math.abs(r.residual0))) { r.status = "converged"; r.endedAt = mi; r.residual = 0; } else r.residual = res;
  }
  if (changed) rebuildAdjust(civ);
}

/** 整合性（構造の破損だけを検出する。因果的な不整合は許容し、ここでは直さない） */
export function checkInterventions(civ) {
  const errs = [], L = civ.wcde?.interventions; if (!L) return errs; const seen = new Set(), ids = new Set();
  for (const r of L.records) {
    if (ids.has(r.id)) errs.push(`介入 ${r.id} が重複`); ids.add(r.id);
    if (!FIELDS[r.field]) errs.push(`介入 ${r.id} の項目 ${r.field} が未知`);
    for (const k of ["nominalAtStart", "target", "residual0", "residual", "halfLife"]) if (!fin(r[k])) errs.push(`介入 ${r.id}.${k} が有限でない`);
    if (!["active", "converged", "superseded", "cancelled", "target_gone"].includes(r.status)) errs.push(`介入 ${r.id} の状態 ${r.status} が不正`);
    if (!civ.states[r.targetId]) errs.push(`介入 ${r.id} の対象 ${r.targetId} が無い`);
    if (r.status === "active") { const k = r.targetId + "|" + r.field; if (seen.has(k)) errs.push(`同じ項目に有効な介入が複数ある（${k}）`); seen.add(k); const a = civ.wcde.adjust?.[r.targetId]?.[r.field]; if (!a || Math.abs(a.add - r.residual) > 1e-9) errs.push(`介入 ${r.id} の補正の表が記録と一致しない`); }
  }
  const adj = civ.wcde.adjust ?? {}; for (const sid of Object.keys(adj)) for (const f of Object.keys(adj[sid])) if (!seen.has(sid + "|" + f)) errs.push(`補正の表 ${sid}.${f} に対応する有効な介入が無い`);
  return errs;
}
