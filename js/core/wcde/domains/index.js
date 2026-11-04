// v6: WCDE の領域を tick に登録する拡張。createCivSim(world, civ, { extensions: [wcdeExtension] }) で渡す。
//   フェーズ順（指示書 §6）: …culture（言語・宗教）→ tech → economy → politics → military → ai_plan → apply → conflict（国家・戦争・人物）→ integrity
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
import { initWar, stepWar, finalize, monthly, canReach, seaTargets, settle } from "../warfare.js";

export function wcdeExtension(ticker, ctx) {
  registerWcdeActions(); ctx.nameGen = nameGen; ctx.nameLangOf = nameLangOf;
  ctx.warForecast = (a, b) => (ctx.civ.options.wcde ? predictWar(ctx.civ, a.id, b.id, ctx) : null); // 戦争研究所の予測を AI も使う
  ctx.negotiate = { treaty: (c, a, b, t, x) => (c.civ.options.wcde ? negotiateTreaty(c, a, b, t, x) : null), peace: (c, a, w, x) => (c.civ.options.wcde ? negotiatePeace(c, a, w, x) : null) };
  ctx.warOps = ctx.civ.options.wcde ? { init: initWar, step: stepWar, finalize, monthly, canReach, seaTargets, settle } : null; // v6.1.0 M6: 作戦・会戦の戦争モデル（WCDE の世界だけ）
  ctx.taxFactor = (st) => (ctx.civ.options.wcde ? effective(ctx.civ, st, "taxRevenue") : 1); // 財政への介入（税収の倍率）
  if (ctx.civ.options.wcde) { const sm0 = ctx.stateMult; ctx.stateMult = (g) => { const st = g.stateId ? ctx.civ.states[g.stateId] : null; return (sm0 ? sm0(g) : 1) * (st && ctx.civ.wcde?.adjust?.[st.id]?.popCapacity ? effective(ctx.civ, st, "popCapacity") : 1); }; } // 人口への介入（収容力の倍率）
  ctx.ecoMult = (g) => (ctx.civ.options.wcde ? ecoMult(ctx.world, ctx.civ, g) : 1); // 収容力への生態系の倍率
  ticker.register("ecosystem", stepEcosystem, "stepEcosystem", { every: 12, offset: 5 });
  ticker.register("interventions", stepInterventions, "stepInterventions"); // 仕様 §5.2 手順2: 介入補正の減衰（当月の有効値を確定）
  ticker.register("culture", stepLanguage, "stepLanguage");
  ticker.register("culture", stepReligion, "stepReligion");
  ticker.register("economy", stepEconomy, "stepEconomy", { every: 3 });
  ticker.register("politics", stepPolitics, "stepPolitics", { every: 3 });
  ticker.register("military", stepMilitary, "stepMilitary", { every: 3 });
  ticker.register("people", stepPeople, "stepPeople");
  ticker.register("people", stepCities, "stepCities");
  ticker.register("integrity", (c) => syncControl(c.civ), "syncControl"); // 担当国家が滅びたら、担当を外す
  ticker.register("integrity", (c) => { const errs = [...checkWcdeIntegrity(c.world, c.civ), ...(c.civ.monthIndex % 120 === 0 ? checkEco(c.world, c.civ) : [])]; if (errs.length) throw new Error("WCDE 整合性違反: " + errs.slice(0, 3).join(" / ")); }, "checkWcdeIntegrity");
}
