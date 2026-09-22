import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseAzgaarBytes, parseAzgaarText, isLegacySettings, compareVersions, MapParseError } from "../js/io/azgaar-reader.js";
import { validateMap, cellCount } from "../js/core/model.js";
// テスト用の実マップの置き場所。既定は開発環境のパス。SAMPLES_DIR=... で変更できる
const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
import { buildGeometry, GeometryError } from "../js/core/derive.js";

const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failed++;
};
const throwsWith = (fn, Cls) => { try { fn(); return false; } catch (e) { return e instanceof Cls; } };

const LINE_STATES = 14;
const files = ["境界線の貴方.map", "新世界より.map"];
for (const f of files) {
  console.log("=====", f);
  const buf = readFileSync(SAMPLES + "/" + f);
  const t0 = performance.now();
  const { map, warnings } = parseAzgaarBytes(buf);
  check("読み込み完了", true, `${(performance.now() - t0).toFixed(0)}ms`);
  check("バージョン取得", !!map.meta.version, map.meta.version);
  check("旧形式(パイプ区切り)と判定", map.settings.format === "legacy");
  check("設定が新形式の構造に正規化される", map.settings.options?.units?.distance?.unit === "km", `単位=${map.settings.options?.units?.distance?.unit}`);
  check("座標(旧L2)を取得", map.coordinates?.latT !== undefined);
  const n = cellCount(map);
  check("セル数 > 0", n > 0, `cells=${n}`);
  check("都市/国家/文化/宗教あり", map.pack.burgs.length > 1 && map.pack.states.length > 1 && map.pack.cultures.length > 1 && map.pack.religions.length > 1);
  check("マーカー(L35)を取得", map.markers.length > 0 && "icon" in map.markers[0], `n=${map.markers.length}`);
  check("計測線(L46)を取得", map.measurers.length === 1 && Array.isArray(map.measurers[0].points));
  check("交易(L43)を取得", map.deals.length > 0, `n=${map.deals.length}`);
  check("namesbase 43件", map.namesbase.length === 43);
  check("警告なし", warnings.length === 0, warnings.slice(0, 3).join(" / "));
  check("整合性検証(形状なし)", validateMap(map).length === 0, validateMap(map).slice(0, 2).join(" / "));

  // 形状の取り付け
  buildGeometry(map, Delaunator);
  check("形状を取り付け", map.geometry.pack.p.length === n, `cells=${map.geometry.pack.p.length}`);
  check("整合性検証(形状あり)", validateMap(map).length === 0);

  // 原文保持の網羅: 解釈しない行が元の位置に保持されている
  const raw = readFileSync(SAMPLES + "/" + f).toString("utf-8").split("\r\n");
  const keys = Object.keys(map.passthrough).map(Number);
  check("原文保持行が元と一致", keys.every((i) => map.passthrough[i] === raw[i]), `${keys.length}行`);
}

console.log("=== 判定ロジック ===");
check("バージョン比較", compareVersions("1.151.1", "1.152.0") < 0 && compareVersions("1.153.1", "1.152.0") > 0 && compareVersions("1.152.0", "1.152.0") === 0);
check("旧: 1.151 + パイプ形式", isLegacySettings("1.151.1", "km|2|square") === true);
check("新: 1.153 + JSON", isLegacySettings("1.153.1", '{"seed":"1"}') === false);
check("新: 古い版番号でもJSONなら新形式", isLegacySettings("1.100.0", '{"seed":"1"}') === false);

console.log("=== 新形式（合成データ。実ファイルでの検証ではない） ===");
{
  const src = readFileSync(SAMPLES + "/新世界より.map").toString("utf-8").split("\r\n");
  const lines = src.slice();
  lines[0] = lines[0].replace(/^[^|]+/, "1.153.1");
  lines[1] = JSON.stringify({ seed: "42", lore: { name: "合成マップ" }, geography: { coordinates: { latT: 1, latN: 2, latS: 3, lonT: 4, lonW: 5, lonE: 6 } }, units: { distance: { unit: "里", scale: 5 } } });
  lines[2] = ""; lines[4] = "";
  const { map } = parseAzgaarText(lines.join("\r\n"));
  check("JSON設定を新形式と判定", map.settings.format === "json");
  check("名前を取得", map.meta.name === "合成マップ");
  check("座標を設定から取得", map.coordinates?.latT === 1);
  check("単位を取得", map.settings.options.units.distance.unit === "里");
  check("廃止された空のL4でも読める", Array.isArray(map.notes) && map.notes.length === 0);
}

console.log("=== 異常系 ===");
check("空ファイルはエラー", throwsWith(() => parseAzgaarText(""), MapParseError));
{
  const lf = readFileSync(SAMPLES + "/新世界より.map").toString("utf-8").replace(/\r\n/g, "\n");
  let msg = "";
  try { parseAzgaarText(lf); } catch (e) { msg = e.message; }
  check("LFのみのファイルは原因つきエラー", msg.includes("LF"), msg.slice(0, 60));
}
{
  const { map } = parseAzgaarText(readFileSync(SAMPLES + "/新世界より.map").toString("utf-8"));
  map.pack.cells.state.pop(); map.pack.cells.biome.pop();
  check("形状とセル数が食い違えばエラー", throwsWith(() => buildGeometry(map, Delaunator), GeometryError));
}
{
  const src = readFileSync(SAMPLES + "/新世界より.map").toString("utf-8").split("\r\n");
  src[LINE_STATES] = "{壊れたJSON";
  const { map, warnings } = parseAzgaarText(src.join("\r\n"));
  check("壊れたJSON行は警告つきで既定値", warnings.length === 1 && map.pack.states.length === 0, warnings[0]?.slice(0, 40));
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
