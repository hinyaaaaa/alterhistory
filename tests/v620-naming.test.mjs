// v6.2.0: 史実らしい命名（国号・君主名・王朝・戦争名・戦場名）。
import assert from "node:assert/strict";
import { createNewWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { composeStateName, stateForm, retitle, leaderName, dynastyName, kanjiNum, baseOfState, baseOfLeader } from "../js/core/wcde/domains/naming.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 3).join(" | ")); } };

console.log("=== 国号 ===");
await check("政体ごとの称号", () => { assert.equal(composeStateName("アカロ", "kingdom"), "アカロ王国"); assert.equal(composeStateName("アカロ", "empire"), "アカロ帝国"); assert.equal(composeStateName("アカロ", "republic"), "アカロ共和国"); assert.equal(stateForm("tribal", "nomad_confederation"), "部族連合"); assert.equal(stateForm("chiefdom", "city_state"), "市国"); });
await check("政体が変わると称号が改まり、語根は保たれる。称号のない名前（創造主の命名）は改めない", () => {
  const st = { name: "アカロ王国", nameBase: "アカロ", polity: "kingdom", via: "agri_union" }; const r = retitle(st, "empire"); assert.deepEqual(r, { base: "アカロ", name: "アカロ帝国" }); assert.equal(retitle(st, "kingdom"), null);
  assert.equal(retitle({ name: "ローマ", nameBase: null, polity: "kingdom", via: "secession" }, "empire"), null); assert.equal(baseOfState({ name: "ベジ共和国" }), "ベジ");
});
console.log("=== 君主名・王朝 ===");
await check("世襲の政体は〇〇1世・2世。祖先の名を継ぐと世数が進む。部族・共和制は世数なし", () => {
  const st = { polity: "kingdom" }, r = () => 0.99; assert.equal(leaderName(st, "アカロ", r), "アカロ1世"); assert.equal(leaderName(st, "ベジ", r), "ベジ1世");
  const rr = (() => { const v = [0.1, 0.0]; let i = 0; return () => v[i++ % 2]; })(); assert.equal(leaderName(st, "ゾゾ", rr), "アカロ2世");
  assert.equal(leaderName({ polity: "tribal" }, "アカロ3世", r), "アカロ"); assert.equal(baseOfLeader("アカロ12世"), "アカロ");
});
await check("王朝は国ごとの通し番号（第二王朝）。部族は氏族", () => { assert.equal(dynastyName("kingdom", 2), "第二王朝"); assert.equal(dynastyName("chiefdom", 1), "第一首長家"); assert.equal(dynastyName("republic", 3), "第三政権"); assert.equal(dynastyName("tribal", 4, "ヒジ2世"), "ヒジ氏"); assert.equal(kanjiNum(12), "十二"); });

console.log("=== 世界での命名（500 か月）===");
const R = createNewWorld({ worldSeed: "naming-t1", spec: { resolution: { targetCells: 3000 } }, magic: { enabled: false } }); const w = R.w, civ = w.civ;
dispatch(w, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 500 }).ok);
const sts = Object.values(civ.states);
await check("国号は語根＋称号で、世襲の君主は「〇〇n世」", () => {
  assert.ok(sts.length > 0); for (const s of sts) { if (s.nameBase) { assert.ok(s.name.startsWith(s.nameBase), s.name); assert.equal(s.name, composeStateName(s.nameBase, s.polity, s.via), `${s.name}/${s.polity}`); } /* プレイヤーが名付けた国は語根を持たない */ }
  /* 政体が途中で世襲制に変わった国は、次の代替わりまで素の名前のまま。大多数が「〇〇n世」であればよい */
  const hered = sts.filter((s) => s.alive && ["chiefdom", "kingdom", "empire", "theocracy"].includes(s.polity)), num = hered.filter((s) => /[0-9]+世$/.test(s.leader.name)); assert.ok(hered.length > 0 && num.length / hered.length >= 0.6, `${num.length}/${hered.length}`);
});
await check("家系は『第n…』か氏族の名。君主の人物名と国家の表示が一致", () => { for (const h of Object.values(civ.houses ?? {})) assert.match(h.name, /^第.+(王朝|首長家|教統|政権)$|氏$/, h.name); for (const s of sts.filter((x) => x.alive)) assert.equal(civ.figures[s.leaderFigureId]?.name, s.leader.name); });
await check("戦争に名前が付き、重複しない", () => { const ws = Object.values(civ.wars); if (!ws.length) return; const names = ws.map((x) => x.name); assert.ok(names.every((n) => /戦争$/.test(n)), names.join()); assert.equal(new Set(names).size, names.length); });
await check("戦闘名は地形の呼び名などで区別され、『第n次』は乱発されない", () => { const used = Object.keys(civ.battleNames ?? {}), ord = used.filter((n) => /^第.次/.test(n)); assert.ok(ord.length <= Math.max(2, used.length * 0.02), `${ord.length}/${used.length}`); });
console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功"); process.exit(failed ? 1 : 0);
