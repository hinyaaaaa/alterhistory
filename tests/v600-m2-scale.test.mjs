// v6.0.0 M2: 25万セルの世界でも、先史が現実的な時間で終わり、文明候補が示される。
import assert from "node:assert/strict";
import { createNewWorld } from "../js/core/wcde/world.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
import { checkCivIntegrity } from "../js/core/civ/civ-sim.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 3).join(" | ")); } };
const t0 = Date.now(); const r = createNewWorld({ worldSeed: "perf-250k", spec: { resolution: { targetCells: 250000 } }, magic: { enabled: true } }); const ms = Date.now() - t0;
console.log(`（25万セル: 地理＋先史 ${ms} ms / 集団 ${Object.keys(r.w?.civ.groups ?? {}).length}）`);
await check("25万セルの世界が 40 秒以内に作られ、段階は founding", () => { assert.ok(r.ok, r.errors?.join()); assert.ok(ms < 40000); assert.equal(r.w.civ.wcde.phase, "founding"); });
await check("文明候補が示され、農耕を持つ集団・集落がある", () => { const civ = r.w.civ; assert.ok(civ.wcde.candidates.length >= 1); assert.ok(Object.values(civ.groups).some((g) => g.subsistence === "agriculture")); assert.ok(Object.keys(civ.settlements).length > 0); });
await check("文明状態・WCDE の整合性を満たす", () => { assert.deepEqual(checkCivIntegrity(r.w.world, r.w.civ, { sinceEvent: 0, structure: true }), []); assert.deepEqual(checkWcdeIntegrity(r.w.world, r.w.civ), []); });
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
