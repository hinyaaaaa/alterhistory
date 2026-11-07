// v6.1.0 M7: 創造主の災厄。仕様 §10.3。
//   ・創造主が任意の時点で、世界規模または地域規模の大きな災厄を起こせる。名称・理由は任意（原因の説明が無くてもよい）。人口の最大 95% まで失われる規模を指定できる。
//   ・これは世界の中の抽象的な出来事で、現実の災害・攻撃・破壊の手段や方法は扱わない（「何が起きたか」ではなく「どれだけの人が失われ、世界がどう反応するか」だけを持つ）。
//   ・創造主の行為は台帳（civ.wcde.catastrophes）に残し、世界の中の結果は事実の出来事（kind: catastrophe）として別に残す（理由の注釈は事実の側へ出さない）。
//   ・発生後は人口・軍・安定・文化の緊張・収容力へ即座に反映され、そこから生産・財政・交易・軍事は通常の計算で伝播する。発生前の状態へは戻さない。
//   ・乱数は ctx.rng を使わず、(historySeed, 月, 災厄ID, 集団) のハッシュから導く（他の領域の乱数を動かさない。保存・復元後も同じ結果）。
import { makeEvent } from "../civ/events.js";
import { hashSeed } from "../civ/civ-state.js";
import { distKm } from "../civ/states.js";

export const MAX_MORTALITY = 1, MIN_MORTALITY = 0.01, NAME_MAX = 40, REASON_MAX = 200;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x), r3 = (x) => Math.round(x * 1000) / 1000, fin = (x) => typeof x === "number" && Number.isFinite(x);
export const catastrophesOf = (civ) => (civ.wcde.catastrophes ??= []);
const U = (civ, ...p) => hashSeed(civ.historySeed, "catastrophe", ...p) / 4294967296;

/** 検証だけ（何も変えない）。{ ok, plan } または { ok:false, error } */
export function planCatastrophe(w, { name = "", reason = "", scope = "world", center = null, radiusKm = null, mortality, recoveryMonths = 60 }) {
  const fail = (error) => ({ ok: false, error }), { civ, world } = w;
  if (typeof name !== "string" || name.trim().length > NAME_MAX) return fail(`災厄の名前は ${NAME_MAX} 文字までの文字列です`);
  if (typeof reason !== "string" || reason.length > REASON_MAX) return fail(`理由の注釈は ${REASON_MAX} 文字までの文字列です`);
  if (scope !== "world" && scope !== "region") return fail("範囲は world（世界規模）か region（地域規模）");
  if (!fin(mortality) || mortality < MIN_MORTALITY || mortality > MAX_MORTALITY) return fail(`人口の損失の割合は ${MIN_MORTALITY * 100}〜${MAX_MORTALITY * 100}% で指定してください`);
  if (!fin(recoveryMonths) || recoveryMonths < 1) return fail("回復までの目安は 1 か月以上にしてください");
  let cell = null, radius = null;
  if (scope === "region") { cell = center; if (!Number.isInteger(cell) || cell < 0 || cell >= world.mesh.cellCount) return fail("地域規模の災厄には、中心の区画（0〜区画数−1 の整数）が必要です"); radius = radiusKm ?? 1500; if (!fin(radius) || radius < 100 || radius > 20000) return fail("半径は 100〜20000 km"); }
  return { ok: true, plan: { name: name.trim(), reason: reason.trim(), scope, cell, radius, mortality: r3(mortality), recoveryMonths: Math.round(recoveryMonths) } };
}

/** 災厄を起こす。台帳に記録し、人口などへ結果を反映し、世界の事実の出来事を 1 件残す。{ ok, id, dead, groups, states } */
export function createCatastrophe(w, args) {
  const p = planCatastrophe(w, args); if (!p.ok) return p; const { civ, world } = w, pl = p.plan, ctx = w.sim.ctx, mi = civ.monthIndex, id = ctx.ids.next("catastrophe"), name = pl.name || "名もなき災厄";
  const hit = [], cs = pl.cell != null ? pl.cell : null;
  for (const gid of Object.keys(civ.groups).sort()) { const g = civ.groups[gid]; let k = 1; if (pl.scope === "region") { const d = distKm(world, cs, g.cell); if (d > pl.radius) continue; k = 1 - 0.6 * (d / pl.radius); } hit.push([g, k]); }
  const before = Object.values(civ.groups).reduce((a, g) => a + g.pop, 0); let dead = 0; const states = new Map(), effects = [];
  for (const [g, k] of hit) {
    const jitter = 0.85 + 0.15 * U(civ, id, g.id, "j"), frac = clamp(pl.mortality * k * jitter, 0, MAX_MORTALITY), b = g.pop, a = Math.max(Math.min(b, 5), b * (1 - frac)); /* 5 人未満へは落とさない（集団の消滅は人口の通常の処理に任せ、首都の集団が突然消えて国家の整合が崩れるのを避ける） */ // 集団ごとの損失は指定値を超えない（世界全体で最大 95%）
    g.pop = a; dead += b - a; g.capMult = r3(Math.min(g.capUntil > mi ? g.capMult : 1, clamp(1 - 0.7 * frac, 0.25, 1))); g.capUntil = Math.max(g.capUntil ?? 0, mi + pl.recoveryMonths);
    for (const c of g.cohorts ?? []) c.tension = clamp((c.tension ?? 0) + 0.3 * frac);
    if (g.stateId) { const e = states.get(g.stateId) ?? { b: 0, a: 0, frac: 0, n: 0 }; e.b += b; e.a += a; states.set(g.stateId, e); }
  }
  const touched = []; for (const [sid, e] of [...states].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const st = civ.states[sid]; if (!st?.alive) continue; const f = e.b ? 1 - e.a / e.b : 0, sb = st.stability; st.pop = Math.max(0, st.pop - (e.b - e.a)); st.army = Math.max(0, st.army * (1 - f)); st.stability = clamp(st.stability - 0.3 * f); st.treasury -= Math.max(0, st.treasury) * 0.15 * f; // 軍・安定・国庫へ。生産・交易は人口から通常の計算で伝播する
    touched.push(sid); effects.push({ targetId: sid, property: "pop", before: Math.round(e.b), after: Math.round(e.a) }, { targetId: sid, property: "stability", before: r3(sb), after: r3(st.stability) });
  }
  const total = before > 0 ? dead / before : 0;
  catastrophesOf(civ).push({ id, at: mi, name, reason: pl.reason, scope: pl.scope, center: cs, radiusKm: pl.radius, mortality: pl.mortality, recoveryMonths: pl.recoveryMonths, authority: "creator_intervention", result: { dead: Math.round(dead), share: r3(total), groups: hit.length, states: touched.length } });
  const label = pl.scope === "world" ? "世界を" : "ある地域を";
  makeEvent(civ, ctx.ids, { kind: "catastrophe", title: `大災厄「${name}」が${label}襲った（人口の約 ${Math.round(total * 100)}% が失われた）`, participants: touched.slice(0, 8).map((s) => ({ entityId: s, role: "affected" })), location: cs != null ? { cell: cs } : null, effects: effects.slice(0, 16), facts: { catastropheId: id, scope: pl.scope, mortality: r3(total), dead: Math.round(dead) }, provenance: "creator" });
  ctx._byState = null; return { ok: true, id, dead: Math.round(dead), share: r3(total), groups: hit.length, states: touched.length };
}

/** 構造の検査（記録の整合のみ。因果的に奇妙でもよい） */
export function checkCatastrophes(civ) {
  const errs = [], L = civ.wcde?.catastrophes; if (!L) return errs; const ids = new Set();
  for (const r of L) { if (ids.has(r.id)) errs.push(`災厄 ${r.id} が重複`); ids.add(r.id); if (!fin(r.mortality) || r.mortality > MAX_MORTALITY || r.mortality < 0) errs.push(`災厄 ${r.id} の損失の割合が範囲外`); if (!fin(r.result?.share) || r.result.share > MAX_MORTALITY + 1e-9) errs.push(`災厄 ${r.id} の結果が範囲外`); }
  return errs;
}
