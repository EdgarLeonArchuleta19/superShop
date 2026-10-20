import type { ReactNode } from 'react';
import type { Branch, Filters, Register } from '../../../lib/types';
import Select from '../../../components/Select';
import DatePicker from '../../../components/DatePicker';

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
  branches: Branch[];
  registers: Register[];
  children?: ReactNode;
}

const labelCls = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted';

/** Por ahora las tablets no eligen cajero(a), así que no hay filtro de cajero(a). */
export default function FilterBar({ filters, onChange, branches, registers, children }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const hasFilters =
    filters.branch_id || filters.register_id || filters.from || filters.to;

  const registerOptions = (
    filters.branch_id
      ? registers.filter((r) => String(r.branch_id) === filters.branch_id)
      : registers
  ).map((r) => ({ value: r.id, label: r.name }));

  return (
    <div className="card animate-fade-in p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div>
          <label className={labelCls}>Sucursal</label>
          <Select
            value={filters.branch_id}
            onChange={(v) => set({ branch_id: v, register_id: '' })}
            placeholder="Todas"
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
        <div>
          <label className={labelCls}>Caja</label>
          <Select
            value={filters.register_id}
            onChange={(v) => set({ register_id: v })}
            placeholder="Todas"
            options={registerOptions}
            disabled={registerOptions.length === 0}
          />
        </div>
        <div>
          <label className={labelCls}>Desde</label>
          <DatePicker
            value={filters.from}
            onChange={(v) => set({ from: v })}
            max={filters.to || undefined}
            placeholder="Desde"
          />
        </div>
        <div>
          <label className={labelCls}>Hasta</label>
          <DatePicker
            value={filters.to}
            onChange={(v) => set({ to: v })}
            min={filters.from || undefined}
            placeholder="Hasta"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={() => set({ branch_id: '', register_id: '', from: '', to: '' })}
          disabled={!hasFilters}
          className="btn-soft h-[38px] px-4 text-[13px]"
        >
          Limpiar
        </button>
        {children}
      </div>
    </div>
  );
}

export function defaultFilters(): Filters {
  const d = new Date();
  const from = new Date(d);
  from.setDate(from.getDate() - 30);
  const p = (n: number) => String(n).padStart(2, '0');
  const fmt = (x: Date) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  return { branch_id: '', register_id: '', from: fmt(from), to: fmt(d) };
}

/**
 * Arma la consulta para /api/admin/surveys y /api/admin/stats. Las fechas del filtro son
 * días locales (YYYY-MM-DD) y en la base se guardan en ISO UTC: se mandan como inicio y
 * fin del día en la zona del navegador para no perder las encuestas de "hoy".
 */
export function filtersQuery(filters: Filters): string {
  const p = new URLSearchParams();
  (Object.keys(filters) as (keyof Filters)[]).forEach((k) => {
    if (filters[k]) p.set(k, filters[k]);
  });
  if (filters.from) p.set('from', new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) p.set('to', new Date(`${filters.to}T23:59:59.999`).toISOString());
  return p.toString();
}