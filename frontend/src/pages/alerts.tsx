import * as React from "react"
import {
  ArrowDownUpIcon,
  CalendarIcon,
  DatabaseIcon,
  FlagIcon,
  KanbanSquareIcon,
  ListChecksIcon,
  MapPinIcon,
  NewspaperIcon,
  RotateCcwIcon,
  SearchIcon,
  WrenchIcon,
} from "lucide-react"
import { useSearchParams } from "react-router"

import { AlertCard } from "@/features/alerts/alert-card"
import { AlertDetail } from "@/features/alerts/alert-detail"
import { TaskBoard } from "@/features/tasks/task-board"
import { PageBody, PageHeader } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useData } from "@/lib/data"
import { alertTitle, LEVEL_ORDER, shortDistrict, shortMetier, SOURCE_GROUPS } from "@/lib/format"
import { useTasks } from "@/features/tasks/tasks"
import type { Opportunity } from "@/lib/types"
import { cn } from "@/lib/utils"

const ALL = "all"
const HORIZONS: Record<string, { label: string; test: (o: Opportunity) => boolean }> = {
  [ALL]: { label: "Tous", test: () => true },
  now: { label: "Immédiat (< 2 sem.)", test: (o) => o.weeks < 2 },
  soon: { label: "2 à 8 semaines", test: (o) => o.weeks >= 2 && o.weeks <= 8 },
  later: { label: "Plus de 8 semaines", test: (o) => o.weeks > 8 },
}
const LEVELS: Record<string, { label: string; test: (o: Opportunity) => boolean }> = {
  active: { label: "Hors veille", test: (o) => o.level !== "SURVEILLER" },
  AGIR: { label: "Urgent", test: (o) => o.level === "AGIR" },
  PRÉPARER: { label: "Anticiper", test: (o) => o.level === "PRÉPARER" },
  SURVEILLER: { label: "En veille", test: (o) => o.level === "SURVEILLER" },
  [ALL]: { label: "Toutes", test: () => true },
}
const SORTS: Record<string, { label: string; cmp: (a: Opportunity, b: Opportunity) => number }> = {
  priority: {
    label: "Priorité",
    cmp: (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.weeks - b.weeks || b.need[1] - a.need[1] || a.id - b.id,
  },
  horizon: { label: "Horizon", cmp: (a, b) => a.weeks - b.weeks || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] },
  need: { label: "Besoin", cmp: (a, b) => b.need[1] - a.need[1] || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] },
}
const DEFAULTS = {
  vue: "fil",
  district: ALL,
  metier: ALL,
  horizon: ALL,
  level: "active",
  source: ALL,
  sort: "priority",
  dir: "",
  q: "",
  suivi: "nouvelles",
  alerte: "", // clé stable de l'alerte ouverte dans le modal
}
const PAGE = 21 // multiple de 3 : la dernière ligne de la grille est pleine
// Une alerte enregistrée dans « Mes tâches » quitte le fil par défaut (elle se traite dans la bibliothèque).
const SUIVIS: Record<string, string> = {
  nouvelles: "Hors tâches",
  [ALL]: "Toutes les alertes",
  taches: "Dans mes tâches",
}
type Filters = typeof DEFAULTS

function FilterSelect({ label, icon: Icon, value, onChange, options }: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs text-muted-foreground lg:flex-1">
      <span className="flex items-center gap-1">
        <Icon className="size-3.5" /> {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full min-w-0 bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

// Fil en grille : 3 cartes par ligne (2 sur tablette, 1 sur mobile), lues ligne par ligne = ordre de priorité.
function Feed({ rows, onOpen }: { rows: Opportunity[]; onOpen: (o: Opportunity) => void }) {
  const [shown, setShown] = React.useState(PAGE)
  const visible = rows.slice(0, shown)
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((o) => (
          <AlertCard key={o.key} o={o} onOpen={() => onOpen(o)} />
        ))}
      </div>
      {rows.length > shown && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
            Voir plus ({rows.length - shown} restantes)
          </Button>
        </div>
      )}
    </>
  )
}

export function AlertsPage() {
  const { opportunities } = useData()
  const tasks = useTasks()
  const [params, setParams] = useSearchParams()

  // Onglet, filtres et alerte ouverte vivent dans l'URL : un lien partagé rouvre la même vue.
  const f: Filters = { ...DEFAULTS, ...Object.fromEntries(params) }
  const set = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch }
    const out = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) if (v && v !== DEFAULTS[k as keyof Filters]) out.set(k, v)
    setParams(out, { replace: true })
  }
  const open = (o: Opportunity | null) => set({ alerte: o?.key ?? "" })

  const districts = React.useMemo(
    () => [...new Set(opportunities.map((o) => o.district).filter((d): d is string => !!d))].sort(),
    [opportunities],
  )
  const metiers = React.useMemo(() => [...new Set(opportunities.flatMap((o) => o.metiers))].sort(), [opportunities])

  const q = f.q.toLowerCase()
  const rows = opportunities
    .filter(
      (o) =>
        (LEVELS[f.level] ?? LEVELS.active).test(o) &&
        (HORIZONS[f.horizon] ?? HORIZONS[ALL]).test(o) &&
        (f.district === ALL || o.district === f.district) &&
        (f.metier === ALL || o.metiers.includes(f.metier)) &&
        (f.source === ALL || o.signals.some((x) => SOURCE_GROUPS[f.source]?.types.includes(x.type))) &&
        (f.suivi === ALL || (f.suivi === "taches") === !!tasks[o.key]) &&
        (!q || `${o.target} ${o.place ?? ""} ${o.metiers.join(" ")} ${o.signals.map((s) => s.label).join(" ")}`.toLowerCase().includes(q)),
    )
    .sort((SORTS[f.sort] ?? SORTS.priority).cmp)
  if (f.dir === "desc") rows.reverse()

  const dirty = (["district", "metier", "horizon", "level", "source", "suivi", "q"] as const).some((k) => f[k] !== DEFAULTS[k])
  const selected = opportunities.find((o) => o.key === f.alerte) ?? null
  const nTasks = Object.keys(tasks).length
  // Le fil repart en haut (20 cartes) quand les filtres changent.
  const feedKey = JSON.stringify([f.district, f.metier, f.horizon, f.level, f.source, f.sort, f.dir, f.q, f.suivi])

  return (
    <>
      <PageHeader title="Alertes & opportunités" compact />

      <Tabs value={f.vue} onValueChange={(v) => set({ vue: v })} className="-mt-2 flex-1 gap-0">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <TabsList variant="line" className="justify-start">
            <TabsTrigger value="fil" className="flex-none px-3">
              <NewspaperIcon /> Fil d'alertes
            </TabsTrigger>
            <TabsTrigger value="taches" className="flex-none px-3">
              <KanbanSquareIcon /> Mes tâches
              {nTasks > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[11px] leading-4 font-semibold text-primary-foreground tabular-nums">
                  {nTasks}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          {f.vue === "fil" && (
            <div className="relative mb-1.5 w-full max-w-xs">
              <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Rechercher une entreprise, un projet…"
                className="h-8 bg-background pl-8" aria-label="Rechercher une alerte" />
            </div>
          )}
        </div>

        {/* Contenu sur fond gris pleine largeur jusqu'en bas : sépare des onglets sans trait, et fait ressortir les cartes. */}
        <PageBody className="block">
        <TabsContent value="fil" className="space-y-6">
          <div className="grid grid-cols-2 items-end gap-3 rounded-xl border bg-card p-3 sm:grid-cols-3 lg:flex lg:flex-nowrap">
            <FilterSelect label="Région" icon={MapPinIcon} value={f.district} onChange={(v) => set({ district: v })}
              options={[[ALL, "Toutes"], ...districts.map((d): [string, string] => [d, shortDistrict(d)])]} />
            <FilterSelect label="Métier" icon={WrenchIcon} value={f.metier} onChange={(v) => set({ metier: v })}
              options={[[ALL, "Tous"], ...metiers.map((m): [string, string] => [m, shortMetier(m)])]} />
            <FilterSelect label="Horizon" icon={CalendarIcon} value={f.horizon} onChange={(v) => set({ horizon: v })}
              options={Object.entries(HORIZONS).map(([k, v]): [string, string] => [k, v.label])} />
            <FilterSelect label="Priorité" icon={FlagIcon} value={f.level} onChange={(v) => set({ level: v })}
              options={Object.entries(LEVELS).map(([k, v]): [string, string] => [k, v.label])} />
            <FilterSelect label="Source" icon={DatabaseIcon} value={f.source} onChange={(v) => set({ source: v })}
              options={[[ALL, "Toutes"], ...Object.entries(SOURCE_GROUPS).map(([k, v]): [string, string] => [k, v.label])]} />
            <FilterSelect label="Suivi" icon={ListChecksIcon} value={f.suivi} onChange={(v) => set({ suivi: v })}
              options={Object.entries(SUIVIS)} />
            <Button variant="ghost" size="icon" className="text-primary" disabled={!dirty}
              aria-label="Réinitialiser les filtres" title="Réinitialiser les filtres"
              onClick={() => set({ district: ALL, metier: ALL, horizon: ALL, level: "active", source: ALL, suivi: "nouvelles", q: "" })}>
              <RotateCcwIcon />
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium tabular-nums">
              {rows.length} alerte{rows.length > 1 ? "s" : ""}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden sm:inline">Trier par</span>
              <Select value={f.sort} onValueChange={(v) => set({ sort: v })}>
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SORTS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon-sm" aria-label="Inverser l'ordre" title="Inverser l'ordre"
                className={cn(f.dir === "desc" && "bg-accent")} onClick={() => set({ dir: f.dir === "desc" ? "" : "desc" })}>
                <ArrowDownUpIcon />
              </Button>
            </div>
          </div>

          {rows.length ? (
            <Feed key={feedKey} rows={rows} onOpen={open} />
          ) : (
            <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
              Aucune alerte pour ces filtres.
            </div>
          )}
        </TabsContent>

        <TabsContent value="taches">
          <TaskBoard onOpen={open} />
        </TabsContent>
        </PageBody>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={(v) => !v && open(null)}>
        <DialogContent showCloseButton={false}
          className="flex h-[min(92svh,900px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogTitle className="sr-only">{selected ? alertTitle(selected) : "Alerte"}</DialogTitle>
          <DialogDescription className="sr-only">Détail de l'alerte</DialogDescription>
          {selected && <AlertDetail key={selected.key} o={selected} onClose={() => open(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
