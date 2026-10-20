import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../lib/settings';
import { useToast } from '../../lib/toast';
import { Spinner } from '../../components/Modal';
import StoreLogo from '../../components/StoreLogo';
import { IconFileArchive, IconImage, IconSettings, IconTrash } from '../../components/Icons';

const MAX_LOGO_BYTES = 600 * 1024;

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
  const toast = useToast();

  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(settings.store_name);
  const [logo, setLogo] = useState<string | null>(settings.store_logo);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const dirty = name.trim() !== settings.store_name || logo !== settings.store_logo;

  // Los ajustes pueden llegar del servidor después del primer render: se toman
  // mientras no haya cambios sin guardar.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (dirtyRef.current) return;
    setName(settings.store_name);
    setLogo(settings.store_logo);
  }, [settings.store_name, settings.store_logo]);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error('Archivo no válido', 'Elige una imagen PNG, JPG o WEBP.');
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
      await save({ store_name: name.trim(), store_logo: logo });
      toast.update('Información guardada', 'Los próximos reportes ya la usan.');
    } catch (err) {
      toast.error('No se pudo guardar', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const displayName = name.trim() || 'Mi tienda';

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">Información</h1>
        <p className="mt-0.5 text-[13px] text-muted">Nombre y logo de tu tienda.</p>
      </div>

      <Card
        icon={IconSettings}
        title="Información de la tienda"
        subtitle="Aparece en los reportes PDF de encuestas y en la pantalla de encuestas."
      >
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  pickFile(e.dataTransfer.files[0]);
                }}
                title={logo ? 'Cambiar logo' : 'Subir logo'}
                className={`group relative rounded-3xl transition ${dragOver ? 'ring-4 ring-brand-400' : ''}`}
              >
                <StoreLogo
                  name={displayName}
                  logo={logo}
                  className="h-28 w-28 rounded-3xl shadow-pop ring-1 ring-line"
                />
                <span className="absolute inset-0 grid place-items-center rounded-3xl bg-black/45 text-[12px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                  {logo ? 'Cambiar' : 'Subir logo'}
                </span>
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="btn-soft h-9 px-3 text-[12px]"
                >
                  <IconImage className="h-4 w-4" />
                  {logo ? 'Cambiar' : 'Subir logo'}
                </button>
                {logo && (
                  <button
                    type="button"
                    onClick={() => setLogo(null)}
                    aria-label="Quitar logo"
                    title="Quitar logo"
                    className="btn-soft h-9 w-9 px-0 text-red-600"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
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
                  placeholder="Ej. Abarrotes Don Pepe"
                />
              </div>
              <p className="text-[12px] text-muted">
                {logo
                  ? 'Logo: PNG, JPG o WEBP de hasta 600 KB. Se ve mejor si es cuadrado.'
                  : 'Sin logo se usa el de SuperShop. Puedes subir una imagen PNG, JPG o WEBP de hasta 600 KB (de preferencia cuadrada).'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="eyebrow">Así se verá en los reportes</p>
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 text-slate-900 dark:bg-white">
              <StoreLogo
                name={displayName}
                logo={logo}
                className="h-11 w-11 shrink-0 rounded-lg"
              />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[15px] font-bold text-[#2b46c4]">
                  {displayName} – Encuestas de satisfacción
                </p>
                <p className="mt-1 text-[11px] text-slate-500">Reporte de encuestas · Generado: hoy</p>
              </div>
              <IconFileArchive className="ml-auto hidden h-5 w-5 shrink-0 text-slate-400 sm:block" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setName(settings.store_name);
                  setLogo(settings.store_logo);
                }}
                className="btn-ghost h-10 px-4 text-sm"
              >
                Descartar
              </button>
            )}
            <button type="submit" disabled={saving || !dirty} className="btn-primary h-10 px-5 text-sm">
              {saving ? <Spinner className="h-4 w-4" /> : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
