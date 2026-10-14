// 指導者の顔を SVG で描く（設計図は core/edit/face.js）。ユーザーが顔を直接変える操作は無い。
// 見た目は静かな暗色の肖像画。小さな図形の重ね合わせで、組合せの違いを出す。

const SHAPES = { oval: [38, 48], round: [43, 44], square: [42, 46], long: [34, 52], heart: [40, 48] };
const EYE = { calm: [5, 2.6, 0], narrow: [5.5, 1.6, 0], wide: [5, 3.4, 0], sharp: [5.5, 2, -1.5], droop: [5, 2.4, 1.5] };

export function faceSvg(spec, size = 120) {
  const s = spec, [rx, ry] = SHAPES[s.shape] ?? SHAPES.oval;
  const [er, eh, tilt] = EYE[s.eyes] ?? EYE.calm;
  const cx = 60, cy = 62, hair = s.hairColor, dark = "#1a1612", f = s.gender === "f";
  const p = [];
  p.push(`<rect width="120" height="130" fill="${s.bg}"/>`);
  // 服・肩
  p.push(`<path d="M8 130 Q10 98 40 94 L80 94 Q110 98 112 130 Z" fill="${s.outfit}"/>`);
  if (s.medal === "sash") p.push(`<path d="M34 96 L86 130 L72 130 L30 100 Z" fill="#b8a15a" opacity=".85"/>`);
  if (s.medal === "chain") p.push(`<path d="M42 98 Q60 118 78 98" fill="none" stroke="#d8c273" stroke-width="3" stroke-dasharray="3 2"/>`);
  if (s.medal === "one" || s.medal === "two") p.push(`<circle cx="82" cy="108" r="4.5" fill="#d8c273"/>`);
  if (s.medal === "two") p.push(`<circle cx="70" cy="112" r="3.6" fill="#c7c7c7"/>`);
  // 首
  p.push(`<rect x="50" y="${cy + ry - 8}" width="20" height="${34 - (ry - 44)}" fill="${s.skin}"/><rect x="50" y="${cy + ry - 8}" width="20" height="8" fill="#000" opacity=".12"/>`);
  // 髪（後ろ）
  const longHair = ["long", "bob", "braid", "wavy", "twin"].includes(s.hairStyle);
  if (longHair) p.push(`<path d="M${cx - rx - 6} ${cy + (s.hairStyle === "bob" ? 18 : 40)} Q${cx - rx - 10} ${cy - ry - 6} ${cx} ${cy - ry - 8} Q${cx + rx + 10} ${cy - ry - 6} ${cx + rx + 6} ${cy + (s.hairStyle === "bob" ? 18 : 40)} Z" fill="${hair}"/>`);
  if (s.hairStyle === "braid") p.push(`<path d="M${cx + rx - 2} ${cy + 10} q8 20 2 40" stroke="${hair}" stroke-width="7" fill="none"/>`);
  if (s.hairStyle === "twin") p.push(`<circle cx="${cx - rx - 4}" cy="${cy - 8}" r="8" fill="${hair}"/><circle cx="${cx + rx + 4}" cy="${cy - 8}" r="8" fill="${hair}"/>`);
  // 耳・顔
  p.push(`<ellipse cx="${cx - rx}" cy="${cy + 2}" rx="5" ry="8" fill="${s.skin}"/><ellipse cx="${cx + rx}" cy="${cy + 2}" rx="5" ry="8" fill="${s.skin}"/>`);
  const face = s.shape === "square" ? `<rect x="${cx - rx}" y="${cy - ry}" width="${rx * 2}" height="${ry * 2}" rx="14" fill="${s.skin}"/>`
    : s.shape === "heart" ? `<path d="M${cx - rx} ${cy - ry + 14} Q${cx} ${cy - ry - 10} ${cx + rx} ${cy - ry + 14} Q${cx + rx - 4} ${cy + 20} ${cx} ${cy + ry} Q${cx - rx + 4} ${cy + 20} ${cx - rx} ${cy - ry + 14} Z" fill="${s.skin}"/>`
    : `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${s.skin}"/>`;
  p.push(face);
  // 年齢のしわ
  if (s.band >= 2) p.push(`<path d="M${cx - 18} ${cy - 18} h36 M${cx - 16} ${cy - 13} h32" stroke="#000" opacity=".12" stroke-width="1.2"/>`);
  if (s.band === 3) p.push(`<path d="M${cx - 20} ${cy + 14} q4 6 8 0 M${cx + 12} ${cy + 14} q4 6 8 0" stroke="#000" opacity=".15" fill="none"/>`);
  // 髪（前）
  const top = cy - ry;
  const front = {
    short: `<path d="M${cx - rx} ${top + 14} Q${cx - rx + 2} ${top - 6} ${cx} ${top - 6} Q${cx + rx - 2} ${top - 6} ${cx + rx} ${top + 14} Q${cx} ${top + 4} ${cx - rx} ${top + 14} Z" fill="${hair}"/>`,
    side: `<path d="M${cx - rx} ${top + 16} Q${cx - rx} ${top - 8} ${cx + 4} ${top - 6} Q${cx + rx} ${top - 4} ${cx + rx} ${top + 14} Q${cx + 6} ${top - 2} ${cx - rx + 6} ${top + 10} Z" fill="${hair}"/>`,
    wavy: `<path d="M${cx - rx - 2} ${top + 18} Q${cx - rx} ${top - 10} ${cx} ${top - 8} Q${cx + rx} ${top - 10} ${cx + rx + 2} ${top + 18} Q${cx + 14} ${top + 6} ${cx} ${top + 12} Q${cx - 14} ${top + 6} ${cx - rx - 2} ${top + 18} Z" fill="${hair}"/>`,
    crop: `<path d="M${cx - rx + 2} ${top + 10} Q${cx} ${top - 4} ${cx + rx - 2} ${top + 10} L${cx + rx - 2} ${top + 4} Q${cx} ${top - 8} ${cx - rx + 2} ${top + 4} Z" fill="${hair}"/>`,
    long: `<path d="M${cx - rx} ${top + 16} Q${cx} ${top - 10} ${cx + rx} ${top + 16} Q${cx} ${top + 2} ${cx - rx} ${top + 16} Z" fill="${hair}"/>`,
    bun: `<circle cx="${cx}" cy="${top - 10}" r="9" fill="${hair}"/><path d="M${cx - rx} ${top + 14} Q${cx} ${top - 8} ${cx + rx} ${top + 14} Q${cx} ${top + 4} ${cx - rx} ${top + 14} Z" fill="${hair}"/>`,
    cap: `<path d="M${cx - rx} ${top + 12} Q${cx} ${top - 4} ${cx + rx} ${top + 12} Q${cx} ${top + 6} ${cx - rx} ${top + 12} Z" fill="${hair}"/>`,
    bob: `<path d="M${cx - rx - 2} ${top + 20} Q${cx} ${top - 12} ${cx + rx + 2} ${top + 20} L${cx + rx - 4} ${top + 10} Q${cx} ${top + 2} ${cx - rx + 4} ${top + 10} Z" fill="${hair}"/>`,
    braid: `<path d="M${cx - rx} ${top + 16} Q${cx} ${top - 10} ${cx + rx} ${top + 16} Q${cx} ${top + 4} ${cx - rx} ${top + 16} Z" fill="${hair}"/>`,
    twin: `<path d="M${cx - rx} ${top + 14} Q${cx} ${top - 8} ${cx + rx} ${top + 14} Q${cx} ${top + 4} ${cx - rx} ${top + 14} Z" fill="${hair}"/>`,
    veil: `<path d="M${cx - rx - 6} ${cy + 46} Q${cx - rx - 8} ${top - 8} ${cx} ${top - 10} Q${cx + rx + 8} ${top - 8} ${cx + rx + 6} ${cy + 46} L${cx + rx - 2} ${cy + 20} Q${cx} ${top + 8} ${cx - rx + 2} ${cy + 20} Z" fill="${hair}" opacity=".9"/>`,
    none: s.band >= 2 ? `<path d="M${cx - rx} ${cy - 6} Q${cx - rx - 2} ${cy - 22} ${cx - rx + 6} ${cy - 24} M${cx + rx} ${cy - 6} Q${cx + rx + 2} ${cy - 22} ${cx + rx - 6} ${cy - 24}" stroke="${hair}" stroke-width="5" fill="none"/>` : "",
  }[s.hairStyle] ?? "";
  p.push(front);
  // 目・眉・鼻・口
  const ey = cy - 4;
  for (const sx of [-1, 1]) {
    const x = cx + sx * 15;
    p.push(`<ellipse cx="${x}" cy="${ey}" rx="${er}" ry="${eh}" fill="#f3f0e8" transform="rotate(${sx * tilt} ${x} ${ey})"/><circle cx="${x}" cy="${ey}" r="${Math.min(2.4, eh)}" fill="${dark}"/>`);
    const by = ey - 9 - (s.brows === "arched" ? 1 : 0), bw = s.brows === "thick" ? 3.2 : s.brows === "thin" ? 1.2 : 2;
    p.push(`<path d="M${x - 8} ${by + (s.brows === "straight" ? 0 : 2 * sx * -1 + 2)} L${x + 8} ${by + (s.brows === "straight" ? 0 : 2 * sx + 2)}" stroke="${hair}" stroke-width="${bw}" stroke-linecap="round"/>`);
  }
  p.push(`<path d="M${cx - 2} ${cy + 2} q-4 10 2 11 q5 0 3 -2" stroke="#000" opacity=".28" fill="none" stroke-width="1.6"/>`);
  p.push(`<path d="M${cx - 8} ${cy + 24} q8 ${f ? 4 : 2} 16 0" stroke="${f ? "#a14b4b" : "#5a2d2d"}" stroke-width="${f ? 3 : 2}" fill="none" stroke-linecap="round"/>`);
  // ひげ
  const bd = s.beard;
  if (bd === "stubble") p.push(`<path d="M${cx - 22} ${cy + 18} Q${cx} ${cy + ry + 6} ${cx + 22} ${cy + 18} Q${cx} ${cy + 26} ${cx - 22} ${cy + 18} Z" fill="${hair}" opacity=".35"/>`);
  if (bd === "moustache" || bd === "full" || bd === "mutton") p.push(`<path d="M${cx - 14} ${cy + 18} Q${cx} ${cy + 12} ${cx + 14} ${cy + 18} Q${cx} ${cy + 24} ${cx - 14} ${cy + 18} Z" fill="${hair}"/>`);
  if (bd === "goatee") p.push(`<path d="M${cx - 8} ${cy + 28} Q${cx} ${cy + ry + 10} ${cx + 8} ${cy + 28} Z" fill="${hair}"/>`);
  if (bd === "full") p.push(`<path d="M${cx - rx + 2} ${cy + 6} Q${cx - rx + 4} ${cy + ry + 8} ${cx} ${cy + ry + 8} Q${cx + rx - 4} ${cy + ry + 8} ${cx + rx - 2} ${cy + 6} Q${cx} ${cy + 30} ${cx - rx + 2} ${cy + 6} Z" fill="${hair}" opacity=".95"/>`);
  if (bd === "mutton") p.push(`<path d="M${cx - rx} ${cy - 4} v22 M${cx + rx} ${cy - 4} v22" stroke="${hair}" stroke-width="7"/>`);
  // 帽子
  const h = s.hat, tp = cy - ry;
  if (h === "crown") p.push(`<path d="M${cx - 24} ${tp + 4} L${cx - 22} ${tp - 16} L${cx - 10} ${tp - 6} L${cx} ${tp - 20} L${cx + 10} ${tp - 6} L${cx + 22} ${tp - 16} L${cx + 24} ${tp + 4} Z" fill="#d8c273" stroke="#8d7a2f" stroke-width="1.5"/>`);
  if (h === "cap") p.push(`<path d="M${cx - rx} ${tp + 10} Q${cx} ${tp - 14} ${cx + rx} ${tp + 10} L${cx + rx + 8} ${tp + 12} L${cx - rx} ${tp + 12} Z" fill="${s.outfit}" stroke="#000" stroke-opacity=".3"/>`);
  if (h === "helmet") p.push(`<path d="M${cx - rx - 2} ${tp + 14} Q${cx} ${tp - 22} ${cx + rx + 2} ${tp + 14} Z" fill="#7d8186" stroke="#3a3d40" stroke-width="1.5"/>`);
  if (h === "turban") p.push(`<ellipse cx="${cx}" cy="${tp + 2}" rx="${rx + 4}" ry="14" fill="#e6e0d0"/><path d="M${cx - rx} ${tp + 2} Q${cx} ${tp + 12} ${cx + rx} ${tp + 2}" stroke="#a89f86" fill="none"/>`);
  if (h === "tall") p.push(`<rect x="${cx - 20}" y="${tp - 26}" width="40" height="30" fill="#25252b"/><rect x="${cx - rx - 6}" y="${tp + 2}" width="${rx * 2 + 12}" height="5" fill="#25252b"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 130" width="${size}" height="${Math.round((size * 130) / 120)}" class="face-svg" role="img" aria-label="指導者の肖像">${p.join("")}</svg>`;
}
