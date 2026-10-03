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
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.url}>
            <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
              <NavLink to={item.url} end>
                <item.icon />
                <span>{item.title}</span>
              </NavLink>
            </SidebarMenuButton>
            {badges[item.url] ? (
              <SidebarMenuBadge className="bg-destructive text-white">{badges[item.url]}</SidebarMenuBadge>
            ) : null}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
