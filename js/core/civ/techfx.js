// 技術の効果（他のモジュールから参照する小さな関数。tech.js から循環させないため分離）
export const has = (g, key) => g.tech.known[key] != null;
/** 収容力への倍率（農業系の技術） */
export const densityMult = (g) => { const k = g.tech.known; return 1 + (k.irrigation != null ? 0.15 : 0) + (k.plow != null ? 0.2 : 0) + (k.crop_rotation != null ? 0.25 : 0) + (k.sanitation != null ? 0.1 : 0); };
/** 軍事力の倍率（国家が採用した技術から） */
export const milMult = (state) => { const a = state.techAdopted; return 1 + (a.bronze_weapons != null ? 0.2 : 0) + (a.iron_weapons != null ? 0.35 : 0) + (a.cavalry != null ? 0.3 : 0) + (a.fortification != null ? 0.1 : 0) + (a.gunpowder != null ? 0.8 : 0); };
/** 税収の倍率 */
export const taxMult = (state) => { const a = state.techAdopted; return 1 + (a.administration != null ? 0.25 : 0) + (a.coinage != null ? 0.2 : 0) + (a.bureaucracy != null ? 0.3 : 0) + (a.banking != null ? 0.25 : 0); };
