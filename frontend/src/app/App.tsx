import { lazy, Suspense, useEffect } from 'react';
import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '../lib/auth';
import { ThemeProvider } from '../lib/theme';
import { ToastProvider } from '../lib/toast';
import { SettingsProvider, useSettings } from '../lib/settings';
import { flushOutbox, getPendingCount } from '../lib/offline';
import { homePath } from '../lib/permissions';
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
const ProfilePage = lazy(() => import('../modules/settings/ProfilePage'));
const UsersPage = lazy(() => import('../modules/settings/UsersPage'));
const BackupsPage = lazy(() => import('../modules/settings/BackupsPage'));
const ConnectPage = lazy(() => import('../modules/settings/ConnectPage'));
const RolesPage = lazy(() => import('../modules/settings/RolesPage'));
const InstallPage = lazy(() => import('../modules/install/InstallPage'));

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

/** Pantallas que solo existen en la app de escritorio: en la versión web se vuelve al inicio. */
function DesktopOnly({ children }: { children: ReactElement }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  if (settings.cloud) return <Navigate to={homePath(user)} replace />;
  return children;
}

/** Solo deja pasar si el rol del usuario tiene el permiso; si no, lo manda a su pantalla de inicio. */
function PermGate({ perm, children }: { perm: string; children: ReactElement }) {
  const { user, can } = useAuth();
  if (!can(perm)) return <Navigate to={homePath(user)} replace />;
  return children;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes location={location}>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/instalar" element={<InstallPage />} />
      <Route
        path="/mi-encuesta"
        element={
          <RequireAuth>
            <PermGate perm="surveys.kiosk">
              <KioskPage />
            </PermGate>
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
        <Route
          index
          element={
            <PermGate perm="panel">
              <PanelPage />
            </PermGate>
          }
        />
        <Route
          path="encuestas/respuestas"
          element={
            <PermGate perm="surveys.responses">
              <SurveysPage />
            </PermGate>
          }
        />
        <Route
          path="encuestas/estadisticas"
          element={
            <PermGate perm="surveys.stats">
              <DashboardPage />
            </PermGate>
          }
        />
        <Route
          path="catalogos/tiendas"
          element={
            <PermGate perm="catalog.branches">
              <BranchesPage />
            </PermGate>
          }
        />
        <Route
          path="catalogos/cajas"
          element={
            <PermGate perm="catalog.registers">
              <RegistersPage />
            </PermGate>
          }
        />
        <Route
          path="catalogos/cajeros"
          element={
            <PermGate perm="catalog.cashiers">
              <CashiersPage />
            </PermGate>
          }
        />
        <Route path="ajustes/perfil" element={<ProfilePage />} />
        <Route
          path="ajustes/usuarios"
          element={
            <PermGate perm="settings.users">
              <UsersPage />
            </PermGate>
          }
        />
        <Route
          path="ajustes/roles"
          element={
            <PermGate perm="admin">
              <RolesPage />
            </PermGate>
          }
        />
        <Route
          path="ajustes/respaldos"
          element={
            <PermGate perm="settings.backups">
              <DesktopOnly>
                <BackupsPage />
              </DesktopOnly>
            </PermGate>
          }
        />
        <Route
          path="ajustes/informacion"
          element={
            <PermGate perm="settings.info">
              <InfoSettingsPage />
            </PermGate>
          }
        />
        <Route
          path="ajustes/conectar"
          element={
            <PermGate perm="settings.connect">
              <ConnectPage />
            </PermGate>
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
