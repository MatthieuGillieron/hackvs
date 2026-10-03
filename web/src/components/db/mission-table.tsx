import type * as React from "react"

import { StarIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDate, shortMetier } from "@/lib/format"
import type { Mission } from "@/lib/types"

const d = (iso: string) => fmtDate(iso, { day: "numeric", month: "short", year: "2-digit" })

// Historique des missions (simulé) : côté candidat on affiche le client, côté entreprise l'intérimaire.
export function MissionTable({ missions, who, onWho }: {
  missions: Mission[]
  who: (m: Mission) => string
  onWho?: (m: Mission) => void
}) {
  if (!missions.length) return <p className="text-sm text-muted-foreground">Aucune mission enregistrée.</p>
  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 bg-background">
          <TableRow>
            <TableHead className="pl-3">{onWho ? "Intérimaire" : "Client"}</TableHead>
            <TableHead>Période</TableHead>
            <TableHead className="text-right">Heures</TableHead>
            <TableHead className="pr-3 text-right">Éval. client</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {missions.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="pl-3">
                {onWho ? (
                  <button className="font-medium hover:underline" onClick={() => onWho(m)}>{who(m)}</button>
                ) : (
                  <div className="font-medium">{who(m)}</div>
                )}
                <div className="text-xs text-muted-foreground">{shortMetier(m.metier)}</div>
              </TableCell>
              <TableCell className="text-xs whitespace-nowrap">
                {d(m.debut)} → {d(m.fin)}
                {m.statut === "en cours" && <Badge variant="outline" className="ml-1.5 h-4 px-1.5 text-[10px]">en cours</Badge>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{m.heures}</TableCell>
              <TableCell className="pr-3 text-right tabular-nums">
                {m.note === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="inline-flex items-center gap-1"><StarIcon className="size-3 fill-amber-400 text-amber-400" />{m.note}/5</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// Ligne « libellé : valeur » des fiches.
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  )
}
