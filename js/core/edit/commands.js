// 編集コマンドの部品。Store の commit に渡す { label, apply(state), revert(state) } を作る。
//
// 設計:
//   ・コマンドは「部品(part)」の並び。部品は apply(map) / revert(map) を持つ。
//   ・部品は作られた時点で「変更前の値」を記録し、apply は絶対値を書き込む。
//     → 足し引きの逆算をしないので、Undo/Redo を何度繰り返しても値がずれない（浮動小数点の誤差も出ない）。
//   ・Undo は必ず後入れ先出し（Store がそう動かす）なので、記録した変更前の値は常に正しい。
//   ・実行のたびに map.rev（再描画用の版数）を進める。
//
// 純粋ロジック層：DOM に依存しない。

/** @param {string[]} layers 影響する層: "terrain" | "politics" | "places" */
export function makeCommand(label, layers, parts) {
  const bump = (state) => { const r = state.map.rev; for (const l of layers) r[l]++; };
  return {
    label, layers, parts,
    apply(state) { for (const p of parts) p.apply(state.map); bump(state); },
    revert(state) { for (let i = parts.length - 1; i >= 0; i--) parts[i].revert(state.map); bump(state); },
  };
}

/** 数値配列の一部を書き換える。changes: [[添字, 変更前, 変更後], ...] */
export function setIndexed(getArray, changes) {
  return {
    apply(map) { const a = getArray(map); for (const [i, , after] of changes) a[i] = after; },
    revert(map) { const a = getArray(map); for (const [i, before] of changes) a[i] = before; },
  };
}

/**
 * オブジェクトのプロパティを書き換える。patch の値が undefined ならそのキーを削除する。
 * 変更前に「キー自体が無かった」場合も、Undo で正しくキーを消す。
 */
export function setProps(target, patch) {
  const before = {};
  for (const k of Object.keys(patch)) before[k] = Object.prototype.hasOwnProperty.call(target, k) ? { v: target[k] } : null;
  return {
    apply() { for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete target[k]; else target[k] = v; } },
    revert() { for (const [k, b] of Object.entries(before)) { if (b === null) delete target[k]; else target[k] = b.v; } },
  };
}

/** 配列の1要素を差し替える（末尾を超える添字なら伸ばす。Undo で元の長さに戻す） */
export function setArrayItem(getArray, index, after) {
  let prevLength = null, before, had = false;
  return {
    apply(map) {
      const a = getArray(map);
      if (prevLength === null) { prevLength = a.length; had = index < a.length; before = a[index]; }
      a[index] = after;
    },
    revert(map) {
      const a = getArray(map);
      if (had) a[index] = before; else a.length = prevLength;
    },
  };
}

/** 配列全体を差し替える（マーカーの追加・削除など、要素数が変わる場合） */
export function setList(get, set, after) {
  let before = null;
  return {
    apply(map) { if (before === null) before = get(map); set(map, after); },
    revert(map) { set(map, before); },
  };
}

/**
 * 「この部品の結果を見て次の部品を計画する」ための逐次計画。
 * 各 planner は、その時点の map を見て部品の配列を返す関数。
 * 計画中は部品を一時的に適用して次の planner に見せ、最後に全て元へ戻す（map は変わらない）。
 * 戻り値の部品を、そのままコマンドとして commit すればよい。
 */
export function planSequential(map, planners) {
  const all = [];
  try {
    for (const plan of planners) {
      const parts = plan(map);
      for (const p of parts) { p.apply(map); all.push(p); }
    }
  } finally {
    for (let i = all.length - 1; i >= 0; i--) all[i].revert(map);
  }
  return all;
}
