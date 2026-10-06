import * as React from "react"
import { InfoIcon, type LucideIcon } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Briques de la page Analytics : mêmes cartes que l'Accueil (blanc sur fond gris, anneau fin), accent orange.
// Icônes comme le « Pipeline de suivi » de l'Accueil : orange, sans fond, suivies d'un trait vertical.

// ⓘ : comment le chiffre est calculé. Toujours accessible au clavier.
export function Info({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="Comment c'est calculé" className="text-muted-foreground/70 hover:text-foreground">
          <InfoIcon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-xs leading-snug">{children}</TooltipContent>
    </Tooltip>
  )
}

export function Card({ title, icon: Icon, info, aside, subtitle, className, bodyClassName, children }: {
  title: React.ReactNode
  icon: LucideIcon
  info?: React.ReactNode
  aside?: React.ReactNode
  subtitle?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col rounded-xl bg-card ring-1 ring-foreground/10", className)}>
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
        <div className="flex min-w-0 items-center gap-3">
          <Icon className="size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-base font-semibold">
              <span className="truncate">{title}</span>
              {info && <Info>{info}</Info>}
            </h2>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {aside}
      </header>
      <div className={cn("min-h-0 flex-1 px-4 pb-3", bodyClassName)}>{children}</div>
    </section>
  )
}

// Chiffre clé, style « Pipeline de suivi » de l'Accueil : icône orange | trait vertical | titre, valeur + pastille,
// contexte + badge. L'explication du calcul est dans le ⓘ. Plus grand dès 820 px de haut (`tall:`).
export function Stat({ title, icon: Icon, info, value, pill, context, badge, className }: {
  title: string
  icon: LucideIcon
  info: React.ReactNode
  value: React.ReactNode
  pill?: React.ReactNode
  context?: React.ReactNode
  badge?: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex min-h-0 min-w-0 items-center gap-3 overflow-hidden rounded-xl bg-card px-4 py-1.5 ring-1 ring-foreground/10 tall:gap-4 tall:px-5 tall:py-4", className)}>
      <Icon className="size-5 shrink-0 text-primary tall:size-6" />
      <span className="w-px self-stretch bg-border" aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-1.5 text-xs font-medium tall:text-sm">
          <span className="truncate">{title}</span>
          <Info>{info}</Info>
        </h2>
        <div className="flex items-center gap-x-2.5 tall:mt-1 tall:gap-x-3">
          <span className="text-lg leading-tight font-bold tracking-tight whitespace-nowrap tabular-nums tall:text-3xl">{value}</span>
          {pill}
        </div>
        {(context || badge) && (
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground tall:mt-1 tall:text-sm">
            <p className="min-w-0 flex-1 truncate">{context}</p>
            {badge && <span className="shrink-0">{badge}</span>}
          </div>
        )}
      </div>
    </section>
  )
}

export function Pill({ children, tone = "orange", className }: {
  children: React.ReactNode
  tone?: "orange" | "green" | "gray"
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs font-medium whitespace-nowrap tabular-nums",
        tone === "orange" && "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
        tone === "green" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
        tone === "gray" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  )
}

// Barre de progression fine (données = orange plein, piste = gris).
export function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("block h-2 overflow-hidden rounded-full bg-muted", className)}>
      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </span>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}
