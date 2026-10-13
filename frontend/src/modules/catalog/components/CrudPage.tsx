import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../../../lib/api';
import { useToast } from '../../../lib/toast';
import { ConfirmDialog, Modal, Spinner } from '../../../components/Modal';
import Select from '../../../components/Select';
import Pagination from '../../../components/Pagination';
import { IconCheck, IconPencil, IconPlus, IconRefresh, IconTrash } from '../../../components/Icons';

export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'select';
  options?: { value: string | number; label: string }[];
  placeholder?: string;
}

export interface ColumnConfig {
  key: string;
  label: string;
  render?: (row: Row) => ReactNode;
  className?: string;
}

type Row = Record<string, any>;

interface Props {
  title: string;
  subtitle: string;
  endpoint: string;
  fields: FieldConfig[];
  columns: ColumnConfig[];
  nameLabel: (row: Row) => string;
  newLabel?: string;
}

export default function CrudPage({
  title,
  subtitle,
  endpoint,
  fields,
  columns,
  nameLabel,
  newLabel = 'Nuevo',
}: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: Row[] }>(endpoint, { role: 'admin' });
      setRows(res.items);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = rows.slice((current - 1) * pageSize, current * pageSize);

  const openNew = () => {
    setEditing(null);
    setDraft(Object.fromEntries(fields.map((f) => [f.key, ''])));
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    setDraft(
      Object.fromEntries(fields.map((f) => [f.key, row[f.key] !== null ? String(row[f.key]) : '']))
    );
    setFormError('');
    setModalOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const body: Row = {};
      for (const f of fields) {
        const raw = draft[f.key];
        if (f.type === 'select') {
          body[f.key] = Number(raw);
        } else {
          body[f.key] = String(raw ?? '').trim();
        }
      }
      if (editing) {
        await api(`${endpoint}/${editing.id}`, { method: 'PUT', body, role: 'admin' });
        toast.update(
          `Se actualizó "${String(body.name ?? nameLabel(editing))}"`,
          'Tus cambios se guardaron correctamente.'
        );
      } else {
        await api(endpoint, { method: 'POST', body, role: 'admin' });
        toast.create(`Se creó "${String(body.name ?? '')}"`, 'La nueva entrada ya está en la lista.');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar';
      setFormError(message);
      toast.error('No se pudo guardar', message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const label = nameLabel(toDelete);
    setDeleting(true);
    try {
      await api(`${endpoint}/${toDelete.id}`, { method: 'DELETE', role: 'admin' });
      setToDelete(null);
      toast.deactivate(`Se desactivó "${label}"`, 'Se conserva el historial de encuestas.');
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al eliminar';
      setError(message);
      toast.error('No se pudo desactivar', message);
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (row: Row) => {
    const wasActive = Boolean(row.active);
    try {
      await api(`${endpoint}/${row.id}`, {
        method: 'PUT',
        body: { active: row.active ? 0 : 1 },
        role: 'admin',
      });
      if (wasActive) {
        toast.deactivate(`Se desactivó "${nameLabel(row)}"`, 'Ya no aparecerá en el login de cajas.');
      } else {
        toast.activate(`Se activó "${nameLabel(row)}"`, 'Volverá a aparecer en el login de cajas.');
      }
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar';
      setError(message);
      toast.error('No se pudo actualizar', message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="animate-fade-in">
          <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">{title}</h1>
          <p className="mt-0.5 max-w-xl text-[13px] text-muted">{subtitle}</p>
        </div>
        <button onClick={openNew} className="btn-primary h-10 px-4 text-[13px]">
          <IconPlus className="h-4 w-4" />
          {newLabel}
        </button>
      </div>

      {error && (
        <div className="anim-pop rounded-2xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="grid place-items-center gap-3 py-16 text-muted">
            <Spinner className="h-7 w-7 text-brand-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-semibold text-ink/80">Aún no hay registros</p>
            <p className="mt-1 text-sm text-muted">Crea el primero con el botón de arriba.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] divide-y divide-hairline text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.06em] text-muted">
                  {columns.map((col) => (
                    <th key={col.key} className={`px-5 py-3.5 font-semibold ${col.className || ''}`}>
                      {col.label}
                    </th>
                  ))}
                  <th className="px-5 py-3.5 font-semibold">Estado</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {slice.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.04]">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-5 py-4 text-ink/85 ${col.className || ''}`}
                      >
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${
                          row.active
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
                            : 'bg-faint text-muted'
                        }`}
                      >
                        {row.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEdit(row)}
                          className="btn-ghost h-9 w-9 px-0! text-brand-600"
                          aria-label="Editar"
                          title="Editar"
                        >
                          <IconPencil className="h-4 w-4" />
                        </button>
                        {!row.active ? (
                          <button
                            onClick={() => toggleActive(row)}
                            className="btn h-9 w-9 px-0! text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                            aria-label="Activar"
                            title="Activar"
                          >
                            <IconRefresh className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setToDelete(row)}
                            className="btn h-9 w-9 px-0! text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                            aria-label="Desactivar"
                            title="Desactivar"
                          >
                            <IconTrash className="h-4 w-4" />
                          </button>
                        )}
                      </div>
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
            />
          </>
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editing ? `Editar "${nameLabel(editing)}"` : title.replace(/s$/, '') + ' nuevo'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost h-11 px-5 text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              form="crud-form"
              disabled={saving}
              className="btn-primary h-11 px-5 text-sm"
            >
              {saving ? <Spinner className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
              Guardar
            </button>
          </>
        }
      >
        <form id="crud-form" onSubmit={submit} className="space-y-4">
          {formError && (
            <div className="anim-pop rounded-xl border border-red-600/20 bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {formError}
            </div>
          )}
          {fields.map((field) => (
            <div key={field.key}>
              <label className="mb-1.5 block text-[13px] font-medium text-ink/80">
                {field.label}
              </label>
{field.type === 'select' ? (
                <Select
                  value={String(draft[field.key] ?? '')}
                  onChange={(v) => setDraft((d) => ({ ...d, [field.key]: v }))}
                  placeholder="Selecciona…"
                  options={field.options || []}
                />
              ) : (
                <input
                  className="input"
                  value={String(draft[field.key] ?? '')}
                  placeholder={field.placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                  required
                  autoFocus
                />
              )}
            </div>
          ))}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Desactivar registro"
        danger
        loading={deleting}
        confirmLabel="Desactivar"
        message={
          <>
            Se desactivará <strong>"{toDelete ? nameLabel(toDelete) : ''}"</strong>. Dejará de
            aparecer en el login de cajas, pero el historial de encuestas se conserva.
          </>
        }
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}