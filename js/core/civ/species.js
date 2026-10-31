// V5-M8: 種族（人間・エルフ・ドワーフ・獣人）。非人間も国家・文化・宗教・言語・技術を持てる。種族差は属性として人口・技術・軍事・寿命・魔法素質に効く（詳細な品質調整は 5.x）。
import { BIOMES } from "./world-consts.js";
// lifespan: 月。growth/techRate/martial: 倍率。magic: 魔法素質の相対頻度（人間=0.002 を基準）。env: 好む生態系
export const SPECIES = Object.freeze({
  human: { id: "human", ja: "人間", lifespan: 960, growth: 1, techRate: 1, martial: 1, magic: 0.002, env: [] },
  elf: { id: "elf", ja: "エルフ", lifespan: 4800, growth: 0.55, techRate: 1.1, martial: 0.95, magic: 0.02, env: [BIOMES.TEMPERATE_FOREST, BIOMES.TAIGA, BIOMES.RAINFOREST] },
  dwarf: { id: "dwarf", ja: "ドワーフ", lifespan: 2400, growth: 0.8, techRate: 1.12, martial: 1.15, magic: 0.004, env: [BIOMES.ALPINE, BIOMES.COLD_DESERT, BIOMES.TAIGA] },
  beastfolk: { id: "beastfolk", ja: "獣人", lifespan: 600, growth: 1.05, techRate: 0.9, martial: 1.2, magic: 0.003, env: [BIOMES.SAVANNA, BIOMES.GRASSLAND, BIOMES.TROPICAL_SEASONAL] },
});
// v6: 世界設定で作った独自種族は civ.speciesDefs に入る（civ を渡すと優先して引く。渡さなければ従来どおり組み込み種族）
export const speciesOf = (id, civ = null) => civ?.speciesDefs?.[id] ?? SPECIES[id] ?? SPECIES.human;
export const lifeScale = (civ, st) => { const g = civ.groups[st.capitalGroupId]; const sp = g?.cohorts?.length ? speciesOf(g.cohorts.reduce((b, c) => (c.share > b.share ? c : b)).speciesId, civ) : SPECIES.human; return sp.lifespan / SPECIES.human.lifespan; };
/** 初期集団の種族を決める（開始集団は元のまま。ほかは生息環境に合う非人間種族をときどき割り当てる。rng は historySeed 由来） */
export function assignSpecies(world, civ, rng, { mix = 0.4 } = {}) {
  for (const id of Object.keys(civ.groups).sort()) {
    const g = civ.groups[id]; if (g.player) continue; const b = world.cell.biome[g.cell], cands = [...Object.values(SPECIES), ...Object.values(civ.speciesDefs ?? {})].filter((s) => s.id !== "human" && s.env.includes(b));
    if (cands.length && rng() < mix) { const sp = cands[Math.floor(rng() * cands.length)]; g.speciesId = sp.id; for (const c of g.cohorts) c.speciesId = sp.id; }
  }
  for (const g of Object.values(civ.groups)) civ.species[g.speciesId] ??= { id: g.speciesId, name: speciesOf(g.speciesId, civ).ja, bornAt: civ.monthIndex };
}
