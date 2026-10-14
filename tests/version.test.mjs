// 版の置き場（package.json・js/version.js・docs/CHANGELOG.md）が食い違わないことを確かめる。
import { readFileSync } from "node:fs";
import { APP_VERSION, APP_VERSION_NAME, APP_VERSION_LABEL } from "../js/version.js";
import { SAVE_FORMAT } from "../js/core/edit/treaties.js";
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const log = readFileSync(new URL("../docs/CHANGELOG.md", import.meta.url), "utf8");
check("package.json の version と js/version.js が一致", pkg.version === APP_VERSION, `${pkg.version} / ${APP_VERSION}`);
check("版の名前と表示（v2.4.0 国家のハブ）", APP_VERSION === "2.4.0" && APP_VERSION_NAME === "国家のハブ" && APP_VERSION_LABEL === "v2.4.0 国家のハブ");
check("docs/CHANGELOG.md に v2.0.0 と v2.1.0 が書かれている", log.includes("## v2.0.0 静かな戦略卓") && log.includes("## v2.3.0 内戦と検査") && log.includes("## v2.4.0 国家のハブ"));
check("保存形式の版は 3（条約の形式は 2、旧形式は 1）", SAVE_FORMAT === 3);
check("MAP_FORMAT_SPEC.md に保存形式の版と条約が書かれている", /saveFormat/.test(readFileSync(new URL("../docs/MAP_FORMAT_SPEC.md", import.meta.url), "utf8")) && /treaties/.test(readFileSync(new URL("../docs/MAP_FORMAT_SPEC.md", import.meta.url), "utf8")));
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
