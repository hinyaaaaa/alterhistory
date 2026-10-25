// v5.3 UI: 「出力」領域。Chronicle .md / .ahmap（完全保存）/ Obsidian .zip / PNG の 4 項目（指示書 5.5）。
//   adapter.exports を呼ぶだけ。ファイルの受け渡し（download）は注入。Obsidian は複数 ZIP に分割し、欠落・重複を検査して結果を見せる。
import { h } from "./dom.js";
import { fmtBytes, fmtMonth, monthOf } from "./format.js";
import { verifyParts } from "./export/obsidian-split.js";
import { PNG_KINDS, describePng } from "./export/png-meta.js";

const PART_SIZES = [[32, "32 MB"], [64, "64 MB（標準）"], [128, "128 MB"], [256, "256 MB"]];

export function createExportPanel({ adapter, ui, download }) {
  const card = (id, title, desc, ...body) => h("section", { class: "v53-card", dataset: { export: id } }, h("h3", { text: title }), h("p", { class: "v53-hint", text: desc }), ...body);
  const status = (id) => h("p", { class: "v53-export-status", dataset: { status: id }, role: "status", "aria-live": "polite" });
  let busy = false;
  const buttons = [];
  const run = async (st, label, fn) => {
    if (busy) return; busy = true; buttons.forEach((b) => { b.disabled = true; }); st.textContent = `${label}を作成中…`; st.classList.remove("err");
    try { st.textContent = await fn(st); } catch (e) { st.classList.add("err"); st.textContent = e?.name === "AbortError" ? "中断しました" : `${label}に失敗しました: ${e?.message ?? e}`; }
    busy = false; sync();
  };
  const btn = (text, fn, { primary = true, id } = {}) => { const b = h("button", { type: "button", class: `v53-btn${primary ? " primary" : ""}`, dataset: { act: id }, text, onclick: fn }); buttons.push(b); return b; };

  // 1. Chronicle
  const stC = status("chronicle");
  const cChron = card("chronicle", "Chronicle（.md）", "年表に加えて、文明史（国家・戦争・出来事・AI判断）を含む年代記です。保存された名称・日付・原因をそのまま書きます。",
    btn("Chronicle を書き出す", () => run(stC, "Chronicle", async () => { const r = await adapter.exports.chronicle(); download(r.blob, r.name); return `${r.name} を書き出しました（${fmtBytes(r.blob.size)}）`; }), { id: "chronicle" }), stC);

  // 2. .ahmap
  const stA = status("ahmap");
  const pastNote = h("p", { class: "v53-hint", hidden: true, text: "過去を閲覧中でも、保存されるのは現在の世界の状態です（閲覧中の月ではありません）。" });
  const cAhmap = card("ahmap", "完全保存（.ahmap）", "世界と文明史をすべて保持する正本の形式です。あとで開いて続きから再開できます。", pastNote,
    btn(".ahmap で保存", () => run(stA, "保存", async () => { const r = await adapter.exports.ahmap(); download(r.blob, r.name); return `${r.name} を保存しました（${fmtBytes(r.blob.size)}）`; }), { id: "ahmap" }), stA);

  // 3. Obsidian
  const stO = status("obsidian");
  const scope = h("select", { class: "v53-select", "aria-label": "範囲" }, h("option", { value: "all", text: "全期間・全記録（標準）" }), h("option", { value: "range", text: "期間を絞る" }));
  const from = h("input", { type: "number", class: "v53-input narrow", "aria-label": "開始年", placeholder: "開始年" }), to = h("input", { type: "number", class: "v53-input narrow", "aria-label": "終了年", placeholder: "終了年" });
  const rangeBox = h("div", { class: "v53-range", hidden: true }, from, h("span", { text: "年〜" }), to, h("span", { text: "年" }));
  const size = h("select", { class: "v53-select", "aria-label": "1ファイルの大きさ" }, PART_SIZES.map(([v, t]) => h("option", { value: v, selected: v === 64 }, t)));
  const est = h("p", { class: "v53-hint", dataset: { role: "estimate" } });
  const partList = h("ul", { class: "v53-parts", dataset: { role: "parts" } });
  let abort = null;
  const cancel = h("button", { type: "button", class: "v53-btn", hidden: true, text: "中断", onclick: () => abort?.abort() });
  const rangeOf = () => scope.value === "range" ? { fromMonth: from.value === "" ? -Infinity : monthOf(Number(from.value), 1), toMonth: to.value === "" ? Infinity : monthOf(Number(to.value), 12) } : {};
  let estKey = "";
  const updateEst = (force = false) => { const key = `${scope.value}|${from.value}|${to.value}|${adapter.meta().events}`; if (!force && key === estKey) return; estKey = key; try { const e = adapter.exports.obsidianEstimate(rangeOf()); est.textContent = `書き出す内容: ノート約 ${e.files.toLocaleString("ja-JP")} 件（出来事 ${e.events.toLocaleString("ja-JP")}・AI判断 ${e.decisions.toLocaleString("ja-JP")}）。大きい場合は複数の ZIP に自動で分割します。`; } catch { est.textContent = ""; } };
  scope.addEventListener("change", () => { rangeBox.hidden = scope.value !== "range"; updateEst(); });
  from.addEventListener("input", () => updateEst()); to.addEventListener("input", () => updateEst());
  const cObs = card("obsidian", "Obsidian（.zip）", "既定は全期間・全記録です。巨大な場合は連番つきの複数 ZIP に分けます。すべて同じフォルダへ展開すると、1 つの vault になります。",
    h("div", { class: "v53-form" }, scope, rangeBox, size), est,
    h("div", { class: "v53-actions" }, btn("Obsidian へ書き出す", () => run(stO, "Obsidian", async (st) => {
      abort = new AbortController(); cancel.hidden = false; partList.replaceChildren();
      const parts = []; let files = 0;
      try {
        for await (const part of adapter.exports.obsidian({ ...rangeOf(), maxPartBytes: Number(size.value) * 1024 * 1024, signal: abort.signal, onProgress: (p) => { files = p.files; st.textContent = `書き出し中… ${p.files.toLocaleString("ja-JP")} ファイル（${p.parts} パート完了）`; } })) {
          download(new Blob([part.bytes], { type: "application/zip" }), part.name);
          const { bytes, entries, ...summary } = part; parts.push(summary);
          partList.append(h("li", { text: `${part.name} — ${part.fileCount.toLocaleString("ja-JP")} ファイル・${fmtBytes(part.zipBytes)}` }));
          await new Promise((r) => setTimeout(r, 0));
        }
      } finally { cancel.hidden = true; abort = null; }
      const problems = verifyParts(parts);
      const total = parts.reduce((a, p) => a + p.fileCount, 0);
      if (problems.length) { st.classList.add("err"); partList.append(...problems.map((p) => h("li", { class: "err", text: p }))); return `書き出しは終わりましたが、検査で問題が見つかりました（${problems.length} 件）`; }
      return `${parts.length} 個の ZIP・計 ${total.toLocaleString("ja-JP")} ファイルを書き出しました。連番・件数を検査して、欠落・重複はありませんでした。${parts.length > 1 ? "ブラウザが複数ファイルのダウンロードを確認したら、許可してください。" : ""}`;
    }), { id: "obsidian" }), cancel), stO, partList);

  // 4. PNG
  const stP = status("png");
  let kind = "current";
  const radios = PNG_KINDS.map((k) => { const r = h("input", { type: "radio", name: "v53-png-kind", value: k.id, id: `v53-png-${k.id}`, checked: k.id === kind }); r.addEventListener("change", () => { kind = k.id; describe(); }); return h("label", { class: "v53-radio", for: r.id }, r, h("span", null, h("b", { text: k.label }), h("small", { text: k.desc }))); });
  const what = h("p", { class: "v53-png-what", dataset: { role: "png-what" } });
  const cPng = card("png", "PNG 画像", "どの状態を表す画像かは、画像の下部にも書き込まれます。", h("div", { class: "v53-radios" }, radios), what,
    btn("PNG を書き出す", () => run(stP, "PNG", async () => { const r = await adapter.exports.png({ kind, month: adapter.meta().view ?? adapter.meta().now }); download(r.blob, r.name); return `${r.name} を書き出しました。${r.meta?.summary ?? ""}`; }), { id: "png" }), stP);
  function describe() {
    const m = adapter.meta(), d = describePng({ kind, month: m.view ?? m.now, worldName: m.name, layers: adapter.layers(), legendCount: m.states });
    what.textContent = `この画像が表すもの: ${d.label}（${fmtMonth(m.view ?? m.now)}）／ ${d.summary}`;
  }

  function sync() {
    const m = adapter.meta(), has = m.hasWorld;
    const av = adapter.exports.describe();
    cChron.querySelector("button").disabled = busy || !av.chronicle.available;
    cAhmap.querySelector("button").disabled = busy || !av.ahmap.available;
    cObs.querySelector("[data-act=obsidian]").disabled = busy || !av.obsidian.available;
    cPng.querySelector("button").disabled = busy || !av.png.available || !has;
    pastNote.hidden = !m.past; describe(); updateEst();
  }
  // 再生中は毎月通知が来る。見積もり（出来事の数え上げ）が重くならないよう、画面の更新は間引く
  let pending = 0; const throttled = () => { if (pending) return; pending = setTimeout(() => { pending = 0; sync(); }, 500); };
  const unsub = adapter.subscribe(throttled); sync();
  const el = h("div", { class: "v53-export" }, cChron, cAhmap, cObs, cPng);
  return { el, sync, dispose() { unsub(); clearTimeout(pending); abort?.abort(); } };
}
