import { PageHeader, Placeholder } from "@/components/page"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useData } from "@/lib/data"

export function DashboardPage() {
  const { opportunities } = useData()
  const active = opportunities.filter((o) => o.level !== "SURVEILLER")
  const kpis = [
    { label: "Alertes AGIR", value: opportunities.filter((o) => o.level === "AGIR").length },
    { label: "Alertes PRÉPARER", value: opportunities.filter((o) => o.level === "PRÉPARER").length },
    { label: "Postes anticipés", value: active.reduce((a, o) => a + o.need[1], 0) },
    { label: "À sourcer", value: active.reduce((a, o) => a + o.vivier.a_sourcer, 0) },
  ]
  return (
    <>
      <PageHeader />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold tabular-nums">{k.value}</CardContent>
          </Card>
        ))}
      </div>
      <Placeholder>Top 5 des alertes AGIR — à venir</Placeholder>
    </>
  )
}
