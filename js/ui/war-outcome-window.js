// 戦争の結果ウィンドウと、その上に重ねる講和条約ウィンドウ、および通貨・為替ウィンドウ。
//   宣戦布告 → 即判定 → 大きな結果ウィンドウ（陸軍力・制海権・制空権・士気をバーで比較）
//   → その上に講和条約ウィンドウ（割譲する地域・賠償金・条約名・その他の条件）
// どれもサイドバーではなくウィンドウ。DOM を触るのは ui/ だけ、判定などのロジックは core/ にある。
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const pct = (v) => `${Math.round(v * 100)}%`;

export function initWarOutcome({ store, simActions }) {
  const stage = document.getElementById("stage");
  const sname = (map, id) => map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;
  const names = (map, ids) => ids.map((i) => sname(map, i)).join("・");

  // ---- 比較バー ----
  function bar(label, aShare, aText, dText) {
    const row = el("div", "wo-bar-row");
    row.append(el("span", "wo-bar-val a", aText), el("span", "wo-bar-label", label), el("span", "wo-bar-val d", dText));
    const track = el("div", "wo-bar");
    const a = el("div", "wo-bar-a"); a.style.width = pct(aShare);
    const d = el("div", "wo-bar-d"); d.style.width = pct(1 - aShare);
    track.append(a, d);
    const wrap = el("div", "wo-bar-wrap"); wrap.append(row, track);
    return wrap;
  }

  function overlay(cls) {
    const o = el("div", `wo-overlay ${cls}`);
    stage.append(o);
    return o;
  }

  // ---- 結果ウィンドウ ----
  function show(warId) {
    const map = store.getState().map; if (!map) return;
    const war = (map.ext?.data?.wars ?? []).find((w) => w.id === warId); if (!war?.result) return;
    const o = overlay("wo-battle");
    const box = el("div", "wo-box");
    const head = el("div", "wo-head");
    head.append(el("h2", "", war.name));
    const close = el("button", "panel-close", "×"); close.type = "button"; close.setAttribute("aria-label", "閉じる");
    close.addEventListener("click", () => o.remove());
    head.append(close);
    const sides = el("div", "wo-sides");
    sides.append(el("div", "wo-side a", names(map, war.attackers)), el("div", "wo-vs", "VS"), el("div", "wo-side d", names(map, war.defenders)));
    const r = war.result, A = r.aStrength, D = r.dStrength, c = r.compare;
    const n = (v) => Math.round(v).toLocaleString();
    const bars = el("div", "wo-bars");
    bars.append(
      bar("陸軍力", c.land, n(A.land), n(D.land)),
      bar("制海権", c.sea, n(A.sea), n(D.sea)),
      bar("制空権", c.air, n(A.air), n(D.air)),
      bar("士気", c.morale, Math.round(A.morale), Math.round(D.morale)),
    );
    const verdict = el("div", `wo-verdict ${r.winner}`,
      r.winner === "attacker" ? `攻撃側（${names(map, war.attackers)}）の勝利` : r.winner === "defender" ? `防衛側（${names(map, war.defenders)}）の勝利` : "決着つかず（膠着）");
    box.append(head, sides, bars, verdict);
    o.append(box);
    // 判定が出たら、重ねて講和条約ウィンドウを開く
    setTimeout(() => peace(warId, o), 600);
  }

  // ---- 講和条約ウィンドウ ----
  function peace(warId, below) {
    const map = store.getState().map; if (!map) return;
    const war = (map.ext?.data?.wars ?? []).find((w) => w.id === warId); if (!war || war.endedAt) return;
    const r = war.result ?? { winner: "stalemate" };
    const o = overlay("wo-peace");
    const box = el("div", "wo-box");
    const head = el("div", "wo-head");
    head.append(el("h2", "", "講和条約"));
    const close = el("button", "panel-close", "×"); close.type = "button";
    close.addEventListener("click", () => o.remove());
    head.append(close);
    box.append(head);

    const winnersIds = r.winner === "defender" ? war.defenders : war.attackers;
    const losersIds = r.winner === "defender" ? war.attackers : war.defenders;

    // 条約名
    const nameIn = document.createElement("input"); nameIn.value = `${war.name}の講和条約`;
    box.append(el("label", "field-label", "条約の名前"), nameIn);

    // 受益国（割譲を受ける国・賠償金を受け取る国）
    const toSel = document.createElement("select");
    for (const id of winnersIds) { const op = document.createElement("option"); op.value = id; op.textContent = sname(map, id); toSel.append(op); }
    box.append(el("label", "field-label", "割譲・賠償を受ける国"), toSel);

    // 割譲候補（首都を含む地域は候補に出ない。敗者側の国ごとに前線から算出）
    const cessBox = el("div", "wo-cess");
    const cands = [];
    function loadCands() {
      cands.length = 0; cessBox.replaceChildren();
      const to = Number(toSel.value);
      for (const lid of losersIds) for (const cd of simActions.suggestCessions(to, lid)) cands.push({ ...cd, from: lid, checked: false });
      if (!cands.length) cessBox.append(el("p", "muted", "割譲できる地域はありません（首都は割譲できません）"));
      cands.forEach((cd) => {
        const l = el("label", "wo-cess-row"); const cb = document.createElement("input"); cb.type = "checkbox";
        cb.addEventListener("change", () => { cd.checked = cb.checked; });
        l.append(cb, document.createTextNode(`${cd.name}（${cd.cells}セル・${sname(map, cd.from)}）`)); cessBox.append(l);
      });
    }
    toSel.addEventListener("change", () => { loadCands(); updateMoney(); });
    box.append(el("h4", "", "割譲する地域"), cessBox);

    // 賠償金：支払国の通貨で指定し、受取国の通貨への換算額を見せる
    const payerId = losersIds[0];
    const money = el("div", "wo-money");
    const amount = document.createElement("input"); amount.type = "number"; amount.min = "0"; amount.value = "0";
    const rateLine = el("p", "hint", "");
    function updateMoney() {
      const to = Number(toSel.value);
      const pc = simActions.getCurrency(payerId), tc = simActions.getCurrency(to);
      const rate = simActions.exchangeRate(payerId, to);
      const v = Number(amount.value) || 0;
      rateLine.textContent = `為替: 1 ${pc.name} = ${rate.toFixed(4)} ${tc.name}（${pc.regime === "pegged" ? "固定" : "変動"}相場）／ 受取額 ${(v * rate).toFixed(2)} ${tc.name}`;
    }
    amount.addEventListener("input", updateMoney);
    money.append(el("label", "field-label", `賠償金（${sname(map, payerId)}が${simActions.getCurrency(payerId).name}で支払う）`), amount, rateLine);
    box.append(el("h4", "", "賠償金"), money);

    // その他の条件
    const notes = document.createElement("textarea"); notes.rows = 3; notes.placeholder = "その他の条件（非武装化・通商・駐留など自由記述）";
    box.append(el("h4", "", "その他の条件"), notes);

    const sign = el("button", "primary", "締結する"); sign.type = "button";
    sign.addEventListener("click", () => {
      const picked = cands.filter((x) => x.checked);
      simActions.signPeace(warId, {
        toStateId: Number(toSel.value),
        provinceIds: picked.filter((x) => x.type === "province").map((x) => x.provinceId),
        regionCells: picked.filter((x) => x.type === "region").map((x) => x.regionCells),
        reparations: Number(amount.value) || 0, treatyName: nameIn.value.trim(), notes: notes.value.trim(),
      });
      // 失敗したときは戦争が終結していないので、ウィンドウは閉じずエラー欄を見られるようにする
      const now = (store.getState().map.ext?.data?.wars ?? []).find((w) => w.id === warId);
      if (now?.endedAt) { o.remove(); below?.remove(); }
    });
    box.append(sign);
    o.append(box);
    loadCands(); updateMoney();
  }

  // ---- 通貨・為替ウィンドウ（ウィンドウ管理 wins.register の body として使う） ----
  const currencyBody = el("div", "cur-body");
  function renderCurrency() {
    currencyBody.replaceChildren();
    const map = store.getState().map; if (!map) { currencyBody.append(el("p", "muted", "地図を開いてください")); return; }
    const states = map.pack.states.filter(isLive);
    currencyBody.append(el("p", "hint", "各国の通貨名と、固定相場か変動相場かを設定できます。レートの値はシステムが経済力から決め、年ごとに変動します。"));
    const t = el("table", "win-table");
    const h = el("tr"); for (const x of ["国家", "通貨名", "相場制", "固定の基準国", "現在の価値"]) h.append(el("th", "", x)); t.append(h);
    for (const s of states) {
      const c = simActions.getCurrency(s.i);
      const tr = el("tr");
      const nameIn = document.createElement("input"); nameIn.value = c.name;
      nameIn.addEventListener("change", () => simActions.setCurrency(s.i, { name: nameIn.value.trim() || c.name }));
      const reg = document.createElement("select");
      for (const [v, l] of [["floating", "変動"], ["pegged", "固定"]]) { const o = document.createElement("option"); o.value = v; o.textContent = l; o.selected = c.regime === v; reg.append(o); }
      const peg = document.createElement("select");
      for (const o2 of states.filter((x) => x.i !== s.i)) { const o = document.createElement("option"); o.value = o2.i; o.textContent = sname(map, o2.i); o.selected = c.pegTo === o2.i; peg.append(o); }
      peg.disabled = c.regime !== "pegged";
      const apply = () => simActions.setCurrency(s.i, reg.value === "pegged" ? { regime: "pegged", pegTo: Number(peg.value) } : { regime: "floating" });
      reg.addEventListener("change", () => { apply(); renderCurrency(); });
      peg.addEventListener("change", apply);
      const cell = (n) => { const td = el("td"); td.append(n); return td; };
      tr.append(el("td", "", sname(map, s.i)), cell(nameIn), cell(reg), cell(peg), el("td", "", c.rate.toFixed(4)));
      t.append(tr);
    }
    currencyBody.append(t);
  }
  store.subscribe((_s, ch) => { if (["replace", "commit", "undo", "redo"].includes(ch.type) && currencyBody.offsetParent) renderCurrency(); });

  return { show, peace, currencyBody, renderCurrency };
}
