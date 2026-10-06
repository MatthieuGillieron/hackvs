// Agrégation des alertes par district (carte de la page Analytics).
// Règles du moteur : le niveau d'un district = le meilleur niveau de ses alertes ; le renfort ne compte que
// AGIR + PRÉPARER (fourchette = somme des bornes) ; le vivier (fictif) ne change jamais le niveau.

import { LEVEL_ORDER } from "@/lib/format"
import type { Candidate, Family, Level, Opportunity } from "@/lib/types"

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

export const LEVEL_FILL: Record<Level | "none", string> = {
  AGIR: "fill-red-500",
  PRÉPARER: "fill-yellow-400",
  SURVEILLER: "fill-slate-400",
  none: "fill-transparent",
}
export const LEVEL_DOT: Record<Level, string> = {
  AGIR: "bg-red-500",
  PRÉPARER: "bg-yellow-400",
  SURVEILLER: "bg-slate-400",
}

export function rangeLabel([lo, hi]: [number, number], unit = "pers."): string {
  return `${lo === hi ? lo : `${lo}–${hi}`} ${unit}`
}
