// 文化の言語（v2.7.0）。音の体系・語順・系統（音変化）・語根辞書。語根辞書は手で直せる。
// 地名・人名・神名・国名・宗教名は、ここの言語から作られる。
import { el, btn } from "./kit.js";

// 編集するとパネルが作り直されるので、開いていた文化を覚えておく（編集のたびに閉じてしまわないように）
const openSet = new Set();
const ROMAJI_NOTE = "子音・母音はローマ字（sh=シ行、ch=チ行）";

export function languageSection(cultureId, { editActions }) {
  const d = document.createElement("details"); d.className = "b-sec lang-sec"; d.dataset.field = "language";
  d.append(el("summary", "", "言語（地名・人名のもと）"));
  const body = el("div", "lang-body"); d.append(body);
  let salt = 0, armed = false;
  const draw = () => {
    body.replaceChildren();
    const v = editActions.languageView(cultureId, salt);
    if (!v) { body.append(el("p", "hint", "この文化には言語がありません")); return; }
    body.append(el("p", "hint lang-lineage", v.parentName ? `${v.parentName}の言葉から分かれた言語です。` : "他の文化から分かれていない、共通の祖の言語です。"));
    if (v.changes.length) { const ul = el("ul", "lang-changes"); for (const c of v.changes) ul.append(el("li", "", `音変化: ${c.label}`)); body.append(ul); }
    body.append(el("p", "hint lang-phon", `音: 子音 ${v.phon.cons.join(" ") || "—"} ／ 母音 ${v.phon.vows.join(" ")} ／ 語末の子音 ${v.phon.codas.join(" ") || "なし"}（${ROMAJI_NOTE}）`));
    body.append(el("p", "hint lang-order", `語順: ${v.order === "MH" ? "修飾語が先" : "修飾語が後"}（例: 「川の町」→ ${v.example.joined}）`));
    const sm = el("div", "lang-samples");
    sm.append(el("div", "", `地名の例: ${v.samples.places.join("、")}`), el("div", "", `人名の例: ${v.samples.people.join("、")}`), btn("suggest-mini", "🎲 別の例", "同じ言語で、別の例を出す", () => { salt++; draw(); }));
    body.append(sm);
    for (const [cat, label] of Object.entries(v.cats)) {
      const rows = v.rows.filter((r) => r.cat === cat); if (!rows.length) continue;
      const grp = el("div", "lang-grp"); grp.append(el("h5", "", label));
      for (const r of rows) {
        const row = el("label", "lang-row"); row.dataset.concept = r.key;
        const inp = document.createElement("input"); inp.value = r.word; inp.dataset.field = `lang-${r.key}`; inp.maxLength = 8; if (r.edited) inp.classList.add("edited");
        inp.addEventListener("change", () => { if (editActions.setLanguageWord(cultureId, r.key, inp.value)) draw(); else inp.value = r.word; });
        const dice = btn("suggest-mini", "@dice", "この語を作り直す", (ev) => { ev.preventDefault(); if (editActions.rerollLanguageWord(cultureId, r.key)) draw(); });
        row.append(el("span", "np-k", r.label), inp, dice);
        if (r.parentWord != null && r.parentWord !== r.word) row.append(el("span", "lang-parent", `親: ${r.parentWord}`));
        grp.append(row);
      }
      body.append(grp);
    }
    body.append(btn(armed ? "danger" : "", armed ? "本当に作り直す（手で直した語は失われます）" : "言語を作り直す", "親の文化があれば親から音変化で、無ければ新しく作る。Undo で戻せます", () => { if (!armed) { armed = true; return draw(); } armed = false; editActions.regenerateLanguage(cultureId); draw(); }));
  };
  d.addEventListener("toggle", () => { if (d.open) { openSet.add(cultureId); draw(); } else openSet.delete(cultureId); });
  if (openSet.has(cultureId)) { d.open = true; draw(); }
  return d;
}
