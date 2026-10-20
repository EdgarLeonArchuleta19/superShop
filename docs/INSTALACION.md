# Guía de Instalación — SuperShop

## 1. Requisitos previos

| Requisito | Detalle |
|-----------|---------|
| **Sistema** | Windows 10/11 (64 bits) |
| **Internet** | Requerido para túnel Cloudflare y backup Drive |
| **Permisos** | Admin solo para instalar (escritura en `Program Files`) |
| **Antivirus** | Puede avisar "App desconocida" → ver sección *SmartScreen* |

---

## 2. Instalación paso a paso

### 2.1 Ejecutar el instalador
1. Doble clic en `SuperShop-Setup-1.0.0.exe`.
2. Si **Windows SmartScreen** muestra "Windows protegió su PC":
   - Clic en **Más información**
   - Clic en **Ejecutar de todas formas**
3. Asistente NSIS:
   - **Siguiente** → Aceptar licencia → **Siguiente**
   - Elegir carpeta (por defecto `C:\Program Files\SuperShop`) → **Siguiente**
   - Marcar **Crear acceso directo en el Escritorio** y **Menú Inicio** → **Instalar**
4. Esperar a que termine (barra de progreso).
5. Marcar **Ejecutar SuperShop** → **Finalizar**.

### 2.2 Primera ejecución
- La app abre una ventana en `http://localhost:3001`.
- En la bandeja del sistema (junto al reloj) aparece el icono de SuperShop.
- **Login**: usuario `admin`, contraseña `admin123` (rol administrador).
- También existe `cajero` / `cajero123` (rol cajero).

---

## 3. Configuración inicial (solo admin)

### 3.1 Información de la tienda
- Menú **Ajustes → Información**
- Edita **Nombre de la tienda** y **Descripción**
- Sube **Logo** (PNG/JPG/WEBP, máx. 600 KB)
- **Guardar cambios**

### 3.2 Catálogos base
- **Catálogos → Tiendas**: crea al menos una (ej. "Mi Tienda")
- **Catálogos → Cajas**: crea cajas por tienda (ej. "Caja 1", "Caja 2")
- **Catálogos → Cajeros(as)**: da de alta al personal

> Estos datos aparecen en la encuesta y en los filtros de estadísticas.

### 3.3 Backup automático (recomendado)
- **Ajustes → Administrador → Respaldo automático**
- Activa **Backups automáticos activados**
- Elige **Frecuencia**: Semanal (lunes 03:00) o Mensual (día 1 03:00)
- Activa **Guardar copia en disco local** (carpeta `%APPDATA%\SuperShop\data\backups\`)
- (Opcional) **Subir a Google Drive** → ver sección *Backup Google Drive*
- La app programa y ejecuta solo; también hay botón **Ejecutar backup ahora**.

---

## 4. Conectar dispositivos "hijas" (tablets, móviles)

### 4.1 Iniciar el túnel
1. Ve a **Ajustes → Vincular dispositivos** (solo admin).
2. Pulsa **Iniciar túnel**.
3. Espera ~4 segundos: aparecerá la **URL** (`https://xxxx.trycloudflare.com`) y un **código QR grande**.

### 4.2 En cada dispositivo hija
- **Opción A (QR)**: Abre la cámara o app de QR → escanea → abre en navegador.
- **Opción B (Enlace)**: Copia la URL y envíala por WhatsApp/Email/Teams.
- El navegador carga la PWA → ofrece **"Instalar SuperShop"** (Chrome/Edge: menú ⋮ → Instalar).
- Inicia sesión con tu usuario (ej. `cajero` / `cajero123`).
- Pulsa **Mi encuesta** → ya puedes atender clientes.

> **Importante**: La URL del túnel **cambia cada vez que reinicias la app en la PC madre**. Vuelve a mostrar el QR nuevo cada mañana.

### 4.3 Funcionamiento offline
- Si la tablet pierde conexión, las respuestas se guardan localmente (IndexedDB).
- Al recuperar internet, se sincronizan automáticamente (batch de 200).
- El kiosko **nunca cierra sesión solo** (persistente en localStorage).

---

## 5. Backup a Google Drive (opcional)

### 5.1 Requisitos previos
- Cuenta de Google (personal o Workspace).
- En **Google Cloud Console**:
  1. Crea un proyecto o usa uno existente.
  2. Habilita **Google Drive API**.
  3. Crea credenciales **OAuth 2.0 Client ID** (tipo "Aplicación de escritorio").
  4. Anota **Client ID** y **Client Secret**.
  5. En "Pantalla de consentimiento OAuth": agrega tu email como usuario de prueba (si está en "Externo").

### 5.2 Configurar en SuperShop
> **Nota**: Las credenciales deben incluirse en el build (variables de entorno `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`). Contacta a ELAN Software para builds personalizados.

1. En **Ajustes → Administrador → Respaldo automático** → activa **Subir a Google Drive**.
2. Pulsa **Conectar Google Drive** → se abre ventana de autorización.
3. Elige tu cuenta → **Permitir** acceso a "Ver, editar, crear y eliminar archivos de Google Drive".
4. Ventana se cierra sola → vuelve a la app → aparece **Conectado**.
5. (Opcional) **ID de carpeta Drive**: crea una carpeta en Drive, copia su ID de la URL (`https://drive.google.com/drive/folders/<ID_AQUI>`) y pégalo aquí.
6. Los backups subirán automáticos + botón **Ejecutar backup ahora**.

### 5.3 Verificar
- En Drive, entra a la carpeta (o "Mi unidad") → verás `supershop-backup-<fecha>.zip`.
- Cada ZIP contiene `nallely.db` + `data.json` (export completo).

---

## 6. Restaurar backup (manual)

### 6.1 Desde backup local
1. Cierra SuperShop (clic derecho en tray → **Salir**).
2. Abre `%APPDATA%\SuperShop\data\backups\` (Win+R → pega la ruta).
3. Descomprime el `.zip` deseado → copia `nallely.db` a `%APPDATA%\SuperShop\data\` (sobrescribe).
4. Vuelve a abrir SuperShop.

### 6.2 Desde Google Drive
1. Descarga el `.zip` de Drive a la PC.
2. Sigue pasos 1–4 anteriores.

---

## 7. Actualizar SuperShop

1. Descarga el nuevo `SuperShop-Setup-X.Y.Z.exe`.
2. Ejecuta el instalador → **actualiza en el mismo sitio** (conserva BD y backups en `%APPDATA%`).
3. Al abrir, la app migra la BD automáticamente (`ensureSeed()` + `ALTER TABLE`).

---

## 8. Desinstalar

- **Configuración → Aplicaciones → SuperShop → Desinstalar**
- O ejecuta `uninstall.exe` en la carpeta de instalación.
- **La BD y backups NO se borran** (quedan en `%APPDATA%\SuperShop\data\`).
- Para borrar todo: elimina manualmente `%APPDATA%\SuperShop\`.

---

## 9. Solución de problemas

| Síntoma | Causa / Solución |
|---------|------------------|
| "Windows protegió su PC" al instalar | App sin firma → **Más información → Ejecutar de todas formas** |
| La app abre pero no carga (pantalla blanca) | Backend no arrancó → revisa `%TEMP%\supershop-app.log` |
| Túnel no inicia / URL no aparece | Sin internet, firewall bloquea `cloudflared`, o puerto 3001 ocupado |
| Dispositivo hija no conecta | URL antigua (reiniciaste la app) → genera QR nuevo |
| Backup Drive falla "no autorizado" | Token expirado → **Reautorizar** en Ajustes → Administrador |
| Error "archiver is not a function" | Dependencia corrupta → reinstala con `npm run postinstall` |
| Puerto 3001 en uso | Otra instancia corriendo → `taskkill /IM SuperShop.exe /F` |

---

## 10. Rutas útiles

| Qué | Ruta |
|-----|------|
| Base de datos | `%APPDATA%\SuperShop\data\nallely.db` |
| Backups locales | `%APPDATA%\SuperShop\data\backups\` |
| Log de la app | `%TEMP%\supershop-app.log` |
| Instalación | `C:\Program Files\SuperShop\` |
| Acceso directo | Escritorio / Menú Inicio → SuperShop |

---

## 11. Contacto y soporte

**ELAN Software**  
📧 soporte@elansoftware.com (ejemplo)  
🌐 https://elansoftware.com (ejemplo)

*SuperShop v1.0.0 — Octubre 2026*