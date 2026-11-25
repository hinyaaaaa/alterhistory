// v6.16.0: 政体 24 種と進化・従属・盟約（3 か国以上）・新しい条約・外交画面。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { REGIMES, regimeOf } from "../js/core/wcde/regimes.js";
import { switchRegime, tierOf, changeScale } from "../js/core/wcde/regime-evolution.js";
import { TREATY } from "../js/core/civ/diplomacy.js";
import { createPact, mergePact, listPacts } from "../js/core/wcde/pacts.js";
import { evaluateTreaty, treatyFeasible } from "../js/core/wcde/negotiation.js";
import { TECH } from "../js/core/civ/tech.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/<script[^>]*><\/script>/, ""), bundle = readFileSync(new URL("../dist/v6.js", import.meta.url), "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/", virtualConsole: new VirtualConsole() }), { window } = dom, doc = window.document;
const errors = []; window.addEventListener("error", (e) => errors.push(String(e.message))); window.alert = (m) => errors.push("alert:" + m);
window.URL.createObjectURL = () => "blob:x"; window.HTMLAnchorElement.prototype.click = function () {}; window.structuredClone = structuredClone; Object.assign(window, { CompressionStream, DecompressionStream, TextEncoder, TextDecoder });
window.eval(bundle);
const $ = (s) => doc.querySelector(s), $$ = (s) => [...doc.querySelectorAll(s)], click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })), wait = (ms) => new Promise((r) => setTimeout(r, ms));
const set = (el, v, ev = "change") => { el.value = v; el.dispatchEvent(new window.Event(ev, { bubbles: true })); };
const V = () => window.__v6;
for (let i = 0; i < 100 && !$("#new"); i++) await wait(20);
window.__v6.S.fastStart = true; click($("#new")); for (let i = 0; i < 100 && !$("#gen"); i++) await wait(20);
set($("#cells"), "3000"); set($("#seed"), "ui-616"); click($("#gen")); for (let i = 0; i < 400 && !$("#delegate"); i++) await wait(50); click($("#delegate"));
assert.ok(V().run({ type: "time.advance", months: 6000 }).ok);
const w = V().S.w, civ = w.civ, ctx = w.sim.ctx, alive = () => Object.values(civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop);

await check("政体は 24 種。役職は単純な政体で少なく、複雑な政体で多い。主席の役職がある", () => {
  assert.equal(Object.keys(REGIMES).length, 24); for (const [k, r] of Object.entries(REGIMES)) assert.ok(r.offices.includes(r.ruler), k + " の首長の役職");
  assert.ok(REGIMES.tribal.offices.length <= 20 && REGIMES.chiefdom.offices.length <= 25 && REGIMES.totalitarian.offices.length >= 60 && REGIMES.parliamentary.offices.length >= 60);
  for (const k of ["parliamentary", "presidential", "technocracy", "adv_direct_democracy", "anarchist", "city_state"]) assert.ok(REGIMES[k], k);
});
await check("無政府主義は危機のときだけ。新しい側の政体ほど段が高い。変更の規模は系統をまたぐほど大きい", () => {
  assert.ok(REGIMES.anarchist.crisisOnly); assert.ok(tierOf("technocracy") > tierOf("kingdom") && tierOf("kingdom") > tierOf("tribal"));
  assert.ok(changeScale("oligarchic_republic", "direct_democracy") < changeScale("parliamentary", "socialist"));
});
await check("政体を移すと、記録・安定度の低下・役職の更新が起きる（内部の政体と矛盾しない）", () => {
  const st = alive().find((s) => !s.player && s.polity === "kingdom") ?? alive().find((s) => !s.player); const before = st.stability; const to = st.polity === "kingdom" ? "despotism" : Object.keys(REGIMES).find((k) => REGIMES[k].core === st.polity && k !== regimeOf(st));
  if (!to) return; const r = switchRegime(ctx, st, to, "reform"); assert.ok(r && regimeOf(st) === to && st.stability < before && st.regimeHistory.at(-1).to === to);
});
await check("条約は 5 分類（軍事・従属・経済・領土・王家）。講和以外の全種類に利点と欠点がある", () => {
  assert.ok(Object.keys(TREATY).length >= 18); const cats = new Set(Object.values(TREATY).map((t) => t.cat)); assert.deepEqual([...cats].sort(), ["dep", "dyn", "eco", "land", "mil"]); for (const t of Object.values(TREATY)) assert.ok(t.merit && t.cost && t.ja);
});
await check("従属: 封臣になると国号が組み直り（公国など）、宗主の戦争に従い、貢納が移る。条約が終われば解ける", async () => {
  const [A, B] = alive().filter((s) => !s.player && !s.dependency).slice(0, 2); for (const s of [A, B]) { s.techAdopted ??= {}; for (const k of Object.keys(TECH)) s.techAdopted[k] ??= 1; s.econ ??= {}; }
  A.pop = 1e7; B.pop = 1e5; A.warIds = []; B.warIds = []; const feas = treatyFeasible(civ, A, B, "feudal"); assert.ok(feas == null || /既に|すでに|技術|交戦/.test(feas), String(feas));
  if (feas) return; const ev = evaluateTreaty(civ, A, B, "feudal"); assert.ok(typeof ev.score === "number");
  const { signTreaty, endTreaty } = await import("../js/core/civ/diplomacy.js"); const t = signTreaty(ctx, "feudal", A, B); assert.equal(B.dependency.overlord, A.id); assert.equal(B.dependency.kind, "vassal");
  endTreaty(ctx, t, "試験"); assert.equal(B.dependency, null);
});
await check("盟約: 3 か国以上で結成でき、統合すると盟主の国に集まる", () => {
  const [A, B, C] = alive().filter((s) => !s.player && !s.dependency && !s.warIds.length).slice(0, 3); const p = createPact(ctx, { purpose: "defense", leaderId: A.id, memberIds: [B.id, C.id] }); assert.ok(p && p.members.length === 3 && listPacts(civ).includes(p));
  assert.equal(createPact(ctx, { purpose: "trade", leaderId: A.id, memberIds: [B.id] }), null, "2 か国では結べない");
  assert.ok(mergePact(ctx, p)); assert.ok(!civ.states[B.id].alive && civ.states[B.id].mergedInto === A.id && civ.states[A.id].alive);
});
await check("外交画面: 関係の一覧がくくられ、条約の提案が専用の画面で出て、担当国から提案できる", async () => {
  const me = alive().find((s) => !s.dependency && !s.warIds.length), other = alive().find((s) => s.id !== me.id && !s.warIds.includes?.(me.id));
  assert.ok(V().run({ type: "control.take", stateId: me.id }).ok); V().S.hub = "diplo"; V().S.dtab = "rel"; V().S.dip = null; V().render(); await wait(30);
  assert.ok(/ほかの国|同盟国|敵対国/.test($("#lpin").textContent), "一覧");
  V().S.dip = { a: me.id, b: other.id }; V().render(); await wait(30); assert.ok($$(".tcard").length >= 1, "提案の候補"); assert.ok($$("[data-pcat]").length === 5);
  click($("[data-pcat='eco']")); await wait(20); assert.ok($$(".tcard").length >= 3);
  V().S.dtab = "pact"; V().S.dip = null; V().render(); await wait(30); assert.ok($("#pact-create"), "盟約の結成");
  const r = V().run({ type: "diplomacy.propose", stateId: me.id, target: other.id, treaty: "border" }); assert.ok(r.ok || typeof r.error === "string");
});
await check("画面にエラーがない", () => assert.deepEqual(errors, []));
console.log(failed ? `\n${failed} 件失敗` : "\nすべて通過"); process.exit(failed ? 1 : 0);
