import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '../../lib/toast';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ConfirmDialog, Spinner } from '../../components/Modal';
import {
  IconAlert,
  IconChevronDown,
  IconCloudCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconLock,
  IconRefresh,
  IconRegister,
} from '../../components/Icons';

interface TunnelStatus {
  mode: 'fixed' | 'quick' | null;
  running: boolean;
  url: string | null;
  ready: boolean;
  reachable: boolean | null;
  reconnecting: boolean;
  error: string | null;
  startedAt: string | null;
}

interface LanAddress {
  name: string;
  address: string;
  url: string;
  httpsUrl: string | null;
}

interface ConnectInfo {
  port: number;
  tunnel: TunnelStatus;
  autostart: boolean;
  fixed: { configured: boolean; hostname: string | null };
  lan: LanAddress[];
  https: { enabled: boolean; port: number | null; certificateUrl: string };
  weakPasswordUsers: string[];
  /** Acceso solo con enlace privado. `key` solo viene cuando está activo. */
  access: { enabled: boolean; key: string | null; forcedOff: boolean };
}

/** Clave del enlace privado: si está activo, las direcciones y los QR la incluyen. */
const AccessKeyContext = createContext<string | null>(null);

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

type Device = 'windows' | 'android' | 'ios';

const CERT_STEPS: Record<Device, React.ReactNode[]> = {
  windows: [
    'Abre el certificado descargado y pulsa "Instalar certificado".',
    <>Elige <strong>Equipo local</strong> (o Usuario actual) y pulsa Siguiente.</>,
    <>
      Marca <strong>"Colocar todos los certificados en el siguiente almacén"</strong>, pulsa Examinar y elige{' '}
      <strong>Entidades de certificación raíz de confianza</strong>.
    </>,
    'Pulsa Siguiente, Finalizar y acepta el aviso de seguridad. Cierra y vuelve a abrir el navegador.',
  ],
  android: [
    <>Abre <strong>Ajustes → Seguridad → Cifrado y credenciales</strong> (el nombre varía según la marca).</>,
    <>Toca <strong>Instalar un certificado → Certificado de CA</strong> y luego "Instalar de todos modos".</>,
    'Elige el archivo "SuperShop-certificado.crt" de Descargas.',
  ],
  ios: [
    <>Abre el enlace del certificado en <strong>Safari</strong> y toca Permitir.</>,
    <>Ve a <strong>Ajustes → Perfil descargado → Instalar</strong>.</>,
    <>
      Ve a <strong>Ajustes → General → Información → Ajustes de confianza de certificados</strong> y activa
      "SuperShop".
    </>,
  ],
};

/** ¿Se abrió SuperShop desde un dominio público que no es el túnel fijo (instalación web)? */
function isPublicHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.trycloudflare.com')) return false;
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return false;
  return true;
}

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

function Card({
  icon,
  title,
  subtitle,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
            {badge}
          </div>
          {subtitle && <p className="text-[12px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Sección que se abre y cierra; para opciones secundarias. */
function Collapsible({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-5 text-left"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-faint text-muted">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-tight">{title}</span>
          {subtitle && <span className="block text-[12px] text-muted">{subtitle}</span>}
        </span>
        <IconChevronDown className={`mt-2 h-5 w-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-hairline p-5">{children}</div>}
    </section>
  );
}

/** El QR abre /instalar: ahí se guía a la persona para agregar la app a su pantalla de inicio. */
function AddressBox({ url, onCopy, qrSize = 148 }: { url: string; onCopy: (link: string) => void; qrSize?: number }) {
  const accessKey = useContext(AccessKeyContext);
  const qrValue = withAccess(url, '/instalar', accessKey);
  const link = accessKey ? withAccess(url, '/', accessKey) : url;
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="eyebrow">{accessKey ? 'Enlace privado' : 'Dirección'}</p>
        <p className="break-all rounded-xl bg-faint px-3.5 py-3 font-mono text-[15px] font-semibold text-ink">{link}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onCopy(link)} className="btn-soft h-9 px-3.5 text-[13px]">
            <IconCopy className="h-4 w-4" />
            Copiar
          </button>
          <a href={link} target="_blank" rel="noopener noreferrer" className="btn-ghost h-9 px-3.5 text-[13px]">
            <IconExternalLink className="h-4 w-4" />
            Probar
          </a>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5 self-center">
        <div className="rounded-2xl bg-white p-2 ring-1 ring-line">
          <QRCodeSVG value={qrValue} size={qrSize} level="M" marginSize={1} bgColor="#ffffff" fgColor="#0f172a" />
        </div>
        <p className="max-w-[170px] text-center text-[11px] text-muted">
          Escanéalo con la cámara del celular para instalar la app
        </p>
      </div>
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[13px] text-ink/80">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {i + 1}
          </span>
          <span className="min-w-0 pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-brand-600' : 'bg-line'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-faint px-1.5 py-0.5 font-mono text-[12px] text-ink">{children}</span>;
}

// ---------------------------------------------------------------------------
// Dirección fija (dominio propio)
// ---------------------------------------------------------------------------

function FixedSetup({
  port,
  initialHostname,
  busy,
  onSave,
  onCancel,
}: {
  port: number;
  initialHostname: string;
  busy: boolean;
  onSave: (token: string, hostname: string) => void;
  onCancel?: () => void;
}) {
  const [token, setToken] = useState('');
  const [hostname, setHostname] = useState(initialHostname);
  const [, domain = 'tudominio.com'] = hostname.match(/^[^.]+\.(.+)$/) ?? [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(token, hostname);
      }}
      className="space-y-4"
    >
      <Steps
        items={[
          <>
            Entra a{' '}
            <a href="https://one.dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 underline">
              Cloudflare Zero Trust
            </a>{' '}
            con la cuenta donde compraste el dominio. Ve a <strong>Redes → Túneles</strong> y pulsa{' '}
            <strong>Crear un túnel</strong> → <strong>Cloudflared</strong>. Ponle de nombre <Mono>supershop</Mono>.
          </>,
          <>
            En "Instalar y ejecutar un conector" elige <strong>Windows</strong> y <strong>copia el comando</strong> que
            aparece (no hace falta ejecutarlo). Pégalo abajo: SuperShop toma el token de ahí.
          </>,
          <>
            Pulsa Siguiente. En la ruta / nombre de host público pon: subdominio <Mono>app</Mono>, dominio{' '}
            <Mono>{domain}</Mono>, tipo <Mono>HTTP</Mono> y URL <Mono>localhost:{port}</Mono>. Guarda el túnel.
          </>,
          <>Escribe abajo la dirección completa y pulsa <strong>Guardar y conectar</strong>.</>,
        ]}
      />
      <div>
        <label className="eyebrow mb-1 block" htmlFor="tunnel-token">
          Token o comando de Cloudflare
        </label>
        <textarea
          id="tunnel-token"
          className="input min-h-[84px] py-2.5 font-mono text-[12px]"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="cloudflared.exe service install eyJhIjoi…"
          spellCheck={false}
          autoComplete="off"
          required
        />
        <p className="mt-1 text-[11px] text-muted">Se guarda solo en esta computadora y nunca se muestra de nuevo.</p>
      </div>
      <div>
        <label className="eyebrow mb-1 block" htmlFor="tunnel-host">
          Dirección
        </label>
        <input
          id="tunnel-host"
          className="input font-mono text-[14px]"
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          placeholder="app.tudominio.com"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost h-10 px-4 text-sm">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={busy} className="btn-primary h-10 px-5 text-sm">
          {busy ? <Spinner className="h-4 w-4" /> : <IconCloudCheck className="h-4 w-4" />}
          Guardar y conectar
        </button>
      </div>
    </form>
  );
}

function FixedStatus({ tunnel, port, onRetry, busy }: { tunnel: TunnelStatus; port: number; onRetry: () => void; busy: boolean }) {
  if (!tunnel.running) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-red-600/20 bg-red-50 px-3.5 py-3 text-[13px] text-red-700 sm:flex-row sm:items-center dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        <IconAlert className="h-4 w-4 shrink-0" />
        <span className="flex-1">{tunnel.error ?? 'La conexión por internet está apagada.'}</span>
        <button onClick={onRetry} disabled={busy} className="btn-soft h-9 px-3.5 text-[13px]">
          <IconRefresh className="h-4 w-4" />
          Reconectar
        </button>
      </div>
    );
  }
  if (!tunnel.ready) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
        <Spinner className="h-4 w-4 shrink-0" />
        <span>{tunnel.error ?? (tunnel.reconnecting ? 'Reconectando con Cloudflare…' : 'Conectando con Cloudflare…')}</span>
      </div>
    );
  }
  if (tunnel.reachable === false) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
        <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Conectado con Cloudflare, pero la dirección todavía no abre SuperShop. En Cloudflare revisa que la ruta del
          túnel apunte a <Mono>localhost:{port}</Mono> con tipo <Mono>HTTP</Mono>. Si la acabas de crear, espera un
          par de minutos.
        </span>
      </div>
    );
  }
  return null;
}

/** Etiqueta compacta del estado del túnel fijo, para la cabecera de la tarjeta. */
function FixedBadge({ tunnel }: { tunnel: TunnelStatus }) {
  const [label, tone] = !tunnel.running
    ? ['Sin conexión', 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300']
    : !tunnel.ready || tunnel.reachable === null
      ? ['Conectando…', 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200']
      : tunnel.reachable === false
        ? ['Revisar', 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200']
        : ['En línea', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'];
  const dot = label === 'En línea' ? 'bg-emerald-500' : label === 'Sin conexión' ? 'bg-red-500' : 'bg-amber-500';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Red local
// ---------------------------------------------------------------------------

function LanSection({ info, copy }: { info: ConnectInfo; copy: (url: string) => void }) {
  const [lanIndex, setLanIndex] = useState(0);
  const [device, setDevice] = useState<Device>('windows');
  const [certOpen, setCertOpen] = useState(false);
  const accessKey = useContext(AccessKeyContext);
  const { lan } = info;

  if (lan.length === 0) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl bg-faint px-3.5 py-3 text-[13px] text-muted">
        <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Esta computadora no está conectada a una red local. Conéctala al módem o al wifi de la tienda y vuelve a abrir
          esta pantalla.
        </p>
      </div>
    );
  }

  const lanAddress = lan[Math.min(lanIndex, lan.length - 1)];
  const lanUrl = lanAddress.httpsUrl ?? lanAddress.url;
  const certificateLink = withAccess(lanAddress.url, info.https.certificateUrl, accessKey);

  return (
    <div className="space-y-5">
      <AddressBox url={lanUrl} onCopy={(link) => copy(link)} />
      {lan.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <span>¿No abre? Prueba otra dirección de esta computadora:</span>
          {lan.map((a, i) => (
            <button
              key={a.address}
              onClick={() => setLanIndex(i)}
              className={`rounded-full px-2.5 py-1 font-mono font-semibold ${
                a.address === lanAddress.address
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'bg-faint text-ink/70 hover:text-ink'
              }`}
            >
              {a.address}
            </button>
          ))}
        </div>
      )}
      {lanAddress.httpsUrl && (
        <div className="rounded-2xl border border-line">
          <button
            type="button"
            onClick={() => setCertOpen((v) => !v)}
            aria-expanded={certOpen}
            className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
          >
            <IconLock className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">
                Conexión segura: instala el certificado una vez en cada dispositivo
              </span>
              <span className="block text-[12px] text-muted">
                Así el navegador no muestra avisos de seguridad y la app funciona aunque se caiga la red.
              </span>
            </span>
            <IconChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform ${certOpen ? 'rotate-180' : ''}`} />
          </button>
          {certOpen && (
            <div className="space-y-4 border-t border-hairline px-3.5 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-[13px] text-ink/80">
                    En el otro dispositivo, abre este enlace (o escanea el código) para descargar el certificado:
                  </p>
                  <p className="break-all rounded-xl bg-faint px-3 py-2 font-mono text-[12px] text-ink">{certificateLink}</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => copy(certificateLink)} className="btn-soft h-9 px-3.5 text-[13px]">
                      <IconCopy className="h-4 w-4" />
                      Copiar enlace
                    </button>
                    <a href={info.https.certificateUrl} download className="btn-ghost h-9 px-3.5 text-[13px]">
                      <IconDownload className="h-4 w-4" />
                      Descargar aquí
                    </a>
                  </div>
                </div>
                <div className="self-center rounded-2xl bg-white p-2 ring-1 ring-line">
                  <QRCodeSVG value={certificateLink} size={112} level="M" marginSize={1} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-faint p-1">
                {(
                  [
                    ['windows', 'Windows'],
                    ['android', 'Android'],
                    ['ios', 'iPhone / iPad'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDevice(key)}
                    className={`h-9 rounded-lg text-[13px] font-medium transition-colors ${
                      device === key ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Steps items={CERT_STEPS[device]} />
              <p className="text-[12px] text-muted">
                ¿Prefieres no instalar nada? Usa{' '}
                <span className="break-all font-mono">{withAccess(lanAddress.url, '/', accessKey)}</span>: funciona igual, pero
                sin la opción de seguir trabajando cuando se cae la red.
              </p>
            </div>
          )}
        </div>
      )}
      <div className="space-y-3 border-t border-line pt-4">
        <p className="text-[13px] font-semibold text-ink">Cómo conectar otra computadora</p>
        <Steps
          items={[
            'Conéctala al mismo módem o wifi que esta computadora.',
            <>
              Abre <strong>Chrome</strong> o <strong>Edge</strong> y escribe la dirección de arriba (en una tablet o
              celular puedes escanear el código).
            </>,
            'Inicia sesión con el usuario de esa persona o de esa caja.',
            <>
              Para tenerlo como programa: en Chrome abre el menú <strong>⋮ → Transmitir, guardar y compartir → Crear
              acceso directo</strong> y marca <strong>Abrir como ventana</strong>.
            </>,
          ]}
        />
      </div>
      <div className="rounded-xl bg-faint px-3.5 py-3 text-[12px] text-muted">
        <p className="font-semibold text-ink/80">Si la otra computadora no abre la dirección:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Revisa que las dos estén en la misma red (mismo wifi o módem).</li>
          <li>
            En esta computadora, permite SuperShop en el <strong>Firewall de Windows</strong> para redes privadas
            (Windows lo pregunta la primera vez que se abre).
          </li>
          <li>
            Esta computadora debe estar encendida con SuperShop abierto. Si la dirección cambia después de reiniciar el
            módem, pide a tu proveedor de internet que le asigne una IP fija.
          </li>
        </ul>
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
  const [editingFixed, setEditingFixed] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
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

  // Mientras el túnel conecta (o reconecta) se consulta su estado cada pocos segundos;
  // ya conectado, cada 30 s para mostrar si se cae.
  const tunnel = info?.tunnel;
  const settling = !!tunnel?.running && (!tunnel.ready || tunnel.reachable === null);
  useEffect(() => {
    if (!tunnel?.running) return;
    const timer = window.setInterval(() => void load(), settling ? 2500 : 30000);
    return () => window.clearInterval(timer);
  }, [tunnel?.running, settling, load]);

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

  const copy = async (url: string) => {
    if (await copyText(url)) toast.create('Dirección copiada', 'Pégala en el navegador o envíala por WhatsApp.');
    else toast.error('No se pudo copiar', 'Selecciona la dirección y cópiala manualmente.');
  };

  const setAutostartDesktop = async (enabled: boolean) => {
    if (!desktop?.setAutostart) return;
    setOpenAtLogin(await desktop.setAutostart(enabled));
  };

  const saveFixed = async (token: string, hostname: string) => {
    if (await call('/api/admin/tunnel/fixed', { token, hostname }, 'PUT')) {
      setEditingFixed(false);
      toast.create('Dirección fija guardada', 'Conectando con Cloudflare…');
      // Para que la dirección esté siempre en línea, SuperShop abre solo al encender la computadora.
      if (desktop?.setAutostart && openAtLogin === false) void setAutostartDesktop(true);
    }
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

  const { fixed } = info;
  const quickTunnel = info.tunnel.mode !== 'fixed' ? info.tunnel : null;
  const hostname = window.location.hostname;
  const publicOrigin = !fixed.configured && isPublicHost(hostname) ? window.location.origin : null;
  const fixedUrl = fixed.hostname ? `https://${fixed.hostname}` : null;

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

  const privateOn = info.access.enabled;
  const privateAccess = isAdmin ? (
    <PrivateAccess
      access={info.access}
      busy={busy}
      onSave={(enabled) =>
        void call('/api/admin/access-gate', { enabled }, 'PUT').then(
          (ok) => ok && toast.update(enabled ? 'Acceso privado activo' : 'Acceso privado apagado')
        )
      }
      onRegenerate={() =>
        void call('/api/admin/access-gate/regenerate').then(
          (ok) => ok && toast.update('Enlace nuevo generado', 'Comparte el nuevo enlace o QR con tu personal.')
        )
      }
    />
  ) : null;

  const desktopAutostart = desktop?.setAutostart && openAtLogin !== null && (
    <div className="flex items-start justify-between gap-3 border-t border-line pt-4">
      <div>
        <p className="text-[14px] font-semibold text-ink">Abrir SuperShop al encender esta computadora</p>
        <p className="text-[12px] text-muted">
          Arranca sola en segundo plano (junto al reloj) para que la dirección esté siempre en línea.
        </p>
      </div>
      <Switch label="Abrir al encender la computadora" checked={openAtLogin} onChange={(v) => void setAutostartDesktop(v)} />
    </div>
  );

  return (
    <AccessKeyContext.Provider value={info.access.key}>
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">Vincular dispositivos</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Conecta celulares, tablets y otras computadoras a esta computadora principal.
        </p>
      </div>

      {weakPasswords}

      {publicOrigin ? (
        <Card
          icon={<IconCloudCheck className="h-5 w-5" />}
          title="Tu SuperShop ya está en internet"
          subtitle={
            privateOn
              ? 'Solo entra quien tenga este enlace privado.'
              : 'Cualquier dispositivo con internet puede entrar con esta dirección.'
          }
        >
          <div className="space-y-5">
            {privateAccess}
            <AddressBox url={publicOrigin} onCopy={(link) => void copy(link)} />
            <Steps
              items={[
                `Escanea el código con la cámara del celular, o abre ${privateOn ? 'el enlace' : 'la dirección'} en el navegador.`,
                'Sigue los pasos para instalar la app y inicia sesión.',
              ]}
            />
          </div>
        </Card>
      ) : fixed.configured && fixedUrl && !editingFixed ? (
        <>
          {/* Dirección fija: un solo QR para todos */}
          <Card
            icon={<IconCloudCheck className="h-5 w-5" />}
            title="Tu app SuperShop"
            subtitle="Una sola dirección para todos: en la tienda, en casa o con datos del celular."
            badge={<FixedBadge tunnel={info.tunnel} />}
          >
            <div className="space-y-5">
              <FixedStatus tunnel={info.tunnel} port={info.port} busy={busy} onRetry={() => void call('/api/admin/tunnel/start')} />
              {privateAccess}
              <AddressBox url={fixedUrl} onCopy={(link) => void copy(link)} qrSize={176} />
              <div className="space-y-3 border-t border-line pt-4">
                <p className="text-[13px] font-semibold text-ink">Cómo conectar un celular o computadora (una sola vez)</p>
                <Steps
                  items={[
                    'Escanea el código con la cámara del celular (o abre la dirección en el navegador de la computadora).',
                    'Sigue los pasos que aparecen para instalar la app con el ícono de SuperShop.',
                    'Abre la app e inicia sesión con el usuario de esa persona.',
                  ]}
                />
              </div>
              {desktopAutostart}
              <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
                <button onClick={() => setEditingFixed(true)} className="btn-ghost h-9 px-3.5 text-[13px]">
                  Cambiar configuración
                </button>
                <button onClick={() => setConfirmRemove(true)} className="btn-ghost h-9 px-3.5 text-[13px] text-red-600">
                  Quitar dirección fija
                </button>
              </div>
            </div>
          </Card>

          <Collapsible
            icon={<IconRegister className="h-5 w-5" />}
            title="Sin internet: por la red de la tienda"
            subtitle="Respaldo para cuando falle el internet. Funciona con los equipos conectados al mismo módem o wifi."
          >
            <LanSection info={info} copy={(u) => void copy(u)} />
          </Collapsible>
        </>
      ) : (
        <>
          {/* Configurar la dirección fija */}
          <Card
            icon={<IconCloudCheck className="h-5 w-5" />}
            title={editingFixed ? 'Cambiar dirección fija' : 'Dirección fija con tu dominio'}
            subtitle="Un solo código QR que funciona en cualquier lugar y nunca cambia. Se configura una sola vez."
            badge={
              !editingFixed && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Recomendado
                </span>
              )
            }
          >
            <FixedSetup
              port={info.port}
              initialHostname={fixed.hostname ?? ''}
              busy={busy}
              onSave={(t, h) => void saveFixed(t, h)}
              onCancel={editingFixed ? () => setEditingFixed(false) : undefined}
            />
          </Card>

          {!editingFixed && (
            <>
              <Card
                icon={<IconRegister className="h-5 w-5" />}
                title="Computadoras y tablets de la tienda"
                subtitle="Por la red de la tienda (mismo módem o wifi). No necesita internet."
              >
                {privateAccess && <div className="mb-5">{privateAccess}</div>}
                <LanSection info={info} copy={(u) => void copy(u)} />
              </Card>

              {quickTunnel && (
                <Collapsible
                  icon={<IconCloudCheck className="h-5 w-5" />}
                  title="Conexión temporal por internet"
                  subtitle="Para una prueba rápida sin dominio. La dirección cambia cada vez que se inicia."
                >
                  <QuickTunnelSection
                    tunnel={quickTunnel}
                    autostart={info.autostart}
                    busy={busy}
                    copy={(u) => void copy(u)}
                    call={call}
                  />
                </Collapsible>
              )}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title="Quitar dirección fija"
        danger
        confirmLabel="Quitar"
        message="Los celulares y equipos que usan la dirección fija dejarán de conectarse por internet. El túnel en Cloudflare no se borra."
        onConfirm={() => {
          setConfirmRemove(false);
          void call('/api/admin/tunnel/fixed', undefined, 'DELETE');
        }}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
    </AccessKeyContext.Provider>
  );
}

/**
 * Interruptor de acceso privado, dentro de la tarjeta del QR (solo Administrador). Al
 * activarlo, la dirección y el QR de esa tarjeta pasan a ser el enlace privado.
 */
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
    <div
      className={`space-y-3 rounded-2xl border px-4 py-3.5 ${
        access.enabled
          ? 'border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10'
          : 'border-line bg-faint'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <IconLock
            className={`mt-0.5 h-4 w-4 shrink-0 ${access.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}`}
          />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink">
              Acceso privado{' '}
              <span className={access.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}>
                · {access.enabled ? 'Activo' : 'Apagado'}
              </span>
            </p>
            <p className="text-[12px] text-muted">
              {access.enabled
                ? 'Solo entra quien abra este enlace o escanee este QR (una vez por dispositivo). Los demás ven una página de presentación, sin inicio de sesión.'
                : 'Actívalo para que solo entre quien tenga el enlace o escanee este QR. Los demás verán una página de presentación, sin inicio de sesión.'}
            </p>
          </div>
        </div>
        <Switch
          label="Acceso privado"
          checked={access.enabled}
          onChange={(v) => (v ? setConfirmEnable(true) : onSave(false))}
        />
      </div>

      {access.forcedOff && (
        <p className="flex items-start gap-2 text-[12px] text-amber-700 dark:text-amber-300">
          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Está apagado por la variable <Mono>ACCESS_GATE_DISABLED</Mono> del servidor. Quítala para que vuelva a
            funcionar.
          </span>
        </p>
      )}

      {access.enabled && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-500/20 pt-3">
          <p className="text-[12px] text-muted">¿El enlace llegó a quien no debía? Genera uno nuevo.</p>
          <button
            onClick={() => setConfirmRegenerate(true)}
            disabled={busy}
            className="btn-ghost h-8 px-3 text-[12px] text-red-600"
          >
            <IconRefresh className="h-3.5 w-3.5" />
            Generar enlace nuevo
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmEnable}
        title="Pedir enlace privado"
        confirmLabel="Activar"
        message="Los celulares, tablets y computadoras que ya usan SuperShop dejarán de entrar hasta que abran el enlace privado o escaneen otra vez el QR de esta pantalla. Este dispositivo queda autorizado."
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
        message="El enlace actual deja de funcionar y todos los dispositivos, menos este, tendrán que abrir el enlace nuevo. Úsalo si el enlace llegó a quien no debía."
        onConfirm={() => {
          setConfirmRegenerate(false);
          onRegenerate();
        }}
        onClose={() => setConfirmRegenerate(false)}
      />
    </div>
  );
}

function QuickTunnelSection({
  tunnel,
  autostart,
  busy,
  copy,
  call,
}: {
  tunnel: TunnelStatus;
  autostart: boolean;
  busy: boolean;
  copy: (url: string) => void;
  call: (path: string, body?: unknown, method?: string) => Promise<boolean>;
}) {
  const connecting = tunnel.running && !tunnel.ready;
  return (
    <div className="space-y-4">
      {tunnel.error && !tunnel.running && (
        <div className="flex items-start gap-2 rounded-xl border border-red-600/20 bg-red-50 px-3.5 py-3 text-[13px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{tunnel.error}</span>
        </div>
      )}

      {!tunnel.running ? (
        <div className="flex flex-col gap-3 rounded-xl bg-faint px-3.5 py-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-[13px] text-muted">La conexión temporal está apagada.</p>
          <button onClick={() => void call('/api/admin/tunnel/start')} disabled={busy} className="btn-primary h-10 px-4 text-[13px]">
            {busy ? <Spinner className="h-4 w-4" /> : <IconCloudCheck className="h-4 w-4" />}
            {tunnel.error ? 'Reintentar' : 'Activar'}
          </button>
        </div>
      ) : connecting ? (
        <div className="flex flex-col gap-3 rounded-xl bg-brand-50 px-3.5 py-3 text-[13px] text-brand-800 sm:flex-row sm:items-center dark:bg-brand-500/10 dark:text-brand-200">
          <Spinner className="h-4 w-4 shrink-0" />
          <p className="flex-1">Creando la dirección… tarda unos segundos.</p>
          <button onClick={() => void call('/api/admin/tunnel/stop')} disabled={busy} className="font-semibold underline">
            Cancelar
          </button>
        </div>
      ) : (
        tunnel.url && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Activa
              </span>
              <button onClick={() => void call('/api/admin/tunnel/stop')} disabled={busy} className="btn-soft h-9 px-3.5 text-[13px]">
                Apagar
              </button>
            </div>
            <AddressBox url={tunnel.url} onCopy={(link) => copy(link)} />
          </div>
        )
      )}

      <div className="flex items-start justify-between gap-3 border-t border-line pt-4">
        <div>
          <p className="text-[14px] font-semibold text-ink">Activar al abrir SuperShop</p>
          <p className="text-[12px] text-muted">Recuerda compartir la nueva dirección cada vez.</p>
        </div>
        <Switch
          label="Activar al abrir SuperShop"
          checked={autostart}
          onChange={(v) => void call('/api/admin/tunnel/settings', { autostart: v }, 'PUT')}
        />
      </div>
    </div>
  );
}
