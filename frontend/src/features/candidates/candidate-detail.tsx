import { CarIcon, MapPinIcon } from "lucide-react"

import { InfoRow, MissionTable } from "@/components/records/mission-table"
import { CandidateAvatar } from "@/components/records/record-card"
import { FictifBadge } from "@/components/layout/page"
import { Badge } from "@/components/ui/badge"
import { fmtDate, shortDistrict, shortMetier } from "@/lib/format"
import { CANDIDATE_STATUT, sinceLabel, type CandidateHistory } from "@/lib/history"
import type { Candidate } from "@/lib/types"
import { cn } from "@/lib/utils"

const LANG: Record<string, string> = { fr: "Français", de: "Allemand", it: "Italien", pt: "Portugais", es: "Espagnol", sq: "Albanais", en: "Anglais" }
const long = (iso: string | null) => fmtDate(iso, { day: "numeric", month: "long", year: "numeric" })

export function StatutLabel({ c, today }: { c: Candidate; today: string }) {
  const s = CANDIDATE_STATUT[c.statut]
  const later = c.disponible_des && c.disponible_des > today && c.statut !== "ancien"
  return (
    <span className="inline-flex flex-col text-xs">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className={cn("size-2 rounded-full", s.dot)} />
        {s.label}
      </span>
      {later && <span className="pl-3.5 text-muted-foreground">libre le {fmtDate(c.disponible_des)}</span>}
    </span>
  )
}

// Fiche d'un candidat de la base : profil, mobilité, compétences, historique des missions (tout simulé).
export function CandidateDetail({ h, today }: { h: CandidateHistory; today: string }) {
  const c = h.candidate
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
        <div className="flex items-center gap-4">
          <CandidateAvatar c={c} className="size-20 rounded-2xl" />
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              {c.prenom} {c.nom} <FictifBadge />
            </h2>
            <p className="text-sm text-muted-foreground">{c.metierLabel} · {c.id}</p>
          </div>
        </div>
        <StatutLabel c={c} today={today} />
      </div>

      <div className="grid gap-x-6 sm:grid-cols-2">
        <div>
          <InfoRow label="Métier principal">{c.metierLabel}</InfoRow>
          <InfoRow label="Autres métiers">{c.metiersSecondaires.length ? c.metiersSecondaires.map(shortMetier).join(", ") : "—"}</InfoRow>
          <InfoRow label="Expérience">{c.experience_ans} ans</InfoRow>
          <InfoRow label="Langues">{c.langues.map((l) => LANG[l] ?? l).join(", ")}</InfoRow>
          <InfoRow label="Taux souhaité">{c.taux_horaire_souhaite.toLocaleString("fr-CH", { minimumFractionDigits: 2 })} CHF/h</InfoRow>
        </div>
        <div>
          <InfoRow label="Domicile">
            <span className="inline-flex items-center gap-1"><MapPinIcon className="size-3.5" />{c.commune} ({shortDistrict(c.district)})</span>
          </InfoRow>
          <InfoRow label="Mobilité">
            <span className="inline-flex items-center gap-1">{c.rayon_km} km{c.vehicule && <> · <CarIcon className="size-3.5" /> véhiculé</>}</span>
          </InfoRow>
          <InfoRow label="Permis de conduire">{c.permis === "aucun" ? "Aucun" : c.permis}</InfoRow>
          <InfoRow label="Inscrit le">{long(c.inscrit_le)}</InfoRow>
          <InfoRow label="Disponible dès">{c.statut === "ancien" ? "—" : long(c.disponible_des)}</InfoRow>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-sm font-medium">Certifications</div>
        {c.certifications.length ? (
          <div className="flex flex-wrap gap-1.5">
            {c.certifications.map((x) => <Badge key={x} variant="secondary" className="font-normal">{x}</Badge>)}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune certification enregistrée.</p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">Missions ({h.missions.length})</span>
          <span className="text-xs text-muted-foreground">
            {h.hours.toLocaleString("fr-CH")} h · {h.clients} client{h.clients > 1 ? "s" : ""} · dernière {sinceLabel(h.last, today, !!h.current)}
          </span>
        </div>
        <MissionTable missions={h.missions} who={(m) => m.client} />
      </div>
    </div>
  )
}
