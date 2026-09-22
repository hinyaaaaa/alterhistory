// 塗り替えの検証。実マップに対して、単発の塗りと、ランダムな編集の連続（ファズ）で
// 「整合性が保たれること」「Undo で完全に元に戻ること」「Redo で再現できること」を確かめる。
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadFromBytes } from "../js/io/loader.js";
import { createStore } from "../js/core/store.js";
import { createCellIndex } from "../js/core/spatial.js";
import { planPaint, planBiomePaint, PAINT_KINDS } from "../js/core/edit/paint.js";
import { checkIntegrity, snapshotBaseline } from "../js/core/edit/integrity.js";
import { createRandom } from "../js/core/random.js";

// テスト用の実マップの置き場所。既定は開発環境のパス。SAMPLES_DIR=... で変更できる
const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const fingerprint = (m) => JSON.stringify([m.pack.cells.state, m.pack.cells.culture, m.pack.cells.religion, m.pack.cells.province, m.pack.cells.biome,
  m.pack.states, m.pack.cultures, m.pack.religions, m.pack.provinces, m.pack.burgs]);
const load = async (f) => (await loadFromBytes(new Uint8Array(readFileSync(`${SAMPLES}/${f}`)), Delaunator)).map;
const liveIds = (list) => list.filter((e) => e && e.i && !e.removed).map((e) => e.i);

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  let map = await load(f);
  const store = createStore({ map }, { historyLimit: 5000 });
  const baseline = snapshotBaseline(map);
  const idx = createCellIndex(map.geometry.pack.p);
  const P = map.geometry.pack.p;
  const c = map.pack.cells;

  check("編集前の整合性（baseline基準）は健全", checkIntegrity(map, baseline).length === 0);

  console.log("--- 単発の塗り ---");
  const states = liveIds(map.pack.states);
  const [sa, sb] = states;
  // 国家 sa の土地のうち、都市も首都も無い陸セルを数個選び、sb に塗る
  const plain = []; for (let i = 0; i < c.state.length && plain.length < 6; i++) if (c.state[i] === sa && c.biome[i] !== 0 && !c.burg[i]) plain.push(i);
  const before = fingerprint(map);
  const r1 = planPaint(map, { kind: "state", target: sb, cells: plain });
  check("計画しただけでは地図は変わらない", fingerprint(map) === before);
  check("変更件数が報告される", r1.report.changed === plain.length, JSON.stringify(r1.report));
  const nA = map.pack.states[sa].cells, nB = map.pack.states[sb].cells;
  store.commit(r1.command);
  check("セルの持ち主が変わる", plain.every((i) => c.state[i] === sb));
  check("両国のセル数が更新される", map.pack.states[sa].cells === nA - plain.length && map.pack.states[sb].cells === nB + plain.length);
  check("整合性が保たれる", checkIntegrity(map, baseline).length === 0, checkIntegrity(map, baseline).slice(0, 2).join(" / "));
  store.undo();
  check("Undo で完全に元に戻る（全データ）", fingerprint(map) === before);
  store.redo(); store.undo();
  check("Redo→Undo でも元に戻る", fingerprint(map) === before);

  console.log("--- 都市・首都・属州・水域 ---");
  const capCell = map.pack.burgs[map.pack.states[sa].capital].cell;
  const rc = planPaint(map, { kind: "state", target: sb, cells: [capCell] });
  check("首都のセルは塗り替えられない（保護）", rc.command === null && rc.report.skippedProtected === 1);
  const rcf = planPaint(map, { kind: "state", target: sb, cells: [capCell], force: true });
  check("force なら首都のセルも塗れる（合併用）", rcf.command !== null);
  const water = c.biome.indexOf(0);
  const rw = planPaint(map, { kind: "state", target: sb, cells: [water] });
  check("水域は塗れない", rw.command === null && rw.report.skippedWater === 1);
  // 都市のあるセル（首都以外）
  const burgCell = map.pack.burgs.find((b) => b && b.i && !b.removed && b.state === sa && !b.capital && !Object.values(map.pack.provinces).some((p) => p?.burg === b.i)).cell;
  const rb = planPaint(map, { kind: "state", target: sb, cells: [burgCell] });
  const burg = map.pack.burgs[c.burg[burgCell]];
  const urbanA = map.pack.states[sa].urban;
  store.commit(rb.command);
  check("都市も新しい国に移る", burg.state === sb && c.state[burgCell] === sb);
  check("都市人口が両国で移る", Math.abs(map.pack.states[sa].urban - (urbanA - burg.population)) < 1e-6);
  check("都市の属州は外れる(他国の属州のため)", c.province[burgCell] === 0 || map.pack.provinces[c.province[burgCell]].state === sb);
  check("整合性が保たれる", checkIntegrity(map, baseline).length === 0, checkIntegrity(map, baseline).slice(0, 2).join(" / "));
  store.undo();
  check("Undo で元に戻る", fingerprint(map) === before);
  const eraseBurg = planPaint(map, { kind: "state", target: 0, cells: [burgCell] });
  check("都市のあるセルは無所属にできない", eraseBurg.command === null && eraseBurg.report.skippedProtected === 1);

  console.log("--- 属州・文化・宗教・地形 ---");
  const prov = map.pack.provinces.find((p) => p && p.i && !p.removed);
  const other = []; for (let i = 0; i < c.state.length && other.length < 4; i++) if (c.state[i] === prov.state && c.province[i] !== prov.i && c.biome[i] !== 0 && !c.burg[i]) other.push(i);
  const rp = planPaint(map, { kind: "province", target: prov.i, cells: other });
  store.commit(rp.command);
  check("属州を塗れる", other.every((i) => c.province[i] === prov.i));
  check("整合性（属州）", checkIntegrity(map, baseline).length === 0, checkIntegrity(map, baseline).slice(0, 2).join(" / "));
  store.undo();
  const foreign = []; for (let i = 0; i < c.state.length && foreign.length < 3; i++) if (c.state[i] !== prov.state && c.biome[i] !== 0) foreign.push(i);
  const rf = planPaint(map, { kind: "province", target: prov.i, cells: foreign });
  check("他国の土地には属州を塗れない", rf.command === null && rf.report.skippedForeign === foreign.length);

  const cul = liveIds(map.pack.cultures).slice(0, 2);
  const cc = []; for (let i = 0; i < c.culture.length && cc.length < 5; i++) if (c.culture[i] !== cul[1] && c.biome[i] !== 0) cc.push(i);
  store.commit(planPaint(map, { kind: "culture", target: cul[1], cells: cc }).command);
  check("文化を塗る + 整合性", cc.every((i) => c.culture[i] === cul[1]) && checkIntegrity(map, baseline).length === 0, checkIntegrity(map, baseline).slice(0, 2).join(" / "));
  store.undo();
  const rel = liveIds(map.pack.religions)[0];
  const rr = []; for (let i = 0; i < c.religion.length && rr.length < 5; i++) if (c.religion[i] !== rel && c.biome[i] !== 0) rr.push(i);
  store.commit(planPaint(map, { kind: "religion", target: rel, cells: rr }).command);
  check("宗教を塗る + 整合性(都市人口を含む)", rr.every((i) => c.religion[i] === rel) && checkIntegrity(map, baseline).length === 0, checkIntegrity(map, baseline).slice(0, 2).join(" / "));
  store.undo();
  const land = []; for (let i = 0; i < c.biome.length && land.length < 5; i++) if (c.biome[i] !== 0) land.push(i);
  const bt = map.biomesData.find((b) => b.i !== 0 && b.i !== c.biome[land[0]]).i;
  const rbm = planBiomePaint(map, { target: bt, cells: [...land, c.biome.indexOf(0)] });
  check("地形を塗る（水域は除く）", rbm.report.skippedWater === 1 && rbm.report.changed >= 1);
  let threw = false; try { planBiomePaint(map, { target: 0, cells: land }); } catch { threw = true; }
  check("海には塗れない（例外）", threw);
  check("消しゴム(0)で属州を外せる", planPaint(map, { kind: "province", target: 0, cells: [c.province.findIndex((v) => v > 0)] }).command !== null);
  let t2 = false; try { planPaint(map, { kind: "state", target: 999, cells: [0] }); } catch { t2 = true; }
  check("存在しない対象は例外", t2);
  check("同じ値を塗っても変更なし", planPaint(map, { kind: "state", target: c.state[plain[0]], cells: plain }).command === null);

  console.log("--- ファズ: ランダムな編集400回 → Undo/Redo ---");
  const rnd = createRandom(20260921);
  const initial = fingerprint(map);
  const kinds = Object.keys(PAINT_KINDS);
  let applied = 0, skipped = 0;
  const snapshots = [];
  store.replace({ map });   // 履歴をリセット
  for (let step = 0; step < 400; step++) {
    const kind = rnd.pick(kinds);
    const ids = [0, ...liveIds(map.pack[PAINT_KINDS[kind].list])];
    const target = rnd.pick(ids);
    const cx = rnd.float(0, 1280), cy = rnd.float(0, 774);
    const cells = idx.findWithin(cx, cy, rnd.float(10, 90));
    const bt2 = rnd.chance(0.12);
    let plan;
    try { plan = bt2 ? planBiomePaint(map, { target: rnd.int(1, 12), cells }) : planPaint(map, { kind, target, cells }); }
    catch { skipped++; continue; }
    if (!plan.command) { skipped++; continue; }
    store.commit(plan.command); applied++;
    if (step % 40 === 0) { const probs = checkIntegrity(map, baseline); if (probs.length) { check(`ステップ${step}で整合性が崩れた`, false, probs.slice(0, 3).join(" / ")); break; } }
    if (step % 100 === 99) snapshots.push([applied, fingerprint(map)]);
  }
  const finalProblems = checkIntegrity(map, baseline);
  check(`ランダム編集 ${applied}回（見送り${skipped}回）の後も整合性が健全`, finalProblems.length === 0, finalProblems.slice(0, 3).join(" / "));
  const finalFp = fingerprint(map);
  check("編集で実際にデータが変わっている", finalFp !== initial);
  let undone = 0; while (store.undo()) undone++;
  check(`全てUndo(${undone}回)で最初の状態と完全一致（全データ）`, fingerprint(map) === initial);
  let redone = 0; while (store.redo()) redone++;
  check(`全てRedo(${redone}回)で最終状態と完全一致`, fingerprint(map) === finalFp && redone === undone);
  while (store.undo());
  check("Redo後にもう一度全Undoしても最初と一致", fingerprint(map) === initial);
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
