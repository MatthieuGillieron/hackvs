// Agrégats par métier (page Analytics). Mêmes règles que le moteur : renfort = AGIR + PRÉPARER en fourchettes,
// vivier (fictif) = candidats déjà appariés aux alertes (`pool`), jamais pris en compte dans le niveau.

import type { Candidate, Opportunity } from "@/lib/types"

export const isActive = (o: Opportunity) => o.level !== "SURVEILLER"

export function fitsMetier(c: Candidate, metier: string | null): boolean {
  return !metier || c.metierLabel === metier || c.metiersSecondaires.includes(metier)
}

// ------------------------------------------------------------------ par métier

export interface MetierRow {
  metier: string
  alerts: number // alertes AGIR + PRÉPARER qui citent ce métier
  need: [number, number] // part du renfort attribuée au métier (indicatif, voir plus bas)
  vivier: number // candidats disponibles appariés qui exercent ce métier (fictif)
}

// Une alerte vise souvent plusieurs métiers avec un seul besoin global : on le répartit à parts égales entre ses
// métiers pour pouvoir comparer métier par métier. Indicatif, affiché comme tel.
export function byMetier(opps: Opportunity[], candidates: Map<string, Candidate>): MetierRow[] {
  const rows = new Map<string, { alerts: number; lo: number; hi: number; ids: Set<string> }>()
  for (const o of opps.filter(isActive)) {
    const n = o.metiers.length || 1
    for (const m of o.metiers) {
      const r = rows.get(m) ?? { alerts: 0, lo: 0, hi: 0, ids: new Set<string>() }
      r.alerts++
      r.lo += o.need[0] / n
      r.hi += o.need[2] / n
      for (const id of o.pool.disponibles) r.ids.add(id)
      rows.set(m, r)
    }
  }
  return [...rows.entries()]
    .map(([metier, r]) => ({
      metier,
      alerts: r.alerts,
      need: [Math.max(r.lo > 0 ? 1 : 0, Math.round(r.lo)), Math.max(1, Math.round(r.hi))] as [number, number],
      vivier: [...r.ids].filter((id) => {
        const c = candidates.get(id)
        return !!c && fitsMetier(c, metier)
      }).length,
    }))
    .sort((a, b) => b.need[1] - a.need[1] || b.alerts - a.alerts)
}
