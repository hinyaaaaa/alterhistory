// 月ごとの空間索引（セル→集団）。月次の各システムが共有する。集団の追加・移動は翌月の索引に反映される。
export function spatialOf(ctx) {
  if (ctx._spatial && ctx._spatialMonth === ctx.civ.monthIndex) return ctx._spatial;
  const { world, civ } = ctx, home = new Map(), terr = new Map();
  for (const id in civ.groups) { const g = civ.groups[id]; home.set(g.cell, id); for (const c of g.cells ?? [g.cell]) { const a = terr.get(c); if (a) a.push(id); else terr.set(c, [id]); } }
  ctx._spatial = { home, terr }; ctx._spatialMonth = civ.monthIndex; return ctx._spatial;
}
/** 領域が接している（または重なる）ほかの集団ID */
export function neighborGroups(ctx, g) {
  const { world } = ctx, m = world.mesh, { terr } = spatialOf(ctx), out = new Set();
  for (const c of g.cells ?? [g.cell]) {
    for (const o of terr.get(c) ?? []) if (o !== g.id) out.add(o);
    for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) for (const o of terr.get(m.neighborIds[k]) ?? []) if (o !== g.id) out.add(o);
  }
  return out;
}
/** 国家ID → 集団の配列（月ごとに1回作る） */
export function byState(ctx) {
  if (ctx._byState && ctx._byStateMonth === ctx.civ.monthIndex) return ctx._byState;
  const m = new Map(); for (const id in ctx.civ.groups) { const g = ctx.civ.groups[id]; if (g.stateId) { const a = m.get(g.stateId); if (a) a.push(g); else m.set(g.stateId, [g]); } }
  ctx._byState = m; ctx._byStateMonth = ctx.civ.monthIndex; return m;
}
export const invalidateMonthCaches = (ctx) => { ctx._spatial = ctx._byState = null; };
