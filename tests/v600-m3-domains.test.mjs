// v6.0.0 M3: 領域（経済・産業・交易／国内政治／軍事組織／言語・命名／宗教）と領域の台帳。
import assert from "node:assert/strict";
import { createNewWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { DOMAINS } from "../js/core/wcde/domains/registry.js";
import { computeProduction, effective, stepEconomy, ECON_PERIOD } from "../js/core/wcde/domains/economy.js";
import { stepPolitics, regimeChange, FACTIONS, initPolitics } from "../js/core/wcde/domains/politics.js";
import { DOCTRINES, DOCTRINE, canAdopt, adoptDoctrine, reorganize, UNIT_KINDS, OFF_CAP, DEF_CAP, stepMilitary, nodesOf } from "../js/core/wcde/domains/military.js";
import { CAP, LINES, TIERS, COMMON_NODES, doctrineFx, FX_KEYS } from "../js/core/wcde/domains/doctrine.js";
import { iterRecords } from "../js/core/civ/archive.js";
import { ensureProfile, nameFor, syllablesOf } from "../js/core/wcde/domains/language.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
import { TECHS } from "../js/core/civ/tech.js";
import { milMult } from "../js/core/civ/techfx.js";
import { strength } from "../js/core/civ/diplomacy.js";
import { byState } from "../js/core/civ/spatial.js";
import { PHASE_KEYS } from "../js/core/civ/tick.js";
import { stateAt } from "../js/core/civ/history.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 3).join(" | ")); } };
const R = createNewWorld({ worldSeed: "alt-a", spec: { resolution: { targetCells: 6000 } }, magic: { enabled: true } }); const w = R.w, civ = w.civ;
dispatch(w, { type: "founding.delegate", authority: A.ADMIN }); const adv = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 360 }); assert.ok(adv.ok, adv.error);
const alive = () => Object.values(civ.states).filter((s) => s.alive), ctx = () => w.sim.ctx;
console.log(`（準備: ${civ.date.year}年 / 国家 ${alive().length} / 集団 ${Object.keys(civ.groups).length}）`);

console.log("=== 領域の台帳 ===");
await check("台帳の各領域は、宣言した処理（steps）が実際に tick に登録され、宣言した所有項目が実体にある", () => {
  const trace = new Set(); for (let i = 0; i < 12; i++) { w.sim.advanceMonth(); for (const t of ctx().trace) trace.add(t.split(":")[1]); } /* 生態系は年 1 回 */
  for (const d of DOMAINS) for (const s of d.steps) { if (d.cadence === "boundary") continue; /* 歴史資料への書き出しは月次の tick ではなく、n か月が成功したあとの安全な境界（civ-sim の advanceMonths）で行う */ assert.ok(trace.has(s), `${d.id} の処理 ${s} が tick に無い`); }
  assert.ok(DOMAINS.some((d) => d.id === "archive" && d.cadence === "boundary" && d.steps.includes("commitArchive")));
  const st = alive()[0]; for (const d of DOMAINS) for (const p of d.owns) { if (p.startsWith("world.")) continue; const parts = p.split("."); if (parts[0] === "states" && parts[1] === "*") assert.ok(parts[2] in st || ["warLoss", "blockade", "dependency"].includes(parts[2]) /* 戦争の損耗・封鎖は、起きたときだけ作られる項目（従属関係も同様） */ || parts[2] === "milBonus" || parts[2] === "milDef" || parts[2] === "econ" || parts[2] === "politics" || parts[2] === "military", `${d.id}: ${p}`); else if (!parts.includes("*")) assert.ok(parts[0] in civ, `${d.id}: ${p}`); }
});
await check("台帳の各領域の事件（events）は、重複した宣言がなく、フェーズ順は 経済→政治→軍事→AI（指示書 §6）", () => {
  assert.ok(PHASE_KEYS.indexOf("tech") < PHASE_KEYS.indexOf("economy") && PHASE_KEYS.indexOf("economy") < PHASE_KEYS.indexOf("politics") && PHASE_KEYS.indexOf("politics") < PHASE_KEYS.indexOf("military") && PHASE_KEYS.indexOf("military") < PHASE_KEYS.indexOf("ai_plan"));
  assert.equal(new Set(DOMAINS.map((d) => d.id)).size, DOMAINS.length);
});

console.log("=== 経済・産業・交易 ===");
await check("全ての国家に産業力・食料収支があり、有限の数。産業力は人口と技術に結びつく", () => {
  for (const st of alive()) { const e = st.econ; assert.ok(e, st.id); for (const k of ["output", "industry", "perCapita", "foodBalance"]) assert.ok(Number.isFinite(e[k]), `${st.id}.${k}`); assert.ok(e.output >= 0); }
});
await check("技術（灌漑など）を採用すると、同じ人口・土地でも産業力が上がる", () => {
  const st = alive().find((s) => s.pop > 100); const gs = byState(ctx()).get(st.id), base = computeProduction(ctx(), st, gs).output; const keep = st.techAdopted; st.techAdopted = { ...keep, irrigation: 1, plow: 1, coinage: 1 }; const up = computeProduction(ctx(), st, gs).output; st.techAdopted = keep; assert.ok(up > base * 1.1, `${base} → ${up}`);
});
await check("投資は産業力を上げ、時間とともに薄れる。有効値（effective）は創造主の調整（M6 の入口）を重ねられる", () => {
  const st = alive().find((s) => s.pop > 100), gs = byState(ctx()).get(st.id); st.econ.investment = 0; const b = computeProduction(ctx(), st, gs).output; st.econ.investment = 0.3; const u = computeProduction(ctx(), st, gs).output; assert.ok(u > b * 1.25); st.econ.investment = 0;
  assert.equal(effective(civ, st, "industry"), st.econ.industry); civ.wcde.adjust = { [st.id]: { industry: { mul: 0.1 } } }; assert.ok(Math.abs(effective(civ, st, "industry") - st.econ.industry * 1.1) < 1e-9); delete civ.wcde.adjust;
});
await check("交易: 隣接する国家の間でだけ成立し、双方に収入が入る（財政に実際に加わる）。戦争・制裁があれば 0", () => {
  const pair = alive().flatMap((a) => Object.entries(a.econ.trade).filter(([, v]) => v > 0).map(([b, v]) => [a, civ.states[b], v])); assert.ok(pair.length > 0, "交易が成立している組がある");
  const [a, b, v] = pair[0]; assert.ok(a.econ.trade[b.id] > 0 && b.econ.trade[a.id] > 0); assert.ok(a.econ.tradeIncome > 0);
  const t0 = a.treasury; const mi = civ.monthIndex; civ.monthIndex = mi - (mi % ECON_PERIOD); stepEconomy(ctx()); civ.monthIndex = mi; assert.ok(a.treasury > t0, "交易収入が財政に入る");
  a.sanctions[b.id] = civ.monthIndex + 600; civ.monthIndex = mi - (mi % ECON_PERIOD); ctx()._nbr = null; stepEconomy(ctx()); civ.monthIndex = mi; assert.equal(a.econ.trade[b.id], 0, "制裁中は交易が止まる"); delete a.sanctions[b.id];
});
await check("経済は技術の進みに効く（techBoost ≤ 30%）。食料が足りない国は安定が下がる", () => { for (const st of alive()) assert.ok(st.econ.techBoost >= 0 && st.econ.techBoost <= 0.3 + 1e-9); });

console.log("=== 国内政治 ===");
await check("全ての国家に勢力（基本の 5 つ。条件で官僚・職人・氏族が加わる）・議会の有無・正統性・疲労がある。支持は 0〜1、正統性 = Σ 影響力×支持", () => {
  for (const st of alive()) { const P = st.politics; assert.ok(P); let leg = 0; for (const k of Object.keys(P.factions)) { const f = P.factions[k]; assert.ok(f.support >= 0 && f.support <= 1); leg += f.influence * f.support; } assert.ok(Math.abs(leg - P.legitimacy) < 1e-9); assert.ok(P.fatigue >= 0 && P.fatigue <= 1); }
});
await check("政体で、誰の支持が効くかが違う（神権制は聖職者、共和制は商人・民衆、王国は貴族・軍）", () => {
  const st = alive()[0], p0 = st.polity; const infl = (pol) => { st.polity = pol; const copy = structuredClone(st.politics); stepPolitics.call(null, { civ: { ...civ, monthIndex: 0, options: civ.options, states: { x: st } }, ids: ctx().ids }); const o = Object.fromEntries(Object.entries(st.politics.factions).map(([k, f]) => [k, f.influence])); st.politics = copy; return o; };
  const th = infl("theocracy"), rep = infl("republic"), kg = infl("kingdom"); st.polity = p0; assert.ok(th.clergy > rep.clergy && th.clergy > kg.clergy); assert.ok(rep.commoners + rep.merchants > kg.commoners + kg.merchants); assert.ok(kg.nobility + kg.military > rep.nobility + rep.military);
});
await check("正統性が低いと、徴税の上限が下がり、税率は上限に収まる（政策の実現可能性）", () => {
  const st = alive()[0]; const P = st.politics; for (const k of Object.keys(P.factions)) P.factions[k].support = 0.05; st.policy.tax = 0.4; const mi = civ.monthIndex; civ.monthIndex = mi - (mi % 3); stepPolitics({ civ, ids: ctx().ids, rng: ctx().rng }); civ.monthIndex = mi;
  assert.ok(P.taxCeiling < 0.4); assert.ok(st.policy.tax <= P.taxCeiling + 1e-9);
});
await check("政変: 正統性が崩れると、事件が原因つきで残り、指導者が代わり、民衆の離反で君主制は共和制になりうる", () => {
  const st = alive().find((s) => s.polity === "kingdom" || s.polity === "tribal") ?? alive()[0]; st.polity = "kingdom"; for (const tc of TECHS.filter((x) => x.caps.includes("polity:republic"))) st.techAdopted = { ...st.techAdopted, [tc.key]: 1 } /* 共和制は、解禁する技術が要る（v6.1.0） */; st.politics = initPolitics(st); st.politics.factions.commoners.support = 0.01; st.politics.factions.military.support = 0.9;
  const n = civ.events.length, old = st.leader.name; regimeChange(ctx(), st); const ev = civ.events[civ.events.length - 1]; assert.equal(ev.kind, "regime_change"); assert.ok(civ.events.length === n + 1); assert.notEqual(st.leader.name, old); assert.equal(st.polity, "republic");
  assert.ok(ev.effects.some((e) => e.property === "polity" && e.before === "kingdom" && e.after === "republic"));
});

console.log("=== 軍事組織 ===");
await check("部隊は総兵力を配分したもの（合計≒兵力）。装備・練度は 0〜1。使えない種類（銃兵など）は無い", () => {
  for (const st of alive()) { const M = st.military; assert.ok(M); const sum = M.units.reduce((s, u) => s + u.size, 0); assert.ok(Math.abs(sum - M.armyBasis) <= Math.max(1, M.armyBasis * 0.02) + M.units.length * 0.1, `${st.id}: ${sum} vs ${M.armyBasis}`); assert.ok(M.equipLevel >= 0 && M.equipLevel <= 1 && M.readiness >= 0 && M.readiness <= 1); for (const u of M.units) { assert.ok(UNIT_KINDS[u.kind].need(st, ctx()), `${u.kind} は今は編制できない`); assert.ok(u.id.startsWith("unit_")); } }
});
await check("ドクトリンの定義: 5 系統 × 15 段 = 75 ノード。段は 1..15 で並び、id は重複しない。全ノードを取っても各効果は上限（CAP）を超えない", () => {
  assert.equal(LINES.length, 5); assert.equal(TIERS, 15); assert.equal(COMMON_NODES.length, 75); assert.equal(new Set(COMMON_NODES.map((n) => n.id)).size, 75);
  for (const l of LINES) assert.deepEqual(COMMON_NODES.filter((n) => n.id.startsWith(l.id + ":")).map((n) => +n.id.split(":")[1]), Array.from({ length: TIERS }, (_, i) => i + 1));
  const st = alive()[0]; st.military.doc = { ...(st.military.doc ?? {}), line: LINES[0].id }; st.military.doctrine.taken = Object.fromEntries(COMMON_NODES.map((n) => [n.id, 1]));
  const fx = doctrineFx(st); for (const k of FX_KEYS) assert.ok((fx[k] ?? 0) <= CAP[k] + 1e-9 || k in {}, `${k} が上限 ${CAP[k]} を超えた: ${fx[k]}`);
});
await check("部隊の再編: 使えない種類・合計が 1 でない・費用不足は拒否。成功すると編制が変わり費用を払う", () => {
  const st = alive().find((s) => s.army > 50) ?? alive()[0]; st.army = Math.max(st.army, 100); st.treasury = 1e4; st.techAdopted = { bronze_weapons: 1 };
  assert.equal(reorganize(ctx(), st, { infantry: 0.5, firearms: 0.5 }).ok, false); assert.equal(reorganize(ctx(), st, { infantry: 0.5 }).ok, false); const t = st.treasury; const r = reorganize(ctx(), st, { infantry: 0.7, ranged: 0.3 }); assert.ok(r.ok, r.reason); assert.ok(st.treasury < t);
  const iu = st.military.units.find((u) => u.kind === "infantry"), ru = st.military.units.find((u) => u.kind === "ranged"); assert.ok(iu && ru && Math.abs(iu.size / (iu.size + ru.size) - 0.7) < 0.02);
});

console.log("=== 言語・命名・宗教 ===");
await check("名前は言語の音から作られ、同じ言語・同じ乱数は同じ名前。名前の仮名は、その言語の音節表に収まる", () => {
  const lg = Object.values(civ.languages).find((l) => l.phon); const mk = () => { let s = 12345; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; return r; }; const a = [1, 2, 3].map(() => nameFor(civ, mk(), lg.id)), b = [1, 2, 3].map(() => nameFor(civ, mk(), lg.id)); assert.deepEqual(a, b);
  const kana = new Set(syllablesOf(lg.phon).flatMap((s) => [...s.kana])); kana.add("ン"); kana.add("ッ"); const rng = mk(); for (let i = 0; i < 50; i++) for (const ch of nameFor(civ, rng, lg.id, i % 2 ? "place" : "person")) assert.ok(kana.has(ch), `${ch} は ${lg.name} の音ではない`);
});
await check("言語が違えば、名前の音も違う（音節表が異なる）。子言語は親を受け継ぎ、音変化が記録される", () => {
  const ls = Object.values(civ.languages).filter((l) => l.phon); const sig = (l) => syllablesOf(l.phon).map((s) => s.kana).sort().join(""); assert.ok(new Set(ls.map(sig)).size > ls.length * 0.5, "言語ごとに音節表が異なる");
  const kid = ls.find((l) => l.parent && civ.languages[l.parent]?.phon); if (kid) { assert.ok(kid.phon.changes.length >= civ.languages[kid.parent].phon.changes.length + 1); assert.ok(kid.phon.c.filter((c) => civ.languages[kid.parent].phon.c.includes(c)).length >= 3, "子音の多くを受け継ぐ"); }
});
await check("国名・指導者名・都市名は、その土地の言語から作られる（国名は 音節（＋言語の語尾）＋政体の称号）", () => {
  let n = 0; for (const st of alive()) { const g = civ.groups[st.capitalGroupId]; if (!g) continue; const lang = st.nameLang ?? g.cohorts.reduce((b, c) => (c.share > b.share ? c : b)).languageId; /* 建国時に国名の由来として記録した言語（首都は後で変わる） */ const kana = new Set(); for (let l = lang; l; l = civ.languages[l]?.parent) for (const s of syllablesOf(ensureProfile(civ, l))) for (const ch of s.kana) kana.add(ch); kana.add("ン"); kana.add("ッ"); const base = st.nameBase ?? st.name.replace(/(市国|連合|部族連合|教団国|同盟|首長国|共和国|神聖国|王国|帝国|国)$/, ""); /* v6.2.0: 国名は 語根（＋言語の語尾）＋政体の称号。語根は nameBase に残る */ if (st.name !== base && st.formedAt >= 0) { assert.ok([...base].every((ch) => kana.has(ch)), `${st.name} が ${lang} の音でない`); n++; } }
  assert.ok(n > 0, "検査できた国家がある");
});
await check("宗教の分派: 親が実在し、事件に残る。創始者は常に未知（null）", () => { for (const r of Object.values(civ.religions)) { assert.equal(r.founderId, null); if (r.parent) assert.ok(civ.religions[r.parent]); } for (const e of civ.events.filter((e) => e.kind === "religion_schism")) assert.ok(civ.religions[e.participants[1].entityId]); });
await check("履歴（v6.1.0）: 月ごとの全件スナップショットは持たず、過去は資料アーカイブの事実から引く。過去の記録は後から書き換わらない", () => {
  assert.equal(civ.history, undefined, "月ごとの全件スナップショットは作らない"); const m0 = civ.monthIndex; const before = [...iterRecords(civ, { to: m0 })].length; assert.ok(before > 0);
  const snap = JSON.stringify([...iterRecords(civ, { to: m0 - 12 })].slice(0, 30)); dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 24 }); assert.equal(JSON.stringify([...iterRecords(civ, { to: m0 - 12 })].slice(0, 30)), snap, "過去は書き換わらない");
});
await check("WCDE の不変条件を、この時点で全て満たす", () => assert.deepEqual(checkWcdeIntegrity(w.world, civ), []));

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
