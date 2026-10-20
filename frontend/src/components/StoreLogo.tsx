/** Logo blanco de SuperShop Survey (tablets de encuestas). */
export const SURVEY_ICON = '/survey-icon-192.png';

/**
 * Logo de la tienda; si no subió uno, el logo de SuperShop: el de fondo azul (SuperShop
 * Admin) o, con `app="survey"`, el blanco de las tablets de encuestas.
 */
export default function StoreLogo({
  name,
  logo,
  className = '',
  app = 'admin',
}: {
  name: string;
  logo: string | null;
  className?: string;
  app?: 'admin' | 'survey';
}) {
  return (
    <img
      src={logo || (app === 'survey' ? SURVEY_ICON : '/icon-192.png')}
      alt={logo ? `Logo de ${name}` : 'SuperShop'}
      className={`object-cover ${className}`}
    />
  );
}
