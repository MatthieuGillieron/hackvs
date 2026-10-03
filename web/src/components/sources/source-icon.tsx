import { BookOpenIcon, BriefcaseIcon, ChartColumnIcon, CloudSunIcon, DatabaseIcon, HardHatIcon, LandmarkIcon, NewspaperIcon, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const ICONS: Record<string, LucideIcon> = {
  "Chantiers & projets": HardHatIcon,
  Emploi: BriefcaseIcon,
  Entreprises: LandmarkIcon,
  "Statistiques OFS": ChartColumnIcon,
  Météo: CloudSunIcon,
  "Presse & web": NewspaperIcon,
  Référentiels: BookOpenIcon,
}

// Pastille d'icône de la catégorie d'une source.
export function SourceIcon({ category, className }: { category: string; className?: string }) {
  const Icon = ICONS[category] ?? DatabaseIcon
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground", className)}>
      <Icon className="size-4" />
    </span>
  )
}
