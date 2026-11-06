// v6 M1: 世界生成設定（WorldConfig）。重要なパラメーターをコードに固定せず、ここに出す。
//   地理（WorldSpec）・自然法則・種族・魔法・暦・規模をひとつにまとめ、検証し、シードを系統別に分ける。
//   同じ設定と同じ worldSeed からは、同じ初期世界を作る（時刻・Math.random を使わない）。
import { normalizeWorldSpec } from "../world/spec.js";
import { normalizeCalendar } from "./calendar.js";
import { BIOMES } from "../civ/world-consts.js";
import { hashSeed } from "../civ/civ-state.js";

export const WCDE_VERSION = "6.1.0";
export const CONFIG_SCHEMA = 2; // v6.1.0: 魔法・独自種族の設定を廃止。自然法則に生態系の項目を追加
export const DEFAULT_LAWS = Object.freeze({ disasterRate: 1, climateVolatility: 1, fertilityScale: 1, faunaRichness: 1, ecoResilience: 1 });
export const PREHISTORY_YEARS = 500000;
export const NEOLITHIC_YEARS = 10000; // 既定: 年 0（歴史の始まり）の約 9,500 年前に新石器が始まりうる（史実の「肥沃な三日月地帯の農耕の始まり」と第一王朝のあいだの長さ）
/** 計算・描画の解像度（セル数）。世界のスケール・自然法則・時間の意味は変えない（国家の規模を自動的に小さくしない） */
export const RESOLUTION = Object.freeze({ standard: 3000, extra: 6000, max: 20000, choices: Object.freeze([3000, 6000]) });

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const num = (errors, name, v, def, lo, hi) => { if (v === undefined) return def; if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) { errors.push(`${name} は ${lo}〜${hi}（受け取った値: ${String(v)}）`); return def; } return v; };
export const BIOME_KEYS = Object.freeze(Object.keys(BIOMES));

/** 入力を検証して補う。errors が空でないときは生成してはならない */
export function normalizeWorldConfig(input = {}) {
  const errors = [], i = isObj(input) ? input : {};
  const name = typeof i.name === "string" && i.name.trim() ? i.name.trim() : "名もなき世界";
  // v6.1.0 §4.2: 標準の解像度は 3,000 セル（長期シミュレーションのメモリと速度を優先）。6,000 は追加設定。20,000 を超える値は受け付けない（ベンチマークとメモリ試験の後に開放を判断する）
  const given = i.spec?.resolution?.targetCells, cells = given ?? RESOLUTION.standard;
  if (given !== undefined && !(typeof given === "number" && given <= RESOLUTION.max)) errors.push(`resolution.targetCells は ${RESOLUTION.max} 以下（受け取った値: ${String(given)}）`);
  const sp = normalizeWorldSpec({ ...(i.spec ?? {}), resolution: { ...(i.spec?.resolution ?? {}), targetCells: Math.min(RESOLUTION.max, cells) }, worldSeed: i.worldSeed ?? i.spec?.worldSeed });
  errors.push(...sp.errors);
  const laws = { disasterRate: num(errors, "laws.disasterRate", i.laws?.disasterRate, DEFAULT_LAWS.disasterRate, 0, 3), climateVolatility: num(errors, "laws.climateVolatility", i.laws?.climateVolatility, DEFAULT_LAWS.climateVolatility, 0, 3), fertilityScale: num(errors, "laws.fertilityScale", i.laws?.fertilityScale, DEFAULT_LAWS.fertilityScale, 0.3, 2), faunaRichness: num(errors, "laws.faunaRichness", i.laws?.faunaRichness, DEFAULT_LAWS.faunaRichness, 0.2, 2), ecoResilience: num(errors, "laws.ecoResilience", i.laws?.ecoResilience, DEFAULT_LAWS.ecoResilience, 0.3, 2) };
  const cal = normalizeCalendar(i.calendar); errors.push(...cal.errors);
  const prehistoryYears = num(errors, "prehistory.years", i.prehistory?.years, PREHISTORY_YEARS, 20000, 2000000);
  const neolithicYears = num(errors, "prehistory.neolithicYears", i.prehistory?.neolithicYears, NEOLITHIC_YEARS, 1000, 60000); // 先史の終わりから数えて、農耕などが現れうる最も早い時期
  const config = { schema: CONFIG_SCHEMA, name, worldSeed: sp.spec.worldSeed, spec: sp.spec, laws, calendar: cal.calendar, prehistory: { years: prehistoryYears, neolithicYears }, detail: i.detail === "light" || i.detail === "fine" ? i.detail : "standard" };
  return { config, errors };
}

/** 世界生成用と歴史用の乱数を分ける。生成は worldSeed と設定だけから決まる（時刻に依存しない） */
export function derivedSeeds(config) {
  return { geography: config.worldSeed, prehistory: hashSeed(config.worldSeed, "prehistory", config.schema, config.prehistory.years), lineage: hashSeed(config.worldSeed, "lineage"), ecosystem: hashSeed(config.worldSeed, "ecosystem") };
}
