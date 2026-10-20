// Reglas de contraseñas. Copia de backend/src/passwords.js (el servidor es quien decide):
// mantén ambas en sincronía.

export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_HINT = `Mínimo ${MIN_PASSWORD_LENGTH} caracteres, con letras y números`;

const COMMON = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234',
  '11223344', 'password', 'password1', 'password123', 'contraseña', 'contrasena', 'contrasena1',
  'qwerty123', 'qwertyuiop', 'asdfghjk', 'abc12345', 'abcd1234', 'a1b2c3d4', '1q2w3e4r',
  'iloveyou', 'teamo123', 'admin123', 'admin1234', 'administrador', 'cajero123', 'supershop',
  'supershop1', 'supershop123', 'tienda123', 'bienvenido', 'bienvenido1', 'welcome1',
]);

/** Motivo por el que la contraseña no sirve, o null si es válida. */
export function passwordProblem(password: string, username = ''): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe combinar letras y números';
  }
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) {
    return 'Esa contraseña es muy común; elige otra';
  }
  const user = username.trim().toLowerCase();
  if (user.length >= 3 && lower.includes(user)) {
    return 'La contraseña no puede contener el nombre de usuario';
  }
  return null;
}

export type StrengthLevel = 0 | 1 | 2 | 3;

export interface PasswordStrength {
  /** 0 Mala · 1 Regular · 2 Buena · 3 Fuerte */
  level: StrengthLevel;
  label: string;
  /** Cumple las reglas: el servidor la acepta. */
  valid: boolean;
  /** Por qué no sirve, o qué la haría más segura. */
  tip: string | null;
}

const LABELS = ['Mala', 'Regular', 'Buena', 'Fuerte'] as const;
const SEQUENCES = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl'];

function hasSequence(lower: string): boolean {
  for (let i = 0; i + 4 <= lower.length; i++) {
    const chunk = lower.slice(i, i + 4);
    if (SEQUENCES.some((s) => s.includes(chunk) || s.split('').reverse().join('').includes(chunk))) return true;
  }
  return false;
}

/**
 * Nivel de seguridad para mostrar mientras se escribe. "Mala" = no cumple las reglas
 * (passwordProblem); a partir de "Regular" el servidor ya la acepta.
 */
export function passwordStrength(password: string, username = ''): PasswordStrength {
  const problem = passwordProblem(password, username);
  if (problem) return { level: 0, label: LABELS[0], valid: false, tip: problem };

  const lower = password.toLowerCase();
  const mixedCase = /\p{Ll}/u.test(password) && /\p{Lu}/u.test(password);
  const symbol = /[^\p{L}\d]/u.test(password);
  let points = 0;
  if (password.length >= 12) points++;
  if (password.length >= 16) points++;
  if (mixedCase) points++;
  if (symbol) points++;
  if (/(.)\1\1/.test(password)) points--;
  if (hasSequence(lower)) points--;

  const level: StrengthLevel = points <= 0 ? 1 : points <= 2 ? 2 : 3;
  const tip =
    level === 3
      ? null
      : password.length < 12
        ? 'Hazla más larga: 12 caracteres o más.'
        : !mixedCase
          ? 'Mezcla mayúsculas y minúsculas.'
          : !symbol
            ? 'Agrega un símbolo, como ! # $ o *.'
            : 'Evita secuencias (1234, abcd) y letras repetidas.';
  return { level, label: LABELS[level], valid: true, tip };
}
