// Descarga cloudflared.exe (túnel de Cloudflare) para la app de escritorio.
// No se guarda en git porque es un programa de Cloudflare de ~55 MB.
// Uso: node scripts/get-cloudflared.mjs   (no hace nada si ya existe)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'electron', 'bin', 'cloudflared.exe');

if (fs.existsSync(dest)) {
  console.log('cloudflared.exe ya está en electron/bin');
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
console.log('Descargando cloudflared.exe…');
const res = await fetch(URL);
if (!res.ok) {
  console.error(`No se pudo descargar cloudflared (HTTP ${res.status}). Descárgalo manualmente de:\n${URL}`);
  process.exit(1);
}
fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
console.log(`Listo: ${dest}`);
