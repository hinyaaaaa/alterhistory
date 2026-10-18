// 国家タブ・国の新規作成で使う、ドクトリンの選択部品。解禁条件なし（どれでも自由に選べる）。
// get() は { regime, doctrine, doctrineNodes, techDoctrine } を持つ「国のような値」を返す。変更は onChange(patch) に渡す。
import { el } from "./kit.js";
import { DOCTRINES } from "../core/sim/units.js";
import { BRANCHES, TIER_LABEL, TREE_NODES, MAX_UNIQUE, TECH_TRACKS, getTechDoctrine, normalizeNodes, regimeUniqueNodes, doctrineCapped, fxDimension, DOCTRINE_CAPS } from "../core/edit/doctrines.js";
import { regimeOf } from "../core/edit/regimes.js";

const effectText = (fx) => Object.entries(fx).map(([k, v]) => `${{ inf: "歩兵", cav: "騎兵", arc: "弓兵", art: "砲兵", arm: "機甲", air: "航空", nav: "海軍", spc: "特殊", adv: "先端", atk: "攻め", def: "守り", mor: "士気崩れ", con: "徴兵" }[k] ?? k}${v > 0 ? "+" : ""}${Math.round(v * 100)}%`).join(" ");

const DIM_LABEL = { infantry: "歩兵", cavalry: "騎兵", archers: "弓兵", artillery: "砲兵", armor: "機甲", air: "航空", navy: "海軍", special: "特殊", advanced: "先端", attack: "攻め", defense: "守り" };

/** 軍事ドクトリン：総合方針 ＋ 陸・海・空の6段 ＋ 政体固有 */
export function militaryPicker({ get, onChange }) {
  const box = el("div", "np-mil");
  function draw() {
    box.replaceChildren();
    const st = get(), nodes = new Set(normalizeNodes(st, st.doctrineNodes));
    const capped = doctrineCapped(st), cdims = new Set(capped.map((c) => c.dim));
    const atCap = (n) => nodes.has(n.key) && Object.keys(n.fx).some((k) => cdims.has(fxDimension(k))); // 上限に達した効果に関わる、選択中の節
    const top = el("div", "np-row");
    top.append(el("span", "np-k", "総合方針"));
    const sel = document.createElement("select");
    for (const d of DOCTRINES) sel.append(new Option(d.label, d.key, false, d.key === (st.doctrine ?? "balanced")));
    sel.addEventListener("change", () => { onChange({ base: sel.value }); draw(); });
    top.append(sel);
    box.append(top, el("p", "hint", DOCTRINES.find((d) => d.key === (st.doctrine ?? "balanced"))?.desc ?? ""));
    const toggle = (k) => { const next = new Set(nodes); next.has(k) ? next.delete(k) : next.add(k); onChange({ nodes: [...next] }); draw(); };
    const tree = el("div", "np-tree");
    tree.append(el("span", "np-corner", ""));
    for (const b of BRANCHES) tree.append(el("span", "np-head", b.label));
    TIER_LABEL.forEach((tl, i) => {
      tree.append(el("span", "np-tier", tl));
      for (const b of BRANCHES) {
        const cell = el("div", "np-cell");
        for (const n of TREE_NODES.filter((x) => x.branch === b.key && x.tier === i + 1)) {
          const on = nodes.has(n.key), btn = el("button", `np-node${on ? " on" : ""}${atCap(n) ? " capped" : ""}`, n.label);
          btn.type = "button"; btn.title = `${n.desc}\n${effectText(n.fx)}${atCap(n) ? "\n上限に達している（これ以上は効果が増えません）" : ""}`;
          btn.addEventListener("click", () => toggle(n.key));
          cell.append(btn);
        }
        tree.append(cell);
      }
    });
    box.append(tree);
    const r = regimeOf(st);
    box.append(el("h5", "np-sub", `${r.label}の固有ドクトリン（最大${MAX_UNIQUE}つ）`));
    const u = el("div", "np-uniq");
    for (const n of regimeUniqueNodes(r.key)) {
      const on = nodes.has(n.key), btn = el("button", `np-node${on ? " on" : ""}${atCap(n) ? " capped" : ""}`, n.label);
      btn.type = "button"; btn.title = `${n.desc}\n${effectText(n.fx)}${atCap(n) ? "\n上限に達している（これ以上は効果が増えません）" : ""}`;
      btn.addEventListener("click", () => toggle(n.key));
      u.append(btn);
    }
    box.append(u);
    if (capped.length) {
      const pc = (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
      const note = el("p", "hint np-capped-note", `上限に達している: ${capped.map((c) => `${DIM_LABEL[c.dim] ?? c.dim} ${pc(c.raw)} → ${pc(c.cap)}`).join("、")}（兵科は基本の±${DOCTRINE_CAPS.unit * 100}%、攻め・守りは合計±${DOCTRINE_CAPS.war * 100}%まで。点線の節は、その分だけ効果が出ません）`);
      note.dataset.field = "doctrine-capped"; box.append(note);
    }
    box.append(el("p", "hint", "選べるのは各段に1つ。ボタンに乗せると効果が出ます。"));
  }
  draw();
  return { box, redraw: draw };
}

/** 技術ドクトリン：6分野それぞれで到達段（1〜10）を選ぶ。自動で進むことは無い */
export function techPicker({ get, onChange, marks = () => [] }) {
  const box = el("div", "np-tech");
  function draw() {
    box.replaceChildren();
    const lv = getTechDoctrine(get());
    for (const t of TECH_TRACKS) {
      const row = el("div", "np-track");
      const mk = marks().find((m) => m.field === t.key);
      row.append(el("span", "np-k", mk ? `${t.label} ◆` : t.label));
      if (mk) row.title = `機運: ${mk.target}段「${mk.step}」を採用できる`;
      const chain = el("div", "np-chain");
      t.steps.forEach((label, i) => {
        const b = el("button", `np-step${i + 1 <= lv[t.key] ? " on" : ""}${i + 1 === lv[t.key] ? " cur" : ""}`, label);
        b.type = "button"; b.title = `${t.label} ${i + 1}段：${label}`;
        if (mk && i + 1 === mk.target) { b.classList.add("momentum"); b.title += "（機運あり）"; }
        b.addEventListener("click", () => { onChange({ [t.key]: i + 1 }); draw(); });
        chain.append(b);
      });
      row.append(chain); box.append(row);
    }
  }
  draw();
  return { box, redraw: draw };
}
