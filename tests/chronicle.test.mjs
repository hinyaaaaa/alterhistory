// クロニクル（AI 向けセーブデータ）の検証。
//
// 「AI が読んで分かる」ことを機械的に保証するために、次を確かめる:
//   1. 完全性  : 元の map にある情報が欠落していない（国家・都市・マーカー・戦争・同盟・属性・ノート・全戦闘）
//   2. 正確性  : 数値が元データと一致する（人口・領土セル数・兵力・順位）
//   3. 解決済み: どこにも「生の ID だけ」が残っていない（全参照が {id, name} で名前を持つ）
//   4. 可逆性  : セル単位データ(RLE)を展開すると元のセル配列と完全一致
//   5. 頑健性  : 消滅国家・空の世界・壊れた参照でも例外を出さず、AI が誤解しない表現になる
//   6. 非破壊  : 書き出しで map を一切変更しない
//
// 合成マップを使う（tests/helpers/synth-map.mjs）。実サンプル .map が無い環境でも動く。
import { createRequire } from "node:module";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "../js/io/loader.js";
import { buildChronicle, serializeChronicle, chronicleToMarkdown, rle, unrle, readChronicleCells, describePosition } from "../js/io/chronicle.js";
import { htmlToEditableText } from "../js/io/chronicle-text.js";
import { planMergeStates } from "../js/core/edit/sovereignty.js";
import { planCreateAlliance } from "../js/core/edit/alliances.js";
import { statePopulation } from "../js/core/query.js";

const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const live = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

console.log("=== 純粋関数 ===");
{
  const a = [0, 0, 0, 5, 5, 1, 0, 0];
  check("rle → unrle で元に戻る", JSON.stringify(unrle(rle(a))) === JSON.stringify(a));
  check("rle: 空配列", rle([]).length === 0 && unrle([]).length === 0);
  check("rle: 単一値の長い連続は 1 要素に潰れる", rle(new Array(5000).fill(3)).length === 1);
  check("describePosition: 9 方位", [describePosition(10, 10, 300, 300), describePosition(150, 10, 300, 300), describePosition(290, 10, 300, 300), describePosition(10, 150, 300, 300), describePosition(150, 150, 300, 300), describePosition(290, 290, 300, 300)].join() === "北西,北,北東,西,中央,南東");
  check("describePosition: 幅0でも例外なし", describePosition(1, 1, 0, 0) === "");
  check("htmlToEditableText: 段落・改行・エンティティ", htmlToEditableText("<p>A<br>B</p><p>C &amp; D</p>") === "A\nB\nC & D");
  check("htmlToEditableText: リスト・リンクの情報が落ちない", htmlToEditableText('<ul><li>一</li><li>二</li></ul><a href="http://x.y">記事</a>').includes("・一") && htmlToEditableText('<a href="http://x.y">記事</a>').includes("http://x.y"));
  check("htmlToEditableText: null/undefined", htmlToEditableText(null) === "" && htmlToEditableText(undefined) === "");
}

console.log("=== 歴史のある世界（本物の編集コマンドで構築） ===");
const { map, store, log } = await buildHistoricalWorld();
check("歴史の構築に失敗した手順がない", !log.some((l) => l.startsWith("FAIL")), log.filter((l) => l.startsWith("FAIL")).join(" | "));

const before = JSON.stringify([map.pack.states, map.pack.burgs, map.markers, map.ext, Array.from(map.pack.cells.state).slice(0, 300)]);
const ch = buildChronicle(map, { fileName: "test.map", exportedAt: "2026-9-28" });
const after = JSON.stringify([map.pack.states, map.pack.burgs, map.markers, map.ext, Array.from(map.pack.cells.state).slice(0, 300)]);
check("非破壊: 書き出しで map が 1 バイトも変わらない", before === after);

console.log("=== 完全性（情報の欠落がない） ===");
const liveStates = map.pack.states.filter(live);
check("全ての現存国家が含まれる", ch.states.length === liveStates.length && liveStates.every((s) => ch.states.some((x) => x.id === s.i)), `${ch.states.length}/${liveStates.length}`);
check("全ての都市が含まれる（小さい都市も）", ch.burgs.length === map.pack.burgs.filter(live).length, `${ch.burgs.length}`);
check("全てのマーカーが含まれる", ch.markers.length === map.markers.length, `${ch.markers.length}`);
check("全ての戦争が含まれる", ch.wars.length === (map.ext.data.wars ?? []).length);
check("全ての戦闘が含まれる（1 つも省略しない）", ch.wars.reduce((a, w) => a + w.battles.length, 0) === (map.ext.data.wars ?? []).reduce((a, w) => a + w.battles.length, 0));
check("全ての同盟が含まれる（解消済みも）", ch.alliances.length === (map.ext.data.alliances ?? []).length && ch.alliances.some((a) => a.status === "解消済み"));
check("全ての時代が含まれる", ch.world.eras.length === (map.ext.data.eras ?? []).length);
check("全ての文化・宗教・属州が含まれる", ch.cultures.length === map.pack.cultures.filter(live).length && ch.religions.length === map.pack.religions.filter(live).length && ch.provinces.length === map.pack.provinces.filter(live).length);
check("バイオーム一覧が含まれる", ch.biomes.length === map.biomesData.length);

const attrCount = Object.values(map.ext.data.attributes ?? {}).reduce((a, o) => a + Object.keys(o).length, 0);
const chAttrCount = [...ch.states, ...ch.cultures, ...ch.religions, ...ch.provinces].reduce((a, e) => a + e.attributes.length, 0);
check("ユーザーが付けた属性が 1 つも欠けない", attrCount > 0 && chAttrCount === attrCount, `${chAttrCount}/${attrCount}`);
check("国家ノートが平文で入る（HTML タグが残らない）", ch.states.find((s) => s.id === 1).note?.includes("大陸西部") && !/<[a-z]/i.test(ch.states.find((s) => s.id === 1).note));
check("都市ノートが入る", ch.burgs.find((b) => b.id === 1).note?.includes("王都"));
check("マーカーノートが入る", ch.markers.find((m) => m.name === "古代神殿跡")?.note?.includes("地下墓所"));
check("宗教ノートが入る", ch.religions.find((r) => r.id === 1).note?.includes("アマル"));

console.log("=== 正確性（数値が元データと一致） ===");
for (const s of liveStates) {
  const c = ch.states.find((x) => x.id === s.i);
  const cells = [...map.pack.cells.state].reduce((a, v, i) => a + (v === s.i && map.pack.cells.biome[i] !== 0 ? 1 : 0), 0);
  if (c.territory.cells !== cells) check(`国家${s.i} の領土セル数`, false, `${c.territory.cells} != ${cells}`);
  if (Math.abs(c.population.total - Math.round(statePopulation(s) * 100) / 100) > 0.011) check(`国家${s.i} の人口`, false);
}
check("全国家の領土セル数が実測と一致", ch.states.every((c) => c.territory.cells === [...map.pack.cells.state].reduce((a, v, i) => a + (v === c.id && map.pack.cells.biome[i] !== 0 ? 1 : 0), 0)));
check("全国家の人口が rural+urban と一致", liveStates.every((s) => Math.abs(ch.states.find((x) => x.id === s.i).population.total - Math.round(statePopulation(s) * 100) / 100) <= 0.011));
check("領土セル合計 + 無所属 = 陸セル数", ch.consistencyChecks.ok, ch.consistencyChecks.issues.join("; "));
check("技術水準が設定値どおり（設定した国）", ch.states.find((s) => s.id === 1).economy.techLevel === 4 && ch.states.find((s) => s.id === 2).economy.techLevel === 5);
check("技術水準が未設定の国は既定値と明示される", ch.states.find((s) => s.id === 5).economy.techLevelIsDefault === true);
check("ドクトリンが日本語で入る", ch.states.find((s) => s.id === 1).military.doctrine.label === "機動戦");
{
  const r = ch.states.find((s) => s.id === 1).military.regiments[0];
  const src = map.pack.states[1].military[0];
  check("部隊の兵力内訳が一致（生の値も保持）", JSON.stringify(r.unitsRaw) === JSON.stringify(src.u));
  check("部隊の兵力が日本語ラベル+単位で読める", r.units["歩兵"]?.endsWith("人") && r.units["機甲"]?.endsWith("台"));
  check("総兵員が部隊合計と一致", ch.states.find((s) => s.id === 1).military.totalHeadcount === Object.values(src.u).reduce((a, b) => a + b, 0));
}
check("ランキングが降順で 1 位始まり", ["byTerritory", "byPopulation", "byMilitaryPower", "byTechLevel"].every((k) => ch.ranking[k].every((r, i) => r.rank === i + 1 && (i === 0 || ch.ranking[k][i - 1].value >= r.value))));

console.log("=== 全参照が名前に解決済み ===");
{
  const isRawIdOnly = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number");
  const bad = [];
  const walk = (o, path) => {
    if (o && typeof o === "object") {
      if (!Array.isArray(o)) {
        for (const [k, v] of Object.entries(o)) {
          if (path.startsWith("cells") ) return;
          if (["attackers", "defenders", "members", "neighbors"].includes(k) && isRawIdOnly(v)) bad.push(`${path}.${k}`);
          walk(v, `${path}.${k}`);
        }
      } else o.forEach((x, i) => walk(x, `${path}[${i}]`));
    }
  };
  const { cells, ...rest } = ch; walk(rest, "$");
  check("attackers/defenders/members に生の ID 配列が無い", bad.length === 0, bad.slice(0, 3).join(", "));
  check("戦争の陣営が {id,name}", ch.wars.every((w) => [...w.attackers, ...w.defenders].every((x) => typeof x.id === "number" && typeof x.name === "string" && x.name.length > 0)));
  check("同盟メンバーが {id,name}", ch.alliances.every((a) => a.members.every((x) => typeof x.name === "string" && x.name.length > 0)));
  check("外交が相手の名前と日本語の関係語を持つ", ch.states.every((s) => s.diplomacy.every((d) => d.with.name && d.relation)));
  check("戦闘結果が国名で書かれる（'attacker'等の記号だけでない）", ch.wars.flatMap((w) => w.battles).every((b) => b.winner && b.attacker && b.defender));
  check("都市が国家・文化・属州・宗教の名前を持つ", ch.burgs.every((b) => b.state.name && b.culture.name && b.province.name && b.religion.name));
  check("年表の全イベントが日付・種別・タイトルを持つ", ch.timeline.every((t) => t.type && t.title && (t.date === null || /^\d+年\d+月$/.test(t.date))));
  const json = serializeChronicle(ch);
  check("'undefined' / 'NaN' / '[object' が出力に混入しない", !/undefined|NaN|\[object/.test(json.replace(/"cells"[\s\S]*$/, "")));
}

console.log("=== 年表 ===");
{
  const ts = ch.timeline;
  check("年表が時系列順", ts.every((t, i) => i === 0 || (ts[i - 1].year * 12 + ts[i - 1].month) <= (t.year * 12 + t.month)));
  const types = new Set(ts.map((t) => t.type));
  for (const need of ["era", "alliance-formed", "alliance-dissolved", "diplomacy", "war-declared", "battle", "war-ended", "independence"]) check(`年表に種別 ${need} がある`, types.has(need));
  check("年表に時代名が付く", ts.filter((t) => t.year >= 30 && t.year < 80).every((t) => t.era === "戦乱の時代"));
  check("戦闘の年表件数 = 戦闘記録の件数", ts.filter((t) => t.type === "battle").length === ch.wars.reduce((a, w) => a + w.battleCount, 0));
  check("継続中の戦争が status で区別できる", ch.wars.find((w) => w.name === "東方国境紛争").status === "継続中" && ch.wars.find((w) => w.name === "赤の平原戦争").status === "終結");
  check("現在の年月と時代が入る", ch.world.currentDate.year === 60 && ch.world.currentDate.era === "戦乱の時代");
  const ind = ts.find((t) => t.type === "independence");
  check("独立の記述に国名が入り生のキー名が漏れない", ind && /独立/.test(ind.title) && !/provinceId|fromState|newState/.test(ind.title + ind.detail));
}

console.log("=== セル単位の完全データ（可逆性） ===");
{
  const c = readChronicleCells(ch);
  const same = (k) => JSON.stringify(c[k]) === JSON.stringify(Array.from(map.pack.cells[k]).map((v) => (k === "pop" ? Math.round(v * 100) / 100 : v)));
  for (const k of ["biome", "state", "culture", "religion", "province", "burg", "river", "pop"]) check(`cells.${k} を展開すると元配列と完全一致`, same(k));
  check("cells.count が元セル数と一致", ch.cells.count === map.pack.cells.biome.length);
  check("cells.points の数が一致", ch.cells.points.length === map.geometry.pack.p.length);
  const noCells = buildChronicle(map, { includeCells: false, fileName: "test.map", exportedAt: "2026-9-28" });
  check("includeCells:false で cells が null", noCells.cells === null);
  check("cells 無しでもそれ以外は同一", JSON.stringify({ ...noCells, cells: null }) === JSON.stringify({ ...ch, cells: null }));
}

console.log("=== 直列化・Markdown ===");
{
  const json = serializeChronicle(ch);
  let parsed = null; try { parsed = JSON.parse(json); } catch (e) { check("JSON として有効", false, e.message); }
  check("JSON として有効（パース可能）", !!parsed);
  check("パースし直しても等価（往復）", JSON.stringify(parsed) === JSON.stringify(ch));
  check("format / formatVersion が入る", parsed.format === "alterhistory-chronicle" && parsed.formatVersion === 1);
  check("AI 向けガイドが同梱される", parsed.guideForAI.purpose.length > 20 && parsed.guideForAI.howToRead.length >= 5 && parsed.guideForAI.designNotes.length > 0);
  check("ガイドに『戦闘で国境は動かない』が明記される", parsed.guideForAI.designNotes.some((n) => n.includes("国境は動かない")));
  check("cells 行が 1 行に収まり肥大しない", json.split("\n").length < 6000, `${json.split("\n").length}行`);
  const md = chronicleToMarkdown(ch);
  check("Markdown に年表・国家・戦争・同盟・都市・マーカー・ランキングの節がある", ["## 年表", "## 国家", "## 戦争", "## 同盟", "## 都市（全て）", "## マーカー（全て）", "## ランキング"].every((h) => md.includes(h)));
  check("Markdown に全国家の名前がある", liveStates.every((s) => md.includes(s.fullName ?? s.name)));
  check("Markdown に全都市の名前がある", map.pack.burgs.filter(live).every((b) => md.includes(b.name)));
  check("Markdown に全マーカーの名前がある", map.markers.every((m) => md.includes(m.name)));
  check("Markdown に属性・ノートが載る", md.includes("立憲君主制") && md.includes("太陽神アマル"));
  check("Markdown に生の JSON が漏れない", !/[{]"[a-z]+":/.test(md));
  check("同名都市が id で区別できる", (() => { const names = map.pack.burgs.filter(live).map((b) => b.name); const dup = names.find((n, i) => names.indexOf(n) !== i); return !dup || md.includes(`${dup}(id`); })());
  console.log(`  情報: JSON ${(json.length / 1024).toFixed(0)}KB / Markdown ${(md.length / 1024).toFixed(1)}KB / 従来 .map との比: 意味付き情報量が桁違い`);
}

console.log("=== 消滅した国家 ===");
{
  const w = await buildHistoricalWorld();
  w.store.commit(planMergeStates(w.map, { from: 4, to: 1, date: { year: 70, month: 3 } }));
  const c2 = buildChronicle(w.map);
  check("消滅した国家は states から外れ extinctStates に入る", !c2.states.some((s) => s.id === 4) && c2.extinctStates.some((s) => s.id === 4));
  const e = c2.extinctStates.find((s) => s.id === 4);
  check("いつ・どこへ併合されたか分かる", e.extinctAt === "70年3月" && e.absorbedBy.name === "アルビオン王国");
  check("旧首都が復元される", e.formerCapital === "パルミラ");
  check("過去の戦争の記録に『（消滅）』付きで名前が残る", c2.wars[0].defenders.some((d) => d.id === 4 && d.name.includes("消滅")));
  check("同盟の過去メンバーにも『（消滅）』が付く", c2.alliances.find((a) => a.name === "東方協商").members.some((m) => m.id === 4 && m.name.includes("消滅")));
  check("併合先が部隊を引き継いだと反映される", c2.states.find((s) => s.id === 1).military.regimentCount === 2);
  check("併合後も整合性検査が通る", c2.consistencyChecks.ok, c2.consistencyChecks.issues.join("; "));
  check("年表に統合が載る", c2.timeline.some((t) => t.type === "state-merged" && t.title.includes("ドラン連邦") && t.title.includes("アルビオン王国")));
}

console.log("=== 頑健性（歴史が空・壊れた参照） ===");
{
  const { text } = buildSyntheticMapText({ seed: 11 });
  const { map: m0 } = await loadFromBytes(new TextEncoder().encode(text), Delaunator);
  let c0 = null, threw = null;
  try { c0 = buildChronicle(m0, {}); } catch (e) { threw = e; }
  check("歴史が空の世界でも例外なし", !threw, threw?.message);
  check("空の歴史: 年表 0・戦争 0・同盟 0 だが国家は全て出る", c0.timeline.length === 0 && c0.wars.length === 0 && c0.alliances.length === 0 && c0.states.length > 0);
  check("空の歴史の Markdown が『記録なし』と明示", chronicleToMarkdown(c0).includes("（戦争の記録はありません）") && chronicleToMarkdown(c0).includes("（記録された出来事はありません）"));
  check("map.ext が null でも動く", (() => { m0.ext = null; try { buildChronicle(m0); return true; } catch { return false; } })());

  // 壊れた参照: 存在しない国家を指す同盟・戦争
  const { map: m1, store: s1 } = await buildHistoricalWorld();
  m1.ext.data.alliances.push({ id: 99, name: "幽霊同盟", members: [1, 777], formedAt: { year: 3, month: 3 }, dissolvedAt: null });
  m1.ext.data.wars.push({ id: 99, name: "幻の戦争", attackers: [888], defenders: [1], startedAt: { year: 4, month: 4 }, endedAt: null, battles: [], advantage: {} });
  m1.markers.push({ i: 50, type: "ruins", icon: "🏛️", x: 5, y: 5, cell: 999999, name: "壊れたマーカー" });
  let c1 = null, t1 = null; try { c1 = buildChronicle(m1); } catch (e) { t1 = e; }
  check("存在しない国家を参照していても例外なし", !t1, t1?.message);
  check("存在しない国家は『（存在しない）』と明示され、AI が誤解しない", JSON.stringify(c1.alliances.find((a) => a.id === 99).members).includes("存在しない") && JSON.stringify(c1.wars.find((w) => w.id === 99).attackers).includes("存在しない"));
  check("壊れたマーカーは名前を保ったまま出力される", c1.markers.some((m) => m.name === "壊れたマーカー"));

  // 年月が欠けた記録
  const { map: m2 } = await buildHistoricalWorld();
  m2.ext.data.diplomacyLog.push({ a: 1, b: 2, from: "Ally", to: "Enemy" });
  let t2 = null, c2 = null; try { c2 = buildChronicle(m2); } catch (e) { t2 = e; }
  check("日付の無い記録があっても例外なし", !t2, t2?.message);
  check("日付不明の記録は年表の末尾に置かれ date が null", c2.timeline.at(-1).date === null);
}

console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
