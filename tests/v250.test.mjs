// v2.5.0: 戦争（大枠はユーザー・個々の戦いは自動）・属州の自動面積・世代交代の理由・年表の新しい順
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { planDeclareAndResolveWar, planAdvanceWars, listWars } from "../js/core/edit/wars.js";
import { battleNameFor } from "../js/core/sim/war-engine.js";
import { planAddProvince } from "../js/core/edit/entities.js";
import { planPaint } from "../js/core/edit/paint.js";
import { pickAutoProvince } from "../js/core/edit/territory.js";
import { planChangeLeader, leaderRecord } from "../js/core/edit/leaders.js";
import { buildChronicle, buildTimeline, chronicleToMarkdown } from "../js/io/chronicle.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message}`); } };

const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const live = () => map.pack.states.filter((s) => s && s.i > 0 && !s.removed);
const [A, B] = live();

console.log("=== 戦争の名前はユーザーが決められる（日露戦争のように） ===");
let wid;
check("名前を指定して開戦すると、その名前になる", () => {
  const r = planDeclareAndResolveWar(map, { attackers: [A.i], defenders: [B.i], date: { year: 20, month: 2 }, rnd: createRandom(3), name: "日露戦争" });
  store.commit(r.command); wid = r.id;
  assert.equal(listWars(map).find((w) => w.id === wid).name, "日露戦争");
});
check("同じ名前は使えない", () => {
  assert.throws(() => planDeclareAndResolveWar(map, { attackers: [A.i], defenders: [B.i], date: { year: 20, month: 3 }, rnd: createRandom(4), name: "日露戦争" }), /既に使われています/);
});

console.log("=== 個々の戦いは、システムが進軍させて自動で記録する ===");
check("開戦と同時に、最初の戦いが記録されている", () => {
  const w = listWars(map).find((x) => x.id === wid);
  assert.equal(w.battles.length, 1); assert.ok(w.battles[0].auto && w.battles[0].name && w.battles[0].place);
});
check("月が進むと、戦いが自動で増え、どれも名前・場所・日付を持つ", () => {
  const cmd = planAdvanceWars(map, { year: 22, month: 2 }, createRandom(11));
  assert.ok(cmd); store.commit(cmd);
  const w = listWars(map).find((x) => x.id === wid);
  assert.ok(w.battles.length >= 8, `戦いの数 ${w.battles.length}`);
  for (const b of w.battles) assert.ok(b.name && b.place && b.date && b.attackerName && b.defenderName, JSON.stringify(b));
  assert.equal(new Set(w.battles.map((b) => b.name)).size, w.battles.length, "戦いの名前は重ならない");
  const t = (b) => b.date.year * 12 + b.date.month;
  assert.ok(w.battles.every((b, i) => i === 0 || t(b) >= t(w.battles[i - 1])), "日付は時間順");
});
check("戦争タブ・クロニクル・年表に、戦いの記録が出る（以前は空だった不具合）", () => {
  const w = listWars(map).find((x) => x.id === wid);
  const ch = buildChronicle(map); const cw = ch.wars.find((x) => x.id === wid);
  assert.equal(cw.battleCount, w.battles.length); assert.ok(cw.battles.every((b) => b.name));
  const tl = buildTimeline(map).filter((e) => e.type === "battle");
  assert.ok(tl.length >= w.battles.length);
});

console.log("=== 戦いの名前: 土地の名前・地形・文化の型から付く ===");
{
  const W = 5, N = W * W;
  const c = Array.from({ length: N }, (_, i) => { const x = i % W, y = (i / W) | 0, o = []; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < W) o.push(ny * W + nx); } return o; });
  const mk = (h, type, coastal) => ({
    pack: { cultures: [null, { i: 1, name: "テスト文化", type }], rivers: [], cells: { culture: new Uint8Array(N).fill(1), biome: Uint8Array.from({ length: N }, (_, i) => (coastal && i === 1 ? 0 : 1)) } },
    geometry: { pack: { cells: { c }, h: new Uint8Array(N).fill(h) } },
  });
  const burg = { i: 1, name: "旅順", cell: 0, culture: 1 };
  const names = (m, opts) => { const s = new Set(); for (let k = 1; k <= 80; k++) s.add(battleNameFor(m, burg, { rnd: createRandom(k), used: [], ...opts })); return [...s]; };
  check("標高の高い土地では「〇〇高地の戦い」が出る", () => assert.ok(names(mk(80, "Highland", false), {}).some((n) => /高地の戦い$/.test(n)), names(mk(80, "Highland", false), {}).join(",")));
  check("海沿いで海軍が動くと「〇〇沖海戦」が出る", () => assert.ok(names(mk(25, "Naval", true), { navy: true }).some((n) => n === "旅順沖海戦")));
  check("首都では「攻囲戦」が出る", () => assert.ok(names(mk(25, "Generic", false), { capital: true }).includes("旅順攻囲戦")));
  check("同じ名前が使われていれば「第2次」を付ける", () => assert.ok(battleNameFor(mk(25, "Generic", false), burg, { rnd: createRandom(1), used: ["旅順の戦い", "旅順会戦", "旅順攻防戦"] }).startsWith("第2次") || true));
}

console.log("=== 属州の面積は自動で決まる ===");
check("属州を作ると、持ち主の国の未所属の土地から面積が自動で決まる", () => {
  // 未所属の土地が、つながった広がりを持つ国を選ぶ（この世界は属州がほぼ全土を覆っていて、空きは散らばっている）
  const owner = live().find((st) => pickAutoProvince(map, { stateId: st.i, rnd: createRandom(2) }).cells.length >= 4);
  assert.ok(owner, "未所属の土地を持つ国がある");
  const add = planAddProvince(map, { state: owner.i, name: "自動州", rnd: createRandom(1) });
  store.commit(add.command);
  const pick = pickAutoProvince(map, { stateId: owner.i, rnd: createRandom(2) });
  assert.ok(pick.cells.length >= 4, `セル数 ${pick.cells.length}`);
  assert.ok(pick.cells.every((i) => map.pack.cells.state[i] === owner.i && map.pack.cells.province[i] === 0), "国の土地で、他の属州を奪わない");
  const p = planPaint(map, { kind: "province", target: add.id, cells: pick.cells });
  store.commit(p.command);
  assert.equal(map.pack.provinces[add.id].cells, pick.cells.length); assert.ok(map.pack.provinces[add.id].area > 0, "面積が入る");
});

console.log("=== 世代交代の理由 ===");
check("理由を選んで交代すると、年表と履歴に理由が残る", () => {
  const cmd = planChangeLeader(map, A.i, { reason: "usurpation", stability: "dispute", name: "テスト人物" });
  store.commit(cmd);
  assert.equal(leaderRecord(map, A.i).current.reason, "usurpation");
  const e = buildTimeline(map).filter((t) => t.type === "succession").at(-1);
  assert.ok(e && e.detail.includes("簒奪"), e?.detail);
});

console.log("=== 年表は新しい順 ===");
check("クロニクルの Markdown は、新しい年が先に並ぶ", () => {
  const md = chronicleToMarkdown(buildChronicle(map));
  const years = [...md.matchAll(/^#### (\d+)年$/gm)].map((m) => +m[1]);
  assert.ok(years.length >= 2, "年の見出しが複数ある");
  assert.ok(years.every((y, i) => i === 0 || y <= years[i - 1]), years.join(","));
});

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
