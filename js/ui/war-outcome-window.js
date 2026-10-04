// 戦争の戦況バー（戦争ウィンドウ用）、講和条約ウィンドウ、通貨・為替ウィンドウ。
//   ・戦況（陸軍力・制海権・制空権・士気）のバーは「戦争」ウィンドウの中に表示する
//   ・講和条約は戦争ウィンドウから切り離し、「講和条約」ウィンドウで決める
//   ・通貨・為替は証券の相場表のように、レート・前年比・推移グラフで見せる
// どれも設定メニューから開くウィンドウ。判定や計算は core/ にあり、ここは表示だけ。
import { guardRender } from "./safe-render.js";
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const pct = (v) => `${Math.round(v * 100)}%`;
const fmt = (n, d = 0) => Number(n).toLocaleString("ja-JP", { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtDate = (d) => (d ? `${d.year}年${d.month}月` : "—");

export function initWarOutcome({ store, simActions }) {
  const sname = (map, id) => map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;
  const names = (map, ids) => ids.map((i) => sname(map, i)).join("・");

  // ================= 戦況（戦争ウィンドウの中に出す） =================
  function bar(label, aShare, aText, dText) {
    const wrap = el("div", "wo-bar-wrap");
    const row = el("div", "wo-bar-row");
    row.append(el("span", "wo-bar-val a", aText), el("span", "wo-bar-label", label), el("span", "wo-bar-val d", dText));
    const track = el("div", "wo-bar");
    const a = el("div", "wo-bar-a"); a.style.width = pct(aShare);
    const d = el("div", "wo-bar-d"); d.style.width = pct(1 - aShare);
    track.append(a, d); wrap.append(row, track);
    return wrap;
  }
  /** 陸軍力・制海権・制空権・士気の比較バー（戦争開始前の見積もりにも、判定後の戦況にも使う） */
  function bars(r) {
    const A = r.aStrength, D = r.dStrength, c = r.compare, n = (v) => fmt(v);
    const box = el("div", "wo-bars");
    box.append(bar("陸軍力", c.land, n(A.land), n(D.land)), bar("制海権", c.sea, n(A.sea), n(D.sea)), bar("制空権", c.air, n(A.air), n(D.air)), bar("士気", c.morale, fmt(A.morale), fmt(D.morale)));
    return box;
  }
  /** 戦争1つの戦況（両陣営・比較バー・結果・終戦日・参戦した同盟国）をまとめて返す */
  function situation(map, war) {
    const box = el("div", "wo-situation");
    const sides = el("div", "wo-sides");
    sides.append(el("div", "wo-side a", names(map, war.attackers)), el("div", "wo-vs", "VS"), el("div", "wo-side d", names(map, war.defenders)));
    box.append(sides);
    const r = war.result;
    if (!r) { box.append(el("p", "muted", "戦況の記録がありません（旧データの戦争です）")); return box; }
    box.append(bars(r));
    box.append(el("div", `wo-verdict ${r.winner}`, r.winner === "attacker" ? `攻撃側の勝利（${names(map, war.attackers)}）` : r.winner === "defender" ? `防衛側の勝利（${names(map, war.defenders)}）` : "決着つかず（膠着）"));
    const dates = `開戦 ${fmtDate(war.startedAt)}　${war.endedAt ? `終戦 ${fmtDate(war.endedAt)}` : `終戦予定 ${fmtDate(war.endsAt)}（約${war.durationMonths ?? "?"}ヶ月）`}${r.warScore != null ? `　戦争スコア ${r.warScore}` : ""}`;
    box.append(el("p", "hint", dates));
    if (war.joinedAllies?.length) box.append(el("p", "hint", `同盟の拘束により参戦: ${war.joinedAllies.map((j) => `${sname(map, j.id)}（${j.alliance}・${j.side === "attacker" ? "攻撃側" : "防衛側"}）`).join("、")}`));
    return box;
  }

  // ================= 講和条約ウィンドウ =================
  // 戦闘が終わった戦争（講和待ち）の条約を決める。締結した条約は、あとから「締結済み」として中身を確認できる。
  const treatyBody = el("div", "treaty-body");
  let sel = null;   // 選んでいる戦争
  let draft = null; // { warId, venue, treatyName, kind, size, cessions:[{key,cells,fromStateId,toStateId,name,on}], reparations:{ "from-to": amount }, notes, sug }

  function renderTreaty() {
    treatyBody.replaceChildren();
    const map = store.getState().map;
    if (!map) { treatyBody.append(el("p", "muted", "地図を開いてください")); return; }
    const all = simActions.listWars().slice().reverse().filter((w) => w.result);
    if (!all.length) { treatyBody.append(el("p", "muted", "講和条約を結べる戦争はまだありません。戦争ウィンドウで戦争を始めると、戦闘が終わったあとにここで講和条約を決められます。")); sel = null; draft = null; return; }
    if (!all.some((w) => w.id === sel)) { sel = (all.find((w) => !w.endedAt) ?? all[0]).id; draft = null; }
    const split = el("div", "win-split"), list = el("div", "win-list");
    for (const w of all) {
      const icon = w.endedAt ? "✅" : (w.progress != null && w.progress < 1) ? "⏳" : "📜";
      const b = el("button", w.id === sel ? "active" : "", `${icon} ${w.endedAt && w.treatyName ? w.treatyName : w.name}`); b.type = "button";
      b.title = w.endedAt ? "締結済みの条約（中身を確認できます）" : (w.progress != null && w.progress < 1) ? "戦闘中" : "講和待ち";
      b.addEventListener("click", () => { sel = w.id; draft = null; renderTreaty(); });
      list.append(b);
    }
    const detail = el("div", "win-detail"); const war = all.find((w) => w.id === sel);
    if (war.endedAt) detail.append(treatyRecord(map, war));
    else if (war.progress != null && war.progress < 1) {
      detail.append(el("h4", "", war.name), situation(map, war));
      detail.append(el("p", "hint", `戦闘が続いています（進行 ${pct(war.progress)}）。時間が進むと損害が積み重なり、終わると講和条約を結べます。`));
      const go = el("button", "primary", "戦闘を最後まで進める"); go.type = "button";
      go.addEventListener("click", () => simActions.finishWar(war.id)); detail.append(go);
    } else detail.append(treatyForm(map, war));
    split.append(list, detail); treatyBody.append(split);
  }

  /** 締結済みの条約の中身（読み取り専用） */
  function treatyRecord(map, war) {
    const t = war.terms ?? {}, box = el("div", "treaty-record");
    box.append(el("h3", "", war.treatyName ?? t.treatyName ?? "講和条約"));
    const kindLabel = { standard: "通常の講和", white: "白紙和平", annex: "全面降伏（併合）" }[t.kind ?? "standard"];
    const lines = [["戦争", `${war.name}（${warTypeLabel(war.type)}）`], ["種類", kindLabel], ["締結", `${fmtDate(t.signedAt ?? war.endedAt)}`], ["講和地", t.venue ? `${t.venue.place}（${t.venue.stateId ? sname(map, t.venue.stateId) : ""}）` : "—"],
      ["交戦国", `${names(map, war.attackers)} ／ ${names(map, war.defenders)}`], ["戦争スコア", t.score ? `${t.score.total}` : "—"]];
    const tb = el("table", "win-table");
    for (const [k, v] of lines) { const tr = el("tr"); tr.append(el("th", "", k), el("td", "", v)); tb.append(tr); }
    box.append(tb);
    box.append(el("h4", "", "割譲"));
    if (t.cessions?.length) { const ul = el("ul"); for (const c of t.cessions) ul.append(el("li", "", `${c.name || "区画"}（${c.cells}セル${c.burgs?.length ? `・都市: ${c.burgs.join("、")}` : ""}）：${sname(map, c.fromStateId)} → ${sname(map, c.toStateId)}`)); box.append(ul); } else box.append(el("p", "muted", "なし"));
    box.append(el("h4", "", "賠償金"));
    if (t.reparations?.length) { const ul = el("ul"); for (const r of t.reparations) ul.append(el("li", "", `${sname(map, r.fromStateId)} が ${fmt(r.amount, 2)} ${r.currency} を支払い → ${sname(map, r.toStateId)} が ${fmt(r.received, 2)} ${r.receivedCurrency} を受け取り`)); box.append(ul); } else box.append(el("p", "muted", "なし"));
    if (t.annex?.length) { box.append(el("h4", "", "併合")); const ul = el("ul"); for (const x of t.annex) ul.append(el("li", "", `${sname(map, x.fromStateId)} は ${sname(map, x.toStateId)} に併合`)); box.append(ul); }
    if (t.notes) box.append(el("h4", "", "その他の条件"), el("p", "", t.notes));
    box.append(el("h4", "", "戦争の経過"), situation(map, war));
    return box;
  }
  const warTypeLabel = (k) => ({ limited: "限定戦", conventional: "通常戦", total: "総力戦", asymmetric: "非対称戦" }[k] ?? "通常戦");

  function treatyForm(map, war) {
    const { winners, losers, stalemate } = simActions.peaceSides(war);
    if (!draft || draft.warId !== war.id) {
      const venue = simActions.peaceVenue(war.id), sug = simActions.suggestTreaty(war.id);
      draft = { warId: war.id, venue, treatyName: venue?.treatyName ?? `${war.name}の講和条約`, kind: sug?.kind ?? "standard", size: "m", sug, cessions: null, reparations: null, notes: "" };
    }
    const wrap = el("div", "treaty-form");
    const wn = document.createElement("input"); wn.value = war.name; wn.addEventListener("change", () => { simActions.renameWar(war.id, wn.value); });
    wrap.append(el("label", "field-label", "戦争の名前"), wn, situation(map, war));

    const sug = draft.sug;
    if (sug) { // 各国の消耗
      const t = el("table", "win-table"); const h = el("tr");
      for (const x of ["国", "立場", "兵力の損失", "損失の割合", "士気の変動"]) h.append(el("th", "", x)); t.append(h);
      for (const e of sug.exhaustion) {
        const tr = el("tr"); const frac = e.before > 0 ? e.lost / e.before : 0;
        tr.append(el("td", "", sname(map, e.stateId)), el("td", "", e.side === "winner" ? "勝者側" : "敗者側"), el("td", "", `${fmt(e.lost)} 人`), el("td", "", pct(frac)), el("td", e.moraleDelta >= 0 ? "cur-chg up" : "cur-chg down", `${e.moraleDelta >= 0 ? "+" : ""}${e.moraleDelta}`));
        t.append(tr);
      }
      wrap.append(el("h4", "", "各国の消耗"), t);
      wrap.append(el("p", "hint", `戦争スコア ${sug.warScore}（勝者はこの範囲でしか要求できません。勝者が複数なら、戦力への貢献に応じて分け合います）`));
    }

    const kinds = [["standard", "通常の講和（割譲・賠償）"], ["white", "白紙和平（条件なし）"], ["annex", "全面降伏（敗者を併合。戦争スコア85以上）"]];
    const kindRow = el("div", "member-picker");
    for (const [k, label] of kinds) {
      const l = el("label", ""); const rb = document.createElement("input"); rb.type = "radio"; rb.name = "treaty-kind"; rb.checked = draft.kind === k;
      rb.addEventListener("change", () => { draft.kind = k; renderTreaty(); });
      l.append(rb, document.createTextNode(` ${label}`)); kindRow.append(l);
    }
    wrap.append(el("h4", "", "講和の種類"), kindRow);

    // 講和地と条約名（基本は戦勝国の都市。膠着なら仲介する中立国の都市）
    const v = draft.venue;
    const roleLabel = v?.role === "winner" ? "戦勝国" : v?.role === "mediator" ? "仲介国（中立）" : "交戦国";
    const venueLine = el("p", "hint", v ? `講和地：${v.place}（${sname(map, v.stateId)}・${roleLabel}）` : "講和地を決められませんでした（都市がありません）");
    const again = el("button", "", "別の地で開く"); again.type = "button";
    again.addEventListener("click", () => { const nv = simActions.peaceVenue(war.id); if (nv) { draft.venue = nv; draft.treatyName = nv.treatyName; renderTreaty(); } });
    const tn = document.createElement("input"); tn.value = draft.treatyName; tn.addEventListener("input", () => { draft.treatyName = tn.value; });
    wrap.append(el("label", "field-label", "講和条約の名前（講和地の地名から）"), tn, venueLine, again);

    const detail = el("div", "treaty-detail"); wrap.append(detail);
    const meter = el("div", "wo-impact"); const impact = el("div", "wo-impact");
    const annexTargets = () => losers.map((L) => ({ fromStateId: L, toStateId: winners[0] }));

    // 割譲の候補（敗者ごと）。消耗に比例した量が、初めから選ばれている
    function ensureCessions() {
      if (draft.cessions) return;
      draft.cessions = [];
      for (const L of losers) {
        const chunks = simActions.suggestCessionChunks(winners, L, { size: draft.size });
        let sum = 0; const want = draft.sug?.cessionByLoser?.[L] ?? 0;
        for (const c of chunks) { const on = sum < want; if (on) sum += c.cells; draft.cessions.push({ ...c, key: `${L}:${c.regionCells[0]}`, on }); }
      }
    }
    function ensureRepar() {
      if (draft.reparations) return;
      draft.reparations = {};
      for (const r of draft.sug?.reparations ?? []) draft.reparations[`${r.fromStateId}-${r.toStateId}`] = r.amount;
    }
    const currentTerms = () => ({
      kind: draft.kind,
      cessions: draft.kind === "standard" ? (draft.cessions ?? []).filter((c) => c.on).map((c) => ({ cells: c.regionCells, fromStateId: c.fromStateId, toStateId: c.toStateId, name: c.name })) : [],
      reparations: draft.kind === "standard" ? Object.entries(draft.reparations ?? {}).filter(([, a]) => a > 0).map(([k, amount]) => { const [f, t] = k.split("-").map(Number); return { fromStateId: f, toStateId: t, amount }; }) : [],
      annex: draft.kind === "annex" ? annexTargets() : [],
    });
    function renderMeter() {
      meter.replaceChildren();
      const terms = currentTerms();
      const rows = simActions.treatyBudget(war.id, terms);
      const t = el("table", "win-table"); const h = el("tr"); for (const x of ["勝者", "取り分", "要求の費用 / 上限（戦争スコア）"]) h.append(el("th", "", x)); t.append(h);
      for (const r of rows) { const tr = el("tr"); const over = r.spent > r.budget + 0.05; tr.append(el("td", "", sname(map, r.stateId)), el("td", "", pct(r.share)), el("td", over ? "cur-chg down" : "", `${fmt(r.spent, 1)} / ${fmt(r.budget, 1)}${over ? "　⚠ 超過" : ""}`)); t.append(tr); }
      meter.append(el("h4", "", "戦争スコアの使い道"), t);
      // 相手から渡るもの
      impact.replaceChildren();
      const lines = [];
      for (const L of losers) {
        const mine = terms.cessions.filter((c) => c.fromStateId === L);
        const r = simActions.estimatePeace(war.id, { loserId: L, cellGroups: mine.map((c) => c.cells), reparations: terms.reparations.filter((x) => x.fromStateId === L).reduce((n, x) => n + x.amount, 0) });
        if (!r) continue;
        lines.push([`${sname(map, L)}から`, `${fmt(r.cells)}セル（領土の ${pct(r.share)}）・人口 約${fmt(r.population, 1)}千人・産業 ${fmt(r.industry, 1)}・都市 ${fmt(r.burgs)}件${r.reparations ? `・賠償 ${fmt(r.reparations, 2)}${r.reparationsShare != null ? `（国庫の ${pct(r.reparationsShare)}）` : ""}` : ""}`]);
      }
      for (const x of terms.reparations) { const rate = simActions.exchangeRate(x.fromStateId, x.toStateId); lines.push([`${sname(map, x.fromStateId)} → ${sname(map, x.toStateId)}`, `${fmt(x.amount, 2)} ${simActions.getCurrency(x.fromStateId).name} ＝ ${fmt(x.amount * rate, 2)} ${simActions.getCurrency(x.toStateId).name}（1 ${simActions.getCurrency(x.fromStateId).name} = ${rate.toFixed(4)}）`]); }
      if (lines.length) { const tb = el("table", "win-table"); for (const [k, val] of lines) { const tr = el("tr"); tr.append(el("th", "", k), el("td", "", val)); tb.append(tr); } impact.append(el("h4", "", "この条約で相手から渡るもの"), tb); }
    }

    if (draft.kind === "white") detail.append(el("p", "hint", "どちらも何も受け取りません。戦争は終わり、関係は中立に戻ります。"));
    else if (draft.kind === "annex") detail.append(el("p", "hint", `${losers.map((L) => sname(map, L)).join("・")}は降伏し、全土が${sname(map, winners[0])}に併合されます。`), meter);
    else {
      ensureCessions(); ensureRepar();
      const sizeRow = el("div", "member-picker"); sizeRow.append(el("span", "field-label", "区画の大きさ"));
      for (const [k, label] of [["s", "小"], ["m", "中"], ["l", "大"]]) {
        const l = el("label", ""); const rb = document.createElement("input"); rb.type = "radio"; rb.name = "treaty-size"; rb.checked = draft.size === k;
        rb.addEventListener("change", () => { draft.size = k; draft.cessions = null; renderTreaty(); });
        l.append(rb, document.createTextNode(` ${label}`)); sizeRow.append(l);
      }
      detail.append(el("h4", "", "割譲する地域"), sizeRow, el("p", "hint", `消耗に比例した目安: 約${fmt(draft.sug?.cessionCells ?? 0)}セル。区画ごとに受け取る勝者を選べます（首都は割譲できません）`));
      const cessBox = el("div", "wo-cess");
      if (!draft.cessions.length) cessBox.append(el("p", "muted", "割譲できる区画がありません"));
      for (const c of draft.cessions) {
        const l = el("label", "wo-cess-row"); const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = c.on;
        cb.addEventListener("change", () => { c.on = cb.checked; renderMeter(); });
        l.append(cb, document.createTextNode(`${c.name}（${c.cells}セル・${sname(map, c.fromStateId)}）→ `));
        if (winners.length > 1) { const s2 = document.createElement("select"); for (const wId of winners) { const o = document.createElement("option"); o.value = wId; o.textContent = sname(map, wId); o.selected = wId === c.toStateId; s2.append(o); } s2.addEventListener("change", () => { c.toStateId = Number(s2.value); renderMeter(); }); l.append(s2); }
        else l.append(document.createTextNode(sname(map, c.toStateId)));
        cessBox.append(l);
      }
      detail.append(cessBox);
      detail.append(el("h4", "", "賠償金（消耗から自動で仮設定。変更できます）"));
      for (const L of losers) for (const W of winners) {
        const key = `${L}-${W}`; const row = el("div", "member-picker");
        const amount = document.createElement("input"); amount.type = "number"; amount.min = "0"; amount.value = String(draft.reparations[key] ?? 0);
        amount.addEventListener("input", () => { draft.reparations[key] = Number(amount.value) || 0; renderMeter(); });
        row.append(el("span", "", `${sname(map, L)} → ${sname(map, W)}`), amount, el("span", "muted", simActions.getCurrency(L).name));
        detail.append(row);
      }
      detail.append(meter, impact);
    }
    renderMeter();

    const notes = document.createElement("textarea"); notes.rows = 3; notes.placeholder = "その他の条件（非武装化・通商・駐留など自由記述）"; notes.value = draft.notes;
    notes.addEventListener("input", () => { draft.notes = notes.value; });
    wrap.append(el("h4", "", "その他の条件"), notes);

    const sign = el("button", "primary", "講和条約を締結する"); sign.type = "button";
    sign.addEventListener("click", () => {
      const ok = simActions.signTreaty(war.id, { ...currentTerms(), treatyName: draft.treatyName.trim(), notes: draft.notes.trim(), venue: draft.venue ? { place: draft.venue.place, stateId: draft.venue.stateId } : null });
      if (ok) { draft = null; renderTreaty(); }
    });
    wrap.append(sign);
    return wrap;
  }

  // ================= 通貨・為替（証券の相場表のように） =================
  const currencyBody = el("div", "cur-body");
  let baseId = null, convFrom = null, convTo = null, convAmt = 100;
  function spark(hist, up) {
    const W = 90, H = 26;
    if (!hist || hist.length < 2) return el("span", "muted", "—");
    const mn = Math.min(...hist), mx = Math.max(...hist), span = mx - mn || 1;
    const pts = hist.map((v, i) => `${(i / (hist.length - 1) * W).toFixed(1)},${(H - 2 - ((v - mn) / span) * (H - 4)).toFixed(1)}`).join(" ");
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const pl = document.createElementNS(NS, "polyline"); pl.setAttribute("points", pts); pl.setAttribute("fill", "none"); pl.setAttribute("stroke-width", "1.6"); pl.setAttribute("stroke", up ? "#4fb477" : "#d9594c");
    svg.append(pl); return svg;
  }
  function renderCurrency() {
    currencyBody.replaceChildren();
    const map = store.getState().map; if (!map) { currencyBody.append(el("p", "muted", "地図を開いてください")); return; }
    const states = map.pack.states.filter(isLive);
    if (!states.length) { currencyBody.append(el("p", "muted", "国家がありません")); return; }
    if (!states.some((s) => s.i === baseId)) baseId = states[0].i;
    const base = simActions.getCurrency(baseId);

    const top = el("div", "cur-top");
    const baseSel = document.createElement("select");
    for (const s of states) { const o = document.createElement("option"); o.value = s.i; o.textContent = `${simActions.getCurrency(s.i).name}（${sname(map, s.i)}）`; o.selected = s.i === baseId; baseSel.append(o); }
    baseSel.addEventListener("change", () => { baseId = Number(baseSel.value); renderCurrency(); });
    top.append(el("span", "", "基準通貨"), baseSel);
    currencyBody.append(top, el("p", "hint", "レートの値はシステムが経済力から決め、年ごとに変動します。ここで選べるのは、変動相場か固定相場かだけです。"));

    // 相場表: 強い通貨（基準通貨1単位あたりの価値が高い）の順
    const rows = states.map((s) => {
      const c = simActions.getCurrency(s.i);
      const vsBase = simActions.exchangeRate(s.i, baseId);          // 1 その通貨 = ? 基準通貨
      const histBase = (c.hist ?? [c.rate]).map((r) => r / Math.max(1e-9, base.rate));
      const prev = histBase.length > 1 ? histBase[histBase.length - 2] : vsBase;
      return { s, c, vsBase, change: prev ? (vsBase - prev) / prev : 0, hist: histBase };
    }).sort((a, b) => b.vsBase - a.vsBase);

    const t = el("table", "win-table cur-board");
    const h = el("tr"); for (const x of ["コード", "通貨", "国", `1通貨 = ${base.name}`, "前年比", "推移", "相場制", "固定の基準国"]) h.append(el("th", "", x)); t.append(h);
    for (const { s, c, vsBase, change, hist } of rows) {
      const tr = el("tr");
      const code = el("td", "cur-code", c.code ?? String(s.name).slice(0, 3).toUpperCase());
      const nameIn = document.createElement("input"); nameIn.value = c.name; nameIn.size = 10;
      nameIn.addEventListener("change", () => simActions.setCurrency(s.i, { name: nameIn.value.trim() || c.name }));
      const rate = el("td", "cur-rate", vsBase.toFixed(4));
      const chg = el("td", `cur-chg ${change > 0.00005 ? "up" : change < -0.00005 ? "down" : ""}`, `${change > 0.00005 ? "▲" : change < -0.00005 ? "▼" : "－"} ${(Math.abs(change) * 100).toFixed(2)}%`);
      const sp = el("td"); sp.append(spark(hist, change >= 0));
      const reg = document.createElement("select");
      for (const [v, l] of [["floating", "変動"], ["pegged", "固定"]]) { const o = document.createElement("option"); o.value = v; o.textContent = l; o.selected = c.regime === v; reg.append(o); }
      const peg = document.createElement("select");
      for (const o2 of states.filter((x) => x.i !== s.i)) { const o = document.createElement("option"); o.value = o2.i; o.textContent = sname(map, o2.i); o.selected = c.pegTo === o2.i; peg.append(o); }
      peg.disabled = c.regime !== "pegged";
      const apply = () => simActions.setCurrency(s.i, reg.value === "pegged" ? { regime: "pegged", pegTo: Number(peg.value) } : { regime: "floating" });
      reg.addEventListener("change", () => { apply(); renderCurrency(); }); peg.addEventListener("change", apply);
      const cell = (n) => { const td = el("td"); td.append(n); return td; };
      tr.append(code, cell(nameIn), el("td", "", sname(map, s.i)), rate, chg, sp, cell(reg), cell(peg));
      t.append(tr);
    }
    currencyBody.append(t);

    // 両替の計算機
    if (!states.some((s) => s.i === convFrom)) convFrom = states[0].i;
    if (!states.some((s) => s.i === convTo)) convTo = (states[1] ?? states[0]).i;
    const conv = el("div", "cur-conv");
    const amt = document.createElement("input"); amt.type = "number"; amt.value = String(convAmt); amt.min = "0";
    const sel = (cur, on) => { const s = document.createElement("select"); for (const st of states) { const o = document.createElement("option"); o.value = st.i; o.textContent = simActions.getCurrency(st.i).name; o.selected = st.i === cur; s.append(o); } s.addEventListener("change", () => { on(Number(s.value)); renderCurrency(); }); return s; };
    const out = el("strong", "", `${fmt((Number(amt.value) || 0) * simActions.exchangeRate(convFrom, convTo), 2)} ${simActions.getCurrency(convTo).name}`);
    amt.addEventListener("input", () => { convAmt = Number(amt.value) || 0; out.textContent = `${fmt(convAmt * simActions.exchangeRate(convFrom, convTo), 2)} ${simActions.getCurrency(convTo).name}`; });
    conv.append(el("h4", "", "両替"), amt, sel(convFrom, (x) => { convFrom = x; }), el("span", "", "＝"), out, el("span", "", "（"), sel(convTo, (x) => { convTo = x; }), el("span", "", "に）"));
    currencyBody.append(conv);
  }
  const safeTreaty = guardRender(treatyBody, () => renderTreaty()), safeCurrency = guardRender(currencyBody, () => renderCurrency());
  store.subscribe((_s, ch) => {
    if (!["replace", "commit", "undo", "redo"].includes(ch.type)) return;
    if (currencyBody.offsetParent) safeCurrency();
    if (treatyBody.offsetParent) safeTreaty();
  });

  return { situation, bars, treatyBody, renderTreaty, currencyBody, renderCurrency };
}
