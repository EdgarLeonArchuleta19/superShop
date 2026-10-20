// Carga backend/.env si existe. Debe importarse antes que cualquier otro módulo
// del backend. Las variables ya definidas (por el hosting o por Electron) tienen
// prioridad: process.loadEnvFile no sobrescribe las existentes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
