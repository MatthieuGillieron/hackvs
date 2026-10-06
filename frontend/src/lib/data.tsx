import * as React from "react"

import type { Candidate, Client, Meta, Mission, Opportunity, SourceStatus } from "@/lib/types"

export interface AppData {
  meta: Meta
  opportunities: Opportunity[]
  candidates: Candidate[]
  clients: Client[]
  sources: SourceStatus[]
  missions: Mission[]
}

const DataContext = React.createContext<AppData | null>(null)

async function getJson<T>(name: string): Promise<T> {
  const res = await fetch(`/data/${name}.json`)
  if (!res.ok) throw new Error(`${name}.json : HTTP ${res.status}`)
  return res.json() as Promise<T>
}

// Charge une fois tous les JSON exportés par le moteur Python.
export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = React.useState<AppData | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    Promise.all([
      getJson<Meta>("meta"),
      getJson<Opportunity[]>("opportunities"),
      getJson<Candidate[]>("candidates"),
      getJson<Client[]>("clients"),
      getJson<SourceStatus[]>("sources"),
      getJson<Mission[]>("missions"),
    ])
      .then(([meta, opportunities, candidates, clients, sources, missions]) =>
        setData({ meta, opportunities, candidates, clients, sources, missions }),
      )
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) {
    return (
      <div className="flex h-svh items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Données introuvables ({error}). Lancez <code className="mx-1">make build</code> à la racine du repo.
      </div>
    )
  }
  if (!data) {
    return <div className="flex h-svh items-center justify-center text-sm text-muted-foreground">Chargement…</div>
  }
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>
}

export function useData(): AppData {
  const ctx = React.useContext(DataContext)
  if (!ctx) throw new Error("useData doit être utilisé dans <DataProvider>")
  return ctx
}
