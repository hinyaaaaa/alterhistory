// 戦争の戦況バー（戦争ウィンドウ用）、講和条約ウィンドウ、通貨・為替ウィンドウ。
//   ・戦況（陸軍力・制海権・制空権・士気）のバーは「戦争」ウィンドウの中に表示する
//   ・講和条約は戦争ウィンドウから切り離し、「講和条約」ウィンドウで決める
//   ・通貨・為替は証券の相場表のように、レート・前年比・推移グラフで見せる
// どれも設定メニューから開くウィンドウ。判定や計算は core/ にあり、ここは表示だけ。
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
  /** 戦争1つの戦況（両陣営・比較バー・結果・終戦日・参戦した同盟国）をまとめて返す */
  function situation(map, war) {
    const box = el("div", "wo-situation");
    const sides = el("div", "wo-sides");
    sides.append(el("div", "wo-side a", names(map, war.attackers)), el("div", "wo-vs", "VS"), el("div", "wo-side d", names(map, war.defenders)));
    box.append(sides);
    const r = war.result;
    if (!r) { box.append(el("p", "muted", "戦況の記録がありません（旧データの戦争です）")); return box; }
    const A = r.aStrength, D = r.dStrength, c = r.compare, n = (v) => fmt(v);
    const bars = el("div", "wo-bars");
    bars.append(bar("陸軍力", c.land, n(A.land), n(D.land)), bar("制海権", c.sea, n(A.sea), n(D.sea)), bar("制空権", c.air, n(A.air), n(D.air)), bar("士気", c.morale, fmt(A.morale), fmt(D.morale)));
    box.append(bars);
    box.append(el("div", `wo-verdict ${r.winner}`, r.winner === "attacker" ? `攻撃側の勝利（${names(map, war.attackers)}）` : r.winner === "defender" ? `防衛側の勝利（${names(map, war.defenders)}）` : "決着つかず（膠着）"));
    const dates = `開戦 ${fmtDate(war.startedAt)}　${war.endedAt ? `終戦 ${fmtDate(war.endedAt)}` : `終戦予定 ${fmtDate(war.endsAt)}（約${war.durationMonths ?? "?"}ヶ月）`}`;
    box.append(el("p", "hint", dates));
    if (war.joinedAllies?.length) box.append(el("p", "hint", `同盟の拘束により参戦: ${war.joinedAllies.map((j) => `${sname(map, j.id)}（${j.alliance}・${j.side === "attacker" ? "攻撃側" : "防衛側"}）`).join("、")}`));
    return box;
  }

  // ================= 講和条約ウィンドウ =================
  const treatyBody = el("div", "treaty-body");
  let sel = null;                 // 選んでいる戦争
  let draft = null;               // { warId, venue, treatyName, toStateId, fromStateId, picked:Set, reparations, notes }
  const cellsOfProvince = (map, pid) => { const out = []; const c = map.pack.cells.province; for (let i = 0; i < c.length; i++) if (c[i] === pid) out.push(i); return out; };

  function renderTreaty() {
    treatyBody.replaceChildren();
    const map = store.getState().map;
    if (!map) { treatyBody.append(el("p", "muted", "地図を開いてください")); return; }
    const pending = simActions.warsAwaitingTreaty();
    if (!pending.length) { treatyBody.append(el("p", "muted", "講和待ちの戦争はありません。戦争ウィンドウで宣戦布告すると、ここで講和条約を決められます。")); sel = null; draft = null; return; }
    if (!pending.some((w) => w.id === sel)) { sel = pending[0].id; draft = null; }
    const split = el("div", "win-split"), list = el("div", "win-list");
    for (const w of pending) {
      const b = el("button", w.id === sel ? "active" : "", `📜 ${w.name}`); b.type = "button";
      b.addEventListener("click", () => { sel = w.id; draft = null; renderTreaty(); });
      list.append(b);
    }
    const detail = el("div", "win-detail");
    detail.append(treatyForm(map, pending.find((w) => w.id === sel)));
    split.append(list, detail); treatyBody.append(split);
  }

  function treatyForm(map, war) {
    const { winners, losers, stalemate } = simActions.peaceSides(war);
    if (!draft || draft.warId !== war.id) {
      const venue = simActions.peaceVenue(war.id);
      draft = { warId: war.id, venue, treatyName: venue?.treatyName ?? `${war.name}の講和条約`, toStateId: winners[0], fromStateId: losers[0], picked: new Set(), reparations: 0, notes: "" };
    }
    const wrap = el("div", "treaty-form");

    // 戦争名（変更できる）
    const wn = document.createElement("input"); wn.value = war.name;
    wn.addEventListener("change", () => { simActions.renameWar(war.id, wn.value); });
    wrap.append(el("label", "field-label", "戦争の名前"), wn);
    wrap.append(situation(map, war));

    // 講和地と条約名
    const v = draft.venue;
    const venueLine = el("p", "hint", v ? `講和地：${v.place}（${sname(map, v.stateId)}${v.neutral ? "・中立国" : "・交戦国"}）` : "講和地を決められませんでした（都市がありません）");
    const again = el("button", "", "別の地で開く"); again.type = "button";
    again.addEventListener("click", () => { const nv = simActions.peaceVenue(war.id); if (nv) { draft.venue = nv; draft.treatyName = nv.treatyName; renderTreaty(); } });
    const tn = document.createElement("input"); tn.value = draft.treatyName; tn.addEventListener("input", () => { draft.treatyName = tn.value; });
    wrap.append(el("label", "field-label", "講和条約の名前（講和地の地名から）"), tn, venueLine, again);

    // 受け取る国・支払う国
    const mk = (ids, cur, on) => { const s = document.createElement("select"); for (const id of ids) { const o = document.createElement("option"); o.value = id; o.textContent = sname(map, id); o.selected = id === cur; s.append(o); } s.addEventListener("change", () => { on(Number(s.value)); renderTreaty(); }); return s; };
    const recvIds = stalemate ? [...war.attackers, ...war.defenders] : winners, payIds = stalemate ? [...war.attackers, ...war.defenders].filter((x) => x !== draft.toStateId) : losers;
    if (!payIds.includes(draft.fromStateId)) draft.fromStateId = payIds[0];
    const row = el("div", "member-picker");
    row.append(el("span", "", "受け取る国"), mk(recvIds, draft.toStateId, (x) => { draft.toStateId = x; draft.picked.clear(); }), el("span", "", "支払う国"), mk(payIds, draft.fromStateId, (x) => { draft.fromStateId = x; draft.picked.clear(); }));
    wrap.append(row);

    // 割譲する地域（首都を含む地域は候補に出ない）
    const cands = simActions.suggestCessions(draft.toStateId, draft.fromStateId);
    wrap.append(el("h4", "", "割譲する地域"));
    const cessBox = el("div", "wo-cess");
    if (!cands.length) cessBox.append(el("p", "muted", "割譲できる地域はありません（首都は割譲できません）"));
    const keyOf = (cd) => (cd.type === "province" ? `p${cd.provinceId}` : `r${cd.regionCells[0]}`);
    const groupsOf = (cd) => (cd.type === "province" ? cellsOfProvince(map, cd.provinceId) : cd.regionCells);
    for (const cd of cands) {
      const l = el("label", "wo-cess-row"); const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = draft.picked.has(keyOf(cd));
      cb.addEventListener("change", () => { if (cb.checked) draft.picked.add(keyOf(cd)); else draft.picked.delete(keyOf(cd)); renderImpact(); });
      l.append(cb, document.createTextNode(`${cd.name}（${cd.cells}セル）`)); cessBox.append(l);
    }
    wrap.append(cessBox);

    // 賠償金（支払国の通貨）
    const pc = simActions.getCurrency(draft.fromStateId), rc = simActions.getCurrency(draft.toStateId);
    const amount = document.createElement("input"); amount.type = "number"; amount.min = "0"; amount.value = String(draft.reparations);
    amount.addEventListener("input", () => { draft.reparations = Number(amount.value) || 0; renderImpact(); });
    wrap.append(el("h4", "", "賠償金"), el("label", "field-label", `${sname(map, draft.fromStateId)}が ${pc.name} で支払う額`), amount);

    // 渡る量の計算（割譲と賠償）
    const impact = el("div", "wo-impact");
    function renderImpact() {
      impact.replaceChildren();
      const picked = cands.filter((cd) => draft.picked.has(keyOf(cd)));
      const groups = picked.map(groupsOf);
      const r = simActions.estimatePeace(war.id, { loserId: draft.fromStateId, cellGroups: groups, reparations: draft.reparations });
      if (!r) return;
      const rate = simActions.exchangeRate(draft.fromStateId, draft.toStateId);
      const lines = [
        ["割譲される領土", `${fmt(r.cells)}セル（${sname(map, draft.fromStateId)}の領土の ${pct(r.share)}）`],
        ["移る人口の目安", `約 ${fmt(r.population, 1)} 千人`],
        ["移る産業力の目安", fmt(r.industry, 1)],
        ["移る都市", `${fmt(r.burgs)} 件`],
        ["賠償金（支払額）", `${fmt(draft.reparations, 2)} ${pc.name}${r.reparationsShare != null ? `（支払国の国庫の ${pct(r.reparationsShare)}）` : ""}`],
        ["賠償金（受取額）", `${fmt(draft.reparations * rate, 2)} ${rc.name}　為替 1 ${pc.name} = ${rate.toFixed(4)} ${rc.name}`],
      ];
      const t = el("table", "win-table");
      for (const [k, val] of lines) { const tr = el("tr"); tr.append(el("th", "", k), el("td", "", val)); t.append(tr); }
      impact.append(el("h4", "", "この条約で相手から渡るもの"), t);
    }
    wrap.append(impact);
    renderImpact();

    const notes = document.createElement("textarea"); notes.rows = 3; notes.placeholder = "その他の条件（非武装化・通商・駐留など自由記述）"; notes.value = draft.notes;
    notes.addEventListener("input", () => { draft.notes = notes.value; });
    wrap.append(el("h4", "", "その他の条件"), notes);

    const sign = el("button", "primary", "講和条約を締結する"); sign.type = "button";
    sign.addEventListener("click", () => {
      const picked = cands.filter((cd) => draft.picked.has(keyOf(cd)));
      simActions.signPeace(war.id, {
        toStateId: draft.toStateId, fromStateId: draft.fromStateId,
        provinceIds: picked.filter((x) => x.type === "province").map((x) => x.provinceId),
        regionCells: picked.filter((x) => x.type === "region").map((x) => x.regionCells),
        reparations: draft.reparations, treatyName: draft.treatyName.trim(), notes: draft.notes.trim(),
        venue: draft.venue ? { place: draft.venue.place, stateId: draft.venue.stateId } : null,
      });
      draft = null; renderTreaty();
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
  store.subscribe((_s, ch) => {
    if (!["replace", "commit", "undo", "redo"].includes(ch.type)) return;
    if (currencyBody.offsetParent) renderCurrency();
    if (treatyBody.offsetParent) renderTreaty();
  });

  return { situation, treatyBody, renderTreaty, currencyBody, renderCurrency };
}
