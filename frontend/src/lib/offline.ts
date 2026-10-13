import { api, ApiError, NetError, getToken } from './api';
import type { SurveyPayload } from './types';

const OUTBOX_KEY = 'nallely.outbox';
const FAILED_KEY = 'nallely.outbox.failed';
const MAX_ATTEMPTS = 8;

export interface QueuedSurvey {
  uuid: string;
  payload: SurveyPayload;
  queuedAt: number;
  attempts: number;
}

export interface FlushResult {
  sent: number;
  pending: number;
  failed: number;
  online: boolean;
}

let cache: QueuedSurvey[] | null = null;
let flushing = false;
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

export function subscribeOutbox(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPendingCount(): number {
  return read().length;
}

export function getFailedCount(): number {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAILED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function enqueueSurvey(payload: SurveyPayload): void {
  const items = read().filter((i) => i.uuid !== payload.client_uuid);
  items.push({ uuid: payload.client_uuid, payload, queuedAt: Date.now(), attempts: 0 });
  write(items);
}

function moveToFailed(items: QueuedSurvey[]): void {
  try {
    const prev = JSON.parse(localStorage.getItem(FAILED_KEY) || '[]');
    const list = Array.isArray(prev) ? prev : [];
    localStorage.setItem(FAILED_KEY, JSON.stringify([...list, ...items]));
  } catch {
    /* ignorar */
  }
}

export async function flushOutbox(): Promise<FlushResult> {
  const items = read();
  const failed = getFailedCount();
  if (!items.length) return { sent: 0, pending: 0, failed, online: true };
  if (flushing) return { sent: 0, pending: items.length, failed, online: true };

  const online = typeof navigator === 'undefined' || navigator.onLine;
  if (!online) return { sent: 0, pending: items.length, failed, online: false };

  flushing = true;
  const uuids = new Set(items.map((i) => i.uuid));
  const role = getToken('kiosk') ? 'kiosk' : getToken('admin') ? 'admin' : undefined;

  try {
    const res = await api<{ inserted: number; duplicates: number; invalid: number }>(
      '/api/surveys/batch',
      { method: 'POST', body: { items: items.map((i) => i.payload) }, role }
    );
    const fresh = read().filter((i) => !uuids.has(i.uuid));
    write(fresh);
    return {
      sent: res.inserted + res.duplicates,
      pending: fresh.length,
      failed: getFailedCount(),
      online: true,
    };
  } catch (err) {
    if (err instanceof NetError) {
      return { sent: 0, pending: items.length, failed, online: false };
    }
    if (err instanceof ApiError && err.status >= 500) {
      const bumped = read().map((i) =>
        uuids.has(i.uuid) ? { ...i, attempts: i.attempts + 1 } : i
      );
      write(bumped);
      return { sent: 0, pending: bumped.length, failed, online: true };
    }
    const bumped = read().map((i) =>
      uuids.has(i.uuid) ? { ...i, attempts: i.attempts + 1 } : i
    );
    const dead = bumped.filter((i) => uuids.has(i.uuid) && i.attempts >= MAX_ATTEMPTS);
    const alive = bumped.filter((i) => !dead.includes(i));
    if (dead.length) moveToFailed(dead);
    write(alive);
    return { sent: 0, pending: alive.length, failed: getFailedCount(), online: true };
  } finally {
    flushing = false;
  }
}
