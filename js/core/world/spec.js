// WorldSpec（v4.0.0）。地理生成の入力を 1 つにまとめ、検証・既定値・範囲を持つ。
//   同じ worldSeed・WorldSpec・generatorVersion なら、地理の出力は一致する（歴史の乱数とは別系統）。
export const GENERATOR_VERSION = "4.0.0-alpha.1";
export const WORLD_SPEC_SCHEMA = 1;
export const ISLAND_MODES = Object.freeze({ few: 12, normal: 40, many: 90 });

export const DEFAULT_WORLD_SPEC = Object.freeze({
  schemaVersion: WORLD_SPEC_SCHEMA,
  generatorVersion: GENERATOR_VERSION,
  worldSeed: "",
  planet: Object.freeze({ radiusKm: 6371, displayProjection: "equirectangular" }),
  resolution: Object.freeze({ targetCells: 250000 }),
  landFraction: 0.5,
  continentCountTarget: 6,
  islandMode: "many",
  plateCount: 14,
  initialGroups: 12,
  climateModel: Object.freeze({ fantasyAdjustment: "default", lapseRateCPerKm: 6.5, windMoistureLengthKm: 4500 }),
});

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** 入力を検証し、既定値を補う。{ spec, errors }。errors が空でなければ生成してはならない */
export function normalizeWorldSpec(input = {}) {
  const errors = [], d = DEFAULT_WORLD_SPEC, i = isObj(input) ? input : {};
  const num = (v, def, lo, hi, name, int = false) => {
    if (v === undefined) return def;
    if (typeof v !== "number" || !Number.isFinite(v) || (int && !Number.isInteger(v)) || v < lo || v > hi) { errors.push(`${name} は ${lo}〜${hi}${int ? " の整数" : ""}（受け取った値: ${String(v)}）`); return def; }
    return v;
  };
  const spec = {
    schemaVersion: WORLD_SPEC_SCHEMA,
    generatorVersion: typeof i.generatorVersion === "string" ? i.generatorVersion : GENERATOR_VERSION,
    worldSeed: typeof i.worldSeed === "string" ? i.worldSeed : (i.worldSeed === undefined ? "" : String(i.worldSeed)),
    planet: {
      radiusKm: num(i.planet?.radiusKm, d.planet.radiusKm, 500, 100000, "planet.radiusKm"),
      displayProjection: i.planet?.displayProjection ?? d.planet.displayProjection,
    },
    resolution: { targetCells: num(i.resolution?.targetCells, d.resolution.targetCells, 500, 1000000, "resolution.targetCells", true) },
    landFraction: num(i.landFraction, d.landFraction, 0.1, 0.9, "landFraction"),
    continentCountTarget: num(i.continentCountTarget, d.continentCountTarget, 1, 12, "continentCountTarget", true),
    islandMode: i.islandMode ?? d.islandMode,
    plateCount: num(i.plateCount, d.plateCount, 4, 40, "plateCount", true),
    initialGroups: num(i.initialGroups, d.initialGroups, 1, 64, "initialGroups", true),
    climateModel: {
      fantasyAdjustment: i.climateModel?.fantasyAdjustment ?? d.climateModel.fantasyAdjustment,
      lapseRateCPerKm: num(i.climateModel?.lapseRateCPerKm, d.climateModel.lapseRateCPerKm, 0, 15, "climateModel.lapseRateCPerKm"),
      windMoistureLengthKm: num(i.climateModel?.windMoistureLengthKm, d.climateModel.windMoistureLengthKm, 200, 10000, "climateModel.windMoistureLengthKm"),
    },
  };
  if (!spec.worldSeed) errors.push("worldSeed が空（シードを指定してください。生成する場合は makeWorldSeed を使う）");
  if (!(spec.islandMode in ISLAND_MODES)) { errors.push(`islandMode は ${Object.keys(ISLAND_MODES).join("/")} のいずれか`); spec.islandMode = d.islandMode; }
  if (spec.planet.displayProjection !== "equirectangular") errors.push("displayProjection は現在 equirectangular のみ");
  if (isObj(input) && input.schemaVersion !== undefined && input.schemaVersion !== WORLD_SPEC_SCHEMA) errors.push(`schemaVersion ${input.schemaVersion} は未対応`);
  return { spec, errors };
}

/** 画面から生成するときの、見た目に分かりやすい種文字列（時刻に依存するので、決定性の対象外。生成後は保存して再現する） */
export function makeWorldSeed(now = Date.now()) {
  const s = Math.floor(now).toString(36), r = Math.floor((now * 9301 + 49297) % 233280).toString(36);
  return `W-${s}-${r}`.toUpperCase();
}
