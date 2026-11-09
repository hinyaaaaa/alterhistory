// v6.6.0: ゲーム風のスタート画面。起動（ロゴ・約 5 秒）→ タイトル（背景の絵が約 5 秒ごとに切り替わる）→ 世界の設定（世界名・暦）→ 生成中（ロード画面）→ 建国。
//   背景は seed から描く SVG（scenes.js。1000 通り）。実写・外部画像は使わない。
import { h, btn } from "./common.js";
import { S } from "./store.js";
import { sceneSvg, sceneName, logoSvg, SCENE_COUNT } from "./scenes.js";
import { createNewWorld } from "../../core/wcde/world.js";
import { advanceEntryStep } from "../../core/wcde/world.js";
import { APP_VERSION_LABEL } from "../../version.js";

export const SPLASH_MS = 5000, SLIDE_MS = 5000;
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const rndScene = () => Math.floor(Math.random() * SCENE_COUNT);
const html = (s) => { const d = document.createElement("div"); d.innerHTML = s; return d.firstElementChild; };
const TIPS = ["最初の国は、いつ、どこに生まれるのだろう。", "国家は興り、そして必ず滅びる。", "宗教は国を結び、ときに国を割る。", "同盟は、戦争を大きくする。", "言葉が分かれ、文化が分かれ、国境が引かれる。", "長く続く王朝は、思うよりずっと少ない。", "交易路を握る者が、やがて海を握る。", "ひとつの決断が、千年後の地図を変える。"];

/** 背景の絵を、約 5 秒ごとに切り替える（2 枚を重ねてゆっくり入れ替える）。stop() で止める */
export function slideshow(host, { interval = SLIDE_MS, first = rndScene() } = {}) {
  host.classList.add("slides"); const a = h("div", { class: "slide on" }), b = h("div", { class: "slide" }), cap = h("div", { class: "slidecap" }); host.append(a, b, cap);
  let cur = a, seed = first; const put = (el, sd) => { el.replaceChildren(html(sceneSvg(sd))); cap.textContent = sceneName(sd); };
  put(a, seed); const tick = () => { const nxt = cur === a ? b : a; seed = (seed + 1 + Math.floor(Math.random() * (SCENE_COUNT - 2))) % SCENE_COUNT; put(nxt, seed); nxt.classList.add("on"); cur.classList.remove("on"); cur = nxt; };
  const t = setInterval(tick, interval); host.__stop = () => clearInterval(t); return () => clearInterval(t);
}

/** 起動画面（#splash）。ロゴと進み具合の帯を約 5 秒。押す・キーで飛ばせる。動きを減らす設定では待たない。終わったら取り除く */
export function runSplash(ms = SPLASH_MS) {
  const el = document.getElementById("splash"); if (!el) return Promise.resolve();
  const skip = reduced(); el.replaceChildren(h("div", { class: "splbg" }), h("div", { class: "spl" }, h("div", { class: "logo" }), h("div", { class: "splbar" }, h("i", { style: `animation-duration:${ms}ms` })), h("div", { class: "spltip" }, "世界を、作る。　— 押すと先へ進みます")));
  el.querySelector(".splbg").replaceChildren(html(sceneSvg(rndScene()))); el.querySelector(".logo").replaceChildren(html(logoSvg()));
  return new Promise((done) => {
    let fin = false; const end = () => { if (fin) return; fin = true; clearTimeout(t); el.classList.add("out"); window.removeEventListener("keydown", end); setTimeout(() => { el.remove(); done(); }, skip ? 0 : 420); };
    const t = setTimeout(end, skip ? 0 : ms); el.addEventListener("click", end); window.addEventListener("keydown", end, { once: true });
  });
}

const SYL = ["ア", "ル", "セ", "リ", "オ", "ン", "ヴェ", "ディ", "カ", "ラ", "ミ", "ハ", "ト", "エ", "サ", "ヴァ", "ネ", "ロ", "ゼ", "ファ", "シ", "ベ"];
export const randomWorldName = () => { const n = 3 + Math.floor(Math.random() * 2); let s = ""; for (let i = 0; i < n; i++) s += SYL[Math.floor(Math.random() * SYL.length)]; return s + ["", "", "大陸", "世界"][Math.floor(Math.random() * 4)]; };

/** タイトル画面。onNew: 世界の設定へ／onLoad は読み込みボタン（fileLoader の部品を渡す） */
export function showTitle(root, { onNew, loader }) {
  const bg = h("div", { class: "titlebg" }); slideshow(bg);
  const screen = h("div", { class: "titlescreen" }, bg, h("div", { class: "vig" }), h("div", { class: "titlebox" }, h("div", { class: "logo big" }), h("div", { class: "menu" }, btn("新しい世界", () => { bg.__stop?.(); onNew(); }, "p big", { id: "new" }), loader), h("div", { class: "ver" }, APP_VERSION_LABEL)));
  screen.querySelector(".logo").replaceChildren(html(logoSvg()));
  root.replaceChildren(screen); return () => bg.__stop?.();
}

/** 世界の設定。世界名・世界の種・解像度・暦（起点の名前と、時代区分を何件でも）。決定して「世界を生成」。暦は生成後に表示名しか変えられない（その説明は画面に出さない） */
export function showWorldConfig(root, { onBack, onStart }) {
  const bg = h("div", { class: "titlebg dim" }); slideshow(bg);
  const name = h("input", { id: "wname", value: randomWorldName(), maxlength: 24 }), seed = h("input", { id: "seed", value: "alter-" + Math.floor(Math.random() * 9999) }), cells = h("select", { id: "cells" }, ...[3000, 6000].map((n) => h("option", { value: n, selected: n === 3000 }, n === 3000 ? "3,000 セル（標準）" : "6,000 セル（細かい・遅い）")));
  const epoch = h("input", { id: "epoch", placeholder: "空白のまま（名づけない）", maxlength: 12 }), eras = [], list = h("div", { class: "erarows", id: "eras" }), msg = h("p", { class: "err", id: "setup-msg" });
  const paint = () => list.replaceChildren(...eras.map((e, i) => h("div", { class: "eraRow" }, h("span", {}, "紀年"), h("input", { type: "number", class: "ey", value: e.year, onchange: (ev) => { e.year = +ev.target.value; } }), h("span", {}, "年から"), h("input", { class: "en", value: e.name, placeholder: "〇〇時代", maxlength: 14, oninput: (ev) => { e.name = ev.target.value; } }), btn("削除", () => { eras.splice(i, 1); paint(); }))));
  const add = () => { const last = eras.length ? Math.max(...eras.map((e) => e.year)) : -1; eras.push({ year: last + 100, name: "" }); paint(); };
  const calendarOf = () => { const list = eras.filter((e) => e.name.trim()).map((e) => ({ name: e.name.trim(), startYear: Math.round(e.year) })).sort((a, b) => a.startYear - b.startYear); return { epochName: epoch.value.trim(), eras: list }; };
  const go = () => { const cfg = { name: name.value.trim() || "名もなき世界", worldSeed: seed.value || "alter", spec: { resolution: { targetCells: +cells.value } }, calendar: calendarOf() }; const chk = createCheck(cfg); if (chk) { msg.textContent = chk; return; } bg.__stop?.(); onStart(cfg); };
  const form = h("div", { class: "cfgbox" }, h("div", { class: "code" }, "NEW WORLD"), h("h1", {}, "世界を作る"),
    h("label", { class: "fld" }, h("span", {}, "世界の名前"), h("div", { class: "rowb" }, name, btn("振り直す", () => { name.value = randomWorldName(); }))),
    h("label", { class: "fld" }, h("span", {}, "世界の種"), seed), h("label", { class: "fld" }, h("span", {}, "解像度"), cells),
    h("div", { class: "lb" }, "暦"), h("label", { class: "fld" }, h("span", {}, "年号・紀元の名前（空白なら、年の数字だけを表示）"), epoch),
    h("span", { class: "n" }, "時代区分（「何年から〇〇時代」）。いくつでも。なくてもよい"), list, h("div", { class: "rowb" }, btn("時代区分を足す", add, "", { id: "addera" })),
    msg, h("div", { class: "rowb" }, btn("世界を生成", go, "p big", { id: "gen" }), btn("← 戻る", () => { bg.__stop?.(); onBack(); }, "", { id: "cfgback" })));
  root.replaceChildren(h("div", { class: "titlescreen" }, bg, h("div", { class: "vig" }), form)); return calendarOf;
}
import { normalizeWorldConfig } from "../../core/wcde/config.js";
const createCheck = (cfg) => { const r = normalizeWorldConfig(cfg); return r.errors.length ? r.errors.join(" / ") : null; };

/** 生成中の画面（ロード画面）。地理と先史 → 世界の時計が進む（建国の画面に入るまで）。onDone(w) */
export function runLoading(root, cfg, onDone, onFail) {
  const bg = h("div", { class: "titlebg dim" }); slideshow(bg);
  const fill = h("i", { class: "ind" }), stat = h("div", { class: "lstat" }, "地理と先史を生成しています…"), tip = h("div", { class: "ltip" }, TIPS[Math.floor(Math.random() * TIPS.length)]);
  root.replaceChildren(h("div", { class: "titlescreen" }, bg, h("div", { class: "vig" }), h("div", { class: "loadbox" }, h("div", { class: "logo" }), h("div", { class: "lname" }, cfg.name), h("div", { class: "lbar" }, fill), stat, tip)));
  root.querySelector(".logo").replaceChildren(html(logoSvg({ withText: false })));
  const tipT = setInterval(() => { tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]; }, 4000), done = (fn) => { clearInterval(tipT); bg.__stop?.(); fn(); };
  setTimeout(() => {
    const r = createNewWorld({ name: cfg.name, worldSeed: cfg.worldSeed, spec: cfg.spec, calendar: cfg.calendar }); if (!r.ok) { done(() => onFail(r.errors.join(" / "))); return; }
    const w = r.w; if (S.fastStart) { done(() => onDone(w)); return; }
    fill.classList.remove("ind"); fill.style.width = "0%"; stat.textContent = "世界の時計が進んでいます…";
    const step = () => { const p = advanceEntryStep(w, { chunk: 12 }); fill.style.width = Math.round(p.progress * 100) + "%"; const y = Math.floor((w.civ.wcde.entryProgress?.done ?? w.civ.wcde.entry?.months ?? 0) / 12); stat.textContent = `世界の時計が進んでいます… ${y} 年`; if (p.done) done(() => onDone(w)); else setTimeout(step, 0); };
    setTimeout(step, 30);
  }, 80);
}
