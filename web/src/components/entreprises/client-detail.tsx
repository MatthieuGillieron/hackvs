import { Link, useNavigate } from "react-router"
import { ArrowRightIcon, ExternalLinkIcon, LandmarkIcon } from "lucide-react"

import { InfoRow, MissionTable } from "@/components/db/mission-table"
import { FictifBadge } from "@/components/page"
import { Badge } from "@/components/ui/badge"
import { useData } from "@/lib/data"
import { fmtDate, shortDistrict } from "@/lib/format"
import { CLIENT_STATE, sinceLabel, type ClientHistory } from "@/lib/history"
import type { Candidate } from "@/lib/types"
import { cn } from "@/lib/utils"

const long = (iso: string | null | undefined) => fmtDate(iso, { day: "numeric", month: "long", year: "numeric" })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Fiche d'une entreprise cliente : registre du commerce (réel, Zefix) + relation Flexsis (simulée).
export function ClientDetail({ h, people, today }: { h: ClientHistory; people: Map<string, Candidate>; today: string }) {
  const c = h.client
  const r = c.registry
  const navigate = useNavigate()
  const st = CLIENT_STATE[h.state]
  const { opportunities } = useData()
  const alerts = c.alertKeys.map((k) => opportunities.find((o) => o.key === k)).filter((o) => !!o)
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
        <div>
          <h2 className="text-xl font-semibold">{c.name}</h2>
          <p className="text-sm text-muted-foreground">{cap(c.sector)} · {c.commune} ({shortDistrict(c.district)}) · {c.id}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs" title={st.hint}>
          <span className={cn("size-2 rounded-full", st.dot)} />
          {st.label}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border p-4">
          <div className="mb-1 flex items-center justify-between gap-2 text-sm font-medium">
            <span className="inline-flex items-center gap-1.5"><LandmarkIcon className="size-4" /> Registre du commerce</span>
            {r && (
              <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:underline">
                Zefix <ExternalLinkIcon className="size-3" />
              </a>
            )}
          </div>
          {r ? (
            <>
              <InfoRow label="Raison sociale">{r.name}</InfoRow>
              <InfoRow label="IDE">{r.uid ?? "—"}</InfoRow>
              <InfoRow label="Adresse">{r.address ?? r.commune ?? "—"}</InfoRow>
              {r.branches > 0 && <InfoRow label="Succursales">{r.branches}</InfoRow>}
              {r.lastPublications.length > 0 && <InfoRow label="Dernières FOSC">{r.lastPublications.map((d) => fmtDate(d, { day: "numeric", month: "short", year: "numeric" })).join(" · ")}</InfoRow>}
              {r.purpose && <p className="mt-2 line-clamp-5 text-xs leading-relaxed text-muted-foreground">{r.purpose}</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Pas de fiche Zefix rapprochée pour ce nom.</p>
          )}
        </section>

        <section className="rounded-lg border p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium">Relation Flexsis <FictifBadge /></div>
          <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <InfoRow label="Client depuis">{long(c.since)}</InfoRow>
              <InfoRow label="Taille">{c.size}</InfoRow>
              <InfoRow label="Potentiel">{c.potential}</InfoRow>
              <InfoRow label="Consultant">{c.consultant}</InfoRow>
            </div>
            <div>
              <InfoRow label="Dernier contact">
                {c.lastContact ? `${long(c.lastContact.date)} · ${c.lastContact.type} (${c.lastContact.objet.toLowerCase()})` : "—"}
              </InfoRow>
              <InfoRow label="Alertes en cours">
                {alerts.length ? (
                  <span className="grid gap-1.5">
                    {alerts.map((o) => (
                      <Link key={o.key} to={`/alertes?alerte=${encodeURIComponent(o.key)}`} className="group inline-flex items-center gap-2">
                        <span className="text-primary group-hover:underline">Voir l'alerte</span>
                        <ArrowRightIcon className="size-3.5 text-primary" />
                      </Link>
                    ))}
                  </span>
                ) : "Aucune"}
              </InfoRow>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.metiers.map((m) => <Badge key={m} variant="secondary" className="font-normal">{m}</Badge>)}
          </div>
        </section>
      </div>

      <section>
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">Missions ({h.missions.length})</span>
          <span className="text-xs text-muted-foreground">
            {h.hours.toLocaleString("fr-CH")} h · {h.workers} intérimaire{h.workers > 1 ? "s" : ""} · dernière {sinceLabel(h.last, today, h.current > 0)}
          </span>
        </div>
        <MissionTable
          missions={h.missions}
          who={(m) => {
            const p = people.get(m.candidat)
            return p ? `${p.prenom} ${p.nom}` : m.candidat
          }}
          onWho={(m) => navigate(`/candidats?candidat=${m.candidat}`)}
          avatar={(m) => people.get(m.candidat)}
        />
      </section>
    </div>
  )
}
