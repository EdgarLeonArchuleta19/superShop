import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { fmtDay, fmtDateTime } from '../../lib/format';
import { exportExcel, exportPdf } from '../../lib/export';
import { useSettings } from '../../lib/settings';
import type {
  ActivityResponse,
  Branch,
  Cashier,
  Filters,
  GroupStats,
  LabeledCount,
  RatingCounts,
  Register,
  StatsResponse,
  Survey,
} from '../../lib/types';
import FilterBar, { defaultFilters } from './components/FilterBar';
import { Spinner } from '../../components/Modal';
import { IconDownload, IconRefresh } from '../../components/Icons';
import FaceIcon from '../../components/FaceIcon';
import {
  RATING_META,
  RATING_ORDER,
  isRatingValue,
  ratingLabel,
} from '../../lib/rating';

const BRAND = '#2b46c4';

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

function CaritasPie({ counts }: { counts: RatingCounts }) {
  const { tooltipStyle } = useChartTheme();
  const data = RATING_ORDER.map((v) => ({
    name: RATING_META[v].label,
    value: counts[v],
    color: RATING_META[v].color,
  })).filter((d) => d.value > 0);
  if (!data.length) {
    return <p className="py-8 text-center text-sm text-muted">Sin calificaciones en este rango.</p>;
  }
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={42}
          outerRadius={72}
          paddingAngle={2}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [
            `${value} (${Math.round(((value as number) / total) * 100)}%)`,
            name,
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function MiniRankingCaritas({ items }: { items: GroupStats[] }) {
  if (!items.length) return <p className="text-sm text-muted">Sin datos en este rango.</p>;
  return (
    <ul className="space-y-3">
      {items.slice(0, 5).map((item) => {
        const total = item.count || 1;
        return (
          <li key={`${item.id}-${item.name}`}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="truncate font-medium text-ink/85">{item.name}</span>
              <span className="shrink-0 font-semibold text-ink tabular-nums">{item.count}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
              <div className="flex h-full">
                {RATING_ORDER.map((v) => {
                  const c = item[v];
                  if (!c) return null;
                  const w = Math.max((c / total) * 100, 2);
                  return (
                    <div
                      key={v}
                      title={`${RATING_META[v].label}: ${c}`}
                      className="h-full"
                      style={{ width: `${w}%`, backgroundColor: RATING_META[v].color }}
                    />
                  );
                })}
              </div>
            </div>
          </li>
        );
      })}
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
    <Panel title="Rendimiento" subtitle="Encuestas y caritas por:">
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
      <MiniRankingCaritas items={current.items} />
    </Panel>
  );
}

export default function DashboardPage() {
  const { axisColor, gridColor, tooltipStyle } = useChartTheme();
  const { can } = useAuth();
  const canExport = can('surveys.export');
  const { settings } = useSettings();
  const storeInfo = { name: settings.store_name, logo: settings.store_logo };

  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const branchesReq = api<{ items: Branch[] }>('/api/admin/branches');
    const registersReq = api<{ items: Register[] }>('/api/admin/registers');
    const cashiersReq = api<{ items: Cashier[] }>('/api/admin/cashiers');
    Promise.all([branchesReq, registersReq, cashiersReq])
      .then(([b, r, c]) => {
        setBranches(b.items);
        setRegisters(r.items);
        setCashiers(c.items);
      })
      .catch(() => setError('No se pudieron cargar los filtros'));
  }, []);

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

  useEffect(() => {
    const id = setInterval(() => {
      api<StatsResponse>(`/api/admin/stats?${qs}`, { role: 'admin' }).then((res) => {
        setStats(res);
        setError('');
      }).catch(() => undefined);
    }, 10000);
    return () => clearInterval(id);
  }, [qs]);

  const loadActivity = useCallback(() => {
    api<ActivityResponse>('/api/admin/activity')
      .then(setActivity)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadActivity();
    const timer = window.setInterval(loadActivity, 30000);
    return () => window.clearInterval(timer);
  }, [loadActivity]);

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
        store: storeInfo,
        summary: stats
          ? [
              { label: 'Encuestas', value: String(stats.total) },
              { label: 'Buenas', value: String(stats.ratingCounts.good) },
              { label: 'Regulares', value: String(stats.ratingCounts.regular) },
              { label: 'Malas', value: String(stats.ratingCounts.bad) },
            ]
          : [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar');
    }
  };

  const goodPct = stats?.total
    ? Math.round((stats.ratingCounts.good / stats.total) * 100)
    : 0;

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
        <button
          onClick={() => {
            setLoading(true);
            api<StatsResponse>(`/api/admin/stats?${qs}`, { role: 'admin' })
              .then((res) => {
                setStats(res);
                setError('');
              })
              .catch((e) => {
                setError(e instanceof Error ? e.message : 'Error al cargar reportes');
              })
              .finally(() => setLoading(false));
          }}
          className="btn h-[38px] px-4 text-sm"
          disabled={loading}
        >
          <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
        {canExport && (
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
            <Kpi label="Buena atención" value={String(stats.ratingCounts.good)} hint={`${goodPct}% del total`}>
              <FaceIcon value="good" className="h-6 w-6" />
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
            <Panel title="Calificaciones" subtitle="Distribución de caritas">
              <CaritasPie counts={stats.ratingCounts} />
            </Panel>

            <Panel title="Tendencia diaria" subtitle="Encuestas por carita" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={stats.trend} margin={{ top: 0, right: 4, left: -22, bottom: 0 }}>
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
                    allowDecimals={false}
                    tick={{ fill: axisColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(v) => fmtDateTime(`${String(v)}T12:00:00`)}
                    formatter={(value, name) => [
                      `${value} encuestas`,
                      isRatingValue(name) ? ratingLabel(name) : String(name),
                    ]}
                  />
                  <Legend
                    formatter={(value) => (isRatingValue(value) ? ratingLabel(value) : String(value))}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  {RATING_ORDER.map((v) => (
                    <Bar
                      key={v}
                      dataKey={v}
                      name={v}
                      stackId="caritas"
                      fill={RATING_META[v].color}
                      radius={v === 'good' ? [6, 6, 0, 0] : undefined}
                      maxBarSize={18}
                    />
                  ))}
                </BarChart>
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
                    {isRatingValue(s.rating) ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold">
                        <FaceIcon value={s.rating} className="h-5 w-5" />
                        <span>{ratingLabel(s.rating)}</span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-[12px] text-muted">Sin calificación</span>
                    )}
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
