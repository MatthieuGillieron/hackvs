import * as React from "react"
import { BellIcon } from "lucide-react"

import { InternalBase } from "@/components/records/internal-base"
import { Initials, RecordCard, StatusDot } from "@/components/records/record-card"
import { CompactSelect, DbFilterBar, DbTabsBar, MoreButton } from "@/components/records/toolbar"
import { ClientDetail } from "@/features/clients/client-detail"
import { PageBody, PageHeader } from "@/components/layout/page"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useData } from "@/lib/data"
import { fmtDate, metiersLabel, shortDistrict } from "@/lib/format"
import { CLIENT_STATE, clientHistory, type ClientHistory, type ClientState } from "@/lib/history"
import { useUrlFilters } from "@/lib/url-filters"

// Clients : la base des entreprises clientes de Flexsis, actuelles et passées.
// Grille de cartes courtes ; la fiche (registre Zefix réel + relation et missions SIMULÉES) s'ouvre au clic.

const ALL = "all"
const DEFAULTS = { etat: ALL, q: "", secteur: ALL, district: ALL, taille: ALL, tri: "nom", entreprise: "" }
const PAGE = 21 // multiple de 3
const STATES = Object.keys(CLIENT_STATE) as ClientState[]

const SORTS: Record<string, { label: string; fn: (a: ClientHistory, b: ClientHistory) => number }> = {
  nom: { label: "Nom", fn: (a, b) => a.client.name.localeCompare(b.client.name, "fr") },
  mission: { label: "Dernière mission", fn: (a, b) => b.current - a.current || (b.last ?? "").localeCompare(a.last ?? "") },
  missions: { label: "Nb de missions", fn: (a, b) => b.missions.length - a.missions.length },
  contact: { label: "Dernier contact", fn: (a, b) => (b.client.lastContact?.date ?? "").localeCompare(a.client.lastContact?.date ?? "") },
  anciennete: { label: "Ancienneté", fn: (a, b) => a.client.since.localeCompare(b.client.since) },
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const initials = (name: string) =>
  name.replace(/\b(SA|Sàrl|AG|GmbH|et)\b/g, "").split(/[^\p{L}\d]+/u).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()

function ClientCard({ h, onOpen }: { h: ClientHistory; onOpen: () => void }) {
  const c = h.client
  const st = CLIENT_STATE[h.state]
  return (
    <RecordCard
      onOpen={onOpen}
      dim={h.state !== "actif"}
      avatar={<Initials text={initials(c.name)} />}
      title={c.name}
      subtitle={`${cap(c.sector)} · ${c.commune}`}
      badge={h.state !== "actif" && <StatusDot dot={st.dot} label={st.label} hint={st.hint} />}
      headline={`Recherche : ${metiersLabel(c.metiers, 3)}`}
      stats={[
        { label: "Missions", value: h.missions.length, hint: h.current ? `dont ${h.current} en cours` : `${h.hours.toLocaleString("fr-CH")} h au total` },
        { label: "Intérimaires", value: h.workers },
        {
          label: "Dernière",
          value: h.current ? "En cours" : h.last ? fmtDate(h.last, { month: "short", year: "numeric" }) : "—",
          hint: "Dernière mission",
        },
      ]}
      footer={
        <>
          <span>Client depuis {new Date(c.since).getFullYear()} · {c.size}</span>
          {c.bestLevel ? (
            <span className="relative inline-flex" title={`${c.alerts} alerte${c.alerts > 1 ? "s" : ""} en cours`}>
              <BellIcon className="size-5 text-foreground" />
              <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-red-600 text-[10px] leading-none font-semibold text-white ring-2 ring-card">
                {c.alerts}
              </span>
            </span>
          ) : (
            c.lastContact && <span title={c.lastContact.objet}>Contact {fmtDate(c.lastContact.date)}</span>
          )}
        </>
      }
    />
  )
}

export function ClientsPage() {
  const { clients, candidates, missions, meta } = useData()
  const today = meta.today
  const { f, set, reset, dirty } = useUrlFilters(DEFAULTS)
  const [shown, setShown] = React.useState(PAGE)
  const filter = (patch: Partial<typeof DEFAULTS>) => {
    setShown(PAGE)
    set(patch)
  }

  const all = React.useMemo(() => clientHistory(clients, missions, today), [clients, missions, today])
  const people = React.useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])
  const sectors = [...new Set(clients.map((c) => c.sector))].sort()
  const districts = [...new Set(clients.map((c) => c.district))].sort()
  const sizes = [...new Set(clients.map((c) => c.size))].sort()

  const q = f.q.trim().toLowerCase()
  const matches = all.filter(({ client: c }) => {
    if (q && !`${c.name} ${c.commune} ${c.registry?.uid ?? ""} ${c.metiers.join(" ")}`.toLowerCase().includes(q)) return false
    if (f.secteur !== ALL && c.sector !== f.secteur) return false
    if (f.district !== ALL && c.district !== f.district) return false
    if (f.taille !== ALL && c.size !== f.taille) return false
    return true
  })
  const rows = matches.filter((h) => f.etat === ALL || h.state === f.etat).sort(SORTS[f.tri]?.fn ?? SORTS.nom.fn)
  const selected = f.entreprise ? all.find((h) => h.client.id === f.entreprise) : undefined

  return (
    <>
      <PageHeader fictif />
      <InternalBase items={[["entreprises", clients.length], ["missions", missions.length]]} sources={["fx_clients", "fx_contacts", "fx_missions"]} />

      <DbTabsBar
        tab={f.etat}
        onTab={(v) => filter({ etat: v })}
        tabs={[
          { value: ALL, label: "Toutes", count: matches.length },
          ...STATES.map((s) => ({ value: s, label: CLIENT_STATE[s].plural, dot: CLIENT_STATE[s].dot, count: matches.filter((h) => h.state === s).length }))
            .filter((t) => t.count > 0 || t.value === f.etat),
        ]}
        q={f.q}
        onQ={(v) => filter({ q: v })}
        placeholder="Nom, commune, IDE, métier…"
      />

      <PageBody>
        <DbFilterBar
          count={`${rows.length} entreprise${rows.length > 1 ? "s" : ""}`}
          onReset={dirty(["entreprise", "etat", "q"]) ? () => reset(["etat", "q"]) : undefined}
          filters={
            <>
              <CompactSelect label="Secteur" value={f.secteur} onChange={(v) => filter({ secteur: v })}
                options={[[ALL, "Tous"], ...sectors.map((s): [string, string] => [s, cap(s)])]} />
              <CompactSelect label="District" value={f.district} onChange={(v) => filter({ district: v })}
                options={[[ALL, "Tous"], ...districts.map((d): [string, string] => [d, shortDistrict(d)])]} />
              <CompactSelect label="Taille" value={f.taille} onChange={(v) => filter({ taille: v })}
                options={[[ALL, "Toutes"], ...sizes.map((s): [string, string] => [s, cap(s)])]} />
              <CompactSelect label="Tri" value={f.tri} onChange={(v) => filter({ tri: v })}
                options={Object.entries(SORTS).map(([k, s]): [string, string] => [k, s.label])} />
            </>
          }
        />

        {rows.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.slice(0, shown).map((h) => (
              <ClientCard key={h.client.id} h={h} onOpen={() => set({ entreprise: h.client.id })} />
            ))}
          </div>
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">Aucune entreprise ne correspond aux filtres.</p>
        )}
        <MoreButton left={rows.length - shown} onMore={() => setShown((n) => n + PAGE)} />
      </PageBody>

      <Dialog open={!!selected} onOpenChange={(v) => !v && set({ entreprise: "" })}>
        <DialogContent className="max-h-[92svh] overflow-y-auto p-6 sm:max-w-5xl sm:p-8">
          <DialogTitle className="sr-only">{selected?.client.name ?? "Entreprise"}</DialogTitle>
          <DialogDescription className="sr-only">Fiche entreprise : registre du commerce et relation Flexsis</DialogDescription>
          {selected && <ClientDetail h={selected} people={people} today={today} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
