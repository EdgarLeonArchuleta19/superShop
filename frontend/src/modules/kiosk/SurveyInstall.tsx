import { useEffect, useState } from 'react';
import { useInstall } from '../../lib/install';
import { SURVEY_ICON } from '../../components/StoreLogo';
import { Spinner } from '../../components/Modal';

/**
 * Después de vincular la tablet: ofrece instalar "SuperShop Survey" (logo blanco, abre
 * directo en las encuestas a pantalla completa). Si ya está instalada, o el navegador no
 * permite instalarla, sigue directo a las encuestas.
 */
export function SurveyInstallStep({ onContinue }: { onContinue: () => void }) {
  const { platform, install } = useInstall();
  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(false);
  // Instalar requiere https: en la red local (http) el navegador no lo permite.
  const canInstall = window.isSecureContext && (platform === 'prompt' || platform === 'android-manual');
  // iPad/iPhone: se agrega desde Safari, pero la app agregada no comparte datos con Safari:
  // al abrirla muestra un código para vincularla desde el panel.
  const ios = window.isSecureContext && platform === 'ios-safari';

  useEffect(() => {
    // Recién instalada: se queda el aviso de abrirla desde la pantalla de inicio.
    if (done) return;
    if (platform === 'installed') onContinue();
    else if (!canInstall && !ios) {
      const timer = window.setTimeout(onContinue, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [platform, canInstall, done, onContinue]);

  if (ios) {
    return (
      <div className="mt-5 space-y-3 text-left">
        <div className="flex items-center gap-3 rounded-2xl bg-faint p-3.5">
          <img src={SURVEY_ICON} alt="" className="h-12 w-12 rounded-xl ring-1 ring-line" />
          <p className="min-w-0 text-[13px] text-ink/80">
            Para usarla como app: toca <strong>Compartir</strong> → <strong>Agregar a inicio</strong>. Al abrirla te
            mostrará un código: escríbelo en SuperShop → Vincular dispositivos.
          </p>
        </div>
        <button onClick={onContinue} className="btn-primary h-12 w-full text-[15px]">
          Seguir aquí en Safari
        </button>
      </div>
    );
  }

  if (!canInstall && !done) return null;

  if (done) {
    return (
      <div className="mt-5 space-y-3">
        <p className="text-[14px] text-ink/80">
          Listo. Abre <strong>SuperShop Survey</strong> desde la pantalla de inicio de la tablet.
        </p>
        <button onClick={onContinue} className="text-[13px] font-semibold text-brand-600 hover:underline">
          Seguir aquí en el navegador
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3 text-left">
      <div className="flex items-center gap-3 rounded-2xl bg-faint p-3.5">
        <img src={SURVEY_ICON} alt="" className="h-12 w-12 rounded-xl ring-1 ring-line" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">Instala SuperShop Survey</p>
          <p className="text-[12px] text-muted">Abre directo en las encuestas, a pantalla completa.</p>
        </div>
      </div>
      {platform === 'prompt' ? (
        <button
          onClick={async () => {
            setInstalling(true);
            try {
              if (await install()) setDone(true);
            } finally {
              setInstalling(false);
            }
          }}
          disabled={installing}
          className="btn-primary h-12 w-full text-[15px]"
        >
          {installing && <Spinner className="h-4 w-4" />}
          Instalar
        </button>
      ) : (
        <p className="text-[13px] text-ink/80">
          Abre el menú <strong>⋮</strong> del navegador y toca <strong>Instalar app</strong> o{' '}
          <strong>Agregar a pantalla de inicio</strong>.
        </p>
      )}
      <button onClick={onContinue} className="block w-full text-center text-[13px] font-semibold text-muted hover:text-ink">
        Continuar sin instalar
      </button>
    </div>
  );
}
