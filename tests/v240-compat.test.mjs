// v2.4.1 A8: v2.4.0 で保存した .ahmap（tests/fixtures/v2.4.0-world.ahmap）を、いまの版で開いても壊れない。
//   fixture は v2.4.0 のコードで作った（総力戦の進行中の戦争・同盟・保護国・軍事/技術ドクトリン・指導者つき）。
//   v2.4.1 で足したデータ（戦争の burden など）は任意項目なので、無くても読め、月が進むと現れる。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import { loadFromBytes } from "./helpers/legacy/loader.js";
import { serializeNativeJson } from "./helpers/legacy/native-map.js";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { listWars, planAdvanceWars } from "../js/core/edit/wars.js";
import { nationStability } from "../js/core/edit/stability.js";
import { planSetNuclearStock, nuclearStock } from "../js/core/sim/nuclear.js";
import { doctrineCapped, effectiveDoctrineKey } from "../js/core/edit/doctrines.js";
import { validateMap } from "../js/core/model.js";
import { treatyStatus, listTreaties } from "../js/core/edit/treaties.js";

const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
const bytes = fs.readFileSync(new URL("./fixtures/v2.4.0-world.ahmap", import.meta.url));
let failed = 0;
const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message}`); } };

console.log("=== v2.4.0 の保存データを読む ===");
const loaded = await loadFromBytes(new Uint8Array(bytes), Delaunator);
const map = loaded.map;
await check("開ける（地図が返る）", () => assert.ok(map?.pack?.states?.length > 3));
await check("読み込みの検査で、構造の問題が出ない", () => assert.deepEqual(validateMap(map), []));
await check("警告に、読めなかったという内容が無い", () => assert.ok(!loaded.warnings.some((w) => /読めません|壊れ|失敗/.test(w)), loaded.warnings.join("\n")));
const wars = listWars(map);
await check("戦争3件（終戦2・進行中2…）がそのまま残る", () => assert.equal(wars.length, 3));
const total = wars.find((w) => w.type === "total");
await check("v2.4.0 の総力戦: 形態・経過月数・結果が残り、burden はまだ無い", () => { assert.ok(total && !total.endedAt); assert.equal(total.monthsDone, 5); assert.ok(total.result?.winner); assert.equal(total.burden, undefined); });
await check("v2.4.0 より前の形の戦争（type なし）も読める", () => assert.ok(wars.some((w) => w.type === undefined)));
await check("条約・同盟・指導者・保護国が残る", () => { assert.ok(listTreaties(map).some((t) => t.name === "テスト同盟" && treatyStatus(t, map.worldTime) === "active"), "同盟が残る"); assert.ok(listTreaties(map).some((t) => t.kind === "vassal"), "旧形式の従属・講和も条約として読める（読み込み時の移行）"); assert.ok(Object.keys(map.ext.data.leaders).length >= 5); assert.ok(map.pack.states.some((s) => s?.vassal?.kind === "protectorate")); });

console.log("=== v2.4.1 の機能が、旧データの上で動く ===");
const live = map.pack.states.filter((s) => s && s.i > 0 && !s.removed);
await check("安定度が、全ての国で計算できる（安定・不安・危機のどれか）", () => { for (const s of live) assert.ok(["stable", "uneasy", "crisis"].includes(nationStability(map, s).key)); });
await check("ドクトリンの上限の計算が、旧データの国でも動く", () => { for (const s of live) { effectiveDoctrineKey(s); assert.ok(Array.isArray(doctrineCapped(s))); } });
const store = createStore({ map });
await check("核の保有数を設定できる（旧データの部隊でも、部隊が無い国でも）", () => {
  const withRegs = live.find((s) => (s.military ?? []).length), without = live.find((s) => !(s.military ?? []).length);
  store.commit(planSetNuclearStock(store.getState().map, withRegs.i, 4)); assert.equal(nuclearStock(store.getState().map.pack.states[withRegs.i]), 4);
  if (without) { const m = store.getState().map; const cap = m.pack.burgs[without.capital]; if (cap && !cap.removed) { store.commit(planSetNuclearStock(m, without.i, 2)); assert.equal(nuclearStock(store.getState().map.pack.states[without.i]), 2); } }
});
await check("月を進めると、進行中の戦争に国ごとの負荷（burden）が記録される", () => {
  const warStates = [...total.attackers, ...total.defenders]; const tBefore = Object.fromEntries(warStates.map((i) => [i, store.getState().map.pack.states[i].treasury ?? 0]));
  const rnd = createRandom(9); const before = JSON.stringify(listWars(store.getState().map).find((w) => w.id === total.id).burden ?? null);
  for (let k = 1; k <= 4; k++) { const c = planAdvanceWars(store.getState().map, { year: 40, month: 8 + k }, rnd); if (c) store.commit(c); }
  const w = listWars(store.getState().map).find((x) => x.id === total.id);
  assert.equal(before, "null"); assert.ok(w.burden && Object.keys(w.burden).length >= 2, "burden が付く"); for (const b of Object.values(w.burden)) { assert.ok(b.months >= 1 && b.treasury >= 0 && b.industry >= 0); }
  for (const i of warStates) assert.ok((store.getState().map.pack.states[i].treasury ?? 0) >= Math.min(0, tBefore[i]), `戦争で国庫が0未満へ落ちない（国${i}）`);
});
await check("保存し直して読み直しても、戦争・条約・指導者が変わらない（往復）", async () => {
  const text = serializeNativeJson(store.getState().map);
  const again = await loadFromBytes(new TextEncoder().encode(text), Delaunator);
  assert.equal(listWars(again.map).length, 3); assert.equal(listTreaties(again.map).length, listTreaties(store.getState().map).length);
  assert.ok(listWars(again.map).find((w) => w.id === total.id).burden, "burden も保存される");
  assert.deepEqual(validateMap(again.map), []);
});
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
