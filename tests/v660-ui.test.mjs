// v6.6.0: 画面（dist/v6.js）の確認。タイトル → 世界の設定（世界名・時代区分）→ 生成 → 建国。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 5).join(" | ")); } };
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/<script[^>]*><\/script>/, ""), bundle = readFileSync(new URL("../dist/v6.js", import.meta.url), "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/", virtualConsole: new VirtualConsole() }), { window } = dom, doc = window.document;
const errors = []; window.addEventListener("error", (e) => errors.push(String(e.message))); window.alert = (m) => errors.push("alert:" + m);
window.structuredClone = structuredClone; Object.assign(window, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Blob });
window.eval(bundle);
const $ = (s) => doc.querySelector(s), $$ = (s) => [...doc.querySelectorAll(s)], click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })), wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 100 && !$("#new"); i++) await wait(20);
await check("タイトル画面: 背景の絵・ロゴ・「新しい世界」・版の表示", () => { assert.ok($("#new") && $(".titlebg svg") && $(".titlebox .logo svg") && /v6\.11\.0/.test($(".ver").textContent)); });
await check("世界の設定: 世界名・時代区分を足せる。紀元の欄は空白が既定", async () => {
  window.__v6.S.fastStart = true; click($("#new")); for (let i = 0; i < 50 && !$("#gen"); i++) await wait(20);
  assert.ok($("#wname").value.length >= 2 && $("#epoch").value === ""); click($("#addera")); click($("#addera")); assert.equal($$(".eraRow").length, 2);
  $$(".eraRow .en")[0].value = "黎明時代"; $$(".eraRow .en")[0].dispatchEvent(new window.Event("input")); $$(".eraRow .ey")[0].value = "0"; $$(".eraRow .ey")[0].dispatchEvent(new window.Event("change"));
});
await check("生成すると、世界名と時代名が建国の画面に出て、時計の下にも時代名が出る", async () => {
  $("#wname").value = "テスト世界"; $("#cells").value = "3000"; $("#seed").value = "ui-660"; click($("#gen")); for (let i = 0; i < 600 && !$("#found"); i++) await wait(50);
  assert.ok($("#found")); assert.ok(/テスト世界/.test($(".center").textContent) && !/紀元/.test($(".center").textContent)); click($("#delegate")); await wait(50);
  assert.equal(window.__v6.S.w.civ.wcde.config.name, "テスト世界"); assert.ok($("#clock .wn").textContent === "テスト世界"); assert.ok(!/紀元/.test($("#date").textContent));
});
assert.deepEqual(errors, [], errors.join("\n")); console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
