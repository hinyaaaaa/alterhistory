// v6.18.0: 戦場（会戦）。陸・海・空・宇宙のすべての戦いを、同じ作りで進める（HoI4 の戦闘画面にならう）。
//   ・両軍は 3 つの翼（陸: 左翼・中央・右翼／海: 左舷・中央・右舷／空: 高空・中空・低空／宇宙: 高軌道・中軌道・低軌道）に分かれ、翼ごとに前線の位置（0〜100。50 が開始）がある。
//   ・プレイヤーは翼ごとに「前進・待機・側面機動・後退」を命じ、予備を翼へ送れる。進行は日ごと（UI が速度に合わせて tick を呼ぶ。一時停止できる）。3 手番のターン制ではない。
//   ・戦力は power.js（陸・海・空の共通の式）。士気・補給・地形・築城・指揮官・ドクトリン（優先火力・高機動戦・人海戦術・陣地戦略・特殊作戦）が効く。
//   ・状態はすべて JSON（決断の payload に入る）。乱数は seed と日・翼のハッシュ（決定的）。
import { hashSeed } from "../civ/civ-state.js";
import { landPower, navalPower, airSupport } from "./power.js";
import { corpsById, corpsFx } from "./corps.js";

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v), r3 = (x) => Math.round(x * 1000) / 1000;
export const DOMAINS = Object.freeze({
  land: { ja: "陸戦", lanes: ["左翼", "中央", "右翼"], days: 14, unit: "軍団" }, sea: { ja: "海戦", lanes: ["左舷", "中央", "右舷"], days: 8, unit: "艦隊" },
  air: { ja: "空戦", lanes: ["高空", "中空", "低空"], days: 6, unit: "航空軍" }, space: { ja: "宇宙戦", lanes: ["高軌道", "中軌道", "低軌道"], days: 6, unit: "軌道軍" },
});
export const ORDERS = Object.freeze({ advance: "前進", hold: "待機", flank: "側面機動", retreat: "後退" });
const W3 = [0.3, 0.4, 0.3], DRIVE = { advance: 1, flank: 0.6, hold: 0.15, retreat: -0.8 }, ATK = { advance: 1.25, hold: 0.8, flank: 0.75, retreat: 0.3 }, DEF = { advance: 0.85, hold: 1.2, flank: 0.9, retreat: 0.8 }, LOSS = { advance: 1.3, hold: 0.8, flank: 1, retreat: 0.55 };
const U = (f, ...p) => hashSeed(f.seed, ...p.map(String)) / 4294967296;

/** 1 単位あたりの戦力（攻め・守り）。陸海は power.js、空・宇宙は陸の式に航空・宇宙の運用を掛ける */
function unitPower(ctx, st, domain, defending) {
  const civ = ctx.civ, k = 1000, fx = st.military?.fx ?? {};
  if (domain === "sea") return navalPower(civ, st, k) / k;
  const base = landPower(civ, st, k, { defending }) / k;
  return domain === "air" ? base * (1 + 2 * (fx.air ?? 0) + 0.5 * airSupport(st)) : domain === "space" ? base * (1 + 2.5 * (fx.space ?? 0) + (fx.strike ?? 0)) : base;
}
const wingName = (domain, i) => DOMAINS[domain].lanes[i];
/** 一方の陣営を翼に分ける。size=その陣営の戦力、corps=軍団（指揮官・副官の名前を翼へ） */
function mkSide(ctx, st, size, { corps = null, morale = 0.8, supply = 1, domain, reserveShare = 0.2, label }) {
  const fxc = corps ? corpsFx(corps, st) : { off: 0, def: 0, skill: 0, coh: 0 }, cmd = corps?.commander && !corps.commander.dead ? corps.commander : null, off = Object.values(corps?.officers ?? {}).filter(Boolean);
  const field = size * (1 - reserveShare);
  return { stateId: st.id, name: st.name, label: label ?? corps?.name ?? st.name, cmd: cmd ? { name: cmd.name, skill: cmd.skill, traits: cmd.traits ?? [] } : null, fx: { off: r3(fxc.off), def: r3(fxc.def), skill: r3(fxc.skill), coh: r3(fxc.coh) }, reserve: Math.round(size * reserveShare), reserve0: Math.round(size * reserveShare), supply: r3(supply), size0: Math.round(size),
    wings: W3.map((w, i) => ({ i, name: wingName(domain, i), size: Math.round(field * w), size0: Math.round(field * w), morale: r3(morale), order: i === 1 ? "hold" : "hold", dig: 0, lead: i === 1 ? cmd?.name ?? null : off[i === 0 ? 0 : 1]?.name ?? null, routed: false })) };
}
/** 戦場を作る。spec: { domain, place, terr, fort, meDefends, me: {st, size, corps, morale, supply}, foe: {...}, seed, meta } */
export function createField(ctx, spec) {
  const d = spec.domain, f = { v: 1, domain: d, ja: DOMAINS[d].ja, day: 0, maxDay: DOMAINS[d].days + Math.round(3 * (spec.long ?? 0)), seed: spec.seed, place: spec.place, terr: r3(spec.terr ?? 0), fort: r3(spec.fort ?? 1), meDefends: !!spec.meDefends, auto: false, log: [], front: [50, 50, 50], done: false, result: null, reinfAt: -9, meta: spec.meta ?? {} };
  f.me = mkSide(ctx, spec.me.st, spec.me.size, { ...spec.me, domain: d, reserveShare: 0.2 }); f.foe = mkSide(ctx, spec.foe.st, spec.foe.size, { ...spec.foe, domain: d, reserveShare: 0.15 });
  // 守る側は最初から待機、攻める側は前進（プレイヤーは変えられる）
  for (const w of (f.meDefends ? f.foe : f.me).wings) w.order = "advance"; for (const w of (f.meDefends ? f.me : f.foe).wings) w.order = "hold";
  f.pw = { me: { atk: unitPower(ctx, spec.me.st, d, false), def: unitPower(ctx, spec.me.st, d, true) }, foe: { atk: unitPower(ctx, spec.foe.st, d, false), def: unitPower(ctx, spec.foe.st, d, true) } };
  f.fxs = { me: spec.me.st.military?.fx ?? {}, foe: spec.foe.st.military?.fx ?? {} }; f.line = { me: spec.me.st.military?.doc?.line ?? null, foe: spec.foe.st.military?.doc?.line ?? null };
  return f;
}
const total = (s) => s.wings.reduce((a, w) => a + w.size, 0), meanMorale = (s) => { const t = total(s); return t > 0 ? s.wings.reduce((a, w) => a + w.morale * w.size, 0) / t : 0; };
export const fieldStats = (f) => ({ me: { size: total(f.me), size0: f.me.size0, morale: meanMorale(f.me), reserve: f.me.reserve }, foe: { size: total(f.foe), size0: f.foe.size0, morale: meanMorale(f.foe), reserve: f.foe.reserve }, front: f.front.reduce((a, b) => a + b, 0) / 3 });
const note = (f, text, kind = "") => { f.log.push({ day: f.day, text, kind }); if (f.log.length > 40) f.log.shift(); };

function aiOrders(f, who) {
  const s = f[who], o = who === "me" ? f.foe : f.me, sgn = who === "me" ? 1 : -1;
  for (const w of s.wings) {
    if (w.routed) { w.order = "retreat"; continue; } const e = o.wings[w.i], mine = w.size * (0.6 + 0.5 * w.morale), theirs = e.size * (0.6 + 0.5 * e.morale), ratio = (mine + 1) / (theirs + 1), fr = f.front[w.i] * sgn + 50 * (1 - sgn), defending = (who === "me") === f.meDefends;
    const left = f.meDefends === (who === "me") ? 0 : 0; void left;
    if (w.morale < 0.3 || ratio < 0.45) w.order = fr < 30 && ratio < 0.4 ? "retreat" : "hold"; else if (ratio > 1.35 && !defending) w.order = U(f, f.day, who, w.i, "fl") < 0.25 ? "flank" : "advance"; else if (ratio > 1.8) w.order = "advance"; else w.order = defending ? "hold" : ratio > 0.9 ? "advance" : "hold";
  }
}
/** 1 日進める */
function dayStep(f) {
  const lanes = [0, 1, 2], pw = f.pw, ctxMul = { me: 1, foe: 1 };
  if (f.day % 2 === 0) aiOrders(f, "foe"); if (f.auto) aiOrders(f, "me");
  // 翼ごとの寄与（側面機動は、隣の弱い敵の翼へ 45% を回す）
  const c = { me: lanes.map(() => ({ atk: 0, def: 0, flankOn: false })), foe: lanes.map(() => ({ atk: 0, def: 0, flankOn: false })) };
  for (const who of ["me", "foe"]) { const s = f[who], o = who === "me" ? f.foe : f.me, cmdM = 1 + clamp(s.fx.skill + (s.fx.off ?? 0) * 0.5, -0.2, 0.25), sup = 0.5 + 0.5 * s.supply, fxs = f.fxs[who], dm = 1 + (fxs.mob ?? 0) * 0.3;
    for (const w of s.wings) { if (w.size <= 0) continue; const mf = 0.6 + 0.5 * w.morale, base = w.size * mf * sup * cmdM * dm, dig = w.order === "hold" ? w.dig : 0, share = w.order === "flank" ? 0.55 : 1, a = base * pw[who].atk * ATK[w.order], d = base * pw[who].def * (DEF[w.order] + dig);
      c[who][w.i].atk += a * share; c[who][w.i].def += d * share;
      if (w.order === "flank") { const adj = w.i === 1 ? [0, 2] : [1]; let j = adj[0], best = 1e18; for (const k of adj) { const e = o.wings[k], v = e.size * (0.6 + 0.5 * e.morale); if (v < best) { best = v; j = k; } } c[who][j].atk += a * 0.45 * 1.3; c[who][j].flankOn = true; } } }
  void ctxMul;
  const tf = (1 + f.terr) * f.fort, notes = [];
  for (const i of lanes) {
    const m = f.me.wings[i], e = f.foe.wings[i], meD = f.meDefends ? tf : 1, foeD = f.meDefends ? 1 : tf;
    const A = c.me[i].atk, D = c.foe[i].def * foeD * (c.me[i].flankOn ? 0.88 : 1), A2 = c.foe[i].atk, D2 = c.me[i].def * meD * (c.foe[i].flankOn ? 0.88 : 1);
    const nF = 0.8 + 0.4 * U(f, f.day, i, "a"), nM = 0.8 + 0.4 * U(f, f.day, i, "b"), attM = 1 - clamp(f.fxs.me.attr ?? 0, -0.25, 0.25), attF = 1 - clamp(f.fxs.foe.attr ?? 0, -0.25, 0.25);
    const fF = clamp(0.011 * Math.pow(Math.max(0.05, A / (D + 1e-9)), 0.75) * LOSS[e.order] * nF * attF, 0, 0.07), fM = clamp(0.011 * Math.pow(Math.max(0.05, A2 / (D2 + 1e-9)), 0.75) * LOSS[m.order] * nM * attM, 0, 0.07);
    const dF = e.size * fF, dM = m.size * fM; e.size = Math.max(0, e.size - dF); m.size = Math.max(0, m.size - dM); f.lossFoe = (f.lossFoe ?? 0) + dF; f.lossMe = (f.lossMe ?? 0) + dM;
    // 前線: 前進する側の攻め／受ける側の守りの比で動く。後退は一定の速さで退く
    const dr = (o, atk, def) => DRIVE[o] * (atk / (atk + def + 1)), delta = 3.2 * (dr(m.order, A, D) - dr(e.order, A2, D2)) + (m.order === "retreat" ? -2.4 : 0) + (e.order === "retreat" ? 2.4 : 0);
    f.front[i] = r3(clamp(f.front[i] + delta, 0, 100));
    // 士気
    const cohM = f.me.fx.coh + (f.fxs.me.coh ?? 0), cohF = f.foe.fx.coh + (f.fxs.foe.coh ?? 0);
    m.morale = r3(clamp(m.morale + 0.004 + 0.4 * (fF - fM) - (f.front[i] < 25 ? 0.012 : 0) + (m.order === "retreat" ? -0.004 : 0) + 0.006 * cohM, 0, 1)); e.morale = r3(clamp(e.morale + 0.004 + 0.4 * (fM - fF) - (f.front[i] > 75 ? 0.012 : 0) + (e.order === "retreat" ? -0.004 : 0) + 0.006 * cohF, 0, 1));
    m.dig = m.order === "hold" ? Math.min(0.3, m.dig + 0.03) : 0; e.dig = e.order === "hold" ? Math.min(0.3, e.dig + 0.03) : 0;
    if (!m.routed && (m.morale < 0.12 || m.size < m.size0 * 0.12)) { m.routed = true; m.order = "retreat"; notes.push([`${m.name}が崩れた`, "bad"]); } if (!e.routed && (e.morale < 0.12 || e.size < e.size0 * 0.12)) { e.routed = true; e.order = "retreat"; notes.push([`敵の${e.name}が崩れた`, "good"]); }
    if (f.front[i] >= 90 && !f.brk?.[`f${i}`]) { (f.brk ??= {})[`f${i}`] = 1; notes.push([`${e.name}の線を突破した`, "good"]); } if (f.front[i] <= 10 && !f.brk?.[`m${i}`]) { (f.brk ??= {})[`m${i}`] = 1; notes.push([`${m.name}の線を破られた`, "bad"]); }
  }
  for (const [t, k] of notes) note(f, t, k); f.day++;
  // 終結
  const st = fieldStats(f), fm = f.front.reduce((a, b) => a + b, 0) / 3, meWithdrew = f.me.wings.every((w) => w.order === "retreat") && fm <= 30;
  let end = null;
  if (st.foe.morale < 0.22 || st.foe.size < st.foe.size0 * 0.3 || fm >= 82) end = "me"; else if (st.me.morale < 0.22 || st.me.size < st.me.size0 * 0.3 || fm <= 18 || meWithdrew) end = "foe";
  else if (f.day >= f.maxDay) end = fm + 25 * (st.me.morale - st.foe.morale) + 12 * ((st.foe.size0 ? 1 - st.foe.size / st.foe.size0 : 0) - (st.me.size0 ? 1 - st.me.size / st.me.size0 : 0)) >= 50 ? "me" : "foe";
  if (end) { f.done = true; f.result = { winner: end, days: f.day, lossMe: Math.round(f.lossMe ?? 0), lossFoe: Math.round(f.lossFoe ?? 0), withdrew: meWithdrew, front: Math.round(fm) }; note(f, end === "me" ? "勝利" : meWithdrew ? "退却" : "敗北", end === "me" ? "good" : "bad"); }
}
/** days 日進める（終われば止まる） */
export function tickField(f, days = 1) { for (let k = 0; k < days && !f.done; k++) dayStep(f); return f; }
/** 翼への命令 */
export function orderWing(f, lane, order) { if (f.done) return { ok: false, error: "戦いは終わりました" }; if (!ORDERS[order]) return { ok: false, error: "未知の命令" }; const w = f.me.wings[lane]; if (!w) return { ok: false, error: "その翼はありません" }; if (w.routed) return { ok: false, error: `${w.name}は崩れていて、命令を受けつけない` }; w.order = order; f.auto = false; return { ok: true }; }
export function orderAll(f, order) { if (f.done) return { ok: false, error: "戦いは終わりました" }; if (!ORDERS[order]) return { ok: false, error: "未知の命令" }; for (const w of f.me.wings) if (!w.routed) w.order = order; f.auto = false; return { ok: true }; }
/** 予備を翼へ送る（3 日に 1 度。予備の半分まで） */
export function reinforce(f, lane) { if (f.done) return { ok: false, error: "戦いは終わりました" }; const w = f.me.wings[lane]; if (!w) return { ok: false, error: "その翼はありません" }; if (f.day - f.reinfAt < 3) return { ok: false, error: "予備を送ったばかりです（3 日あける）" }; if (f.me.reserve < 1) return { ok: false, error: "予備がありません" };
  const x = Math.min(f.me.reserve, Math.max(1, Math.round(f.me.reserve0 * 0.5))); f.me.reserve -= x; w.size += x; w.size0 += x; w.morale = r3(clamp(w.morale + 0.06)); f.reinfAt = f.day; note(f, `${w.name}へ予備 ${x} を送った`); return { ok: true }; }
export const setAuto = (f, on) => { f.auto = !!on; return { ok: true }; };
/** 結末（決断の解決が使う）。bias は fight() の攻め側の補正（決着を強く反映）、lossMine/lossFoe は損耗の倍率 */
export function fieldOutcome(f, meIsA) {
  if (!f.done) { let g = 0; while (!f.done && g++ < 60) dayStep(f); }
  const win = f.result.winner === "me", winA = win ? meIsA : !meIsA, mult = (x, size0) => clamp(size0 > 0 ? x / size0 / 0.1 : 1, 0.2, 3);
  return { win, winA, bias: winA ? 6 : 1 / 6, lossMine: mult(f.lossMe ?? 0, f.me.size0 + f.me.reserve0), lossFoe: mult(f.lossFoe ?? 0, f.foe.size0 + f.foe.reserve0), result: f.result };
}
export const wingOf = (f, who, i) => f[who].wings[i];
void corpsById;
