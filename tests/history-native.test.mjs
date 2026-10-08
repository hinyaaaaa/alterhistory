// 歴史ログ・名前の自動生成・ALTERHISTORY形式(.ahmap)の往復・クロニクル(.md)の検証
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { loadFromBytes } from "../js/io/loader.js";
import { createStore } from "../js/core/store.js";
import { createEditActions } from "../js/app/edit-actions.js";
import { listHistory } from "../js/core/edit/history-log.js";
import { suggestLabel } from "../js/core/edit/naming.js";
import { createRandom } from "../js/core/random.js";
import { serializeNativeJson, parseNativeJson, serializeNative, rleFlat, unrleFlat } from "../js/io/native-map.js";
import { buildChronicle, chronicleToMarkdown } from "../js/io/chronicle.js";

const SAMPLES = process.env.SAMPLES_DIR ?? "tests/.samples";
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

console.log("=== RLE ===");
const arr = [0, 0, 0, 5, 5, 1, 0];
check("RLE の往復", JSON.stringify(unrleFlat(rleFlat(arr))) === JSON.stringify(arr));

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const { map } = await loadFromBytes(new Uint8Array(readFileSync(`${SAMPLES}/${f}`)), Delaunator);
  const store = createStore({ map });
  const ea = createEditActions({ store, renderer: { requestRender() {} } });
  const M = () => store.getState().map;
  const live = (l) => l.filter((x) => x && x.i && !x.removed);

  console.log("--- 名前の自動生成 ---");
  const rnd = createRandom(7);
  const names = { alliance: new Set(), zone: new Set(), deity: new Set(), era: new Set() };
  for (const k of Object.keys(names)) for (let i = 0; i < 20; i++) names[k].add(suggestLabel(M(), { kind: k, rnd, type: "Disease" }));
  check("同盟・ゾーン・最高神・時代の名前が作れて、バラける", Object.values(names).every((s) => s.size >= 15), Object.values(names).map((s) => s.size).join("/"));
  check("同盟名は同盟らしい語尾", [...names.alliance].every((n) => /同盟|連合|協商|盟約|条約機構|共栄圏|協約|連盟/.test(n)));
  check("疫病ゾーンは疫病らしい名前", [...names.zone].every((n) => /疫|熱/.test(n)));
  check("時代名は時代らしい語尾", [...names.era].every((n) => /時代|の世|朝|期|紀/.test(n)));

  console.log("--- 歴史ログ ---");
  const st = live(M().pack.states)[0];
  const oldName = st.fullName ?? st.name;
  ea.renameEntity("state", st.i, "テスト王国");
  let log = listHistory(M());
  check("国名の変化が年表に残る（旧名→新名）", log.length === 1 && log[0].type === "rename-state" && log[0].title.includes(oldName) && log[0].title.includes("テスト王国"), log[0]?.title);
  const rid = ea.addEntity("religion", "");
  const rel = M().pack.religions[rid];
  log = listHistory(M());
  check("宗教の誕生が最高神つきで残る", log.at(-1).type === "created-religion" && log.at(-1).detail?.includes(rel.deity ?? "?"), JSON.stringify(log.at(-1)));
  ea.setEntityProfile("religion", rid, { deity: "新しい神" });
  check("最高神の変更が残る", listHistory(M()).at(-1).type === "profile-religion" && listHistory(M()).at(-1).detail.includes("新しい神"));
  const zi = ea.addZoneAround(live(M().pack.burgs)[0].cell, { type: "Disease", size: 10 });
  const z = M().zones[zi];
  check("ゾーンは名前を省くと種類に合った名前が付き、年表に残る", !!z.name && z.name !== "" && listHistory(M()).at(-1).type === "created-zone", z?.name);
  // 領土の塗り足しは同じ日・同じ対象なら1件にまとまる
  const c = M().pack.cells, land = []; for (let i = 0; i < c.biome.length && land.length < 40; i++) if (c.biome[i] !== 0 && c.state[i] === 0) land.push(i);
  const n0 = listHistory(M()).length;
  if (land.length >= 10) {
    ea.paintCells("state", st.i, land.slice(0, 5)); ea.paintCells("state", st.i, land.slice(5, 10));
    const t = listHistory(M()).filter((h) => h.type === "territory");
    check("領土の塗り足しは1件にまとまり、セル数が足される", listHistory(M()).length === n0 + 1 && t.at(-1).count === 10, JSON.stringify(t.at(-1)));
  }
  const total = listHistory(M()).length;
  while (store.canUndo()) store.undo();
  check("Undo をすべて戻すと歴史ログも空になる", listHistory(M()).length === 0, `${total}件→${listHistory(M()).length}件`);
  while (store.canRedo()) store.redo();
  check("Redo で歴史ログも戻る", listHistory(M()).length === total);

  console.log("--- クロニクル(.md) ---");
  const md = chronicleToMarkdown(buildChronicle(M(), { fileName: f, includeCells: false }));
  check("年表に、国名の変化・宗教の誕生・最高神の変更・ゾーン発生が年月つきで載る", ["国家の改名", "テスト王国", "宗教", "誕生", "新しい神", "ゾーン"].every((w) => md.includes(w)));
  check("年→月の見出しで並ぶ", /#### \d+年/.test(md) && /- \d+月　\*\*\[/.test(md));
  check("宗教の欄に最高神が出る", /最高神「新しい神」/.test(md));
  check("ゾーンの章がある", md.includes("## 7. ゾーン") && md.includes(z.name));

  console.log("--- .ahmap 形式の往復 ---");
  const json = serializeNativeJson(M(), { savedAt: "2026-10-8" });
  const back = parseNativeJson(json).map;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check("セル配列が一致", ["biome", "burg", "culture", "pop", "river", "state", "religion", "province"].every((k) => same(back.pack.cells[k], M().pack.cells[k])));
  check("国家・宗教・都市・属州・河川が一致", ["states", "cultures", "religions", "provinces", "burgs", "rivers"].every((k) => same(back.pack[k], M().pack[k])));
  check("歴史ログ・世界の時刻・ゾーン・マーカーが一致", same(back.ext.data, M().ext.data) && same(back.worldTime, M().worldTime) && same(back.zones, M().zones) && same(back.markers, M().markers));
  check("格子（標高・降水・点）が一致", same(back.grid.h, M().grid.h) && same(back.grid.points, M().grid.points));
  check("Azgaar 形式より読みやすい（改行なしの1つの JSON・数字の羅列の行ではない）", json.startsWith("{") && !json.includes("\n"));
  const bytes = await serializeNative(M(), { savedAt: "x" });
  const loaded = await loadFromBytes(new Uint8Array(bytes), Delaunator);
  check("loader が .ahmap を自動判定して読み込み、形状まで作る", loaded.map.geometry?.pack?.p?.length === M().pack.cells.biome.length && loaded.map.pack.states.length === M().pack.states.length);
  const loaded2 = await loadFromBytes(new Uint8Array(Buffer.from(gzipSync(Buffer.from(json)))), Delaunator);
  check("gzip の .ahmap も読み込める", loaded2.map.pack.burgs.length === M().pack.burgs.length);
  const st2 = createStore({ map: loaded.map });
  const ea2 = createEditActions({ store: st2, renderer: { requestRender() {} } });
  ea2.renameEntity("state", live(loaded.map.pack.states)[0].i, "読み戻し後の国");
  check("読み戻した地図も編集でき、歴史ログが続く", listHistory(st2.getState().map).at(-1).title.includes("読み戻し後の国") && listHistory(st2.getState().map).length === total + 1);
}
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
