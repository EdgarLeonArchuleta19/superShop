# Changelog — SuperShop

Todas las versiones notables documentadas aquí. Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Sin publicar]

### ✨ Nuevo
- **Notificaciones rediseñadas**: se guardan en el servidor y cada usuario tiene su propio estado de leída o borrada.
  - **Acciones:** marcar como leída o no leída, "Marcar todas", borrar una o todas las leídas y filtrar "No leídas". Tocar una notificación abre la pantalla relacionada.
  - **Contador:** se ve en la campana y en la pestaña del navegador.
  - **Avisos del navegador opcionales** (requieren https o localhost).
  - **Qué avisa el servidor:**
    - Intentos de acceso sospechosos y cuentas o IPs bloqueadas (Administrador).
    - Calificaciones malas del día por cajero(a) (quien ve Respuestas).
    - Respaldos que fallan o se recuperan (quien maneja Respaldos).
  - Se quitaron el mensaje de bienvenida y los avisos de "Cierre de sesión".
- **Medidor de seguridad de contraseña** (Mi perfil y Usuarios): barra de 4 niveles (Mala, Regular, Buena, Fuerte), si es apta según las reglas del servidor y un consejo para mejorarla. En Mi perfil también avisa si la confirmación coincide.
- Respuestas y Estadísticas: el botón "Actualizar" ahora tiene forma de botón (antes se veía como texto suelto).
- Mi encuesta: la pregunta de calificación ahora dice "¿Cómo fue la atención en general?".
- Sin logo propio de la tienda, el kiosko, Ajustes → Información y los reportes PDF muestran el logo de SuperShop en lugar de las iniciales.
- **Roles y permisos configurables** (Ajustes → Roles y permisos, solo Administrador): crear, editar y eliminar roles eligiendo qué opciones del menú ve cada uno. El acceso se valida en la API y los cambios aplican sin volver a iniciar sesión.
- Usuarios: el selector de rol muestra los roles reales; solo el Administrador puede asignar el rol Administrador; siempre debe quedar al menos un administrador activo.
- Login: en móvil se muestran el logo y "Iniciar sesión"; en escritorio el título y el formulario quedan juntos y centrados.
- Google Drive funciona igual en web (`backend/.env`) y en escritorio (`electron/google-oauth.json`); la URL de retorno OAuth se calcula según el origen.
- **Pantalla de Respaldos rediseñada**:
  - Respaldo local y en Google Drive independientes, cada uno con "Respaldar ahora" y programación automática propia (diaria, semanal o mensual, con día y hora, en la zona horaria de la tienda).
  - Muestra cuándo fue el último respaldo, el próximo programado y los errores en lenguaje claro.
  - Lista de respaldos guardados con descargar, restaurar y eliminar; botón "Importar respaldo" con arrastrar y soltar.
  - "Respaldar ahora" pregunta dónde guardar el respaldo (explorador de archivos, con la carpeta por defecto sugerida) y "Ver respaldos locales" abre la carpeta por defecto en la app de escritorio.
  - Elige cuántos respaldos conservar; los antiguos se borran solos (también en Drive).
  - Drive: carpeta "SuperShop Respaldos" automática, muestra la cuenta conectada y permite desconectar.
  - Se quitaron de la pantalla rutas del servidor, nombres de archivos internos e instrucciones técnicas.

- **Vincular dispositivos rediseñada**:
  - Conexión por la red local (recomendada para las computadoras de la tienda): dirección fija con código QR, pasos para conectar otra computadora y crear su acceso directo, y ayuda si no abre.
  - Conexión por internet (túnel de Cloudflare): muestra la dirección solo cuando ya responde, errores en lenguaje claro y opción de activarla al abrir SuperShop.
  - En una instalación web, muestra directamente la dirección pública.
- Usuarios: paginación siempre visible, como en las demás pantallas.
- **HTTPS en la red local**: SuperShop genera sus propios certificados (autoridad de la tienda + certificado del equipo) y los renueva solo si cambia la IP. Vincular dispositivos muestra la dirección https y cómo instalar el certificado en Windows, Android e iPhone. Reemplaza al script `gen-certs.ps1`, que no funcionaba (el servidor buscaba otros nombres de archivo).
- **Versión web (Render + Turso)**: el mismo proyecto se despliega en Render con `render.yaml`; la base de datos vive en Turso (SQLite en la nube). En la web no existen respaldos en carpeta, túnel ni red local; el primer `admin` usa la contraseña de `INITIAL_ADMIN_PASSWORD` y la tienda empieza sin datos de ejemplo. Guía: `docs/DESPLIEGUE-WEB.md`.
- `cloudflared.exe` ya no se guarda en git: `npm run dist:win` lo descarga si falta (`scripts/get-cloudflared.mjs`).
- **Dirección fija con dominio propio** (Cloudflare Tunnel con nombre): se configura una vez en Vincular dispositivos pegando el comando de Cloudflare. Muestra un solo QR con la dirección fija, siempre en línea (arranca con SuperShop, se reconecta sola y revisa cada minuto que la dirección responda) y avisa en lenguaje claro si el token es incorrecto o la ruta en Cloudflare no apunta a SuperShop. La red local queda como respaldo sin internet.
- App de escritorio: al cerrar la ventana sigue funcionando en la bandeja (para no cortar las cajas ni la conexión por internet), opción "Abrir SuperShop al encender esta computadora" y una sola copia abierta a la vez.
- Vincular dispositivos avisa si algún usuario conserva la contraseña de fábrica.
- **Instalar la app desde un QR**: los códigos QR de Vincular dispositivos abren `/instalar`, que guía según el celular. En Android/Chrome muestra el botón "Instalar app"; en iPhone/iPad muestra los pasos ilustrados de Safari (Compartir → Agregar a inicio); si se abrió dentro de WhatsApp, Facebook, etc., pide abrirlo en el navegador. El login en el celular también ofrece "Instalar la app en este celular".
- Íconos de la app regenerados con el logo de SuperShop más grande (antes se veía chico en la pantalla de inicio); ícono "maskable" ajustado a la zona segura de Android.
- Información de la tienda: sin logo se muestran las iniciales de la tienda (también en el kiosko y en el PDF), con vista previa de cómo se verá en los reportes.

### 🐛 Corregido
- **Las encuestas de hoy no aparecían en Encuestas ni en Estadísticas**: el filtro "hasta" mandaba solo la fecha (`2026-10-19`) y se comparaba contra `created_at` en ISO UTC, así que todo ese día quedaba fuera. Ahora el frontend manda el inicio y fin del día en la zona del navegador, y el backend convierte las fechas sueltas al inicio o fin del día.
- **La sesión ya no se cierra sola**: se quitó el cierre por 30 minutos de inactividad del panel y la sesión dura 90 días (`SESSION_TTL_HOURS=2160`), renovándose cada día que se usa. Solo se cierra con "Cerrar sesión", al cambiar la contraseña o tras 90 días sin abrir la app.
- Móvil: los campos ya no hacen zoom al escribir (letra de 16px en pantallas táctiles) y los modales se muestran centrados en lugar de pegados abajo.
- **Las encuestas del kiosko nunca llegaban al servidor**: se enviaban a `/api/surveys/batch`, que no existía (404); tras varios reintentos quedaban como "fallidas" en el dispositivo. Ahora esa ruta existe, el servidor guarda los nombres de tienda/caja/cajero (el kiosko solo manda los ids) y una sesión vencida deja las encuestas en espera en lugar de descartarlas. Las que quedaron como fallidas se pueden reenviar desde el aviso del kiosko.
- App de escritorio compilada: no arrancaba el servidor (buscaba los archivos en `app.asar.unpacked`, pero el build no usa asar).
- Mi encuesta no cargaba tiendas, cajas ni cajeros(as) (error 404): pedía rutas que no existen; ahora usa `/api/catalog/*`, que también quedan disponibles sin conexión.
- Sin logo, Información y el kiosko mostraban una imagen rota (`logo-tienda.jpg` ya no existe), y el PDF seguía usando el logo anterior tras cambiarlo hasta recargar la página.
- Vincular dispositivos: la pantalla se quedaba en "Conectando…" para siempre si el túnel no arrancaba, y no se actualizaba si se abría mientras el túnel iniciaba.
- Crear tiendas, cajas o cajeros(as) fallaba con error 500 (faltaba `created_at`).
- Estadísticas se quedaba en blanco: `/api/admin/stats` y `/api/admin/activity` devolvían un formato distinto al que espera la pantalla.
- Conectar Google Drive fallaba porque no se cargaba `googleapis` antes de generar la URL de autorización.
- Respaldos: los ajustes automáticos no se guardaban ni se aplicaban (la pantalla y el servidor usaban nombres de campos distintos) y los errores de subida a Drive se ocultaban.
- Respaldos: la copia de la base de datos ahora es consistente aunque esté en uso, y restaurar ya no sobrescribe el archivo abierto (antes podía corromperlo).

### 🧹 Limpieza
- Se quitó la migración a Prisma/Supabase, que no se usaba (carpeta `backend/prisma/` y variables `DATABASE_URL`/`DIRECT_URL`).
- Se quitaron la pantalla `AdminSettingsPage`, que no se usaba, y la dependencia `archiver`.

### 🔒 Seguridad
- **Acceso solo con enlace privado** (Ajustes → Vincular dispositivos, solo Administrador):
  - Sin el enlace solo se ve una página de presentación fija de SuperShop (como el panel azul del login); el login, el panel y la API responden "no encontrado".
  - Abrir el enlace (o escanear el QR, que ya lo incluye) autoriza el dispositivo por un año.
  - "Generar enlace nuevo" revoca el anterior.
  - La ventana de escritorio siempre entra, y `ACCESS_GATE_DISABLED=true` lo apaga en caso de emergencia.
  - El kiosko conserva sus encuestas si pierde el acceso y las envía al recuperarlo.
  - Un dispositivo sin el enlace que ya tenía la app guardada (PWA) ya no muestra el login de esa copia: la borra y muestra la página pública.
- **Protección contra fuerza bruta guardada en la base**: 5 contraseñas incorrectas en una cuenta la bloquean 1 minuto, y la espera se duplica con cada fallo extra hasta 15 minutos. Una IP se bloquea a partir de 15 fallos. Los bloqueos sobreviven reinicios del servidor. Si el usuario no existe, la respuesta tarda lo mismo, para no revelar qué usuarios existen.
- **Registro de accesos** (Ajustes → Registro de accesos, solo Administrador): cada intento de inicio de sesión con fecha, IP, país y dispositivo, bloqueos activos con botón para desbloquear, y aviso en la campana con 5 o más fallos en una hora. Se conserva 90 días.
- **Versión web solo por Cloudflare y solo desde México**: con `CF_ORIGIN_SECRET` el servidor rechaza lo que no venga de Cloudflare (la dirección directa de Render deja de funcionar), y con `ALLOWED_COUNTRIES=MX` rechaza otros países y la red Tor. Detrás de Cloudflare, la IP real se toma de `CF-Connecting-IP`. Guía en `docs/DESPLIEGUE-WEB.md` (paso 6).
- **Contraseñas más fuertes**: al crear un usuario o cambiar una contraseña se piden al menos 8 caracteres con letras y números, se rechazan las más comunes (`12345678`, `password1`, `admin123`…) y las que contienen el nombre de usuario. Las contraseñas actuales siguen funcionando.
- Los usuarios de ejemplo (`admin`/`cajero` con contraseña de fábrica) se volvían a crear si se renombraban; ahora solo se crean en la primera instalación.
- Enviar encuestas ahora requiere sesión con acceso a "Mi encuesta" (antes cualquiera podía enviarlas).
- Por el túnel todas las visitas llegaban como "localhost": el límite de intentos de inicio de sesión era uno solo para todos (un atacante podía bloquear a todos). Ahora se usa la IP real que envía Cloudflare.
- El token del túnel no se guarda en los respaldos.
- Se quitaron las credenciales OAuth de Google escritas en `electron/main.cjs`.
- Conexión con Google Drive protegida con `state` (impide vincular una cuenta ajena) y página de retorno sin inyección de HTML.
- Los respaldos ya no incluyen el token de Google Drive ni las sesiones abiertas.

---

## [1.0.0] — 2026-10-19

### ✨ Nuevo
- **Arquitectura Electron + SQLite local** (estilo Eleventa): PC madre con BD, hijas por túnel Cloudflare.
- **Autenticación por usuario** (no email): `admin/admin123`, `cajero/cajero123`.
- **Encuestas kiosko**: rating `good|regular|bad` con caritas, offline-first (SW + outbox), batch sync.
- **Panel admin**: estadísticas (totales, por rating, por tienda/caja/cajero), actividad reciente, catálogos CRUD.
- **Túnel Cloudflare Quick Tunnel** (`trycloudflare.com`) + QR en **Ajustes → Vincular dispositivos**.
- **Backup automático**: local (ZIP semanal/mensual) + Google Drive (OAuth2, carpeta opcional, token refresh).
- **Branding**: SuperShop · ELAN Software · Footer copyright configurable.
- **Instalador NSIS** (`.exe` ~170 MB) con atajos Escritorio/Inicio, desinstalador.
- **PWA instalable** (HTTPS vía túnel), Service Worker con cache de catálogos, headers no-cache para HTML/SW/manifest.

### 🔧 Técnico
- Backend: Express 5, `better-sqlite3` (WAL, FK, busy_timeout), migraciones automáticas en `ensureSeed()`.
- Frontend: React 19, Vite 8, Tailwind CSS 4, React Router 7, `lucide-react` + iconos SVG custom.
- Electron 44, `electron-builder` 26, `asarUnpack` para backend/node_modules, frontend/dist, cloudflared.
- `cloudflared.exe` (52 MB) bundlado en `electron/bin/`, arranque con `ELECTRON_RUN_AS_NODE=1`.
- Polling: Dashboard 10s, Encuestas 12s, botón "Actualizar" manual.
- Sesiones: kiosko persistente (localStorage), admin 30 min idle.

### 🐛 Corregido
- Sintaxis `main.cjs` (funciones `getDataDir`, `startBackend` rotas) → app empaquetada no arrancaba backend.
- `cloudflared` spawn en backend: import dinámico `ZipArchive` de `archiver` (ESM compat).
- Migración columnas backup en tabla `settings` (idempotente, tolerante a BD existente).
- Tray icon resiliente (try/catch) — fallo de imagen no crashea la app.

### ⚠️ Conocidos / Pendientes
- Instalador **sin firma digital** → Windows SmartScreen muestra "Windows protegió su PC" → "Más información" → "Ejecutar de todas formas".
- Certificado OV (~150–300 USD/año) recomendado para distribución masiva.
- Túnel `trycloudflare.com` cambia URL al reiniciar app → mostrar QR nuevo cada mañana.
- OAuth Google Drive requiere `GOOGLE_CLIENT_ID/SECRET` en variables de entorno del build.
- Limpieza de restos Prisma en `backend/node_modules` (hecho: no quedan paquetes de Prisma).

---

## [0.x] — Desarrollo previo (abandonado)

### Migración Prisma → Postgres/Supabase (descartada)
- Rating categórico + caritas, `FaceIcon`, export PDF/Excel, PWA SW, offline outbox.
- Admin idle 30 min, kiosko sin auto-logout, tokens localStorage.
- Abandonada a favor de arquitectura local-first Electron + SQLite para modelo Eleventa.