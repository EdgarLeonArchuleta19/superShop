import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT, passwordProblem } from '../../lib/passwords';
import PasswordStrength from '../../components/PasswordStrength';
import { useToast } from '../../lib/toast';
import { api } from '../../lib/api';
import { Spinner } from '../../components/Modal';
import { Modal } from '../../components/Modal';
import { IconKey, IconLock, IconUser, IconEye, IconEyeOff } from '../../components/Icons';

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

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const toast = useToast();

  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [showCurPwd, setShowCurPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  const openPwdModal = () => {
    setCurPwd('');
    setNewPwd('');
    setConfirmPwd('');
    setPwdModalOpen(true);
  };

  const closePwdModal = () => {
    setPwdModalOpen(false);
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(newPwd, user?.username);
    if (problem) {
      toast.error('Contraseña no válida', problem);
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setSavingPwd(true);
    try {
      await api('/api/auth/password', {
        method: 'PUT',
        body: { current_password: curPwd, new_password: newPwd },
      });
      toast.update('Contraseña actualizada. Cerrando sesión...');
      closePwdModal();
      await logout('password_change');
    } catch (err) {
      toast.error('No se pudo cambiar', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">Perfil</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Tu información de cuenta y seguridad.
        </p>
      </div>

      <Card icon={IconUser} title="Mi cuenta" subtitle="Datos de tu sesión actual.">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-faint px-3.5 py-3">
            <dt className="eyebrow">Nombre completo</dt>
            <dd className="mt-0.5 truncate text-[13px] font-semibold text-ink">{user?.name}</dd>
          </div>
          <div className="rounded-xl bg-faint px-3.5 py-3">
            <dt className="eyebrow">Usuario</dt>
            <dd className="mt-0.5 truncate text-[13px] font-semibold text-ink">{user?.username}</dd>
          </div>
          <div className="rounded-xl bg-faint px-3.5 py-3">
            <dt className="eyebrow">Rol</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <IconLock className="h-3.5 w-3.5 text-muted" />
              {user?.role_name ?? ''}
            </dd>
          </div>
        </dl>
      </Card>

      <Card icon={IconKey} title="Seguridad" subtitle="Cambia tu contraseña de acceso.">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Cambiar contraseña</p>
            <p className="mt-0.5 text-[12px] text-muted">
              Actualiza tu contraseña para mantener tu cuenta segura.
            </p>
          </div>
          <button onClick={openPwdModal} className="btn-primary h-10 px-4 text-sm">
            Cambiar contraseña
          </button>
        </div>
      </Card>

      <Modal
        open={pwdModalOpen}
        title="Cambiar contraseña"
        onClose={closePwdModal}
        footer={
          <>
            <button type="button" onClick={closePwdModal} className="btn-ghost h-11 px-5 text-sm">
              Cancelar
            </button>
            <button type="submit" form="pwd-form" disabled={savingPwd} className="btn-primary h-11 px-5 text-sm">
              {savingPwd ? <Spinner className="h-4 w-4" /> : 'Actualizar'}
            </button>
          </>
        }
      >
        <form id="pwd-form" onSubmit={changePassword} className="space-y-3.5">
          <div>
            <label className="eyebrow mb-1 block" htmlFor="cur-pwd">
              Contraseña actual
            </label>
            <div className="relative">
              <input
                id="cur-pwd"
                type={showCurPwd ? 'text' : 'password'}
                className="input pr-10"
                value={curPwd}
                onChange={(e) => setCurPwd(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurPwd(!showCurPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                aria-label={showCurPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showCurPwd ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="eyebrow mb-1 block" htmlFor="new-pwd">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                id="new-pwd"
                type={showNewPwd ? 'text' : 'password'}
                className="input pr-10"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                autoComplete="new-password"
                placeholder={PASSWORD_HINT}
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
              <button
                type="button"
                onClick={() => setShowNewPwd(!showNewPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                aria-label={showNewPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showNewPwd ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
              </button>
            </div>
            <PasswordStrength password={newPwd} username={user?.username} />
          </div>
          <div>
            <label className="eyebrow mb-1 block" htmlFor="confirm-pwd">
              Confirmar nueva contraseña
            </label>
            <div className="relative">
              <input
                id="confirm-pwd"
                type={showConfirmPwd ? 'text' : 'password'}
                className="input pr-10"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                aria-label={showConfirmPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showConfirmPwd ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
              </button>
            </div>
            {confirmPwd && (
              <p
                className={`mt-1.5 text-[12px] font-medium ${
                  confirmPwd === newPwd ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {confirmPwd === newPwd ? '✓ Las contraseñas coinciden' : '✗ Las contraseñas no coinciden'}
              </p>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}