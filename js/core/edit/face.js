// 指導者の顔の「設計図」。指導者のID（と世代）から決定的に作る。ユーザーが顔を直接変える操作は作らない。
// 組合せは 1万通りを大きく超える（FACE_COMBINATIONS）。描画は ui/face-svg.js。
// 純粋ロジック層：DOM に依存しない。
import { createRandom } from "../random.js";

export const FACE_PARTS = Object.freeze({
  skin: ["#f6dcc4", "#eec39b", "#d9a36f", "#b97c4e", "#8d5a3a", "#5e3b27"],
  hairColor: ["#17130f", "#3a2616", "#6b4423", "#a3733a", "#c9ae7c", "#8c8c8c", "#d8d8d4"],
  hairStyleM: ["none", "short", "side", "wavy", "crop", "long", "bun", "cap"],
  hairStyleF: ["bob", "long", "bun", "braid", "wavy", "short", "twin", "veil"],
  beard: ["none", "stubble", "moustache", "goatee", "full", "mutton"],
  shape: ["oval", "round", "square", "long", "heart"],
  eyes: ["calm", "narrow", "wide", "sharp", "droop"],
  brows: ["thin", "thick", "arched", "straight"],
  outfit: ["#2f4a5c", "#5c2f2f", "#3b4a2f", "#4a3b5c", "#2b2b30", "#6b5a2f"],
  hat: ["none", "crown", "cap", "helmet", "turban", "tall"],
  medal: ["none", "one", "two", "sash", "chain"],
  bg: ["#1d2a2e", "#2a2420", "#232433", "#2a2e22", "#33262a", "#22282b"],
});
const P = FACE_PARTS;
const AGE_BANDS = 4;
/** 組合せの総数（男性・女性の合計） */
export const FACE_COMBINATIONS = AGE_BANDS * P.skin.length * P.hairColor.length * P.shape.length * P.eyes.length * P.brows.length * P.outfit.length * P.hat.length * P.medal.length * P.bg.length
  * (P.hairStyleM.length * P.beard.length + P.hairStyleF.length);

export const ageBandOf = (age) => (age < 30 ? 0 : age < 50 ? 1 : age < 65 ? 2 : 3);

/** 指導者の id と世代から顔を決める。同じ入力なら常に同じ顔 */
export function faceSpec({ id = 0, gen = 1, gender = "m", age = 40 }) {
  const rnd = createRandom((Number(id) + 1) * 7919 + Number(gen) * 104729);
  const pick = (a) => rnd.pick(a);
  const spec = { gender: gender === "f" ? "f" : "m", band: ageBandOf(age) };
  spec.skin = pick(P.skin); spec.hairColor = pick(P.hairColor);
  spec.hairStyle = pick(spec.gender === "f" ? P.hairStyleF : P.hairStyleM);
  spec.beard = spec.gender === "f" ? "none" : pick(P.beard);
  spec.shape = pick(P.shape); spec.eyes = pick(P.eyes); spec.brows = pick(P.brows);
  spec.outfit = pick(P.outfit); spec.hat = pick(P.hat); spec.medal = pick(P.medal); spec.bg = pick(P.bg);
  if (spec.band === 3 && rnd.chance(0.7)) spec.hairColor = P.hairColor[6]; // 高齢は白髪が多い
  return spec;
}
