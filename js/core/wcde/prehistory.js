// v6 M2 / v6.1.0 M2: 圧縮された約50万年の先史。通常の月次 tick を 50 万年分回さず、粗い時間刻み（既定 2,500 年）の集計モデルで進める。
//   v6.1.0: 古代型人類（人類祖先）の集団から始まり、現生人類が現れて置き換わる・混血していく。ファンタジー種族・魔法は無い。生態系（動植物・資源量・環境容量）は集約モデルで、人口と相互に影響する。
//   技術は月次と同じ発生率の関数（tech.js の emergenceRate）を、粗い時間刻みの経過年数で積分して使う（研究点は無い）。
//   人類の出現・拡散、氷期による居住可能性の変動、移住（陸路・航海）、
//   生業・技術の発展（農耕・牧畜・航海・定住）、文化・言語・宗教の分化を、世界の地形・気候・肥沃度から実際に計算する（固定の結果は返さない）。
//   終わりは「国家成立の直前」。条件を満たす文明候補を数え、そこで止まる（founding.js）。
//   純粋ロジック（時刻・Math.random 非依存。乱数は seed と step から作る）。ワーカーに載せても結果は変わらない。
import { createIdGen } from "../civ/ids.js";
import { emptyLayers, newGroup, hashSeed, rngOf, CIV_STATE_VERSION } from "../civ/civ-state.js";
import { fromMonthIndex, monthIndex } from "../civ/tick.js";
import { createCulture, createLanguage, createReligion } from "../civ/culture.js";
import { makeEvent } from "../civ/events.js";
import { POP, groupCapacity, reachable, cellCapacity, spawnGroup, territoryOf } from "../civ/population.js";
import { TECHS, TECH, refreshCand, emergenceRate, pEmerge, u01, accel } from "../civ/tech.js";
import { calibrateStart } from "../civ/calibration.js";
import { initEco, stepEco, ecoMult } from "./domains/ecosystem.js";
import { SPECIES, speciesOf } from "../civ/species.js";
import { BIOMES, LAND_WATER } from "../civ/world-consts.js";
import { derivedSeeds } from "./config.js";

export const PREHISTORY_STEP_YEARS = 2500;
const LEARN_EVERY = 4;               // 技術の評価は数ステップに1回（経過年数で積分する）
// 先史の技術の発生率の補正（調整値）。文化の累積（世代を超えた知識の蓄積）で、時間とともに発明の速さが増す。最後の 15% は、定住・農耕が広く現れるよう急に増える（世界が人の住める土地を持つかぎり、建国の候補が現れる）
const preBoost = (f) => 0.6 + 6 * f ** 3 + 3000 * Math.max(0, f - 0.85) ** 2;
const isPrehistoricTech = (t) => t.pre; // 先史の技術（原初〜新石器）。青銅以降は歴史の月次の中で
// 新石器の幕開け（v6.1.0 M9）。農耕・牧畜・大規模な建築は、完新世の安定した気候が始まってから初めて現れる（氷期の間は、発明の条件がそろわない）。
//   現れうるのは、先史の終わりから数えて NEOLITHIC_YEARS（既定 10,000 年。設定 prehistory.neolithicYears）より後だけ。先史の終わり＝歴史の始まり（年 0）は、
//   「最初の国家が現れる頃」（史実なら古代エジプト第一王朝の頃）として較正する。農耕が先史の途中（数十万年前）に現れて、始まりの世界が停滞するのを防ぐ。
const RIPEN_YEARS = 400, FAR_SCALES = [1, 2, 3.5];
const gateYears = (neo) => ({ seafaring: 60000, pottery: 20000, agriculture: neo, pastoralism: neo - 500, construction: neo - 500 }); // 技術ごとに「年 0 から数えて何年前より後に現れうるか」（航海・土器は氷期の終わりに近い時期、農耕は完新世）
const LOCAL_SCALE = 0.4; // 近くの探索の範囲（移動の予算に対する比）
const SPREAD_P = 0.6, SPREAD_HOPS = 12; // 技術の伝播: 隣接する集団へ 1 ステップあたり最大 SPREAD_HOPS 跳び。1 跳びの確率 SPREAD_P（同じ文化なら +0.15）
const EPOCHS = 20;                   // 要約イベント（時代ごとの集計）の数
const DEG = Math.PI / 180;

/** 先史を始める前の、空の文明状態。WCDE の設定を civ.options に写す（魔法の有無・成長の倍率など） */
export function createWcdeCiv(world, config, { historySeed = null } = {}) {
  const seeds = derivedSeeds(config), start = -Math.round(config.prehistory.years);
  const civ = { version: CIV_STATE_VERSION, historySeed: historySeed ?? hashSeed(config.worldSeed, "history"), seq: {}, date: fromMonthIndex(monthIndex(start, 1)), monthIndex: monthIndex(start, 1), groups: {}, settlements: {}, events: [], proposals: [], player: { groupId: null }, ...emptyLayers() };
  civ.options = { aiInterval: 6, wcde: true, magic: false, growthScale: config.laws.fertilityScale, disasterRate: config.laws.disasterRate, climateVolatility: config.laws.climateVolatility };
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
  const learn = (g, key, mi) => {
    const t = TECH[key]; g.tech.known[key] = mi; delete g.tech.prog[key]; refreshCand(g); if (KB[key]) g.knowledge[KB[key]] = 1;
    const prior = civ.techWorld[key], rec = (civ.techWorld[key] ??= { discoveries: [], first: mi, independent: 0, spread: 0, byChannel: {}, firstGroupId: g.id });
    rec.independent++; if (!prior) { stats.firstTech[key] = mi; rec.firstEventId = note("tech_discovered", `${t.name}を初めて発見`, [{ entityId: g.id, role: "discoverer" }], g).eventId; }
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
        o.tech.known[key] = mi; delete o.tech.prog[key]; refreshCand(o); if (KB[key]) o.knowledge[KB[key]] = 1; stats.transfers = (stats.transfers ?? 0) + 1; { const rec = civ.techWorld[key]; if (rec) { rec.spread++; rec.byChannel.contact = (rec.byChannel.contact ?? 0) + 1; } }
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
  const archaic = SPECIES.archaic, hcands = landCells.filter((c) => sizes[comp[c]] >= bigMin && Math.abs(ce.lat[c]) < 35 * DEG && [BIOMES.SAVANNA, BIOMES.TROPICAL_SEASONAL, BIOMES.GRASSLAND, BIOMES.TEMPERATE_FOREST].includes(ce.biome[c])).sort((a, b) => score(b, archaic) - score(a, archaic) || a - b);
  const pool = (hcands.length ? hcands : landCells.filter((c) => sizes[comp[c]] >= bigMin).sort((a, b) => score(b, archaic) - score(a, archaic) || a - b)).slice(0, 10), origin = pool[Math.floor(ctxRng() * pool.length)];
  civ.monthIndex = start; civ.date = fromMonthIndex(start);
  // 人類祖先（古代型人類）の集団から始まる。現生人類は、数十万年の途中（全体の 30〜55%）に原産地の近くで現れ、隣接する集団へ置き換わる・混血していく
  const hg = mk(origin, 120, "archaic"); civ.species.archaic = { id: "archaic", name: "古代型人類", bornAt: start };
  note("species_emerged", "古代型人類の集団が現れた", [{ entityId: "archaic", role: "species" }, { entityId: hg.id, role: "first_group" }], hg); stats.species.archaic = { at: start, cell: origin };
  const modernAt = Math.floor(steps * (0.3 + 0.25 * (hashSeed(civ.wcde.seeds.lineage, "modern") % 1000) / 1000)); let modernDone = false; stats.assimilated = 0;
  let areaSum = 0; for (const c of landCells) areaSum += ce.areaKm2[c]; const res = clamp(Math.sqrt(POP.territoryKm2 * 1.5 / (areaSum / landCells.length)), 1, 6); stats.moveScale = Math.round(res * 100) / 100;
  const baseRate = POP.growthPerMonth * 12, gate = gateYears(cfg.prehistory.neolithicYears ?? 10000);
  let Kworld = 0; for (const c of landCells) Kworld += 0.04 * (0.3 + ce.fertility[c]) * ce.areaKm2[c]; // 採集狩猟だけで世界が支えられる人口の目安
  civ.eco = initEco(world, cfg.laws, 0);
  let worldPop = 120, lastEpoch = -1, epochs = 0, lastEpEv = null; const cultRel = new Map(); stats.epochs = [];
  for (let step = 0; step < steps; step++) {
    const mi = start + Math.round(step * stepMonths); civ.monthIndex = mi; civ.date = fromMonthIndex(mi);
    const frac = step / steps, ice = glacialAt(frac, years, phase0, vol); if (ice > stats.glacialMax) stats.glacialMax = ice;
    const rng = (ctxRng = rngOf(hashSeed(seed, "step", step)));
    if (!modernDone && step >= modernAt) { // 現生人類の出現: 古代型人類の集団のうち、原産地に最も近い・人口の多いものから
      const cand = order.map((i) => civ.groups[i]).filter((g) => g && g.speciesId === "archaic").sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1))[0];
      if (cand) { modernDone = true; cand.speciesId = "human"; for (const c of cand.cohorts) c.speciesId = "human"; civ.species.human = { id: "human", name: "人間", bornAt: mi }; stats.species.human = { at: mi, cell: cand.cell }; note("species_emerged", "現生人類が現れた", [{ entityId: "human", role: "species" }, { entityId: cand.id, role: "first_group" }], cand); }
    }
    if (modernDone) for (const id of order) { // 置き換え・混血: 現生人類の集団に隣接する古代型人類は、ステップごとに一定の確率で現生人類へ。孤立していてもごくまれに
      const g = civ.groups[id]; if (!g || g.speciesId !== "archaic") continue; const nearModern = neighborsOf(g).some((o) => civ.groups[o]?.speciesId === "human"), u = (hashSeed(seed, "assim", step, id) % 10000) / 10000;
      if (u < (nearModern ? 0.3 : 0.01)) { g.speciesId = "human"; for (const c of g.cohorts) c.speciesId = "human"; stats.assimilated++; }
    }
    spread(mi, rng);
    let total = 0, n = 0;
    for (let oi = 0; oi < order.length; oi++) {
      const id = order[oi], g = civ.groups[id]; if (!g) continue; n++;
      const sp = speciesIn(g.speciesId), fit = envFit(sp, ce.biome[g.cell]);
      const K = Math.max(0.5, groupCapacity(world, g, occ) * fit * iceMult(ce.lat[g.cell], ice) * (g.capMult ?? 1) * ecoMult(world, civ, g));
      const r = baseRate * sp.growth * (civ.options.growthScale ?? 1) * (0.85 + 0.3 * rng()), N0 = Math.max(1, g.pop);
      g.pop = K / (1 + (K / N0 - 1) * Math.exp(-r * (stepMonths / 12)));
      g.pressure = g.pop / K; total += g.pop;
      if (g.pop < 5) { subOcc(g); delete civ.groups[id]; stats.extinct++; n--; continue; }
      g.settledMonths = g.subsistence === "forage" || g.subsistence === "pastoral" ? 0 : g.settledMonths + stepMonths;
      // 技術: 月次と同じ発生率（emergenceRate）を、経過年数で積分する。小さな集団は人口が足りない技術を持てない。乱数は (集団, 技術, ステップ) から決まる
      if ((step + (oi % LEARN_EVERY)) % LEARN_EVERY === 0) {
        if (!g.tech.cand) refreshCand(g);
        const dt = (stepMonths / 12) * LEARN_EVERY, env = { accel: accel(civ, worldPop) * sp.techRate * preBoost(frac), contact: neighborsOf(g).length, rivals: 0 };
        for (const key of [...g.tech.cand]) {
          const t = TECH[key]; if (!isPrehistoricTech(t) || (gate[key] != null && mi < -gate[key] * 12)) continue; let rate = emergenceRate(world, civ, g, t, env);
          if (gate[key] != null) rate *= 1 + (mi + gate[key] * 12) / 12 / RIPEN_YEARS; // 条件がそろってから年月が経つほど、各地で独立に発明されやすくなる（農耕は複数の地域で、ほぼ必ず現れる）
          if (rate <= 0 || u01(civ, "pretech", step, g.id, key) >= pEmerge(rate, dt)) continue;
          learn(g, key, mi);
        }
      }
      // 生業の転換（環境に合うときだけ。農耕は肥沃か水辺、牧畜は草原・サバンナ・寒冷地、漁撈は海辺）
      if (g.subsistence !== "agriculture" && g.knowledge.agriculture >= 1 && (ce.fertility[g.cell] >= 0.25 || ce.river[g.cell] || ce.coastDist[g.cell] <= 2)) g.subsistence = "agriculture";
      else if (g.subsistence === "forage") { const b = ce.biome[g.cell]; if (g.knowledge.herding >= 1 && (b === BIOMES.GRASSLAND || b === BIOMES.SAVANNA || b === BIOMES.COLD_DESERT || b === BIOMES.TUNDRA)) g.subsistence = "pastoral"; else if (g.knowledge.seafaring >= 1 && ce.coastDist[g.cell] <= 1 && rng() < 0.4) g.subsistence = "fishing"; }

      // 分派: 人口圧が高く、行き先があれば。行き先が無ければしばらく探さない（探索は高価）
      if (g.pressure > POP.budPressure && g.pop >= POP.minBudPop * 1.25 && (g.noTargetUntil ?? -1) <= step) {
        stats.budSearches++; // まず近く（陸伝いの隣の領域）を探す。無ければ、航海を知る海辺の集団だけが遠く（海の向こう）を探す。探索は高価なので、行き先が無ければしばらく探さない
        const pick = (ts) => ts.find((x) => envFit(sp, ce.biome[x.cell]) >= 1) ?? ts[0];
        let t = pick(targetsFor(world, g, occ, res, 6, Math.max(1 / res, LOCAL_SCALE))); if (!t && g.knowledge.seafaring >= 1 && ce.coastDist[g.cell] <= 1) { stats.farSearches++; for (const sc of FAR_SCALES) { t = pick(targetsFor(world, g, occ, res, 6, sc)); if (t) break; } } // 海を渡る航海は、近い陸が空いていなければ、より遠くの陸を探す（人類は 1 万年あまりでほぼ全ての大陸に広がった）
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
    worldPop = total; stepEco(world, civ, order.map((i) => civ.groups[i]).filter(Boolean), stepMonths / 12, { ice, laws: cfg.laws });
    if (n > stats.peakGroups) stats.peakGroups = n;
    // 時代ごとの要約イベント（個々の分派・発見を全て記録するのではなく、集計を事実として残す）
    const ep = Math.floor(frac * EPOCHS), epEnd = step === steps - 1 || Math.floor(((step + 1) / steps) * EPOCHS) !== ep; /* v6.3.2: 時代区分の記録は「その時代の終わり」の値（以前は始まりの値で、最後の時代が最終人口の 1/19 になっていた） */ if (epEnd && ep !== lastEpoch) { lastEpoch = ep; epochs++; let popEnd = 0, nEnd = 0; { const sub = {}; for (const id of order) { const g = civ.groups[id]; if (g) { sub[g.subsistence] = (sub[g.subsistence] ?? 0) + 1; popEnd += g.pop; nEnd++; } } stats.epochs.push({ ep, groups: nEnd, pop: Math.round(popEnd), x: Math.round(popEnd / Kworld * 100) / 100, ice: Math.round(ice * 100) / 100, sub }); } { const ev = note("prehistory_epoch", `先史 第${epochs}期の概況（終わりの時点で 集団 ${nEnd}・人口 約${Math.round(popEnd)}）`, [], null); ev.effects.push({ targetId: "world", property: "prehistory.pop", before: null, after: Math.round(popEnd) }); lastEpEv = ev; } }
    if (onProgress && step % 20 === 0) onProgress(step, steps);
  }
  // --- 先史の終わり: 年 0 に合わせる。定住できる集団は集落を持つ（個別のイベントは作らず、集計に残す）
  civ.monthIndex = monthIndex(0, 1); civ.date = fromMonthIndex(civ.monthIndex);
  calibrateStart(world, civ); // v6.8.0: 世界の人口を史実の起点（約 1,400 万人）へそろえる
  for (const id of order) { const g = civ.groups[id]; if (!g) continue; g.lastBudAt = civ.monthIndex - POP.budCooldown; g.noTargetUntil = undefined; g.famineAt = -999; g.cells = g.cells ?? territoryOf(world, g.cell); delete g.gen; delete g.noTargetUntil; delete g.capMult;
    if (!g.settlementId && g.subsistence !== "forage" && g.subsistence !== "pastoral" && g.pop >= POP.settleMinPop) { const sid = ids.next("settle"); let best = g.cell, bs = -1; for (const c of g.cells) { const s = ce.fertility[c] + (ce.river[c] ? 0.4 : 0) + (ce.coastDist[c] <= 1 ? 0.2 : 0); if (s > bs) { bs = s; best = c; } } civ.settlements[sid] = { id: sid, groupId: g.id, cell: best, foundedAt: civ.monthIndex - 60, pop: Math.round(g.pop * POP.settledShare), stage: stageOf(Math.round(g.pop * POP.settledShare)) }; g.settlementId = sid; g.settledMonths = POP.settleMinMonths; stats.settlements++; }
    g.bornAt = Math.min(g.bornAt, civ.monthIndex); }
  for (const id of order) { const g = civ.groups[id]; if (g && g.parent && !civ.groups[g.parent]) g.parent = null; } // 先史の集計の中で消えた親は、系譜として辿らない
  stats.groups = Object.keys(civ.groups).length; stats.pop = Math.round(Object.values(civ.groups).reduce((s, g) => s + g.pop, 0));
  { const ep = stats.epochs[stats.epochs.length - 1]; if (ep && lastEpEv) { ep.pop = stats.pop; ep.x = Math.round(stats.pop / Math.max(1, ep.pop / Math.max(0.01, ep.x)) * 100) / 100; const e0 = lastEpEv.effects.find((e) => e.property === "prehistory.pop"); if (e0) e0.after = stats.pop; lastEpEv.title = lastEpEv.title.replace(/人口 約\d+/, `人口 約${stats.pop}`); } } // v6.8.0: 起点の人口の較正のあと、最後の時代区分の値も終わりの値にそろえる
  civ.wcde.prehistory = stats; civ.wcde.phase = "founding";
  return stats;
}
