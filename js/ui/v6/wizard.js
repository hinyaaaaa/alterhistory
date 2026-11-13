// v6.4.0: 建国の流れ（全面表示）。担当して建国・創造主の建国・反乱で国家をつくる・革命の新体制 が、同じ部品を使う。
//   国名 → 政体 → 役職 → 為政者の顔と名前 → 首都（地図から）→ 技術・軍事ドクトリン → 確認。領域は WCDE が決める。
//   mode: "player"（担当して建国）／"creator"（創造主が国家を作る）／"rebel"（反乱で国家をつくる。首都は反乱の中心地）／"reform"（革命・クーデターが成功したときの新体制。国名・首都・技術は無し）
import { h, btn, face, n0 } from "./common.js";
import { S, act, creator } from "./store.js";
import { MapView } from "./map.js";
import { REGIMES, OFFICES, REGIME_IDS, OFFICE_DOMAIN_JA, regimeGate, defaultOffices, officeJa, MIN_OFFICES, MAX_OFFICES } from "../../core/wcde/regimes.js";
import { capitalSites, planCapital, planRealm, techChoices, doctrineChoices } from "../../core/wcde/founding.js";

const STEPS = { player: ["name", "regime", "offices", "leader", "capital", "tech", "confirm"], creator: ["name", "regime", "offices", "leader", "capital", "tech", "confirm"], rebel: ["name", "regime", "offices", "leader", "tech", "confirm"], reform: ["regime", "offices", "leader", "confirm"] };
const STEP_JA = { name: "国名", regime: "政体", offices: "役職", leader: "為政者", capital: "首都", tech: "技術・軍事", confirm: "確認" };
const LOOKS = 12;

/** opts: { mode, host?, rebel?: { stateId, kind, cell, plan }, reform?: { stateId, kind, cell }, onDone(result), onCancel() } */
export function openWizard(opts) {
  const { mode } = opts, w = S.w, civ = w.civ, steps = STEPS[mode], D = { name: "", regime: null, offices: [], leader: { name: "", look: 0 }, capital: null, techs: [], doctrine: null, asState: true };
  let i = 0, msg = "", map = null, capInfo = null;
  const root = h("div", { class: "wiz" }), body = h("div", { class: "wizbody" }), foot = h("div", { class: "wizfoot" }), head = h("div", { class: "wizhead" });
  root.append(head, body, foot); (opts.host ?? document.body).append(root);
  const close = () => { try { map?.destroy?.(); } catch { /* 地図の後始末 */ } root.remove(); };
  const rb = opts.rebel, rf = opts.reform, center = rb ? civ.groups[rb.plan.center.groupId] : null;
  // 政体を選べるか: 担当・創造主は世界の誰かが満たせばよい（首都を選ぶとき、その首都で再確認）。反乱は中心地、革命は国の首都の集団の技術で決める
  const gateGroup = () => (rb ? center : rf ? civ.groups[civ.states[rf.stateId].capitalGroupId] : null);
  const sites = mode === "player" || mode === "creator" ? capitalSites(w, null, 400) : [];
  const worldGate = (id) => { const r = sites.slice(0, 80).map((s) => regimeGate(civ, civ.groups[s.groupId], id)); return r.some((x) => !x) ? null : r[0] ?? "条件を満たす都市がない"; };
  const gate = (id) => (gateGroup() ? regimeGate(civ, gateGroup(), id) : worldGate(id));
  const nameGen = S.w.sim.ctx.nameGen, sample = () => gateGroup() ?? civ.groups[sites[Math.floor(Math.random() * Math.min(20, sites.length || 1))]?.groupId] ?? Object.values(civ.groups)[0];
  const suggestState = () => { const g = sample(), r = () => Math.random(), out = []; for (let k = 0; k < 8; k++) { try { const p = nameGen?.stateParts?.(civ, g, "city_state", r, D.regime ? REGIMES[D.regime].core : "chiefdom"); if (p?.name) out.push(p.name); } catch { /* 名前の生成に失敗したら出さない */ } } return [...new Set(out)].slice(0, 6); };
  const suggestPerson = () => { const g = sample(), r = () => Math.random(), out = []; for (let k = 0; k < 8; k++) { try { const n = nameGen?.person?.(civ, g, r); if (n) out.push(n); } catch { /* 同上 */ } } return [...new Set(out)].slice(0, 6); };

  const chips = (arr, on) => h("div", { class: "wchips" }, ...arr.map((t) => h("button", { class: "b", onclick: () => on(t) }, t)));
  const stepName = () => { const inp = h("input", { id: "wz-name", value: D.name, maxlength: 30, placeholder: "例: ヴァルテリア王国", oninput: (e) => { D.name = e.target.value; renderFoot(); } }), sug = h("div", {}); return h("div", {}, h("p", { class: "n" }, "これから建てる国の名前を決めます。"), inp, h("div", { class: "rowb" }, btn("名前の候補を出す", () => sug.replaceChildren(chips(suggestState(), (t) => { D.name = t; inp.value = t; renderFoot(); })), "", { id: "wz-sug" })), sug); };
  const stepRegime = () => h("div", {}, h("p", { class: "n" }, mode === "reform" ? "革命が成功したあとの体制を選びます。" : "政体を選びます。技術が足りない政体は、理由つきで選べません。"), h("div", { class: "wgrid" }, ...REGIME_IDS.map((id) => { const r = REGIMES[id], why = gate(id), on = D.regime === id; return h("button", { class: "wcard" + (on ? " on" : "") + (why ? " off" : ""), "data-regime": id, disabled: !!why, title: why ?? "", onclick: () => { D.regime = id; D.offices = defaultOffices(id); render(); } }, h("b", {}, r.ja), h("small", {}, r.blurb), h("small", { class: "dim" }, `元首: ${officeJa(r.ruler)}${r.heredity ? "・世襲" : ""}`), why ? h("small", { class: "why" }, why) : null); })));
  const stepOffices = () => { const r = REGIMES[D.regime], set = new Set(D.offices); return h("div", {}, h("p", { class: "n" }, `設置する役職を選びます（${MIN_OFFICES} 件以上。元首は外せません）。置くほど維持費がかかり、多すぎると官僚が肥大します。あとからいつでも変えられます。`), h("div", { class: "wgrid o" }, ...r.offices.map((id) => { const dom = OFFICE_DOMAIN_JA[OFFICES[id]?.[1]] ?? "", ruler = id === r.ruler, on = set.has(id); return h("button", { class: "wcard" + (on ? " on" : ""), "data-office": id, disabled: ruler, onclick: () => { on ? set.delete(id) : set.add(id); D.offices = r.offices.filter((x) => set.has(x)); render(); } }, h("b", {}, officeJa(id) + (ruler ? "（元首）" : "")), h("small", { class: "dim" }, dom)); })), h("p", { class: "n" }, `選択中 ${D.offices.length} 件`)); };
  const stepLeader = () => { const inp = h("input", { id: "wz-leader", value: D.leader.name, maxlength: 30, placeholder: "為政者の名前", oninput: (e) => { D.leader.name = e.target.value; renderFoot(); } }), sugL = h("div", {}); return h("div", {}, h("p", { class: "n" }, `${officeJa(REGIMES[D.regime].ruler)}となる人物の名前と顔を決めます。`), inp, h("div", { class: "rowb" }, btn("名前の候補を出す", () => sugL.replaceChildren(chips(suggestPerson(), (t) => { D.leader.name = t; inp.value = t; renderFoot(); })), "", { id: "wz-lsug" })), sugL, h("div", { class: "wfaces" }, ...Array.from({ length: LOOKS }, (_, k) => h("button", { class: "wface" + (D.leader.look === k ? " on" : ""), "data-look": k, onclick: () => { D.leader.look = k; render(); } }, face(D.leader.name || "—", "new", k))))); };
  const refreshCap = () => { if (!D.capital) { capInfo = null; return; } const p = planCapital(w, D.capital); if (!p.ok) { capInfo = { error: p.error }; return; } const gid = p.groupId ?? p.parentId, g = civ.groups[gid], realm = planRealm(w, gid), why = D.regime ? regimeGate(civ, g, D.regime) : null; const dom = g.cohorts.reduce((b, c) => (c.share > b.share ? c : b)); capInfo = { kind: p.kind, pop: p.pop, realm, gid, why, culture: civ.cultures[dom.cultureId]?.name, religion: civ.religions[dom.religionId]?.name }; };
  const stepCapital = () => {
    const host = h("div", { class: "wizmap" }), cv = h("canvas", { id: "wz-map" }); host.append(cv); const info = h("div", { class: "wcap", id: "wz-cap" });
    const paint = () => { if (!capInfo) info.replaceChildren(h("p", { class: "n" }, "地図の黄色い点（国家のない都市）か、ほかの陸地をクリックして、首都を選びます。国家の領土は選べません。")); else if (capInfo.error) info.replaceChildren(h("p", { class: "n err" }, capInfo.error)); else info.replaceChildren(h("b", {}, capInfo.kind === "existing" ? "国家のない都市を首都にします" : capInfo.kind === "settle" ? "ここに新しく都市を築いて首都にします" : "人が移り住み、新しい都市を建てて首都にします"), h("div", { class: "n" }, `首都の人口 ${n0(capInfo.pop)}・領域 ${capInfo.realm.groupIds.length} か所（約 ${n0(capInfo.realm.pop)} 人。WCDE が決めます）`), h("div", { class: "n" }, [capInfo.culture && `文化 ${capInfo.culture}`, capInfo.religion && `宗教 ${capInfo.religion}`].filter(Boolean).join("・")), capInfo.why ? h("p", { class: "n err" }, `この首都では「${REGIMES[D.regime].ja}」を選べません: ${capInfo.why}`) : null); };
    queueMicrotask(() => { map = new MapView(cv, w); map.layers = new Set(["states", "relief", "rivers", "borders", "cities"]); const pins = () => { map.pins = [...sites.filter((s) => !D.regime || !regimeGate(civ, civ.groups[s.groupId], D.regime)).map((s) => ({ cell: s.cell, color: "#f0c14d" })), ...(D.capital && capInfo && !capInfo.error ? [{ cell: capCell(), big: true, color: "#ff8a5c" }] : [])]; };
      const capCell = () => { const p = planCapital(w, D.capital); return p.cell; };
      map.onPick = (p) => { const free = p.settlement && civ.groups[p.settlement.groupId] && !civ.groups[p.settlement.groupId].stateId; D.capital = free ? { groupId: p.settlement.groupId } : { cell: p.cell }; refreshCap(); pins(); paint(); map.draw(); renderFoot(); }; pins(); map.draw(); if (D.capital) { refreshCap(); pins(); paint(); map.draw(); } });
    paint(); return h("div", {}, h("p", { class: "n" }, "首都を選びます。領域は首都の周りから WCDE が決めます。"), host, info);
  };
  const stepTech = () => {
    const gs = rb ? rb.plan.regionGroupIds : capInfo && !capInfo.error ? capInfo.realm.groupIds : [], tc = techChoices(w, gs), dc = doctrineChoices(w, D.techs), set = new Set(D.techs);
    return h("div", {}, h("p", { class: "n" }, "建国のとき、領域が十分に知っている技術から最大 3 つと、軍事ドクトリンを 1 つ選べます（選ばなくても構いません）。"),
      h("div", { class: "wgrid o" }, ...tc.map((t) => h("button", { class: "wcard" + (set.has(t.key) ? " on" : ""), "data-tech": t.key, onclick: () => { set.has(t.key) ? set.delete(t.key) : set.size < 3 && set.add(t.key); D.techs = [...set]; if (D.doctrine && !doctrineChoices(w, D.techs).some((d) => d.id === D.doctrine)) D.doctrine = null; render(); } }, h("b", {}, t.name), h("small", { class: "dim" }, t.field)))),
      h("div", { class: "lb" }, "軍事ドクトリン"), h("div", { class: "wgrid o" }, h("button", { class: "wcard" + (D.doctrine == null ? " on" : ""), onclick: () => { D.doctrine = null; render(); } }, h("b", {}, "選ばない")), ...dc.map((d) => h("button", { class: "wcard" + (D.doctrine === d.id ? " on" : ""), "data-doc": d.id, onclick: () => { D.doctrine = d.id; render(); } }, h("b", {}, d.ja)))));
  };
  const spec = () => ({ name: D.name.trim(), regime: D.regime, offices: D.offices, leader: { name: D.leader.name.trim(), look: D.leader.look }, techs: D.techs, doctrine: D.doctrine });
  const stepConfirm = () => { const r = REGIMES[D.regime], tk = D.techs.length ? D.techs.join("・") : "なし"; return h("div", {}, h("div", { class: "wsum" }, face(D.leader.name, "new", D.leader.look), h("div", {}, mode !== "reform" ? h("h2", {}, D.name) : null, h("div", { class: "n" }, `${r.ja}・${officeJa(r.ruler)} ${D.leader.name}`), h("div", { class: "n" }, `役職: ${D.offices.map(officeJa).join("・")}`), mode === "player" || mode === "creator" ? h("div", { class: "n" }, `首都: ${capInfo?.kind === "existing" ? "国家のない都市" : "新しい都市"}・領域 ${capInfo?.realm.groupIds.length} か所`) : null, mode === "rebel" ? h("div", { class: "n" }, `首都: 反乱の中心地・領域 ${rb.plan.regionGroupIds.length} か所`) : null, mode !== "reform" ? h("div", { class: "n" }, `技術: ${tk}・ドクトリン: ${D.doctrine ?? "なし"}`) : null)), msg ? h("p", { class: "n err", id: "wz-err" }, msg) : null); };
  const body$ = { name: stepName, regime: stepRegime, offices: stepOffices, leader: stepLeader, capital: stepCapital, tech: stepTech, confirm: stepConfirm };
  const valid = (k) => (k === "name" ? D.name.trim().length > 0 : k === "regime" ? !!D.regime : k === "offices" ? D.offices.length >= MIN_OFFICES : k === "leader" ? D.leader.name.trim().length > 0 : k === "capital" ? !!capInfo && !capInfo.error && !capInfo.why : true);
  const submit = () => {
    let r;
    if (mode === "player") r = act({ type: "founding.found", ...spec(), capital: D.capital }); else if (mode === "creator") r = creator({ type: "creator.found", ...spec(), capital: D.capital });
    else if (mode === "rebel") r = act({ type: "uprising.start", stateId: rb.stateId, kind: rb.kind, cell: rb.cell, asState: true, found: spec() });
    else r = act({ type: "uprising.start", stateId: rf.stateId, kind: rf.kind, cell: rf.cell, reform: { regime: D.regime, offices: D.offices, leader: spec().leader } });
    const res = r.result ?? r; if (!r.ok || res.ok === false) { msg = res.error ?? r.error ?? "実行できませんでした"; render(); return; }
    close(); opts.onDone?.(res);
  };
  function renderFoot() { const k = steps[i], last = i === steps.length - 1; foot.replaceChildren(btn("やめる", () => { close(); opts.onCancel?.(); }, "", { id: "wz-cancel" }), h("span", { style: "flex:1" }), i > 0 ? btn("戻る", () => { i--; msg = ""; render(); }, "", { id: "wz-back" }) : null, last ? btn(mode === "player" || mode === "creator" ? "建国する" : mode === "reform" ? "決行する" : "反乱を起こす", submit, "p", { id: "wz-go" }) : btn("次へ", () => { if (steps[i] === "capital") { refreshCap(); } i++; msg = ""; render(); }, "p", { id: "wz-next", disabled: !valid(k) })); }
  function render() {
    const k = steps[i]; try { map?.destroy?.(); } catch { /* */ } if (k !== "capital") map = null;
    head.replaceChildren(h("div", { class: "code" }, mode === "player" ? "FOUNDING" : mode === "creator" ? "CREATE A NATION" : mode === "rebel" ? "UPRISING" : "NEW ORDER"), h("h1", {}, mode === "player" ? "建国" : mode === "creator" ? "国家をつくる" : mode === "rebel" ? `${rb.plan.kindJa}で国をつくる` : "革命後の体制"), h("div", { class: "wsteps" }, ...steps.map((s, j) => h("span", { class: j === i ? "on" : j < i ? "done" : "" }, STEP_JA[s]))));
    body.replaceChildren(body$[k]()); renderFoot();
  }
  root._test = { pick: (p) => map?.onPick?.(p), D }; // 試験用の入口（画面の操作と同じ経路）
  render(); return { close };
}
