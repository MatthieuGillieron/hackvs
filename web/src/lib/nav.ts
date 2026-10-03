import { BellRingIcon, BuildingIcon, DatabaseIcon, LayoutDashboardIcon, MapIcon, UsersIcon, type LucideIcon } from "lucide-react"

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  subtitle: string
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Prospection",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboardIcon, subtitle: "Votre semaine en un coup d'œil" },
      { title: "Alertes", url: "/alertes", icon: BellRingIcon, subtitle: "Les signaux à traiter cette semaine" },
      { title: "Carte", url: "/carte", icon: MapIcon, subtitle: "Les tensions par district et par métier" },
    ],
  },
  {
    label: "Portefeuille",
    items: [
      { title: "Clients", url: "/clients", icon: BuildingIcon, subtitle: "Toutes les entreprises clientes, actuelles et passées" },
      { title: "Candidats", url: "/candidats", icon: UsersIcon, subtitle: "Tous les candidats, actuels et passés" },
    ],
  },
  {
    label: "Données",
    items: [{ title: "Sources", url: "/sources", icon: DatabaseIcon, subtitle: "État des sources de données" }],
  },
]

export const OTHER_PAGES: Record<string, { title: string; subtitle: string }> = {
  "/profil": { title: "Mon profil", subtitle: "Vos informations" },
  "/parametres": { title: "Paramètres", subtitle: "Préférences de l'application" },
}

export function pageInfo(pathname: string): { title: string; subtitle: string } {
  const item = NAV_SECTIONS.flatMap((s) => s.items).find((n) => n.url === pathname)
  return item ?? OTHER_PAGES[pathname] ?? { title: "FlexRadar", subtitle: "" }
}
