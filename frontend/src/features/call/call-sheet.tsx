import * as React from "react"
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  ClockIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  HandshakeIcon,
  InfoIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  SendIcon,
  SparklesIcon,
  StarIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"

import { AlertAvatar } from "@/features/alerts/alert-thumb"
import { CandidateCard } from "@/features/candidates/candidate-card"
import { CandidateDetail } from "@/features/candidates/candidate-detail"
import { FAMILY_DOT, LevelBadge } from "@/components/level-badge"
import { FictifBadge } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useData } from "@/lib/data"
import { alertTitle, daysAgo, fmtDate, LEVEL_ORDER, placeLabel, shortReasons, weeksRange } from "@/lib/format"
import { CALL_OUTCOME_LABEL, logCall, useTasks, type CallOutcome } from "@/features/tasks/tasks"
import { candidateHistory, type CandidateHistory } from "@/lib/history"
import type { Opportunity, Signal } from "@/lib/types"
import { cn } from "@/lib/utils"

// Fiche « Préparer l'appel », affichée à la place du détail d'alerte (même modal, bouton retour).
// Données pré-générées à l'export (engine/llm/calls.py -> calls.json) : faits + guide rédigé par LLM.

interface Relation {
  depuis: string
  missions_12m: number
  missions_total: number
  note_moyenne: number | null
  dernier_contact: { date: string; type: string; objet: string; resultat: string } | null
  demandes_non_pourvues: { date: string; metier: string; postes: number; pourvus: number; perdu_face_a: string | null }[]
}

interface ACall {
  entreprise: string
  part: number | null
  client: boolean
  contact: { nom: string; fonction: string; telephone: string } | null
  relation: Relation | null
}

interface Sheet {
  faits: { type: "entreprise" | "zone"; a_appeler: ACall[]; profils_prets: { id: string; atouts: string[] }[] }
  guide: {
    objectif: string
    duree_min: number
    accroche: string
    demander: string
    questions: { question: string; pourquoi: string; a_noter: string }[]
    objections: { objection: string; reponse: string }[]
    annonce_profils: string
    pitch_profils: { id: string; pitch: string }[]
    prochaine_etape: string
    email_profils: { objet: string; corps: string }
  }
}

let callsPromise: Promise<Record<string, Sheet>> | null = null
function loadCalls() {
  callsPromise ??= fetch("/data/calls.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  return callsPromise
}

// Même ordre que le Dashboard et la page Alertes.
const byPriority = (a: Opportunity, b: Opportunity) =>
  LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.weeks - b.weeks || b.need[1] - a.need[1] || a.id - b.id

const ACCENT = "text-orange-600 dark:text-orange-400"
const RESULT_STYLE: Record<string, string> = {
  positif: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  "besoin identifié": "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  "à relancer": "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  neutre: "bg-muted text-muted-foreground",
  "pas de besoin": "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
// « 4 plâtriers », « 1 grutier » (métier au pluriel, sans toucher aux mots déjà en -s / -x)
const nMetier = (n: number, m: string) => `${n} ${m.toLowerCase()}${n > 1 && !/[sx]$/.test(m) ? "s" : ""}`

function useCopy() {
  const [done, setDone] = React.useState<string | null>(null)
  const copy = (id: string, text: string) =>
    void navigator.clipboard.writeText(text).then(() => {
      setDone(id)
      setTimeout(() => setDone(null), 1500)
    })
  return { done, copy }
}

function CopyButton({ id, text, c, className }: { id: string; text: string; c: ReturnType<typeof useCopy>; className?: string }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Copier" title="Copier" className={className}
      onClick={() => c.copy(id, text)}>
      {c.done === id ? <CheckIcon className="text-emerald-600" /> : <CopyIcon />}
    </Button>
  )
}

// Hors du modal d'alerte (Dashboard) : la même fiche dans une fenêtre au format du modal d'alerte.
export function CallButton({ o }: { o: Opportunity }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PhoneIcon /> Préparer l'appel
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}
        className="flex h-[min(88svh,900px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogTitle className="sr-only">Préparer l'appel · {alertTitle(o)}</DialogTitle>
        <DialogDescription className="sr-only">Guide d'appel, profils à proposer et compte-rendu</DialogDescription>
        {open && <CallSheet o={o} onBack={() => setOpen(false)} backLabel="Fermer" />}
      </DialogContent>
    </Dialog>
  )
}

export function CallSheet({ o, onBack, onClose, backLabel = "Retour à l'alerte" }: {
  o: Opportunity
  onBack: () => void
  onClose?: () => void
  backLabel?: string
}) {
  const [sheet, setSheet] = React.useState<Sheet | null | undefined>(undefined)
  const [who, setWho] = React.useState(0) // entreprise sélectionnée (une zone en liste plusieurs)
  const [tab, setTab] = React.useState<"guide" | "profils" | "cr">("guide")

  React.useEffect(() => {
    let alive = true
    void loadCalls().then((all) => alive && setSheet(all[o.key] ?? null))
    return () => {
      alive = false
    }
  }, [o.key])

  const TABS = [
    { id: "guide", label: "Guide d'appel", icon: PhoneIcon },
    { id: "profils", label: "Profils à proposer", icon: UsersIcon },
    { id: "cr", label: "Compte-rendu", icon: FileTextIcon },
  ] as const

  return (
    <div className="flex h-full flex-col">

      {!sheet && (
        <div className="flex justify-end p-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeftIcon /> {backLabel}</Button>
        </div>
      )}
      {sheet === undefined && <p className="m-auto text-sm text-muted-foreground">Chargement…</p>}
      {sheet === null && (
        <p className="m-auto text-sm text-muted-foreground">
          Pas de fiche d'appel pour cette alerte. Lancez <code>python3 -m engine build</code>.
        </p>
      )}
      {sheet && (
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:overflow-hidden">
          <aside className="space-y-3 border-r bg-muted/40 p-4 md:overflow-y-auto">
            <Header o={o} />
            <Need o={o} />
            <WhyNow o={o} />
            {sheet.faits.a_appeler.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Entreprises probables de la zone :</p>
                <div className="flex flex-wrap gap-1.5">
                  {sheet.faits.a_appeler.map((a, i) => (
                    <button key={a.entreprise} type="button" onClick={() => setWho(i)}
                      className={cn("rounded-full border bg-background px-2.5 py-0.5 text-xs",
                        i === who && "border-orange-400 bg-orange-50 text-orange-800 dark:bg-orange-500/10 dark:text-orange-200")}>
                      {a.entreprise}{a.part != null && ` · ${Math.round(a.part * 100)} %`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <RelationCard a={sheet.faits.a_appeler[who]} />
            <ContactCard a={sheet.faits.a_appeler[who]} demander={sheet.guide.demander} />
          </aside>

          <div className="flex min-h-0 flex-col md:overflow-hidden">
            <div className="flex items-center gap-1 border-b px-3 pt-2">
              {TABS.map((t) => (
                <button key={t.id} type="button" onClick={() => setTab(t.id)}
                  className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm whitespace-nowrap",
                    tab === t.id ? cn("border-orange-500 font-medium", ACCENT) : "border-transparent text-muted-foreground hover:text-foreground")}>
                  <t.icon className="size-4 shrink-0" /> {t.label}
                </button>
              ))}
              <div className="ml-auto flex shrink-0 items-center gap-0.5 pb-1">
                <Button variant="ghost" size="sm" onClick={onBack} title={backLabel}>
                  {onClose ? <ArrowLeftIcon /> : <XIcon />} <span className="hidden 2xl:inline">{backLabel}</span>
                </Button>
                {onClose && (
                  <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
                    <XIcon />
                  </Button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 p-4 md:overflow-y-auto">
              {tab === "guide" && <Guide sheet={sheet} />}
              {tab === "profils" && <Profiles sheet={sheet} />}
              {tab === "cr" && <Report oKey={o.key} companies={sheet.faits.a_appeler.map((a) => a.entreprise)} who={who} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ colonne gauche

function Card({ title, icon: Icon, children, className }: {
  title?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("rounded-xl border bg-background p-3.5", className)}>
      {title && (
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="size-4 text-muted-foreground" />} {title}
        </h3>
      )}
      {children}
    </section>
  )
}

function Header({ o }: { o: Opportunity }) {
  const { opportunities, clients, meta } = useData()
  const rank = React.useMemo(
    () => opportunities.filter((x) => x.level === "AGIR").sort(byPriority).findIndex((x) => x.key === o.key),
    [opportunities, o.key],
  )
  const sector = o.company ? clients.find((c) => c.name === o.company)?.sector : null
  const phases = [...new Set(o.signals.map((s) => s.phase).filter((p): p is string => !!p))]
  const tags = [...(sector ? [cap(sector)] : []), ...phases.map(cap)].slice(0, 3)
  return (
    <div className="flex gap-3 pb-1">
      <AlertAvatar o={o} className="size-20" />
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <LevelBadge level={o.level} />
          {rank >= 0 && rank < 3 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              <TrophyIcon className="size-3" /> #{rank + 1} priorité
            </span>
          )}
        </div>
        <h2 className="text-lg leading-tight font-semibold">{alertTitle(o)}</h2>
        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><MapPinIcon className="size-3" /> {placeLabel(o)}</span>
          <span className="flex items-center gap-1"><CalendarIcon className="size-3" /> {weeksRange(o.window, meta.today)}</span>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {tags.map((t) => <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{t}</span>)}
          </div>
        )}
      </div>
    </div>
  )
}

function Need({ o }: { o: Opportunity }) {
  const ms = o.metiers.map((m) => m.split(" / ")[0])
  return (
    <Card className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><UsersIcon className="size-5" /></div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Besoin estimé</p>
        <p className="text-xl leading-tight font-semibold">{o.need[0]} – {o.need[2]} personnes</p>
        <p className="truncate text-xs text-muted-foreground">
          {ms.slice(0, 3).join(" · ")}{ms.length > 3 && ` +${ms.length - 3}`}
        </p>
      </div>
    </Card>
  )
}

// Signaux regroupés par type (« 2 adjudications SIMAP »), du plus récent au plus ancien.
function WhyNow({ o }: { o: Opportunity }) {
  const { meta } = useData()
  const [all, setAll] = React.useState(false)
  const groups = React.useMemo(() => {
    const byType = new Map<string, Signal[]>()
    for (const s of o.signals) byType.set(s.type, [...(byType.get(s.type) ?? []), s])
    return [...byType.values()]
      .map((list) => {
        const sorted = [...list].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        return { label: shortReasons(list, 1)[0], latest: sorted[0], n: list.length }
      })
      .sort((a, b) => (b.latest.date ?? "").localeCompare(a.latest.date ?? ""))
  }, [o.signals])
  const shown = all ? groups : groups.slice(0, 3)
  const hidden = groups.slice(3).reduce((n, g) => n + g.n, 0)
  return (
    <Card title="Pourquoi maintenant ?" icon={ClipboardListIcon}>
      <ul className="space-y-2">
        {shown.map((g) => (
          <li key={g.label} className="flex gap-2.5 text-sm">
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", FAMILY_DOT[g.latest.family])} />
            <span className="min-w-0 flex-1">
              {g.label}
              {g.latest.fictif && !/simulé/i.test(g.label) && <FictifBadge label="Simulé" />}
            </span>
            <span className="flex shrink-0 items-start gap-1 text-xs text-muted-foreground">
              {daysAgo(g.latest.date, meta.today)}
              {g.latest.url && (
                <a href={g.latest.url} target="_blank" rel="noreferrer" aria-label="Voir la source" className="hover:text-foreground">
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => setAll((v) => !v)}>
          {all ? "Réduire" : `+${hidden} autre${hidden > 1 ? "s" : ""} signal${hidden > 1 ? "aux" : ""}`}
        </Button>
      )}
    </Card>
  )
}

function Row({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 py-1 text-sm">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

function RelationCard({ a }: { a: ACall }) {
  const [open, setOpen] = React.useState(false)
  const r = a.relation
  if (!r) {
    return (
      <Card title="Relation Flexsis" icon={HandshakeIcon}>
        <p className="text-sm text-muted-foreground">Prospect : aucune mission avec Flexsis à ce jour.</p>
      </Card>
    )
  }
  const d = r.demandes_non_pourvues
  return (
    <Card title={<>Relation Flexsis <FictifBadge label="Simulé" /></>} icon={HandshakeIcon}>
      <Row icon={UsersIcon} label="Missions (12 derniers mois)"><b>{r.missions_12m}</b></Row>
      {r.note_moyenne != null && <Row icon={StarIcon} label="Note client"><b>{r.note_moyenne.toLocaleString("fr-CH")} / 5</b></Row>}
      {r.dernier_contact && (
        <Row icon={ClockIcon} label="Dernier contact">
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{fmtDate(r.dernier_contact.date, { day: "numeric", month: "short", year: "numeric" })}</span>
            <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", RESULT_STYLE[r.dernier_contact.resultat] ?? RESULT_STYLE.neutre)}
              title={`${r.dernier_contact.type} — ${r.dernier_contact.objet}`}>
              {cap(r.dernier_contact.resultat)}
            </span>
          </span>
        </Row>
      )}
      {d.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left">
            <Row icon={InfoIcon} label="Demandes non pourvues">
              <span className="flex items-center gap-1 text-xs">
                {nMetier(d[0].postes, d[0].metier)} ({fmtDate(d[0].date, { month: "short", year: "numeric" })})
                <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
              </span>
            </Row>
          </button>
          {open && (
            <ul className="mt-1 space-y-0.5 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              {d.map((x, i) => (
                <li key={i}>
                  {fmtDate(x.date, { month: "short", year: "numeric" })} : {nMetier(x.postes, x.metier)} demandés, {x.pourvus} pourvu
                  {x.pourvus > 1 ? "s" : ""}{x.perdu_face_a && ` — perdu face à ${x.perdu_face_a}`}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}

function ContactCard({ a, demander }: { a: ACall; demander: string }) {
  const c = useCopy()
  return (
    <Card className="flex gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><PhoneIcon className="size-5" /></div>
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="font-semibold">
          Contact à appeler {a.contact && <span className="font-normal text-muted-foreground">(simulé)</span>}
        </p>
        {a.contact ? (
          <>
            <p className="flex items-center gap-2"><UserIcon className="size-3.5 text-muted-foreground" /> {a.contact.nom}</p>
            <p className="pl-5.5 text-xs text-muted-foreground">{a.contact.fonction}</p>
            <p className="flex items-center gap-2">
              <PhoneIcon className="size-3.5 text-muted-foreground" />
              <a href={`tel:${a.contact.telephone.replace(/\s/g, "")}`} className="tabular-nums hover:underline">{a.contact.telephone}</a>
              <span className="text-xs text-muted-foreground">(simulé)</span>
              <CopyButton id="tel" text={a.contact.telephone} c={c} className="size-6" />
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">{a.entreprise} : interlocuteur à identifier.</p>
        )}
        <p className="flex gap-2 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" /> {a.contact ? "Sinon, à demander au standard : " : "À demander au standard : "}
          {demander}
        </p>
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ onglet Guide

function Step({ n, title, last = false, children }: { n: number; title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative flex gap-3">
      {!last && <span className="absolute top-8 bottom-0 left-[15px] w-px bg-orange-200 dark:bg-orange-500/30" />}
      <span className={cn("z-[1] flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-orange-400 bg-background text-sm font-semibold", ACCENT)}>
        {n}
      </span>
      <div className="min-w-0 flex-1 pb-6">
        <h3 className="mb-2 pt-1 font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function Guide({ sheet }: { sheet: Sheet }) {
  const g = sheet.guide
  const c = useCopy()
  const { candidates } = useData()
  const [q, setQ] = React.useState<number | null>(null)
  const [peek, setPeek] = React.useState<string | null>(null)
  const [mail, setMail] = React.useState(false)
  const name = (id: string) => {
    const x = candidates.find((k) => k.id === id)
    return x ? { label: `${x.prenom} ${x.nom}`, metier: x.metierLabel.split(" / ")[0] } : null
  }
  const listing = g.pitch_profils.map((p) => `• ${p.pitch}`).join("\n")
  const mailto = `mailto:?subject=${encodeURIComponent(g.email_profils.objet)}&body=${encodeURIComponent(g.email_profils.corps)}`
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl bg-orange-50 p-4 dark:bg-orange-500/10">
        <SparklesIcon className={cn("mt-0.5 size-5 shrink-0", ACCENT)} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Objectif de l'appel</p>
          <p className="text-sm text-muted-foreground">{g.objectif}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs">
          <ClockIcon className="size-3.5" /> ~ {g.duree_min} min
        </span>
      </div>

      <div>
        <Step n={1} title="Accroche">
          <div className="relative rounded-lg bg-muted/60 p-3 pr-10 text-sm leading-relaxed">
            {g.accroche}
            <CopyButton id="accroche" text={g.accroche} c={c} className="absolute top-2 right-2" />
          </div>
        </Step>
        <Step n={2} title="Vos profils prêts">
          <p className="mb-2 text-sm">{g.annonce_profils}</p>
          <ul className="space-y-1.5">
            {g.pitch_profils.map((p) => {
              const n = name(p.id)
              return (
                <li key={p.id} className="flex gap-2 rounded-lg border p-2.5 text-sm">
                  <UserIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p>{p.pitch}</p>
                    {n && (
                      <button type="button" onClick={() => setPeek(p.id)}
                        className="mt-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline">
                        {n.metier} · {n.label} (simulé)
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="mt-1 flex justify-end">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => c.copy("liste", listing)}>
              {c.done === "liste" ? <CheckIcon /> : <CopyIcon />} Copier la liste
            </Button>
          </div>
        </Step>
        <Step n={3} title="Questions clés">
          <div className="space-y-1.5">
            {g.questions.map((x, i) => (
              <div key={i} className="rounded-lg border">
                <button type="button" onClick={() => setQ(q === i ? null : i)} className="flex w-full items-center gap-3 p-2.5 text-left text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{i + 1}</span>
                  <span className="flex-1">{x.question}</span>
                  <ChevronRightIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", q === i && "rotate-90")} />
                </button>
                {q === i && (
                  <div className="space-y-1 border-t px-3 py-2 pl-12 text-xs text-muted-foreground">
                    <p><span className="font-medium text-foreground">Pourquoi : </span>{x.pourquoi}</p>
                    <p><span className="font-medium text-foreground">À noter : </span>{x.a_noter}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Step>
        <Step n={4} title="Objections courantes">
          <div className="space-y-1.5">
            {g.objections.map((x, i) => (
              <details key={i} className="group rounded-lg border">
                <summary className="flex cursor-pointer list-none items-center gap-2 p-2.5 text-sm">
                  <span className="flex-1">« {x.objection} »</span>
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="border-t px-3 py-2 text-sm text-muted-foreground">{x.reponse}</p>
              </details>
            ))}
          </div>
        </Step>
        <Step n={5} title="Conclusion" last>
          <div className="relative rounded-lg bg-muted/60 p-3 pr-10 text-sm leading-relaxed">
            {g.prochaine_etape}
            <CopyButton id="conclusion" text={g.prochaine_etape} c={c} className="absolute top-2 right-2" />
          </div>
          <div className="mt-2 rounded-lg border">
            <button type="button" onClick={() => setMail((v) => !v)} className="flex w-full items-center gap-2 p-2.5 text-left text-sm">
              <MailIcon className={cn("size-4", ACCENT)} />
              <span className="flex-1 font-medium">S'il est intéressé : l'email des profils, prêt à envoyer</span>
              <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", mail && "rotate-180")} />
            </button>
            {mail && (
              <div className="space-y-2 border-t p-3 text-sm">
                <p><span className="text-muted-foreground">Objet : </span>{g.email_profils.objet}</p>
                <p className="whitespace-pre-line text-muted-foreground">{g.email_profils.corps}</p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => c.copy("mail", `Objet : ${g.email_profils.objet}\n\n${g.email_profils.corps}`)}>
                    {c.done === "mail" ? <CheckIcon /> : <CopyIcon />} Copier
                  </Button>
                  <Button size="sm" asChild className="bg-orange-600 text-white hover:bg-orange-700">
                    <a href={mailto}><SendIcon /> Ouvrir dans la messagerie</a>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Step>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <SparklesIcon className="size-3" /> Guide rédigé par IA à partir des signaux publics et du vivier (simulé) — à adapter.
      </p>
      <CandidatePeek id={peek} onClose={() => setPeek(null)} />
    </div>
  )
}

// ------------------------------------------------------------------ onglet Profils

// Fiche candidat ouverte sur place (pas de navigation vers la page Candidats).
function CandidatePeek({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { candidates, missions, meta } = useData()
  const h = React.useMemo(
    () => (id ? candidateHistory(candidates.filter((c) => c.id === id), missions, meta.today)[0] : undefined),
    [id, candidates, missions, meta.today],
  )
  return (
    <Dialog open={!!h} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto p-6 sm:max-w-5xl sm:p-8">
        <DialogTitle className="sr-only">{h ? `${h.candidate.prenom} ${h.candidate.nom}` : "Candidat"}</DialogTitle>
        <DialogDescription className="sr-only">Fiche candidat (données simulées)</DialogDescription>
        {h && <CandidateDetail h={h} today={meta.today} />}
      </DialogContent>
    </Dialog>
  )
}

function Profiles({ sheet }: { sheet: Sheet }) {
  const { candidates, missions, meta } = useData()
  const [peek, setPeek] = React.useState<string | null>(null)
  const pitch = new Map(sheet.guide.pitch_profils.map((p) => [p.id, p.pitch]))
  const prets = sheet.faits.profils_prets
  const hs = React.useMemo(() => {
    const ids = prets.map((p) => p.id)
    const all = new Map(candidateHistory(candidates.filter((c) => ids.includes(c.id)), missions, meta.today).map((h) => [h.candidate.id, h]))
    return ids.map((id) => all.get(id)).filter((h): h is CandidateHistory => !!h)
  }, [prets, candidates, missions, meta.today])
  if (!hs.length) {
    return <p className="text-sm text-muted-foreground">Aucun profil disponible pour ces métiers : sourcer avant d'appeler.</p>
  }
  const atouts = new Map(sheet.faits.profils_prets.map((p) => [p.id, p.atouts.slice(1)]))
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {hs.length} profil{hs.length > 1 ? "s" : ""} choisi{hs.length > 1 ? "s" : ""} pour ce projet (métier, distance, disponibilité,
        missions chez ce client) <FictifBadge label="Simulé" />
      </p>
      <div className="space-y-4">
        {hs.map((h) => (
          <div key={h.candidate.id} className="space-y-1.5">
            <CandidateCard h={h} today={meta.today} onOpen={() => setPeek(h.candidate.id)} />
            <div className="rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2 dark:border-orange-500/20 dark:bg-orange-500/10">
              <p className="text-[11px] font-medium text-orange-700 dark:text-orange-300">Pour ce projet</p>
              {pitch.get(h.candidate.id) && <p className="text-sm">« {pitch.get(h.candidate.id)} »</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">{(atouts.get(h.candidate.id) ?? []).join(" · ")}</p>
            </div>
          </div>
        ))}
      </div>
      <CandidatePeek id={peek} onClose={() => setPeek(null)} />
    </div>
  )
}

// ------------------------------------------------------------------ onglet Compte-rendu

const OUTCOMES = Object.keys(CALL_OUTCOME_LABEL) as CallOutcome[]

function Report({ oKey, companies, who }: { oKey: string; companies: string[]; who: number }) {
  const history = useTasks()[oKey]?.calls ?? []
  const [outcome, setOutcome] = React.useState<CallOutcome | null>(null)
  const [note, setNote] = React.useState("")
  const [callback, setCallback] = React.useState("")
  const contact = companies[who] ?? null

  const save = () => {
    if (!outcome) return
    logCall(oKey, { outcome, note: note.trim(), callback: callback || null, contact })
    setOutcome(null)
    setNote("")
    setCallback("")
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-semibold">Résultat de l'appel{companies.length > 1 && contact && ` · ${contact}`}</p>
        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map((k) => (
            <Button key={k} variant="outline" onClick={() => setOutcome(k)}
              className={cn(outcome === k && "border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-500/10 dark:text-orange-200")}>
              {CALL_OUTCOME_LABEL[k]}
            </Button>
          ))}
        </div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Ce qui a été dit : dates, effectifs, métiers, interlocuteur…" />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Rappeler le
            <Input type="date" value={callback} onChange={(e) => setCallback(e.target.value)} className="h-8 w-auto" />
          </label>
          <Button className="ml-auto bg-orange-600 text-white hover:bg-orange-700" onClick={save} disabled={!outcome}>
            Enregistrer
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">L'alerte passe dans « Mes tâches » : Traité si pas de besoin, sinon En cours.</p>
      </div>
      {history.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Appels précédents</p>
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.at} className="rounded-lg border px-3 py-2 text-sm">
                <span className="font-medium">{CALL_OUTCOME_LABEL[h.outcome]}</span>
                <span className="text-xs text-muted-foreground">
                  {" "}· {fmtDate(h.at)}{h.contact && companies.length > 1 ? ` · ${h.contact}` : ""}
                  {h.callback && ` · rappel le ${fmtDate(h.callback)}`}
                </span>
                {h.note && <p className="mt-0.5 text-xs text-muted-foreground">{h.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
