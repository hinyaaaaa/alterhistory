// v6 M1: 暦と時代区分。内部の時刻は月通番（civ.monthIndex。年×12＋月−1）が正。ここは「表示」だけを扱う。
// 生成時に起点・表示形式・時代区分（名前と境界）を決める。生成後に変えられるのは名前と表示形式だけで、
// 区分の境界・日付・出来事の順序は変えない（過去の客観的な事実を書き換えない）。
export const DEFAULT_CALENDAR = Object.freeze({
  epochName: "紀元", beforeName: "紀元前", yearOffset: 0, // 表示年 = 内部の年 + yearOffset（内部の年が負なら beforeName の側で数える）
  format: "{era}{year}年{month}月", monthNames: null,
  eras: Object.freeze([]),
});
const isInt = (v) => Number.isInteger(v);

/** 入力の検証と補完。{ calendar, errors } */
export function normalizeCalendar(input = {}) {
  const errors = [], c = { ...DEFAULT_CALENDAR, ...(input ?? {}) };
  for (const k of ["epochName", "beforeName", "format"]) if (typeof c[k] !== "string" || !c[k].trim()) errors.push(`calendar.${k} は空でない文字列`);
  if (!isInt(c.yearOffset) || Math.abs(c.yearOffset) > 1e7) errors.push("calendar.yearOffset は整数");
  if (typeof c.format === "string" && !c.format.includes("{year}")) errors.push("calendar.format には {year} が必要");
  const eras = [];
  if (!Array.isArray(c.eras)) errors.push("calendar.eras は配列");
  else {
    let prev = -Infinity;
    for (const [i, e] of c.eras.entries()) {
      if (!e || typeof e.name !== "string" || !e.name.trim()) { errors.push(`calendar.eras[${i}].name は空でない文字列`); continue; }
      if (!isInt(e.startYear)) { errors.push(`calendar.eras[${i}].startYear は整数（内部の年）`); continue; }
      if (e.startYear <= prev) errors.push(`calendar.eras[${i}] の境界は前より後（${e.startYear} ≤ ${prev}）`);
      prev = e.startYear; eras.push({ id: e.id ?? `era${i}`, name: e.name.trim(), startYear: e.startYear });
    }
  }
  if (c.monthNames != null && !(Array.isArray(c.monthNames) && c.monthNames.length === 12 && c.monthNames.every((x) => typeof x === "string" && x))) errors.push("calendar.monthNames は12個の文字列");
  return { calendar: { epochName: c.epochName, beforeName: c.beforeName, yearOffset: c.yearOffset, format: c.format, monthNames: c.monthNames ?? null, eras }, errors };
}

const split = (mi) => { const year = Math.floor(mi / 12); return { year, month: mi - year * 12 + 1 }; };
/** 時代区分（境界は内部の年。最初の区分より前は null） */
export function eraOf(cal, mi) {
  const { year } = split(mi); let hit = null;
  for (const e of cal.eras) { if (e.startYear <= year) hit = e; else break; }
  return hit;
}
/** 月通番 → 表示文字列。年の符号は yearOffset を足したあとで決める（0 年は無い数え方はせず、0 以下は「前」の側で 1 から数える） */
export function formatDate(cal, mi) {
  const { year, month } = split(mi), shown = year + cal.yearOffset, before = shown < 0, n = before ? -shown : shown;
  const era = before ? cal.beforeName : cal.epochName, name = cal.monthNames ? cal.monthNames[month - 1] : String(month);
  return cal.format.replace("{era}", era).replace("{year}", String(n)).replace("{month}", name).replace("{monthNum}", String(month));
}

/** 生成後に許す変更（表示用のみ）。区分の名前と、表示形式・起点の名前。境界・年のずれ・日付には触れない */
export function applyDisplayEdit(cal, edit) {
  const errors = [], next = { ...cal, eras: cal.eras.map((e) => ({ ...e })) };
  const allowed = new Set(["epochName", "beforeName", "format", "monthNames", "eraNames"]);
  for (const k of Object.keys(edit)) if (!allowed.has(k)) errors.push(`${k} は生成後に変更できません（表示用の設定だけ変えられます）`);
  if (errors.length) return { calendar: cal, errors };
  for (const k of ["epochName", "beforeName", "format"]) if (edit[k] !== undefined) next[k] = edit[k];
  if (edit.monthNames !== undefined) next.monthNames = edit.monthNames;
  if (edit.eraNames) for (const [id, name] of Object.entries(edit.eraNames)) { const e = next.eras.find((x) => x.id === id); if (!e) errors.push(`時代区分 ${id} がありません`); else e.name = name; }
  const v = normalizeCalendar(next); if (v.errors.length) return { calendar: cal, errors: v.errors };
  return { calendar: v.calendar, errors: [] };
}
