import { useSearchParams } from "react-router"

// Filtres d'une page gardés dans l'URL (partageables, conservés au retour arrière) ; valeurs par défaut omises.
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams()
  const f = { ...defaults, ...Object.fromEntries(params) } as T
  const set = (patch: Partial<T>) => {
    const next = { ...f, ...patch }
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== defaults[k])), { replace: true })
  }
  const reset = (keep: (keyof T)[] = []) =>
    setParams(Object.fromEntries(keep.filter((k) => f[k] !== defaults[k]).map((k) => [k, f[k]])), { replace: true })
  const dirty = (ignore: (keyof T)[] = []) =>
    Object.keys(defaults).some((k) => !ignore.includes(k) && f[k] !== defaults[k])
  return { f, set, reset, dirty }
}
