// v4.0.0 の球面世界の画面（jsdom）。ビルド済み dist/app.js を動かす。生成 → 初期集団 → 編集 → 保存 → 開き直し、旧形式の振り分け、破損ファイル。
import { JSDOM } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms = 20000, label = "") { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(25); } console.log(`  (待機が時間切れ: ${label})`); return false; }
function fakeCtx() { const props = {}; return new Proxy({}, { get(_, k) { if (k in props) return props[k]; if (k === "measureText") return (t) => ({ width: String(t).length * 8 }); if (k === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }); return () => {}; }, set(_, k, v) { props[k] = v; return true; } }); }
let savedBlob = null;
const dom = await JSDOM.fromFile(path.join(root, "index.html"), {
  runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
  beforeParse(window) {
    window.devicePixelRatio = 1; window.ResizeObserver = class { observe() {} disconnect() {} };
    window.HTMLCanvasElement.prototype.getContext = function () { return (this.__ctx ??= fakeCtx()); };
    window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0 });
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
    window.Element.prototype.setPointerCapture = () => {}; window.Element.prototype.releasePointerCapture = () => {}; window.Element.prototype.hasPointerCapture = () => false;
    window.URL.createObjectURL = (b) => { savedBlob = b; return "blob:test"; }; window.URL.revokeObjectURL = () => {};
    Object.assign(window, { TextDecoder, TextEncoder, Blob, Response, DecompressionStream, CompressionStream });
  },
});
const { window } = dom, doc = window.document, $ = (id) => doc.getElementById(id), q = (s) => doc.querySelector(s);
check("アプリが起動する", await waitFor(() => window.alterhistory?.worldActions, 10000, "起動"));
const { worldActions, worldWorkspace, store } = window.alterhistory, W = () => worldActions.store.getState();
const btnText = (root, t) => [...root.querySelectorAll("button")].find((b) => b.textContent.includes(t));

console.log("=== 入口・空の状態 ===");
check("ハブに「球面世界」の入口がある", !!$("btn-world"));
$("btn-world").click(); await sleep(30);
check("押すと球面世界の画面が開き、旧エディタの時計などは隠れる（world-mode）", !$("world-stage").hidden && $("app").classList.contains("world-mode"));
check("世界がないときは、生成と読み込みへの案内が出る", !q(".world-empty").hidden && /球面世界/.test(q(".world-empty").textContent) && !!btnText(q(".world-empty"), "新しい世界を生成") && /旧エディタで開きます/.test(q(".world-empty").textContent));
check("モード切り替え・保存・元に戻すは、世界がないあいだ無効", [...doc.querySelectorAll(".world-modes button")].every((b) => b.disabled) && btnText(q(".world-top"), "保存").disabled);

console.log("=== 生成ダイアログ ===");
btnText(q(".world-empty"), "新しい世界を生成").click(); await sleep(30);
const dlg = q("dialog.world-new");
check("ダイアログにシード・セル数・陸地の割合・大陸数・島・初期集団の欄がある", !!dlg && !!dlg.querySelector('input[type="text"]') && dlg.querySelectorAll("select").length >= 2 && dlg.querySelectorAll("input[type=range]").length === 1 && dlg.querySelectorAll("input[type=number]").length === 2);
check("セル数の選択肢に 250,000（標準）と 1,000,000 がある", [...dlg.querySelectorAll("option")].some((o) => o.value === "250000" && /標準/.test(o.textContent)) && [...dlg.querySelectorAll("option")].some((o) => o.value === "1000000"));
btnText(dlg, "キャンセル").click(); await sleep(10);
check("キャンセルで閉じ、世界は作られない", !q("dialog.world-new") && !W().world);

console.log("=== 生成（Worker が無い環境では、その場で生成）===");
const p = worldActions.newWorld({ worldSeed: "ui-world-1", resolution: { targetCells: 5000 } });
await sleep(5); check("生成中は進捗の覆いが出て、「中断」ができる", !q(".world-busy").hidden && !!btnText(q(".world-busy"), "中断"));
const r = await p;
check("生成が成功し、世界ができる（5,000 付近のセル数）", r.ok && !!W().world && Math.abs(W().world.mesh.cellCount - 5000) < 1500, `${W().world?.mesh.cellCount}`);
check("生成後は「初期集団」モードになり、候補の一覧と丸印の元データがある", W().mode === "groups" && doc.querySelectorAll(".world-group").length === W().world.entities.populations.length && doc.querySelectorAll(".world-group").length >= 6);
check("開始集団が未選択の間は「この集団で始める」が押せない", btnText(q(".world-panel"), "この集団で始める").disabled);
await waitFor(() => !W().busy, 15000, "地図の準備");
check("地図の準備が終わり、描画の状態が見える（ラスタ）", /描画 (raster|vector|preparing)/.test(q(".world-status").textContent));

console.log("=== 初期集団の選択 ===");
const row = doc.querySelectorAll(".world-group")[1]; const gid = Number(row.dataset.group); row.click(); await sleep(20);
check("一覧で選ぶと、その集団が選ばれる", W().startGroupId === gid && q(".world-group.on")?.dataset.group === String(gid));
const before = W().world.entities.populations.map((x) => x.cell).join(",");
btnText(q(".world-panel"), "別の候補を提案").click(); await sleep(20);
check("「別の候補を提案」で、候補が置き直され、選択は解除される", W().world.entities.populations.map((x) => x.cell).join(",") !== before && W().startGroupId === null);
const pick = doc.querySelectorAll(".world-group")[0]; pick.click(); await sleep(20);
btnText(q(".world-panel"), "この集団で始める").click(); await sleep(20);
check("「この集団で始める」で開始集団が決まり、閲覧モードに戻る", !!W().world.entities.start && W().mode === "view" && /開始集団: #/.test(q(".world-panel").textContent));
const sea = (() => { const k = W().world.cell; for (let i = 0; i < W().world.mesh.cellCount; i++) if (k.landWater[i] === 0) return i; return -1; })();
worldActions.setMode("groups"); const bad = worldActions.placeGroup(sea);
check("手動配置: 海には置けず、理由が返る", !bad.ok && /海/.test(bad.reason));
const landCell = (() => { const k = W().world.cell; for (let i = 0; i < W().world.mesh.cellCount; i++) if (k.landWater[i] === 1 && k.fertility[i] > 0.3 && k.temp[i] > 5 && k.temp[i] < 28 && !W().world.entities.populations.some((x) => x.cell === i)) return i; return -1; })();
const good = worldActions.placeGroup(landCell);
check("手動配置: 肥沃な陸には置け、その集団が選ばれる", good.ok && W().startGroupId === good.id);
worldActions.setMode("view");

console.log("=== 表示レイヤー・セルの情報 ===");
const sel = q(".world-layer"); sel.value = "elevation"; sel.dispatchEvent(new window.Event("change")); await sleep(20);
check("表示を「標高」に切り替えると、状態と凡例が変わる", W().layer === "elevation" && /深海/.test(q(".world-legend").textContent));
sel.value = "resource"; sel.dispatchEvent(new window.Event("change")); await sleep(20);
check("「資源」では、資源の種類の選択が出る", !q(".world-res").hidden && q(".world-res").options.length >= 11);
sel.value = "biome"; sel.dispatchEvent(new window.Event("change")); await sleep(10);
worldActions.select(landCell); await sleep(20);
check("セルを選ぶと、パネルに標高・バイオーム・気温・降水などが出る", /バイオーム/.test(q(".world-panel").textContent) && /肥沃度/.test(q(".world-panel").textContent) && /資源/.test(q(".world-panel").textContent));

console.log("=== 地形編集 ===");
worldActions.setMode("edit"); await sleep(20);
check("編集モードで、ブラシの種類・半径・強さが出る", /種類/.test(q(".world-panel").textContent) && q(".world-panel").querySelectorAll("input[type=range]").length >= 2 && [...q(".world-panel select").options].length === 4);
const hillCell = (() => { const k = W().world.cell; for (let i = 0; i < W().world.mesh.cellCount; i++) if (k.landWater[i] === 1 && k.elevation[i] > 400 && k.elevation[i] < 1800 && !W().world.entities.populations.some((x) => x.cell === i)) return i; return -1; })();
const h0 = W().world.hash; worldActions.setBrush({ mode: "raise", radiusKm: 700, deltaM: 800 });
const er = worldActions.editAt(hillCell);
check("ブラシで標高が変わり、世界のハッシュが変わり、履歴が 1 件になる", er.ok && W().world.hash !== h0 && W().undoCount === 1 && W().canUndo);
check("元に戻す・やり直すの画面ボタンは置かない（旧エディタと同じ方針。キー操作だけ）", !btnText(q(".world-top"), "元に戻す") && !btnText(q(".world-top"), "やり直す"));
const key = (k, shift = false) => doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, ctrlKey: true, shiftKey: shift, bubbles: true }));
check("編集後も検査に通る", worldActions.check().length === 0);
key("z"); await sleep(20);
check("Ctrl+Z で、ハッシュが元に戻る", W().world.hash === h0 && W().undoCount === 0 && W().canRedo);
key("y"); await sleep(20);
check("Ctrl+Y で再び編集後になる", W().world.hash !== h0);
const startCell = W().world.entities.populations.find((x) => x.id === W().startGroupId).cell;
const guard = worldActions.editAt(startCell) ; worldActions.setBrush({ mode: "lower", radiusKm: 300, deltaM: 20000 }); const g2 = worldActions.editAt(startCell);
check("集団の居住地を海にする編集は拒否され、理由が通知される", g2.ok === false && /初期集団/.test(g2.reason) && /初期集団/.test(q(".world-banner").textContent));
worldActions.setBrush({ mode: "raise", radiusKm: 600, deltaM: 400 }); worldActions.setMode("view");

console.log("=== 保存・開き直し ===");
const hashBefore = W().world.hash, startBefore = JSON.stringify(W().world.entities.start), popsBefore = JSON.stringify(W().world.entities.populations);
$("btn-save").click(); await waitFor(() => savedBlob, 20000, "保存");
check("「保存」（ハブ）が、球面世界の画面では世界を .ahmap として保存する", !!savedBlob && savedBlob.size > 10000 && !W().dirty);
const savedBytes = new Uint8Array(await savedBlob.arrayBuffer());
check("保存されたバイト列は .ahmap v2（マジック AHMAP2）", new TextDecoder().decode(savedBytes.subarray(0, 6)) === "AHMAP2");
$("btn-world").click(); await sleep(30); // 保存済みなので、確認なしで旧エディタに戻れる
check("保存後は確認なしで閉じられ、旧エディタに戻る", $("world-stage").hidden && !$("app").classList.contains("world-mode"));
// 開き直し（ファイル選択）
Object.defineProperty($("file-input"), "files", { value: [new window.File([savedBytes], "reopen.ahmap")], configurable: true });
$("file-input").dispatchEvent(new window.Event("change"));
check("ファイルを選ぶと、.ahmap v2 は球面世界の画面で開く", await waitFor(() => !$("world-stage").hidden && W().fileName === "reopen.ahmap" && !W().busy, 20000, "開き直し"));
check("開き直した世界のハッシュ・開始集団・集団の一覧が、保存前と一致する", W().world.hash === hashBefore && JSON.stringify(W().world.entities.start) === startBefore && JSON.stringify(W().world.entities.populations) === popsBefore);
check("開き直した世界でも、編集と Undo ができる", (() => { const r2 = worldActions.editAt(hillCell); const ok = r2.ok && W().undoCount === 1; worldActions.undo(); return ok && W().world.hash === hashBefore; })());

console.log("=== 破損・旧形式 ===");
const bad2 = savedBytes.slice(); bad2[Math.floor(bad2.length * 0.7)] ^= 0xff;
const keep = W().world; Object.defineProperty($("file-input"), "files", { value: [new window.File([bad2], "broken.ahmap")], configurable: true });
$("file-input").dispatchEvent(new window.Event("change"));
check("破損したファイルは、理由つきで拒否し、今の世界は残る", await waitFor(() => W().error, 20000, "破損") && /開けませんでした/.test(W().error) && /元のファイルは変更していません/.test(W().error) && W().world === keep);
check("エラーは画面の上に出る", !q(".world-banner").hidden && q(".world-banner").classList.contains("err"));
const { text } = buildSyntheticMapText({ seed: 3 });
worldActions.store.update((s) => { s.error = null; s.dirty = false; });
Object.defineProperty($("file-input"), "files", { value: [new window.File([text], "legacy.map")], configurable: true });
$("file-input").dispatchEvent(new window.Event("change"));
check("Azgaar の .map は旧エディタで開く（球面世界の画面は閉じる）", await waitFor(() => store.getState().map, 20000, "旧形式") && $("world-stage").hidden && !$("app").classList.contains("world-mode"));

console.log("=== 生成の中断 ===");
$("btn-world").click(); await sleep(30);
const w0 = W().world; const pp = worldActions.newWorld({ worldSeed: "to-cancel", resolution: { targetCells: 20000 } }); await sleep(5); worldActions.cancelGeneration();
const rr = await pp;
check("生成を中断すると、覆いが消え、今の世界は変わらない", rr.cancelled === true && !W().busy && W().world === w0);

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); window.close(); process.exit(failed ? 1 : 0);
