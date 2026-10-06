// 隠密作戦ウィンドウ。
// ※ このファイルはリポジトリに入っていなかったため、ビルド済みの dist/app.js から復元したものです（動作は同じ。コメントは失われています）。
import { guardRender } from "./safe-render.js";

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const pct = (v) => `${Math.round(v * 100)}%`;
export function initCovertWindow({ store, simActions, wins }) {
  const body = el("div", "covert-body");
  let atk = null, tgt = null, kind = "command";
  const nm = (map, id) => map.pack.states[id]?.fullName ?? map.pack.states[id]?.name ?? `#${id}`;
  function render() {
    body.replaceChildren();
    const map = store.getState().map;
    if (!map) {
      body.append(el("p", "muted", "地図を開いてください"));
      return;
    }
    const states = map.pack.states.filter(isLive);
    if (states.length < 2) {
      body.append(el("p", "muted", "国家が2つ以上必要です"));
      return;
    }
    if (!states.some((s) => s.i === atk)) atk = states[0].i;
    if (!states.some((s) => s.i === tgt && s.i !== atk)) tgt = states.find((s) => s.i !== atk).i;
    body.append(el("p", "hint", "宣戦布告なしに、相手の国力を静かに削ります。成功率と威力は、双方の技術水準の差で決まります。発覚しても、攻撃元が特定されるとは限りません（約3割は別の国の仕業と誤認されます）。戦争中の相手に使えば、戦況にも響きます。"));
    const mk = (cur, ban, on) => {
      const s = document.createElement("select");
      for (const x of states) {
        if (x.i === ban) continue;
        const o = document.createElement("option");
        o.value = x.i;
        o.textContent = nm(map, x.i);
        o.selected = x.i === cur;
        s.append(o);
      }
      s.addEventListener("change", () => {
        on(Number(s.value));
        render();
      });
      return s;
    };
    const form = el("div", "member-picker");
    form.append(el("span", "", "実行する国"), mk(atk, null, (x) => {
      atk = x;
    }), el("span", "", "標的の国"), mk(tgt, atk, (x) => {
      tgt = x;
    }));
    body.append(form);
    const kinds = el("div", "war-type-list");
    for (const k of simActions.covertKinds()) {
      const o = simActions.covertOdds(atk, tgt, k.key);
      const l = el("label", `doctrine-card${kind === k.key ? " on" : ""}`);
      const rb = document.createElement("input");
      rb.type = "radio";
      rb.name = "covert-kind";
      rb.checked = kind === k.key;
      rb.addEventListener("change", () => {
        kind = k.key;
        render();
      });
      const b = el("div", "doctrine-body");
      b.append(el("strong", "", `${k.icon} ${k.label}`), el("p", "hint", k.desc), el("p", "hint", `成功率 ${pct(o.success)} ／ 発覚率 ${pct(o.detect)} ／ 威力 ×${o.power.toFixed(2)}`));
      l.append(rb, b);
      kinds.append(l);
    }
    body.append(kinds);
    const go = el("button", "primary", "🕶 作戦を実行する");
    go.type = "button";
    go.addEventListener("click", () => {
      const op = simActions.runCovertOp(atk, tgt, kind);
      if (!op) return;
      render();
    });
    body.append(go, el("h4", "", "作戦の記録"));
    const ops = simActions.covertOps().slice().reverse();
    if (!ops.length) body.append(el("p", "muted", "まだ作戦はありません"));
    for (const o of ops) {
      const row = el("div", `covert-row ${o.success ? "ok" : "ng"}`);
      row.append(el("span", "ev-tag", o.success ? "成功" : "失敗"), document.createTextNode(`${o.date ? `${o.date.year}年${o.date.month}月　` : ""}${o.text}`));
      const fx = o.effects ?? {}, bits = [];
      if (fx.moraleDelta) bits.push(`士気 ${fx.moraleDelta}`);
      if (fx.troopLossShare) bits.push(`兵力 −${(fx.troopLossShare * 100).toFixed(1)}%`);
      if (fx.industryLossShare) bits.push(`産業 −${(fx.industryLossShare * 100).toFixed(1)}%`);
      if (fx.treasuryLoss) bits.push(`国庫 −${fx.treasuryLoss}`);
      if (fx.supportDelta) bits.push(`民意 ${fx.supportDelta}`);
      if (bits.length) row.append(el("span", "ent-meta", `　（${bits.join("・")}）`));
      body.append(row);
    }
  }
  wins.register("covert", { title: "🕶 隠密作戦", width: 720, body, onOpen: render });
  const safe = guardRender(body, () => render());
  store.subscribe((_s, ch) => {
    if (["replace", "commit", "undo", "redo"].includes(ch.type) && wins.isOpen("covert")) safe();
  });
}
