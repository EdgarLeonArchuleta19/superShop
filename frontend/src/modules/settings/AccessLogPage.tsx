import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { fmtDateTime, timeAgo } from '../../lib/format';
import type { AccessLogResponse, LoginLock, OnlineDevice, OnlineResponse, OnlineSession } from '../../lib/types';
import { ConfirmDialog, Spinner } from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { IconAlert, IconChevronLeft, IconLock, IconMonitor, IconPencil, IconRefresh, IconShield, IconTablet } from '../../components/Icons';
import { SURVEY_ICON } from '../../components/StoreLogo';
import { describeAgent, EditKioskModal } from './DevicesSection';

type ResultFilter = '' | 'ok' | 'fail';
type View = 'online' | 'history';

const REASONS: Record<string, string> = {
  ok: 'Entró',
  contraseña: 'Contraseña incorrecta',
  usuario: 'Usuario no existe o inactivo',
  bloqueado: 'Bloqueado por intentos',
};

/** Con actividad en los últimos 5 min se muestra "En línea"; si no, "Inactivo". */
const ACTIVE_MS = 5 * 60 * 1000;
/** Igual que el aviso del servidor (devices.js): una tablet un día sin conexión se marca en ámbar. */
const LONG_OFFLINE_MS = 24 * 60 * 60 * 1000;

/** Fila de la tabla de dispositivos: sesión de usuario o tablet de encuestas. */
type Target = { kind: 'session'; row: OnlineSession } | { kind: 'tablet'; row: OnlineDevice };

function Card({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: (p: { className?: string }) => React.ReactElement;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-[12px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-2xl bg-faint px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className={`mt-1 text-[22px] font-semibold tracking-tight ${danger ? 'text-red-600 dark:text-red-400' : ''}`}>
        {value}
      </div>
    </div>
  );
}

/** Navegador y sistema en pocas palabras, a partir del user-agent (incluye programas y bots). */
function deviceLabel(ua: string | null): string {
  if (!ua) return '—';
  if (/curl|python|go-http|java|bot/i.test(ua)) return 'Programa/bot';
  return describeAgent(ua);
}

/** Tablet sin latido reciente: apagada o sin internet. */
function OfflineStatus({ lastSeen }: { lastSeen: string | null }) {
  const long = !!lastSeen && Date.now() - new Date(lastSeen).getTime() >= LONG_OFFLINE_MS;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold ${
        long
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
          : 'bg-faint text-muted'
      }`}
    >
      {long ? <IconAlert className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-line" />}
      Sin conexión{lastSeen ? ` · ${timeAgo(lastSeen)}` : ''}
    </span>
  );
}

function TypeBadge({ kind }: { kind: Target['kind'] }) {
  return kind === 'session' ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
      <img src="/icon-192.png" alt="" className="h-4 w-4 rounded" />
      SuperShop
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-faint px-2.5 py-1 text-[12px] font-semibold text-ink/80">
      <img src={SURVEY_ICON} alt="" className="h-4 w-4 rounded ring-1 ring-line" />
      SuperShop Survey
    </span>
  );
}

function Status({ lastSeen }: { lastSeen: string }) {
  const active = Date.now() - new Date(lastSeen).getTime() < ACTIVE_MS;
  return active ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      En línea
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Inactivo · {timeAgo(lastSeen)}
    </span>
  );
}

function LocksCard({ locks, onUnlock }: { locks: LoginLock[]; onUnlock: (lock: LoginLock) => void }) {
  if (locks.length === 0) return null;
  return (
    <Card icon={IconLock} title="Bloqueos activos" subtitle="Se liberan solos al terminar la espera.">
      <ul className="divide-y divide-hairline">
        {locks.map((lock) => (
          <li key={lock.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="text-[14px] font-medium text-ink/90">
                {lock.kind === 'user' ? `Cuenta "${lock.value}"` : `IP ${lock.value}`}
              </div>
              <div className="text-[12px] text-muted">
                {lock.count} intentos fallidos · hasta {fmtDateTime(lock.locked_until)}
              </div>
            </div>
            <button onClick={() => onUnlock(lock)} className="btn-ghost h-9 px-4 text-[13px]">
              Desbloquear
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function AccessLogPage() {
  const toast = useToast();
  const [view, setView] = useState<View>('online');
  const [online, setOnline] = useState<OnlineResponse | null>(null);
  const [data, setData] = useState<AccessLogResponse | null>(null);
  const [result, setResult] = useState<ResultFilter>('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [unlinking, setUnlinking] = useState<Target | null>(null);
  const [editing, setEditing] = useState<OnlineDevice | null>(null);
  const [busy, setBusy] = useState(false);

  const loadOnline = useCallback(async () => {
    try {
      setOnline(await api<OnlineResponse>('/api/admin/access-log/online'));
    } catch (err) {
      toast.error('No se pudo cargar quién está conectado', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const qs = result ? `?result=${result}` : '';
      setData(await api<AccessLogResponse>(`/api/admin/access-log${qs}`));
    } catch (err) {
      toast.error('No se pudo cargar el historial', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [result, toast]);

  const load = view === 'online' ? loadOnline : loadHistory;

  // Conectados ahora: se actualiza solo cada 30 s.
  useEffect(() => {
    if (view !== 'online') return;
    void loadOnline();
    const timer = window.setInterval(() => void loadOnline(), 30_000);
    return () => window.clearInterval(timer);
  }, [view, loadOnline]);

  useEffect(() => {
    if (view !== 'history') return;
    setPage(1);
    void loadHistory();
  }, [view, loadHistory]);

  const unlock = async (lock: LoginLock) => {
    try {
      await api(`/api/admin/access-log/locks/${encodeURIComponent(lock.key)}`, { method: 'DELETE' });
      toast.update(lock.kind === 'user' ? `Cuenta "${lock.value}" desbloqueada` : 'IP desbloqueada');
      await load();
    } catch (err) {
      toast.error('No se pudo desbloquear', err instanceof Error ? err.message : undefined);
    }
  };

  /** Desvincular: cierra la sesión del usuario o desvincula la tablet; la fila desaparece. */
  const unlink = async (target: Target) => {
    setBusy(true);
    try {
      if (target.kind === 'session') {
        await api(`/api/admin/sessions/${target.row.id}`, { method: 'DELETE' });
        toast.update('Dispositivo desvinculado', `${target.row.user_name} tendrá que volver a iniciar sesión.`);
      } else {
        await api(`/api/admin/devices/${target.row.id}`, { method: 'DELETE' });
        toast.update('Tablet desvinculada', `${target.row.name} ya no mostrará encuestas.`);
      }
      setUnlinking(null);
      await loadOnline();
    } catch (err) {
      toast.error('No se pudo desvincular', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const saveTablet = async (id: number, body: { name: string; branch_id: number; register_id: number }) => {
    setBusy(true);
    try {
      await api(`/api/admin/devices/${id}`, { method: 'PUT', body });
      toast.update('Tablet actualizada', 'La toma en unos minutos, sin volver a escanear.');
      setEditing(null);
      await loadOnline();
    } catch (err) {
      toast.error('No se pudo guardar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const items = data?.items ?? [];
  const rows = items.slice((page - 1) * pageSize, page * pageSize);
  const total = (online?.sessions.length ?? 0) + (online?.devices.length ?? 0);
  const tabletsOnline = (online?.devices ?? []).filter(
    (d) => d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < ACTIVE_MS
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">Registro de accesos</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {view === 'online'
              ? 'Usuarios conectados ahora y tablets de encuestas vinculadas.'
              : 'Historial de inicios de sesión de los últimos 90 días, exitosos y fallidos.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void load()} className="btn-soft h-10 px-4 text-[13px]">
            <IconRefresh className="h-4 w-4" />
            Actualizar
          </button>
          {view === 'online' ? (
            <button onClick={() => setView('history')} className="btn-primary h-10 px-4 text-[13px]">
              <IconShield className="h-4 w-4" />
              Ver historial completo
            </button>
          ) : (
            <button onClick={() => setView('online')} className="btn-ghost h-10 px-4 text-[13px]">
              <IconChevronLeft className="h-4 w-4" />
              Volver a conectados
            </button>
          )}
        </div>
      </div>

      {view === 'online' ? (
        <>
          {online && <LocksCard locks={online.locks} onUnlock={(l) => void unlock(l)} />}

          <Card
            icon={IconMonitor}
            title={online ? `Dispositivos · ${total}` : 'Dispositivos'}
            subtitle={
              online
                ? `${online.sessions.length} usuario${online.sessions.length === 1 ? '' : 's'} conectado${online.sessions.length === 1 ? '' : 's'} · ${online.devices.length} tablet${online.devices.length === 1 ? '' : 's'} (${tabletsOnline} en línea). Se actualiza solo.`
                : 'Usuarios conectados ahora y tablets de encuestas vinculadas.'
            }
          >
            {!online ? (
              <div className="grid place-items-center py-12">
                <Spinner className="h-7 w-7 text-brand-600" />
              </div>
            ) : total === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted">No hay usuarios conectados ni tablets vinculadas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] divide-y divide-hairline text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.06em] text-muted">
                      <th className="px-3 py-3 font-semibold">Nombre</th>
                      <th className="px-3 py-3 font-semibold">Tipo</th>
                      <th className="px-3 py-3 font-semibold">Estatus</th>
                      <th className="px-3 py-3 font-semibold">Dispositivo</th>
                      <th className="px-3 py-3 font-semibold">IP</th>
                      <th className="px-3 py-3 font-semibold">Desde</th>
                      <th className="px-3 py-3 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {online.sessions.map((s) => (
                      <tr key={`s${s.id}`} className="transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.04]">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <IconMonitor className="h-4 w-4 shrink-0 text-muted" />
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-medium text-ink/90">
                                {s.user_name}
                                {s.current && (
                                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                                    Tú
                                  </span>
                                )}
                              </p>
                              <p className="text-[12px] text-muted">
                                {s.username ? `${s.username} · ` : ''}
                                {s.role_name ?? 'Sin rol'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <TypeBadge kind="session" />
                        </td>
                        <td className="px-3 py-3">
                          <Status lastSeen={s.last_seen_at} />
                        </td>
                        <td className="px-3 py-3 text-ink/75" title={s.user_agent ?? undefined}>
                          {deviceLabel(s.user_agent)}
                        </td>
                        <td className="px-3 py-3 font-mono text-[12px] text-ink/75">
                          {s.ip ? s.ip.replace(/^::ffff:/, '') : '—'}
                        </td>
                        <td className="px-3 py-3 text-ink/75" title={fmtDateTime(s.created_at)}>
                          Entró {timeAgo(s.created_at)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {s.current ? (
                            <span className="text-[12px] text-muted">Este equipo</span>
                          ) : (
                            <button
                              onClick={() => setUnlinking({ kind: 'session', row: s })}
                              className="btn-ghost h-8 px-3 text-[12px] text-red-600"
                            >
                              Desvincular
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {online.devices.map((d) => (
                      <tr key={`d${d.id}`} className="transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.04]">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <IconTablet className="h-4 w-4 shrink-0 text-muted" />
                            <div className="min-w-0">
                              <p className="font-medium text-ink/90">{d.name}</p>
                              <p className="text-[12px] text-muted">
                                {d.register_name && d.branch_name ? `${d.branch_name} · ${d.register_name}` : 'Sin caja asignada'}
                              </p>
                              {d.pending > 0 && (
                                <p className="mt-0.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                                  {d.pending} encuesta{d.pending === 1 ? '' : 's'} sin enviar
                                  {d.pending_since ? ` desde ${timeAgo(d.pending_since)}` : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <TypeBadge kind="tablet" />
                        </td>
                        <td className="px-3 py-3">
                          {d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < ACTIVE_MS ? (
                            <Status lastSeen={d.last_seen_at} />
                          ) : (
                            <OfflineStatus lastSeen={d.last_seen_at} />
                          )}
                        </td>
                        <td className="px-3 py-3 text-ink/75" title={d.user_agent ?? undefined}>
                          {deviceLabel(d.user_agent)}
                        </td>
                        <td className="px-3 py-3 font-mono text-[12px] text-ink/75">
                          {d.ip ? d.ip.replace(/^::ffff:/, '') : '—'}
                        </td>
                        <td
                          className="px-3 py-3 text-ink/75"
                          title={`${fmtDateTime(d.created_at)}${d.created_by_name ? ` por ${d.created_by_name}` : ''}`}
                        >
                          Vinculada {timeAgo(d.created_at)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setEditing(d)} className="btn-ghost h-8 px-3 text-[12px]">
                              <IconPencil className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            <button
                              onClick={() => setUnlinking({ kind: 'tablet', row: d })}
                              className="btn-ghost h-8 px-3 text-[12px] text-red-600"
                            >
                              Desvincular
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          {data && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Entradas (24 h)" value={data.last24h.ok} />
              <Stat label="Intentos fallidos (24 h)" value={data.last24h.fail} danger={data.last24h.fail >= 10} />
              <Stat label="IPs con fallos (24 h)" value={data.last24h.failedIps} />
            </div>
          )}

          {data && <LocksCard locks={data.locks} onUnlock={(l) => void unlock(l)} />}

          <Card icon={IconShield} title="Historial de inicios de sesión" subtitle="Los más recientes primero (máximo 500).">
            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  ['', 'Todos'],
                  ['ok', 'Exitosos'],
                  ['fail', 'Fallidos'],
                ] as [ResultFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setResult(value)}
                  className={`h-9 rounded-full px-4 text-[13px] font-semibold transition ${
                    result === value ? 'bg-brand-600 text-white' : 'bg-faint text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {loading && !data ? (
              <div className="grid place-items-center py-12">
                <Spinner className="h-7 w-7 text-brand-600" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted">No hay intentos registrados.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] divide-y divide-hairline text-left text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-[0.06em] text-muted">
                        <th className="px-3 py-3 font-semibold">Fecha</th>
                        <th className="px-3 py-3 font-semibold">Usuario</th>
                        <th className="px-3 py-3 font-semibold">Resultado</th>
                        <th className="px-3 py-3 font-semibold">IP</th>
                        <th className="px-3 py-3 font-semibold">Dispositivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {rows.map((r) => (
                        <tr key={r.id} className="transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.04]">
                          <td className="px-3 py-3 text-ink/80" title={timeAgo(r.created_at)}>
                            {fmtDateTime(r.created_at)}
                          </td>
                          <td className="px-3 py-3 font-medium text-ink/90">{r.username || '—'}</td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${
                                r.success
                                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
                                  : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                              }`}
                            >
                              {REASONS[r.reason] ?? r.reason}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-[12px] text-ink/75">{r.ip || '—'}</td>
                          <td className="px-3 py-3 text-ink/75" title={r.user_agent ?? undefined}>
                            {deviceLabel(r.user_agent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="-mx-5 -mb-5 mt-3">
                  <Pagination
                    total={items.length}
                    page={page}
                    pageSize={pageSize}
                    onPage={setPage}
                    onPageSize={setPageSize}
                    noun="intentos"
                  />
                </div>
              </>
            )}
          </Card>
        </>
      )}

      <ConfirmDialog
        open={!!unlinking}
        title={unlinking?.kind === 'tablet' ? 'Desvincular tablet' : 'Desvincular dispositivo'}
        danger
        loading={busy}
        confirmLabel="Desvincular"
        message={
          unlinking?.kind === 'session' ? (
            `Se cerrará la sesión de ${unlinking.row.user_name} en ${deviceLabel(unlinking.row.user_agent)} y tendrá que volver a iniciar sesión.`
          ) : unlinking?.kind === 'tablet' ? (
            <>
              <strong>{unlinking.row.name}</strong> dejará de mostrar encuestas y se quitará de la lista. Para volver a
              usarla habrá que escanear un código QR nuevo.
              {unlinking.row.pending > 0 &&
                ` Tiene ${unlinking.row.pending} encuesta${unlinking.row.pending === 1 ? '' : 's'} sin enviar: las respondidas antes de desvincularla todavía se reciben si se conecta en los próximos 3 días.`}
            </>
          ) : null
        }
        onConfirm={() => unlinking && void unlink(unlinking)}
        onClose={() => setUnlinking(null)}
      />
      {editing && (
        <EditKioskModal
          kiosk={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(body) => void saveTablet(editing.id, body)}
        />
      )}
    </div>
  );
}
