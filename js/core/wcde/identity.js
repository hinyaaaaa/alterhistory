// v6.17.0: 国名・政体・指導者・国旗・財政値の変更（担当国／創造主がいつでも行える。代償つき）。
//   代償は「規模」で決まり、同じ種類の変更が続くほど重くなる（累積）。正統性の低下は時間とともに薄れる（shocks.js）。
//   国名＝正統性が一時的に下がる／政体＝安定度が大きく下がり勢力が離反（段差・系統で規模が変わる）／指導者＝勢力の支持を失う（退位・強制・暗殺で違う）。
import { hashSeed, rngOf } from "../civ/civ-state.js";
import { makeEvent } from "../civ/events.js";
import { lifeScale } from "../civ/species.js";
import { regnalOf, epithetGen, leaderRng } from "./domains/naming.js";
import { languageOfGroup, nameFor } from "./domains/language.js";
import { REGIMES, regimeOf, officeJa, canonRegime } from "./regimes.js";
import { switchRegime, changeScale, playerRegimeOptions } from "./regime-evolution.js";
import { normalizeFlag } from "../names/flag.js";
import { LEADER_TRAITS } from "./founding.js";
import { addShock, recentShocks } from "./shocks.js";
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v), r3 = (x) => Math.round(x * 1000) / 1000, fail = (error) => ({ ok: false, error });
export const ORIGINS_HEREDITARY = Object.freeze(["王の子（嫡出）", "王の子（庶子）", "王の弟", "王の甥", "将軍", "宰相", "養子", "聖職者"]);
export const ORIGINS_OTHER = Object.freeze(["将軍", "長老", "商人", "書記官", "弁論家", "神官", "民会の推挙"]);
export const LEADER_MODES = Object.freeze({ abdicate: "退位を促す", depose: "強制的に退ける", assassinated: "暗殺された" });
const cum = (n) => 1 + 0.6 * Math.min(n, 5);

/** 変更の代償の見積り（何も変えない）。legit: 正統性の低下（0〜1）、years: 薄れるまでの年数、stab: 安定度の低下、fac: 勢力の支持の低下（貴族・聖職者に重い）、count: 直近 60 年の同種の変更の回数 */
export function changeCost(st, mi, kind, opt = {}) {
  const n = recentShocks(st, kind, mi, 60);
  if (kind === "name") return { count: n, legit: r3(clamp(0.05 * cum(n), 0, 0.3)), years: Math.min(40, 8 + 4 * n), stab: 0, fac: 0 };
  if (kind === "flag") return { count: n, legit: r3(clamp(0.02 * cum(n), 0, 0.12)), years: 4, stab: 0, fac: 0 };
  if (kind === "regime") { const sc = opt.scale ?? 0.2; return { count: n, scale: sc, legit: r3(clamp((0.04 + 0.3 * sc) * cum(n), 0, 0.6)), years: Math.round(6 + 30 * sc), stab: r3(clamp((0.02 + 0.16 * sc) + 0.03 * Math.min(n, 4), 0, 0.4)), fac: r3((0.04 + 0.12 * sc) * (opt.crossFamily ? 1 : 0.4)) }; }
  const T = { abdicate: [0.03, 3, 0.01, 0.02], depose: [0.12, 8, 0.06, 0.06], assassinated: [0.15, 10, 0.1, 0.05] }[opt.mode ?? "abdicate"] ?? [0.03, 3, 0.01, 0.02];
  return { count: n, legit: r3(clamp(T[0] * cum(n), 0, 0.5)), years: T[1], stab: r3(clamp(T[2] * cum(n), 0, 0.3)), fac: r3(T[3] * cum(n)) };
}
const eventOf = (ctx, st, kind, title, facts) => makeEvent(ctx.civ, ctx.ids, { kind, title, participants: [{ entityId: st.id, role: "state" }], facts: { stateId: st.id, ...facts }, provenance: "simulation" });
const shakeFactions = (st, k, heavy = ["nobility", "clergy"]) => { const f = st.politics?.factions; if (!f) return; for (const x of Object.keys(f)) f[x].support = clamp((f[x].support ?? 0.5) - (heavy.includes(x) ? k * 1.4 : k * 0.6)); };

/** 国名の変更 */
export function changeName(ctx, st, name) {
  const { civ } = ctx, mi = civ.monthIndex, nm = typeof name === "string" ? name.trim() : ""; if (!st?.alive) return fail("その国家は存在しません");
  if (!nm || nm.length > 30) return fail("国名は 1〜30 文字"); if (nm === st.name) return fail("いまの国名と同じです");
  if (Object.values(civ.states).some((x) => x.alive && x.id !== st.id && x.name === nm)) return fail("同じ名前の国がすでにあります");
  const old = st.name, cost = changeCost(st, mi, "name"); st.name = nm; st.nameBase = null; st.nameChangedAt = mi; addShock(st, mi, "name", cost.legit, cost.years);
  eventOf(ctx, st, "state_renamed", `${old}は国名を${nm}と改めた`, { from: old, to: nm }); ctx._byState = null; st.interpDirty = true; return { ok: true, cost };
}
/** 政体の変更（担当国が選べる政体は playerRegimeOptions） */
export function changeRegime(ctx, st, to0) {
  const to = canonRegime(to0);
  const { civ } = ctx, mi = civ.monthIndex; if (!st?.alive) return fail("その国家は存在しません");
  const opt = playerRegimeOptions(ctx, st).find((x) => x.id === to); if (!opt) return fail("その政体へは、いまは移れません");
  const from = regimeOf(st), cross = REGIMES[from].core !== REGIMES[to].core, cost = changeCost(st, mi, "regime", { scale: opt.scale, crossFamily: opt.scale > 0.3 }), how = opt.scale > 0.5 ? "revolution" : "reform";
  const r = switchRegime(ctx, st, to, how); if (!r) return fail("政体を移せませんでした");
  st.stability = clamp(st.stability - 0.03 * Math.min(cost.count, 4)); addShock(st, mi, "regime", cost.legit, cost.years); st.leader.title = officeJa(REGIMES[to].ruler); void cross; ctx._byState = null; return { ok: true, cost, from, to };
}
/** 国旗の変更 */
export function changeFlag(ctx, st, spec) {
  const mi = ctx.civ.monthIndex; if (!st?.alive) return fail("その国家は存在しません"); if (!spec?.field) return fail("国旗の指定がありません");
  const f = normalizeFlag(spec), cost = changeCost(st, mi, "flag"); st.flag = f; addShock(st, mi, "flag", cost.legit, cost.years); eventOf(ctx, st, "state_flag_changed", `${st.name}は国旗を改めた`, {}); return { ok: true, cost };
}
/** 指導者の候補（決定的。同じ月・同じ国なら同じ顔ぶれ）。継承者がいれば先頭に出る */
export function leaderCandidates(ctx, st, n = 4, salt = "") {
  const { civ } = ctx, mi = civ.monthIndex, rnd = rngOf(hashSeed(st.id, mi, "lcand", salt)), pick = (a) => a[Math.floor(rnd() * a.length)], g = civ.groups[st.capitalGroupId], her = REGIMES[regimeOf(st)].heredity, origins = her ? ORIGINS_HEREDITARY : ORIGINS_OTHER, keys = Object.keys(LEADER_TRAITS), out = [];
  const heir = st.heirFigureId ? civ.figures?.[st.heirFigureId] : null; if (heir && heir.diedAt == null) out.push({ name: heir.name, look: Math.floor(rnd() * 12), age: Math.max(14, Math.round((mi - heir.bornAt) / 12)), traits: [pick(keys)], origin: "継承者", heir: true });
  const lang = languageOfGroup(g);
  while (out.length < n) { const tr = []; while (tr.length < 2) { const k = pick(keys); if (!tr.includes(k)) tr.push(k); } const nm = ctx.nameGen?.person?.(civ, g, rnd) ?? (lang && civ.languages[lang] ? nameFor(civ, rnd, lang, "person") : null) ?? "名もなき人"; out.push({ name: nm, look: Math.floor(rnd() * 12), age: 18 + Math.floor(rnd() * 36), traits: tr, origin: pick(origins) }); }
  return out;
}
/** 指導者の交代。mode: abdicate（退位を促す＝同じ家系）／depose（強制＝新しい王朝）／assassinated（暗殺。出来事側が呼ぶ） */
export function changeLeader(ctx, st, { mode = "abdicate", cand }) {
  const { civ } = ctx, mi = civ.monthIndex, L = st?.leader; if (!st?.alive || !L) return fail("その国家は存在しません"); if (!LEADER_MODES[mode]) return fail("交代の方法が不正です");
  if (!cand || typeof cand.name !== "string" || !cand.name.trim() || cand.name.length > 30) return fail("後継者を選んでください");
  const cost = changeCost(st, mi, "leader", { mode }), cap = civ.groups[st.capitalGroupId], old = L.name, heirOk = cand.heir && st.heirFigureId && civ.figures?.[st.heirFigureId]?.diedAt == null;
  if (heirOk && mode !== "depose") { L.bornAt -= 1; /* 継承者が登位する（people.js の継承の経路） */ }
  else { st.heirFigureId = null; const rg = regnalOf(st, cand.name.trim(), leaderRng(civ, st, "swap"), epithetGen(ctx, st, cap)); L.name = rg.name; L.birthName = rg.birth; L.bornAt = mi - Math.round(clamp(Number(cand.age) || 30, 14, 90) * 12 * lifeScale(civ, st)); L.traits = (cand.traits ?? []).filter((k) => LEADER_TRAITS[k]).slice(0, 3); if (Number.isFinite(cand.look)) L.look = cand.look; L.deposed = mode !== "abdicate"; L.kin = mode === "abdicate"; }
  st.stability = clamp(st.stability - cost.stab); shakeFactions(st, cost.fac); addShock(st, mi, "leader", cost.legit, cost.years);
  if (mode === "depose") eventOf(ctx, st, "leader_deposed", `${st.name}で、${old}が退けられた`, { by: "player" }); ctx._byState = null; return { ok: true, cost, mode };
}
/** 財政の値（税率・徴兵率・寛容・同化・自治）。数字入力とスライダーの両方から呼ばれる */
export const FINANCE = Object.freeze({
  tax: { ja: "税率", min: 0.02, max: 0.4, step: 0.01, steps: [0.06, 0.1, 0.16, 0.26] },
  mobilization: { ja: "徴兵率", min: 0, max: 0.15, step: 0.01, steps: [0, 0.03, 0.07, 0.12] },
  tolerance: { ja: "寛容", min: 0, max: 1, step: 0.05, steps: [0.1, 0.4, 0.7, 1] },
  assimilation: { ja: "同化", min: 0, max: 1, step: 0.05, steps: [0, 0.3, 0.6, 0.9] },
  autonomy: { ja: "自治", min: 0, max: 1, step: 0.05, steps: [0, 0.25, 0.5, 0.8] },
});
export const FINANCE_COOLDOWN = 3;
export function setFinance(ctx, st, { key, value }) {
  const F = FINANCE[key], mi = ctx.civ.monthIndex; if (!st?.alive) return fail("その国家は存在しません"); if (!F) return fail("財政の項目が不正です");
  const v = Number(value); if (!Number.isFinite(v)) return fail("数値を入れてください"); const nv = r3(clamp(Math.round(v / F.step) * F.step, F.min, F.max)), cur = st.policy[key]; if (Math.abs(nv - cur) < 1e-9) return { ok: true, changed: false };
  const last = st.finLast?.[key]; if (last != null && mi - last < FINANCE_COOLDOWN) return fail(`${F.ja}は、あと ${FINANCE_COOLDOWN - (mi - last)} か月は変えられません`);
  const cost = key === "tolerance" || key === "assimilation" || key === "autonomy" ? Math.round(Math.abs(nv - cur) * (10 + (st.pop ?? 0) * 0.0004)) : 0; if (cost > st.treasury) return fail(`費用 ${cost} が足りません`);
  st.treasury -= cost; st.policy[key] = nv; (st.finLast ??= {})[key] = mi; ctx._byState = null; return { ok: true, changed: true, before: cur, after: nv, cost };
}
export { playerRegimeOptions, changeScale };
