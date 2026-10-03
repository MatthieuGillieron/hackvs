import * as React from "react"
import {
  BellRingIcon,
  BriefcaseIcon,
  Building2Icon,
  CalendarClockIcon,
  ExternalLinkIcon,
  InfoIcon,
  LandmarkIcon,
  LightbulbIcon,
  MailIcon,
  MapPinIcon,
  NotebookPenIcon,
  PhoneIcon,
  SparklesIcon,
  UsersIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"

import { AlertThumb, PRECISION_LABEL } from "@/components/alerts/alert-thumb"
import { TaskControl } from "@/components/alerts/task-status"
import { FamilyChip, FAMILY_DOT, LevelBadge } from "@/components/level-badge"
import { FictifBadge } from "@/components/page"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useData } from "@/lib/data"
import {
  alertTitle,
  confidence,
  daysAgo,
  FAMILY_HINT,
  FAMILY_LABEL,
  fmtDate,
  metiersLabel,
  needLabel,
  placeLabel,
  projectType,
  relativeWindow,
  shortDistrict,
  shortMetier,
  SIGNAL_TYPE_LABEL,
  sortFamilies,
  weeksRange,
} from "@/lib/format"
import { recommendations } from "@/lib/reco"
import { setTaskNote, useTasks } from "@/lib/tasks"
import type { Candidate, Family, Opportunity, Signal } from "@/lib/types"
import { cn } from "@/lib/utils"

const FAMILY_ORDER: Family[] = ["projet", "recrutement", "entreprise", "historique"]

// ------------------------------------------------------------------ chronologie

interface Step {
  key: string
  when: string
  what: string
}

// Étapes relatives à aujourd'hui (« Dans 2–4 semaines : lancement du chantier »), d'après les signaux Projet.
function timeline(o: Opportunity, today: string): Step[] {
  const steps: Step[] = [{ key: "today", when: "Aujourd'hui", what: "Alerte détectée" }]
  const seen = new Set<string>()
  const projet = o.signals
    .filter((s) => s.family === "projet" && !s.fictif && s.window[1] >= today)
    .sort((a, b) => a.window[0].localeCompare(b.window[0]))
  for (const s of projet) {
    const what =
      s.type === "permis" && s.phase
        ? `Phase ${s.phase}`
        : s.type === "adjudication"
          ? "Démarrage du chantier"
          : s.type === "appel_offres"
            ? "Travaux après adjudication"
            : (SIGNAL_TYPE_LABEL[s.type] ?? s.type)
    if (seen.has(what)) continue
    seen.add(what)
    steps.push({ key: what, when: relativeWindow(s.window, today), what: `${what} (estimé)` })
    if (steps.length >= 4) break
  }
  steps.push({ key: "need", when: weeksRange(o.window, today), what: `Pic de besoin : renfort ${needLabel(o)} personnes` })
  return steps
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative ml-1.5 space-y-3 border-l pl-5">
      {steps.map((s, i) => (
        <li key={s.key} className="relative">
          <span
            className={cn(
              "absolute top-1 -left-[26px] size-3 rounded-full border-2 border-background",
              i === 0 ? "bg-primary" : "bg-primary/30",
            )}
          />
          <div className="text-sm font-medium">{s.when}</div>
          <div className="text-xs text-muted-foreground">{s.what}</div>
        </li>
      ))}
    </ol>
  )
}

// ------------------------------------------------------------------ confiance

const FAMILY_STROKE: Record<Family, string> = {
  projet: "stroke-blue-500",
  recrutement: "stroke-violet-500",
  entreprise: "stroke-teal-500",
  historique: "stroke-muted-foreground",
}

// Anneau de 4 segments : un par famille de signaux, plein si la famille est présente. Pas de pourcentage.
function ConfidenceRing({ families }: { families: Family[] }) {
  const r = 26
  const c = 2 * Math.PI * r
  const seg = c / 4
  const gap = 4
  return (
    <svg viewBox="0 0 64 64" className="size-20 shrink-0 -rotate-90" role="img"
      aria-label={`${families.length} familles de signaux sur 4`}>
      {FAMILY_ORDER.map((f, i) => (
        <circle key={f} cx="32" cy="32" r={r} fill="none" strokeWidth="7" strokeLinecap="butt"
          strokeDasharray={`${seg - gap} ${c - seg + gap}`} strokeDashoffset={-i * seg}
          className={families.includes(f) ? FAMILY_STROKE[f] : "stroke-muted"}>
          <title>{FAMILY_LABEL[f]}{families.includes(f) ? "" : " (absent)"}</title>
        </circle>
      ))}
      <text x="32" y="32" dy="0.35em" textAnchor="middle" className="rotate-90 fill-foreground text-[13px] font-semibold"
        style={{ transformOrigin: "32px 32px" }}>
        {families.length}/4
      </text>
    </svg>
  )
}

// ------------------------------------------------------------------ blocs

function Section({ title, icon: Icon, children, aside, className }: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  aside?: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 shadow-xs", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="size-4 text-muted-foreground" />}
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function KeyValue({ label, icon: Icon, children }: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[minmax(0,140px)_1fr] gap-2 py-1 text-sm">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" /> {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function SignalRow({ s, today, compact = false }: { s: Signal; today: string; compact?: boolean }) {
  return (
    <li className="flex gap-3 py-2.5">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", FAMILY_DOT[s.family])} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {SIGNAL_TYPE_LABEL[s.type] ?? s.type}
            {s.fictif && <FictifBadge label="Simulé" />}
            {s.ia && (
              <span className="rounded border px-1 text-[10px] font-normal text-muted-foreground"
                title="Projet, ampleur et entreprise lus dans le texte officiel par un LLM">Extrait par IA</span>
            )}
          </span>
          {s.date && <span className="text-xs text-muted-foreground">{daysAgo(s.date, today)}</span>}
        </div>
        <p className={cn("text-xs text-muted-foreground", compact && "line-clamp-2")}>{s.label}</p>
        {s.preuve && !compact && (
          <p className="mt-1 border-l-2 pl-2 text-xs italic text-muted-foreground">« {s.preuve} »</p>
        )}
        {s.url && !compact && (
          <a href={s.url} target="_blank" rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Voir la source <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>
    </li>
  )
}

const STATUT_STYLE: Record<Candidate["statut"], string> = {
  disponible: "bg-emerald-500",
  "en mission": "bg-amber-500",
  ancien: "bg-muted-foreground",
  indisponible: "bg-red-500",
}

function CandidateRow({ c, district }: { c: Candidate; district: string | null }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {c.prenom[0]}
        {c.nom[0]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {c.prenom} {c.nom}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {shortMetier(c.metierLabel)} · {c.experience_ans} ans · {c.commune}
          {c.district === district ? " · même district" : ` · rayon ${c.rayon_km} km`}
        </div>
      </div>
      <div className="text-right text-xs">
        <div className="flex items-center justify-end gap-1.5">
          <span className={cn("size-2 rounded-full", STATUT_STYLE[c.statut])} />
          {c.statut}
        </div>
        <div className="text-muted-foreground">
          {c.statut === "ancien" ? "à réactiver" : c.disponible_des ? `dès le ${fmtDate(c.disponible_des)}` : ""}
        </div>
      </div>
    </li>
  )
}

const POOL_GROUPS = [
  ["disponibles", "Disponibles"],
  ["bientot", "Bientôt libres"],
  ["anciens", "Anciens intérimaires à réactiver"],
] as const

function SoonButton({ children, primary = false, reason }: { children: React.ReactNode; primary?: boolean; reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="min-w-0">
          <Button variant={primary ? "default" : "outline"} className="w-full" disabled>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}

// ------------------------------------------------------------------ onglets

function CompanyTab({ o }: { o: Opportunity }) {
  const { meta } = useData()
  if (o.kind === "zone") {
    return (
      <Section title="Entreprises probables" icon={Building2Icon}>
        {o.probable.length ? (
          <ul className="space-y-1.5">
            {o.probable.map((p) => (
              <li key={p.company} className="flex justify-between gap-3 text-sm">
                <span>{p.company}</span>
                <span className="font-medium tabular-nums">{Math.round(p.share * 100)} %</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun antécédent : cibler les clients Flexsis du district.</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Signal de zone ({shortDistrict(o.district)}). Part estimée d'après leurs adjudications et annonces dans la zone :
          indicatif, pas une attribution.
        </p>
      </Section>
    )
  }
  const r = o.registry
  const zefixSearch = `https://www.zefix.ch/fr/search/entity/list?name=${encodeURIComponent(o.company ?? o.target)}`
  const fosc = o.signals.filter((s) => s.family === "entreprise")
  return (
    <div className="space-y-4">
      <Section title="Registre du commerce" icon={LandmarkIcon}
        aside={<a href={r?.url ?? zefixSearch} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          {r ? "Extrait RC" : "Chercher sur Zefix"} <ExternalLinkIcon className="size-3" />
        </a>}>
        {r ? (
          <dl>
            <KeyValue label="Raison sociale" icon={Building2Icon}>{r.name}</KeyValue>
            {r.uid && <KeyValue label="IDE" icon={InfoIcon}><span className="tabular-nums">{r.uid}</span></KeyValue>}
            <KeyValue label="Siège" icon={MapPinIcon}>{r.address ?? r.commune ?? "—"}</KeyValue>
            {r.branches > 0 && (
              <KeyValue label="Succursales" icon={Building2Icon}>{r.branches}</KeyValue>
            )}
            {r.lastPublications.length > 0 && (
              <KeyValue label="Publications FOSC" icon={CalendarClockIcon}>
                {r.lastPublications.map((d) => fmtDate(d, { day: "numeric", month: "short", year: "numeric" })).join(" · ")}
              </KeyValue>
            )}
            {r.purpose && (
              <div className="pt-2 text-sm">
                <dt className="text-muted-foreground">But</dt>
                <dd className="mt-0.5 line-clamp-4 text-xs text-muted-foreground">{r.purpose}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune fiche Zefix rapprochée automatiquement pour « {o.target} ».</p>
        )}
      </Section>
      {fosc.length > 0 && (
        <Section title="Événements récents" icon={SparklesIcon}>
          <ul className="divide-y">
            {fosc.map((s, i) => (
              <SignalRow key={i} s={s} today={meta.today} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ panneau

export function AlertDetail({ o, onClose }: { o: Opportunity; onClose?: () => void }) {
  const { meta, candidates } = useData()
  // Le parent remonte ce composant (key = id de l'alerte) : l'onglet repart sur la vue d'ensemble.
  const [tab, setTab] = React.useState("overview")

  const conf = confidence(o)
  const steps = timeline(o, meta.today)
  const byId = React.useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])
  const pool = POOL_GROUPS.map(([k, label]) => [k, label, o.pool[k].map((id) => byId.get(id)).filter((c): c is Candidate => !!c)] as const)
  const poolSize = pool.reduce((n, [, , l]) => n + l.length, 0)
  const byFamily = FAMILY_ORDER.map((f) => [f, o.signals.filter((s) => s.family === f)] as const).filter(([, l]) => l.length)
  const main = o.signals.find((s) => !s.fictif)
  const type = projectType(o)
  const actionable = o.level !== "SURVEILLER"
  const task = useTasks()[o.key]
  const recos = recommendations(o, meta.today)

  return (
    <div className="@container flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <BellRingIcon className="size-4" /> Détail de l'alerte
        </h2>
        <div className="flex items-center gap-2">
          <TaskControl taskKey={o.key} />
          {onClose && (
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
              <XIcon />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-4 border-b p-4 pt-2">
        <AlertThumb o={o} credit className="hidden h-28 w-40 @sm:flex" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-semibold">{alertTitle(o)}</h3>
            <LevelBadge level={o.level} />
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPinIcon className="size-3.5 shrink-0" />
            {placeLabel(o)}
          </div>
          {type && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2Icon className="size-3.5 shrink-0" /> <span className="line-clamp-1">{type}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-1 pt-1">
            {sortFamilies(o.families).map((f) => (
              <FamilyChip key={f} family={f} />
            ))}
          </div>
        </div>
      </div>

      {/* Corps sur fond gris : navigation en tuile (toujours visible), contenu en tuiles qui défile. */}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0 bg-muted">
        <div className="px-4 pt-4">
          <TabsList className="grid h-11! w-full grid-cols-4 gap-1 rounded-xl border bg-card p-1 shadow-xs">
            {[
              ["overview", "Vue d'ensemble"],
              ["signals", `Signaux (${o.signals.length})`],
              ["company", o.kind === "zone" ? "Entreprises" : "Entreprise"],
              ["candidates", `Candidats (${poolSize})`],
            ].map(([v, label]) => (
              <TabsTrigger key={v} value={v}
                className="h-full! rounded-lg border-0 data-active:bg-primary/10 data-active:text-primary data-active:shadow-none!">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="overview" className="grid gap-4 @2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Section title="Informations clés" icon={BriefcaseIcon}>
              <dl>
                <KeyValue label="Métiers probables" icon={WrenchIcon}>{metiersLabel(o.metiers, 6)}</KeyValue>
                <KeyValue label="Horizon" icon={CalendarClockIcon}>
                  {weeksRange(o.window, meta.today)}
                  <div className="text-xs text-muted-foreground">{fmtDate(o.window[0])} → {fmtDate(o.window[1])}</div>
                </KeyValue>
                <KeyValue label="Région" icon={MapPinIcon}>{shortDistrict(o.district)}</KeyValue>
                <KeyValue label="Besoin estimé" icon={UsersIcon}>
                  renfort {needLabel(o)} personnes
                  {o.team[1] > 0 && (
                    <div className="text-xs text-muted-foreground">
                      équipe sur place estimée {Math.round(o.team[0])}–{Math.round(o.team[2])}
                    </div>
                  )}
                </KeyValue>
                {main && (
                  <KeyValue label="Source principale" icon={LandmarkIcon}>{SIGNAL_TYPE_LABEL[main.type] ?? main.type}</KeyValue>
                )}
                {type && <KeyValue label="Type de projet" icon={Building2Icon}><span className="line-clamp-2">{type}</span></KeyValue>}
              </dl>
            </Section>

            <Section title="Niveau de confiance">
              <div className="flex items-center gap-4">
                <ConfidenceRing families={o.families} />
                <div>
                  <div className={cn("text-sm font-semibold",
                    conf.tone === "high" ? "text-emerald-600" : conf.tone === "mid" ? "text-amber-600" : "text-muted-foreground")}>
                    Confiance {conf.label.split(" · ")[0].toLowerCase()}
                  </div>
                  <p className="text-xs text-muted-foreground">{conf.label.split(" · ")[1]}.</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1">
                {sortFamilies(o.families).map((f) => (
                  <li key={f} className="flex gap-2 text-xs text-muted-foreground">
                    <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", FAMILY_DOT[f])} />
                    <span>
                      <span className="font-medium text-foreground">{FAMILY_LABEL[f]}</span> — {FAMILY_HINT[f]}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <div className="grid gap-4 @2xl:col-span-2 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Section title="Chronologie estimée" icon={CalendarClockIcon}>
              <Timeline steps={steps} />
            </Section>

            <Section title="Recommandations" icon={LightbulbIcon} className="@2xl:row-span-1"
              aside={<span className="text-[11px] text-muted-foreground">Plan d'action suggéré</span>}>
              <ol className="space-y-2.5">
                {recos.map((r, i) => (
                  <li key={r.key} className="flex gap-3">
                    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      r.urgent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {r.title}
                          {r.fictif && <FictifBadge label="Simulé" />}
                        </span>
                        <span className={cn("text-xs", r.urgent ? "font-medium text-primary" : "text-muted-foreground")}>{r.when}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{r.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
            </div>

            {task && (
              <Section title="Ma note" icon={NotebookPenIcon} className="@2xl:col-span-2">
                <Textarea defaultValue={task.note} rows={2} placeholder="Ex. : rappeler lundi, demander le planning du gros œuvre…"
                  onBlur={(e) => e.target.value !== task.note && setTaskNote(o.key, e.target.value)} className="min-h-0 bg-background" />
              </Section>
            )}

            {o.image && o.kind === "entreprise" && (
              <p className="text-xs text-muted-foreground @2xl:col-span-2">
                Vue aérienne : {o.image.place} ({PRECISION_LABEL[o.image.precision]}), SWISSIMAGE {o.image.credit}.
              </p>
            )}
          </TabsContent>

          <TabsContent value="signals" className="space-y-4">
            {byFamily.map(([f, list]) => (
              <Section key={f} title={`${FAMILY_LABEL[f]} (${list.length})`} aside={<FamilyChip family={f} />}>
                <ul className="-my-2.5 divide-y">
                  {list.map((s, i) => (
                    <SignalRow key={i} s={s} today={meta.today} />
                  ))}
                </ul>
              </Section>
            ))}
          </TabsContent>

          <TabsContent value="company">
            <CompanyTab o={o} />
          </TabsContent>

          <TabsContent value="candidates" className="space-y-4">
            <Section title="Vivier" icon={UsersIcon} aside={<FictifBadge />}>
              <div className="grid grid-cols-2 gap-2 text-center @md:grid-cols-4">
                {[
                  ["Besoin", o.vivier.besoin],
                  ["Disponibles", o.vivier.disponibles],
                  ["Bientôt libres", o.vivier.bientot],
                  ["À sourcer", o.vivier.a_sourcer],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-muted/50 p-2">
                    <div className={cn("text-xl font-semibold tabular-nums", k === "À sourcer" && Number(v) > 0 && "text-destructive")}>
                      {v}
                    </div>
                    <div className="text-xs text-muted-foreground">{k}</div>
                  </div>
                ))}
              </div>
            </Section>
            {poolSize ? (
              pool.filter(([, , list]) => list.length).map(([k, label, list]) => (
                <Section key={k} title={`${label} (${list.length})`}>
                  <ul className="-my-2 divide-y">
                    {list.map((c) => (
                      <CandidateRow key={c.id} c={c} district={o.district} />
                    ))}
                  </ul>
                </Section>
              ))
            ) : (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Aucun candidat de ces métiers dans le vivier : à sourcer.
              </p>
            )}
          </TabsContent>
        </div>
      </Tabs>

      {/* Actions toujours visibles, au-dessus du contenu qui défile. */}
      <div className="flex flex-wrap justify-end gap-2 border-t bg-background p-4 shadow-[0_-4px_12px_-6px_rgb(0_0_0/0.12)]">
        <SoonButton reason={actionable ? "Bientôt disponible" : "Pas d'email pour une alerte SURVEILLER"}>
          <MailIcon /> Générer un email
        </SoonButton>
        <SoonButton primary reason={actionable ? "Bientôt disponible" : "Pas d'appel pour une alerte SURVEILLER"}>
          <PhoneIcon /> Préparer l'appel
        </SoonButton>
      </div>
    </div>
  )
}
