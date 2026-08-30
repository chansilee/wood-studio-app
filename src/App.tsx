import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/shared/hooks/useAuth'
import { RequireAuth } from '@/shared/components/RequireAuth'
import { RequireRole } from '@/shared/components/RequireRole'
import { Layout } from '@/app/Layout'
import { HomePage } from '@/app/HomePage'
import { NotificationHelpPage } from '@/app/NotificationHelpPage'
import { UsageGuidePage } from '@/app/UsageGuidePage'
import { LoginPage } from '@/modules/auth/LoginPage'
import { RegisterPage } from '@/modules/auth/RegisterPage'
import { ForgotPasswordPage } from '@/modules/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/modules/auth/ResetPasswordPage'
import { MembersPage } from '@/modules/members/MembersPage'
import { SchedulingPage } from '@/modules/scheduling/SchedulingPage'
import { AttendancePage } from '@/modules/attendance/AttendancePage'
import { LeavePage } from '@/modules/leave/LeavePage'
import { MonthlySettlementPage } from '@/modules/settlement/MonthlySettlementPage'
import { JournalPage } from '@/modules/journal/JournalPage'
import { InventoryOverviewPage } from '@/modules/inventory/InventoryOverviewPage'
import { ProductsPage } from '@/modules/products/ProductsPage'
import { ProductDetailPage } from '@/modules/products/ProductDetailPage'
import { ProcessTemplatesPage } from '@/modules/products/ProcessTemplatesPage'
import { ProcessTemplateDetailPage } from '@/modules/products/ProcessTemplateDetailPage'

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route
              path="/notifications-help"
              element={
                <RequireRole allow={['owner', 'staff', 'apprentice']}>
                  <NotificationHelpPage />
                </RequireRole>
              }
            />
            <Route
              path="/usage-guide"
              element={
                <RequireRole allow={['owner', 'staff', 'apprentice']}>
                  <UsageGuidePage />
                </RequireRole>
              }
            />
            <Route
              path="/scheduling"
              element={
                <RequireRole allow={['owner', 'staff', 'apprentice']}>
                  <SchedulingPage />
                </RequireRole>
              }
            />
            <Route
              path="/attendance"
              element={
                <RequireRole allow={['owner', 'staff']}>
                  <AttendancePage />
                </RequireRole>
              }
            />
            <Route
              path="/leave"
              element={
                <RequireRole allow={['owner', 'staff', 'apprentice']}>
                  <LeavePage />
                </RequireRole>
              }
            />
            <Route
              path="/settlement"
              element={
                <RequireRole allow={['owner', 'staff', 'apprentice']}>
                  <MonthlySettlementPage />
                </RequireRole>
              }
            />
            <Route
              path="/journal"
              element={
                <RequireRole allow={['owner', 'staff', 'apprentice']}>
                  <JournalPage />
                </RequireRole>
              }
            />
            <Route
              path="/inventory"
              element={
                <RequireRole allow={['owner', 'staff', 'apprentice']}>
                  <InventoryOverviewPage />
                </RequireRole>
              }
            />
            <Route
              path="/products"
              element={
                <RequireRole allow={['owner', 'staff', 'apprentice']}>
                  <ProductsPage />
                </RequireRole>
              }
            />
            <Route
              path="/products/:id"
              element={
                <RequireRole allow={['owner', 'staff', 'apprentice']}>
                  <ProductDetailPage />
                </RequireRole>
              }
            />
            <Route
              path="/process-templates"
              element={
                <RequireRole allow={['owner']}>
                  <ProcessTemplatesPage />
                </RequireRole>
              }
            />
            <Route
              path="/process-templates/:id"
              element={
                <RequireRole allow={['owner']}>
                  <ProcessTemplateDetailPage />
                </RequireRole>
              }
            />
            <Route
              path="/members"
              element={
                <RequireRole allow={['owner']}>
                  <MembersPage />
                </RequireRole>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  )
}
