import { readFileSync } from "node:fs";
import { parseAzgaarBytes } from "../js/io/azgaar-reader.js";
// テスト用の実マップの置き場所。既定は開発環境のパス。SAMPLES_DIR=... で変更できる
const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
import { createStore, cellChangeCommand } from "../js/core/store.js";

let failed = 0;
const check = (label, ok, extra = "") => {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failed++;
};
const snap = (s) => JSON.stringify(s.map.pack.cells.state);
const getState = (s) => s.map.pack.cells.state;

const { map } = parseAzgaarBytes(readFileSync(SAMPLES + "/境界線の貴方.map"));
const store = createStore({ map });
const original = snap(store.getState());

console.log("=== 基本: commit / undo / redo ===");
const cells = [10, 11, 12, 500];
const oldVals = cells.map((i) => getState(store.getState())[i]);
store.commit(cellChangeCommand("国家を塗る", getState, cells.map((i) => [i, 99])));
check("commitで値が変わる", cells.every((i) => getState(store.getState())[i] === 99));
check("Undo可能になる", store.canUndo());
check("Undoラベルが取れる", store.peekUndoLabel() === "国家を塗る");

store.undo();
check("Undoで完全に元通り", snap(store.getState()) === original);
check("Redo可能になる", store.canRedo());
store.redo();
check("Redoで再適用される", cells.every((i) => getState(store.getState())[i] === 99));
store.undo();
check("Redo後のUndoも元通り", snap(store.getState()) === original);

console.log("=== 新しい操作でRedoが無効化される ===");
store.commit(cellChangeCommand("A", getState, [[1, 5]]));
store.undo();
check("Undo後はRedo可能", store.canRedo());
store.commit(cellChangeCommand("B", getState, [[2, 7]]));
check("新操作でRedoが消える", !store.canRedo());
store.undo();

console.log("=== バッチ: 複数commitが1回のUndoになる ===");
store.beginBatch("ブラシでなぞる");
for (let i = 100; i < 110; i++) store.commit(cellChangeCommand("dab", getState, [[i, 88]]));
check("バッチ中の変更は反映される", getState(store.getState())[105] === 88);
store.endBatch();
check("バッチは履歴1件", store.peekUndoLabel() === "ブラシでなぞる");
store.undo();
check("Undo1回で10セル全て戻る", snap(store.getState()) === original);
store.redo();
check("Redo1回で10セル全て再適用", getState(store.getState())[100] === 88 && getState(store.getState())[109] === 88);
store.undo();

console.log("=== 同じセルを複数回変更しても正しく戻る ===");
store.beginBatch("同一セルを3回");
for (const v of [1, 2, 3]) store.commit(cellChangeCommand("x", getState, [[200, v]]));
store.endBatch();
check("最終値は3", getState(store.getState())[200] === 3);
store.undo();
check("元の値に戻る(途中値1ではない)", snap(store.getState()) === original);

console.log("=== 購読 ===");
let notified = 0, lastType = "";
const unsub = store.subscribe((_s, c) => { notified++; lastType = c.type; });
store.commit(cellChangeCommand("n", getState, [[3, 4]]));
check("commitで通知される", notified === 1 && lastType === "commit");
store.undo();
check("undoで通知される", notified === 2 && lastType === "undo");
unsub();
store.redo();
check("解除後は通知されない", notified === 2);
store.undo();

console.log("=== バッチの安全性 ===");
store.beginBatch("a");
let threw = false;
try { store.beginBatch("b"); } catch { threw = true; }
check("バッチの入れ子はエラー", threw);
store.endBatch();
store.beginBatch("空");
store.endBatch();
check("空バッチは履歴に積まれない", store.peekUndoLabel() !== "空");

console.log("=== replace ===");
store.commit(cellChangeCommand("z", getState, [[1, 1]]));
store.replace({ map: parseAzgaarBytes(readFileSync(SAMPLES + "/新世界より.map")).map });
check("replaceで履歴が消える", !store.canUndo() && !store.canRedo());

console.log("=== 履歴の上限 ===");
const s2 = createStore({ map }, { historyLimit: 100 });
for (let i = 0; i < 150; i++) s2.commit(cellChangeCommand("h" + i, getState, [[i, 1]]));
let undone = 0; while (s2.undo()) undone++;
check("履歴は100件で打ち切り", undone === 100, `undone=${undone}`);

console.log("=== 履歴の上限の既定値 ===");
{
  const s3 = createStore({ map });
  for (let i = 0; i < 260; i++) s3.commit(cellChangeCommand("d" + i, getState, [[i, 1]]));
  let n = 0; while (s3.undo()) n++;
  check("既定の上限は200件", n === 200, `undone=${n}`);
}

console.log("=== 未保存の変更の追跡 ===");
{
  const s = createStore({ map });
  check("読み込み直後は未保存なし", !s.isDirty());
  s.commit(cellChangeCommand("a", getState, [[1, 9]]));
  check("編集すると未保存あり", s.isDirty());
  s.markSaved();
  check("保存すると未保存なし", !s.isDirty());
  s.commit(cellChangeCommand("b", getState, [[2, 9]]));
  check("保存後にまた編集すると未保存あり", s.isDirty());
  s.undo();
  check("保存時点まで Undo すると未保存なしに戻る", !s.isDirty());
  s.undo();
  check("保存時点より前まで Undo すると未保存あり", s.isDirty());
  s.redo();
  check("Redo で保存時点に戻れば未保存なし", !s.isDirty());
  s.commit(cellChangeCommand("c", getState, [[3, 9]])); s.undo(); s.redo(); s.undo();
  check("別の編集を挟んでも、保存時点に戻れば未保存なし", !s.isDirty());
  s.beginBatch("ブラシ");
  s.commit(cellChangeCommand("d", getState, [[4, 9]]));
  check("ブラシ操作の途中も未保存として扱う", s.isDirty());
  s.endBatch(); s.undo();
  check("ブラシを Undo すれば未保存なし", !s.isDirty());
  s.replace({ map });
  check("replace で未保存なしに戻る", !s.isDirty());
  // 保存時点の履歴が上限で捨てられた場合は、常に未保存
  const s4 = createStore({ map }, { historyLimit: 3 });
  s4.commit(cellChangeCommand("x1", getState, [[1, 5]])); s4.markSaved();
  for (let i = 0; i < 5; i++) s4.commit(cellChangeCommand("y" + i, getState, [[10 + i, 5]]));
  while (s4.undo());
  check("保存時点が履歴から落ちたら、最後まで戻っても未保存のまま", s4.isDirty());
  const s5 = createStore({ map }, { historyLimit: 2 });
  s5.markSaved();
  for (let i = 0; i < 4; i++) s5.commit(cellChangeCommand("z" + i, getState, [[20 + i, 5]]));
  while (s5.undo());
  check("空の状態で保存後、履歴が上限を超えたら、全Undoしても未保存のまま", s5.isDirty());
}

console.log("=== バッチ中の通知 ===");
{
  const s = createStore({ map });
  const types = []; s.subscribe((_st, ch) => types.push(ch.type));
  s.beginBatch("b");
  s.commit(cellChangeCommand("1", getState, [[1, 5]])); s.commit(cellChangeCommand("2", getState, [[2, 5]]));
  check("バッチ中の各 commit で 'batch' が通知される", types.join() === "batch,batch", types.join());
  s.endBatch();
  check("endBatch で 'commit' が通知される", types.at(-1) === "commit");
}

console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
