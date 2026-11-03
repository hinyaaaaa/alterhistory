// v6.1.0 M3: 創造主による技術の編集（仕様 §6.4）。通常の AI・プレイヤーの経路では呼べない（権限 creator_intervention の命令だけ）。
//   ・技術ツリーそのものの編集（前提・効果・解禁）は civ.techOverrides に重ね書きする（基の定義は変えない。取り消せる）。
//   ・世界の知識状態の編集（集団・国家への付与／剥奪）は、前提を欠く付与を拒み、剥奪は依存する技術の機能劣化を伴う。
//   ・どちらも、変更前に「依存する技術・保有する集団・採用する国家」を数えて返し、確認（acknowledge）なしには実行しない。
//   ・編集は創造主の台帳（civ.wcde.edits）へ記録する。歴史の事実（出来事）とは混ぜない。
import { TECH, TECHS, impactOf, prereqOf, refreshCand, stateCan } from "../civ/tech.js";
const fail = (error, extra = {}) => ({ ok: false, error, ...extra });
const log = (civ, e) => (civ.wcde.edits ??= []).push({ at: civ.monthIndex, authority: "creator_intervention", ...e });
const refreshAll = (civ) => { for (const id in civ.groups) refreshCand(civ.groups[id], civ); };

/** 変更の影響（実行前の確認用）。edit: { key, prereq?, fx?, caps? } */
export function planTechEdit(w, c) {
  const { civ } = w, t = TECH[c.key]; if (!t) return fail("未知の技術");
  if (c.prereq !== undefined) { if (!Array.isArray(c.prereq) || c.prereq.some((p) => !TECH[p])) return fail("前提に未知の技術がある"); if (c.prereq.includes(c.key)) return fail("自分自身を前提にできない"); // 循環の検査: 前提をたどって自分に戻らない
    const seen = new Set(), stack = [...c.prereq]; while (stack.length) { const k = stack.pop(); if (k === c.key) return fail("前提が循環する"); if (seen.has(k)) continue; seen.add(k); stack.push(...prereqOf(civ, TECH[k])); } }
  if (c.fx !== undefined && (typeof c.fx !== "object" || Object.values(c.fx).some((v) => !Number.isFinite(v) || v < -1 || v > 3))) return fail("効果は -1〜3 の数");
  if (c.caps !== undefined && (!Array.isArray(c.caps) || c.caps.some((x) => typeof x !== "string"))) return fail("解禁は文字列の配列");
  return { ok: true, impact: impactOf(civ, c.key) };
}
export function techEdit(w, c) {
  const { civ } = w, p = planTechEdit(w, c); if (!p.ok) return p; const i = p.impact;
  if ((i.holders || i.adopters || i.dependents.length) && !c.acknowledge) return fail(`この編集は、依存する技術 ${i.dependents.length} 件・保有する集団 ${i.holders}・採用する国家 ${i.adopters} に影響します。確認してください`, { needsAck: true, impact: i });
  const o = (civ.techOverrides ??= {})[c.key] ??= {}; const before = { prereq: o.prereq ?? t0(c.key).prereq, fx: o.fx ?? t0(c.key).fx, caps: o.caps ?? t0(c.key).caps };
  if (c.prereq !== undefined) o.prereq = [...c.prereq]; if (c.fx !== undefined) o.fx = { ...c.fx }; if (c.caps !== undefined) o.caps = [...c.caps];
  refreshAll(civ); log(civ, { targetId: c.key, property: "techtree", before, after: { prereq: o.prereq ?? before.prereq, fx: o.fx ?? before.fx, caps: o.caps ?? before.caps } });
  return { ok: true, impact: i };
}
const t0 = (k) => TECH[k];
/** 編集を元に戻す（基の定義へ） */
export function techEditReset(w, { key }) { const { civ } = w; if (!civ.techOverrides?.[key]) return fail("編集されていない"); delete civ.techOverrides[key]; if (!Object.keys(civ.techOverrides).length) delete civ.techOverrides; refreshAll(civ); log(civ, { targetId: key, property: "techtree", before: "edited", after: "default" }); return { ok: true }; }

/** 世界の知識の編集: 集団（または国家の全集団）へ技術を付与・剥奪する */
export function techGrant(w, c) {
  const { civ } = w, t = TECH[c.key]; if (!t) return fail("未知の技術"); const mode = c.mode === "revoke" ? "revoke" : "grant";
  const groups = c.stateId ? Object.values(civ.groups).filter((g) => g.stateId === c.stateId) : (c.groupIds ?? []).map((id) => civ.groups[id]).filter(Boolean);
  if (!groups.length) return fail("対象の集団がない"); const mi = civ.monthIndex; let n = 0;
  if (mode === "grant") { for (const g of groups) if (g.tech.known[t.key] == null) { const miss = prereqOf(civ, t).filter((p) => g.tech.known[p] == null); if (miss.length) return fail(`前提の技術が足りない集団がある: ${miss.map((p) => TECH[p].name).join("・")}（前提から付与してください）`); } }
  else { const deps = TECHS.filter((u) => prereqOf(civ, u).includes(t.key) && groups.some((g) => g.tech.known[u.key] != null)); if (deps.length && !c.acknowledge) return fail(`${deps.map((u) => u.name).join("・")}を保有する集団がある。前提を剥奪すると、それらの機能が劣化します。確認してください`, { needsAck: true, impact: { dependents: deps.map((u) => u.key) } }); }
  for (const g of groups) { if (mode === "grant" && g.tech.known[t.key] == null) { g.tech.known[t.key] = mi; delete g.tech.lost[t.key]; refreshCand(g, civ); n++; } else if (mode === "revoke" && g.tech.known[t.key] != null) { delete g.tech.known[t.key]; g.tech.lost[t.key] = true; refreshCand(g, civ); n++; } }
  if (c.stateId && mode === "revoke") { const st = civ.states[c.stateId]; if (st && st.techAdopted[t.key] != null) delete st.techAdopted[t.key]; }
  if (c.stateId && mode === "grant" && c.institutionalize) { const st = civ.states[c.stateId]; if (st) st.techAdopted[t.key] ??= mi; }
  const rec = (civ.techWorld[t.key] ??= { discoveries: [], first: mi, independent: 0, spread: 0, byChannel: {} }); if (mode === "grant") { rec.spread += n; rec.byChannel.creator = (rec.byChannel.creator ?? 0) + n; }
  log(civ, { targetId: c.stateId ?? groups.map((g) => g.id).slice(0, 5).join(","), property: `tech.${t.key}`, before: mode === "grant" ? null : "known", after: mode === "grant" ? "known" : null, count: n });
  return { ok: true, changed: n };
}
export { stateCan };
