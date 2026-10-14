// 国家・文化・宗教・属州の「一覧ウィンドウ」。設定メニューから開く。
//   ・横タブは使わない（種類ごとに別のウィンドウ）
//   ・行を押すと詳細の設定ウィンドウが開く。🗑 は削除（虫眼鏡の強調は廃止）
//   ・ランダム生成のような誤操作しやすいボタンは、この一覧には置かない
import { alertDialog, confirmDialog } from "./dialogs.js";
import { el } from "./kit.js";
// 国家の一覧は国家タブ（nation-window.js）、属州は国家タブの「傀儡・属州」に移した（v2.4.0）。国家の削除機能は無い。ここは文化と宗教だけ
const LIST_KEY = { culture: "cultures", religion: "religions" };
const CELL_KEY = { state: "state", culture: "culture", religion: "religion", province: "province" };
export const KIND_LABEL = { state: "国家", culture: "文化", religion: "宗教", province: "属州" };
export const KIND_ICON = { state: "state", culture: "culture", religion: "religion", province: "province" };

export function initEntityLists({ store, wins, panels, editActions, highlight, builderActions, openSetup }) {
    const bodies = {};

  // 追加ボタン：押すと共通の「初期設定」ウィンドウが開く。名前・色・種類・領土などをそこで入力して確定するまで、何も作られない
  function addBar(kind) {
    const bar = el("div", "ent-addbar");
    if (!openSetup) return bar;
    const add = el("button", "primary", `＋ ${KIND_LABEL[kind]}を追加`); add.type = "button";
    add.title = "初期設定のウィンドウで、名前・色・種類などを入力して確定します";
    add.addEventListener("click", async () => {
      const id = await openSetup(kind);
      if (id == null) return; // キャンセル：何も作られていない
      const map = store.getState().map;
      const owned = kind === "province" ? 0 : map?.pack.cells[CELL_KEY[kind]].reduce((n, v) => n + (v === id ? 1 : 0), 0) ?? 0;
      // 領土を「あとで塗る」にした場合は、そのまま地図をなぞって塗れるようにする
      if (kind !== "province" && owned === 0 && builderActions) {
        builderActions.beginPaint(kind, id);
        window.dispatchEvent(new CustomEvent("request-edit-panel-open"));
        window.dispatchEvent(new CustomEvent("request-edit-panel-sync", { detail: { tool: `paint:${kind}`, target: id } }));
      }
      render(kind);
    });
    bar.append(add);
    return bar;
  }

  function render(kind) {
    const body = bodies[kind]; body.replaceChildren();
    const map = store.getState().map;
    if (!map) { body.append(el("p", "muted", "地図を開いてください")); return; }
    // セル数を数える（0セルの新規作成直後のものも一覧に出す）
    const arr = map.pack.cells[CELL_KEY[kind]], counts = new Map();
    for (let i = 0; i < arr.length; i++) if (map.pack.cells.biome[i] !== 0) counts.set(arr[i], (counts.get(arr[i]) ?? 0) + 1);
    const items = map.pack[LIST_KEY[kind]].filter((e) => e && e.i > 0 && !e.removed).map((e) => ({ e, cells: counts.get(e.i) ?? 0 })).sort((a, b) => b.cells - a.cells);
    body.append(addBar(kind));
    body.append(el("p", "hint", `${KIND_LABEL[kind]}は ${items.length} 件。名前を押すと詳細（${kind === "state" ? "「操作」欄で統合・反乱・独立も" : "系譜も"}）を開けます。`));
    // 系譜図は独立の入口にせず、文化・宗教という単位の下に置く
    if (kind === "culture" || kind === "religion") {
      const g = el("button", "", "@tree 系譜図を開く"); g.type = "button"; g.addEventListener("click", () => wins.open(`genealogy-${kind}`));
      body.append(g);
    }
    if (!items.length) { body.append(el("p", "muted", "まだありません")); return; }
    const ul = el("div", "ent-list");
    for (const { e, cells } of items) {
      const row = el("div", "ent-row");
      const chip = el("span", "chip"); chip.style.background = e.color ?? "#888";
      const main = el("button", "ent-main", e.fullName ?? e.name); main.type = "button"; main.title = "詳細を設定する";
      main.addEventListener("click", () => panels.openEntity(kind, e.i));
      const meta = el("span", "ent-meta", `${cells}セル`);
      // 虫眼鏡で赤く光らせる動きは廃止（v2.4.0）。強調は、国家タブの詳細設定の欄にカーソルを当てたときだけ
      row.append(chip, main, meta);
      const del = el("button", "ent-btn danger", "@trash"); del.type = "button"; del.title = "削除する（元に戻せます）";
      del.addEventListener("click", async () => {
        if (!(await confirmDialog(`${KIND_LABEL[kind]}「${e.fullName ?? e.name}」を削除します。属していた土地は無所属になります。\n（元に戻せます）`, { okLabel: "削除する", danger: true }))) return;
        if (editActions.removeEntity(kind, e.i)) render(kind);
      });
      row.append(del); ul.append(row);
    }
    body.append(ul);
  }

  for (const kind of Object.keys(LIST_KEY)) {
    bodies[kind] = el("div", "ent-body");
    wins.register(`list-${kind}`, { title: `${KIND_LABEL[kind]}一覧`, width: 520, body: bodies[kind], onOpen: () => render(kind) });
  }
  store.subscribe((_s, ch) => {
    if (!["replace", "commit", "undo", "redo"].includes(ch.type)) return;
    for (const kind of Object.keys(LIST_KEY)) if (wins.isOpen(`list-${kind}`)) render(kind);
  });
  return { render };
}
