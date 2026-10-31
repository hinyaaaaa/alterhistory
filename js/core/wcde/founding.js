// v6 M2: 建国の入口。先史が終わると、国家成立の直前で止まり（phase=founding）、文明候補が示される。
//   フローA（参加）: 候補を選び、国名・政体を決めて建国し、その国家を担当して始める。
//   フローB（委任）: 特定の国家を担当せず、世界を AI に任せて始める（創造主モード）。国家は条件が整った順にシミュレーションが成立させる。
import { evaluateFormation, formState, VIA, POLITY } from "../civ/states.js";
import { spatialOf, invalidateMonthCaches } from "../civ/spatial.js";
import { languageOfGroup } from "./domains/language.js";
import { takeControl } from "./control.js";

const POLITY_CHOICES = { city_state: ["chiefdom", "tribal"], religious_polity: ["theocracy", "tribal"], agri_union: ["tribal", "chiefdom"], nomad_confederation: ["tribal", "chiefdom"] };
const dominant = (g) => g.cohorts.reduce((b, c) => (c.share > b.share ? c : b));
const MAX_SEEDS = 600;

/** 今、成立できる文明候補（計算のみ。ID を消費しない）。人口の多い定住集団から順に、重ならないように */
export function listCandidates(w) {
  const { civ, sim } = w, ctx = sim.ctx; ctx._spatial = null; spatialOf(ctx); // 索引を今の月で作り直す
  const seeds = Object.values(civ.groups).filter((g) => g.settlementId && !g.stateId).sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1)).slice(0, MAX_SEEDS), used = new Set(), out = [];
  for (const g of seeds) {
    if (used.has(g.id)) continue; const f = evaluateFormation(ctx, g); if (!f || f.groupIds.some((i) => used.has(i))) continue;
    for (const i of f.groupIds) used.add(i);
    const gs = f.groupIds.map((i) => civ.groups[i]), cap = gs.reduce((a, b) => (b.pop > a.pop ? b : a)), d = dominant(cap);
    out.push({ via: f.via, viaJa: VIA[f.via].ja, groupIds: f.groupIds, seedGroupId: g.id, capitalGroupId: cap.id, cell: cap.cell, pop: Math.round(gs.reduce((s, x) => s + x.pop, 0)), cultureId: d.cultureId, languageId: languageOfGroup(cap), religionId: d.religionId, speciesId: cap.speciesId, polityOptions: POLITY_CHOICES[f.via] ?? ["tribal"] });
  }
  return out;
}
/** 候補を保存する（ID は首都集団＋経路で安定させる。再計算しても同じ候補は同じ ID） */
export function refreshCandidates(w) {
  const { civ, sim } = w, prev = new Map((civ.wcde.candidates ?? []).map((c) => [c.seedGroupId + "|" + c.via, c.id])), list = listCandidates(w);
  civ.wcde.candidates = list.map((c) => ({ id: prev.get(c.seedGroupId + "|" + c.via) ?? sim.ctx.ids.next("candidate"), ...c }));
  return civ.wcde.candidates;
}
/** フローA: 建国して、その国家を担当する */
export function foundAsPlayer(w, { candidateId, name = null, polity = null }) {
  const { civ, sim } = w, ctx = sim.ctx, c = (civ.wcde.candidates ?? []).find((x) => x.id === candidateId); if (!c) return { ok: false, error: "その候補はありません" };
  const cap = civ.groups[c.seedGroupId]; if (!cap || cap.stateId) return { ok: false, error: "その候補は成立できなくなっています（集団が無い・すでに国家に属している）" };
  ctx._spatial = null; const f = evaluateFormation(ctx, cap); if (!f || f.via !== c.via) return { ok: false, error: "その候補は、条件が変わって成立しません" };
  let nm = null; if (name != null) { nm = String(name).trim(); if (!nm || nm.length > 30) return { ok: false, error: "国名は 1〜30 文字" }; if (Object.values(civ.states).some((s) => s.alive && s.name === nm)) return { ok: false, error: "同じ名前の国がすでにあります" }; }
  if (polity != null && !c.polityOptions.includes(polity)) return { ok: false, error: `この成立経路で選べる政体: ${c.polityOptions.join("・")}` };
  const st = formState(ctx, { ...f, player: true, name: nm, polity }); if (!st) return { ok: false, error: "国家の形成に失敗しました" };
  invalidateMonthCaches(ctx); const r = takeControl(w, st.id); if (!r.ok) return r;
  civ.wcde.phase = "running"; civ.wcde.foundedAt = civ.monthIndex; civ.wcde.candidates = []; return { ok: true, stateId: st.id };
}
/** フローB: 国家を担当せず、世界を AI に任せて始める */
export function delegateToWorld(w) { const { civ } = w; civ.wcde.phase = "running"; civ.wcde.foundedAt = civ.monthIndex; civ.wcde.control.stateId = null; return { ok: true }; }
