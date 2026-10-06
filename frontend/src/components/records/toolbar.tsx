import * as React from "react"
import { SearchIcon } from "lucide-react"

import { StateTabs } from "@/components/records/state-tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Bandeau blanc des bases Clients / Candidats (comme les onglets d'Alertes) : pastilles de statut + recherche.
export function DbTabsBar({ tabs, tab, onTab, q, onQ, placeholder }: {
  tabs: React.ComponentProps<typeof StateTabs>["items"]
  tab: string
  onTab: (v: string) => void
  q: string
  onQ: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <StateTabs value={tab} onChange={onTab} items={tabs} />
      <div className="relative w-full sm:w-64">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} className="bg-background pl-8" />
      </div>
    </div>
  )
}

// En tête du fond gris : « N résultats », puis Réinitialiser et filtres compacts.
export function DbFilterBar({ count, filters, onReset }: {
  count: string
  filters: React.ReactNode
  onReset?: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{count}</span>
      <div className="flex flex-wrap items-center gap-2">
        {onReset && <Button variant="ghost" size="sm" onClick={onReset}>Réinitialiser</Button>}
        {filters}
      </div>
    </div>
  )
}

// Filtre compact : « Métier · Tous ».
export function CompactSelect({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="gap-1.5 bg-background" aria-label={label}>
        <span className="text-muted-foreground">{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

// « Voir plus » : même pagination que le fil d'alertes.
export function MoreButton({ left, onMore }: { left: number; onMore: () => void }) {
  if (left <= 0) return null
  return (
    <div className="flex justify-center pt-2">
      <Button variant="outline" onClick={onMore}>Voir plus ({left} restants)</Button>
    </div>
  )
}
