import type { Family, Level, Opportunity, Signal, SourceUsage } from "@/lib/types"

export const LEVEL_ORDER: Record<Level, number> = { AGIR: 0, PRÉPARER: 1, SURVEILLER: 2 }

export const FAMILY_LABEL: Record<Family, string> = {
  projet: "Projet",
  recrutement: "Recrutement",
  entreprise: "Entreprise",
  historique: "Historique",
}

export const FAMILY_HINT: Record<Family, string> = {
  projet: "Du travail arrive (chantier attribué, permis, appel d'offres)",
  recrutement: "L'entreprise ou sa zone cherche déjà du monde",
  entreprise: "L'entreprise grandit (capital, fusion, succursale)",
  historique: "Le client a eu ce besoin à la même période (données simulées)",
}

export const SIGNAL_TYPE_LABEL: Record<string, string> = {
  adjudication: "Adjudication SIMAP",
  appel_offres: "Appel d'offres SIMAP",
  permis: "Mise à l'enquête",
  annonce_directe: "Annonce d'emploi",
  agences_concurrentes: "Agence concurrente",
  tension_zone: "Tension de recrutement",
  augmentation: "Augmentation de capital",
  fusion: "Fusion",
  ouverture: "Nouvelle succursale",
  client_recurrent: "Historique Flexsis",
}

const FAMILY_RANK: Record<Family, number> = { projet: 0, recrutement: 1, entreprise: 2, historique: 3 }

export function sortFamilies(fams: Family[]): Family[] {
  return [...fams].sort((a, b) => FAMILY_RANK[a] - FAMILY_RANK[b])
}

// "Coffreur / constructeur béton armé" -> "Coffreur"
export function shortMetier(label: string): string {
  return label.split(" / ")[0]
}

export function metiersLabel(metiers: string[], max = 3): string {
  const short = metiers.map(shortMetier)
  return short.slice(0, max).join(", ") + (short.length > max ? ` +${short.length - max}` : "")
}

export function shortDistrict(d: string | null | undefined): string {
  return (d ?? "—").replace(/^(District de |District d'|District des |Bezirk )/, "")
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  if (!iso) return "—"
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("fr-CH", opts)
}

export function horizonLabel(o: Pick<Opportunity, "weeks">): string {
  if (o.weeks <= 0) return "Immédiat"
  if (o.weeks === 1) return "Dans ~1 semaine"
  return `Dans ~${o.weeks} semaines`
}

export function needLabel(o: Pick<Opportunity, "need">): string {
  const [lo, mid, hi] = o.need
  return lo === hi ? `${mid}` : `${lo}–${hi}`
}

export function confidence(o: Pick<Opportunity, "families">): { label: string; tone: "high" | "mid" | "low" } {
  const n = o.families.length
  if (n >= 3) return { label: `Élevée · ${n} familles convergent`, tone: "high" }
  if (n === 2) return { label: "Moyenne · 2 familles convergent", tone: "mid" }
  return { label: "Faible · 1 seule famille", tone: "low" }
}

export function daysAgo(iso: string | null | undefined, today: string): string {
  if (!iso) return ""
  const d = Math.round((Date.parse(today) - Date.parse(iso.slice(0, 10))) / 86_400_000)
  if (d <= 0) return "aujourd'hui"
  if (d === 1) return "il y a 1 jour"
  if (d < 30) return `il y a ${d} jours`
  return `il y a ${Math.round(d / 30)} mois`
}

const DAY = 86_400_000
const weeksFrom = (today: string, iso: string) => Math.max(0, Math.floor((Date.parse(iso) - Date.parse(today)) / DAY / 7))

// Fourchette de semaines entre `today` et une fenêtre [début, fin] : « Dans 4–6 semaines », « D'ici 8 semaines ».
export function weeksRange(window: [string, string], today: string): string {
  const lo = weeksFrom(today, window[0])
  const hi = weeksFrom(today, window[1])
  if (lo === 0) return hi === 0 ? "Cette semaine" : hi <= 12 ? `D'ici ${hi} semaine${hi > 1 ? "s" : ""}` : "Dès maintenant"
  if (hi - lo > 12) return `Dès ~${lo} semaine${lo > 1 ? "s" : ""}`
  return `Dans ${lo}–${hi} semaines`
}

// Regroupement des types de signaux par source publique (filtre « Source »).
export const SOURCE_GROUPS: Record<string, { label: string; types: string[] }> = {
  simap: { label: "SIMAP (marchés publics)", types: ["adjudication", "appel_offres"] },
  permis: { label: "Mises à l'enquête", types: ["permis"] },
  annonces: { label: "Annonces d'emploi", types: ["annonce_directe", "agences_concurrentes", "tension_zone"] },
  fosc: { label: "Registre du commerce (FOSC)", types: ["augmentation", "fusion", "ouverture"] },
  historique: { label: "Historique Flexsis (simulé)", types: ["client_recurrent"] },
}

const fmtMchf = (s: string) => Number(s).toLocaleString("fr-CH", { maximumFractionDigits: 1 })

// Une raison courte par type de signal (« Adjudication SIMAP 1,2 MCHF », « 3 mises à l'enquête »).
export function shortReasons(signals: Signal[], max = 3): string[] {
  const byType = new Map<string, Signal[]>()
  for (const s of signals) byType.set(s.type, [...(byType.get(s.type) ?? []), s])
  const out: string[] = []
  for (const [type, list] of byType) {
    const s = list[0]
    const n = list.length
    switch (type) {
      case "adjudication": {
        const m = s.label.match(/([\d.]+) MCHF/)
        out.push(n > 1 ? `${n} adjudications SIMAP` : `Adjudication SIMAP${m ? ` ${fmtMchf(m[1])} MCHF` : ""}`)
        break
      }
      case "appel_offres":
        out.push(n > 1 ? `${n} appels d'offres SIMAP` : "Appel d'offres SIMAP")
        break
      case "permis": {
        const communes = [...new Set(list.map((x) => x.label.match(/\) (.+?) —/)?.[1]).filter(Boolean))]
        out.push(`${n > 1 ? `${n} mises à l'enquête` : "Mise à l'enquête"}${communes.length ? ` (${communes.slice(0, 2).join(", ")})` : ""}`)
        break
      }
      case "annonce_directe": {
        const age = s.label.match(/depuis (\d+) j/)
        out.push(n > 1 ? `${n} annonces d'emploi ouvertes` : age ? `Annonce en ligne depuis ${age[1]} j` : "Annonce d'emploi récente")
        break
      }
      case "agences_concurrentes":
        out.push(`${n} annonce${n > 1 ? "s" : ""} d'agences concurrentes`)
        break
      case "tension_zone":
        out.push(s.label.replace(/ pour ces métiers dans le .*/, " dans la zone"))
        break
      case "client_recurrent":
        out.push("Besoin récurrent à cette période (simulé)")
        break
      default:
        out.push(s.label.replace(/^FOSC [\d-]+ : /, ""))
    }
    if (out.length >= max) break
  }
  return out
}

// « Mise à l'enquête (grand) Saxon — terrassement : Construction d'une halle » -> « Construction d'une halle »
// Pour une zone (plusieurs projets), un décompte plutôt qu'un projet pris au hasard.
export function projectType(o: Pick<Opportunity, "signals" | "kind">): string | null {
  const projets = o.signals.filter((x) => x.family === "projet" && !x.fictif)
  const s = projets[0]
  if (!s) return null
  if (o.kind === "zone" && projets.length > 1) return `${projets.length} projets détectés dans la zone`
  const text = s.label.split(" : ").slice(1).join(" : ").replace(/ \[entreprise nommée.*\]$/, "").trim()
  return text || null
}

// Distance relative lisible pour la chronologie : « Dans 2–4 semaines », « En cours ».
export function relativeWindow(window: [string, string], today: string): string {
  if (window[0] <= today) return window[1] <= today ? "Terminé" : `En cours · jusqu'à ${fmtDate(window[1])}`
  return weeksRange(window, today)
}

// « Zermatt · Visp » pour une entreprise (commune du projet), « Martigny » pour une zone.
export function placeLabel(o: Pick<Opportunity, "place" | "kind" | "district">): string {
  return o.place && o.kind === "entreprise" ? `${o.place} · ${shortDistrict(o.district)}` : shortDistrict(o.district)
}

// Titre affiché : une zone (district × métier) se distingue par son métier, sinon toutes s'appellent pareil.
export function alertTitle(o: Pick<Opportunity, "kind" | "target" | "district" | "metiers">): string {
  if (o.kind !== "zone") return o.target
  return `${metiersLabel(o.metiers, 2)} · zone ${shortDistrict(o.district)}`
}

// Rôle d'une source dans le moteur (page Sources).
export const USAGE_LABEL: Record<SourceUsage, string> = {
  projet: "Signal Projet",
  recrutement: "Signal Recrutement",
  entreprise: "Signal Entreprise",
  historique: "Signal Historique",
  vivier: "Vivier",
  contexte: "Contexte",
}

// « il y a 3 h », « il y a 2 j » : fraîcheur d'un snapshot.
export function ageLabel(hours: number | undefined): string {
  if (hours === undefined) return "—"
  if (hours < 1) return "il y a < 1 h"
  if (hours < 48) return `il y a ${Math.round(hours)} h`
  return `il y a ${Math.round(hours / 24)} j`
}

// « Adjudication SIMAP 14.11 MCHF : NG13 Täsch-Zermatt, galerie… [entreprise nommée : X] » -> « NG13 Täsch-Zermatt, galerie… »
function subject(label: string): string {
  return label.split(" : ").slice(1).join(" : ").replace(/ \[entreprise nommée.*\]$/, "").trim()
}

// Résumé en quelques phrases, construit uniquement à partir des signaux (rien d'inventé) : le projet,
// le recrutement, la vie de l'entreprise, puis les profils recherchés.
export function alertSummary(o: Pick<Opportunity, "kind" | "signals" | "metiers" | "district">): string {
  const pub = o.signals.filter((s) => !s.fictif)
  const of = (t: string) => pub.filter((s) => s.type === t)
  const zone = o.kind === "zone"
  const out: string[] = []

  const adj = of("adjudication")
  const ao = of("appel_offres")
  const permis = of("permis")
  if (adj.length) {
    const mchf = adj[0].label.match(/([\d.]+) MCHF/)?.[1]
    const what = `« ${subject(adj[0].label)} »${mchf ? ` (${fmtMchf(mchf)} MCHF)` : ""}`
    out.push(
      zone
        ? `Marché public attribué dans la zone : ${what}${adj.length > 1 ? ` et ${adj.length - 1} autre${adj.length > 2 ? "s" : ""}` : ""}.`
        : `A remporté ${adj.length > 1 ? `${adj.length} marchés publics, dont ` : "le marché "}${what}.`,
    )
  } else if (ao.length) {
    out.push(`Appel d'offres en cours : « ${subject(ao[0].label)} »${ao.length > 1 ? ` (+${ao.length - 1})` : ""}.`)
  }
  if (permis.length) {
    const commune = permis[0].label.match(/\) (.+?) —/)?.[1]
    out.push(
      permis.length > 1
        ? `${permis.length} projets mis à l'enquête${zone ? " dans le district" : ""}, dont « ${subject(permis[0].label)} »${commune ? ` à ${commune}` : ""}.`
        : `Projet mis à l'enquête${commune ? ` à ${commune}` : ""} : « ${subject(permis[0].label)} ».`,
    )
  }

  const direct = of("annonce_directe")
  const agences = of("agences_concurrentes").length
  const tension = of("tension_zone")[0]?.label.match(/^(\d+)/)?.[1]
  if (direct.length) out.push(`Recrute déjà : ${direct.length} annonce${direct.length > 1 ? "s" : ""} d'emploi ouverte${direct.length > 1 ? "s" : ""}.`)
  const concurrents = agences || Number(tension ?? 0)
  if (concurrents) out.push(`${concurrents} annonce${concurrents > 1 ? "s" : ""} d'agences concurrentes sur ces métiers.`)

  for (const s of pub.filter((x) => x.family === "entreprise").slice(0, 1)) out.push(`${s.label.replace(/^FOSC [\d-]+ : /, "")}.`)

  out.push(`Profils : ${metiersLabel(o.metiers, 4)}.`)
  return out.join(" ")
}

// Version courte de weeksRange pour les cartes : « ≤ 10 sem. », « 4–6 sem. », « Dès 14 sem. ».
export function weeksShort(window: [string, string], today: string): string {
  const lo = weeksFrom(today, window[0])
  const hi = weeksFrom(today, window[1])
  if (lo === 0) return hi === 0 ? "Cette sem." : hi <= 12 ? `≤ ${hi} sem.` : "Maintenant"
  if (hi - lo > 12) return `Dès ${lo} sem.`
  return `${lo}–${hi} sem.`
}
