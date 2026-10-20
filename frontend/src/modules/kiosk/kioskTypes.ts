import type { KioskSessionInfo, RatingValue } from '../../lib/types';

export type Step = 'select' | 'question' | 'rating' | 'thanks';

export interface KioskState {
  step: Step;
  session: KioskSessionInfo | null;
  branchId: string;
  registerId: string;
  cashierId: string;
  questionIndex: number;
  selected: string[];
}

export interface Answers {
  areas: string[];
  dislikes: string[];
  likes: string[];
  rating: RatingValue | null;
}

export function makeUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* Rotación de preguntas: cada encuesta muestra una sola pregunta y avanza. */
const QUESTION_INDEX_KEY = 'nallely:questionIndex';

export function getQuestionIndex(): number {
  try {
    const n = Number(window.localStorage.getItem(QUESTION_INDEX_KEY) || 0);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function advanceQuestionIndex(total: number): void {
  try {
    const next = total > 0 ? (getQuestionIndex() + 1) % total : 0;
    window.localStorage.setItem(QUESTION_INDEX_KEY, String(next));
  } catch {
    /* almacenamiento no disponible */
  }
}

export const SURVEY_COOLDOWN_MS = 5_000;
const COOLDOWN_KEY = 'nallely:cooldownUntil';

export function startCooldown(ms: number = SURVEY_COOLDOWN_MS): void {
  try {
    window.localStorage.setItem(COOLDOWN_KEY, String(Date.now() + ms));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function cooldownRemainingMs(): number {
  try {
    const until = Number(window.localStorage.getItem(COOLDOWN_KEY) || 0);
    return Number.isFinite(until) ? Math.max(0, until - Date.now()) : 0;
  } catch {
    return 0;
  }
}

/* Borrador de la encuesta en curso: se guarda al salir para poder continuar. */
const DRAFT_KEY = 'nallely:draft';

export interface Draft {
  questionId: string;
  selected: string[];
}

export function saveDraft(questionId: string, selected: string[]): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ questionId, selected }));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Draft;
    if (data && typeof data.questionId === 'string' && Array.isArray(data.selected)) return data;
    return null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

/* Estado del kiosko: se conserva al recargar para no perder la encuesta en curso. */
const KIOSK_STATE_KEY = 'nallely:kioskState';

export function saveKioskState(state: KioskState): void {
  try {
    window.localStorage.setItem(KIOSK_STATE_KEY, JSON.stringify(state));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function readKioskState(): KioskState | null {
  try {
    const raw = window.localStorage.getItem(KIOSK_STATE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as KioskState;
    if (!data || typeof data !== 'object' || typeof data.step !== 'string') return null;
    return {
      step: data.step,
      session: data.session ?? null,
      branchId: data.branchId ?? '',
      registerId: data.registerId ?? '',
      cashierId: data.cashierId ?? '',
      questionIndex: Number.isInteger(data.questionIndex) ? data.questionIndex : 0,
      selected: Array.isArray(data.selected) ? data.selected.filter((s) => typeof s === 'string') : [],
    };
  } catch {
    return null;
  }
}

export function clearKioskState(): void {
  try {
    window.localStorage.removeItem(KIOSK_STATE_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}
