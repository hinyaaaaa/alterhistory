import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadFromBytes } from "../js/io/loader.js";
import { createStore } from "../js/core/store.js";
import { planSetAttributes, getAttributes, normalizeAttributes, MAX_ATTRS } from "../js/core/edit/attributes.js";
import { serializeAzgaar } from "../js/io/azgaar-writer.js";
import { parseAzgaarText } from "../js/io/azgaar-reader.js";
import { attachExtension } from "../js/io/native-format.js";

const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

console.log("=== normalizeAttributes ===");
check("空キーは除かれる", Object.keys(normalizeAttributes([["", "x"], [" ", "y"], ["技術水準", "中世"]])).length === 1);
check("前後の空白を取り除く", normalizeAttributes([[" 技術水準 ", " 中世 "]])["技術水準"] === "中世");
check("同じキーは後のものが勝つ", normalizeAttributes([["k", "1"], ["k", "2"]])["k"] === "2");
let threw = false; try { normalizeAttributes([["x".repeat(201), "y"]]); } catch { threw = true; }
check("長すぎる名前は例外", threw);
threw = false; try { normalizeAttributes(Array.from({ length: MAX_ATTRS + 1 }, (_, i) => [`k${i}`, "v"])); } catch { threw = true; }
check(`${MAX_ATTRS}件を超えると例外`, threw);

const { map } = await loadFromBytes(new Uint8Array(readFileSync(`${SAMPLES}/境界線の貴方.map`)), Delaunator);
const store = createStore({ map });
console.log("=== 設定・Undo・書き出し ===");
check("最初は空", getAttributes(map, "state", 3).length === 0);
const c1 = planSetAttributes(map, "state", 3, [["技術水準", "中世"], ["政体", "封建制"]]);
store.commit(c1);
check("属性が読める", JSON.stringify(getAttributes(map, "state", 3)) === '[["技術水準","中世"],["政体","封建制"]]');
check("他の国家には影響しない", getAttributes(map, "state", 4).length === 0);
check("同じ内容の再設定は変更なし", planSetAttributes(map, "state", 3, [["技術水準", "中世"], ["政体", "封建制"]]) === null);
const c2 = planSetAttributes(map, "state", 3, [["技術水準", "近代"]]);
store.commit(c2);
check("上書きできる（無くなったキーは消える）", JSON.stringify(getAttributes(map, "state", 3)) === '[["技術水準","近代"]]');
store.undo();
check("Undo で前の内容に戻る", JSON.stringify(getAttributes(map, "state", 3)) === '[["技術水準","中世"],["政体","封建制"]]');
store.undo();
check("Undo で空に戻る", getAttributes(map, "state", 3).length === 0);
check("ext.data.attributes 自体が消える（空オブジェクトを残さない）", map.ext?.data?.attributes === undefined);
store.redo(); store.redo();
const c3 = planSetAttributes(map, "state", 3, []);
store.commit(c3);
check("空にすると削除される", getAttributes(map, "state", 3).length === 0 && map.ext?.data?.attributes === undefined);
store.undo();

const native = serializeAzgaar(map, { native: true, exportedAt: "x" });
const back = parseAzgaarText(native).map;
attachExtension(back.map ?? back);
const reread = back.map ?? back;
check("ALTERHISTORY形式で保存して読み戻せる", JSON.stringify(getAttributes(reread, "state", 3)) === '[["技術水準","近代"]]');
const azgaar = serializeAzgaar(map, { native: false });
check("Azgaar互換では属性が失われる（目印が無いため）", !azgaar.includes("技術水準"));

console.log("=== 対象の検証 ===");
threw = false; try { planSetAttributes(map, "burg", 1, [["x", "y"]]); } catch { threw = true; }
check("都市には属性を付けられない（未対応）", threw);
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
