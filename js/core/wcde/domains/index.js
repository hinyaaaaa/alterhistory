// v6: WCDE の領域を tick に登録する拡張。createCivSim(world, civ, { extensions: [wcdeExtension] }) で渡す。
//   フェーズ順（指示書 §6）: …culture（言語・宗教）→ tech → economy → politics → military → ai_plan → apply → conflict（国家・戦争・人物）→ integrity
import { makeEvent } from "../../civ/events.js";
import { stepEcosystem, ecoMult, checkEco } from "./ecosystem.js";
import { stepLanguage, nameGen, nameLangOf } from "./language.js";
import { stepReligion } from "./religion.js";
import { stepEconomy } from "./economy.js";
import { stepPolitics } from "./politics.js";
import { stepMilitary } from "./military.js";
import { stepPeople, stepCities } from "./people.js";
import { registerWcdeActions } from "./actions.js";
import { checkWcdeIntegrity } from "../integrity.js";
import { syncControl } from "../control.js";
import { stepInterventions } from "../intervention.js";
import { predictWar } from "../warlab.js";
import { negotiateTreaty, negotiatePeace } from "../negotiation.js";
import { effective } from "./effective.js";
import { DECISION_HOOKS, autoCivilWar } from "../decisions.js";
import { syncCorps, defectCorps } from "../corps.js";
import { stateFx } from "../statefx.js";
import { officeUpkeep } from "../regimes.js";
import { initWar, stepWar, finalize, monthly, canReach, seaTargets, settle } from "../warfare.js";

export function wcdeExtension(ticker, ctx) {
  registerWcdeActions(); ctx.nameGen = nameGen; ctx.nameLangOf = nameLangOf;
  ctx.warForecast = (a, b) => (ctx.civ.options.wcde ? predictWar(ctx.civ, a.id, b.id, ctx) : null); // 戦争研究所の予測を AI も使う
  ctx.decisions = ctx.civ.options.wcde ? DECISION_HOOKS : null; ctx.autoCivilWar = ctx.civ.options.wcde ? (ns, st) => autoCivilWar(ctx, ns, st) : null; ctx.corpsDefect = ctx.civ.options.wcde ? (ns, st, ids) => { const r = defectCorps(ctx, st, ns, ids); for (const d of r) makeEvent(ctx.civ, ctx.ids, { kind: "state_action", title: `${st.name}の${d.name}が反乱側（${ns.name}）に寝返った`, participants: [{ entityId: st.id, role: "state" }, { entityId: ns.id, role: "target" }], location: null, provenance: "simulation" }); return r; } : null; // v6.12.0: 決断（担当国の条約・宣戦・継承・反乱・会戦）と、反乱の自動の内戦
  ctx.negotiate = { treaty: (c, a, b, t, x) => (c.civ.options.wcde ? negotiateTreaty(c, a, b, t, x) : null), peace: (c, a, w, x) => (c.civ.options.wcde ? negotiatePeace(c, a, w, x) : null) };
  ctx.warOps = ctx.civ.options.wcde ? { init: initWar, step: stepWar, finalize, monthly, canReach, seaTargets, settle } : null; // v6.1.0 M6: 作戦・会戦の戦争モデル（WCDE の世界だけ）
  ctx.taxFactor = (st) => (ctx.civ.options.wcde ? effective(ctx.civ, st, "taxRevenue") * (1 + stateFx(st).tax) : 1); // 財政への介入（税収の倍率）
  if (ctx.civ.options.wcde) { const sm0 = ctx.stateMult; ctx.stateMult = (g) => { const st = g.stateId ? ctx.civ.states[g.stateId] : null; return (sm0 ? sm0(g) : 1) * (st && ctx.civ.wcde?.adjust?.[st.id]?.popCapacity ? effective(ctx.civ, st, "popCapacity") : 1); }; } // 人口への介入（収容力の倍率）
  ctx.ecoMult = (g) => (ctx.civ.options.wcde ? ecoMult(ctx.world, ctx.civ, g) : 1); // 収容力への生態系の倍率
  ticker.register("ecosystem", stepEcosystem, "stepEcosystem", { every: 12, offset: 5 });
  ticker.register("interventions", stepInterventions, "stepInterventions"); // 仕様 §5.2 手順2: 介入補正の減衰（当月の有効値を確定）
  ticker.register("culture", stepLanguage, "stepLanguage");
  ticker.register("culture", stepReligion, "stepReligion");
  ticker.register("economy", stepEconomy, "stepEconomy", { every: 3 });
  ticker.register("politics", stepPolitics, "stepPolitics", { every: 3 });
  ticker.register("military", stepMilitary, "stepMilitary", { every: 3 });
  ticker.register("military", (c) => { for (const st of Object.values(c.civ.states)) if (st.alive && st.player) syncCorps(c, st); }, "stepCorps"); // v6.12.0: 担当国の軍団の兵力を毎月そろえる
  ticker.register("economy", (c) => { if (c.civ.monthIndex % 3 !== 0) return; for (const st of Object.values(c.civ.states)) if (st.alive && st.offices?.length) st.treasury -= officeUpkeep(st) * 3; }, "stepOfficeUpkeep"); // v6.12.0: 役職の維持費（3 か月ごと）
  ticker.register("people", stepPeople, "stepPeople");
  ticker.register("people", stepCities, "stepCities");
  ticker.register("integrity", (c) => syncControl(c.civ), "syncControl"); // 担当国家が滅びたら、担当を外す
  ticker.register("integrity", (c) => { const errs = [...checkWcdeIntegrity(c.world, c.civ), ...(c.civ.monthIndex % 120 === 0 ? checkEco(c.world, c.civ) : [])]; if (errs.length) throw new Error("WCDE 整合性違反: " + errs.slice(0, 3).join(" / ")); }, "checkWcdeIntegrity");
}
