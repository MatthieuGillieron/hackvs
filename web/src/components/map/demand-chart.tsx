import * as React from "react"

import type { WeekPoint } from "@/lib/carte"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"

// Renfort prévu (fourchette + valeur centrale) et vivier disponible (simulé), une seule échelle : des personnes.
const H = 210
const M = { top: 12, right: 12, bottom: 24, left: 30 }

function niceMax(v: number): number {
  if (v <= 5) return 5
  const step = 10 ** Math.floor(Math.log10(v))
  return Math.ceil(v / step) * step
}

// Le SVG est dessiné à sa largeur réelle en pixels : le texte garde sa taille quel que soit le conteneur.
function useWidth(ref: React.RefObject<HTMLDivElement | null>, fallback: number): number {
  const [w, setW] = React.useState(fallback)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

export function DemandChart({ points }: { points: WeekPoint[] }) {
  const [hover, setHover] = React.useState<number | null>(null)
  const boxRef = React.useRef<HTMLDivElement>(null)
  const W = useWidth(boxRef, 480)
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.need[2], p.available))))
  const iw = W - M.left - M.right
  const ih = H - M.top - M.bottom
  const x = (i: number) => M.left + (points.length > 1 ? (i / (points.length - 1)) * iw : iw / 2)
  const y = (v: number) => M.top + ih - (v / max) * ih
  const line = (f: (p: WeekPoint) => number) => points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(f(p))}`).join("")
  const band =
    points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.need[2])}`).join("") +
    [...points].reverse().map((p, j) => `L${x(points.length - 1 - j)},${y(p.need[0])}`).join("") +
    "Z"
  const ticks = [0, max / 2, max]
  const hp = hover !== null ? points[hover] : null
  const peak = points.reduce((b, p) => (p.need[1] > b.need[1] ? p : b), points[0])

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const rel = ((e.clientX - r.left) / r.width) * iw
    setHover(Math.max(0, Math.min(points.length - 1, Math.round((rel / iw) * (points.length - 1)))))
  }

  return (
    <div ref={boxRef} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Renfort prévu et vivier disponible par semaine">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={M.left - 6} y={y(t)} textAnchor="end" dominantBaseline="central" className="fill-muted-foreground text-[10px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % (W < 420 ? 3 : 2) === 0 ? (
            <text key={p.date} x={x(i)} y={H - 6} textAnchor={i === points.length - 1 ? "end" : i === 0 ? "start" : "middle"} className="fill-muted-foreground text-[10px]">
              {fmtDate(p.date)}
            </text>
          ) : null,
        )}

        <path d={band} className="fill-blue-600/12 dark:fill-blue-500/20" />
        <path d={line((p) => p.need[1])} fill="none" className="stroke-blue-600 dark:stroke-blue-500" strokeWidth={2} strokeLinejoin="round" />
        <path d={line((p) => p.available)} fill="none" className="stroke-teal-600" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />

        {hp && hover !== null && (
          <g className="pointer-events-none">
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ih} className="stroke-muted-foreground/50" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(hp.need[1])} r={4} className="fill-blue-600 stroke-card dark:fill-blue-500" strokeWidth={2} />
            <circle cx={x(hover)} cy={y(hp.available)} r={4} className="fill-teal-600 stroke-card" strokeWidth={2} />
          </g>
        )}
        <rect
          x={M.left}
          y={M.top}
          width={iw}
          height={ih}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {hp && hover !== null && (
        <div
          className={cn(
            "pointer-events-none absolute top-1 z-10 w-48 rounded-lg border bg-popover p-2 text-xs text-popover-foreground shadow-md",
          )}
          style={x(hover) / W > 0.6 ? { right: `${100 - (x(hover) / W) * 100 + 2}%` } : { left: `${(x(hover) / W) * 100 + 2}%` }}
        >
          <div className="mb-1 font-medium">Semaine du {fmtDate(hp.date, { day: "numeric", month: "long" })}</div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-0.5 w-3 bg-blue-600 dark:bg-blue-500" /> Renfort prévu
            </span>
            <span className="font-medium tabular-nums">
              {hp.need[0] === hp.need[2] ? hp.need[1] : `${hp.need[0]}–${hp.need[2]}`}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-0.5 w-3 border-t-2 border-dashed border-teal-600" /> Vivier (simulé)
            </span>
            <span className="font-medium tabular-nums">{hp.available}</span>
          </div>
        </div>
      )}

      <p className="mt-2 text-sm">
        Pic du renfort : <span className="font-semibold tabular-nums">{peak.need[0] === peak.need[2] ? peak.need[1] : `${peak.need[0]}–${peak.need[2]}`} pers.</span>{" "}
        <span className="text-muted-foreground">semaine du {fmtDate(peak.date, { day: "numeric", month: "long" })}</span>
      </p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="relative h-2.5 w-4 rounded-sm bg-blue-600/15 dark:bg-blue-500/25">
            <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-blue-600 dark:bg-blue-500" />
          </span>
          Renfort prévu (fourchette)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-teal-600" /> Vivier disponible (simulé)
        </span>
      </div>
    </div>
  )
}
