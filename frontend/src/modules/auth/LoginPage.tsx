import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import { useInstall } from '../../lib/install';
import { useTheme } from '../../lib/theme';
import { useSettings } from '../../lib/settings';
import { Spinner, ThemeToggleButton } from '../../components/Modal';
import { IconChevronRight, IconEye, IconEyeOff } from '../../components/Icons';

export default function LoginPage() {
  const { user, ready, login } = useAuth();
  const { theme, toggle } = useTheme();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { platform, isMobile } = useInstall();
  const showInstall = isMobile && platform !== 'installed';

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (ready && user) return <Navigate to="/app" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/app', { replace: true });
    } catch (err) {
      // 404 en el login: el acceso con enlace privado está activo y este dispositivo
      // todavía no lo abrió (o se generó un enlace nuevo).
      if (err instanceof ApiError && err.status === 404) {
        setError('Este dispositivo no tiene acceso. Abre el enlace privado que te dio el administrador.');
      } else {
        setError(err instanceof Error ? err.message : 'Error inesperado');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <aside className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center relative bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 min-h-dvh">
        <div className="absolute inset-0 bg-[url('/supershop_fondo_azul.png')] bg-cover bg-center opacity-15" />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/90 via-brand-700/90 to-brand-800/90" />
        
        <div className="relative z-10 flex flex-col items-center justify-center h-full w-full px-12 text-center">
          <img
            src="/supershop_fondo_azul.png"
            alt="SuperShop"
            className="mx-auto h-32 w-32 rounded-2xl object-cover shadow-2xl ring-4 ring-white/30 mb-8"
          />
          
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-3">
            {settings.store_name || 'SuperShop'}
          </h1>
          <p className="text-xl text-brand-100 font-medium mb-2">
            Sistema de administración de tiendas
          </p>

          <div className="mt-12 pt-8 border-t border-white/15 w-full max-w-md mx-auto text-center text-[13px] text-brand-200/70">
            <p>© {new Date().getFullYear()} SuperShop · Desarrollado por ELAN Software</p>
            <p className="mt-1">Todos los derechos reservados.</p>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-dvh overflow-y-auto">
        <header className="flex items-center justify-end p-4 lg:p-6">
          <ThemeToggleButton onClick={toggle} theme={theme} />
        </header>

        <div className="flex-1 flex flex-col justify-center p-6 sm:p-8 lg:p-12 max-w-md lg:max-w-xl mx-auto w-full">
          {/* Encabezado solo móvil/tablet: en escritorio el logo vive en el panel lateral */}
          <div className="lg:hidden mb-8 text-center">
            <img
              src="/supershop_fondo_azul.png"
              alt="SuperShop"
              className="mx-auto h-24 w-24 rounded-2xl object-cover shadow-xl ring-4 ring-brand-500/20"
            />
            <h2 className="mt-6 text-[20px] font-semibold tracking-tight text-ink dark:text-white">Iniciar sesión</h2>
            <p className="mt-1 text-[14px] text-muted dark:text-brand-200/70">
              Ingresa con tu usuario y contraseña.
            </p>
          </div>

          <div className="lg:block hidden mb-8 text-center">
            <h2 className="text-[22px] font-semibold tracking-tight text-ink dark:text-white">Iniciar sesión</h2>
            <p className="mt-1 text-[14px] text-muted dark:text-brand-200/70">
              Ingresa con tu usuario y contraseña.
            </p>
          </div>

          {error && (
            <div className="anim-pop mb-4 rounded-xl border border-red-600/20 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-[14px] text-red-600 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4 flex flex-col">
            <div>
              <label className="eyebrow mb-1 block" htmlFor="username">
                Usuario
              </label>
              <input
                id="username"
                type="text"
                className="input h-11 text-base bg-faint dark:bg-ink/30 border-line dark:border-brand-500/20 text-ink dark:text-white placeholder:text-muted/50 dark:placeholder:text-brand-200/40 focus:ring-brand-500 focus:border-brand-500"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Tu nombre de usuario"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="eyebrow mb-1 block" htmlFor="password">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input h-11 text-base pr-12 bg-faint dark:bg-ink/30 border-line dark:border-brand-500/20 text-ink dark:text-white placeholder:text-muted/50 dark:placeholder:text-brand-200/40 focus:ring-brand-500 focus:border-brand-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 btn-ghost h-10 w-10 px-0! text-muted dark:text-brand-200/70 hover:text-ink dark:hover:text-white"
                >
                  {showPassword ? (
                    <IconEyeOff className="h-5 w-5" />
                  ) : (
                    <IconEye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="group btn-primary h-12 w-full text-base font-medium"
            >
              {loading ? <Spinner className="h-5 w-5" /> : 'Entrar'}
              {!loading && (
                <IconChevronRight className="h-5 w-5 transition group-hover:translate-x-0.5 ml-2" />
              )}
            </button>
          </form>

          {showInstall && (
            <Link
              to="/instalar"
              className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-[14px] font-semibold text-brand-700 dark:text-brand-300"
            >
              <img src="/icon-192.png" alt="" className="h-7 w-7 rounded-lg" />
              Instalar la app en este celular
            </Link>
          )}

          <p className="lg:hidden mt-10 text-center text-[12px] text-muted dark:text-brand-200/60">
            © {new Date().getFullYear()} SuperShop · Desarrollado por ELAN Software
          </p>
        </div>
      </main>
    </div>
  );
}