// 核作戦ウィンドウ：立案 → 実行の2段階。通常の戦争では核は使われず、ここで明示的に行う。
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

export function initNuclearWindow({ store, simActions, wins }) {
  const body = el("div", "nuc-body");
  let atk = null, tgt = null, heads = 1;
  const nm = (map, id) => map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;

  function render() {
    body.replaceChildren();
    const map = store.getState().map; if (!map) { body.append(el("p", "muted", "地図を開いてください")); return; }
    const states = map.pack.states.filter(isLive);
    body.append(el("p", "hint", "核兵器は通常の戦争では使われません。交戦中の相手に対して作戦を立案し、確認したうえで実行します。実行すると標的国の人口・産業・士気に壊滅的な打撃を与えます（元に戻せます）。"));
    const holders = states.filter((s) => simActions.nuclearStock(s.i) > 0);
    if (!holders.length) body.append(el("p", "muted", "核を保有する国がありません（軍事ウィンドウで、技術水準9以上の国の部隊に核を配備できます）"));
    else {
      if (!holders.some((s) => s.i === atk)) atk = holders[0].i;
      const targets = states.filter((s) => s.i !== atk);
      if (!targets.some((s) => s.i === tgt)) tgt = targets[0]?.i ?? null;
      const mk = (list, cur, on) => { const s = document.createElement("select"); for (const x of list) { const o = document.createElement("option"); o.value = x.i; o.textContent = nm(map, x.i); o.selected = x.i === cur; s.append(o); } s.addEventListener("change", () => { on(Number(s.value)); render(); }); return s; };
      const form = el("div", "member-picker");
      const n = document.createElement("input"); n.type = "number"; n.min = "1"; n.value = String(heads); n.addEventListener("input", () => { heads = Math.max(1, Math.floor(Number(n.value) || 1)); });
      form.append(el("span", "", "使う国"), mk(holders, atk, (x) => { atk = x; }), el("span", "", `（保有 ${simActions.nuclearStock(atk)} 発）　標的の国`), mk(targets, tgt, (x) => { tgt = x; }), el("span", "", "発数"), n);
      const go = el("button", "primary", "作戦を立案する"); go.type = "button";
      go.addEventListener("click", () => { simActions.draftNuclearOp(atk, tgt, heads); });
      body.append(form, go);
    }
    body.append(el("h4", "", "作戦の一覧"));
    const ops = simActions.nuclearOps().slice().reverse();
    if (!ops.length) body.append(el("p", "muted", "立案された作戦はありません"));
    for (const o of ops) {
      const row = el("div", "ent-row");
      row.append(el("span", "ent-main", `${o.status === "executed" ? "☢ 実行済み" : "📝 立案中"}　${o.name}　${nm(map, o.attackerId)} → ${nm(map, o.targetId)}　${o.warheads}発`));
      if (o.status === "planned") {
        const run = el("button", "danger", "実行する"); run.type = "button";
        run.addEventListener("click", () => { if (window.confirm(`「${o.name}」を実行します。${nm(map, o.targetId)}は壊滅的な被害を受けます。よろしいですか？（元に戻せます）`)) simActions.executeNuclearOp(o.id); });
        const cancel = el("button", "ent-btn", "取り消し"); cancel.type = "button"; cancel.addEventListener("click", () => simActions.cancelNuclearOp(o.id));
        row.append(run, cancel);
      } else if (o.result) row.append(el("span", "ent-meta", `人口 −${o.result.populationLoss.toLocaleString()}千人 / 産業 −${Math.round(o.result.industryLossShare * 100)}%`));
      body.append(row);
    }
  }
  wins.register("nuclear", { title: "☢ 核作戦", width: 720, body, onOpen: render });
  store.subscribe((_s, ch) => { if (["replace", "commit", "undo", "redo"].includes(ch.type) && wins.isOpen("nuclear")) render(); });
}
