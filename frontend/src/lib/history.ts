import type { Candidate, Client, Mission } from "@/lib/types"

// Historique Flexsis (DONNÉES SIMULÉES) rattaché aux bases Candidats et Entreprises.
// Simple consultation : pas de classement ni de score, seulement ce qui s'est passé.

const DAY = 86_400_000

export interface CandidateHistory {
  candidate: Candidate
  missions: Mission[] // les plus récentes d'abord
  hours: number
  clients: number
  current: Mission | null
  last: string | null // fin de la dernière mission (ou en cours)
}

// Client actif = mission en cours ou terminée il y a moins de 12 mois ; ancien = missions plus anciennes ; prospect = aucune.
export type ClientState = "actif" | "ancien" | "prospect"

export interface ClientHistory {
  client: Client
  state: ClientState
  missions: Mission[]
  hours: number
  workers: number // intérimaires distincts placés
  current: number // missions en cours
  last: string | null
}

const recentFirst = (a: Mission, b: Mission) => b.debut.localeCompare(a.debut)

function groupBy(missions: Mission[], key: (m: Mission) => string) {
  const out = new Map<string, Mission[]>()
  for (const m of missions) out.set(key(m), [...(out.get(key(m)) ?? []), m])
  return out
}

const lastEnd = (ms: Mission[]) => (ms.length ? ms.map((m) => m.fin).sort().at(-1)! : null)

export function candidateHistory(candidates: Candidate[], missions: Mission[], today: string): CandidateHistory[] {
  const by = groupBy(missions, (m) => m.candidat)
  return candidates.map((c) => {
    const ms = (by.get(c.id) ?? []).sort(recentFirst)
    return {
      candidate: c,
      missions: ms,
      hours: ms.reduce((n, m) => n + m.heures, 0),
      clients: new Set(ms.map((m) => m.client)).size,
      current: ms.find((m) => m.statut === "en cours" && m.debut <= today) ?? null,
      last: lastEnd(ms.filter((m) => m.debut <= today)),
    }
  })
}

export function clientHistory(clients: Client[], missions: Mission[], today: string): ClientHistory[] {
  const by = groupBy(missions, (m) => m.client)
  const yearAgo = new Date(Date.parse(today) - 365 * DAY).toISOString().slice(0, 10)
  return clients.map((c) => {
    const ms = (by.get(c.name) ?? []).sort(recentFirst)
    const current = ms.filter((m) => m.statut === "en cours").length
    const last = lastEnd(ms)
    return {
      client: c,
      state: !ms.length ? "prospect" : current || (last && last >= yearAgo) ? "actif" : "ancien",
      missions: ms,
      hours: ms.reduce((n, m) => n + m.heures, 0),
      workers: new Set(ms.map((m) => m.candidat)).size,
      current,
      last,
    }
  })
}

export function monthsSince(iso: string | null, today: string): number | null {
  if (!iso) return null
  return Math.floor((Date.parse(today) - Date.parse(iso)) / DAY / 30.44)
}

// « en cours », « il y a 3 mois », « jamais »
export function sinceLabel(iso: string | null, today: string, ongoing = false): string {
  if (ongoing) return "en cours"
  const m = monthsSince(iso, today)
  if (m === null) return "jamais"
  if (m < 1) return "ce mois-ci"
  if (m < 24) return `il y a ${m} mois`
  return `il y a ${Math.floor(m / 12)} ans`
}

export const CANDIDATE_STATUT: Record<Candidate["statut"], { label: string; plural: string; dot: string }> = {
  disponible: { label: "Disponible", plural: "Disponibles", dot: "bg-emerald-500" },
  "en mission": { label: "En mission", plural: "En mission", dot: "bg-blue-500" },
  indisponible: { label: "Indisponible", plural: "Indisponibles", dot: "bg-amber-500" },
  ancien: { label: "Ancien", plural: "Anciens", dot: "bg-slate-400" },
}

export const CLIENT_STATE: Record<ClientState, { label: string; plural: string; dot: string; hint: string }> = {
  actif: { label: "Client actif", plural: "Clients actifs", dot: "bg-emerald-500", hint: "mission en cours ou dans les 12 derniers mois" },
  ancien: { label: "Ancien client", plural: "Anciens clients", dot: "bg-slate-400", hint: "aucune mission depuis plus de 12 mois" },
  prospect: { label: "Sans mission", plural: "Sans mission", dot: "bg-muted-foreground/40", hint: "dans le portefeuille, jamais de mission" },
}
