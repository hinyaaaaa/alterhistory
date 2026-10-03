// 国家・文化・宗教・属州の「一覧ウィンドウ」。設定メニューから開く。
//   ・横タブは使わない（種類ごとに別のウィンドウ）
//   ・行を押すと詳細の設定ウィンドウが開く。🔍 は地図上で強調（ズームしない）、🗑 は削除
//   ・ランダム生成のような誤操作しやすいボタンは、この一覧には置かない
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const LIST_KEY = { state: "states", culture: "cultures", religion: "religions", province: "provinces" };
const CELL_KEY = { state: "state", culture: "culture", religion: "religion", province: "province" };
export const KIND_LABEL = { state: "国家", culture: "文化", religion: "宗教", province: "属州" };
export const KIND_ICON = { state: "🏳", culture: "🎭", religion: "✦", province: "▦" };

export function initEntityLists({ store, wins, panels, editActions, highlight }) {
  // 統合：統合先の国を選ぶ小さな画面（国家の統合は国どうしの操作なので、国家一覧から行う）
  function onMerge(fromId) {
    const map = store.getState().map; if (!map) return;
    const others = map.pack.states.filter((s) => s && s.i > 0 && !s.removed && s.i !== fromId);
    if (!others.length) { window.alert("統合先になる国がありません"); return; }
    const from = map.pack.states[fromId];
    const sel = document.createElement("select");
    for (const s of others) { const o = document.createElement("option"); o.value = s.i; o.textContent = s.fullName ?? s.name; sel.append(o); }
    const body = el("div", "merge-body");
    body.append(el("p", "", `「${from.fullName ?? from.name}」を、どの国に統合しますか？`), sel, el("p", "hint", "領土・都市・属州は統合先へ移り、この国は消滅します（元に戻せます）。"));
    const go = el("button", "primary", "統合する"); go.type = "button";
    go.addEventListener("click", () => { editActions.mergeStates(fromId, Number(sel.value)); wins.close("merge"); render("state"); });
    body.append(go);
    mergeHost.replaceChildren(body);
    wins.open("merge");
  }
  const mergeHost = el("div", "merge-host");
  wins.register("merge", { title: "🏳 国家の統合", width: 420, body: mergeHost });
  const bodies = {};

  function render(kind) {
    const body = bodies[kind]; body.replaceChildren();
    const map = store.getState().map;
    if (!map) { body.append(el("p", "muted", "地図を開いてください")); return; }
    // セル数を数える（0セルの新規作成直後のものも一覧に出す）
    const arr = map.pack.cells[CELL_KEY[kind]], counts = new Map();
    for (let i = 0; i < arr.length; i++) if (map.pack.cells.biome[i] !== 0) counts.set(arr[i], (counts.get(arr[i]) ?? 0) + 1);
    const items = map.pack[LIST_KEY[kind]].filter((e) => e && e.i > 0 && !e.removed).map((e) => ({ e, cells: counts.get(e.i) ?? 0 })).sort((a, b) => b.cells - a.cells);
    body.append(el("p", "hint", `${KIND_LABEL[kind]}は ${items.length} 件。名前を押すと詳細を設定できます。`));
    if (!items.length) { body.append(el("p", "muted", "まだありません")); return; }
    const ul = el("div", "ent-list");
    for (const { e, cells } of items) {
      const row = el("div", "ent-row");
      const chip = el("span", "chip"); chip.style.background = e.color ?? "#888";
      const main = el("button", "ent-main", e.fullName ?? e.name); main.type = "button"; main.title = "詳細を設定する";
      main.addEventListener("click", () => panels.openEntity(kind, e.i));
      const meta = el("span", "ent-meta", `${cells}セル`);
      const look = el("button", "ent-btn", "🔍"); look.type = "button"; look.title = "地図上で強調する（ズームしません）";
      look.addEventListener("click", () => highlight?.show(kind, e.i));
      row.append(chip, main, meta, look);
      if (kind === "state" && onMerge) {
        const mg = el("button", "ent-btn", "統合"); mg.type = "button"; mg.title = "他の国に統合する";
        mg.addEventListener("click", () => onMerge(e.i)); row.append(mg);
      }
      const del = el("button", "ent-btn danger", "🗑"); del.type = "button"; del.title = "削除する（元に戻せます）";
      del.addEventListener("click", async () => {
        if (!window.confirm(`${KIND_LABEL[kind]}「${e.fullName ?? e.name}」を削除します。属していた土地は無所属になります。\n（元に戻せます）`)) return;
        if (editActions.removeEntity(kind, e.i)) render(kind);
      });
      row.append(del); ul.append(row);
    }
    body.append(ul);
  }

  for (const kind of Object.keys(LIST_KEY)) {
    bodies[kind] = el("div", "ent-body");
    wins.register(`list-${kind}`, { title: `${KIND_ICON[kind]} ${KIND_LABEL[kind]}一覧`, width: 520, body: bodies[kind], onOpen: () => render(kind) });
  }
  store.subscribe((_s, ch) => {
    if (!["replace", "commit", "undo", "redo"].includes(ch.type)) return;
    for (const kind of Object.keys(LIST_KEY)) if (wins.isOpen(`list-${kind}`)) render(kind);
  });
  return { render };
}
