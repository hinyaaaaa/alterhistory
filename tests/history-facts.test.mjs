// 歴史の記録は「当時の事実」で保存する：国名と戦力。改名・消滅のあとも、年表は当時の名前を書く。
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { planDeclareWar, planDeclareAndResolveWar, planRecordBattle, planSignTreaty, planReevaluateWars, listWars } from "../js/core/edit/wars.js";
import { planCreateAlliance } from "../js/core/edit/alliances.js";
import { planSetDiplomacy } from "../js/core/edit/diplomacy.js";
import { setProps, makeCommand } from "../js/core/edit/commands.js";
import { buildChronicle, buildTimeline } from "../js/io/chronicle.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message}`); } };

const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const live = () => map.pack.states.filter((s) => s && s.i > 0 && !s.removed);
const [A, B, C] = live();
const d1 = { year: 5, month: 3 };
const rnd = createRandom(9);

console.log("=== 保存される名前と戦力 ===");
let warId, instantId;
check("宣戦布告で、開戦時の国名が保存される", () => {
  const r = planDeclareWar(map, { name: "名前保存戦争", attackers: [A.i], defenders: [B.i], date: d1 });
  store.commit(r.command); warId = r.id;
  const w = listWars(map).find((x) => x.id === warId);
  assert.equal(w.names[A.i], A.fullName ?? A.name);
  assert.equal(w.names[B.i], B.fullName ?? B.name);
});
check("戦闘の記録に、両軍の戦力と当時の国名が残る", () => {
  store.commit(planRecordBattle(map, warId, { attackerState: A.i, defenderState: B.i, result: { winner: "attacker", aPower: 120, dPower: 80 }, date: d1 }));
  const b = listWars(map).find((x) => x.id === warId).battles.at(-1);
  assert.equal(b.aPower, 120); assert.equal(b.dPower, 80);
  assert.equal(b.attackerName, A.fullName ?? A.name); assert.equal(b.defenderName, B.fullName ?? B.name);
});
check("戦争開始（即時判定）で作られる戦闘ログにも、戦力と当時の国名が入る", () => {
  const r = planDeclareAndResolveWar(map, { attackers: [A.i], defenders: [C.i], date: d1, rnd });
  assert.ok(r.battles.length > 0);
  for (const b of r.battles) { assert.ok(Number.isFinite(b.aPower) && Number.isFinite(b.dPower), "戦力"); assert.ok(b.attackerName && b.defenderName, "国名"); }
  store.commit(r.command); instantId = r.id;
  assert.ok(listWars(map).find((x) => x.id === r.id).names[C.i]);
});
check("同盟と外交の記録にも、当時の国名が残る", () => {
  const al = planCreateAlliance(map, "名前保存同盟", [A.i, B.i], d1); store.commit(al.command);
  assert.equal(listWars(map) && map.ext.data.alliances.at(-1).memberNames[A.i], A.fullName ?? A.name);
  const dip = planSetDiplomacy(map, A.i, C.i, "Friendly", d1); if (dip) store.commit(dip);
  const last = map.ext.data.diplomacyLog?.at(-1); if (dip) assert.equal(last.aName, A.fullName ?? A.name);
});
check("講和条約にも、当時の国名が残る", () => {
  const cmd = planSignTreaty(map, warId, { kind: "white", treatyName: "名前保存条約" }, { year: 6, month: 1 }, { enforceBudget: false });
  store.commit(cmd);
  assert.equal(listWars(map).find((x) => x.id === warId).terms.names[B.i], B.fullName ?? B.name);
});


console.log("=== 想定の戦闘ログと、実際の戦闘は別 ===");
check("開戦時の戦闘ログは forecast に入り、実際の戦闘（battles）は空から始まる", () => {
  const w = listWars(map).find((x) => x.id === instantId);
  assert.ok(w.forecast.length > 0, "想定の戦闘ログがある"); assert.deepEqual(w.battles, [], "実際の戦闘はまだ無い");
});
check("実際の戦闘を記録しても、想定の戦闘ログは増えず、battles だけに足される", () => {
  const before = listWars(map).find((x) => x.id === instantId).forecast.length;
  store.commit(planRecordBattle(map, instantId, { attackerState: A.i, defenderState: C.i, result: { winner: "defender", aPower: 10, dPower: 20 }, date: { year: 7, month: 7 } }));
  const w = listWars(map).find((x) => x.id === instantId);
  assert.equal(w.forecast.length, before); assert.equal(w.battles.length, 1);
});
check("年表では、想定の戦闘と実際の戦闘が別の種類で載る", () => {
  const tl = buildTimeline(map);
  assert.ok(tl.some((e) => e.type === "battle-forecast"), "想定");
  assert.ok(tl.some((e) => e.type === "battle" && e.detail.includes("戦力 10 対 20")), "実戦");
  const c = buildChronicle(map); const w = c.wars.find((x) => x.id === instantId);
  assert.ok(w.forecast.length > 0 && w.battleCount === 1 && w.forecast[0].note.includes("想定"));
});
check("再判定の理由は、戦闘ではなく戦争の出来事として残る", () => {
  const p = planReevaluateWars(map, [A.i, C.i], "☢ テスト作戦：2発が使用された", { year: 8, month: 1 });
  if (!p) return; // 判定が変わらない構成ならスキップ
  const before = listWars(map).find((x) => x.id === instantId).battles.length;
  store.commit(makeCommand("再判定", [], [p]));
  const w = listWars(map).find((x) => x.id === instantId);
  assert.equal(w.battles.length, before); assert.ok(w.events.some((e) => e.kind === "reevaluate" && e.text.includes("☢")));
});

console.log("=== 改名のあとも、年表は当時の名前を書く ===");
const oldA = A.fullName ?? A.name, oldB = B.fullName ?? B.name;
store.commit(makeCommand("改名", [], [setProps(A, { name: "全く別の新名称", fullName: "全く別の新名称" }), setProps(B, { name: "別の新名称B", fullName: "別の新名称B" })]));
const text = JSON.stringify(buildChronicle(map));
check("開戦・戦闘・同盟の記述が、改名前の名前のまま", () => {
  assert.ok(text.includes(oldA), "改名前の名前が残る");
  assert.ok(text.includes(oldB));
});
check("戦闘の戦力が年表に出る", () => assert.ok(text.includes("戦力 120 対 80") || text.includes('"attackerPower":120')));

console.log("=== 古い保存（名前なし）も読める ===");
check("names/aPower が無い戦争でもクロニクルを作れる", () => {
  const ws = listWars(map).map((w) => { const { names, ...rest } = w; return { ...rest, battles: (w.battles ?? []).map(({ attackerName, defenderName, aPower, dPower, ...b }) => b) }; });
  map.ext.data.wars = ws;
  const c = buildChronicle(map); assert.ok(c.wars.length >= 1);
});

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
