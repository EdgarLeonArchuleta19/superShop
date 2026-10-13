import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import type { AdminUserRow, UserRole } from '../../lib/types';
import { ConfirmDialog, Modal, Spinner } from '../../components/Modal';
import Select from '../../components/Select';
import { IconCheck, IconLock, IconPencil, IconPlus, IconUser, IconX } from '../../components/Icons';

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

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'cashier', label: 'Cajero(a)' },
];

interface FormState {
  id: number | null;
  name: string;
  email: string;
  role: UserRole;
  password: string;
}

const EMPTY_FORM: FormState = { id: null, name: '', email: '', role: 'cashier', password: '' };

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toDeactivate, setToDeactivate] = useState<AdminUserRow | null>(null);
  const [working, setWorking] = useState(false);

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: AdminUserRow[] }>('/api/admin/users');
      setUsers(res.items);
    } catch (err) {
      toast.error('No se pudieron cargar', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setFormError('');
    setForm({ ...EMPTY_FORM });
  };

  const openEdit = (row: AdminUserRow) => {
    setFormError('');
    setForm({ id: row.id, name: row.name, email: row.email, role: row.role, password: '' });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
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

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd.length < 6) {
      toast.error('Contraseña muy corta', 'Usa al menos 6 caracteres.');
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setSavingPwd(true);
    try {
      await api('/api/admin/password', {
        method: 'PUT',
        body: { current_password: curPwd, new_password: newPwd },
      });
      toast.update('Contraseña actualizada');
      setCurPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err) {
      toast.error('No se pudo cambiar', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">Administrador</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Gestiona las cuentas de acceso y tu contraseña.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary h-10 px-4 text-[13px]">
          <IconPlus className="h-4 w-4" />
          Nuevo usuario
        </button>
      </div>

      <Card icon={IconUser} title="Cuentas de usuario" subtitle="Administradores y cajeros(as).">
        {loading ? (
          <div className="grid place-items-center py-12">
            <Spinner className="h-7 w-7 text-brand-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] divide-y divide-hairline text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.06em] text-muted">
                  <th className="px-3 py-3 font-semibold">Nombre</th>
                  <th className="px-3 py-3 font-semibold">Correo</th>
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
                      <td className="px-3 py-3.5 text-ink/75">{row.email}</td>
                      <td className="px-3 py-3.5">
                        <span className="rounded-full bg-faint px-2.5 py-1 text-[12px] font-semibold text-muted">
                          {row.role === 'admin' ? 'Administrador' : 'Cajero(a)'}
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
        )}
      </Card>

      <Card icon={IconLock} title="Cambiar mi contraseña" subtitle="Actualiza el acceso de tu cuenta.">
        <form onSubmit={changePassword} className="grid gap-3.5 sm:grid-cols-3">
          <div>
            <label className="eyebrow mb-1 block" htmlFor="cur-pwd">
              Contraseña actual
            </label>
            <input
              id="cur-pwd"
              type="password"
              className="input"
              value={curPwd}
              onChange={(e) => setCurPwd(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="eyebrow mb-1 block" htmlFor="new-pwd">
              Nueva contraseña
            </label>
            <input
              id="new-pwd"
              type="password"
              className="input"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="eyebrow mb-1 block" htmlFor="confirm-pwd">
              Confirmar
            </label>
            <input
              id="confirm-pwd"
              type="password"
              className="input"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>
          <div className="flex justify-end sm:col-span-3">
            <button type="submit" disabled={savingPwd} className="btn-soft h-10 px-6 text-sm">
              {savingPwd ? <Spinner className="h-4 w-4" /> : 'Actualizar contraseña'}
            </button>
          </div>
        </form>
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
              <label className="eyebrow mb-1 block" htmlFor="u-email">
                Correo
              </label>
              <input
                id="u-email"
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="usuario@correo.com"
                required
              />
            </div>
            <div>
              <label className="eyebrow mb-1 block" htmlFor="u-role">
                Rol
              </label>
              <Select
                id="u-role"
                value={form.role}
                onChange={(v) => setForm({ ...form, role: v as UserRole })}
                options={ROLE_OPTIONS}
              />
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
                placeholder={form.id ? 'Dejar en blanco para no cambiar' : 'Mínimo 6 caracteres'}
                autoComplete="new-password"
                required={!form.id}
              />
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
