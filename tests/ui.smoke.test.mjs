// UI 統合テスト（jsdom）。実際の index.html とビルド済み dist/app.js を動かす。
//
// 限界: jsdom はレイアウトも Canvas 描画も行わない。ここで確認できるのは
//   「配線が正しく、例外を出さず、状態と表示が期待通りに変わること」まで。
//   実際の見た目・操作感・速度は、実ブラウザ（Surface Go 4）で確認が必要。
//   描画結果そのものは render_png での目視確認と、tests/geometry.test.mjs で検証済み。
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
// テスト用の実マップの置き場所。既定は開発環境のパス。SAMPLES_DIR=... で変更できる
const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms = 8000, label = "") {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(20); }
  console.log(`  (待機タイムアウト: ${label})`);
  return false;
}

// ---- 何も描かない偽の Canvas コンテキスト（呼び出し回数だけ数える） ----
const drawStats = { fill: 0, stroke: 0, fillText: 0, drawImage: 0 };
function fakeCtx() {
  const props = {};
  return new Proxy({}, {
    get(_, k) {
      if (k in props) return props[k];
      if (k === "measureText") return (t) => ({ width: String(t).length * 8 });
      return (...a) => { if (k in drawStats) drawStats[k]++; };
    },
    set(_, k, v) { props[k] = v; return true; },
  });
}

const dom = await JSDOM.fromFile(path.join(root, "index.html"), {
  runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
  beforeParse(window) {
    window.devicePixelRatio = 1.5; // 高DPI経路も通す
    window.ResizeObserver = class { observe() {} disconnect() {} };
    window.HTMLCanvasElement.prototype.getContext = function () { return (this.__ctx ??= fakeCtx()); };
    window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0 });
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    window.Element.prototype.setPointerCapture = () => {};
    window.Element.prototype.releasePointerCapture = () => {};
    window.Element.prototype.hasPointerCapture = () => false;
    // jsdom に無い Web API を Node のものから補う（gzip 展開・デコードに必要）
    Object.assign(window, { TextDecoder, Blob, Response, DecompressionStream });
    // ダウンロードの捕捉: createObjectURL で渡された Blob と、a[download] のクリックを記録する
    const blobs = new Map();
    window.URL.createObjectURL = (b) => { const u = "blob:test/" + blobs.size; blobs.set(u, b); return u; };
    window.URL.revokeObjectURL = () => {};
    window.__downloads = [];
    window.HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute("download")) window.__downloads.push({ name: this.getAttribute("download"), blob: blobs.get(this.href) });
    };
    // 本物の PNG 変換は Node 側の canvas でしか検証できない（tests/export.test.mjs）。ここでは経路だけ通す
    window.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" })); };
  },
});
const { window } = dom;
const $ = (id) => window.document.getElementById(id);

const ready = await waitFor(() => window.alterhistory, 8000, "アプリ起動");
check("アプリが起動する（バンドルの実行と配線）", ready);
if (!ready) { console.log("以降を中止"); process.exit(1); }
const { store, viewport } = window.alterhistory;

const errors = [];
window.addEventListener("error", (e) => errors.push(e.message));

const mapFile = (name) => new File([readFileSync(SAMPLES + "/" + name)], name);

console.log("=== 初期状態 ===");
check("空の状態の案内が表示されている", !$("empty-state").hidden);
check("ステータス: 未読み込み", $("status-map").textContent === "未読み込み");
check("凡例: 案内文", $("legend-list").textContent.includes("地図を開くと"));
check("保存ボタンは無効（地図が無い）", $("btn-save").disabled === true);
check("書き出しメニューは無効（地図が無い）", $("export-menu").classList.contains("disabled"));
{
  const ev = new window.KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
  window.document.dispatchEvent(ev);
  check("地図が無いとき Ctrl+S はブラウザの既定動作を奪わない", ev.defaultPrevented === false);
}

console.log("=== ファイルを開く（<input> の change 経由） ===");
const input = $("file-input");
let sawBusy = false, sawLoadingVisible = false;
store.subscribe((s) => { if (s.busy) { sawBusy = true; if (!$("loading").hidden) sawLoadingVisible = true; } });
Object.defineProperty(input, "files", { value: [mapFile("境界線の貴方.map")], configurable: true });
input.dispatchEvent(new window.Event("change"));
check("読み込み中の状態になり、画面に表示される", await waitFor(() => sawBusy, 3000, "busy") && await waitFor(() => sawLoadingVisible, 3000, "loading表示"), `busy=${sawBusy} 表示=${sawLoadingVisible}`);
check("読み込みが完了する", await waitFor(() => store.getState().map, 15000, "読み込み"));
await sleep(100);
check("空の状態の案内が消える", $("empty-state").hidden);
check("読み込み中の表示が消える", $("loading").hidden);
check("ステータスにセル数", $("status-map").textContent.includes("7603セル"), $("status-map").textContent);
check("凡例に国家が並ぶ", $("legend-title").textContent.startsWith("凡例：国家（") && $("legend-list").querySelectorAll("button").length > 5, $("legend-title").textContent);
check("凡例の色チップに色が付く", $("legend-list").querySelector(".chip").style.background !== "");
check("描画命令が実行された", drawStats.fill > 0 && drawStats.fillText > 0, JSON.stringify(drawStats));
check("地図全体が画面に収まる(fit)", viewport.k === viewport.fitK && viewport.k > 0);
check("スクリプトエラーなし", errors.length === 0, errors.join("|"));

console.log("=== ツールバー ===");
const sel = $("sel-overlay");
sel.value = "culture"; sel.dispatchEvent(new window.Event("change"));
check("色分けを文化に切替 → 凡例が更新", store.getState().view.overlay === "culture" && $("legend-title").textContent.startsWith("凡例：文化"), $("legend-title").textContent);
sel.value = "none"; sel.dispatchEvent(new window.Event("change"));
check("色分けなし → 案内文", $("legend-list").textContent.includes("色分けを選ぶと"));
const chk = $("chk-rivers"); chk.checked = false; chk.dispatchEvent(new window.Event("change"));
check("河川のチェックを外す → 状態に反映", store.getState().view.rivers === false);

console.log("=== キーボード ===");
const key = (k, extra = {}) => window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, ...extra }));
key("2");
check("[2] 国家に切替 → セレクトも同期", store.getState().view.overlay === "state" && sel.value === "state");
key("4");
check("[4] 宗教に切替", store.getState().view.overlay === "religion");
key("b");
check("[B] 標高に切替 → セレクトも同期", store.getState().view.base === "height" && $("sel-base").value === "height");
key("r");
check("[R] 河川を再表示 → チェックも同期", store.getState().view.rivers === true && $("chk-rivers").checked === true);
const k0 = viewport.k; key("+");
check("[+] 拡大", viewport.k > k0);
key("f");
check("[F] 全体表示に戻る", Math.abs(viewport.k - viewport.fitK) < 1e-9);
const x0 = viewport.x; key("ArrowLeft");
check("[←] 移動", viewport.x > x0);
key("f");
key("2", { ctrlKey: true });
check("Ctrl+数字は無視される（ブラウザ操作と衝突しない）", store.getState().view.overlay === "religion");

console.log("=== 入力欄でのショートカット抑止 ===");
sel.focus();
sel.dispatchEvent(new window.KeyboardEvent("keydown", { key: "3", bubbles: true }));
check("セレクト上のキー入力では切り替わらない", store.getState().view.overlay === "religion");

console.log("=== マウス ===");
const canvas = $("map-canvas");
await sleep(250); // 直前の描き直しが落ち着くのを待つ
const before2 = { ...drawStats };
canvas.dispatchEvent(new window.WheelEvent("wheel", { deltaY: -300, clientX: 500, clientY: 350, bubbles: true, cancelable: true }));
check("ホイールで拡大", viewport.k > viewport.fitK);
const expectPct = Math.round((viewport.k / viewport.fitK) * 100);
check("ステータスのズーム表示が実際の倍率に更新される", await waitFor(() => $("status-zoom").textContent === `拡大率 ${expectPct}%`, 1500, "zoom表示"), `期待=${expectPct}% 実際=${$("status-zoom").textContent}`);
check("操作中は直前の画像を移動して高速表示する", drawStats.drawImage > before2.drawImage, `drawImage +${drawStats.drawImage - before2.drawImage}`);
const fillsMid = drawStats.fill;
check("止まった後に高精細な描き直しが行われる", await waitFor(() => drawStats.fill > fillsMid, 2000, "再描画"), `fill +${drawStats.fill - fillsMid}`);
const px = viewport.x;
const mouse = (type, x, y) => canvas.dispatchEvent(new window.MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
mouse("pointerdown", 300, 300); mouse("pointermove", 340, 320); mouse("pointerup", 340, 320);
check("ドラッグで移動", viewport.x !== px);
window.alterhistory.actions.fit();
mouse("pointermove", 500, 350);
check("ホバーでセル情報が出る", await waitFor(() => $("status-hover").textContent.length > 0, 1500, "hover"), $("status-hover").textContent.slice(0, 60));
mouse("pointermove", 5000, 5000);
check("地図の外ではセル情報が消える", await waitFor(() => $("status-hover").textContent === "", 1500, "hover消去"));

console.log("=== 凡例のクリック ===");
key("2");
const before = { x: viewport.x, k: viewport.k };
$("legend-list").querySelector("button").click();
check("凡例クリックでその場所へ移動・拡大", viewport.k > before.k);

console.log("=== ヘルプ ===");
key("?");
check("[?] でヘルプが開く", $("help-dialog").hasAttribute("open"));

console.log("=== ドラッグ＆ドロップ / gzip ===");
const dropTo = (file) => {
  const ev = new window.Event("drop", { bubbles: true, cancelable: true });
  ev.dataTransfer = { types: ["Files"], files: [file] };
  window.dispatchEvent(ev);
};
window.document.getElementById("help-dialog").removeAttribute("open");
dropTo(new File([gzipSync(readFileSync(SAMPLES + "/新世界より.map"))], "新世界より.map.gz"));
check("gzip をドロップして開ける", await waitFor(() => $("status-map").textContent.includes("1965セル"), 15000, "gz読み込み"), $("status-map").textContent);
check("別の地図に凡例が入れ替わる（国家3件）", $("legend-title").textContent === "凡例：国家（3）" && $("legend-list").querySelectorAll("button").length === 3, $("legend-title").textContent);
check("色分けなどの表示設定は引き継がれる", store.getState().view.overlay === "state");

console.log("=== 保存・書き出し ===");
const { parseAzgaarText } = await import("../js/io/azgaar-reader.js");
const { attachExtension } = await import("../js/io/native-format.js");
const lastDownload = async (n0) => { await waitFor(() => window.__downloads.length > n0, 8000, "ダウンロード"); return window.__downloads.at(-1); };
const textOf = async (blob) => Buffer.from(await blob.arrayBuffer()).toString("utf-8");

check("地図を開いているので保存ボタンが有効", $("btn-save").disabled === false);
check("書き出しメニューが有効", !$("export-menu").classList.contains("disabled"));

let n = window.__downloads.length;
$("btn-save").click();
let d = await lastDownload(n);
check("[保存] ファイル名は 地図名.map", d?.name === "新世界より.map", d?.name);
const savedText = d ? await textOf(d.blob) : "";
const reread = parseAzgaarText(savedText);
const wExt = attachExtension(reread.map);
check("[保存] 中身は ALTERHISTORY 形式として読み戻せる", reread.map.meta.source === "alterhistory" && wExt.length === 0);
check("[保存] 国家・都市が元と同じ", reread.map.pack.states.length === store.getState().map.pack.states.length && reread.map.pack.burgs.length === store.getState().map.pack.burgs.length);
// 47 行の元ファイル + 空行で 53 行にそろえ + 拡張行 1 行 = 54 行。CRLF が保たれていないと数が合わない
check("[保存] 改行は CRLF のまま（行数が 54 行）", savedText.split("\r\n").length === 54, `${savedText.split("\r\n").length}行`);
check("[保存] 完了の通知が出る", await waitFor(() => !$("banner").hidden && $("banner").classList.contains("info"), 3000, "通知"), $("banner-body").textContent);
check("[保存] 通知にファイル名", $("banner-body").textContent.includes("新世界より.map"));

const menuItem = (k) => $("export-menu").querySelector(`[data-export="${k}"]`);
$("export-menu").open = true;
n = window.__downloads.length; menuItem("svg").click();
d = await lastDownload(n);
const svgText = d ? await textOf(d.blob) : "";
check("[SVG] ファイル名と種類", d?.name === "新世界より.svg" && d.blob.type === "image/svg+xml", d?.name);
check("[SVG] 中身が SVG 文書", svgText.startsWith("<?xml") && svgText.includes("<svg") && svgText.includes("<path"));
check("[SVG] クリック後にメニューが閉じる", $("export-menu").open === false);

$("export-menu").open = true;
n = window.__downloads.length; menuItem("png").click();
d = await lastDownload(n);
check("[PNG] ファイル名と種類", d?.name === "新世界より.png" && d.blob.type === "image/png", d?.name);

$("export-menu").open = true;
n = window.__downloads.length; menuItem("azgaar").click();
d = await lastDownload(n);
const azText = d ? await textOf(d.blob) : "";
check("[Azgaar互換] ファイル名に _azgaar", d?.name === "新世界より_azgaar.map", d?.name);
check("[Azgaar互換] ALTERHISTORY の目印と拡張行が無い", !azText.includes("ALTERHISTORY"));
check("[Azgaar互換] 元のファイルと行が一致（日付以外）", azText.split("\r\n").slice(1).join("\r\n") === readFileSync(SAMPLES + "/新世界より.map", "utf-8").split("\r\n").slice(1).join("\r\n"));

$("banner-close").click();
n = window.__downloads.length; key("s", { ctrlKey: true });
check("[Ctrl+S] で保存される", (await lastDownload(n))?.name === "新世界より.map");

console.log("--- 書き出し中の表示と失敗時の処理 ---");
let sawBusyExport = false; const unsub = store.subscribe((st) => { if (st.busy) sawBusyExport = true; });
n = window.__downloads.length; $("btn-save").click(); await lastDownload(n);
unsub();
check("書き出し中は「作成中」が表示される", sawBusyExport);
check("完了後に「作成中」が残らない", $("loading").hidden);

// 失敗を作る: PNG 変換が null を返す環境
const origToBlob = window.HTMLCanvasElement.prototype.toBlob;
window.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(null); };
$("banner-close").click();
$("export-menu").open = true; menuItem("png").click();
check("PNG 変換の失敗が画面に出る", await waitFor(() => !$("banner").hidden && !$("banner").classList.contains("info"), 5000, "失敗表示"), $("banner-body").textContent.slice(0, 60));
check("失敗メッセージに原因と対象", $("banner-body").textContent.includes("PNG画像に失敗しました"));
check("失敗しても「作成中」が残らない", $("loading").hidden);
window.HTMLCanvasElement.prototype.toBlob = origToBlob;
$("banner-close").click();

console.log("=== エラー処理 ===");
dropTo(new File(["これは地図ではありません"], "bad.map"));
check("不正なファイル → エラー表示", await waitFor(() => !$("banner").hidden, 5000, "エラー表示"), $("banner-body").textContent.slice(0, 60));
check("エラー表示に原因が書かれる", $("banner-body").textContent.includes("読み込めませんでした"));
check("失敗しても前の地図が残る", store.getState().map && $("status-map").textContent.includes("1965セル"));
check("エラー時に読み込み中表示が残らない", $("loading").hidden);
$("banner-close").click();
check("×でエラー表示を閉じられる", $("banner").hidden);
check("スクリプトエラーなし(全体)", errors.length === 0, errors.join("|"));

console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
window.close();
process.exit(failed ? 1 : 0);
