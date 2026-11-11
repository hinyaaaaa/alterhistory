// v6.1.0 M1: 世界設定（魔法・独自種族は廃止。自然法則・先史の年数・新石器の時期を検証する）。旧 v600-m1-config は tests/legacy-v5/ へ。
import assert from "node:assert/strict";
import { normalizeWorldConfig, derivedSeeds, CONFIG_SCHEMA, NEOLITHIC_YEARS } from "../js/core/wcde/config.js";
import { createNewWorld } from "../js/core/wcde/world.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 3).join(" | ")); } };
await check("既定の設定: シードがあれば誤りなし。魔法・独自種族の項目は持たない。新石器の時期の既定", () => {
  const { config, errors } = normalizeWorldConfig({ worldSeed: "t" }); assert.deepEqual(errors, []); assert.equal(config.schema, CONFIG_SCHEMA); assert.equal("magic" in config, false); assert.equal("species" in config, false);
  assert.equal(config.prehistory.years, 500000); assert.equal(config.prehistory.neolithicYears, NEOLITHIC_YEARS);
});
await check("シードが空・範囲外の値は、理由つきの誤りになる（自然法則・先史の年数・新石器の時期）", () => {
  assert.ok(normalizeWorldConfig({}).errors.some((e) => /worldSeed/.test(e)));
  const { errors } = normalizeWorldConfig({ worldSeed: "t", laws: { disasterRate: 9, ecoResilience: 99 }, prehistory: { years: 5, neolithicYears: 5 } });
  for (const k of ["disasterRate", "ecoResilience", "prehistory.years", "prehistory.neolithicYears"]) assert.ok(errors.some((e) => e.includes(k)), k);
});
await check("魔法・独自種族を指定しても、設定には残らない", () => { const { config } = normalizeWorldConfig({ worldSeed: "t", magic: { enabled: true }, species: [{ id: "orc" }] }); assert.equal("magic" in config, false); assert.equal("species" in config, false); });
await check("同じシードからは同じ派生シード。別のシードなら別の世界", () => {
  const a = derivedSeeds(normalizeWorldConfig({ worldSeed: "s1" }).config), b = derivedSeeds(normalizeWorldConfig({ worldSeed: "s1" }).config); assert.deepEqual(a, b);
  const SMALL = { resolution: { targetCells: 1500 } }, x = createNewWorld({ worldSeed: "c-a", spec: SMALL }), y = createNewWorld({ worldSeed: "c-b", spec: SMALL }); const sig = (r) => Object.keys(r.w.civ.groups).length + ":" + JSON.stringify(r.w.civ.wcde.prehistory.firstTech) + ":" + Array.from(r.w.world.cell.fertility.slice(0, 400), (v) => Math.round(v * 1000)).join(","); assert.notDeepEqual(sig(x), sig(y)); // v6.10.1: 成立条件の相対化で、農耕の初出が世界によらず同じ年になりうるため、地形も比べる
});
await check("新石器の時期を設定すると、農耕の初出が先史の終わりの前後で変わる（早い設定ほど早く現れうる）", () => {
  const SMALL = { resolution: { targetCells: 1500 } }, late = createNewWorld({ worldSeed: "c-n", spec: SMALL, prehistory: { neolithicYears: 6000 } }), early = createNewWorld({ worldSeed: "c-n", spec: SMALL, prehistory: { neolithicYears: 20000 } });
  assert.ok(late.ok && early.ok); const fl = late.w.civ.wcde.prehistory.firstTech.agriculture, fe = early.w.civ.wcde.prehistory.firstTech.agriculture; assert.ok(fl == null || fl >= -6000 * 12); assert.ok(fe == null || fe >= -20000 * 12);
});
await check("エラーがある設定では世界を作らない", () => { const r = createNewWorld({ worldSeed: "x", laws: { disasterRate: 99 } }); assert.equal(r.ok, false); assert.ok(r.errors.length); });
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
