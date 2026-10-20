import { useNavigate } from 'react-router-dom';
import StoreLogo from '../../components/StoreLogo';
import { IconAlert, IconTablet } from '../../components/Icons';
import { forgetDevice } from '../../lib/device';
import type { DeviceStatus } from '../../lib/device';
import { useSettings } from '../../lib/settings';

interface Props {
  status: Exclude<DeviceStatus, 'paired'> | 'no-place';
  /** Encuestas guardadas en la tablet que aún no llegan al servidor. */
  pending: number;
}

const TEXT: Record<Props['status'], { title: string; body: string }> = {
  unpaired: {
    title: 'Esta tablet no está vinculada',
    body: 'Para usarla en encuestas, en SuperShop entra a Ajustes → Vincular dispositivos, genera el QR de "SuperShop Survey" y escanéalo con la cámara de esta tablet.',
  },
  revoked: {
    title: 'Esta tablet fue desvinculada',
    body: 'Ya no puede recibir encuestas. Para volver a usarla, genera un QR nuevo de "SuperShop Survey" en Vincular dispositivos y escanéalo con esta tablet.',
  },
  'no-place': {
    title: 'Falta asignar la caja',
    body: 'La caja o tienda de esta tablet ya no existe. En Vincular dispositivos, edita la tablet y asígnale una caja.',
  },
};

/** Pantalla de la tablet cuando no puede mostrar encuestas. */
export default function DeviceNotice({ status, pending }: Props) {
  const { settings, logo } = useSettings();
  const navigate = useNavigate();
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
              navigate('/login', { replace: true });
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
