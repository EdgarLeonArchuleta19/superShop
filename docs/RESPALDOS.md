# Guía de Respaldos — SuperShop

SuperShop guarda copias de seguridad en dos lugares independientes. Cada uno tiene su propio respaldo manual y su propia programación automática:

- **En este equipo**: archivos ZIP en la computadora donde corre SuperShop. No necesita internet.
- **En Google Drive** (opcional): una copia fuera de la tienda, en la carpeta "SuperShop Respaldos" de la cuenta conectada.

Todo se maneja desde **Ajustes → Respaldos e Importaciones**. Para entrar se necesita el permiso "Respaldos e Importaciones" (ver Roles y permisos).

---

## 1. Qué contiene un respaldo

Cada respaldo es un `.zip` llamado `supershop-backup-<fecha>.zip` con:

| Archivo | Contenido |
|---------|-----------|
| `nallely.db` | Copia completa y consistente de la base de datos (tiendas, cajas, cajeros, usuarios, roles, encuestas y ajustes de la tienda). |
| `data.json` | Los mismos datos en formato legible (sin contraseñas). |

Por seguridad, el respaldo **no** incluye las sesiones abiertas ni la conexión con Google Drive.

---

## 2. Respaldo en este equipo

- **Respaldar ahora**: primero abre el explorador de archivos para elegir dónde guardar el respaldo (sugiere la carpeta por defecto). SuperShop conserva además su copia en la carpeta por defecto, que es la que aparece en la lista y se usa para restaurar.
  - En la versión web, Chrome y Edge muestran su propio "Guardar como"; en otros navegadores (o en el celular) el archivo se descarga normalmente.
- **Respaldo automático**: elige **Diario**, **Semanal** (día de la semana) o **Mensual** (día 1 a 28) y la hora.
  - Si el equipo está apagado a esa hora, el respaldo se hace en cuanto SuperShop vuelve a arrancar.
  - Si falla (por ejemplo, disco lleno), se reintenta cada hora y la pantalla muestra el motivo.
- **Dónde se guardan**: carpeta `backups` dentro de la carpeta de datos.
  - Escritorio: `%APPDATA%\SuperShop\data\backups\`
  - Web: `<DATA_DIR>/backups/` en el servidor
- **Ver respaldos locales**: en la app de escritorio abre la carpeta por defecto en el Explorador de Windows. En la versión web lleva a la lista de respaldos guardados (el navegador no puede abrir carpetas del servidor).
- **Respaldos guardados**: la pantalla lista los respaldos con opciones para **descargar** (útil para guardarlos en una USB), **restaurar** o **eliminar**.

Las instalaciones anteriores a esta versión conservan su programación previa (semanal, lunes 03:00) hasta que se cambie en la pantalla.

---

## 3. Respaldo en Google Drive

### 3.1 Requisitos (los configura quien instala SuperShop)

1. En [Google Cloud Console](https://console.cloud.google.com): crear un proyecto, habilitar **Google Drive API** y crear un **ID de cliente OAuth 2.0** de tipo **"Aplicación web"**.
2. En ese cliente, agregar como **URI de redireccionamiento autorizados**:
   - Escritorio: `http://localhost:3001/api/admin/backup/oauth2callback`
   - Web: `https://tu-dominio/api/admin/backup/oauth2callback`
3. Si la pantalla de consentimiento es "Externa" y está en modo de prueba, agregar los correos que vayan a conectarse como usuarios de prueba.
4. Configurar las credenciales (nunca en el código ni en git):
   - **Web**: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `backend/.env` o en las variables del hosting. Detrás de un proxy HTTPS añade `TRUST_PROXY=true`.
   - **Escritorio**: `electron/google-oauth.json` (copiar de `electron/google-oauth.example.json`) antes de compilar.

Sin credenciales, la pantalla muestra "El respaldo en la nube no está disponible en esta instalación".

### 3.2 Uso

1. Pulsa **Conectar Google Drive** e inicia sesión con la cuenta de la tienda. En la app de escritorio la autorización se abre en el navegador.
2. Al volver, la pantalla muestra **Conectado** con el correo de la cuenta y un enlace **Abrir carpeta**.
3. **Subir respaldo ahora** o activa el **respaldo automático** con su propia frecuencia y hora. Necesita internet a esa hora; si falla, se reintenta cada hora.
4. **Desconectar** deja de subir respaldos y revoca el acceso. Los archivos que ya están en Drive no se borran.

SuperShop usa el permiso `drive.file`: solo puede ver y modificar los archivos que él mismo crea, no el resto de tu Drive.

Si Google revoca el acceso (por ejemplo, porque se quitó desde la cuenta de Google), la pantalla lo indica y pide volver a conectar.

---

## 4. Cuántos respaldos se conservan

En **Respaldos guardados** eliges cuántos conservar: 5, 10 (predeterminado), 20, 30 o 60. Al crear uno nuevo se borran los más antiguos, tanto en el equipo como en la carpeta de Drive.

---

## 5. Restaurar

Se puede restaurar de dos formas:

- Desde la lista **Respaldos guardados**, con el botón **Restaurar**.
- Con el botón **Importar respaldo** (arriba a la derecha): arrastra o elige un `.zip` descargado antes o traído de otra computadora (por ejemplo, uno bajado de Google Drive).

Al restaurar:

1. Primero se guarda automáticamente una copia de la información actual, que aparece marcada como **"Antes de restaurar"**. Si te equivocaste, restaura esa copia.
2. Se reemplazan tiendas, cajas, cajeros, usuarios, roles, encuestas y el nombre y logo de la tienda. La programación de respaldos y la conexión con Drive se conservan.
3. Se cierran todas las sesiones y hay que volver a iniciar sesión.

También se aceptan respaldos de versiones anteriores de SuperShop: a los usuarios se les asigna el rol que les corresponde.

---

## 6. Solución de problemas

| Mensaje en pantalla | Qué hacer |
|---------------------|-----------|
| "No hay conexión a internet. Se volverá a intentar más tarde." | Nada: se reintenta cada hora. Revisa la conexión si persiste. |
| "Google rechazó la conexión… Vuelve a conectar Google Drive." | Pulsa **Conectar Google Drive** de nuevo. |
| "Tu Google Drive no tiene espacio suficiente." | Libera espacio en la cuenta o reduce cuántos respaldos se conservan. |
| "No hay espacio suficiente en el disco…" | Libera espacio o reduce cuántos respaldos se conservan. |
| "El archivo no es un respaldo válido de SuperShop." | Usa un `.zip` creado por SuperShop, sin descomprimir ni modificar. |
| "El respaldo en la nube no está disponible en esta instalación." | Faltan las credenciales de Google (sección 3.1). |
| Error `redirect_uri_mismatch` en la ventana de Google | La URI de la sección 3.1 no coincide exactamente con la registrada en Google Cloud. |

Los detalles técnicos de los errores quedan en el registro del servidor (`[Backup] …`). En escritorio, el registro está en `%TEMP%\supershop-app.log`.
