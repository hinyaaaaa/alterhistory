// バランス設定は端末ではなく地図に保存される（同じ地図なら同じ歴史になる）ことの検証。
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { BALANCE, BALANCE_DEFAULTS } from "../js/core/sim/balance.js";
import { planSetBalance, applyMapBalance, balanceOverrides } from "../js/core/edit/balance-setting.js";

const newMap = () => ({ ext: { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} } });
const store = createStore({ map: newMap() });
const map = () => store.getState().map;

assert.equal(BALANCE.noiseAmp, BALANCE_DEFAULTS.noiseAmp);
store.commit(planSetBalance(map(), { noiseAmp: 0.4 }));
assert.equal(BALANCE.noiseAmp, 0.4, "反映される");
assert.deepEqual(map().ext.data.balance, { noiseAmp: 0.4 }, "既定値と違う項目だけが地図に入る");
assert.equal(planSetBalance(map(), { noiseAmp: 0.4 }), null, "同じ値は変更なし");
store.commit(planSetBalance(map(), { noiseAmp: 99 }));
assert.equal(BALANCE.noiseAmp, 0.6, "範囲外は上限に丸める");
store.commit(planSetBalance(map(), { noiseAmp: BALANCE_DEFAULTS.noiseAmp }));
assert.equal(map().ext.data.balance, undefined, "既定値に戻すと地図から消える");

// 別の地図を開くと、前の地図の値は持ち越されない
store.commit(planSetBalance(map(), { noiseAmp: 0.3, annexMinScore: 40 }));
const other = newMap();
applyMapBalance(other);
assert.equal(BALANCE.noiseAmp, BALANCE_DEFAULTS.noiseAmp, "上書きの無い地図は既定値");
applyMapBalance(map());
assert.equal(BALANCE.annexMinScore, 40, "保存された地図を開くと値が復元される");

// Undo / Redo で実行時の値も戻る
store.undo();
assert.equal(BALANCE.annexMinScore, BALANCE_DEFAULTS.annexMinScore, "Undoで既定値に戻る");
store.redo();
assert.equal(BALANCE.annexMinScore, 40, "Redoで再び反映される");
const before = balanceOverrides(map());
store.commit(planSetBalance(map(), null));
assert.deepEqual(balanceOverrides(map()), {}, "全て既定値に戻す");
assert.equal(BALANCE.noiseAmp, BALANCE_DEFAULTS.noiseAmp);
store.undo();
assert.deepEqual(balanceOverrides(map()), before, "Undoで上書きが戻る");
assert.equal(planSetBalance({ ext: { data: {} } }, null), null, "上書きが無ければ何もしない");
console.log("  OK   バランス設定は地図に保存される");
console.log("\n全テスト合格");

// 保存 → 読み込みで上書き値が残る（ALTERHISTORY形式）
{
  const { readFileSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  const { loadFromBytes } = await import("../js/io/loader.js");
  const { serializeAzgaar } = await import("../js/io/azgaar-writer.js");
  const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
  const SAMPLES = process.env.SAMPLES_DIR ?? "tests/.samples";
  const { map: m } = await loadFromBytes(new Uint8Array(readFileSync(SAMPLES + "/新世界より.map")), Delaunator);
  const st = createStore({ map: m });
  st.commit(planSetBalance(st.getState().map, { noiseAmp: 0.33 }));
  const text = serializeAzgaar(st.getState().map, { native: true, exportedAt: "2026-10-08" });
  const { map: m2 } = await loadFromBytes(new Uint8Array(Buffer.from(text, "utf-8")), Delaunator);
  assert.deepEqual(balanceOverrides(m2), { noiseAmp: 0.33 }, "保存して開き直しても上書き値が残る");
  const { map: m3 } = await loadFromBytes(new Uint8Array(Buffer.from(serializeAzgaar(st.getState().map, { native: false, exportedAt: "2026-10-08" }), "utf-8")), Delaunator);
  assert.deepEqual(balanceOverrides(m3), {}, "Azgaar互換で書き出すと拡張データは含まれない");
  console.log("  OK   保存・読み込みで残る");
}
