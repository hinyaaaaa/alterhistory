// v6.19.0: 災厄からの回復と、世界の再創造。要件 §11。
//   ・災厄は世界全体だけ。人口の損失（1〜100%）と、復活までの年数を決める。人口は、目標の年（±30 年）に向けてなだらかに戻る（収容力も同じ速さで戻す）。
//   ・人口がある程度まで減った国は滅ぶ（大国も特別扱いしない。元の人口が多いから、滅びにくいだけ）。
//   ・人口の消滅 100% が設定されたら、世界を完全に滅ぼし、先史時代から（圧縮して）もう一度始める。旧世界の都市は遺跡として残り、のちの国に発見されて、ニュースになる。
import { hashSeed } from "../civ/civ-state.js";
import { makeEvent } from "../civ/events.js";
import { distKm, dissolveState } from "../civ/states.js";
import { createWcdeCiv, runPrehistory } from "./prehistory.js";
import { finalizeLanguages } from "./domains/language.js";
import { defineReligions } from "./domains/religion.js";
import { refreshCandidates } from "./founding.js";

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const U = (civ, ...p) => (hashSeed(civ.historySeed, "rebirth", ...p) % 1000003) / 1000003;
export const COLLAPSE_POP = 1500, JITTER_YEARS = 30;

/** 災厄の直後に呼ぶ: 各集団に、回復の計画（元の人口・直後の人口・終わりの月）を持たせる。終わりは目標の年 ±30 年 */
export function planRecovery(civ, id, baselines, months) {
  const mi = civ.monthIndex; for (const [gid, b] of baselines) { const g = civ.groups[gid]; if (!g || g.pop >= b * 0.98) continue; const jit = Math.round((U(civ, id, gid, "j") * 2 - 1) * JITTER_YEARS * 12); g.rec = { id, base: b, from: g.pop, at: mi, end: mi + Math.max(12, months + jit) }; }
  (civ.wcde.recov ??= []).push({ id, end: mi + months + JITTER_YEARS * 12 + 12 });
}
export function stepRecovery(ctx) {
  const { civ } = ctx, R = civ.wcde.recov; if (!R?.length) return; const mi = civ.monthIndex; civ.wcde.recov = R.filter((r) => r.end >= mi); if (!civ.wcde.recov.length) { for (const g of Object.values(civ.groups)) delete g.rec; return; }
  for (const g of Object.values(civ.groups)) { const r = g.rec; if (!r) continue; const t = clamp((mi - r.at) / Math.max(1, r.end - r.at)), s = t * t * (3 - 2 * t), target = r.from + (r.base - r.from) * s;
    if (g.pop < target) g.pop = target; g.capMult = clamp(Math.max(0.25, target / Math.max(1, r.base) + 0.04)); g.capUntil = Math.max(g.capUntil ?? 0, mi + 2); if (t >= 1) { delete g.rec; g.capMult = 1; } }
}
/** 国が滅ぶ: 人口が一定以下（1,500 人未満は必ず。5,000 人未満は小さいほど確率が高い） */
export function collapseStates(ctx, tag) {
  const { civ } = ctx, out = []; for (const st of Object.values(civ.states).sort((a, b) => (a.id < b.id ? -1 : 1))) { if (!st.alive) continue; const p = st.pop ?? 0, q = p < COLLAPSE_POP ? 1 : p < 5000 ? clamp((5000 - p) / 3500) : 0; if (q > 0 && U(civ, tag, st.id, "c") < q) { dissolveState(ctx, st, "大災厄で崩壊した"); out.push(st.id); } }
  return out;
}

// ---- 旧世界の遺跡
export function recordRuins(w) {
  const { civ } = w, out = [];
  for (const s of Object.values(civ.settlements)) { if (s.stage === "village") continue; const g = civ.groups[s.groupId], st = g?.stateId ? civ.states[g.stateId] : null; out.push({ cell: s.cell, name: s.name ?? null, state: st?.name ?? null, pop: Math.round(s.pop ?? 0), stage: s.stage }); }
  out.sort((a, b) => b.pop - a.pop || a.cell - b.cell); return out.slice(0, 60).map((r, i) => ({ id: `ruin${i + 1}`, ...r, found: null }));
}
export function stepRuins(ctx) {
  const { civ, world } = ctx, R = civ.wcde.ruins; if (!R?.length) return; const mi = civ.monthIndex;
  for (const r of R) { if (r.found) continue; let best = null, bd = 260; for (const g of Object.values(civ.groups)) { if (!g.stateId || g.pop < 300) continue; const d = distKm(world, g.cell, r.cell); if (d < bd) { bd = d; best = g; } }
    if (!best || U(civ, r.id, mi, "f") > 0.18) continue; const st = civ.states[best.stateId]; if (!st?.alive) continue; r.found = { at: mi, by: st.id };
    makeEvent(civ, ctx.ids, { kind: "ruin_discovered", title: `${st.name}の領内で、旧世界の${r.name ? `「${r.name}」` : "名もなき都市"}の遺跡が見つかった${r.state ? `（${r.state}の栄えた地）` : ""}`, participants: [{ entityId: st.id, role: "state" }], location: { cell: r.cell }, facts: { ruin: r.id }, provenance: "simulation" }); }
}

/** 世界を完全に滅ぼし、先史時代からやり直す。civ は同じオブジェクトのまま中身を入れ替える（外の参照が切れない）。建国の段階（founding）に戻る */
export function rebirthWorld(w, { name = "", reason = "" } = {}) {
  const old = w.civ, world = w.world, cfg = old.wcde.config, n = (old.wcde.worlds?.length ?? 0) + 1;
  const summary = { n, endedAt: { ...old.date }, name: name || "名もなき災厄", reason, states: Object.values(old.states).filter((s) => s.alive).length, pop: Math.round(Object.values(old.groups).reduce((a, g) => a + g.pop, 0)), peakStates: Object.keys(old.states).length };
  const ruins = recordRuins(w), worlds = [...(old.wcde.worlds ?? []), summary], cats = old.wcde.catastrophes ?? [];
  const civ = createWcdeCiv(world, cfg, { historySeed: hashSeed(old.historySeed, "rebirth", n) });
  runPrehistory(world, civ, {}); finalizeLanguages(civ); defineReligions({ civ });
  civ.wcde.ruins = ruins; civ.wcde.worlds = worlds; civ.wcde.catastrophes = cats; civ.wcde.reborn = n;
  for (const k of Object.keys(old)) delete old[k]; Object.assign(old, civ); w.viewPast = null; w.rebuild();
  const ctx = w.sim.ctx; makeEvent(old, ctx.ids, { kind: "world_reborn", title: `大災厄「${summary.name}」により旧世界は滅びた。人々は、遺跡の上で、再びゆっくりと歩みはじめる`, participants: [], location: null, facts: { n }, provenance: "creator" });
  refreshCandidates(w); return { ok: true, reborn: n, ruins: ruins.length };
}
