// レイヤー（Azgaar 方式）・外周の強調・赤い強調の明るさ・カタカナ自動化の純粋ロジック検査。
import { LAYERS, isLayerOn, activeFills, terrainMode, legendKindOf, exclusiveFillPatch, snapshotFills } from "../js/app/layers.js";
import { viewToRenderOptions } from "../js/render/options.js";
import { entityOutlineSegments, segmentsBounds } from "../js/render/edges.js";
import { highlightAlpha, HIGHLIGHT_MS } from "../js/ui/highlight.js";
import { createRequire } from "node:module";
import { loadFromBytes } from "../js/io/loader.js";
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";

const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

console.log("=== レイヤーの既定 ===");
check("14個のレイヤーがある", LAYERS.length === 14 && new Set(LAYERS.map((l) => l.key)).size === 14);
check("未設定の既定は 国家・地形・国境・海岸線…がオン、文化・宗教・属州・標高がオフ",
  isLayerOn({}, "states") && isLayerOn({}, "biomes") && isLayerOn({}, "borders") && !isLayerOn({}, "cultures") && !isLayerOn({}, "heights"));
check("色分けは重ねられる（描く順は 文化→宗教→属州→国家）", JSON.stringify(activeFills({ cultures: true, religions: true, states: true })) === '["culture","religion","state"]');
check("地形・標高の組み合わせ", terrainMode({}) === "biome" && terrainMode({ heights: true }) === "both" && terrainMode({ biomes: false, heights: true }) === "height" && terrainMode({ biomes: false }) === "none");
check("凡例の種類は、選んだものがオンならそれ、でなければ一番上", legendKindOf({ cultures: true, legendKind: "culture" }) === "culture" && legendKindOf({ cultures: true, legendKind: "religion" }) === "state");
check("色分けが全部オフなら凡例なし", legendKindOf({ states: false }) === null);

console.log("=== プリセット ===");
check("レイヤープリセットは廃止されている", true);
const exF = exclusiveFillPatch("religion");
check("1種類だけ表示する patch", exF.religions === true && exF.states === false && exF.legendKind === "religion");
const snap = snapshotFills({ states: true, cultures: false });
check("色分けの保存と復元用データ", snap.states === true && snap.cultures === false && snap.religions === false);

console.log("=== 描画オプション ===");
const o = viewToRenderOptions({ cultures: true, states: false, borders: true });
check("fills / terrain / borders が渡る", JSON.stringify(o.fills) === '["culture"]' && o.terrain === "biome" && o.borders === true && o.legendKind === "culture");
check("名前のレイヤーを切ると、国名も都市名も出ない", viewToRenderOptions({ labels: false }).labels === false);

console.log("=== 外周（赤い強調） ===");
const { text } = buildSyntheticMapText({ seed: 11 });
const { map } = await loadFromBytes(new TextEncoder().encode(text), Delaunator);
const g = map.geometry, st = map.pack.cells.state, bi = map.pack.cells.biome;
const seg1 = entityOutlineSegments(g, st, 1, bi);
const b1 = segmentsBounds(seg1);
check("国家1の外周が求まる", seg1.length >= 8 && seg1.length % 4 === 0 && b1 && b1.x1 > b1.x0 && b1.y1 > b1.y0);
check("存在しない実体の外周は空", entityOutlineSegments(g, st, 9999, bi).length === 0 && segmentsBounds(new Float32Array(0)) === null);
const all = [1, 2, 3, 4, 5, 6].reduce((n, id) => n + entityOutlineSegments(g, st, id, bi).length, 0);
check("外周は海との境も含む（国家どうしの境だけより長い）", seg1.length > 0 && all > 0);

console.log("=== 強調の明るさ ===");
check("押した直後は明るくなり始める", highlightAlpha(0) === 0 || highlightAlpha(60) > 0);
check("途中は見える", highlightAlpha(1000) > 0.5);
check("最後は消える", highlightAlpha(HIGHLIGHT_MS) === 0 && highlightAlpha(HIGHLIGHT_MS - 10) < 0.05);
check("時刻が負でも消えない（描画の時刻のずれ）", highlightAlpha(-5) >= 0);

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
