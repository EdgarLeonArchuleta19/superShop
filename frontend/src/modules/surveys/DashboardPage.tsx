import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { fmtDay, fmtDateTime, fmtAvg } from '../../lib/format';
import { exportExcel, exportPdf } from '../../lib/export';
import type {
  ActivityResponse,
  Branch,
  Cashier,
  Filters,
  LabeledCount,
  Register,
  StatsResponse,
  Survey,
} from '../../lib/types';
import FilterBar, { defaultFilters } from './components/FilterBar';
import { Spinner } from '../../components/Modal';
import { IconDownload, IconStar } from '../../components/Icons';

const BRAND = '#2b46c4';
const AMBER = '#f59e0b';

const RATING_COLORS: Record<number, string> = {
  5: '#10b981',
  4: '#22c55e',
  3: '#f59e0b',
  2: '#f97316',
  1: '#ef4444',
};

function useChartTheme() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const axisColor = isDark ? '#98989d' : '#86868b';
  const gridColor = isDark ? 'rgb(255 255 255 / 0.08)' : 'rgb(0 0 0 / 0.06)';
  const tooltipStyle = {
    background: isDark ? '#1c1c1e' : '#ffffff',
    border: `1px solid ${isDark ? 'rgb(255 255 255 / 0.12)' : 'rgb(0 0 0 / 0.06)'}`,
    borderRadius: 16,
    boxShadow: '0 2px 6px rgb(0 0 0 / 0.05), 0 24px 48px rgb(0 0 0 / 0.14)',
    fontSize: 12,
    color: isDark ? '#f5f5f7' : '#1d1d1f',
  };
  return { isDark, axisColor, gridColor, tooltipStyle };
}

function Kpi({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="card animate-fade-in p-4 sm:p-5">
      <p className="eyebrow">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums sm:text-[30px]">
          {value}
        </span>
        {children}
      </div>
      {hint && <p className="mt-1.5 truncate text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold tracking-tight sm:text-[16px]">{title}</h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function HorizontalBars({ items, color = BRAND }: { items: LabeledCount[]; color?: string }) {
  const { isDark, axisColor, gridColor, tooltipStyle } = useChartTheme();
  const data = items.filter((i) => i.count > 0);
  if (!data.length) {
    return <p className="py-8 text-center text-sm text-muted">Sin datos en este rango.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={gridColor} strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fill: axisColor, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={{ fill: axisColor, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: isDark ? 'rgb(255 255 255 / 0.06)' : 'rgb(0 0 0 / 0.04)' }}
        />
        <Bar dataKey="count" fill={color} radius={[6, 6, 6, 6]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RatingBreakdown({ items }: { items: { rating: number; count: number }[] }) {
  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  return (
    <ul className="space-y-2.5">
      {[5, 4, 3, 2, 1].map((r) => {
        const count = items.find((i) => i.rating === r)?.count ?? 0;
        const pct = Math.round((count / total) * 100);
        return (
          <li key={r} className="flex items-center gap-3 text-sm">
            <span className="w-8 shrink-0 text-muted tabular-nums">{r}★</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-hairline">
              <span
                className="block h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: RATING_COLORS[r] }}
              />
            </span>
            <span className="w-10 shrink-0 text-right text-[12px] text-muted tabular-nums">
              {count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function MiniRanking({
  items,
}: {
  items: { id: number | null; name: string; count: number; avg: number }[];
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  if (!items.length) return <p className="text-sm text-muted">Sin datos en este rango.</p>;
  return (
    <ul className="space-y-3">
      {items.slice(0, 5).map((item) => (
        <li key={`${item.id}-${item.name}`}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="truncate font-medium text-ink/85">{item.name}</span>
            <span className="flex shrink-0 items-center gap-2 text-muted">
              <span className="font-semibold text-ink tabular-nums">{item.count}</span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-amber-500">
                <IconStar filled className="h-3.5 w-3.5" />
                <span className="tabular-nums">{fmtAvg(item.avg)}</span>
              </span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-hairline">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${Math.max((item.count / max) * 100, 4)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RankingPanel({
  byCashier,
  byRegister,
  byBranch,
}: {
  byCashier: StatsResponse['byCashier'];
  byRegister: StatsResponse['byRegister'];
  byBranch: StatsResponse['byBranch'];
}) {
  const dims = useMemo(
    () => [
      { key: 'cashier', label: 'Cajeros(as)', items: byCashier },
      { key: 'register', label: 'Cajas', items: byRegister },
      ...(byBranch.length > 1 ? [{ key: 'branch', label: 'Sucursales', items: byBranch }] : []),
    ],
    [byCashier, byRegister, byBranch]
  );
  const [active, setActive] = useState(dims[0].key);
  const current = dims.find((d) => d.key === active) ?? dims[0];

  return (
    <Panel title="Rendimiento" subtitle="Encuestas y promedio por:">
      <div className="mb-3 flex rounded-full bg-hairline p-0.5">
        {dims.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setActive(d.key)}
            className={`flex-1 rounded-full px-2 py-1 text-[12px] font-semibold transition ${
              active === d.key
                ? 'bg-surface text-brand-700 shadow-pop dark:text-brand-300'
                : 'text-muted hover:text-ink'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <MiniRanking items={current.items} />
    </Panel>
  );
}

export default function DashboardPage() {
  const { axisColor, gridColor, tooltipStyle } = useChartTheme();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const branchesReq = api<{ items: Branch[] }>('/api/branches?active=0');
    const registersReq = isAdmin
      ? api<{ items: Register[] }>('/api/admin/registers')
      : Promise.resolve({ items: [] as Register[] });
    const cashiersReq = isAdmin
      ? api<{ items: Cashier[] }>('/api/admin/cashiers')
      : Promise.resolve({ items: [] as Cashier[] });
    Promise.all([branchesReq, registersReq, cashiersReq])
      .then(([b, r, c]) => {
        setBranches(b.items);
        setRegisters(r.items);
        setCashiers(c.items);
      })
      .catch(() => setError('No se pudieron cargar los filtros'));
  }, [isAdmin]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    (Object.keys(filters) as (keyof Filters)[]).forEach((k) => {
      if (filters[k]) p.set(k, filters[k]);
    });
    return p.toString();
  }, [filters]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<StatsResponse>(`/api/admin/stats?${qs}`, { role: 'admin' })
      .then((res) => {
        if (alive) {
          setStats(res);
          setError('');
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Error al cargar reportes');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [qs]);

  const loadActivity = useCallback(() => {
    if (!isAdmin) return;
    api<ActivityResponse>('/api/admin/activity')
      .then(setActivity)
      .catch(() => undefined);
  }, [isAdmin]);

  useEffect(() => {
    loadActivity();
    if (!isAdmin) return;
    const timer = window.setInterval(loadActivity, 30000);
    return () => window.clearInterval(timer);
  }, [loadActivity, isAdmin]);

  const describeFilters = useCallback(() => {
    const parts: string[] = [];
    const branch = branches.find((b) => String(b.id) === filters.branch_id);
    const reg = registers.find((r) => String(r.id) === filters.register_id);
    const cash = cashiers.find((c) => String(c.id) === filters.cashier_id);
    if (branch) parts.push(`Sucursal: ${branch.name}`);
    if (reg) parts.push(`Caja: ${reg.name}`);
    if (cash) parts.push(`Cajero(a): ${cash.name}`);
    if (filters.from || filters.to) {
      parts.push(`Del ${filters.from || '…'} al ${filters.to || 'hoy'}`);
    }
    return parts.length ? parts.join(' | ') : 'Sin filtros (todo)';
  }, [branches, registers, cashiers, filters]);

  const fetchRows = useCallback(async () => {
    const res = await api<{ items: Survey[] }>(`/api/admin/surveys?${qs}&limit=5000`, {
      role: 'admin',
    });
    return res.items;
  }, [qs]);

  const onExcel = async () => {
    try {
      const rows = await fetchRows();
      await exportExcel(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar');
    }
  };

  const onPdf = async () => {
    try {
      const rows = await fetchRows();
      await exportPdf(rows, {
        title: 'Reporte general de encuestas',
        subtitle: describeFilters(),
        summary: stats
          ? [
              { label: 'Encuestas', value: String(stats.total) },
              { label: 'Calificación promedio', value: `${fmtAvg(stats.avgRating)} / 5` },
              { label: 'Área a mejorar #1', value: stats.areas[0]?.label || '—' },
              { label: 'Todo bien', value: `${stats.allGoodPct}%` },
            ]
          : [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar');
    }
  };

  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">
          Estadísticas de satisfacción
        </h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Resumen por sucursal, caja y cajero(a).
        </p>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        branches={branches}
        registers={registers}
        cashiers={cashiers}
      >
        {isAdmin && (
          <>
            <button
              onClick={onExcel}
              className="btn h-[38px] bg-emerald-600 px-4 text-sm text-white hover:bg-emerald-700"
            >
              <IconDownload className="h-4 w-4" />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button
              onClick={onPdf}
              className="btn h-[38px] bg-red-600 px-4 text-sm text-white hover:bg-red-700"
            >
              <IconDownload className="h-4 w-4" />
              <span className="hidden sm:inline">PDF</span>
            </button>
          </>
        )}
      </FilterBar>

      {error && (
        <div className="anim-pop rounded-2xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <div className="grid place-items-center gap-3 py-20 text-muted">
          <Spinner className="h-8 w-8 text-brand-600" />
          <p className="text-sm">Cargando reportes…</p>
        </div>
      ) : !stats || stats.total === 0 ? (
        <div className="card border-dashed py-16 text-center">
          <p className="text-lg font-semibold text-ink/80">Sin encuestas en este rango</p>
          <p className="mt-1 text-sm text-muted">
            Ajusta los filtros o espera a que lleguen respuestas de las cajas.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Encuestas" value={String(stats.total)} hint={describeFilters()} />
            <Kpi label="Calificación promedio" value={fmtAvg(stats.avgRating)} hint="de 5 estrellas">
              <span className="mb-0.5 flex items-center text-amber-500">
                <IconStar filled className="h-5 w-5" />
              </span>
            </Kpi>
            <Kpi label="Sin quejas" value={`${stats.allGoodPct}%`} hint="marcaron “todo bien”" />
            <Kpi
              label="Cajas activas"
              value={String(activity?.openSessions ?? 0)}
              hint={`${activity?.surveysLast24h ?? 0} en las últimas 24 h`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title="Áreas a mejorar" subtitle="Qué área necesita mejorar">
              <HorizontalBars items={stats.areas} />
            </Panel>
            <Panel title="Motivos de queja" subtitle="Qué fue lo que no les gustó">
              <HorizontalBars
                items={stats.dislikes.filter((d) => d.label !== 'Ninguna, todo bien')}
                color="#ef4444"
              />
            </Panel>
            <Panel title="Por qué les gusta" subtitle="Razones para volver">
              <HorizontalBars items={stats.likes} color="#10b981" />
            </Panel>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title="Calificaciones" subtitle="Distribución por estrellas">
              <div className="mb-4 flex items-baseline gap-2">
                <span className="text-[34px] font-semibold leading-none tracking-tight tabular-nums">
                  {fmtAvg(stats.avgRating)}
                </span>
                <span className="flex items-center gap-1 text-sm text-muted">
                  <IconStar filled className="h-4 w-4 text-amber-500" /> / 5
                </span>
              </div>
              <RatingBreakdown items={stats.ratingDist} />
            </Panel>

            <Panel title="Tendencia diaria" subtitle="Encuestas y promedio" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={190}>
                <ComposedChart data={stats.trend} margin={{ top: 0, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string) => fmtDay(v)}
                    tick={{ fill: axisColor, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tick={{ fill: axisColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 5]}
                    ticks={[1, 3, 5]}
                    tick={{ fill: axisColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(v) => fmtDateTime(`${String(v)}T12:00:00`)}
                    formatter={(value, name) =>
                      name === 'count'
                        ? [`${value} encuestas`, 'Encuestas']
                        : [`${value} ★`, 'Promedio']
                    }
                  />
                  <Legend
                    formatter={(value) => (value === 'count' ? 'Encuestas' : 'Calificación prom.')}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar yAxisId="left" dataKey="count" name="count" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={18} />
                  <Line
                    yAxisId="right"
                    dataKey="avg"
                    name="avg"
                    stroke={AMBER}
                    strokeWidth={2.5}
                    dot={false}
                    type="monotone"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <RankingPanel
              byCashier={stats.byCashier}
              byRegister={stats.byRegister}
              byBranch={stats.byBranch}
            />

            <Panel title="Encuestas recientes" subtitle="Últimas recibidas" className="lg:col-span-2">
              <ul className="divide-y divide-hairline">
                {stats.recent.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink/85">
                        {s.cashier_name || s.register_name || 'Caja'}
                      </p>
                      <p className="truncate text-[12px] text-muted">{fmtDateTime(s.created_at)}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-amber-500">
                      <IconStar filled className="h-3.5 w-3.5" />
                      <span className="tabular-nums">{s.rating}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}