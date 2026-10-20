import data from '../data/questions.json';

export interface SurveyQuestion {
  id: string;
  title: string;
  help: string;
  options: string[];
}

export interface RatingOption {
  value: string;
  label: string;
}

export interface RatingMeta {
  id: string;
  title: string;
  help: string;
  options: RatingOption[];
}

export const QUESTIONS: SurveyQuestion[] = data.questions;
export const RATING: RatingMeta = data.rating;

export const NEUTRAL_OPTION = 'Ninguna, todo bien';

const EXCLUSIVE_OPTIONS = [NEUTRAL_OPTION, 'Todo está bien', 'Todo me gustó'];

export function isExclusiveOption(option: string): boolean {
  return EXCLUSIVE_OPTIONS.includes(option);
}
