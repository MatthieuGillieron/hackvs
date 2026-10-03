import { Building2Icon, MapPinIcon } from "lucide-react"

import { useGeo } from "@/lib/geo"
import type { Opportunity } from "@/lib/types"
import { cn } from "@/lib/utils"

const PRECISION: Record<string, string> = {
  parcelle: "parcelle du projet",
  commune: "commune",
  district: "chef-lieu du district",
}

// Zone (district × métier) : le district surligné sur le relief du Valais. Une photo du chef-lieu
// se répéterait d'une carte à l'autre (13 vignettes pour plus de 200 zones).
function DistrictShape({ district, className }: { district: string | null; className?: string }) {
  const { geo } = useGeo()
  const d = geo?.districts.find((x) => x.district === district)
  if (!geo || !d) return <div className={cn("shrink-0 rounded-lg bg-muted", className)} />
  const [, , W, H] = geo.viewBox
  return (
    <figure className={cn("relative shrink-0 overflow-hidden rounded-lg bg-muted", className)} title={`District de ${d.name} ${geo.credit}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="size-full" role="img"
        aria-label={`District de ${d.name}`}>
        <image href={geo.relief} width={W} height={H} opacity={0.55} />
        <path d={geo.canton} className="fill-background/40 stroke-foreground/30" strokeWidth={0.4} />
        {geo.districts.map((x) => (
          <path key={x.id} d={x.path} strokeWidth={x.id === d.id ? 0.7 : 0.25}
            className={x.id === d.id ? "fill-primary/45 stroke-primary" : "fill-transparent stroke-foreground/20"} />
        ))}
        <circle cx={d.town.xy[0]} cy={d.town.xy[1]} r={1.3} className="fill-primary stroke-background" strokeWidth={0.5} />
      </svg>
      <figcaption className="absolute top-1.5 left-1.5 rounded bg-background/85 px-1.5 text-[11px] font-medium">
        District de {d.name}
      </figcaption>
    </figure>
  )
}

// Vue aérienne swisstopo du lieu (jamais une photo d'illustration) ; district surligné pour une zone ;
// icône si aucun lieu connu.
export function AlertThumb({ o, className, credit = false }: { o: Opportunity; className?: string; credit?: boolean }) {
  if (o.kind === "zone") return <DistrictShape district={o.district} className={className} />
  const img = o.image
  if (!img) {
    return (
      <div className={cn("flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", className)}>
        <Building2Icon className="size-6" />
      </div>
    )
  }
  return (
    <figure
      className={cn("relative shrink-0 overflow-hidden rounded-lg bg-muted", className)}
      title={`Vue aérienne ${img.place ?? ""} (${PRECISION[img.precision]}) ${img.credit}`}
    >
      <img src={img.src} alt={`Vue aérienne de ${img.place ?? "la zone"}`} loading="lazy" className="size-full object-cover" />
      {credit && (
        <figcaption className="absolute right-0 bottom-0 rounded-tl bg-black/50 px-1 text-[9px] leading-4 text-white">
          <MapPinIcon className="mr-0.5 inline size-2.5" />
          {img.place} {img.credit}
        </figcaption>
      )}
    </figure>
  )
}

export const PRECISION_LABEL = PRECISION

// Emprise (km) d'un contour SVG « M x,y L x,y … Z ».
function bbox(path: string): [number, number, number, number] {
  const n = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [0, 0]
  const xs = n.filter((_, i) => i % 2 === 0)
  const ys = n.filter((_, i) => i % 2 === 1)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// District cadré sur lui-même (vignette carrée d'une zone).
function DistrictTile({ district, className }: { district: string | null; className?: string }) {
  const { geo } = useGeo()
  const d = geo?.districts.find((x) => x.district === district)
  if (!geo || !d) return <div className={cn("shrink-0 rounded-xl bg-muted", className)} />
  const [x0, y0, x1, y1] = bbox(d.path)
  const size = Math.max(x1 - x0, y1 - y0) * 1.15
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const [, , W, H] = geo.viewBox
  return (
    <svg viewBox={`${cx - size / 2} ${cy - size / 2} ${size} ${size}`} role="img" aria-label={`District de ${d.name}`}
      className={cn("shrink-0 rounded-xl bg-muted ring-1 ring-border ring-inset", className)}>
      <title>{`District de ${d.name} ${geo.credit}`}</title>
      <image href={geo.relief} width={W} height={H} opacity={0.6} />
      <path d={d.path} className="fill-primary/40 stroke-primary" strokeWidth={size / 60} />
      <circle cx={d.town.xy[0]} cy={d.town.xy[1]} r={size / 28} className="fill-primary stroke-background" strokeWidth={size / 120} />
    </svg>
  )
}

// Petite vignette carrée (même taille pour toutes les cartes), de la plus parlante à la plus vague :
// logo réel de l'entreprise › vue aérienne du projet › district de la zone › icône.
export function AlertAvatar({ o, className }: { o: Opportunity; className?: string }) {
  const box = cn("size-14 shrink-0 overflow-hidden rounded-xl", className)
  if (o.logo) {
    return (
      <div className={cn(box, "bg-white p-1 ring-1 ring-border ring-inset")} title={o.logo.credit}>
        <img src={o.logo.src} alt={`Logo ${o.target}`} loading="lazy" className="size-full object-contain" />
      </div>
    )
  }
  if (o.kind === "zone") return <DistrictTile district={o.district} className={box} />
  if (o.image) {
    return (
      <div className={cn(box, "bg-muted")} title={`Vue aérienne ${o.image.place ?? ""} (${PRECISION[o.image.precision]}) ${o.image.credit}`}>
        <img src={o.image.src} alt={`Vue aérienne de ${o.image.place ?? "la zone"}`} loading="lazy" className="size-full object-cover" />
      </div>
    )
  }
  return (
    <div className={cn(box, "flex items-center justify-center bg-muted text-muted-foreground")}>
      <Building2Icon className="size-6" />
    </div>
  )
}
