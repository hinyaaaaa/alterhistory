// v6.20.1: 世界の集計（国境の面のまとまり・文化と言語の数・出来事の原因・外交の不成立）。読み込んだ世界でも、新しく歩ませた世界でも使える。
export function borderMetrics(w) {
  const { civ, world } = w, m = world.mesh, LAND = 1; // 地図（ui/v6/map.js の owner()）と同じ: 集団の領域のセルを順に塗る（重なれば後の集団が勝つ）
  const own = new Map(); for (const g of Object.values(civ.groups)) for (const c of (g.cells?.length ? g.cells : [g.cell])) own.set(c, g);
  const owner = (c) => own.get(c)?.stateId ?? null, nbs = (c) => { const o = []; for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) o.push(m.neighborIds[k]); return o; };
  const cellsBy = new Map(); for (const [c] of own) { const s = owner(c); if (!s) continue; (cellsBy.get(s) ?? cellsBy.set(s, []).get(s)).push(c); }
  let multi = 0, exclaveCells = 0, enclosedStates = 0, singleCellEnclaves = 0, states = 0, totalCells = 0, overlapCells = 0;
  const detail = [];
  // 領域が重なるセル（別々の国家の集団が同じセルを取り合っている）
  const terr = new Map(); for (const g of Object.values(civ.groups)) for (const c of (g.cells?.length ? g.cells : [g.cell])) { const a = terr.get(c) ?? terr.set(c, new Set()).get(c); a.add(g.stateId ?? "-"); }
  for (const [, s] of terr) if (s.size > 1) overlapCells++;
  for (const [sid, cells] of cellsBy) {
    states++; totalCells += cells.length; const set = new Set(cells), seen = new Set(), comps = [];
    for (const c of cells) { if (seen.has(c)) continue; const comp = []; const q = [c]; seen.add(c); while (q.length) { const x = q.pop(); comp.push(x); for (const n of nbs(x)) if (set.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } } comps.push(comp); }
    comps.sort((a, b) => b.length - a.length); if (comps.length > 1) { multi++; for (const c of comps.slice(1)) exclaveCells += c.length; }
    // 他国に囲まれる: 領域の外周の陸セルが、すべて 1 つの別の国のもの
    const nb = new Set(); let sea = false; for (const c of cells) for (const n of nbs(c)) { if (set.has(n)) continue; if (world.cell.landWater[n] !== LAND) { sea = true; continue; } nb.add(owner(n) ?? "-"); }
    if (!sea && nb.size === 1 && !nb.has("-")) enclosedStates++;
    // 1 セルだけの飛び地（周りがすべて同じ別の国）
    for (const comp of comps) if (comp.length <= 2) { const ring = new Set(); for (const c of comp) for (const n of nbs(c)) if (!comp.includes(n)) ring.add(owner(n) ?? "-"); if (ring.size === 1 && !ring.has("-")) singleCellEnclaves++; }
    detail.push({ id: sid, name: civ.states[sid]?.name, cells: cells.length, components: comps.length, sizes: comps.map((c) => c.length).slice(0, 5) });
  }
  return { statesWithTerritory: states, totalCells, statesWithExclaves: multi, exclaveCells, exclaveShare: +(exclaveCells / Math.max(1, totalCells)).toFixed(3), enclosedStates, singleCellEnclaves, overlapCells, detail: detail.filter((d) => d.components > 1).slice(0, 12) };
}
export function cultureMetrics(w) {
  const { civ } = w, cu = {}, lg = {}, rl = {}; let tot = 0;
  for (const g of Object.values(civ.groups)) for (const c of g.cohorts ?? []) { const p = g.pop * c.share; tot += p; cu[c.cultureId] = (cu[c.cultureId] ?? 0) + p; lg[c.languageId] = (lg[c.languageId] ?? 0) + p; if (c.religionId) rl[c.religionId] = (rl[c.religionId] ?? 0) + p; }
  const n = (o) => Object.keys(o).length, big = (o, f) => Object.values(o).filter((v) => v / tot >= f).length;
  return { aliveCultures: n(cu), aliveLanguages: n(lg), aliveReligions: n(rl), definedCultures: n(civ.cultures), definedLanguages: n(civ.languages), langPerCulture: +(n(lg) / Math.max(1, n(cu))).toFixed(2), definedRatio: +(n(civ.languages) / Math.max(1, n(civ.cultures))).toFixed(2), culturesOver1pct: big(cu, 0.01), languagesOver1pct: big(lg, 0.01), culturesOver0_1pct: big(cu, 0.001), languagesOver0_1pct: big(lg, 0.001) };
}
export function eventMetrics(events) {
  const kinds = {}, noCause = {}; let n = 0, none = 0;
  for (const e of events) { n++; kinds[e.kind] = (kinds[e.kind] ?? 0) + 1; if (!(e.causes?.length) && !e.why) { none++; noCause[e.kind] = (noCause[e.kind] ?? 0) + 1; } }
  const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, c]) => `${k}:${c}(説明なし${noCause[k] ?? 0})`);
  const fails = {}; for (const e of events) if (e.kind === "diplomacy_failed") { const r = /（(.+)）$/.exec(e.title)?.[1] ?? "?"; fails[r] = (fails[r] ?? 0) + 1; }
  return { events: n, withoutExplanation: none, shareWithout: +(none / Math.max(1, n)).toFixed(3), diplomacyFailed: kinds.diplomacy_failed ?? 0, diplomacyFailedShare: +((kinds.diplomacy_failed ?? 0) / Math.max(1, n)).toFixed(3), treatySigned: kinds.treaty_signed ?? 0, languageDiverged: kinds.language_diverged ?? 0, cultureDiverged: kinds.culture_diverged ?? 0, top, failReasons: Object.entries(fails).sort((a, b) => b[1] - a[1]).slice(0, 12) };
}
