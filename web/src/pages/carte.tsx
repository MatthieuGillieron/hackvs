import * as React from "react"
import {
  ArrowRightIcon,
  BellRingIcon,
  Building2Icon,
  CalendarRangeIcon,
  ChartLineIcon,
  ExternalLinkIcon,
  FlameIcon,
  HardHatIcon,
  MailIcon,
  MegaphoneIcon,
  PhoneIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router"

import { DemandChart } from "@/components/map/demand-chart"
import { ValaisMap } from "@/components/map/valais-map"
import { FamilyChip, FAMILY_DOT, LevelBadge } from "@/components/level-badge"
import { FictifBadge, PageHeader, Placeholder } from "@/components/page"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { compareStats, districtStats, filterOpps, keySignals, LEVEL_DOT, PERIODS, rangeLabel, weeklyProjection, type DistrictStats, type PeriodKey } from "@/lib/carte"
import { useData } from "@/lib/data"
import { confidence, fmtDate, shortDistrict, shortMetier, SIGNAL_TYPE_LABEL, sortFamilies } from "@/lib/format"
import { useGeo, type GeoDistrict } from "@/lib/geo"
import type { Candidate, Opportunity } from "@/lib/types"
import { cn } from "@/lib/utils"

const ALL = "all"
const TOP_METIERS = 5

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="sm" variant={active ? "default" : "outline"} className={cn(!active && "text-muted-foreground")} onClick={onClick}>
      {children}
    </Button>
  )
}

function Card({ title, icon: Icon, aside, className, children }: {
  title: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  aside?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-primary" /> {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

// ------------------------------------------------------------------ zones chaudes

function HotZones({ rows, geoByName, selected, onSelect }: {
  rows: DistrictStats[]
  geoByName: Map<string, GeoDistrict>
  selected: string | null
  onSelect: (d: string) => void
}) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">Aucune alerte pour ces filtres.</p>
  return (
    <ol className="divide-y">
      {rows.map((s, i) => (
        <li key={s.district}>
          <button
            onClick={() => onSelect(s.district)}
            className={cn(
              "grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md px-1.5 py-2 text-left text-sm hover:bg-accent/60",
              s.district === selected && "bg-primary/5 ring-1 ring-primary/30",
            )}
          >
            <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="flex min-w-0 items-center gap-2">
              {s.level && <span className={cn("size-2.5 shrink-0 rounded-full", LEVEL_DOT[s.level])} />}
              <span className="truncate font-medium">{geoByName.get(s.district)?.name ?? shortDistrict(s.district)}</span>
              {s.level && <LevelBadge level={s.level} className="hidden h-5 px-1.5 text-[10px] sm:inline-flex" />}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {s.active.length ? `${s.active.length} alerte${s.active.length > 1 ? "s" : ""}` : `${s.counts.SURVEILLER} à surveiller`}
            </span>
            <span className="w-20 text-right font-semibold tabular-nums">{s.active.length ? rangeLabel(s.need) : "—"}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

// ------------------------------------------------------------------ panneau district

function Row({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-0">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" /> {label}
      </span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  )
}

function bestConfidence(opps: Opportunity[]) {
  const best = opps.reduce<Opportunity | null>((b, o) => (!b || o.families.length > b.families.length ? o : b), null)
  return best ? confidence(best) : null
}

function actionText(s: DistrictStats, metier: string | null, place: string): { title: string; detail: string } {
  const who = metier ? shortMetier(metier).toLowerCase() + "s" : "profils"
  const top = s.active[0]
  if (!top) return { title: "Surveiller", detail: `Aucune alerte AGIR ou PRÉPARER : à revoir au prochain export.` }
  const ready = s.available.length
  if (ready >= s.need[0])
    return {
      title: `Appeler ${top.company ?? "les entreprises de la zone"}`,
      detail: `${ready} ${who} disponibles couvrent le bas de la fourchette (${rangeLabel(s.need)}) dans le district de ${place}.`,
    }
  return {
    title: `Sourcer des ${who} à ${place}`,
    detail: `Le vivier (${ready} disponible${ready > 1 ? "s" : ""}) ne couvre pas le renfort estimé (${rangeLabel(s.need)}) : sourcer avant d'appeler ${top.company ?? "la zone"}.`,
  }
}

function DistrictPanel({ s, g, metier, period, today }: {
  s: DistrictStats
  g: GeoDistrict
  metier: string | null
  period: PeriodKey
  today: string
}) {
  const navigate = useNavigate()
  const conf = bestConfidence(s.opps)
  const signals = keySignals(s.opps)
  const action = actionText(s, metier, g.name)
  const top = s.active[0] ?? s.opps[0]
  const alertsUrl = `/alertes?${new URLSearchParams({ district: s.district, ...(metier ? { metier } : {}), ...(s.active.length ? {} : { level: ALL }) })}`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {s.level && <span className={cn("size-3 shrink-0 rounded-full ring-4 ring-current/15", LEVEL_DOT[s.level])} />}
        <h2 className="truncate text-lg font-semibold">
          {g.name} — {metier ? shortMetier(metier) : "tous métiers"}
        </h2>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <figure className="relative overflow-hidden rounded-lg border">
          <img src={g.image} alt={`Vue aérienne de ${g.town.name}`} className="aspect-4/3 size-full object-cover" loading="lazy" />
          <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-2 pt-4 pb-1 text-[10px] text-white">
            {g.town.name} · © swisstopo
          </figcaption>
        </figure>
        <div className="flex flex-col justify-center gap-2 rounded-lg bg-muted/50 p-3">
          <span className="text-xs text-muted-foreground">Niveau du district</span>
          {s.level ? <LevelBadge level={s.level} className="w-fit" /> : <span className="text-sm text-muted-foreground">Aucune alerte</span>}
          {conf && <span className="text-xs leading-snug">Confiance : {conf.label}</span>}
        </div>
      </div>

      <div>
        <Row icon={HardHatIcon} label={`Renfort estimé (${PERIODS[period].label})`}>
          {s.active.length ? rangeLabel(s.need) : "—"}
        </Row>
        <Row icon={BellRingIcon} label="Alertes AGIR · PRÉPARER">
          <span className="tabular-nums">
            {s.counts.AGIR} · {s.counts.PRÉPARER}
            <span className="ml-1.5 font-normal text-muted-foreground">(+{s.counts.SURVEILLER} à surveiller)</span>
          </span>
        </Row>
        <Row icon={Building2Icon} label="Entreprises identifiées">
          {s.companies}
        </Row>
        <Row icon={UsersIcon} label={<span className="flex items-center gap-1.5">Vivier compatible <FictifBadge label="Simulé" /></span>}>
          {s.available.length} dispo.
          {s.soon.length > 0 && <span className="ml-1 font-normal text-muted-foreground">+{s.soon.length} bientôt</span>}
        </Row>
      </div>

      {s.families.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sortFamilies(s.families).map((f) => (
            <FamilyChip key={f} family={f} />
          ))}
        </div>
      )}

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <MegaphoneIcon className="size-4 text-primary" /> Signaux publics clés
        </h3>
        {signals.length ? (
          <ul className="space-y-1">
            {signals.map((sig) => (
              <li key={sig.label}>
                <a
                  href={sig.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className={cn("group flex items-start gap-2 rounded-md p-1.5 text-sm", sig.url && "hover:bg-accent/60")}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", FAMILY_DOT[sig.family])} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2">{sig.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {SIGNAL_TYPE_LABEL[sig.type] ?? sig.type}
                      {sig.date && ` · ${fmtDate(sig.date)}`}
                    </span>
                  </span>
                  {sig.url && <ExternalLinkIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun signal public pour ces filtres.</p>
        )}
      </div>

      <div className="rounded-xl bg-primary/5 p-4 ring-1 ring-primary/15">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ZapIcon className="size-4 text-primary" /> Action recommandée
        </h3>
        <p className="mt-1.5 text-sm font-medium">{action.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{action.detail}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button disabled={!top || top.level === "SURVEILLER"} onClick={() => top && navigate(`/alertes?id=${top.id}`)}>
            <PhoneIcon /> Préparer l'appel
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button variant="outline" className="w-full" disabled>
                  <MailIcon /> Générer un email
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Bientôt disponible</TooltipContent>
          </Tooltip>
        </div>
        <Link to={alertsUrl} className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          {s.opps.length > 1 ? `Voir les ${s.opps.length} alertes de ce district` : "Voir l'alerte de ce district"} <ArrowRightIcon className="size-3" />
        </Link>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Données au {fmtDate(today, { day: "numeric", month: "long", year: "numeric" })}. Renfort = somme des fourchettes des alertes AGIR et
        PRÉPARER ; le vivier ne change pas le niveau.
      </p>
    </div>
  )
}

// ------------------------------------------------------------------ page

export function CartePage() {
  const { opportunities, candidates, meta } = useData()
  const { geo, error } = useGeo()
  const [params, setParams] = useSearchParams()

  const period = ((params.get("periode") ?? "30") in PERIODS ? params.get("periode") ?? "30" : "30") as PeriodKey
  const metierParam = params.get("metier") ?? ALL
  const metier = metierParam === ALL ? null : metierParam
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) if (v === null) next.delete(k); else next.set(k, v)
    setParams(next, { replace: true })
  }

  const candById = React.useMemo(() => new Map<string, Candidate>(candidates.map((c) => [c.id, c])), [candidates])
  // Métiers les plus demandés (AGIR + PRÉPARER) en raccourcis, les autres dans la liste.
  const metiers = React.useMemo(() => {
    const n = new Map<string, number>()
    for (const o of opportunities) if (o.level !== "SURVEILLER") for (const m of o.metiers) n.set(m, (n.get(m) ?? 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m)
  }, [opportunities])

  const filtered = React.useMemo(() => filterOpps(opportunities, period, metier), [opportunities, period, metier])
  const stats = React.useMemo(() => {
    const names = geo?.districts.map((d) => d.district) ?? []
    return new Map(names.map((d) => [d, districtStats(d, filtered, candById, metier)]))
  }, [geo, filtered, candById, metier])
  const ranked = React.useMemo(() => [...stats.values()].filter((s) => s.opps.length).sort(compareStats), [stats])
  const geoByName = React.useMemo(() => new Map((geo?.districts ?? []).map((d) => [d.district, d])), [geo])

  const selectedName = params.get("district") && stats.has(params.get("district")!) ? params.get("district")! : (ranked[0]?.district ?? null)
  const sel = selectedName ? stats.get(selectedName) : undefined
  const selGeo = selectedName ? geoByName.get(selectedName) : undefined
  const projection = React.useMemo(() => (sel ? weeklyProjection(sel, meta.today) : []), [sel, meta.today])

  if (error) return <Placeholder>Fond de carte introuvable ({error}). Lancez <code className="mx-1">python3 -m prototype.geo</code>.</Placeholder>

  return (
    <>
      <PageHeader />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <CalendarRangeIcon className="size-4 text-muted-foreground" /> Début du besoin
              </span>
              {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
                <Chip key={k} active={period === k} onClick={() => set({ periode: k === "30" ? null : k })}>
                  {PERIODS[k].label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <HardHatIcon className="size-4 text-muted-foreground" /> Métiers
              </span>
              <Chip active={!metier} onClick={() => set({ metier: null })}>
                Tous
              </Chip>
              {metiers.slice(0, TOP_METIERS).map((m) => (
                <Chip key={m} active={metier === m} onClick={() => set({ metier: m })}>
                  {shortMetier(m)}
                </Chip>
              ))}
              <Select
                value={metier && !metiers.slice(0, TOP_METIERS).includes(metier) ? metier : ""}
                onValueChange={(v) => set({ metier: v })}
              >
                <SelectTrigger size="sm" className={cn("w-36", metier && !metiers.slice(0, TOP_METIERS).includes(metier) && "border-primary text-primary")}>
                  <SelectValue placeholder="Autres métiers" />
                </SelectTrigger>
                <SelectContent>
                  {metiers.slice(TOP_METIERS).map((m) => (
                    <SelectItem key={m} value={m}>
                      {shortMetier(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {geo ? (
            <ValaisMap geo={geo} stats={stats} selected={selectedName} onSelect={(d) => set({ district: d })} />
          ) : (
            <div className="aspect-138/95 animate-pulse rounded-xl border bg-muted/40" />
          )}

          <div className="grid gap-4 2xl:grid-cols-2">
            <Card
              title={<>Zones chaudes <span className="text-sm font-normal text-muted-foreground">({metier ? shortMetier(metier) : "tous métiers"})</span></>}
              icon={FlameIcon}
              aside={
                <Link to={`/alertes${metier ? `?metier=${encodeURIComponent(metier)}` : ""}`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  Toutes les alertes <ArrowRightIcon className="size-3" />
                </Link>
              }
            >
              <HotZones rows={ranked} geoByName={geoByName} selected={selectedName} onSelect={(d) => set({ district: d })} />
            </Card>
            <Card
              title={
                <>
                  Renfort prévu{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    — {selGeo?.name ?? "—"} ({metier ? shortMetier(metier) : "tous métiers"}), 13 semaines
                  </span>
                </>
              }
              icon={ChartLineIcon}
            >
              {sel && sel.active.length ? (
                <DemandChart points={projection} />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">Pas d'alerte AGIR ou PRÉPARER dans ce district.</p>
              )}
            </Card>
          </div>
        </div>

        <aside className="h-fit rounded-xl border bg-card p-4 xl:sticky xl:top-4">
          {sel && selGeo ? (
            <DistrictPanel s={sel} g={selGeo} metier={metier} period={period} today={meta.today} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {geo ? "Aucune alerte pour ces filtres. Choisissez un district sur la carte." : "Chargement de la carte…"}
            </p>
          )}
        </aside>
      </div>
    </>
  )
}
