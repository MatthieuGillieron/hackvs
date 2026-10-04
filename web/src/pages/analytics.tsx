import * as React from "react"
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BellRingIcon,
  BookmarkIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  DatabaseIcon,
  MapIcon,
  PhoneIcon,
  SmileIcon,
  SparklesIcon,
  TrendingUpIcon,
  TrashIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { Link, useSearchParams } from "react-router"

import { Card, Empty, Info, Meter, Pill, Stat } from "@/components/analytics/ui"
import { FictifBadge, PageBody, PageHeader, Placeholder } from "@/components/page"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  activity,
  DEFAULT_PERIOD,
  demoTasks,
  engineStats,
  fmtNum,
  leadWeeks,
  PERIODS,
  pct,
  publicationsRead,
  tension,
  type EngineStats,
  type PeriodKey,
  type TensionRow,
} from "@/lib/analytics"
import { districtStats, LEVEL_DOT, rangeLabel } from "@/lib/carte"
import { useData } from "@/lib/data"
import { LEVEL_LABEL, LEVEL_ORDER, shortMetier } from "@/lib/format"
import { useGeo } from "@/lib/geo"
import { clearDemoTasks, loadDemoTasks, useTasks, type Task } from "@/lib/tasks"
import type { Candidate, Level } from "@/lib/types"
import { cn } from "@/lib/utils"

// Analytics : une seule page, l'essentiel, de haut en bas :
// 1. le parcours du signal public au client intéressé (pièce maîtresse de la démo) ;
// 2. la tension par métier (qui il manque) et, à droite, 3 chiffres clés (avance, couverture, clients intéressés) ;
// 3. la carte des besoins, pleine largeur.
// Période = date de détection d'une alerte (1er signal public daté) et date des actions du consultant.
// Un clic sur un district de la carte filtre tout le reste (`?district=`).

export function AnalyticsPage() {
  const { opportunities, candidates, sources, meta } = useData()
  const tasks = useTasks()
  const { geo, error } = useGeo()
  const [params, setParams] = useSearchParams()

  const periodParam = params.get("periode") as PeriodKey | null
  const period: PeriodKey = periodParam && periodParam in PERIODS ? periodParam : DEFAULT_PERIOD
  const days = PERIODS[period].days
  const district = params.get("district") || null
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v === null) next.delete(k)
    else next.set(k, v)
    setParams(next, { replace: true })
  }

  const candById = React.useMemo(() => new Map<string, Candidate>(candidates.map((c) => [c.id, c])), [candidates])
  const byKey = React.useMemo(() => new Map(opportunities.map((o) => [o.key, o])), [opportunities])
  const inDistrict = React.useMemo(
    () => (district ? opportunities.filter((o) => o.district === district) : opportunities),
    [opportunities, district],
  )

  // La carte ignore le filtre district (elle sert à le choisir) ; tout le reste le suit.
  const all = React.useMemo(() => engineStats(opportunities, meta.today, days), [opportunities, meta.today, days])
  const now = React.useMemo(() => engineStats(inDistrict, meta.today, days), [inDistrict, meta.today, days])
  const myTasks: Record<string, Task> = district
    ? Object.fromEntries(Object.entries(tasks).filter(([k]) => byKey.get(k)?.district === district))
    : tasks
  const act = activity(myTasks, meta.today, days)
  const rows = tension(now.active, candById)
  const read = publicationsRead(sources)

  const list = Object.values(tasks)
  const hasTasks = list.length > 0
  const hasDemo = list.some((t) => t.demo)
  const interestRate = act.calls.length ? act.outcomes.interesse / act.calls.length : null

  const districts = geo?.districts ?? []
  const districtName = districts.find((d) => d.district === district)?.name
  const mapOpps = React.useMemo(() => {
    const keys = new Set(all.found.map((o) => o.key))
    return opportunities.filter((o) => keys.has(o.key))
  }, [opportunities, all])
  const mapStats = new Map(districts.map((d) => [d.district, districtStats(d.district, mapOpps, candById, null)]))

  // Bande pleine largeur (bas de page) : les 13 districts en tuiles qui remplissent le widget, regroupés par niveau
  // (urgent, puis à anticiper, puis en veille, puis sans alerte), le plus d'alertes d'abord à niveau égal.
  // Barre de couleur = niveau le plus élevé ; clic = filtre toute la page sur le district.
  const activeCount = (id: string) => {
    const st = mapStats.get(id)
    return st ? st.counts.AGIR + st.counts.PRÉPARER : 0
  }
  const levelRank = (id: string) => {
    const lv = mapStats.get(id)?.level
    return lv ? LEVEL_ORDER[lv] : 3
  }
  const zones = [...districts].sort(
    (a, b) => levelRank(a.district) - levelRank(b.district) || activeCount(b.district) - activeCount(a.district) || a.center[0] - b.center[0],
  )
  const mapCard = (
    <section className="flex min-h-40 min-w-0 flex-col gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 lg:min-h-0 lg:flex-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold">
          <MapIcon className="size-5 shrink-0 text-primary" />
          {districtName ? `Zones · ${districtName}` : "Zones"}
          <Info>Alertes détectées sur la période, par district, de l'urgent à la veille : couleur = niveau le plus élevé. Clic sur un district pour filtrer toute la page.</Info>
        </h2>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          {(["AGIR", "PRÉPARER", "SURVEILLER"] as Level[]).map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", LEVEL_DOT[l])} /> {LEVEL_LABEL[l]}
            </span>
          ))}
        </div>
      </div>
      {error ? (
        <Placeholder>Districts introuvables ({error}).</Placeholder>
      ) : geo ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-13">
          {zones.map((d) => {
            const st = mapStats.get(d.district)
            const n = st ? st.counts.AGIR + st.counts.PRÉPARER : 0
            const isSel = d.district === district
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => set("district", isSel ? null : d.district)}
                aria-pressed={isSel}
                title={`${d.name} : ${n} alerte(s) urgente(s) ou à anticiper`}
                className={cn(
                  "flex min-w-0 flex-col overflow-hidden rounded-lg border text-left transition-colors hover:bg-muted/40",
                  isSel && "border-primary ring-1 ring-primary",
                )}
              >
                <span className={cn("h-1.5 w-full shrink-0", st?.level ? LEVEL_DOT[st.level] : "bg-muted")} />
                <span className="flex flex-1 flex-col justify-center px-2 py-1.5">
                  <span className="truncate text-xs font-medium">{d.name}</span>
                  <span className={cn("text-lg leading-tight font-semibold tabular-nums", !n && "text-muted-foreground")}>{n}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{n && st ? rangeLabel(st.need) : "aucune alerte"}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex-1 animate-pulse rounded-lg bg-muted/40" />
      )}
    </section>
  )

  return (
    <>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {districtName && (
              <Button variant="outline" size="sm" className="border-primary text-primary" onClick={() => set("district", null)}>
                <MapIcon /> {districtName} <XIcon />
              </Button>
            )}
            <Select value={period} onValueChange={(v) => set("periode", v === DEFAULT_PERIOD ? null : v)}>
              <SelectTrigger size="sm" className="w-48 bg-background" aria-label="Période">
                <CalendarIcon />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {PERIODS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Tout tient à l'écran sans défiler (vérifié à 1366×681) : hauteur = écran - (marge + en-tête + marge) ;
          le parcours garde sa hauteur ; tableau + chiffres et carte se partagent le reste dans les proportions du
          mockup (2,6 / 1 ; 2,1 / 1 sous 820 px de haut, le minimum pour les chiffres) ; le tableau défile dedans. */}
      <PageBody className="gap-4 py-4 lg:h-[calc(100svh-6.375rem)] lg:min-h-[540px] lg:flex-none">
        <Journey
          steps={[
            { icon: DatabaseIcon, label: "Publications", value: read, sub: "analysées", hint: "Publications lues dans les sources publiques (dernier relevé)" },
            { icon: BellRingIcon, label: "Alertes à traiter", value: now.active.length, sub: "identifiées", hint: "Détectées sur la période, au moins 2 familles de signaux" },
            { icon: BookmarkIcon, label: "Mises en suivi", value: act.tracked.length, sub: "en cours", hint: "Ajoutées à mes tâches sur la période" },
            { icon: PhoneIcon, label: "Appelées", value: act.called.length, sub: "contactées", hint: "Au moins un appel noté" },
            { icon: SmileIcon, label: "Intéressés", value: act.interested.length, sub: "qualifiés", hint: "Au moins un appel « Intéressé »" },
          ]}
          demo={hasDemo}
        />

        <div className="grid gap-4 lg:min-h-0 lg:flex-[2.1] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-1 tall:flex-[2.6]">
          <TensionTable rows={rows} />
          {/* Les 3 chiffres clés dans un seul widget, séparés par des traits fins. */}
          <div className="grid divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:grid-cols-3 md:divide-y-0 lg:min-h-0 lg:grid-cols-1 lg:grid-rows-3 lg:divide-y">
            <Stat
              className="rounded-none bg-transparent ring-0"
              title="Anticipation"
              icon={ClockIcon}
              info="D'avance entre la détection et le début du besoin client. Médiane, sur les alertes urgentes ou à anticiper détectées dans la période, du délai entre le premier signal public daté et le début estimé du besoin."
              value={now.lead === null ? "—" : `${Math.round(now.lead)} semaines`}
              context={leadSpread(now) || "Avant le début du besoin"}
            />
            <Stat
              className="rounded-none bg-transparent ring-0"
              title="Couverture du vivier"
              icon={UsersIcon}
              info="Part du renfort estimé (estimation centrale) que les candidats disponibles déjà appariés aux alertes pourraient couvrir, alerte par alerte. Vivier simulé."
              value={pct(now.coverage)}
              context={`${now.active.length} alertes à traiter`}
              badge={<FictifBadge label="Simulé" />}
            />
            <Stat
              className="rounded-none bg-transparent ring-0"
              title="Clients intéressés"
              icon={SmileIcon}
              info="Alertes mises en suivi sur la période dont au moins un appel a abouti à « Intéressé » ; taux = part des appels de la période qui se concluent ainsi."
              value={hasTasks ? act.interested.length : "—"}
              pill={interestRate !== null && <Pill tone="green" className="h-6">{pct(interestRate)} des appels</Pill>}
              context={hasTasks ? `${act.tracked.length} alertes suivies` : "Avec vos comptes-rendus d'appel"}
              badge={
                hasDemo ? (
                  <Button variant="outline" size="xs" className="h-5 text-muted-foreground" onClick={clearDemoTasks} title="Retirer le jeu de démo (fictif)">
                    <TrashIcon /> Démo
                  </Button>
                ) : (
                  <Button variant="outline" size="xs" className="h-5 text-muted-foreground" onClick={() => loadDemoTasks(demoTasks(opportunities, meta.today))}>
                    <SparklesIcon /> Démo
                  </Button>
                )
              }
            />
          </div>
        </div>

        {mapCard}
      </PageBody>
    </>
  )
}

// « pour 8 alertes sur 10 » : affiché seulement s'il y a assez d'alertes datées (au moins 3).
function leadSpread(now: EngineStats): string {
  const dated = now.active.filter((o) => leadWeeks(o) !== null).length
  return dated >= 3 ? "pour 8 alertes sur 10" : ""
}

// ------------------------------------------------------------------ du signal au client

// Entonnoir dans un widget (d'après mockup) : 5 cartes verticales — icône orange, trait, étape, grand chiffre,
// sous-titre — reliées par des flèches (sans taux, retirés à la demande). Format complet dès 820 px de haut (`tall:`) ; en dessous,
// icône et étape sur une ligne, sous-titre à côté du chiffre, pour que la page tienne sans défiler.
function Journey({ steps, demo }: {
  steps: { icon: LucideIcon; label: string; value: number; sub: string; hint: string }[]
  demo: boolean
}) {
  return (
    <Card
      title="Du signal au client"
      icon={TrendingUpIcon}
      info="Publications = total des sources publiques qui alimentent une famille de signaux (dernier relevé). Alertes = détectées dans la période. Mises en suivi = ajoutées à mes tâches dans la période, puis appelées, puis au moins un appel « Intéressé »."
      aside={demo ? <FictifBadge label="Activité en partie démo" /> : undefined}
      className="shrink-0"
    >
      <ol className="flex flex-col gap-1 md:flex-row md:items-stretch tall:gap-2">
        {steps.map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 && (
              <li aria-hidden className="flex w-8 shrink-0 items-center justify-center self-center tall:w-10">
                <ArrowRightIcon className="size-5 rotate-90 text-muted-foreground md:rotate-0" />
              </li>
            )}
            <li className="flex min-w-0 flex-1 flex-col rounded-xl border px-3 py-2 tall:px-4 tall:py-4" title={s.hint}>
              <span className="flex min-w-0 items-center gap-2">
                <s.icon className="size-5 shrink-0 text-primary tall:size-7" />
                <span className="truncate text-xs font-medium tall:hidden">{s.label}</span>
              </span>
              <span className="my-1.5 h-px bg-border tall:my-3" aria-hidden />
              <span className="hidden truncate text-sm font-medium tall:block">{s.label}</span>
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="text-lg leading-tight font-bold tracking-tight tabular-nums tall:text-3xl">{fmtNum(s.value)}</span>
                <span className="truncate text-xs text-muted-foreground tall:hidden">{s.sub}</span>
              </span>
              <span className="hidden truncate text-sm text-muted-foreground tall:block">{s.sub}</span>
            </li>
          </React.Fragment>
        ))}
      </ol>
    </Card>
  )
}

// ------------------------------------------------------------------ tension par métier

const TENSION_COLS = "grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_5.5rem_8rem] items-center gap-x-4"

// Tous les métiers des alertes à traiter, les manques d'abord. On n'affiche que les lignes qui tiennent entières
// (jamais de ligne coupée) ; un pied « Voir les N autres métiers » déplie la liste complète, qui défile alors dedans.
// Un clic sur une ligne la déplie (détail + lien vers les alertes).
function TensionTable({ rows }: { rows: TensionRow[] }) {
  const [open, setOpen] = React.useState<string | null>(null)
  const [all, setAll] = React.useState(false)
  // Hauteurs mesurées dans le navigateur (boîte, en-tête, une ligne) : combien de lignes tiennent entières ?
  const boxRef = React.useRef<HTMLDivElement>(null)
  const headRef = React.useRef<HTMLDivElement>(null)
  const [box, setBox] = React.useState({ height: 0, head: 0, row: 0 })
  React.useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => {
      const row = el.querySelector<HTMLElement>("li > button")
      setBox({ height: el.clientHeight, head: headRef.current?.offsetHeight ?? 0, row: row ? row.offsetHeight + 1 : 0 })
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Le pied « Voir les N autres » a la hauteur d'une ligne ; une ligne dépliée en prend environ une de plus.
  const room = (extra: number) => Math.floor((box.height - box.head - extra) / box.row) - (open ? 1 : 0)
  const fitsAll = !box.row || room(0) >= rows.length
  const fit = fitsAll ? rows.length : Math.max(1, room(box.row))
  const shown = all || fitsAll ? rows : rows.slice(0, fit)
  const hidden = rows.length - fit

  return (
    <Card
      title="Tension par métier"
      icon={UsersIcon}
      info="Renfort estimé des alertes à traiter, réparti à parts égales entre leurs métiers (indicatif), face aux candidats disponibles appariés. Couverture = vivier / bas de la fourchette ; « À sourcer » = profils manquants pour l'atteindre."
      aside={<FictifBadge label="Vivier simulé" />}
      className="min-h-72 lg:min-h-0"
      bodyClassName="relative pt-0"
    >
      <div ref={boxRef} className={cn("absolute inset-x-4 top-0 bottom-3 text-sm", all ? "overflow-y-auto" : "overflow-hidden")}>
        {rows.length ? (
          <>
            <div ref={headRef} className={cn(TENSION_COLS, "sticky top-0 z-10 h-7 rounded-md bg-muted px-3 text-xs font-medium text-muted-foreground")}>
              <span>Métier</span>
              <span>Tension</span>
              <span>Couverture</span>
              <span>Statut</span>
            </div>
            <ul>
              {shown.map((r) => {
                const isOpen = open === r.metier
                return (
                  <li key={r.metier} className={cn("border-b last:border-b-0", isOpen && "rounded-md bg-primary/5")}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : r.metier)}
                      className={cn(TENSION_COLS, "h-8 w-full px-3 text-left hover:bg-muted/40", isOpen && "hover:bg-transparent")}
                    >
                      <span className={cn("truncate", isOpen && "font-medium text-primary")} title={r.metier}>
                        {shortMetier(r.metier)}
                      </span>
                      <Meter value={r.coverage} className="w-full" />
                      <span className="tabular-nums">{pct(r.coverage)}</span>
                      {r.toSource > 0 ? (
                        <span className="flex items-center gap-1.5">
                          <AlertTriangleIcon className="size-4 shrink-0 text-orange-600 dark:text-orange-400" /> {r.toSource} à sourcer
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                          <CheckIcon className="size-4 shrink-0" /> Couvert
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <p className="flex items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
                        <ChevronDownIcon className="size-3.5" />
                        {shortMetier(r.metier)} : {r.alerts} alerte{r.alerts > 1 ? "s" : ""}, renfort {r.need[0]}–{r.need[1]} pers.,{" "}
                        {r.vivier} disponible{r.vivier > 1 ? "s" : ""} —
                        <Link to={`/alertes?metier=${encodeURIComponent(r.metier)}`} className="font-medium text-primary hover:underline">
                          voir les alertes
                        </Link>
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
            {!fitsAll && (
              <button
                type="button"
                onClick={() => setAll((v) => !v)}
                className={cn(
                  "flex h-8 w-full items-center justify-center gap-1.5 text-xs font-medium text-primary hover:underline",
                  all && "sticky bottom-0 bg-card",
                )}
              >
                {all ? "Réduire la liste" : `Voir les ${hidden} autres métiers`}
                <ChevronDownIcon className={cn("size-3.5 transition-transform", all && "rotate-180")} />
              </button>
            )}
          </>
        ) : (
          <Empty>Aucun besoin chiffré sur la période.</Empty>
        )}
      </div>
    </Card>
  )
}
