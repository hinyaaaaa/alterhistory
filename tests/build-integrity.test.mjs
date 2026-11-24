// v5.3.1: 配信する dist/ が、いまのソースから作られたものであることを、内容の一致で確かめる。
//   ソースを直したのに npm run build を忘れた（古い dist/v6.js を公開してしまう）ことを、ここで落とす。
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildAll } from "../scripts/build.mjs";
import { APP_VERSION } from "../js/version.js";

let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url));

const { outs, info } = await buildAll({ write: false });
for (const f of ["dist/v6.js", "dist/history-worker.js", "dist/worldgen-preview.js", "dist/build-info.json"]) {
  check(`${f} は、いまのソースから作り直した結果と同じ内容`, sha(rd(f)) === sha(outs[f]), sha(rd(f)) === sha(outs[f]) ? "" : "→ npm run build を実行して、dist を更新してください");
}
const rec = JSON.parse(rd("dist/build-info.json").toString("utf8"));
check("dist/build-info.json の版が package.json・js/version.js と一致", rec.version === APP_VERSION && rec.version === JSON.parse(rd("package.json")).version, `${rec.version} / ${APP_VERSION}`);
check("dist/build-info.json の v6.js のハッシュが、実際の dist/v6.js と一致", rec.files["v6.js"] === sha(rd("dist/v6.js")));
check("ビルド識別子が dist/v6.js に埋め込まれている", rd("dist/v6.js").toString("utf8").includes(`"${rec.buildId}"`), rec.buildId);
check("同じソースからは同じビルドになる（作り直しても変わらない）", info.buildId === rec.buildId && info.files["v6.js"] === rec.files["v6.js"]);
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
