# AGENTS.md — SuperShop

Guía para agentes de código (Claude Code, Codex, Copilot, etc.) y desarrolladores que trabajen en este repositorio. Todo el código, los textos de la UI y la documentación están en **español**; mantén ese idioma.

## Qué es

SuperShop (ELAN Software) es un sistema de gestión de tiendas. Hoy su módulo principal son las **encuestas de satisfacción** tipo kiosko (rating `good | regular | bad`), con catálogos de tiendas, cajas y cajeros, estadísticas y respaldos.

Se ejecuta de **dos formas** con el mismo backend y el mismo frontend. Cualquier cambio debe funcionar en ambas.

| Modo | Cómo arranca | Configuración |
|------|--------------|---------------|
| **Escritorio** (Electron, Windows) | `electron/main.cjs` lanza el backend como proceso hijo con `ELECTRON_RUN_AS_NODE` y abre `http://localhost:3001` | Variables que inyecta `startBackend()` en `electron/main.cjs` + `electron/google-oauth.json` |
| **Web** (Render + Turso) | `render.yaml`: compila el frontend y ejecuta `node src/index.js`, que sirve la API y el frontend | Variables de Render (ver `docs/DESPLIEGUE-WEB.md`) o `backend/.env` |

Las variables ya definidas en el entorno tienen prioridad sobre `backend/.env`.

## Estructura

```
backend/            API Express (ESM, Node 22+)
  src/env.js        Carga backend/.env. Debe ser el PRIMER import de index.js
  src/index.js      Servidor HTTP/HTTPS, seguridad (helmet, CORS, rate limit), estáticos
  src/db.js         SQLite (better-sqlite3), esquema, migraciones de columnas y seed
  src/backup.js     Respaldos ZIP locales + subida a Google Drive (OAuth2)
  src/tunnel.js     Túnel Cloudflare (cloudflared) para dispositivos remotos
  src/routes/*.js   Rutas montadas bajo /api
frontend/           React + TypeScript + Vite + Tailwind 4 + PWA (vite-plugin-pwa)
  src/app/          App.tsx (rutas) y AdminLayout.tsx
  src/modules/      auth, catalog, kiosk, panel, settings, surveys
  src/lib/          api.ts (cliente HTTP), auth, offline (outbox), settings, toast, tipos
electron/           main.cjs, preload.cjs, bin/cloudflared.exe
docs/               INSTALACION.md, RESPALDOS.md
```

El archivo `main.cjs` de la raíz es una copia vieja e incompleta. El que se usa es `electron/main.cjs` (`"main"` en `package.json`).

## Comandos

```bash
# Backend (puerto 3001)
cd backend && npm install && npm run dev

# Frontend (Vite en :5173 con proxy a :3001)
cd frontend && npm install && npm run dev
cd frontend && npm run typecheck      # tsc --noEmit
cd frontend && npm run build          # typecheck + build a frontend/dist

# Escritorio (desde la raíz)
npm run start                         # Electron en desarrollo
npm run dist:win                      # Build portable en release/
```

No hay suite de tests automatizados. Para validar un cambio: `npm run typecheck` en el frontend, `node --check` en los archivos del backend que tocaste y, si aplica, arrancar la app y probar el flujo.

## Datos

- **Modo nube** (`CLOUD` en `db.js`): se activa con `TURSO_DATABASE_URL`.
  - **Base de datos:** se usa `libsql`, compatible con la API de better-sqlite3, como réplica local que sincroniza con Turso. Para probarlo sin Turso: `TURSO_DATABASE_URL=file:local`.
  - **Lo que no se monta:** respaldos (rutas y programador), túnel, certificados ni red local.
  - **Primer usuario:** solo `admin`, con la contraseña de `INITIAL_ADMIN_PASSWORD`, sin datos de ejemplo.
  - **Frontend:** recibe `settings.cloud` y oculta lo marcado `desktopOnly`.
- Los usuarios iniciales (`admin`/`cajero`) se crean solo cuando la tabla `users` está vacía.

- La base de datos es SQLite: `DATA_DIR/nallely.db`. `DATA_DIR` vale por defecto `%APPDATA%\SuperShop\data`, o `backend/data` si no hay `APPDATA`.
- El esquema vive en `backend/src/db.js`. Las columnas nuevas se agregan a la lista de migraciones de columnas de ese archivo.
- Usuarios semilla: `admin / admin123`, `cajero / cajero123`.

## Convenciones

- Backend: ESM (`import`), SQL con `db.prepare(...)` y parámetros `?`, nunca interpolando valores. Errores al cliente como `{ error: mensaje }`.
- Permisos: ver la sección "Roles y permisos". Protege las rutas con `requirePermission('clave')`, `requireAdmin` o `requireAuth()` de `middleware.js`, no con `requireAuth('admin')`.
- Dependencias pesadas u opcionales (`googleapis`, `archiver`) se cargan con `import()` dinámico (ver `loadDeps()` en `backup.js`). Llama a `loadDeps()` antes de usarlas.
- Frontend: componentes funcionales con TypeScript, clases de Tailwind y los componentes de `src/components`. Las llamadas al backend van por `api()` de `src/lib/api.ts`. Los avisos al usuario se muestran con `toast`.
- Contraseñas: valida con `passwordProblem()` de `backend/src/passwords.js`; su copia en `frontend/src/lib/passwords.ts` debe tener las mismas reglas.
- Notificaciones: créalas en el servidor con `notify()` de `backend/src/notifications.js`.
  - `audience`: `'admin'`, una clave de permiso o `null` para todos.
  - `dedupeKey`: agrupa avisos repetidos en uno que se actualiza.
  - `notify()` nunca lanza error. El frontend las consulta con `useNotifications()` de `src/lib/notifications.ts`.
- El kiosko es offline-first: las encuestas van a un outbox local y se sincronizan por lotes en `/api/surveys/batch`. No rompas ese flujo.
- Registra los cambios relevantes en `CHANGELOG.md` (formato Keep a Changelog).

## Roles y permisos

- Los roles viven en la tabla `roles` y los usuarios se ligan por `users.role_id`. Cada rol tiene una lista JSON de permisos.
- Hay dos roles de sistema: **Administrador** (`is_admin = 1`, acceso total, no se puede editar ni borrar) y **Cajero(a)** (se puede editar, no borrar).
- `users.role` y `sessions.role` se conservan como nivel heredado: `'admin'` solo para el rol Administrador y `'cashier'` para cualquier otro. No los uses para decidir accesos.
- Catálogo de permisos: `backend/src/permissions.js` (validación) y `frontend/src/lib/permissions.ts` (etiquetas, rutas y `can()`). **Mantén ambos en sincronía** al agregar una pantalla:
  1. Agrega la clave en ambos archivos.
  2. Protege los endpoints con `requirePermission('clave')`.
  3. Envuelve la ruta en `App.tsx` con `<PermGate perm="clave">`.
  4. Pon `perm: 'clave'` en el `MENU` de `AdminLayout.tsx`.
- El backend relee los permisos del usuario en cada petición, así que los cambios a un rol aplican sin volver a iniciar sesión. El frontend los refresca con `/api/auth/me` al navegar.
- La gestión de roles (`/api/admin/roles`) es exclusiva del Administrador. Quien tenga `settings.users` puede asignar roles, pero no el de Administrador.

## Tablets de encuestas (SuperShop Survey)

- Las encuestas se responden en tablets vinculadas por QR, sin usuario. No hay permiso de kiosko ni "Mi encuesta" en el menú.
- **Backend:** `backend/src/devices.js` (tokens y middlewares) y `routes/devices.js`.
  - **Tablas:** `devices` guarda solo el hash del token; `device_pairings` guarda los códigos del QR (un solo uso, 5 minutos).
  - **Token:** la tablet lo manda en `X-Device-Token`. Solo sirve para `/api/surveys/batch` y `/api/device/heartbeat`.
  - **Tienda y caja:** en `saveBatch` se toman de la tablet, no del envío.
  - **Envío de encuestas:** `requireSurveySender` acepta una tablet o cualquier sesión de usuario (para vaciar outbox viejos).
- **Frontend:**
  - **Rutas:** `/encuestas` (`KioskPage`) y `/encuestas/vincular?codigo=` (`PairPage`); el estado vive en `lib/device.ts`.
  - **Panel:** `modules/settings/DevicesSection.tsx` tiene el QR (`SurveyPairingCard`, en Vincular dispositivos) y el modal `EditKioskModal`. La lista de tablets está en la tabla de dispositivos de `AccessLogPage.tsx` (`/api/admin/access-log/online`).
  - **Manifiesto:** las pantallas de encuestas cambian el manifiesto a `encuestas.webmanifest`.
- `accessGate` deja pasar a una tablet con token válido y le renueva la cookie `ss_acceso`.
- `checkDevices()` (cada 10 min, `startDeviceWatch()` en `index.js`) avisa con `notify()` de encuestas atoradas (`pending_since` > 1 h) y de tablets sin latido por 24 h. La desconexión se cuenta desde que arrancó el servidor.
- **Marca:** "SuperShop" usa los `icon-*.png` (fondo azul) y "SuperShop Survey" los `survey-*.png` (logo blanco). En las pantallas de la tablet usa `<StoreLogo app="survey">`.
- Las sesiones guardan `ip`, `user_agent` y `last_seen_at` (se escribe como máximo cada 5 minutos) para "Conectados ahora" en Registro de accesos (`/api/admin/access-log/online`).

## Red local y HTTPS

- El servidor escucha en `PORT` (http, 3001) y en `HTTPS_PORT` (https, 3443). Para desactivar HTTPS se usa `LOCAL_HTTPS=false`.
- `backend/src/certs.js` crea al arrancar una autoridad certificadora propia de la instalación (10 años) y un certificado de servidor (397 días) para `localhost`, el nombre del equipo y sus IPs de red local (`network.js`). Todo se guarda en `DATA_DIR/certs/`.
- Si cambia la IP o el certificado está por vencer, se renueva solo, sin reiniciar, con `setSecureContext`. La autoridad no cambia, así que los dispositivos que ya la instalaron siguen confiando.
- `GET /api/certificado-supershop.crt` entrega el certificado público de la autoridad para instalarlo en otros dispositivos. `ca.key` nunca sale del equipo ni entra en los respaldos.
- HSTS está desactivado en helmet a propósito: la app se sirve por http y https a la vez.

## Conexión por internet (Cloudflare Tunnel)

- `backend/src/tunnel.js` maneja dos modos:
  - **fijo**: túnel con nombre de la cuenta de Cloudflare de la tienda; se usa `cloudflared tunnel run` con `TUNNEL_TOKEN` en el entorno, nunca en los argumentos.
  - **temporal**: `trycloudflare.com`. Ya no tiene pantalla ni se inicia sola al arrancar.
- Vincular dispositivos no configura túneles. Los QR (SuperShop y Survey) los resuelve `useQrTarget` en `DevicesSection.tsx`:
  - **Web (`settings.cloud`):** el dominio fijo `PUBLIC_URL` de `frontend/src/lib/domain.ts` (`https://app.supershop-mx.com`).
  - **Escritorio:** la IP http de la computadora en la red local.
- El túnel fijo arranca siempre con el servidor y se relanza solo si se cae, esperando entre 5 y 60 segundos. Deja de reintentar si Cloudflare no reconoce el túnel ("Failed to get tunnel").
- La dirección pública y el token se guardan en `settings` (`tunnel_mode`, `tunnel_token`, `tunnel_hostname`). El token nunca se devuelve a la pantalla y se borra de los respaldos.
- La ruta en Cloudflare debe apuntar a `http://localhost:<PORT>`.
- `trust proxy` vale `loopback` por defecto, para leer la IP real que manda `cloudflared` (límite de intentos de inicio de sesión) y que la conexión fue https.
- App de escritorio: cerrar la ventana la deja en la bandeja, sin apagar el servidor ni el túnel; "Salir" la apaga. Puede abrir sola al iniciar Windows (`--hidden`) y no permite dos copias abiertas.

## Protección del inicio de sesión y del acceso web

- `backend/src/security.js` concentra estas reglas:
  - **Inicio de sesión:** los intentos fallidos van a `login_failures` (por cuenta e IP, con bloqueo creciente) y cada intento queda en `login_log`. La pantalla es `/app/ajustes/accesos`, solo para el Administrador: muestra los dispositivos (sesiones activas y tablets) y el historial en "Ver historial completo".
  - **Acceso web:** `originGuard` rechaza lo que no traiga `CF_ORIGIN_SECRET` y aplica `ALLOWED_COUNTRIES`. Sin esas variables no hace nada, así que el escritorio y la red local no se ven afectados.
- `backend/src/accessGate.js` maneja el acceso solo con enlace privado:
  - **Configuración:** se activa en `settings.access_gate` y la clave vive en `settings.access_key`; se maneja desde Vincular dispositivos, solo el Administrador.
  - **Sin la cookie `ss_acceso`:** la API responde 404 y el resto muestra la página pública.
  - **Siempre pasan:** `/api/health` y la ventana local de escritorio (loopback sin encabezados de proxy).
  - **QR y direcciones:** las de `ConnectPage.tsx` agregan `?acceso=` con `withAccess()`.
- Usa `clientIp(req)` para obtener la IP del visitante, no `req.ip`. Detrás de Cloudflare la IP real viene en `CF-Connecting-IP`.

## Secretos y credenciales

- **Nunca** escribas credenciales en el código ni las subas a git.
- Google Drive: necesita `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` de un cliente OAuth tipo "Aplicación web".
  - Web: en `backend/.env` (plantilla en `backend/.env.example`).
  - Escritorio: en `electron/google-oauth.json` (plantilla en `electron/google-oauth.example.json`). Este archivo se empaqueta en el build.
  - `GOOGLE_REDIRECT_URI` es opcional. Si no se define, se arma con el origen de la petición más `/api/admin/backup/oauth2callback`. En escritorio se fija en `http://localhost:3001/...`. Cada URI usada debe estar registrada en Google Cloud Console.
  - Detrás de un proxy HTTPS usa `TRUST_PROXY=true` para que el callback salga como `https://`.
- Ignorados por git: `.env`, `electron/google-oauth.json`, `backend/data/`, `backend/certs/` y `release*/`. Los builds de `release*/` llevan las credenciales dentro, así que no los publiques en un repositorio.

## Documentación relacionada

- `README.md`: visión general, instalación y variables de entorno.
- `docs/INSTALACION.md`: instalación paso a paso.
- `docs/RESPALDOS.md`: respaldos locales, Google Drive y restauración.
