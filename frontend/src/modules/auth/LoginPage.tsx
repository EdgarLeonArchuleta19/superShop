import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { useSettings } from '../../lib/settings';
import { Spinner, ThemeToggleButton } from '../../components/Modal';
import { IconChevronRight, IconEye, IconEyeOff } from '../../components/Icons';

export default function LoginPage() {
  const { user, ready, login } = useAuth();
  const { theme, toggle } = useTheme();
  const { settings, logo } = useSettings();
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (ready && user) return <Navigate to="/app" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-brand-50 via-canvas to-canvas px-4 py-10 dark:from-brand-500/10 dark:via-canvas dark:to-canvas">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-brand-400/10 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="card animate-fade-in overflow-hidden">
          <div className="relative flex flex-col items-center gap-1 bg-gradient-to-br from-brand-600 to-brand-700 px-6 py-6 text-center text-white">
            <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute right-3 top-3">
              <ThemeToggleButton onClick={toggle} theme={theme} variant="on-color" />
            </div>
            <img
              src={logo}
              alt={settings.store_name}
              className="relative h-14 w-14 rounded-2xl object-cover shadow-pop ring-2 ring-white/30"
            />
            <h1 className="relative mt-1 text-lg font-semibold tracking-tight">
              {settings.store_name}
            </h1>
            <p className="relative text-[12px] text-brand-100">{settings.store_tagline}</p>
          </div>

          <div className="p-6 sm:p-7">
            <h2 className="text-[15px] font-semibold tracking-tight">Iniciar sesión</h2>
            <p className="mt-0.5 mb-4 text-[12px] text-muted">
              Ingresa con tu correo y contraseña.
            </p>

            {error && (
              <div className="anim-pop mb-4 rounded-xl border border-red-600/20 bg-red-50 px-3 py-2 text-[13px] text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-3.5">
              <div>
                <label className="eyebrow mb-1 block" htmlFor="email">
                  Correo
                </label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  placeholder="tu@correo.com"
                  required
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
                    className="input pr-11"
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
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-ghost h-9 w-9 px-0!"
                  >
                    {showPassword ? (
                      <IconEyeOff className="h-4 w-4" />
                    ) : (
                      <IconEye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="group btn-primary h-11 w-full text-sm"
              >
                {loading ? <Spinner className="h-4 w-4" /> : 'Entrar'}
                {!loading && (
                  <IconChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-5 text-center text-[11px] text-muted">
          © {new Date().getFullYear()} {settings.store_name} · Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
