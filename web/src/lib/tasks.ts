import * as React from "react"

// Tâches du consultant : alertes suivies depuis la page Alertes, avec un statut et une note.
// Pas de backend : enregistrées dans le navigateur (localStorage), indexées par la clé stable de l'alerte.

export type TaskStatus = "a_faire" | "en_cours" | "traite"

export interface Task {
  key: string
  status: TaskStatus
  note: string
  addedAt: string
  updatedAt: string
  calls?: CallLog[] // comptes-rendus d'appel (« Préparer l'appel »), du plus récent au plus ancien
  demo?: boolean // jeu de démonstration chargé depuis Analytics (fictif), retirable d'un clic
}

export type CallOutcome = "interesse" | "a_rappeler" | "pas_de_besoin" | "mauvais_interlocuteur"

export interface CallLog {
  at: string
  outcome: CallOutcome
  note: string
  callback: string | null // date de rappel (AAAA-MM-JJ)
  contact: string | null // entreprise appelée (une zone en liste plusieurs)
}

export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  interesse: "Intéressé",
  a_rappeler: "À rappeler",
  pas_de_besoin: "Pas de besoin",
  mauvais_interlocuteur: "Mauvais interlocuteur",
}

// Un appel fait avancer la tâche : « Pas de besoin » la clôt, le reste la garde en cours.
const OUTCOME_STATUS: Record<CallOutcome, TaskStatus> = {
  interesse: "en_cours",
  a_rappeler: "en_cours",
  pas_de_besoin: "traite",
  mauvais_interlocuteur: "en_cours",
}

export const TASK_STATUSES: TaskStatus[] = ["a_faire", "en_cours", "traite"]
export const TASK_LABEL: Record<TaskStatus, string> = { a_faire: "À faire", en_cours: "En cours", traite: "Traité" }

export const STATUS_DOT: Record<TaskStatus, string> = {
  a_faire: "bg-slate-400",
  en_cours: "bg-blue-500",
  traite: "bg-emerald-500",
}

export const STATUS_STYLE: Record<TaskStatus, string> = {
  a_faire: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
  en_cours: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
  traite: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
}

const STORAGE_KEY = "flexradar.tasks.v1"
const listeners = new Set<() => void>()
let tasks: Record<string, Task> = read()

function read(): Record<string, Task> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Task>
  } catch {
    return {}
  }
}

function commit(next: Record<string, Task>) {
  tasks = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // stockage indisponible (navigation privée) : les tâches vivent le temps de la session
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  // Un autre onglet a modifié les tâches.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      tasks = read()
      l()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener("storage", onStorage)
  }
}

export function setTaskStatus(key: string, status: TaskStatus) {
  const now = new Date().toISOString()
  const prev = tasks[key]
  const base: Task = prev ?? { key, note: "", addedAt: now, status, updatedAt: now }
  commit({ ...tasks, [key]: { ...base, status, updatedAt: now } })
}

export function setTaskNote(key: string, note: string) {
  const prev = tasks[key]
  if (prev) commit({ ...tasks, [key]: { ...prev, note, updatedAt: new Date().toISOString() } })
}

export function logCall(key: string, log: Omit<CallLog, "at">) {
  const now = new Date().toISOString()
  const prev = tasks[key] ?? { key, note: "", addedAt: now, status: "a_faire", updatedAt: now }
  const calls = [{ ...log, at: now }, ...(prev.calls ?? [])]
  commit({ ...tasks, [key]: { ...prev, calls, status: OUTCOME_STATUS[log.outcome], updatedAt: now } })
}

export function removeTask(key: string) {
  const { [key]: _removed, ...rest } = tasks
  commit(rest)
}

// Jeu de démonstration (page Analytics) : n'écrase jamais une tâche réelle, et se retire sans toucher aux autres.
export function loadDemoTasks(list: Task[]) {
  const next = { ...tasks }
  for (const t of list) if (!next[t.key]) next[t.key] = { ...t, demo: true }
  commit(next)
}

export function clearDemoTasks() {
  commit(Object.fromEntries(Object.entries(tasks).filter(([, t]) => !t.demo)))
}

export function useTasks(): Record<string, Task> {
  return React.useSyncExternalStore(subscribe, () => tasks)
}
