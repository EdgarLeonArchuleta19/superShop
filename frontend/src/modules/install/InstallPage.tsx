import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInstall } from '../../lib/install';
import { useToast } from '../../lib/toast';
import { IconCheck, IconCopy } from '../../components/Icons';

// Íconos como los de Safari, para que la persona reconozca qué botón tocar.
const ShareIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);

const AddToHomeIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

const MenuDotsIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

interface Step {
  icon: React.ReactNode;
  text: React.ReactNode;
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex items-center gap-3.5 rounded-2xl bg-surface p-3.5 shadow-sm ring-1 ring-line">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-[13px] font-bold text-white">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 text-[15px] leading-snug text-ink">{step.text}</span>
          <span className="grid h-11 min-w-11 shrink-0 place-items-center rounded-xl bg-faint px-2.5 text-brand-600">
            {step.icon}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Las dos apps instalables: SuperShop (logo azul) y SuperShop Survey (logo blanco, tablets). */
const APPS = {
  admin: { name: 'SuperShop', icon: '/icon-512.png', iconClass: 'ring-black/5' },
  survey: { name: 'SuperShop Survey', icon: '/survey-icon-512.png', iconClass: 'ring-line' },
} as const;

/**
 * Cómo instalar la app en este equipo. `app="survey"` se muestra después de vincular una
 * tablet: "Seguir sin instalar" (onContinue) abre las encuestas en el navegador.
 */
export default function InstallPage({ app = 'admin', onContinue }: { app?: keyof typeof APPS; onContinue?: () => void }) {
  const { name, icon, iconClass } = APPS[app];
  const survey = app === 'survey';
  const { platform: detected, install } = useInstall();
  // Instalar requiere https: en la red local (http) ningún navegador lo permite.
  const platform = !window.isSecureContext && detected !== 'installed' ? 'insecure' : detected;
  const toast = useToast();
  const [installing, setInstalling] = useState(false);

  const onInstall = async () => {
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.create('Enlace copiado', 'Pégalo en Safari o Chrome.');
    } catch {
      toast.error('No se pudo copiar', 'Mantén presionada la dirección y cópiala.');
    }
  };

  let body: React.ReactNode;
  switch (platform) {
    case 'installed':
      body = (
        <div className="space-y-4 text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-[15px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <IconCheck className="h-5 w-5" />
            {name} ya está instalada
          </p>
          <p className="text-[14px] text-muted">Búscala en tu pantalla de inicio con este ícono.</p>
          {survey ? (
            <button onClick={onContinue} className="btn-soft h-12 w-full text-[15px]">
              Seguir aquí en el navegador
            </button>
          ) : (
            <Link to="/login" className="btn-primary h-14 w-full text-[16px]">
              Abrir SuperShop
            </Link>
          )}
        </div>
      );
      break;
    case 'insecure':
      body = (
        <p className="rounded-2xl bg-faint p-4 text-center text-[15px] leading-snug text-ink/80">
          En la red local (sin https) el navegador no permite instalar la app. Puedes usarla aquí en el navegador.
        </p>
      );
      break;
    case 'prompt':
      body = (
        <div className="space-y-3 text-center">
          <button onClick={() => void onInstall()} disabled={installing} className="btn-primary h-14 w-full text-[17px]">
            <AddToHomeIcon className="h-6 w-6" />
            Instalar app
          </button>
          <p className="text-[13px] text-muted">Se agregará a tu pantalla de inicio. No ocupa casi espacio.</p>
        </div>
      );
      break;
    case 'ios-safari':
      body = (
        <StepList
          steps={[
            {
              icon: <ShareIcon className="h-6 w-6" />,
              text: (
                <>
                  Toca el botón <strong>Compartir</strong> de Safari.
                  <span className="mt-0.5 block text-[12px] text-muted">
                    Está en la barra de abajo. Si no lo ves, toca primero <strong>•••</strong>.
                  </span>
                </>
              ),
            },
            {
              icon: <AddToHomeIcon className="h-6 w-6" />,
              text: (
                <>
                  Desliza hacia abajo y toca <strong>Agregar a inicio</strong>.
                </>
              ),
            },
            {
              icon: <span className="text-[13px] font-bold">Agregar</span>,
              text: (
                <>
                  Toca <strong>Agregar</strong> arriba a la derecha. ¡Listo!
                </>
              ),
            },
          ]}
        />
      );
      break;
    case 'ios-other':
      body = (
        <div className="space-y-4">
          <StepList
            steps={[
              {
                icon: <ShareIcon className="h-6 w-6" />,
                text: (
                  <>
                    Toca el botón <strong>Compartir</strong>, junto a la barra de dirección.
                  </>
                ),
              },
              { icon: <AddToHomeIcon className="h-6 w-6" />, text: <>Toca <strong>Agregar a inicio</strong>.</> },
              { icon: <span className="text-[13px] font-bold">Agregar</span>, text: <>Toca <strong>Agregar</strong>. ¡Listo!</> },
            ]}
          />
          <p className="text-center text-[13px] text-muted">
            ¿No aparece la opción? Copia el enlace y ábrelo en <strong>Safari</strong>.
          </p>
          <button onClick={() => void copyLink()} className="btn-soft h-12 w-full text-[15px]">
            <IconCopy className="h-5 w-5" />
            Copiar enlace
          </button>
        </div>
      );
      break;
    case 'in-app':
      body = (
        <div className="space-y-4">
          <p className="rounded-2xl bg-amber-50 p-4 text-[15px] leading-snug text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
            Este enlace se abrió dentro de otra app. Para instalar {name} ábrelo en el navegador: toca{' '}
            <strong>•••</strong> y elige <strong>Abrir en el navegador</strong> (o en Safari / Chrome).
          </p>
          <button onClick={() => void copyLink()} className="btn-soft h-12 w-full text-[15px]">
            <IconCopy className="h-5 w-5" />
            Copiar enlace
          </button>
        </div>
      );
      break;
    case 'android-manual':
      body = (
        <StepList
          steps={[
            {
              icon: <MenuDotsIcon className="h-6 w-6" />,
              text: (
                <>
                  Toca el menú <strong>⋮</strong> arriba a la derecha del navegador.
                </>
              ),
            },
            {
              icon: <AddToHomeIcon className="h-6 w-6" />,
              text: (
                <>
                  Toca <strong>Instalar app</strong> o <strong>Agregar a la pantalla principal</strong>.
                </>
              ),
            },
            { icon: <IconCheck className="h-6 w-6" />, text: <>Confirma con <strong>Instalar</strong>. ¡Listo!</> },
          ]}
        />
      );
      break;
    default:
      body = (
        <StepList
          steps={[
            {
              icon: <AddToHomeIcon className="h-6 w-6" />,
              text: (
                <>
                  En Chrome o Edge, toca el ícono de <strong>instalar</strong> al final de la barra de dirección.
                </>
              ),
            },
            { icon: <IconCheck className="h-6 w-6" />, text: <>Confirma con <strong>Instalar</strong>.</> },
          ]}
        />
      );
  }

  return (
    <div className="min-h-dvh bg-canvas px-5 py-10 text-ink">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center">
        {/* El ícono tal como se verá en la pantalla de inicio */}
        <img src={icon} alt={`Ícono de ${name}`} className={`h-24 w-24 rounded-[22px] shadow-pop ring-1 ${iconClass}`} />
        <p className="mt-2 text-[13px] font-medium text-muted">{name}</p>

        <h1 className="mt-6 text-center text-[26px] font-bold tracking-tight">
          {platform === 'installed' ? '¡Todo listo!' : `Instala ${name}`}
        </h1>
        {platform !== 'installed' && (
          <p className="mt-1.5 text-center text-[15px] text-muted">
            {survey
              ? 'Tablet vinculada. Instálala para abrir las encuestas a pantalla completa, como cualquier app.'
              : 'Tenla en tu pantalla de inicio y ábrela como cualquier app.'}
          </p>
        )}

        <div className="mt-7 w-full">{body}</div>

        {/* iPad/iPhone: la app agregada a inicio no comparte datos con Safari. */}
        {survey && (platform === 'ios-safari' || platform === 'ios-other') && (
          <p className="mt-4 text-center text-[13px] text-muted">
            Al abrirla desde el inicio te mostrará un código: escríbelo en SuperShop → Vincular dispositivos.
          </p>
        )}

        {platform !== 'installed' &&
          (survey ? (
            <button
              onClick={onContinue}
              className="mt-8 text-[14px] font-medium text-brand-600 underline-offset-4 hover:underline"
            >
              Seguir sin instalar
            </button>
          ) : (
            <Link to="/login" className="mt-8 text-[14px] font-medium text-brand-600 underline-offset-4 hover:underline">
              Continuar sin instalar
            </Link>
          ))}
      </div>
    </div>
  );
}
