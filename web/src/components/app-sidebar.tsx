import * as React from "react"
import { ArrowLeftIcon, RadarIcon } from "lucide-react"
import { Link, useLocation } from "react-router"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useData } from "@/lib/data"
import { ADMIN_NAV, CONSULTANT_NAV } from "@/lib/nav"

function Brand() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link to="/">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <RadarIcon className="size-5" />
            </div>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-semibold">FlexRadar</span>
              <span className="truncate text-xs text-muted-foreground">Anticiper avant l'appel du client</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { meta } = useData()
  const { pathname } = useLocation()
  const admin = pathname.startsWith("/admin")

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <Brand />
      </SidebarHeader>
      <SidebarContent>
        {admin ? (
          <>
            <NavMain label="Administration" items={ADMIN_NAV} />
            <SidebarGroup className="mt-auto">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Retour à la vue consultant">
                    <Link to="/">
                      <ArrowLeftIcon />
                      <span>Retour à la vue consultant</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </>
        ) : (
          <NavMain label="Navigation" items={CONSULTANT_NAV} badges={{ "/alertes": meta.counts.AGIR ?? 0 }} />
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={meta.user} admin={admin} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
