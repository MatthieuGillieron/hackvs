import * as React from "react"
import { HandshakeIcon, HistoryIcon, MessageSquareIcon, StarIcon } from "lucide-react"

import { FictifBadge } from "@/components/page"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { fmtDate, shortMetier } from "@/lib/format"
import { clientHistory } from "@/lib/match"
import { cn } from "@/lib/utils"

const fmtYear = (iso: string) => fmtDate(iso, { day: "numeric", month: "short", year: "numeric" })

// Chiffre clé en ligne, sans fond : la carte reste légère, les chiffres restent lisibles.
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 px-3 first:pl-0">
      <span className="font-semibold tabular-nums">{value}</span>{" "}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

// Carte « Historique avec Flexsis » de l'onglet Entreprise : client ou non, missions passées (données simulées).
// Remplit la hauteur de l'onglet ; 5 missions au premier coup d'œil (les autres sur demande, la liste défile si
// dépliée), calées en bas de la carte ; les sections du haut gardent un écart fixe.
const MISSIONS_LIMIT = 5

export function CompanyHistory({ company, className }: { company: string | null; className?: string }) {
  const { clients, missions, candidates } = useData()
  const h = clientHistory(company, clients, missions)
  const names = new Map(candidates.map((c) => [c.id, `${c.prenom} ${c.nom}`]))
  const known = h.client || h.missions.length > 0
  const [all, setAll] = React.useState(false)
  const shown = all ? h.missions : h.missions.slice(0, MISSIONS_LIMIT)

  return (
    <section className={cn("flex min-h-0 flex-col rounded-xl border bg-card p-4 shadow-xs", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <HistoryIcon className="size-4 text-muted-foreground" /> Historique avec Flexsis
          {known && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              Client
            </span>
          )}
        </h3>
        <FictifBadge />
      </div>

      {!known ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center">
          <HandshakeIcon className="size-7 text-primary" />
          <p className="text-sm font-medium">Cette entreprise n'a jamais fait appel à Flexsis.</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Premier contact : se présenter avec le projet détecté et des profils disponibles dans la région.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          {h.client && (
            <p className="-mt-1 text-xs text-muted-foreground">
              Client depuis le {fmtYear(h.client.since)} · suivi par {h.client.consultant} · potentiel {h.client.potential}
            </p>
          )}
          <div className="flex flex-wrap items-baseline gap-y-1 divide-x text-sm">
            <Stat label="missions" value={h.missions.length} />
            <Stat label="heures" value={h.hours.toLocaleString("fr-CH")} />
            <Stat label="en cours" value={h.missions.filter((m) => m.statut === "en cours").length} />
            <Stat label="note moy." value={h.avgNote !== null ? `${h.avgNote.toLocaleString("fr-CH", { maximumFractionDigits: 1 })}/5` : "—"} />
          </div>
          {h.metiers.length > 0 && (
            <div className="text-xs">
              <p className="mb-0.5 text-muted-foreground">Métiers déjà fournis</p>
              <p>
                {h.metiers.slice(0, 4).map(([m, n], i) => (
                  <span key={m}>
                    {i > 0 && ", "}
                    {shortMetier(m)} <span className="text-muted-foreground">({n})</span>
                  </span>
                ))}
              </p>
            </div>
          )}
          {h.client?.lastContact && (
            <div className="text-xs">
              <p className="mb-0.5 flex items-center gap-1.5 text-muted-foreground">
                <MessageSquareIcon className="size-3.5 shrink-0" />
                Dernier contact · {h.client.lastContact.type} du {fmtYear(h.client.lastContact.date)}
              </p>
              <p>{h.client.lastContact.objet}</p>
            </div>
          )}
          {h.missions.length > 0 && (
            <div className={cn("mt-auto flex min-h-0 flex-col", all && "flex-1")}>
              <p className="mb-1 text-xs text-muted-foreground">Missions ({h.missions.length})</p>
              <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-lg border">
                {shown.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{shortMetier(m.metier)} · {names.get(m.candidat) ?? m.candidat}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtYear(m.debut)} → {fmtYear(m.fin)} · {m.heures} h
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <div className={cn(m.statut === "en cours" ? "font-medium text-primary" : "text-muted-foreground")}>{m.statut}</div>
                      {m.note !== null && (
                        <div className="flex items-center justify-end gap-0.5 text-amber-600">
                          <StarIcon className="size-3 fill-current" /> {m.note}/5
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {h.missions.length > MISSIONS_LIMIT && (
                <Button variant="ghost" size="sm" className="mt-1 self-center text-muted-foreground" onClick={() => setAll((v) => !v)}>
                  {all ? "Réduire" : `Voir les ${h.missions.length - MISSIONS_LIMIT} autres missions`}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
