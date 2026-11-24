// v7.0.0 W4: 敗戦後。併合・割譲された土地の抵抗と遵守、従属国の自治度、恨み（次の戦争の口実）、資源権・人質・非武装の期限。
//   月次の呼び出し（warfare.js の monthly）から。四半期と年 1 回の仕事は、国・集団ごとに月をずらして分散する（毎月は全体を見ない）。
import { hashSeed } from "../civ/civ-state.js";
import { endTreaty } from "../civ/diplomacy.js";
import { makeEvent } from "../civ/events.js";

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const hold = (civ) => (((civ.wcde ??= {}).warx ??= { seq: 0 }).hold ??= {});
/** 集団の抵抗の強さ（0〜1）。併合・割譲の直後は強く、遵守が進むと消える */
export const resistanceOf = (civ, gid) => { const h = civ.wcde?.warx?.hold?.[gid]; return h ? clamp(1 - h.compliance) : 0; };

export function stepAftermath(ctx) {
  const { civ } = ctx, mi = civ.monthIndex; if (!civ.wcde) return; const H = hold(civ);
  for (const gid of Object.keys(H)) { // 抵抗と遵守（集団ごと。3 か月ごと・月をずらす）
    if ((hashSeed(gid) % 3) !== mi % 3) continue; const h = H[gid], g = civ.groups[gid]; if (!g || g.stateId !== h.to) { delete H[gid]; continue; }
    h.compliance = clamp(h.compliance + 0.04 + (civ.states[h.to]?.stability ?? 0.5) * 0.03); for (const co of g.cohorts ?? []) if (co.tension != null) co.tension = clamp(co.tension + 0.012 * (1 - h.compliance));
    if (h.compliance >= 1) delete H[gid];
  }
  if (mi % 12 !== 5 && mi % 12 !== 11) { /* 年次の仕事は、国ごとに月をずらす */ }
  for (const id in civ.states) { const st = civ.states[id]; if (!st.alive) continue; if ((hashSeed(id, "aft") % 12) !== mi % 12) continue;
    if (st.grudges) { for (const k of Object.keys(st.grudges)) { st.grudges[k] = Math.round(st.grudges[k] * 0.96 * 100) / 100; if (st.grudges[k] < 0.05 || !civ.states[k]?.alive) delete st.grudges[k]; } if (!Object.keys(st.grudges).length) delete st.grudges; }
    for (const k of ["hostages"]) if (st[k]) { for (const o of Object.keys(st[k])) if (st[k][o].until <= mi) delete st[k][o]; if (!Object.keys(st[k]).length) delete st[k]; }
    if (st.restrict?.dmz && st.restrict.dmz.until <= mi) { delete st.restrict.dmz; if (!Object.keys(st.restrict).length) delete st.restrict; }
    if (st.resourceRights) for (const [to, r] of Object.entries(st.resourceRights)) { const R = civ.states[to]; if (r.until <= mi || !R?.alive) { delete st.resourceRights[to]; continue; } const pay = Math.max(0, st.treasury) * r.share; st.treasury -= pay; R.treasury += pay; if (!Object.keys(st.resourceRights).length) delete st.resourceRights; }
    const dep = st.dependency; if (dep && dep.autonomy != null && civ.states[dep.overlord]?.alive) { // 従属国の自治度: 宗主が弱いと上がり、1 に近づくと独立に傾く
      const o = civ.states[dep.overlord]; dep.autonomy = Math.round(clamp(dep.autonomy + 0.02 + (o.stability < 0.4 ? 0.04 : 0) - (o.pop > st.pop * 2 ? 0.015 : 0)) * 100) / 100;
      if (dep.autonomy >= 0.95 && civ.treaties[dep.treaty]?.active) { makeEvent(civ, ctx.ids, { kind: "autonomy_peak", title: `${st.name}の自治が独立に近づき、${o.name}との従属が解けた`, participants: [{ entityId: st.id, role: "state" }, { entityId: o.id, role: "overlord" }], location: null, facts: { stateId: st.id, overlord: o.id }, provenance: "simulation", why: "自治度が上がり続け、宗主が抑えられなくなった" }); endTreaty(ctx, civ.treaties[dep.treaty], "自治の高まりで解消された", st.id); }
    }
  }
}
