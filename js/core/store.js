// Store：アプリ状態の単一の真実の源。
//
// 責務:
//   - 状態の保持
//   - 変更は commit(command) 経由のみ（直接代入しない）
//   - 変更の購読(subscribe)。描画層・UI層が「変わったこと」を知るため
//   - Undo / Redo（コマンド単位）
//
// 純粋ロジック層：DOM・Canvas に依存しない。

const DEFAULT_HISTORY_LIMIT = 200;
const LOST = Symbol("saved-state-dropped-from-history");

/**
 * コマンド = { label, apply(state), revert(state) }
 * apply/revert は state を直接書き換えてよい（Store 内部でのみ呼ばれる）。
 * 大きな配列を丸ごと複製せず、変更した差分だけを持てるようにするため。
 */

/**
 * @param {object} initialState
 * @param {{historyLimit?:number}} [options]
 */
export function createStore(initialState, { historyLimit = DEFAULT_HISTORY_LIMIT } = {}) {
  let state = initialState;
  // 「最後に保存した時点」の履歴の先頭。今の先頭と違えば、未保存の変更がある。
  // null = 履歴が空の状態で保存した / LOST = 保存時点の履歴が上限で捨てられた（保存し直すまで常に未保存）
  let savedTop = null;
  const listeners = new Set();
  const undoStack = [];
  const redoStack = [];
  let batch = null; // まとめて1回のUndoにする用

  const notify = (change) => {
    for (const fn of listeners) fn(state, change);
  };

  const pushHistory = (command) => {
    undoStack.push(command);
    if (undoStack.length > historyLimit) {
      const dropped = undoStack.shift();
      // 履歴の先頭を捨てると、保存時点へ Undo で戻れなくなる。未保存のままにしておく
      if (dropped === savedTop || savedTop === null) savedTop = LOST;
    }
    redoStack.length = 0; // 新しい操作をしたら Redo は無効
  };

  return {
    getState: () => state,

    /** 状態変更を伴わない購読解除関数を返す */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** 変更を実行。履歴に積まれ、購読者に通知される */
    commit(command) {
      command.apply(state);
      if (batch) {
        batch.commands.push(command);
        notify({ type: "batch", label: command.label }); // ブラシで塗っている最中も、画面を更新できるように
        return;
      }
      pushHistory(command);
      notify({ type: "commit", label: command.label });
    },

    /**
     * 複数の commit を1つのUndo単位にまとめる。
     * 例: ブラシで1回なぞる間の全セル変更を、Undo 1回で戻せるようにする。
     */
    beginBatch(label) {
      if (batch) throw new Error("バッチは入れ子にできません");
      batch = { label, commands: [] };
    },
    endBatch() {
      if (!batch) return;
      const { label, commands } = batch;
      batch = null;
      if (commands.length === 0) return;
      pushHistory({
        label,
        apply: (s) => commands.forEach((c) => c.apply(s)),
        revert: (s) => [...commands].reverse().forEach((c) => c.revert(s)),
      });
      notify({ type: "commit", label });
    },

    /** 未保存の変更があるか（ブラシ操作の途中も含む） */
    isDirty: () => (batch?.commands.length ?? 0) > 0 || (undoStack.at(-1) ?? null) !== savedTop,
    /** 今の状態を「保存済み」とする。保存が成功した直後に呼ぶ */
    markSaved() { savedTop = undoStack.at(-1) ?? null; },

    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    /** UIのボタンに「〇〇を元に戻す」と出すためのラベル */
    peekUndoLabel: () => undoStack.at(-1)?.label ?? null,
    peekRedoLabel: () => redoStack.at(-1)?.label ?? null,

    undo() {
      const cmd = undoStack.pop();
      if (!cmd) return false;
      cmd.revert(state);
      redoStack.push(cmd);
      notify({ type: "undo", label: cmd.label });
      return true;
    },

    redo() {
      const cmd = redoStack.pop();
      if (!cmd) return false;
      cmd.apply(state);
      undoStack.push(cmd);
      notify({ type: "redo", label: cmd.label });
      return true;
    },

    /**
     * 別のマップを読み込んだとき等、状態を丸ごと置き換える。
     * 履歴は破棄する（前のマップへの Undo は意味を持たないため）。
     */
    replace(newState) {
      state = newState;
      undoStack.length = 0;
      redoStack.length = 0;
      batch = null;
      savedTop = null;
      notify({ type: "replace" });
    },

    /** 履歴に載せない軽い状態変更（ツール選択・ズーム等）用 */
    update(mutator, label = "update") {
      mutator(state);
      notify({ type: "update", label });
    },
  };
}

/**
 * セル配列の一部を書き換えるコマンドを作る。
 * 変更前の値を記録し、revert で正確に戻す。
 *
 * @param {string} label   Undoメニュー用ラベル（例: "国家を塗る"）
 * @param {Function} getArray  (state) => 対象の配列
 * @param {Array<[number, number]>} changes  [セルindex, 新しい値] の配列
 */
export function cellChangeCommand(label, getArray, changes) {
  let before = null;
  return {
    label,
    apply(state) {
      const arr = getArray(state);
      if (!before) before = changes.map(([i]) => [i, arr[i]]);
      for (const [i, v] of changes) arr[i] = v;
    },
    revert(state) {
      const arr = getArray(state);
      for (const [i, v] of before) arr[i] = v;
    },
  };
}
