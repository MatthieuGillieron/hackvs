import * as React from "react"
import { RadarIcon } from "lucide-react"
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

function Brand() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link to="/">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <RadarIcon className="size-5" />
            </div>
            <span className="truncate font-semibold">FlexRadar</span>
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
