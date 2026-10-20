# SuperShop — Sistema de Administración de Tiendas

**SuperShop** es una aplicación de escritorio para Windows que permite gestionar la administración de tiendas físicas.

## Características principales

| Área | Detalle |
|------|---------|
| **Arquitectura** | Electron + Express + SQLite (`better-sqlite3`) + React (PWA) |
| **Base de datos** | Local en `%APPDATA%\SuperShop\data\nallely.db` (WAL, FK, busy_timeout) |
| **Acceso remoto** | Túnel Cloudflare Quick Tunnel (`trycloudflare.com`) con QR |
| **Autenticación** | Usuario/contraseña (roles: `admin`, `cashier`) · Sesiones 24 h · Admin idle 30 min |
| **Encuestas** | Rating `good|regular|bad` · Offline-first (Service Worker + outbox) · Batch sync |
| **Catálogos** | Tiendas, Cajas, Cajeros(as) — CRUD completo (solo admin) |
| **Estadísticas** | Panel con totales, por rating, por tienda/caja/cajero, actividad reciente |
| **Backup** | Local (ZIP automático semanal/mensual) + Google Drive (OAuth2, carpeta opcional) |
| **Branding** | SuperShop · ELAN Software · Footer copyright configurable |
| **Instalador** | NSIS (`.exe` ~170 MB) — sin firma (SmartScreen: "Ejecutar de todas formas") |

---

## Requisitos

- Windows 10/11 (x64)
- Conexión a internet (para túnel Cloudflare y backup Drive)
- Permisos de administrador **solo para instalar** (el NSIS escribe en `Program Files`)

---

## Instalación rápida

1. Descarga `SuperShop-Setup-1.0.0.exe` (desde releases o build local).
2. Ejecuta el instalador → Siguiente → Siguiente → Instalar.
3. Al finalizar, marca "Ejecutar SuperShop" y Finalizar.
4. La app abre en `http://localhost:3001`.
5. Inicia sesión: **admin / admin123** (o **cajero / cajero123**).
6. Ve a **Ajustes → Vincular dispositivos** → **Iniciar túnel** → escanea el QR con la tablet.

---

## Uso diario (PC madre)

1. Abre SuperShop (acceso directo en Escritorio / Menú Inicio).
2. Si el túnel no está activo: **Ajustes → Vincular dispositivos → Iniciar túnel**.
3. Tablets de encuestas: en **Vincular dispositivos → SuperShop Survey** elige tienda y caja, genera el QR y escanéalo con la tablet. Queda lista, sin usuario ni contraseña.
4. Equipos de administración (supervisores): escanean el QR de **SuperShop** e inician sesión.
5. Revisa respuestas en **Encuestas → Respuestas** y gráficas en **Estadísticas**.
6. Gestiona catálogos en **Catálogos** (solo admin).
7. Configura backups en **Ajustes → Administrador → Respaldo automático**.

---

## Uso en tablets de encuestas

1. Escanea el QR de **SuperShop Survey** con la cámara de la tablet (vence en 5 minutos y sirve una sola vez).
2. La tablet se vincula sola y abre las encuestas de su caja. Para tenerla a pantalla completa, agrégala a la pantalla de inicio ("SuperShop Survey").
3. La tablet arranca directo en la encuesta de su caja (no se elige cajero(a)).
4. Funciona offline: si hay cortes de red, las respuestas se guardan y sincronizan al volver.
5. Para retirarla o cambiarla de caja: **Ajustes → Registro de accesos** (Editar o Desvincular en la fila de la tablet).

---

## Backup y restauración

### Backup local (automático)
- Carpeta: `%APPDATA%\SuperShop\data\backups\`
- Formato: `supershop-backup-<timestamp>.zip` (contiene `nallely.db` + `data.json`)
- Frecuencia: semanal (lunes 03:00) o mensual (día 1 03:00), configurable.

### Backup a Google Drive (opcional)
1. En **Ajustes → Administrador → Respaldo automático** → activa "Subir a Google Drive".
2. Pulsa **Conectar Google Drive** → autoriza con tu cuenta.
3. (Opcional) Pon el **ID de carpeta** de Drive donde guardar (vacío = raíz "Mi unidad").
4. Los backups suben automáticos + botón "Ejecutar backup ahora".

### Restaurar manual
1. Detén la app (Salir del tray).
2. Copia `nallely.db` desde un ZIP de backup a `%APPDATA%\SuperShop\data\` (sobrescribe).
3. Vuelve a abrir SuperShop.

---

## Estructura de carpetas (runtime)

```
%APPDATA%\SuperShop\
├── data\
│   ├── nallely.db          # Base de datos SQLite (WAL + SHM)
│   └── backups\            # ZIPs de backup local
└── logs\                   # (opcional) logs de la app
```

---

## Variables de entorno (avanzado)

| Variable | Por defecto | Uso |
|----------|-------------|-----|
| `DATA_DIR` | `%APPDATA%\SuperShop\data` | Ubicación de la BD y backups |
| `PORT` | `3001` | Puerto HTTP del backend |
| `FRONTEND_DIST` | `<app>/resources/app.asar.unpacked/frontend/dist` | Carpeta del build React |
| `CLOUDFLARED_PATH` | `<app>/resources/app.asar.unpacked/electron/bin/cloudflared.exe` | Binario cloudflared |
| `GOOGLE_CLIENT_ID` | — | OAuth Drive. Web: `backend/.env`. Escritorio: `electron/google-oauth.json` (no versionado) |
| `GOOGLE_CLIENT_SECRET` | — | OAuth Drive (mismas fuentes que el anterior) |
| `GOOGLE_REDIRECT_URI` | `<origen de la petición>/api/admin/backup/oauth2callback` (escritorio: `http://localhost:3001/...`) | Callback OAuth; debe estar registrado en Google Cloud |
| `HTTPS_PORT` | `3443` | Puerto HTTPS de la red local (certificados propios, ver Vincular dispositivos) |
| `LOCAL_HTTPS` | `true` | `false` desactiva el HTTPS de la red local (p. ej. en un servidor web detrás de un proxy) |
| `CLOUDFLARED_PATH` | `<app>/…/electron/bin/cloudflared.exe` | Binario del túnel para la conexión por internet |
| `TRUST_PROXY` | `false` | `true` detrás de un proxy HTTPS (necesario para que el callback sea `https://`) |
| `SESSION_TTL_HOURS` | `2160` (90 días) | Horas que dura una sesión sin usarse; cada día de uso la renueva |
| `CF_ORIGIN_SECRET` | — | Versión web: solo acepta tráfico que traiga esta clave en `X-SuperShop-Origin` (la agrega Cloudflare). Ver `docs/DESPLIEGUE-WEB.md` |
| `ACCESS_GATE_DISABLED` | — | `true` apaga el acceso con enlace privado (emergencia, si se perdió el enlace) |
| `ALLOWED_COUNTRIES` | — | Países permitidos según Cloudflare, p. ej. `MX` o `MX,US`. Solo se aplica junto con `CF_ORIGIN_SECRET` |

---

## Desarrollo

```bash
# Backend
cd backend
npm install
npm run dev          # node --watch src/index.js

# Frontend
cd frontend
npm install
npm run dev          # Vite en :5173 (proxy a :3001)

# Electron (dev)
npm run start        # Desde raíz: electron electron/main.cjs

# Build producción
cd frontend && npm run build
cd .. && npm run dist:win   # Genera release/SuperShop-Setup-1.0.0.exe
```

---

## Créditos

**SuperShop** — Desarrollado por **ELAN Software**  
© 2026 SuperShop · Todos los derechos reservados.

---

## Licencia

Uso interno / comercial según acuerdo con ELAN Software. No redistribuir sin autorización.