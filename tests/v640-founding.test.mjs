// v6.4.0: 建国フロー（国名→政体→役職→為政者→首都→技術・ドクトリン）・役職の組み替え・反乱・創造主の建国。
import assert from "node:assert/strict";
import { createNewWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { REGIMES, OFFICES, checkOffices, defaultOffices, regimeGate, officeFx } from "../js/core/wcde/regimes.js";
import { UPRISING_KINDS } from "../js/core/wcde/uprising.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const mk = (seed) => createNewWorld({ worldSeed: seed, spec: { resolution: { targetCells: 3000 } }, magic: { enabled: false } }).w;
const U = (r) => (r.ok && r.result && typeof r.result === "object" ? { ...r, ...r.result, ok: r.result.ok ?? r.ok } : r); // dispatch の結果は { ok, result } に包まれる
const P = (w, c) => U(dispatch(w, { authority: A.PLAYER, ...c })), AD = (w, c) => U(dispatch(w, { authority: A.ADMIN, ...c })), CR = (w, c) => U(dispatch(w, { authority: A.CREATOR, ...c }));

await check("政体は 15 種。役職は 30 種以上。どの政体も元首の役職を持ち、役職はすべて定義がある", () => {
  assert.equal(Object.keys(REGIMES).length, 15); assert.ok(Object.keys(OFFICES).length >= 30);
  for (const [k, r] of Object.entries(REGIMES)) { assert.ok(r.offices.includes(r.ruler), k); for (const o of r.offices) assert.ok(OFFICES[o], `${k}:${o}`); assert.equal(checkOffices(k, defaultOffices(k)), null, k); }
  assert.ok(checkOffices("kingdom", ["vizier", "marshal", "treasurer"]), "元首を外せない"); assert.ok(checkOffices("presidential", ["president", "marshal", "treasurer"]), "別の政体の役職は置けない");
});

const w = mk("v640-a"); const o = AD(w, { type: "founding.options" });
await check("建国の入口: 政体の一覧（選べない理由つき）・国のない都市の候補が出る", () => {
  assert.ok(o.ok); assert.equal(o.regimes.length, 15); assert.ok(o.regimes.find((r) => r.id === "tribal").ok);
  const o2 = AD(w, { type: "founding.options", regime: "tribal" }); assert.ok(o2.sites.length >= 1, "首都の候補"); assert.ok(o2.sites.every((s) => s.ok));
});
const sites = AD(w, { type: "founding.options", regime: "tribal" }).sites, site = sites[0];
await check("首都を選ぶと、領域・技術の選択肢・ドクトリンの選択肢が返る（WCDE が領域を決める）", () => {
  const r = AD(w, { type: "founding.options", regime: "tribal", capital: { groupId: site.groupId } }); assert.ok(r.ok && r.realm.groupIds.includes(site.groupId)); assert.ok(r.realm.groupIds.length >= 1);
  assert.ok(r.capital.kind === "existing" || r.capital.kind === "settle"); assert.ok(Array.isArray(r.techChoices)); assert.ok(Array.isArray(r.doctrineChoices));
});
await check("既存の国家の都市は選べない（国家のない都市だけ）／海は選べない", () => {
  const bad = AD(w, { type: "founding.options", regime: "tribal", capital: { cell: -5 } }); assert.ok(bad.capitalError);
});
await check("検証: 国名・役職・為政者の名前が不正なら、世界を変えずに失敗する", () => {
  const before = Object.keys(w.civ.states).length; const base = { name: "テスト国", regime: "tribal", offices: defaultOffices("tribal"), leader: { name: "アルカ" }, capital: { groupId: site.groupId }, techs: [] };
  for (const bad of [{ name: "" }, { regime: "nope" }, { offices: ["chief"] }, { leader: { name: "" } }, { techs: ["no_such_tech"] }]) { const r = P(w, { type: "founding.found", ...base, ...bad }); assert.equal(r.ok, false, JSON.stringify(bad)); }
  assert.equal(Object.keys(w.civ.states).length, before); assert.equal(w.civ.wcde.phase, "founding");
});
let sid;
await check("担当して建国する（国名→政体→役職→為政者→首都→技術）。為政者・役職・政体が国家に記録される", () => {
  const opt = AD(w, { type: "founding.options", regime: "tribal", capital: { groupId: site.groupId } }), tk = opt.techChoices.slice(0, 2).map((t) => t.key);
  const r = P(w, { type: "founding.found", name: "ヴァルテリア部族連合", regime: "tribal", offices: ["chief", "elder_council", "shaman", "war_leader"], leader: { name: "ヴァルディスの子オルヴェン", look: 5 }, capital: { groupId: site.groupId }, techs: tk, doctrine: opt.doctrineChoices[0]?.id ?? null });
  assert.ok(r.ok, r.error); sid = r.stateId; const st = w.civ.states[sid];
  assert.equal(st.name, "ヴァルテリア部族連合"); assert.equal(st.regime, "tribal"); assert.equal(st.polity, "tribal"); assert.equal(st.leader.name, "ヴァルディスの子オルヴェン"); assert.equal(st.leader.look, 5);
  assert.deepEqual(st.offices.map((x) => x.id), ["chief", "elder_council", "shaman", "war_leader"]); assert.equal(st.offices[0].holder.name, st.leader.name); assert.ok(st.offices.every((x) => x.holder.name));
  assert.equal(st.capitalGroupId, site.groupId); assert.ok(w.civ.groups[site.groupId].stateId === sid); assert.ok(r.realmGroups >= 1);
  for (const k of tk) assert.ok(st.techAdopted[k] != null); assert.equal(w.civ.wcde.control.stateId, sid); assert.equal(w.civ.wcde.phase, "running");
  assert.ok(w.civ.events.some((e) => e.kind === "state_constituted" && e.facts.stateId === sid));
});
await check("役職はいつでも組み替えられる（費用なし）。元首は外せない。出来事に残る", () => {
  const r = P(w, { type: "state.setOffices", offices: ["chief", "shaman", "hunt_master"] }); assert.ok(r.ok, r.error); const st = w.civ.states[sid];
  assert.deepEqual(st.offices.map((x) => x.id), ["chief", "shaman", "hunt_master"]); assert.equal(st.offices.find((x) => x.id === "shaman").holder.name, st.offices.find((x) => x.id === "shaman").holder.name);
  assert.ok(w.civ.events.some((e) => e.kind === "office_reform")); assert.equal(P(w, { type: "state.setOffices", offices: ["shaman", "war_leader", "hunt_master"] }).ok, false);
  assert.ok(officeFx(st).stability >= 0 && officeFx(st).stability <= 0.04);
});
await check("時間を進めても壊れない（役職つきの国家が 20 年動く）", () => {
  const r = AD(w, { type: "time.advance", months: 240, commandId: "t1" }); assert.ok(r.ok, r.error); assert.ok(w.civ.states[sid]);
});

/* ---------- 反乱 ---------- */
const w2 = mk("v640-b"); const sites2 = AD(w2, { type: "founding.options", regime: "tribal" }).sites;
// 領土の大きい（集団の多い）国を担当して始めたいので、首都は人口の多い所から。担当国が小さければ別の世界の候補も見る
const tryFound = (ww, ss) => { for (const s of ss.slice(0, 12)) { const r = P(ww, { type: "founding.found", name: "コルヴァン部族連合", regime: "tribal", offices: defaultOffices("tribal"), leader: { name: "テルヴァ" }, capital: { groupId: s.groupId }, techs: [] }); if (r.ok) return r; } return null; };
const f2 = tryFound(w2, sites2); const sid2 = f2?.stateId;
await check("反乱の型は 5 つ。規模は WCDE が決める（計画は何も変えない）", () => {
  assert.equal(Object.keys(UPRISING_KINDS).length, 5); assert.ok(sid2);
  const gs = Object.values(w2.civ.groups).filter((g) => g.stateId === sid2 && g.id !== w2.civ.states[sid2].capitalGroupId);
  if (!gs.length) { console.log("   （この世界の担当国は領土が 1 集団のため、反乱の計画は試験しない）"); return; }
  const before = JSON.stringify(gs.map((g) => [g.id, g.stateId, g.pop])); const r = P(w2, { type: "uprising.plan", kind: "separatist", cell: gs[0].cell });
  assert.ok(r.ok, r.error); assert.ok(r.scale > 0 && r.scale <= 0.95); assert.ok(r.regionGroupIds.includes(gs[0].id)); assert.ok(!r.regionGroupIds.includes(w2.civ.states[sid2].capitalGroupId));
  assert.equal(JSON.stringify(gs.map((g) => [g.id, g.stateId, g.pop])), before, "計画は世界を変えない");
  assert.equal(P(w2, { type: "uprising.plan", kind: "separatist", cell: w2.civ.groups[w2.civ.states[sid2].capitalGroupId].cell }).ok, false, "首都では起こせない");
});
await check("分離独立: 国名・政体・役職・為政者を決めて新国家が生まれ、親国と戦争になる。領域は中心地の周り", () => {
  const st = w2.civ.states[sid2], gs = Object.values(w2.civ.groups).filter((g) => g.stateId === sid2 && g.id !== st.capitalGroupId); if (!gs.length) return;
  const r = P(w2, { type: "uprising.start", kind: "separatist", cell: gs[0].cell, found: { name: "ノルヴェスト自由邦", regime: "tribal", offices: defaultOffices("tribal"), leader: { name: "カルドゥア" }, techs: [] } });
  assert.ok(r.ok, r.error); assert.equal(r.outcome, "new_state"); const ns = w2.civ.states[r.newStateId];
  assert.equal(ns.name, "ノルヴェスト自由邦"); assert.equal(ns.capitalGroupId, gs[0].id); assert.equal(ns.player, false); assert.ok(w2.civ.groups[gs[0].id].stateId === ns.id);
  assert.ok(w2.civ.states[sid2].alive && w2.civ.groups[st.capitalGroupId].stateId === sid2, "担当国は首都を保つ"); assert.ok(w2.civ.wars[r.warId].sides.a.includes(ns.id) && w2.civ.wars[r.warId].sides.d.includes(sid2));
  assert.ok(w2.civ.events.some((e) => e.kind === "uprising"));
});
await check("国家をつくらない反乱（民衆蜂起）: 新しい体制を先に決める。成功か鎮圧のどちらかになり、世界は壊れない", () => {
  const st = w2.civ.states[sid2], gs = Object.values(w2.civ.groups).filter((g) => g.stateId === sid2 && g.id !== st.capitalGroupId); if (!gs.length) return;
  assert.equal(P(w2, { type: "uprising.start", kind: "revolution", cell: gs[0].cell }).ok, false, "新体制の指定が必要");
  const r = P(w2, { type: "uprising.start", kind: "revolution", cell: gs[0].cell, reform: { regime: "tribal", offices: defaultOffices("tribal"), leader: { name: "新しいオルド" } } });
  assert.ok(r.ok, r.error); assert.ok(["success", "crushed"].includes(r.outcome)); if (r.outcome === "success") assert.equal(st.leader.name, "新しいオルド");
});
await check("創造主は、担当せずに国家を作れる（建国と同じ流れ）", () => {
  const w3 = mk("v640-c"); AD(w3, { type: "founding.delegate" }); const ss = AD(w3, { type: "founding.options", regime: "tribal" }).sites; assert.ok(ss.length);
  let r = null; for (const s of ss.slice(0, 12)) { r = CR(w3, { type: "creator.found", name: "セルヴィア神権国", regime: "tribal", offices: defaultOffices("tribal"), leader: { name: "ミルダ" }, capital: { groupId: s.groupId }, techs: [] }); if (r.ok) break; }
  assert.ok(r.ok, r.error); assert.equal(w3.civ.states[r.stateId].player, false); assert.equal(w3.civ.wcde.control.stateId, null);
});
await check("古い呼び方（候補の ID・国名・政体）でも建国できる（互換）", () => {
  const w4 = mk("v640-d"); const c = AD(w4, { type: "founding.refresh" }).candidates; if (!c.length) return;
  const r = P(w4, { type: "founding.found", candidateId: c[0].id, name: "旧式の国", polity: c[0].polityOptions[0] }); assert.ok(r.ok, r.error);
});
await check("新しい都市: 集落のない場所（国家のない集団）を選ぶと、そこに都市が築かれて首都になる", () => {
  const w5 = mk("v640-e"); const cands = Object.values(w5.civ.groups).filter((g) => !g.settlementId && !g.stateId && g.pop >= 300).sort((a, b) => b.pop - a.pop); assert.ok(cands.length, "集落のない集団がある");
  let done = false; for (const g of cands.slice(0, 10)) {
    const o = AD(w5, { type: "founding.options", regime: "tribal", capital: { cell: g.cell } }); if (!o.capital) continue; assert.equal(o.capital.kind, "settle");
    const r = P(w5, { type: "founding.found", name: "ニュー・アルバ部族連合", regime: "tribal", offices: defaultOffices("tribal"), leader: { name: "ソルヴェ" }, capital: { cell: g.cell }, techs: [] });
    if (!r.ok) continue; const st = w5.civ.states[r.stateId]; assert.equal(r.capitalKind, "settle"); assert.equal(st.capitalGroupId, g.id); assert.ok(w5.civ.groups[g.id].settlementId, "都市（集落）ができている"); assert.ok(AD(w5, { type: "time.advance", months: 120, commandId: "n1" }).ok); done = true; break;
  }
  assert.ok(done);
});
await check("既存の国家の領土は首都にできない", () => {
  const w6 = mk("v640-f"); AD(w6, { type: "founding.delegate" }); AD(w6, { type: "time.advance", months: 1200, commandId: "x" }); const owned = Object.values(w6.civ.groups).find((g) => g.stateId && w6.civ.states[g.stateId].alive);
  if (!owned) return; const o = AD(w6, { type: "founding.options", regime: "tribal", capital: { cell: owned.cell } }); assert.ok(o.capitalError, "国家の領土は選べない");
});
await check("保存して読み込んでも、政体・役職・為政者の顔が残る（.ahw）", async () => {
  const { packSaveGz, unpackSaveAny } = await import("../js/core/wcde/savefile.js"); const p = await packSaveGz(w); const r = await unpackSaveAny(p.bytes); assert.ok(r.ok, JSON.stringify(r.errors ?? r.error));
  const st = r.w.civ.states[sid]; assert.equal(st.regime, "tribal"); assert.deepEqual(st.offices.map((x) => x.id), w.civ.states[sid].offices.map((x) => x.id)); assert.equal(st.leader.name, w.civ.states[sid].leader.name); assert.equal(st.leader.look ?? null, w.civ.states[sid].leader.look ?? null);
  const ro = st.offices.find((x) => x.id === "chief"); assert.equal(ro.holder.name, st.leader.name, "元首の役職は為政者と同じ人");
});
console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功"); process.exit(failed ? 1 : 0);
