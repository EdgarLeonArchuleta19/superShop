import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { fmtDateTime, timeAgo } from '../../lib/format';
import type { AccessLogResponse, LoginLock } from '../../lib/types';
import { Spinner } from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { IconAlert, IconLock, IconRefresh, IconShield } from '../../components/Icons';

type ResultFilter = '' | 'ok' | 'fail';

const REASONS: Record<string, string> = {
  ok: 'Entró',
  contraseña: 'Contraseña incorrecta',
  usuario: 'Usuario no existe o inactivo',
  bloqueado: 'Bloqueado por intentos',
};

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

/** Navegador y sistema en pocas palabras, a partir del user-agent. */
function deviceLabel(ua: string | null): string {
  if (!ua) return '—';
  const os = /android/i.test(ua)
    ? 'Android'
    : /iphone|ipad/i.test(ua)
      ? 'iOS'
      : /windows/i.test(ua)
        ? 'Windows'
        : /mac os/i.test(ua)
          ? 'Mac'
          : /linux/i.test(ua)
            ? 'Linux'
            : '';
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /chrome|crios/i.test(ua)
      ? 'Chrome'
      : /firefox|fxios/i.test(ua)
        ? 'Firefox'
        : /safari/i.test(ua)
          ? 'Safari'
          : /curl|python|go-http|java|bot/i.test(ua)
            ? 'Programa/bot'
            : 'Otro';
  return os ? `${browser} · ${os}` : browser;
}

export default function AccessLogPage() {
  const toast = useToast();
  const [data, setData] = useState<AccessLogResponse | null>(null);
  const [result, setResult] = useState<ResultFilter>('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = result ? `?result=${result}` : '';
      setData(await api<AccessLogResponse>(`/api/admin/access-log${qs}`));
    } catch (err) {
      toast.error('No se pudo cargar el registro', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [result, toast]);

  useEffect(() => {
    setPage(1);
    void load();
  }, [load]);

  const unlock = async (lock: LoginLock) => {
    try {
      await api(`/api/admin/access-log/locks/${encodeURIComponent(lock.key)}`, { method: 'DELETE' });
      toast.update(lock.kind === 'user' ? `Cuenta "${lock.value}" desbloqueada` : 'IP desbloqueada');
      await load();
    } catch (err) {
      toast.error('No se pudo desbloquear', err instanceof Error ? err.message : undefined);
    }
  };

  const items = data?.items ?? [];
  const rows = items.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">Registro de accesos</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Inicios de sesión de los últimos 90 días y cuentas bloqueadas por intentos fallidos.
          </p>
        </div>
        <button onClick={() => void load()} className="btn-soft h-10 px-4 text-[13px]">
          <IconRefresh className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Entradas (24 h)" value={data.last24h.ok} />
          <Stat label="Intentos fallidos (24 h)" value={data.last24h.fail} danger={data.last24h.fail >= 10} />
          <Stat label="IPs con fallos (24 h)" value={data.last24h.failedIps} />
        </div>
      )}

      {data && data.locks.length > 0 && (
        <Card icon={IconLock} title="Bloqueos activos" subtitle="Se liberan solos al terminar la espera.">
          <ul className="divide-y divide-hairline">
            {data.locks.map((lock) => (
              <li key={lock.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-[14px] font-medium text-ink/90">
                    {lock.kind === 'user' ? `Cuenta "${lock.value}"` : `IP ${lock.value}`}
                  </div>
                  <div className="text-[12px] text-muted">
                    {lock.count} intentos fallidos · hasta {fmtDateTime(lock.locked_until)}
                  </div>
                </div>
                <button onClick={() => void unlock(lock)} className="btn-ghost h-9 px-4 text-[13px]">
                  Desbloquear
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && !data.behindCloudflare && (
        <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            El país no se registra porque el servidor no está detrás de Cloudflare
            (<code>CF_ORIGIN_SECRET</code>). Ver <em>docs/DESPLIEGUE-WEB.md</em>.
          </span>
        </div>
      )}

      <Card icon={IconShield} title="Intentos de inicio de sesión" subtitle="Los más recientes primero (máximo 500).">
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
              <table className="w-full min-w-[640px] divide-y divide-hairline text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-muted">
                    <th className="px-3 py-3 font-semibold">Fecha</th>
                    <th className="px-3 py-3 font-semibold">Usuario</th>
                    <th className="px-3 py-3 font-semibold">Resultado</th>
                    <th className="px-3 py-3 font-semibold">IP</th>
                    <th className="px-3 py-3 font-semibold">País</th>
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
                      <td className="px-3 py-3 text-ink/75">{r.country || '—'}</td>
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
    </div>
  );
}
