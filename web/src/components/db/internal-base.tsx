import { DatabaseIcon } from "lucide-react"

import { useData } from "@/lib/data"
import { ageLabel } from "@/lib/format"

// Origine des données d'une base (Clients, Candidats) : bases internes Flexsis (fx_*, simulées), avec effectifs et fraîcheur.
export function InternalBase({ items, sources }: { items: [string, number][]; sources: string[] }) {
  const all = useData().sources
  const age = Math.max(...all.filter((s) => sources.includes(s.name)).map((s) => s.ageHours ?? 0))
  return (
    <p className="-mt-3 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
      <DatabaseIcon className="size-3.5" />
      Base interne Flexsis ·{" "}
      {items.map(([label, n]) => `${n.toLocaleString("fr-CH")} ${label}`).join(" · ")} · mise à jour {ageLabel(age)}
    </p>
  )
}
