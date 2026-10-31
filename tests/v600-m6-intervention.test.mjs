// v6.0.0 M6: 創造主の介入（一時的な補正・漸進収束）。表示だけでなく有効値として下流（経済・軍事・財政・AI）に効き、決定的に減衰し、保存・復元で再現され、介入中の実際の結果は巻き戻らない。
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, COMMANDS, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { effective, FIELDS } from "../js/core/wcde/domains/effective.js";
import { residualAt, interventionsOf, checkInterventions } from "../js/core/wcde/intervention.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
import { strength } from "../js/core/civ/diplomacy.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const R = createNewWorld({ worldSeed: "m6-1", spec: { resolution: { targetCells: 6000 } }, magic: { enabled: false } }); const w0 = R.w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 300 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const alive = (w) => Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1));
const adv = (w, n) => { const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: n }); assert.ok(r.ok, r.error); };
const cre = (w, args) => dispatch(w, { type: "creator.intervene", authority: A.CREATOR, ...args });
const ID = alive(fresh())[0].id;

console.log("=== 検証・権限 ===");
await check("不正な値（NaN・Infinity・文字列・範囲外・未知の項目・存在しない国家）は拒否され、状態を一切変えない", () => {
  const w = fresh(), before = JSON.stringify(w.civ.wcde.interventions ?? null) + JSON.stringify(w.civ.wcde.adjust ?? null) + w.civ.events.length;
  for (const a of [{ field: "industry", value: NaN }, { field: "industry", value: Infinity }, { field: "industry", value: "100" }, { field: "legitimacy", value: 1.5 }, { field: "legitimacy", value: -0.1 }, { field: "nope", value: 1 }, { field: "industry", value: 5, reason: "x".repeat(201) }, { field: "industry", value: 5, halfLifeMonths: 0 }]) { const r = cre(w, { stateId: ID, ...a }); assert.equal(r.ok, false, JSON.stringify(a)); assert.ok(r.error); }
  assert.equal(cre(w, { stateId: "state_nope", field: "industry", value: 5 }).ok, false);
  assert.equal(JSON.stringify(w.civ.wcde.interventions ?? null) + JSON.stringify(w.civ.wcde.adjust ?? null) + w.civ.events.length, before);
});
await check("介入できるのは創造主だけ（プレイヤー・AI・管理・シミュレーションの権限では拒否）。AI は介入を解除できない", () => {
  const w = fresh(); for (const type of ["creator.intervene", "creator.cancelIntervention"]) for (const authority of [A.PLAYER, A.AI, A.ADMIN, A.SIM]) { const r = dispatch(w, { type, authority, stateId: ID, field: "industry", value: 5, id: "x" }); assert.equal(r.ok, false); assert.equal(r.code, "authority"); }
  assert.deepEqual(COMMANDS["creator.intervene"].authorities, [A.CREATOR]); assert.deepEqual(COMMANDS["creator.cancelIntervention"].authorities, [A.CREATOR]);
});
await check("過去の閲覧中は介入できない", () => { const w = fresh(); dispatch(w, { type: "view.past", authority: A.ADMIN, month: w.civ.monthIndex - 12 }); const r = cre(w, { stateId: ID, field: "industry", value: 5 }); assert.equal(r.ok, false); assert.equal(r.code, "past_view"); });

console.log("=== 有効値 ===");
await check("介入の直後から有効値 = 指定値。通常計算値は変わらない（補正は別に持つ）。介入は歴史の事実（events）に混ざらない", () => {
  const w = fresh(), st = w.civ.states[ID], nom = st.econ.industry, ev = w.civ.events.length, target = nom * 4;
  const r = cre(w, { stateId: ID, field: "industry", value: target, reason: "テスト" }); assert.ok(r.ok, r.error);
  assert.ok(Math.abs(effective(w.civ, st, "industry") - target) < 1e-6); assert.equal(st.econ.industry, nom, "通常計算値を書き換えていない"); assert.equal(w.civ.events.length, ev, "介入は事実イベントではない");
  const rec = interventionsOf(w.civ)[0]; assert.equal(rec.status, "active"); assert.equal(rec.nominalAtStart, nom); assert.equal(rec.target, target); assert.equal(rec.authority, "creator_intervention"); assert.equal(rec.reason, "テスト");
  assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});
await check("同じ項目への再介入は前の介入を置き換える（二重適用・補正の増殖がない）", () => {
  const w = fresh(), st = w.civ.states[ID], nom = st.econ.industry; cre(w, { stateId: ID, field: "industry", value: nom * 3 }); const r2 = cre(w, { stateId: ID, field: "industry", value: nom * 2 }); assert.ok(r2.ok);
  assert.ok(Math.abs(effective(w.civ, st, "industry") - nom * 2) < 1e-6, "和ではなく置き換え"); const recs = interventionsOf(w.civ); assert.equal(recs.filter((x) => x.status === "active").length, 1); assert.equal(recs[0].status, "superseded"); assert.equal(recs[1].supersedes, recs[0].id); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});

console.log("=== 下流への実際の効果 ===");
await check("産業力への介入が、装備水準・軍事能力・戦力（AI が見る strength）へ実際に効く（表示だけではない）", () => {
  const a = fresh(), b = fresh(), sa = a.civ.states[ID], nom = sa.econ.industry; assert.ok(cre(a, { stateId: ID, field: "industry", value: nom * 0.1, halfLifeMonths: 120 }).ok);
  adv(a, 6); adv(b, 6); const x = a.civ.states[ID], y = b.civ.states[ID];
  assert.ok(effective(a.civ, x, "equipLevel") < effective(b.civ, y, "equipLevel"), "装備水準（有効値）"); assert.ok(x.milBonus < y.milBonus, "軍事能力"); assert.ok(strength(a.civ, x) / Math.max(1, x.army) < strength(b.civ, y) / Math.max(1, y.army), "兵 1 あたりの戦力（AI の判断材料）");
});
await check("財政（税収の倍率）への介入が、国庫の実際の増加として現れ、減衰して収束したあとも、増えた国庫（実際の結果）は巻き戻らない", () => {
  const a = fresh(), b = fresh(); assert.ok(cre(a, { stateId: ID, field: "taxRevenue", value: 2, halfLifeMonths: 24 }).ok);
  adv(a, 24); adv(b, 24); const gap24 = a.civ.states[ID].treasury - b.civ.states[ID].treasury; assert.ok(gap24 > 0, "国庫の差 " + gap24);
  adv(a, 24 * 14); adv(b, 24 * 14); const rec = interventionsOf(a.civ)[0]; assert.equal(rec.status, "converged"); assert.equal(Object.keys(a.civ.wcde.adjust).length, 0); assert.equal(effective(a.civ, a.civ.states[ID], "taxRevenue"), 1, "収束後の有効値は通常値");
  const sa = a.civ.states[ID], sb = b.civ.states[ID]; if (sa.alive && sb.alive) assert.ok(Math.abs(sa.treasury - sb.treasury) > 0 || sa.stability !== sb.stability, "介入中に起きた結果は残る");
});
await check("正統性・疲労度への介入が、安定度・政体の変化など国内政治へ効く", () => {
  const a = fresh(), b = fresh(); assert.ok(cre(a, { stateId: ID, field: "legitimacy", value: 0.05, halfLifeMonths: 240 }).ok); assert.ok(cre(a, { stateId: ID, field: "fatigue", value: 0.9, halfLifeMonths: 240 }).ok);
  adv(a, 6); adv(b, 6); const x = a.civ.states[ID], y = b.civ.states[ID]; assert.ok(x.alive && y.alive); assert.ok(x.politics.taxCeiling < y.politics.taxCeiling, `正統性が低いと税の上限が下がる ${x.politics.taxCeiling} < ${y.politics.taxCeiling}`);
  // 正統性が低いと、政体の転換が起こりやすい（転換が起きると安定度は組み替わる）。長く進めると、どちらかの結果が現れる
  adv(a, 60); adv(b, 60); const x2 = a.civ.states[ID], y2 = b.civ.states[ID]; assert.ok(x2.politics.lastRegimeChange !== y2.politics.lastRegimeChange || x2.stability < y2.stability, "政体の転換が起きたか、安定度が下がっている");
});

console.log("=== 減衰・収束・再現 ===");
await check("補正は半減期ごとに半分になり（決定的）、通常値へ収束して、収束後は有効値 = 通常値", () => {
  const w = fresh(), st = w.civ.states[ID], nom = st.econ.industry; assert.ok(cre(w, { stateId: ID, field: "industry", value: nom * 3, halfLifeMonths: 36 }).ok); const rec = interventionsOf(w.civ)[0], r0 = rec.residual0, m0 = w.civ.monthIndex;
  adv(w, 36); assert.ok(Math.abs(rec.residual - r0 / 2) < 1e-6 * Math.abs(r0), `${rec.residual} ≒ ${r0 / 2}`); assert.equal(rec.residual, residualAt(rec, m0 + 36));
  adv(w, 36 * 20); assert.equal(rec.status, "converged"); assert.ok(rec.endedAt > m0); assert.equal(w.civ.wcde.adjust[ID]?.industry, undefined); assert.equal(effective(w.civ, w.civ.states[ID], "industry"), w.civ.states[ID].econ.industry);
});
await check("保存・復元のあとも、残存補正と将来の減衰が再現される（同じ入力列から同じ未来）", () => {
  const a = fresh(), nom = a.civ.states[ID].econ.industry; cre(a, { stateId: ID, field: "industry", value: nom * 5, halfLifeMonths: 60 }); cre(a, { stateId: ID, field: "taxRevenue", value: 1.8 }); adv(a, 30);
  const c = deserializeWorld(serializeWorld(a)); assert.deepEqual(c.civ.wcde.adjust, a.civ.wcde.adjust); assert.deepEqual(interventionsOf(c.civ), interventionsOf(a.civ)); adv(a, 90); adv(c, 90);
  assert.deepEqual(interventionsOf(c.civ), interventionsOf(a.civ)); assert.equal(JSON.stringify(c.civ.states), JSON.stringify(a.civ.states)); assert.deepEqual(checkWcdeIntegrity(c.world, c.civ), []);
});
await check("取り消し: 残りの補正だけが消え、すでに起きた結果は戻らない／終わった介入は取り消せない", () => {
  const a = fresh(), b = fresh(); const r = cre(a, { stateId: ID, field: "taxRevenue", value: 2.5, halfLifeMonths: 600 }); adv(a, 12); adv(b, 12); const gap = a.civ.states[ID].treasury - b.civ.states[ID].treasury; assert.ok(gap > 0);
  assert.ok(dispatch(a, { type: "creator.cancelIntervention", authority: A.CREATOR, id: r.result.id }).ok); assert.equal(effective(a.civ, a.civ.states[ID], "taxRevenue"), 1); assert.equal(a.civ.states[ID].treasury - b.civ.states[ID].treasury, gap, "国庫は取り消しの瞬間に巻き戻らない");
  assert.equal(dispatch(a, { type: "creator.cancelIntervention", authority: A.CREATOR, id: r.result.id }).ok, false);
});
await check("整合性: 構造の破損（NaN・重複・対象なし）は検出する。実行可能な因果的不整合（産業力と技術の食い違い）は黙って直さない", () => {
  const w = fresh(), nom = w.civ.states[ID].econ.industry; cre(w, { stateId: ID, field: "industry", value: nom * 50 }); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), [], "技術水準と食い違う産業力も許容"); adv(w, 3); assert.ok(effective(w.civ, w.civ.states[ID], "industry") > nom * 20, "自動修復されない");
  const rec = interventionsOf(w.civ)[0]; rec.residual = NaN; assert.ok(checkInterventions(w.civ).some((e) => e.includes("有限でない")));
});
await check("WCDE のコードは Math.random / Date.now を使わない（介入含む）", async () => { const { readFileSync } = await import("node:fs"); for (const f of ["intervention.js", "domains/effective.js"]) assert.ok(!/Math\.random|Date\.now/.test(readFileSync(new URL("../js/core/wcde/" + f, import.meta.url), "utf8")), f); });
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
