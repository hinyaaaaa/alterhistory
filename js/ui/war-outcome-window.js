// ※ リポジトリのソースが古かったため、ビルド済みの dist/app.js から復元したファイルです（動作は同じ。コメントは失われています）。
import { guardRender, keepScroll } from "./safe-render.js";
import { EXHAUST_SUPPORT } from "../core/sim/war-engine.js";
import { VASSAL_KINDS, VASSAL_BY_KEY } from "../core/edit/vassals.js";

const el = (tag, cls, text2) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text2 != null) e.textContent = text2;
  return e;
};
const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const pct = (v) => `${Math.round(v * 100)}%`;
const fmt = (n, d = 0) => Number(n).toLocaleString("ja-JP", { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtDate = (d) => d ? `${d.year}年${d.month}月` : "—";
export function initWarOutcome({ store, simActions, getHighlight = () => null }) {
  const clearHighlight = () => getHighlight()?.clearCells?.();
  const sname = (map, id) => map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;
  const names = (map, ids2) => ids2.map((i) => sname(map, i)).join("・");
  function bar(label, aShare, aText, dText) {
    const wrap = el("div", "wo-bar-wrap");
    const row = el("div", "wo-bar-row");
    const none = aText === "0" && dText === "0";
    row.append(el("span", "wo-bar-val a", none ? "—" : aText), el("span", "wo-bar-label", label), el("span", "wo-bar-val d", none ? "—" : dText));
    const track = el("div", "wo-bar");
    const a = el("div", "wo-bar-a");
    a.style.width = pct(aShare);
    const d = el("div", "wo-bar-d");
    d.style.width = pct(1 - aShare);
    track.append(a, d);
    wrap.append(row, track);
    return wrap;
  }
  function bars(r) {
    const A = r.aStrength, D = r.dStrength, c = r.compare, n = (v) => fmt(v);
    const box = el("div", "wo-bars");
    box.append(bar("陸軍力", c.land, n(A.land), n(D.land)), bar("制海権", c.sea, n(A.sea), n(D.sea)), bar("制空権", c.air, n(A.air), n(D.air)), bar("士気", c.morale, fmt(A.morale), fmt(D.morale)));
    if (A.support != null && c.support != null) box.append(bar("民意", c.support, fmt(A.support), fmt(D.support)));
    return box;
  }
  function situation(map, war, { verdict = null } = {}) {
    const box = el("div", "wo-situation");
    const sides = el("div", "wo-sides");
    sides.append(el("div", "wo-side a", names(map, war.attackers)), el("div", "wo-vs", "VS"), el("div", "wo-side d", names(map, war.defenders)));
    box.append(sides);
    const ongoing = !war.endedAt;
    const showVerdict = verdict ?? !ongoing;
    const r0 = war.result;
    if (!r0) {
      box.append(el("p", "muted", "戦況の記録がありません（旧データの戦争です）"));
      return box;
    }
    const r = ongoing ? { ...r0, ...simActions.previewWar(war.attackers, war.defenders, war.muster && Object.keys(war.muster).length ? war.muster : null, war.type) ?? {} } : r0;
    box.append(bars(r));
    if (ongoing && r.aStrength?.support != null && r.dStrength?.support != null) {
      // 「なぜ決着しないのか／あとどれくらいで降伏するのか」を見える化する
      const gap = (label, v) => v <= EXHAUST_SUPPORT ? `${label}：民意 ${fmt(v)}（降伏ライン ${EXHAUST_SUPPORT} 以下。次の月の進行で降伏します）` : `${label}：民意 ${fmt(v)}（降伏まであと ${fmt(v - EXHAUST_SUPPORT)}）`;
      box.append(el("p", "hint", `${gap("攻撃側", r.aStrength.support)} ／ ${gap("防衛側", r.dStrength.support)}。民意は戦争が長引くほど、また損害が大きいほど下がります。`));
    }
    if (!showVerdict) box.append(el("p", "hint", "戦争は続いています。勝敗の見通しは、講和条約を結ぶ段階で明らかになります。"));
    else {
      if (r.victory) box.append(el("p", "hint", `勝利条件：${r.victory.text}`));
      box.append(el("div", `wo-verdict ${r.winner}`, r.winner === "attacker" ? `攻撃側の勝利（${names(map, war.attackers)}）` : r.winner === "defender" ? `防衛側の勝利（${names(map, war.defenders)}）` : "決着つかず（膠着）"));
    }
    const nowD = map.worldTime ?? war.startedAt, monthsNow = Math.max(0, (nowD.year - war.startedAt.year) * 12 + (nowD.month - war.startedAt.month));
    const dates = ongoing ? `開戦 ${fmtDate(war.startedAt)}　経過 ${monthsNow}か月（目安 約${war.durationMonths ?? "?"}か月）${showVerdict ? `　現在の戦争スコア ${simActions.currentWarScore(war)}（最大 ${r.warScore ?? 0}）` : ""}` : `開戦 ${fmtDate(war.startedAt)}　終戦 ${fmtDate(war.endedAt)}（${war.lastedMonths ?? monthsNow}か月）${r.warScore != null ? `　戦争スコア ${r.warScore}` : ""}`;
    box.append(el("p", "hint", dates));
    if (war.joinedAllies?.length) box.append(el("p", "hint", `同盟の拘束により参戦: ${war.joinedAllies.map((j) => `${sname(map, j.id)}（${j.alliance}・${j.side === "attacker" ? "攻撃側" : "防衛側"}）`).join("、")}`));
    return box;
  }
  const treatyBody = el("div", "treaty-body");
  let sel = null;
  let draft = null;
  const warTypeLabel = (k) => ({ limited: "限定戦", conventional: "通常戦", total: "総力戦", asymmetric: "非対称戦" })[k] ?? "通常戦";
  function renderTreaty() { keepScroll(treatyBody, renderTreatyBody); } // 描き直しても、スクロール位置は先頭に戻さない
  function renderTreatyBody() {
    treatyBody.replaceChildren();
    const map = store.getState().map;
    if (!map) {
      treatyBody.append(el("p", "muted", "地図を開いてください"));
      return;
    }
    const all = simActions.listWars().slice().reverse().filter((w) => w.result);
    if (!all.length) {
      clearHighlight();
      treatyBody.append(el("p", "muted", "講和条約を結べる戦争はまだありません。戦争ウィンドウで戦争を始めると、ここでいつでも講和条約を結べます。"));
      sel = null;
      draft = null;
      return;
    }
    if (!all.some((w) => w.id === sel)) {
      sel = (all.find((w) => !w.endedAt) ?? all[0]).id;
      draft = null;
    }
    const band = el("div", "war-band");
    for (const w of all) {
      const b = el("button", `${w.id === sel ? "active" : ""}${w.endedAt ? " ended" : ""}`, `${w.endedAt ? "✅" : "📜"} ${w.endedAt && w.treatyName ? w.treatyName : w.name}`);
      b.type = "button";
      b.title = w.endedAt ? "締結済みの条約（中身を確認できます）" : "戦争中（いつでも講和できます）";
      b.addEventListener("click", () => {
        sel = w.id;
        draft = null;
        renderTreaty();
      });
      band.append(b);
    }
    treatyBody.append(band);
    const war = all.find((w) => w.id === sel);
    if (war.endedAt) {
      clearHighlight();
      treatyBody.append(treatyRecord(map, war));
    } else treatyBody.append(treatyForm(map, war));
  }
  function treatyRecord(map, war) {
    const t = war.terms ?? {}, box = el("div", "treaty-record");
    box.append(el("h3", "", war.treatyName ?? t.treatyName ?? "講和条約"));
    const kindLabel = { standard: "通常の講和", white: "白紙和平", vassal: "従属化", annex: "全面降伏（併合）" }[t.kind ?? "standard"];
    const lines = [
      ["戦争", `${war.name}（${warTypeLabel(war.type)}）`],
      ["種類", kindLabel],
      ["開戦〜終戦", `${fmtDate(war.startedAt)} 〜 ${fmtDate(war.endedAt)}（${war.lastedMonths ?? "?"}か月）`],
      ["講和地", t.venue ? `${t.venue.place}（${t.venue.stateId ? sname(map, t.venue.stateId) : ""}）` : "—"],
      ["交戦国", `${names(map, war.attackers)} ／ ${names(map, war.defenders)}`],
      ["戦争スコア", t.score ? `${t.score.total}（最大 ${t.score.max ?? "?"}）` : "—"]
    ];
    const tb = el("table", "win-table");
    for (const [k, v] of lines) {
      const tr = el("tr");
      tr.append(el("th", "", k), el("td", "", v));
      tb.append(tr);
    }
    box.append(tb);
    box.append(el("h4", "", "割譲"));
    if (t.cessions?.length) {
      const ul = el("ul");
      for (const c of t.cessions) ul.append(el("li", "", `${c.name || "区画"}（${c.cells}セル${c.burgs?.length ? `・都市: ${c.burgs.join("、")}` : ""}）：${sname(map, c.fromStateId)} → ${sname(map, c.toStateId)}`));
      box.append(ul);
    } else box.append(el("p", "muted", "なし"));
    box.append(el("h4", "", "賠償金"));
    if (t.reparations?.length) {
      const ul = el("ul");
      for (const r of t.reparations) ul.append(el("li", "", `${sname(map, r.fromStateId)} が ${fmt(r.amount, 2)} ${r.currency} を支払い → ${sname(map, r.toStateId)} が ${fmt(r.received, 2)} ${r.receivedCurrency} を受け取り`));
      box.append(ul);
    } else box.append(el("p", "muted", "なし"));
    if (t.vassalize?.length) {
      box.append(el("h4", "", "従属化"));
      const ul = el("ul");
      for (const x of t.vassalize) ul.append(el("li", "", `${sname(map, x.fromStateId)} は ${sname(map, x.toStateId)} の${VASSAL_BY_KEY[x.kind]?.label ?? x.kind}になる`));
      box.append(ul);
    }
    if (t.annex?.length) {
      box.append(el("h4", "", "併合"));
      const ul = el("ul");
      for (const x of t.annex) ul.append(el("li", "", `${sname(map, x.fromStateId)} は ${sname(map, x.toStateId)} に併合`));
      box.append(ul);
    }
    if (t.notes) box.append(el("h4", "", "その他の条件"), el("p", "", t.notes));
    box.append(el("h4", "", "戦争の経過"), situation(map, war));
    return box;
  }
  function autoNotes(war, sug) {
    const r = war.result, out = [];
    if (sug?.kind === "white") out.push("両国は、互いに何も要求せず戦争を終結する。");
    out.push("戦時捕虜は、相互に速やかに解放する。");
    if (r.victory?.type === "capital") out.push("占領下の首都からの撤収は、条約の履行を確認したのちに行う。");
    if (r.victory?.type === "exhaustion") out.push("敗者は、今後3年間、戦争の再開を控える。");
    if (r.victory?.type === "withdrawal") out.push("撤退した陣営は、戦線からの全部隊の引き揚げを確認される。");
    if (war.type === "asymmetric") out.push("占領地の統治は、現地の自治組織に委ねる。");
    if (war.mediator != null) out.push("調停にあたった国の立ち会いのもとで調印する。");
    return out.join("\n");
  }
  function treatyForm(map, war) {
    const { winners, losers, stalemate } = simActions.peaceSides(war);
    if (!draft || draft.warId !== war.id) {
      const venue = simActions.peaceVenue(war.id), sug2 = simActions.suggestTreaty(war.id);
      draft = { warId: war.id, venue, treatyName: venue?.treatyName ?? `${war.name}の講和条約`, kind: sug2?.kind ?? "standard", size: "m", sug: sug2, cessions: null, reparations: null, notes: autoNotes(war, sug2), vkind: "vassal", hover: null };
    }
    const grid = el("div", "war-prep"), left = el("div", "war-prep-left"), right = el("div", "war-prep-right");
    const sug = draft.sug;
    const wn = document.createElement("input");
    wn.value = war.name;
    wn.addEventListener("change", () => {
      simActions.renameWar(war.id, wn.value);
    });
    left.append(el("label", "field-label", "戦争の名前"), wn);
    const det = document.createElement("details");
    det.className = "treaty-fold";
    det.open = false;
    det.append(el("summary", "", "戦況と各国の消耗を見る"), situation(map, war, { verdict: true }));
    left.append(det);
    if (sug) {
      const t = el("table", "win-table");
      const h = el("tr");
      for (const x of ["国", "立場", "兵力の損失", "割合", "士気", "民意"]) h.append(el("th", "", x));
      t.append(h);
      for (const e of sug.exhaustion) {
        const tr = el("tr");
        const frac = e.before > 0 ? e.lost / e.before : 0;
        tr.append(el("td", "", sname(map, e.stateId)), el("td", "", e.side === "winner" ? "勝者側" : "敗者側"), el("td", "", `${fmt(e.lost)}人`), el("td", "", pct(frac)), el("td", e.moraleDelta >= 0 ? "cur-chg up" : "cur-chg down", `${e.moraleDelta >= 0 ? "+" : ""}${e.moraleDelta}`), el("td", (e.supportDelta ?? 0) >= 0 ? "cur-chg up" : "cur-chg down", `${(e.supportDelta ?? 0) >= 0 ? "+" : ""}${e.supportDelta ?? 0}`));
        t.append(tr);
      }
      left.append(el("h4", "", "各国の消耗"), t);
    }
    const kinds = [["standard", "通常の講和"], ["white", "白紙和平"], ["vassal", "従属化"], ["annex", "全面降伏（併合）"]];
    const kindSel = document.createElement("select");
    for (const [k, label] of kinds) {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = label;
      o.selected = draft.kind === k;
      kindSel.append(o);
    }
    kindSel.addEventListener("change", () => {
      draft.kind = kindSel.value;
      renderTreaty();
    });
    const v = draft.venue;
    const roleLabel = v?.role === "winner" ? "戦勝国" : v?.role === "mediator" ? "仲介国（中立）" : "交戦国";
    const again = el("button", "ent-btn", "別の地で");
    again.type = "button";
    again.addEventListener("click", () => {
      const nv = simActions.peaceVenue(war.id);
      if (nv) {
        draft.venue = nv;
        draft.treatyName = nv.treatyName;
        renderTreaty();
      }
    });
    const tn = document.createElement("input");
    tn.value = draft.treatyName;
    tn.addEventListener("input", () => {
      draft.treatyName = tn.value;
    });
    left.append(
      el("h4", "", "講和の種類"),
      kindSel,
      el("p", "hint", { standard: "割譲と賠償を決めます（自動案が入っています）。", white: "どちらも何も受け取らず、戦争を終えます。", vassal: "敗者を併合せず、従属させます。", annex: "敗者の全土を併合します（戦争スコア70以上）。" }[draft.kind]),
      el("h4", "", "条約の名前と講和地"),
      tn,
      el("p", "hint", v ? `講和地：${v.place}（${sname(map, v.stateId)}・${roleLabel}）` : "講和地を決められませんでした（都市がありません）"),
      again
    );
    const detail = el("div", "treaty-detail");
    left.append(detail);
    const meter = el("div", "wo-impact"), impact = el("div", "wo-impact");
    const annexTargets = () => losers.map((L) => ({ fromStateId: L, toStateId: winners[0] }));
    const vassalTargets = () => losers.map((L) => ({ fromStateId: L, toStateId: winners[0], kind: draft.vkind }));
    function ensureCessions() {
      if (draft.cessions) return;
      const t = simActions.suggestTerms(war.id, { size: draft.size });
      draft.cessions = (t?.cessions ?? []).map((c) => ({ ...c, key: `${c.fromStateId}:${c.regionCells[0]}` }));
      draft.autoRepar = t?.reparations ?? [];
    }
    function ensureRepar() {
      if (draft.reparations) return;
      draft.reparations = {};
      for (const r of draft.autoRepar ?? simActions.suggestTerms(war.id)?.reparations ?? []) draft.reparations[`${r.fromStateId}-${r.toStateId}`] = r.amount;
    }
    const currentTerms = () => ({
      kind: draft.kind,
      cessions: draft.kind === "standard" ? (draft.cessions ?? []).filter((c) => c.on).map((c) => ({ cells: c.regionCells, fromStateId: c.fromStateId, toStateId: c.toStateId, name: c.name, burgs: c.burgNames })) : [],
      reparations: draft.kind === "standard" ? Object.entries(draft.reparations ?? {}).filter(([, a]) => a > 0).map(([k, amount]) => {
        const [f, t] = k.split("-").map(Number);
        return { fromStateId: f, toStateId: t, amount };
      }) : [],
      annex: draft.kind === "annex" ? annexTargets() : [],
      vassalize: draft.kind === "vassal" ? vassalTargets() : []
    });
    function syncHighlight() {
      const hl = getHighlight();
      if (!hl) return;
      if (draft.kind !== "standard" || !draft.cessions) {
        hl.clearCells();
        return;
      }
      const groups = draft.cessions.filter((c) => c.on || c.key === draft.hover).map((c) => ({ cells: c.regionCells, strong: c.key === draft.hover }));
      groups.length ? hl.showCells(groups) : hl.clearCells();
    }
    function renderMeter() {
      meter.replaceChildren();
      const terms = currentTerms();
      const rows = simActions.treatyBudget(war.id, terms);
      const t = el("table", "win-table");
      const h = el("tr");
      for (const x of ["勝者", "取り分", "費用 / 上限"]) h.append(el("th", "", x));
      t.append(h);
      let overAny = false;
      for (const r of rows) {
        const over = r.spent > r.budget + 0.05;
        overAny || (overAny = over);
        const tr = el("tr");
        tr.append(el("td", "", `${isLeader(r.stateId) ? "★ " : ""}${sname(map, r.stateId)}`), el("td", "", pct(r.share)), el("td", over ? "cur-chg down" : "", `${fmt(r.spent, 1)} / ${fmt(r.budget, 1)}${over ? " ⚠" : ""}`));
        t.append(tr);
      }
      meter.append(el("h4", "", `戦争スコアの使い道（現在 ${simActions.currentWarScore(war)}）`), t);
      signBtn.disabled = overAny;
      signBtn.title = overAny ? "要求が戦争スコアを超えています。要求を減らしてください" : "";
      impact.replaceChildren();
      const lines = [];
      for (const L of losers) {
        const mine = terms.cessions.filter((c) => c.fromStateId === L);
        const r = simActions.estimatePeace(war.id, { loserId: L, cellGroups: mine.map((c) => c.cells), reparations: terms.reparations.filter((x) => x.fromStateId === L).reduce((n, x) => n + x.amount, 0) });
        if (!r) continue;
        lines.push([`${sname(map, L)}から`, `${fmt(r.cells)}セル（領土の ${pct(r.share)}）・人口 約${fmt(r.population, 1)}千人・産業 ${fmt(r.industry, 1)}・都市 ${fmt(r.burgs)}件${r.reparations ? `・賠償 ${fmt(r.reparations, 2)}${r.reparationsShare != null ? `（国の富の ${pct(r.reparationsShare)}）` : ""}` : ""}`]);
      }
      for (const x of terms.reparations) {
        const rate = simActions.exchangeRate(x.fromStateId, x.toStateId);
        lines.push([`${sname(map, x.fromStateId)} → ${sname(map, x.toStateId)}`, `${fmt(x.amount, 2)} ${simActions.getCurrency(x.fromStateId).name} ＝ ${fmt(x.amount * rate, 2)} ${simActions.getCurrency(x.toStateId).name}`]);
      }
      if (lines.length) {
        const tb = el("table", "win-table");
        for (const [k, val] of lines) {
          const tr = el("tr");
          tr.append(el("th", "", k), el("td", "", val));
          tb.append(tr);
        }
        impact.append(el("h4", "", "相手から渡るもの"), tb);
      }
      syncHighlight();
    }
    if (draft.kind === "white") detail.append(el("p", "hint", "要求はありません。"));
    else if (draft.kind === "annex") detail.append(el("p", "hint", `${losers.map((L) => sname(map, L)).join("・")}は降伏し、全土が${sname(map, winners[0])}に併合されます。`));
    else if (draft.kind === "vassal") {
      const sv2 = document.createElement("select");
      for (const k of VASSAL_KINDS) {
        const o = document.createElement("option");
        o.value = k.key;
        o.textContent = `${k.label}（貢納 ${Math.round(k.tribute * 100)}%/年）`;
        o.selected = draft.vkind === k.key;
        sv2.append(o);
      }
      sv2.addEventListener("change", () => {
        draft.vkind = sv2.value;
        renderTreaty();
      });
      detail.append(el("h4", "", "従属の形"), sv2, el("p", "hint", `${losers.map((L) => sname(map, L)).join("・")}は併合されず、${sname(map, winners[0])}に従属します。${VASSAL_BY_KEY[draft.vkind].desc}`));
    } else {
      ensureCessions();
      ensureRepar();
      const sizeSel = document.createElement("select");
      for (const [k, label] of [["s", "小さな区画"], ["m", "中くらいの区画"], ["l", "大きな区画"]]) {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = label;
        o.selected = draft.size === k;
        sizeSel.append(o);
      }
      sizeSel.addEventListener("change", () => {
        draft.size = sizeSel.value;
        draft.cessions = null;
        renderTreaty();
      });
      detail.append(el("h4", "", "割譲する地域（自動案。変更できます）"), sizeSel, el("p", "hint", `消耗に比例した目安: 約${fmt(draft.sug?.cessionCells ?? 0)}セル。行にカーソルを当てると、地図でその区画が赤く光ります。首都は割譲できません。`));
      const cessBox = el("div", "wo-cess");
      if (!draft.cessions.length) cessBox.append(el("p", "muted", "割譲できる区画がありません"));
      for (const c of draft.cessions) {
        const l = el("label", `wo-cess-row${c.on ? " on" : ""}`);
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = c.on;
        cb.addEventListener("change", () => {
          c.on = cb.checked;
          l.classList.toggle("on", c.on);
          renderMeter();
        });
        l.addEventListener("mouseenter", () => {
          draft.hover = c.key;
          syncHighlight();
        });
        l.addEventListener("mouseleave", () => {
          draft.hover = null;
          syncHighlight();
        });
        const info = el("span", "wo-cess-info");
        info.append(el("strong", "", c.name), document.createTextNode(`（${c.cells}セル・${sname(map, c.fromStateId)}）`));
        info.append(el("span", "wo-cess-burgs", c.burgNames?.length ? `都市: ${c.burgNames.join("、")}` : "都市なし"));
        l.append(cb, info);
        if (winners.length > 1) {
          const s2 = document.createElement("select");
          for (const wId of winners) {
            const o = document.createElement("option");
            o.value = wId;
            o.textContent = sname(map, wId);
            o.selected = wId === c.toStateId;
            s2.append(o);
          }
          s2.addEventListener("change", () => {
            c.toStateId = Number(s2.value);
            renderMeter();
          });
          l.append(s2);
        } else l.append(el("span", "wo-arrow", `→ ${sname(map, c.toStateId)}`));
        cessBox.append(l);
      }
      detail.append(cessBox, el("h4", "", "賠償金（消耗から自動で設定。変更できます）"));
      for (const L of losers) for (const W of winners) {
        const key = `${L}-${W}`;
        const row = el("div", "member-picker");
        const amount = document.createElement("input");
        amount.type = "number";
        amount.min = "0";
        amount.value = String(draft.reparations[key] ?? 0);
        amount.addEventListener("input", () => {
          draft.reparations[key] = Number(amount.value) || 0;
          renderMeter();
        });
        row.append(el("span", "", `${sname(map, L)} → ${sname(map, W)}`), amount, el("span", "muted", simActions.getCurrency(L).name));
        detail.append(row);
      }
    }
    const notes = document.createElement("textarea");
    notes.rows = 4;
    notes.value = draft.notes;
    notes.addEventListener("input", () => {
      draft.notes = notes.value;
    });
    left.append(el("h4", "", "その他の条件（自動案。自由に書き換えられます）"), notes);
    right.append(el("h4", "", "この条約の要約"), meter, impact);
    const reset = el("button", "", "自動案に戻す");
    reset.type = "button";
    reset.title = "入力した内容を捨てて、勝敗・消耗から作った自動案に戻します";
    reset.addEventListener("click", () => {
      draft = null;
      renderTreaty();
    });
    const signBtn = el("button", "primary war-go", "📜 この内容で講和条約を締結する");
    signBtn.type = "button";
    signBtn.addEventListener("click", () => {
      const ok = simActions.signTreaty(war.id, { ...currentTerms(), treatyName: draft.treatyName.trim(), notes: draft.notes.trim(), venue: draft.venue ? { place: draft.venue.place, stateId: draft.venue.stateId } : null });
      if (ok) {
        clearHighlight();
        draft = null;
        renderTreaty();
      }
    });
    right.append(signBtn, reset);
    grid.append(left, right);
    renderMeter();
    return grid;
  }
  const isLeader = (id) => simActions.listAlliances().some((a) => !a.dissolvedAt && a.members.includes(id) && simActions.allianceLeader(a) === id);
  const currencyBody = el("div", "cur-body");
  let baseId = null, convFrom = null, convTo = null, convAmt = 100;
  function spark(hist, up) {
    const W = 90, H = 26;
    if (!hist || hist.length < 2) return el("span", "muted", "—");
    const mn = Math.min(...hist), mx = Math.max(...hist), span = mx - mn || 1;
    const pts = hist.map((v, i) => `${(i / (hist.length - 1) * W).toFixed(1)},${(H - 2 - (v - mn) / span * (H - 4)).toFixed(1)}`).join(" ");
    const NS2 = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS2, "svg");
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const pl = document.createElementNS(NS2, "polyline");
    pl.setAttribute("points", pts);
    pl.setAttribute("fill", "none");
    pl.setAttribute("stroke-width", "1.6");
    pl.setAttribute("stroke", up ? "#4fb477" : "#d9594c");
    svg.append(pl);
    return svg;
  }
  function renderCurrency() {
    currencyBody.replaceChildren();
    const map = store.getState().map;
    if (!map) {
      currencyBody.append(el("p", "muted", "地図を開いてください"));
      return;
    }
    const states = map.pack.states.filter(isLive);
    if (!states.length) {
      currencyBody.append(el("p", "muted", "国家がありません"));
      return;
    }
    if (!states.some((s) => s.i === baseId)) baseId = states[0].i;
    const base = simActions.getCurrency(baseId);
    const top = el("div", "cur-top");
    const baseSel = document.createElement("select");
    for (const s of states) {
      const o = document.createElement("option");
      o.value = s.i;
      o.textContent = `${simActions.getCurrency(s.i).name}（${sname(map, s.i)}）`;
      o.selected = s.i === baseId;
      baseSel.append(o);
    }
    baseSel.addEventListener("change", () => {
      baseId = Number(baseSel.value);
      renderCurrency();
    });
    top.append(el("span", "", "基準通貨"), baseSel);
    currencyBody.append(top, el("p", "hint", "レートの値はシステムが経済力から決め、年ごとに変動します。ここで選べるのは、変動相場か固定相場かだけです。"));
    const rows = states.map((s) => {
      const c = simActions.getCurrency(s.i);
      const vsBase = simActions.exchangeRate(s.i, baseId);
      const histBase = (c.hist ?? [c.rate]).map((r) => r / Math.max(1e-9, base.rate));
      const prev = histBase.length > 1 ? histBase[histBase.length - 2] : vsBase;
      return { s, c, vsBase, change: prev ? (vsBase - prev) / prev : 0, hist: histBase };
    }).sort((a, b) => b.vsBase - a.vsBase);
    const t = el("table", "win-table cur-board");
    const h = el("tr");
    for (const x of ["コード", "通貨", "国", `1通貨 = ${base.name}`, "前年比", "推移", "相場制", "固定の基準国"]) h.append(el("th", "", x));
    t.append(h);
    for (const { s, c, vsBase, change, hist } of rows) {
      const tr = el("tr");
      const code = el("td", "cur-code", c.code ?? String(s.name).slice(0, 3).toUpperCase());
      const nameIn = document.createElement("input");
      nameIn.value = c.name;
      nameIn.size = 10;
      nameIn.addEventListener("change", () => simActions.setCurrency(s.i, { name: nameIn.value.trim() || c.name }));
      const rate = el("td", "cur-rate", vsBase.toFixed(4));
      const chg = el("td", `cur-chg ${change > 5e-5 ? "up" : change < -5e-5 ? "down" : ""}`, `${change > 5e-5 ? "▲" : change < -5e-5 ? "▼" : "－"} ${(Math.abs(change) * 100).toFixed(2)}%`);
      const sp = el("td");
      sp.append(spark(hist, change >= 0));
      const reg = document.createElement("select");
      for (const [v, l] of [["floating", "変動"], ["pegged", "固定"]]) {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = l;
        o.selected = c.regime === v;
        reg.append(o);
      }
      const peg = document.createElement("select");
      for (const o2 of states.filter((x) => x.i !== s.i)) {
        const o = document.createElement("option");
        o.value = o2.i;
        o.textContent = sname(map, o2.i);
        o.selected = c.pegTo === o2.i;
        peg.append(o);
      }
      peg.disabled = c.regime !== "pegged";
      const apply = () => simActions.setCurrency(s.i, reg.value === "pegged" ? { regime: "pegged", pegTo: Number(peg.value) } : { regime: "floating" });
      reg.addEventListener("change", () => {
        apply();
        renderCurrency();
      });
      peg.addEventListener("change", apply);
      const cell = (n) => {
        const td = el("td");
        td.append(n);
        return td;
      };
      tr.append(code, cell(nameIn), el("td", "", sname(map, s.i)), rate, chg, sp, cell(reg), cell(peg));
      t.append(tr);
    }
    currencyBody.append(t);
    if (!states.some((s) => s.i === convFrom)) convFrom = states[0].i;
    if (!states.some((s) => s.i === convTo)) convTo = (states[1] ?? states[0]).i;
    const conv = el("div", "cur-conv");
    const amt = document.createElement("input");
    amt.type = "number";
    amt.value = String(convAmt);
    amt.min = "0";
    const sel2 = (cur, on) => {
      const s = document.createElement("select");
      for (const st of states) {
        const o = document.createElement("option");
        o.value = st.i;
        o.textContent = simActions.getCurrency(st.i).name;
        o.selected = st.i === cur;
        s.append(o);
      }
      s.addEventListener("change", () => {
        on(Number(s.value));
        renderCurrency();
      });
      return s;
    };
    const out = el("strong", "", `${fmt((Number(amt.value) || 0) * simActions.exchangeRate(convFrom, convTo), 2)} ${simActions.getCurrency(convTo).name}`);
    amt.addEventListener("input", () => {
      convAmt = Number(amt.value) || 0;
      out.textContent = `${fmt(convAmt * simActions.exchangeRate(convFrom, convTo), 2)} ${simActions.getCurrency(convTo).name}`;
    });
    conv.append(el("h4", "", "両替"), amt, sel2(convFrom, (x) => {
      convFrom = x;
    }), el("span", "", "＝"), out, el("span", "", "（"), sel2(convTo, (x) => {
      convTo = x;
    }), el("span", "", "に）"));
    currencyBody.append(conv);
  }
  const safeTreaty = guardRender(treatyBody, () => renderTreaty()), safeCurrency = guardRender(currencyBody, () => renderCurrency());
  store.subscribe((_s, ch) => {
    if (!["replace", "commit", "undo", "redo"].includes(ch.type)) return;
    if (currencyBody.offsetParent) safeCurrency();
    if (treatyBody.offsetParent) safeTreaty();
  });
  return { situation, bars, treatyBody, renderTreaty, clearHighlight, currencyBody, renderCurrency };
}
