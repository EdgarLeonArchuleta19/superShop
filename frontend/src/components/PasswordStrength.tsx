import { passwordStrength } from '../lib/passwords';

const COLORS = ['bg-red-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-600'];
const TEXT = [
  'text-red-600 dark:text-red-400',
  'text-amber-600 dark:text-amber-400',
  'text-lime-600 dark:text-lime-400',
  'text-emerald-600 dark:text-emerald-400',
];

/** Medidor de seguridad de una contraseña nueva: barra de 4 niveles, si es apta y un consejo. */
export default function PasswordStrength({ password, username }: { password: string; username?: string }) {
  if (!password) return null;
  const s = passwordStrength(password, username);
  return (
    <div className="mt-2 space-y-1.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= s.level ? COLORS[s.level] : 'bg-hairline'}`}
          />
        ))}
      </div>
      <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[12px]">
        <span className={`font-semibold ${TEXT[s.level]}`}>
          Seguridad: {s.label}
        </span>
        <span className={s.valid ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium text-red-600 dark:text-red-400'}>
          {s.valid ? '✓ Apta' : '✗ No apta'}
        </span>
      </p>
      {s.tip && <p className="text-[12px] text-muted">{s.tip}</p>}
    </div>
  );
}
