import { BellRingIcon, BuildingIcon, DatabaseIcon, LayoutDashboardIcon, MapIcon, UsersIcon, type LucideIcon } from "lucide-react"

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  subtitle: string
}

export const CONSULTANT_NAV: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboardIcon, subtitle: "Votre semaine en un coup d'œil" },
  { title: "Alertes", url: "/alertes", icon: BellRingIcon, subtitle: "Les signaux à traiter cette semaine" },
  { title: "Carte", url: "/carte", icon: MapIcon, subtitle: "Les tensions par district et par métier" },
  { title: "Clients", url: "/clients", icon: BuildingIcon, subtitle: "Votre portefeuille et ses opportunités" },
  { title: "Candidats", url: "/candidats", icon: UsersIcon, subtitle: "Le bon vivier au bon moment" },
]

export const ADMIN_NAV: NavItem[] = [
  { title: "Sources", url: "/admin/sources", icon: DatabaseIcon, subtitle: "État des sources de données" },
]

export const OTHER_PAGES: Record<string, { title: string; subtitle: string }> = {
  "/profil": { title: "Mon profil", subtitle: "Vos informations" },
  "/parametres": { title: "Paramètres", subtitle: "Préférences de l'application" },
}

export function pageInfo(pathname: string): { title: string; subtitle: string } {
  const item = [...CONSULTANT_NAV, ...ADMIN_NAV].find((n) => n.url === pathname)
  return item ?? OTHER_PAGES[pathname] ?? { title: "FlexRadar", subtitle: "" }
}
