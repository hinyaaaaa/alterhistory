// v6 M1: 世界生成設定（WorldConfig）。重要なパラメーターをコードに固定せず、ここに出す。
//   地理（WorldSpec）・自然法則・種族・魔法・暦・規模をひとつにまとめ、検証し、シードを系統別に分ける。
//   同じ設定と同じ worldSeed からは、同じ初期世界を作る（時刻・Math.random を使わない）。
import { normalizeWorldSpec } from "../world/spec.js";
import { normalizeCalendar } from "./calendar.js";
import { BIOMES } from "../civ/world-consts.js";
import { hashSeed } from "../civ/civ-state.js";
import { SPECIES } from "../civ/species.js";

export const WCDE_VERSION = "6.0.0-m5";
export const CONFIG_SCHEMA = 1;
export const DEFAULT_LAWS = Object.freeze({ disasterRate: 1, climateVolatility: 1, fertilityScale: 1 });
export const DEFAULT_MAGIC = Object.freeze({ enabled: false, rate: 1, name: "魔法" });
export const PREHISTORY_YEARS = 500000;

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const num = (errors, name, v, def, lo, hi) => { if (v === undefined) return def; if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) { errors.push(`${name} は ${lo}〜${hi}（受け取った値: ${String(v)}）`); return def; } return v; };
export const BIOME_KEYS = Object.freeze(Object.keys(BIOMES));

/** 独自種族の検証。出現（env=好む生態系）と特性は、人口・技術・軍事・寿命・魔法素質に実際に接続される */
export function normalizeSpecies(list, errors) {
  const out = [], seen = new Set(Object.keys(SPECIES));
  if (list === undefined) return out;
  if (!Array.isArray(list)) { errors.push("species は配列"); return out; }
  for (const [i, s] of list.entries()) {
    const p = `species[${i}]`;
    if (!isObj(s)) { errors.push(`${p} はオブジェクト`); continue; }
    if (typeof s.id !== "string" || !/^[a-z][a-z0-9_]{1,23}$/.test(s.id)) { errors.push(`${p}.id は英小文字で始まる 2〜24 文字（英数字と _）`); continue; }
    if (seen.has(s.id)) { errors.push(`${p}.id「${s.id}」は重複しています（組み込みの人間・エルフ・ドワーフ・獣人と重ならない名前に）`); continue; }
    seen.add(s.id);
    if (typeof s.ja !== "string" || !s.ja.trim()) { errors.push(`${p}.ja（表示名）は空でない文字列`); continue; }
    const env = s.env ?? [], envIds = [];
    if (!Array.isArray(env) || !env.length) { errors.push(`${p}.env（好む生態系）は1つ以上`); continue; }
    for (const b of env) { if (!(b in BIOMES) || BIOMES[b] === BIOMES.OCEAN) { errors.push(`${p}.env に未知・不可の生態系「${b}」（使える値: ${BIOME_KEYS.filter((k) => k !== "OCEAN").join(", ")}）`); continue; } envIds.push(BIOMES[b]); }
    if (envIds.length !== env.length) continue;
    out.push({ id: s.id, ja: s.ja.trim(), env: envIds, envKeys: [...env],
      lifespan: num(errors, `${p}.lifespan（月）`, s.lifespan, 960, 120, 120000), growth: num(errors, `${p}.growth`, s.growth, 1, 0.1, 3),
      techRate: num(errors, `${p}.techRate`, s.techRate, 1, 0.3, 2.5), martial: num(errors, `${p}.martial`, s.martial, 1, 0.3, 2.5), magic: num(errors, `${p}.magic`, s.magic, 0.002, 0, 0.1) });
  }
  return out;
}

/** 入力を検証して補う。errors が空でないときは生成してはならない */
export function normalizeWorldConfig(input = {}) {
  const errors = [], i = isObj(input) ? input : {};
  const name = typeof i.name === "string" && i.name.trim() ? i.name.trim() : "名もなき世界";
  const sp = normalizeWorldSpec({ ...(i.spec ?? {}), worldSeed: i.worldSeed ?? i.spec?.worldSeed });
  errors.push(...sp.errors);
  const laws = { disasterRate: num(errors, "laws.disasterRate", i.laws?.disasterRate, DEFAULT_LAWS.disasterRate, 0, 3), climateVolatility: num(errors, "laws.climateVolatility", i.laws?.climateVolatility, DEFAULT_LAWS.climateVolatility, 0, 3), fertilityScale: num(errors, "laws.fertilityScale", i.laws?.fertilityScale, DEFAULT_LAWS.fertilityScale, 0.3, 2) };
  const magic = { enabled: i.magic?.enabled === undefined ? DEFAULT_MAGIC.enabled : i.magic.enabled === true, rate: num(errors, "magic.rate", i.magic?.rate, DEFAULT_MAGIC.rate, 0, 5), name: typeof i.magic?.name === "string" && i.magic.name.trim() ? i.magic.name.trim() : DEFAULT_MAGIC.name };
  if (i.magic?.enabled !== undefined && typeof i.magic.enabled !== "boolean") errors.push("magic.enabled は真偽値");
  const species = normalizeSpecies(i.species, errors);
  const cal = normalizeCalendar(i.calendar); errors.push(...cal.errors);
  const prehistoryYears = num(errors, "prehistory.years", i.prehistory?.years, PREHISTORY_YEARS, 20000, 2000000);
  const config = { schema: CONFIG_SCHEMA, name, worldSeed: sp.spec.worldSeed, spec: sp.spec, laws, species, magic, calendar: cal.calendar, prehistory: { years: prehistoryYears }, detail: i.detail === "light" || i.detail === "fine" ? i.detail : "standard" };
  return { config, errors };
}

/** 世界生成用と歴史用の乱数を分ける。生成は worldSeed と設定だけから決まる（時刻に依存しない） */
export function derivedSeeds(config) {
  return { geography: config.worldSeed, prehistory: hashSeed(config.worldSeed, "prehistory", config.schema, config.prehistory.years, JSON.stringify(config.species.map((s) => s.id)), config.magic.enabled), species: hashSeed(config.worldSeed, "species") };
}
/** 独自種族を civ.speciesDefs へ（env は生態系の番号）。組み込み種族と同じ形 */
export const speciesDefsOf = (config) => Object.fromEntries(config.species.map((s) => [s.id, { id: s.id, ja: s.ja, lifespan: s.lifespan, growth: s.growth, techRate: s.techRate, martial: s.martial, magic: s.magic, env: s.env }]));
