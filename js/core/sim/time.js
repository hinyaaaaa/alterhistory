// 時間：年月を持つ世界の時計。進行そのものはUI層(setInterval)が行い、ここは「1ヶ月進める」
// 純粋関数と、進行に伴って何が起きるか(年次更新のタイミング)だけを扱う。
//
// 純粋ロジック層：DOM に依存しない。

/** 初期時刻を作る */
export function createWorldTime(year = 1, month = 1) {
  return { year, month };
}

/** 1ヶ月進める。年をまたいだら yearChanged=true */
export function advanceMonth(time) {
  let { year, month } = time;
  month += 1;
  let yearChanged = false;
  if (month > 12) { month = 1; year += 1; yearChanged = true; }
  return { time: { year, month }, yearChanged };
}

/** 表示用の文字列（例: "23年 4月"） */
export function formatWorldTime(time) {
  return `${time.year}年 ${time.month}月`;
}
