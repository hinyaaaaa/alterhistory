// v6 UI: 戦争・世界の外交・文化/言語/宗教・年表・統計・検索・世界設定。
import { h, lb, stat, btn, holdBtn, table, pct, n0, r2, colorOf, polityJa, vlist, sv } from "./common.js";
import { S, run, act, creator, stateName, aliveStates, controlled } from "./store.js";
import { lineageTree, nestedLineage, miniLineage } from "./trees.js";
import { pWar, warTitle } from "./war.js";
import { pDiplo } from "./diplo.js";
import { pStats } from "./stats.js";
export { pWar, pDiplo, pStats };
import { notify } from "./notify.js";
import { link, listRow, sectioned, clearHl, creatorBox, uprisingBox } from "./views-a.js";
import { openWizard } from "./wizard.js";
const back = (label, on) => h("div", { class: "back", onclick: () => { clearHl(); on(); } }, "← " + label);
import { allianceDiagram } from "./alliance.js";
import { predictWar } from "../../core/wcde/warlab.js";
import { placeName, POSTURES, CAMPAIGN_KINDS, postureOf } from "../../core/wcde/warfare.js";
import { proposalsOf } from "../../core/wcde/negotiation.js";
import { TREATY, strength } from "../../core/civ/diplomacy.js";
import { interventionsOf } from "../../core/wcde/intervention.js";
import { FIELDS } from "../../core/wcde/domains/effective.js";
import { formatWorldDate } from "../../core/wcde/world.js";
import { iterRecords, coverage, findRecord, causesOfRecord } from "../../core/civ/archive.js";
import { packSave, packSaveGz, unpackSaveAny, SAVE_SCHEMA } from "../../core/wcde/savefile.js";
import { checkWcdeIntegrity } from "../../core/wcde/integrity.js";
import { timeOf, SPEEDS } from "../../core/wcde/clock.js";
import { exportVaultZip } from "../../io/vault-writer.js";
import { APP_VERSION_LABEL } from "../../version.js";
const civ = () => S.w.civ, date = (mi) => formatWorldDate(S.w, mi), note = (t) => h("p", { class: "n" }, t), head = (code, ja) => [h("div", { class: "code" }, code), h("h2", {}, ja)];
const OUT = { aggressor_victory: "攻撃側の勝利", defender_victory: "防衛側の勝利", stalemate: "決着つかず", negotiated: "講和", state_dissolved: "国家の消滅" };

/* ---------- 文化・言語・宗教: 系統図・詳細・（創造主の）編集 ---------- */
const KINDS = { culture: ["cultures", "文化", "CULTURE"], language: ["languages", "言語", "LANGUAGE"], religion: ["religions", "宗教", "RELIGION"] };
export function pEntity(kind) {
  const [key, ja, code] = KINDS[kind], c = civ(), items = Object.values(c[key]), cur = c[key][S.entity[kind]], box = h("div", {}, ...head(code, ja));
  const use = new Map(), fk = kind === "culture" ? "cultureId" : kind === "language" ? "languageId" : "religionId"; for (const g of Object.values(c.groups)) for (const co of g.cohorts ?? []) if (co[fk]) use.set(co[fk], (use.get(co[fk]) ?? 0) + g.pop * co.share);
  if (cur) { box.append(back(`${ja}一覧`, () => { S.entity[kind] = null; S.hooks.panel(); }), miniLineage(items, cur.id, { onPick: (x) => { S.entity[kind] = x.id; S.hooks.panel(); } }), entityDetail(kind, cur, use)); return box; }
  const mine = controlled(), ms = mine ? c.states[mine] : null, mset = new Set(); if (ms) for (const g of Object.values(c.groups)) if (g.stateId === ms.id) for (const co of g.cohorts ?? []) if (co[fk] && co.share >= 0.2) mset.add(co[fk]);
  const type = { culture: "cultures", language: "languages", religion: "religions" }[kind], byPop = [...items].sort((a, b) => (use.get(b.id) ?? 0) - (use.get(a.id) ?? 0)), alive = byPop.filter((x) => (use.get(x.id) ?? 0) > 0.5);
  const view = (S.entView ??= {})[kind] ?? "list", setView = (v) => { S.entView[kind] = v; S.hooks.panel(); };
  box.append(h("div", { class: "tabs" }, h("b", { class: view === "list" ? "on" : "", "data-view": "list", onclick: () => setView("list") }, "一覧"), h("b", { class: view === "tree" ? "on" : "", "data-view": "tree", onclick: () => setView("tree") }, "系統")), h("p", { class: "n" }, `${items.length} 件（存続 ${alive.length}）`));
  if (view === "tree") return box.append(nestedLineage(items, { selected: null, pop: (id) => use.get(id) ?? 0, onHover: (id) => { if (S.map) { S.map.hl = id ? { type, id } : null; S.map.draw(); } }, onPick: (x) => { S.entity[kind] = x.id; S.hooks.panel(); } })) || box;
  box.append(sectioned([{ title: `あなたの国の${ja}`, rows: byPop.filter((x) => mset.has(x.id)) }, { title: `存続している${ja}`, rows: alive.filter((x) => !mset.has(x.id)) }, { title: `消滅した${ja}`, rows: byPop.filter((x) => (use.get(x.id) ?? 0) <= 0.5), fold: "dead_" + kind }], 34, (x) => listRow({ type, id: x.id }, [h("span", { class: "sw", style: `background:${colorOf(x.id)}` }), x.name, h("small", {}, (use.get(x.id) ?? 0) > 0.5 ? `人口 ${n0(use.get(x.id))}` : "消滅")], () => { S.entity[kind] = x.id; S.hooks.panel(); }, (mset.has(x.id) ? "mine " : "") + ((use.get(x.id) ?? 0) > 0.5 ? "" : "dead"))));
  return box;
}
function entityDetail(kind, x, use) {
  const c = civ(), nm = h("input", { id: "ent-name", value: x.name }), par = x.parent ? c[KINDS[kind][0]][x.parent]?.name : "（起源）", kids = Object.values(c[KINDS[kind][0]]).filter((y) => y.parent === x.id), rows = [["名前", x.name], ["系統（親）", par], ["派生した先", kids.length ? kids.map((k) => k.name).join("・") : "なし"], ["成立", date(Math.max(0, x.bornAt))], ["現在の人口", n0(use.get(x.id) ?? 0)]];
  if (kind === "religion") rows.push(["最高神", x.deity ?? "—"], ["信仰形態", x.kind ?? "—"], ["聖地", x.holyCell != null ? `区画 ${x.holyCell}` : "—"], ["創始者", x.founderId ? (c.figures?.[x.founderId]?.name ?? x.founderId) : "—"]);
  if (kind === "language" && x.phon) rows.push(["子音", x.phon.c.join(" ")], ["母音", x.phon.v.join(" ")], ["音節末の子音", x.phon.coda ? "あり" : "なし"], ["促音", x.phon.geminate ? "あり" : "なし"], ["音の変化", `${x.phon.changes.length} 件`]);
  if (kind === "culture") rows.push(["発祥の区画", x.cell != null ? `区画 ${x.cell}` : "—"], ["名前の固定", x.nameFixed ? "固定（創造主の編集）" : "自動"]);
  return h("div", { class: "dt rs" }, h("b", {}, x.name), table(["項目", "内容"], rows), h("div", { class: "rowb" }, nm, btn("名前を編集（創造主）", () => creator({ type: "creator.rename", kind, id: x.id, name: nm.value }), "", { id: "ent-rename" })), note("定義の編集は創造主の介入として記録され、過去の客観イベントは書き換えません。定義と、集団で実際に使われている状態は別です。"));
}

function showEvent(e) {
  const c = civ(), d = document.getElementById("evdetail"); if (!d) return; const MEDIA_JA = { trace: "遺跡・痕跡", oral: "口承", tablet: "刻まれた記録", paper: "紙の記録", print: "印刷物" };
  const ents = e.participants.filter((p) => c.states[p.entityId]).map((p) => [h("a", { class: "lk", href: "#", onclick: (ev) => { ev.preventDefault(); S.hooks.select(p.entityId); } }, stateName(p.entityId)), " "]).flat();
  const causes = causesOfRecord(c, e).map((x) => x.record ? h("div", { class: "n" }, `原因（直接）: ${x.record.title}（${x.record.date.year}年）`) : h("div", { class: "n" }, x.lost ? "原因（直接）: 資料が失われています。起きなかったという意味ではありません" : "原因（直接）: 記録の範囲外"));
  d.replaceChildren(h("b", {}, e.title), h("div", {}, `${e.date.year}年${e.date.month}月・種別 ${e.kind}・出典 ${e.provenance}・記録 ${MEDIA_JA[e.m] ?? "不明"}`), h("div", {}, "関係する実体: ", ...ents), ...causes, ...(e.effects ?? []).slice(0, 8).map((f) => h("div", { class: "n" }, `結果: ${f.property} ${f.before ?? "—"} → ${f.after ?? "—"}`)));
}

/** v6.17.0: 国家ページから移した、創造主の介入と反乱・革命（選んだ国に対して行う） */
function crTarget(pick) { const st = civ().states[S.crSel ?? pick.value]; if (!st?.alive) return h("div", {}); return h("div", { class: "crtarget" }, creatorBox(st), uprisingBox(st)); }
/** 創造主ハブ（v6.3.0）: 創造主状態（担当国なし）でできることを一覧にまとめる。担当国があるあいだは無効 */
export function pCreator() {
  const on = !controlled();
  const box = h("div", {}, ...head("CREATOR", "創造主"));
  if (!on) return box.append(note(`いま ${stateName(controlled())} を担当しています。創造主の操作は、担当を解除すると使えます。`), btn("担当を解除して創造主に戻る", () => { run({ type: "control.release" }); S.hooks.render(); }, "p", { id: "release" })) || box;
  const names = aliveStates().sort((a, b) => b.pop - a.pop);
  const pick = h("select", { id: "cr-state", onchange: (e) => { S.crSel = e.target.value; S.hooks.panel(); } }, ...names.slice(0, 120).map((s) => h("option", { value: s.id, selected: s.id === S.crSel }, s.name)));
  box.append(note("世界を見守る立場でできることを、ここにまとめています。"),
    lb("国家への介入・反乱", "INTERVENE"), h("div", { class: "rowb" }, pick, btn("その国を開く", () => { if (pick.value) S.hooks.select(pick.value); })), crTarget(pick),
    lb("国家をつくる", "CREATE A NATION"), note("国名・政体・役職・為政者・首都・技術を決めて、新しい国を世界に生みます（担当はしません）。"), h("div", { class: "rowb" }, btn("国家をつくる", () => openWizard({ mode: "creator", onDone: (r) => { S.sel = r.stateId; notify("ok", "新しい国が生まれました"); S.hooks.render(); } }), "p", { id: "cr-found" })),
    lb("国家を担当する", "TAKE CONTROL"), h("div", { class: "rowb" }, btn("この国を担当する", () => { if (pick.value) { run({ type: "control.take", stateId: pick.value }); S.sel = pick.value; S.hooks.render(); } })),
    catastropheBox());
  return box;
}
/** 創造主の災厄（世界全体だけ）。人口の損失と、復活までの年数を決める。100% なら旧世界が滅び、先史時代から世界が再び始まる。長押しで実行 */
export function catastropheBox() {
  const c = civ(), nm = h("input", { id: "cat-name", placeholder: "災厄の名前（任意）", style: "width:100%" }), why = h("input", { id: "cat-why", placeholder: "理由の注釈（任意）", style: "width:100%" });
  const mor = h("input", { id: "cat-mort", type: "number", value: 30, min: 1, max: 100, step: 1, style: "width:70px" }), sl = h("input", { type: "range", min: 1, max: 100, value: 30, style: "flex:1" }), rec = h("input", { id: "cat-rec", type: "number", value: 100, min: 1, style: "width:80px" });
  const warn = h("small", { id: "cat-warn", class: "g" }, ""), sync = (from) => { const v = Math.max(1, Math.min(100, Number(from.value) || 1)); mor.value = sl.value = v; warn.textContent = v >= 100 ? "旧世界は完全に滅び、先史時代から世界が始まり直します" : ""; };
  mor.addEventListener("input", () => sync(mor)); sl.addEventListener("input", () => sync(sl));
  const go = () => { const r = creator({ type: "creator.catastrophe", name: nm.value, reason: why.value, mortality: Number(mor.value) / 100, recoveryYears: Number(rec.value) }); if (r.ok && S.w.civ.wcde.phase === "founding") S.hooks.founding?.(); };
  const log = (c.wcde.catastrophes ?? []).slice(-4).reverse();
  return h("div", {}, lb("創造主の災厄", "CATASTROPHE"), nm, why, h("div", { class: "rowb" }, h("small", {}, "人口の損失 %"), mor, sl), h("div", { class: "rowb" }, h("small", {}, "復活までの年数"), rec), warn, h("div", { class: "rowb" }, holdBtn("災厄を起こす", go, "p", { id: "cat-go" })), ...log.map((r) => h("div", { class: "row" }, h("span", { class: "g" }, `「${r.name}」`, h("br"), h("small", {}, `${date(r.at)}・実際の損失 ${Math.round(r.result.share * 100)}%（約 ${n0(r.result.dead)} 人）${r.result.collapsed ? `・滅んだ国 ${r.result.collapsed}` : ""}`)))));
}
/* ---------- 世界設定・出力・バージョン ---------- */
export function pSettings() {
  const c = civ(), cf = c.wcde.config, T = timeOf(c), errs = checkWcdeIntegrity(S.w.world, c), msg = h("p", { class: "n", id: "exp-msg" }), cal = cf.calendar;
  const dl = (blob, name) => { const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); };
  const save = async () => { msg.textContent = "圧縮して書き出しています…"; const p = await packSaveGz(S.w); dl(new Blob([p.bytes], { type: "application/gzip" }), `alterhistory-${cf.worldSeed}-${c.date.year}.ahw`); msg.textContent = `保存ファイルを書き出しました（圧縮 ${(p.bytes.length / 1048576).toFixed(1)} MB／元 ${(p.rawBytes / 1048576).toFixed(1)} MB）`; };
  // v6.14.0: フォルダへ直接書かず、常に ZIP（.md の束）にして保存する。創作に要らない内部データは出さない軽量モード。展開して vault として開く
  const obs = async () => {
    const nm = String(cf.name || cf.worldSeed), mb = (b) => (b / 1048576).toFixed(1), t0 = performance.now(), prog = (p) => { msg.textContent = `ZIP を作っています… ${p.files} ファイル（${mb(p.bytes)} MB）`; };
    msg.textContent = "ZIP を作っています…";
    try {
      const r = await exportVaultZip(S.w.world, c, nm, { onProgress: prog }); let n = 0;
      for (const part of r.parts) { dl(new Blob([part.bytes], { type: "application/zip" }), part.name); n++; if (r.parts.length > 1) await new Promise((res) => setTimeout(res, 800)); }
      const sec = ((performance.now() - t0) / 1000).toFixed(1);
      msg.textContent = n === 1 ? `ZIP を保存しました: ${r.files} ファイル（${mb(r.parts[0].bytes.length)} MB・${sec} 秒）。展開してできた「${r.root}」フォルダを、Obsidian の vault として開いてください` : `${n} 個の ZIP を保存しました（${r.files} ファイル）。すべて同じフォルダへ展開すると、1 つの vault になります`;
    } catch (e) { msg.textContent = "書き出せませんでした: " + e.message; }
  };
  const eraY = h("input", { id: "era-year", type: "number", min: 0, placeholder: "開始から何年", style: "width:130px" }), eraN = h("input", { id: "era-name", placeholder: "時代の名前", style: "width:170px", maxlength: 12 });
  const eraRows = (cal.eras ?? []).map((e) => { const inp = h("input", { value: e.name, style: "width:150px", class: "eranm" }); return h("div", { class: "rowb" }, h("small", {}, `${e.startYear}年から`), inp, btn("改名", () => { run({ type: "calendar.edit", edit: { eraNames: { [e.id]: inp.value } } }); S.hooks.render(); }), btn("消す", () => { run({ type: "calendar.edit", edit: { removeEra: e.id } }); S.hooks.render(); })); });
  return h("div", {}, ...head("SETTINGS", "世界設定・出力"), table(["項目", "値"], [["世界の名前", cf.name ?? "—"], ["現在", formatWorldDate(S.w)], ["先史の長さ", `${n0(cf.prehistory?.years ?? 0)} 年`], ["時間の速度", SPEEDS.find((s) => s.id === T.speed)?.label], ["アプリの版", APP_VERSION_LABEL], ...(errs.length ? [["整合性の検査", `${errs.length} 件の問題`]] : [])]),
    lb("時代", "ERAS"), ...eraRows, h("div", { class: "rowb" }, eraY, eraN, btn("時代を足す", () => { run({ type: "calendar.edit", edit: { addEra: { name: eraN.value, startYear: Math.round(Number(eraY.value)) } } }); S.hooks.render(); }, "", { id: "era-add" })),
    lb("保存・読み込み・出力", "SAVE / EXPORT"), h("div", { class: "rowb" }, btn("保存ファイルを書き出す", save, "p", { id: "save" }), fileLoader(), btn("Obsidian 用 Markdown を ZIP で書き出す", obs, "", { id: "obs" })), msg, ...S.fileWarn.map((x) => h("p", { class: "warn" }, x)),
    null);
}
export function fileLoader(done) {
  const inp = h("input", { type: "file", accept: ".ahw", id: "loadfile", hidden: true, onchange: async (e) => { const f = e.target.files[0]; if (!f) return; const r = await unpackSaveAny(new Uint8Array(await f.arrayBuffer())); if (!r.ok) { alert("読み込めません:\n" + r.errors.join("\n")); return; } (done ?? S.hooks.loaded)(r.w, r.warnings); } });
  return h("span", {}, inp, btn("保存ファイルを読み込む", () => inp.click(), "", { id: "load" }));
}
