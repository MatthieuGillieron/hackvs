import * as React from "react"
import { CheckIcon, CopyIcon, MailIcon, SendIcon, SparklesIcon } from "lucide-react"

import { FictifBadge } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Opportunity } from "@/lib/types"

// Emails pré-rédigés par LLM à l'export (engine/llm/emails.py) : la démo reste hors ligne.
interface Email {
  objet: string
  corps: string
  faits_utilises: string[]
  langue: string
  model: string
  fictif: true
}

let emailsPromise: Promise<Record<string, Email>> | null = null
function loadEmails() {
  emailsPromise ??= fetch("/data/emails.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  return emailsPromise
}

export function EmailButton({ o }: { o: Pick<Opportunity, "key" | "target"> }) {
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState<Email | null | undefined>(undefined)
  const [objet, setObjet] = React.useState("")
  const [corps, setCorps] = React.useState("")
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let alive = true
    void loadEmails().then((all) => {
      if (!alive) return
      const e = all[o.key] ?? null
      setEmail(e)
      setObjet(e?.objet ?? "")
      setCorps(e?.corps ?? "")
    })
    return () => {
      alive = false
    }
  }, [open, o.key])

  const copy = () => {
    void navigator.clipboard.writeText(`Objet : ${objet}\n\n${corps}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  const mailto = `mailto:?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MailIcon /> Générer un email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Email à {o.target}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded border px-1.5 text-xs">
              <SparklesIcon className="size-3" /> Rédigé par IA à partir des signaux publics
            </span>
            <FictifBadge label="Profils et expéditrice simulés" />
          </DialogDescription>
        </DialogHeader>

        {email === undefined && <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>}
        {email === null && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Pas d'email préparé pour cette alerte. Lancez <code>python3 -m engine build</code>.
          </p>
        )}
        {email && (
          <div className="grid gap-3">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Objet
              <Input value={objet} onChange={(e) => setObjet(e.target.value)} className="text-sm text-foreground" />
            </label>
            <Textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={14}
              className="max-h-[50svh] text-sm leading-relaxed" />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Faits repris dans l'email ({email.faits_utilises.length})</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {email.faits_utilises.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </details>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={copy} disabled={!email}>
            {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copié" : "Copier"}
          </Button>
          <Button asChild disabled={!email}>
            <a href={email ? mailto : undefined}>
              <SendIcon /> Ouvrir dans la messagerie
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
