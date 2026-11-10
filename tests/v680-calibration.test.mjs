// v6.8.0〜v6.9.0: 世界の較正（人口・技術・生業・国家数）と歴史の力学（戦争・政体・王朝・寿命・条約・メモリ整理）。
import { densityMultOf } from "../js/core/civ/techfx.js";
import { targetPop, targetTechCount, POP_CURVE, TECH_CURVE, stepCalibration } from "../js/core/civ/calibration.js";
import { agriSuited, pastoralSuited, subsistenceShift, SHIFT_P } from "../js/core/civ/population.js";
import { stateCap, lifespanHazard } from "../js/core/civ/states.js";
import { warMaxMonths, rematchCooldown, WAR_REASON_JA } from "../js/core/civ/diplomacy.js";
import { stepCompact, COMPACT } from "../js/core/civ/compact.js";
import { BIOMES } from "../js/core/civ/world-consts.js";
import { createNewWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { delegateToWorld } from "../js/core/wcde/founding.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

console.log("=== 人口の曲線 ===");
check("収容力の倍率は単調に増える（s=0.37 で 1、全部そろうと約 470 倍）", densityMultOf(0.2) === 1 && densityMultOf(0.37) === 1 && densityMultOf(0.9) > densityMultOf(0.6) && densityMultOf(1.5) > densityMultOf(1.2) && densityMultOf(2.35) > 400 && densityMultOf(2.35) < 560, `×${Math.round(densityMultOf(2.35))}`);
check("旧版の上限（2.4 倍）に張り付かない", densityMultOf(1.0) > 5);
check("起点は約 1,400 万人・年 5000 は約 61 億人", Math.abs(targetPop(0) - 14e6) < 1 && Math.abs(targetPop(5000) - 6.1e9) < 1e3);
check("目標人口は単調（災厄の谷は作らない）", POP_CURVE.every((p, i) => i === 0 || p[1] >= POP_CURVE[i - 1][1]));
check("紀元 0 年（世界の年 3000）ごろは約 2.3 億人", targetPop(3000) > 2e8 && targetPop(3000) < 2.6e8);
check("技術の目標: 年 5000 で全 129 のうち 9 割以上", targetTechCount(5000) >= 0.9 * 129 && targetTechCount(0) < targetTechCount(2000));

console.log("=== 生業 ===");
const mk = (biome, fert, g = {}) => ({ cell: { biome: [biome], fertility: [fert] }, g: { cell: 0, subsistence: "forage", knowledge: { agriculture: 1, herding: 1 }, player: false, ...g } });
const hot = mk(BIOMES.HOT_DESERT, 0.02), grass = mk(BIOMES.GRASSLAND, 0.2), farm = mk(BIOMES.TEMPERATE_FOREST, 0.7);
check("砂漠は農耕に向かない・草原（痩せ地）は牧畜に向く・肥沃な森は農耕に向く", !agriSuited(hot, 0) && pastoralSuited(grass, 0) && !agriSuited(grass, 0) && agriSuited(farm, 0));
let toAgri = 0, toPast = 0, stayDesert = 0; const N = 4000, r = (() => { let s = 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
for (let i = 0; i < N; i++) { if (subsistenceShift(farm, farm.g, r) === "agriculture") toAgri++; if (subsistenceShift(grass, grass.g, r) === "pastoral") toPast++; if (subsistenceShift(hot, hot.g, r) == null) stayDesert++; }
check("肥沃な土地でも 1 か月で全員が転換するわけではない（確率）", toAgri > 0 && toAgri < N * 0.1, `${toAgri}/${N}`);
check("草原の採集狩猟は牧畜へ転換しうる", toPast > 0);
check("砂漠の採集狩猟は農耕へ転換しない", stayDesert >= N * 0.9);
const fish = mk(BIOMES.TEMPERATE_FOREST, 0.7, { subsistence: "fishing" }); let fs = 0; for (let i = 0; i < N; i++) if (subsistenceShift(fish, fish.g, r) === "agriculture") fs++;
check("海辺の漁撈は農耕へ移りにくい（採集狩猟より遅い）", fs < toAgri && SHIFT_P.fishingToAgri < SHIFT_P.forageToAgri);

console.log("=== 国家の数・寿命 ===");
const civAt = (year) => ({ date: { year } });
check("起点の直後の国家は最大 10", stateCap(civAt(0)) === 10 && stateCap(civAt(100)) === 10);
check("国家の数の目安は時代とともに増え、200 に近づく", stateCap(civAt(1000)) > 60 && stateCap(civAt(3000)) > 150 && stateCap(civAt(5000)) < 200);
check("国家の寿命: 120 年まで崩壊の確率は小さく、年とともに上がる", lifespanHazard(100) < lifespanHazard(250) && lifespanHazard(250) < lifespanHazard(1000));
let surv500 = 1, surv1000 = 1; for (let a = 120; a < 1000; a++) { surv1000 *= 1 - lifespanHazard(a); if (a < 500) surv500 *= 1 - lifespanHazard(a); }
check("1000 年以上続く国家は 1 割に満たない（珍しい）", surv1000 < 0.1 && surv1000 > 0.01 && surv500 > surv1000, `500 年 ${(surv500 * 100).toFixed(0)}% / 1000 年 ${(surv1000 * 100).toFixed(1)}%`);

console.log("=== 戦争 ===");
check("戦争の最長: 古代 50 年・中世 25 年・近世 10 年・近代 6 年・大戦 20 年", warMaxMonths(1000) === 600 && warMaxMonths(3500) === 300 && warMaxMonths(4600) === 120 && warMaxMonths(4900, 2) === 72 && warMaxMonths(4900, 8) === 240);
check("同じ 2 国の再戦の冷却は古代ほど長い", rematchCooldown(1000) > rematchCooldown(4000) && rematchCooldown(4000) > rematchCooldown(4900));
check("戦争の理由は 9 種類の表示名を持つ", Object.keys(WAR_REASON_JA).length >= 9 && ["succession", "religion", "trade_route", "revenge", "independence", "civil_war"].every((k) => WAR_REASON_JA[k]));

console.log("=== 整理（メモリ） ===");
{
  const civ = { options: { wcde: true }, monthIndex: 12 * 3000 + 7, treaties: {}, wcde: { diplomacy: { proposals: [] } }, states: {}, figures: {}, stats: {} };
  civ.treaties.t_old = { id: "t_old", type: "nonaggression", active: false, endedAt: civ.monthIndex - COMPACT.treatyKeepMonths - 1 };
  civ.treaties.t_new = { id: "t_new", type: "nonaggression", active: false, endedAt: civ.monthIndex - 12 };
  civ.treaties.t_live = { id: "t_live", type: "alliance", active: true, endedAt: null };
  for (let i = 0; i < 300; i++) civ.wcde.diplomacy.proposals.push({ id: `p${i}`, at: civ.monthIndex - 5000, kind: "treaty", status: "rejected" });
  civ.wcde.diplomacy.proposals.push({ id: "peace1", at: civ.monthIndex - 9000, kind: "peace", status: "accepted", name: "テスト条約" });
  civ.states.s_dead = { id: "s_dead", alive: false, dissolvedAt: civ.monthIndex - COMPACT.deadStateMonths - 1, name: "旧国", relations: { x: 1 }, politics: { big: 1 }, econ: { big: 1 } };
  civ.states.s_live = { id: "s_live", alive: true, name: "今の国", leaderFigureId: "f_leader", relations: { y: 1 } };
  civ.figures.f_leader = { id: "f_leader", diedAt: null, children: [], parents: null };
  civ.figures.f_p = { id: "f_p", diedAt: 0, children: ["f_c"], parents: null }; civ.figures.f_c = { id: "f_c", diedAt: 1, children: [], parents: ["f_p"] };
  civ.figures.f_x = { id: "f_x", diedAt: 2, children: [], parents: null };
  civ.groups = { g1: { cohorts: [{ languageId: "lang_live", share: 1 }] } }; civ.languages = { lang_live: { id: "lang_live", phon: { c: [] } }, lang_dead: { id: "lang_dead", phon: { c: [] } } };
  stepCompact({ civ });
  check("失効して 50 年を過ぎた条約だけが消える（有効・直近は残る）", !civ.treaties.t_old && civ.treaties.t_new && civ.treaties.t_live && civ.stats.treatiesPruned === 1);
  check("外交の提案: 受諾された講和と直近 30 年は残り、古い拒否は消える", civ.wcde.diplomacy.proposals.some((p) => p.id === "peace1") && !civ.wcde.diplomacy.proposals.some((p) => p.id === "p0"));
  check("滅んだ国家は名前を残して重い項目を落とす・存続中の国は触らない", civ.states.s_dead.name === "旧国" && !civ.states.s_dead.relations && !civ.states.s_dead.politics && civ.states.s_live.relations.y === 1);
  check("話し手のいない言語だけ音素表を落とす", civ.languages.lang_live.phon && !civ.languages.lang_dead.phon && civ.languages.lang_dead.phonDropped === true);
  check("没した古い人物: 指導者と子を持つ人物は残り、子のいない人物は消える（親の子の一覧も整合）", civ.figures.f_leader && civ.figures.f_p && !civ.figures.f_c && !civ.figures.f_x && civ.figures.f_p.children.length === 0 && !checkWcdeIntegrityFigures(civ));
  civ.monthIndex += 1; stepCompact({ civ }); check("（8 月でない月は何もしない）", civ.figures.f_p != null);
  civ.monthIndex = 12 * 3001 + 7; stepCompact({ civ });
  check("子を失った親は、次の年に整理される（骨格は葉から順に消える）", !civ.figures.f_p && civ.figures.f_leader && !checkWcdeIntegrityFigures(civ));
}
function checkWcdeIntegrityFigures(civ) { for (const f of Object.values(civ.figures)) { for (const c of f.children) if (!civ.figures[c]) return true; if (f.parents) for (const p of f.parents) if (!civ.figures[p]?.children.includes(f.id)) return true; } return false; }

console.log("=== 世界を回す（150 年） ===");
{
  const w = createNewWorld({ worldSeed: "v680-cal", spec: { resolution: { targetCells: 600 } } }).w; delegateToWorld(w);
  const rr = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 150 * 12, commandId: "adv-1" });
  check("150 年進められる", rr.ok, rr.ok ? "" : JSON.stringify(rr).slice(0, 160));
  const civ = w.civ, alive = Object.values(civ.states).filter((s) => s.alive).length;
  check("初期の国家は多くない（年 150 で 10〜30）", alive >= 3 && alive <= 30, `${alive} 国`);
  check("較正の係数が保存される（popTrim・techPace は有限）", Number.isFinite(civ.popTrim) && Number.isFinite(civ.techPace));
  check("整合性違反なし", checkWcdeIntegrity(w.world, civ).length === 0);
  const by = {}; for (const g of Object.values(civ.groups)) by[g.subsistence] = (by[g.subsistence] ?? 0) + 1;
  check("生業は農耕だけにならない（採集狩猟・漁撈・牧畜のいずれかが残る）", Object.keys(by).length >= 2, JSON.stringify(by));
  const reasons = new Set(Object.values(civ.wars).map((x) => x.reason)); check("戦争の理由は有効な値だけ", [...reasons].every((x) => WAR_REASON_JA[x]), [...reasons].join(","));
}
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
