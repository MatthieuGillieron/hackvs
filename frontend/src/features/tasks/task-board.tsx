import { NotebookPenIcon, Trash2Icon } from "lucide-react"

import { AlertThumb } from "@/features/alerts/alert-thumb"
import { StatusMenu } from "@/features/tasks/task-status"
import { LevelBadge } from "@/components/level-badge"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { alertTitle, daysAgo, needLabel, placeLabel, weeksRange } from "@/lib/format"
import { removeTask, STATUS_DOT, TASK_LABEL, TASK_STATUSES, useTasks, type Task } from "@/features/tasks/tasks"
import type { Opportunity } from "@/lib/types"
import { cn } from "@/lib/utils"

function TaskCard({ task, o, onOpen }: { task: Task; o: Opportunity; onOpen: () => void }) {
  const { meta } = useData()
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onOpen())}
      className="cursor-pointer rounded-xl border bg-card p-3 shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex gap-3">
        <AlertThumb o={o} className="flex h-16 w-20" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold">{alertTitle(o)}</h3>
            <LevelBadge level={o.level} className="h-5 text-[10px]" />
          </div>
          <div className="truncate text-xs text-muted-foreground">{placeLabel(o)}</div>
          <div className="text-xs text-muted-foreground">
            {weeksRange(o.window, meta.today)} · renfort <span className="font-medium text-foreground">{needLabel(o)}</span>
          </div>
        </div>
      </div>
      {task.note && (
        <p className="mt-2 flex gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
          <NotebookPenIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
          <span className="line-clamp-2">{task.note}</span>
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Ajoutée {daysAgo(task.addedAt, meta.today)}</span>
        <StatusMenu taskKey={task.key} status={task.status} />
      </div>
    </article>
  )
}

// Alerte suivie qui n'existe plus dans l'export courant (signal expiré, données régénérées).
function OrphanCard({ task }: { task: Task }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
      <span className="min-w-0 truncate">Alerte plus détectée ({task.key.split("|")[1]})</span>
      <Button variant="ghost" size="icon-sm" aria-label="Retirer" onClick={() => removeTask(task.key)}>
        <Trash2Icon />
      </Button>
    </div>
  )
}

// Onglet « Mes tâches » : kanban À faire / En cours / Traité, statut changé par menu.
export function TaskBoard({ onOpen }: { onOpen: (o: Opportunity) => void }) {
  const { opportunities } = useData()
  const tasks = useTasks()
  const byKey = new Map(opportunities.map((o) => [o.key, o]))
  const list = Object.values(tasks).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  if (!list.length) {
    return (
      <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
        Aucune tâche pour l'instant. Dans le fil d'alertes, utilisez le signet (À faire) ou « Mettre en traitement ».
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {TASK_STATUSES.map((status) => {
        const col = list.filter((t) => t.status === status)
        return (
          <section key={status} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-muted/40 p-3">
            <h2 className="flex items-center gap-2 px-1 text-sm font-semibold">
              <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
              {TASK_LABEL[status]}
              <span className="ml-auto rounded-full bg-background px-2 text-xs font-medium text-muted-foreground tabular-nums">
                {col.length}
              </span>
            </h2>
            {col.length ? (
              col.map((t) => {
                const o = byKey.get(t.key)
                return o ? <TaskCard key={t.key} task={t} o={o} onOpen={() => onOpen(o)} /> : <OrphanCard key={t.key} task={t} />
              })
            ) : (
              <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">Rien ici.</p>
            )}
          </section>
        )
      })}
    </div>
  )
}
