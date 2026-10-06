import { Outlet } from "react-router"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

export function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Mobile : la sidebar est un tiroir, il faut un bouton pour l'ouvrir. */}
        <SidebarTrigger className="fixed top-3 left-3 z-20 border bg-background shadow-sm md:hidden" />
        <main className="flex flex-1 flex-col gap-6 p-4 pt-14 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
