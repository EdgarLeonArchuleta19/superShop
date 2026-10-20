import type { RatingCounts, RatingValue, Survey } from './types';

export interface RatingMeta {
  value: RatingValue;
  label: string;
  color: string;
  soft: string;
}

export const RATING_ORDER: RatingValue[] = ['good', 'regular', 'bad'];

export const RATING_META: Record<RatingValue, RatingMeta> = {
  good: { value: 'good', label: 'Buena', color: '#22c55e', soft: 'rgba(34, 197, 94, 0.14)' },
  regular: { value: 'regular', label: 'Regular', color: '#f59e0b', soft: 'rgba(245, 158, 11, 0.14)' },
  bad: { value: 'bad', label: 'Mala', color: '#ef4444', soft: 'rgba(239, 68, 68, 0.14)' },
};

export const NO_RATING_LABEL = 'Sin calificación';

export function isRatingValue(value: unknown): value is RatingValue {
  return value === 'good' || value === 'regular' || value === 'bad';
}

export function ratingLabel(value: RatingValue | null | undefined): string {
  return isRatingValue(value) ? RATING_META[value].label : NO_RATING_LABEL;
}

/* Compatibilidad: convierte estrellas antiguas (1-5) a categorías. */
export function normalizeRating(value: unknown): RatingValue | null {
  if (isRatingValue(value)) return value;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  if (n >= 4) return 'good';
  if (n === 3) return 'regular';
  return 'bad';
}

export function emptyRatingCounts(): RatingCounts {
  return { good: 0, regular: 0, bad: 0, none: 0 };
}

export function countRatings(surveys: Survey[]): RatingCounts {
  const counts = emptyRatingCounts();
  for (const s of surveys) {
    const value = normalizeRating(s.rating);
    if (value) counts[value]++;
    else counts.none++;
  }
  return counts;
}
