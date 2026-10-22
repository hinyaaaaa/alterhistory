// 旅（経路探索・所要時間・編集）とゾーン（編集・塗り・おまかせ）の検査。合成マップ。
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "./helpers/legacy/loader.js";
import { createRequire } from "node:module";
import { createRandom } from "../js/core/random.js";
import { planAddTemporaryZone, resolveZoneScope, zoneActive, addMonthsTo, findZoneByZid, TEMP_ZONE_TYPES, ZONE_PERIODS, zoneColor } from "../js/core/edit/zones.js";
import { drawZones } from "../js/render/layers/zones.js";
import { planPlague } from "../js/core/sim/natural-events.js";
import { buildTimeline } from "../js/io/chronicle.js";
import { parseNativeJson, serializeNativeJson } from "./helpers/legacy/native-map.js";
import { placeLabel } from "../js/core/query.js";
import { renderMapToSvg } from "../js/io/exporter.js";
import { viewToRenderOptions } from "../js/render/options.js";
import { serializeAzgaar } from "./helpers/legacy/azgaar-writer.js";

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

console.log("=== 疫病・災害のゾーン（一時表示） ===");
check("選べる種類は8つ（疫病・地震・洪水・飢饉・干ばつ・火山・大火・嵐）", TEMP_ZONE_TYPES.length === 8 && ["Disease", "Quake", "Flood", "Famine", "Drought", "Eruption", "Fire", "Storm"].every((k) => TEMP_ZONE_TYPES.includes(k)));
check("期間は 3か月・半年・1年・2年・5年", ZONE_PERIODS.map((p) => p.months).join() === "3,6,12,24,60");
map.worldTime = { year: 10, month: 5 };
const scope = resolveZoneScope(map, { kind: "state", id: 1 });
check("国全体の範囲は、その国の陸のセルだけ", scope.cells.length > 5 && scope.cells.every((c) => biome[c] !== 0 && map.pack.cells.state[c] === 1) && scope.states[0] === 1);
const zr = planAddTemporaryZone(map, { type: "Disease", cells: scope.cells, months: 6, scopeName: scope.name, states: scope.states });
check("確定するまで、ゾーンも年表も増えない", (map.zones ?? []).length === 0 && !(map.ext?.data?.historyLog ?? []).length);
run(zr.command);
const z0 = map.zones[0];
check("ゾーンが期間つきでできる（開始・終了・id）", z0.zid === zr.zid && z0.startAt.year === 10 && z0.startAt.month === 5 && z0.endAt.year === 10 && z0.endAt.month === 11 && z0.type === "Disease");
const hl = map.ext.data.historyLog.at(-1);
check("年表に1件（テンプレートの文）とゾーンの id が同時にできる", map.ext.data.historyLog.length === 1 && hl.type === "zone-start" && hl.zoneId === zr.zid && hl.title.includes("疫病が発生"), hl.title);
check("年表（buildTimeline）の項目がゾーンの id を持つ", buildTimeline(map).some((e) => e.zoneId === zr.zid));
check("id からゾーンを探せる", findZoneByZid(map, zr.zid) === z0);
check("期間の間は表示される", zoneActive(z0, { year: 10, month: 5 }) && zoneActive(z0, { year: 10, month: 10 }));
check("期間が過ぎると表示から外れる（終了月から）", !zoneActive(z0, { year: 10, month: 11 }) && !zoneActive(z0, { year: 12, month: 1 }));
check("開始より前は出ない", !zoneActive(z0, { year: 10, month: 4 }));
check("期間なしの既存ゾーンは、いつでも出る", zoneActive({ name: "旧", cells: [1] }, { year: 99, month: 1 }));
check("月の足し算が年をまたぐ", JSON.stringify(addMonthsTo({ year: 3, month: 11 }, 3)) === JSON.stringify({ year: 4, month: 2 }));
// 描画: 期間が過ぎたゾーンは描かれない。年表で選んでいる間だけ、輪郭が赤で出る
const calls = { fill: 0, stroke: 0, colors: [] };
const ctx = new Proxy({}, { get(_, k) { if (k === "fill") return () => { calls.fill++; }; if (k === "stroke") return () => { calls.stroke++; }; return () => {}; }, set(_, k, v) { if (k === "strokeStyle") calls.colors.push(v); return true; } });
const vp = { k: 1 };
const draw = (now, focus) => { calls.fill = 0; calls.stroke = 0; calls.colors = []; map.worldTime = now; drawZones(ctx, map, vp, { focus }); };
draw({ year: 10, month: 6 }, null);
check("期間中は地図に塗られる", calls.fill > 0);
draw({ year: 11, month: 1 }, null);
check("期間が過ぎたら地図から消える", calls.fill === 0 && calls.stroke === 0);
draw({ year: 11, month: 1 }, zr.zid);
check("年表で選んでいる間は、消えたゾーンでも輪郭を赤い線で出す（塗りは無し）", calls.fill === 0 && calls.colors.includes("#e5483a"));
draw({ year: 10, month: 6 }, zr.zid);
check("期間中に選ぶと、塗りも赤い輪郭も出る", calls.fill > 0 && calls.colors.includes("#e5483a"));
undo(zr.command);
check("Undo 1回で、ゾーンも年表も元に戻る", (map.zones ?? []).length === 0 && !(map.ext?.data?.historyLog ?? []).length);

console.log("=== 範囲の選択と失敗時 ===");
const provs = map.pack.provinces.filter((p) => p && !p.removed && p.i > 0).slice(0, 2).map((p) => p.i);
if (provs.length) {
  const ps = resolveZoneScope(map, { kind: "provinces", ids: provs });
  check("属州を選ぶと、その属州の陸のセルが範囲になる", ps.cells.length > 0 && ps.cells.every((c) => provs.includes(map.pack.cells.province[c])));
}
check("地図で囲んだセルのうち、水域は除かれる", resolveZoneScope(map, { kind: "cells", cells: [sc[0], water[0]] }).cells.length === 1);
let e1 = "", e2 = "", e3 = "";
try { planAddTemporaryZone(map, { type: "Disease", cells: sc, months: 7 }); } catch (e) { e1 = e.message; }
try { planAddTemporaryZone(map, { type: "Nope", cells: sc, months: 6 }); } catch (e) { e2 = e.message; }
try { resolveZoneScope(map, { kind: "provinces", ids: [] }); } catch (e) { e3 = e.message; }
check("不正な期間・種類・空の範囲は拒否され、何も作られない", !!e1 && !!e2 && !!e3 && (map.zones ?? []).length === 0);

console.log("=== 自然発生の疫病に、ゾーンが付く ===");
{
  const m = await load(); m.worldTime = { year: 3, month: 1 };
  const s2 = { map: m };
  const pc = planPlague(m, { stateId: 1, ruralLoss: 0.1, urbanLoss: 0.1 }, { year: 3, month: 1 });
  pc.apply(s2);
  const ev = m.ext.data.historyLog.at(-1);
  check("疫病の記録とゾーンが1回の操作でできる", ev.type === "plague" && (m.zones ?? []).length === 1 && m.zones[0].zid === ev.zoneId && m.zones[0].type === "Disease");
  check("半年で消える設定になっている", m.zones[0].endAt.year === 3 && m.zones[0].endAt.month === 7);
  pc.revert(s2);
  check("Undo でゾーンも消える", (m.zones ?? []).length === 0);
}

console.log("=== 表示・保存・旧形式 ===");
{
  const m = await load();
  const s2 = { map: m };
  planAddTemporaryZone(m, { type: "Flood", cells: sc.slice(0, 8), months: 12, scopeName: "検査", states: [1] }).command.apply(s2);
  const nat = serializeAzgaar(m, { native: true, exportedAt: "2026-1-1" });
  const re = await loadFromBytes(new TextEncoder().encode(nat), Delaunator);
  check("保存→読み込みで、ゾーンの期間と id が戻る", re.map.zones.length === 1 && re.map.zones[0].zid === "z1" && re.map.zones[0].endAt.year === 2 && re.map.zones[0].cells.length === 8);
  const text = serializeAzgaar(m, { native: false, exportedAt: "2026-1-1" });
  check("Azgaar 互換の書き出しにもゾーンが入る", text.includes('"type":"Flood"'));
  // 旅の記録を持つ旧ファイル
  const doc = JSON.parse(serializeNativeJson(m)); doc.data = { ...(doc.data ?? {}), journeys: [{ id: 1, name: "旧い旅", legs: [{ transport: "foot", path: [1, 2, 3] }] }] };
  const old = parseNativeJson(JSON.stringify(doc));
  check("旅の記録を持つ旧ファイルが、壊れずに開ける（旅の記録は無視される）", old.map.zones.length === 1 && old.map.ext.data.journeys === undefined);
  const resaved = serializeNativeJson(old.map);
  check("保存し直すと、旅の記録は残らない", !resaved.includes("旧い旅") && !resaved.includes('"journeys"'));
}
{
  const { burgNearCell } = await import("../js/core/query.js");
  const far = land.find((i) => !burgNearCell(map, i, 2));
  check("場所の呼び名: 海は「海上」", placeLabel(map, water[0]) === "海上");
  check("場所の呼び名: 都市の近くは都市名、遠ければ「○○領内」", /領内|無人/.test(placeLabel(map, far)) && placeLabel(map, map.pack.burgs[1].cell) === map.pack.burgs[1].name, placeLabel(map, far));
}

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
