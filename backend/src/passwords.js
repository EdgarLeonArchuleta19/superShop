// Reglas de contraseñas. Copia en frontend/src/lib/passwords.ts: mantén ambas en sincronía.

export const MIN_PASSWORD_LENGTH = 8;

// Las más usadas (y las de ejemplo de esta app): se adivinan en los primeros intentos.
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234',
  '11223344', 'password', 'password1', 'password123', 'contraseña', 'contrasena', 'contrasena1',
  'qwerty123', 'qwertyuiop', 'asdfghjk', 'abc12345', 'abcd1234', 'a1b2c3d4', '1q2w3e4r',
  'iloveyou', 'teamo123', 'admin123', 'admin1234', 'administrador', 'cajero123', 'supershop',
  'supershop1', 'supershop123', 'tienda123', 'bienvenido', 'bienvenido1', 'welcome1',
]);

/**
 * Devuelve el motivo por el que la contraseña no sirve, o null si es válida.
 * Si se pasa el usuario, la contraseña no puede contenerlo.
 */
export function passwordProblem(password, username = '') {
  const pwd = String(password ?? '');
  if (pwd.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (!/\p{L}/u.test(pwd) || !/\d/.test(pwd)) {
    return 'La contraseña debe combinar letras y números';
  }
  const lower = pwd.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(pwd)) {
    return 'Esa contraseña es muy común; elige otra';
  }
  const user = String(username ?? '').trim().toLowerCase();
  if (user.length >= 3 && lower.includes(user)) {
    return 'La contraseña no puede contener el nombre de usuario';
  }
  return null;
}
