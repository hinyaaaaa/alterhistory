// v6 M3/M5: WCDE の領域の行動。AI もプレイヤー命令も、既存と同じ行動レジストリ（civ/actions.js）を通る。
//   候補の採点・判断記録・結果イベントは、v5 の行動と同じ仕組み（直接 WorldState を書き換える AI の経路は無い）。
//   WCDE の世界（civ.options.wcde）でだけ候補を出す。
import { registerAction } from "../../civ/actions.js";
import { DOCTRINES, DOCTRINE, canAdopt, adoptDoctrine } from "./military.js";
import { FACTIONS, recomputeLegitimacy } from "./politics.js";

const r3 = (x) => Math.round(x * 1000) / 1000, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cand = (key, f, o = {}) => ({ key, target: o.target ?? null, opt: o.opt ?? null, factors: f, eligible: o.eligible ?? true, reason: o.reason ?? null, label: o.label ?? null });
const bad = (key, reason, o = {}) => cand(key, {}, { ...o, eligible: false, reason });
const eff = (list, st, property, before, after) => { list.push({ targetId: st.id, property, before, after }); };
export const INVEST_COST = 30, INVEST_GAIN = 0.06, INVEST_CAP = 0.4;

let done = false;
export function registerWcdeActions() {
  if (done) return; done = true;
  registerAction({ key: "adopt_doctrine", domain: "military", label: "ドクトリンの取得", enabled: true,
    candidates(ctx, st, e) {
      if (!ctx.civ.options.wcde) return []; const out = [];
      for (const d of DOCTRINES) { const c = canAdopt(st, d.id); if (!c.ok) continue; out.push(cand("adopt_doctrine", { security: 0.15 + 2.2 * d.def + 0.8 * d.off + (st.warIds.length ? 0.2 : 0), expansion: 3 * d.off - d.cost / 2000 }, { opt: d.id, label: `${d.ja}を取り入れる` })); }
      return out.sort((a, b) => (b.factors.security + b.factors.expansion) - (a.factors.security + a.factors.expansion) || (a.opt < b.opt ? -1 : 1)).slice(0, 3);
    },
    execute(ctx, st, c) { const r = adoptDoctrine(ctx, st, c.opt, { provenance: c.provenance ?? "ai", decisionId: c.decisionId ?? null }); return r.ok ? { ok: true, silent: true, effects: [] } : { ok: false, error: r.reason }; } });
  registerAction({ key: "invest_industry", domain: "economy", label: "産業への投資", enabled: true,
    candidates(ctx, st, e) {
      if (!ctx.civ.options.wcde || !st.econ) return []; const inv = st.econ.investment ?? 0;
      if (st.treasury < INVEST_COST * 2) return [bad("invest_industry", "財政が足りない")]; if (inv >= INVEST_CAP) return [bad("invest_industry", "投資の効果が上限")];
      return [cand("invest_industry", { prosperity: 0.35 + 0.5 * (1 - clamp(st.econ.perCapita / 1.5, 0, 1)), tech: 0.1 }, { label: "産業へ投資する" })];
    },
    execute(ctx, st, c) { const ef = [], b = st.econ.investment ?? 0, a = r3(Math.min(INVEST_CAP, b + INVEST_GAIN)); if (st.treasury < INVEST_COST) return { ok: false, error: "財政が足りない" }; st.treasury -= INVEST_COST; st.econ.investment = a; eff(ef, st, "econ.investment", b, a); return { ok: true, effects: ef, title: "産業への投資" }; } });
  registerAction({ key: "appease_faction", domain: "politics", label: "支持勢力への配慮", enabled: true,
    candidates(ctx, st, e) {
      if (!ctx.civ.options.wcde || !st.politics) return []; const P = st.politics, out = [];
      for (const [k, f] of Object.entries(P.factions)) { const weak = (f.influence ?? 0) * (0.6 - f.support); if (weak > 0.02) out.push(cand("appease_faction", { stability: 0.5 + 4 * weak + (P.legitimacy < 0.4 ? 0.3 : 0) }, { opt: k, label: `${FACTIONS[k]}に配慮する` })); }
      return out.sort((a, b) => b.factors.stability - a.factors.stability || (a.opt < b.opt ? -1 : 1)).slice(0, 2);
    },
    execute(ctx, st, c) { const f = st.politics?.factions[c.opt]; if (!f) return { ok: false, error: "その勢力はない" }; const cost = 15; if (st.treasury < cost) return { ok: false, error: "財政が足りない" }; st.treasury -= cost; const b = f.support, a = r3(clamp(b + 0.15, 0, 1)); f.support = a; recomputeLegitimacy(st.politics); const ef = []; eff(ef, st, `politics.${c.opt}.support`, r3(b), a); return { ok: true, effects: ef, title: `${FACTIONS[c.opt]}への配慮` }; } });
}
