import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import StoreLogo from '../../components/StoreLogo';
import { Spinner } from '../../components/Modal';
import { IconAlert, IconCheck } from '../../components/Icons';
import { NetError } from '../../lib/api';
import { pairDevice, useSurveyAppManifest } from '../../lib/device';
import type { DeviceInfo } from '../../lib/device';
import { useSettings } from '../../lib/settings';
import { clearDraft, clearKioskState } from './kioskTypes';
import { SurveyInstallStep } from './SurveyInstall';

/** La app de escritorio es la computadora principal: no se convierte en tablet de encuestas. */
const isDesktopApp = !!(window as Window & { electronAPI?: unknown }).electronAPI;

/**
 * Se abre al escanear el QR de "SuperShop Survey" (/encuestas/vincular?codigo=…):
 * cambia el código por el token de la tablet y abre las encuestas.
 */
export default function PairPage() {
  useSurveyAppManifest();
  const [params] = useSearchParams();
  const code = params.get('codigo') ?? '';
  const navigate = useNavigate();
  const { settings, logo } = useSettings();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (!code || isDesktopApp || started.current) return;
    started.current = true;
    pairDevice(code)
      .then((d) => {
        clearKioskState();
        clearDraft();
        setDevice(d);
      })
      .catch((err) =>
        setError(
          err instanceof NetError
            ? 'No hay conexión con SuperShop. Revisa el internet o el wifi de la tablet y escanea el código otra vez.'
            : err instanceof Error
              ? err.message
              : 'No se pudo vincular la tablet'
        )
      );
  }, [code, navigate]);

  const openSurveys = useCallback(() => navigate('/encuestas', { replace: true }), [navigate]);

  if (!code) return <Navigate to="/encuestas" replace />;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10 text-ink">
      <div className="card w-full max-w-md p-6 text-center sm:p-7">
        <div className="mx-auto mb-5 flex w-fit items-center gap-2.5">
          <StoreLogo app="survey" name={settings.store_name} logo={logo} className="h-10 w-10 rounded-xl ring-1 ring-line" />
          <div className="text-left leading-tight">
            <p className="text-sm font-semibold tracking-tight">SuperShop Survey</p>
            <p className="text-[11px] text-muted">Encuestas de satisfacción</p>
          </div>
        </div>

        {isDesktopApp ? (
          <Message tone="error" title="Este equipo es la computadora principal">
            Escanea el código con la tablet que vas a usar para las encuestas.
          </Message>
        ) : error ? (
          <Message tone="error" title="No se pudo vincular">
            {error}
          </Message>
        ) : device ? (
          <>
            <Message tone="ok" title="¡Tablet vinculada!">
              {device.register?.name ?? device.name}
              {device.branch ? ` · ${device.branch.name}` : ''}.
            </Message>
            <SurveyInstallStep onContinue={openSurveys} />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            <Spinner className="h-8 w-8 text-brand-600" />
            <p className="text-sm text-muted">Vinculando esta tablet…</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Message({ tone, title, children }: { tone: 'ok' | 'error'; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`mb-3 grid h-12 w-12 place-items-center rounded-full ${
          tone === 'ok'
            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
            : 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300'
        }`}
      >
        {tone === 'ok' ? <IconCheck className="h-6 w-6" /> : <IconAlert className="h-6 w-6" />}
      </span>
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-[14px] text-muted">{children}</p>
    </div>
  );
}
