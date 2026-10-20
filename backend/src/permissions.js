// Catálogo de permisos que se pueden asignar a un rol. Cada clave corresponde a una
// opción del menú (o acción) del frontend: mantener en sincronía con
// frontend/src/lib/permissions.ts.
// "Perfil" no es un permiso: todos los usuarios pueden ver y cambiar su contraseña.
// La gestión de roles tampoco: es exclusiva del rol Administrador.
export const PERMISSIONS = [
  'panel',
  'surveys.stats',
  'surveys.responses',
  'surveys.export',
  'catalog.branches',
  'catalog.registers',
  'catalog.cashiers',
  'settings.users',
  'settings.backups',
  'settings.info',
  'settings.connect',
];

// Las encuestas ya no usan un permiso: las responden las tablets vinculadas (devices.js).
export const DEFAULT_CASHIER_PERMISSIONS = ['panel', 'surveys.stats'];

export function cleanPermissions(value) {
  if (!Array.isArray(value)) return [];
  return PERMISSIONS.filter((p) => value.includes(p));
}

export function parsePermissions(raw) {
  try {
    return cleanPermissions(JSON.parse(raw || '[]'));
  } catch {
    return [];
  }
}
