import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { TooltipProvider } from "@/components/ui/tooltip"
import { AppLayout } from "@/app/app-layout"
import { DataProvider } from "@/lib/data"
import { AlertsPage } from "@/pages/alerts"
import { AnalyticsPage } from "@/pages/analytics"
import { CandidatesPage } from "@/pages/candidates"
import { ClientsPage } from "@/pages/clients"
import { HomePage } from "@/pages/home"
import { SettingsPage } from "@/pages/settings"
import { ProfilePage } from "@/pages/profile"
import { SourcesPage } from "@/pages/sources"

export default function App() {
  return (
    <DataProvider>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="alertes" element={<AlertsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="statistiques" element={<Navigate to="/analytics?vue=marche" replace />} />
              <Route path="carte" element={<Navigate to="/analytics?vue=marche" replace />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="candidats" element={<CandidatesPage />} />
              <Route path="profil" element={<ProfilePage />} />
              <Route path="parametres" element={<SettingsPage />} />
              <Route path="sources" element={<SourcesPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </DataProvider>
  )
}
