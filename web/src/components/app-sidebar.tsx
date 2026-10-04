import * as React from "react"
import { Link } from "react-router"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { SidebarEdgeToggle } from "@/components/sidebar-edge-toggle"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { useData } from "@/lib/data"
import { NAV_SECTIONS } from "@/lib/nav"

// Logo officiel Flexsis (flexsis.ch) : logo complet, symbole seul quand la sidebar est repliée.
function Brand() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild className="hover:bg-transparent">
          <Link to="/" aria-label="Flexsis — accueil">
            <img src="/img/brand/flexsis-symbole.png" alt="" className="hidden size-8 shrink-0 object-contain group-data-[collapsible=icon]:block" />
            <span className="flex h-8 items-center px-1 group-data-[collapsible=icon]:hidden">
              <img src="/img/brand/flexsis-logo.png" alt="Flexsis" className="h-7 w-auto dark:hidden" />
              <img src="/img/brand/flexsis-logo-white.png" alt="Flexsis" className="hidden h-7 w-auto dark:block" />
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { meta } = useData()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <Brand />
      </SidebarHeader>
      <SidebarSeparator className="mx-0" />
      <SidebarContent className="pt-2">
        {NAV_SECTIONS.map((section) => (
          <NavMain key={section.label} label={section.label} items={section.items} badges={{ "/alertes": meta.counts.AGIR ?? 0 }} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={meta.user} />
      </SidebarFooter>
      <SidebarRail />
      <SidebarEdgeToggle />
    </Sidebar>
  )
}
