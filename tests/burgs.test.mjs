import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadFromBytes } from "../js/io/loader.js";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { planAddBurg, planMoveBurg, planRenameBurg, planRemoveBurg, planSetCapital, whyCannotRemoveBurg, estimatePopulation } from "../js/core/edit/burgs.js";
import { checkIntegrity, snapshotBaseline } from "../js/core/edit/integrity.js";
import { serializeAzgaar } from "../js/io/azgaar-writer.js";
import { parseAzgaarText } from "../js/io/azgaar-reader.js";

const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const fp = (m) => JSON.stringify(m.pack.burgs) + "|" + JSON.stringify(m.pack.cells.burg) + "|" + JSON.stringify(m.pack.states.map((s) => s?.burgs));
const freeLandCell = (map, exclude = new Set()) => { const c = map.pack.cells; for (let i = 0; i < c.biome.length; i++) if (c.biome[i] !== 0 && !c.burg[i] && !exclude.has(i)) return i; return -1; };

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const { map } = await loadFromBytes(new Uint8Array(readFileSync(`${SAMPLES}/${f}`)), Delaunator);
  const store = createStore({ map });
  const baseline = snapshotBaseline(map);
  const initial = fp(map);

  console.log("--- 追加 ---");
  const cell1 = freeLandCell(map);
  const rnd = createRandom(1);
  const est = estimatePopulation(map, cell1, rnd);
  check("人口の見積もりが正の数", est > 0);
  const stateBefore = map.pack.states[map.pack.cells.state[cell1]];
  const burgsCountBefore = stateBefore.burgs;
  const { command: c1, id } = planAddBurg(map, { cell: cell1, name: "新開拓地", rnd });
  store.commit(c1);
  const nb = map.pack.burgs[id];
  check("都市が追加される", nb.name === "新開拓地" && nb.cell === cell1);
  check("セルに都市IDが設定される", map.pack.cells.burg[cell1] === id);
  check("国家の都市数が+1", stateBefore.burgs === burgsCountBefore + 1);
  check("国家・文化がそのセルの値になる", nb.state === map.pack.cells.state[cell1] && nb.culture === map.pack.cells.culture[cell1]);
  check("整合性が保たれる", checkIntegrity(map, baseline).length === 0, checkIntegrity(map, baseline).join(" / "));
  store.undo();
  check("Undo で完全に元に戻る", fp(map) === initial);
  store.redo();

  console.log("--- 首都にして追加 ---");
  const cell2 = freeLandCell(map, new Set([cell1]));
  const targetState = map.pack.cells.state[cell2];
  const oldCapitalId = map.pack.states[targetState].capital;
  const before2 = fp(map);
  const { command: c2, id: id2 } = planAddBurg(map, { cell: cell2, name: "新首都", capital: true, rnd });
  store.commit(c2);
  check("新しい都市が首都になる", map.pack.burgs[id2].capital === 1 && map.pack.states[targetState].capital === id2);
  check("元の首都は普通の都市に戻る", map.pack.burgs[oldCapitalId].capital === 0);
  check("国家の中心セルが動く", map.pack.states[targetState].center === cell2);
  check("整合性が保たれる", checkIntegrity(map, baseline).length === 0, checkIntegrity(map, baseline).join(" / "));
  store.undo();
  check("Undo で元に戻る（全データ）", fp(map) === before2);
  store.undo();
  check("Undo で最初の状態まで戻る", fp(map) === initial);

  console.log("--- 移動・改名 ---");
  store.commit(c1);
  const cell3 = freeLandCell(map, new Set([cell1]));
  const oldXY = [nb.x, nb.y];
  store.commit(planMoveBurg(map, id, cell3));
  check("移動後、位置が変わる", nb.cell === cell3 && (nb.x !== oldXY[0] || nb.y !== oldXY[1]));
  check("元のセルの都市IDが消える", map.pack.cells.burg[cell1] === 0);
  check("新しいセルの都市IDが設定される", map.pack.cells.burg[cell3] === id);
  check("移動先の国家・文化に更新される", nb.state === map.pack.cells.state[cell3] && nb.culture === map.pack.cells.culture[cell3]);
  check("整合性が保たれる", checkIntegrity(map, baseline).length === 0, checkIntegrity(map, baseline).join(" / "));
  check("水域への移動は例外", (() => { try { planMoveBurg(map, id, map.pack.cells.biome.indexOf(0)); return false; } catch { return true; } })());
  let threwOccupied = false; try { planMoveBurg(map, id, map.pack.burgs.find((b) => b && b.i && !b.removed && b.i !== id).cell); } catch { threwOccupied = true; } check("都市のあるセルへの移動は例外", threwOccupied);
  check("同じセルへの移動は変更なし", planMoveBurg(map, id, nb.cell) === null);
  store.commit(planRenameBurg(map, id, "改称タウン"));
  check("改名できる", nb.name === "改称タウン");
  check("空文字への改名は例外", (() => { try { planRenameBurg(map, id, "  "); return false; } catch { return true; } })());
  check("同じ名前は変更なし", planRenameBurg(map, id, "改称タウン") === null);

  console.log("--- 削除の保護 ---");
  const cap = map.pack.burgs.find((b) => b && b.i && !b.removed && b.capital);
  check("首都は削除できない理由が返る", whyCannotRemoveBurg(map, cap.i) !== null);
  check("首都の削除は例外", (() => { try { planRemoveBurg(map, cap.i); return false; } catch { return true; } })());
  check("普通の都市は削除できる", whyCannotRemoveBurg(map, id) === null);

  console.log("--- 削除・Undo ---");
  const stateOfId = map.pack.states[nb.state];
  const countBefore = stateOfId.burgs;
  const beforeRemove = fp(map);
  store.commit(planRemoveBurg(map, id));
  check("削除される", map.pack.burgs[id].removed === true);
  check("セルの都市IDが消える", map.pack.cells.burg[cell3] === 0);
  check("国家の都市数が-1", stateOfId.burgs === countBefore - 1);
  check("整合性が保たれる", checkIntegrity(map, baseline).length === 0, checkIntegrity(map, baseline).join(" / "));
  store.undo();
  check("Undo で復活する（全データ）", fp(map) === beforeRemove);
  store.commit(planRemoveBurg(map, id));
  let threwTwice = false; try { planRemoveBurg(map, id); } catch { threwTwice = true; }
  check("削除済みの都市はさらに削除できない", threwTwice);
  store.undo(); // 復活させて、後続のテストに影響しないようにする

  console.log("--- 首都の変更（既存都市） ---");
  const otherState = map.pack.states.find((s) => s && s.i && !s.removed && s.i !== stateOfId.i && s.capital);
  if (otherState) {
    const otherBurgInState = map.pack.burgs.find((b) => b && b.i && !b.removed && b.state === otherState.i && !b.capital);
    if (otherBurgInState) {
      const oldCap = map.pack.burgs[otherState.capital];
      store.commit(planSetCapital(map, otherState.i, otherBurgInState.i));
      check("新しい都市が首都になる", otherBurgInState.capital === 1 && otherState.capital === otherBurgInState.i);
      check("元の首都は普通の都市に戻る", oldCap.capital === 0);
      check("首都を他国の都市にはできない", (() => { try { planSetCapital(map, otherState.i, cap.i); return false; } catch { return true; } })());
      store.undo();
    }
  }

  console.log("--- 異常系 ---");
  check("水域への追加は例外", (() => { try { planAddBurg(map, { cell: map.pack.cells.biome.indexOf(0), name: "x" }); return false; } catch { return true; } })());
  check("都市のあるセルへの追加は例外", (() => { try { planAddBurg(map, { cell: cap.cell, name: "x" }); return false; } catch { return true; } })());
  check("名前なしの追加は例外", (() => { try { planAddBurg(map, { cell: freeLandCell(map), name: "" }); return false; } catch { return true; } })());
  check("存在しない都市の移動は例外", (() => { try { planMoveBurg(map, 999999, freeLandCell(map)); return false; } catch { return true; } })());

  // 巻き戻して基準に揃える
  while (store.undo());
  check("最終的に全Undoで最初の状態に一致", fp(map) === initial);

  console.log("--- ファズ: 追加・移動・削除の連続 ---");
  const rnd2 = createRandom(777);
  let ops = 0;
  for (let i = 0; i < 150; i++) {
    const alive = map.pack.burgs.map((b, i2) => (b && b.i && !b.removed ? i2 : null)).filter((x) => x !== null);
    const action = rnd2.pick(["add", "add", "move", "rename", "remove"]);
    try {
      if (action === "add") {
        const cell = freeLandCell(map);
        if (cell < 0) continue;
        store.commit(planAddBurg(map, { cell, name: `村${i}`, rnd: rnd2 }).command);
      } else if (action === "move") {
        const id3 = rnd2.pick(alive); const cell = freeLandCell(map);
        if (cell < 0) continue;
        const cmd = planMoveBurg(map, id3, cell); if (cmd) store.commit(cmd);
      } else if (action === "rename") {
        const id3 = rnd2.pick(alive); const cmd = planRenameBurg(map, id3, `改${i}`); if (cmd) store.commit(cmd);
      } else {
        const id3 = rnd2.pick(alive); if (whyCannotRemoveBurg(map, id3)) continue;
        store.commit(planRemoveBurg(map, id3));
      }
      ops++;
    } catch { /* 想定内の失敗は無視 */ }
  }
  const problems = checkIntegrity(map, baseline);
  check(`ファズ ${ops}回後も整合性が健全`, problems.length === 0, problems.slice(0, 3).join(" / "));
  const finalFp = fp(map);
  let undone = 0; while (store.undo()) undone++;
  check(`全Undo(${undone}回)で最初の状態に一致`, fp(map) === initial);
  let redone = 0; while (store.redo()) redone++;
  check("全Redoで最終状態に一致", fp(map) === finalFp && redone === undone);
  while (store.undo());

  console.log("--- 書き出しに反映される ---");
  const cellX = freeLandCell(map);
  store.commit(planAddBurg(map, { cell: cellX, name: "テスト都市X" }).command);
  const text = serializeAzgaar(map);
  const reread = parseAzgaarText(text).map;
  check("再読み込みで新しい都市が残る", reread.pack.burgs.some((b) => b && b.name === "テスト都市X"));
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
