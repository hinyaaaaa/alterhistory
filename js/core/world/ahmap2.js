// .ahmap v2 コンテナ（v4.0.0 / V4-M2）。正本をロスレスに、名前つきの型付き配列チャンクで保存する。
//   [マジック 8B "AHMAP2\0\0"] [コンテナ版 u32] [manifest 長 u32] [manifest: UTF-8 JSON] [チャンク本体…]
//   ・manifest に各チャンクの型・要素数・圧縮・長さ・CRC32・位置を持つ。形式版・スキーマ版・アプリ版は別々。
//   ・チャンクごとに gzip。更新されていないチャンクは、前回の圧縮結果を再利用できる（reuse）。
//   ・未知のチャンク（拡張・将来版）は読み込み時に保持し、書き出し時に必ず戻す（古い経路で消さない）。
//   ・読み込みは検証してから採用する。壊れたデータを 0 に置き換えて続行しない（具体的な理由を例外で返す）。
//   純粋ロジック（DOM 非依存）。圧縮は CompressionStream（ブラウザ・Node 22）。
import { validateSphereMesh, MESH_VERSION } from "./sphere-mesh.js";
import { validateWorld, worldHash, BIOME_NAMES } from "./worldgen.js";
import { WORLD_SPEC_SCHEMA, normalizeWorldSpec } from "./spec.js";

export const AHMAP2_MAGIC = "AHMAP2\0\0";
export const AHMAP2_CONTAINER_VERSION = 1;
export const AHMAP2_SCHEMA_VERSION = 1;
const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

const TYPES = { f32: Float32Array, u8: Uint8Array, u16: Uint16Array, i32: Int32Array, u32: Uint32Array };
const typeName = (a) => (a instanceof Float32Array ? "f32" : a instanceof Uint8Array ? "u8" : a instanceof Uint16Array ? "u16" : a instanceof Int32Array ? "i32" : a instanceof Uint32Array ? "u32" : null);

// 必須チャンクと、セル配列の一覧（chunkName → world.cell のキー）
const CELL_ARRAYS = ["elevation", "landWater", "plate", "temp", "precip", "biome", "soil", "fertility", "resource", "riverTo", "riverFlow", "river", "basin", "coastDist", "capacity", "areaKm2", "lat", "lon", "volcanic", "filled", "continent", "mountain"];
const GEOM = { "geom.centerXYZ": "centerXYZ", "geom.verticesXYZ": "vertexXYZ", "geom.neighborOffsets": "neighborOffsets", "geom.neighborIds": "neighborIds", "geom.cellVertexIds": "cellVertexIds" };
export const REQUIRED_CHUNKS = ["world.spec", ...Object.keys(GEOM), ...CELL_ARRAYS.map((k) => `cell.${k}`), "entities.populations", "world.stats"];

let crcTable = null;
export function crc32(bytes) {
  if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function pipe(bytes, stream) { const out = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer(); return new Uint8Array(out); }
const gzip = (b) => pipe(b, new CompressionStream("gzip"));
const gunzip = (b) => pipe(b, new DecompressionStream("gzip"));
const enc = new TextEncoder(), dec = new TextDecoder("utf-8", { fatal: true });
const rawOf = (arr) => new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);

/**
 * 世界をコンテナに書き出す。戻り値: { bytes: Uint8Array, manifest, chunkCache }
 * options: { appVersion, savedAt, extensions: {name: Uint8Array}（未知チャンクの保持）, reuse: chunkCache（前回の保存結果）, extraManifest }
 */
export async function encodeAhmap2(world, options = {}) {
  if (!LE) throw new Error("リトルエンディアン以外の環境は未対応");
  const chunks = [], cache = new Map(), reuse = options.reuse instanceof Map ? options.reuse : new Map();
  const add = async (name, kind, raw, meta = {}) => {
    const crc = crc32(raw), prev = reuse.get(name);
    let stored, codec = "raw";
    if (prev && prev.crc === crc && prev.rawBytes === raw.length) { stored = prev.stored; codec = prev.codec; }
    else if (raw.length > 256) { stored = await gzip(raw); codec = "gzip"; } else stored = raw;
    cache.set(name, { crc, rawBytes: raw.length, stored, codec });
    chunks.push({ name, kind, codec, rawBytes: raw.length, storedBytes: stored.length, crc32: crc, ...meta, _stored: stored });
  };
  const json = (name, value) => add(name, "json", enc.encode(JSON.stringify(value)));
  const typed = (name, arr) => add(name, typeName(arr), rawOf(arr), { count: arr.length });
  const m = world.mesh;
  await json("world.spec", world.spec);
  for (const [name, key] of Object.entries(GEOM)) await typed(name, m[key]);
  for (const k of CELL_ARRAYS) {
    if (!(world.cell[k] && typeName(world.cell[k]))) throw new Error(`cell.${k} が型付き配列でない`);
    await typed(`cell.${k}`, world.cell[k]);
  }
  await json("entities.populations", world.entities.populations);
  await json("world.stats", { stats: world.stats, timings: world.timings });
  for (const [name, data] of Object.entries(options.extensions ?? {})) { if (!(data instanceof Uint8Array)) throw new Error(`拡張チャンク ${name} は Uint8Array`); await add(name, "ext", data); }
  let offset = 0;
  for (const c of chunks) { c.offset = offset; offset += c.storedBytes; }
  const manifest = {
    format: "AHMAP2", containerVersion: AHMAP2_CONTAINER_VERSION, schemaVersion: AHMAP2_SCHEMA_VERSION, worldSpecSchema: WORLD_SPEC_SCHEMA,
    appVersion: options.appVersion ?? "", generatorVersion: world.spec.generatorVersion, meshVersion: m.meshVersion ?? MESH_VERSION, savedAt: options.savedAt ?? "",
    cellCount: m.cellCount, triangleCount: m.triangleCount, meshFrequency: m.n, worldHash: world.hash, required: REQUIRED_CHUNKS,
    chunks: chunks.map(({ _stored, ...c }) => c), ...(options.extraManifest ? { extra: options.extraManifest } : {}),
  };
  const mb = enc.encode(JSON.stringify(manifest)), head = 8 + 4 + 4 + mb.length, out = new Uint8Array(head + offset);
  out.set(enc.encode(AHMAP2_MAGIC), 0);
  const dv = new DataView(out.buffer); dv.setUint32(8, AHMAP2_CONTAINER_VERSION, true); dv.setUint32(12, mb.length, true); out.set(mb, 16);
  for (const c of chunks) out.set(c._stored, head + c.offset);
  return { bytes: out, manifest, chunkCache: cache };
}

export class Ahmap2Error extends Error { constructor(msg, problems = []) { super(msg); this.name = "Ahmap2Error"; this.problems = problems; } }

/** manifest だけを読む（全部を展開せずに、版・セル数・ハッシュを確かめる） */
export function readAhmap2Manifest(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 16) throw new Ahmap2Error("ファイルが小さすぎる（.ahmap v2 ではない）");
  const magic = dec.decode(bytes.subarray(0, 8)); if (magic !== AHMAP2_MAGIC) throw new Ahmap2Error("マジックが一致しない（.ahmap v2 ではない）");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), cv = dv.getUint32(8, true), ml = dv.getUint32(12, true);
  if (cv > AHMAP2_CONTAINER_VERSION) throw new Ahmap2Error(`新しいコンテナ版 ${cv} のファイル。このアプリは ${AHMAP2_CONTAINER_VERSION} まで（元ファイルは上書きしない）`);
  if (16 + ml > bytes.length) throw new Ahmap2Error("manifest がファイルの長さを超えている（途中で切れた破損ファイル）");
  let manifest; try { manifest = JSON.parse(dec.decode(bytes.subarray(16, 16 + ml))); } catch (e) { throw new Ahmap2Error("manifest を読めない: " + e.message); }
  if (manifest.format !== "AHMAP2") throw new Ahmap2Error("manifest の format が AHMAP2 ではない");
  return { manifest, payloadStart: 16 + ml };
}

/**
 * コンテナを読み込んで検証する。戻り値: { world, manifest, extensions: Map(name → Uint8Array), chunkCache }
 * 問題があれば Ahmap2Error（problems に具体的な一覧）。元データは変更しない。
 */
export async function decodeAhmap2(bytes) {
  const { manifest, payloadStart } = readAhmap2Manifest(bytes), problems = [], byName = new Map();
  if (manifest.schemaVersion > AHMAP2_SCHEMA_VERSION) throw new Ahmap2Error(`新しいスキーマ版 ${manifest.schemaVersion}（このアプリは ${AHMAP2_SCHEMA_VERSION} まで）`);
  for (const c of manifest.chunks ?? []) byName.set(c.name, c);
  for (const r of manifest.required ?? REQUIRED_CHUNKS) if (!byName.has(r)) problems.push(`必須チャンク ${r} が無い`);
  for (const r of REQUIRED_CHUNKS) if (!byName.has(r) && !problems.some((p) => p.includes(r))) problems.push(`必須チャンク ${r} が無い`);
  if (problems.length) throw new Ahmap2Error("必須チャンクが欠けている", problems);
  const data = new Map(), cache = new Map(), extensions = new Map();
  for (const c of manifest.chunks) {
    const s = payloadStart + c.offset, e = s + c.storedBytes;
    if (c.offset < 0 || e > bytes.length) { problems.push(`チャンク ${c.name} がファイルの範囲外（途中で切れた破損ファイル）`); continue; }
    const stored = bytes.subarray(s, e); let raw;
    try { raw = c.codec === "gzip" ? await gunzip(stored) : stored; } catch (err) { problems.push(`チャンク ${c.name} の展開に失敗: ${err.message}`); continue; }
    if (raw.length !== c.rawBytes) { problems.push(`チャンク ${c.name} の長さが一致しない（${raw.length} ≠ ${c.rawBytes}）`); continue; }
    if (crc32(raw) !== c.crc32) { problems.push(`チャンク ${c.name} のチェックサムが一致しない（破損）`); continue; }
    cache.set(c.name, { crc: c.crc32, rawBytes: c.rawBytes, stored: stored.slice(), codec: c.codec });
    if (c.kind === "ext" || !REQUIRED_CHUNKS.includes(c.name)) { extensions.set(c.name, raw.slice()); continue; }
    if (c.kind === "json") { try { data.set(c.name, JSON.parse(dec.decode(raw))); } catch (err) { problems.push(`チャンク ${c.name} の JSON が不正: ${err.message}`); } }
    else { const T = TYPES[c.kind]; if (!T) { problems.push(`チャンク ${c.name} の型 ${c.kind} が未知`); continue; } if (raw.length % T.BYTES_PER_ELEMENT) { problems.push(`チャンク ${c.name} の長さが要素の大きさで割り切れない`); continue; } const arr = new T(raw.slice().buffer); if (c.count !== undefined && arr.length !== c.count) { problems.push(`チャンク ${c.name} の要素数が一致しない`); continue; } data.set(c.name, arr); }
  }
  if (problems.length) throw new Ahmap2Error("チャンクの検証に失敗", problems);
  const V = manifest.cellCount, T = manifest.triangleCount, n = manifest.meshFrequency;
  if (!Number.isInteger(V) || V !== 10 * n * n + 2 || T !== 20 * n * n) throw new Ahmap2Error("manifest のセル数・三角形数が周波数と一致しない");
  const g = (name) => data.get(name);
  const mesh = { meshVersion: manifest.meshVersion, n, cellCount: V, triangleCount: T, centerXYZ: g("geom.centerXYZ"), vertexXYZ: g("geom.verticesXYZ"), neighborOffsets: g("geom.neighborOffsets"), neighborIds: g("geom.neighborIds"), cellVertexOffsets: g("geom.neighborOffsets"), cellVertexIds: g("geom.cellVertexIds") };
  const sizes = [["geom.centerXYZ", mesh.centerXYZ, 3 * V], ["geom.verticesXYZ", mesh.vertexXYZ, 3 * T], ["geom.neighborOffsets", mesh.neighborOffsets, V + 1], ["geom.neighborIds", mesh.neighborIds, 3 * T], ["geom.cellVertexIds", mesh.cellVertexIds, 3 * T]];
  for (const [name, arr, want] of sizes) if (arr.length !== want) problems.push(`${name} の要素数が ${arr.length}（${want} のはず）`);
  const cell = {}; for (const k of CELL_ARRAYS) { cell[k] = g(`cell.${k}`); if (cell[k].length !== V) problems.push(`cell.${k} の要素数が ${cell[k].length}（${V} のはず）`); }
  if (problems.length) throw new Ahmap2Error("配列の大きさが不整合", problems);
  // 参照・値域の検証（不明値を黙って 0 にしない）
  const off = mesh.neighborOffsets; if (off[0] !== 0 || off[V] !== 3 * T) problems.push("隣接オフセットの端が不正");
  for (let c = 0; c < V && problems.length < 10; c++) { if (off[c + 1] < off[c]) { problems.push(`隣接オフセットが減少: ${c}`); break; } }
  for (let i = 0; i < mesh.neighborIds.length; i++) if (mesh.neighborIds[i] >= V) { problems.push(`隣接 ID が範囲外: ${i}`); break; }
  for (let i = 0; i < mesh.cellVertexIds.length; i++) if (mesh.cellVertexIds[i] >= T) { problems.push(`セル頂点 ID が範囲外: ${i}`); break; }
  const nb = BIOME_NAMES.length;
  for (let c = 0; c < V; c++) {
    if (cell.landWater[c] > 2) { problems.push(`landWater が不正: セル ${c}`); break; }
    if (cell.biome[c] >= nb) { problems.push(`biome が不正: セル ${c}`); break; }
    if (cell.riverTo[c] < -1 || cell.riverTo[c] >= V) { problems.push(`riverTo が範囲外: セル ${c}`); break; }
    if (cell.basin[c] < -1 || cell.basin[c] >= V) { problems.push(`basin が範囲外: セル ${c}`); break; }
  }
  if (problems.length) throw new Ahmap2Error("参照・値域の検証に失敗", problems);
  const { spec, errors } = normalizeWorldSpec(g("world.spec")); if (errors.length) throw new Ahmap2Error("WorldSpec が不正", errors);
  const world = { spec: { ...spec, generatorVersion: g("world.spec").generatorVersion ?? spec.generatorVersion }, mesh, cell, entities: { populations: g("entities.populations") }, stats: g("world.stats").stats, timings: g("world.stats").timings };
  world.hash = worldHash(world);
  if (world.hash !== manifest.worldHash) throw new Ahmap2Error("世界のハッシュが manifest と一致しない（内容が書き換わっている）", [`保存: ${manifest.worldHash} / 再計算: ${world.hash}`]);
  const topo = validateSphereMesh(mesh); if (topo.length) throw new Ahmap2Error("球面トポロジーの検証に失敗", topo);
  const geo = validateWorld(world); if (geo.length) throw new Ahmap2Error("地理の整合性の検証に失敗", geo);
  return { world, manifest, extensions, chunkCache: cache };
}
