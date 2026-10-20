import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import type { AdminUserRow, RoleRow } from '../../lib/types';
import { ConfirmDialog, Modal, Spinner } from '../../components/Modal';
import Select from '../../components/Select';
import Pagination from '../../components/Pagination';
import { PASSWORD_HINT, passwordProblem } from '../../lib/passwords';
import PasswordStrength from '../../components/PasswordStrength';
import {
  IconCheck, IconPencil, IconPlus, IconUser, IconX,
} from '../../components/Icons';

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

interface FormState {
  id: number | null;
  name: string;
  username: string;
  roleId: string;
  password: string;
}

const EMPTY_FORM: FormState = { id: null, name: '', username: '', roleId: '', password: '' };

export default function UsersPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toDeactivate, setToDeactivate] = useState<AdminUserRow | null>(null);
  const [working, setWorking] = useState(false);
  const [roles, setRoles] = useState<RoleRow[]>([]);

  useEffect(() => {
    api<{ items: RoleRow[] }>('/api/admin/roles')
      .then((res) => setRoles(res.items))
      .catch(() => undefined);
  }, []);

  // Solo el Administrador puede asignar el rol Administrador (el servidor también lo valida).
  const roleOptions = roles
    .filter((r) => user?.is_admin || !r.is_admin)
    .map((r) => ({ value: String(r.id), label: r.name }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: AdminUserRow[]; total: number }>(`/api/admin/users?page=${page}&pageSize=${pageSize}`);
      setUsers(res.items);
      setTotal(res.total);
    } catch (err) {
      toast.error('No se pudieron cargar', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setFormError('');
    const cashier = roles.find((r) => r.is_system && !r.is_admin);
    setForm({ ...EMPTY_FORM, roleId: cashier ? String(cashier.id) : '' });
  };

  const openEdit = (row: AdminUserRow) => {
    setFormError('');
    setForm({ id: row.id, name: row.name, username: row.username, roleId: row.role_id ? String(row.role_id) : '', password: '' });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const problem = form.password ? passwordProblem(form.password, form.username) : null;
    if (problem) {
      setFormError(problem);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        username: form.username.trim(),
        role_id: Number(form.roleId),
      };
      if (form.password) body.password = form.password;

      if (form.id) {
        await api(`/api/admin/users/${form.id}`, { method: 'PUT', body });
        toast.update('Usuario actualizado');
      } else {
        await api('/api/admin/users', { method: 'POST', body });
        toast.create('Usuario creado');
      }
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: AdminUserRow) => {
    try {
      await api(`/api/admin/users/${row.id}`, {
        method: 'PUT',
        body: { active: row.active ? 0 : 1 },
      });
      await load();
    } catch (err) {
      toast.error('No se pudo actualizar', err instanceof Error ? err.message : undefined);
    }
  };

  const confirmDeactivate = async () => {
    if (!toDeactivate) return;
    setWorking(true);
    try {
      await api(`/api/admin/users/${toDeactivate.id}`, { method: 'DELETE' });
      toast.deactivate(`Se desactivó "${toDeactivate.name}"`);
      setToDeactivate(null);
      await load();
    } catch (err) {
      toast.error('No se pudo desactivar', err instanceof Error ? err.message : undefined);
      setToDeactivate(null);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">Usuarios</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Administra las cuentas de acceso al panel.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary h-10 px-4 text-[13px]">
          <IconPlus className="h-4 w-4" />
          Nuevo usuario
        </button>
      </div>

      <Card icon={IconUser} title="Cuentas de usuario" subtitle="Cada usuario ve solo las opciones de su rol.">
        {loading ? (
          <div className="grid place-items-center py-12">
            <Spinner className="h-7 w-7 text-brand-600" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] divide-y divide-hairline text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-muted">
                    <th className="px-3 py-3 font-semibold">Nombre</th>
                    <th className="px-3 py-3 font-semibold">Usuario</th>
                    <th className="px-3 py-3 font-semibold">Rol</th>
                    <th className="px-3 py-3 font-semibold">Estado</th>
                    <th className="px-3 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {users.map((row) => {
                    const isSelf = row.id === user?.id;
                    return (
                      <tr key={row.id} className="transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.04]">
                        <td className="px-3 py-3.5 font-medium text-ink/90">{row.name}</td>
                        <td className="px-3 py-3.5 text-ink/75">{row.username}</td>
                        <td className="px-3 py-3.5">
                          <span className="rounded-full bg-faint px-2.5 py-1 text-[12px] font-semibold text-muted">
                            {row.role_name}
                          </span>
                        </td>
                        <td className="px-3 py-3.5">
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
                        <td className="px-3 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEdit(row)}
                              className="btn-ghost h-9 w-9 px-0! text-brand-600"
                              aria-label="Editar"
                              title="Editar"
                            >
                              <IconPencil className="h-4 w-4" />
                            </button>
                            {!isSelf &&
                              (row.active ? (
                                <button
                                  onClick={() => setToDeactivate(row)}
                                  className="btn-ghost h-9 w-9 px-0! text-red-500"
                                  aria-label="Desactivar"
                                  title="Desactivar"
                                >
                                  <IconX className="h-4 w-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => toggleActive(row)}
                                  className="btn-ghost h-9 w-9 px-0! text-emerald-600"
                                  aria-label="Activar"
                                  title="Activar"
                                >
                                  <IconCheck className="h-4 w-4" />
                                </button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="-mx-5 -mb-5 mt-3">
              <Pagination
                total={total}
                page={page}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
                noun="usuarios"
              />
            </div>
          </>
        )}
      </Card>

      <Modal
        open={!!form}
        title={form?.id ? 'Editar usuario' : 'Nuevo usuario'}
        onClose={() => setForm(null)}
        footer={
          <>
            <button type="button" onClick={() => setForm(null)} className="btn-ghost h-11 px-5 text-sm">
              Cancelar
            </button>
            <button type="submit" form="user-form" disabled={saving} className="btn-primary h-11 px-5 text-sm">
              {saving ? <Spinner className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
              Guardar
            </button>
          </>
        }
      >
        {form && (
          <form id="user-form" onSubmit={save} className="space-y-3.5">
            {formError && (
              <div className="anim-pop rounded-xl border border-red-600/20 bg-red-50 px-3 py-2 text-[13px] text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {formError}
              </div>
            )}
            <div>
              <label className="eyebrow mb-1 block" htmlFor="u-name">
                Nombre
              </label>
              <input
                id="u-name"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Ana López"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="eyebrow mb-1 block" htmlFor="u-username">
                Usuario
              </label>
              <input
                id="u-username"
                className="input"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Ej. anlopez"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="eyebrow mb-1 block" htmlFor="u-role">
                Rol
              </label>
              <Select
                id="u-role"
                value={form.roleId}
                onChange={(v) => setForm({ ...form, roleId: v })}
                options={roleOptions}
                placeholder="Selecciona un rol"
                disabled={form.id === user?.id}
              />
              {form.id === user?.id && (
                <p className="mt-1 text-[12px] text-muted">No puedes cambiar tu propio rol.</p>
              )}
            </div>
            <div>
              <label className="eyebrow mb-1 block" htmlFor="u-pwd">
                {form.id ? 'Nueva contraseña (opcional)' : 'Contraseña'}
              </label>
              <input
                id="u-pwd"
                type="password"
                className="input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={form.id ? 'Dejar en blanco para no cambiar' : PASSWORD_HINT}
                autoComplete="new-password"
                required={!form.id}
              />
              <PasswordStrength password={form.password} username={form.username} />
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDeactivate}
        title="Desactivar usuario"
        danger
        loading={working}
        confirmLabel="Desactivar"
        message={
          <>
            Se desactivará <strong>"{toDeactivate?.name}"</strong>. Ya no podrá iniciar sesión.
          </>
        }
        onConfirm={confirmDeactivate}
        onClose={() => setToDeactivate(null)}
      />
    </div>
  );
}