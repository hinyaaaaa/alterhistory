// v6.4.0: 担当国内の反乱・革命と、役職の組み替え。
//   ・反乱は 5 つの型（民衆蜂起・軍のクーデター・諸侯・貴族の反乱・宗教反乱・分離独立運動）から選び、中心地を地図で選ぶ。規模は WCDE が決める（不満・勢力の支持・首都からの距離・戦争中か）。
//   ・国家をつくる反乱（分離独立は必ず／諸侯・宗教は選んで）は、建国と同じ流れ（国名→政体→役職→為政者→技術・ドクトリン）。首都は反乱の中心地。領域は中心地の周りから WCDE が決める。
//   ・国家をつくらない反乱（民衆蜂起・クーデター、諸侯・宗教で国家をつくらないとき）は、成功したら新しい体制（政体・役職・為政者）に変わる。鎮圧されたら、安定度と人口を失う。
//   ・役職は、いつでも組み替えられる（費用なし。出来事として記録する）。
import { reachable } from "../civ/population.js";
import { spatialOf, invalidateMonthCaches } from "../civ/spatial.js";
import { distKm } from "../civ/states.js";
import { declareWar } from "../civ/diplomacy.js";
import { makeEvent } from "../civ/events.js";
import { retitle, leaderRng } from "./domains/naming.js";
import { REGIMES, regimeOf, regimeGate, checkOffices, officeJa } from "./regimes.js";
import { assignOffices, foundNation } from "./founding.js";
import { controlledState } from "./control.js";

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const fail = (error) => ({ ok: false, error });
export const UPRISING_KINDS = Object.freeze({
  revolution: { ja: "民衆蜂起（革命）", faction: "commoners", state: false, blurb: "重い負担と不満を抱えた民衆が立ち上がり、体制を倒そうとする。" },
  coup: { ja: "軍のクーデター", faction: "military", state: false, blurb: "軍が権力を握り、為政者を取り替えようとする。" },
  noble_revolt: { ja: "諸侯・貴族の反乱", faction: "nobility", state: "optional", blurb: "有力な家門が王権に逆らう。独立の国を立てることもある。" },
  religious_revolt: { ja: "宗教反乱", faction: "clergy", state: "optional", blurb: "信仰を掲げた反乱。新しい宗教国家を立てることもある。" },
  separatist: { ja: "分離独立運動", faction: "clans", state: "required", blurb: "地方が国から分かれて、独立の国をつくろうとする。" },
});
const support = (st, key) => { const f = st.politics?.factions?.[key]; return typeof f?.support === "number" ? f.support : 0.5; };

/** 反乱の計画（何も変えない）。中心地（cell）は、担当国の領土の中で首都以外 */
export function planUprising(w, { stateId, kind, cell }) {
  const { civ, sim } = w, ctx = sim.ctx, world = w.world, st = civ.states[stateId], K = UPRISING_KINDS[kind];
  if (!st?.alive) return fail("その国家は存在しません"); if (!K) return fail("反乱の型は " + Object.keys(UPRISING_KINDS).join("・") + " のどれか");
  if (!Number.isInteger(cell)) return fail("中心地を地図から選んでください");
  ctx._spatial = null; const { home } = spatialOf(ctx);
  const gid = home.get(cell) ?? Object.values(civ.groups).find((x) => (x.cells ?? [x.cell]).includes(cell))?.id, center = gid ? civ.groups[gid] : null;
  if (!center || center.stateId !== st.id) return fail("中心地は、自国の領土の中から選んでください");
  if (center.id === st.capitalGroupId) return fail("首都では反乱を起こせません（首都以外の土地を選んでください）");
  const gs = Object.values(civ.groups).filter((g) => g.stateId === st.id), cap = civ.groups[st.capitalGroupId];
  let tens = 0, tp = 0; for (const g of gs) { let t = 0; for (const c of g.cohorts ?? []) if (c.tension > t) t = c.tension; tens += t * g.pop; tp += g.pop; }
  const grievance = clamp((1 - st.stability) * 0.9 + (tp ? (tens / tp) * 0.6 : 0) + (st.warIds.length ? 0.1 : 0) + Math.max(0, st.policy.tax - 0.15) * 1.2 + st.policy.mobilization * 0.2), disc = 1 - support(st, K.faction);
  const far = cap ? Math.min(1, distKm(world, cap.cell, center.cell) / 6000) : 0.3, scale = clamp(0.12 + 0.55 * grievance + 0.3 * disc + 0.15 * far, 0.08, 0.95);
  const R = 1 + Math.round(scale * 7), dist = reachable(world, center.cell, R, 0), near = [];
  for (const [c, d] of dist) { const id2 = home.get(c); const g = id2 && civ.groups[id2]; if (!g || g.stateId !== st.id || g.id === st.capitalGroupId) continue; near.push([d, g]); }
  near.sort((a, b) => a[0] - b[0] || b[1].pop - a[1].pop || (a[1].id < b[1].id ? -1 : 1));
  const cap2 = Math.max(1, Math.floor((gs.length - 1) * 0.6)), region = [center, ...near.map((x) => x[1]).filter((g) => g.id !== center.id)].slice(0, cap2), rebelPop = Math.round(region.reduce((s, g) => s + g.pop, 0));
  const rebelPower = rebelPop * (0.5 + disc) * (0.6 + scale), statePower = st.army * (0.5 + st.stability) + Math.max(0, st.pop - rebelPop) * 0.02, odds = clamp(rebelPower / (rebelPower + statePower + 1e-9), 0.03, 0.97);
  const oddsLabel = odds >= 0.7 ? "反乱側が優勢" : odds >= 0.45 ? "互角" : odds >= 0.25 ? "やや不利" : "かなり不利";
  return { ok: true, kind, kindJa: K.ja, stateMode: K.state, center: { groupId: center.id, cell: center.cell }, scale: Math.round(scale * 100) / 100, scaleLabel: scale >= 0.7 ? "大規模" : scale >= 0.4 ? "中規模" : "小規模", regionGroupIds: region.map((g) => g.id), rebelPop, share: st.pop ? Math.round((rebelPop / st.pop) * 100) / 100 : 0, odds: Math.round(odds * 100) / 100, oddsLabel, grievance: Math.round(grievance * 100) / 100 };
}

/** 新しい体制（政体・役職・為政者）を国家に適用する（革命・クーデターの成功） */
function applyReform(ctx, st, reform) {
  const { civ } = ctx, r = REGIMES[reform.regime], core = r.core, before = { polity: st.polity, regime: regimeOf(st) };
  st.regime = reform.regime; st.polity = core; st.interpDirty = true; const rt = retitle(st, core); if (rt) { st.name = rt.name; st.nameBase = rt.base; }
  st.leader = { name: String(reform.leader.name).trim(), bornAt: civ.monthIndex - Math.round(360 + leaderRng(civ, st, "reform")() * 120), heir: false, look: reform.leader.look ?? 0, title: officeJa(r.ruler) };
  st.offices = null; assignOffices(ctx, st, reform.offices); if (st.politics) st.politics.lastRegimeChange = civ.monthIndex;
  return before;
}
/** 反乱を起こす。spec.found（国家をつくる反乱）か spec.reform（体制を変える反乱）を添える */
export function startUprising(w, { stateId, kind, cell, asState = null, found = null, reform = null }) {
  const { civ, sim } = w, ctx = sim.ctx, st = civ.states[stateId], K = UPRISING_KINDS[kind];
  if (!st?.alive) return fail("その国家は存在しません"); if (controlledState(civ)?.id !== stateId) return fail("担当している国の中でだけ、反乱を起こせます");
  const plan = planUprising(w, { stateId, kind, cell }); if (!plan.ok) return plan;
  const makeState = K.state === "required" ? true : K.state === "optional" ? !!asState : false;
  const regionGs = plan.regionGroupIds.map((i) => civ.groups[i]);
  if (makeState) {
    if (!found) return fail("国家をつくる反乱では、国名・政体・役職・為政者を決めてください");
    // 検証だけを先に（領域を切り離す前に、国名・政体・役職・為政者を確かめる）
    const probe = Object.values(civ.states).some((x) => x.alive && x.name === String(found.name ?? "").trim()); if (probe) return fail("同じ名前の国がすでにあります");
    const center = civ.groups[plan.center.groupId], gate = regimeGate(civ, center, found.regime); if (found.regime && gate) return fail(`この地では「${REGIMES[found.regime]?.ja}」を選べません（${gate}）`);
    const oe = found.regime ? checkOffices(found.regime, found.offices) : "政体を選んでください"; if (oe) return fail(oe);
  } else {
    if (!reform) return fail("成功したときに樹立する体制（政体・役職・為政者）を決めてください");
    if (!REGIMES[reform.regime]) return fail("政体を選んでください"); const oe = checkOffices(reform.regime, reform.offices); if (oe) return fail(oe);
    const ln = String(reform.leader?.name ?? "").trim(); if (!ln || ln.length > 30) return fail("新しい為政者の名前は 1〜30 文字で決めてください");
    const gate = regimeGate(civ, civ.groups[st.capitalGroupId] ?? regionGs[0], reform.regime); if (gate) return fail(`この国では「${REGIMES[reform.regime].ja}」はまだ選べません（${gate}）`);
  }
  const ev = makeEvent(civ, ctx.ids, { kind: "uprising", title: `${st.name}で${K.ja}が起きた（${plan.scaleLabel}）`, participants: [{ entityId: st.id, role: "state" }], location: { cell: plan.center.cell }, facts: { stateId: st.id, kind, scale: plan.scale, rebelPop: plan.rebelPop }, provenance: "player" });
  if (makeState) {
    const saved = regionGs.map((g) => [g, g.stateId]); for (const g of regionGs) g.stateId = null; invalidateMonthCaches(ctx); ctx._byState = null;
    const r = foundNation(w, { ...found, capital: { groupId: plan.center.groupId }, groupIds: regionGs.map((g) => g.id) }, { mode: "rebel", predecessor: st.id, cause: ev.eventId, via: "secession" });
    if (!r.ok) { for (const [g, s] of saved) g.stateId = s; invalidateMonthCaches(ctx); ctx._byState = null; civ.events.pop(); return r; }
    const ns = civ.states[r.stateId]; ns.relations[st.id] = -60; st.relations[ns.id] = -60; st.stability = clamp(st.stability - 0.06 - plan.scale * 0.1);
    const war = declareWar(ctx, ns, st, { reason: kind === "separatist" ? "independence" : kind === "religious_revolt" ? "religion" : "civil_war", provenance: "simulation" });
    return { ok: true, outcome: "new_state", newStateId: ns.id, warId: war.id, plan };
  }
  const roll = leaderRng(civ, st, "uprising", kind, plan.center.cell)();
  if (roll < plan.odds) {
    const before = applyReform(ctx, st, reform); st.stability = clamp(Math.min(st.stability, 0.6) * 0.7 - plan.scale * 0.1 + 0.1, 0.12, 0.7);
    for (const g of regionGs) g.pop = Math.max(1, g.pop * (1 - 0.02 * (0.5 + plan.scale)));
    makeEvent(civ, ctx.ids, { kind: "regime_change", title: `${st.name}で${K.ja}が成功し、「${REGIMES[reform.regime].ja}」の体制になった（${st.leader.title} ${st.leader.name}）`, participants: [{ entityId: st.id, role: "state" }], location: { cell: plan.center.cell }, facts: { stateId: st.id, polity: st.polity, regime: reform.regime, name: st.name, uprising: kind }, effects: [{ targetId: st.id, property: "polity", before: before.polity, after: st.polity }], causes: [{ targetId: ev.eventId, relation: "caused_by", basis: "direct" }], provenance: "player" });
    invalidateMonthCaches(ctx); return { ok: true, outcome: "success", plan };
  }
  const loss = 0.03 + 0.08 * plan.scale; for (const g of regionGs) g.pop = Math.max(1, g.pop * (1 - loss)); st.stability = clamp(st.stability - 0.03 - plan.scale * 0.05);
  makeEvent(civ, ctx.ids, { kind: "uprising_crushed", title: `${st.name}の${K.ja}は鎮圧された`, participants: [{ entityId: st.id, role: "state" }], location: { cell: plan.center.cell }, facts: { stateId: st.id, kind }, causes: [{ targetId: ev.eventId, relation: "caused_by", basis: "direct" }], provenance: "player" });
  invalidateMonthCaches(ctx); return { ok: true, outcome: "crushed", plan };
}

/** 役職の組み替え（いつでも・費用なし。元首の役職は外せない。担当者は残る人を引き継ぐ） */
export function setOffices(w, { stateId, offices }) {
  const { civ, sim } = w, ctx = sim.ctx, st = civ.states[stateId]; if (!st?.alive) return fail("その国家は存在しません");
  const rg = regimeOf(st), err = checkOffices(rg, offices); if (err) return fail(err);
  const before = (st.offices ?? []).map((o) => o.id); if (before.length === offices.length && before.every((x) => offices.includes(x))) return { ok: true, changed: false };
  assignOffices(ctx, st, offices);
  const added = offices.filter((x) => !before.includes(x)).map(officeJa), removed = before.filter((x) => !offices.includes(x)).map(officeJa);
  makeEvent(civ, ctx.ids, { kind: "office_reform", title: `${st.name}が官制を改めた${added.length ? `（置く: ${added.join("・")}）` : ""}${removed.length ? `（廃す: ${removed.join("・")}）` : ""}`, participants: [{ entityId: st.id, role: "state" }], location: civ.groups[st.capitalGroupId] ? { cell: civ.groups[st.capitalGroupId].cell } : null, facts: { stateId: st.id, offices: offices.slice() }, provenance: "player" });
  return { ok: true, changed: true, added, removed };
}
