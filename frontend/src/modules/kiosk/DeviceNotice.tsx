import { useEffect, useState } from 'react';
import StoreLogo from '../../components/StoreLogo';
import { Spinner } from '../../components/Modal';
import { IconAlert, IconTablet } from '../../components/Icons';
import { claimLink, forgetDevice, requestLinkCode } from '../../lib/device';
import type { DeviceStatus } from '../../lib/device';
import { useSettings } from '../../lib/settings';

interface Props {
  status: Exclude<DeviceStatus, 'paired' | 'checking'> | 'no-place';
  /** Encuestas guardadas en la tablet que aún no llegan al servidor. */
  pending: number;
}

const TEXT: Record<Props['status'], { title: string; body: string }> = {
  unpaired: {
    title: 'Vincula esta tablet',
    body: 'En SuperShop entra a Ajustes → Vincular dispositivos → SuperShop Survey, elige la caja y escribe este código:',
  },
  revoked: {
    title: 'Esta tablet fue desvinculada',
    body: 'Para volver a usarla, en SuperShop → Vincular dispositivos → SuperShop Survey, elige la caja y escribe este código:',
  },
  'no-place': {
    title: 'Falta asignar la caja',
    body: 'La caja o tienda de esta tablet ya no existe. En Registro de accesos, edita la tablet y asígnale una caja.',
  },
};

/** Cada cuánto pregunta la tablet si ya escribieron su código en el panel. */
const POLL_MS = 3000;

/**
 * Código de 6 dígitos para vincular desde el panel (como WhatsApp Web). Vincula exactamente
 * esta app, aunque el QR se haya abierto antes en otro navegador. Al vincularse, recarga.
 */
function LinkCode() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    let secret = '';
    let expiresAt = 0;
    let timer = 0;

    const fresh = async () => {
      const res = await requestLinkCode();
      if (!alive) return;
      secret = res.secret;
      expiresAt = Date.now() + res.ttl_ms;
      setCode(res.code);
    };

    const tick = async () => {
      if (!alive) return;
      try {
        if (!secret || Date.now() >= expiresAt) await fresh();
        else {
          const status = await claimLink(secret);
          if (status === 'linked') {
            window.location.replace('/encuestas');
            return;
          }
          if (status === 'expired') await fresh();
        }
        if (alive) setError(false);
      } catch {
        if (alive) setError(true);
      }
      if (alive) timer = window.setTimeout(() => void tick(), POLL_MS);
    };

    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="mt-5">
      {code ? (
        <>
          <p className="font-mono text-[44px] font-bold tracking-[0.18em] text-ink sm:text-[52px]">
            {code.slice(0, 3)} {code.slice(3)}
          </p>
          <p className="mt-2 flex items-center justify-center gap-2 text-[12px] text-muted">
            <Spinner className="h-3.5 w-3.5" />
            Esperando… se vincula sola en cuanto lo escriban.
          </p>
        </>
      ) : (
        !error && (
          <div className="grid place-items-center py-4">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        )
      )}
      {error && (
        <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-300">Sin conexión con SuperShop. Reintentando…</p>
      )}
    </div>
  );
}

/** Pantalla de la tablet cuando no puede mostrar encuestas. */
export default function DeviceNotice({ status, pending }: Props) {
  const { settings, logo } = useSettings();
  const text = TEXT[status];

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10 text-ink">
      <div className="card w-full max-w-md p-6 text-center sm:p-7">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2.5">
          <StoreLogo app="survey" name={settings.store_name} logo={logo} className="h-10 w-10 rounded-xl ring-1 ring-line" />
          <div className="text-left leading-tight">
            <p className="text-sm font-semibold tracking-tight">SuperShop Survey</p>
            <p className="text-[11px] text-muted">Encuestas de satisfacción</p>
          </div>
        </div>
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <IconTablet className="h-6 w-6" />
        </span>
        <h1 className="text-lg font-semibold tracking-tight">{text.title}</h1>
        <p className="mt-1.5 text-[14px] text-muted">{text.body}</p>

        {status !== 'no-place' && <LinkCode />}

        {pending > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-left text-[13px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Hay {pending} encuesta{pending === 1 ? '' : 's'} guardada{pending === 1 ? '' : 's'} en esta tablet. Se
              siguen enviando solas cuando hay conexión.
            </span>
          </p>
        )}

        {status !== 'no-place' && (
          <button
            onClick={() => {
              forgetDevice();
              // Carga completa: /login usa index.html (app SuperShop), no la de encuestas.
              window.location.replace('/login');
            }}
            className="mt-5 text-[13px] font-semibold text-brand-600 underline-offset-2 hover:underline"
          >
            Usar este equipo para administrar SuperShop
          </button>
        )}
      </div>
    </div>
  );
}
