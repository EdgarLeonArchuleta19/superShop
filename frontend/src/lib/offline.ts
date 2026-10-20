import { api, ApiError, NetError, getToken } from './api';
import type { TokenRole } from './api';
import type { SurveyPayload } from './types';

const OUTBOX_KEY = 'nallely.outbox';
const FAILED_KEY = 'nallely.outbox.failed';
/** El servidor acepta como máximo 200 encuestas por lote. */
const MAX_BATCH = 200;
/** Reintentos permitidos ante errores del servidor (5xx) antes de descartar. */
const MAX_SERVER_RETRIES = 12;

export type FailureReason = 'server' | 'invalid' | 'unknown';

export interface QueuedSurvey {
  uuid: string;
  payload: SurveyPayload;
  queuedAt: number;
  attempts: number;
}

export interface FailedSurvey extends QueuedSurvey {
  failedAt: number;
  reason: FailureReason;
}

export interface FlushResult {
  sent: number;
  pending: number;
  failed: number;
  online: boolean;
}

let cache: QueuedSurvey[] | null = null;
let flushPromise: Promise<FlushResult> | null = null;
const listeners = new Set<() => void>();

function read(): QueuedSurvey[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(items: QueuedSurvey[]): void {
  cache = items;
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    /* almacenamiento lleno: se conserva en memoria */
  }
  for (const fn of listeners) fn();
}

function readFailed(): FailedSurvey[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAILED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFailed(items: FailedSurvey[]): void {
  try {
    localStorage.setItem(FAILED_KEY, JSON.stringify(items));
  } catch {
    /* almacenamiento lleno: se conserva en memoria */
  }
  for (const fn of listeners) fn();
}

function moveToFailed(items: QueuedSurvey[], reason: FailureReason): void {
  if (!items.length) return;
  const now = Date.now();
  const next: FailedSurvey[] = items.map((i) => ({ ...i, failedAt: now, reason }));
  writeFailed([...readFailed(), ...next]);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function subscribeOutbox(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPendingCount(): number {
  return read().length;
}

export function getFailedCount(): number {
  return readFailed().length;
}

export function getFailedItems(): FailedSurvey[] {
  return readFailed();
}

export function enqueueSurvey(payload: SurveyPayload): void {
  const items = read().filter((i) => i.uuid !== payload.client_uuid);
  items.push({ uuid: payload.client_uuid, payload, queuedAt: Date.now(), attempts: 0 });
  write(items);
}

let failedRecovered = false;

/**
 * Una vez por carga de la app, vuelven a la cola las fallidas que pueden enviarse ya:
 * - las sin carita: antes el servidor las rechazaba como inválidas y ahora las acepta
 *   como "Sin respuesta";
 * - las de falla del servidor (5xx): el servidor pudo haberse corregido.
 * Es seguro: el servidor ignora las que ya recibió (client_uuid).
 */
function recoverFailedOnce(): void {
  if (failedRecovered) return;
  failedRecovered = true;
  const failed = readFailed();
  const recoverable = failed.filter(
    (f) => f.reason === 'server' || (f.reason === 'invalid' && f.payload.rating == null)
  );
  if (!recoverable.length) return;
  const queued = read();
  const items = [
    ...queued,
    ...recoverable
      .filter((f) => !queued.some((q) => q.uuid === f.uuid))
      .map((f) => ({ uuid: f.uuid, payload: f.payload, queuedAt: f.queuedAt, attempts: 0 })),
  ];
  write(items);
  writeFailed(failed.filter((f) => !recoverable.includes(f)));
}

/** Devuelve las encuestas fallidas a la cola para reintentar su envío. */
export function retryFailed(): void {
  const failed = readFailed();
  if (!failed.length) return;
  const items = read().filter((i) => !failed.some((f) => f.uuid === i.uuid));
  for (const f of failed) {
    items.push({ uuid: f.uuid, payload: f.payload, queuedAt: f.queuedAt, attempts: 0 });
  }
  write(items);
  writeFailed([]);
}

/** Descartar encuestas fallidas de forma permanente. */
export function clearFailed(): void {
  writeFailed([]);
}

async function sendBatches(
  items: QueuedSurvey[],
  role: TokenRole | undefined
): Promise<FlushResult> {
  const sentUuids = new Set<string>();
  const invalidUuids = new Set<string>();
  const serverFailedUuids = new Set<string>();
  let online = true;

  for (const batch of chunk(items, MAX_BATCH)) {
    try {
      const res = await api<{
        inserted: number;
        duplicates: number;
        invalid: number;
        invalidUuids?: string[];
      }>('/api/surveys/batch', {
        method: 'POST',
        body: { items: batch.map((i) => i.payload) },
        role,
      });
      for (const item of batch) sentUuids.add(item.uuid);
      for (const uuid of res.invalidUuids ?? []) invalidUuids.add(uuid);
    } catch (err) {
      if (err instanceof NetError) {
        online = false;
        break;
      }
      if (err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)) {
        // Sesión vencida o sin permiso: se conservan en la cola (sin contar intento)
        // y se envían cuando alguien con acceso a "Mi encuesta" vuelva a iniciar sesión.
        // 404: el dispositivo perdió el enlace privado; se envían cuando lo vuelva a abrir.
        break;
      }
      if (err instanceof ApiError && err.status === 400) {
        // Lote inválido: se marca cada elemento para no bloquear al resto.
        for (const item of batch) invalidUuids.add(item.uuid);
        continue;
      }
      // 5xx u otro error de servidor: reintentar el lote más adelante.
      for (const item of batch) serverFailedUuids.add(item.uuid);
    }
  }

  const current = read();
  const sent = current.filter((i) => sentUuids.has(i.uuid));
  const invalid = current.filter((i) => invalidUuids.has(i.uuid));
  const serverFailed = current.filter((i) => serverFailedUuids.has(i.uuid));

  // Los inválidos nunca se podrán enviar: van a fallidos directamente.
  moveToFailed(invalid, 'invalid');

  // Los que fallaron por servidor acumulan intentos; se descartan tras el tope.
  const bumped = serverFailed.map((i) => ({ ...i, attempts: i.attempts + 1 }));
  const dead = bumped.filter((i) => i.attempts >= MAX_SERVER_RETRIES);
  const alive = bumped.filter((i) => i.attempts < MAX_SERVER_RETRIES);
  moveToFailed(dead, 'server');

  const untouched = current.filter(
    (i) =>
      !sentUuids.has(i.uuid) && !invalidUuids.has(i.uuid) && !serverFailedUuids.has(i.uuid)
  );
  write([...untouched, ...alive]);

  return {
    sent: sent.length,
    pending: untouched.length + alive.length,
    failed: getFailedCount(),
    online,
  };
}

export async function flushOutbox(): Promise<FlushResult> {
  recoverFailedOnce();
  const items = read();
  const failed = getFailedCount();
  if (!items.length) return { sent: 0, pending: 0, failed, online: true };
  if (flushPromise) return flushPromise;

  const online = typeof navigator === 'undefined' || navigator.onLine;
  if (!online) return { sent: 0, pending: items.length, failed, online: false };

  const role = getToken('kiosk') ? 'kiosk' : getToken('admin') ? 'admin' : undefined;

  flushPromise = sendBatches(items, role).finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}
