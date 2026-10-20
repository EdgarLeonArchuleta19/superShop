import type { AuthUser } from './types';

// Opciones que un rol puede tener. Las claves deben coincidir con
// backend/src/permissions.js, que es quien realmente valida el acceso.
export interface PermissionDef {
  key: string;
  label: string;
  description: string;
  /** Pantalla a la que da acceso; las acciones (p. ej. exportar) no tienen ruta. */
  path?: string;
}

export interface PermissionGroup {
  label: string;
  items: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: 'General',
    items: [
      { key: 'panel', label: 'Panel de control', description: 'Pantalla de inicio con accesos rápidos.', path: '/app' },
    ],
  },
  {
    label: 'Encuestas',
    items: [
      { key: 'surveys.stats', label: 'Estadísticas', description: 'Gráficas y resultados de satisfacción.', path: '/app/encuestas/estadisticas' },
      { key: 'surveys.responses', label: 'Respuestas', description: 'Ver cada encuesta recibida.', path: '/app/encuestas/respuestas' },
      { key: 'surveys.export', label: 'Exportar resultados', description: 'Descargar estadísticas en Excel y PDF.' },
    ],
  },
  {
    label: 'Catálogos',
    items: [
      { key: 'catalog.branches', label: 'Tiendas', description: 'Crear, editar y desactivar tiendas.', path: '/app/catalogos/tiendas' },
      { key: 'catalog.registers', label: 'Cajas', description: 'Crear, editar y desactivar cajas.', path: '/app/catalogos/cajas' },
      { key: 'catalog.cashiers', label: 'Cajeros(as)', description: 'Crear, editar y desactivar cajeros(as).', path: '/app/catalogos/cajeros' },
    ],
  },
  {
    label: 'Ajustes',
    items: [
      { key: 'settings.users', label: 'Usuarios', description: 'Crear cuentas y asignarles un rol (excepto Administrador).', path: '/app/ajustes/usuarios' },
      { key: 'settings.connect', label: 'Vincular dispositivos', description: 'Vincular tablets de encuestas, códigos QR y conexión de otros dispositivos.', path: '/app/ajustes/conectar' },
      { key: 'settings.backups', label: 'Respaldos e Importaciones', description: 'Respaldos locales, Google Drive e importación.', path: '/app/ajustes/respaldos' },
      { key: 'settings.info', label: 'Información', description: 'Nombre y logo de la tienda.', path: '/app/ajustes/informacion' },
    ],
  },
];

export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((p) => [p.key, p.label]))
);

/** ¿El usuario tiene acceso a `perm`? Sin `perm` = abierto a todos. `'admin'` = solo Administrador. */
export function can(user: AuthUser | null, perm?: string): boolean {
  if (!user) return false;
  if (!perm) return true;
  if (user.is_admin) return true;
  if (perm === 'admin') return false;
  return user.permissions.includes(perm);
}

/** Primera pantalla del panel a la que el usuario tiene acceso (Perfil siempre está disponible). */
export function homePath(user: AuthUser | null): string {
  if (can(user, 'panel')) return '/app';
  for (const group of PERMISSION_GROUPS) {
    for (const p of group.items) {
      if (p.path && p.path.startsWith('/app') && can(user, p.key)) return p.path;
    }
  }
  return '/app/ajustes/perfil';
}
