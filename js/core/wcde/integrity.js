// v6: WCDE の不変条件（国家・人物・領域の整合）。tick の integrity フェーズ、保存前、テストから呼ぶ。違反を文字列の配列で返す。
import { DOCTRINE } from "./domains/military.js";
import { FACTIONS } from "./domains/politics.js";
import { checkInterventions } from "./intervention.js";
import { checkClock } from "./clock.js";

const fin = (x) => typeof x === "number" && Number.isFinite(x);
export function checkWcdeIntegrity(world, civ) {
  const errs = [], W = civ.wcde; if (!civ.options?.wcde) return errs;
  // 担当国家: 高々1つで、civ.wcde.control と国家の player が一致する
  const players = Object.values(civ.states).filter((s) => s.alive && s.player);
  if (players.length > 1) errs.push(`担当国家が複数ある（${players.map((s) => s.id).join(",")}）`);
  const cs = W?.control?.stateId ?? null;
  if (cs && !(civ.states[cs]?.alive && civ.states[cs].player)) errs.push(`担当国家 ${cs} が存在しない・担当の印が無い`);
  if (!cs && players.length) errs.push("担当が無いのに、担当の印が付いた国家がある");
  if (civ.player?.groupId != null) errs.push("WCDE の世界では、担当は集団ではなく国家（civ.player.groupId は空）");
  // 魔法の無い世界: 魔法に関わる実体が無い
  if (civ.options.magic === false) { if (Object.keys(civ.persons ?? {}).length || Object.keys(civ.magic?.orgs ?? {}).length) errs.push("魔法の無い世界に、魔法の人物・組織がある"); for (const s of Object.values(civ.states)) if (s.magic) errs.push(`魔法の無い世界で国家 ${s.id} に魔法制度がある`); }
  // 国家の領域
  for (const st of Object.values(civ.states)) {
    if (!st.alive) continue; const e = st.econ;
    if (e) for (const k of ["output", "industry", "perCapita", "foodBalance", "tradeIncome"]) if (e[k] !== undefined && !fin(e[k])) errs.push(`${st.id}.econ.${k} が有限でない`);
    const P = st.politics; if (P) { for (const k of Object.keys(FACTIONS)) { const s = P.factions[k]?.support; if (!(s >= 0 && s <= 1)) errs.push(`${st.id} の${FACTIONS[k]}の支持が範囲外 ${s}`); } if (!(P.legitimacy >= 0 && P.legitimacy <= 1)) errs.push(`${st.id} の正統性が範囲外`); }
    const M = st.military; if (M) {
      for (const id of Object.keys(M.doctrine.taken)) { const d = DOCTRINE[id]; if (!d) errs.push(`${st.id} に未知のドクトリン ${id}`); else for (const p of d.prereq) if (M.doctrine.taken[p] == null) errs.push(`${st.id} のドクトリン ${id} の前提 ${p} が無い`); }
      if (!(st.milBonus >= -0.6 - 1e-9 && st.milBonus <= 0.6 + 1e-9)) errs.push(`${st.id} の milBonus が範囲外 ${st.milBonus}`); if (!(st.milDef >= 0 && st.milDef <= 0.4 + 1e-9)) errs.push(`${st.id} の milDef が範囲外`);
    }
    if (st.leaderFigureId) { const f = civ.figures?.[st.leaderFigureId]; if (!f) errs.push(`${st.id} の指導者の人物 ${st.leaderFigureId} が無い`); else if (f.diedAt != null) errs.push(`${st.id} の指導者の人物が没している`); }
  }
  errs.push(...checkInterventions(civ)); errs.push(...checkClock(civ));
  // 人物・家系: 親は先に生まれている・子は対になる・没は生より後
  for (const f of Object.values(civ.figures ?? {})) {
    if (f.diedAt != null && f.diedAt < f.bornAt) errs.push(`人物 ${f.id} の没が生より前`);
    if (f.parents) for (const pid of f.parents) { const p = civ.figures[pid]; if (!p) errs.push(`人物 ${f.id} の親 ${pid} が無い`); else { if (p.bornAt >= f.bornAt) errs.push(`人物 ${f.id} が親より先に生まれている`); if (!p.children.includes(f.id)) errs.push(`人物 ${f.id} が親 ${pid} の子に載っていない`); } }
    for (const cid of f.children) if (!civ.figures[cid]) errs.push(`人物 ${f.id} の子 ${cid} が無い`);
    if (f.houseId && !civ.houses?.[f.houseId]) errs.push(`人物 ${f.id} の家 ${f.houseId} が無い`);
  }
  return errs;
}
