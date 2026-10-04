import type { Candidate, Client, Mission, Opportunity } from "@/lib/types"

// Rapprochement alerte ↔ données Flexsis (FICTIVES) : historique client et candidats pour le besoin.

// Même normalisation que prototype/signals.py:norm_company (formes juridiques retirées).
export function normCompany(name: string | null | undefined): string {
  const n = (name ?? "")
    .toLowerCase()
    .replace(/\b(sa|s\.a\.|sàrl|sarl|s\.à r\.l\.|ag|gmbh|holding|succursale.*|filiale.*|filial .*)(?=\s|$)/g, " ")
  return n.replace(/[^a-z0-9äöüéèàç]+/g, " ").trim()
}

export interface ClientHistory {
  client: Client | null
  missions: Mission[] // les plus récentes d'abord
  hours: number
  avgNote: number | null
  metiers: [string, number][] // métiers fournis, par nombre de missions
}

export function clientHistory(company: string | null, clients: Client[], missions: Mission[]): ClientHistory {
  const key = normCompany(company)
  const client = key ? (clients.find((c) => normCompany(c.name) === key) ?? null) : null
  const list = key ? missions.filter((m) => normCompany(m.client) === key).sort((a, b) => b.debut.localeCompare(a.debut)) : []
  const notes = list.map((m) => m.note).filter((n): n is number => n !== null)
  const byMetier = new Map<string, number>()
  for (const m of list) byMetier.set(m.metier, (byMetier.get(m.metier) ?? 0) + 1)
  return {
    client,
    missions: list,
    hours: list.reduce((h, m) => h + m.heures, 0),
    avgNote: notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null,
    metiers: [...byMetier].sort((a, b) => b[1] - a[1]),
  }
}

// ------------------------------------------------------------------ candidats

export interface CandidateFilters {
  dispo: "besoin" | "maintenant" | "tous" // disponible pour le besoin / dès maintenant / y compris anciens et en mission
  secondaires: boolean // accepter un métier secondaire
  tarifMax: number // CHF/h souhaité
  experienceMin: number
  memeDistrict: boolean
  dejaClient: boolean // a déjà fait une mission pour cette entreprise
  vehicule: boolean
  bienNote: boolean // note moyenne de ses missions ≥ 4/5
}

export interface CandidateMatch {
  c: Candidate
  metier: "principal" | "secondaire"
  availableFor: boolean // disponible au début du besoin
  sameDistrict: boolean
  clientMissions: number // missions déjà faites pour cette entreprise
  avgNote: number | null
}

export function matchCandidates(o: Opportunity, candidates: Candidate[], missions: Mission[]): CandidateMatch[] {
  const wanted = new Set(o.metiers)
  const company = o.kind === "entreprise" ? normCompany(o.company) : ""
  const notes = new Map<string, number[]>()
  const forClient = new Map<string, number>()
  for (const m of missions) {
    if (m.note !== null) notes.set(m.candidat, [...(notes.get(m.candidat) ?? []), m.note])
    if (company && normCompany(m.client) === company) forClient.set(m.candidat, (forClient.get(m.candidat) ?? 0) + 1)
  }
  const out: CandidateMatch[] = []
  for (const c of candidates) {
    if (c.statut === "indisponible") continue
    const metier = wanted.has(c.metierLabel) ? "principal" : c.metiersSecondaires.some((m) => wanted.has(m)) ? "secondaire" : null
    if (!metier) continue
    const n = notes.get(c.id)
    out.push({
      c,
      metier,
      availableFor: c.statut === "disponible" || (!!c.disponible_des && c.disponible_des <= o.window[0]),
      sameDistrict: c.district === o.district,
      clientMissions: forClient.get(c.id) ?? 0,
      avgNote: n ? n.reduce((a, b) => a + b, 0) / n.length : null,
    })
  }
  return out
}

export function applyFilters(list: CandidateMatch[], f: CandidateFilters, today: string): CandidateMatch[] {
  return list
    .filter(
      (m) =>
        (f.dispo === "tous" ||
          (f.dispo === "besoin" && m.availableFor) ||
          (f.dispo === "maintenant" && m.c.statut === "disponible" && (!m.c.disponible_des || m.c.disponible_des <= today))) &&
        (f.secondaires || m.metier === "principal") &&
        m.c.taux_horaire_souhaite <= f.tarifMax &&
        m.c.experience_ans >= f.experienceMin &&
        (!f.memeDistrict || m.sameDistrict) &&
        (!f.dejaClient || m.clientMissions > 0) &&
        (!f.vehicule || m.c.vehicule) &&
        (!f.bienNote || (m.avgNote ?? 0) >= 4),
    )
    .sort(
      (a, b) =>
        b.clientMissions - a.clientMissions ||
        Number(b.availableFor) - Number(a.availableFor) ||
        Number(b.sameDistrict) - Number(a.sameDistrict) ||
        Number(a.metier === "secondaire") - Number(b.metier === "secondaire") ||
        (b.avgNote ?? 0) - (a.avgNote ?? 0) ||
        a.c.taux_horaire_souhaite - b.c.taux_horaire_souhaite,
    )
}
