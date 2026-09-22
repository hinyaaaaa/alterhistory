import { readFileSync } from "node:fs";
import { parseAzgaarText } from "../js/io/azgaar-reader.js";
import { attachExtension, NATIVE_MARKER } from "../js/io/native-format.js";
// テスト用の実マップの置き場所。既定は開発環境のパス。SAMPLES_DIR=... で変更できる
const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
import { serializeAzgaar } from "../js/io/azgaar-writer.js";

let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const original = readFileSync(SAMPLES + "/" + f, "utf-8");
  const origLines = original.split("\r\n");
  const { map } = parseAzgaarText(original);

  // 1) 編集していない地図は、1文字も違わず書き戻せる
  const same = serializeAzgaar(map);
  const outLines = same.split("\r\n");
  check("行数が元と一致", outLines.length === origLines.length, `${outLines.length}/${origLines.length}`);
  const diffs = [];
  for (let i = 0; i < Math.max(outLines.length, origLines.length); i++) if (outLines[i] !== origLines[i]) diffs.push(i);
  check("全行が元と完全一致（バイト単位）", same === original,
    diffs.length ? `違う行=${diffs.slice(0, 8).join(",")}` : `${original.length}文字`);
  if (diffs.length) {
    for (const i of diffs.slice(0, 3)) {
      const a = origLines[i] ?? "", b = outLines[i] ?? "";
      let k = 0; while (k < a.length && a[k] === b[k]) k++;
      console.log(`      行${i}: 最初の相違位置=${k}  元「${a.slice(Math.max(0, k - 20), k + 30)}」 出力「${b.slice(Math.max(0, k - 20), k + 30)}」`);
    }
  }

  // 2) 書き出したものを読み直しても同じ（冪等）
  const again = serializeAzgaar(parseAzgaarText(same).map);
  check("書き出し→読み込み→書き出しが同一", again === same);

  // 3) ALTERHISTORY 形式
  const native = serializeAzgaar(map, { native: true, exportedAt: "2026-9-21" });
  const nl = native.split("\r\n");
  check("拡張行が最後に1行追加される", nl.length === Math.max(origLines.length, 53) + 1, `${nl.length}行`);
  check("ヘッダーに目印", nl[0].split("|")[7] === NATIVE_MARKER, nl[0].split("|").slice(6, 8).join("|").slice(0, 40));
  check("日付が更新される", nl[0].split("|")[2] === "2026-9-21");
  // 目印・日付・拡張行・(短い旧版の)空行の追加以外は、元と同じ
  let same0to46 = true;
  for (let i = 1; i < origLines.length; i++) if (nl[i] !== origLines[i]) same0to46 = false;
  check("ヘッダーと拡張行以外の既存行は元と完全一致", same0to46);
  for (let i = origLines.length; i < Math.max(origLines.length, 53); i++) if (nl[i] !== "") same0to46 = false;
  check("元に無かった行は空行（内容を足さない）", same0to46);

  const back = parseAzgaarText(native);
  const warnings = attachExtension(back.map);
  check("読み直すと ALTERHISTORY として認識", back.map.meta.source === "alterhistory" && warnings.length === 0, warnings.join("|"));
  check("拡張行が passthrough に残らない（二重にならない）", !Object.keys(back.map.passthrough).some((i) => back.map.passthrough[i].startsWith('{"app"')));
  check("保存日時を読み戻せる", back.map.ext.savedAt === "2026-9-21");
  check("国家・都市・セル配列が同じ", back.map.pack.states.length === map.pack.states.length && back.map.pack.burgs.length === map.pack.burgs.length
    && JSON.stringify(back.map.pack.cells.state) === JSON.stringify(map.pack.cells.state));
  // ALTERHISTORY 形式を再保存しても増えない
  const twice = serializeAzgaar(back.map, { native: true, exportedAt: "2026-9-21" });
  check("再保存しても拡張行が増えない", twice === native, `${twice.split("\r\n").length}行`);
  // Azgaar 形式として書き出すと目印と拡張行が消える
  const stripped = serializeAzgaar(back.map, { native: false });
  check("Azgaar 形式で書き出すと目印・拡張行が消える", stripped.split("\r\n")[0].split("|").length === origLines[0].split("|").length && !stripped.includes('"app":"ALTERHISTORY"'));
}

console.log("=== 拡張行の異常系 ===");
{
  const original = readFileSync(SAMPLES + "/新世界より.map", "utf-8");
  const native = serializeAzgaar(parseAzgaarText(original).map, { native: true });
  const lines = native.split("\r\n");
  lines[lines.length - 1] = "{壊れた";
  const r = parseAzgaarText(lines.join("\r\n"));
  const w = attachExtension(r.map);
  check("壊れた拡張行は警告して無視（地図は読める）", w.length === 1 && r.map.pack.states.length > 0, w[0]?.slice(0, 40));
  lines[lines.length - 1] = JSON.stringify({ app: "ALTERHISTORY", format: 99, data: { x: 1 } });
  const r2 = parseAzgaarText(lines.join("\r\n"));
  const w2 = attachExtension(r2.map);
  check("新しい形式番号は警告つきで読む", w2.length === 1 && w2[0].includes("新しい版") && r2.map.ext.data.x === 1);
  lines[lines.length - 1] = "";
  lines.pop();
  const r3 = parseAzgaarText(lines.join("\r\n"));
  const w3 = attachExtension(r3.map);
  check("目印があるのに拡張行が無い場合は警告", w3.length === 1 && r3.map.pack.states.length > 0, w3[0]?.slice(0, 40));
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
