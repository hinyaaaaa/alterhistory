// v6.21.0: 出来事の舞台・事件名・整理／暗殺・政変のあとの後継の選び直し／役職の名前と効果の意味づけ／国策の題名と数
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { EVENTS, EVENT_BY_ID } from "../js/core/wcde/events-data.js";
import { varOf } from "../js/core/wcde/event-variety.js";
import { DECISION_HOOKS } from "../js/core/wcde/decisions.js";
import { pendingOf, decisionsOf } from "../js/core/wcde/decision-state.js";
import { REGIMES, OFFICES, officeInfo, DEBUFF_JA } from "../js/core/wcde/regimes.js";
import { POLICIES } from "../js/core/wcde/policies.js";
import { TREE } from "../js/core/civ/techtree.js";
import { APP_VERSION } from "../js/version.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const { w: w0 } = createNewWorld({ worldSeed: "v621-1", spec: { resolution: { targetCells: 4000 } }, magic: { enabled: false } });
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 400 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const alive = (w) => Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop);
const own = (w, k = 0) => { const s = alive(w)[k]; assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: s.id }).ok); return s; };

console.log("=== 出来事の整理 ===");
await check("どうでもよい出来事を減らした（240 → 190 未満）。消した出来事は、連鎖の行き先にもない", () => {
  assert.ok(EVENTS.length < 190 && EVENTS.length > 150, String(EVENTS.length));
  for (const e of EVENTS) for (const c of e.ch) assert.ok(EVENT_BY_ID[c.id], `${e.id} → ${c.id}`);
  for (const id of ["court_poet", "twin_suns", "sports_festival", "heat_wave", "protest_note"]) assert.ok(!EVENT_BY_ID[id], id);
});
await check("暗殺・急死は、どの選択肢でも（何もしなくても）指導者が代わる", () => {
  for (const id of ["dictator_assassination", "king_sudden_death"]) { const e = EVENT_BY_ID[id], n = e.opts.length; for (let i = 0; i <= n; i++) assert.match(e.x?.[i] ?? "", /^ldr:(assn|die)$/, `${id} ${i}`); }
});

console.log("=== 場所・人物・事件名 ===");
await check("舞台は決定的で、月がちがえば場所や人物もちがう。事件名は固有の名前になる", () => {
  const w = fresh(), st = own(w), ctx = w.sim.ctx, ev = EVENT_BY_ID.peasant_revolt;
  const a = varOf(ctx, st, ev), b = varOf(ctx, st, ev); assert.deepEqual(a, b);
  const places = new Set(), people = new Set(), inc = new Set();
  for (let m = 0; m < 48; m++) { ctx.civ.monthIndex += 1; const v = varOf(ctx, st, ev); places.add(v.place); people.add(v.person); inc.add(v.incident.replaceAll("{place}", v.place).replaceAll("{person}", v.person)); }
  assert.ok(people.size >= 20, `人物 ${people.size}`); assert.ok(inc.size >= 20, `事件名 ${inc.size}`); assert.ok(places.size >= 2, `場所 ${places.size}`);
  for (const p of people) assert.ok(p && !p.includes("undefined"));
});
await check("すべての出来事に、事件名と場面の一文がある", () => {
  const w = fresh(), st = own(w), ctx = w.sim.ctx;
  for (const ev of EVENTS) { const v = varOf(ctx, st, ev); assert.ok(v.incident.length >= 3 && v.scene.length >= 8, ev.id); assert.ok(!/undefined|null/.test(v.place + v.person + v.person2), ev.id); }
});
await check("歴史を進めると、出来事の記録は「事件名」で残り、同じ名前の繰り返しが少ない", () => {
  const w = fresh(); dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 1800 }); const ev = w.civ.events.filter((e) => e.kind === "event_occurred");
  assert.ok(ev.length >= 4, `${ev.length} 件`); const names = ev.map((e) => /「(.+)」/.exec(e.title)?.[1]).filter(Boolean); assert.ok(names.length === ev.length, "「事件名」で残る");
  assert.ok(new Set(names).size / names.length > 0.8, `重複 ${names.length - new Set(names).size}/${names.length}`);
});

console.log("=== 暗殺・政変のあと、人をもう一度選ぶ ===");
for (const cause of ["assn", "coup"]) await check(`${cause}: 担当国は後継を選ぶ決断が出て、実権を握る側近も候補に入る。選ぶと即位する`, () => {
  const w = fresh(), st = own(w), ctx = w.sim.ctx; decisionsOf(w.civ).live = true; const old = st.leader.name;
  assert.ok(DECISION_HOOKS.succession(ctx, st, cause)); const d = pendingOf(w.civ)[0]; assert.ok(d && d.kind === "succession");
  assert.ok(d.title.includes(cause === "assn" ? "暗殺" : "政変"), d.title); assert.ok(d.options.some((o) => String(o.id).startsWith("plot_")), "側近・事を起こした者が候補にいる");
  const pick = d.options.find((o) => String(o.id).startsWith("plot_")), r = dispatch(w, { type: "decision.resolve", authority: A.PLAYER, decisionId: d.id, option: pick.id }); assert.ok(r.ok, JSON.stringify(r).slice(0, 200));
  assert.notEqual(st.leader.name, old); assert.ok(pendingOf(w.civ).length === 0);
});

console.log("=== 役職 ===");
await check("政体ごとに役職があり、効果は乱数でなく役職の意味から決まる（宰相は安定が高いが貴族が反発・元帥は軍事・財務は税収）", () => {
  for (const [id, r] of Object.entries(REGIMES)) { assert.ok(r.offices.length >= 8, `${id} ${r.offices.length}`); for (const o of r.offices) assert.ok(officeInfo(o), `${id} ${o}`); }
  const byJa = (ja) => officeInfo(Object.keys(OFFICES).find((k) => OFFICES[k][0] === ja));
  assert.equal(byJa("宰相").debuff, "arrogant"); assert.ok(byJa("宰相").strong); assert.ok(byJa("元帥").fx.mil > 0); assert.ok(byJa("財務長官").fx.tax > (byJa("侍従長").fx.tax ?? 0));
  assert.ok(byJa("密偵頭").fx.scout > 0 && byJa("王室使節").fx.dipl > 0 && byJa("侍医").fx.tech > 0);
});
await check("同じ名前なら、いつ読んでも同じ効果（乱数でない）。欠点には名前がある。全役職にバフが 1 つ以上ある", () => {
  for (const id of Object.keys(OFFICES)) { const a = officeInfo(id), b = officeInfo(id); assert.deepEqual(a, b); if (a.dom !== "ruler") assert.ok(Object.keys(a.fx).length >= 1, id); if (a.debuff) assert.ok(DEBUFF_JA[a.debuff], a.debuff); }
});
await check("近代の政体は 60 個以上、史実の官名（総理大臣・国務長官・党書記…）が入っている", () => {
  for (const id of ["presidential", "parliamentary", "socialist", "constitutional_monarchy"]) assert.ok(REGIMES[id].offices.length >= 60, `${id} ${REGIMES[id].offices.length}`);
  const names = (rid) => REGIMES[rid].offices.map((o) => OFFICES[o][0]);
  assert.ok(names("presidential").includes("国務長官")); assert.ok(names("kingdom").includes("伯")); assert.ok(names("oligarchic_republic").includes("護民官")); assert.ok(names("empire").includes("御史大夫"));
});

console.log("=== 国策 ===");
await check("国策は 70 個以上。必要な技術は実在し、すべてに図柄と題名がある", () => {
  const ids = new Set(TREE.map((t) => t.id)), src = readFileSync(new URL("../js/ui/v6/badges.js", import.meta.url), "utf8"), ofText = src.slice(src.indexOf("const OF"), src.indexOf("const SHAPE"));
  assert.ok(Object.keys(POLICIES).length >= 70, String(Object.keys(POLICIES).length));
  for (const [id, p] of Object.entries(POLICIES)) { assert.ok(p.ja && p.desc, id); if (p.need) assert.ok(ids.has(p.need), `${id}: ${p.need}`); assert.ok(new RegExp(`\\b${id}:`).test(ofText), `図柄 ${id}`); }
  const ui = readFileSync(new URL("../js/ui/v6/policy.js", import.meta.url), "utf8"); assert.ok((ui.match(/class: "ptitle"/g) ?? []).length >= 2, "バッジの下に題名");
});
await check("版は 6.21.0", () => assert.equal(APP_VERSION, "6.21.0"));
console.log(failed ? `\n${failed} 件失敗` : "\nすべて通りました"); process.exit(failed ? 1 : 0);
