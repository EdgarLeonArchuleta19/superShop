import { useRef, useState } from 'react';
import { useSettings } from '../../lib/settings';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { Spinner } from '../../components/Modal';
import { IconImage, IconLock, IconSettings, IconTrash, IconUser } from '../../components/Icons';

const MAX_LOGO_BYTES = 600 * 1024;
const ROLE_LABEL = { admin: 'Administrador', cashier: 'Cajero(a)' } as const;

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

export default function InfoSettingsPage() {
  const { settings, save } = useSettings();
  const { user, role } = useAuth();
  const toast = useToast();
  const isAdmin = role === 'admin';

  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(settings.store_name);
  const [tagline, setTagline] = useState(settings.store_tagline);
  const [logo, setLogo] = useState<string | null>(settings.store_logo);
  const [saving, setSaving] = useState(false);

  const preview = logo || '/logo-tienda.jpg';

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast.error('Archivo no válido', 'Selecciona una imagen PNG, JPG o WEBP.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Imagen muy grande', 'El logo debe pesar menos de 600 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Falta el nombre', 'Escribe el nombre de la tienda.');
      return;
    }
    setSaving(true);
    try {
      await save({ store_name: name, store_tagline: tagline, store_logo: logo });
      toast.update('Ajustes guardados', 'La información de la tienda se actualizó.');
    } catch (err) {
      toast.error('No se pudieron guardar', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">Información</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Identidad de la tienda y los datos de tu cuenta.
        </p>
      </div>

      <Card
        icon={IconSettings}
        title="Información de la tienda"
        subtitle={isAdmin ? 'Se muestra en el menú y las encuestas.' : 'Solo el administrador puede modificarla.'}
      >
        <form onSubmit={onSubmit}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-2">
              <img
                src={preview}
                alt="Logo de la tienda"
                className="h-24 w-24 rounded-3xl object-cover shadow-pop ring-1 ring-line"
              />
              {isAdmin && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="btn-soft h-9 px-3 text-[12px]"
                  >
                    <IconImage className="h-4 w-4" />
                    Cambiar
                  </button>
                  {logo && (
                    <button
                      type="button"
                      onClick={() => setLogo(null)}
                      aria-label="Quitar logo"
                      title="Quitar logo"
                      className="btn-soft h-9 w-9 px-0"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={onFile}
                className="hidden"
              />
            </div>

            <div className="flex-1 space-y-3.5">
              <div>
                <label className="eyebrow mb-1 block" htmlFor="store-name">
                  Nombre de la tienda
                </label>
                <input
                  id="store-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  readOnly={!isAdmin}
                  disabled={!isAdmin}
                  placeholder="Ej. Super Nallely"
                />
              </div>
              <div>
                <label className="eyebrow mb-1 block" htmlFor="store-tagline">
                  Descripción
                </label>
                <input
                  id="store-tagline"
                  className="input"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  maxLength={80}
                  readOnly={!isAdmin}
                  disabled={!isAdmin}
                  placeholder="Ej. Administración de tiendas"
                />
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={saving} className="btn-primary h-10 px-5 text-sm">
                {saving ? <Spinner className="h-4 w-4" /> : 'Guardar cambios'}
              </button>
            </div>
          )}
        </form>
      </Card>

      <Card icon={IconUser} title="Mi cuenta" subtitle="Datos de tu sesión actual.">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-faint px-3.5 py-3">
            <dt className="eyebrow">Nombre</dt>
            <dd className="mt-0.5 truncate text-[13px] font-semibold text-ink">{user?.name}</dd>
          </div>
          <div className="rounded-xl bg-faint px-3.5 py-3">
            <dt className="eyebrow">Correo</dt>
            <dd className="mt-0.5 truncate text-[13px] font-semibold text-ink">{user?.email}</dd>
          </div>
          <div className="rounded-xl bg-faint px-3.5 py-3">
            <dt className="eyebrow">Rol</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <IconLock className="h-3.5 w-3.5 text-muted" />
              {user ? ROLE_LABEL[user.role] : ''}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
