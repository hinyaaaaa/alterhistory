import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadFromBytes } from "../js/io/loader.js";
import { createStore } from "../js/core/store.js";
import { planAddMarker, planMoveMarker, planEditMarker, planRemoveMarker, defaultMarkerName } from "../js/core/edit/markers.js";
import { planSetNote, getNote } from "../js/core/edit/notes.js";
import { serializeAzgaar } from "../js/io/azgaar-writer.js";
import { parseAzgaarText } from "../js/io/azgaar-reader.js";

const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const fp = (m) => JSON.stringify(m.markers) + "|" + JSON.stringify(m.notes);

check("既定名の変換", defaultMarkerName("hot-springs") === "Hot springs" && defaultMarkerName("mines") === "Mines" && defaultMarkerName("") === "Marker");

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const { map } = await loadFromBytes(new Uint8Array(readFileSync(`${SAMPLES}/${f}`)), Delaunator);
  const store = createStore({ map });
  const initial = fp(map);
  const maxId = Math.max(...map.markers.map((m) => m.i));
  const land = map.pack.cells.biome.findIndex((b) => b !== 0);

  console.log("--- 追加 ---");
  const { command: c1, id } = planAddMarker(map, { cell: land, type: "ruins", icon: "🏛️", name: "古の遺跡" });
  check("新しいIDは最大+1", id === maxId + 1);
  store.commit(c1);
  const added = map.markers.find((m) => m.i === id);
  check("マーカーが追加される", !!added && added.name === "古の遺跡" && added.cell === land);
  check("座標がセルの位置になる", added.x === map.geometry.pack.p[land][0] && added.y === map.geometry.pack.p[land][1]);
  store.undo();
  check("Undo で消える（全データ一致）", fp(map) === initial);
  store.redo();
  check("Redo で戻る", map.markers.some((m) => m.i === id));

  console.log("--- 名前省略 ---");
  const { id: id2 } = planAddMarker(map, { cell: land + 1 < map.pack.cells.biome.length ? land + 1 : land, type: "mines" });
  store.commit(planAddMarker(map, { cell: land, type: "mines" }).command);
  const m2 = map.markers.find((mk) => mk.i > id);
  check("名前省略時は既定名になる", m2.name === "Mines");
  store.undo();

  console.log("--- 移動・編集 ---");
  const before = { ...added };
  const otherCell = map.pack.cells.biome.findIndex((b, i) => b !== 0 && i !== added.cell);
  store.commit(planMoveMarker(map, id, otherCell));
  check("移動後、座標がそのセルになる", added.cell === otherCell && added.x === map.geometry.pack.p[otherCell][0]);
  check("同じセルへの移動は変更なし", planMoveMarker(map, id, otherCell) === null);
  store.undo();
  check("Undo で元の位置に戻る", added.cell === before.cell && added.x === before.x && added.y === before.y);

  store.commit(planEditMarker(map, id, { icon: "⚡", name: "再命名" }));
  check("アイコンと名前が変わる（種類は変わらない）", added.icon === "⚡" && added.name === "再命名" && added.type === "ruins");
  check("変化のない編集は null", planEditMarker(map, id, { icon: "⚡" }) === null);
  store.undo();
  check("Undo で元に戻る", added.icon === "🏛️" && added.name === "古の遺跡");

  console.log("--- 文章つきで削除・Undo ---");
  store.commit(planSetNote(map, "marker", id, "特別な伝承がある場所。"));
  check("文章が読める", getNote(map, "marker", id) === "特別な伝承がある場所。");
  const beforeDelete = fp(map);
  store.commit(planRemoveMarker(map, id));
  check("マーカーが消える", !map.markers.some((m) => m.i === id));
  check("文章も消える(旧形式ならnotes配列から)", getNote(map, "marker", id) === "");
  store.undo();
  check("Undo でマーカーと文章の両方が戻る", fp(map) === beforeDelete && getNote(map, "marker", id) === "特別な伝承がある場所。");
  store.undo(); store.undo(); // ノート設定、移動確認用の再追加ぶんを戻す
  store.undo();

  console.log("--- 異常系 ---");
  let threw = false; try { planAddMarker(map, { cell: -1, type: "x" }); } catch { threw = true; }
  check("範囲外セルへの追加は例外", threw);
  threw = false; try { planMoveMarker(map, 999999, land); } catch { threw = true; }
  check("存在しないマーカーの移動は例外", threw);
  threw = false; try { planRemoveMarker(map, 999999); } catch { threw = true; }
  check("存在しないマーカーの削除は例外", threw);

  console.log("--- 書き出しに反映される ---");
  const { command: cAdd } = planAddMarker(map, { cell: land, type: "statues", icon: "🗿", name: "石像" });
  store.commit(cAdd);
  const text = serializeAzgaar(map);
  const reread = parseAzgaarText(text).map;
  check("再読み込みでマーカーが残る", reread.markers.some((m) => m.name === "石像" && m.icon === "🗿"));
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
