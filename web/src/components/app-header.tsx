import { CloudRainIcon, SearchIcon, SunIcon } from "lucide-react"
import { useLocation } from "react-router"

import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useData } from "@/lib/data"
import { pageInfo } from "@/lib/nav"

export function AppHeader() {
  const { meta } = useData()
  const { pathname } = useLocation()
  const { title } = pageInfo(pathname)
  const w = meta.weather
  const day = new Date(meta.today + "T00:00:00").toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <span className="text-sm font-medium md:hidden">{title}</span>
      <div className="relative hidden max-w-md flex-1 md:block">
        <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Rechercher un client, un métier, une région…" className="pl-8" />
      </div>
      <div className="ml-auto flex items-center gap-4 text-sm text-muted-foreground">
        <span className="hidden capitalize lg:inline">{day}</span>
        {w && (
          <span className="flex items-center gap-1.5" title={`${w.place} : min ${w.tmin}°, max ${w.tmax}°, ${w.precip} mm`}>
            {w.precip > 1 ? <CloudRainIcon className="size-4" /> : <SunIcon className="size-4 text-amber-500" />}
            <span>
              {w.place} {Math.round(w.tmax)}°
            </span>
          </span>
        )}
      </div>
    </header>
  )
}
