import { NavLink, useLocation } from "react-router"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { NavItem } from "@/lib/nav"

export function NavMain({
  label,
  items,
  badges = {},
}: {
  label: string
  items: NavItem[]
  badges?: Record<string, number>
}) {
  const { pathname } = useLocation()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {items.map((item) => (
          <SidebarMenuItem key={item.url}>
            <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title} className="h-10 gap-3 px-3 text-base [&_svg]:size-5">
              <NavLink to={item.url} end>
                <item.icon />
                <span>{item.title}</span>
              </NavLink>
            </SidebarMenuButton>
            {badges[item.url] ? (
              <SidebarMenuBadge className="top-2.5! right-2 bg-destructive text-white">{badges[item.url]}</SidebarMenuBadge>
            ) : null}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
