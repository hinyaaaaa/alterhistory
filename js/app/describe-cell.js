// セルの説明（地理の事実を人が読める形にする）。世界（World）だけから求める純粋関数。
import { BIOME_NAMES, RES_NAMES } from "../core/world/worldgen.js";
import { SOIL_NAMES } from "../render/world-colors.js";

export function describeCell(world, c) {
  if (!world || c == null || c < 0) return null;
  const k = world.cell, res = Object.entries(RES_NAMES).filter(([b]) => k.resource[c] & Number(b)).map(([, n]) => n);
  const group = world.entities.populations.find((p) => p.cell === c);
  return {
    cell: c, lat: k.lat[c] * 180 / Math.PI, lon: k.lon[c] * 180 / Math.PI, elevation: k.elevation[c], kind: ["海", "陸", "湖"][k.landWater[c]], biome: BIOME_NAMES[k.biome[c]], temp: k.temp[c], precip: k.precip[c],
    fertility: k.fertility[c], soil: SOIL_NAMES[k.soil[c]], resources: res, river: k.river[c] === 1, riverFlow: k.riverFlow[c], coastDist: k.coastDist[c], areaKm2: k.areaKm2[c], capacity: k.capacity[c], group: group ? group.id : null,
  };
}
