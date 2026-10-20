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
   - Proxy status: **DNS only** (nube gris). Se cambia a Proxied en el paso 6, cuando Render ya emitió el certificado.
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

## 6. Seguridad: solo México y solo por Cloudflare

Al terminar este paso:
- Todo el tráfico pasa por el firewall de Cloudflare.
- Lo que no venga de México se bloquea antes de llegar a la app.
- La dirección directa `supershop-xxxx.onrender.com` deja de funcionar, para que nadie se salte el firewall.

Hazlo **en este orden**: si pones la clave en Render antes de que Cloudflare la envíe, la página dejará de abrir (se arregla borrando la variable `CF_ORIGIN_SECRET` en Render).

### 6.1 Pasar el dominio por Cloudflare

1. Revisa que en Render el dominio diga **Verified** y tenga certificado (paso 3).
2. En Cloudflare, **SSL/TLS → Overview**: elige **Full (strict)**.
3. En **DNS → Records**, edita el CNAME `app` y cambia Proxy status a **Proxied** (nube naranja).
4. Abre `https://app.supershop-mx.com`: debe cargar igual que antes.

### 6.2 La clave secreta entre Cloudflare y Render

1. Genera una clave al azar (en cualquier computadora con Node):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
   Guárdala en un lugar seguro. Es una contraseña: no la compartas ni la subas a git.
2. En Cloudflare, **Rules → Transform Rules → Modify Request Header → Create rule**:
   - Nombre: `Clave SuperShop`
   - Si: **Custom filter expression** → Hostname equals `app.supershop-mx.com`
   - Entonces: **Set static** · Header name `X-SuperShop-Origin` · Value: la clave
   - **Deploy**.
3. En Render, servicio `supershop` → **Environment**, agrega:

   | Variable | Valor |
   |---|---|
   | `CF_ORIGIN_SECRET` | La misma clave |
   | `ALLOWED_COUNTRIES` | `MX` (si después necesitas más países: `MX,US`) |

   Guarda; Render se reinicia solo.
4. Comprueba:
   - `https://app.supershop-mx.com` abre normal.
   - `https://supershop-xxxx.onrender.com` responde **"Acceso no permitido."**

`/api/health` siempre responde (Render y UptimeRobot lo usan), pero no muestra ningún dato.

### 6.3 Bloquear otros países en Cloudflare

Es el filtro principal: lo de fuera ni siquiera llega a Render. `ALLOWED_COUNTRIES` es solo un respaldo por si esta regla se borra.

1. **Security → WAF → Custom rules → Create rule**:
   - Nombre: `Solo México`
   - **Edit expression** y pega:
     ```
     (ip.src.country ne "MX" and http.request.uri.path ne "/api/health")
     ```
     La excepción de `/api/health` es para que UptimeRobot (que revisa desde otros países) siga funcionando.
   - Acción: **Block** → **Deploy**.
2. **Security → WAF → Rate limiting rules → Create rule** (el plan gratis permite una):
   - Nombre: `Login`
   - Expresión:
     ```
     (http.request.uri.path eq "/api/auth/login" and http.request.method eq "POST")
     ```
   - Misma IP · **5 solicitudes cada 10 segundos** · Acción **Block** por 10 segundos → **Deploy**.
3. Opcional: **Security → Bots → Bot Fight Mode**: activado. Si UptimeRobot empieza a marcar la página como caída, desactívalo.

> **Si te atacan:** en **Overview**, activa **Under Attack Mode**. Cloudflare revisa a cada visitante antes de dejarlo pasar. Los celulares del kiosko pueden tardar en reconectar mientras esté activo; apágalo cuando pase.
>
> **Si viajas fuera de México:** agrega el país en la regla de 6.3 y en `ALLOWED_COUNTRIES`, o no podrás entrar.

### 6.4 Protección dentro de la app (ya viene activada)

- **Intentos fallidos:**
  - 5 claves incorrectas en una misma cuenta la bloquean 1 minuto. Cada fallo extra duplica la espera, hasta 15 minutos.
  - Una misma IP se bloquea a partir de 15 fallos.
  - Los bloqueos se guardan en la base, así que no se borran si Render reinicia.
- **Ajustes → Registro de accesos** (solo Administrador):
  - Cada intento de inicio de sesión, con fecha, IP, país y dispositivo.
  - Los bloqueos activos, con botón para desbloquear.
- **Aviso en el panel:** con 5 o más intentos fallidos en una hora, la campana muestra "Intentos de acceso sospechosos".

### 6.5 Acceso solo con enlace privado (opcional, recomendado)

Con esto, quien entre a `app.supershop-mx.com` sin el enlace solo ve una página de presentación fija de SuperShop (la misma del panel azul del inicio de sesión). El inicio de sesión, el panel y la API responden "no encontrado", así que no tiene dónde probar contraseñas.

1. Entra como **Administrador** a **Ajustes → Vincular dispositivos**.
2. En **Acceso solo con enlace privado**, activa el interruptor.
3. Copia el enlace privado (`https://app.supershop-mx.com/?acceso=…`) y guárdalo en un lugar seguro.
4. En cada celular, tablet o computadora del personal, abre el enlace o escanea el QR de esa misma pantalla, que ya lo incluye. Basta una vez: el dispositivo queda autorizado por un año.

- **Si el enlace llegó a quien no debía:** pulsa **Generar enlace nuevo**. El anterior deja de servir y todos los dispositivos, menos el tuyo, tendrán que abrir el nuevo.
- **iPhone con la app instalada en la pantalla de inicio:** si al abrirla aparece la página pública, abre el enlace privado en Safari, borra la app de la pantalla de inicio y vuelve a instalarla desde ahí.
- **Si pierdes el enlace y no puedes entrar:**
  1. En Render agrega la variable `ACCESS_GATE_DISABLED=true` y guarda. La protección se apaga.
  2. Entra a la app, copia el enlace y borra la variable.
  - En la app de escritorio no hace falta: la ventana de la propia computadora siempre entra.

## Problemas comunes

| Síntoma | Qué revisar |
|---|---|
| La compilación falla en Render | **Logs** del despliegue; suele ser una variable faltante |
| "Application failed to respond" | Que `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` sean correctos (en Logs aparece el error de Turso) |
| El dominio no abre | Antes del paso 6: que el CNAME esté en **DNS only** y que en Render diga *Verified*. Después: que SSL/TLS esté en **Full (strict)** |
| "Acceso no permitido." en tu dominio | La regla de transformación (6.2) no está activa o la clave no es igual a `CF_ORIGIN_SECRET`. Para entrar de inmediato, borra `CF_ORIGIN_SECRET` en Render |
| "Acceso no permitido desde tu ubicación." | Estás fuera de los países de `ALLOWED_COUNTRIES` (o usando VPN) |
| Cloudflare muestra "Sorry, you have been blocked" | La regla "Solo México" (6.3): revisa en **Security → Events** qué se bloqueó |
| Solo aparece la página con el nombre de la tienda | El acceso con enlace privado está activo: abre el enlace privado en ese dispositivo (6.5) |
| El login dice "Este dispositivo no tiene acceso" | Igual que el anterior: el dispositivo no tiene el enlace o se generó uno nuevo |
| La primera visita tarda | El servicio estaba dormido: configura UptimeRobot (paso 4) |
