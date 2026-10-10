// 編集ツールバー：ツールボタン・対象セレクト・ブラシ半径のUIと、editMode への橋渡し。
// ボタン自体は右側の「地図編集パネル」(#edit-panel)の中にある（edit-panel.js がパネルの開閉を担当）。
//
// 属州の新規作成はここに置かない：属州は必ずどこかの国家に属する「国家の設定」なので、
// 新規作成は国家タブ（属州サブタブ）から行う（editor-panel.js の renderStateProvinces）。
// ここ（地図編集モード）にあるのは、あくまで「どのセルをどの属州にするか」という塗り分け作業だけ。
// 国家・文化・宗教は地図全体の独立した色分けなので、引き続きここから新規作成できる。
import { TOOLS } from "./edit-mode.js";
import { PAINT_KINDS } from "../core/edit/paint.js";
import { byId } from "./dom.js";
import { promptDialog } from "./dialogs.js";

const TARGET_LIST = { state: "states", culture: "cultures", religion: "religions", province: "provinces" };
const isLive = (e) => !!e && typeof e === "object" && !e.removed;
const NEW_VALUE = "__new__";

export function initEditToolbar({ store, editMode, editActions, openSetup }) {
  const buttons = [...document.querySelectorAll("#edit-panel [data-tool]")];
  const targetGroup = byId("tool-target-group");
  const targetSel = byId("tool-target");
  const radiusGroup = byId("tool-radius-group");
  const radiusInput = byId("tool-radius");
  const hint = byId("tool-hint");

  const HINTS = {
    [TOOLS.SELECT]: "クリックして中身を見る・編集する",
    [TOOLS.PAINT_STATE]: "ドラッグして国家を塗る（下の「対象」で塗る国家を選ぶ。一覧の「＋ 新しい国家を作る」で新規作成もできる）",
    [TOOLS.PAINT_CULTURE]: "ドラッグして文化を塗る（「＋ 新しい文化を作る」で新規作成もできる）",
    [TOOLS.PAINT_RELIGION]: "ドラッグして宗教を塗る（「＋ 新しい宗教を作る」で新規作成もできる）",
    [TOOLS.PAINT_PROVINCE]: "ドラッグして属州を塗る（新しい属州は、国家タブの「属州」から作れます。属州はその国家の土地にしか塗れません）",
    [TOOLS.PAINT_BIOME]: "ドラッグして地形を塗る（水域は塗れません）",
    [TOOLS.ADD_BURG]: "地図をクリックして都市を置く",
    [TOOLS.ADD_MARKER]: "地図をクリックしてマーカーを置く",
  };

  // 「＋新規作成」の選択肢を出す種類（属州は除く。理由は冒頭コメント参照）
  const CAN_CREATE_HERE = new Set(["state", "culture", "religion"]);

  function fillTargets(tool) {
    const map = store.getState().map;
    targetSel.replaceChildren();
    const kind = tool.startsWith("paint:") ? tool.slice(6) : null;
    // 旅・ゾーン画面が使う「ゾーンを塗る」など、この欄が扱わない塗りツールのときは対象欄を隠す
    if (!map || !kind || (kind !== "biome" && !PAINT_KINDS[kind])) { targetGroup.hidden = true; return; }
    targetGroup.hidden = false;

    if (kind === "biome") {
      for (const b of map.biomesData) { if (!b || b.i === 0) continue; const o = document.createElement("option"); o.value = b.i; o.textContent = b.name; targetSel.append(o); }
      return;
    }
    const erase = document.createElement("option"); erase.value = "0"; erase.textContent = `（${PAINT_KINDS[kind].label}なしにする）`;
    targetSel.append(erase);
    const list = map.pack[TARGET_LIST[kind]].filter(isLive);
    for (const e of list) { const o = document.createElement("option"); o.value = e.i; o.textContent = e.fullName ?? e.name; targetSel.append(o); }
    if (CAN_CREATE_HERE.has(kind)) {
      const newOpt = document.createElement("option");
      newOpt.value = NEW_VALUE; newOpt.textContent = `＋ 新しい${PAINT_KINDS[kind].label}を作る…`;
      targetSel.append(newOpt);
    }
    if (list[0]) targetSel.value = String(list[0].i);
  }

  /** 塗り先を新しく作る：共通の初期設定ウィンドウを開く。確定されたらそのID、キャンセルなら null */
  async function createNewTarget(kind) {
    if (openSetup) return openSetup(kind);
    const label = PAINT_KINDS[kind].label;
    const name = await promptDialog(`新しい${label}の名前`, "", { suggest: () => editActions.suggestName(kind), hint: "空欄のまま OK を押すと、仮の名前が自動で付きます（あとから変更・確定できます）" });
    return name == null ? null : editActions.addEntity(kind, name);
  }

  function sync() {
    const tool = editMode.tool;
    const hasMap = !!store.getState().map;
    for (const b of buttons) {
      b.classList.toggle("active", b.dataset.tool === tool);
      b.disabled = !hasMap;
    }
    hint.textContent = hasMap ? (HINTS[tool] ?? "") : "地図を開いてください";
    radiusGroup.hidden = !(tool.startsWith("paint:"));
  }

  for (const b of buttons) {
    b.addEventListener("click", () => {
      const map = store.getState().map;
      if (!map) return;
      editMode.setTool(b.dataset.tool);
      fillTargets(b.dataset.tool);
      sync();
    });
  }
  targetSel.addEventListener("change", async () => {
    if (targetSel.value !== NEW_VALUE) { editMode.setTarget(Number(targetSel.value)); return; }
    const kind = editMode.tool.startsWith("paint:") ? editMode.tool.slice(6) : null;
    if (!kind || !CAN_CREATE_HERE.has(kind)) return;
    const newId = await createNewTarget(kind);
    fillTargets(editMode.tool);
    if (newId != null) { targetSel.value = String(newId); editMode.setTarget(newId); }
    else if (targetSel.options.length) { targetSel.selectedIndex = 0; editMode.setTarget(Number(targetSel.value)); }
  });
  radiusInput.addEventListener("input", () => editMode.setRadius(Number(radiusInput.value)));

  store.subscribe((state, change) => {
    if (change.type === "replace") { fillTargets(editMode.tool); sync(); }
  });
  sync();
  return {
    fillTargets, sync,
    /** 外部（属州タブの「塗り直す」ボタン等）からツールと対象をまとめて合わせる */
    setTargetValue(id) { targetSel.value = String(id); editMode.setTarget(id); },
  };
}
