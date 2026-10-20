import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { PERMISSION_GROUPS, PERMISSION_LABELS } from '../../lib/permissions';
import type { RoleRow } from '../../lib/types';
import { ConfirmDialog, Modal, Spinner } from '../../components/Modal';
import { IconCheck, IconLock, IconPencil, IconPlus, IconShield, IconTrash, IconUsers } from '../../components/Icons';

interface FormState {
  id: number | null;
  name: string;
  description: string;
  permissions: Set<string>;
}

const EMPTY_FORM: FormState = { id: null, name: '', description: '', permissions: new Set() };

function Checkbox({ checked, indeterminate }: { checked: boolean; indeterminate?: boolean }) {
  return (
    <span
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
        checked || indeterminate
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-line bg-surface'
      }`}
    >
      {checked ? (
        <IconCheck className="h-3.5 w-3.5" />
      ) : indeterminate ? (
        <span className="h-0.5 w-2.5 rounded bg-white" />
      ) : null}
    </span>
  );
}

export default function RolesPage() {
  const toast = useToast();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toDelete, setToDelete] = useState<RoleRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: RoleRow[] }>('/api/admin/roles');
      setRoles(res.items);
    } catch (err) {
      toast.error('No se pudieron cargar los roles', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setFormError('');
    setForm({ ...EMPTY_FORM, permissions: new Set() });
  };

  const openEdit = (role: RoleRow) => {
    setFormError('');
    setForm({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: new Set(role.permissions),
    });
  };

  const toggle = (keys: string[], on: boolean) => {
    if (!form) return;
    const next = new Set(form.permissions);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    setForm({ ...form, permissions: next });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (form.permissions.size === 0) {
      setFormError('Selecciona al menos una opción para este rol.');
      return;
    }
    setSaving(true);
    setFormError('');
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      permissions: [...form.permissions],
    };
    try {
      if (form.id) {
        await api(`/api/admin/roles/${form.id}`, { method: 'PUT', body });
        toast.update('Rol actualizado', 'Los usuarios con este rol verán los cambios al navegar.');
      } else {
        await api('/api/admin/roles', { method: 'POST', body });
        toast.create('Rol creado');
      }
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api(`/api/admin/roles/${toDelete.id}`, { method: 'DELETE' });
      toast.deactivate(`Se eliminó el rol "${toDelete.name}"`);
      await load();
    } catch (err) {
      toast.error('No se pudo eliminar', err instanceof Error ? err.message : undefined);
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">Roles y permisos</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Define qué opciones del menú ve cada rol. Solo el administrador puede gestionarlos.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary h-10 px-4 text-[13px]">
          <IconPlus className="h-4 w-4" />
          Nuevo rol
        </button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16">
          <Spinner className="h-7 w-7 text-brand-600" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <section key={role.id} className="card flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  <IconShield className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="truncate text-[15px] font-semibold tracking-tight">{role.name}</h2>
                    {role.is_system && (
                      <span className="rounded-full bg-faint px-2 py-0.5 text-[11px] font-semibold text-muted">
                        Sistema
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">
                    {role.description || 'Sin descripción'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!role.is_admin && (
                    <button
                      onClick={() => openEdit(role)}
                      className="btn-ghost h-9 w-9 px-0! text-brand-600"
                      aria-label={`Editar ${role.name}`}
                      title="Editar"
                    >
                      <IconPencil className="h-4 w-4" />
                    </button>
                  )}
                  {!role.is_system && (
                    <button
                      onClick={() => setToDelete(role)}
                      className="btn-ghost h-9 w-9 px-0! text-red-500"
                      aria-label={`Eliminar ${role.name}`}
                      title="Eliminar"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {role.is_admin ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                    <IconLock className="h-3.5 w-3.5" />
                    Acceso total
                  </span>
                ) : (
                  role.permissions.map((p) => (
                    <span key={p} className="rounded-full bg-faint px-2.5 py-1 text-[12px] font-medium text-ink/75">
                      {PERMISSION_LABELS[p] ?? p}
                    </span>
                  ))
                )}
              </div>

              <p className="mt-auto flex items-center gap-1.5 pt-4 text-[12px] text-muted">
                <IconUsers className="h-3.5 w-3.5" />
                {role.user_count === 1 ? '1 usuario' : `${role.user_count} usuarios`}
              </p>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={!!form}
        wide
        title={form?.id ? 'Editar rol' : 'Nuevo rol'}
        onClose={() => setForm(null)}
        footer={
          <>
            <button type="button" onClick={() => setForm(null)} className="btn-ghost h-11 px-5 text-sm">
              Cancelar
            </button>
            <button type="submit" form="role-form" disabled={saving} className="btn-primary h-11 px-5 text-sm">
              {saving ? <Spinner className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
              Guardar
            </button>
          </>
        }
      >
        {form && (
          <form id="role-form" onSubmit={save} className="space-y-4">
            {formError && (
              <div className="anim-pop rounded-xl border border-red-600/20 bg-red-50 px-3 py-2 text-[13px] text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {formError}
              </div>
            )}
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className="eyebrow mb-1 block" htmlFor="r-name">
                  Nombre del rol
                </label>
                <input
                  id="r-name"
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. Supervisor"
                  maxLength={60}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="eyebrow mb-1 block" htmlFor="r-desc">
                  Descripción (opcional)
                </label>
                <input
                  id="r-desc"
                  className="input"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ej. Revisa resultados de su tienda"
                  maxLength={200}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="eyebrow">Opciones que verá este rol</p>
                <span className="text-[12px] text-muted">{form.permissions.size} seleccionadas</span>
              </div>
              <div className="space-y-3">
                {PERMISSION_GROUPS.map((group) => {
                  const keys = group.items.map((p) => p.key);
                  const selected = keys.filter((k) => form.permissions.has(k)).length;
                  const all = selected === keys.length;
                  return (
                    <fieldset key={group.label} className="rounded-2xl border border-line">
                      <button
                        type="button"
                        onClick={() => toggle(keys, !all)}
                        className="flex w-full items-center gap-3 rounded-t-2xl border-b border-hairline bg-faint/60 px-3.5 py-2.5 text-left"
                      >
                        <Checkbox checked={all} indeterminate={selected > 0 && !all} />
                        <span className="flex-1 text-[13px] font-semibold">{group.label}</span>
                        <span className="text-[12px] text-muted">
                          {selected}/{keys.length}
                        </span>
                      </button>
                      <div className="divide-y divide-hairline">
                        {group.items.map((p) => {
                          const on = form.permissions.has(p.key);
                          return (
                            <label
                              key={p.key}
                              className="flex cursor-pointer items-start gap-3 px-3.5 py-2.5 transition-colors hover:bg-faint/50"
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={on}
                                onChange={(e) => toggle([p.key], e.target.checked)}
                              />
                              <span className="mt-0.5">
                                <Checkbox checked={on} />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[13px] font-medium text-ink">{p.label}</span>
                                <span className="block text-[12px] text-muted">{p.description}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
              <p className="mt-2 text-[12px] text-muted">
                Todos los usuarios pueden ver su <strong>Perfil</strong>. Roles y permisos es exclusivo del Administrador.
              </p>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar rol"
        danger
        loading={deleting}
        confirmLabel="Eliminar"
        message={
          <>
            Se eliminará el rol <strong>"{toDelete?.name}"</strong>. Esta acción no se puede deshacer.
          </>
        }
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
