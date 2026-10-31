// v6.0.0 M1: 世界生成設定（WorldConfig）・暦・独自種族・魔法の有無・乱数の分離・決定性。
import assert from "node:assert/strict";
import { normalizeWorldConfig, derivedSeeds, speciesDefsOf } from "../js/core/wcde/config.js";
import { normalizeCalendar, formatDate, eraOf, applyDisplayEdit } from "../js/core/wcde/calendar.js";
import { createNewWorld } from "../js/core/wcde/world.js";
import { speciesOf } from "../js/core/civ/species.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 3).join(" | ")); } };
const SMALL = { resolution: { targetCells: 3000 } };

console.log("=== 設定の検証 ===");
await check("既定の設定は誤りなく補完される（名前・種族・魔法・暦・先史の長さ）", () => {
  const { config, errors } = normalizeWorldConfig({ worldSeed: "a" }); assert.deepEqual(errors, []);
  assert.equal(config.magic.enabled, false); assert.equal(config.prehistory.years, 500000); assert.equal(config.species.length, 0); assert.ok(config.name);
});
await check("範囲外・型違いは、理由つきの errors になる（黙って丸めない）", () => {
  const { errors } = normalizeWorldConfig({ laws: { disasterRate: 9 }, magic: { enabled: "yes" }, prehistory: { years: 5 } });
  assert.ok(errors.some((e) => /disasterRate/.test(e))); assert.ok(errors.some((e) => /magic.enabled/.test(e))); assert.ok(errors.some((e) => /prehistory.years/.test(e)));
});
await check("独自種族: 重複・未知の生態系・範囲外の特性は errors", () => {
  const e1 = normalizeWorldConfig({ species: [{ id: "elf", ja: "x", env: ["FOREST"] }] }).errors; assert.ok(e1.some((e) => /重複/.test(e)));
  const e2 = normalizeWorldConfig({ species: [{ id: "orc", ja: "オーク", env: ["NOPE"] }] }).errors; assert.ok(e2.some((e) => /未知/.test(e)));
  const e3 = normalizeWorldConfig({ species: [{ id: "orc", ja: "オーク", env: ["SAVANNA"], growth: 9 }] }).errors; assert.ok(e3.some((e) => /growth/.test(e)));
  const ok = normalizeWorldConfig({ worldSeed: "t", species: [{ id: "orc", ja: "オーク", env: ["SAVANNA"], martial: 1.5 }] }); assert.deepEqual(ok.errors, []); assert.equal(speciesDefsOf(ok.config).orc.martial, 1.5);
});
await check("独自種族の特性は speciesOf(id, civ) で引ける（組み込みと同じ形）", () => {
  const { config } = normalizeWorldConfig({ worldSeed: "t", species: [{ id: "orc", ja: "オーク", env: ["SAVANNA"], lifespan: 600 }] }); const civ = { speciesDefs: speciesDefsOf(config) };
  assert.equal(speciesOf("orc", civ).lifespan, 600); assert.equal(speciesOf("orc").ja, "人間", "civ を渡さなければ従来どおり（未知は人間）");
});

console.log("=== 乱数の分離 ===");
await check("世界生成用と歴史用の乱数は別（地理のシードは worldSeed、先史は設定から導く）", () => {
  const a = normalizeWorldConfig({ worldSeed: "s1" }).config, b = normalizeWorldConfig({ worldSeed: "s1", magic: { enabled: true } }).config;
  assert.equal(derivedSeeds(a).geography, derivedSeeds(b).geography); assert.notEqual(derivedSeeds(a).prehistory, derivedSeeds(b).prehistory);
  assert.deepEqual(derivedSeeds(a), derivedSeeds(normalizeWorldConfig({ worldSeed: "s1" }).config), "同じ設定は同じシード");
});
await check("WCDE のコードは Math.random・Date.now・DOM を使わない（決定的）", () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "js/core/wcde"); const files = []; const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name)) : files.push(path.join(d, f.name)); }; walk(dir);
  for (const f of files) { const s = fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, ""); assert.ok(!/Math\.random|Date\.now|\bdocument\.|\bwindow\./.test(s), `${path.basename(f)} に非決定的・DOM の呼び出し`); }
});

console.log("=== 暦 ===");
await check("暦: 起点・年のずれ・時代区分・表示形式。負の年は「前」で数える", () => {
  const { calendar, errors } = normalizeCalendar({ epochName: "建国暦", beforeName: "建国前", yearOffset: 10, eras: [{ name: "神話", startYear: -1000 }, { name: "黎明", startYear: 0 }] }); assert.deepEqual(errors, []);
  assert.equal(formatDate(calendar, 0), "建国暦10年1月"); assert.equal(formatDate(calendar, -12 * 11), "建国前1年1月"); assert.equal(eraOf(calendar, -12 * 500).name, "神話"); assert.equal(eraOf(calendar, 5).name, "黎明"); assert.equal(eraOf(calendar, -12 * 5000), null);
});
await check("暦: 区分の境界が逆順・形式に {year} が無いなどは errors", () => {
  assert.ok(normalizeCalendar({ eras: [{ name: "a", startYear: 5 }, { name: "b", startYear: 1 }] }).errors.length); assert.ok(normalizeCalendar({ format: "年" }).errors.length);
});
await check("暦: 生成後に変えられるのは名前・表示形式だけ（境界・年のずれは拒否）", () => {
  const { calendar } = normalizeCalendar({ eras: [{ id: "e0", name: "神話", startYear: -100 }] });
  const ok = applyDisplayEdit(calendar, { eraNames: { e0: "古の時代" }, epochName: "新紀元" }); assert.deepEqual(ok.errors, []); assert.equal(ok.calendar.eras[0].name, "古の時代"); assert.equal(ok.calendar.eras[0].startYear, -100);
  assert.ok(applyDisplayEdit(calendar, { yearOffset: 5 }).errors.length); assert.ok(applyDisplayEdit(calendar, { eras: [] }).errors.length);
});

console.log("=== 世界の作成 ===");
const mk = (extra = {}) => createNewWorld({ worldSeed: "m1-a", spec: SMALL, ...extra });
await check("エラーがある設定では世界を作らない", () => { const r = createNewWorld({ worldSeed: "x", species: [{ id: "Bad ID", ja: "x", env: ["SAVANNA"] }] }); assert.equal(r.ok, false); assert.ok(r.errors.length); });
const A = mk({ magic: { enabled: true } }), A2 = mk({ magic: { enabled: true } });
await check("同じ設定・同じシードから、同じ初期世界（先史の結果まで一致）", () => {
  assert.ok(A.ok); const a = A.w.civ, b = A2.w.civ; assert.deepEqual(a.groups, b.groups); assert.deepEqual(a.cultures, b.cultures); assert.deepEqual(a.events, b.events); assert.deepEqual(a.wcde.candidates, b.wcde.candidates);
});
await check("別のシードなら別の世界", () => { const c = mk({ worldSeed: "m1-b", magic: { enabled: true } }); assert.notDeepEqual(c.w.civ.groups, A.w.civ.groups); });
await check("魔法を無効にした世界には、魔法の人物・組織・制度が一切ない（先史から歴史まで）", () => {
  const r = mk({ magic: { enabled: false } }); const { w } = r; w.sim.advanceMonths(0);
  assert.equal(Object.keys(w.civ.persons ?? {}).length, 0); assert.equal(w.civ.options.magic, false);
  w.civ.wcde.phase = "running"; w.sim.advanceMonths(240); assert.equal(Object.keys(w.civ.persons ?? {}).length, 0); assert.equal(Object.keys(w.civ.orgs ?? {}).length, 0); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});
await check("独自種族を設定した世界に、その種族が現れる（先史中の出現イベントと集団）", () => {
  const r = createNewWorld({ worldSeed: "m1-sp", spec: SMALL, species: [{ id: "orc", ja: "オーク", env: ["SAVANNA", "GRASSLAND", "TROPICAL_SEASONAL", "TEMPERATE_FOREST"], martial: 1.6 }] }); assert.ok(r.ok, r.errors?.join());
  const civ = r.w.civ; assert.ok(civ.species.orc, "種族の記録"); assert.ok(civ.events.some((e) => e.kind === "species_emerged" && e.participants.some((p) => p.entityId === "orc")));
  assert.ok(Object.values(civ.groups).some((g) => g.speciesId === "orc"), "その種族の集団がいる"); assert.equal(civ.speciesDefs.orc.martial, 1.6);
});
await check("暦は設定が civ に保存される（表示は内部の月通番から導かれる）", () => { assert.equal(A.w.civ.wcde.config.calendar.epochName, "紀元"); assert.equal(A.w.civ.monthIndex, 0); });

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
