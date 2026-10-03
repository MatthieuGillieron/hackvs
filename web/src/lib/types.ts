// Types des JSON produits par `python3 -m prototype.export` (web/public/data/).

export type Level = "AGIR" | "PRÉPARER" | "SURVEILLER"
export type Family = "projet" | "recrutement" | "entreprise" | "historique"

export interface Meta {
  today: string
  generatedAt: string
  user: { name: string; role: string; initials: string; fictif: boolean }
  weather: { place: string; tmax: number; tmin: number; precip: number; frostDays: number } | null
  counts: Partial<Record<Level, number>>
}

export interface Signal {
  family: Family
  type: string
  label: string
  url: string | null
  date: string | null
  fictif: boolean
  window: [string, string]
  phase: string | null
}

export interface Vivier {
  besoin: number
  disponibles: number
  bientot: number
  anciens: number
  a_sourcer: number
}

export interface Opportunity {
  id: number
  level: Level
  levelPublic: Level
  kind: "entreprise" | "zone"
  target: string
  company: string | null
  district: string | null
  metiers: string[]
  families: Family[]
  window: [string, string]
  weeks: number
  need: [number, number, number]
  team: [number, number, number]
  vivier: Vivier
  action: string
  probable: { company: string; share: number }[]
  signals: Signal[]
}

export interface Candidate {
  id: string
  prenom: string
  nom: string
  metier: string
  metierLabel: string
  metiersSecondaires: string[]
  experience_ans: number
  commune: string
  district: string
  rayon_km: number
  permis: string
  vehicule: boolean
  certifications: string[]
  langues: string[]
  statut: "disponible" | "en mission" | "ancien" | "indisponible"
  disponible_des: string | null
  derniere_mission_fin: string | null
  fictif: true
}

export interface Client {
  id: string
  name: string
  sector: string
  commune: string
  district: string
  size: string
  metiers: string[]
  consultant: string
  potential: string
  alerts: number
  bestLevel: Level | null
  lastContact: { date: string; type: string; objet: string } | null
  fictif: true
}

export interface SourceStatus {
  name: string
  description: string
  count: number
  fetchedAt?: string
  ageHours?: number
  lastDate?: string | null
  fill?: Record<string, number>
  fictif?: boolean
  status: "ok" | "ancien" | "vide" | "absent"
}
