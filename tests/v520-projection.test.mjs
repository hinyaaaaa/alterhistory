// v5.2: 投影ヘルパー（core/world/projection.js）の検査。順変換・逆変換の往復、極域バンド、a のズーム連動、折り返し。
import { createProjection, projectY, unprojectY, aForZoom, simFrame, wrapX, wrapLon, POLAR_LAT, A_WORLD, A_DEEP, A_STEP } from "../js/core/world/projection.js";

let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const D = (d) => (d * Math.PI) / 180;

console.log("== projectY / unprojectY");
for (const a of [0.8, 0.9, 1]) {
  let worst = 0; for (let d = -80; d <= 80; d += 2.5) worst = Math.max(worst, Math.abs(unprojectY(projectY(D(d), a), a) - D(d)));
  check(`a=${a}: 緯度 ±80° の往復誤差が 1e-12 rad 未満`, worst < 1e-12, `最大 ${worst.toExponential(2)}`);
  check(`a=${a}: 赤道は y=0・北が正・単調増加`, near(projectY(0, a), 0) && projectY(D(10), a) > 0 && projectY(D(60), a) > projectY(D(30), a));
}
check("a=1 は Mercator（ln tan(π/4+φ/2)）と一致", near(projectY(D(45), 1), Math.log(Math.tan(Math.PI / 4 + D(45) / 2))));
check("a=0.8 は a=1 より極側が緩やか", projectY(D(75), 0.8) < projectY(D(75), 1));

console.log("== createProjection（W=2048）");
const P = createProjection({ a: A_WORLD, mapWidth: 2048 });
check("±80° の表示高さの縦横比（幅 / 高さ）が約 1.7:1", near(2048 / P.height, 1.70, 0.02), `${(2048 / P.height).toFixed(3)}`);
check("極域バンドを足した全体の高さ = 高さ + 2×バンド", P.totalHeight === P.height + 2 * P.band && P.band > 0);
check("北緯 80° が y=0、南緯 80° が y=height", near(P.latToY(POLAR_LAT), 0, 1e-6) && near(P.latToY(-POLAR_LAT), P.height, 1e-6));
check("赤道が中央", near(P.latToY(0), P.height / 2, 1e-6));
check("北極が上端のバンド外縁（y=−band）、南極が下端（y=height+band）", near(P.latToY(Math.PI / 2), -P.band, 1e-6) && near(P.latToY(-Math.PI / 2), P.height + P.band, 1e-6));
{ let worst = 0, mono = true, prev = -Infinity;
  for (let d = 90; d >= -90; d -= 0.25) { const y = P.latToY(D(d)); if (y < prev) mono = false; prev = y; worst = Math.max(worst, Math.abs(P.yToLat(y) - D(d))); }
  check("緯度 ±90° 全域で往復誤差が 1e-9 rad 未満", worst < 1e-9, `最大 ${worst.toExponential(2)}`);
  check("緯度 → y は北から南へ単調（バンドも含めて逆転しない）", mono); }

console.log("== sim 座標 ⇄ 表示座標（表で引いた変換が厳密な式と一致する）");
{ const S = simFrame(2048); let worst = 0, back = 0;
  for (let ys = 0; ys <= S.H; ys += 7.3) { const lat = S.fromSim(0, ys).lat, exact = P.latToY(lat); worst = Math.max(worst, Math.abs(P.simYToDisplay(ys) - exact)); back = Math.max(back, Math.abs(P.displayToSimY(P.simYToDisplay(ys)) - ys)); }
  check("表引きの誤差が 0.05 画素未満", worst < 0.05, `最大 ${worst.toFixed(4)}`);
  check("sim → 表示 → sim の往復誤差が 0.01 sim 画素未満", back < 0.01, `最大 ${back.toFixed(5)}`);
  const [x, y] = S.toSim(D(35), D(139)), r = S.fromSim(x, y);
  check("球面 → sim → 球面の往復", near(r.lat, D(35), 1e-12) && near(r.lon, D(139), 1e-12)); }

console.log("== a のズーム連動");
check("全体表示では a=0.8", aForZoom(1) === A_WORLD);
check("拡大率 3 まで a=0.8", aForZoom(3) === A_WORLD && aForZoom(0.5) === A_WORLD);
check("拡大率 24 以上で a=1", aForZoom(24) === A_DEEP && aForZoom(500) === A_DEEP);
{ let prev = 0, mono = true, steps = new Set(); for (let z = 1; z <= 40; z *= 1.05) { const a = aForZoom(z); if (a < prev - 1e-12) mono = false; prev = a; steps.add(a); }
  check("拡大するほど a が（滑らかに）増える", mono);
  check("a は 0.025 刻みに量子化されている（表示座標の作り直しが数回で済む）", [...steps].every((a) => near(Math.round(a / A_STEP) * A_STEP, a, 1e-9)) && steps.size <= 10, `${steps.size} 段階`); }
check("不正な拡大率でも落ちない", aForZoom(NaN) === A_WORLD && aForZoom(-1) === A_WORLD && aForZoom(0) === A_WORLD);

console.log("== 折り返し");
check("wrapX は [0,W) に収める", wrapX(-1, 2048) === 2047 && wrapX(2048, 2048) === 0 && wrapX(4097, 2048) === 1);
check("wrapLon は [-π, π] に収める", near(wrapLon(Math.PI * 3), Math.PI) || near(wrapLon(Math.PI * 3), -Math.PI));
check("不正な a は拒否する", (() => { try { createProjection({ a: 0 }); return false; } catch { return true; } })());

console.log(failed ? `\n${failed} 件失敗` : "\nすべて合格");
process.exit(failed ? 1 : 0);
