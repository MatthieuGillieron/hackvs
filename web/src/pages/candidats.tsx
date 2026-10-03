import * as React from "react"
import { CarIcon } from "lucide-react"

import { CandidateDetail } from "@/components/candidates/candidate-detail"
import { InternalBase } from "@/components/db/internal-base"
import { Initials, RecordCard, StatusDot } from "@/components/db/record-card"
import { CompactSelect, DbToolbar, MoreButton } from "@/components/db/toolbar"
import { PageHeader } from "@/components/page"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useData } from "@/lib/data"
import { fmtDate, shortDistrict, shortMetier } from "@/lib/format"
import { CANDIDATE_STATUT, candidateHistory, sinceLabel, type CandidateHistory } from "@/lib/history"
import type { Candidate } from "@/lib/types"
import { useUrlFilters } from "@/lib/url-filters"

// Candidats : la base des candidats Flexsis, actuels et passés (DONNÉES SIMULÉES).
// Grille de cartes courtes ; la fiche complète (profil, certifications, missions) s'ouvre au clic.

const ALL = "all"
const DEFAULTS = { statut: ALL, q: "", metier: ALL, district: ALL, mobilite: ALL, tri: "nom", candidat: "" }
const PAGE = 21 // multiple de 3
const STATUTS = Object.keys(CANDIDATE_STATUT) as Candidate["statut"][]

const SORTS: Record<string, { label: string; fn: (a: CandidateHistory, b: CandidateHistory) => number }> = {
  nom: { label: "Nom", fn: (a, b) => `${a.candidate.nom} ${a.candidate.prenom}`.localeCompare(`${b.candidate.nom} ${b.candidate.prenom}`, "fr") },
  dispo: { label: "Disponibilité", fn: (a, b) => (a.candidate.disponible_des ?? "9999").localeCompare(b.candidate.disponible_des ?? "9999") },
  mission: { label: "Dernière mission", fn: (a, b) => Number(!!b.current) - Number(!!a.current) || (b.last ?? "").localeCompare(a.last ?? "") },
  missions: { label: "Nb de missions", fn: (a, b) => b.missions.length - a.missions.length },
  experience: { label: "Expérience", fn: (a, b) => b.candidate.experience_ans - a.candidate.experience_ans },
  inscription: { label: "Inscription", fn: (a, b) => b.candidate.inscrit_le.localeCompare(a.candidate.inscrit_le) },
}

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

function CandidateCard({ h, today, onOpen }: { h: CandidateHistory; today: string; onOpen: () => void }) {
  const c = h.candidate
  const st = CANDIDATE_STATUT[c.statut]
  return (
    <RecordCard
      onOpen={onOpen}
      dim={c.statut === "ancien"}
      avatar={<Initials text={`${c.prenom[0]}${c.nom[0]}`} />}
      title={`${c.prenom} ${c.nom}`}
      subtitle={`${shortMetier(c.metierLabel)} · ${c.commune}`}
      badge={<StatusDot dot={st.dot} label={st.label} />}
      headline={situation(h, today)}
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

export function CandidatsPage() {
  const { candidates, missions, meta } = useData()
  const today = meta.today
  const { f, set, reset, dirty } = useUrlFilters(DEFAULTS)
  const [shown, setShown] = React.useState(PAGE)
  const filter = (patch: Partial<typeof DEFAULTS>) => {
    setShown(PAGE)
    set(patch)
  }

  const all = React.useMemo(() => candidateHistory(candidates, missions, today), [candidates, missions, today])
  const metiers = React.useMemo(() => [...new Set(candidates.map((c) => c.metierLabel))].sort(), [candidates])
  const districts = React.useMemo(() => [...new Set(candidates.map((c) => c.district))].sort(), [candidates])

  const q = f.q.trim().toLowerCase()
  const matches = all.filter(({ candidate: c }) => {
    if (q && !`${c.prenom} ${c.nom} ${c.id} ${c.commune} ${c.metierLabel} ${c.certifications.join(" ")}`.toLowerCase().includes(q)) return false
    if (f.metier !== ALL && c.metierLabel !== f.metier && !c.metiersSecondaires.includes(f.metier)) return false
    if (f.district !== ALL && c.district !== f.district) return false
    if (f.mobilite === "vehicule" && !c.vehicule) return false
    if (f.mobilite === "40" && c.rayon_km < 40) return false
    return true
  })
  // Les pastilles comptent les candidats qui passent les autres filtres.
  const rows = matches.filter((h) => f.statut === ALL || h.candidate.statut === f.statut).sort(SORTS[f.tri]?.fn ?? SORTS.nom.fn)
  const selected = f.candidat ? all.find((h) => h.candidate.id === f.candidat) : undefined

  return (
    <>
      <PageHeader fictif />
      <InternalBase items={[["candidats", candidates.length], ["missions", missions.length]]} sources={["fx_candidats", "fx_missions"]} />

      <DbToolbar
        tab={f.statut}
        onTab={(v) => filter({ statut: v })}
        tabs={[
          { value: ALL, label: "Tous", count: matches.length },
          ...STATUTS.map((s) => ({ value: s, label: CANDIDATE_STATUT[s].plural, dot: CANDIDATE_STATUT[s].dot, count: matches.filter((h) => h.candidate.statut === s).length })),
        ]}
        q={f.q}
        onQ={(v) => filter({ q: v })}
        placeholder="Nom, commune, certification…"
        count={`${rows.length} candidat${rows.length > 1 ? "s" : ""}`}
        onReset={dirty(["candidat", "statut", "q"]) ? () => reset(["statut", "q"]) : undefined}
        filters={
          <>
            <CompactSelect label="Métier" value={f.metier} onChange={(v) => filter({ metier: v })}
              options={[[ALL, "Tous"], ...metiers.map((m): [string, string] => [m, shortMetier(m)])]} />
            <CompactSelect label="District" value={f.district} onChange={(v) => filter({ district: v })}
              options={[[ALL, "Tous"], ...districts.map((d): [string, string] => [d, shortDistrict(d)])]} />
            <CompactSelect label="Mobilité" value={f.mobilite} onChange={(v) => filter({ mobilite: v })}
              options={[[ALL, "Toutes"], ["vehicule", "Véhiculé"], ["40", "Rayon ≥ 40 km"]]} />
            <CompactSelect label="Tri" value={f.tri} onChange={(v) => filter({ tri: v })}
              options={Object.entries(SORTS).map(([k, s]): [string, string] => [k, s.label])} />
          </>
        }
      />

      {rows.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.slice(0, shown).map((h) => (
            <CandidateCard key={h.candidate.id} h={h} today={today} onOpen={() => set({ candidat: h.candidate.id })} />
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">Aucun candidat ne correspond aux filtres.</p>
      )}
      <MoreButton left={rows.length - shown} onMore={() => setShown((n) => n + PAGE)} />

      <Dialog open={!!selected} onOpenChange={(v) => !v && set({ candidat: "" })}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="sr-only">{selected ? `${selected.candidate.prenom} ${selected.candidate.nom}` : "Candidat"}</DialogTitle>
          <DialogDescription className="sr-only">Fiche candidat (données simulées)</DialogDescription>
          {selected && <CandidateDetail h={selected} today={today} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
