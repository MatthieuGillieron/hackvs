import * as React from "react"
import {
  ActivityIcon,
  BriefcaseIcon,
  Building2Icon,
  CalendarClockIcon,
  ExternalLinkIcon,
  InfoIcon,
  LandmarkIcon,
  LayoutGridIcon,
  MailIcon,
  MapPinIcon,
  NotebookPenIcon,
  PhoneIcon,
  SparklesIcon,
  UsersIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"

import { AlertThumb } from "@/components/alerts/alert-thumb"
import { AlertTimeline } from "@/components/alerts/alert-timeline"
import { CandidateMatcher } from "@/components/alerts/candidate-matcher"
import { CompanyHistory } from "@/components/alerts/company-history"
import { SignalBoard } from "@/components/alerts/signal-board"
import { TaskControl } from "@/components/alerts/task-status"
import { FAMILY_DOT, LevelBadge } from "@/components/level-badge"
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
  shortDistrict,
  SIGNAL_TYPE_LABEL,
  sortFamilies,
  weeksRange,
} from "@/lib/format"
import { CallSheet } from "@/components/alerts/call-sheet"
import { EmailButton } from "@/components/alerts/email-dialog"
import { matchCandidates } from "@/lib/match"
import { setTaskNote, useTasks } from "@/lib/tasks"
import type { Family, Opportunity } from "@/lib/types"
import { cn } from "@/lib/utils"

// Modal d'une alerte. Règle : tout le contenu tient à l'écran sans défiler (les listes longues défilent dans
// leur tuile) ; seul l'onglet Candidats défile. Accent = couleur primaire (orange, comme « Préparer l'appel »).

const FAMILY_ORDER: Family[] = ["projet", "recrutement", "entreprise", "historique"]

// ------------------------------------------------------------------ confiance

const FAMILY_STROKE: Record<Family, string> = {
  projet: "stroke-blue-500",
  recrutement: "stroke-violet-500",
  entreprise: "stroke-teal-500",
  historique: "stroke-muted-foreground",
}

// Recherche Zefix quand l'entreprise n'a pas été rapprochée d'une fiche du registre.
function zefixSearchUrl(o: Opportunity) {
  return `https://www.zefix.ch/fr/search/entity/list?name=${encodeURIComponent(o.company ?? o.target)}`
}

// Anneau de 4 segments : un par famille de signaux, plein si la famille est présente. Pas de pourcentage.
function ConfidenceRing({ families }: { families: Family[] }) {
  const r = 26
  const c = 2 * Math.PI * r
  const seg = c / 4
  const gap = 4
  return (
    <svg viewBox="0 0 64 64" className="size-14 shrink-0 -rotate-90" role="img"
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
    <section className={cn("flex min-h-0 flex-col rounded-xl border bg-card p-4 shadow-xs tall:p-5", className)}>
      <div className="mb-2.5 flex tall:mb-3 items-center justify-between gap-2">
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

// Repère de la Vue d'ensemble : libellé au-dessus, valeur, précision éventuelle.
function KeyValue({ label, icon: Icon, sub, children }: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" /> {label}
      </dt>
      <dd className="mt-0.5 line-clamp-2 text-sm font-medium">{children}</dd>
      {sub && <dd className="truncate text-xs text-muted-foreground">{sub}</dd>}
    </div>
  )
}

// Libellé au-dessus de la valeur (onglet Entreprise, plus aéré qu'un tableau à deux colonnes).
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

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

function Overview({ o }: { o: Opportunity }) {
  const { meta } = useData()
  const conf = confidence(o)
  const main = o.signals.find((s) => !s.fictif)
  const task = useTasks()[o.key]
  return (
    <div className="grid min-h-full gap-3 tall:gap-4 @2xl:grid-rows-[auto_minmax(10rem,1fr)] @2xl:grid-cols-2">
      <Section title="Informations clés" icon={BriefcaseIcon}>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 tall:gap-y-5">
          <KeyValue label="Métiers probables" icon={WrenchIcon}>{metiersLabel(o.metiers, 4)}</KeyValue>
          <KeyValue label="Horizon" icon={CalendarClockIcon}
            sub={`${fmtDate(o.window[0])} → ${fmtDate(o.window[1])}`}>{weeksRange(o.window, meta.today)}</KeyValue>
          <KeyValue label="Besoin estimé" icon={UsersIcon}
            sub={o.team[1] > 0 ? `équipe sur place estimée ${Math.round(o.team[0])}–${Math.round(o.team[2])}` : undefined}>
            renfort {needLabel(o)} personne{o.need[2] > 1 ? "s" : ""}
          </KeyValue>
          {main && (
            <KeyValue label="Source principale" icon={LandmarkIcon}>{SIGNAL_TYPE_LABEL[main.type] ?? main.type}</KeyValue>
          )}
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
        <ul className="mt-2 space-y-0.5 tall:mt-3 tall:space-y-1">
          {sortFamilies(o.families).map((f) => (
            <li key={f} className="flex min-w-0 gap-2 text-xs text-muted-foreground">
              <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", FAMILY_DOT[f])} />
              <span>
                <span className="font-medium text-foreground">{FAMILY_LABEL[f]}</span> — {FAMILY_HINT[f]}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* La chronologie prend toute la hauteur restante ; la note éventuelle se range à côté. */}
      <div className={cn("grid min-h-0 gap-3 tall:gap-4 @2xl:col-span-2", task && "@2xl:grid-cols-[minmax(0,1fr)_16rem]")}>
        <Section title="Chronologie estimée" icon={CalendarClockIcon}
          aside={<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-2.5 rounded-[3px] bg-primary" /> Candidats adéquats libres par semaine (simulé)
          </span>}>
          <div className="min-h-0 flex-1">
            <AlertTimeline o={o} today={meta.today} />
          </div>
        </Section>
        {task && (
          <Section title="Ma note" icon={NotebookPenIcon}>
            <Textarea defaultValue={task.note} placeholder="Ex. : rappeler lundi, demander le planning du gros œuvre…"
              onBlur={(e) => e.target.value !== task.note && setTaskNote(o.key, e.target.value)}
              className="min-h-0 flex-1 resize-none bg-background" />
          </Section>
        )}
      </div>
    </div>
  )
}

function CompanyTab({ o }: { o: Opportunity }) {
  const { meta } = useData()
  if (o.kind === "zone") {
    const max = Math.max(0.01, ...o.probable.map((p) => p.share))
    return (
      <div className="grid min-h-full gap-4 @3xl:h-full @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] @3xl:grid-rows-[minmax(0,1fr)]">
        <Section title="Entreprises probables" icon={Building2Icon}>
          {o.probable.length ? (
            <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {o.probable.map((p) => (
                <li key={p.company} className="space-y-1">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="truncate">{p.company}</span>
                    <span className="font-medium tabular-nums">{Math.round(p.share * 100)} %</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(p.share / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun antécédent : cibler les clients Flexsis du district.</p>
          )}
        </Section>
        <Section title="Comment lire ces parts" icon={InfoIcon}>
          <p className="text-sm text-muted-foreground">
            Signal de zone ({shortDistrict(o.district)}) : aucune entreprise n'est encore nommée. La part estimée vient de
            leurs adjudications et annonces récentes dans la zone.
          </p>
          <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Indicatif, pas une attribution : la part ne compte jamais comme une famille de signaux.
          </p>
        </Section>
      </div>
    )
  }
  const r = o.registry
  const fosc = o.signals.filter((s) => s.family === "entreprise")
  return (
    <div className="grid min-h-full gap-4 @3xl:h-full @3xl:grid-cols-2 @3xl:grid-rows-[minmax(0,1fr)]">
      <CompanyHistory company={o.company} />
      <div className="flex min-h-0 flex-col gap-4">
        <Section title="Registre du commerce" icon={LandmarkIcon}
          aside={<a href={r?.url ?? zefixSearchUrl(o)} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {r ? "Extrait RC" : "Chercher sur Zefix"} <ExternalLinkIcon className="size-3" />
          </a>}>
          {r ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Raison sociale" className="col-span-2">{r.name}</Field>
              {r.uid && <Field label="IDE"><span className="tabular-nums">{r.uid}</span></Field>}
              <Field label="Siège">{r.address ?? r.commune ?? "—"}</Field>
              {r.branches > 0 && <Field label="Succursales">{r.branches}</Field>}
              {r.lastPublications.length > 0 && (
                <Field label="Publications FOSC">
                  {r.lastPublications.slice(0, 3).map((d) => fmtDate(d, { day: "numeric", month: "short", year: "numeric" })).join(" · ")}
                </Field>
              )}
              {r.purpose && (
                <Field label="But" className="col-span-2">
                  <span className="line-clamp-3 text-xs text-muted-foreground" title={r.purpose}>{r.purpose}</span>
                </Field>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune fiche Zefix rapprochée automatiquement pour « {o.target} ».</p>
          )}
        </Section>
        <Section title="Événements récents" icon={SparklesIcon} className="flex-1">
          {fosc.length ? (
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
              {fosc.map((s, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{s.detail?.titre ?? s.label}</p>
                    <p className="text-xs text-muted-foreground">{daysAgo(s.date, meta.today)}</p>
                  </div>
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
                      FOSC <ExternalLinkIcon className="size-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune publication FOSC récente (capital, fusion, succursale) pour cette entreprise.
            </p>
          )}
        </Section>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ panneau

export function AlertDetail({ o, onClose }: { o: Opportunity; onClose?: () => void }) {
  const { meta, candidates, missions } = useData()
  // Le parent remonte ce composant (key = id de l'alerte) : l'onglet repart sur la vue d'ensemble.
  const [tab, setTabState] = React.useState("overview")
  const scrollRef = React.useRef<HTMLDivElement>(null)
  // Chaque onglet s'ouvre en haut (la zone de défilement est partagée entre onglets).
  const setTab = (v: string) => {
    setTabState(v)
    scrollRef.current?.scrollTo({ top: 0 })
  }

  const nCandidates = React.useMemo(
    () => matchCandidates(o, candidates, missions).filter((m) => m.availableFor).length,
    [o, candidates, missions],
  )
  const type = projectType(o)
  const actionable = o.level !== "SURVEILLER"
  // « Préparer l'appel » remplace le détail dans le même modal (bouton retour).
  const [view, setView] = React.useState<"detail" | "appel">("detail")

  if (view === "appel") return <CallSheet o={o} onBack={() => setView("detail")} onClose={onClose} />

  const tabs = [
    { v: "overview", label: "Vue d'ensemble", icon: LayoutGridIcon },
    { v: "signals", label: `Signaux (${o.signals.length})`, icon: ActivityIcon },
    { v: "company", label: o.kind === "zone" ? "Entreprises" : "Entreprise", icon: Building2Icon },
    { v: "candidates", label: `Candidats (${nCandidates})`, icon: UsersIcon },
  ]

  return (
    <div className="@container flex h-full flex-col">
      {/* En-tête compact : vignette, titre + niveau, lieu · projet · registre, suivi + fermer. */}
      <div className="flex items-center gap-4 px-5 py-2.5 tall:py-3">
        <AlertThumb o={o} credit className="hidden h-14 w-24 @sm:flex tall:h-16 tall:w-28" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-semibold">{alertTitle(o)}</h3>
            <LevelBadge level={o.level} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPinIcon className="size-3.5 shrink-0" /> {placeLabel(o)}
            </span>
            {type && (
              <span className="flex min-w-0 items-center gap-1.5">
                <Building2Icon className="size-3.5 shrink-0" /> <span className="line-clamp-1">{type}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TaskControl taskKey={o.key} />
          {onClose && (
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
              <XIcon />
            </Button>
          )}
        </div>
      </div>

      {/* Onglets soulignés (comme « Préparer l'appel »), puis corps gris à tuiles blanches. */}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="h-auto! w-full justify-start gap-1 rounded-none border-b bg-transparent p-0 px-5">
          {tabs.map((t) => (
            <TabsTrigger key={t.v} value={t.v}
              className="-mb-px h-auto! flex-none rounded-none border-0 border-b-2 border-transparent px-3 py-1.5 tall:py-2 data-active:border-primary data-active:bg-transparent! data-active:text-primary data-active:shadow-none! dark:data-active:border-primary">
              <t.icon /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-muted p-3 tall:p-4">
          <TabsContent value="overview" className="h-full">
            <Overview o={o} />
          </TabsContent>
          <TabsContent value="signals" className="@3xl:h-full">
            <SignalBoard o={o} today={meta.today} />
          </TabsContent>
          <TabsContent value="company" className="h-full">
            <CompanyTab o={o} />
          </TabsContent>
          <TabsContent value="candidates">
            <CandidateMatcher o={o} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Actions toujours visibles, au-dessus du contenu. */}
      <div className="flex flex-wrap justify-end gap-2 border-t bg-background px-5 py-3 shadow-[0_-4px_12px_-6px_rgb(0_0_0/0.12)]">
        {actionable && o.kind === "entreprise" ? (
          <EmailButton o={o} />
        ) : (
          <SoonButton reason={actionable ? "Pas de destinataire pour une zone" : "Pas d'email pour une alerte en veille"}>
            <MailIcon /> Générer un email
          </SoonButton>
        )}
        {actionable && (o.kind === "entreprise" || o.probable.length > 0) ? (
          <Button onClick={() => setView("appel")}>
            <PhoneIcon /> Préparer l'appel
          </Button>
        ) : (
          <SoonButton primary reason={actionable ? "Aucune entreprise probable dans cette zone" : "Pas d'appel pour une alerte en veille"}>
            <PhoneIcon /> Préparer l'appel
          </SoonButton>
        )}
      </div>
    </div>
  )
}
