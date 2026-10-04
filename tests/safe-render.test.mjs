import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM(`<!doctype html><div id="root"><input id="t" type="text"><button id="b">x</button></div><input id="outside">`);
globalThis.document = dom.window.document;
const { guardRender } = await import("../js/ui/safe-render.js");
const root = document.getElementById("root"); let renders = 0;
const safe = guardRender(root, () => { renders++; });
// 入力していない間は、すぐ描き直す
safe(); assert.equal(renders, 1);
// 入力欄にカーソルがある間（年の切り替えなどの自動更新）は、描き直さない＝書いている内容が消えない
const input = document.getElementById("t"); input.focus(); input.value = "書きかけの文章";
safe(); safe(); safe();
assert.equal(renders, 1, "入力中は描き直しを保留する");
assert.equal(input.value, "書きかけの文章");
// カーソルが外れたら、保留していた分を1回だけ最新の状態で描き直す
input.blur(); input.dispatchEvent(new dom.window.Event("focusout", { bubbles: true }));
await new Promise((r) => setTimeout(r, 10));
assert.equal(renders, 2, "入力が終わったあとに1回だけ描き直す");
// チェックボックスやボタンにフォーカスがあるだけなら保留しない
document.getElementById("b").focus(); safe(); assert.equal(renders, 3);
console.log("safe-render OK");
