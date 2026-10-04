// 核作戦ウィンドウ：立案 → 実行の2段階。通常の戦争では核は使われず、ここで明示的に行う。
import { guardRender } from "./safe-render.js";
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
    body.append(el("p", "hint", "核兵器は通常の戦争では使われません。核を保有していれば、どの国に対しても作戦を立案し、確認したうえで実行できます（戦争中でなくても可）。精度と威力は使う国の技術水準で決まり、標的国の人口・産業・軍隊・士気に打撃を与えます。士気と軍隊は戦争の判定にそのまま響き、まだ講和していない戦争は判定し直されます。元に戻せます。"));
    const holders = states.filter((s) => simActions.nuclearStock(s.i) > 0);
    if (!holders.length) body.append(el("p", "muted", "核を保有する国がありません（軍事ウィンドウで、部隊の兵力に核を設定できます）"));
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
      const fx = simActions.strikeEstimate(atk, heads);
      const est = el("p", "hint", `この国の技術水準での性能（${heads}発）: 精度 ${Math.round(fx.accuracy * 100)}% ／ 標的国の人口 −${Math.round(fx.popLossShare * 100)}% ・産業 −${Math.round(fx.industryLossShare * 100)}% ・軍隊 −${Math.round(fx.troopLossShare * 100)}% ・士気 −${fx.moraleDropTotal}`);
      body.append(form, est, go);
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
  const safe = guardRender(body, () => render());
  store.subscribe((_s, ch) => { if (["replace", "commit", "undo", "redo"].includes(ch.type) && wins.isOpen("nuclear")) safe(); });
}
