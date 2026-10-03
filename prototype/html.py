"""Brief FlexRadar en page HTML autonome (aucune dépendance externe, fonctionne hors ligne).

    python3 -m prototype.html        -> prototype/out/brief.html
"""
from __future__ import annotations

import json
from pathlib import Path

from .scoring import LABELS, TODAY, build

OUT = Path(__file__).parent / "out" / "brief.html"
MAX_SIGNALS = 40


def payload() -> dict:
    opps, _ = build(real_clients=True, key_mode="entreprise", zone_context=True)
    rows = []
    for i, o in enumerate(opps):
        ms = o.metiers_all or [o.metier]
        sigs = sorted(o.signals, key=lambda s: (s.fictif, -s.weight))[:MAX_SIGNALS]
        rows.append({
            "id": i,
            "level": o.level, "levelPublic": o.level_public,
            "kind": "entreprise" if o.company else "zone",
            "target": o.target, "district": o.district or "—",
            "metiers": [LABELS.get(m, m) for m in ms],
            "families": o.families,
            "window": [o.window[0].isoformat(), o.window[1].isoformat()],
            "weeks": max(0, (o.window[0] - TODAY).days) // 7,
            "need": list(o.need), "team": [round(x, 1) for x in o.team],
            "vivier": o.vivier, "action": o.action,
            "probable": [[c, round(p, 2)] for c, p in o.probable_companies],
            "nSignals": len(o.signals),
            "signals": [{"f": s.family, "t": s.type, "l": s.label, "u": s.url, "d": s.date, "x": s.fictif} for s in sigs],
        })
    return {"today": TODAY.isoformat(), "rows": rows}


def main():
    data = json.dumps(payload(), ensure_ascii=False).replace("</", "<\\/")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(TEMPLATE.replace("__DATA__", data), "utf-8")
    print(f"→ {OUT}")


TEMPLATE = r"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FlexRadar Brief</title>
<style>
:root{
  --bg:#f6f7f9; --panel:#ffffff; --ink:#1b1f24; --muted:#5d6670; --line:#e3e6ea; --soft:#eef1f4;
  --agir:#c2410c; --agir-bg:#fff1e8; --prep:#a16207; --prep-bg:#fdf6e3; --surv:#4b5563; --surv-bg:#f0f2f4;
  --projet:#2563eb; --recrutement:#7c3aed; --entreprise:#0f766e; --historique:#6b7280;
  --ok:#15803d; --soon:#ca8a04; --gap:#dc2626; --link:#1d4ed8;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#0f1216; --panel:#171b21; --ink:#e7eaee; --muted:#9aa4af; --line:#2a3038; --soft:#1f252d;
    --agir:#fb923c; --agir-bg:#2a1a10; --prep:#facc15; --prep-bg:#29230e; --surv:#9ca3af; --surv-bg:#20252c;
    --projet:#60a5fa; --recrutement:#a78bfa; --entreprise:#2dd4bf; --historique:#9ca3af;
    --ok:#4ade80; --soon:#facc15; --gap:#f87171; --link:#93c5fd;
  }
}
:root[data-theme="dark"]{
  --bg:#0f1216; --panel:#171b21; --ink:#e7eaee; --muted:#9aa4af; --line:#2a3038; --soft:#1f252d;
  --agir:#fb923c; --agir-bg:#2a1a10; --prep:#facc15; --prep-bg:#29230e; --surv:#9ca3af; --surv-bg:#20252c;
  --projet:#60a5fa; --recrutement:#a78bfa; --entreprise:#2dd4bf; --historique:#9ca3af;
  --ok:#4ade80; --soon:#facc15; --gap:#f87171; --link:#93c5fd;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:20px 16px 60px}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 16px;margin-bottom:6px}
h1{font-size:22px;margin:0;letter-spacing:-.01em}
.sub{color:var(--muted)}
.banner{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:8px 12px;color:var(--muted);margin:10px 0 16px;font-size:13px}
.banner b{color:var(--ink)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.kpi .v{font-size:24px;font-weight:650;font-variant-numeric:tabular-nums}
.kpi .k{color:var(--muted);font-size:12px}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:12px;position:sticky;top:0;z-index:5}
.chip{border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:999px;padding:5px 11px;cursor:pointer;font:inherit;font-size:13px}
.chip[aria-pressed="true"]{background:var(--ink);color:var(--panel);border-color:var(--ink)}
select,input[type=search]{font:inherit;font-size:13px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:5px 8px;min-width:0}
input[type=search]{flex:1 1 180px}
label.tog{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);cursor:pointer}
.count{color:var(--muted);font-size:13px;margin:4px 2px 10px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;margin-bottom:8px;overflow:hidden}
.card summary{list-style:none;cursor:pointer;padding:12px 14px;display:grid;grid-template-columns:96px 1fr auto;gap:4px 14px;align-items:start}
.card summary::-webkit-details-marker{display:none}
.card[open] summary{border-bottom:1px solid var(--line)}
.badge{font-size:11px;font-weight:700;letter-spacing:.04em;border-radius:6px;padding:4px 0;text-align:center}
.b-AGIR{color:var(--agir);background:var(--agir-bg)}
.b-PRÉPARER{color:var(--prep);background:var(--prep-bg)}
.b-SURVEILLER{color:var(--surv);background:var(--surv-bg)}
.t{font-weight:600;font-size:15px}
.meta{color:var(--muted);font-size:13px;margin-top:2px}
.fams{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
.fam{font-size:11px;border-radius:999px;padding:1px 8px;border:1px solid currentColor}
.f-projet{color:var(--projet)} .f-recrutement{color:var(--recrutement)} .f-entreprise{color:var(--entreprise)} .f-historique{color:var(--historique);border-style:dashed}
.right{text-align:right;min-width:170px}
.need{font-weight:600;font-variant-numeric:tabular-nums}
.bar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--soft);margin:6px 0 3px;width:170px;margin-left:auto}
.bar span{display:block;height:100%}
.s-ok{background:var(--ok)} .s-soon{background:var(--soon)} .s-gap{background:repeating-linear-gradient(45deg,var(--gap) 0 3px,transparent 3px 6px)}
.vtext{color:var(--muted);font-size:12px}
.body{padding:12px 14px 14px;display:grid;grid-template-columns:1fr 280px;gap:18px}
.body h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:0 0 6px}
.sig{display:flex;gap:8px;padding:6px 0;border-bottom:1px dashed var(--line)}
.sig:last-child{border-bottom:0}
.dot{width:8px;height:8px;border-radius:50%;margin-top:6px;flex:none;background:currentColor}
.sig a{color:var(--link);font-size:12px;text-decoration:none;word-break:break-all}
.sig a:hover{text-decoration:underline}
.fx{font-size:10px;font-weight:700;color:var(--historique);border:1px dashed var(--historique);border-radius:4px;padding:0 4px;margin-left:4px}
.side .box{background:var(--soft);border-radius:8px;padding:10px 12px;margin-bottom:10px}
.action{border-left:3px solid var(--ink);padding-left:10px;font-weight:600}
.prob{display:flex;justify-content:space-between;gap:8px;font-size:13px}
.more{color:var(--muted);font-size:12px;margin-top:6px}
.empty{color:var(--muted);text-align:center;padding:40px}
@media (max-width:720px){
  .card summary{grid-template-columns:80px 1fr}
  .right{grid-column:1/-1;text-align:left}
  .bar{margin-left:0}
  .body{grid-template-columns:1fr}
}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>FlexRadar · Brief de la semaine</h1>
    <span class="sub" id="date"></span>
  </header>
  <div class="banner"><b>Prototype.</b> Les signaux Projet, Recrutement et Entreprise viennent de sources publiques réelles (SIMAP, Bulletin officiel, FOSC, job-room, jobup).
    L'<b>historique client Flexsis et le vivier sont des données fictives</b>, générées pour la démonstration : les signaux concernés portent la mention FICTIF.</div>
  <div class="kpis" id="kpis"></div>
  <div class="filters">
    <button class="chip" data-level="AGIR" aria-pressed="true">AGIR</button>
    <button class="chip" data-level="PRÉPARER" aria-pressed="true">PRÉPARER</button>
    <button class="chip" data-level="SURVEILLER" aria-pressed="false">SURVEILLER</button>
    <select id="kind" aria-label="Cible"><option value="">Entreprises + zones</option><option value="entreprise">Entreprises</option><option value="zone">Zones</option></select>
    <select id="district" aria-label="District"><option value="">Tous les districts</option></select>
    <select id="metier" aria-label="Métier"><option value="">Tous les métiers</option></select>
    <input type="search" id="q" placeholder="Rechercher une entreprise, un projet…">
    <label class="tog"><input type="checkbox" id="public"> Signaux publics uniquement</label>
  </div>
  <div class="count" id="count"></div>
  <div id="list"></div>
</div>
<script id="data" type="application/json">__DATA__</script>
<script>
const DATA = JSON.parse(document.getElementById('data').textContent);
const ORDER = {"AGIR":0,"PRÉPARER":1,"SURVEILLER":2};
const FAM = {projet:"Projet",recrutement:"Recrutement",entreprise:"Entreprise",historique:"Historique"};
const state = {levels:new Set(["AGIR","PRÉPARER"]), kind:"", district:"", metier:"", q:"", pub:false};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const lvl = r => state.pub ? r.levelPublic : r.level;
const fmtDate = s => new Date(s+"T00:00:00").toLocaleDateString("fr-CH",{day:"numeric",month:"short"});

document.getElementById("date").textContent = "semaine du " + new Date(DATA.today+"T00:00:00").toLocaleDateString("fr-CH",{day:"numeric",month:"long",year:"numeric"});
const districts = [...new Set(DATA.rows.map(r=>r.district))].sort();
const metiers = [...new Set(DATA.rows.flatMap(r=>r.metiers))].sort();
for (const d of districts) document.getElementById("district").insertAdjacentHTML("beforeend", `<option>${esc(d)}</option>`);
for (const m of metiers) document.getElementById("metier").insertAdjacentHTML("beforeend", `<option>${esc(m)}</option>`);

function kpis(rows){
  const c = l => rows.filter(r=>lvl(r)===l).length;
  const act = rows.filter(r=>lvl(r)!=="SURVEILLER");
  const items = [
    ["Opportunités", rows.length], ["AGIR", c("AGIR")], ["PRÉPARER", c("PRÉPARER")],
    ["Postes anticipés", act.reduce((a,r)=>a+r.need[1],0)], ["À sourcer", act.reduce((a,r)=>a+r.vivier.a_sourcer,0)],
  ];
  document.getElementById("kpis").innerHTML = items.map(([k,v])=>`<div class="kpi"><div class="v">${v}</div><div class="k">${k}${state.pub&&k!=="Opportunités"?" · publics":""}</div></div>`).join("");
}

function bar(v){
  const need = Math.max(v.besoin,1), scale = Math.max(need, v.disponibles + v.bientot);
  const w = x => (100*x/scale).toFixed(1)+"%";
  const ok = Math.min(v.disponibles, need), soon = Math.min(v.bientot, need-ok), gap = v.a_sourcer;
  return `<div class="bar" title="Besoin ≈${v.besoin}"><span class="s-ok" style="width:${w(ok)}"></span><span class="s-soon" style="width:${w(soon)}"></span><span class="s-gap" style="width:${w(gap)}"></span></div>`;
}

function card(r){
  const L = lvl(r);
  const when = r.weeks===0 ? "immédiat / en cours" : `dans ~${r.weeks} sem.`;
  const fams = r.families.map(f=>`<span class="fam f-${f}">${FAM[f]}${f==="historique"?" · fictif":""}</span>`).join("");
  const sigs = r.signals.filter(s=>!(state.pub && s.x)).map(s=>`
    <div class="sig f-${s.f}"><span class="dot"></span><div>
      <div>${esc(s.l)}${s.x?'<span class="fx">FICTIF</span>':""}</div>
      ${s.u?`<a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.u.replace(/^https?:\/\//,"").slice(0,90))}</a>`:""}
    </div></div>`).join("");
  const more = r.nSignals > r.signals.length ? `<div class="more">+${r.nSignals-r.signals.length} autres signaux non affichés</div>` : "";
  const prob = r.kind==="zone" ? `<div class="box"><h3>Entreprises probables</h3>${
      r.probable.length ? r.probable.map(([c,p])=>`<div class="prob"><span>${esc(c)}</span><b>${Math.round(p*100)} %</b></div>`).join("")
        + `<div class="more">Part estimée d'après leurs antécédents dans la zone. Indicatif, pas une attribution.</div>`
      : `<div class="more">Aucun antécédent : cibler les clients Flexsis du district.</div>`}</div>` : "";
  const v = r.vivier;
  return `<details class="card" data-id="${r.id}">
    <summary>
      <div class="badge b-${L}">${L}</div>
      <div>
        <div class="t">${esc(r.target)}</div>
        <div class="meta">${esc(r.metiers.join(", "))} · ${esc(r.district)}</div>
        <div class="fams">${fams}</div>
      </div>
      <div class="right">
        <div class="need">renfort ${r.need[0]}–${r.need[2]} <span class="vtext">(≈${r.need[1]})</span></div>
        ${bar(v)}
        <div class="vtext">${v.disponibles} dispo · ${v.bientot} bientôt · <b style="color:var(--gap)">${v.a_sourcer}</b> à sourcer</div>
        <div class="vtext">${when}</div>
      </div>
    </summary>
    <div class="body">
      <div><h3>Pourquoi (${r.nSignals} signaux)</h3>${sigs}${more}</div>
      <div class="side">
        <div class="box"><h3>Action</h3><div class="action">${esc(r.action)}</div></div>
        <div class="box"><h3>Quand</h3>${fmtDate(r.window[0])} → ${fmtDate(r.window[1])}</div>
        <div class="box"><h3>Besoin estimé</h3>Renfort intérim ${r.need[0]}–${r.need[2]} (central ${r.need[1]})${r.team[1]?`<div class="more">Équipe sur place estimée ${Math.round(r.team[0])}–${Math.round(r.team[2])}. Hypothèses : part main-d'œuvre, coût horaire, phasage, 25 % de renfort.</div>`:""}</div>
        <div class="box"><h3>Vivier (fictif)</h3>${v.disponibles} disponibles · ${v.bientot} libres d'ici le démarrage · ${v.anciens} anciens réactivables · <b>${v.a_sourcer} à sourcer</b></div>
        ${prob}
      </div>
    </div>
  </details>`;
}

function render(){
  const q = state.q.toLowerCase();
  let rows = DATA.rows.filter(r =>
    state.levels.has(lvl(r)) &&
    (!state.kind || r.kind===state.kind) &&
    (!state.district || r.district===state.district) &&
    (!state.metier || r.metiers.includes(state.metier)) &&
    (!q || (r.target+" "+r.signals.map(s=>s.l).join(" ")).toLowerCase().includes(q)));
  rows.sort((a,b)=>ORDER[lvl(a)]-ORDER[lvl(b)] || a.weeks-b.weeks || b.need[1]-a.need[1] || a.id-b.id);
  kpis(DATA.rows);
  document.getElementById("count").textContent = `${rows.length} opportunité(s) affichée(s)`;
  const shown = rows.slice(0,150);
  document.getElementById("list").innerHTML = shown.length ? shown.map(card).join("") + (rows.length>150?`<div class="empty">… ${rows.length-150} de plus : affinez les filtres</div>`:"") : `<div class="empty">Aucune opportunité pour ces filtres.</div>`;
}

document.querySelectorAll(".chip[data-level]").forEach(b=>b.addEventListener("click",()=>{
  const l=b.dataset.level, on=b.getAttribute("aria-pressed")!=="true";
  b.setAttribute("aria-pressed", on); on?state.levels.add(l):state.levels.delete(l); render();
}));
for (const [id,key] of [["kind","kind"],["district","district"],["metier","metier"]])
  document.getElementById(id).addEventListener("change",e=>{state[key]=e.target.value;render();});
document.getElementById("q").addEventListener("input",e=>{state.q=e.target.value;render();});
document.getElementById("public").addEventListener("change",e=>{state.pub=e.target.checked;render();});
render();
</script>
</body>
</html>
"""

if __name__ == "__main__":
    main()
