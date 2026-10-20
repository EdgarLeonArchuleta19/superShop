/** Logo de la tienda; si no subió uno, el logo de SuperShop. */
export default function StoreLogo({
  name,
  logo,
  className = '',
}: {
  name: string;
  logo: string | null;
  className?: string;
}) {
  return (
    <img
      src={logo || '/icon-192.png'}
      alt={logo ? `Logo de ${name}` : 'SuperShop'}
      className={`object-cover ${className}`}
    />
  );
}
