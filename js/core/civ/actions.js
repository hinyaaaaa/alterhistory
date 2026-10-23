// V5-M5: 国家の行動レジストリ。AI もプレイヤーも「同じ候補生成・同じ実行」を通る（候補生成と手動操作の等価性）。
// 行動 = { key, domain, label, enabled, candidates(ctx, st, env) → 候補[], execute(ctx, st, cand) → {ok, error?, effects[]} }
// 候補 = { key, target, opt, factors（欲求ごとの評価 -1〜1）, eligible, reason }。国家の personality と戦略で重みづけして AI が選ぶ。
import { makeEvent } from "./events.js";
import { TECH, adoptable } from "./tech.js";
import { byState, neighborGroups } from "./spatial.js";
import { foundSettlement } from "./population.js";
import { POLITY } from "./states.js";
import { neighborStates, strength, treatyBetween, atWarWith, signTreaty, endTreaty, declareWar, endWar, adjustRel, TREATY } from "./diplomacy.js";
import { dominant } from "./cohorts.js";

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const cand = (key, f, o = {}) => ({ key, target: o.target ?? null, opt: o.opt ?? null, factors: f, eligible: o.eligible ?? true, reason: o.reason ?? null, label: o.label ?? null });
const bad = (key, reason, o = {}) => cand(key, {}, { ...o, eligible: false, reason });
const r3 = (x) => Math.round(x * 1000) / 1000;
const eff = (list, st, property, before, after) => { list.push({ targetId: st.id, property, before: typeof before === "number" ? Math.round(before * 1000) / 1000 : before, after: typeof after === "number" ? Math.round(after * 1000) / 1000 : after }); };
const spend = (st, n) => (st.treasury >= n ? ((st.treasury -= n), true) : false);

/** 観測（1回の評価につき1つ作る） */
export function observe(ctx, st) {
  const { civ } = ctx, gs = byState(ctx).get(st.id) ?? [], nb = neighborStates(ctx, st).map((i) => civ.states[i]).filter(Boolean);
  let tens = 0; for (const g of gs) { let t = 0; for (const c of g.cohorts) if (c.tension > t) t = c.tension; tens += t * g.pop; }
  const my = strength(civ, st), nbs = nb.map((o) => ({ st: o, pop: o.pop, strength: strength(civ, o), rel: st.relations[o.id] ?? 0, atWar: atWarWith(civ, st, o), treaties: { na: !!treatyBetween(civ, st, o, "nonaggression"), al: !!treatyBetween(civ, st, o, "alliance"), tr: !!treatyBetween(civ, st, o, "trade") } }));
  const techs = Object.keys(st.techAdopted).length, lag = nbs.length ? clamp((nbs.reduce((s, n) => s + Object.keys(n.st.techAdopted).length, 0) / nbs.length - techs) / 6) : 0;
  const myBase = st.pop * 0.005 * (0.5 + st.stability) * (my / (st.army + 1e-9) || 1) * (1 + st.defense * 0.5), maxThreat = nbs.reduce((m, n) => Math.max(m, n.strength / (myBase + 1)), 0); // 脅威は、自分の動員の程度に左右されない基準の戦力と比べる（動員→脅威が下がる→解除の往復を避ける）
  return { gs, nbs, pop: st.pop, my, tension: st.pop ? tens / st.pop : 0, treasuryNeed: clamp(1 - st.treasury / (st.pop * 0.02 + 50)), techLag: lag, threat: clamp((maxThreat - 0.8) / 2), atWar: st.warIds.length > 0, mi: civ.monthIndex };
}
const free = (ctx, id) => ctx.civ.states[id];

export const ACTIONS = [
  { key: "set_tax", domain: "finance", label: "税率の調整", enabled: true,
    candidates(ctx, st, e) { const t = st.policy.tax, out = []; if (t < 0.4) out.push(cand("set_tax", { prosperity: 0.9 * e.treasuryNeed, stability: -0.4 - e.tension }, { opt: "up", label: "増税" })); else out.push(bad("set_tax", "税率が上限", { opt: "up" })); if (t > 0.03) out.push(cand("set_tax", { stability: 0.2 + 0.7 * e.tension, prosperity: -0.3 * e.treasuryNeed }, { opt: "down", label: "減税" })); else out.push(bad("set_tax", "税率が下限", { opt: "down" })); return out; },
    execute(ctx, st, c) { const ef = [], b = st.policy.tax, a = r3(clamp(b + (c.opt === "up" ? 0.05 : -0.05), 0.02, 0.4)); st.policy.tax = a; eff(ef, st, "policy.tax", b, a); return { ok: true, effects: ef, title: c.opt === "up" ? "増税" : "減税" }; } },
  { key: "adopt_tech", domain: "tech", label: "技術の採用", enabled: true,
    candidates(ctx, st, e) { const cache = (ctx._adopt ??= new Map()), hit = cache.get(st.id); const list = hit && e.mi - hit.mi < 12 ? hit.list : (cache.set(st.id, { mi: e.mi, list: adoptable(ctx, st, e.gs) }), cache.get(st.id).list); return list.filter((t) => st.techAdopted[t.key] == null).slice(0, 3).map((t) => { const cost = t.tier * 15; return st.treasury >= cost ? cand("adopt_tech", { tech: 0.3 + 0.12 * t.tier + e.techLag * 0.4, prosperity: 0.15, prestige: 0.05 * t.tier }, { opt: t.key, label: `${t.name}を採用` }) : bad("adopt_tech", "財政が足りない", { opt: t.key }); }); },
    execute(ctx, st, c) { const t = TECH[c.opt]; if (!t || st.techAdopted[t.key] != null) return { ok: false, error: "採用できない技術" }; if (!spend(st, t.tier * 15)) return { ok: false, error: "財政が足りない" }; st.techAdopted[t.key] = ctx.civ.monthIndex; return { ok: true, effects: [{ targetId: st.id, property: `techAdopted.${t.key}`, before: null, after: ctx.civ.monthIndex }], title: `${t.name}を採用` }; } },
  { key: "change_polity", domain: "institution", label: "政体の変更", enabled: true,
    candidates(ctx, st) { const a = st.techAdopted, out = [], p = st.polity, n = st.pop;
      if (p === "tribal") out.push(n >= 2000 ? cand("change_polity", { stability: 0.3, prestige: 0.2 }, { opt: "chiefdom" }) : bad("change_polity", "人口が足りない", { opt: "chiefdom" }));
      if (p === "chiefdom" || p === "theocracy") { out.push(a.administration != null && n >= 15000 ? cand("change_polity", { stability: 0.3, prestige: 0.4 }, { opt: "kingdom" }) : bad("change_polity", "行政の技術と人口が必要", { opt: "kingdom" })); if (p === "chiefdom") out.push(a.law != null && n >= 15000 && st.policy.tolerance > 0.5 ? cand("change_polity", { stability: 0.25, culture: 0.2 }, { opt: "republic" }) : bad("change_polity", "法の技術・人口・寛容が必要", { opt: "republic" })); }
      if (p === "kingdom") out.push(a.bureaucracy != null && n >= 150000 ? cand("change_polity", { stability: 0.2, prestige: 0.6, expansion: 0.2 }, { opt: "empire" }) : bad("change_polity", "官僚制と人口が必要", { opt: "empire" })); return out; },
    execute(ctx, st, c) { const ok = POLITY[c.opt]; if (!ok) return { ok: false, error: "未知の政体" }; const ef = []; eff(ef, st, "polity", st.polity, c.opt); st.polity = c.opt; return { ok: true, effects: ef, title: `政体を${POLITY[c.opt]}へ` }; } },
  { key: "designate_heir", domain: "leader", label: "継承者の指名", enabled: true,
    candidates(ctx, st) { return st.leader.heir ? [bad("designate_heir", "すでに指名済み")] : [cand("designate_heir", { stability: 0.35 })]; },
    execute(ctx, st) { if (st.leader.heir) return { ok: false, error: "すでに指名済み" }; st.leader.heir = true; return { ok: true, effects: [{ targetId: st.id, property: "leader.heir", before: false, after: true }] }; } },
  { key: "encourage_settlement", domain: "population", label: "定住・入植の奨励", enabled: true,
    candidates(ctx, st) { return st.boostUntil > ctx.civ.monthIndex ? [bad("encourage_settlement", "奨励中")] : st.treasury >= 30 ? [cand("encourage_settlement", { prosperity: 0.3, expansion: 0.25 })] : [bad("encourage_settlement", "財政が足りない")]; },
    execute(ctx, st) { if (!spend(st, 30)) return { ok: false, error: "財政が足りない" }; st.boostUntil = ctx.civ.monthIndex + 60; return { ok: true, effects: [{ targetId: st.id, property: "boostUntil", before: null, after: st.boostUntil }] }; } },
  { key: "set_mobilization", domain: "mobilization", label: "動員", enabled: true,
    candidates(ctx, st, e) { const want = e.atWar || e.threat > 0.7 ? 0.15 : e.threat > 0.4 ? 0.05 : 0; // 脅威に応じた望ましい水準へ（行ったり来たりしない）
      return [0, 0.05, 0.15].filter((v) => v !== st.policy.mobilization).map((v) => cand("set_mobilization", v === want ? { security: 0.5, prosperity: v < st.policy.mobilization ? 0.2 : -0.1 } : { security: -0.3 }, { opt: String(v), label: `動員率${v}` })); },
    execute(ctx, st, c) { const v = Number(c.opt); if (!(v >= 0 && v <= 0.15)) return { ok: false, error: "動員率が範囲外" }; const ef = []; eff(ef, st, "policy.mobilization", st.policy.mobilization, v); st.policy.mobilization = v; return { ok: true, effects: ef }; } },
  { key: "build_fortification", domain: "military", label: "要塞の整備", enabled: true,
    candidates(ctx, st, e) { if (st.techAdopted.fortification == null) return [bad("build_fortification", "城壁の技術を採用していない")]; if (st.defense >= 0.5) return [bad("build_fortification", "整備済み")]; return st.treasury >= 40 ? [cand("build_fortification", { security: 0.3 + e.threat * 0.6 })] : [bad("build_fortification", "財政が足りない")]; },
    execute(ctx, st) { if (st.techAdopted.fortification == null) return { ok: false, error: "城壁の技術がない" }; if (!spend(st, 40)) return { ok: false, error: "財政が足りない" }; const ef = []; eff(ef, st, "defense", st.defense, Math.min(0.5, st.defense + 0.1)); st.defense = Math.min(0.5, st.defense + 0.1); return { ok: true, effects: ef }; } },
  { key: "plan_conquest", domain: "war", label: "征服の計画", enabled: true,
    candidates(ctx, st, e) { if (st.campaign) return [bad("plan_conquest", "別の計画が進行中")]; if (e.mi - (st.lastWarEnd ?? -999) < 180) return [bad("plan_conquest", "戦争の疲弊から回復していない")]; return e.nbs.filter((n) => !n.atWar && !n.treaties.na && !n.treaties.al).map((n) => { const ratio = (e.my + 1) / (n.strength + 1); return ratio >= 1.3 ? cand("plan_conquest", { expansion: clamp((ratio - 1) / 2) - 0.1 * st.warIds.length, prestige: 0.1, stability: -0.2, prosperity: -0.3 }, { target: n.st.id, label: `${n.st.name}の征服` }) : bad("plan_conquest", "戦力が足りない", { target: n.st.id }); }); },
    execute(ctx, st, c) { const t = free(ctx, c.target); if (!t?.alive) return { ok: false, error: "相手が存在しない" }; if (st.campaign) return { ok: false, error: "別の計画が進行中" }; st.campaign = { kind: "conquest", target: t.id, stage: "prepare", startedAt: ctx.civ.monthIndex, deadline: ctx.civ.monthIndex + 60, warId: null }; return { ok: true, effects: [{ targetId: st.id, property: "campaign", before: null, after: `conquest:${t.id}` }], title: `${t.name}の征服を計画`, targetId: t.id }; } },
  { key: "declare_war", domain: "war", label: "宣戦", enabled: true,
    candidates() { return []; }, // AI は「征服の計画」の手順として行う。プレイヤーは対象を指定して実行できる
    execute(ctx, st, c) { const t = free(ctx, c.target); if (!t?.alive || t.id === st.id) return { ok: false, error: "相手が存在しない" }; if (atWarWith(ctx.civ, st, t)) return { ok: false, error: "すでに交戦中" }; if (treatyBetween(ctx.civ, st, t, "nonaggression") || treatyBetween(ctx.civ, st, t, "alliance")) return { ok: false, error: "条約があるため宣戦できない（先に破棄する）" }; if (!neighborStates(ctx, st).includes(t.id)) return { ok: false, error: "隣接していない" }; const w = declareWar(ctx, st, t, { decisionId: c.decisionId, provenance: c.provenance }); if (st.campaign?.target === t.id) { st.campaign.stage = "war"; st.campaign.warId = w.id; } return { ok: true, effects: [], warId: w.id, silent: true, targetId: t.id }; } },
  { key: "sue_for_peace", domain: "war", label: "講和", enabled: true,
    candidates(ctx, st) { return st.warIds.map((i) => ctx.civ.wars[i]).map((w) => { const mine = w.sides.a.includes(st.id) ? w.score : -w.score; return cand("sue_for_peace", { security: clamp(-mine / 50) + 0.1, stability: 0.2 }, { target: w.id, label: "講和" }); }); },
    execute(ctx, st, c) { const w = ctx.civ.wars[c.target]; if (!w || w.status !== "active" || !st.warIds.includes(w.id)) return { ok: false, error: "その戦争は進行中ではない" }; endWar(ctx, w, "negotiated"); return { ok: true, effects: [], silent: true, targetId: w.id }; } },
  { key: "sign_treaty", domain: "diplomacy", label: "条約の締結", enabled: true,
    candidates(ctx, st, e) { const out = []; for (const n of e.nbs) { if (n.atWar) continue; for (const type of ["nonaggression", "alliance", "trade"]) { const have = type === "nonaggression" ? n.treaties.na : type === "alliance" ? n.treaties.al : n.treaties.tr; if (have) continue; if (n.rel < -20 || (type === "alliance" && n.rel < 10)) { out.push(bad("sign_treaty", "関係が良くない", { target: n.st.id, opt: type })); continue; } const f = type === "trade" ? { prosperity: 0.35 } : type === "nonaggression" ? { security: 0.2 + clamp(n.strength / (e.my + 1) - 0.8) * 0.5 } : { security: 0.3 + e.threat * 0.5, prestige: 0.15 }; out.push(cand("sign_treaty", f, { target: n.st.id, opt: type, label: `${n.st.name}と${TREATY[type].ja}` })); } } return out; },
    execute(ctx, st, c) { const t = free(ctx, c.target); if (!t?.alive || !TREATY[c.opt]) return { ok: false, error: "相手または条約の種類が不正" }; if (atWarWith(ctx.civ, st, t)) return { ok: false, error: "交戦中の相手とは結べない" }; if (treatyBetween(ctx.civ, st, t, c.opt)) return { ok: false, error: "すでに結んでいる" }; const rel = st.relations[t.id] ?? 0; if (rel < -20 || (c.opt === "alliance" && rel < 10)) return { ok: false, error: "相手との関係が十分でなく、受け入れられなかった", diplomacyFailure: true, targetId: t.id }; signTreaty(ctx, c.opt, st, t, { decisionId: c.decisionId, provenance: c.provenance }); return { ok: true, effects: [], silent: true, targetId: t.id }; } },
  { key: "break_treaty", domain: "diplomacy", label: "条約の破棄", enabled: true,
    candidates(ctx, st) { const camp = st.campaign; if (!camp || camp.stage !== "prepare") return []; const t = treatyBetween(ctx.civ, st, free(ctx, camp.target), "nonaggression"); return t ? [cand("break_treaty", { expansion: 0.3, prestige: -0.5 }, { target: t.id })] : []; },
    execute(ctx, st, c) { const t = ctx.civ.treaties[c.target]; if (!t?.active || (t.a !== st.id && t.b !== st.id)) return { ok: false, error: "その条約は有効ではない" }; endTreaty(ctx, t, "破棄された"); adjustRel(st, ctx.civ.states[t.a === st.id ? t.b : t.a], -30); return { ok: true, effects: [], silent: true, targetId: t.id }; } },
  { key: "impose_sanctions", domain: "sanctions", label: "経済制裁", enabled: true,
    candidates(ctx, st, e) { return e.nbs.filter((n) => !n.atWar && n.rel < -10 && !(n.st.sanctions[st.id] > e.mi)).map((n) => cand("impose_sanctions", { security: 0.15, prestige: 0.2, prosperity: -0.15 }, { target: n.st.id, label: `${n.st.name}へ制裁` })); },
    execute(ctx, st, c) { const t = free(ctx, c.target); if (!t?.alive) return { ok: false, error: "相手が存在しない" }; t.sanctions[st.id] = ctx.civ.monthIndex + 36; adjustRel(st, t, -15); return { ok: true, effects: [{ targetId: t.id, property: `sanctions.${st.id}`, before: null, after: t.sanctions[st.id] }], targetId: t.id }; } },
  { key: "covert_op", domain: "covert", label: "秘密工作", enabled: true,
    candidates(ctx, st, e) { return e.nbs.filter((n) => !n.atWar && n.rel < 0 && st.treasury >= 25).map((n) => cand("covert_op", { expansion: 0.15, security: 0.15, prestige: -0.1 }, { target: n.st.id, label: `${n.st.name}への工作` })); },
    execute(ctx, st, c) { const t = free(ctx, c.target); if (!t?.alive) return { ok: false, error: "相手が存在しない" }; if (!spend(st, 25)) return { ok: false, error: "財政が足りない" }; const p = 0.35 + (st.techAdopted.writing != null ? 0.1 : 0) + (st.techAdopted.administration != null ? 0.1 : 0);
      if (ctx.rng() < p) { const b = t.stability; t.stability = Math.max(0, t.stability - 0.08); return { ok: true, effects: [{ targetId: t.id, property: "stability", before: Math.round(b * 1000) / 1000, after: Math.round(t.stability * 1000) / 1000 }], targetId: t.id, title: "秘密工作が成功" }; }
      adjustRel(st, t, -20); return { ok: false, error: "工作が発覚した", diplomacyFailure: true, targetId: t.id }; } },
  { key: "suppress_unrest", domain: "rebellion", label: "不満の鎮圧", enabled: true,
    candidates(ctx, st, e) { return st.treasury >= 20 ? [cand("suppress_unrest", { stability: 0.5 * e.tension + (st.stability < 0.45 ? 0.4 : 0), culture: -0.1 })] : [bad("suppress_unrest", "財政が足りない")]; },
    execute(ctx, st, c, ) { if (!spend(st, 20)) return { ok: false, error: "財政が足りない" }; const ef = []; for (const g of byState(ctx).get(st.id) ?? []) for (const co of g.cohorts) co.tension *= 0.8; eff(ef, st, "stability", st.stability, Math.min(1, st.stability + 0.06)); st.stability = Math.min(1, st.stability + 0.06); return { ok: true, effects: ef }; } },
  { key: "grant_autonomy", domain: "rebellion", label: "自治の容認", enabled: true,
    candidates(ctx, st, e) { return st.policy.autonomy >= 1 ? [bad("grant_autonomy", "最大")] : [cand("grant_autonomy", { stability: 0.6 * e.tension, culture: 0.2, prestige: -0.1 })]; },
    execute(ctx, st) { const ef = [], b = st.policy.autonomy; st.policy.autonomy = r3(clamp(b + 0.2)); eff(ef, st, "policy.autonomy", b, st.policy.autonomy); for (const g of byState(ctx).get(st.id) ?? []) for (const c of g.cohorts) c.tension *= 0.85; return { ok: true, effects: ef }; } },
  { key: "promote_culture", domain: "culture", label: "同化政策", enabled: true,
    candidates(ctx, st, e) { return st.policy.assimilation >= 1 ? [bad("promote_culture", "最大")] : [cand("promote_culture", { culture: 0.45, stability: -0.3 * e.tension })]; },
    execute(ctx, st) { const ef = [], b = st.policy.assimilation; st.policy.assimilation = r3(clamp(b + 0.2)); eff(ef, st, "policy.assimilation", b, st.policy.assimilation); return { ok: true, effects: ef }; } },
  { key: "set_tolerance", domain: "religion", label: "宗教政策", enabled: true,
    candidates(ctx, st, e) { const t = st.policy.tolerance; return [t < 1 ? cand("set_tolerance", { stability: 0.4 * e.tension, culture: -0.1 }, { opt: "up", label: "寛容" }) : bad("set_tolerance", "最大", { opt: "up" }), t > 0 ? cand("set_tolerance", { culture: 0.3, stability: -0.3 * e.tension }, { opt: "down", label: "国教の強化" }) : bad("set_tolerance", "最小", { opt: "down" })]; },
    execute(ctx, st, c) { const ef = [], b = st.policy.tolerance, a = r3(clamp(b + (c.opt === "up" ? 0.2 : -0.2))); st.policy.tolerance = a; eff(ef, st, "policy.tolerance", b, a); return { ok: true, effects: ef }; } },
  { key: "found_city", domain: "territory", label: "都市の建設", enabled: true,
    candidates(ctx, st, e) { return e.gs.filter((g) => !g.settlementId && (g.subsistence === "agriculture" || g.subsistence === "fishing") && g.pop >= 250).sort((a, b) => b.pop - a.pop).slice(0, 2).map((g) => cand("found_city", { prosperity: 0.3, expansion: 0.25 }, { target: g.id })); },
    execute(ctx, st, c) { const g = ctx.civ.groups[c.target]; if (!g || g.stateId !== st.id || g.settlementId || g.pop < 250 || g.subsistence === "forage" || g.subsistence === "pastoral") return { ok: false, error: "その集団では建設できない" }; const s = foundSettlement(ctx.world, ctx.civ, ctx.ids, g), ev = ctx.civ.events.at(-1); ev.provenance = c.provenance ?? "simulation"; ev.decisionId = c.decisionId ?? null; return { ok: true, effects: [], silent: true, targetId: s.id }; } },
  { key: "annex_group", domain: "territory", label: "周辺集団の編入", enabled: true,
    candidates(ctx, st, e) { const out = []; for (const g of e.gs) for (const o of neighborGroups(ctx, g)) { const t = ctx.civ.groups[o]; if (t && !t.stateId && !t.player && t.pop < st.pop) out.push(cand("annex_group", { expansion: 0.45, prosperity: 0.1 }, { target: o })); } const seen = new Set(); return out.filter((c) => !seen.has(c.target) && seen.add(c.target)).slice(0, 3); },
    execute(ctx, st, c) { const t = ctx.civ.groups[c.target]; if (!t || t.stateId || t.player) return { ok: false, error: "その集団は編入できない" }; if (!spend(st, 20)) return { ok: false, error: "財政が足りない" }; t.stateId = st.id; return { ok: true, effects: [{ targetId: t.id, property: "stateId", before: null, after: st.id }], targetId: t.id, title: "周辺の集団を編入" }; } },
  { key: "move_capital", domain: "city", label: "遷都", enabled: true,
    candidates(ctx, st, e) { const cap = ctx.civ.groups[st.capitalGroupId], big = e.gs.reduce((a, b) => (b.pop > (a?.pop ?? 0) ? b : a), null); return big && cap && big.id !== cap.id && big.pop > cap.pop * 2 ? [cand("move_capital", { stability: 0.2, prestige: 0.15 }, { target: big.id })] : []; },
    execute(ctx, st, c) { const g = ctx.civ.groups[c.target]; if (!g || g.stateId !== st.id) return { ok: false, error: "その集団は国内にない" }; const ef = []; eff(ef, st, "capitalGroupId", st.capitalGroupId, g.id); st.capitalGroupId = g.id; return { ok: true, effects: ef, targetId: g.id }; } },
  { key: "reconcile", domain: "peace", label: "和解", enabled: true,
    candidates(ctx, st, e) { return e.nbs.filter((n) => !n.atWar && n.rel < -20 && st.treasury >= 15).map((n) => cand("reconcile", { security: 0.3, prestige: 0.1 }, { target: n.st.id })); },
    execute(ctx, st, c) { const t = free(ctx, c.target); if (!t?.alive) return { ok: false, error: "相手が存在しない" }; if (!spend(st, 15)) return { ok: false, error: "財政が足りない" }; adjustRel(st, t, 25); return { ok: true, effects: [], targetId: t.id, title: "和解の使節" }; } },
  // 後続マイルストーンで有効にする行動（登録だけして、候補は出さない）
  { key: "disaster_relief", domain: "disaster", label: "災害対応", enabled: false, disabledReason: "災害は V5-M11", candidates: () => [], execute: () => ({ ok: false, error: "未実装" }) },
  { key: "magic_institution", domain: "magic", label: "魔法制度", enabled: false, disabledReason: "魔法は V5-M8", candidates: () => [], execute: () => ({ ok: false, error: "未実装" }) },
  { key: "nuclear_program", domain: "nuclear", label: "核計画", enabled: false, disabledReason: "核は技術「核」の採用後（後続）", candidates: () => [], execute: () => ({ ok: false, error: "未実装" }) },
];
export const ACTION = Object.freeze(Object.fromEntries(ACTIONS.map((a) => [a.key, a])));

/** 行動を実行し、成功なら結果イベントを記録する（AI もプレイヤーもここを通る） */
export function runAction(ctx, st, def, c, { decisionId = null, provenance = "ai" } = {}) {
  const cc = { ...c, decisionId, provenance }, r = def.execute(ctx, st, cc), { civ, ids } = ctx;
  if (!r.ok) return { ok: false, error: r.error, eventIds: [] };
  let eventId = civ.events.length ? civ.events[civ.events.length - 1].eventId : null;
  if (!r.silent) { const ev = makeEvent(civ, ids, { kind: "state_action", title: `${st.name}: ${r.title ?? def.label}`, participants: [{ entityId: st.id, role: "actor" }, ...(r.targetId ? [{ entityId: r.targetId, role: "target" }] : [])], location: civ.groups[st.capitalGroupId] ? { cell: civ.groups[st.capitalGroupId].cell } : null, effects: r.effects ?? [], decisionId, provenance }); eventId = ev.eventId; }
  return { ok: true, eventIds: [eventId], warId: r.warId ?? null };
}
/** 命令（プレイヤー）用: 候補の一覧から対象・種類が一致するものを探す */
export function findCandidate(ctx, st, def, { target = null, opt = null }) {
  const e = observe(ctx, st), list = def.key === "declare_war" ? [cand("declare_war", {}, { target })] : def.candidates(ctx, st, e);
  return list.find((c) => (c.target ?? null) === (target ?? null) && (c.opt ?? null) === (opt ?? null)) ?? null;
}
