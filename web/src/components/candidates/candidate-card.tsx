import { CarIcon } from "lucide-react"

import { CandidateAvatar, RecordCard, StatusDot } from "@/components/db/record-card"
import { fmtDate, shortDistrict, shortMetier } from "@/lib/format"
import { CANDIDATE_STATUT, sinceLabel, type CandidateHistory } from "@/lib/history"
import { cn } from "@/lib/utils"

// Carte courte d'un candidat (page Candidats, onglet « Profils à proposer » de la fiche d'appel).

// Mini-titre : la situation du candidat en une phrase.
function situation(h: CandidateHistory, today: string): string {
  const c = h.candidate
  switch (c.statut) {
    case "disponible":
      return !c.disponible_des || c.disponible_des <= today ? "Disponible maintenant" : `Disponible dès le ${fmtDate(c.disponible_des)}`
    case "en mission":
      return h.current ? `Chez ${h.current.client} jusqu'au ${fmtDate(h.current.fin)}` : "En mission"
    case "indisponible":
      return c.disponible_des && c.disponible_des > today ? `Indisponible jusqu'au ${fmtDate(c.disponible_des)}` : "Indisponible"
    case "ancien":
      return h.last ? `Plus actif · dernière mission ${sinceLabel(h.last, today)}` : "Plus actif · jamais placé"
  }
}

export function CandidateCard({ h, today, onOpen, reasons }: {
  h: CandidateHistory
  today: string
  onOpen: () => void
  reasons?: { label: string; tone?: "good" }[] // pourquoi ce profil pour l'alerte (onglet Candidats du modal)
}) {
  const c = h.candidate
  const st = CANDIDATE_STATUT[c.statut]
  return (
    <RecordCard
      onOpen={onOpen}
      dim={c.statut === "ancien"}
      avatar={<CandidateAvatar c={c} />}
      title={`${c.prenom} ${c.nom}`}
      subtitle={`${shortMetier(c.metierLabel)} · ${c.commune}`}
      badge={<StatusDot dot={st.dot} label={st.label} />}
      headline={situation(h, today)}
      extra={reasons?.length ? (
        <ul className="flex flex-wrap gap-1">
          {reasons.map((r) => (
            <li key={r.label} className={cn("rounded-full px-2 py-0.5 text-[11px]",
              r.tone === "good" ? "bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
              {r.label}
            </li>
          ))}
        </ul>
      ) : undefined}
      stats={[
        { label: "Expérience", value: `${c.experience_ans} an${c.experience_ans > 1 ? "s" : ""}` },
        { label: "Missions", value: h.missions.length, hint: `${h.hours.toLocaleString("fr-CH")} h chez ${h.clients} client(s)` },
        {
          label: "Mobilité",
          value: <span className="inline-flex items-center gap-1">{c.rayon_km} km{c.vehicule && <CarIcon className="size-3.5 text-muted-foreground" />}</span>,
          hint: `${shortDistrict(c.district)} · rayon ${c.rayon_km} km${c.vehicule ? " · véhiculé" : ""} · permis ${c.permis}`,
        },
      ]}
      footer={
        <>
          <span>{c.id}</span>
          <span>Inscrit {fmtDate(c.inscrit_le, { month: "short", year: "numeric" })}</span>
        </>
      }
    />
  )
}
