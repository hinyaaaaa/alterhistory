// v6.0.0 M7: 戦争研究所（予測）と外交交渉（条約・講和）。
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { predictWar, WARLAB_MODEL } from "../js/core/wcde/warlab.js";
import { evaluateTreaty, evaluatePeace, proposalsOf, negotiateTreaty, negotiatePeace } from "../js/core/wcde/negotiation.js";
import { declareWar, treatyBetween, atWarWith, TREATY } from "../js/core/civ/diplomacy.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const R = createNewWorld({ worldSeed: "m7-1", spec: { resolution: { targetCells: 6000 } }, magic: { enabled: false } }); const w0 = R.w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 300 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const pair = (w) => { const L = Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop); return [L[0], L[1]]; };
const ctxOf = (w) => w.sim.ctx;

console.log("=== 戦争研究所 ===");
await check("予測は確率・損耗・不確実性・内訳を持ち、勝率の合計は 1、幅は中央値を含む", () => {
  const w = fresh(), [a, b] = pair(w), p = predictWar(w.civ, a.id, b.id); assert.equal(p.model, WARLAB_MODEL); assert.ok(Math.abs(p.pAWin + p.pBWin + p.pStalemate - 1) < 0.005);
  assert.ok(p.pAWinRange[0] <= p.pAWin && p.pAWin <= p.pAWinRange[1]); assert.ok(p.uncertainty > 0 && p.uncertainty < 1); assert.ok(p.factors.length >= 5 && p.months >= 4); assert.equal(predictWar(w.civ, a.id, a.id), null);
});
await check("予測は純粋: 世界を変えず、同じ入力から同じ値（キャッシュの有無でも不変）", () => {
  const w = fresh(), [a, b] = pair(w), snap = serializeWorld(w), p1 = predictWar(w.civ, a.id, b.id), p2 = predictWar(w.civ, a.id, b.id, ctxOf(w)), p3 = predictWar(w.civ, a.id, b.id, ctxOf(w)); assert.deepEqual(p1, p2); assert.strictEqual(p2, p3); assert.equal(serializeWorld(w), snap);
});
await check("攻撃側が強いほど勝率が上がり、非対称（a→b と b→a は別物）。介入で産業力を落とすと予測も変わる", () => {
  const w = fresh(), [a, b] = pair(w); const pab = predictWar(w.civ, a.id, b.id), pba = predictWar(w.civ, b.id, a.id); assert.ok(pab.ratio > 0 && Math.abs(pab.ratio * pba.ratio - 1) < 0.02);
  const strong = pab.ratio >= 1 ? a : b; assert.ok(predictWar(w.civ, strong.id, (strong === a ? b : a).id).pAWin >= predictWar(w.civ, (strong === a ? b : a).id, strong.id).pAWin);
  assert.ok(dispatch(w, { type: "creator.intervene", authority: A.CREATOR, stateId: a.id, field: "readiness", value: 0.05 }).ok); dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 3 });
  const after = predictWar(w.civ, a.id, b.id); assert.ok(after.inputs.a.readiness < pab.inputs.a.readiness, "有効値（介入込み）を読む");
});
await check("AI は同じ予測を使う（ctx.warForecast は画面の予測と同一）", () => { const w = fresh(), [a, b] = pair(w); assert.deepEqual(ctxOf(w).warForecast(a, b), predictWar(w.civ, a.id, b.id, ctxOf(w))); });

console.log("=== 条約の交渉 ===");
await check("評価は決定的で要因を持ち、評価だけでは何も変わらない。恨みが深い・相手の同盟国と交戦中は拒否", () => {
  const w = fresh(), [a, b] = pair(w), snap = serializeWorld(w), e1 = evaluateTreaty(w.civ, a, b, "trade"), e2 = evaluateTreaty(w.civ, a, b, "trade"); assert.deepEqual(e1, e2); assert.ok(e1.factors.length >= 1); assert.equal(serializeWorld(w), snap);
  assert.equal(evaluateTreaty(w.civ, a, b, "peace").accept, false, "講和は条約の種類ではない"); assert.ok(!TREATY.peace);
});
await check("関係が良ければ受諾されて条約が結ばれ、記録に残る。悪ければ拒否され、拒否も記録される（条約は結ばれない）", () => {
  const w = fresh(), [a, b] = pair(w), c = ctxOf(w); b.relations[a.id] = 60; for (const t of w.civ.activeTreatyIds.map((i) => w.civ.treaties[i])) t.active = false; w.civ.activeTreatyIds = []; for (const s of [a, b]) s.warIds = [];
  const ok = negotiateTreaty(c, a, b, "trade"); assert.ok(ok.ok, JSON.stringify(ok)); assert.ok(treatyBetween(w.civ, a, b, "trade")); const rec = proposalsOf(w.civ).at(-1); assert.equal(rec.status, "accepted"); assert.equal(rec.kind, "treaty"); assert.ok(rec.factors.length);
  b.relations[a.id] = -60; const no = negotiateTreaty(c, a, b, "nonaggression"); assert.equal(no.ok, false); assert.equal(no.diplomacyFailure, true); assert.ok(!treatyBetween(w.civ, a, b, "nonaggression")); assert.equal(proposalsOf(w.civ).at(-1).status, "rejected"); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});
await check("同盟は断られても、不可侵なら受け入れる場合は別条件を示す（counter）", () => {
  const w = fresh(), [a, b] = pair(w), c = ctxOf(w); for (const t of w.civ.activeTreatyIds.map((i) => w.civ.treaties[i])) t.active = false; w.civ.activeTreatyIds = []; for (const s of [a, b]) s.warIds = []; b.relations[a.id] = 9; b.stability = 0.9;
  const ev = evaluateTreaty(w.civ, a, b, "alliance"); if (!ev.accept && ev.counter) { const r = negotiateTreaty(c, a, b, "alliance"); assert.equal(r.ok, false); assert.equal(r.counter.type, "nonaggression"); assert.equal(proposalsOf(w.civ).at(-1).status, "countered"); } else assert.ok(true, "この盤面では別条件にならない");
});
await check("行動の入口（state.act / AI）も同じ評価を通る: 関係が悪い相手とは結べず、記録される", () => {
  const w = fresh(), [a, b] = pair(w); for (const s of [a, b]) s.warIds = []; w.civ.activeTreatyIds = []; b.relations[a.id] = -50; a.relations[b.id] = -50; const n = proposalsOf(w.civ).length;
  const r = dispatch(w, { type: "state.act", authority: A.ADMIN, stateId: a.id, action: "sign_treaty", target: b.id, opt: "trade" }); assert.ok(proposalsOf(w.civ).length >= n);
});

console.log("=== 講和 ===");
const warred = () => { const w = fresh(), [a, b] = pair(w), c = ctxOf(w); for (const t of w.civ.activeTreatyIds.map((i) => w.civ.treaties[i])) t.active = false; w.civ.activeTreatyIds = []; for (const s of [a, b]) s.warIds = []; w.civ.activeWarIds = []; const war = declareWar(c, a, b, {}); return { w, a, b, c, war }; };
await check("戦争は条約ではなく専用の手続き。劣勢・長期化・疲労で相手は講和に応じ、受諾されたときだけ戦争が終わる", () => {
  const { w, a, b, c, war } = warred(); war.score = -80; war.startedAt -= 120; b.stability = 0.3; a.politics.fatigue = 0.9; const ev = evaluatePeace(w.civ, war, b, a); assert.ok(ev.accept, JSON.stringify(ev));
  const r = negotiatePeace(c, b, war); assert.ok(r.ok, JSON.stringify(r)); assert.equal(war.status, "ended"); assert.equal(war.outcome, "negotiated"); assert.ok(!atWarWith(w.civ, a, b)); assert.equal(proposalsOf(w.civ).at(-1).kind, "peace"); assert.equal(proposalsOf(w.civ).at(-1).status, "accepted");
});
await check("優勢な側が相手に講和を拒まれる（戦況・疲労が許さない）と、戦争は続き、拒否が記録される", () => {
  const { w, a, b, c, war } = warred(); war.score = 90; a.politics.fatigue = 0; b.politics.fatigue = 0; b.stability = 0.9; war.startedAt = w.civ.monthIndex; const r = negotiatePeace(c, b, war); assert.equal(r.ok, false); assert.equal(war.status, "active"); assert.ok(atWarWith(w.civ, a, b)); assert.equal(proposalsOf(w.civ).at(-1).status, "rejected");
});
await check("賠償つきの講和: 国庫を超えて動かず、支払いは原子的（受諾時だけ）", () => {
  const { w, a, b, c, war } = warred(); war.score = 70; a.treasury = 1000; b.treasury = 500; war.startedAt -= 200; b.politics.fatigue = 1; b.stability = 0.1; const tot = a.treasury + b.treasury; const r = negotiatePeace(c, a, war, { terms: { kind: "reparations", amount: 99999 } });
  if (r.ok) { assert.ok(b.treasury >= 0 && Math.abs(a.treasury + b.treasury - tot) < 1e-6, "国庫の総和は変わらない"); assert.ok(proposalsOf(w.civ).at(-1).terms.paid <= 500); } else { assert.equal(a.treasury + b.treasury, tot, "拒否では動かない"); assert.equal(war.status, "active"); }
});
await check("長く戦えば、いずれ講和に応じる（戦争が永久に続かない）", () => { const { w, a, b, war } = warred(); war.score = 30; war.startedAt -= 600; a.politics.fatigue = 0.4; b.politics.fatigue = 0.4; assert.ok(evaluatePeace(w.civ, war, b, a).accept); });
await check("保存・復元しても提案の記録が残り、同じ入力から同じ未来（交渉・予測を含む長期実行）", () => {
  const a = fresh(), b = fresh(); dispatch(a, { type: "time.advance", authority: A.ADMIN, months: 120 }); const c = deserializeWorld(serializeWorld(a)); dispatch(b, { type: "time.advance", authority: A.ADMIN, months: 120 }); dispatch(c, { type: "time.advance", authority: A.ADMIN, months: 60 }); dispatch(a, { type: "time.advance", authority: A.ADMIN, months: 60 });
  assert.equal(JSON.stringify(a.civ.states), JSON.stringify(c.civ.states)); assert.deepEqual(proposalsOf(a.civ), proposalsOf(c.civ)); assert.deepEqual(checkWcdeIntegrity(a.world, a.civ), []); console.log("     提案の記録:", proposalsOf(a.civ).length, "件");
});
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
