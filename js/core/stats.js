// 派生統計：セル配列から国家・文化・宗教・属州ごとの集計を再計算する。
//
// なぜ再計算するのか（実データで確認した事実）:
//   手動編集されたマップでは、オブジェクトが持つ `cells` などの保存値と、
//   セル配列の実態がずれていることがある。
//   例: 「新世界より」の宗教39は cells=232 と保存されているが、セル配列上は 772 セル。
//   → 保存値は信用せず、常にセル配列（真実の源）から計算する。
//
// 純粋関数のみ。入力の MapData を変更しない。

/** 値ごとの出現数を数える。戻り値: { 値: 個数 } */
function tally(arr) {
  const counts = {};
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    counts[v] = (counts[v] || 0) + 1;
  }
  return counts;
}

/**
 * 各エンティティのセル数を再計算して返す。
 * @returns {{state:Object, culture:Object, religion:Object, province:Object}}
 *          各キーは ID、値はセル数。0番（中立・なし）も含む。
 */
export function computeCellCounts(map) {
  const c = map.pack.cells;
  return {
    state: tally(c.state),
    culture: tally(c.culture),
    religion: tally(c.religion),
    province: tally(c.province),
  };
}

/** 保存値と実測値のずれを検出する（手動編集の痕跡を知らせるため） */
export function findCountDrift(map) {
  const counts = computeCellCounts(map);
  const drift = [];
  const check = (kind, label, objs) => {
    for (const o of objs) {
      if (!o || !o.i || o.removed || typeof o.cells !== "number") continue;
      const actual = counts[kind][o.i] || 0;
      if (actual !== o.cells) {
        drift.push({ kind, id: o.i, name: o.name ?? "", stored: o.cells, actual, label });
      }
    }
  };
  check("state", "国家", map.pack.states);
  check("religion", "宗教", map.pack.religions);
  return drift;
}

/**
 * 実在するエンティティだけを返す（削除済み・空要素を除外）。
 * UIの一覧表示はこれを使う。0番（中立）は含めるかどうかを選べる。
 */
export function activeEntities(list, { includeNeutral = false } = {}) {
  return list.filter((o) => {
    if (!o || typeof o !== "object") return false;
    if (o.removed) return false;
    if (o.i === 0) return includeNeutral;
    return true;
  });
}
