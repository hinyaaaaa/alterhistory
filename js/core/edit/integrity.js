// 整合性の検査：編集後の地図が、実データで成り立つ決まりを守っているかを調べる。
//
// baseline（編集前の状態）を渡すと、「編集前から成り立っていなかったもの」は問題にしない。
// 手で編集された地図には、最初から食い違いがあるため（実データで確認: 都市の文化2件のずれ、
// 水域に塗られた宗教540セルなど）。編集が「新たに壊したもの」だけを報告するのが目的。
//
// 純粋ロジック層：DOM に依存しない。

const isLive = (e) => !!e && typeof e === "object" && !e.removed;
const near = (a, b, rel = 0.005, abs = 0.6) => Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel);

/** 編集前の状態を記録する。「編集前から成り立っていたもの」の一覧を作る */
export function snapshotBaseline(map) {
  const c = map.pack.cells;
  const base = {
    waterCells: new Map(), // 水域セルの 各配列の値
    burgState: new Set(), burgCulture: new Set(), capitals: new Set(),
    stats: new Set(), poles: new Set(),
  };
  for (let i = 0; i < c.biome.length; i++) {
    if (c.biome[i] === 0) base.waterCells.set(i, [c.state[i], c.culture[i], c.religion[i], c.province[i]]);
  }
  for (const b of map.pack.burgs) {
    if (!isLive(b) || !b.i) continue;
    if (c.state[b.cell] === b.state) base.burgState.add(b.i);
    if (c.culture[b.cell] === b.culture) base.burgCulture.add(b.i);
  }
  for (const s of map.pack.states) {
    if (!isLive(s) || !s.i) continue;
    const cap = map.pack.burgs[s.capital];
    if (cap && c.state[cap.cell] === s.i) base.capitals.add(s.i);
  }
  for (const p of problemsStats(map)) base.stats.add(p.key);
  for (const p of problemsPoles(map)) base.poles.add(p.key);
  return base;
}

function problemsStats(map) {
  const c = map.pack.cells, out = [];
  const kinds = { state: map.pack.states, religion: map.pack.religions, province: map.pack.provinces };
  const cnt = {}, pop = {};
  for (const k of Object.keys(kinds)) { cnt[k] = {}; pop[k] = {}; }
  for (let i = 0; i < c.biome.length; i++) for (const k of Object.keys(kinds)) {
    const id = c[k][i]; cnt[k][id] = (cnt[k][id] || 0) + 1; pop[k][id] = (pop[k][id] || 0) + c.pop[i];
  }
  const burgs = map.pack.burgs.filter((b) => isLive(b) && b.i);
  const bCount = { state: {}, province: {} }, bUrban = { state: {}, province: {}, religion: {} };
  for (const b of burgs) {
    const ids = { state: b.state, province: c.province[b.cell], religion: c.religion[b.cell] };
    for (const k of Object.keys(ids)) { bUrban[k][ids[k]] = (bUrban[k][ids[k]] || 0) + b.population; }
    for (const k of ["state", "province"]) bCount[k][ids[k]] = (bCount[k][ids[k]] || 0) + 1;
  }
  for (const [k, list] of Object.entries(kinds)) {
    for (const e of list) {
      if (!isLive(e) || !e.i) continue;
      const key = (f) => `${k}:${e.i}:${f}`;
      if (typeof e.cells === "number" && e.cells !== (cnt[k][e.i] || 0)) out.push({ key: key("cells"), msg: `${k}#${e.i} のセル数 保存${e.cells}/実際${cnt[k][e.i] || 0}` });
      if (typeof e.rural === "number" && !near(pop[k][e.i] || 0, e.rural)) out.push({ key: key("rural"), msg: `${k}#${e.i} の農村人口 保存${e.rural}/実際${(pop[k][e.i] || 0).toFixed(2)}` });
      if (typeof e.urban === "number" && !near(bUrban[k]?.[e.i] || 0, e.urban, 0.02, 0.06)) out.push({ key: key("urban"), msg: `${k}#${e.i} の都市人口 保存${e.urban}/実際${(bUrban[k]?.[e.i] || 0).toFixed(2)}` });
      const nb = typeof e.burgs === "number" ? e.burgs : Array.isArray(e.burgs) ? e.burgs.length : null;
      if (nb !== null && bCount[k] && nb !== (bCount[k][e.i] || 0)) out.push({ key: key("burgs"), msg: `${k}#${e.i} の都市数 保存${nb}/実際${bCount[k][e.i] || 0}` });
    }
  }
  return out;
}

function problemsPoles(map) {
  const out = [];
  const idxOf = (pt) => {
    let best = -1, bd = Infinity;
    const P = map.geometry.pack.p;
    for (let i = 0; i < P.length; i++) { const d = (P[i][0] - pt[0]) ** 2 + (P[i][1] - pt[1]) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  };
  for (const [k, list] of [["state", map.pack.states], ["province", map.pack.provinces]]) {
    for (const e of list) {
      if (!isLive(e) || !e.i || !Array.isArray(e.pole)) continue;
      const has = map.pack.cells[k].some((v) => v === e.i);
      if (!has) continue;
      const at = idxOf(e.pole);
      if (map.pack.cells[k][at] !== e.i) out.push({ key: `${k}:${e.i}`, msg: `${k}#${e.i} の極が領土の外にあります` });
    }
  }
  return out;
}

/** @returns {string[]} 問題の一覧（空なら健全） */
export function checkIntegrity(map, baseline = null) {
  const c = map.pack.cells, problems = [];
  const P = map.pack;

  // 水域は編集前のまま
  if (baseline) {
    for (const [i, v] of baseline.waterCells) {
      if (c.state[i] !== v[0] || c.culture[i] !== v[1] || c.religion[i] !== v[2] || c.province[i] !== v[3]) { problems.push(`水域セル${i}の属性が変わっています`); break; }
    }
  }
  for (const b of P.burgs) {
    if (!isLive(b) || !b.i) continue;
    if (c.burg[b.cell] !== b.i) problems.push(`都市#${b.i} のセルの都市IDが一致しません`);
    if ((!baseline || baseline.burgState.has(b.i)) && c.state[b.cell] !== b.state) problems.push(`都市#${b.i}「${b.name}」の国家(${b.state})がセルの国家(${c.state[b.cell]})と違います`);
    if ((!baseline || baseline.burgCulture.has(b.i)) && c.culture[b.cell] !== b.culture) problems.push(`都市#${b.i}「${b.name}」の文化がセルの文化と違います`);
    if (b.state === 0 && (!baseline || baseline.burgState.has(b.i))) problems.push(`都市#${b.i} が無所属の土地にあります`);
  }
  for (let i = 0; i < c.province.length; i++) {
    const p = c.province[i];
    if (p > 0 && P.provinces[p]?.state !== c.state[i]) { problems.push(`セル${i}の属州#${p}の国家が、セルの国家と違います`); break; }
    if (p > 0 && !isLive(P.provinces[p])) { problems.push(`セル${i}が削除済みの属州#${p}に属しています`); break; }
  }
  for (const [kind, list] of [["state", P.states], ["culture", P.cultures], ["religion", P.religions]]) {
    for (let i = 0; i < c[kind].length; i++) {
      const id = c[kind][i];
      if (id > 0 && !isLive(list[id])) { problems.push(`セル${i}が削除済みの${kind}#${id}に属しています`); break; }
    }
  }
  for (const s of P.states) {
    if (!isLive(s) || !s.i) continue;
    const cap = P.burgs[s.capital];
    if (!cap) { problems.push(`国家#${s.i}の首都都市がありません`); continue; }
    if ((!baseline || baseline.capitals.has(s.i)) && c.state[cap.cell] !== s.i) problems.push(`国家#${s.i}の首都が他国のセルにあります`);
  }
  for (const p of problemsStats(map)) if (!baseline || !baseline.stats.has(p.key)) problems.push(p.msg);
  for (const p of problemsPoles(map)) if (!baseline || !baseline.poles.has(p.key)) problems.push(p.msg);
  return problems;
}
