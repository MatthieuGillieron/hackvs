import * as React from "react"

// Fond de carte produit par `python3 -m engine geo` (frontend/public/data/geo.json).
// Coordonnées en km LV95 : x = E - E0, y = N0 - N.

export interface GeoDistrict {
  id: number // n° OFS du district
  name: string // « Sion »
  district: string // tel que dans les données : « District de Sion »
  path: string
  center: [number, number]
  town: { name: string; xy: [number, number] } // chef-lieu (centre de la vue aérienne)
  image: string // vue aérienne SWISSIMAGE du chef-lieu
}

export interface Geo {
  viewBox: [number, number, number, number]
  canton: string
  relief: string
  credit: string
  districts: GeoDistrict[]
}

let cache: Promise<Geo> | null = null

export function useGeo(): { geo: Geo | null; error: string | null } {
  const [geo, setGeo] = React.useState<Geo | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    cache ??= fetch("/data/geo.json").then((r) => {
      if (!r.ok) throw new Error(`geo.json : HTTP ${r.status}`)
      return r.json() as Promise<Geo>
    })
    cache.then(setGeo).catch((e: Error) => {
      cache = null
      setError(e.message)
    })
  }, [])
  return { geo, error }
}
