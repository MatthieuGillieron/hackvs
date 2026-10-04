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
  ia?: boolean          // fiche extraite du texte par LLM (prototype/extract.py)
  preuve?: string       // extrait exact du texte source qui justifie la fiche
  metiers: string[]
  detail?: SignalDetail
}

// Ce que dit la source, lisible sans l'ouvrir (prototype/signals.py `detail`) : fiche LLM déjà en cache
// (permis, annonces de projet) ou champs structurés (SIMAP, annonces d'emploi, FOSC).
export interface SignalDetail {
  titre: string | null
  resume: string | null
  faits: string[]
}

export interface Vivier {
  besoin: number
  disponibles: number
  bientot: number
  anciens: number
  a_sourcer: number
}

// Vue aérienne SWISSIMAGE réelle du lieu (prototype/images.py), jamais une photo d'illustration.
export interface AlertImage {
  src: string
  place: string | null
  precision: "parcelle" | "commune" | "district"
  credit: string
}

export interface Registry {
  name: string
  uid: string | null
  commune: string | null
  address: string | null
  purpose: string | null
  branches: number
  lastPublications: string[]
  url: string
}

export interface Opportunity {
  id: number
  key: string // stable d'un export à l'autre (« entreprise|frutiger|* ») : sert aux tâches enregistrées
  level: Level
  levelPublic: Level
  kind: "entreprise" | "zone"
  target: string
  company: string | null
  registry: Registry | null // fiche Zefix de l'entreprise, si rapprochée
  district: string | null
  place: string | null // commune (ou chef-lieu pour une zone) de la vignette
  image: AlertImage | null
  logo: { src: string; credit: string } | null // logo réel publié par l'entreprise (jobup), sinon null
  metiers: string[]
  families: Family[]
  window: [string, string]
  weeks: number
  need: [number, number, number]
  team: [number, number, number]
  vivier: Vivier
  pool: { disponibles: string[]; bientot: string[]; anciens: string[] } // ids des candidats comptés dans le vivier
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
  inscrit_le: string
  taux_horaire_souhaite: number
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
  alertKeys: string[] // clés des alertes en cours (AGIR puis PRÉPARER), pour ouvrir /alertes?alerte=<key>
  since: string // client depuis
  lastContact: { date: string; type: string; objet: string } | null
  registry: Registry | null // fiche Zefix (vraie entreprise) ; l'historique Flexsis reste fictif
  fictif: true
}

// Rôle d'une source dans le moteur : famille de signaux alimentée, ou usage sans signal.
export type SourceUsage = Family | "vivier" | "contexte"

export interface SourceStatus {
  name: string
  title: string // nom lisible
  description: string
  category: string
  site: string | null
  usage: SourceUsage | null // null = collectée mais pas encore exploitée par le moteur
  count: number
  fetchedAt?: string
  ageHours?: number
  lastDate?: string | null
  fill?: Record<string, number>
  fictif?: boolean
  status: "ok" | "ancien" | "vide" | "absent"
}

export interface Mission {
  id: string
  candidat: string // id du candidat
  client: string
  metier: string
  debut: string
  fin: string
  heures: number
  taux: number // CHF/h facturé
  statut: "terminée" | "en cours"
  note: number | null // évaluation client 1–5, null tant que la mission est en cours
  district: string | null
  fictif: true
}
