import * as React from "react"
import { MinusIcon, PlusIcon, ScanIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LEVEL_DOT, LEVEL_FILL, rangeLabel, type DistrictStats } from "@/lib/carte"
import { LEVEL_LABEL } from "@/lib/format"
import type { Geo } from "@/lib/geo"
import type { Level } from "@/lib/types"
import { cn } from "@/lib/utils"

const AREA_OPACITY: Record<Level | "none", number> = { AGIR: 0.32, PRÉPARER: 0.22, SURVEILLER: 0.08, none: 0 }
const ZOOMS = [1, 1.6, 2.5]

interface Props {
  geo: Geo
  stats: Map<string, DistrictStats>
  selected: string | null
  onSelect: (district: string) => void
  compact?: boolean // widget : ni zoom ni légende détaillée, libellés plus gros
}

export function ValaisMap({ geo, stats, selected, onSelect, compact = false }: Props) {
  const [, , W, H] = geo.viewBox
  const [zoom, setZoom] = React.useState(0)
  const [center, setCenter] = React.useState<[number, number]>([W / 2, H / 2])
  const [hover, setHover] = React.useState<{ district: string; x: number; y: number; w: number; h: number } | null>(null)
  const boxRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{ x: number; y: number; c: [number, number]; moved: boolean } | null>(null)

  const k = ZOOMS[zoom]
  const vw = W / k
  const vh = H / k
  const clamp = ([x, y]: [number, number]): [number, number] => [
    Math.min(W - vw / 2, Math.max(vw / 2, x)),
    Math.min(H - vh / 2, Math.max(vh / 2, y)),
  ]
  const [cx, cy] = clamp(center)
  const viewBox = `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`

  // Taille des bulles : racine du renfort max (surface ∝ volume), bornée.
  const maxNeed = Math.max(1, ...[...stats.values()].map((s) => s.need[1]))
  const radius = (s: DistrictStats | undefined) => (!s || !s.opps.length ? 0.9 : 1.3 + 2.6 * Math.sqrt(s.need[1] / maxNeed))

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom === 0) return
    drag.current = { x: e.clientX, y: e.clientY, c: [cx, cy], moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !boxRef.current) return
    const scale = vw / boxRef.current.clientWidth
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    setCenter(clamp([d.c[0] - dx * scale, d.c[1] - dy * scale]))
  }
  const endDrag = () => {
    setTimeout(() => (drag.current = null))
  }
  const click = (district: string) => {
    if (!drag.current?.moved) onSelect(district)
  }
  const zoomTo = (z: number) => {
    setZoom(z)
    if (z > 0 && selected) {
      const d = geo.districts.find((g) => g.district === selected)
      if (d) setCenter(d.center)
    }
    if (z === 0) setCenter([W / 2, H / 2])
  }
  const showTip = (district: string, e: React.MouseEvent) => {
    const r = boxRef.current?.getBoundingClientRect()
    if (r) setHover({ district, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height })
  }

  const hovered = hover ? stats.get(hover.district) : undefined
  const hoveredGeo = hover ? geo.districts.find((d) => d.district === hover.district) : undefined
  const label = (compact ? 3.6 : 2.4) / Math.sqrt(k)

  return (
    <div
      ref={boxRef}
      className={cn(
        "relative overflow-hidden select-none",
        !compact && "rounded-xl border bg-muted/30",
        zoom > 0 && "cursor-grab active:cursor-grabbing",
      )}
      style={{ aspectRatio: `${W} / ${H}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={() => {
        endDrag()
        setHover(null)
      }}
    >
      <svg viewBox={viewBox} className="block size-full" role="img" aria-label="Carte des besoins par district du Valais">
        <defs>
          <clipPath id="vs-canton">
            <path d={geo.canton} />
          </clipPath>
          <filter id="vs-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        {/* Relief ombré swisstopo, découpé au contour du canton. */}
        <image
          href={geo.relief}
          x={0}
          y={0}
          width={W}
          height={H}
          preserveAspectRatio="none"
          clipPath="url(#vs-canton)"
          className="dark:opacity-40 dark:invert"
        />

        {geo.districts.map((d) => {
          const s = stats.get(d.district)
          const lvl = s?.level ?? "none"
          const isSel = d.district === selected
          return (
            <path
              key={d.id}
              d={d.path}
              className={cn(
                LEVEL_FILL[lvl],
                "cursor-pointer stroke-white transition-[fill-opacity] dark:stroke-slate-900",
              )}
              fillOpacity={hover?.district === d.district ? Math.max(0.18, AREA_OPACITY[lvl] + 0.15) : AREA_OPACITY[lvl]}
              strokeWidth={isSel ? 0 : 0.35 / k}
              onClick={() => click(d.district)}
              onMouseMove={(e) => showTip(d.district, e)}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}

        <path d={geo.canton} fill="none" className="stroke-slate-500/70 dark:stroke-slate-400/60" strokeWidth={0.4 / k} />

        {/* Contour du district sélectionné par-dessus les autres. */}
        {selected && (
          <path
            d={geo.districts.find((d) => d.district === selected)?.path}
            fill="none"
            className="pointer-events-none stroke-primary"
            strokeWidth={0.7 / k}
            strokeLinejoin="round"
          />
        )}

        {geo.districts.map((d) => {
          const s = stats.get(d.district)
          const r = radius(s) / Math.sqrt(k)
          const [x, y] = d.center
          const lvl = s?.level
          const isSel = d.district === selected
          return (
            <g
              key={d.id}
              className="cursor-pointer"
              onClick={() => click(d.district)}
              onMouseMove={(e) => showTip(d.district, e)}
              onMouseLeave={() => setHover(null)}
            >
              {lvl && lvl !== "SURVEILLER" && (
                <circle cx={x} cy={y} r={r * 1.9} className={cn(LEVEL_FILL[lvl], lvl === "AGIR" && "animate-pulse")} opacity={0.35} filter="url(#vs-glow)" />
              )}
              <circle
                cx={x}
                cy={y}
                r={r}
                className={cn(lvl ? LEVEL_FILL[lvl] : "fill-slate-300 dark:fill-slate-600", "stroke-white dark:stroke-slate-900")}
                strokeWidth={(isSel ? 0.7 : 0.4) / Math.sqrt(k)}
              />
              {isSel && <circle cx={x} cy={y} r={r + 0.9 / Math.sqrt(k)} fill="none" className="stroke-primary" strokeWidth={0.45 / Math.sqrt(k)} />}
              <text
                x={x + r + 0.8 / Math.sqrt(k)}
                y={y}
                dominantBaseline="central"
                fontSize={label}
                className={cn(
                  "fill-foreground stroke-background font-semibold [paint-order:stroke]",
                  !s?.opps.length && "fill-muted-foreground font-medium",
                )}
                strokeWidth={label * 0.28}
                strokeLinejoin="round"
              >
                {d.name}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Zoom */}
      <div className={cn("absolute top-3 left-3 flex flex-col overflow-hidden rounded-lg border bg-background/95 shadow-sm", compact && "hidden!")}>
        <Button variant="ghost" size="icon-sm" className="rounded-none" disabled={zoom === ZOOMS.length - 1} onClick={() => zoomTo(zoom + 1)} aria-label="Zoomer">
          <PlusIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" className="rounded-none border-t" disabled={zoom === 0} onClick={() => zoomTo(zoom - 1)} aria-label="Dézoomer">
          <MinusIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" className="rounded-none border-t" disabled={zoom === 0} onClick={() => zoomTo(0)} aria-label="Vue d'ensemble">
          <ScanIcon />
        </Button>
      </div>

      {/* Légende */}
      <div className={cn("absolute right-3 bottom-3 hidden rounded-lg border bg-background/95 p-3 text-xs shadow-sm sm:block", compact && "hidden!")}>
        <div className="mb-1.5 font-semibold">Niveau du district</div>
        <ul className="space-y-1">
          {(["AGIR", "PRÉPARER", "SURVEILLER"] as Level[]).map((l) => (
            <li key={l} className="flex items-center gap-2">
              <span className={cn("size-2.5 rounded-full", LEVEL_DOT[l])} /> {LEVEL_LABEL[l]}
            </li>
          ))}
          <li className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2.5 rounded-full bg-slate-300 dark:bg-slate-600" /> Aucune alerte
          </li>
        </ul>
        <div className="mt-2 border-t pt-1.5 text-muted-foreground">Taille = renfort estimé</div>
      </div>

      <div className="absolute bottom-1.5 left-2 text-[10px] text-muted-foreground">{geo.credit}</div>

      {hover && hoveredGeo && (
        <div
          className={cn(
            "pointer-events-none absolute z-10 rounded-lg border bg-popover text-xs text-popover-foreground shadow-md",
            compact ? "w-36 px-2 py-1.5" : "w-52 p-2.5",
          )}
          style={{
            left: hover.x + 14 + (compact ? 144 : 208) > hover.w ? Math.max(4, hover.x - 14 - (compact ? 144 : 208)) : hover.x + 14,
            top: Math.max(4, Math.min(hover.y - 10, hover.h - (compact ? 64 : 104))),
          }}
        >
          <div className="flex items-center justify-between gap-2 font-semibold">
            {hoveredGeo.name}
            {hovered?.level && <span className={cn("size-2 rounded-full", LEVEL_DOT[hovered.level])} />}
          </div>
          {hovered?.opps.length && compact ? (
            <div className="mt-0.5 leading-snug text-muted-foreground">
              <div>
                <span className="font-medium text-foreground tabular-nums">{hovered.counts.AGIR}</span> urgent ·{" "}
                <span className="font-medium text-foreground tabular-nums">{hovered.counts.PRÉPARER}</span> à anticiper
              </div>
              <div>
                Renfort <span className="font-medium text-foreground tabular-nums">{hovered.active.length ? rangeLabel(hovered.need) : "—"}</span>
              </div>
            </div>
          ) : hovered?.opps.length ? (
            <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-muted-foreground">
              <dt>Urgent · Anticiper</dt>
              <dd className="text-right font-medium text-foreground tabular-nums">
                {hovered.counts.AGIR} · {hovered.counts.PRÉPARER}
              </dd>
              <dt>En veille</dt>
              <dd className="text-right tabular-nums">{hovered.counts.SURVEILLER}</dd>
              <dt>Renfort estimé</dt>
              <dd className="text-right font-medium text-foreground tabular-nums">
                {hovered.active.length ? rangeLabel(hovered.need) : "—"}
              </dd>
            </dl>
          ) : (
            <p className="mt-1 text-muted-foreground">Aucune alerte pour ces filtres.</p>
          )}
        </div>
      )}
    </div>
  )
}
