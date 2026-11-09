// v6.5.0: 核の確認。担当国の技術・ドクトリンの自動採用／編成が戦力に効く／部隊の名前が技術に合う／講和条約の名前。
import assert from "node:assert/strict";
import { createNewWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { armsMult, landPower } from "../js/core/wcde/power.js";
import { unitName, formationsOf } from "../js/core/wcde/domains/military.js";
import { proposalsOf } from "../js/core/wcde/negotiation.js";
let failed = 0; const check = async (n, f) => { try { await f(); console.log("  OK  ", n); } catch (e) { failed++; console.log("  FAIL", n + ":", String(e.stack ?? e).split("\n").slice(0, 4).join(" | ")); } };
const r = createNewWorld({ worldSeed: "v650-core", spec: { resolution: { targetCells: 3000 } } }); assert.ok(r.ok); const w = r.w, run = (c) => dispatch(w, { authority: A.ADMIN, ...c });
run({ type: "founding.delegate" }); for (let i = 0; i < 6; i++) run({ type: "clock.run", months: 200 });
const top = () => Object.values(w.civ.states).filter((s) => s.alive && s.military?.units?.length).sort((a, b) => b.pop - a.pop)[0];
await check("担当国でも、ドクトリンは WCDE が自動で取り入れる（ユーザーの介入なし）", async () => {
  const st = top(); assert.ok(st); run({ type: "control.take", stateId: st.id }); const d0 = Object.keys(st.military.doctrine.taken).length; st.treasury += 5000;
  for (let i = 0; i < 4; i++) run({ type: "clock.run", months: 200 }); const s2 = w.civ.states[st.id]; if (!s2.alive) return; assert.ok(s2.player); assert.ok(Object.keys(s2.military.doctrine.taken).length + Object.keys(s2.techAdopted).length > d0, "自動で進む"); run({ type: "control.release" });
});
await check("編成が戦力に効く: 諸兵科の混成は歩兵だけより強く、効果は ±数十％に収まる", async () => {
  const st = top(); const u = st.military.units; const total = u.reduce((a, x) => a + x.size, 0); const mix = armsMult(st, false);
  const keep = u.map((x) => ({ ...x })); st.military.units = [{ kind: "infantry", size: total, name: "x", equip: 0.5, readiness: 0.5 }]; const inf = armsMult(st, false); st.military.units = keep;
  assert.ok(inf <= 1.0001 && mix >= inf, `混成 ${mix} ≥ 歩兵のみ ${inf}`); assert.ok(mix < 1.45, "上限"); assert.ok(landPower(w.civ, st) > 0);
  st.military.units = [{ kind: "garrison", size: total }]; assert.ok(armsMult(st, true) > armsMult(st, false), "守備兵は守りで強い"); st.military.units = keep;
});
await check("部隊の名前は技術に合わせて改まり、編成は第一・第二…に分かれる", async () => {
  const st = top(), save = st.techAdopted; st.techAdopted = {}; const a = unitName(st, "infantry"); st.techAdopted = { iron_weapons: 1 }; const b = unitName(st, "infantry"); st.techAdopted = save; assert.notEqual(a, b); assert.ok(/重装歩兵団/.test(b));
  const fs = formationsOf(st, { kind: "infantry", size: 20000 }); assert.ok(fs.length >= 2 && /^第一/.test(fs[0].name));
});
await check("講和条約には地名から付いた名前が残る（あれば）", async () => {
  for (let i = 0; i < 4; i++) run({ type: "clock.run", months: 200 }); const ps = proposalsOf(w.civ).filter((p) => p.kind === "peace" && p.status === "accepted"); if (!ps.length) { console.log("   （講和が無いため省略）"); return; } assert.ok(ps.every((p) => /条約$/.test(p.name)));
});
console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功"); process.exit(failed ? 1 : 0);
