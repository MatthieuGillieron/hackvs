import * as React from "react"
import { ArrowLeftIcon, BriefcaseIcon, CarIcon, MapPinIcon, StarIcon, UsersIcon } from "lucide-react"

import { CandidateCard } from "@/components/candidates/candidate-card"
import { CandidateDetail } from "@/components/candidates/candidate-detail"
import { StateTabs } from "@/components/db/state-tabs"
import { CompactSelect, MoreButton } from "@/components/db/toolbar"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { fmtDate } from "@/lib/format"
import { candidateHistory } from "@/lib/history"
import { applyFilters, matchCandidates, type CandidateFilters, type CandidateMatch } from "@/lib/match"
import type { Opportunity } from "@/lib/types"
import { cn } from "@/lib/utils"

// Onglet Candidats du modal d'alerte : même direction que la page Candidats (pastilles + recherche, filtres
// compacts, grille de cartes, « Voir plus »), adaptée au rapprochement avec le besoin. Données simulées.

const PAGE = 21 // multiple de 3

function Toggle({ on, onChange, icon: Icon, children }: {
  on: boolean
  onChange: (v: boolean) => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
        on ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" /> {children}
    </button>
  )
}

// Pourquoi ce profil pour cette alerte : 2–3 repères courts sur la carte.
function reasons(m: CandidateMatch, company: boolean, dispoFiltered: boolean): { label: string; tone?: "good" }[] {
  const out: { label: string; tone?: "good" }[] = []
  if (company && m.clientMissions > 0) out.push({ label: `Déjà chez ce client (${m.clientMissions})`, tone: "good" })
  if (m.availableFor && !dispoFiltered) out.push({ label: "Libre au démarrage", tone: "good" })
  if (m.sameDistrict) out.push({ label: "Même district" })
  if (m.metier === "secondaire") out.push({ label: "Métier secondaire" })
  if (m.avgNote !== null) out.push({ label: `★ ${m.avgNote.toLocaleString("fr-CH", { maximumFractionDigits: 1 })}/5` })
  out.push({ label: `${m.c.taux_horaire_souhaite.toFixed(0)} CHF/h` })
  return out.slice(0, 4)
}

export function CandidateMatcher({ o }: { o: Opportunity }) {
  const { candidates, missions, meta } = useData()
  const today = meta.today
  const all = React.useMemo(() => matchCandidates(o, candidates, missions), [o, candidates, missions])
  const histories = React.useMemo(
    () => new Map(candidateHistory(all.map((m) => m.c), missions, today).map((h) => [h.candidate.id, h])),
    [all, missions, today],
  )
  const maxTarif = Math.ceil(Math.max(30, ...all.map((m) => m.c.taux_horaire_souhaite)))
  const defaults: CandidateFilters = {
    dispo: "besoin", secondaires: true, tarifMax: maxTarif, experienceMin: 0,
    memeDistrict: false, dejaClient: false, vehicule: false, bienNote: false,
  }
  const [f, setF] = React.useState(defaults)
  const [shown, setShown] = React.useState(PAGE)
  const [peek, setPeek] = React.useState<string | null>(null)
  const set = (patch: Partial<CandidateFilters>) => {
    setF((prev) => ({ ...prev, ...patch }))
    setShown(PAGE)
  }
  const isCompany = o.kind === "entreprise"
  const dirty = JSON.stringify(f) !== JSON.stringify(defaults)

  // Les pastilles comptent les candidats qui passent les autres filtres.
  const count = (dispo: CandidateFilters["dispo"]) => applyFilters(all, { ...f, dispo }, today).length
  const rows = applyFilters(all, f, today)
  const tarifs = [...new Set([25, 30, 35, 40, maxTarif].filter((t) => t <= maxTarif))]

  const peeked = peek ? histories.get(peek) : undefined
  if (peeked) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setPeek(null)}>
          <ArrowLeftIcon /> Retour aux candidats
        </Button>
        <div className="rounded-xl border bg-card p-6 shadow-xs">
          <CandidateDetail h={peeked} today={today} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StateTabs
          value={f.dispo}
          onChange={(v) => set({ dispo: v as CandidateFilters["dispo"] })}
          items={[
            { value: "besoin", label: `Libres au ${fmtDate(o.window[0])}`, dot: "bg-emerald-500", count: count("besoin") },
            { value: "maintenant", label: "Disponibles maintenant", dot: "bg-sky-500", count: count("maintenant") },
            { value: "tous", label: "Tous", count: count("tous") },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <CompactSelect label="Expérience" value={String(f.experienceMin)} onChange={(v) => set({ experienceMin: Number(v) })}
            options={[0, 2, 5, 10].map((y): [string, string] => [String(y), y ? `${y} ans +` : "Toute"])} />
          <CompactSelect label="Tarif max" value={String(f.tarifMax)} onChange={(v) => set({ tarifMax: Number(v) })}
            options={tarifs.map((t): [string, string] => [String(t), t === maxTarif ? "Tous" : `${t} CHF/h`])} />
        </div>
      </div>

      {/* Critères en une ligne ; le nombre de candidats est déjà sur les onglets. */}
      <div className="flex flex-wrap items-center gap-2">
        {isCompany && (
          <Toggle on={f.dejaClient} onChange={(v) => set({ dejaClient: v })} icon={BriefcaseIcon}>Déjà chez ce client</Toggle>
        )}
        <Toggle on={f.memeDistrict} onChange={(v) => set({ memeDistrict: v })} icon={MapPinIcon}>Même district</Toggle>
        <Toggle on={f.vehicule} onChange={(v) => set({ vehicule: v })} icon={CarIcon}>Véhiculé</Toggle>
        <Toggle on={f.bienNote} onChange={(v) => set({ bienNote: v })} icon={StarIcon}>Bien noté (≥ 4/5)</Toggle>
        <Toggle on={!f.secondaires} onChange={(v) => set({ secondaires: !v })} icon={UsersIcon}>Métier principal</Toggle>
        {dirty && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setF(defaults); setShown(PAGE) }}>Réinitialiser</Button>
        )}
      </div>

      {rows.length ? (
        <div className="grid gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3">
          {rows.slice(0, shown).map((m) => {
            const h = histories.get(m.c.id)
            return h && (
              <CandidateCard key={m.c.id} h={h} today={today} reasons={reasons(m, isCompany, f.dispo === "besoin")} onOpen={() => setPeek(m.c.id)} />
            )
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun candidat avec ces critères : élargissez les filtres ou lancez un sourcing.
        </p>
      )}
      <MoreButton left={rows.length - shown} onMore={() => setShown((n) => n + PAGE)} />
    </div>
  )
}
