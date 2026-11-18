// v6.19.0: 出来事の仕組み。要件 §10。カタログは events-data.js（240 種）。
//   ・担当国: 年 0〜5 回（国の規模と時代で変わる）。時間を止めて決断（kind=event）を出し、3〜4 の選択肢（「何もしない」を含む）から選ばせる。
//   ・アルゴリズム国家（と、決断が出せない一括の進行）: 同じ出来事が、より低い頻度で起き、利害で選択肢が自動で選ばれる。結果は同じ仕組みで世界に反映される。
//   ・連鎖: 選択肢（または出来事）が、次の出来事を数か月後に予約する（st.evq）。予約は条件を満たす限り必ず起こる。
//   ・出来事は国の履歴（civ.events の kind=event_occurred）に、選んだ結果とともに残る。
import { hashSeed } from "../civ/civ-state.js";
import { byState } from "../civ/spatial.js";
import { distKm, enthrone, runSecession } from "../civ/states.js";
import { declareWar, atWarWith } from "../civ/diplomacy.js";
import { makeEvent } from "../civ/events.js";
import { TREE } from "../civ/techtree.js";
import { addShock } from "./shocks.js";
import { regimeOf, REGIMES } from "./regimes.js";
import { regimeCandidates, switchRegime, familyOf } from "./regime-evolution.js";
import { registerDecision, raise, DECISION_HOOKS } from "./decisions.js";
import { isLive, pendingOf } from "./decision-state.js";
import { queueEvent } from "./succession.js";
import { EVENTS, EVENT_BY_ID, ARCH } from "./events-data.js";

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const U = (civ, ...p) => (hashSeed(civ.historySeed, "evt", ...p) % 1000003) / 1000003;
const FAC = { nob: "nobility", mil: "military", clr: "clergy", mer: "merchants", com: "commoners", bur: "bureaucrats", art: "artisans", clan: "clans" };
const FAC_JA = { nobility: "貴族", military: "軍", clergy: "聖職者", merchants: "商人", commoners: "民衆", bureaucrats: "官僚", artisans: "職人", clans: "氏族" };
const ERA_AT = [0.06, 0.15, 0.3, 0.5, 0.75], scaleOf = (st) => 20 + (st.pop ?? 0) * 0.0003;

/** 国の状況（条件の判定用）。1 回の判定で 1 度だけ作る */
function contextOf(ctx, st) {
  const { civ } = ctx, n = Object.keys(st.techAdopted ?? {}).length / Math.max(1, TREE.length); let era = 0; while (era < 5 && n >= ERA_AT[era]) era++;
  let rival = null, friend = null, rv = -15, fv = 15; for (const id of Object.keys(st.relations ?? {}).sort()) { const o = civ.states[id]; if (!o?.alive || o.id === st.id) continue; const v = st.relations[id]; if (v < rv) { rv = v; rival = o; } if (v > fv) { fv = v; friend = o; } }
  const cap = civ.groups[st.capitalGroupId], S = scaleOf(st);
  return { era, rival, friend, war: st.warIds.length > 0, poly: st.polity, her: !!REGIMES[regimeOf(st)]?.heredity, stab: st.stability, poor: st.treasury < S * 4, rich: st.treasury > S * 20, big: st.pop > 150000, small: st.pop < 40000, coast: !!cap && (ctx.world?.cell?.coastDist?.[cap.cell] ?? 9) <= 1, S };
}
function eligible(ev, st, cx, chain) {
  const c = ev.cond; if (c.only && !chain) return false; if (c.e && (cx.era < c.e[0] || cx.era > c.e[1])) return false; if (c.po && !c.po.includes(cx.poly)) return false;
  if (c.her && !cx.her) return false; if (c.nher && cx.her) return false; if (c.war && !cx.war) return false; if (c.nwar && cx.war) return false; if (c.lows && cx.stab >= 0.45) return false; if (c.highs && cx.stab <= 0.65) return false;
  if (c.poor && !cx.poor) return false; if (c.rich && !cx.rich) return false; if (c.big && !cx.big) return false; if (c.small && !cx.small) return false; if (c.coast && !cx.coast) return false; if (c.rival && !cx.rival) return false; if (c.friend && !cx.friend) return false;
  return true;
}
const fill = (t, st, cx) => String(t).replaceAll("{s}", st.name).replaceAll("{L}", st.leader?.name ?? "指導者").replaceAll("{r}", cx.rival?.name ?? "敵国").replaceAll("{f}", cx.friend?.name ?? "友好国");

// ---- 効果
const fxOf = (ev, i) => { const a = ARCH[ev.arch], n = ev.opts.length; const base = i >= n ? a[3] : a[Math.min(i, 2)]; return `${base}${ev.x?.[i] ? " " + ev.x[i] : ""}`.trim(); };
function leaderChange(ctx, st, mode) {
  const { civ } = ctx, mi = civ.monthIndex;
  if (mode === "assn") { addShock(st, mi, "event", 0.05, 12); makeEvent(civ, ctx.ids, { kind: "leader_assassinated", title: `${st.name}の${st.leader?.name ?? "指導者"}が暗殺された`, participants: [{ entityId: st.id, role: "state" }], location: civ.groups[st.capitalGroupId] ? { cell: civ.groups[st.capitalGroupId].cell } : null, facts: { stateId: st.id }, provenance: "simulation" }); }
  if ((mode === "die" || mode === "assn" || mode === "abd") && st.player && isLive(civ) && DECISION_HOOKS.succession(ctx, st)) return; // 担当国は、次の王を自分で決める
  enthrone(ctx, st, { kin: mode === "die" || mode === "abd" ? true : mode === "assn" ? ctx.rng() < 0.55 : false }); if (mode === "coup") { st.stability = clamp(st.stability - 0.05); addShock(st, mi, "event", 0.04, 10); }
}
function farPart(ctx, st) {
  const gs = byState(ctx).get(st.id) ?? [], cap = ctx.civ.groups[st.capitalGroupId]; if (gs.length < 4 || !cap) return null;
  const far = gs.filter((g) => g.id !== cap.id).map((g) => [distKm(ctx.world, cap.cell, g.cell), g]).sort((a, b) => b[0] - a[0] || (a[1].id < b[1].id ? -1 : 1)).map((x) => x[1]); return far.slice(0, Math.max(1, Math.min(far.length - 1, Math.round(gs.length * 0.35))));
}
function shift(ctx, st, kind) {
  const { civ } = ctx, cand = regimeCandidates(ctx, st, 0.7).filter((c) => (kind === "mil" ? c.id === "junta" || familyOf(c.id) === "aut" : kind === "rep" ? familyOf(c.id) === "rep" : kind === "mon" ? familyOf(c.id) === "mon" : familyOf(c.id) !== familyOf(regimeOf(st)) || c.gap > 0));
  if (!cand.length) { st.stability = clamp(st.stability - 0.04); return false; } const tot = cand.reduce((a, c) => a + c.w, 0); let x = U(civ, st.id, civ.monthIndex, "rg", kind) * tot, pick = cand[0].id; for (const c of cand) { x -= c.w; if (x <= 0) { pick = c.id; break; } }
  const ok = switchRegime(ctx, st, pick, kind === "mil" ? "military_takeover" : kind === "rev" ? "revolution" : "reform"); return !!ok;
}
function applyFx(ctx, st, fx, cx) {
  const { civ } = ctx, mi = civ.monthIndex, S = cx.S, F = st.politics?.factions;
  for (const t of fx.split(/\s+/).filter(Boolean)) {
    let m;
    if ((m = /^([a-zA-Z]+)([+-]\d+(?:\.\d+)?)$/.exec(t))) {
      const k = m[1], v = +m[2];
      if (k === "stab") st.stability = clamp(st.stability + v * 0.01); else if (k === "tre") st.treasury += v * S * 0.5;
      else if (k === "pop") { const f = 1 + v / 100; for (const g of byState(ctx).get(st.id) ?? []) g.pop = Math.max(1, g.pop * f); st.pop = Math.max(0, st.pop * f); }
      else if (k === "army") st.army = Math.max(0, st.army * (1 + v / 100)); else if (k === "leg") { if (v < 0) addShock(st, mi, "event", -v * 0.01, 10); else st.stability = clamp(st.stability + v * 0.005); }
      else if (k === "tens") for (const g of byState(ctx).get(st.id) ?? []) for (const c of g.cohorts ?? []) c.tension = clamp(c.tension * (1 + v * 0.05));
      else if (FAC[k]) { const f = F?.[FAC[k]]; if (f) f.support = clamp(f.support + v * 0.01); }
      else if (k === "relR" && cx.rival) { st.relations[cx.rival.id] = clamp((st.relations[cx.rival.id] ?? 0) + v, -100, 100); cx.rival.relations[st.id] = clamp((cx.rival.relations[st.id] ?? 0) + v, -100, 100); }
      else if (k === "relF" && cx.friend) { st.relations[cx.friend.id] = clamp((st.relations[cx.friend.id] ?? 0) + v, -100, 100); cx.friend.relations[st.id] = clamp((cx.friend.relations[st.id] ?? 0) + v, -100, 100); }
      else if (k === "relA") for (const id of Object.keys(st.relations ?? {})) { const o = civ.states[id]; if (o?.alive) st.relations[id] = clamp(st.relations[id] + v * 0.5, -100, 100); }
    } else if ((m = /^ldr:(\w+)$/.exec(t))) leaderChange(ctx, st, m[1]);
    else if ((m = /^rebel:(\w+)$/.exec(t))) {
      const k = m[1]; if (k === "coup") { leaderChange(ctx, st, "coup"); const f = F?.military; if (f) f.support = clamp(f.support + 0.05); }
      else if (k === "revolution") shift(ctx, st, "rev"); else { const part = farPart(ctx, st); if (part) runSecession(ctx, st, part); else st.stability = clamp(st.stability - 0.06); }
    } else if ((m = /^regime:(\w+)$/.exec(t))) shift(ctx, st, m[1]);
    else if ((m = /^(war|warby):R:(\w+)$/.exec(t))) {
      const r = cx.rival; if (!r?.alive || atWarWith(civ, st, r)) continue; const reason = m[2];
      if (m[1] === "war") declareWar(ctx, st, r, { reason, provenance: "simulation" }); else if (st.player && isLive(civ) && DECISION_HOOKS.warIncoming(ctx, r, st, { reason })) { /* 担当国は、宣戦に答える */ } else declareWar(ctx, r, st, { reason, provenance: "simulation" });
    }
  }
  ctx._byState = null;
}
/** 効果の読み取り（選択肢の補足）。メリットとデメリットの両方が見えるように、方向だけを示す */
export function hintOf(fx) {
  const up = [], down = [], J = { stab: "安定度", tre: "国庫", pop: "人口", army: "軍", leg: "正統性", tens: "民の不満", relR: "敵国との関係", relF: "友好国との関係", relA: "諸国との関係" }, bad = new Set(["tens"]), sp = [];
  for (const t of fx.split(/\s+/).filter(Boolean)) { let m; if ((m = /^([a-zA-Z]+)([+-])\d/.exec(t))) { const name = J[m[1]] ?? (FAC[m[1]] ? `${FAC_JA[FAC[m[1]]]}の支持` : null); if (!name) continue; const good = (m[2] === "+") !== bad.has(m[1]); (good ? up : down).push(name); } else if (t.startsWith("ldr:")) sp.push("指導者が代わる"); else if (t.startsWith("rebel:")) sp.push("反乱が起きる"); else if (t.startsWith("regime:")) sp.push("政体が変わる"); else if (t.startsWith("war")) sp.push("戦争になる"); }
  return [...sp, up.length ? `＋${up.join("・")}` : "", down.length ? `−${down.join("・")}` : ""].filter(Boolean).join("　");
}

// ---- 発生と解決
function chainAfter(ctx, st, ev, i) { const { civ } = ctx; for (const c of ev.ch) if ((!c.only || c.only.includes(i)) && U(civ, st.id, civ.monthIndex, ev.id, c.id) < c.p) queueEvent(st, c.id, c.delay, civ.monthIndex); }
function resolve(ctx, st, ev, i, cx) {
  const { civ } = ctx, chosen = i >= ev.opts.length ? "何もしなかった" : ev.opts[i]; applyFx(ctx, st, fxOf(ev, i), cx); chainAfter(ctx, st, ev, i); (st.evSeen ??= {})[ev.id] = civ.monthIndex; st.evLast = civ.monthIndex;
  makeEvent(civ, ctx.ids, { kind: "event_occurred", title: `${st.name}で「${fill(ev.title, st, cx)}」（${chosen}）`, participants: [{ entityId: st.id, role: "state" }], location: civ.groups[st.capitalGroupId] ? { cell: civ.groups[st.capitalGroupId].cell } : null, facts: { eventId: ev.id, option: i, cat: ev.cat }, provenance: st.player ? "player" : "simulation" });
  return chosen;
}
/** アルゴリズム国家の選択: 効果の見込みを点数にし、国ごとのゆらぎを足して選ぶ */
function autoPick(ctx, st, ev, cx) {
  const { civ } = ctx, W = { stab: 3, tre: 1, pop: 2, army: 0.6, leg: 2, tens: -1, relR: 0.1, relF: 0.15, relA: 0.1 }; let best = 0, bv = -1e9;
  for (let i = 0; i <= ev.opts.length; i++) { let v = 0; for (const t of fxOf(ev, i).split(/\s+/)) { const m = /^([a-zA-Z]+)([+-]\d+(?:\.\d+)?)$/.exec(t); if (m) v += (W[m[1]] ?? 0.5) * +m[2]; else if (t.startsWith("rebel:") || t.startsWith("war")) v -= 3; else if (t.startsWith("ldr:")) v -= 1; } v += 3 * U(civ, st.id, civ.monthIndex, ev.id, i) - (i === ev.opts.length ? 0.4 : 0); if (v > bv) { bv = v; best = i; } }
  return best;
}
function fire(ctx, st, ev, cx = contextOf(ctx, st)) {
  const { civ } = ctx; if (st.player && isLive(civ)) {
    const n = ev.opts.length, options = [...ev.opts.map((o, i) => ({ id: String(i), ja: o, hint: hintOf(fxOf(ev, i)) })), { id: String(n), ja: "何もしない", hint: hintOf(fxOf(ev, n)) }];
    const d = raise(ctx, { kind: "event", key: `ev|${st.id}|${ev.id}|${civ.monthIndex}`, stateId: st.id, title: fill(ev.title, st, cx), body: fill(ev.body, st, cx), options, payload: { evId: ev.id } }); if (d) { st.evLast = civ.monthIndex; (st.evSeen ??= {})[ev.id] = civ.monthIndex; return true; }
  }
  resolve(ctx, st, ev, autoPick(ctx, st, ev, cx), cx); return true;
}
registerDecision("event", (ctx, d, opt) => {
  const st = ctx.civ.states[d.stateId], ev = EVENT_BY_ID[d.payload.evId]; if (!st?.alive || !ev) return { ok: true, note: "出来事はすでに過ぎていた" }; const i = Number(opt); if (!Number.isInteger(i) || i < 0 || i > ev.opts.length) return { ok: false, error: "その選択肢はありません" };
  const cx = contextOf(ctx, st), chosen = resolve(ctx, st, ev, i, cx); return { ok: true, note: chosen };
});

/** 1 年あたりの出来事の回数（担当国）: 規模と時代で 0.4〜4.5 回 */
export const annualRate = (st, era) => clamp(0.4 + 3.6 * clamp(Math.log10(Math.max(1, (st.pop ?? 0) / 2000)) / 2.5) * (0.5 + 0.12 * era), 0.3, 4.5);
export function stepEvents(ctx) {
  const { civ } = ctx; if (!civ.options.wcde) return; const mi = civ.monthIndex, live = isLive(civ), pend = pendingOf(civ).length > 0;
  for (const id of Object.keys(civ.states)) {
    const st = civ.states[id]; if (!st.alive) continue; const q = st.evq?.find((x) => x.at <= mi);
    if (q) { if (st.player && live && pend) continue; st.evq = st.evq.filter((x) => x !== q); const ev = EVENT_BY_ID[q.id]; if (ev) { const cx = contextOf(ctx, st); if (eligible(ev, st, cx, true)) fire(ctx, st, ev, cx); } continue; }
    let go = false;
    if (st.player) { if (pend && live) continue; if (mi - (st.evLast ?? -99) < 3) continue; go = U(civ, st.id, mi, "roll") < annualRate(st, 2) / 12; }
    else { if ((hashSeed(st.id, "evo") % 12) !== mi % 12) continue; const pop = st.pop ?? 0; go = U(civ, st.id, mi, "roll") < clamp(0.04 + 0.16 * clamp(Math.log10(Math.max(1, pop / 2000)) / 2.5), 0.04, 0.2); }
    if (!go) continue; const cx = contextOf(ctx, st), seen = st.evSeen ?? {}, pool = [];
    if (st.player) go = U(civ, st.id, mi, "roll2") < annualRate(st, cx.era) / annualRate(st, 2); if (!go) continue;
    for (const ev of EVENTS) if (eligible(ev, st, cx, false) && mi - (seen[ev.id] ?? -9999) > 120) pool.push(ev); if (!pool.length) continue;
    const tot = pool.reduce((a, e) => a + e.cond.w, 0); let x = U(civ, st.id, mi, "pick") * tot, pick = pool[0]; for (const e of pool) { x -= e.cond.w; if (x <= 0) { pick = e; break; } } fire(ctx, st, pick, cx);
  }
}
export { EVENTS };
