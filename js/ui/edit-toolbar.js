// 編集ツールバー：ツールボタン・対象セレクト・ブラシ半径のUIと、editMode への橋渡し。
// ボタン自体は右側の「地図編集パネル」(#edit-panel)の中にある（edit-panel.js がパネルの開閉を担当）。
import { TOOLS } from "./edit-mode.js";
import { PAINT_KINDS } from "../core/edit/paint.js";
import { byId } from "./dom.js";
import { promptDialog, alertDialog } from "./dialogs.js";

const TARGET_LIST = { state: "states", culture: "cultures", religion: "religions", province: "provinces" };
const isLive = (e) => !!e && typeof e === "object" && !e.removed;
const NEW_VALUE = "__new__";

export function initEditToolbar({ store, editMode, editActions }) {
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
    [TOOLS.PAINT_PROVINCE]: "ドラッグして属州を塗る（「＋ 新しい属州を作る」で新規作成もできる。属州はその国家の土地にしか塗れません）",
    [TOOLS.PAINT_BIOME]: "ドラッグして地形を塗る（水域は塗れません）",
    [TOOLS.ADD_BURG]: "地図をクリックして都市を置く",
    [TOOLS.ADD_MARKER]: "地図をクリックしてマーカーを置く",
  };

  function fillTargets(tool) {
    const map = store.getState().map;
    targetSel.replaceChildren();
    const kind = tool.startsWith("paint:") ? tool.slice(6) : null;
    if (!map || !kind) { targetGroup.hidden = true; return; }
    targetGroup.hidden = false;

    if (kind === "biome") {
      for (const b of map.biomesData) { if (!b || b.i === 0) continue; const o = document.createElement("option"); o.value = b.i; o.textContent = b.name; targetSel.append(o); }
      return;
    }
    const erase = document.createElement("option"); erase.value = "0"; erase.textContent = `（${PAINT_KINDS[kind].label}なしにする）`;
    targetSel.append(erase);
    const list = map.pack[TARGET_LIST[kind]].filter(isLive);
    for (const e of list) { const o = document.createElement("option"); o.value = e.i; o.textContent = e.fullName ?? e.name; targetSel.append(o); }
    const newOpt = document.createElement("option");
    newOpt.value = NEW_VALUE; newOpt.textContent = `＋ 新しい${PAINT_KINDS[kind].label}を作る…`;
    targetSel.append(newOpt);
    if (list[0]) targetSel.value = String(list[0].i);
  }

  /** 属州の新規作成では、所属させる国家をまず選んでもらう（属州は単独では存在できない） */
  async function pickStateForProvince(map) {
    const states = map.pack.states.filter(isLive);
    if (!states.length) { await alertDialog("国家がまだありません。先に国家を作ってください"); return null; }
    if (states.length === 1) return states[0].i;
    const list = states.map((s, i) => `${i + 1}: ${s.fullName ?? s.name}`).join("\n");
    const answer = await promptDialog(`どの国家の属州にしますか？ 番号で入力してください\n${list}`, "1");
    if (answer == null) return null;
    const idx = Number(answer.trim()) - 1;
    return states[idx]?.i ?? null;
  }

  async function createNewTarget(kind) {
    const label = PAINT_KINDS[kind].label;
    const name = await promptDialog(`新しい${label}の名前`);
    if (!name || !name.trim()) return null;
    const map = store.getState().map;
    if (kind === "province") {
      const stateId = await pickStateForProvince(map);
      if (stateId == null) return null;
      return editActions.addProvince(stateId, name);
    }
    return editActions.addEntity(kind, name);
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
    if (!kind) return;
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
