import { storeInitials } from '../lib/format';

/** Logo de la tienda; si no hay, muestra sus iniciales sobre el color de la marca. */
export default function StoreLogo({
  name,
  logo,
  className = '',
  textClassName = 'text-sm',
}: {
  name: string;
  logo: string | null;
  className?: string;
  textClassName?: string;
}) {
  if (logo) {
    return <img src={logo} alt={`Logo de ${name}`} className={`object-cover ${className}`} />;
  }
  return (
    <div
      role="img"
      aria-label={`${name} (sin logo)`}
      className={`grid place-items-center bg-gradient-to-br from-brand-500 to-brand-700 font-bold tracking-tight text-white ${className}`}
    >
      <span className={textClassName}>{storeInitials(name)}</span>
    </div>
  );
}
