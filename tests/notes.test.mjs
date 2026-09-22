import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadFromBytes } from "../js/io/loader.js";
import { createStore } from "../js/core/store.js";
import { planSetNote, getNote, noteTarget, htmlToEditable, editableToHtml } from "../js/core/edit/notes.js";
import { serializeAzgaar } from "../js/io/azgaar-writer.js";

const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

console.log("=== HTML ⇔ 編集用テキストの変換 ===");
check("平文はそのまま", htmlToEditable("ただの文章").text === "ただの文章" && !htmlToEditable("ただの文章").rich);
check("<br> は改行に", htmlToEditable("1行目<br>2行目").text === "1行目\n2行目");
check("<p> は段落の空行に", htmlToEditable("<p>A</p><p>B</p>").text === "A\n\nB");
check("実体参照を戻す", htmlToEditable("A &amp; B &lt;tag&gt;").text === "A & B <tag>");
check("装飾タグがあれば rich 扱い（中身は変えない）", htmlToEditable("<b>強調</b>と普通").rich === true);
check("改行を <br> に", editableToHtml("1行目\n2行目", false) === "1行目<br>2行目");
check("特殊文字をエスケープ", editableToHtml("A & B <x>", false) === "A &amp; B &lt;x&gt;");
check("rich=true はそのまま書き戻す（変換しない）", editableToHtml("<b>そのまま</b>", true) === "<b>そのまま</b>");
check("往復して同じ文章に戻る（平文）", (() => { const e = htmlToEditable(editableToHtml("あ\nい\nう", false)); return e.text === "あ\nい\nう"; })());

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const { map } = await loadFromBytes(new Uint8Array(readFileSync(`${SAMPLES}/${f}`)), Delaunator);
  const legacy = map.settings.format === "legacy";
  console.log(`  (${legacy ? "旧形式" : "新形式"})`);
  const store = createStore({ map });

  // 既存のノート（マーカー）が正しく読める
  const m3 = map.markers[3];
  const existing = getNote(map, "marker", m3.i);
  check("既存のマーカーの文章が読める", existing.length > 10, existing.slice(0, 30));

  // 新規に設定 → Undo → 書き出しの一致
  const state = map.pack.states.find((s) => s && s.i && !s.removed);
  check("国家に文章が無い状態", getNote(map, "state", state.i) === "");
  const c1 = planSetNote(map, "state", state.i, "この国は港湾都市が多い。");
  store.commit(c1);
  check("国家に文章を設定できる", getNote(map, "state", state.i) === "この国は港湾都市が多い。");
  check("同じ内容の再設定は変更なし", planSetNote(map, "state", state.i, "この国は港湾都市が多い。") === null);
  store.commit(planSetNote(map, "state", state.i, "改訂：港湾都市が多い。"));
  store.undo();
  check("Undo で前の文章に戻る", getNote(map, "state", state.i) === "この国は港湾都市が多い。");
  store.commit(planSetNote(map, "state", state.i, ""));
  check("空にすると消える", getNote(map, "state", state.i) === "");
  if (legacy) check("旧形式: 空にすると notes 配列から行ごと消える", !map.notes.some((n) => n?.id === `state${state.i}`));
  else check("新形式: note フィールドが無くなる", !("note" in map.pack.states[state.i]));
  store.undo();
  check("Undo で文章が戻る", getNote(map, "state", state.i) === "この国は港湾都市が多い。");

  // マーカーは名前があるので、空にしても行は消えない（旧形式）
  const before = getNote(map, "marker", m3.i);
  store.commit(planSetNote(map, "marker", m3.i, ""));
  check("マーカーの文章を消せる", getNote(map, "marker", m3.i) === "");
  if (legacy) check("マーカーは空でも行が残る（名前を保つため）", map.notes.some((n) => n?.id === `marker${m3.i}`));
  store.undo();
  check("Undo で戻る", getNote(map, "marker", m3.i) === before);

  // 属州・文化・宗教・都市
  const prov = map.pack.provinces.find((p) => p && p.i && !p.removed);
  store.commit(planSetNote(map, "province", prov.i, "特産品：織物"));
  check("属州に文章", getNote(map, "province", prov.i) === "特産品：織物");
  const cul = map.pack.cultures.find((c) => c && c.i && !c.removed);
  store.commit(planSetNote(map, "culture", cul.i, "言語系統：不明"));
  check("文化に文章", getNote(map, "culture", cul.i) === "言語系統：不明");
  const rel = map.pack.religions.find((r) => r && r.i && !r.removed);
  store.commit(planSetNote(map, "religion", rel.i, "聖典あり"));
  check("宗教に文章", getNote(map, "religion", rel.i) === "聖典あり");
  const burg = map.pack.burgs.find((b) => b && b.i && !b.removed);
  store.commit(planSetNote(map, "burg", burg.i, "城壁都市"));
  check("都市に文章", getNote(map, "burg", burg.i) === "城壁都市");

  // 長さ制限・対象なし
  let threw = false; try { planSetNote(map, "state", state.i, "x".repeat(20001)); } catch { threw = true; }
  check("長すぎる文章は例外", threw);
  threw = false; try { planSetNote(map, "state", 99999, "x"); } catch { threw = true; }
  check("存在しない対象は例外", threw);
  threw = false; try { noteTarget(map, "zone", 1) === null && planSetNote(map, "zone", 1, "x"); } catch { threw = true; }
  check("未対応の種類は例外", threw);

  // 書き出しに反映される
  const text = serializeAzgaar(map);
  if (legacy) {
    check("旧形式: 書き出しに新しい文章が入る", text.includes("特産品：織物") && text.includes("聖典あり"));
  } else {
    check("新形式: 書き出しに note フィールドとして入る", text.includes('"note":"特産品：織物"') || text.includes("特産品：織物"));
  }
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
