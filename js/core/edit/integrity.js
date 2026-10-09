// 整合性の検査：編集後の地図が、実データで成り立つ決まりを守っているかを調べる。
//
// baseline（編集前の状態）を渡すと、「編集前から成り立っていなかったもの」は問題にしない。
// 手で編集された地図には、最初から食い違いがあるため（実データで確認: 都市の文化2件のずれ、
// 水域に塗られた宗教540セルなど）。編集が「新たに壊したもの」だけを報告するのが目的。
//
// 注意（年次経済更新との関係）: core/sim/world.js の年次更新は、国家の rural/urban を
// 「経済モデル上の集計値」として直接書き換える（人口の年成長）。これはセル単位の pop 配列には
// 反映しない設計上の判断（セル単位の追随はスコープ外）。そのため、経済更新を行った後は
// rural/urban の「セル合計との一致」チェックは意味を持たなくなる。skipEconomyChecks を
// true にすると、この2項目の検査を省く（stats.rural もこの対象）。
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

/**
 * 歴史の記録（戦争・条約・同盟・外交・統合・従属・歴史ログ）が、存在しない国などを参照していないか。
 * 消滅した国（removed）は、歴史に残る国なので参照してよい。配列に存在しない番号だけを問題にする。
 */
export function checkHistoryRefs(map) {
  const P = map.pack, out = [], data = map.ext?.data ?? {};
  const has = (list, id) => Number.isInteger(id) && id > 0 && !!list?.[id] && typeof list[id] === "object";
  const st = (id) => has(P.states, id);
  const wars = Array.isArray(data.wars) ? data.wars : [];
  for (const w of wars) {
    const tag = `戦争#${w.id}「${w.name ?? ""}」`;
    for (const id of [...(w.attackers ?? []), ...(w.defenders ?? [])]) if (!st(id)) out.push(`${tag}が存在しない国家#${id}を参照しています`);
    for (const b of [...(w.battles ?? []), ...(w.forecast ?? [])]) for (const k of ["attackerState", "defenderState"]) if (b[k] != null && !st(b[k])) out.push(`${tag}の戦闘が存在しない国家#${b[k]}を参照しています`);
    const t = w.terms;
    if (t) for (const list of [t.cessions, t.reparations, t.annex, t.vassalize]) for (const x of Array.isArray(list) ? list : []) for (const k of ["fromStateId", "toStateId"]) if (x[k] != null && !st(x[k])) out.push(`${tag}の条約が存在しない国家#${x[k]}を参照しています`);
  }
  for (const a of Array.isArray(data.alliances) ? data.alliances : []) for (const id of a.members ?? []) if (!st(id)) out.push(`同盟「${a.name ?? a.id}」が存在しない国家#${id}を参照しています`);
  for (const d of Array.isArray(data.diplomacyLog) ? data.diplomacyLog : []) for (const k of ["a", "b"]) if (d[k] != null && !st(d[k])) out.push(`外交の記録が存在しない国家#${d[k]}を参照しています`);
  for (const x of Array.isArray(data.sovereigntyLog) ? data.sovereigntyLog : []) for (const k of ["fromState", "toState"]) if (x[k] != null && !st(x[k])) out.push(`主権の記録が存在しない国家#${x[k]}を参照しています`);
  for (const s of P.states) if (isLive(s) && s.i && s.vassal?.overlord != null && !st(s.vassal.overlord)) out.push(`国家#${s.i}の宗主国#${s.vassal.overlord}が存在しません`);
  const LISTS = { state: P.states, culture: P.cultures, religion: P.religions, province: P.provinces, burg: P.burgs };
  for (const h of Array.isArray(data.historyLog) ? data.historyLog : []) {
    const r = h.ref; if (r?.kind && LISTS[r.kind] && r.id != null && !has(LISTS[r.kind], r.id)) out.push(`歴史ログ「${h.title}」が存在しない${r.kind}#${r.id}を参照しています`);
  }
  return out;
}

/** @returns {string[]} 問題の一覧（空なら健全） */
export function checkIntegrity(map, baseline = null, { skipEconomyChecks = false } = {}) {
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
  for (const p of problemsStats(map)) {
    if (skipEconomyChecks && p.key.startsWith("state:") && p.key.endsWith(":rural")) continue;
    if (!baseline || !baseline.stats.has(p.key)) problems.push(p.msg);
  }
  for (const p of problemsPoles(map)) if (!baseline || !baseline.poles.has(p.key)) problems.push(p.msg);
  return problems;
}
