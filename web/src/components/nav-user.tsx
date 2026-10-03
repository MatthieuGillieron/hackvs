import { ChevronsUpDownIcon, LogOutIcon, SettingsIcon, ShieldIcon, UserIcon, UsersIcon } from "lucide-react"
import { useNavigate } from "react-router"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import type { Meta } from "@/lib/types"

function Identity({ user }: { user: Meta["user"] }) {
  return (
    <>
      <Avatar className="h-8 w-8 rounded-lg">
        <AvatarFallback className="rounded-lg bg-primary/10 text-primary">{user.initials}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">{user.role}</span>
      </div>
    </>
  )
}

export function NavUser({ user, admin }: { user: Meta["user"]; admin: boolean }) {
  const { isMobile } = useSidebar()
  const navigate = useNavigate()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Identity user={user} />
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5">
                <Identity user={user} />
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => navigate("/profil")}>
                <UserIcon />
                Mon profil
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate("/parametres")}>
                <SettingsIcon />
                Paramètres
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {admin ? (
              <DropdownMenuItem onSelect={() => navigate("/")}>
                <UsersIcon />
                Vue consultant
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => navigate("/admin/sources")}>
                <ShieldIcon />
                Vue admin
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <LogOutIcon />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
