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

export function removeTask(key: string) {
  const { [key]: _removed, ...rest } = tasks
  commit(rest)
}

export function useTasks(): Record<string, Task> {
  return React.useSyncExternalStore(subscribe, () => tasks)
}
