import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '../../lib/toast';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ConfirmDialog, Spinner } from '../../components/Modal';
import Switch from '../../components/Switch';
import { IconAlert, IconExternalLink, IconLock, IconRefresh, IconShare } from '../../components/Icons';
import { NoNetworkNotice, QrAddressPicker, SurveyPairingCard, useQrTarget } from './DevicesSection';
import type { PairingAddress } from './DevicesSection';

/*
 * Vincular dispositivos: dos tarjetas.
 * - SuperShop Survey: QR para tablets de encuestas (DevicesSection.tsx).
 * - SuperShop: QR para equipos de administración (entran con usuario), con acceso privado
 *   o público.
 * Los QR usan el dominio fijo en la versión web y la IP de la red local en la app de
 * escritorio (ver useQrTarget en DevicesSection.tsx).
 */

interface LanAddress {
  name: string;
  address: string;
  url: string;
  httpsUrl: string | null;
}

interface ConnectInfo {
  lan: LanAddress[];
  weakPasswordUsers: string[];
  /** Acceso solo con enlace privado. `key` solo viene cuando está activo. */
  access: { enabled: boolean; key: string | null; forcedOff: boolean };
}

/** Dirección con la clave de acceso, p. ej. https://app.com/instalar?acceso=… */
function withAccess(url: string, path: string, key: string | null): string {
  return key ? `${url}${path}?acceso=${encodeURIComponent(key)}` : `${url}${path}`;
}

interface DesktopApi {
  getAutostart?: () => Promise<boolean | null>;
  setAutostart?: (enabled: boolean) => Promise<boolean>;
}

/** Solo en la app de escritorio (ver electron/preload.cjs). */
const desktop = (window as Window & { electronAPI?: DesktopApi }).electronAPI?.setAutostart
  ? ((window as Window & { electronAPI?: DesktopApi }).electronAPI as DesktopApi)
  : null;

/** Logo de SuperShop (fondo azul). */
const ADMIN_ICON = '/icon-192.png';

/** Copia al portapapeles; en http (red local) el navegador no ofrece navigator.clipboard. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* se intenta el método alterno */
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  el.remove();
  return ok;
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-faint px-1.5 py-0.5 font-mono text-[12px] text-ink">{children}</span>;
}

/** Fila de ajuste dentro de la tarjeta: título, una línea de explicación y el control. */
function Row({ title, hint, children }: { title: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        {hint && <p className="text-[12px] text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** QR de SuperShop: abre /instalar, que guía para agregar la app a la pantalla de inicio. */
function AddressBox({ url, accessKey, onShare }: { url: string; accessKey: string | null; onShare: (link: string) => void }) {
  const qrValue = withAccess(url, '/instalar', accessKey);
  const link = withAccess(url, '/', accessKey);
  const qrSize = 176;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="rounded-2xl bg-white p-2 ring-1 ring-line">
        <QRCodeSVG
          value={qrValue}
          size={qrSize}
          level="Q"
          marginSize={1}
          bgColor="#ffffff"
          fgColor="#0f172a"
          imageSettings={{ src: ADMIN_ICON, height: Math.round(qrSize * 0.2), width: Math.round(qrSize * 0.2), excavate: true }}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <ol className="space-y-1.5 text-[13px] text-ink/80">
          <li>1. Escanea el código con la cámara (o abre el enlace).</li>
          <li>2. Instala la app y entra con el usuario de esa persona.</li>
        </ol>
        <p className="break-all rounded-xl bg-faint px-3 py-2 font-mono text-[13px] font-semibold text-ink">{link}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => onShare(link)} className="btn-primary h-9 px-4 text-[13px]">
            <IconShare className="h-4 w-4" />
            Compartir
          </button>
          <a href={link} target="_blank" rel="noopener noreferrer" className="btn-ghost h-9 px-3.5 text-[13px]">
            <IconExternalLink className="h-4 w-4" />
            Probar
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function ConnectPage() {
  const toast = useToast();
  const isAdmin = !!useAuth().user?.is_admin;
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openAtLogin, setOpenAtLogin] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await api<ConnectInfo>('/api/admin/tunnel'));
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la información');
    }
  }, []);

  useEffect(() => {
    void load();
    void desktop?.getAutostart?.().then((v) => setOpenAtLogin(v ?? null));
  }, [load]);

  // Escritorio: direcciones http de esta computadora en la red de la tienda. Se usa http
  // para que abran sin instalar el certificado de la red local.
  const localAddresses: PairingAddress[] = (info?.lan ?? []).map((a) => ({ label: a.address, url: a.url }));
  const adminTarget = useQrTarget(localAddresses);

  const call = async (path: string, body?: unknown, method = 'POST') => {
    setBusy(true);
    try {
      setInfo(await api<ConnectInfo>(path, { method, body }));
      return true;
    } catch (err) {
      toast.error('No se pudo completar', err instanceof Error ? err.message : undefined);
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Compartir: abre el menú de compartir del equipo (WhatsApp, correo…). Si el navegador no
   * lo tiene (o la página es http, como en la red local), copia el enlace.
   */
  const share = async (url: string) => {
    if (typeof navigator.share === 'function' && window.isSecureContext) {
      try {
        await navigator.share({ title: 'SuperShop', text: 'Entra a SuperShop con este enlace:', url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // la persona cerró el menú
      }
    }
    if (await copyText(url)) toast.create('Enlace copiado', 'Pégalo en WhatsApp, un correo o donde quieras enviarlo.');
    else toast.error('No se pudo copiar', 'Selecciona el enlace y cópialo manualmente.');
  };

  const setAutostartDesktop = async (enabled: boolean) => {
    if (!desktop?.setAutostart) return;
    setOpenAtLogin(await desktop.setAutostart(enabled));
  };

  if (!info) {
    return (
      <div className="grid place-items-center py-16 text-center">
        {loadError ? (
          <div className="space-y-3">
            <p className="text-[14px] text-muted">{loadError}</p>
            <button onClick={() => void load()} className="btn-soft h-10 px-4 text-[13px]">
              <IconRefresh className="h-4 w-4" />
              Reintentar
            </button>
          </div>
        ) : (
          <Spinner className="h-7 w-7 text-brand-600" />
        )}
      </div>
    );
  }

  const weakPasswords = info.weakPasswordUsers.length > 0 && (
    <div className="flex items-start gap-2.5 rounded-2xl border border-red-600/20 bg-red-50 px-4 py-3.5 text-[13px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <strong>Antes de compartir SuperShop por internet</strong>, cambia la contraseña de{' '}
        {info.weakPasswordUsers.map((u, i) => (
          <span key={u}>
            {i > 0 && ', '}
            <strong className="font-mono">{u}</strong>
          </span>
        ))}
        : todavía tiene la contraseña de fábrica y cualquiera podría entrar.{' '}
        <Link to="/app/ajustes/usuarios" className="font-semibold underline">
          Ir a Usuarios
        </Link>
      </p>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">Vincular dispositivos</h1>
        <p className="mt-0.5 text-[13px] text-muted">Escanea el código con el dispositivo que quieres agregar.</p>
      </div>

      {weakPasswords}

      <SurveyPairingCard localAddresses={localAddresses} accessKey={info.access.key} />

      <section className="card space-y-4 p-5">
        <div className="flex items-start gap-3">
          <img src={ADMIN_ICON} alt="" className="h-10 w-10 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight">SuperShop</h2>
            <p className="text-[12px] text-muted">
              Celulares y computadoras para administrar: cada persona entra con su usuario.
            </p>
          </div>
        </div>

        {adminTarget.url ? (
          <AddressBox url={adminTarget.url} accessKey={info.access.key} onShare={(link) => void share(link)} />
        ) : (
          <NoNetworkNotice />
        )}

        <QrAddressPicker target={adminTarget} />

        {isAdmin && (
          <PrivateAccess
            access={info.access}
            busy={busy}
            onSave={(enabled) =>
              void call('/api/admin/access-gate', { enabled }, 'PUT').then(
                (ok) => ok && toast.update(enabled ? 'Acceso privado activo' : 'Acceso público')
              )
            }
            onRegenerate={() =>
              void call('/api/admin/access-gate/regenerate').then(
                (ok) => ok && toast.update('Enlace nuevo generado', 'Vuelve a compartir el código.')
              )
            }
          />
        )}

        {desktop?.setAutostart && openAtLogin !== null && (
          <Row title="Abrir al encender la computadora" hint="Para que SuperShop esté siempre en línea.">
            <Switch label="Abrir al encender la computadora" checked={openAtLogin} onChange={(v) => void setAutostartDesktop(v)} />
          </Row>
        )}
      </section>
    </div>
  );
}

/** Acceso privado o público de la tarjeta SuperShop (solo Administrador). */
function PrivateAccess({
  access,
  busy,
  onSave,
  onRegenerate,
}: {
  access: ConnectInfo['access'];
  busy: boolean;
  onSave: (enabled: boolean) => void;
  onRegenerate: () => void;
}) {
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  return (
    <>
      <Row
        title={
          <span className="flex items-center gap-2">
            <IconLock className={`h-4 w-4 ${access.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}`} />
            Acceso {access.enabled ? 'privado' : 'público'}
          </span>
        }
        hint={
          access.enabled
            ? 'Solo entra quien escanee este código o abra este enlace.'
            : 'Cualquiera con la dirección ve la pantalla de inicio de sesión.'
        }
      >
        <div className="flex items-center gap-2">
          {access.enabled && (
            <button
              onClick={() => setConfirmRegenerate(true)}
              disabled={busy}
              className="btn-ghost h-8 px-3 text-[12px] text-red-600"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              Enlace nuevo
            </button>
          )}
          <Switch
            label="Acceso privado"
            checked={access.enabled}
            onChange={(v) => (v ? setConfirmEnable(true) : onSave(false))}
          />
        </div>
      </Row>

      {access.forcedOff && (
        <p className="flex items-start gap-2 text-[12px] text-amber-700 dark:text-amber-300">
          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Está apagado por la variable <Mono>ACCESS_GATE_DISABLED</Mono> del servidor. Quítala para que vuelva a
            funcionar.
          </span>
        </p>
      )}

      <ConfirmDialog
        open={confirmEnable}
        title="Activar acceso privado"
        confirmLabel="Activar"
        message="Los equipos que ya usan SuperShop tendrán que escanear otra vez este código. Las tablets de encuestas y este equipo siguen entrando."
        onConfirm={() => {
          setConfirmEnable(false);
          onSave(true);
        }}
        onClose={() => setConfirmEnable(false)}
      />
      <ConfirmDialog
        open={confirmRegenerate}
        title="Generar enlace nuevo"
        danger
        confirmLabel="Generar"
        message="El enlace actual deja de funcionar: los equipos, menos este y las tablets de encuestas, tendrán que escanear el código nuevo. Úsalo si el enlace llegó a quien no debía."
        onConfirm={() => {
          setConfirmRegenerate(false);
          onRegenerate();
        }}
        onClose={() => setConfirmRegenerate(false)}
      />
    </>
  );
}
