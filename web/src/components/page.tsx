import * as React from "react"
import { FlaskConicalIcon } from "lucide-react"
import { useLocation } from "react-router"

import { Badge } from "@/components/ui/badge"
import { pageInfo } from "@/lib/nav"
import { cn } from "@/lib/utils"

// En-tête commun à toutes les pages : titre, sous-titre, actions éventuelles à droite.
// `compact` : titre réduit sans sous-titre, pour les pages denses (Alertes).
export function PageHeader({ actions, fictif = false, title: titleOverride, compact = false }: {
  actions?: React.ReactNode
  fictif?: boolean
  title?: string
  compact?: boolean
}) {
  const { pathname } = useLocation()
  const info = pageInfo(pathname)
  const title = titleOverride ?? info.title
  const subtitle = info.subtitle
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className={cn("flex items-center gap-2 font-semibold tracking-tight", compact ? "text-lg" : "text-2xl")}>
          {title}
          {fictif && <FictifBadge />}
        </h1>
        {subtitle && !compact && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}

// Signale les données générées (internes Flexsis simulées).
export function FictifBadge({ label = "Données simulées" }: { label?: string }) {
  return (
    <Badge variant="outline" className="border-dashed font-normal text-muted-foreground">
      <FlaskConicalIcon />
      {label}
    </Badge>
  )
}

// Squelette commun, modèle = Alertes : en-tête sur fond blanc (titre, onglets / pastilles, recherche), puis le
// contenu sur fond gris pleine largeur jusqu'en bas, où les cartes blanches ressortent.
export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("-mx-4 -mb-4 flex flex-1 flex-col gap-6 bg-muted px-4 py-6 md:-mx-6 md:-mb-6 md:px-6", className)}>
      {children}
    </div>
  )
}

export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
