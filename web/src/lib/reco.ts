import { metiersLabel, shortDistrict } from "@/lib/format"
import type { Opportunity } from "@/lib/types"

// Plan d'action d'une alerte : règles simples dérivées de la fiche (rien d'inventé, chaque recommandation
// s'appuie sur un fait affiché ailleurs). Pourra être reformulé par LLM (prototype/extract.py) à l'export.

export interface Reco {
  key: string
  title: string
  detail: string
  when: string // « Cette semaine », « Avant le 12 nov. »…
  urgent: boolean
  fictif?: boolean // s'appuie sur des données Flexsis simulées (vivier, historique)
}

const fmt = (iso: string) =>
  new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("fr-CH", { day: "numeric", month: "short" })

// Date (ISO) à N semaines avant le début du besoin, jamais avant aujourd'hui.
function before(o: Opportunity, today: string, weeks: number): string {
  const d = new Date(o.window[0] + "T00:00:00")
  d.setDate(d.getDate() - weeks * 7)
  const iso = d.toISOString().slice(0, 10)
  return iso < today ? today : iso
}

const plural = (n: number, s: string, p = s + "s") => `${n} ${n > 1 ? p : s}`

export function recommendations(o: Opportunity, today: string): Reco[] {
  const out: Reco[] = []
  const soon = o.weeks <= 2
  const metiers = metiersLabel(o.metiers, 3)
  const callBy = before(o, today, 2)
  const whenCall = callBy === today ? "Cette semaine" : `Avant le ${fmt(callBy)}`
  const pub = o.signals.filter((s) => !s.fictif)

  // 1. Le contact client.
  if (o.kind === "entreprise") {
    const projet = pub.find((s) => s.family === "projet")
    out.push({
      key: "call",
      title: `Appeler ${o.target}`,
      detail: projet
        ? `Se positionner avant le démarrage : ${projet.label.split(" : ").slice(1).join(" : ").slice(0, 90) || "projet détecté"}.`
        : `Proposer un renfort ${metiers} pendant que les annonces sont ouvertes.`,
      when: whenCall,
      urgent: soon || o.level === "AGIR",
    })
  } else {
    const top = o.probable.slice(0, 3)
    out.push({
      key: "targets",
      title: top.length ? `Cibler ${top.map((p) => p.company).join(", ")}` : `Cibler les clients du district de ${shortDistrict(o.district)}`,
      detail: top.length
        ? "Entreprises les plus probables d'après leurs marchés et annonces dans la zone (indicatif)."
        : "Aucun antécédent dans la zone : commencer par le portefeuille Flexsis du district.",
      when: whenCall,
      urgent: soon,
    })
  }

  // 2. Les profils.
  const v = o.vivier
  if (v.disponibles > 0) {
    out.push({
      key: "shortlist",
      title: `Présélectionner ${plural(v.disponibles, "profil disponible", "profils disponibles")}`,
      detail: `Arriver à l'appel avec des noms (${metiers}).`,
      when: whenCall,
      urgent: soon,
      fictif: true,
    })
  }
  if (v.anciens > 0) {
    out.push({
      key: "reactivate",
      title: `Réactiver ${plural(v.anciens, "ancien intérimaire", "anciens intérimaires")}`,
      detail: "Vérifier leur disponibilité avant de s'engager sur un volume.",
      when: "Cette semaine",
      urgent: v.a_sourcer > 0,
      fictif: true,
    })
  }
  if (v.a_sourcer > 0) {
    out.push({
      key: "source",
      title: `Sourcer ${plural(v.a_sourcer, "profil manquant", "profils manquants")}`,
      detail: `Le vivier ne couvre pas le besoin estimé (${v.besoin}) : lancer la recherche ${metiers}.`,
      when: soon ? "Immédiatement" : `Avant le ${fmt(before(o, today, 1))}`,
      urgent: true,
      fictif: true,
    })
  }

  // 3. Le contexte de marché.
  const agences = pub.filter((s) => s.type === "agences_concurrentes").length
  const tension = Number(pub.find((s) => s.type === "tension_zone")?.label.match(/^(\d+)/)?.[1] ?? 0)
  const concurrents = agences || tension
  if (concurrents >= 3) {
    out.push({
      key: "competition",
      title: "Prendre de vitesse la concurrence",
      detail: `${plural(concurrents, "annonce")} d'agences concurrentes sur ces métiers dans la zone : l'entreprise est déjà sollicitée.`,
      when: "Cette semaine",
      urgent: true,
    })
  }
  const ao = pub.find((s) => s.type === "appel_offres")
  if (ao && !pub.some((s) => s.type === "adjudication")) {
    const delai = ao.label.match(/délai (\d{4}-\d{2}-\d{2})/)?.[1]
    out.push({
      key: "tender",
      title: "Surveiller l'adjudication",
      detail: "Le marché n'est pas encore attribué : contacter le lauréat dès la publication SIMAP.",
      when: delai && delai >= today ? `Après le ${fmt(delai)}` : "À la publication",
      urgent: false,
    })
  }
  if (o.signals.some((s) => s.type === "client_recurrent")) {
    out.push({
      key: "history",
      title: "S'appuyer sur l'historique",
      detail: "Le client a eu ce besoin à la même période les années précédentes : le rappeler pendant l'appel.",
      when: "Pendant l'appel",
      urgent: false,
      fictif: true,
    })
  }

  // Le contact client reste en tête ; ensuite les urgences d'abord (tri stable).
  const [first, ...rest] = out
  return [first, ...rest.sort((a, b) => Number(b.urgent) - Number(a.urgent))].slice(0, 5)
}
