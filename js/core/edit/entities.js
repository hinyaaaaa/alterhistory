// 実体（国家・文化・宗教・属州）の名前変更・新規作成。
// 都市（burgs.js の planRenameBurg）とは別の配列に入っているため、専用の1関数にする。
// name と fullName の両方を持つ実体では、表示に使われる fullName を優先して書き換える
// （国家一覧・凡例などは fullName ?? name を表示に使っているため）。

import { makeCommand, setProps, setList } from "./commands.js";

const LIST_KEY = { state: "states", culture: "cultures", religion: "religions", province: "provinces" };
const isLive = (e) => !!e && typeof e === "object" && !e.removed;

/** 実体の名前を変える。kind: "state"|"culture"|"religion"|"province" */
export function planRenameEntity(map, kind, id, name) {
  const listKey = LIST_KEY[kind];
  if (!listKey) throw new Error("この種類の名前は変更できません");
  const e = map.pack[listKey]?.[id];
  if (!isLive(e)) throw new Error("その対象は存在しません");
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("名前を入力してください");
  const field = "fullName" in e ? "fullName" : "name";
  if (trimmed === e[field]) return null;
  const label = { state: "国家", culture: "文化", religion: "宗教", province: "属州" }[kind];
  return makeCommand(`${label}の名前を変更`, ["places"], [setProps(e, { [field]: trimmed })]);
}

const EXTRA_KEYS = ["name", "form", "formName", "deity", "type"];

/** 新しい実体の色。HSLで均等に散らし、既存の実体数から角度をずらして被りにくくする */
function pickColor(existingCount, rnd) {
  const golden = 137.508; // 黄金角。均等に色相を散らす定番の手法
  const hue = Math.round((existingCount * golden + (rnd ? rnd.float(0, 360) : 0)) % 360);
  const sat = 55 + (rnd ? Math.round(rnd.float(0, 15)) : 10);
  const light = 45 + (rnd ? Math.round(rnd.float(-10, 10)) : 0);
  return hslToHex(hue, sat, light);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n) => Math.round(f(n) * 255).toString(16).padStart(2, "0");
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

const LABEL_OF = { state: "国家", culture: "文化", religion: "宗教", province: "属州" };

/**
 * 国家・文化・宗教を新規作成する（属州は planAddProvince を使う。国家が必須のため）。
 * 作った時点ではどのセルも持たない（cells:0 等）。続けて「塗る」ツール（core/edit/paint.js の
 * planPaint）で、作成した実体をセルに塗って初めて地図上に反映される。
 * @param {object} map
 * @param {{kind:"state"|"culture"|"religion", name:string, rnd?:object, extra?:{name?:string,form?:string,formName?:string,deity?:string,type?:string}}} opts
 *   extra: 国家の短縮名・政体、宗教の神名・種別など。名前の仮生成（naming.js）が渡す
 * @returns {{command:object, id:number}}
 */
export function planAddEntity(map, { kind, name, rnd, extra }) {
  if (kind === "province") throw new Error("属州は所属する国家が必要です。planAddProvince を使ってください");
  const listKey = LIST_KEY[kind];
  if (!listKey) throw new Error(`未対応の種類です: ${kind}`);
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error(`${LABEL_OF[kind]}の名前を入力してください`);

  const existing = map.pack[listKey];
  const id = existing.length || 1; // 0番は「所属なし」のための空要素
  const liveCount = existing.filter(isLive).length;
  const entity = {
    i: id, name: trimmed, fullName: trimmed, color: pickColor(liveCount, rnd),
    cells: 0, area: 0, rural: 0, urban: 0, burgs: 0,
  };
  if (kind === "state") { entity.capital = 0; entity.neighbors = []; }
  // 名前の仮生成が付ける補助項目（政体・神名など）。既存の必須項目は上書きさせない
  for (const k of EXTRA_KEYS) if (typeof extra?.[k] === "string" && extra[k].trim()) entity[k] = extra[k].trim();

  const list = existing.length ? existing.slice() : [null];
  list[id] = entity;

  const parts = [setList((m) => m.pack[listKey], (m, v) => { m.pack[listKey] = v; }, list)];
  return { command: makeCommand(`${LABEL_OF[kind]}を新規作成`, ["politics"], parts), id };
}

/**
 * 属州を新規作成する。属州は必ず1つの国家に属する。
 * @param {object} map
 * @param {{state:number, name:string, rnd?:object}} opts
 * @returns {{command:object, id:number}}
 */
export function planAddProvince(map, { state, name, rnd }) {
  const owner = map.pack.states[state];
  if (!isLive(owner) || !owner.i) throw new Error("その国家は存在しません");
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("属州の名前を入力してください");

  const existing = map.pack.provinces;
  const id = existing.length || 1;
  const liveCount = existing.filter(isLive).length;
  const entity = {
    i: id, state, name: trimmed, fullName: trimmed, color: pickColor(liveCount, rnd),
    cells: 0, area: 0, rural: 0, urban: 0, burgs: [],
  };

  const list = existing.length ? existing.slice() : [null];
  list[id] = entity;

  const parts = [setList((m) => m.pack.provinces, (m, v) => { m.pack.provinces = v; }, list)];
  return { command: makeCommand("属州を新規作成", ["politics"], parts), id };
}
