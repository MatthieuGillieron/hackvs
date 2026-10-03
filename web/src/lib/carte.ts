// Agrégation des alertes par district pour la page Carte.
// Règles du moteur : le niveau d'un district = le meilleur niveau de ses alertes ; le renfort ne compte que
// AGIR + PRÉPARER (fourchette = somme des bornes) ; le vivier (fictif) ne change jamais le niveau.

import { LEVEL_ORDER } from "@/lib/format"
import type { Candidate, Family, Level, Opportunity, Signal } from "@/lib/types"

export const PERIODS = {
  "7": { label: "J+7", weeks: 1 },
  "30": { label: "J+30", weeks: 4 },
  "90": { label: "J+90", weeks: 13 },
} as const
export type PeriodKey = keyof typeof PERIODS

export interface DistrictStats {
  district: string
  opps: Opportunity[] // filtrées (période + métier), triées par priorité
  active: Opportunity[] // AGIR + PRÉPARER
  counts: Record<Level, number>
  level: Level | null
  need: [number, number] // fourchette de renfort (AGIR + PRÉPARER)
  families: Family[]
  companies: number
  available: Candidate[] // vivier compatible disponible maintenant (fictif)
  soon: Candidate[] // vivier compatible disponible bientôt (fictif)
}

const byPriority = (a: Opportunity, b: Opportunity) =>
  LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.weeks - b.weeks || b.need[1] - a.need[1] || a.id - b.id

export function filterOpps(opps: Opportunity[], period: PeriodKey, metier: string | null): Opportunity[] {
  const max = PERIODS[period].weeks
  return opps.filter((o) => o.weeks <= max && (!metier || o.metiers.includes(metier)))
}

export function districtStats(
  district: string,
  opps: Opportunity[],
  candidates: Map<string, Candidate>,
  metier: string | null,
): DistrictStats {
  const mine = opps.filter((o) => o.district === district).sort(byPriority)
  const active = mine.filter((o) => o.level !== "SURVEILLER")
  const counts: Record<Level, number> = { AGIR: 0, PRÉPARER: 0, SURVEILLER: 0 }
  for (const o of mine) counts[o.level]++
  // Le vivier compatible est celui que le moteur a déjà apparié à chaque alerte (champ `pool`).
  const ids = (k: "disponibles" | "bientot") => [...new Set(active.flatMap((o) => o.pool[k]))]
  // Avec un filtre métier, on ne garde que les candidats qui exercent ce métier (principal ou secondaire).
  const fits = (c: Candidate) => !metier || c.metierLabel === metier || c.metiersSecondaires.includes(metier)
  const pick = (list: string[]) => list.map((id) => candidates.get(id)).filter((c): c is Candidate => !!c && fits(c))
  const available = pick(ids("disponibles"))
  const availableIds = new Set(available.map((c) => c.id))
  return {
    district,
    opps: mine,
    active,
    counts,
    level: mine[0]?.level ?? null,
    need: [active.reduce((s, o) => s + o.need[0], 0), active.reduce((s, o) => s + o.need[2], 0)],
    families: [...new Set(mine.flatMap((o) => o.families))],
    companies: new Set(mine.map((o) => o.company).filter(Boolean)).size,
    available,
    soon: pick(ids("bientot")).filter((c) => !availableIds.has(c.id)),
  }
}

// Classement des zones chaudes : niveau, puis nombre d'alertes AGIR / PRÉPARER, puis renfort.
export function compareStats(a: DistrictStats, b: DistrictStats): number {
  const la = a.level ? LEVEL_ORDER[a.level] : 9
  const lb = b.level ? LEVEL_ORDER[b.level] : 9
  return la - lb || b.counts.AGIR - a.counts.AGIR || b.counts.PRÉPARER - a.counts.PRÉPARER || b.need[1] - a.need[1]
}

// Signaux publics (jamais les fictifs), dédoublonnés, Projet et Recrutement d'abord puis du plus récent.
export function keySignals(opps: Opportunity[], max = 3): Signal[] {
  const seen = new Set<string>()
  const out: Signal[] = []
  for (const o of opps)
    for (const s of o.signals)
      if (!s.fictif && !seen.has(s.label)) {
        seen.add(s.label)
        out.push(s)
      }
  const rank = (s: Signal) => (s.family === "projet" ? 0 : s.family === "recrutement" ? 1 : 2)
  out.sort((a, b) => rank(a) - rank(b) || (b.date ?? "").localeCompare(a.date ?? ""))
  // Varier les types (adjudication, permis, annonces…) avant de répéter le même.
  const types = new Set<string>()
  const first = out.filter((s) => !types.has(s.type) && types.add(s.type))
  return [...first, ...out.filter((s) => !first.includes(s))].slice(0, max)
}

export interface WeekPoint {
  date: string // lundi de la semaine (ISO)
  need: [number, number, number] // renfort simultané : somme des fourchettes des alertes en cours cette semaine
  available: number // vivier compatible disponible à cette date (fictif)
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Projection semaine par semaine à partir des fenêtres des alertes AGIR + PRÉPARER.
export function weeklyProjection(s: DistrictStats, today: string, weeks = 13): WeekPoint[] {
  const pts: WeekPoint[] = []
  for (let w = 0; w < weeks; w++) {
    const start = addDays(today, 7 * w)
    const end = addDays(start, 6)
    const need: [number, number, number] = [0, 0, 0]
    for (const o of s.active)
      if (o.window[0] <= end && o.window[1] >= start) for (let i = 0; i < 3; i++) need[i] += o.need[i]
    const available =
      s.available.length + s.soon.filter((c) => c.disponible_des && c.disponible_des <= end).length
    pts.push({ date: start, need, available })
  }
  return pts
}

// Couleurs alignées sur LevelBadge (AGIR orange, PRÉPARER ambre, SURVEILLER gris).
export const LEVEL_FILL: Record<Level | "none", string> = {
  AGIR: "fill-orange-500",
  PRÉPARER: "fill-amber-400",
  SURVEILLER: "fill-slate-400",
  none: "fill-transparent",
}
export const LEVEL_DOT: Record<Level, string> = {
  AGIR: "bg-orange-500",
  PRÉPARER: "bg-amber-400",
  SURVEILLER: "bg-slate-400",
}

export function rangeLabel([lo, hi]: [number, number], unit = "pers."): string {
  return `${lo === hi ? lo : `${lo}–${hi}`} ${unit}`
}
