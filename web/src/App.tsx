import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { TooltipProvider } from "@/components/ui/tooltip"
import { AppLayout } from "@/layouts/app-layout"
import { DataProvider } from "@/lib/data"
import { AdminSourcesPage } from "@/pages/admin-sources"
import { AlertesPage } from "@/pages/alertes"
import { CandidatsPage } from "@/pages/candidats"
import { CartePage } from "@/pages/carte"
import { ClientsPage } from "@/pages/clients"
import { DashboardPage } from "@/pages/dashboard"
import { ParametresPage } from "@/pages/parametres"
import { ProfilPage } from "@/pages/profil"

export default function App() {
  return (
    <DataProvider>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="alertes" element={<AlertesPage />} />
              <Route path="carte" element={<CartePage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="candidats" element={<CandidatsPage />} />
              <Route path="profil" element={<ProfilPage />} />
              <Route path="parametres" element={<ParametresPage />} />
              <Route path="admin" element={<Navigate to="/admin/sources" replace />} />
              <Route path="admin/sources" element={<AdminSourcesPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </DataProvider>
  )
}
