// v6.16.0: 政体の進化。技術の新しい側にある政体ほど選ばれやすくする。
//   ・国は年に 1 回、自分の政体を見直す。選べるのは、首都の集団が技術・解禁を満たす政体だけ（regimeGate）。
//   ・古い政体に留まる理由: 既得権層の抵抗・伝統（正統性と安定）・変える圧力がない間は動かない。
//   ・変える圧力: 戦争の疲弊・財政難・民衆の不満・隣国の優位。隣国の政体は模倣されやすい。
//   ・変わり方: 改革／革命／軍の掌握／征服。規模（段差・系統の違い）が大きいほど、安定度の低下と勢力の離反が大きい。
//   ・内部の政体（st.polity。6 値）が変わるときは politics.js の reformPolity を通す（国号の称号も組み直る）。
import { POLITY_LIST } from "./polity30.js";
import { REGIMES, REGIME_IDS, regimeOf, regimeGate, defaultOffices, regimeJa } from "./regimes.js";
import { assignOffices } from "./founding.js";
import { reformPolity, initPolitics } from "./domains/politics.js";
import { retitle } from "./domains/naming.js";
import { neighborStates, atWarWith } from "../civ/diplomacy.js";
import { byState } from "../civ/spatial.js";
import { makeEvent } from "../civ/events.js";
import { hashSeed } from "../civ/civ-state.js";
import { effective } from "./domains/effective.js";

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
/** 政体の段（時代の新しさ）と系統。tri 前国家／the 神権／mon 君主制／rep 共和制／aut 近代の一党・軍・統制／anar 無政府 */
export const REGIME_META = Object.freeze(Object.fromEntries(POLITY_LIST.map((r) => [r.id, [r.tier, r.fam]])));
export const tierOf = (id) => REGIME_META[id]?.[0] ?? 0;
export const familyOf = (id) => REGIME_META[id]?.[1] ?? "tri";
const RARITY = Object.freeze(Object.fromEntries(POLITY_LIST.map((r) => [r.id, r.rarity]))); // 新しい政体でも、すべての国が同じになるわけではない
const MIN_POP = { tribal: 0, chiefdom: 0, theocracy: 0, kingdom: 2000, republic: 300, empire: 60000 };
const HOW_JA = { reform: "制度の改革", revolution: "革命", military_takeover: "軍による権力の掌握", conquest: "征服による大国化", decline: "中央の衰退", imitation: "隣国にならった改革" };

/** 変更の規模（0〜1）: 段差が大きく、系統が違うほど大きい。資本主義→社会主義のような大きな移行は 1 に近く、貴族共和制→民主制のような移行は小さい */
export function changeScale(from, to) {
  const gap = Math.abs(tierOf(to) - tierOf(from)), fam = familyOf(from) !== familyOf(to) ? 1 : 0, aut = (familyOf(to) === "aut") !== (familyOf(from) === "aut") ? 1 : 0;
  return clamp(0.08 + gap * 0.06 + fam * 0.25 + aut * 0.25);
}
function gateFor(ctx, st, id) {
  const civ = ctx.civ, g = civ.groups[st.capitalGroupId]; if (!g) return "首都がない"; const r = REGIMES[id], why = regimeGate(civ, g, id); if (why) return why;
  if (id === "direct_democracy" && st.pop > 200000 && (st.techAdopted?.public_education == null && g.tech.known.public_education == null)) return "大きな国の直接民主制には公教育が要る";
  if ((st.pop ?? 0) < (MIN_POP[r.core] ?? 0)) return "人口が足りない";
  const size = byState(ctx).get(st.id)?.length ?? 0; if ((id === "bureaucratic_state" || id === "meritocratic_state") && size < 12) return "領土が小さい"; if ((id === "corporate_state" || id === "aristocratic_republic" && false) && size > 6) return "領土が広すぎる";
  return null;
}
/** 国が見直せる政体の候補と重み（何も変えない）。pressure: 変える圧力（0〜1） */
export function regimeCandidates(ctx, st, pressure = 0) {
  const cur = regimeOf(st), curT = tierOf(cur), curF = familyOf(cur), out = [], nbs = neighborStates(ctx, st), share = {};
  for (const n of nbs) { const id = regimeOf(ctx.civ.states[n]); share[id] = (share[id] ?? 0) + 1 / Math.max(1, nbs.length); }
  for (const id of REGIME_IDS) {
    if (id === cur || REGIMES[id].crisisOnly || gateFor(ctx, st, id)) continue; const gap = tierOf(id) - curT, f = familyOf(id); if (gap < -1) continue;
    let w = gap >= 0 ? 1 + gap * 0.5 : 0.2; w *= f === curF ? 1 : pressure > 0.25 ? 0.3 : 0.05; if (f === "aut" && curF !== "aut") w *= pressure > 0.35 ? 1 : 0.1;
    w *= (1 + 2 * (share[id] ?? 0)) * (RARITY[id] ?? 1); out.push({ id, w, gap });
  }
  return out;
}
/** 担当国が選べる政体（今の政体・危機限定を除き、解禁条件を満たすもの）と、それぞれの変更の規模 */
export function playerRegimeOptions(ctx, st) { const cur = regimeOf(st); return REGIME_IDS.filter((id) => id !== cur && !REGIMES[id].crisisOnly && !gateFor(ctx, st, id)).map((id) => ({ id, scale: changeScale(cur, id), tier: tierOf(id) })); }
/** 変える圧力（0〜1）: 正統性の低さ・戦争の疲弊・財政難・隣国の優位 */
export function pressureOf(ctx, st) {
  const civ = ctx.civ, P = st.politics ?? {}, legE = effective(civ, st, "legitimacy"), nbs = neighborStates(ctx, st); let stronger = 0;
  for (const n of nbs) { const o = civ.states[n]; if (o?.alive && o.pop > st.pop * 1.5) stronger++; }
  return clamp((1 - legE) * 0.55 + (P.fatigue ?? 0) * 0.3 + ((st.treasury ?? 0) < 0 ? 0.15 : 0) + (st.stability < 0.4 ? 0.15 : 0) + (nbs.length ? 0.1 * (stronger / nbs.length) : 0));
}
/** 政体を移す（記録つき）。how: reform／revolution／military_takeover／conquest／decline／imitation */
export function switchRegime(ctx, st, to, how = "reform") {
  const { civ, ids } = ctx, P = (st.politics ??= initPolitics(st)), from = regimeOf(st), R = REGIMES[to], mi = civ.monthIndex; if (!R || from === to) return null;
  const scale = changeScale(from, to), oldName = st.name, polityBefore = st.polity;
  if (R.core !== st.polity) { const hw = how === "imitation" || how === "conquest" ? "reform" : how; reformPolity(ctx, st, P, R.core, { reform: "reform", revolution: "revolution", military_takeover: "military_takeover", decline: "decline" }[hw] ?? "reform"); }
  st.regime = to; P.lastRegimeChange = mi; st.regimeSince = mi; (st.regimeHistory ??= []).push({ at: mi, from, to, how }); if (st.regimeHistory.length > 8) st.regimeHistory.shift();
  st.stability = clamp(st.stability - 0.02 - 0.16 * scale); // 規模が大きいほど安定度が下がる
  const f = P.factions; if (f) { const k = familyOf(from) !== familyOf(to) ? 0.12 * scale + 0.04 : 0.02; for (const x of Object.keys(f)) f[x].support = clamp(f[x].support - (x === "nobility" || x === "clergy" ? k * 1.4 : k * 0.6)); } // 一部の勢力が離反する
  let rt = null; if (polityBefore === st.polity) { rt = retitle(st, st.polity, civ.date.year); if (rt && rt.name !== st.name) { st.name = rt.name; st.nameBase = rt.base; st.titleYear = rt.year; } else rt = null; }
  st.offices = null; if (st.player) assignOffices(ctx, st, defaultOffices(to)); st.interpDirty = true;
  makeEvent(civ, ids, { kind: "regime_change", title: `${oldName}の政体が${REGIMES[from].ja}から${R.ja}へ移った（${HOW_JA[how] ?? how}）${rt ? `。国号は${rt.name}と改まった` : ""}`, participants: [{ entityId: st.id, role: "state" }], effects: [{ targetId: st.id, property: "regime", before: from, after: to }], facts: { stateId: st.id, regime: to, from, by: how, scale: Math.round(scale * 100) / 100 }, provenance: "simulation" });
  return { from, to, how, scale };
}
/** 年 1 回: 政体の見直し（担当国は動かさない。決めるのはプレイヤー） */
export function stepRegimeEvolution(ctx) {
  const { civ } = ctx, mi = civ.monthIndex; if (!civ.options.wcde || mi % 12 !== 7) return;
  for (const st of Object.values(civ.states)) {
    if (!st.alive || st.player || civ.wcde?.control?.stateId === st.id) continue; const P = (st.politics ??= initPolitics(st)); if (mi - (P.lastRegimeChange ?? -9999) < 360) continue; // 30 年は続く
    const pr = pressureOf(ctx, st), u = (hashSeed(st.id, mi, "regime") % 100000) / 100000, cur = regimeOf(st);
    // 無政府主義: 国家が崩れ、小さな国になったときだけ（短命。周辺の大国に潰されやすい）
    if (pr > 0.7 && st.stability < 0.2 && st.pop < 150000 && !gateFor(ctx, st, "elder_council") && regimeGate(civ, civ.groups[st.capitalGroupId], "council_republic", { crisis: true }) == null && u < 0.08) { switchRegime(ctx, st, "council_republic", "revolution"); continue; }
    const cands = regimeCandidates(ctx, st, pr); if (!cands.length) continue; const best = Math.max(...cands.filter((c) => c.w > 0.15).map((c) => c.gap), 0);
    const tradition = clamp(0.5 * effective(civ, st, "legitimacy") + 0.3 * st.stability + 0.2 * (P.factions?.nobility?.support ?? 0.5)), lag = 1 + 0.6 * Math.max(0, best - 1), resist = 1 - 0.5 * tradition;
    const p = clamp(0.015 * (1 + 3 * pr) * lag * resist, 0, 0.35); if (u >= p) continue;
    const tot = cands.reduce((a, c) => a + c.w, 0); let x = ((hashSeed(st.id, mi, "pick") % 100000) / 100000) * tot, pick = cands[cands.length - 1]; for (const c of cands) { x -= c.w; if (x <= 0) { pick = c; break; } }
    const to = pick.id, diff = familyOf(to) !== familyOf(cur), how = familyOf(to) === "aut" && familyOf(cur) !== "aut" ? (pr > 0.5 ? "military_takeover" : "revolution") : diff ? (pr > 0.35 ? "revolution" : "reform") : pick.gap < 0 ? "decline" : (cands.length && (neighborStates(ctx, st).some((n) => regimeOf(civ.states[n]) === to)) ? "imitation" : "reform");
    switchRegime(ctx, st, to, how);
  }
}
export { regimeJa };
