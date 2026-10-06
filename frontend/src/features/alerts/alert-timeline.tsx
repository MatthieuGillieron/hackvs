import * as React from "react"

import { useData } from "@/lib/data"
import { fmtDate, needLabel, shortMetier } from "@/lib/format"
import { matchCandidates } from "@/features/candidates/match"
import type { Candidate, Opportunity } from "@/lib/types"
import { cn } from "@/lib/utils"

// Chronologie estimée sur une vraie échelle de temps (aujourd'hui → fin du besoin) : les étapes du projet sont
// des barres datées ; le pic de besoin est un histogramme des candidats adéquats disponibles semaine par semaine
// (données simulées).

interface Step {
  key: string
  what: string
  window: [string, string]
  duree: string | null // durée estimée de l'étape (chantier SIMAP, phase de permis)
  metiers: string[]
  need?: boolean
}

const DAY = 86_400_000
const t = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00").getTime()

const weeks = (w: [string, string]) => Math.max(1, Math.round((t(w[1]) - t(w[0])) / DAY / 7))

function steps(o: Opportunity, today: string): Step[] {
  const out: Step[] = []
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
            : "Début des travaux"
    if (seen.has(what)) continue
    seen.add(what)
    const chantier = s.detail?.faits.map((f) => f.match(/Chantier ~(\d+) mois/)).find(Boolean)
    const duree = chantier ? `~${chantier[1]} mois de chantier` : s.type === "permis" ? `~${weeks(s.window)} sem. de phase` : null
    out.push({ key: what, what, window: s.window, duree, metiers: s.metiers })
    if (out.length >= 2) break
  }
  out.push({ key: "need", what: "Pic de besoin", window: o.window, duree: null, metiers: o.metiers, need: true })
  return out
}

// « 16 oct. → 24 déc. », avec l'année dès qu'on sort de l'année en cours.
function fmtRange(w: [string, string], today: string): string {
  const y = today.slice(0, 4)
  const f = (iso: string) => fmtDate(iso, iso.slice(0, 4) === y ? undefined : { day: "numeric", month: "short", year: "numeric" })
  return `${f(w[0])} → ${f(w[1])}`
}

const short = (iso: string) => new Date(t(iso)).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" })

// « Dans 2 semaines | le 16.10.26 » (début de l'étape).
function when(w: [string, string], today: string): string {
  if (w[0] <= today) return `En cours | jusqu'au ${short(w[1])}`
  const weeks = Math.floor((t(w[0]) - t(today)) / DAY / 7)
  return `${weeks === 0 ? "Cette semaine" : `Dans ${weeks} semaine${weeks > 1 ? "s" : ""}`} | le ${short(w[0])}`
}

// Candidat libre à la date `iso` (disponible, ou fin de mission avant cette date). Les anciens sont exclus.
function freeOn(c: Candidate, iso: string): boolean {
  if (c.statut === "disponible") return !c.disponible_des || c.disponible_des <= iso
  if (c.statut === "en mission") return !!c.disponible_des && c.disponible_des <= iso
  return false
}

// Graduations : une par mois, ou tous les 2 / 3 mois si l'échelle est longue.
function ticks(start: number, end: number): { at: number; label: string }[] {
  const months = (end - start) / (30 * DAY)
  const step = months > 18 ? 3 : months > 9 ? 2 : 1
  const d = new Date(start)
  d.setDate(1)
  d.setMonth(d.getMonth() + 1)
  const out = []
  while (d.getTime() < end) {
    out.push({
      at: d.getTime(),
      label: d.toLocaleDateString("fr-CH", d.getMonth() === 0 ? { month: "short", year: "numeric" } : { month: "short" }),
    })
    d.setMonth(d.getMonth() + step)
  }
  return out
}

function Supply({ o, pool, start, end, pct }: {
  o: Opportunity
  pool: Candidate[]
  start: number
  end: number
  pct: (x: number) => number
}) {
  const [hover, setHover] = React.useState<number | null>(null)
  // Une barre par semaine (par quinzaine si l'échelle est longue).
  const step = (end - start) / DAY > 280 ? 14 : 7
  const buckets: { at: number; iso: string; n: number; inNeed: boolean }[] = []
  for (let at = start; at < end; at += step * DAY) {
    const iso = new Date(at).toISOString().slice(0, 10)
    const mid = new Date(at + (step / 2) * DAY).toISOString().slice(0, 10)
    buckets.push({ at, iso, n: pool.filter((c) => freeOn(c, iso)).length, inNeed: mid >= o.window[0] && iso <= o.window[1] })
  }
  const max = Math.max(...buckets.map((b) => b.n), 1)
  const width = (at: number) => pct(Math.min(at + step * DAY, end)) - pct(at)
  const h = hover !== null ? buckets[hover] : null
  return (
    <div className="relative h-14 tall:h-20" onMouseLeave={() => setHover(null)}>
      {buckets.map((b, i) => (
        <div key={b.at} className="absolute inset-y-0 flex items-end justify-center" style={{ left: `${pct(b.at)}%`, width: `${width(b.at)}%` }}
          onMouseEnter={() => setHover(i)}>
          <div
            className={cn("w-1/2 max-w-3 rounded-t-[3px] transition-opacity", b.inNeed ? "bg-primary/75" : "bg-primary/20",
              hover !== null && hover !== i && "opacity-50")}
            style={{ height: `${(b.n / max) * 100}%` }}
          />
        </div>
      ))}
      {h && (
        <div className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-[11px] whitespace-nowrap shadow-sm"
          style={{ left: `${Math.min(88, pct(h.at) + width(h.at) / 2)}%` }}>
          Sem. du {short(h.iso)} · <span className="font-semibold">{h.n}</span> candidat{h.n > 1 ? "s" : ""} libre{h.n > 1 ? "s" : ""}
        </div>
      )}
    </div>
  )
}

function Metiers({ list }: { list: string[] }) {
  if (!list.length) return null
  return (
    <ul className="mt-1 hidden flex-wrap gap-1 tall:flex">
      {list.slice(0, 4).map((m) => (
        <li key={m} className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{shortMetier(m)}</li>
      ))}
      {list.length > 4 && <li className="text-[11px] text-muted-foreground">+{list.length - 4}</li>}
    </ul>
  )
}

export function AlertTimeline({ o, today }: { o: Opportunity; today: string }) {
  const { candidates, missions } = useData()
  const pool = React.useMemo(() => matchCandidates(o, candidates, missions).map((m) => m.c), [o, candidates, missions])
  const list = steps(o, today)
  const start = t(today)
  const end = Math.max(...list.map((s) => t(s.window[1]))) + 7 * DAY
  const pct = (iso: string | number) => Math.min(100, Math.max(0, (((typeof iso === "number" ? iso : t(iso)) - start) / (end - start)) * 100))
  const freeAtStart = pool.filter((c) => freeOn(c, o.window[0] > today ? o.window[0] : today)).length

  const grid = "grid grid-cols-[minmax(0,19rem)_minmax(0,1fr)] gap-x-5"
  const marks = ticks(start, end)

  return (
    <div className="flex h-full min-h-0 flex-col justify-center">
      <div className="relative flex flex-col gap-4 tall:gap-7">
        {/* Graduations et ligne « aujourd'hui », derrière les barres. */}
        <div className={cn(grid, "pointer-events-none absolute inset-0")}>
          <span />
          <div className="relative">
            {marks.map((k) => (
              <span key={k.at} className="absolute inset-y-0 w-px bg-border/60" style={{ left: `${pct(k.at)}%` }} />
            ))}
            <span className="absolute inset-y-0 left-0 w-px bg-foreground/60" />
          </div>
        </div>
        {list.map((s) => {
          const l = pct(s.window[0])
          const w = Math.max(1.5, pct(s.window[1]) - l)
          const range = fmtRange(s.window, today)
          return (
            <div key={s.key} className={cn(grid, "relative items-center")}>
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("text-sm font-medium", s.need && "text-primary")}>{s.what}</span>
                  {s.need && <span className="text-xs font-medium">{needLabel(o)} pers.</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.need
                    ? `${range} · ~${weeks(s.window)} sem. · ${freeAtStart} candidat${freeAtStart > 1 ? "s" : ""} libre${freeAtStart > 1 ? "s" : ""} au démarrage`
                    : when(s.window, today)}
                </div>
                {s.need ? (
                  <Metiers list={s.metiers} />
                ) : s.duree && (
                  <span className="mt-1 inline-flex rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{s.duree}</span>
                )}
              </div>
              {s.need ? (
                <Supply o={o} pool={pool} start={start} end={end} pct={pct} />
              ) : (
                <div className="relative h-5">
                  <div
                    title={range}
                    className="absolute inset-y-0 flex items-center overflow-hidden rounded bg-primary/10 px-1.5 text-[11px] whitespace-nowrap text-muted-foreground ring-1 ring-primary/25 ring-inset"
                    style={{ left: `${l}%`, width: `${w}%` }}
                  >
                    {w > 18 && range}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Axe */}
      <div className={cn(grid, "pt-1")}>
        <span />
        <div className="relative h-5 border-t text-[11px] text-muted-foreground">
          <span className="absolute top-1 left-0 font-medium text-foreground">Aujourd'hui</span>
          {marks.map((k) => (
            <span key={k.at} className="absolute top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct(k.at)}%` }}>
              {pct(k.at) > 8 && k.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
