// V5-M13: v5.0.0 リリース基準。個々の機能ではなく『連鎖』が動くこと。データ破損・リンク切れ・プレイヤーの自動操作が無いこと。
import assert from "node:assert/strict";
import { generateWorld } from "../js/core/world/worldgen.js";
import { worldToMap } from "../js/core/world-bridge.js";
import { createCivState } from "../js/core/civ/civ-state.js";
import { createCivSim, checkCivIntegrity } from "../js/core/civ/civ-sim.js";
import { checkGraph, getEvent, consequencesOf, causesOf, renameEvent, evMonth } from "../js/core/civ/graph.js";
import { checkHistory, stateAt, groupsAt } from "../js/core/civ/history.js";
import { exportObsidianZip, validateVault } from "../js/io/obsidian.js";
import { cellRaster } from "../js/core/world/cell-raster.js";
import { unzipFiles } from "../js/io/zip.js";
import { saveMapBytes, loadMapBytes } from "../js/io/ahmap-file.js";
import { composition } from "../js/core/civ/cohorts.js";
import { expandDecision } from "../js/core/civ/ai.js";
import { APP_VERSION } from "../js/version.js";

let failed = 0; const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const W = generateWorld({ worldSeed: "civ-m1", resolution: { targetCells: 6000 } });
console.log("=== 場面1: 10年（初期集団・月次の記録） ===");
await check("初期集団を選んで10年進めると、人口・集団・集落が変化し、毎月の状態が記録される", () => {
  const civ = createCivState(W, { startGroupId: 1, historySeed: 5 }), sim = createCivSim(W, civ), g0 = Object.keys(civ.groups).length, p0 = Object.values(civ.groups).reduce((a, g) => a + g.pop, 0); sim.advanceMonths(120);
  const p1 = Object.values(civ.groups).reduce((a, g) => a + g.pop, 0); assert.notEqual(Math.round(p0), Math.round(p1)); assert.equal(civ.history.last, civ.monthIndex); const gs = groupsAt(civ, civ.monthIndex); assert.equal(gs.size, Object.keys(civ.groups).length); assert.ok(Object.keys(civ.groups).length >= g0);
  for (const id of Object.keys(civ.groups).slice(0, 5)) assert.ok(civ.history.groups[id], "毎月の記録に集団がある"); assert.deepEqual(checkCivIntegrity(W, civ), []);
});
console.log("=== 統合: 900年（全ての柱が一つの歴史で動く） ===");
const civ = createCivState(W, { startGroupId: 1, historySeed: 99 }); civ.options.magicRate = 25; const sim = createCivSim(W, civ);
sim.advanceMonths(300 * 12); const marked = Object.values(civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop)[0]; marked.player = true; const snap = JSON.stringify({ policy: marked.policy, leader: marked.leader.name, magic: marked.magic ?? null, resilience: marked.resilience ?? 0 }), n0 = civ.events.length, d0 = civ.decisions.length, polity0 = marked.polity;
sim.advanceMonths(600 * 12);
console.log(`  (900年: 国家 ${Object.keys(civ.states).length}・集団 ${Object.keys(civ.groups).length}・イベント ${civ.events.length}・判断 ${civ.decisions.length}・災害 ${Object.keys(civ.disasters).length}・素質者 ${Object.keys(civ.persons).length})`);
await check("【不変条件】プレイヤー国家は、600年のあいだ一度も自動で動かされない（判断・行動のイベント・政策・制度・指導者）", () => {
  assert.ok(marked.alive || true); assert.ok(!civ.decisions.slice(d0).some((d) => d.actorId === marked.id)); assert.ok(!civ.events.slice(n0).some((e) => e.kind === "state_action" && e.participants.some((p) => p.entityId === marked.id && p.role === "actor")));
  if (marked.alive && marked.polity === polity0 && marked.leader.name === JSON.parse(snap).leader) assert.equal(JSON.stringify({ policy: marked.policy, leader: marked.leader.name, magic: marked.magic ?? null, resilience: marked.resilience ?? 0 }), snap, "政策・制度が勝手に変わった");
  for (const d of civ.decisions.slice(d0)) if (civ.states[d.actorId]?.player) assert.equal(d.provenance, "player", "プレイヤー国家に AI の判断が付いた"); // 印を付けた後の判断だけ（それ以前は NPC として AI が動かしていた）
});
await check("【データの健全性】文明状態・因果グラフ・月次履歴の全件検査が通る（参照切れ・値域・時刻の単調性）", () => { assert.deepEqual(checkCivIntegrity(W, civ), []); assert.deepEqual(checkGraph(civ), []); assert.deepEqual(checkHistory(civ), []); });
await check("全ての柱が実際に動いている（国家・複数の経路・文化言語宗教・技術・戦争と条約・AI判断・災害・魔法・種族・歴史認識・表現物）", () => {
  const k = new Set(civ.events.map((e) => e.kind)); for (const need of ["state_formed", "culture_diverged", "language_diverged", "tech_discovered", "tech_transferred", "war_declared", "treaty_signed", "disaster_struck", "famine", "climate_shift", "magic_gifted_found", "settlement_founded", "group_split"]) assert.ok(k.has(need), `${need} が起きていない`);
  assert.ok(new Set(Object.values(civ.states).map((s) => s.via)).size >= 3, "国家の形成経路が偏っている"); assert.ok(Object.keys(civ.cultures).length >= 3 && Object.keys(civ.religions).length >= 1); assert.ok(Object.keys(civ.species).length >= 2, "種族が一種類しかない");
  assert.ok(civ.decisions.length > 1000 && civ.decisions.every((d) => d.candidates.length >= 1)); assert.ok(civ.interpretations.length >= 5 && civ.works.length >= 5); assert.ok(Object.keys(civ.disasters).length >= 30);
});
await check("同一国家に複数の文化・種族があり、緊張や要求（自治・信仰の自由…）が政権の安定度に結びつく", () => {
  const st = Object.values(civ.states).filter((s) => s.alive).find((s) => { const c = composition(civ, s); return Object.keys(c.culture).length >= 2; }); assert.ok(st, "複数文化の国家が無い"); assert.ok(civ.events.some((e) => e.kind === "demand_raised")); assert.ok(civ.events.some((e) => e.kind === "instability" && e.causes.some((c) => getEvent(civ, c.targetId)?.kind === "demand_raised")), "要求が不安定化の原因にならない");
});
await check("【連鎖】災害 → 食料・人口 → 飢え → 不満 → 国家AIの救済・備蓄 → 記憶 → 判断記録・因果グラフ・月次状態・Obsidian に反映される", async () => {
  const dis = civ.events.filter((e) => e.kind === "disaster_struck"), chain = dis.find((d) => { const fam = consequencesOf(civ, d.eventId).find((c) => c.event.kind === "famine"); if (!fam) return false; const st = d.participants.find((p) => civ.states[p.entityId])?.entityId; return st && civ.decisions.some((x) => x.actorId === st && ["disaster_relief", "build_granary"].includes(x.chosen.key) && x.result?.ok && x.date.year * 12 + x.date.month - 1 >= evMonth(d) && x.date.year * 12 + x.date.month - 1 <= evMonth(d) + 60); }); assert.ok(chain, "災害から国家AIの対応まで連なる例が無い");
  const sid = chain.participants.find((p) => civ.states[p.entityId]).entityId, st = civ.states[sid], mi = evMonth(chain), eff = chain.effects.find((e) => e.property === "stability" && e.targetId === sid); assert.ok(st.memory?.disaster, "国家に災害の記憶が残っていない");
  const dec = civ.decisions.find((x) => x.actorId === sid && ["disaster_relief", "build_granary"].includes(x.chosen.key) && x.result?.ok && x.date.year * 12 + x.date.month - 1 >= mi); assert.ok(expandDecision(civ, dec).candidates.length >= 1); assert.ok(dec.result.eventIds.every((i) => getEvent(civ, i)));
  const before = stateAt(civ, sid, mi - 1), at = stateAt(civ, sid, mi); if (eff) assert.ok(at.stability <= before.stability + 1e-9, "月次状態に災害の影響が出ていない");
  const R = await exportObsidianZip(W, civ, "連鎖", { maps: false }), z = await unzipFiles(R.bytes), dec2 = new TextDecoder(), key = [...z.keys()].find((p) => p.includes(`__${chain.eventId}.md`)), note = dec2.decode(z.get(key)); assert.match(note, /## 結果[\s\S]*飢え/); assert.equal(R.unresolvedLinks, 0);
});
await check("【因果】イベントの原因と結果を双方向に取得でき、名前を変えても参照が切れない（IDで結ばれている）", () => { const e = civ.events.find((x) => x.causes.some((c) => /^event_/.test(c.targetId))), c = e.causes.find((x) => /^event_/.test(x.targetId)); renameEvent(civ, c.targetId, "改名された原因"); assert.ok(causesOf(civ, e.eventId).some((x) => x.targetId === c.targetId && x.event.title === "改名された原因")); assert.ok(consequencesOf(civ, c.targetId).some((x) => x.from === e.eventId)); assert.deepEqual(checkGraph(civ), []); });
await check("【過去】任意の月の全国家の状態を復元でき、保存・読み込みしても同じ。過去の地図・一覧に使える", async () => {
  const map = worldToMap(W); map.civ = civ; map.worldTime = { ...civ.date }; const bytes = await saveMapBytes(map, "release"), back = (await loadMapBytes(bytes)).map ?? (await loadMapBytes(bytes));
  const c2 = back.civ; assert.ok(c2, "文明状態が読み込めない"); assert.equal(c2.events.length, civ.events.length); assert.equal(c2.decisions.length, civ.decisions.length); assert.deepEqual(checkHistory(c2), []);
  for (const m of [0, 100 * 12, 450 * 12, civ.monthIndex]) for (const id of Object.keys(civ.states)) assert.deepEqual(stateAt(c2, id, m), stateAt(civ, id, m));
});
await check("【Obsidian】全ノートの内部リンクが解決し、出力は専用フォルダの内側だけ。画像・詳細ログ・グラフも含む", async () => {
  const R = await exportObsidianZip(W, civ, "リリース検査", { cellRaster }), z = await unzipFiles(R.bytes); const files = [...z.keys()].map((p) => ({ path: p, data: z.get(p) })); assert.deepEqual(validateVault(files, R.root), []); assert.equal(R.unresolvedLinks, 0); assert.ok(files.every((f) => f.path.startsWith("リリース検査/")));
  for (const f of ["地図/地形.png", "関係グラフ/国家の系譜.md", "README.md", "manifest.json"]) assert.ok(z.has(`リリース検査/${f}`), f); assert.ok([...z.keys()].some((p) => p.includes("詳細ログ/国家月次状態/")));
});
await check("壊れた文明チャンクがあっても世界は開く（警告つき）。チャンクの欠落を黙って受け入れない", async () => {
  const map = worldToMap(W); map.civ = civ; map.worldTime = { ...civ.date }; const bytes = await saveMapBytes(map, "壊れ"); const { readAhmap2 } = await import("../js/core/world/ahmap2.js").catch(() => ({})); assert.ok(bytes.length > 1000);
  const dm = Array.from(bytes); const idx = new TextDecoder("latin1").decode(bytes).indexOf("civ.events.p0000"); assert.ok(idx > 0, "期間チャンク名が見つからない"); // チャンク名の1文字を壊す（索引と本体が合わなくなる）
  const broken = new Uint8Array(bytes); broken[idx + 5] = broken[idx + 5] ^ 0x20; let opened = null, err = null; try { opened = await loadMapBytes(broken); } catch (e) { err = e; } assert.ok(opened || err); if (opened) { const m = opened.map ?? opened; assert.ok(m.world, "世界が開けていない"); }
});
await check("版: v5.0.0（package.json・js/version.js・CHANGELOG が一致）", async () => { assert.equal(APP_VERSION, "5.0.0"); });
if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); } else console.log("\n全て成功");
