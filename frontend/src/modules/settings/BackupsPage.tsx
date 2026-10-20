import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { fmtDateTime, timeAgo } from '../../lib/format';
import { ConfirmDialog, Modal, Spinner } from '../../components/Modal';
import Select from '../../components/Select';
import {
  IconAlert,
  IconCheck,
  IconCloudCheck,
  IconDownload,
  IconExternalLink,
  IconFileArchive,
  IconFolder,
  IconHardDrive,
  IconRefresh,
  IconTrash,
  IconUpload,
} from '../../components/Icons';

// ---------------------------------------------------------------------------
// Tipos (respuesta de /api/admin/backup/settings)
// ---------------------------------------------------------------------------

type Frequency = 'daily' | 'weekly' | 'monthly';
type Target = 'local' | 'drive';

interface Schedule {
  enabled: boolean;
  frequency: Frequency;
  time: string;
  weekday: number;
  monthday: number;
}

interface TargetStatus {
  lastRun: string | null;
  lastFile: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  nextRun: string | null;
}

interface BackupSettings {
  config: { timezone: string | null; retention: number; local: Schedule; drive: Schedule };
  status: Record<Target, TargetStatus>;
  drive: { available: boolean; connected: boolean; email: string | null; folderUrl: string | null };
  retentionOptions: number[];
}

interface BackupFile {
  name: string;
  size: number;
  created_at: string;
}

const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

interface SaveFileHandle {
  name: string;
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}

declare global {
  interface Window {
    /** Solo en la app de escritorio (ver electron/preload.cjs). */
    electronAPI?: {
      openBackupsFolder?: () => Promise<boolean>;
      chooseBackupLocation?: () => Promise<string | null>;
      saveBackupToLocation?: (fileName: string) => Promise<string | null>;
    };
    /** File System Access API (Chrome/Edge): diálogo "Guardar como" del navegador. */
    showSaveFilePicker?: (options: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<SaveFileHandle>;
  }
}

const desktop = window.electronAPI?.chooseBackupLocation ? window.electronAPI : null;

const WEEKDAY_OPTIONS = [
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
];

const MONTHDAY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Día ${i + 1}` }));

function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'a. m.' : 'p. m.';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

const TIME_VALUES = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`
);

function timeOptions(current: string) {
  const values = TIME_VALUES.includes(current) ? TIME_VALUES : [...TIME_VALUES, current].sort();
  return values.map((v) => ({ value: v, label: timeLabel(v) }));
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtLong(iso: string): string {
  const text = new Date(iso).toLocaleString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Fecha del respaldo a partir de su nombre (supershop-backup-2026-10-19T23-52-13-636Z.zip). */
function fileDate(file: BackupFile): string {
  const m = file.name.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : file.created_at;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    let message = 'Error del servidor';
    try {
      message = (await res.json()).error || message;
    } catch {
      /* respuesta sin JSON */
    }
    throw new Error(message);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Componentes de la pantalla
// ---------------------------------------------------------------------------

function DriveLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 87.3 78" className={className} aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

function Card({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-[12px] text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
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

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-faint p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-9 rounded-lg text-[13px] font-medium transition-colors ${
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatusLine({ status, emptyText }: { status: TargetStatus; emptyText: string }) {
  const failedLast =
    status.lastError && (!status.lastRun || (status.lastErrorAt ?? '') > status.lastRun);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5 rounded-xl bg-faint px-3.5 py-3">
        {status.lastRun ? (
          <IconCheck className="h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full bg-muted/40" />
        )}
        <p className="text-[13px] text-ink">
          {status.lastRun ? (
            <>
              Último respaldo <strong>{timeAgo(status.lastRun)}</strong>
              <span className="text-muted"> · {fmtDateTime(status.lastRun)}</span>
            </>
          ) : (
            <span className="text-muted">{emptyText}</span>
          )}
        </p>
      </div>
      {failedLast && (
        <div className="flex items-start gap-2 rounded-xl border border-red-600/20 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {status.lastError}
            {status.lastErrorAt && <span className="opacity-70"> ({timeAgo(status.lastErrorAt)})</span>}
          </span>
        </div>
      )}
    </div>
  );
}

function ScheduleEditor({
  schedule,
  nextRun,
  hint,
  disabled,
  onChange,
}: {
  schedule: Schedule;
  nextRun: string | null;
  hint: string;
  disabled?: boolean;
  onChange: (patch: Partial<Schedule>) => void;
}) {
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-ink">Respaldo automático</p>
          <p className="text-[12px] text-muted">
            {schedule.enabled ? 'Activado' : 'Desactivado: solo se respalda cuando lo pidas.'}
          </p>
        </div>
        <Switch
          label="Respaldo automático"
          checked={schedule.enabled}
          disabled={disabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </div>

      {schedule.enabled && (
        <div className="space-y-3">
          <Segmented<Frequency>
            value={schedule.frequency}
            onChange={(frequency) => onChange({ frequency })}
            options={[
              { value: 'daily', label: 'Diario' },
              { value: 'weekly', label: 'Semanal' },
              { value: 'monthly', label: 'Mensual' },
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {schedule.frequency === 'weekly' && (
              <div>
                <label className="eyebrow mb-1 block">Día</label>
                <Select
                  value={String(schedule.weekday)}
                  onChange={(v) => onChange({ weekday: Number(v) })}
                  options={WEEKDAY_OPTIONS}
                />
              </div>
            )}
            {schedule.frequency === 'monthly' && (
              <div>
                <label className="eyebrow mb-1 block">Día del mes</label>
                <Select
                  value={String(schedule.monthday)}
                  onChange={(v) => onChange({ monthday: Number(v) })}
                  options={MONTHDAY_OPTIONS}
                />
              </div>
            )}
            <div className={schedule.frequency === 'daily' ? 'sm:col-span-2' : ''}>
              <label className="eyebrow mb-1 block">Hora</label>
              <Select value={schedule.time} onChange={(time) => onChange({ time })} options={timeOptions(schedule.time)} />
            </div>
          </div>
          {nextRun && (
            <p className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-[13px] text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
              Próximo respaldo: <strong>{fmtLong(nextRun)}</strong>
            </p>
          )}
          <p className="text-[12px] text-muted">{hint}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

type PendingRestore = { kind: 'file'; file: BackupFile } | { kind: 'upload'; upload: File };

export default function BackupsPage() {
  const toast = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [loadError, setLoadError] = useState('');
  const [running, setRunning] = useState<Target | null>(null);
  const [saving, setSaving] = useState(false);

  const [connecting, setConnecting] = useState(false);
  const authUrl = useRef<string | null>(null);
  const popup = useRef<Window | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const [toDelete, setToDelete] = useState<BackupFile | null>(null);
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    try {
      const res = await api<{ items: BackupFile[] }>('/api/admin/backup/files');
      setFiles(res.items);
    } catch {
      /* la lista es secundaria; el error principal se muestra al cargar ajustes */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setSettings(await api<BackupSettings>('/api/admin/backup/settings'));
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la configuración');
    }
    await loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    void load();
  }, [load]);

  // La URL de autorización se pide por adelantado: así el clic en "Conectar" abre la
  // ventana al instante y el navegador no la bloquea como ventana emergente.
  const driveNeedsAuth = !!settings?.drive.available && !settings.drive.connected;
  const prefetchAuthUrl = useCallback(async () => {
    try {
      authUrl.current = (await api<{ authUrl: string }>('/api/admin/backup/auth-url')).authUrl;
    } catch {
      authUrl.current = null;
    }
  }, []);

  useEffect(() => {
    if (!driveNeedsAuth) return;
    void prefetchAuthUrl();
    const timer = window.setInterval(prefetchAuthUrl, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [driveNeedsAuth, prefetchAuthUrl]);

  // Mientras se autoriza en Google, se revisa cada pocos segundos si ya quedó conectado.
  useEffect(() => {
    if (!connecting) return;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      try {
        const next = await api<BackupSettings>('/api/admin/backup/settings');
        if (next.drive.connected) {
          setSettings(next);
          setConnecting(false);
          popup.current?.close();
          toast.create('Google Drive conectado', next.drive.email ?? undefined);
        } else if (Date.now() - started > 5 * 60 * 1000) {
          setConnecting(false);
        }
      } catch {
        /* se reintenta en el siguiente ciclo */
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [connecting, toast]);

  const connectDrive = () => {
    if (!authUrl.current) {
      toast.error('No se pudo iniciar la conexión', 'Inténtalo de nuevo en unos segundos.');
      void prefetchAuthUrl();
      return;
    }
    popup.current = window.open(authUrl.current, '_blank', 'width=520,height=680');
    authUrl.current = null;
    setConnecting(true);
    void prefetchAuthUrl();
  };

  const disconnectDrive = async () => {
    try {
      setSettings(await api<BackupSettings>('/api/admin/backup/drive/disconnect', { method: 'POST' }));
      toast.deactivate('Google Drive desconectado');
    } catch (err) {
      toast.error('No se pudo desconectar', err instanceof Error ? err.message : undefined);
    } finally {
      setConfirmDisconnect(false);
    }
  };

  const saveConfig = async (body: Record<string, unknown>) => {
    if (!settings) return;
    setSaving(true);
    try {
      setSettings(
        await api<BackupSettings>('/api/admin/backup/settings', {
          method: 'PUT',
          body: { timezone: BROWSER_TZ, ...body },
        })
      );
      await loadFiles();
    } catch (err) {
      toast.error('No se guardó el cambio', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const updateSchedule = (target: Target, patch: Partial<Schedule>) => {
    if (!settings) return;
    void saveConfig({ [target]: { ...settings.config[target], ...patch } });
  };

  /** Crea el respaldo en el servidor (carpeta por defecto o Drive). Devuelve su nombre o null si falló. */
  const runNow = async (target: Target, notify = true): Promise<string | null> => {
    setRunning(target);
    try {
      const res = await api<{ result: { name: string }; settings: BackupSettings }>('/api/admin/backup/run', {
        method: 'POST',
        body: { target },
      });
      setSettings(res.settings);
      if (notify) {
        toast.create(target === 'drive' ? 'Respaldo subido a Google Drive' : 'Respaldo guardado en este equipo');
      }
      return res.result.name;
    } catch (err) {
      toast.error('No se pudo respaldar', err instanceof Error ? err.message : undefined);
      try {
        setSettings(await api<BackupSettings>('/api/admin/backup/settings'));
      } catch {
        /* se conserva el estado anterior */
      }
      return null;
    } finally {
      setRunning(null);
      await loadFiles();
    }
  };

  /**
   * "Respaldar ahora" local: primero se elige dónde guardar (explorador de archivos),
   * luego se crea el respaldo. SuperShop conserva además su copia en la carpeta por defecto.
   * - Escritorio: diálogo nativo que sugiere la carpeta por defecto.
   * - Navegador con "Guardar como" (Chrome/Edge): diálogo del navegador.
   * - Otros navegadores (celular): se descarga normalmente.
   */
  const runLocalNow = async () => {
    if (desktop?.chooseBackupLocation && desktop.saveBackupToLocation) {
      const chosen = await desktop.chooseBackupLocation();
      if (!chosen) return;
      const name = await runNow('local', false);
      if (!name) return;
      try {
        const saved = await desktop.saveBackupToLocation(name);
        toast.create('Respaldo guardado', saved ?? undefined);
      } catch {
        toast.error('No se pudo guardar en la carpeta elegida', 'El respaldo quedó en la carpeta de respaldos locales.');
      }
      await loadFiles();
      return;
    }

    let handle: SaveFileHandle | null = null;
    if (window.showSaveFilePicker) {
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: `supershop-backup-${new Date().toISOString().slice(0, 10)}.zip`,
          types: [{ description: 'Respaldo de SuperShop', accept: { 'application/zip': ['.zip'] } }],
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        handle = null;
      }
    }
    const name = await runNow('local', false);
    if (!name) return;
    try {
      const res = await authedFetch(`/api/admin/backup/files/${encodeURIComponent(name)}`);
      const blob = await res.blob();
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        toast.create('Respaldo guardado', handle.name);
      } else {
        saveBlob(blob, name);
        toast.create('Respaldo descargado', 'También queda guardado en el equipo donde funciona SuperShop.');
      }
    } catch (err) {
      toast.error('El respaldo se creó, pero no se pudo guardar donde elegiste', err instanceof Error ? err.message : undefined);
    }
  };

  const openLocalBackups = () => {
    if (desktop?.openBackupsFolder) {
      void desktop.openBackupsFolder();
    } else {
      document.getElementById('respaldos-guardados')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const download = async (file: BackupFile) => {
    try {
      const res = await authedFetch(`/api/admin/backup/files/${encodeURIComponent(file.name)}`);
      saveBlob(await res.blob(), file.name);
    } catch (err) {
      toast.error('No se pudo descargar', err instanceof Error ? err.message : undefined);
    }
  };

  const deleteFile = async () => {
    if (!toDelete) return;
    try {
      await api(`/api/admin/backup/files/${encodeURIComponent(toDelete.name)}`, { method: 'DELETE' });
      toast.deactivate('Respaldo eliminado');
      await loadFiles();
    } catch (err) {
      toast.error('No se pudo eliminar', err instanceof Error ? err.message : undefined);
    } finally {
      setToDelete(null);
    }
  };

  const pickUpload = (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('Archivo no válido', 'Elige un archivo .zip de respaldo de SuperShop.');
      return;
    }
    setImportOpen(false);
    setPendingRestore({ kind: 'upload', upload: file });
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    setRestoring(true);
    try {
      if (pendingRestore.kind === 'file') {
        await authedFetch(`/api/admin/backup/files/${encodeURIComponent(pendingRestore.file.name)}/restore`, {
          method: 'POST',
        });
      } else {
        await authedFetch('/api/admin/backup/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/zip' },
          body: await pendingRestore.upload.arrayBuffer(),
        });
      }
      toast.create('Información restaurada', 'Inicia sesión de nuevo para continuar.');
      await logout('restore');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error('No se pudo restaurar', err instanceof Error ? err.message : undefined);
      setRestoring(false);
      setPendingRestore(null);
    }
  };

  if (!settings) {
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

  const { config, status, drive } = settings;
  const busy = running !== null || saving;
  const restoreLabel =
    pendingRestore?.kind === 'file'
      ? `el respaldo del ${fmtLong(fileDate(pendingRestore.file)).toLowerCase()}`
      : `el archivo "${pendingRestore?.upload.name}"`;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">Respaldos</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Guarda copias de seguridad de tu información para recuperarla si algo falla.
          </p>
        </div>
        <button onClick={() => setImportOpen(true)} className="btn-soft h-10 px-4 text-[13px]">
          <IconUpload className="h-4 w-4" />
          Importar respaldo
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* En este equipo */}
        <Card
          icon={<IconHardDrive className="h-5 w-5" />}
          title="En este equipo"
          subtitle="Copias en la computadora donde funciona SuperShop. No necesita internet."
        >
          <div className="flex flex-1 flex-col space-y-4">
            <StatusLine status={status.local} emptyText="Aún no hay respaldos en este equipo." />
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => void runLocalNow()}
                disabled={busy}
                className="btn-primary h-10 px-4 text-[13px]"
              >
                {running === 'local' ? <Spinner className="h-4 w-4" /> : <IconFileArchive className="h-4 w-4" />}
                Respaldar ahora
              </button>
              <button onClick={openLocalBackups} className="btn-soft h-10 px-4 text-[13px]">
                <IconFolder className="h-4 w-4" />
                Ver respaldos locales
              </button>
            </div>
            <ScheduleEditor
              schedule={config.local}
              nextRun={status.local.nextRun}
              disabled={saving}
              hint="Si el equipo está apagado a esa hora, el respaldo se hace en cuanto se encienda."
              onChange={(patch) => updateSchedule('local', patch)}
            />
          </div>
        </Card>

        {/* Google Drive */}
        <Card
          icon={<DriveLogo className="h-5 w-5" />}
          title="En Google Drive"
          subtitle="Una copia fuera de la tienda, a salvo aunque se dañe la computadora."
        >
          {!drive.available ? (
            <div className="flex items-start gap-2.5 rounded-xl bg-faint px-3.5 py-3 text-[13px] text-muted">
              <IconCloudCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                El respaldo en la nube no está disponible en esta instalación. Pide a quien instaló SuperShop que lo
                active.
              </p>
            </div>
          ) : !drive.connected ? (
            <div className="space-y-4">
              {status.drive.lastError && <StatusLine status={status.drive} emptyText="" />}
              <ul className="space-y-1.5 text-[13px] text-muted">
                <li className="flex gap-2">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Se guarda en una carpeta "SuperShop Respaldos" de tu Drive.
                </li>
                <li className="flex gap-2">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  SuperShop solo puede ver los archivos que él mismo crea.
                </li>
              </ul>
              {connecting ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-50 px-3.5 py-3 text-[13px] text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
                  <Spinner className="h-4 w-4" />
                  <span className="flex-1">Esperando a que autorices en la ventana de Google…</span>
                  <button onClick={() => setConnecting(false)} className="font-semibold underline">
                    Cancelar
                  </button>
                </div>
              ) : (
                <button onClick={connectDrive} className="btn-primary h-10 w-full px-4 text-[13px] sm:w-auto">
                  <DriveLogo className="h-4 w-4" />
                  Conectar Google Drive
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col space-y-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line px-3.5 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15">
                  <IconCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-[13px] font-semibold text-ink">Conectado</p>
                  <p className="truncate text-[12px] text-muted">{drive.email ?? 'Cuenta de Google'}</p>
                </div>
                <div className="flex w-full justify-end gap-1 border-t border-hairline pt-2 sm:w-auto sm:border-0 sm:pt-0">
                  {drive.folderUrl && (
                    <a
                      href={drive.folderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost h-9 px-3 text-[12px]"
                    >
                      <IconExternalLink className="h-4 w-4" />
                      Abrir carpeta
                    </a>
                  )}
                  <button onClick={() => setConfirmDisconnect(true)} className="btn-ghost h-9 px-3 text-[12px] text-red-600">
                    Desconectar
                  </button>
                </div>
              </div>
              <StatusLine status={status.drive} emptyText="Aún no se ha subido ningún respaldo." />
              <button
                onClick={() => void runNow('drive')}
                disabled={busy}
                className="btn-primary h-10 w-full px-4 text-[13px] sm:w-auto sm:self-start"
              >
                {running === 'drive' ? <Spinner className="h-4 w-4" /> : <IconUpload className="h-4 w-4" />}
                Subir respaldo ahora
              </button>
              <ScheduleEditor
                schedule={config.drive}
                nextRun={status.drive.nextRun}
                disabled={saving}
                hint="Necesita internet a esa hora. Si falla, se vuelve a intentar cada hora."
                onChange={(patch) => updateSchedule('drive', patch)}
              />
            </div>
          )}
        </Card>
      </div>

      {/* Respaldos guardados */}
      <div id="respaldos-guardados" className="scroll-mt-4">
      <Card
        icon={<IconFileArchive className="h-5 w-5" />}
        title="Respaldos guardados en este equipo"
        subtitle="Descárgalos para guardarlos en una USB o restaura uno anterior."
        action={
          <div className="hidden w-48 sm:block">
            <Select
              value={String(config.retention)}
              onChange={(v) => void saveConfig({ retention: Number(v) })}
              options={settings.retentionOptions.map((n) => ({ value: String(n), label: `Conservar ${n}` }))}
              size="sm"
            />
          </div>
        }
      >
        <div className="mb-3 sm:hidden">
          <Select
            value={String(config.retention)}
            onChange={(v) => void saveConfig({ retention: Number(v) })}
            options={settings.retentionOptions.map((n) => ({ value: String(n), label: `Conservar los últimos ${n}` }))}
          />
        </div>
        <p className="mb-3 text-[12px] text-muted">
          Se conservan los últimos {config.retention} respaldos (en este equipo y en Drive); los más antiguos se borran
          solos.
        </p>
        {files.length === 0 ? (
          <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line py-10 text-center text-muted">
            <IconFileArchive className="h-7 w-7" />
            <p className="text-[13px]">Todavía no hay respaldos guardados.</p>
          </div>
        ) : (
          <ul className="divide-y divide-hairline rounded-2xl border border-line">
            {files.map((file) => {
              const when = fileDate(file);
              const isSafety = file.name.includes('antes-de-restaurar');
              return (
                <li key={file.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink">
                      {fmtDateTime(when)}
                      {isSafety && (
                        <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                          Antes de restaurar
                        </span>
                      )}
                    </p>
                    <p className="text-[12px] text-muted">
                      {timeAgo(when)} · {fmtSize(file.size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => void download(file)}
                      className="btn-ghost h-9 w-9 px-0! text-brand-600"
                      title="Descargar"
                      aria-label="Descargar"
                    >
                      <IconDownload className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setPendingRestore({ kind: 'file', file })}
                      className="btn-ghost h-9 px-2.5 text-[12px] sm:px-3"
                      title="Restaurar"
                      aria-label="Restaurar"
                    >
                      <IconRefresh className="h-4 w-4" />
                      <span className="hidden sm:inline">Restaurar</span>
                    </button>
                    <button
                      onClick={() => setToDelete(file)}
                      className="btn-ghost h-9 w-9 px-0! text-red-500"
                      title="Eliminar"
                      aria-label="Eliminar"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      </div>

      <Modal
        open={importOpen}
        title="Importar respaldo"
        onClose={() => {
          setImportOpen(false);
          setDragOver(false);
        }}
      >
        <p className="mb-4 text-[13px] text-muted">
          Restaura la información desde un respaldo descargado antes o traído de otra computadora.
        </p>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickUpload(e.dataTransfer.files[0]);
          }}
          className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragOver
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
              : 'border-line hover:border-brand-300 hover:bg-faint/60'
          }`}
        >
          <IconUpload className="h-7 w-7 text-brand-600" />
          <span className="text-[14px] font-medium text-ink">Arrastra aquí el archivo .zip o haz clic para elegirlo</span>
          <span className="text-[12px] text-muted">
            Antes de restaurar se guarda automáticamente una copia de la información actual.
          </span>
        </button>
      </Modal>
      <input
        ref={fileInput}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => pickUpload(e.target.files?.[0])}
      />

      <ConfirmDialog
        open={!!pendingRestore}
        title="Restaurar información"
        danger
        loading={restoring}
        confirmLabel="Restaurar"
        message={
          <div className="space-y-2">
            <p>
              Se reemplazará toda la información actual (tiendas, cajas, cajeros, usuarios, roles y encuestas) por la
              de <strong>{restoreLabel}</strong>
            </p>
            <p>Antes guardaremos una copia de lo que tienes ahora. Al terminar tendrás que iniciar sesión de nuevo.</p>
          </div>
        }
        onConfirm={() => void confirmRestore()}
        onClose={() => !restoring && setPendingRestore(null)}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar respaldo"
        danger
        confirmLabel="Eliminar"
        message={
          <>
            Se eliminará el respaldo del <strong>{toDelete ? fmtDateTime(fileDate(toDelete)) : ''}</strong>. Esta acción
            no se puede deshacer.
          </>
        }
        onConfirm={() => void deleteFile()}
        onClose={() => setToDelete(null)}
      />

      <ConfirmDialog
        open={confirmDisconnect}
        title="Desconectar Google Drive"
        danger
        confirmLabel="Desconectar"
        message="Se dejarán de subir respaldos a la nube. Los archivos que ya están en tu Drive no se borran."
        onConfirm={() => void disconnectDrive()}
        onClose={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}
