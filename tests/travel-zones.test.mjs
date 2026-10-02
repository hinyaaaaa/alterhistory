// 旅（経路探索・所要時間・編集）とゾーン（編集・塗り・おまかせ）の検査。合成マップ。
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "../js/io/loader.js";
import { createRequire } from "node:module";
import { createRandom } from "../js/core/random.js";
import { TRANSPORT_BY_ID, findPath, canEndAt, legStats, journeyTotals, formatDuration, travelScale } from "../js/core/sim/travel.js";
import { planAddJourney, planEditJourney, planRemoveJourney, planAddLeg, planRemoveLeg, planChangeLegTransport, listJourneys } from "../js/core/edit/journeys.js";
import { planAddZone, planEditZone, planRemoveZone, planPaintZone, growZoneCells, zoneColor } from "../js/core/edit/zones.js";
import { placeLabel } from "../js/core/query.js";
import { renderMapToSvg } from "../js/io/exporter.js";
import { viewToRenderOptions } from "../js/render/options.js";
import { serializeAzgaar } from "../js/io/azgaar-writer.js";

let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
const load = async () => (await loadFromBytes(new TextEncoder().encode(buildSyntheticMapText({ seed: 7 }).text), Delaunator)).map;
const map = await load();
const state = { map };
const run = (c) => c.apply(state), undo = (c) => c.revert(state);
const { biome } = map.pack.cells;
const land = [], water = [];
for (let i = 0; i < biome.length; i++) (biome[i] === 0 ? water : land).push(i);
// 同じ国の中で、離れた2つの陸セル
const stateCells = (id) => land.filter((i) => map.pack.cells.state[i] === id);
const sc = stateCells(1);
const A = sc[0], B = sc[sc.length - 1];

console.log("=== 経路探索（陸） ===");
const foot = TRANSPORT_BY_ID.foot;
const r1 = findPath(map, A, B, foot);
check("陸の2点に経路が見つかる", r1.ok && r1.path[0] === A && r1.path.at(-1) === B, `${r1.path?.length}セル`);
check("経路は陸セルだけを通る", r1.path.every((c) => biome[c] !== 0));
check("隣り合うセルをたどっている", r1.path.every((c, i) => i === 0 || map.geometry.pack.cells.c[r1.path[i - 1]].includes(c)));
check("距離は画素で正", r1.distancePx > 0);
check("同じ場所なら距離0", findPath(map, A, A, foot).distancePx === 0);
const w0 = water[0];
check("陸の手段は水の上を端点にできない", !canEndAt(map, w0, foot).ok && !findPath(map, A, w0, foot).ok);
const hr = findPath(map, A, B, TRANSPORT_BY_ID.horse);
check("騎馬と徒歩は同じ経路（陸の手段は共通）", JSON.stringify(hr.path) === JSON.stringify(r1.path));

console.log("=== 経路探索（水・空・滞在） ===");
const sail = TRANSPORT_BY_ID.sail;
check("帆船は内陸の陸から乗れない", (() => { const inland = land.find((i) => !map.geometry.pack.cells.c[i].some((j) => biome[j] === 0)); return !canEndAt(map, inland, sail).ok; })());
const shore = land.filter((i) => map.geometry.pack.cells.c[i].some((j) => biome[j] === 0));
check("岸のセルからは乗れる", canEndAt(map, shore[0], sail).ok);
// 同じ海でつながる2つの岸セルを探す
let seaOk = null;
for (let a = 0; a < shore.length && !seaOk; a += 7) for (let b = shore.length - 1; b > a && !seaOk; b -= 11) { const r = findPath(map, shore[a], shore[b], sail); if (r.ok && r.path.length > 3) seaOk = { a: shore[a], b: shore[b], r }; }
check("岸から岸へ、水のセルを通る航路が見つかる", !!seaOk && seaOk.r.path.slice(1, -1).every((c) => biome[c] === 0), seaOk ? `${seaOk.r.path.length}セル` : "");
const air = findPath(map, A, B, TRANSPORT_BY_ID.air);
check("空は直線（2点）で、陸の経路より短い", air.ok && air.path.length === 2 && air.distancePx <= r1.distancePx + 1e-6);
const stay = findPath(map, A, A, TRANSPORT_BY_ID.stay);
check("滞在は移動しない", stay.ok && stay.distancePx === 0);

console.log("=== 所要時間 ===");
const leg = { transport: "foot", from: A, to: B, path: r1.path, distancePx: r1.distancePx };
const st = legStats(map, leg, foot);
check("距離 = 画素 × 縮尺", Math.abs(st.distance - r1.distancePx * travelScale(map).perPixel) < 1e-6, `${st.distance.toFixed(0)}${st.unit}`);
check("時間 = 距離 ÷ 速さ、日数 = 時間 ÷ 1日の移動時間", Math.abs(st.hours - st.distance / 3.5) < 1e-6 && Math.abs(st.days - st.hours / 8) < 1e-6, formatDuration(st.days));
const sHorse = legStats(map, { ...leg, transport: "horse" }, TRANSPORT_BY_ID.horse);
check("騎馬は徒歩より速い", sHorse.days < st.days);
check("滞在は指定した時間だけ過ぎる", Math.abs(legStats(map, { transport: "stay", stayHours: 48 }, TRANSPORT_BY_ID.stay).days - 2) < 1e-9);
check("時間の読みやすい表示", formatDuration(0.5) === "12時間" && formatDuration(3.5) === "3日12時間" && formatDuration(45) === "45日");
check("縮尺が無い地図は標準（3km/画素）で、注記用に印が付く", (() => { const m = { settings: { options: {} } }; const s = travelScale(m); return s.perPixel === 3 && s.usedDefault; })());

console.log("=== 旅の編集とUndo ===");
const add = planAddJourney(map, { name: "王の巡幸" });
run(add.command);
check("旅が作られる", listJourneys(map).length === 1 && listJourneys(map)[0].name === "王の巡幸");
const jid = add.id;
const c1 = planAddLeg(map, jid, { transport: "foot", from: A, to: B });
run(c1);
check("区間が追加され、経路が保存される", listJourneys(map)[0].legs.length === 1 && listJourneys(map)[0].legs[0].path.length > 1);
const mid = sc[Math.floor(sc.length / 2)];
const c2 = planAddLeg(map, jid, { transport: "horse", to: mid });
run(c2);
check("次の区間は前の終点から始まる", listJourneys(map)[0].legs[1].from === B);
const tot = journeyTotals(map, listJourneys(map)[0]);
// 保存する距離は小数2桁（画素）に丸めるので、完全一致ではなく 0.05km 以内
check("合計は区間の和", Math.abs(tot.distance - (st.distance + legStats(map, listJourneys(map)[0].legs[1], TRANSPORT_BY_ID.horse).distance)) < 0.05, `${tot.distance.toFixed(1)}`);
let reason = ""; try { planAddLeg(map, jid, { transport: "foot", to: water[0] }); } catch (e) { reason = e.message; }
check("行けない場所は、理由つきで拒否される", reason.includes("水の上"), reason);
const ch = planChangeLegTransport(map, jid, 0, "march"); run(ch);
check("移動手段を変えると経路を引き直す", listJourneys(map)[0].legs[0].transport === "march");
check("同じ手段への変更は変更なし", planChangeLegTransport(map, jid, 0, "march") === null);
undo(ch);
check("Undo で手段が戻る", listJourneys(map)[0].legs[0].transport === "foot");
const ed = planEditJourney(map, jid, { name: "冬の巡幸" }); run(ed);
check("名前を編集できる", listJourneys(map)[0].name === "冬の巡幸");
let threw = false; try { planEditJourney(map, jid, { name: "  " }); } catch { threw = true; }
check("空の名前は拒否", threw);
const rl = planRemoveLeg(map, jid, 1); run(rl);
check("区間を削除できる", listJourneys(map)[0].legs.length === 1);
undo(rl); undo(ed); undo(c2); undo(c1); undo(add.command);
check("全部 Undo すると旅は無くなり、ext も空に戻る", listJourneys(map).length === 0 && !("journeys" in (map.ext?.data ?? {})));

console.log("=== ゾーン ===");
const za = planAddZone(map, { name: "北部の疫病", type: "Disease", cells: sc.slice(0, 10) });
run(za.command);
check("ゾーンが作られ、本家と同じ形（name/type/color/cells）", map.zones.length === 1 && map.zones[0].type === "Disease" && map.zones[0].cells.length === 10 && /^#/.test(map.zones[0].color));
const idx = za.index;
const pa = planPaintZone(map, idx, [sc[20], sc[21], sc[0]], "add"); run(pa);
check("塗ると重複なしで増える", map.zones[idx].cells.length === 12);
check("すでに入っているセルだけなら変更なし", planPaintZone(map, idx, [sc[0]], "add") === null);
const pe = planPaintZone(map, idx, [sc[20]], "erase"); run(pe);
check("消せる", map.zones[idx].cells.length === 11 && !map.zones[idx].cells.includes(sc[20]));
check("範囲外のセル番号は無視", planPaintZone(map, idx, [-1, 1e9], "add") === null);
const et = planEditZone(map, idx, { type: "Flood" }); run(et);
check("種類を変えると色も種類の色になる", map.zones[idx].type === "Flood" && map.zones[idx].color === zoneColor({ type: "Flood" }));
let bad = false; try { planEditZone(map, idx, { type: "Nope" }); } catch { bad = true; }
check("未知の種類は拒否", bad);
const hid = planEditZone(map, idx, { hidden: true }); run(hid);
check("隠せる", map.zones[idx].hidden === true);
check("本家の斜線パターンの色でも、表示色は種類の色", zoneColor({ type: "Invasion", color: "url(#hatch1)" }) === "#d6453d");
const grown = growZoneCells(map, sc[0], 30, createRandom(3));
check("おまかせは種を含み、指定数の陸セル", grown.includes(sc[0]) && grown.length === 30 && grown.every((c) => biome[c] !== 0));
check("おまかせは再現できる（同じ乱数→同じ範囲）", JSON.stringify(growZoneCells(map, sc[0], 30, createRandom(3))) === JSON.stringify(grown));
check("水が種なら空", growZoneCells(map, water[0], 10, createRandom(1)).length === 0);
const rz = planRemoveZone(map, idx); run(rz);
check("削除できる", map.zones.length === 0);
undo(rz); undo(hid); undo(et); undo(pe); undo(pa); undo(za.command);
check("全部 Undo すると元の空に戻る", map.zones.length === 0);

console.log("=== 表示・保存 ===");
{
  const m = await load();
  const s2 = { map: m };
  const j = planAddJourney(m, { name: "検査の旅" }); j.command.apply(s2);
  planAddLeg(m, j.id, { transport: "foot", from: A, to: B }).apply(s2);
  planAddZone(m, { name: "検査のゾーン", type: "Rebels", cells: sc.slice(0, 8) }).command.apply(s2);
  const view = { overlay: "state", base: "biome", coast: true, rivers: true, routes: true, burgs: true, labels: true, burgLabels: "all" };
  const withAll = renderMapToSvg(m, viewToRenderOptions(view), { annotations: { title: false, legend: false, scaleBar: false } });
  const without = renderMapToSvg(m, viewToRenderOptions({ ...view, zones: false, journeys: false }), { annotations: { title: false, legend: false, scaleBar: false } });
  check("SVG に旅とゾーンが描かれる（表示を切ると消える）", withAll.length > without.length + 200, `${withAll.length} vs ${without.length}`);
  const text = serializeAzgaar(m, { native: false, exportedAt: "2026-1-1" });
  check("Azgaar 互換の書き出しにゾーンが入る（本家と同じ形式）", text.includes("検査のゾーン") && text.includes('"type":"Rebels"'));
  const nat = serializeAzgaar(m, { native: true, exportedAt: "2026-1-1" });
  const re = await loadFromBytes(new TextEncoder().encode(nat), Delaunator);
  check("ALTERHISTORY 形式で保存→読み込みで、旅が戻る", listJourneys(re.map).length === 1 && listJourneys(re.map)[0].legs[0].path.length > 1);
  check("同じく、ゾーンも戻る", re.map.zones.length === 1 && re.map.zones[0].cells.length === 8);
}
{
  const { burgNearCell } = await import("../js/core/query.js");
  const far = land.find((i) => !burgNearCell(map, i, 2));
  check("場所の呼び名: 海は「海上」", placeLabel(map, water[0]) === "海上");
  check("場所の呼び名: 都市の近くは都市名、遠ければ「○○領内」", /領内|無人/.test(placeLabel(map, far)) && placeLabel(map, map.pack.burgs[1].cell) === map.pack.burgs[1].name, placeLabel(map, far));
}

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
