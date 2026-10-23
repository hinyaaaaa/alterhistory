// V5-M5: 国家AI（NPC 国家だけ）。4層: 戦略（約10年ごとの目標）／計画（数か月〜数年の征服などの手順）／日常（数か月ごとの行動選択）／危機（不安定・戦況悪化時の優先行動）。
// 計画は ai_plan フェーズで立て（地図を変えない）、適用は apply フェーズ。すべての評価は判断記録（civ.decisions）に、候補・得点・理由・結果ごと残す。
// プレイヤーの国家は AI が動かさない（命令だけ）。
import { ACTIONS, ACTION, observe, runAction } from "./actions.js";
import { hashSeed } from "./civ-state.js";
import { strength } from "./diplomacy.js";
import { makeEvent } from "./events.js";

const GOALS = Object.freeze({ expand: "expansion", prosper: "prosperity", secure: "security", advance: "tech", consolidate: "stability" });
export const GOAL_JA = Object.freeze({ expand: "拡大", prosper: "繁栄", secure: "安全", advance: "技術の進歩", consolidate: "安定" });
const BASELINE = 0.15, STRATEGY_EVERY = 120;
// 判断記録は大量になる（国家数×月数）ため、候補は『キー名のない配列』で持つ: [key, target, opt, total|null(=不可), 理由の辞書番号|null, 欲求の配列|0]
const FACTORS = Object.freeze(["security", "prosperity", "expansion", "stability", "culture", "tech", "prestige"]);
const SHOWN = 6, SHOWN_IDLE = 3;
const intern = (civ, str) => { if (!str) return null; const r = civ.dict.reasons; let i = r.indexOf(str); if (i < 0) { i = r.length; r.push(str); } return i; };
const packCand = (civ, c, total) => [c.key, c.target ?? null, c.opt ?? null, total === null || total === -Infinity ? null : total, intern(civ, c.reason), c.eligible && Object.keys(c.factors ?? {}).length ? FACTORS.map((f) => Math.round((c.factors[f] ?? 0) * 100) / 100) : 0];
/** 判断記録の候補を、読みやすいオブジェクトへ戻す（画面・検査・研究用） */
export const expandDecision = (civ, d) => ({ ...d, candidates: d.candidates.map(([key, target, opt, total, r, f]) => ({ key, target, opt, total, eligible: total !== null, reason: r === null ? null : civ.dict.reasons[r], factors: f ? Object.fromEntries(FACTORS.map((n, i) => [n, f[i]]).filter(([, v]) => v)) : {} })) });
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const round = (x) => Math.round(x * 1000) / 1000;

function record(ctx, st, d) {
  const { civ, ids } = ctx, id = ids.next("decision");
  civ.decisions.push({ decisionId: id, date: { ...civ.date }, actorId: st.id, provenance: d.provenance ?? "ai", layer: d.layer, type: d.type, observations: d.obs, strategy: st.strategy ? st.strategy.goal : null, candidates: d.candidates.map(([c, total]) => (Array.isArray(c) ? c : packCand(civ, c, total))), chosen: d.chosen, result: null });
  return civ.decisions[civ.decisions.length - 1];
}
const obsOf = (st, e) => ({ pop: Math.round(st.pop), treasury: Math.round(st.treasury), stability: round(st.stability), army: Math.round(st.army), strength: Math.round(e.my), atWar: e.atWar, neighbors: e.nbs.length, tension: round(e.tension), threat: round(e.threat), campaign: st.campaign ? `${st.campaign.kind}:${st.campaign.stage}` : null });

/** 欲求ごとの評価を、国家の気質・戦略・危機の重みで合計する */
function totalOf(st, c, crisis) {
  const goalF = st.strategy ? GOALS[st.strategy.goal] : null; let t = 0;
  for (const [f, v] of Object.entries(c.factors)) { let w = st.personality[f] ?? 1; if (f === goalF) w *= 1.5; if (crisis && (f === "stability" || f === "security")) w *= 2; t += w * v; }
  return round(t);
}
const view = (c, total) => [c, total];

function chooseStrategy(ctx, st, e) {
  const needs = { expand: 0.25 + 0.4 * clamp((e.my + 1) / (e.nbs.reduce((s, n) => s + n.strength, 0) / Math.max(1, e.nbs.length) + 1) - 1, 0, 2) * 0.5, prosper: e.treasuryNeed, secure: e.threat, advance: e.techLag, consolidate: 1 - st.stability };
  const list = Object.entries(needs).map(([goal, n]) => ({ goal, total: round(n * st.personality[GOALS[goal]]) })).sort((a, b) => b.total - a.total || (a.goal < b.goal ? -1 : 1));
  const d = record(ctx, st, { layer: "strategy", type: "set_strategy", obs: obsOf(st, e), candidates: list.map((x) => view({ key: x.goal, target: null, opt: null, eligible: true, reason: null, factors: {} }, x.total)), chosen: { key: list[0].goal, target: null, opt: null } });
  const changed = st.strategy?.goal !== list[0].goal; st.strategy = { goal: list[0].goal, since: ctx.civ.monthIndex }; d.result = { ok: true, error: null, eventIds: [], changed };
}
/** 計画（征服）の続き。次の手順・待つ・断念を記録つきで決める */
function planCampaign(ctx, st, e) {
  const { civ } = ctx, c = st.campaign, t = civ.states[c.target]; let key = "wait", why = null;
  if (!t?.alive) { key = "abandon"; why = "相手が存在しない"; } else if (civ.monthIndex > c.deadline && c.stage === "prepare") { key = "abandon"; why = "期限切れ"; } else if (st.stability < 0.3) { key = "abandon"; why = "国内が不安定"; } else if (c.stage === "prepare") {
    const ratio = (e.my + 1) / (strength(civ, t) + 1);
    if (st.policy.mobilization < 0.1) key = "mobilize"; else if (ratio >= 1.2 || civ.monthIndex - c.startedAt >= 12) { key = ratio >= 1 ? "declare_war" : "abandon"; if (key === "abandon") why = "戦力が見合わない"; }
  } else if (c.stage === "war" && !(c.warId && civ.wars[c.warId]?.status === "active")) { key = "abandon"; why = "戦争が終わった"; }
  const cands = ["declare_war", "mobilize", "wait", "abandon"].map((k) => view({ key: k, target: c.target, opt: null, eligible: true, reason: k === key ? why : null, factors: {} }, k === key ? 1 : 0));
  return { layer: "campaign", type: `campaign_${key}`, obs: obsOf(st, e), candidates: cands, chosen: { key, target: c.target, opt: null }, reason: why };
}

/** ai_plan: 各 NPC 国家が3か月（options.aiInterval）ごとに1回評価して、計画（ctx.plans）を作る。地図・状態は変えない */
export function stepAIPlan(ctx) {
  const { civ } = ctx, mi = civ.monthIndex, every = civ.options.aiInterval; ctx.plans = [];
  for (const id in civ.states) {
    const st = civ.states[id]; if (!st.alive || st.player) continue; if ((hashSeed(id) + mi) % every !== 0) continue;
    const e = observe(ctx, st); if (!st.strategy || mi - st.strategy.since >= STRATEGY_EVERY) chooseStrategy(ctx, st, e);
    if (st.campaign) { const p = planCampaign(ctx, st, e), d = record(ctx, st, p); ctx.plans.push({ st, d, campaign: p.chosen.key, why: p.reason }); continue; }
    const crisis = st.stability < 0.35 || st.warIds.some((w) => { const wr = civ.wars[w]; return (wr.sides.a.includes(st.id) ? wr.score : -wr.score) < -40; }) || st.treasury < 0;
    const all = []; for (const def of ACTIONS) if (def.enabled) for (const c of def.candidates(ctx, st, e)) all.push({ def, c, total: c.eligible ? totalOf(st, c, crisis) : -Infinity });
    all.sort((a, b) => b.total - a.total || (a.c.key < b.c.key ? -1 : a.c.key > b.c.key ? 1 : String(a.c.target) < String(b.c.target) ? -1 : 1));
    const best = all.find((x) => x.total > BASELINE), shown = all.slice(0, best ? SHOWN : SHOWN_IDLE).map((x) => view(x.c, x.total === -Infinity ? null : x.total));
    if (!best) shown.push(view({ key: "do_nothing", target: null, opt: null, eligible: true, reason: "基準値（0.15）を超える候補がない", factors: {} }, BASELINE));
    const d = record(ctx, st, { layer: crisis ? "crisis" : "routine", type: best ? best.c.key : "do_nothing", obs: obsOf(st, e), candidates: shown, chosen: best ? { key: best.c.key, target: best.c.target, opt: best.c.opt } : { key: "do_nothing", target: null, opt: null } });
    if (best) ctx.plans.push({ st, d, def: best.def, c: best.c }); else d.result = { ok: true, error: null, eventIds: [], idle: true };
  }
}
/** apply: 計画を、検証つきの行動として実行する。結果（成功・失敗の理由・イベントID）を判断記録へ書く */
export function stepAIApply(ctx) {
  const { civ } = ctx;
  for (const p of ctx.plans ?? []) {
    const { st, d } = p; if (!st.alive) { d.result = { ok: false, error: "国家が存在しない", eventIds: [] }; continue; }
    if (p.campaign) {
      const c = st.campaign; if (!c) { d.result = { ok: false, error: "計画が既に無い", eventIds: [] }; continue; }
      if (p.campaign === "mobilize") { const r = runAction(ctx, st, ACTION.set_mobilization, { key: "set_mobilization", opt: "0.15", target: null, factors: {} }, { decisionId: d.decisionId }); d.result = { ok: r.ok, error: r.error ?? null, eventIds: r.eventIds }; }
      else if (p.campaign === "declare_war") { const r = runAction(ctx, st, ACTION.declare_war, { key: "declare_war", target: c.target, factors: {} }, { decisionId: d.decisionId }); d.result = { ok: r.ok, error: r.error ?? null, eventIds: r.eventIds }; if (!r.ok) st.campaign = null; }
      else if (p.campaign === "abandon") { st.campaign = null; const ev = makeEvent(civ, ctx.ids, { kind: "campaign_abandoned", title: `${st.name}が征服計画を断念した（${p.why}）`, participants: [{ entityId: st.id, role: "state" }, { entityId: c.target, role: "target" }], location: null, decisionId: d.decisionId }); d.result = { ok: true, error: null, eventIds: [ev.eventId] }; }
      else d.result = { ok: true, error: null, eventIds: [], waited: true };
      continue;
    }
    const r = runAction(ctx, st, p.def, p.c, { decisionId: d.decisionId }); d.result = { ok: r.ok, error: r.error ?? null, eventIds: r.eventIds };
  }
  ctx.plans = [];
}
/** プレイヤー国家の行動を記録して実行する（AI と同じ候補生成・同じ実行。判断記録には provenance: "player"） */
export function runPlayerAction(ctx, st, def, c) {
  const e = observe(ctx, st), d = record(ctx, st, { layer: "player", provenance: "player", type: c.key, obs: obsOf(st, e), candidates: [view(c, 0)], chosen: { key: c.key, target: c.target, opt: c.opt } });
  const r = runAction(ctx, st, def, c, { decisionId: d.decisionId, provenance: "player" }); d.result = { ok: r.ok, error: r.error ?? null, eventIds: r.eventIds }; return r;
}
