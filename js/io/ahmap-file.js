// .ahmap（v2）— このアプリ唯一の保存形式（v5.0.0 V5-M0）。
//   世界（球面の地理）は正本チャンク、国家運営層の状態は拡張チャンク "app.map-state"、開始集団は "entities.start"。
//   Azgaar の .map と旧 .ahmap（v1）は読み込まない（互換性を廃止した。DECISIONS.md 参照）。読めないファイルは変更せず、理由を伝える。
// 純粋ロジック（DOM 非依存）。圧縮は CompressionStream（ブラウザ・Node 22）。
import { encodeAhmap2, decodeAhmap2, Ahmap2Error, AHMAP2_MAGIC } from "../core/world/ahmap2.js";
import { worldToMap } from "../core/world-bridge.js";
import { encodeCiv, decodeCiv, CIV_CHUNK } from "../core/civ/civ-state.js";
import { serializeMapState, applyMapState, MAP_STATE_CHUNK } from "./map-state.js";
import { inspectMap } from "./inspect.js";
import { migrateToV240 } from "../core/edit/migrate.js";

export const AHMAP_EXT = "ahmap";
export const START_CHUNK = "entities.start";
export { CIV_CHUNK };
const enc = new TextEncoder(), dec = new TextDecoder();

export class LoadError extends Error { constructor(message, cause) { super(message); this.name = "LoadError"; this.cause = cause; } }

export const isAhmap2Bytes = (bytes) => bytes.length >= 8 && dec.decode(bytes.subarray(0, 8)) === AHMAP2_MAGIC;

/** 保存用のバイト列。map.world が無い地図（世界が無い）は保存できない */
export async function saveMapBytes(map, { appVersion = "", savedAt = "" } = {}) {
  const world = map?.world; if (!world) throw new Error("世界のデータがない地図は保存できません");
  const ext = { ...(map.fileExt?.extensions ?? {}) };
  ext[MAP_STATE_CHUNK] = enc.encode(JSON.stringify(serializeMapState(map, { savedAt })));
  if (map.civ) ext[CIV_CHUNK] = encodeCiv(map.civ); else delete ext[CIV_CHUNK];
  if (world.entities.start) ext[START_CHUNK] = enc.encode(JSON.stringify(world.entities.start)); else delete ext[START_CHUNK];
  const r = await encodeAhmap2(world, { appVersion, savedAt, extensions: ext, reuse: map.fileExt?.chunkCache });
  map.fileExt = { extensions: ext, chunkCache: r.chunkCache };
  return r.bytes;
}

/** @returns {Promise<{map:object, warnings:string[]}>} */
export async function loadMapBytes(bytes) {
  if (!bytes?.length) throw new LoadError("ファイルが空です");
  if (!isAhmap2Bytes(bytes)) throw new LoadError("この形式は読み込めません。ALTERHISTORY は .ahmap（v2）だけを扱います（Azgaar の .map と旧形式の .ahmap は対応を終了しました）。元のファイルは変更していません");
  let d; try { d = await decodeAhmap2(bytes); } catch (e) {
    if (e instanceof Ahmap2Error) throw new LoadError(`${e.message}${e.problems.length ? "（" + e.problems.slice(0, 3).join("／") + (e.problems.length > 3 ? ` ほか${e.problems.length - 3}件` : "") + "）" : ""}。元のファイルは変更していません`, e);
    throw new LoadError(`読み込めませんでした: ${e.message}`, e);
  }
  const warnings = [], { world, extensions, chunkCache } = d;
  let start = null; if (extensions.has(START_CHUNK)) { try { start = JSON.parse(dec.decode(extensions.get(START_CHUNK))); } catch { warnings.push("保存された開始集団の情報を読めなかったため、選び直してください"); } }
  world.entities.start = start; world.generation = null;
  const map = worldToMap(world);
  if (extensions.has(MAP_STATE_CHUNK)) { let st = null; try { st = JSON.parse(dec.decode(extensions.get(MAP_STATE_CHUNK))); } catch { /* applyMapState が警告する */ } applyMapState(map, st, warnings); }
  if (extensions.has(CIV_CHUNK)) { try { map.civ = decodeCiv(extensions.get(CIV_CHUNK)); } catch (e) { warnings.push(`人口集団・集落の履歴を読めなかったため、歴史の開始前の状態に戻しました（${e.message}）`); } }
  map.fileExt = { extensions: Object.fromEntries(extensions), chunkCache };
  migrateToV240(map);
  warnings.push(...inspectMap(map));
  return { map, warnings };
}

export async function loadMapFile(file) { return loadMapBytes(new Uint8Array(await file.arrayBuffer())); }
