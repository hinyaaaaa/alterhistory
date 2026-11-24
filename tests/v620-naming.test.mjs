// v6.2.0: 史実らしい命名（国号・君主名・王朝・戦争名・戦場名）。
import assert from "node:assert/strict";
import { createNewWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { composeStateName, stateForm, retitle, leaderName, dynastyName, kanjiNum, baseOfState, baseOfLeader } from "../js/core/wcde/domains/naming.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 3).join(" | ")); } };

console.log("=== 国号 ===");
await check("政体が変わると称号が改まり、語根は保たれる。称号のない名前（創造主の命名）は改めない", () => {
  const st = { name: "アカロ王国", nameBase: "アカロ", polity: "kingdom", via: "agri_union" }; const r = retitle(st, "empire"); assert.deepEqual(r, { base: "アカロ", name: "アカロ帝国" }); assert.equal(retitle(st, "kingdom"), null);
  assert.equal(retitle({ name: "ローマ", nameBase: null, polity: "kingdom", via: "secession" }, "empire"), null); assert.equal(baseOfState({ name: "ベジ共和国" }), "ベジ");
});
console.log("=== 君主名・王朝 ===");
console.log("=== 世界での命名（500 か月）===");
const R = createNewWorld({ worldSeed: "naming-t1", spec: { resolution: { targetCells: 3000 } }, magic: { enabled: false } }); const w = R.w, civ = w.civ;
dispatch(w, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 500 }).ok);
const sts = Object.values(civ.states);
await check("戦争に名前が付き、重複しない", () => { const ws = Object.values(civ.wars); if (!ws.length) return; const names = ws.map((x) => x.name); assert.ok(names.every((n) => /戦争$/.test(n)), names.join()); assert.equal(new Set(names).size, names.length); });
await check("戦闘名は地形の呼び名などで区別され、『第n次』は乱発されない", () => { const used = Object.keys(civ.battleNames ?? {}), ord = used.filter((n) => /^第.次/.test(n)); assert.ok(ord.length <= Math.max(2, used.length * 0.02), `${ord.length}/${used.length}`); });
console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功"); process.exit(failed ? 1 : 0);
