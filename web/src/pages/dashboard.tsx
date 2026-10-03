import * as React from "react"
import { Link } from "react-router"
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudSunIcon,
  CopyIcon,
  HardHatIcon,
  MapPinIcon,
  ZapIcon,
} from "lucide-react"

import { AlertThumb } from "@/components/alerts/alert-thumb"
import { FamilyChip, LevelBadge } from "@/components/level-badge"
import { FictifBadge, PageHeader, Placeholder } from "@/components/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useData } from "@/lib/data"
import {
  LEVEL_ORDER,
  fmtDate,
  metiersLabel,
  needLabel,
  shortDistrict,
  shortMetier,
  shortReasons,
  sortFamilies,
  weeksRange,
} from "@/lib/format"
import type { Candidate, Meta, Opportunity } from "@/lib/types"
import { cn } from "@/lib/utils"

// Dashboard = le brief de la semaine, lisible sans défiler sur un écran de portable :
// les 3 priorités, puis l'action et les candidats de la priorité sélectionnée.
// Règles du projet : aucun score sur 100, volumes en fourchettes, sources citées, données internes marquées.

const PAGE = 3

// Même ordre que le badge « #1/#2/#3 Priorité » de la page Alertes.
const byPriority = (a: Opportunity, b: Opportunity) =>
  LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.weeks - b.weeks || b.need[1] - a.need[1] || a.id - b.id

const ready = (o: Opportunity) => o.vivier.disponibles + o.vivier.bientot

// Part du besoin couverte par le vivier mobilisable (disponibles + bientôt libres).
function coverage(o: Opportunity) {
  return o.vivier.besoin ? Math.min(1, ready(o) / o.vivier.besoin) : 1
}

// Synthèse construite uniquement à partir des champs de la fiche (aucune IA) : chaque élément est traçable.
function synthese(o: Opportunity, today: string): string {
  const reasons = shortReasons(o.signals, 4)
    .map((r, i) => (i ? r.charAt(0).toLowerCase() + r.slice(1) : r))
    .join(", ")
  const vivier =
    o.vivier.a_sourcer > 0
      ? `${ready(o)} profil(s) prêt(s), ${o.vivier.a_sourcer} à sourcer`
      : `${ready(o)} profil(s) prêt(s) pour ${o.vivier.besoin} poste(s)`
  return (
    `${o.target} (${o.place ?? shortDistrict(o.district)}) : ${reasons}. ` +
    `Besoin estimé ${needLabel(o)} personnes (${metiersLabel(o.metiers, 3)}), ${weeksRange(o.window, today).toLowerCase()}. ` +
    `Vivier (simulé) : ${vivier}.`
  )
}

// ------------------------------------------------------------------ page

export function DashboardPage() {
  const { meta, opportunities, candidates } = useData()

  const active = React.useMemo(
    () => opportunities.filter((o) => o.level !== "SURVEILLER").sort(byPriority),
    [opportunities],
  )
  // Les priorités = les AGIR ; à défaut, les meilleures PRÉPARER.
  const agir = active.filter((o) => o.level === "AGIR")
  const priorities = agir.length ? agir : active.slice(0, PAGE)

  const [page, setPage] = React.useState(0)
  const pages = Math.max(1, Math.ceil(priorities.length / PAGE))
  const shown = priorities.slice(page * PAGE, page * PAGE + PAGE)
  const [selectedId, setSelectedId] = React.useState<number | undefined>(priorities[0]?.id)
  const selected = shown.find((o) => o.id === selectedId) ?? shown[0]

  const goTo = (p: number) => {
    setPage(p)
    setSelectedId(priorities[p * PAGE]?.id)
  }

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100svh-3rem)] lg:min-h-[640px]">
      <PageHeader title="Brief de la semaine" actions={<Today meta={meta} />} />
      <Kpis priorities={priorities} opportunities={opportunities} />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {agir.length ? "À appeler cette semaine" : "Aucune alerte AGIR : les meilleures à préparer"}
            {shown.length > 0 && (
              <span className="ml-2 font-normal text-muted-foreground">
                {page * PAGE + 1}–{page * PAGE + shown.length} sur {priorities.length}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-1">
            {pages > 1 && (
              <>
                <Button variant="ghost" size="icon-sm" disabled={page === 0} onClick={() => goTo(page - 1)} aria-label="Priorités précédentes">
                  <ChevronLeftIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={page >= pages - 1} onClick={() => goTo(page + 1)} aria-label="Priorités suivantes">
                  <ChevronRightIcon />
                </Button>
              </>
            )}
            <Button variant="link" size="sm" asChild>
              <Link to="/alertes">
                Toutes les alertes ({active.length}) <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        </div>
        {shown.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {shown.map((o, i) => (
              <PriorityCard
                key={o.id}
                o={o}
                rank={page * PAGE + i + 1}
                today={meta.today}
                selected={o.id === selected?.id}
                onSelect={() => setSelectedId(o.id)}
              />
            ))}
          </div>
        ) : (
          <Placeholder>Aucune opportunité à traiter cette semaine.</Placeholder>
        )}
      </section>

      {selected && (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3">
          <CandidatesCard o={selected} candidates={candidates} today={meta.today} className="lg:col-span-2" />
          <ActionCard o={selected} today={meta.today} />
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ blocs

function Today({ meta }: { meta: Meta }) {
  const w = meta.weather
  const day = fmtDate(meta.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span>{day.charAt(0).toUpperCase() + day.slice(1)}</span>
      {w && (
        <span className="flex items-center gap-1.5 border-l pl-3" title={`Météo du jour à ${w.place} (Open-Meteo)`}>
          <CloudSunIcon className="size-4" />
          {w.place} {Math.round(w.tmax)}° / {Math.round(w.tmin)}°{w.frostDays > 0 && ` · ${w.frostDays} j. de gel prévus`}
        </span>
      )}
    </div>
  )
}

function Kpis({ priorities, opportunities }: { priorities: Opportunity[]; opportunities: Opportunity[] }) {
  const sum = (f: (o: Opportunity) => number) => priorities.reduce((a, o) => a + f(o), 0)
  const toSource = priorities.filter((o) => o.vivier.a_sourcer > 0).length
  // Ce que l'historique Flexsis ajoute aux signaux publics, que la concurrence voit aussi.
  const upgraded = opportunities.filter((o) => o.level === "AGIR" && o.levelPublic !== "AGIR").length
  const kpis = [
    { label: "Appels à passer", value: priorities.length, sub: toSource ? `dont ${toSource} à sourcer d'abord` : "tous avec des profils prêts" },
    { label: "Renfort estimé", value: `${sum((o) => o.need[0])}–${sum((o) => o.need[2])}`, sub: "personnes, toutes priorités" },
    {
      label: "Profils prêts",
      value: sum((o) => Math.min(o.vivier.besoin, ready(o))),
      sub: `${sum((o) => o.vivier.a_sourcer)} poste(s) à sourcer`,
      fictif: true,
    },
    { label: "Votre avance", value: `+${upgraded}`, sub: "AGIR grâce à votre historique", fictif: true },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <div key={k.label} className="flex items-start justify-between gap-3 rounded-xl bg-card px-4 py-2.5 ring-1 ring-foreground/10">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{k.value}</div>
            <div className="truncate text-xs text-muted-foreground">{k.sub}</div>
          </div>
          {k.fictif && <FictifBadge label="Simulé" />}
        </div>
      ))}
    </div>
  )
}

function CoverageBar({ o }: { o: Opportunity }) {
  const pct = Math.round(coverage(o) * 100)
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Couverture</span>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="Couverture du besoin par le vivier"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn("h-full rounded-full", pct < 100 ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <span className="min-w-9 text-right font-medium whitespace-nowrap tabular-nums">{pct} %</span>
    </div>
  )
}

function PriorityCard({ o, rank, today, selected, onSelect }: {
  o: Opportunity
  rank: number
  today: string
  selected: boolean
  onSelect: () => void
}) {
  const v = o.vivier
  const cells = [
    { label: "Besoin", value: v.besoin },
    { label: "Disponibles", value: v.disponibles },
    { label: "Bientôt libres", value: v.bientot },
    { label: "À sourcer", value: v.a_sourcer, alert: v.a_sourcer > 0 },
  ]
  const place = o.place && o.place !== shortDistrict(o.district) ? `${o.place} · ` : ""
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-xl bg-card p-3 text-left text-sm ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/25",
        selected && "ring-2 ring-primary hover:ring-primary",
      )}
    >
      <div className="flex items-start gap-3">
        <AlertThumb o={o} credit className="h-[84px] w-24" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Badge variant={rank === 1 ? "default" : "secondary"} className="h-5 px-1.5 text-[11px]">
              #{rank} Priorité
            </Badge>
            <LevelBadge level={o.level} className="h-5" />
          </div>
          <div className="mt-1 truncate leading-tight font-semibold" title={o.target}>
            {o.target}
          </div>
          <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1 truncate">
              <MapPinIcon className="size-3 shrink-0" />
              {place}
              {shortDistrict(o.district)}
            </div>
            <div className="flex items-center gap-1 truncate" title={o.metiers.join(", ")}>
              <HardHatIcon className="size-3 shrink-0" />
              {metiersLabel(o.metiers, 2)}
            </div>
            <div className="flex items-center gap-1 truncate">
              <CalendarIcon className="size-3 shrink-0" />
              {weeksRange(o.window, today)}
            </div>
          </div>
        </div>
        <div className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1.5 text-center" title="Renfort intérimaire estimé (fourchette)">
          <div className="text-[10px] text-muted-foreground">Renfort</div>
          <div className="text-lg leading-tight font-semibold tabular-nums">{needLabel(o)}</div>
          <div className="text-[10px] text-muted-foreground">pers.</div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold">Pourquoi ?</div>
        <ul className="mt-0.5 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
          {shortReasons(o.signals, 3).map((r) => (
            <li key={r} className="truncate">
              {r}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-1">
        {sortFamilies(o.families).map((f) => (
          <FamilyChip key={f} family={f} />
        ))}
      </div>

      <div className="mt-auto space-y-2">
        <div className="grid grid-cols-4 divide-x rounded-lg border text-center">
          {cells.map((c) => (
            <div key={c.label} className="min-w-0 px-1 py-1">
              <div className="truncate text-[10px] text-muted-foreground">{c.label}</div>
              <div className={cn("font-semibold tabular-nums", c.alert && "text-destructive")}>{c.value}</div>
            </div>
          ))}
        </div>
        <CoverageBar o={o} />
      </div>
    </button>
  )
}

const POOL_LABEL = { disponibles: "Disponible", bientot: "Bientôt libre", anciens: "Ancien à réactiver" } as const

function availability(c: Candidate, today: string) {
  if (c.statut === "ancien") {
    return c.derniere_mission_fin ? `Dernière mission ${fmtDate(c.derniere_mission_fin, { month: "short", year: "numeric" })}` : "—"
  }
  if (!c.disponible_des || c.disponible_des <= today) return "Dès maintenant"
  return `Dès le ${fmtDate(c.disponible_des)}`
}

function CandidatesCard({ o, candidates, today, className }: {
  o: Opportunity
  candidates: Candidate[]
  today: string
  className?: string
}) {
  const byId = React.useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])
  const rows = (Object.keys(POOL_LABEL) as (keyof typeof POOL_LABEL)[]).flatMap((k) =>
    (o.pool?.[k] ?? []).flatMap((id) => {
      const c = byId.get(id)
      return c ? [{ kind: k, c }] : []
    }),
  )
  return (
    <Card size="sm" className={cn("min-h-0", className)}>
      <CardHeader>
        <CardTitle>
          Candidats compatibles · {o.target} <span className="font-normal text-muted-foreground">({rows.length})</span>
        </CardTitle>
        <CardDescription>Métier principal recherché, dans leur rayon de déplacement · disponibles d'abord</CardDescription>
        <CardAction>
          <FictifBadge />
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        {rows.length ? (
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Métier</TableHead>
                <TableHead>Commune</TableHead>
                <TableHead>Disponibilité</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Expérience</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ kind, c }) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.prenom} {c.nom}
                  </TableCell>
                  <TableCell>{shortMetier(c.metierLabel)}</TableCell>
                  <TableCell>{c.commune}</TableCell>
                  <TableCell>{availability(c, today)}</TableCell>
                  <TableCell>
                    <Badge variant={kind === "anciens" ? "outline" : "secondary"} className="font-normal">
                      {POOL_LABEL[kind]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.experience_ans} ans</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun candidat du vivier pour ce métier : sourcing nécessaire.</p>
        )}
      </CardContent>
    </Card>
  )
}

function ActionCard({ o, today }: { o: Opportunity; today: string }) {
  const text = synthese(o, today)
  // id de la fiche copiée : changer de fiche réinitialise le bouton sans effet
  const [copiedId, setCopiedId] = React.useState<number | null>(null)
  const copied = copiedId === o.id
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(o.id)
    } catch {
      setCopiedId(null)
    }
  }
  const sourcing = o.vivier.a_sourcer > 0

  return (
    <Card size="sm" className="min-h-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ZapIcon className="size-4 text-primary" />
          Action recommandée
        </CardTitle>
        <CardDescription className="truncate">{o.target}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <p className={cn("rounded-lg border p-2.5 text-sm font-medium", sourcing ? "border-amber-500/40 bg-amber-500/10" : "bg-muted/50")}>
            {o.action}
          </p>
          <div>
            <div className="mb-1 text-xs font-semibold">Synthèse</div>
            <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
            <p className="mt-1 text-[10px] text-muted-foreground/80">Générée à partir des signaux de la fiche, sans IA.</p>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <Button size="sm" asChild>
            <Link to={`/alertes?id=${o.id}`}>
              Ouvrir la fiche <ArrowRightIcon />
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copiée" : "Copier la synthèse"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
