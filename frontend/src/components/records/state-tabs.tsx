import { cn } from "@/lib/utils"

// Onglets de statut avec effectifs (« Tous 350 · Disponibles 194 · … »), en tête des bases Clients / Candidats.
export function StateTabs({ value, onChange, items }: {
  value: string
  onChange: (v: string) => void
  items: { value: string; label: string; count: number; dot?: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
            value === it.value ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
          )}
        >
          {it.dot && <span className={cn("size-2 rounded-full", it.dot)} />}
          {it.label}
          <span className={cn("tabular-nums", value === it.value ? "opacity-70" : "text-muted-foreground")}>{it.count}</span>
        </button>
      ))}
    </div>
  )
}
