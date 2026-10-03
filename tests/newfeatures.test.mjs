// 新機能（実体の新規作成・属州の独立・国家の統合・時代区分・外交年表・ランキング）の実データ検証
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadFromBytes } from "../js/io/loader.js";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { planAddEntity, planAddProvince } from "../js/core/edit/entities.js";
import { planDeclareIndependence, planMergeStates, listSovereigntyLog } from "../js/core/edit/sovereignty.js";
import { listEras, eraAt, planSetEra, planRemoveEra } from "../js/core/edit/eras.js";
import { planSetDiplomacy, listDiplomacyLog, getRelation } from "../js/core/edit/diplomacy.js";
import { rankStates, stateRank, statePopulation, stateMilitaryPower } from "../js/core/query.js";
import { checkIntegrity, snapshotBaseline } from "../js/core/edit/integrity.js";
import { serializeAzgaar } from "../js/io/azgaar-writer.js";
import { parseAzgaarText } from "../js/io/azgaar-reader.js";
import { attachExtension } from "../js/io/native-format.js";
import { ensureExt } from "../js/core/edit/ext.js";
import { planCreateAlliance, planDissolveAlliance, listAlliances } from "../js/core/edit/alliances.js";

const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const live = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
const rnd = createRandom ? createRandom(1) : undefined;

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const { map } = await loadFromBytes(new Uint8Array(readFileSync(`${SAMPLES}/${f}`)), Delaunator);
  const store = createStore({ map });
  const baseline = snapshotBaseline(map);
  const c = map.pack.cells;

  console.log("--- バイオーム（旧形式の版も含む） ---");
  check("バイオームの名前と色が読める", map.biomesData.length >= 2 && !!map.biomesData[1].name && /^#/.test(map.biomesData[1].color));

  console.log("--- 実体の新規作成 ---");
  for (const [kind, key] of [["state", "states"], ["culture", "cultures"], ["religion", "religions"]]) {
    const n0 = map.pack[key].filter(live).length;
    const { command, id } = planAddEntity(map, { kind, name: "テスト" + kind, rnd });
    store.commit(command);
    check(`${kind}が1つ増える`, map.pack[key].filter(live).length === n0 + 1);
    check(`${kind}の名前・色が入る`, map.pack[key][id].name === "テスト" + kind && /^#[0-9a-f]{6}$/.test(map.pack[key][id].color));
    store.undo();
    check(`${kind}のUndoで元に戻る`, map.pack[key].filter(live).length === n0);
  }
  check("空の名前は例外", throws(() => planAddEntity(map, { kind: "state", name: "  " })));
  const anyState = map.pack.states.find(live);
  { const { command, id } = planAddProvince(map, { state: anyState.i, name: "新属州", rnd }); store.commit(command);
    check("属州が作れて、所属国家が入る", map.pack.provinces[id].state === anyState.i); store.undo(); }
  check("存在しない国家の属州は例外", throws(() => planAddProvince(map, { state: 99999, name: "x" })));

  console.log("--- 属州の独立 ---");
  const prov = map.pack.provinces.find((p) => live(p) && c.province.some((v) => v === p.i));
  if (!prov) { console.log("  (セルを持つ属州が無いためスキップ)"); }
  else {
    const provCells = []; for (let i = 0; i < c.province.length; i++) if (c.province[i] === prov.i) provCells.push(i);
    const from = map.pack.states[prov.state];
    const fromCells0 = from.cells, nStates0 = map.pack.states.filter(live).length, nMarkers0 = map.markers.length;
    const { command, id: newId } = planDeclareIndependence(map, { provinceId: prov.i, name: "独立国", rnd, date: { year: 5, month: 2 } });
    store.commit(command);
    check("新しい国家が1つ増える", map.pack.states.filter(live).length === nStates0 + 1);
    check("属州の全セルが新国家のものになる", provCells.every((i) => c.state[i] === newId));
    check("元の国家のセル数が独立した分だけ減る", from.cells === fromCells0 - provCells.length, `${fromCells0} → ${from.cells}`);
    check("新国家のセル数が一致する", map.pack.states[newId].cells === provCells.length);
    check("属州が新国家に付け替わる", map.pack.provinces[prov.i].state === newId);
    check("独立マーカーが立つ", map.markers.length === nMarkers0 + 1 && map.markers.at(-1).type === "independence");
    check("年表ログに年月付きで残る", JSON.stringify(listSovereigntyLog(map).at(-1)).includes('"year":5') && listSovereigntyLog(map).at(-1).type === "independence");
    const issues = checkIntegrity(map, baseline);
    check("独立後に新たな整合性違反が出ない", issues.length === 0, issues.slice(0, 3).join(" / "));
    store.undo();
    check("Undoで国家数が戻る", map.pack.states.filter(live).length === nStates0);
    check("Undoでセルの所属が戻る", provCells.every((i) => c.state[i] === prov.state));
    check("Undoで元の国家のセル数が戻る", from.cells === fromCells0);
    check("Undoでマーカーと年表ログも戻る", map.markers.length === nMarkers0 && listSovereigntyLog(map).length === 0);
  }

  console.log("--- 全属州の独立（総当たり） ---");
  { let ok = 0, refused = 0, bad = [];
    const snap = JSON.stringify([map.pack.cells.state.slice(0, 500), map.pack.states.filter(live).map((s) => [s.i, s.cells, s.capital])]);
    for (const p of map.pack.provinces.filter((p) => live(p) && c.province.includes(p.i))) {
      let plan; try { plan = planDeclareIndependence(map, { provinceId: p.i, name: "総当たり", rnd, date: { year: 1, month: 1 } }); } catch (e) { refused++; if (!e.message) bad.push("理由なしの例外"); continue; }
      store.commit(plan.command);
      const issues = checkIntegrity(map, baseline);
      if (issues.length) bad.push(`属州#${p.i}: ${issues[0]}`); else ok++;
      store.undo();
    }
    check("独立できた属州は全て整合性を保つ", bad.length === 0, bad.slice(0, 3).join(" / "));
    check(`総当たり後にUndoで完全に元通り (成功${ok}/拒否${refused})`, snap === JSON.stringify([map.pack.cells.state.slice(0, 500), map.pack.states.filter(live).map((s) => [s.i, s.cells, s.capital])])); }

  console.log("--- 国家の統合 ---");
  const ss = map.pack.states.filter(live);
  if (ss.length < 2) { console.log("  (国家が2未満のためスキップ)"); }
  else {
    const [a, b] = ss; const aCells = []; for (let i = 0; i < c.state.length; i++) if (c.state[i] === a.i) aCells.push(i);
    const bCells0 = b.cells, nMarkers0 = map.markers.length;
    store.commit(planMergeStates(map, { from: a.i, to: b.i, date: { year: 9, month: 4 } }));
    check("統合元は解散扱いになる", a.removed === true);
    check("統合元の全セルが統合先になる", aCells.every((i) => c.state[i] === b.i));
    check("統合先のセル数が合算される", b.cells === bCells0 + aCells.length, `${bCells0} → ${b.cells}`);
    check("統合元の属州は統合先に引き継がれる", map.pack.provinces.filter((p) => live(p) && p.state === a.i).length === 0);
    check("統合マーカーと年表ログが残る", map.markers.length === nMarkers0 + 1 && listSovereigntyLog(map).at(-1).type === "merge");
    check("統合後に国家一覧から消える", !rankStates(map, "cells").some((r) => r.id === a.i));
    { const issues = checkIntegrity(map, baseline);
      check("統合後に新たな整合性違反が出ない", issues.length === 0, issues.slice(0, 3).join(" / ")); }
    check("同じ国家どうしは例外", throws(() => planMergeStates(map, { from: b.i, to: b.i })));
    check("解散済みの国家は統合できない", throws(() => planMergeStates(map, { from: a.i, to: b.i })));
    store.undo();
    check("Undoで統合元が復活する", !a.removed && aCells.every((i) => c.state[i] === a.i) && b.cells === bCells0);
  }

  console.log("--- 時代区分 ---");
  store.commit(planSetEra(map, { name: "江戸時代", fromYear: 1603 }));
  store.commit(planSetEra(map, { name: "近代", fromYear: 1868 }));
  check("2つ登録できる", listEras(map).length === 2);
  check("1700年は江戸時代", eraAt(map, 1700)?.name === "江戸時代");
  check("1868年から近代", eraAt(map, 1868)?.name === "近代" && eraAt(map, 1867)?.name === "江戸時代");
  check("最初の時代より前は無し", eraAt(map, 1500) === null);
  const edo = listEras(map)[0];
  store.commit(planSetEra(map, { id: edo.id, name: "徳川時代", fromYear: 1600 }));
  check("編集できる", eraAt(map, 1601)?.name === "徳川時代");
  check("空の名前は例外", throws(() => planSetEra(map, { name: "", fromYear: 1 })));
  store.commit(planRemoveEra(map, edo.id));
  check("削除できる", listEras(map).length === 1);
  store.undo(); check("削除のUndo", listEras(map).length === 2);

  console.log("--- 外交の年表 ---");
  const [x, y] = map.pack.states.filter(live);
  if (y) {
    const before = listDiplomacyLog(map).length;
    const rel = getRelation(map, x.i, y.i) === "Ally" ? "Enemy" : "Ally"; // 現在と違う関係にする
    store.commit(planSetDiplomacy(map, x.i, y.i, rel, { year: 3, month: 6 }));
    const e = listDiplomacyLog(map).at(-1);
    check("変更が年月付きで記録される", listDiplomacyLog(map).length === before + 1 && e.year === 3 && e.month === 6 && e.to === rel);
    check("関係が実際に変わる", getRelation(map, x.i, y.i) === rel);
    store.undo();
    check("Undoでログも戻る", listDiplomacyLog(map).length === before);
  }

  console.log("--- 保存して開き直しても残るか ---");
  { const ss2 = map.pack.states.filter(live);
    const prov2 = map.pack.provinces.find((p) => live(p) && c.province.includes(p.i));
    store.commit(planDeclareIndependence(map, { provinceId: prov2.i, name: "保存テスト国", rnd, date: { year: 1700, month: 6 } }).command);
    store.commit(planCreateAlliance(map, "保存同盟", [ss2[0].i, ss2[1].i], { year: 1701, month: 2 }).command);
    store.commit(planDissolveAlliance(map, listAlliances(map).at(-1).id, { year: 1705, month: 9 }));
    const relNow = getRelation(map, ss2[0].i, ss2[1].i) === "Enemy" ? "Ally" : "Enemy";
    store.commit(planSetDiplomacy(map, ss2[0].i, ss2[1].i, relNow, { year: 1702, month: 3 }));
    map.worldTime = { year: 1700, month: 6 };
    ensureExt(map).data.worldTime = { ...map.worldTime }; // 保存操作(actions.js)と同じ
    const text = serializeAzgaar(map, { native: true, exportedAt: "x" });
    const back = parseAzgaarText(text); attachExtension(back.map); const m2 = back.map;
    check("年月が残る", m2.worldTime.year === 1700 && m2.worldTime.month === 6, JSON.stringify(m2.worldTime));
    check("時代区分が残る", listEras(m2).length === listEras(map).length && listEras(m2).some((e) => e.name === "近代"));
    check("独立の年表が残る", listSovereigntyLog(m2).some((l) => l.type === "independence" && l.year === 1700 && l.month === 6));
    check("外交の年表が残る", listDiplomacyLog(m2).some((l) => l.year === 1702 && l.month === 3));
    const al = listAlliances(m2).find((a) => a.name === "保存同盟");
    check("同盟の結成・解消年月が残る", al && al.formedAt.year === 1701 && al.dissolvedAt.year === 1705);
    check("独立した国家と首都が残る", m2.pack.states.some((s) => live(s) && s.name === "保存テスト国" && m2.pack.burgs[s.capital]?.state === s.i));
    check("独立マーカーが残る", m2.markers.some((mk) => mk.type === "independence"));
    check("Azgaar互換の書き出しでも壊れない", (() => { try { const t = serializeAzgaar(map, { native: false, exportedAt: "x" }); return !!parseAzgaarText(t).map; } catch { return false; } })());
  }

  console.log("--- ランキング ---");
  const ranked = rankStates(map, "population");
  check("人口順に並ぶ", ranked.every((r, i) => i === 0 || ranked[i - 1].value >= r.value));
  check("順位が1から振られる", ranked[0].rank === 1 && ranked.at(-1).rank === ranked.length);
  const st = map.pack.states.find(live);
  check("stateRankが一致する", stateRank(map, st.i, "population").rank === ranked.find((r) => r.id === st.i).rank);
  check("人口は農村+都市", statePopulation(st) === (st.rural ?? 0) + (st.urban ?? 0));
  check("部隊が無ければ軍事力0", stateMilitaryPower({ military: [] }) === 0);
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
