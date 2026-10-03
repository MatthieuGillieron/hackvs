import { BookmarkIcon, CheckIcon, ChevronDownIcon, Trash2Icon, UserRoundCheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { removeTask, setTaskStatus, STATUS_DOT, STATUS_STYLE, TASK_LABEL, TASK_STATUSES, useTasks, type TaskStatus } from "@/lib/tasks"
import { cn } from "@/lib/utils"

// Menu de statut d'une alerte suivie (À faire / En cours / Traité, ou retirer des tâches).
export function StatusMenu({ taskKey, status, size = "xs" }: { taskKey: string; status: TaskStatus; size?: "xs" | "sm" | "default" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className={cn("gap-1.5", STATUS_STYLE[status])} onClick={(e) => e.stopPropagation()}>
          <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
          {TASK_LABEL[status]}
          <ChevronDownIcon className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48" onClick={(e) => e.stopPropagation()}>
        {TASK_STATUSES.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => setTaskStatus(taskKey, s)}>
            <span className={cn("size-2 rounded-full", STATUS_DOT[s])} />
            {TASK_LABEL[s]}
            {s === status && <CheckIcon className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => removeTask(taskKey)}>
          <Trash2Icon /> Retirer de mes tâches
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Actions de suivi d'une alerte : l'ajouter aux tâches (À faire) ou la mettre en traitement (En cours).
export function TaskControl({ taskKey, className }: { taskKey: string; className?: string }) {
  const task = useTasks()[taskKey]
  if (task) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="text-xs text-muted-foreground">Suivi</span>
        <StatusMenu taskKey={taskKey} status={task.status} />
      </div>
    )
  }
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon-xs" aria-label="Ajouter à mes tâches"
            onClick={(e) => {
              e.stopPropagation()
              setTaskStatus(taskKey, "a_faire")
            }}>
            <BookmarkIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ajouter à mes tâches (À faire)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="xs" onClick={(e) => {
            e.stopPropagation()
            setTaskStatus(taskKey, "en_cours")
          }}>
            <UserRoundCheckIcon /> Traiter
          </Button>
        </TooltipTrigger>
        <TooltipContent>Je m'en occupe : ajouter à mes tâches (En cours)</TooltipContent>
      </Tooltip>
    </div>
  )
}
