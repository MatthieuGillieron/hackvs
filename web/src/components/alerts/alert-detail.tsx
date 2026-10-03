import * as React from "react"
import {
  BriefcaseIcon,
  Building2Icon,
  CalendarClockIcon,
  ExternalLinkIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  SparklesIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"

import { FamilyChip, FAMILY_DOT, LevelBadge } from "@/components/level-badge"
import { FictifBadge } from "@/components/page"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useData } from "@/lib/data"
import {
  confidence,
  daysAgo,
  FAMILY_HINT,
  FAMILY_LABEL,
  fmtDate,
  horizonLabel,
  metiersLabel,
  needLabel,
  shortDistrict,
  shortMetier,
  SIGNAL_TYPE_LABEL,
  sortFamilies,
} from "@/lib/format"
import type { Candidate, Family, Opportunity, Signal } from "@/lib/types"
import { cn } from "@/lib/utils"

const FAMILY_ORDER: Family[] = ["projet", "recrutement", "entreprise", "historique"]

// ------------------------------------------------------------------ chronologie

interface Step {
  key: string
  date: string
  title: string
  detail: string
}

function timeline(o: Opportunity, today: string): Step[] {
  const steps: Step[] = [{ key: "today", date: today, title: "Aujourd'hui", detail: "Alerte détectée" }]
  const seen = new Set<string>()
  const projet = o.signals
    .filter((s) => s.family === "projet" && !s.fictif && s.window[1] >= today)
    .sort((a, b) => a.window[0].localeCompare(b.window[0]))
  for (const s of projet) {
    const title =
      s.type === "permis" && s.phase
        ? `Phase ${s.phase}`
        : s.type === "adjudication"
          ? "Démarrage du chantier"
          : s.type === "appel_offres"
            ? "Travaux après adjudication"
            : (SIGNAL_TYPE_LABEL[s.type] ?? s.type)
    if (seen.has(title)) continue
    seen.add(title)
    const start = s.window[0] < today ? today : s.window[0]
    steps.push({
      key: title,
      date: start,
      title,
      detail: `${fmtDate(start)} → ${fmtDate(s.window[1])} (estimé)`,
    })
    if (steps.length >= 5) break
  }
  if (steps.length === 1) {
    steps.push({
      key: "need",
      date: o.window[0],
      title: "Besoin estimé",
      detail: `${fmtDate(o.window[0])} → ${fmtDate(o.window[1])}`,
    })
  }
  return steps
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative ml-1.5 space-y-4 border-l pl-5">
      {steps.map((s, i) => (
        <li key={s.key} className="relative">
          <span
            className={cn(
              "absolute top-1 -left-[26px] size-3 rounded-full border-2 border-background",
              i === 0 ? "bg-primary" : "bg-primary/30",
            )}
          />
          <div className="text-sm font-medium">{s.title}</div>
          <div className="text-xs text-muted-foreground">{s.detail}</div>
        </li>
      ))}
    </ol>
  )
}

// ------------------------------------------------------------------ blocs

function Section({ title, icon: Icon, children, aside }: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <section className="rounded-xl border p-4">
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

function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function SignalRow({ s, today }: { s: Signal; today: string }) {
  return (
    <li className="flex gap-3 py-2.5">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", FAMILY_DOT[s.family])} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-medium">
            {SIGNAL_TYPE_LABEL[s.type] ?? s.type}
            {s.fictif && <FictifBadge label="Simulé" />}
          </span>
          {s.date && <span className="text-xs text-muted-foreground">{daysAgo(s.date, today)}</span>}
        </div>
        <p className="text-sm text-muted-foreground">{s.label}</p>
        {s.url && (
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Voir la source <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>
    </li>
  )
}

function matchingCandidates(o: Opportunity, cands: Candidate[]): Candidate[] {
  const wanted = new Set(o.metiers)
  return cands
    .filter((c) => wanted.has(c.metierLabel) && (c.statut === "disponible" || c.statut === "en mission" || c.statut === "ancien"))
    .map((c) => ({
      c,
      rank:
        (c.district === o.district ? 0 : 10) +
        (c.statut === "disponible" ? 0 : c.statut === "en mission" ? 1 : 2),
    }))
    .sort((a, b) => a.rank - b.rank || (a.c.disponible_des ?? "9").localeCompare(b.c.disponible_des ?? "9"))
    .slice(0, 8)
    .map((x) => x.c)
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
          {shortMetier(c.metierLabel)} · {c.commune}
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

function SoonButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex-1">
          <Button variant="outline" className="w-full" disabled>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{disabled ? "Pas d'action pour une alerte SURVEILLER" : "Bientôt disponible"}</TooltipContent>
    </Tooltip>
  )
}

// ------------------------------------------------------------------ panneau

export function AlertDetail({ o, onClose }: { o: Opportunity; onClose?: () => void }) {
  const { meta, candidates } = useData()
  // Le parent remonte ce composant (key = id de l'alerte) : l'onglet repart sur la vue d'ensemble.
  const [tab, setTab] = React.useState("overview")

  const conf = confidence(o)
  const steps = timeline(o, meta.today)
  const matches = matchingCandidates(o, candidates)
  const byFamily = FAMILY_ORDER.map((f) => [f, o.signals.filter((s) => s.family === f)] as const).filter(([, l]) => l.length)
  const main = o.signals.find((s) => !s.fictif)
  const Icon = o.kind === "entreprise" ? Building2Icon : MapPinIcon

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b p-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{o.target}</h2>
            <LevelBadge level={o.level} />
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPinIcon className="size-3.5" /> {shortDistrict(o.district)}
            </span>
            <span className="flex items-center gap-1">
              <CalendarClockIcon className="size-3.5" /> {horizonLabel(o)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {sortFamilies(o.families).map((f) => (
              <FamilyChip key={f} family={f} />
            ))}
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
            <XIcon />
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList variant="line" className="w-full justify-start border-b px-4">
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="signals">Signaux ({o.signals.length})</TabsTrigger>
          <TabsTrigger value="candidates">Candidats ({matches.length})</TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="overview" className="space-y-4">
            <div className="space-y-4">
              <Section title="Informations clés" icon={BriefcaseIcon}>
                <dl>
                  <KeyValue label="Métiers probables">{metiersLabel(o.metiers, 8)}</KeyValue>
                  <KeyValue label="Horizon">
                    {horizonLabel(o)} <span className="text-muted-foreground">({fmtDate(o.window[0])} → {fmtDate(o.window[1])})</span>
                  </KeyValue>
                  <KeyValue label="Région">{shortDistrict(o.district)}</KeyValue>
                  <KeyValue label="Besoin estimé">
                    renfort {needLabel(o)} <span className="text-muted-foreground">(≈ {o.need[1]})</span>
                    {o.team[1] > 0 && (
                      <div className="text-xs text-muted-foreground">
                        équipe sur place estimée {Math.round(o.team[0])}–{Math.round(o.team[2])}
                      </div>
                    )}
                  </KeyValue>
                  {main && <KeyValue label="Source principale">{SIGNAL_TYPE_LABEL[main.type] ?? main.type}</KeyValue>}
                </dl>
              </Section>
              <Section title="Confiance">
                <div
                  className={cn(
                    "text-sm font-semibold",
                    conf.tone === "high" ? "text-emerald-600" : conf.tone === "mid" ? "text-amber-600" : "text-muted-foreground",
                  )}
                >
                  {conf.label.split(" · ")[0]}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{conf.label.split(" · ")[1]}.</p>
                <ul className="mt-2 space-y-1">
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
            </div>

            <div className="space-y-4">
              <Section title="Signaux détectés" icon={SparklesIcon} aside={
                <button className="text-xs text-primary hover:underline" onClick={() => setTab("signals")}>Voir tout</button>
              }>
                <ul className="divide-y">
                  {o.signals.slice(0, 3).map((s, i) => (
                    <SignalRow key={i} s={s} today={meta.today} />
                  ))}
                </ul>
              </Section>
              <Section title="Chronologie estimée" icon={CalendarClockIcon}>
                <Timeline steps={steps} />
              </Section>
            </div>

            {o.kind === "zone" && (
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
                <p className="mt-2 text-xs text-muted-foreground">
                  Part estimée d'après leurs adjudications et annonces dans la zone. Indicatif, pas une attribution.
                </p>
              </Section>
            )}
          </TabsContent>

          <TabsContent value="signals" className="space-y-4">
            {byFamily.map(([f, list]) => (
              <Section key={f} title={`${FAMILY_LABEL[f]} (${list.length})`} aside={<FamilyChip family={f} />}>
                <ul className="divide-y">
                  {list.map((s, i) => (
                    <SignalRow key={i} s={s} today={meta.today} />
                  ))}
                </ul>
              </Section>
            ))}
          </TabsContent>

          <TabsContent value="candidates" className="space-y-4">
            <Section title="Vivier" icon={UsersIcon} aside={<FictifBadge />}>
              <div className="grid grid-cols-4 gap-2 text-center">
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
            <Section title="Candidats compatibles">
              {matches.length ? (
                <ul className="divide-y">
                  {matches.map((c) => (
                    <CandidateRow key={c.id} c={c} district={o.district} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun candidat de ce métier dans le vivier : à sourcer.</p>
              )}
            </Section>
          </TabsContent>
        </div>
      </Tabs>

      <div className="space-y-3 border-t p-4">
        <p className="text-sm">
          <span className="font-semibold">Action recommandée : </span>
          {o.action}
        </p>
        <div className="flex flex-wrap gap-2">
          <SoonButton disabled={o.level === "SURVEILLER"}>
            <PhoneIcon /> Préparer l'appel
          </SoonButton>
          <SoonButton disabled={o.level === "SURVEILLER"}>
            <MailIcon /> Générer un email
          </SoonButton>
          <Button className="flex-1" onClick={() => setTab("candidates")}>
            <UsersIcon /> Candidats compatibles
          </Button>
        </div>
      </div>
    </div>
  )
}
