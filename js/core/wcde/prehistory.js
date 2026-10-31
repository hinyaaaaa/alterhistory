// v6 M2: 圧縮された約50万年の先史。通常の月次 tick を 50 万年分回さず、粗い時間刻み（既定 2,500 年）の集計モデルで進める。
//   人類の出現・拡散、設定された他種族の出現・拡散、氷期による居住可能性の変動、移住（陸路・航海）、
//   生業・技術の発展（農耕・牧畜・航海・定住）、文化・言語・宗教の分化を、世界の地形・気候・肥沃度から実際に計算する（固定の結果は返さない）。
//   終わりは「国家成立の直前」。条件を満たす文明候補を数え、そこで止まる（founding.js）。
//   純粋ロジック（時刻・Math.random 非依存。乱数は seed と step から作る）。ワーカーに載せても結果は変わらない。
import { createIdGen } from "../civ/ids.js";
import { emptyLayers, newGroup, hashSeed, rngOf, CIV_STATE_VERSION } from "../civ/civ-state.js";
import { fromMonthIndex, monthIndex } from "../civ/tick.js";
import { createCulture, createLanguage, createReligion } from "../civ/culture.js";
import { makeEvent } from "../civ/events.js";
import { POP, groupCapacity, reachable, cellCapacity, spawnGroup, territoryOf } from "../civ/population.js";
import { TECHS, TECH, available, refreshCand } from "../civ/tech.js";
import { SPECIES, speciesOf } from "../civ/species.js";
import { BIOMES, LAND_WATER } from "../civ/world-consts.js";
import { speciesDefsOf, derivedSeeds } from "./config.js";

export const PREHISTORY_STEP_YEARS = 2500;
const TECH_CEILING = 900;            // 先史で到達する技術の費用の上限（青銅・文字などは歴史の中で）
const LEARN_EVERY = 4;               // 技術の評価は数ステップに1回（進捗は積み増す）
const INNOVATION = 1.9e-4;           // 進捗の基準。調整値（下の PRE_COST・時間形・人口の効果と合わせて、航海が前半、農耕・牧畜が最後の数%に現れるように）
const POP_REF = 150000;              // 人口の効果の基準（Kremer 型: 世界の人口が多いほど、発明・伝播が速い。上限 1.5 倍）
/** 先史での費用の倍率（通常の技術費用は月次 tick 用。先史の長い時間では、道具・舟のような技術は早く、農耕・牧畜は人口圧と蓄積のあとになる） */
const PRE_COST = Object.freeze({ seafaring: 0.12, pottery: 0.6, weaving: 0.8, herbalism: 0.5, construction: 0.9, agriculture: 5.1, pastoralism: 3.9 });
const LOCAL_SCALE = 0.4; // 近くの探索の範囲（移動の予算に対する比）
const SPREAD_P = 0.6, SPREAD_HOPS = 12; // 技術の伝播: 隣接する集団へ 1 ステップあたり最大 SPREAD_HOPS 跳び。1 跳びの確率 SPREAD_P（同じ文化なら +0.15）
const shapeAt = (f) => 0.1 + 4.5 * f * f * f; // 知識の蓄積による加速（時間とともに発明が速まる）
const EPOCHS = 20;                   // 要約イベント（時代ごとの集計）の数
const DEG = Math.PI / 180;

/** 先史を始める前の、空の文明状態。WCDE の設定を civ.options に写す（魔法の有無・成長の倍率など） */
export function createWcdeCiv(world, config, { historySeed = null } = {}) {
  const seeds = derivedSeeds(config), start = -Math.round(config.prehistory.years);
  const civ = { version: CIV_STATE_VERSION, historySeed: historySeed ?? hashSeed(config.worldSeed, "history"), seq: {}, date: fromMonthIndex(monthIndex(start, 1)), monthIndex: monthIndex(start, 1), groups: {}, settlements: {}, events: [], proposals: [], player: { groupId: null }, ...emptyLayers() };
  civ.options = { aiInterval: 6, wcde: true, magic: config.magic.enabled, magicRate: config.magic.rate, growthScale: config.laws.fertilityScale, disasterRate: config.laws.disasterRate, climateVolatility: config.laws.climateVolatility };
  civ.speciesDefs = speciesDefsOf(config);
  civ.wcde = { v: 1, phase: "prehistory", config, seeds, startMonth: civ.monthIndex, prehistory: null, candidates: [], control: { stateId: null }, cmdIds: [], diagnostics: [], edits: [] };
  return civ;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** 氷期の強さ 0〜1（約 10 万年周期。周期の位相は seed から。強さの上限は laws.climateVolatility） */
export const glacialAt = (frac, years, phase, vol) => vol <= 0 ? 0 : clamp(vol, 0, 3) / 3 * Math.max(0, Math.sin((frac * years / 100000) * 2 * Math.PI + phase)) ** 2;
/** 緯度による氷期の影響（高緯度ほど収容力が落ちる）の倍率 */
const iceMult = (lat, ice) => 1 - ice * 0.65 * clamp((Math.abs(lat) / DEG - 35) / 35, 0, 1);
/** 陸の連結成分（隣接する陸セルのまとまり）。人類は、人口を育てられる大きさの陸から現れる（小さな島に閉じ込められると、航海に至れず先史が進まない） */
function landComponents(world, landCells) {
  const m = world.mesh, comp = new Int32Array(m.cellCount).fill(-1), sizes = [];
  for (const s of landCells) { if (comp[s] >= 0) continue; const id = sizes.length, q = [s]; comp[s] = id; let n = 0; while (q.length) { const c = q.pop(); n++; for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) { const o = m.neighborIds[k]; if (comp[o] < 0 && world.cell.landWater[o] === LAND_WATER.LAND) { comp[o] = id; q.push(o); } } } sizes.push(n); }
  return { comp, sizes };
}
/** 分派・移住先の候補。月次の bestTargets と同じ採点で、移動の予算を解像度で補正する（セルが小さい世界ほど、同じ距離（km）に届くのに多くのセルが要る） */
function targetsFor(world, g, occ, res, limit, scale = 1) {
  const dist = reachable(world, g.cell, (POP.moveRange[g.subsistence] ?? 9) * res * scale, g.knowledge.seafaring), out = [];
  for (const [c, d] of dist) {
    if (c === g.cell || world.cell.landWater[c] !== LAND_WATER.LAND || occ.has(c)) continue;
    const cap = cellCapacity(world, c, g.subsistence, g.knowledge); if (cap <= 0) continue;
    out.push({ cell: c, cost: d, score: cap / (1 + (d / res) * 0.35) });
  }
  out.sort((a, b) => b.score - a.score || a.cell - b.cell); return out.slice(0, limit);
}
const stageOf = (p) => (p >= POP.cityMin ? "city" : p >= POP.townMin ? "town" : "village");

/** 先史を進める。civ.wcde.phase を "founding" にして返す（候補の列挙は founding.js が行う） */
export function runPrehistory(world, civ, { stepYears = PREHISTORY_STEP_YEARS, onProgress = null } = {}) {
  const cfg = civ.wcde.config, ids = createIdGen(civ.seq), seed = civ.wcde.seeds.prehistory, years = cfg.prehistory.years;
  const steps = Math.max(1, Math.round(years / stepYears)), stepMonths = (years * 12) / steps, start = civ.wcde.startMonth;
  const phase0 = (hashSeed(seed, "ice") % 1000) / 1000 * Math.PI * 2, vol = cfg.laws.climateVolatility;
  const stats = { steps, stepYears: years / steps, species: {}, firstTech: {}, peakGroups: 0, glacialMax: 0, seaCrossings: 0, settlements: 0, budSearches: 0, farSearches: 0, extinct: 0 };
  const order = [], occ = new Map(), home = new Map(), addOcc = (g) => { for (const c of g.cells) { occ.set(c, (occ.get(c) ?? 0) + 1); home.set(c, g.id); } }, subOcc = (g) => { for (const c of g.cells) { const n = (occ.get(c) ?? 1) - 1; if (n <= 0) { occ.delete(c); home.delete(c); } else { occ.set(c, n); if (home.get(c) === g.id) home.delete(c); } } };
  const ce = world.cell, N = world.mesh.cellCount;
  const envFit = (sp, b) => (!sp.env?.length ? 1 : sp.env.includes(b) ? 1 : 0.3);
  const speciesIn = (id) => speciesOf(id, civ);
  const note = (kind, title, parts, g, causes = []) => makeEvent(civ, ids, { kind, title, participants: parts, location: g ? { cell: g.cell } : null, causes, provenance: "simulation" });
  const KB = { agriculture: "agriculture", pastoralism: "herding", seafaring: "seafaring" };
  let pending = [];
  const learn = (g, key, mi, independent) => {
    const t = TECH[key]; g.tech.known[key] = mi; delete g.tech.prog[key]; refreshCand(g); if (KB[key]) g.knowledge[KB[key]] = 1;
    const prior = civ.techWorld[key]; (civ.techWorld[key] ??= { discoveries: [] });
    let evId = null; if (!prior) { stats.firstTech[key] = mi; evId = note("tech_discovered", `${t.name}を初めて発見`, [{ entityId: g.id, role: "discoverer" }], g).eventId; }
    if (independent) civ.techWorld[key].discoveries.push({ eventId: evId, groupId: g.id, month: mi, independent: !!prior });
    pending.push({ g, key, d: 0 });
  };
  const neighborsOf = (g) => { const out = new Set(), m = world.mesh; for (const c of g.cells) for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) { const o = home.get(m.neighborIds[k]); if (o && o !== g.id) out.add(o); } return [...out].sort(); };
  const spread = (mi, rng) => { // 技術の伝播（同じステップ内で最大 SPREAD_HOPS 跳び。届かなかった先端は次のステップへ続く）
    let q = pending; pending = [];
    for (let qi = 0; qi < q.length; qi++) {
      const { g, key, d } = q[qi], t = TECH[key]; if (!civ.groups[g.id]) continue; const dom = g.cohorts[0];
      for (const oid of neighborsOf(g)) {
        const o = civ.groups[oid]; if (!o || o.tech.known[key] != null || !t.prereq.every((p) => o.tech.known[p] != null) || o.pop < t.minPop || (key === "seafaring" && ce.coastDist[o.cell] > 1)) continue;
        if (rng() >= SPREAD_P + (o.cohorts[0].cultureId === dom.cultureId ? 0.15 : 0)) continue;
        o.tech.known[key] = mi; delete o.tech.prog[key]; refreshCand(o); if (KB[key]) o.knowledge[KB[key]] = 1; stats.transfers = (stats.transfers ?? 0) + 1;
        if (d + 1 < SPREAD_HOPS) q.push({ g: o, key, d: d + 1 }); else pending.push({ g: o, key, d: 0 });
      }
    }
  };
  const mk = (cell, pop, speciesId, parentCulture = null) => {
    const id = ids.next("pop"), g = newGroup(id, { cell, pop, subsistence: "forage", species: speciesId, bornAt: civ.monthIndex });
    const rng = ctxRng; const cu = createCulture(civ, ids, rng, { parent: parentCulture, cell }), lg = createLanguage(civ, ids, rng, { cultureId: cu });
    g.cohorts = [{ cultureId: cu, languageId: lg, religionId: null, speciesId, share: 1, tension: 0, interest: null }]; g.tech.known.stone_tools = civ.monthIndex; refreshCand(g);
    g.cells = territoryOf(world, cell); g.gen = 0; civ.groups[id] = g; order.push(id); addOcc(g); return g;
  };
  let ctxRng = rngOf(hashSeed(seed, "init"));

  // --- 人類の出現（熱帯〜亜熱帯の、肥沃で水に近い陸から）。他種族は、設定された種族だけが、生息環境のどこかに現れる
  const landCells = []; for (let c = 0; c < N; c++) if (ce.landWater[c] === LAND_WATER.LAND) landCells.push(c);
  if (!landCells.length) throw new Error("陸地がない世界では先史を進められません");
  const score = (c, sp) => { const b = ce.biome[c], base = ce.fertility[c] * 0.6 + (ce.coastDist[c] <= 3 || ce.river[c] ? 0.3 : 0) + Math.min(1, (ce.capacity[c] ?? 0) / (ce.areaKm2[c] || 1)) * 0.4; return base * envFit(sp, b); };
  const { comp, sizes } = landComponents(world, landCells), bigMin = Math.min(Math.max(...sizes), Math.max(20, landCells.length * 0.1));
  const human = SPECIES.human, hcands = landCells.filter((c) => sizes[comp[c]] >= bigMin && Math.abs(ce.lat[c]) < 35 * DEG && [BIOMES.SAVANNA, BIOMES.TROPICAL_SEASONAL, BIOMES.GRASSLAND, BIOMES.TEMPERATE_FOREST].includes(ce.biome[c])).sort((a, b) => score(b, human) - score(a, human) || a - b);
  const pool = (hcands.length ? hcands : landCells.filter((c) => sizes[comp[c]] >= bigMin).sort((a, b) => score(b, human) - score(a, human) || a - b)).slice(0, 10), origin = pool[Math.floor(ctxRng() * pool.length)];
  civ.monthIndex = start; civ.date = fromMonthIndex(start);
  const hg = mk(origin, 120, "human"); civ.species.human = { id: "human", name: "人間", bornAt: start };
  note("species_emerged", "人類が現れた", [{ entityId: "human", role: "species" }, { entityId: hg.id, role: "first_group" }], hg); stats.species.human = { at: start, cell: origin };
  const others = [...(cfg.builtinSpecies ?? []).map((k) => SPECIES[k]).filter(Boolean), ...cfg.species.map((s) => civ.speciesDefs[s.id])];
  const emergeAt = new Map(); for (const sp of others) emergeAt.set(sp.id, Math.floor(steps * (0.35 + 0.3 * (hashSeed(seed, "emerge", sp.id) % 1000) / 1000)));

  let areaSum = 0; for (const c of landCells) areaSum += ce.areaKm2[c]; const res = clamp(Math.sqrt(POP.territoryKm2 * 1.5 / (areaSum / landCells.length)), 1, 6); stats.moveScale = Math.round(res * 100) / 100;
  const baseRate = POP.growthPerMonth * 12;
  let Kworld = 0; for (const c of landCells) Kworld += 0.04 * (0.3 + ce.fertility[c]) * ce.areaKm2[c]; // 採集狩猟だけで世界が支えられる人口の目安
  let worldPop = 120, lastEpoch = -1, epochs = 0; const cultRel = new Map(); stats.epochs = [];
  for (let step = 0; step < steps; step++) {
    const mi = start + Math.round(step * stepMonths); civ.monthIndex = mi; civ.date = fromMonthIndex(mi);
    const frac = step / steps, ice = glacialAt(frac, years, phase0, vol); if (ice > stats.glacialMax) stats.glacialMax = ice;
    const rng = (ctxRng = rngOf(hashSeed(seed, "step", step)));
    for (const sp of others) if (emergeAt.get(sp.id) === step) { // 他種族の出現: 生息環境の、空いた肥沃な陸（標本から最良）
      let best = -1, bc = -1; for (let k = 0; k < 400; k++) { const c = landCells[Math.floor(rng() * landCells.length)]; if (occ.has(c)) continue; const s = score(c, sp); if (s > best) { best = s; bc = c; } }
      if (bc >= 0 && envFit(sp, ce.biome[bc]) >= 1) { const g = mk(bc, 90, sp.id); civ.species[sp.id] = { id: sp.id, name: sp.ja, bornAt: mi }; stats.species[sp.id] = { at: mi, cell: bc }; note("species_emerged", `${sp.ja}が現れた`, [{ entityId: sp.id, role: "species" }, { entityId: g.id, role: "first_group" }], g); }
    }
    spread(mi, rng);
    let total = 0, n = 0;
    for (let oi = 0; oi < order.length; oi++) {
      const id = order[oi], g = civ.groups[id]; if (!g) continue; n++;
      const sp = speciesIn(g.speciesId), fit = envFit(sp, ce.biome[g.cell]);
      const K = Math.max(0.5, groupCapacity(world, g, occ) * fit * iceMult(ce.lat[g.cell], ice) * (g.capMult ?? 1));
      const r = baseRate * sp.growth * (civ.options.growthScale ?? 1) * (0.85 + 0.3 * rng()), N0 = Math.max(1, g.pop);
      g.pop = K / (1 + (K / N0 - 1) * Math.exp(-r * (stepMonths / 12)));
      g.pressure = g.pop / K; total += g.pop;
      if (g.pop < 5) { subOcc(g); delete civ.groups[id]; stats.extinct++; n--; continue; }
      g.settledMonths = g.subsistence === "forage" || g.subsistence === "pastoral" ? 0 : g.settledMonths + stepMonths;
      // 技術: 進捗は世界人口（Kremer 型）に比例して加速。小さな集団は人口が足りない技術を持てない（available が見る）
      if ((step + (oi % LEARN_EVERY)) % LEARN_EVERY === 0) {
        const acc = (0.6 + 0.4 * Math.log10(Math.max(10, g.pop)) / 3) * sp.techRate * INNOVATION * stepMonths * LEARN_EVERY * Math.min(1.5, worldPop / POP_REF) * shapeAt(frac);
        if (!g.tech.cand) refreshCand(g);
        for (const key of [...g.tech.cand]) {
          const t = TECH[key]; if (t.cost > TECH_CEILING || !available(world, g, t)) continue;
          const u = (hashSeed(g.id, key) % 1000) / 1000, p = (g.tech.prog[key] ?? 0) + acc, need = t.cost * (PRE_COST[key] ?? 2.5) * (1 + 4 * u * u); // 集団ごとの運（独立の発見は少数の中心で起こり、あとは伝播する）
          if (p < need) { g.tech.prog[key] = p; continue; }
          learn(g, key, mi, true);
        }
      }
      // 生業の転換（環境に合うときだけ。農耕は肥沃か水辺、牧畜は草原・サバンナ・寒冷地、漁撈は海辺）
      if (g.subsistence !== "agriculture" && g.knowledge.agriculture >= 1 && (ce.fertility[g.cell] >= 0.25 || ce.river[g.cell] || ce.coastDist[g.cell] <= 2)) g.subsistence = "agriculture";
      else if (g.subsistence === "forage") { const b = ce.biome[g.cell]; if (g.knowledge.herding >= 1 && (b === BIOMES.GRASSLAND || b === BIOMES.SAVANNA || b === BIOMES.COLD_DESERT || b === BIOMES.TUNDRA)) g.subsistence = "pastoral"; else if (g.knowledge.seafaring >= 1 && ce.coastDist[g.cell] <= 1 && rng() < 0.4) g.subsistence = "fishing"; }

      // 分派: 人口圧が高く、行き先があれば。行き先が無ければしばらく探さない（探索は高価）
      if (g.pressure > POP.budPressure && g.pop >= POP.minBudPop * 2 && (g.noTargetUntil ?? -1) <= step) {
        stats.budSearches++; // まず近く（陸伝いの隣の領域）を探す。無ければ、航海を知る海辺の集団だけが遠く（海の向こう）を探す。探索は高価なので、行き先が無ければしばらく探さない
        const pick = (ts) => ts.find((x) => envFit(sp, ce.biome[x.cell]) >= 1) ?? (sp.id === "human" ? ts[0] : null);
        let t = pick(targetsFor(world, g, occ, res, 6, Math.max(1 / res, LOCAL_SCALE))); if (!t && g.knowledge.seafaring >= 1 && ce.coastDist[g.cell] <= 1) { stats.farSearches++; t = pick(targetsFor(world, g, occ, res, 6, 1)); }
        if (!t) g.noTargetUntil = step + 6 + (hashSeed(id) % 6);
        else {
          const moved = Math.round(g.pop * POP.budShare); g.pop -= moved; const child = spawnGroup(civ, ids, g, t.cell, moved); child.cells = territoryOf(world, t.cell); child.gen = (g.gen ?? 0) + 1; child.settledMonths = 0; child.stateId = null; order.push(child.id); addOcc(child);
          if (ce.landWater[g.cell] === LAND_WATER.LAND && (g.knowledge.seafaring >= 1) && t.cost >= POP.waterCost * res * 0.5) { stats.seaCrossings++; if (stats.seaCrossings === 1) note("sea_crossed", "海を渡って新しい土地へ人々が移った", [{ entityId: g.id, role: "origin" }, { entityId: child.id, role: "settlers" }], child); }
          // 文化・言語・宗教の分化: 世代を重ねて離れるほど分かれる（孤立）。文化の分化は言語より遅い
          const co = child.cohorts[0];
          if (child.gen >= 8 && rng() < 0.5) { const nl = createLanguage(civ, ids, rng, { parent: co.languageId, cultureId: co.cultureId }); co.languageId = nl; if (child.gen >= 14 || rng() < 0.25) { const nc = createCulture(civ, ids, rng, { parent: co.cultureId, cell: child.cell }); co.cultureId = nc; child.gen = 0; if (co.religionId && rng() < 0.4) co.religionId = createReligion(civ, ids, rng, { parent: co.religionId }); } }
        }
      }
      // 宗教の発生（象徴的な行動が現れる後半から。大きな集団で）
      { const co = g.cohorts[0]; if (!co.religionId && frac > 0.15 && g.pop > 300) { const known = cultRel.get(co.cultureId); if (known) co.religionId = known; else if (rng() < 0.01) { co.religionId = createReligion(civ, ids, rng); cultRel.set(co.cultureId, co.religionId); } } else if (co.religionId && !cultRel.has(co.cultureId)) cultRel.set(co.cultureId, co.religionId); }
    }
    worldPop = total;
    if (n > stats.peakGroups) stats.peakGroups = n;
    // 時代ごとの要約イベント（個々の分派・発見を全て記録するのではなく、集計を事実として残す）
    const ep = Math.floor(frac * EPOCHS); if (ep !== lastEpoch) { lastEpoch = ep; epochs++; { const sub = {}; for (const id of order) { const g = civ.groups[id]; if (g) sub[g.subsistence] = (sub[g.subsistence] ?? 0) + 1; } stats.epochs.push({ ep, groups: n, pop: Math.round(worldPop), x: Math.round(worldPop / Kworld * 100) / 100, ice: Math.round(ice * 100) / 100, sub }); } note("prehistory_epoch", `先史 第${epochs}期の概況（集団 ${n}・人口 約${Math.round(worldPop)}）`, [], null).effects.push({ targetId: "world", property: "prehistory.pop", before: null, after: Math.round(worldPop) }); }
    if (onProgress && step % 20 === 0) onProgress(step, steps);
  }
  // --- 先史の終わり: 年 0 に合わせる。定住できる集団は集落を持つ（個別のイベントは作らず、集計に残す）
  civ.monthIndex = monthIndex(0, 1); civ.date = fromMonthIndex(civ.monthIndex);
  for (const id of order) { const g = civ.groups[id]; if (!g) continue; g.lastBudAt = civ.monthIndex - POP.budCooldown; g.noTargetUntil = undefined; g.famineAt = -999; g.cells = g.cells ?? territoryOf(world, g.cell); delete g.gen; delete g.noTargetUntil; delete g.capMult;
    if (!g.settlementId && g.subsistence !== "forage" && g.subsistence !== "pastoral" && g.pop >= POP.settleMinPop) { const sid = ids.next("settle"); let best = g.cell, bs = -1; for (const c of g.cells) { const s = ce.fertility[c] + (ce.river[c] ? 0.4 : 0) + (ce.coastDist[c] <= 1 ? 0.2 : 0); if (s > bs) { bs = s; best = c; } } civ.settlements[sid] = { id: sid, groupId: g.id, cell: best, foundedAt: civ.monthIndex - 60, pop: Math.round(g.pop * POP.settledShare), stage: stageOf(Math.round(g.pop * POP.settledShare)) }; g.settlementId = sid; g.settledMonths = POP.settleMinMonths; stats.settlements++; }
    g.bornAt = Math.min(g.bornAt, civ.monthIndex); }
  for (const id of order) { const g = civ.groups[id]; if (g && g.parent && !civ.groups[g.parent]) g.parent = null; } // 先史の集計の中で消えた親は、系譜として辿らない
  stats.groups = Object.keys(civ.groups).length; stats.pop = Math.round(Object.values(civ.groups).reduce((s, g) => s + g.pop, 0));
  civ.wcde.prehistory = stats; civ.wcde.phase = "founding";
  return stats;
}
