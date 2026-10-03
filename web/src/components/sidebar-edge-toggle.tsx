import { ChevronLeftIcon } from "lucide-react"

import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

// Bouton rond posé au haut de la bordure, aligné sur le logo, entre la sidebar et la page (desktop).
export function SidebarEdgeToggle() {
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === "collapsed"
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={collapsed ? "Ouvrir la barre latérale" : "Réduire la barre latérale"}
      title={collapsed ? "Ouvrir la barre latérale" : "Réduire la barre latérale"}
      className="absolute top-8 right-0 z-30 flex size-6 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <ChevronLeftIcon className={cn("size-3.5 transition-transform duration-200", collapsed && "rotate-180")} />
    </button>
  )
}
