// UI 統合テスト（jsdom）。実際の index.html とビルド済み dist/app.js を動かす。
//
// 限界: jsdom はレイアウトも Canvas 描画も行わない。ここで確認できるのは
//   「配線が正しく、例外を出さず、状態と表示が期待通りに変わること」まで。
//   実際の見た目・操作感・速度は、実ブラウザ（Surface Go 4）で確認が必要。
//   描画結果そのものは render_png での目視確認と、tests/geometry.test.mjs で検証済み。
import { generateWorld } from "../js/core/world/worldgen.js";
import { worldToMap } from "../js/core/world-bridge.js";
import { saveMapBytes, loadMapBytes } from "../js/io/ahmap-file.js";
import { loadLegacyInto } from "./helpers/load-legacy.mjs";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// テスト用の実マップの置き場所。既定は開発環境のパス。SAMPLES_DIR=... で変更できる
const SAMPLES = process.env.SAMPLES_DIR ?? "tests/.samples";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// .ahmap v2 のファイル（小さな世界）。本番の開き方（v2 だけ）を通すための固定データ
async function worldFile(name = "世界.ahmap", cells = 1500) { const map = worldToMap(generateWorld({ worldSeed: "ui-" + name, resolution: { targetCells: cells } })); return new File([await saveMapBytes(map, { appVersion: "test", savedAt: "2026-10-22" })], name); }
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
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
    window.Element.prototype.setPointerCapture = () => {};
    window.Element.prototype.releasePointerCapture = () => {};
    window.Element.prototype.hasPointerCapture = () => false;
    // jsdom に無い Web API を Node のものから補う（gzip 展開・デコードに必要）
    Object.assign(window, { TextDecoder, Blob, Response, CompressionStream, DecompressionStream });
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
const q = (sel) => window.document.querySelector(sel);

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
check("凡例サイドバーは廃止されている（ハブ・時計がある）", !$("legend") && !!$("hub") && !!$("clock"));
check("保存ボタンは無効（地図が無い）", $("btn-save").disabled === true);
check("書き出しの入口は無効（地図が無い）", q('[data-open-win="export"]').disabled === true);
{
  const ev = new window.KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
  window.document.dispatchEvent(ev);
  check("地図が無いとき Ctrl+S はブラウザの既定動作を奪わない", ev.defaultPrevented === false);
}

console.log("=== ファイルを開く（<input> の change 経由） ===");
const input = $("file-input");
let sawBusy = false, sawLoadingVisible = false;
store.subscribe((s) => { if (s.busy) { sawBusy = true; if (!$("loading").hidden) sawLoadingVisible = true; } });
Object.defineProperty(input, "files", { value: [await worldFile()], configurable: true });
input.dispatchEvent(new window.Event("change"));
check("読み込み中の状態になり、画面に表示される", await waitFor(() => sawBusy, 3000, "busy") && await waitFor(() => sawLoadingVisible, 3000, "loading表示"), `busy=${sawBusy} 表示=${sawLoadingVisible}`);
check("読み込みが完了する", await waitFor(() => store.getState().map, 15000, "読み込み"));
check("世界の地図（球面世界つき）として開く", !!store.getState().map?.world);
// 以降の国家・戦争・経済などの検査は、旧形式の固定データで行う（本番は .ahmap v2 のみ）
await loadLegacyInto(window, mapFile("境界線の貴方.map"));
await sleep(100);
check("空の状態の案内が消える", $("empty-state").hidden);
check("読み込み中の表示が消える", $("loading").hidden);
check("ステータスにセル数", $("status-map").textContent.includes(`${store.getState().map.geometry.pack.p.length}セル`), $("status-map").textContent);
check("地図を開くとハブの「書き出し」「レイヤー」が使える", q('[data-open-win="export"]').disabled === false && $("hub-layers").disabled === false);
check("描画命令が実行された", drawStats.fill > 0 && drawStats.fillText > 0, JSON.stringify(drawStats));
check("地図全体が画面に収まる(fit)", viewport.k === viewport.fitK && viewport.k > 0);
check("スクリプトエラーなし", errors.length === 0, errors.join("|"));

console.log("=== ツールバー ===");
const layerBtn = (k) => window.document.querySelector(`[data-layer="${k}"]`);
layerBtn("cultures").click();
check("文化のレイヤーを重ねる → 国家と重なる（凡例の種類も文化に切り替わる）", store.getState().view.cultures === true && store.getState().view.states !== false && store.getState().view.legendKind === "culture");
layerBtn("cultures").click(); layerBtn("states").click();
check("色分けのレイヤーを全部切る → 色分けなし", ["states", "cultures", "religions", "provinces"].every((k) => store.getState().view[k] !== true));
layerBtn("states").click();
layerBtn("rivers").click();
check("河川のレイヤーを切る → 状態に反映", store.getState().view.rivers === false);

console.log("=== キーボード ===");
const key = (k, extra = {}) => window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, ...extra }));
key("2");
key("1");
check("[1] 国家のレイヤーを切る", store.getState().view.states === false && !layerBtn("states").classList.contains("active"));
key("1");
key("3");
check("[3] 宗教のレイヤーを重ねる", store.getState().view.religions === true && store.getState().view.states === true);
key("5");
check("[5] 標高のレイヤーを重ねる → ボタンも同期", store.getState().view.heights === true && layerBtn("heights").classList.contains("active"));
key("r");
check("[R] 河川を再表示 → ボタンも同期", store.getState().view.rivers === true && layerBtn("rivers").classList.contains("active"));
const k0 = viewport.k; key("+");
check("[+] 拡大", viewport.k > k0);
key("f");
check("[F] 全体表示に戻る", Math.abs(viewport.k - viewport.fitK) < 1e-9);
const x0 = viewport.x; key("ArrowLeft");
check("[←] 移動", viewport.x > x0);
key("f");
key("2", { ctrlKey: true });
check("Ctrl+数字は無視される（ブラウザ操作と衝突しない）", store.getState().view.states === true);

console.log("=== 入力欄でのショートカット抑止 ===");
const selBox = window.document.querySelector("select, input");
selBox.focus();
selBox.dispatchEvent(new window.KeyboardEvent("keydown", { key: "4", bubbles: true }));
check("セレクト上のキー入力では切り替わらない", store.getState().view.provinces !== true);

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

console.log("=== ショートカット一覧は廃止 ===");
key("?");
check("[?] を押しても一覧は出ない（ダイアログ自体が無い）", !$("help-dialog"));

console.log("=== ドラッグ＆ドロップ / gzip ===");
const dropTo = (file) => {
  const ev = new window.Event("drop", { bubbles: true, cancelable: true });
  ev.dataTransfer = { types: ["Files"], files: [file] };
  window.dispatchEvent(ev);
};
const dropped = await worldFile("ドロップ世界.ahmap", 1200);
dropTo(dropped);
check(".ahmap をドロップして開ける", await waitFor(() => store.getState().fileName === "ドロップ世界.ahmap" && store.getState().map?.world, 15000, "ドロップ読み込み"), $("status-map").textContent);
check("別の地図が開く（世界つき・国家はまだ無い）", store.getState().map.world && store.getState().map.pack.states.length === 1);
check("色分けなどの表示設定は引き継がれる", store.getState().view.states === true);
dropTo(new File([new Uint8Array([49, 46, 49, 53, 51, 124])], "旧形式.map"));
check("Azgaar の .map は開かず、理由を知らせる（いまの地図は残る）", await waitFor(() => /読み込めません/.test(store.getState().error ?? ""), 8000, "拒否") && store.getState().fileName === "ドロップ世界.ahmap");
$("banner-close").click();

console.log("=== 保存・書き出し ===");
const lastDownload = async (n0) => { await waitFor(() => window.__downloads.length > n0, 8000, "ダウンロード"); return window.__downloads.at(-1); };
const textOf = async (blob) => Buffer.from(await blob.arrayBuffer()).toString("utf-8");

check("地図を開いているので保存ボタンが有効", $("btn-save").disabled === false);
check("書き出しの入口が有効", !q('[data-open-win="export"]').disabled);

let n = window.__downloads.length;
$("btn-save").click();
let d = await lastDownload(n);
check("[保存] ファイル名は 地図名.ahmap", d?.name === `${store.getState().map.meta.name || "新世界より"}.ahmap`, d?.name);
const savedBuf = d ? new Uint8Array(await d.blob.arrayBuffer()) : new Uint8Array(0);
const reread = await loadMapBytes(savedBuf);
check("[保存] 中身は .ahmap v2 として読み戻せる（世界つき）", !!reread.map.world && reread.map.world.hash === store.getState().map.world.hash);
check("[保存] 国家・都市が元と同じ", reread.map.pack.states.length === store.getState().map.pack.states.length && reread.map.pack.burgs.length === store.getState().map.pack.burgs.length);
check("[保存] Azgaar 形式の書き出しは無い", !q('[data-export="azgaar"]'));
check("[保存] 完了の通知が出る", await waitFor(() => !$("banner").hidden && $("banner").classList.contains("info"), 3000, "通知"), $("banner-body").textContent);
check("[保存] 通知にファイル名", $("banner-body").textContent.includes(`${store.getState().map.meta.name || "新世界より"}.ahmap`));

const menuItem = (k) => { window.alterhistory.wins.open("export"); return q(`[data-export="${k}"]`); };
n = window.__downloads.length; menuItem("svg").click();
d = await lastDownload(n);
const svgText = d ? await textOf(d.blob) : "";
check("[SVG] ファイル名と種類", d?.name === `${store.getState().map.meta.name || "新世界より"}.svg` && d.blob.type === "image/svg+xml", d?.name);
check("[SVG] 中身が SVG 文書", svgText.startsWith("<?xml") && svgText.includes("<svg") && svgText.includes("<path"));
check("[SVG] クリック後に書き出しの窓が閉じる", !window.alterhistory.wins.isOpen("export"));

n = window.__downloads.length; menuItem("png").click();
d = await lastDownload(n);
check("[PNG] ファイル名と種類", d?.name === `${store.getState().map.meta.name || "新世界より"}.png` && d.blob.type === "image/png", d?.name);

n = window.__downloads.length; menuItem("chronicle").click();
d = await lastDownload(n);
const mdText = d ? await textOf(d.blob) : "";
check("[クロニクル] .md の1ファイルだけが出る（JSON は出さない）", d?.name === `${store.getState().map.meta.name || "新世界より"}.chronicle.md` && window.__downloads.slice(n).length === 1, d?.name);
check("[クロニクル] 年表と国家の節がある", mdText.includes("## 1. 年表") && mdText.includes("## 2. 国家"));

$("banner-close").click();
n = window.__downloads.length; key("s", { ctrlKey: true });
check("[Ctrl+S] で保存される", (await lastDownload(n))?.name === `${store.getState().map.meta.name || "新世界より"}.ahmap`);

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
menuItem("png").click();
check("PNG 変換の失敗が画面に出る", await waitFor(() => !$("banner").hidden && !$("banner").classList.contains("info"), 5000, "失敗表示"), $("banner-body").textContent.slice(0, 60));
check("失敗メッセージに原因と対象", $("banner-body").textContent.includes("PNG画像に失敗しました"));
check("失敗しても「作成中」が残らない", $("loading").hidden);
window.HTMLCanvasElement.prototype.toBlob = origToBlob;
$("banner-close").click();

console.log("=== エラー処理 ===");
const keepCells = store.getState().map.pack.cells.biome.length;
dropTo(new File(["これは地図ではありません"], "bad.map"));
check("不正なファイル → エラー表示", await waitFor(() => !$("banner").hidden, 5000, "エラー表示"), $("banner-body").textContent.slice(0, 60));
check("エラー表示に原因が書かれる", $("banner-body").textContent.includes("読み込めません"));
check("失敗しても前の地図が残る", store.getState().map && $("status-map").textContent.includes(`${keepCells}セル`));
check("エラー時に読み込み中表示が残らない", $("loading").hidden);
$("banner-close").click();
check("×でエラー表示を閉じられる", $("banner").hidden);
check("スクリプトエラーなし(全体)", errors.length === 0, errors.join("|"));

console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
window.close();
process.exit(failed ? 1 : 0);
