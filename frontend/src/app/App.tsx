import { lazy, Suspense, useEffect } from 'react';
import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '../lib/auth';
import { ThemeProvider } from '../lib/theme';
import { ToastProvider } from '../lib/toast';
import { SettingsProvider } from '../lib/settings';
import { flushOutbox, getPendingCount } from '../lib/offline';
import type { UserRole } from '../lib/types';
import Splash from '../components/Splash';
import { Spinner } from '../components/Modal';
import LoginPage from '../modules/auth/LoginPage';

const KioskPage = lazy(() => import('../modules/kiosk/KioskPage'));
const AdminLayout = lazy(() => import('./AdminLayout'));
const PanelPage = lazy(() => import('../modules/panel/PanelPage'));
const DashboardPage = lazy(() => import('../modules/surveys/DashboardPage'));
const SurveysPage = lazy(() => import('../modules/surveys/SurveysPage'));
const BranchesPage = lazy(() => import('../modules/catalog/BranchesPage'));
const RegistersPage = lazy(() => import('../modules/catalog/RegistersPage'));
const CashiersPage = lazy(() => import('../modules/catalog/CashiersPage'));
const InfoSettingsPage = lazy(() => import('../modules/settings/InfoSettingsPage'));
const AdminSettingsPage = lazy(() => import('../modules/settings/AdminSettingsPage'));

function RouteFallback() {
  return (
    <div className="grid min-h-dvh place-items-center text-muted">
      <Spinner className="h-8 w-8 text-brand-600" />
    </div>
  );
}

function OutboxFlusher() {
  useEffect(() => {
    void flushOutbox();
    const onOnline = () => void flushOutbox();
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => {
      if (getPendingCount() > 0) void flushOutbox();
    }, 45000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}

function HomeRedirect() {
  const { ready, user } = useAuth();
  if (!ready) return <Splash />;
  return <Navigate to={user ? '/app' : '/login'} replace />;
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { ready, user } = useAuth();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleGate({ roles, children }: { roles: UserRole[]; children: ReactElement }) {
  const { role } = useAuth();
  if (!role || !roles.includes(role)) return <Navigate to="/app" replace />;
  return children;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes location={location}>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/mi-encuesta"
        element={
          <RequireAuth>
            <KioskPage />
          </RequireAuth>
        }
      />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<PanelPage />} />
        <Route
          path="encuestas/respuestas"
          element={
            <RoleGate roles={['admin']}>
              <SurveysPage />
            </RoleGate>
          }
        />
        <Route path="encuestas/estadisticas" element={<DashboardPage />} />
        <Route
          path="catalogos/tiendas"
          element={
            <RoleGate roles={['admin']}>
              <BranchesPage />
            </RoleGate>
          }
        />
        <Route
          path="catalogos/cajas"
          element={
            <RoleGate roles={['admin']}>
              <RegistersPage />
            </RoleGate>
          }
        />
        <Route
          path="catalogos/cajeros"
          element={
            <RoleGate roles={['admin']}>
              <CashiersPage />
            </RoleGate>
          }
        />
        <Route path="ajustes/informacion" element={<InfoSettingsPage />} />
        <Route
          path="ajustes/administrador"
          element={
            <RoleGate roles={['admin']}>
              <AdminSettingsPage />
            </RoleGate>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SettingsProvider>
            <BrowserRouter>
              <OutboxFlusher />
              <AnimatedRoutes />
            </BrowserRouter>
          </SettingsProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
