// 実マップが無い環境用: 合成マップを2つの名前で書き出す。 使い方: node tests/helpers/make-samples.mjs <出力フォルダ>
// その後 SAMPLES_DIR=<出力フォルダ> npm test
import { mkdirSync, writeFileSync } from "node:fs";
import { buildSyntheticMapText } from "./synth-map.mjs";
const dir = process.argv[2] ?? "tests/.samples";
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/境界線の貴方.map`, buildSyntheticMapText({ seed: 7 }).text);
writeFileSync(`${dir}/新世界より.map`, buildSyntheticMapText({ seed: 11 }).text);
console.log("合成マップを書き出しました:", dir);
