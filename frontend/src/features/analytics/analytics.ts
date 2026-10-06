// Agrégats de la page Analytics. Deux sources, jamais mélangées :
// - le moteur (alertes exportées) : anticipation, alertes, sources, tension par métier — calculés, rien d'inventé ;
// - l'activité du consultant (tâches + comptes-rendus d'appel en localStorage) : parcours réel, ou jeu de démo marqué.
// Une alerte est « détectée » à la date de son premier signal public daté.

import { LEVEL_ORDER } from "@/lib/format"
import { byMetier, isActive, type MetierRow } from "@/features/analytics/stats"
import type { CallLog, CallOutcome, Task, TaskStatus } from "@/features/tasks/tasks"
import type { Candidate, Opportunity, SourceStatus } from "@/lib/types"

export const PERIODS = {
  "30": { label: "30 derniers jours", days: 30 },
  "90": { label: "90 derniers jours", days: 90 },
  "365": { label: "12 derniers mois", days: 365 },
} as const
export type PeriodKey = keyof typeof PERIODS
export const DEFAULT_PERIOD: PeriodKey = "90"

const DAY = 86_400_000
const toTime = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00Z").getTime()
export const daysBetween = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / DAY)
export function shiftDays(iso: string, days: number): string {
  return new Date(toTime(iso) + days * DAY).toISOString().slice(0, 10)
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)} %`)
export const fmtNum = (x: number) => x.toLocaleString("fr-CH")

// ------------------------------------------------------------------ moteur

// Premier signal public daté = date de détection de l'alerte.
export function detectedAt(o: Opportunity): string | null {
  const dates = o.signals.filter((s) => !s.fictif && s.date).map((s) => s.date!.slice(0, 10))
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null
}

// Avance prise sur le besoin : du premier signal public au début estimé du besoin, en semaines.
export function leadWeeks(o: Opportunity): number | null {
  const d = detectedAt(o)
  return d ? Math.max(0, daysBetween(d, o.window[0]) / 7) : null
}

// Alertes détectées dans les `days` derniers jours.
export function detectedIn(opps: Opportunity[], today: string, days: number): Opportunity[] {
  const lo = shiftDays(today, -days)
  return opps.filter((o) => {
    const d = detectedAt(o)
    return !!d && d > lo && d <= today
  })
}

export interface EngineStats {
  found: Opportunity[] // alertes détectées dans la période (tous niveaux)
  alerts: number
  active: Opportunity[] // AGIR + PRÉPARER
  urgent: number
  lead: number | null // anticipation médiane, semaines
  coverage: number | null // part du renfort (estimation centrale) couverte par le vivier disponible (simulé)
  toSource: number // profils à sourcer (somme des manques par alerte, simulé)
}

export function engineStats(opps: Opportunity[], today: string, days: number): EngineStats {
  const found = detectedIn(opps, today, days)
  const active = found.filter(isActive)
  const need = active.reduce((s, o) => s + o.need[1], 0)
  const covered = active.reduce((s, o) => s + Math.min(o.vivier.disponibles, o.need[1]), 0)
  return {
    found,
    alerts: found.length,
    active,
    urgent: active.filter((o) => o.level === "AGIR").length,
    lead: median(active.map(leadWeeks).filter((x): x is number => x !== null)),
    coverage: need ? covered / need : null,
    toSource: active.reduce((s, o) => s + o.vivier.a_sourcer, 0),
  }
}

// Publications lues dans les sources publiques qui alimentent une famille de signaux (dernier relevé).
export function publicationsRead(sources: SourceStatus[]): number {
  return sources
    .filter((s) => !s.fictif && (s.usage === "projet" || s.usage === "recrutement" || s.usage === "entreprise"))
    .reduce((n, s) => n + s.count, 0)
}

export interface TensionRow extends MetierRow {
  coverage: number // vivier / bas de la fourchette, plafonné à 1 (100 % = couvert)
  toSource: number // profils manquants sous le bas de la fourchette
}

export function tension(active: Opportunity[], candidates: Map<string, Candidate>): TensionRow[] {
  return byMetier(active, candidates).map((r) => ({
    ...r,
    coverage: Math.min(1, r.vivier / Math.max(1, r.need[0])),
    toSource: Math.max(0, r.need[0] - r.vivier),
  })).sort((a, b) => b.toSource - a.toSource || b.need[1] - a.need[1]) // les manques d'abord
}

// ------------------------------------------------------------------ activité du consultant

const inRange = (iso: string, lo: string, hi: string) => iso.slice(0, 10) > lo && iso.slice(0, 10) <= hi

export interface Activity {
  // Entonnoir = cohorte des alertes mises en suivi dans la période (les taux restent ≤ 100 %).
  tracked: Task[]
  called: Task[] // … déjà appelées
  interested: Task[] // … avec au moins un appel « Intéressé »
  calls: CallLog[] // appels de la période
  outcomes: Record<CallOutcome, number>
}

export function activity(tasks: Record<string, Task>, today: string, days: number): Activity {
  const lo = shiftDays(today, -days)
  const list = Object.values(tasks)
  const calls = list.flatMap((t) => (t.calls ?? []).filter((c) => inRange(c.at, lo, today)))
  const outcomes: Record<CallOutcome, number> = { interesse: 0, a_rappeler: 0, pas_de_besoin: 0, mauvais_interlocuteur: 0 }
  for (const c of calls) outcomes[c.outcome]++
  const tracked = list.filter((t) => inRange(t.addedAt, lo, today))
  const called = tracked.filter((t) => t.calls?.length)
  return {
    tracked,
    called,
    interested: called.filter((t) => t.calls!.some((c) => c.outcome === "interesse")),
    calls,
    outcomes,
  }
}

// ------------------------------------------------------------------ jeu de démo (fictif)

// Petit générateur déterministe : le même jeu à chaque chargement.
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32
    return s / 2 ** 32
  }
}

// ~2 mois d'activité plausible sur les alertes actives les plus prioritaires. Tout est marqué `demo`.
export function demoTasks(opps: Opportunity[], today: string): Task[] {
  const r = rng(42)
  const picks = opps
    .filter(isActive)
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.weeks - b.weeks || a.id - b.id)
    .slice(0, 26)
  // Issue du dernier appel ; null = suivie mais pas encore appelée.
  const plan: (CallOutcome | null)[] = [
    "interesse", "interesse", "a_rappeler", null, "pas_de_besoin", "a_rappeler", "interesse", "interesse",
    "mauvais_interlocuteur", "interesse", "a_rappeler", "pas_de_besoin", null, "interesse", "a_rappeler",
    "pas_de_besoin", null, "interesse", "a_rappeler", null, "mauvais_interlocuteur", null, "pas_de_besoin", null,
    "interesse", null,
  ]
  const at = (d: string) => `${d}T${String(8 + Math.floor(r() * 9)).padStart(2, "0")}:${String(Math.floor(r() * 60)).padStart(2, "0")}:00.000Z`
  return picks.map((o, i) => {
    const added = shiftDays(today, -Math.round(3 + r() * 70))
    const outcome = plan[i % plan.length]
    const contact = o.company ?? o.probable[0]?.company ?? null
    const calls: CallLog[] = []
    if (outcome) {
      const gap = daysBetween(added, today)
      const first = shiftDays(added, Math.min(gap, Math.round(r() * 5)))
      // Un premier appel « à rappeler » précède parfois l'issue finale.
      if (outcome !== "a_rappeler" && r() < 0.35 && daysBetween(first, today) > 4) {
        calls.push({ at: at(first), outcome: "a_rappeler", note: "", callback: shiftDays(first, 3), contact })
      }
      const last = calls.length ? shiftDays(first, 3 + Math.round(r() * Math.max(0, daysBetween(first, today) - 4))) : first
      const callback = outcome === "a_rappeler" ? shiftDays(today, Math.round(-6 + r() * 14)) : null
      calls.push({ at: at(last), outcome, note: "", callback, contact })
      calls.reverse() // du plus récent au plus ancien, comme logCall
    }
    const status: TaskStatus = !outcome ? (r() < 0.5 ? "a_faire" : "en_cours") : outcome === "pas_de_besoin" ? "traite" : "en_cours"
    const updated = calls[0]?.at ?? `${added}T09:00:00.000Z`
    return { key: o.key, status, note: "", addedAt: `${added}T08:30:00.000Z`, updatedAt: updated, calls, demo: true }
  })
}
