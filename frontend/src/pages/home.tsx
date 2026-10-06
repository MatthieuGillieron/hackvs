import * as React from "react"
import { Link, useNavigate } from "react-router"
import {
  BellIcon,
  ChartNoAxesColumnIcon,
  CheckCircle2Icon,
  ClockIcon,
  HistoryIcon,
  PhoneIcon,
  PlayIcon,
  RadarIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"

import { AlertCard } from "@/features/alerts/alert-card"
import { PageBody, PageHeader } from "@/components/layout/page"
import { useData } from "@/lib/data"
import { LEVEL_ORDER, SIGNAL_TYPE_LABEL, fmtDate } from "@/lib/format"
import { CALL_OUTCOME_LABEL, useTasks, type Task } from "@/features/tasks/tasks"
import type { Opportunity } from "@/lib/types"
import { cn } from "@/lib/utils"

// Accueil = « ce qui demande votre attention aujourd'hui » : pipeline de suivi + rappels (tâches et appels de
// `features/tasks/tasks.ts`), puis le top 3 des alertes pas encore suivies, avec la carte du fil d'alertes.

const DAY = 86_400_000
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10)
const alertUrl = (o: Pick<Opportunity, "key">) => `/alertes?alerte=${encodeURIComponent(o.key)}`
const TASKS_URL = "/alertes?vue=taches"

// Même ordre que la page Alertes.
const byPriority = (a: Opportunity, b: Opportunity) =>
  LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.weeks - b.weeks || b.need[1] - a.need[1] || a.id - b.id

function dayLabel(iso: string, today: string): string {
  if (iso < today) return `En retard (${fmtDate(iso)})`
  if (iso === today) return "Aujourd'hui"
  if (iso === addDays(today, 1)) return "Demain"
  const d = fmtDate(iso, { weekday: "long", day: "numeric", month: "short" })
  return d.charAt(0).toUpperCase() + d.slice(1)
}

// ------------------------------------------------------------------ page

export function HomePage() {
  const { meta, opportunities } = useData()
  const tasks = useTasks()
  const all = React.useMemo(() => new Map(opportunities.map((o) => [o.key, o])), [opportunities])
  const active = React.useMemo(() => opportunities.filter((o) => o.level !== "SURVEILLER").sort(byPriority), [opportunities])

  const list = Object.values(tasks)
  // Rappels : dernier appel avec une date de rappel à venir, ou « À rappeler » sans date encore fixée
  // (même règle que « En attente » du pipeline, pour que les deux blocs se répondent).
  const callbacks = list.filter((t) => {
    const last = t.calls?.[0]
    if (t.status === "traite" || !last) return false
    return last.callback ? last.callback >= meta.today : last.outcome === "a_rappeler"
  })

  return (
    <>
      <PageHeader title={`Bonjour ${meta.user.name.split(" ")[0]}`} />
      <PageBody>
        {/* lg+ : la page tient dans l'écran ; le bandeau « Projets détectés » prend la hauteur restante. */}
        <div className="flex flex-col gap-6 lg:h-[calc(100svh-10rem)] lg:min-h-[640px]">
          {/* Rangée du haut : où en est mon suivi, et qui je dois rappeler. Même hauteur pour les deux. */}
          <div className="grid shrink-0 gap-6 lg:h-64 lg:grid-cols-2">
            <Pipeline tasks={list} />
            <Callbacks tasks={callbacks} all={all} className="min-h-0" />
          </div>
          <TopOpportunities active={active} tasks={tasks} />
          <RadarPulse className="min-h-0 flex-1" />
        </div>
      </PageBody>
    </>
  )
}

// ------------------------------------------------------------------ briques

// Pastille Client / Prospect des rappels.
const TONE = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  gray: "bg-muted text-muted-foreground",
}

function Panel({ title, icon: Icon, aside, className, children, id }: {
  title: string
  icon: LucideIcon
  aside?: React.ReactNode
  className?: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} className={cn("flex flex-col rounded-xl bg-card ring-1 ring-foreground/10", className)}>
      <header className="flex items-center justify-between gap-2 px-5 pt-4 pb-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon className="size-5 text-primary" />
          {title}
          {aside}
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-medium", className)}>{children}</span>
}

// ------------------------------------------------------------------ Top 3 des nouvelles opportunités

// Les 3 meilleures alertes pas encore dans mes tâches (même ordre que la page Alertes), avec la carte du fil.
function TopOpportunities({ active, tasks }: { active: Opportunity[]; tasks: Record<string, Task> }) {
  const navigate = useNavigate()
  const fresh = active.filter((o) => !tasks[o.key])
  return (
    <Panel
      title="Top 3 des nouvelles opportunités"
      icon={SparklesIcon}
      className="shrink-0"
    >
      {fresh.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {fresh.slice(0, 3).map((o) => (
            <AlertCard key={o.key} o={o} onOpen={() => navigate(alertUrl(o))} />
          ))}
        </div>
      ) : (
        <Empty>Toutes les alertes sont déjà dans vos tâches.</Empty>
      )}
    </Panel>
  )
}

// ------------------------------------------------------------------ Pipeline de suivi

function Pipeline({ tasks }: { tasks: Task[] }) {
  const [weekAgo] = React.useState(() => Date.now() - 7 * DAY)
  const waiting = (t: Task) => t.status === "en_cours" && t.calls?.[0]?.outcome === "a_rappeler"
  const cells = [
    { icon: ClockIcon, label: "À faire", value: tasks.filter((t) => t.status === "a_faire").length, hint: "Alertes à traiter" },
    { icon: PlayIcon, label: "En cours", value: tasks.filter((t) => t.status === "en_cours" && !waiting(t)).length, hint: "En traitement" },
    { icon: HistoryIcon, label: "En attente", value: tasks.filter(waiting).length, hint: "Rappel prévu" },
    {
      icon: CheckCircle2Icon,
      label: "Clos cette semaine",
      value: tasks.filter((t) => t.status === "traite" && Date.parse(t.updatedAt) >= weekAgo).length,
      hint: "Depuis 7 jours",
    },
  ]
  return (
    <Panel title="Pipeline de suivi" icon={ChartNoAxesColumnIcon}>
      {/* 2 × 2 : À faire | En cours, puis En attente | Clos cette semaine. */}
      <div className="grid h-full grid-cols-2 grid-rows-2 gap-3">
        {cells.map((c) => (
          <Link key={c.label} to={TASKS_URL} className="flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 hover:bg-muted/40">
            <c.icon className="size-5 shrink-0 text-primary" />
            <span className="w-px self-stretch bg-border" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium" title={c.label}>{c.label}</div>
              <div className="text-2xl leading-tight font-semibold tabular-nums">{c.value}</div>
              <div className="truncate text-xs text-muted-foreground" title={c.hint}>{c.hint}</div>
            </div>
          </Link>
        ))}
      </div>
    </Panel>
  )
}

// ------------------------------------------------------------------ Rappels

function Callbacks({ tasks, all, className }: { tasks: Task[]; all: Map<string, Opportunity>; className?: string }) {
  const { meta, clients } = useData()
  const clientKeys = React.useMemo(() => new Set(clients.flatMap((c) => c.alertKeys ?? [])), [clients])
  const rows = tasks
    .map((t) => ({ t, o: all.get(t.key), cb: t.calls![0].callback }))
    .filter((r): r is { t: Task; o: Opportunity; cb: string | null } => !!r.o)
    // Datés d'abord (du plus proche au plus lointain), puis ceux dont la date reste à fixer.
    .sort((a, b) => (a.cb ?? "9999").localeCompare(b.cb ?? "9999"))
  return (
    <Panel title="Rappels" icon={BellIcon} className={className}>
      {rows.length ? (
        <ul className="divide-y">
          {rows.map(({ t, o, cb }) => {
            const client = clientKeys.has(o.key)
            return (
              <li key={t.key} className="flex items-center gap-3 py-1.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
                  <PhoneIcon className="size-4" />
                </span>
                <Link to={alertUrl(o)} className="min-w-0 flex-1 hover:underline">
                  <div className="truncate text-sm leading-tight font-semibold">{o.target}</div>
                  <div className="truncate text-xs leading-tight text-muted-foreground">
                    {CALL_OUTCOME_LABEL[t.calls![0].outcome]}
                    {/* Le contact n'est utile que s'il diffère du nom affiché (zone, ou personne nommée). */}
                    {t.calls![0].contact && t.calls![0].contact !== o.target ? ` · ${t.calls![0].contact}` : ""}
                  </div>
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">{cb ? dayLabel(cb, meta.today) : "Date à fixer"}</span>
                <Chip className={client ? TONE.blue : TONE.gray}>{client ? "Client" : "Prospect"}</Chip>
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty>Aucun rappel planifié. Ils apparaissent après un compte-rendu d'appel.</Empty>
      )}
    </Panel>
  )
}

// ------------------------------------------------------------------ Projets détectés par semaine

// Nouveaux projets publics captés par semaine (12 semaines glissantes). Seule la famille Projet a un vrai historique :
// les annonces d'emploi ne sont visibles que tant qu'elles sont en ligne, d'où un chiffre « en ligne » à part.
const WEEKS = 12

function RadarPulse({ className }: { className?: string }) {
  const { meta, opportunities } = useData()
  const [hover, setHover] = React.useState<number | null>(null)

  const { weeks, ads } = React.useMemo(() => {
    // Un même signal peut appartenir à plusieurs alertes (entreprise + zone) : compté une fois.
    const seen = new Set<string>()
    const weeks = Array.from({ length: WEEKS }, () => ({ total: 0, byType: {} as Record<string, number> }))
    let ads = 0
    for (const o of opportunities) {
      for (const s of o.signals) {
        if (s.fictif || !s.date) continue
        const id = `${s.type}|${s.url ?? s.label}|${s.date.slice(0, 10)}`
        if (seen.has(id)) continue
        seen.add(id)
        if (s.family === "recrutement") ads++
        if (s.family !== "projet") continue
        const ago = Math.floor((Date.parse(meta.today) - Date.parse(s.date.slice(0, 10))) / DAY / 7)
        if (ago < 0 || ago >= WEEKS) continue
        const w = weeks[WEEKS - 1 - ago] // de la plus ancienne (gauche) à la semaine en cours (droite)
        w.total++
        w.byType[s.type] = (w.byType[s.type] ?? 0) + 1
      }
    }
    return { weeks, ads }
  }, [opportunities, meta.today])

  const max = Math.max(1, ...weeks.map((w) => w.total))
  const current = weeks[WEEKS - 1].total
  const weekEnd = (i: number) => addDays(meta.today, -7 * (WEEKS - 1 - i))
  const shown = hover ?? WEEKS - 1

  const detail = `${fmtDate(addDays(weekEnd(shown), -6))} – ${fmtDate(weekEnd(shown))} · ${weeks[shown].total} projet(s)`
  const types = Object.entries(weeks[shown].byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, n]) => `${SIGNAL_TYPE_LABEL[t] ?? t} ${n}`)
    .join(" · ")

  // Bandeau sur une rangée (titre · chiffres · barres) : il prend la hauteur restante sans faire défiler la page.
  return (
    <section className={cn("flex min-h-24 items-stretch gap-6 rounded-xl bg-card px-5 py-3 ring-1 ring-foreground/10", className)}>
      {/* Une seule section à gauche : le titre, puis les deux chiffres clés. */}
      <div className="flex shrink-0 flex-col justify-center gap-1.5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <RadarIcon className="size-5 text-primary" />
          Projets détectés par semaine
        </h2>
        <div className="flex items-baseline gap-5 text-xs whitespace-nowrap text-muted-foreground">
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold text-foreground tabular-nums">{current}</span> nouveaux projets ces 7 derniers jours
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold text-foreground tabular-nums">{ads}</span> offres d'emploi actives
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col border-l pl-6">
        {/* Semaine survolée (par défaut : la semaine en cours). */}
        <div className="truncate text-xs text-muted-foreground" title={`${detail} · ${types}`}>
          <span className="text-foreground">{detail}</span>
          {types && ` · ${types}`}
        </div>
        <div className="mt-1 flex min-h-8 flex-1 items-end gap-1.5" onMouseLeave={() => setHover(null)}>
          {weeks.map((w, i) => (
            <div
              key={i}
              className="flex h-full flex-1 cursor-default items-end justify-center"
              onMouseEnter={() => setHover(i)}
              aria-label={`Semaine au ${fmtDate(weekEnd(i))} : ${w.total} nouveaux projets`}
            >
              <div
                className={cn("w-full max-w-5 rounded-t-[4px] transition-colors", i === shown ? "bg-primary" : "bg-primary/30")}
                style={{ height: `${Math.max(4, (w.total / max) * 100)}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
