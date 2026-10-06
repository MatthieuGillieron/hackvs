import * as React from "react"
import { ChevronDownIcon, ExternalLinkIcon, LightbulbIcon, SparklesIcon } from "lucide-react"

import { FAMILY_DOT } from "@/components/level-badge"
import { FictifBadge } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { daysAgo, FAMILY_HINT, FAMILY_LABEL, SIGNAL_TYPE_LABEL, SIGNAL_WHY, sourceHost } from "@/lib/format"
import type { Family, Opportunity, Signal } from "@/lib/types"
import { cn } from "@/lib/utils"

// Onglet Signaux : une colonne par famille, signaux regroupés par type. Chaque carte dit ce que contient
// la source (titre, résumé, faits) pour qu'on n'ait pas besoin de l'ouvrir, et garde toujours le lien.

const FAMILY_ORDER: Family[] = ["projet", "recrutement", "entreprise", "historique"]
const SHOWN = 3

// Un permis produit un signal par phase de chantier (même publication) : une seule carte, phases réunies.
interface Item {
  s: Signal
  phases: string[]
}

function merge(list: Signal[]): Item[] {
  const by = new Map<string, Item>()
  for (const s of list) {
    const k = s.url ?? s.label
    const it = by.get(k)
    if (it) {
      if (s.phase && !it.phases.includes(s.phase)) it.phases.push(s.phase)
    } else by.set(k, { s, phases: s.phase ? [s.phase] : [] })
  }
  return [...by.values()].sort((a, b) => (b.s.date ?? "").localeCompare(a.s.date ?? ""))
}

function SignalCard({ it, today }: { it: Item; today: string }) {
  const { s, phases } = it
  const d = s.detail
  const title = d?.titre ?? s.label
  const resume = d?.resume && d.resume !== title ? d.resume : null
  // Les phases réunies remplacent le fait « Phase x (estimée) » de chaque signal.
  const faits = [
    ...(phases.length > 1 ? [`Phases : ${phases.join(", ")}`] : []),
    ...(d?.faits ?? []).filter((f) => !(phases.length > 1 && f.startsWith("Phase "))),
  ]
  const host = sourceHost(s.url)
  return (
    <li className="space-y-2 rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {s.date ? daysAgo(s.date, today) : "en continu"}
          {s.ia && (
            <span className="inline-flex items-center gap-0.5 rounded border px-1" title={s.preuve ? `« ${s.preuve} »` : undefined}>
              <SparklesIcon className="size-2.5" /> Extrait par IA
            </span>
          )}
        </span>
        {s.fictif && <FictifBadge label="Simulé" />}
      </div>
      <p className="line-clamp-2 text-sm leading-snug font-medium">{title}</p>
      {resume && <p className="line-clamp-3 text-xs text-muted-foreground">{resume}</p>}
      {faits.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {faits.slice(0, 6).map((f) => (
            <li key={f} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{f}</li>
          ))}
        </ul>
      )}
      {s.url ? (
        <a href={s.url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Voir la source{host && ` · ${host}`} <ExternalLinkIcon className="size-3" />
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">Données internes Flexsis (simulées)</p>
      )}
    </li>
  )
}

function TypeGroup({ type, list, today }: { type: string; list: Signal[]; today: string }) {
  const items = merge(list)
  const [open, setOpen] = React.useState(false)
  const shown = open ? items : items.slice(0, SHOWN)
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-xs font-semibold">
          {SIGNAL_TYPE_LABEL[type] ?? type} <span className="font-normal text-muted-foreground">· {items.length}</span>
        </h4>
        {SIGNAL_WHY[type] && (
          <p className="mt-0.5 flex gap-1 text-[11px] text-muted-foreground">
            <LightbulbIcon className="mt-px size-3 shrink-0 text-primary" /> {SIGNAL_WHY[type]}
          </p>
        )}
      </div>
      <ul className="space-y-2">
        {shown.map((it) => <SignalCard key={it.s.url ?? it.s.label} it={it} today={today} />)}
      </ul>
      {items.length > SHOWN && (
        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setOpen(!open)}>
          {open ? "Réduire" : `Voir les ${items.length - SHOWN} autres`}
          <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      )}
    </section>
  )
}

export function SignalBoard({ o, today }: { o: Opportunity; today: string }) {
  const cols = FAMILY_ORDER.map((f) => [f, o.signals.filter((s) => s.family === f)] as const).filter(([, l]) => l.length)
  return (
    <div className="grid gap-4 @3xl:h-full @3xl:[grid-template-columns:var(--cols)]"
      style={{ "--cols": `repeat(${cols.length}, minmax(0, 1fr))` } as React.CSSProperties}>
      {cols.map(([f, list]) => {
        const types = [...new Set(list.map((s) => s.type))]
        return (
          <div key={f} className="flex max-h-[28rem] min-h-0 flex-col rounded-xl border bg-card shadow-xs @3xl:max-h-none">
            <header className="border-b px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <span className={cn("size-2.5 rounded-full", FAMILY_DOT[f])} />
                {FAMILY_LABEL[f]}
                <span className="font-normal text-muted-foreground">{merge(list).length}</span>
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{FAMILY_HINT[f]}</p>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
              {types.map((t) => (
                <TypeGroup key={t} type={t} list={list.filter((s) => s.type === t)} today={today} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
