// 共通の初期設定：確定するまで何も作られない／確定すると1回の操作で作られ、年表には最終内容で1件だけ残る。
import assert from "node:assert/strict";
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "../js/io/loader.js";
import { createStore } from "../js/core/store.js";
import { createSetupActions } from "../js/app/setup-actions.js";
import { createEditActions } from "../js/app/edit-actions.js";
import { listHistory } from "../js/core/edit/history-log.js";
import { checkIntegrity } from "../js/core/edit/integrity.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.stack?.split("\n").slice(0, 3).join(" | ")}`); } };

const { text } = buildSyntheticMapText({ seed: 7 });
const Delaunator = (await import("node:module")).createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
const { map } = await loadFromBytes(new TextEncoder().encode(text), Delaunator);
const store = createStore({ map });
const renderer = { requestRender() {} };
const setup = createSetupActions({ store, renderer });
const edit = createEditActions({ store, renderer });
const M = () => store.getState().map;
const live = (k) => M().pack[k].filter((e) => e && e.i > 0 && !e.removed);
const log = () => listHistory(M());
// 国6を（編集操作で）空き地にして、おまかせ領土が使えるようにする。以後に新しい整合性の指摘が増えないことを見る
{ const cells = []; for (let i = 0; i < M().pack.cells.state.length; i++) if (M().pack.cells.state[i] === 6) cells.push(i); edit.paintCells("state", 0, cells); }
const problems0 = new Set(checkIntegrity(M()));

console.log("=== 国家：確定して1件だけ記録 ===");
const nStates = live("states").length, nLog = log().length;
let made;
check("名前・色・政体を指定して作れる", () => {
  made = setup.create("state", { name: "テスト王国", color: "#12ab34", form: "Monarchy", formName: "王国", territory: "m", capital: true });
  const s = M().pack.states[made.id];
  assert.equal(live("states").length, nStates + 1);
  assert.equal(s.fullName, "テスト王国");
  assert.equal(s.color, "#12ab34");
  assert.equal(s.form, "Monarchy");
  assert.ok(made.claimed > 0 && s.cells > 0, "おまかせ領土が塗られる");
  assert.ok(s.capital > 0 && made.capital, "首都が置かれる");
  assert.equal(M().pack.burgs[s.capital].state, made.id);
});
check("年表には「建国」が1件だけ（領土・首都・改名の記録は増えない）", () => {
  const added = log().slice(nLog);
  assert.equal(added.length, 1, JSON.stringify(added.map((e) => e.type)));
  assert.equal(added[0].type, "created-state");
  assert.ok(added[0].title.includes("テスト王国"));
  assert.ok(added[0].detail.includes("領土") && added[0].detail.includes("首都"));
  assert.deepEqual(added[0].states, [made.id]);
  assert.ok(!added.some((e) => /rename|territory|created-burg/.test(e.type)));
});
check("「仮」の名前の印は付かない（確定済み）", () => assert.equal(edit.isProvisional("state", made.id), false));
check("整合性の検査に、新しい指摘が増えない", () => assert.deepEqual(checkIntegrity(M()).filter((p) => !problems0.has(p)), []));
check("Undo 1回で、国も領土も首都も年表も作成前に戻る", () => {
  assert.equal(store.undo(), true);
  assert.equal(live("states").length, nStates);
  assert.equal(log().length, nLog);
  assert.equal(M().pack.cells.state.filter((v) => v === made.id).length, 0);
  store.redo();
  assert.equal(live("states").length, nStates + 1);
});
check("確定後の改名は、これまで通り記録される", () => {
  const before = log().length;
  edit.renameEntity("state", made.id, "新テスト王国");
  assert.equal(log().length, before + 1);
  assert.equal(log().at(-1).type, "rename-state");
});

console.log("=== 名前が空ならおまかせ／領土はあとで塗る ===");
check("名前が空でも作れる（おまかせの名前で、仮の印は付かない）", () => {
  const n0 = live("religions").length;
  const r = setup.create("religion", { territory: "later" });
  assert.equal(live("religions").length, n0 + 1);
  assert.ok(r.name && r.claimed === 0);
  assert.ok(M().pack.religions[r.id].deity, "神名もいっしょに決まる");
  assert.equal(edit.isProvisional("religion", r.id), false);
});
check("🎲で決めた名前の付属項目（国の短い名前）を引き継げる", () => {
  const g = setup.suggest("state");
  const r = setup.create("state", { name: g.name, baseExtra: g.extra });
  assert.equal(M().pack.states[r.id].name, g.extra.name ?? g.name);
});
check("文化：種類と起源を指定できる", () => {
  const parent = live("cultures")[0].i;
  const r = setup.create("culture", { name: "分家文化", type: "Nomadic", origins: [parent] });
  const c = M().pack.cultures[r.id];
  assert.equal(c.type, "Nomadic");
  assert.deepEqual(c.origins, [parent]);
});
check("属州：所属国を指定して作れる。年表に1件", () => {
  const n = log().length, st = live("states")[0].i;
  const r = setup.create("province", { name: "新属州", stateId: st, color: "#aa00aa" });
  assert.equal(M().pack.provinces[r.id].state, st);
  assert.equal(M().pack.provinces[r.id].color, "#aa00aa");
  assert.equal(log().length, n + 1);
  assert.equal(log().at(-1).type, "created-province");
});

console.log("=== 失敗したら何も作られない ===");
check("存在しない所属国の属州は、国も年表も増えない", () => {
  const n = live("provinces").length, l = log().length;
  assert.throws(() => setup.create("province", { name: "迷子", stateId: 9999 }));
  assert.equal(live("provinces").length, n);
  assert.equal(log().length, l);
});
check("不正な政体は、国ごと取り消される", () => {
  const n = live("states").length, l = log().length;
  assert.throws(() => setup.create("state", { name: "壊れた国", form: "NoSuchForm" }));
  assert.equal(live("states").length, n);
  assert.equal(log().length, l);
  assert.ok(!live("states").some((s) => s.fullName === "壊れた国"));
});
check("不正な色は無視され、自動の色になる", () => {
  const r = setup.create("culture", { name: "色なし文化", color: "red" });
  assert.match(M().pack.cultures[r.id].color, /^#[0-9a-f]{6}$/);
});

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
