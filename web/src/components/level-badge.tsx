import { FAMILY_HINT, FAMILY_LABEL, LEVEL_LABEL } from "@/lib/format"
import type { Family, Level } from "@/lib/types"
import { cn } from "@/lib/utils"

const LEVEL_STYLE: Record<Level, string> = {
  AGIR: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30",
  PRÉPARER: "bg-yellow-50 text-yellow-800 ring-yellow-300 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/30",
  SURVEILLER: "bg-muted text-muted-foreground ring-border",
}

export function LevelBadge({ level, className }: { level: Level; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center justify-center rounded-md px-2 text-[11px] font-bold tracking-wide ring-1 ring-inset",
        LEVEL_STYLE[level],
        className,
      )}
    >
      {LEVEL_LABEL[level]}
    </span>
  )
}

const FAMILY_STYLE: Record<Family, string> = {
  projet: "text-blue-700 bg-blue-50 ring-blue-200 dark:text-blue-300 dark:bg-blue-500/10 dark:ring-blue-500/30",
  recrutement: "text-violet-700 bg-violet-50 ring-violet-200 dark:text-violet-300 dark:bg-violet-500/10 dark:ring-violet-500/30",
  entreprise: "text-teal-700 bg-teal-50 ring-teal-200 dark:text-teal-300 dark:bg-teal-500/10 dark:ring-teal-500/30",
  historique: "text-muted-foreground bg-transparent ring-border ring-dashed",
}

export const FAMILY_DOT: Record<Family, string> = {
  projet: "bg-blue-500",
  recrutement: "bg-violet-500",
  entreprise: "bg-teal-500",
  historique: "bg-muted-foreground",
}

export function FamilyChip({ family }: { family: Family }) {
  return (
    <span
      title={FAMILY_HINT[family]}
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ring-1 ring-inset",
        FAMILY_STYLE[family],
        family === "historique" && "border border-dashed border-muted-foreground/40 ring-0",
      )}
    >
      {FAMILY_LABEL[family]}
      {family === "historique" && " · simulé"}
    </span>
  )
}
