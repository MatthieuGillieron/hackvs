import * as React from "react"

import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// Carte courte des bases Clients / Candidats (même anatomie que les cartes d'alerte) : en-tête, mini-titre,
// 3 repères, pied. Le détail complet s'ouvre au clic.
export function RecordCard({ avatar, title, subtitle, badge, headline, stats, footer, onOpen, dim = false }: {
  avatar: React.ReactNode
  title: string
  subtitle: React.ReactNode
  badge?: React.ReactNode
  headline: React.ReactNode
  stats: { label: string; value: React.ReactNode; hint?: string }[]
  footer: React.ReactNode
  onOpen: () => void
  dim?: boolean
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onOpen())}
      aria-label={`Ouvrir la fiche ${title}`}
      className="group flex h-full cursor-pointer flex-col rounded-2xl border bg-card p-5 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <header className={cn("flex items-start gap-3", dim && "opacity-60")}>
        {avatar}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base leading-snug font-semibold group-hover:text-primary">{title}</h3>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </header>

      <Separator className="my-3" />

      <p className="line-clamp-2 text-sm leading-snug font-medium">{headline}</p>

      <dl className="mt-4 mb-4 grid grid-cols-3 divide-x">
        {stats.map((s, i) => (
          <div key={s.label} className={cn("grid min-w-0 gap-1", i === 0 ? "pr-2.5" : i === stats.length - 1 ? "pl-2.5" : "px-2.5")}>
            <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
            <dd className="truncate text-sm font-semibold tabular-nums" title={s.hint}>{s.value}</dd>
          </div>
        ))}
      </dl>

      <footer className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">{footer}</footer>
    </article>
  )
}

// Pastille d'initiales (pas de photo inventée).
export function Initials({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-muted-foreground", className)}>
      {text}
    </span>
  )
}

export function StatusDot({ dot, label, hint }: { dot: string; label: string; hint?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap" title={hint}>
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  )
}
