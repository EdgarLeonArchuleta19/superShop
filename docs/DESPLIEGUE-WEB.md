# Versión web de SuperShop (Render + Turso + dominio en Cloudflare)

La versión web es el mismo proyecto que la app de escritorio:
- **Render** ejecuta el backend, que compila y sirve también el frontend.
- **Turso** guarda la base de datos (SQLite en la nube).
- **Cloudflare** apunta el dominio (por ejemplo `app.supershop-mx.com`) a Render.

La configuración de Render está en [`render.yaml`](../render.yaml). Cada `git push` a `main` vuelve a desplegar.

En la versión web no existen los respaldos en carpeta, Google Drive, el túnel ni la red local: Turso guarda su propio historial. Las encuestas del kiosko siguen funcionando sin internet; se guardan en el dispositivo y se envían al volver la conexión.

---

## 1. Turso (base de datos)

1. Entra a [turso.tech](https://turso.tech) y crea una cuenta (puedes usar tu GitHub). El plan gratis es suficiente.
2. Crea una base de datos llamada `supershop`. Como región elige **AWS US East (Virginia)**, la misma que Render.
3. Copia la **URL** de la base (empieza con `libsql://…turso.io`).
4. Genera un **token** con permisos de lectura y escritura y sin vencimiento. Cópialo: es una contraseña, no lo compartas.

## 2. Render (servidor)

1. Entra a [render.com](https://render.com) con tu cuenta de GitHub.
2. Pulsa **New → Blueprint** y elige el repositorio `superShop`. Render lee `render.yaml` solo.
3. Te pedirá tres valores:

   | Variable | Valor |
   |---|---|
   | `TURSO_DATABASE_URL` | La URL de Turso (`libsql://…`) |
   | `TURSO_AUTH_TOKEN` | El token de Turso |
   | `INITIAL_ADMIN_PASSWORD` | La contraseña del usuario `admin` (mínimo 8 caracteres). Solo se usa la primera vez |

4. Pulsa **Apply**. La primera compilación tarda unos 5 minutos.
5. Abre la dirección que te da Render (`https://supershop-xxxx.onrender.com`) e inicia sesión con `admin` y la contraseña que pusiste.

Si no pusiste `INITIAL_ADMIN_PASSWORD`, el servidor genera una contraseña temporal y la muestra una sola vez en **Logs** de Render (`[Inicio] Usuario "admin" creado con contraseña temporal…`).

## 3. Tu dominio (Cloudflare)

1. En Render, abre el servicio `supershop`, ve a **Settings → Custom Domains → Add** y escribe `app.supershop-mx.com`. Render te muestra un destino como `supershop-xxxx.onrender.com`.
2. En [dash.cloudflare.com](https://dash.cloudflare.com), abre `supershop-mx.com`, ve a **DNS → Records → Add record** y llénalo así:
   - Type: `CNAME`
   - Name: `app`
   - Target: el destino que dio Render
   - Proxy status: **DNS only** (nube gris)
3. Vuelve a Render y pulsa **Verify**. En unos minutos Render emite el certificado https solo.

> Si después quieres conectar también la app de escritorio por túnel, usa otro subdominio (por ejemplo `pc.supershop-mx.com`), porque `app` ya apunta a Render.

## 4. Que no se duerma (plan gratis)

El plan gratis de Render se apaga tras 15 minutos sin visitas y tarda 30–60 s en despertar.

1. Crea una cuenta gratis en [uptimerobot.com](https://uptimerobot.com).
2. Agrega un monitor **HTTP(s)** a `https://app.supershop-mx.com/api/health`, cada 5 minutos.

Así se mantiene despierto y además te avisa por correo si la página se cae. Para uso comercial en serio, el plan **Starter** de Render (~7 USD/mes) no se duerme y no requiere esto.

## 5. Primeros pasos en la versión web

1. **Ajustes → Información**: nombre y logo de la tienda.
2. **Catálogos**: crea tiendas, cajas y cajeros(as). La versión web empieza vacía, sin datos de ejemplo.
3. **Ajustes → Roles y permisos** y **Usuarios**: crea las cuentas de cada persona.
4. **Ajustes → Vincular dispositivos**: muestra el QR para instalar la app en los celulares.

## Problemas comunes

| Síntoma | Qué revisar |
|---|---|
| La compilación falla en Render | **Logs** del despliegue; suele ser una variable faltante |
| "Application failed to respond" | Que `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` sean correctos (en Logs aparece el error de Turso) |
| El dominio no abre | Que el CNAME en Cloudflare esté en **DNS only** y que en Render diga *Verified* |
| La primera visita tarda | El servicio estaba dormido: configura UptimeRobot (paso 4) |
