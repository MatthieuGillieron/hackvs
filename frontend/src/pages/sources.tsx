import * as React from "react"
import { ChevronRightIcon, PlusIcon, SearchIcon } from "lucide-react"

import { SourceIcon } from "@/features/sources/source-icon"
import { SourceSheet } from "@/features/sources/source-sheet"
import { Switch } from "@/features/sources/switch"
import { StateTabs } from "@/components/records/state-tabs"
import { FAMILY_DOT } from "@/components/level-badge"
import { PageBody, PageHeader } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useData } from "@/lib/data"
import { FAMILY_LABEL, ageLabel } from "@/lib/format"
import { HEALTH, health, needsAttention, setEnabled, useSourceRows, type SourceRow } from "@/features/sources/sources-config"
import type { Family } from "@/lib/types"
import { useUrlFilters } from "@/lib/url-filters"
import { cn } from "@/lib/utils"

// Sources : les sources PUBLIQUES surveillées par le moteur. Une ligne = nom, à quoi elle sert, état, interrupteur ;
// le détail (volume, rapprochement, réglages) s'ouvre dans un panneau latéral.
// Les bases internes Flexsis (fx_*) n'apparaissent pas ici : elles vivent dans Candidats et Entreprises.

const ALL = "all"
// Ordre de lecture : ce qui crée des alertes d'abord, le contexte ensuite, les référentiels à la fin.
const CATEGORY_ORDER = ["Chantiers & projets", "Emploi", "Entreprises", "Presse & web", "Statistiques OFS", "Météo", "Référentiels"]
const rank = (c: string) => (CATEGORY_ORDER.indexOf(c) + 1 || 99)
const DEFAULTS = { vue: ALL, q: "" }
const isFamily = (u: string): u is Family => ["projet", "recrutement", "entreprise", "historique"].includes(u)

const VIEWS: Record<string, { label: string; test: (r: SourceRow) => boolean }> = {
  [ALL]: { label: "Toutes", test: () => true },
  alertes: { label: "Alimentent les alertes", test: (r) => r.enabled && isFamily(r.usage) },
  attention: { label: "À vérifier", test: needsAttention },
  off: { label: "Désactivées", test: (r) => !r.enabled },
}

function SourceLine({ row, onOpen }: { row: SourceRow; onOpen: () => void }) {
  const h = health(row)
  const fam = isFamily(row.usage) ? row.usage : null
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
        className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      >
        <SourceIcon category={row.category} className={cn(!row.enabled && "opacity-50")} />
        <div className={cn("min-w-0 flex-1", !row.enabled && "opacity-50")}>
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{row.label}</span>
            {fam && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", FAMILY_DOT[fam])} />
                {FAMILY_LABEL[fam]}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">{row.description}</p>
        </div>
        <span className="hidden w-32 shrink-0 items-center justify-end gap-1.5 text-sm text-muted-foreground sm:flex">
          {h === "ok" ? (
            ageLabel(row.status?.ageHours)
          ) : (
            <>
              <span className={cn("size-1.5 rounded-full", HEALTH[h].dot)} />
              {HEALTH[h].label}
            </>
          )}
        </span>
        <Switch checked={row.enabled} onChange={(v) => setEnabled(row, v)} label={`${row.enabled ? "Désactiver" : "Activer"} ${row.label}`} />
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
      </div>
    </li>
  )
}

export function SourcesPage() {
  const { sources } = useData()
  const publicSources = React.useMemo(() => sources.filter((s) => !s.fictif), [sources])
  const rows = useSourceRows(publicSources)
  const { f, set } = useUrlFilters(DEFAULTS)

  // Panneau : id de la source ouverte (la ligne est relue à chaque rendu pour refléter les changements).
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [sheetKey, setSheetKey] = React.useState(0)
  const openSheet = (id: string | null) => {
    setOpenId(id)
    setSheetKey((k) => k + 1)
    setSheetOpen(true)
  }
  const current = openId ? (rows.find((r) => r.id === openId) ?? null) : null

  const categories = [...new Set(rows.map((r) => r.category))].sort((a, b) => rank(a) - rank(b))
  const q = f.q.trim().toLowerCase()
  const view = VIEWS[f.vue] ?? VIEWS[ALL]
  const shown = rows.filter((r) => view.test(r) && (!q || `${r.label} ${r.id} ${r.description}`.toLowerCase().includes(q)))
  const groups = categories.map((c) => [c, shown.filter((r) => r.category === c)] as const).filter(([, l]) => l.length)

  const active = rows.filter((r) => r.enabled).length
  const feeding = rows.filter(VIEWS.alertes.test).length
  const freshest = Math.min(...rows.filter((r) => r.enabled && r.status).map((r) => r.status!.ageHours ?? Infinity))

  return (
    <>
      <div className="mx-auto grid w-full max-w-4xl gap-6">
        <PageHeader
          actions={
            <Button onClick={() => openSheet(null)}>
              <PlusIcon /> Ajouter
            </Button>
          }
        />

        <p className="-mt-3 text-sm text-muted-foreground">
          {active} sources actives · {feeding} alimentent les alertes · dernière collecte {ageLabel(freshest)}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <StateTabs
            value={f.vue}
            onChange={(v) => set({ vue: v })}
            items={Object.entries(VIEWS)
              .map(([k, v]) => ({ value: k, label: v.label, count: rows.filter(v.test).length }))
              .filter((it) => it.value === ALL || it.value === f.vue || it.count > 0)}
          />
          <div className="relative w-full sm:w-56">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Rechercher" className="bg-background pl-8" />
          </div>
        </div>
      </div>

      <PageBody>
        <div className="mx-auto grid w-full max-w-4xl gap-8">
          {groups.map(([cat, list]) => (
            <section key={cat} className="grid gap-2">
              <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{cat}</h2>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {list.map((r) => <SourceLine key={r.id} row={r} onOpen={() => openSheet(r.id)} />)}
              </ul>
            </section>
          ))}
          {!groups.length && <p className="py-16 text-center text-sm text-muted-foreground">Aucune source.</p>}
        </div>
      </PageBody>

      <SourceSheet key={sheetKey} open={sheetOpen} onOpenChange={setSheetOpen} row={current} categories={categories} />
    </>
  )
}
