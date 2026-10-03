import * as React from "react"
import { FlaskConicalIcon } from "lucide-react"
import { useLocation } from "react-router"

import { Badge } from "@/components/ui/badge"
import { pageInfo } from "@/lib/nav"

// En-tête commun à toutes les pages : titre, sous-titre, actions éventuelles à droite.
export function PageHeader({ actions, fictif = false }: { actions?: React.ReactNode; fictif?: boolean }) {
  const { pathname } = useLocation()
  const { title, subtitle } = pageInfo(pathname)
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          {title}
          {fictif && <FictifBadge />}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
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

export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
