import { ClockIcon, MapPinIcon } from "lucide-react"

import { AlertAvatar } from "@/features/alerts/alert-thumb"
import { TaskControl } from "@/features/tasks/task-status"
import { LevelBadge } from "@/components/level-badge"
import { Separator } from "@/components/ui/separator"
import { useData } from "@/lib/data"
import {
  alertSummary,
  alertTitle,
  confidence,
  daysAgo,
  fmtDate,
  needLabel,
  placeLabel,
  shortReasons,
  weeksRange,
  weeksShort,
} from "@/lib/format"
import type { Opportunity } from "@/lib/types"
import { cn } from "@/lib/utils"

const CONF_DOT = { high: "bg-emerald-500", mid: "bg-amber-500", low: "bg-muted-foreground/50" } as const

// Carte du fil d'alertes, volontairement courte (le détail est dans le modal) : vignette + nom + lieu + niveau ;
// mini-titre résumé ; renfort / quand / confiance ; actions de suivi en pied.
export function AlertCard({ o, onOpen }: { o: Opportunity; onOpen: () => void }) {
  const { meta } = useData()
  // Mini-titre : les deux raisons principales (« Adjudication SIMAP 1,2 MCHF · 3 mises à l'enquête »).
  const headline = shortReasons(o.signals, 2).join(" · ")
  const conf = confidence(o)
  // Date du signal public le plus récent.
  const last = o.signals.filter((s) => !s.fictif && s.date).map((s) => s.date!).sort().at(-1)
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onOpen())}
      aria-label={`Ouvrir l'alerte ${alertTitle(o)}`}
      className={cn(
        "group flex h-full cursor-pointer flex-col rounded-2xl border bg-card p-5 shadow-xs transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      )}
    >
      <header className="flex items-start gap-3">
        <AlertAvatar o={o} className="size-16" />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base leading-snug font-semibold group-hover:text-primary">{alertTitle(o)}</h3>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPinIcon className="size-3" /> {placeLabel(o)}
            </span>
            {last && (
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3" /> dernier signal {daysAgo(last, meta.today)}
              </span>
            )}
          </div>
        </div>
        <LevelBadge level={o.level} className="shrink-0" />
      </header>

      <Separator className="my-3" />

      <p className="line-clamp-2 text-sm leading-snug font-medium" title={alertSummary(o)}>
        {headline}
      </p>

      <dl className="mt-4 mb-4 grid grid-cols-3 divide-x">
        <div className="grid gap-1 pr-2.5">
          <dt className="text-[11px] text-muted-foreground">Renfort</dt>
          <dd className="text-sm font-semibold tabular-nums">{needLabel(o)} pers.</dd>
        </div>
        <div className="grid gap-1 px-2.5">
          <dt className="text-[11px] text-muted-foreground">Quand</dt>
          <dd className="truncate text-sm font-semibold" title={`${weeksRange(o.window, meta.today)} · ${fmtDate(o.window[0])} → ${fmtDate(o.window[1])}`}>
            {weeksShort(o.window, meta.today)}
          </dd>
        </div>
        <div className="grid gap-1 pl-2.5">
          <dt className="text-[11px] text-muted-foreground">Confiance</dt>
          <dd className="flex items-center gap-1.5 text-sm font-semibold" title={conf.label}>
            <span className={cn("size-1.5 rounded-full", CONF_DOT[conf.tone])} />
            {conf.label.split(" · ")[0]}
          </dd>
        </div>
      </dl>

      <footer className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">
          {o.signals.length} {o.signals.length > 1 ? "signaux" : "signal"}
        </span>
        <TaskControl taskKey={o.key} />
      </footer>
    </article>
  )
}
