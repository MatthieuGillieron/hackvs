import * as React from "react"
import { Building2Icon, CalendarIcon, ChevronRightIcon, ListIcon, MapPinIcon, RotateCcwIcon, SearchIcon, UsersIcon } from "lucide-react"
import { useSearchParams } from "react-router"

import { AlertDetail } from "@/components/alerts/alert-detail"
import { FamilyChip, LevelBadge } from "@/components/level-badge"
import { PageHeader } from "@/components/page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useData } from "@/lib/data"
import { horizonLabel, LEVEL_ORDER, metiersLabel, needLabel, shortDistrict, shortMetier, sortFamilies } from "@/lib/format"
import type { Opportunity } from "@/lib/types"
import { cn } from "@/lib/utils"

const ALL = "all"
const HORIZONS: Record<string, { label: string; test: (o: Opportunity) => boolean }> = {
  [ALL]: { label: "Tous les horizons", test: () => true },
  now: { label: "Immédiat (< 2 sem.)", test: (o) => o.weeks < 2 },
  soon: { label: "2 à 8 semaines", test: (o) => o.weeks >= 2 && o.weeks <= 8 },
  later: { label: "Plus de 8 semaines", test: (o) => o.weeks > 8 },
}
const LEVELS: Record<string, { label: string; test: (o: Opportunity) => boolean }> = {
  active: { label: "AGIR + PRÉPARER", test: (o) => o.level !== "SURVEILLER" },
  AGIR: { label: "AGIR", test: (o) => o.level === "AGIR" },
  PRÉPARER: { label: "PRÉPARER", test: (o) => o.level === "PRÉPARER" },
  SURVEILLER: { label: "SURVEILLER", test: (o) => o.level === "SURVEILLER" },
  [ALL]: { label: "Toutes les priorités", test: () => true },
}
const KINDS: Record<string, string> = { [ALL]: "Entreprises + zones", entreprise: "Entreprises", zone: "Zones" }
const SORTS: Record<string, { label: string; cmp: (a: Opportunity, b: Opportunity) => number }> = {
  priority: {
    label: "Priorité",
    cmp: (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.weeks - b.weeks || b.need[1] - a.need[1] || a.id - b.id,
  },
  horizon: { label: "Horizon", cmp: (a, b) => a.weeks - b.weeks || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] },
  need: { label: "Besoin", cmp: (a, b) => b.need[1] - a.need[1] || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] },
}
const DEFAULTS = { district: ALL, metier: ALL, horizon: ALL, level: "active", kind: ALL, sort: "priority", q: "", id: "" }
type Filters = typeof DEFAULTS

function FilterSelect({ label, icon: Icon, value, onChange, options }: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Icon className="size-3.5" /> {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full min-w-36 bg-background">
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

function AlertItem({ o, selected, onSelect }: { o: Opportunity; selected: boolean; onSelect: () => void }) {
  const reasons = o.signals.filter((s) => !s.fictif).slice(0, 3)
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/50",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {o.kind === "entreprise" ? <Building2Icon className="size-5" /> : <MapPinIcon className="size-5" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold">{o.target}</span>
          <LevelBadge level={o.level} />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPinIcon className="size-3" /> {shortDistrict(o.district)}
          </span>
          <span className="flex items-center gap-1">
            <UsersIcon className="size-3" /> {metiersLabel(o.metiers)}
          </span>
          <span className="flex items-center gap-1">
            <CalendarIcon className="size-3" /> {horizonLabel(o)}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {sortFamilies(o.families).map((f) => (
            <FamilyChip key={f} family={f} />
          ))}
        </div>
      </div>
      <ul className="hidden w-56 shrink-0 space-y-1 text-xs text-muted-foreground 2xl:block">
        {reasons.map((s, i) => (
          <li key={i} className="line-clamp-1 before:mr-1.5 before:text-primary before:content-['•']">
            {s.label}
          </li>
        ))}
      </ul>
      <div className="shrink-0 text-right">
        <div className="text-xs text-muted-foreground">Renfort</div>
        <div className="text-lg font-semibold tabular-nums">{needLabel(o)}</div>
      </div>
      <ChevronRightIcon className="mt-3 size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

export function AlertesPage() {
  const { opportunities } = useData()
  const [params, setParams] = useSearchParams()
  const wide = useMediaQuery("(min-width: 1280px)")

  // Filtres et sélection vivent dans l'URL : un lien partagé rouvre la même vue.
  const f: Filters = { ...DEFAULTS, ...Object.fromEntries(params) }
  const set = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch }
    const out = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) if (v && v !== DEFAULTS[k as keyof Filters]) out.set(k, v)
    setParams(out, { replace: true })
  }
  const select = (id: number | null) => set({ id: id === null ? "" : String(id) })

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
          (f.kind === ALL || o.kind === f.kind) &&
          (!q || `${o.target} ${o.metiers.join(" ")} ${o.signals.map((s) => s.label).join(" ")}`.toLowerCase().includes(q)),
      )
    .sort((SORTS[f.sort] ?? SORTS.priority).cmp)

  const dirty = (["district", "metier", "horizon", "level", "kind", "q"] as const).some((k) => f[k] !== DEFAULTS[k])
  const selected = opportunities.find((o) => String(o.id) === f.id) ?? null

  // Grand écran : la zone liste + détail remplit la hauteur restante, la liste défile seule.
  const areaRef = React.useRef<HTMLDivElement>(null)
  const [areaHeight, setAreaHeight] = React.useState<number | null>(null)
  React.useLayoutEffect(() => {
    if (!wide) return
    const measure = () => {
      const top = areaRef.current?.getBoundingClientRect().top ?? 0
      setAreaHeight(Math.max(420, window.innerHeight - top - 16))
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [wide, dirty])

  return (
    <>
      <PageHeader />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <label className="grid min-w-44 flex-1 gap-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <SearchIcon className="size-3.5" /> Recherche
          </span>
          <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Entreprise, projet, métier…" className="bg-background" />
        </label>
        <FilterSelect label="Région" icon={MapPinIcon} value={f.district} onChange={(v) => set({ district: v })}
          options={[[ALL, "Toutes les régions"], ...districts.map((d): [string, string] => [d, shortDistrict(d)])]} />
        <FilterSelect label="Métier" icon={UsersIcon} value={f.metier} onChange={(v) => set({ metier: v })}
          options={[[ALL, "Tous les métiers"], ...metiers.map((m): [string, string] => [m, shortMetier(m)])]} />
        <FilterSelect label="Horizon" icon={CalendarIcon} value={f.horizon} onChange={(v) => set({ horizon: v })}
          options={Object.entries(HORIZONS).map(([k, v]): [string, string] => [k, v.label])} />
        <FilterSelect label="Priorité" icon={ListIcon} value={f.level} onChange={(v) => set({ level: v })}
          options={Object.entries(LEVELS).map(([k, v]): [string, string] => [k, v.label])} />
        <FilterSelect label="Cible" icon={Building2Icon} value={f.kind} onChange={(v) => set({ kind: v })}
          options={Object.entries(KINDS)} />
        <Button variant="ghost" disabled={!dirty} onClick={() => setParams(new URLSearchParams(), { replace: true })}>
          <RotateCcwIcon /> Réinitialiser
        </Button>
      </div>

      <div
        ref={areaRef}
        style={wide && areaHeight ? { height: areaHeight } : undefined}
        className={cn("grid min-h-0 gap-4", wide && selected && "grid-cols-[minmax(0,1fr)_minmax(420px,520px)]")}
      >
        <div className={cn("flex min-w-0 flex-col gap-3", wide && "min-h-0")}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <ListIcon className="size-4" /> {rows.length} alerte{rows.length > 1 ? "s" : ""} détectée{rows.length > 1 ? "s" : ""}
            </h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Trier par
              <Select value={f.sort} onValueChange={(v) => set({ sort: v })}>
                <SelectTrigger size="sm" className="w-32">
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
            </div>
          </div>
          {rows.length ? (
            <div className={cn("space-y-2", wide && "min-h-0 flex-1 overflow-y-auto pr-1")}>
              {rows.slice(0, 200).map((o) => (
                <AlertItem key={o.id} o={o} selected={o.id === selected?.id} onSelect={() => select(o.id)} />
              ))}
              {rows.length > 200 && (
                <p className="py-4 text-center text-sm text-muted-foreground">… {rows.length - 200} de plus : affinez les filtres.</p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Aucune alerte pour ces filtres.
            </div>
          )}
        </div>

        {wide && selected && (
          <aside className="h-full min-h-0 overflow-hidden rounded-xl border bg-card">
            <AlertDetail key={selected.id} o={selected} onClose={() => select(null)} />
          </aside>
        )}
      </div>

      {!wide && (
        <Sheet open={!!selected} onOpenChange={(open) => !open && select(null)}>
          <SheetContent className="w-full gap-0 p-0 sm:max-w-xl" showCloseButton={false}>
            <SheetTitle className="sr-only">{selected?.target ?? "Détail"}</SheetTitle>
            <SheetDescription className="sr-only">Détail de l'alerte</SheetDescription>
            {selected && <AlertDetail key={selected.id} o={selected} onClose={() => select(null)} />}
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
