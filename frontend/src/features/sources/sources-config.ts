import * as React from "react"

import type { SourceStatus, SourceUsage } from "@/lib/types"

// Réglages des sources faits dans la page Sources. Pas de backend : enregistrés dans le navigateur (localStorage).
// - `overrides` : modifications d'une source du moteur (libellé, description, fréquence, activation, note) ;
// - `custom` : sources ajoutées à la main, en attente d'un module de collecte dans `sources/`.
// Rien ici ne modifie l'export : le moteur continue de lire les snapshots de `data/snapshots/`.

export type Frequency = "quotidienne" | "hebdomadaire" | "mensuelle" | "manuelle"
export type SourceKind = "API" | "Flux RSS" | "Page web" | "Fichier" | "Base interne"

export interface SourceSettings {
  label: string
  description: string
  category: string
  site: string
  usage: SourceUsage | ""
  frequency: Frequency
  kind: SourceKind
  enabled: boolean
  note: string
}

export interface CustomSource extends SourceSettings {
  id: string
  createdAt: string
}

// Une source telle qu'affichée : état réel (si collectée) + réglages.
export interface SourceRow extends SourceSettings {
  id: string
  custom: boolean
  edited: boolean
  status: SourceStatus | null
}

export const FREQUENCIES: Frequency[] = ["quotidienne", "hebdomadaire", "mensuelle", "manuelle"]
export const KINDS: SourceKind[] = ["API", "Flux RSS", "Page web", "Fichier", "Base interne"]

interface Store {
  overrides: Record<string, Partial<SourceSettings>>
  custom: CustomSource[]
}

const STORAGE_KEY = "flexradar.sources.v1"
const listeners = new Set<() => void>()
let store: Store = read()

function read(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Store>
    return { overrides: s.overrides ?? {}, custom: s.custom ?? [] }
  } catch {
    return { overrides: {}, custom: [] }
  }
}

function commit(next: Store) {
  store = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // stockage indisponible (navigation privée) : les réglages vivent le temps de la session
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      store = read()
      l()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener("storage", onStorage)
  }
}

// Fréquence de collecte par défaut, déduite de la nature de la source.
function defaultFrequency(s: SourceStatus): Frequency {
  if (s.category === "Statistiques OFS" || s.category === "Référentiels") return "mensuelle"
  if (s.fictif) return "manuelle"
  return "quotidienne"
}

function defaultKind(s: SourceStatus): SourceKind {
  if (s.fictif) return "Base interne"
  if (["presse", "communiques_vs", "sites_web", "flexsis"].includes(s.name)) return "Page web"
  return "API"
}

export function defaults(s: SourceStatus): SourceSettings {
  return {
    label: s.title,
    description: s.description.replace(/^\[FICTIF\] /, ""),
    category: s.category,
    site: s.site ?? "",
    usage: s.usage ?? "",
    frequency: defaultFrequency(s),
    kind: defaultKind(s),
    enabled: true,
    note: "",
  }
}

export function emptySource(): SourceSettings {
  return {
    label: "",
    description: "",
    category: "Autres",
    site: "",
    usage: "",
    frequency: "quotidienne",
    kind: "API",
    enabled: true,
    note: "",
  }
}

export function useSourceRows(sources: SourceStatus[]): SourceRow[] {
  const s = React.useSyncExternalStore(subscribe, () => store)
  return React.useMemo(
    () => [
      ...sources.map((src) => {
        const o = s.overrides[src.name] ?? {}
        return { ...defaults(src), ...o, id: src.name, custom: false, edited: Object.keys(o).length > 0, status: src }
      }),
      ...s.custom.map((c) => ({ ...c, custom: true, edited: false, status: null })),
    ],
    [sources, s],
  )
}

// Enregistre une source du moteur : seuls les champs différents des valeurs par défaut sont gardés.
export function saveOverride(src: SourceStatus, settings: SourceSettings) {
  const base = defaults(src)
  const diff = Object.fromEntries(
    Object.entries(settings).filter(([k, v]) => base[k as keyof SourceSettings] !== v),
  ) as Partial<SourceSettings>
  const { [src.name]: _old, ...rest } = store.overrides
  commit({ ...store, overrides: Object.keys(diff).length ? { ...rest, [src.name]: diff } : rest })
}

export function resetOverride(name: string) {
  const { [name]: _old, ...rest } = store.overrides
  commit({ ...store, overrides: rest })
}

export function setEnabled(row: SourceRow, enabled: boolean) {
  if (row.custom) {
    commit({ ...store, custom: store.custom.map((c) => (c.id === row.id ? { ...c, enabled } : c)) })
    return
  }
  const o = { ...(store.overrides[row.id] ?? {}) }
  if (enabled) delete o.enabled
  else o.enabled = false
  const { [row.id]: _old, ...rest } = store.overrides
  commit({ ...store, overrides: Object.keys(o).length ? { ...rest, [row.id]: o } : rest })
}

export function addCustom(settings: SourceSettings) {
  const id = `custom-${Date.now().toString(36)}`
  commit({ ...store, custom: [...store.custom, { ...settings, id, createdAt: new Date().toISOString() }] })
}

export function saveCustom(id: string, settings: SourceSettings) {
  commit({ ...store, custom: store.custom.map((c) => (c.id === id ? { ...c, ...settings } : c)) })
}

export function removeCustom(id: string) {
  commit({ ...store, custom: store.custom.filter((c) => c.id !== id) })
}

// État affiché d'une source : désactivée, jamais branchée, ou fraîcheur du dernier snapshot.
export type Health = "ok" | "ancien" | "vide" | "absent" | "a_integrer" | "off"

export const HEALTH: Record<Health, { label: string; dot: string }> = {
  ok: { label: "À jour", dot: "bg-emerald-500" },
  ancien: { label: "À vérifier", dot: "bg-amber-500" },
  vide: { label: "Vide", dot: "bg-red-500" },
  absent: { label: "Jamais collectée", dot: "bg-red-500" },
  a_integrer: { label: "À intégrer", dot: "bg-slate-400" },
  off: { label: "Désactivée", dot: "bg-muted-foreground/40" },
}

export function health(r: SourceRow): Health {
  if (!r.enabled) return "off"
  return r.status ? r.status.status : "a_integrer"
}

export const needsAttention = (r: SourceRow) => ["ancien", "vide", "absent"].includes(health(r))
