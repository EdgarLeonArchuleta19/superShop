import { Link } from 'react-router-dom';
import {
  ChartColumnBig,
  MessageSquareText,
  Store,
  Settings,
  ShoppingCart,
  Package,
  Users,
  FileText,
  CalendarClock,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useSettings } from '../../lib/settings';

interface QuickCard {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tint: string;
  perm: string;
}

const QUICK: QuickCard[] = [
  {
    to: '/app/encuestas/estadisticas',
    label: 'Encuestas',
    description: 'Consulta resultados y estadísticas de satisfacción.',
    icon: ChartColumnBig,
    tint: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
    perm: 'surveys.stats',
  },
  {
    to: '/app/encuestas/respuestas',
    label: 'Respuestas',
    description: 'Explora cada encuesta recibida y sus detalles.',
    icon: MessageSquareText,
    tint: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    perm: 'surveys.responses',
  },
  {
    to: '/app/catalogos/tiendas',
    label: 'Catálogos',
    description: 'Administra tiendas, cajas y cajeros(as).',
    icon: Store,
    tint: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    perm: 'catalog.branches',
  },
  {
    to: '/app/ajustes/informacion',
    label: 'Ajustes',
    description: 'Configura la identidad y la información de la tienda.',
    icon: Settings,
    tint: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    perm: 'settings.info',
  },
];

const SOON: { label: string; description: string; icon: LucideIcon }[] = [
  { label: 'Ventas', description: 'Registro y corte de ventas por caja.', icon: ShoppingCart },
  { label: 'Inventario', description: 'Control de existencias y proveedores.', icon: Package },
  { label: 'Clientes', description: 'Directorio y programa de lealtad.', icon: Users },
  { label: 'Reportes', description: 'Reportes generales y exportables.', icon: FileText },
  { label: 'Personal', description: 'Horarios y asistencia.', icon: CalendarClock },
  { label: 'Recordatorios', description: 'Avisos y pendientes.', icon: ListChecks },
];

export default function PanelPage() {
  const { user, can } = useAuth();
  const { settings } = useSettings();
  const quick = QUICK.filter((c) => can(c.perm));

  return (
    <div className="space-y-6">
      <div className="animate-fade-in">
        <h1 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">
          Hola {user?.name || 'de nuevo'}
        </h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {user?.role_name} · {settings.store_name}
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Accesos rápidos</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quick.map((mod) => (
            <Link key={mod.to} to={mod.to} className="card group flex items-start gap-3.5 p-5 transition hover:shadow-pop">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition-transform duration-200 group-hover:scale-110 ${mod.tint}`}>
                <mod.icon className="h-[22px] w-[22px]" strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-ink">{mod.label}</span>
                <span className="mt-0.5 block text-[12px] text-muted">{mod.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight">Próximamente</h2>
          <span className="rounded-full bg-faint px-2.5 py-0.5 text-[11px] font-semibold text-muted">
            En desarrollo
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SOON.map((mod) => (
            <div
              key={mod.label}
              className="flex items-start gap-3 rounded-2xl border border-dashed border-line bg-surface/50 p-4"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-faint text-muted">
                <mod.icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink/80">{mod.label}</span>
                <span className="mt-0.5 block text-[12px] text-muted">{mod.description}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
