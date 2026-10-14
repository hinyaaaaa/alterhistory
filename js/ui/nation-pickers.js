// 国家タブ・国の新規作成で使う、ドクトリンの選択部品。解禁条件なし（どれでも自由に選べる）。
// get() は { regime, doctrine, doctrineNodes, techDoctrine } を持つ「国のような値」を返す。変更は onChange(patch) に渡す。
import { el } from "./kit.js";
import { DOCTRINES } from "../core/sim/units.js";
import { BRANCHES, TIER_LABEL, TREE_NODES, MAX_UNIQUE, TECH_TRACKS, getTechDoctrine, normalizeNodes, regimeUniqueNodes } from "../core/edit/doctrines.js";
import { regimeOf } from "../core/edit/regimes.js";

const effectText = (fx) => Object.entries(fx).map(([k, v]) => `${{ inf: "歩兵", cav: "騎兵", arc: "弓兵", art: "砲兵", arm: "機甲", air: "航空", nav: "海軍", spc: "特殊", adv: "先端", atk: "攻め", def: "守り", mor: "士気崩れ", con: "徴兵" }[k] ?? k}${v > 0 ? "+" : ""}${Math.round(v * 100)}%`).join(" ");

/** 軍事ドクトリン：総合方針 ＋ 陸・海・空の6段 ＋ 政体固有 */
export function militaryPicker({ get, onChange }) {
  const box = el("div", "np-mil");
  function draw() {
    box.replaceChildren();
    const st = get(), nodes = new Set(normalizeNodes(st, st.doctrineNodes));
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
          const on = nodes.has(n.key), btn = el("button", `np-node${on ? " on" : ""}`, n.label);
          btn.type = "button"; btn.title = `${n.desc}\n${effectText(n.fx)}`;
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
      const on = nodes.has(n.key), btn = el("button", `np-node${on ? " on" : ""}`, n.label);
      btn.type = "button"; btn.title = `${n.desc}\n${effectText(n.fx)}`;
      btn.addEventListener("click", () => toggle(n.key));
      u.append(btn);
    }
    box.append(u);
    box.append(el("p", "hint", "選べるのは各段に1つ。ボタンに乗せると効果が出ます。"));
  }
  draw();
  return { box, redraw: draw };
}

/** 技術ドクトリン：6分野それぞれで到達段（1〜10）を選ぶ。自動で進むことは無い */
export function techPicker({ get, onChange }) {
  const box = el("div", "np-tech");
  function draw() {
    box.replaceChildren();
    const lv = getTechDoctrine(get());
    for (const t of TECH_TRACKS) {
      const row = el("div", "np-track");
      row.append(el("span", "np-k", t.label));
      const chain = el("div", "np-chain");
      t.steps.forEach((label, i) => {
        const b = el("button", `np-step${i + 1 <= lv[t.key] ? " on" : ""}${i + 1 === lv[t.key] ? " cur" : ""}`, label);
        b.type = "button"; b.title = `${t.label} ${i + 1}段：${label}`;
        b.addEventListener("click", () => { onChange({ [t.key]: i + 1 }); draw(); });
        chain.append(b);
      });
      row.append(chain); box.append(row);
    }
  }
  draw();
  return { box, redraw: draw };
}
