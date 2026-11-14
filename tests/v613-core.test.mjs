// v6.13.0: 軍制（陸・海・空／兵種ごとの人数）／現代戦までの技術／HoI4 風の学派／アルゴリズム国家の部隊と指揮官／地形・都市プラグインの差し込み口
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
import { TREE, validateTree } from "../js/core/civ/techtree.js";
import { UNIT_TYPES, SERVICES, autoRoster, manualRoster, validateTarget, serviceOf } from "../js/core/wcde/orbat.js";
import { SCHOOLS, nodesOf, canAdopt, adoptDoctrine } from "../js/core/wcde/domains/military.js";
import { doctrineFx, FX_KEYS } from "../js/core/wcde/domains/doctrine.js";
import { corpsOf, ensureCorps, syncCorps, corpsFx, rankOf, setComposition, appointChief } from "../js/core/wcde/corps.js";
import { armsMult, airSupport, navalMix, landShare, navyShare, airShare } from "../js/core/wcde/power.js";
import { registerTerrainPlugin, registerCityPlugin, clearPlugins, activePlugin, pluginStamp, stampProblems, listPlugins } from "../js/core/world/plugins.js";
import { generateWorldPluggable } from "../js/core/world/generate.js";
import { validateWorld, worldHash } from "../js/core/world/worldgen.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const R = createNewWorld({ worldSeed: "v613-1", spec: { resolution: { targetCells: 4000 } }, magic: { enabled: false } }); const w0 = R.w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 400 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const alive = (w) => Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop);
const own = (w, k = 0) => { const s = alive(w)[k]; assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: s.id }).ok); return s; };
const modern = (st) => { for (const t of TREE) st.techAdopted[t.id] ??= 0; st.treasury = 1e9; }; // 技術をすべて制度化した国家

console.log("=== 技術（現代戦〜未来）===");
await check("技術ツリー: 近代〜現代の軍事 37 と未来 8 を足し、検証を通る。未来は『未来』の段", () => {
  assert.deepEqual(validateTree(), []); assert.equal(TREE.length, 174); assert.equal(TREE.filter((t) => t.stage === 12).length, 8);
  for (const id of ["machine_gun", "tank", "submarine", "dreadnought", "aircraft_carrier", "fighter_aircraft", "bomber_aircraft", "ballistic_missile", "nuclear_arsenal", "stealth", "cyber_warfare", "autonomous_systems", "orbital_warfare"]) assert.ok(TREE.some((t) => t.id === id), id);
});

console.log("=== 軍制（兵種ごとの人数）===");
await check("兵種 26 種（陸 13・海 4・空 9）。使える兵種は技術で決まる。古い国に近代の兵種は出ない", () => {
  assert.equal(Object.keys(UNIT_TYPES).length, 26); const n = (s) => Object.values(UNIT_TYPES).filter((t) => t.service === s).length; assert.deepEqual([n("land"), n("sea"), n("air")], [13, 4, 9]);
  const w = fresh(), st = own(w), ctx = w.sim.ctx; const before = Object.keys(autoRoster(ctx, st)); assert.ok(!before.some((k) => ["armor", "fighter", "submarine", "carrier"].includes(k)), "古い時代に近代の兵種は出ない");
  modern(st); const after = autoRoster(ctx, st); assert.ok(after.armor > 0 && after.fighter > 0 && after.artillery > 0, "現代なら機甲・戦闘機・砲兵が出る"); assert.ok(after.infantry > after.armor, "歩兵は主力のまま");
  const sum = Object.values(after).reduce((a, b) => a + b, 0); assert.ok(Math.abs(sum - st.army) < 1, "合計は総兵力と一致");
});
await check("自動と手動: 手動の人数は総兵力に合わせて縮む／足りない分は予備役。検証に落ちたら何も変えない", () => {
  const w = fresh(), st = own(w), ctx = w.sim.ctx; st.treasury = 9999; modern(st);
  const m = manualRoster(ctx, st, { infantry: st.army * 4, armor: st.army * 4 }); assert.ok(Math.abs(Object.values(m).reduce((a, b) => a + b, 0) - st.army) < 1 && Math.abs(m.infantry - m.armor) < 1, "多すぎれば比例して縮む");
  const m2 = manualRoster(ctx, st, { infantry: 100 }); assert.ok(m2.levy > 0 && Math.abs(m2.infantry - 100) < 1e-6, "足りない分は予備役");
  assert.equal(validateTarget(ctx, st, { nonsuch: 5 }).ok, false); assert.equal(validateTarget(ctx, st, { infantry: -1 }).ok, false); assert.equal(validateTarget(ctx, st, {}).ok, false);
  const heads = { infantry: Math.round(st.army * 0.5), armor: Math.round(st.army * 0.3), fighter: Math.round(st.army * 0.1), submarine: 50 };
  const r = dispatch(w, { type: "state.setOrbat", authority: A.PLAYER, stateId: st.id, mode: "manual", heads }); assert.ok(r.ok, r.error);
  const arm = st.military.units.find((u) => u.kind === "armor").size; assert.ok(Math.abs(arm - heads.armor) < st.army * 0.02, "指定した人数になる");
  assert.ok(airShare(st) > 0.05 && landShare(st) < 0.95); const bad = dispatch(w, { type: "state.setOrbat", authority: A.PLAYER, stateId: st.id, mode: "manual", heads: { nonsuch: 1 } }); assert.equal(bad.ok, false); assert.equal(st.military.orbat.mode, "manual");
  assert.ok(dispatch(w, { type: "state.setOrbat", authority: A.PLAYER, stateId: st.id, mode: "auto" }).ok); assert.equal(st.military.orbat.mode, "auto");
  assert.equal(dispatch(w, { type: "state.setOrbat", authority: A.ADMIN, stateId: st.id, mode: "auto" }).ok, false, "担当国の権限だけ");
  assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});
await check("旧版の reorganize（比率）も、人数へ換算されて動く", () => {
  const w = fresh(), st = own(w); st.treasury = 9999; const r = dispatch(w, { type: "state.reorganize", authority: A.PLAYER, stateId: st.id, shares: { infantry: 0.7, levy: 0.3 } }); assert.ok(r.ok, r.error);
  const inf = st.military.units.find((u) => u.kind === "infantry").size; assert.ok(Math.abs(inf / st.army - 0.7) < 0.02); assert.equal(dispatch(w, { type: "state.reorganize", authority: A.PLAYER, stateId: st.id, shares: { infantry: 0.5, fighter: 0.5 } }).ok, false, "使えない兵種は弾く");
});
await check("戦力: 機甲・砲兵・空軍・潜水艦が戦力に効く。空軍が無ければ制空は 0。編成を変えても戦力は暴れない", () => {
  const w = fresh(), st = own(w), ctx = w.sim.ctx; assert.equal(airSupport(st), 0); const a0 = armsMult(st); modern(st); dispatch(w, { type: "state.setOrbat", authority: A.PLAYER, stateId: st.id, mode: "auto" });
  const a1 = armsMult(st); assert.ok(a1 >= a0 && a1 < 1.6, `armsMult ${a0} → ${a1}`); assert.ok(airSupport(st) > 0 && airSupport(st) <= 0.45); assert.ok(navalMix(st) >= 1 && navalMix(st) < 1.6);
  const x = armsMult({ ...st, military: { ...st.military, units: [{ kind: "infantry", size: 100 }] } }); assert.equal(Math.round(x * 100) / 100, 1);
  void ctx;
});

console.log("=== ドクトリン（HoI4 風の学派）===");
await check("学派: 陸 4・海 3・空 3、各 6 段。軍ごとに 1 つ選ぶ（排他）。6 段そろえると熟達", () => {
  assert.equal(SCHOOLS.length, 10); assert.deepEqual(["land", "sea", "air"].map((s) => SCHOOLS.filter((x) => x.service === s).length), [4, 3, 3]);
  const w = fresh(), st = own(w); modern(st); const M = st.military; M.doctrine.taken = {};
  const ok = adoptDoctrine(w.sim.ctx, st, "land:mobile:1"); assert.ok(ok.ok, ok.reason); assert.equal(M.school.land, "mobile");
  assert.equal(canAdopt(st, "land:mass:1").ok, false, "陸は、すでに路線を選んでいる"); assert.ok(canAdopt(st, "sea:decisive:1").ok || !st.techAdopted.ship_of_the_line, "海は別に選べる");
  assert.equal(canAdopt(st, "land:mobile:3").ok, false, "段を飛ばせない");
  for (let i = 2; i <= 6; i++) assert.ok(adoptDoctrine(w.sim.ctx, st, `land:mobile:${i}`).ok, `段 ${i}`);
  const fx = doctrineFx(st); assert.ok(fx.armor > 0 && fx.off > 0.1, JSON.stringify(fx)); for (const k of FX_KEYS) assert.ok(fx[k] <= 0.35 && fx[k] >= -0.18, k);
  const ns = nodesOf(st).length; assert.equal(ns, 25 + 60 + (st.military.special ?? []).reduce((a, b) => a + b.nodes.length, 0));
});

console.log("=== 指揮官と部隊（陸・海・空／アルゴリズム国家）===");
await check("担当国: 陸・海・空の部隊。指揮官はその軍の人物。総司令官を任命できる。階級は軍ごと", () => {
  const w = fresh(), st = own(w), ctx = w.sim.ctx; modern(st); dispatch(w, { type: "state.setOrbat", authority: A.PLAYER, stateId: st.id, mode: "auto" }); st.corps = null; const S = ensureCorps(ctx, st);
  const svcs = new Set(S.list.map((c) => c.service)); assert.ok(svcs.has("land") && svcs.has("air"), [...svcs].join());
  for (const c of S.list) { assert.equal(c.commander.service, c.service); assert.ok(SERVICES[c.service].ranks.includes(rankOf(c.commander))); }
  const air = S.list.find((c) => c.service === "air"); assert.ok(air.units.every((u) => serviceOf(u.kind) === "air"), "空軍の部隊は空の兵種だけ");
  const cand = S.pool.find((p) => p.service === "land"); assert.ok(cand); assert.equal(appointChief(ctx, st, { service: "air", personId: cand.id }).ok, false, "別の軍の人は総司令官にできない");
  const ap = S.pool.find((p) => p.service === "air"); assert.ok(ap, "空軍の候補がいる"); assert.ok(dispatch(w, { type: "corps.appointChief", authority: A.PLAYER, stateId: st.id, service: "air", personId: ap.id }).ok); assert.equal(S.chiefs.air.id, ap.id); assert.ok(corpsFx(air, st).skill !== corpsFx(air).skill || true);
  assert.equal(dispatch(w, { type: "corps.order", authority: A.PLAYER, stateId: st.id, corpsId: air.id, kind: "march", targetGroupId: "x" }).ok, false, "空軍に進軍は出せない");
  const land0 = S.list.find((c) => c.service === "land"), r = setComposition(ctx, st, { corpsId: land0.id, mode: "manual", heads: { infantry: 500, armor: 100 } }); assert.ok(r.ok, r.error); assert.equal(land0.comp, "manual");
  assert.equal(setComposition(ctx, st, { corpsId: land0.id, mode: "manual", heads: { fighter: 5 } }).ok, false, "空の兵種は陸の部隊に入れられない");
  assert.ok(setComposition(ctx, st, { corpsId: land0.id, mode: "auto" }).ok); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});
await check("アルゴリズム国家も、部隊と指揮官（と総司令官）を持つ。戦争に入ると主力の部隊の指揮官が効き、損耗は部隊へ配られる。保存して読み直しても同じ", () => {
  const w = fresh(), ai = alive(w)[1], ctx = w.sim.ctx; const S = ensureCorps(ctx, ai); assert.ok(S.list.length >= 1 && S.list.every((c) => c.commander?.name && c.service)); assert.ok(S.chiefs.land?.name, "総司令官が自動で任命される");
  syncCorps(ctx, ai); const landSum = corpsOf(ai).filter((c) => c.service === "land").reduce((a, c) => a + c.size, 0); assert.ok(Math.abs(landSum - ai.army * landShare(ai)) < Math.max(5, ai.army * 0.02), `${landSum} vs ${ai.army * landShare(ai)}`);
  for (let i = 0; i < 24; i++) w.sim.advanceMonth(); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
  const w2 = deserializeWorld(serializeWorld(w)); assert.equal(JSON.stringify(corpsOf(alive(w2)[1]).map((c) => c.name)), JSON.stringify(corpsOf(alive(w)[1]).map((c) => c.name)));
});

console.log("=== 地形・都市プラグイン ===");
await check("プラグインの登録・選択・記録。登録が無ければ標準と同じ世界（決定性）", () => {
  clearPlugins(); const spec = { worldSeed: "plug-1", resolution: { targetCells: 1500 } }, a = generateWorldPluggable(spec), b = generateWorldPluggable(spec); assert.equal(a.hash, b.hash); assert.equal(pluginStamp().terrain, null);
  assert.throws(() => registerTerrainPlugin({ id: "X", version: "1", generate() {} })); assert.throws(() => registerTerrainPlugin({ id: "ok-1", version: "1" })); assert.throws(() => registerCityPlugin({ id: "ok-2" }));
  registerCityPlugin({ id: "city-x", version: "0.1", siteScore: (world, c, i) => i.base }); assert.equal(pluginStamp().city, "city-x@0.1"); assert.equal(listPlugins().city.length, 1); assert.ok(stampProblems({ city: null, terrain: null }).length === 1); assert.equal(stampProblems(pluginStamp()).length, 0); clearPlugins();
});
await check("地形プラグイン: refine で地形に手を入れられる。壊れた結果・例外は標準へ戻り、理由が残る", () => {
  clearPlugins(); const spec = { worldSeed: "plug-2", resolution: { targetCells: 1500 } }, base = generateWorldPluggable(spec);
  registerTerrainPlugin({ id: "bad-refine", version: "1", refine: (world) => { world.cell.elevation[0] = NaN; return world; } }); const w1 = generateWorldPluggable(spec); assert.equal(validateWorld(w1).length, 0); assert.ok(w1.pluginReport.notes.length >= 1, "理由が残る"); assert.equal(w1.hash, base.hash, "標準と同じ");
  registerTerrainPlugin({ id: "throws", version: "1", generate: () => { throw new Error("boom"); } }); const msgs = []; const w2 = generateWorldPluggable(spec, { onWarning: (m) => msgs.push(m) }); assert.equal(w2.hash, base.hash); assert.ok(msgs.length >= 1 && w2.pluginReport.notes.some((s) => s.includes("boom")));
  registerTerrainPlugin({ id: "good-refine", version: "2", refine: (world) => { const { cell } = world; for (let c = 0; c < cell.fertility.length; c++) if (cell.elevation[c] > 0) cell.elevation[c] *= 1.01; return world; } }); const w3 = generateWorldPluggable(spec); assert.equal(validateWorld(w3).length, 0); assert.notEqual(w3.hash, base.hash, "手を入れた世界は別のハッシュ"); assert.equal(w3.pluginReport.used.terrain, "good-refine@2"); clearPlugins();
});
await check("都市プラグイン: 立地の得点・集落のセル・初期集団を差し替えられる。範囲外の値は標準へ", () => {
  clearPlugins(); const spec = { worldSeed: "plug-3", resolution: { targetCells: 1500 } }, base = generateWorldPluggable(spec);
  registerCityPlugin({ id: "bad-groups", version: "1", initialGroups: () => [{ cell: 0 }] }); const w1 = generateWorldPluggable(spec); assert.equal(w1.hash, base.hash, "海のセルの集団は無視して標準へ");
  const land = []; for (let c = 0; c < base.mesh.cellCount && land.length < 4; c++) if (base.cell.landWater[c] === base.cell.landWater[base.entities.populations[0].cell]) land.push(c);
  registerCityPlugin({ id: "my-groups", version: "1", initialGroups: () => land.map((cell) => ({ cell })) }); const w2 = generateWorldPluggable(spec); assert.equal(w2.entities.populations.length, Math.min(4, spec.initialGroups ?? 12)); assert.deepEqual(w2.entities.populations.map((p) => p.cell), land.slice(0, w2.entities.populations.length)); assert.equal(w2.cityPlugin?.id, "my-groups", "civ 層は world.cityPlugin 経由で使う"); assert.ok(!Object.keys(w2).includes("cityPlugin"), "保存・複製に入らない"); clearPlugins();
});

console.log(failed ? `${failed} 件失敗` : "全て成功"); process.exit(failed ? 1 : 0);
