// ビルド（v5.3.1）。従来の esbuild コマンド 3 本と同じ出力に、ビルド識別子と dist/build-info.json を足したもの。
//   - ビルド識別子 = js/ 以下のソース（js/generated を除く）の内容から決めるハッシュ。アプリ内（版表示・alterhistory.build）に埋め込む。
//   - dist/build-info.json = 版・ビルド識別子・各配信ファイルの SHA-256。公開された dist/app.js が、このソースから作られたものかを、
//     ファイル名やサイズではなく内容の一致で確かめるための記録（tests/build-integrity.test.mjs が、ソースから作り直した結果と照合する）。
//   使い方: node scripts/build.mjs [--check]   （--check は dist を書き換えず、作り直した結果が dist と一致するかだけを確かめる）
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const rel = (...p) => path.join(root, ...p);

function listJs(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "generated") listJs(full, out); }
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

/** js/ のソースだけから決まるビルド識別子（先頭 12 桁） */
export function sourceHash() {
  const h = createHash("sha256");
  for (const f of listJs(rel("js"))) { h.update(path.relative(root, f).split(path.sep).join("/")); h.update("\0"); h.update(readFileSync(f)); h.update("\0"); }
  return h.digest("hex");
}

const common = { bundle: true, format: "iife", target: "es2020", logLevel: "silent" };

/** 3 本をビルドして { ファイル名: 内容 } を返す（write=true のときだけ書き出す） */
export async function buildAll({ write = true } = {}) {
  const outs = {};
  const run = async (entry, outfile, extra = {}) => {
    const r = await build({ ...common, entryPoints: [rel(entry)], outfile: rel(outfile), write: false, ...extra });
    const file = r.outputFiles[0];
    outs[outfile] = Buffer.from(file.contents);
    if (write) { mkdirSync(path.dirname(rel(outfile)), { recursive: true }); writeFileSync(rel(outfile), file.contents); }
  };
  await run("js/workers/worldgen.worker.js", "js/generated/worldgen-worker.txt");
  const src = sourceHash(), buildId = src.slice(0, 12);
  // app.js が取り込む worker は、ディスク上の js/generated/worldgen-worker.txt ではなく、いま作った worker にする（write=false でも同じ結果になる）
  const workerText = outs["js/generated/worldgen-worker.txt"].toString("utf8");
  const useBuiltWorker = { name: "built-worker", setup(b) { b.onLoad({ filter: /worldgen-worker\.txt$/ }, () => ({ contents: workerText, loader: "text" })); } };
  await run("js/main.js", "dist/app.js", { loader: { ".txt": "text" }, plugins: [useBuiltWorker], define: { __BUILD_ID__: JSON.stringify(buildId) } });
  await run("js/tools/worldgen-preview.js", "dist/worldgen-preview.js");
  const pkg = JSON.parse(readFileSync(rel("package.json"), "utf8"));
  const info = { version: pkg.version, buildId, sourceSha256: src, files: { "app.js": sha256(outs["dist/app.js"]), "worldgen-preview.js": sha256(outs["dist/worldgen-preview.js"]) } };
  outs["dist/build-info.json"] = Buffer.from(JSON.stringify(info, null, 2) + "\n");
  if (write) writeFileSync(rel("dist/build-info.json"), outs["dist/build-info.json"]);
  return { outs, info };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const { outs, info } = await buildAll({ write: !check });
  if (check) {
    let bad = 0;
    for (const [f, buf] of Object.entries(outs)) { const cur = readFileSync(rel(f)); const ok = sha256(cur) === sha256(buf); if (!ok) bad++; console.log(`${ok ? "OK  " : "差異"} ${f}`); }
    process.exit(bad ? 1 : 0);
  }
  console.log(`build ${info.version} (${info.buildId}) app.js sha256=${info.files["app.js"].slice(0, 16)}…`);
}
