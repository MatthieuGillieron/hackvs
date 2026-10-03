import * as React from "react"
import { ExternalLinkIcon, PencilIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"

import { SourceIcon } from "@/components/sources/source-icon"
import { Switch } from "@/components/sources/switch"
import { FamilyChip } from "@/components/level-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { USAGE_LABEL, ageLabel, fmtDate } from "@/lib/format"
import {
  FREQUENCIES,
  HEALTH,
  KINDS,
  addCustom,
  emptySource,
  health,
  removeCustom,
  resetOverride,
  saveCustom,
  saveOverride,
  setEnabled,
  type SourceRow,
  type SourceSettings,
} from "@/lib/sources-config"
import type { Family } from "@/lib/types"
import { cn } from "@/lib/utils"

const NONE = "_"
const isFamily = (u: string): u is Family => ["projet", "recrutement", "entreprise", "historique"].includes(u)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{value} %</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

function Choice({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

// ------------------------------------------------------------------ consultation

function SourceView({ row }: { row: SourceRow }) {
  const s = row.status
  const h = HEALTH[health(row)]
  return (
    <div className="grid gap-6 px-4">
      {row.description && <p className="text-sm leading-relaxed text-muted-foreground">{row.description}</p>}

      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
        <span className={cn("size-2 rounded-full", h.dot)} />
        <span className="font-medium">{h.label}</span>
        {s?.ageHours !== undefined && <span className="text-muted-foreground">· collectée {ageLabel(s.ageHours)}</span>}
      </div>

      <dl className="divide-y text-sm">
        <Fact label="Alimente">
          {row.usage && isFamily(row.usage) ? <FamilyChip family={row.usage} /> : row.usage ? USAGE_LABEL[row.usage] : "Rien pour l'instant"}
        </Fact>
        <Fact label="Enregistrements">{s ? s.count.toLocaleString("fr-CH") : "—"}</Fact>
        {s?.lastDate && <Fact label="Donnée la plus récente">{fmtDate(s.lastDate, { day: "numeric", month: "long", year: "numeric" })}</Fact>}
        <Fact label="Fréquence">{cap(row.frequency)}</Fact>
        <Fact label="Accès">{row.kind}</Fact>
        {row.site && (
          <Fact label="Adresse">
            <a href={row.site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
              {row.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} <ExternalLinkIcon className="size-3" />
            </a>
          </Fact>
        )}
        {!row.custom && <Fact label="Identifiant"><code className="text-xs">{row.id}</code></Fact>}
      </dl>

      {s?.fill && s.count > 0 && (
        <div className="grid gap-3">
          <div>
            <div className="text-sm font-medium">Rapprochement</div>
            <p className="text-xs text-muted-foreground">Part des enregistrements reliés à une entreprise ou à une commune.</p>
          </div>
          <Meter label="Entreprise" value={s.fill.company} />
          <Meter label="Commune" value={s.fill.commune} />
        </div>
      )}

      {row.note && (
        <div className="grid gap-1">
          <div className="text-sm font-medium">Note</div>
          <p className="text-sm whitespace-pre-line text-muted-foreground">{row.note}</p>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ édition

function SourceForm({ form, set, categories, id }: {
  form: SourceSettings
  set: (p: Partial<SourceSettings>) => void
  categories: string[]
  id: string
}) {
  return (
    <form id={id} className="grid gap-4 px-4" onSubmit={(e) => e.preventDefault()}>
      <Field label="Nom">
        <Input value={form.label} onChange={(e) => set({ label: e.target.value })} placeholder="ex. Bulletin officiel VD" autoFocus required />
      </Field>
      <Field label="Description">
        <Textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={2} placeholder="Ce que la source apporte" />
      </Field>
      <Field label="Adresse (URL)">
        <Input type="url" value={form.site} onChange={(e) => set({ site: e.target.value })} placeholder="https://…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Catégorie">
          <Choice value={form.category} onChange={(v) => set({ category: v })}
            options={[...new Set([...categories, "Autres"])].map((c) => [c, c])} />
        </Field>
        <Field label="Alimente">
          <Choice value={form.usage || NONE} onChange={(v) => set({ usage: v === NONE ? "" : (v as SourceSettings["usage"]) })}
            options={[[NONE, "Rien pour l'instant"], ...Object.entries(USAGE_LABEL)]} />
        </Field>
        <Field label="Fréquence">
          <Choice value={form.frequency} onChange={(v) => set({ frequency: v as SourceSettings["frequency"] })}
            options={FREQUENCIES.map((f) => [f, cap(f)])} />
        </Field>
        <Field label="Accès">
          <Choice value={form.kind} onChange={(v) => set({ kind: v as SourceSettings["kind"] })} options={KINDS.map((k) => [k, k])} />
        </Field>
      </div>
      <Field label="Note">
        <Textarea value={form.note} onChange={(e) => set({ note: e.target.value })} rows={3} placeholder="Contact, limites connues, quota d'API…" />
      </Field>
      <p className="text-xs text-muted-foreground">
        Enregistré dans ce navigateur. Le calcul des alertes ne change pas : une nouvelle source doit être branchée dans <code>sources/</code>.
      </p>
    </form>
  )
}

// ------------------------------------------------------------------ panneau

// row = source à consulter ; null + open = ajout. Remonté (key) à chaque ouverture.
export function SourceSheet({ open, onOpenChange, row, categories }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  row: SourceRow | null
  categories: string[]
}) {
  const [editing, setEditing] = React.useState(!row)
  const [form, setForm] = React.useState<SourceSettings>(() => (row ? { ...row } : emptySource()))
  const set = (patch: Partial<SourceSettings>) => setForm((f) => ({ ...f, ...patch }))
  const close = () => onOpenChange(false)

  function save() {
    if (!form.label.trim()) return
    const clean = { ...form, label: form.label.trim(), site: form.site.trim() }
    if (row?.status) saveOverride(row.status, clean)
    else if (row) saveCustom(row.id, clean)
    else addCustom(clean)
    if (row) setEditing(false)
    else close()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="flex-row items-center gap-3 border-b pr-12">
          <SourceIcon category={editing ? form.category : (row?.category ?? "")} />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">{row ? (editing ? "Modifier la source" : row.label) : "Nouvelle source"}</SheetTitle>
            <SheetDescription>{row ? row.category : "Une source publique à surveiller"}</SheetDescription>
          </div>
          {row && !editing && <Switch checked={row.enabled} onChange={(v) => setEnabled(row, v)} label={row.enabled ? "Désactiver" : "Activer"} />}
        </SheetHeader>

        <div className="flex-1 py-6">
          {editing ? <SourceForm id="source-form" form={form} set={set} categories={categories} /> : row && <SourceView row={row} />}
        </div>

        <SheetFooter className="flex-row flex-wrap items-center border-t">
          {editing ? (
            <>
              {row?.custom && (
                <Button variant="ghost" className="mr-auto text-destructive" onClick={() => { removeCustom(row.id); close() }}>
                  <Trash2Icon /> Supprimer
                </Button>
              )}
              <Button variant="outline" className={cn(!row?.custom && "ml-auto")} onClick={() => (row ? (setForm({ ...row }), setEditing(false)) : close())}>
                Annuler
              </Button>
              <Button onClick={save} disabled={!form.label.trim()}>{row ? "Enregistrer" : "Ajouter"}</Button>
            </>
          ) : (
            row && (
              <>
                {row.edited && (
                  <Button variant="ghost" className="mr-auto" onClick={() => { resetOverride(row.id); close() }}>
                    <RotateCcwIcon /> Valeurs d'origine
                  </Button>
                )}
                <Button variant="outline" className={cn(!row.edited && "ml-auto")} onClick={() => { setForm({ ...row }); setEditing(true) }}>
                  <PencilIcon /> Modifier
                </Button>
              </>
            )
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
