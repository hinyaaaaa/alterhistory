// 共通の「初期設定」ウィンドウ。国家・文化・宗教・属州を新しく作るときは、必ずこの窓を開く。
//   ・ここで名前・色・種類などをすべて入力して「確定」を押すまで、地図にも年表にも何も作られない
//   ・確定すると、1回の操作（Undo 1回）で作られ、年表には最終的な内容で1件だけ残る
//   ・× やキャンセルで閉じれば、何も起きなかったことになる
// open(kind, opts) は、作られた実体のID（キャンセルなら null）で解決する Promise を返す。

import { CULTURE_TYPES, RELIGION_TYPES, STATE_FORMS } from "../core/edit/profile.js";
import { el, btn } from "./kit.js";

const ICON = { state: "🏳", culture: "🎭", religion: "✦", province: "▦" };

function field(label, control, hint) {
  const f = el("label", "b-field");
  f.append(el("span", "b-mini", label), control);
  if (hint) f.title = hint;
  return f;
}
function select(options, value) {
  const s = document.createElement("select");
  for (const o of options) s.append(new Option(o.label, String(o.id)));
  if (value != null) s.value = String(value);
  return s;
}
function input(value = "", placeholder = "") {
  const i = document.createElement("input");
  i.value = value; if (placeholder) i.placeholder = placeholder;
  return i;
}

/**
 * @param {{wins:object, setupActions:object, store:object, onCreated?:(kind:string,id:number,result:object)=>void}} deps
 */
export function initSetupWindow({ wins, setupActions, store, onCreated }) {
  const body = el("div", "setup-body");
  let pending = null;   // { kind, resolve }
  let settled = false;  // 確定済み（閉じたときに「キャンセル」と扱わない）

  function finish(id, result) {
    const p = pending; pending = null;
    if (!p) return;
    settled = true;
    wins.close("setup");
    settled = false;
    p.resolve(id);
    if (id != null) onCreated?.(p.kind, id, result);
  }

  wins.register("setup", {
    title: "✦ 新規作成",
    width: 440,
    body,
    onClose() {
      if (settled || !pending) return;
      const p = pending; pending = null; p.resolve(null); // × で閉じた＝キャンセル。何も作らない
    },
  });
  const titleEl = () => document.querySelector('[data-win="setup"] .float-win-bar h3');

  function render(kind, opts) {
    body.replaceChildren();
    const label = setupActions.SETUP_LABEL[kind];
    if (titleEl()) titleEl().textContent = `${ICON[kind]} 新しい${label}の初期設定`;
    body.append(el("p", "hint", `すべて入力して「確定」を押すと、${label}が作られ、年表に記録されます。それまでは何も作られません。`));

    // 属州は所属する国が必要
    let ownerSel = null;
    if (kind === "province") {
      const states = setupActions.choices("state");
      if (!states.length) { body.append(el("p", "muted", "属州を作るには、先に国家が必要です。")); body.append(btn("", "閉じる", "", () => finish(null))); return; }
      ownerSel = select(states.map((s) => ({ id: s.id, label: s.name })), opts.stateId ?? states[0].id);
      body.append(field("所属する国家", ownerSel));
    }

    // 名前 + 🎲
    const nameIn = input("", "空欄なら、おまかせで決めます");
    const row = el("span", "name-row");
    const state = { extra: {}, lastName: null };
    const fields = {};
    const dice = btn("suggest-mini", "🎲", "名前をランダムに決める（政体や神名もいっしょに入ります）", (ev) => {
      ev.preventDefault();
      const g = setupActions.suggest(kind, kind === "province" ? { stateId: Number(ownerSel.value) } : {});
      if (!g) return;
      nameIn.value = g.name; state.extra = g.extra ?? {}; state.lastName = g.name;
      if (fields.formName && g.extra?.formName) fields.formName.value = g.extra.formName;
      if (fields.form && g.extra?.form && STATE_FORMS.some((f) => f.id === g.extra.form)) fields.form.value = g.extra.form;
      if (fields.deity && g.extra?.deity) fields.deity.value = g.extra.deity;
      if (fields.type && g.extra?.type && [...fields.type.options].some((o) => o.value === g.extra.type)) fields.type.value = g.extra.type;
    });
    row.append(nameIn, dice);
    body.append(field("名前", row));

    // 色
    const color = document.createElement("input"); color.type = "color"; color.value = setupActions.suggestColor(kind);
    body.append(field("色", color));

    // 種類ごとの項目
    if (kind === "state") {
      fields.form = select(STATE_FORMS, "");
      fields.form.prepend(new Option("（おまかせ）", ""));
      fields.form.value = "";
      fields.formName = input("", "国名につく語（空欄で自動）");
      fields.type = select(CULTURE_TYPES, "");
      fields.type.prepend(new Option("（おまかせ）", "")); fields.type.value = "";
      body.append(field("政体", fields.form), field("政体名", fields.formName), field("国の種類", fields.type));
    } else if (kind === "culture") {
      fields.type = select(CULTURE_TYPES, ""); fields.type.prepend(new Option("（おまかせ）", "")); fields.type.value = "";
      body.append(field("文化の種類", fields.type));
    } else if (kind === "religion") {
      fields.type = select(RELIGION_TYPES, ""); fields.type.prepend(new Option("（おまかせ）", "")); fields.type.value = "";
      fields.deity = input("", "空欄なら、名前といっしょにおまかせ");
      body.append(field("宗教の種類", fields.type), field("最高神", fields.deity));
    }
    // 起源（文化・宗教）
    if (kind === "culture" || kind === "religion") {
      const parents = setupActions.choices(kind);
      fields.origin = select([{ id: 0, label: kind === "religion" ? "なし（共通の祖・原始信仰）" : "なし（共通の祖）" }, ...parents.map((p) => ({ id: p.id, label: p.name }))], 0);
      body.append(field("起源（どこから分かれたか）", fields.origin));
    }

    // 領土（属州以外）
    let terr = null, capitalCb = null;
    if (kind !== "province") {
      const free = setupActions.freeLand(kind);
      const opts2 = [{ id: "later", label: "あとで地図に塗る" }];
      if (free > 0) for (const [k, v] of Object.entries(setupActions.TERRITORY_SIZES)) opts2.push({ id: k, label: `おまかせ（${v.label}）` });
      terr = select(opts2, "later");
      body.append(field("領土", terr, free > 0 ? "おまかせは、空き地から地形に沿って決めます" : "空き地（無所属の陸）が無いため、おまかせは選べません"));
      if (kind === "state") {
        const lab = el("label", "b-feat"); capitalCb = document.createElement("input"); capitalCb.type = "checkbox"; capitalCb.checked = true;
        lab.append(capitalCb, el("span", "", "首都も置く（おまかせ領土のとき）"));
        body.append(lab);
      }
    }

    const msg = el("p", "hint");
    const ok = btn("primary", "確定して作成", "この内容で作成し、年表に記録します", () => {
      msg.textContent = "";
      try {
        const spec = {
          name: nameIn.value, color: color.value,
          form: fields.form?.value, formName: fields.formName?.value, type: fields.type?.value, deity: fields.deity?.value,
          origins: fields.origin ? [Number(fields.origin.value)] : undefined,
          stateId: ownerSel ? Number(ownerSel.value) : undefined,
          territory: terr?.value, capital: capitalCb?.checked,
          // 🎲 で決めた名前のままなら、その案の付属項目（国の短い名前など）も引き継ぐ
          baseExtra: state.lastName && nameIn.value.trim() === state.lastName ? state.extra : undefined,
        };
        const r = setupActions.create(kind, spec); // 名前が空なら、ここでおまかせの名前になる
        finish(r.id, r);
      } catch (e) { msg.textContent = `作成できませんでした: ${e.message}`; }
    });
    const cancel = btn("", "キャンセル", "何も作らずに閉じる", () => { const p = pending; pending = null; if (p) { settled = true; wins.close("setup"); settled = false; p.resolve(null); } });
    const actions = el("div", "b-actions"); actions.append(ok, cancel);
    body.append(msg, actions);
    queueMicrotask(() => nameIn.focus());
  }
  return {
    /** 開く。確定なら作られたID、キャンセルなら null で解決する */
    open(kind, opts = {}) {
      if (!setupActions.SETUP_KINDS.includes(kind)) return Promise.resolve(null);
      if (!store.getState().map) return Promise.resolve(null);
      if (pending) { const p = pending; pending = null; p.resolve(null); } // 開いたまま別の種類を開いたら、前の入力は破棄する
      return new Promise((resolve) => { pending = { kind, resolve }; render(kind, opts); wins.open("setup"); });
    },
  };
}
