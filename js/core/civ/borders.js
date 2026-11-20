// v6.20.1: 国境を「面」でまとまったものにする。
//   ・新しい集団（分派）は、親の国の領土に接していなければ、親の国には属さない（遠くに飛び地ができない）。
//   ・年に 1 回、本国と地続きでなく、ほかの国に取り巻かれた小さな飛び地は、取り巻く国に組み込まれる（島・遠い植民地など、周りに別の国がないものはそのまま）。
import { makeEvent } from "./events.js";
import { neighborGroups, byState, spatialOf, invalidateMonthCaches } from "./spatial.js";

export const TIDY = Object.freeze({ maxGroups: 4, maxPopShare: 0.45, perYear: 12 });

/** cells（セルの配列）が、国 stateId の集団の領域に重なる／隣り合うか（その月の空間索引を使う） */
export function touchesState(ctx, cells, stateId) {
  const { civ, world } = ctx, m = world.mesh, { terr } = spatialOf(ctx);
  const has = (c) => { for (const o of terr.get(c) ?? []) if (civ.groups[o]?.stateId === stateId) return true; return false; };
  for (const c of cells) { if (has(c)) return true; for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) if (has(m.neighborIds[k])) return true; }
  return false;
}
/** 分派で生まれた集団が、親の国に属するのは、親の国の領土に接しているときだけ */
export function settleChildState(ctx, child, cells) { if (child.stateId && !touchesState(ctx, cells ?? child.cells ?? [child.cell], child.stateId)) child.stateId = null; }

/** 国ごとの「本国と地続きでない小さな飛び地」を、取り巻く国に組み込む（年 1 回） */
export function tidyBorders(ctx) {
  const { civ, ids } = ctx, mi = civ.monthIndex, nbc = new Map(), nb = (g) => nbc.get(g.id) ?? (nbc.set(g.id, neighborGroups(ctx, g)), nbc.get(g.id)), todo = [];
  for (const [sid, gs] of byState(ctx)) {
    const st = civ.states[sid]; if (!st?.alive || st.player || gs.length < 2) continue;
    const ids0 = new Set(gs.map((g) => g.id)), seen = new Set(), comps = [];
    for (const g of gs) { if (seen.has(g.id)) continue; const comp = [], q = [g]; seen.add(g.id); while (q.length) { const x = q.pop(); comp.push(x); for (const o of nb(x)) if (ids0.has(o) && !seen.has(o)) { seen.add(o); q.push(civ.groups[o]); } } comps.push(comp); }
    if (comps.length < 2) continue;
    const cap = st.capitalGroupId, has = (c) => (c.some((g) => g.id === cap) ? 1 : 0); comps.sort((a, b) => has(b) - has(a) || b.length - a.length);
    const total = gs.reduce((a, g) => a + g.pop, 0);
    for (const comp of comps.slice(1)) {
      const pop = comp.reduce((a, g) => a + g.pop, 0); if (comp.length > TIDY.maxGroups || pop > total * TIDY.maxPopShare || comp.some((g) => g.player)) continue;
      const around = new Map(); for (const g of comp) for (const o of nb(g)) { const og = civ.groups[o]; const s2 = og?.stateId; if (s2 && s2 !== sid && civ.states[s2]?.alive && !civ.states[s2].player) around.set(s2, (around.get(s2) ?? 0) + 1); }
      if (!around.size) continue; // 周りに別の国がない（島・遠い土地）ものは、そのまま
      const to = [...around].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      todo.push({ from: st, to: civ.states[to[0]], comp, touch: to[1] });
    }
  }
  let n = 0; for (const t of todo) {
    for (const g of t.comp) g.stateId = t.to.id;
    if (n++ < TIDY.perYear) makeEvent(civ, ids, { kind: "border_tidied", title: `${t.from.name}の飛び地（${t.comp.length}集団）は、${t.to.name}に組み込まれた`, participants: [{ entityId: t.from.id, role: "state" }, { entityId: t.to.id, role: "absorber" }, ...t.comp.slice(0, 3).map((g) => ({ entityId: g.id, role: "territory" }))], location: { cell: t.comp[0].cell }, facts: { from: t.from.id, to: t.to.id, groups: t.comp.length }, why: `本国と地続きでなく、${t.to.name}の領域に取り巻かれていた（接する集団 ${t.touch}）` });
  }
  if (todo.length) { invalidateMonthCaches(ctx); ctx._byState = null; }
  return todo.length;
}
