import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { exportExcel, exportPdf } from '../../lib/export';
import { useSettings } from '../../lib/settings';
import type { Branch, Cashier, Filters, Register, Survey } from '../../lib/types';
import FilterBar, { defaultFilters } from './components/FilterBar';
import Pagination from '../../components/Pagination';
import { Spinner } from '../../components/Modal';
import { IconDownload, IconRefresh } from '../../components/Icons';
import FaceIcon from '../../components/FaceIcon';
import { isRatingValue, normalizeRating, ratingLabel } from '../../lib/rating';

export default function SurveysPage() {
  const { settings } = useSettings();
  const storeInfo = { name: settings.store_name, logo: settings.store_logo };

  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [rows, setRows] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    Promise.all([
      api<{ items: Branch[] }>('/api/admin/branches', { role: 'admin' }),
      api<{ items: Register[] }>('/api/admin/registers', { role: 'admin' }),
      api<{ items: Cashier[] }>('/api/admin/cashiers', { role: 'admin' }),
    ])
      .then(([b, r, c]) => {
        setBranches(b.items);
        setRegisters(r.items);
        setCashiers(c.items);
      })
      .catch(() => undefined);
  }, []);

  const qs = new URLSearchParams();
  (Object.keys(filters) as (keyof Filters)[]).forEach((k) => {
    if (filters[k]) qs.set(k, filters[k]);
  });
  const queryString = qs.toString();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: Survey[] }>(`/api/admin/surveys?${queryString}&limit=5000`, {
        role: 'admin',
      });
      setRows(res.items);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar encuestas');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    setPage(1);
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => load(), 12000);
    return () => clearInterval(id);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = rows.slice((current - 1) * pageSize, current * pageSize);

  const describe = () => {
    const parts: string[] = [];
    const branch = branches.find((b) => String(b.id) === filters.branch_id);
    const reg = registers.find((r) => String(r.id) === filters.register_id);
    const cash = cashiers.find((c) => String(c.id) === filters.cashier_id);
    if (branch) parts.push(`Sucursal: ${branch.name}`);
    if (reg) parts.push(`Caja: ${reg.name}`);
    if (cash) parts.push(`Cajero(a): ${cash.name}`);
    if (filters.from || filters.to) parts.push(`Del ${filters.from || '…'} al ${filters.to || 'hoy'}`);
    return parts.join(' | ') || 'Sin filtros (todo)';
  };

  const onExcel = () =>
    void exportExcel(rows);
  const onPdf = () =>
    void exportPdf(rows, {
      title: 'Listado de encuestas',
      subtitle: describe(),
      store: storeInfo,
        summary: [
          { label: 'Total', value: String(rows.length) },
          {
            label: 'Calificaciones',
            value: (() => {
              const counts = { good: 0, regular: 0, bad: 0 };
              for (const r of rows) {
                const v = normalizeRating(r.rating);
                if (v) counts[v]++;
              }
              const total = counts.good + counts.regular + counts.bad;
              if (!total) return '—';
              return `Buena: ${counts.good}, Regular: ${counts.regular}, Mala: ${counts.bad}`;
            })(),
          },
        ],
    });

  const chip = (values: string[]) => (
    <span className="inline-flex flex-wrap gap-1">
      {values.map((v) => (
        <span key={v} className="rounded-full bg-faint px-2.5 py-1 text-[12px] font-medium text-ink/75">
          {v}
        </span>
      ))}
    </span>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="animate-fade-in">
          <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">Encuestas</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Todas las respuestas recopiladas. Exporta el listado en Excel o PDF.
          </p>
        </div>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        branches={branches}
        registers={registers}
        cashiers={cashiers}
      >
        <button
          onClick={() => load()}
          className="btn h-[38px] px-4 text-sm"
          disabled={loading}
        >
          <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
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
      </FilterBar>

      {error && (
        <div className="anim-pop rounded-2xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="grid place-items-center gap-3 py-16 text-muted">
            <Spinner className="h-7 w-7 text-brand-600" />
            <p className="text-sm">Cargando encuestas…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-semibold text-ink/80">Sin encuestas con estos filtros</p>
            <p className="mt-1 text-sm text-muted">Prueba con otro rango de fechas.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] divide-y divide-hairline text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-muted">
                    <th className="px-5 py-3.5 font-semibold">Fecha</th>
                    <th className="px-5 py-3.5 font-semibold">Sucursal</th>
                    <th className="px-5 py-3.5 font-semibold">Caja</th>
                    <th className="px-5 py-3.5 font-semibold">Cajero(a)</th>
                    <th className="px-5 py-3.5 font-semibold">Áreas a mejorar</th>
                    <th className="px-5 py-3.5 font-semibold">No gustó</th>
                    <th className="px-5 py-3.5 font-semibold">Por qué viene</th>
                    <th className="px-5 py-3.5 text-right font-semibold">Carita</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {slice.map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.04]">
                      <td className="whitespace-nowrap px-5 py-4 text-ink/70">
                        {fmtDateTime(s.created_at)}
                      </td>
                      <td className="px-5 py-4 text-ink/85">
                        {s.branch_name || '—'}
                      </td>
                      <td className="px-5 py-4 text-ink/85">
                        {s.register_name || '—'}
                      </td>
                      <td className="px-5 py-4 text-ink/85">
                        {s.cashier_name || '—'}
                      </td>
                      <td className="px-5 py-4 text-ink/70">
                        {chip(s.areas)}
                      </td>
                      <td className="px-5 py-4 text-ink/70">
                        {chip(s.dislikes)}
                      </td>
                      <td className="px-5 py-4 text-ink/70">
                        {chip(s.likes)}
                      </td>
                      <td className="px-5 py-4 text-right">
                    {isRatingValue(s.rating) ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <FaceIcon value={s.rating} className="h-4 w-4" />
                        <span>{ratingLabel(s.rating)}</span>
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted">Sin calificación</span>
                    )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              total={rows.length}
              page={page}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={setPageSize}
              noun="encuestas"
            />
          </>
        )}
      </div>
    </div>
  );
}