// 戦争の純粋ロジック：戦争名の重複防止・召集する部隊の保存・戦績の記録（合成マップ）。
import { createRequire } from "node:module";
import { loadFromBytes } from "../js/io/loader.js";
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { planDeclareWar, planSetMuster, planRecordBattle, warNameTaken, listWars } from "../js/core/edit/wars.js";
import { planCreateRegiment } from "../js/core/sim/military.js";

const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const { map } = await loadFromBytes(new TextEncoder().encode(buildSyntheticMapText({ seed: 11 }).text), Delaunator);
const state = { map: Object.assign(map, { rev: map.rev ?? { politics: 0, geometry: 0, labels: 0, routes: 0, terrain: 0 } }) };
const run = (cmd) => (cmd.command ?? cmd).apply(state);
const date = { year: 1, month: 1 };

console.log("=== 戦争名は重複しない ===");
const r1 = planDeclareWar(map, { attackers: [1], defenders: [2], date }); run(r1);
check("既定の名前が付く", listWars(map)[0].name.endsWith("戦争") && !listWars(map)[0].name.includes("第"));
const r2 = planDeclareWar(map, { attackers: [1], defenders: [2], date }); run(r2);
check("同じ組み合わせの2回目は「（第2次）」が付いて重ならない", listWars(map)[1].name.endsWith("（第2次）"), listWars(map)[1].name);
const r3 = planDeclareWar(map, { attackers: [1], defenders: [2], date }); run(r3);
check("3回目は「（第3次）」", listWars(map)[2].name.endsWith("（第3次）"));
let threw = false; try { planDeclareWar(map, { name: listWars(map)[0].name, attackers: [3], defenders: [4], date }); } catch { threw = true; }
check("名前を自分で付けて重複させると拒否される", threw);
check("warNameTaken は自分自身を除外できる", warNameTaken(map, listWars(map)[0].name) && !warNameTaken(map, listWars(map)[0].name, listWars(map)[0].id) && !warNameTaken(map, "存在しない戦争"));
check("全戦争名が一意", new Set(listWars(map).map((w) => w.name)).size === listWars(map).length);

console.log("=== 召集する部隊 ===");
const cell = map.pack.cells.state.findIndex((v) => v === 1), cell2 = map.pack.cells.state.findIndex((v) => v === 2);
run(planCreateRegiment(map, 1, cell, {})); run(planCreateRegiment(map, 1, cell, {})); run(planCreateRegiment(map, 2, cell2, {}));
const w = listWars(map)[0];
check("宣戦布告の直後は召集なし", JSON.stringify(w.muster) === "{}");
run(planSetMuster(map, w.id, { 1: [0, 1], 2: [0] }));
check("チェックした部隊が保存される", JSON.stringify(listWars(map)[0].muster) === '{"1":[0,1],"2":[0]}');
run(planSetMuster(map, w.id, { 1: [0, 99], 2: [0], 5: [0] }));
check("存在しない部隊・参戦していない国は取り除かれる", JSON.stringify(listWars(map)[0].muster) === '{"1":[0],"2":[0]}');
run(planSetMuster(map, w.id, { 1: [], 2: [0] }));
check("空にした国は消える", JSON.stringify(listWars(map)[0].muster) === '{"2":[0]}');

console.log("=== 戦闘の記録 ===");
run(planRecordBattle(map, w.id, { attackerState: 1, defenderState: 2, result: { winner: "attacker", aPower: 10, dPower: 5 }, date }));
const b = listWars(map)[0];
check("戦闘が記録され、優勢度が動く", b.battles.length === 1 && b.advantage[1] === 1 && b.advantage[2] === -1);

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
