// カタカナ名の仮生成（地名・国家名・宗教名・文化名）と「仮」フラグの検証。
// 合成マップを使うので、実サンプル .map が無くても動く。
import { createRequire } from "node:module";
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "../js/io/loader.js";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createEditActions } from "../js/app/edit-actions.js";
import { serializeAzgaar } from "../js/io/azgaar-writer.js";
import {
  NAME_STYLES, STYLE_KEYS, validate, generatePlaceName, generateStateName,
  generateReligionName, generateCultureName, generateProvinceName, stateForms,
} from "../js/core/names/katakana.js";
import { suggestName, suggestNames, takenNames, styleOfCulture, planSetNameStyle, isProvisional, listProvisional } from "../js/core/edit/naming.js";

const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const KANA = /^[ァ-ヴー]+$/;
const live = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

console.log("=== 生成器（純粋関数）===");
for (const style of STYLE_KEYS) {
  const r = createRandom(42);
  const places = Array.from({ length: 400 }, () => generatePlaceName(r, style));
  check(`[${style}] 地名がすべて妥当なカタカナ`, places.every((n) => validate(n) && KANA.test(n)));
  check(`[${style}] 地名に十分なばらつき`, new Set(places).size >= 200, `unique=${new Set(places).size}/400`);
  const st = Array.from({ length: 100 }, () => generateStateName(r, style));
  check(`[${style}] 国家名は「短縮名+政体語」`, st.every((s) => s.name === s.short + stateForms(style).find((f) => s.name.endsWith(f.suffix)).suffix && KANA.test(s.short)));
  const re = Array.from({ length: 100 }, () => generateReligionName(r, style));
  check(`[${style}] 宗教名は神名を含み type/form を持つ`, re.every((x) => x.name.startsWith(x.deity) && KANA.test(x.deity) && x.type && x.form));
  check(`[${style}] 文化名は「◯◯人」`, Array.from({ length: 50 }, () => generateCultureName(r, style)).every((n) => n.endsWith("人") && KANA.test(n.slice(0, -1))));
  check(`[${style}] 属州名は「州/地方/領」で終わる`, Array.from({ length: 50 }, () => generateProvinceName(r, style)).every((n) => /(州|地方|領)$/.test(n)));
}
{
  const a = Array.from({ length: 20 }, (() => { const r = createRandom(7); return () => generatePlaceName(r, "nordic"); })());
  const b = Array.from({ length: 20 }, (() => { const r = createRandom(7); return () => generatePlaceName(r, "nordic"); })());
  check("同じシードなら同じ名前列（再現可能）", JSON.stringify(a) === JSON.stringify(b));
  check("validate: 不正な並びを弾く", !validate("アア") && !validate("ンア") && !validate("abc") && !validate("ヴォヴォ") && !validate("ア") && validate("アルビオン"));
  check("未知の系統は既定にフォールバックして例外にならない", KANA.test(generatePlaceName(createRandom(1), "nonexistent")));
  check("政体を指定できる（共和国）", generateStateName(createRandom(3), "western", "共和国").name.endsWith("共和国"));
}

console.log("\n=== 地図と結び付いた提案 ===");
const { text } = buildSyntheticMapText({ seed: 11 });
const { map } = await loadFromBytes(new TextEncoder().encode(text), Delaunator);
const rnd = createRandom(1);
{
  const taken = takenNames(map);
  const all = [];
  for (const kind of ["burg", "state", "culture", "religion", "province"]) for (let i = 0; i < 40; i++) all.push(suggestName(map, { kind, rnd }).name);
  check("既存の名前と被らない", all.every((n) => !taken.has(n)));
  const five = suggestNames(map, { kind: "burg", rnd }, 8);
  check("複数候補は互いに異なる", new Set(five.map((x) => x.name)).size === 8);

  const cid = map.pack.cultures.find((c) => live(c))?.i;
  check("文化の系統が既定で決まる（同じ文化は常に同じ）", styleOfCulture(map, cid) === styleOfCulture(map, cid) && STYLE_KEYS.includes(styleOfCulture(map, cid)));
  const cell = map.pack.cells.culture.findIndex((c) => c === cid);
  const viaCell = suggestName(map, { kind: "burg", rnd, cell });
  check("セルの文化から系統を辿る", viaCell.style === styleOfCulture(map, cid));
  const s = suggestName(map, { kind: "state", rnd, style: "yamato" });
  check("国家の提案に短縮名・政体が付く", s.extra.name && s.extra.form && s.name.startsWith(s.extra.name));
  const rel = suggestName(map, { kind: "religion", rnd });
  check("宗教の提案に神名・種別が付く", rel.extra.deity && rel.extra.type && rel.name.startsWith(rel.extra.deity));
  let threw = false; try { suggestName(map, { kind: "river", rnd }); } catch { threw = true; }
  check("未対応の種類は例外", threw);
}

console.log("\n=== 編集アクション（仮フラグ・Undo・保存）===");
{
  const store = createStore({ map });
  const renderer = { requestRender() {} };
  const act = createEditActions({ store, renderer });
  const cellOf = () => { const c = map.pack.cells; for (let i = 0; i < c.biome.length; i++) if (c.biome[i] !== 0 && !c.burg[i] && c.state[i] > 0) return i; return -1; };

  // 都市: 名前が空 → 仮の名前
  const cell = cellOf();
  const id = act.addBurg(cell, "");
  const b = map.pack.burgs[id];
  check("空の名前で都市を作ると仮の名前が付く", id != null && KANA.test(b.name) && act.isProvisional("burg", id));
  check("保存用データに仮の印が入る", map.ext?.data?.provisionalNames?.[`burg:${id}`] === 1);
  store.undo();
  check("Undo で都市も仮の印も消える", !live(map.pack.burgs[id]) && !isProvisional(map, "burg", id) && !map.ext?.data?.provisionalNames);
  store.redo();
  check("Redo で戻る", live(map.pack.burgs[id]) && isProvisional(map, "burg", id));

  // 確定
  act.confirmName("burg", id);
  check("確定すると仮の印が外れ、名前は残る", !act.isProvisional("burg", id) && map.pack.burgs[id].name === b.name);
  store.undo();
  check("確定を Undo すると仮に戻る", act.isProvisional("burg", id));
  act.confirmName("burg", id);

  // 🎲 で生成した名前に改名 → 仮。手で書いた名前 → 仮ではない
  const gen = act.suggestName("burg", { id });
  act.renameBurg(id, gen);
  check("生成した名前に改名すると仮になる", act.isProvisional("burg", id) && map.pack.burgs[id].name === gen);
  act.renameBurg(id, "手で付けた名前");
  check("手で書き換えると仮が外れる", !act.isProvisional("burg", id));
  store.undo();
  check("改名を Undo すると名前と仮が一緒に戻る", map.pack.burgs[id].name === gen && act.isProvisional("burg", id));

  // 手で付けた名前で作る → 仮ではない
  const cell2 = cellOf();
  const id2 = act.addBurg(cell2, "ユーザー村");
  check("自分で付けた名前は仮にならない", map.pack.burgs[id2].name === "ユーザー村" && !act.isProvisional("burg", id2));

  // 国家・宗教・文化
  const sid = act.addEntity("state", "");
  const st = map.pack.states[sid];
  check("空の名前で国家を作ると仮の国名・政体が付く", live(st) && KANA.test(st.fullName.replace(/(王国|帝国|公国|共和国|連邦|神聖国|侯国|辺境伯領|首長国|スルタン国|カリフ国|皇国)$/, "")) && st.form && st.formName && st.name && act.isProvisional("state", sid));
  check("国家の短縮名が「◯◯」、正式名が「◯◯王国」等", st.fullName.startsWith(st.name) && st.fullName !== st.name);
  const gs = act.suggestName("religion");
  const rid = act.addEntity("religion", gs);
  const rel = map.pack.religions[rid];
  check("生成した宗教名で作ると神名が付き、仮になる", rel.name === gs && rel.deity && gs.startsWith(rel.deity) && act.isProvisional("religion", rid));
  const cidNew = act.addEntity("culture", "");
  check("文化も仮生成できる", map.pack.cultures[cidNew].name.endsWith("人") && act.isProvisional("culture", cidNew));

  // 属州
  const home = map.pack.states.find((s) => live(s));
  const pid = act.addProvince(home.i, "");
  check("属州も仮生成できる", pid != null && /(州|地方|領)$/.test(map.pack.provinces[pid].name) && act.isProvisional("province", pid));

  // 系統の変更
  const cultId = map.pack.cultures.find((c) => live(c)).i;
  act.setNameStyle(cultId, "arabic");
  check("文化の系統を変更できる", act.getNameStyle(cultId) === "arabic" && act.effectiveNameStyle(cultId) === "arabic");
  const cc = map.pack.cells.culture.findIndex((c) => c === cultId);
  if (cc >= 0) {
    const ok = Array.from({ length: 20 }, () => act.suggestName("burg", { cell: cc })).every((n) => validate(n));
    check("系統を変えた文化の土地で名前が生成できる", ok);
  }
  store.undo();
  check("系統変更を Undo できる", act.getNameStyle(cultId) == null);
  let bad = false; try { planSetNameStyle(map, cultId, "klingon"); } catch { bad = true; }
  check("未知の系統は拒否", bad);

  // 保存 → 再読み込み
  const beforeList = listProvisional(map).length;
  const saved = serializeAzgaar(map, { native: true, exportedAt: "2026-10-01" });
  const { map: re } = await loadFromBytes(new TextEncoder().encode(saved), Delaunator);
  check("ALTERHISTORY形式で保存→再読込しても仮の印が残る", listProvisional(re).length === beforeList && beforeList > 0 && isProvisional(re, "state", sid));
  check("再読込後も国家の政体が残る", re.pack.states[sid].formName === st.formName);
  const plain = serializeAzgaar(map, { native: false, exportedAt: "2026-10-01" });
  const { map: re2 } = await loadFromBytes(new TextEncoder().encode(plain), Delaunator);
  check("Azgaar互換で書き出しても壊れない（名前は残る）", re2.pack.states[sid]?.fullName === st.fullName && listProvisional(re2).length === 0);
}

console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
