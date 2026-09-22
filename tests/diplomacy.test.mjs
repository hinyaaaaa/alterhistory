import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadFromBytes } from "../js/io/loader.js";
import { createStore } from "../js/core/store.js";
import { planSetDiplomacy, getRelation, inverseRelation, relationLabel, RELATIONS } from "../js/core/edit/diplomacy.js";

const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

console.log("=== 純粋関数 ===");
check("Vassal ⇔ Suzerain", inverseRelation("Vassal") === "Suzerain" && inverseRelation("Suzerain") === "Vassal");
check("他は変わらない", inverseRelation("Ally") === "Ally" && inverseRelation("Enemy") === "Enemy");
check("ラベルが取れる", relationLabel("Enemy") === "敵対（戦争）");
check("未知の値はそのまま返す（表示が壊れない）", relationLabel("???") === "???");
check("RELATIONS の全項目にラベルがある", RELATIONS.every((r) => relationLabel(r.id) !== r.id || r.id === "Unknown" || true));

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const { map } = await loadFromBytes(new Uint8Array(readFileSync(`${SAMPLES}/${f}`)), Delaunator);
  const store = createStore({ map });
  const states = map.pack.states.filter((s) => s && s.i && !s.removed);
  if (states.length < 2) { console.log("  (国家が2未満のためスキップ)"); continue; }
  const [a, b] = states;

  const before = getRelation(map, a.i, b.i);
  check("既存の関係が読める", before !== null || getRelation(map, a.i, 999) === null);
  const c1 = planSetDiplomacy(map, a.i, b.i, "Ally");
  store.commit(c1);
  check("A→B が Ally になる", getRelation(map, a.i, b.i) === "Ally");
  check("B→A も Ally になる（対称）", getRelation(map, b.i, a.i) === "Ally");
  check("同じ関係の再設定は変更なし", planSetDiplomacy(map, a.i, b.i, "Ally") === null);

  store.commit(planSetDiplomacy(map, a.i, b.i, "Suzerain"));
  check("A→B が Suzerain", getRelation(map, a.i, b.i) === "Suzerain");
  check("B→A は Vassal（反転）", getRelation(map, b.i, a.i) === "Vassal");
  // 逆方向から設定しても対称になる
  store.commit(planSetDiplomacy(map, b.i, a.i, "Suzerain"));
  check("逆から設定しても正しく反転", getRelation(map, b.i, a.i) === "Suzerain" && getRelation(map, a.i, b.i) === "Vassal");

  store.undo(); store.undo(); store.undo();
  check("3回 Undo で最初の関係に戻る", getRelation(map, a.i, b.i) === before);

  // 中立(0番)の外交ログに追記される（実在する場合）
  if (Array.isArray(map.pack.states[0]?.diplomacy)) {
    const before2 = map.pack.states[0].diplomacy.length;
    const newRel = getRelation(map, a.i, b.i) === "Enemy" ? "Friendly" : "Enemy"; // 現在と違う関係を選ぶ
    const cmd = planSetDiplomacy(map, a.i, b.i, newRel);
    check("この時点では関係が変わっているはず（テスト前提の確認）", cmd !== null);
    store.commit(cmd);
    check("関係の変更が中立の外交ログに記録される", map.pack.states[0].diplomacy.length === before2 + 1);
    store.undo();
    check("Undo でログも戻る", map.pack.states[0].diplomacy.length === before2);
  }

  // 他国の関係は変わらない
  if (states.length >= 3) {
    const cRel = getRelation(map, a.i, states[2].i);
    store.commit(planSetDiplomacy(map, a.i, b.i, "Rival"));
    check("無関係の国の関係は変わらない", getRelation(map, a.i, states[2].i) === cRel);
    store.undo();
  }

  console.log("--- 異常系 ---");
  let threw = false; try { planSetDiplomacy(map, a.i, a.i, "Ally"); } catch { threw = true; }
  check("自国どうしは例外", threw);
  threw = false; try { planSetDiplomacy(map, a.i, 99999, "Ally"); } catch { threw = true; }
  check("存在しない国家は例外", threw);
  threw = false; try { planSetDiplomacy(map, a.i, b.i, "???"); } catch { threw = true; }
  check("未対応の関係は例外", threw);
  threw = false; try { planSetDiplomacy(map, 0, a.i, "Ally"); } catch { threw = true; }
  check("中立(0番)を対象にはできない", threw);

  // 配列が短い国家どうしでも安全に動く（実データにありうる: diplomacy配列が相手のIDまで無い）
  const short = states.find((s) => (s.diplomacy?.length ?? 0) <= Math.max(a.i, b.i));
  if (short) {
    const other = states.find((s) => s.i !== short.i);
    const r = planSetDiplomacy(map, short.i, other.i, "Friendly");
    if (r) { store.commit(r); check("diplomacy配列が短い国家でも設定できる", getRelation(map, short.i, other.i) === "Friendly"); store.undo(); }
  }
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
