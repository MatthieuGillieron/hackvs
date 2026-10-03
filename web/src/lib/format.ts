import type { Family, Level, Opportunity } from "@/lib/types"

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
