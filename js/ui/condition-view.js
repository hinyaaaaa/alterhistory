// 国勢の表示（v2.7.0）。国の状態・制約・余波・思潮と、技術の進捗。見るだけ（地図は変えない）。
// データは simActions.nationCondition(stateId) が作る。
import { el } from "./kit.js";

const pct = (v) => `${Math.round(v * 100)}%`;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** 横棒。value は 0〜1 */
function bar(label, value, text, { hint = "", level = "" } = {}) {
  const row = el("div", "cond-row"); if (hint) row.title = hint;
  const track = el("div", "cond-bar"), fill = el("i", level ? `lv-${level}` : ""); fill.style.width = `${Math.round(clamp01(value) * 100)}%`; track.append(fill);
  row.append(el("span", "np-k", label), track, el("span", "cond-val", text));
  return row;
}
const lvl = (v, warn, bad) => (v < bad ? "bad" : v < warn ? "warn" : "ok");

/** 国家タブ「国勢」 */
export function conditionPane(pane, c) {
  if (!c) { pane.append(el("p", "muted", "この国の国勢は求められません")); return; }
  const st = el("section", "nation-sec"); st.dataset.field = "cond-state";
  st.append(el("h4", "", "国の状態"), el("p", "hint", "地図・人口・技術・出来事から、毎月求めています（保存はしません）。"));
  st.append(
    bar("食料", c.food / 2, `需給 ${c.food.toFixed(2)}`, { level: lvl(c.food, 0.95, 0.75), hint: "生産÷需要（農業・交通・余波で補正）。1 で釣り合い" }),
    bar("都市化", c.urbanShare / Math.max(0.01, c.maxUrban), `${pct(c.urbanShare)}（技術の上限 ${pct(c.maxUrban)}）`, { hint: "都市人口の割合。産業と交通が進むほど上限が上がる" }),
    bar("産業力", c.industryRatio / 2, `${c.industryRatio.toFixed(2)}`, { level: lvl(c.industryRatio, 0.8, 0.5), hint: "いまの産業÷その技術水準で見込まれる産業" }),
    bar("財政の余力", c.fiscalSlack / 1.2, c.fiscalSlack.toFixed(2), { level: lvl(c.fiscalSlack, 0.7, 0.4), hint: "余波・戦争の負担を引いた財政の余裕" }),
    bar("民意", c.support / 100, `${Math.round(c.support)}`, { level: lvl(c.support, 45, 25) }),
  );
  const cons = el("section", "nation-sec"); cons.dataset.field = "cond-constraints"; cons.append(el("h4", "", "いまの制約（何ができて、何ができないか）"));
  for (const r of c.constraints) { const p = el("div", `cond-con lv-${r.level}`); p.append(el("b", "", r.label), el("span", "", r.text)); cons.append(p); }
  const sh = el("section", "nation-sec"); sh.dataset.field = "cond-shocks"; sh.append(el("h4", "", "余波（最近の出来事が残した影響）"));
  if (!c.shocks.length) sh.append(el("p", "hint", "いまは目立った余波はありません"));
  for (const x of c.shocks.slice(0, 8)) sh.append(el("div", "cond-shock", `${x.kind}: ${x.now > 0 ? "悪化" : "好転"}（${Math.abs(x.now).toFixed(2)}）${x.source ? ` ← ${x.source}` : ""}`));
  sh.append(el("p", "hint", "余波は時間とともに薄れ、そのあいだ、後続の出来事の起きやすさと被害を変えます。"));
  const id = el("section", "nation-sec"); id.dataset.field = "cond-ideas"; id.append(el("h4", "", "思潮（思想の攪拌）"), el("p", "hint", "思想は国内の事情で育ち、隣国と混ざり合います。税率・徴兵率・政体は、思潮では自動で変わりません。"));
  for (const i of c.ideas) id.append(bar(i.label, i.v, pct(i.v), { hint: i.desc }));
  pane.append(st, cons, sh, id);
}

/** 技術タブに足す「進捗」（次の段まで）。見える段は変わらない */
export function progressBlock(c) {
  const sec = el("section", "nation-sec"); sec.dataset.field = "tech-progress";
  sec.append(el("h4", "", "進捗（次の段まで）"));
  if (!c) return sec;
  if (c.trinity) sec.append(el("p", "hint", `産業力 ${c.trinity.I.toFixed(2)} × 経済力 ${c.trinity.E.toFixed(2)} × 技術力 ${c.trinity.T.toFixed(2)}（三位一体。どれかが欠けると進みが鈍る）`));
  for (const p of c.progress) {
    const left = p.monthsLeft == null ? (p.level >= 10 ? "最高段" : "進まない") : p.progress >= 1 ? "機運の対象" : `あと約${Math.max(1, Math.round(p.monthsLeft / 12))}年`;
    sec.append(bar(p.label, p.progress, left, { hint: `${p.level}段「${p.step ?? ""}」まで来ています。進捗が満ちると機運が出て、採用ボタンで +1 段になります` }));
  }
  sec.append(el("p", "hint", "進捗は毎月たまります。段が上がるのは、機運が出て「採用する」を押したときだけです。"));
  return sec;
}
