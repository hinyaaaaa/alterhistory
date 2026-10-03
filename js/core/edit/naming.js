// 名前の仮生成：候補の作成・系統（文化ごとの名前の雰囲気）・「仮」フラグの管理。
//
// 生成器そのもの（音節の組み合わせ）は core/names/katakana.js。ここは地図の状態と結び付ける層:
//   ・既存の名前と被らない候補を選ぶ
//   ・都市・属州・国家・宗教が、どの文化の系統で名付けられるかを決める
//   ・生成された名前を「仮」として記録し、ユーザーが手で直したり確定したりしたら外す
//
// 保存先（ALTERHISTORY 拡張データ ext.data。Azgaar 互換で書き出すと失われる）:
//   ext.data.nameStyles       = { "culture:3": "nordic" }   文化ごとの名前の系統
//   ext.data.provisionalNames = { "burg:12": 1, "state:5": 1 }   「仮」の名前の印
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand } from "./commands.js";
import { ensureExt } from "./ext.js";
import {
  NAME_STYLES, STYLE_KEYS, DEFAULT_STYLE, isStyle,
  generatePlaceName, generateStateName, generateReligionName, generateCultureName, generateProvinceName,
} from "../names/katakana.js";

export { NAME_STYLES, STYLE_KEYS };
export const NAME_KINDS = ["burg", "state", "culture", "religion", "province"];

const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
const LIST = { burg: "burgs", state: "states", culture: "cultures", religion: "religions", province: "provinces" };

// ---------- 既存の名前 ----------

/** 地図上で既に使われている名前の集合（新しい名前が被らないようにするため） */
export function takenNames(map) {
  const s = new Set();
  for (const kind of NAME_KINDS) {
    for (const e of map.pack[LIST[kind]] ?? []) {
      if (!isLive(e)) continue;
      if (e.name) s.add(e.name);
      if (e.fullName) s.add(e.fullName);
    }
  }
  return s;
}

// ---------- 系統（文化ごとの名前の雰囲気） ----------

const styleKey = (cultureId) => `culture:${cultureId}`;

/** 文化に明示された系統。無ければ null */
export function getNameStyle(map, cultureId) {
  const v = map.ext?.data?.nameStyles?.[styleKey(cultureId)];
  return isStyle(v) ? v : null;
}

/** 文化の系統。明示が無ければ文化IDから決まる既定（同じ文化は常に同じ系統） */
export function styleOfCulture(map, cultureId) {
  const explicit = getNameStyle(map, cultureId);
  if (explicit) return explicit;
  if (!cultureId || cultureId < 0) return DEFAULT_STYLE;
  return STYLE_KEYS[(cultureId * 3 + 1) % STYLE_KEYS.length];
}

/** 文化の系統を変える。style が null/空なら既定に戻す。変更が無ければ null */
export function planSetNameStyle(map, cultureId, style) {
  const culture = map.pack.cultures?.[cultureId];
  if (!isLive(culture)) throw new Error("その文化は存在しません");
  const after = style ? String(style) : null;
  if (after && !isStyle(after)) throw new Error(`未対応の名前の系統です: ${after}`);
  const before = getNameStyle(map, cultureId);
  if (before === after) return null;
  const key = styleKey(cultureId);
  const write = (m, v) => {
    const ext = ensureExt(m);
    ext.data.nameStyles ??= {};
    if (v) ext.data.nameStyles[key] = v; else delete ext.data.nameStyles[key];
    if (!Object.keys(ext.data.nameStyles).length) delete ext.data.nameStyles;
  };
  return makeCommand("名前の系統を変更", [], [{ apply: (m) => write(m, after), revert: (m) => write(m, before) }]);
}

/** 実体が属する文化のID（分からなければ 0） */
function cultureIdFor(map, { kind, id, cell, cultureId, stateId }) {
  if (cultureId != null) return cultureId;
  const c = map.pack.cells;
  if (cell != null && c?.culture?.[cell] != null) return c.culture[cell];
  const stateCulture = (sid) => {
    const s = map.pack.states[sid];
    if (!isLive(s)) return 0;
    if (s.culture != null) return s.culture;
    const cap = map.pack.burgs[s.capital];
    return isLive(cap) ? cap.culture ?? 0 : 0;
  };
  if (stateId != null) return stateCulture(stateId);
  if (id != null) {
    const e = map.pack[LIST[kind]]?.[id];
    if (!isLive(e)) return 0;
    if (kind === "culture") return id;
    if (kind === "burg") return e.culture ?? 0;
    if (kind === "state") return stateCulture(id);
    if (kind === "province") return stateCulture(e.state);
    if (kind === "religion") return e.culture ?? 0;
  }
  return 0;
}

// ---------- 候補の生成 ----------

/**
 * 仮の名前を1つ作る。既存の名前とは被らない。
 * @param {object} map
 * @param {{kind:string, rnd:object, style?:string, cell?:number, cultureId?:number, stateId?:number, id?:number, form?:string, avoid?:Iterable<string>}} opts
 *   style を省略すると、cell / cultureId / stateId / id から文化を辿って系統を決める。
 *   辿れなければ乱数で系統を選ぶ。
 * @returns {{name:string, style:string, extra:object}}
 *   extra は新規作成時に実体へ足す項目（国家の政体、宗教の神名など）。
 */
export function suggestName(map, opts) {
  const { kind, rnd } = opts;
  if (!NAME_KINDS.includes(kind)) throw new Error(`名前を生成できない種類です: ${kind}`);
  if (!rnd) throw new Error("乱数(rnd)が必要です");

  let style = opts.style;
  if (!isStyle(style)) {
    const cid = cultureIdFor(map, opts);
    style = cid ? styleOfCulture(map, cid) : rnd.pick(STYLE_KEYS);
  }
  const taken = takenNames(map);
  if (opts.avoid) for (const n of opts.avoid) taken.add(n);

  const gen = () => {
    switch (kind) {
      case "burg": return { name: generatePlaceName(rnd, style), extra: {} };
      case "province": return { name: generateProvinceName(rnd, style), extra: {} };
      case "culture": return { name: generateCultureName(rnd, style), extra: {} };
      case "religion": { const r = generateReligionName(rnd, style); return { name: r.name, extra: { deity: r.deity, type: r.type, form: r.form } }; }
      case "state": { const r = generateStateName(rnd, style, opts.form); return { name: r.name, extra: { name: r.short, form: r.form, formName: r.formName } }; }
      default: throw new Error(kind);
    }
  };

  let last = gen();
  for (let i = 0; i < 60 && taken.has(last.name); i++) last = gen();
  // 60回試しても被る（名前の空間を使い切った）ときだけ、区別のための印を付ける
  if (taken.has(last.name)) {
    let n = 2;
    while (taken.has(`${last.name}${n}`)) n++;
    last = { ...last, name: `${last.name}${n}` };
  }
  return { ...last, style };
}

/** 候補を複数（互いに異なるもの）作る */
export function suggestNames(map, opts, count = 5) {
  const out = [];
  const avoid = new Set(opts.avoid ?? []);
  for (let i = 0; i < count; i++) {
    const s = suggestName(map, { ...opts, avoid });
    out.push(s);
    avoid.add(s.name);
  }
  return out;
}

// ---------- 「仮」フラグ ----------

const provKey = (kind, id) => `${kind}:${id}`;

/** 仮の名前か */
export function isProvisional(map, kind, id) {
  return !!map.ext?.data?.provisionalNames?.[provKey(kind, id)];
}

/** 仮の名前の一覧（[{kind, id}]） */
export function listProvisional(map) {
  return Object.keys(map.ext?.data?.provisionalNames ?? {}).map((k) => {
    const [kind, id] = k.split(":");
    return { kind, id: Number(id) };
  });
}

function provisionalPart(map, kind, id, flag) {
  const before = isProvisional(map, kind, id);
  const key = provKey(kind, id);
  const write = (m, v) => {
    const ext = ensureExt(m);
    ext.data.provisionalNames ??= {};
    if (v) ext.data.provisionalNames[key] = 1; else delete ext.data.provisionalNames[key];
    if (!Object.keys(ext.data.provisionalNames).length) delete ext.data.provisionalNames;
  };
  return { apply: (m) => write(m, flag), revert: (m) => write(m, before) };
}

/** 「仮」の印だけを付け外しする（名前は変えない）。変更が無ければ null */
export function planSetProvisional(map, kind, id, flag) {
  if (!NAME_KINDS.includes(kind)) throw new Error(`未対応の種類です: ${kind}`);
  if (!isLive(map.pack[LIST[kind]]?.[id])) throw new Error("その対象は存在しません");
  if (isProvisional(map, kind, id) === !!flag) return null;
  return makeCommand(flag ? "名前を仮に戻す" : "名前を確定", [], [provisionalPart(map, kind, id, !!flag)]);
}

/**
 * 既存のコマンドに「仮」フラグの更新を足して1つのコマンドにする。
 * 名前の変更とフラグの更新が同じ Undo で戻るようにするため。
 * すでに望みの状態なら、元のコマンドをそのまま返す。
 * （まだ存在しない実体 = 新規作成のときも使える。id は作成後の番号）
 */
export function withProvisional(map, command, kind, id, flag) {
  if (!command) return command;
  if (isProvisional(map, kind, id) === !!flag) return command;
  return makeCommand(command.label, command.layers, [...command.parts, provisionalPart(map, kind, id, !!flag)]);
}
