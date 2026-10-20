import { IconCheck, IconChevronLeft, IconChevronRight } from '../../../components/Icons';
import type { SurveyQuestion } from '../../../lib/questions';

const OPTION_EMOJI: Record<string, Record<string, string>> = {
  areas: {
    'Frutas y verduras': '🥦',
    Carnicería: '🥩',
    Abarrotes: '🛒',
    'Caja y atención': '🙋',
    'Limpieza y orden': '✨',
    'Todo está bien': '👍',
  },
  dislikes: {
    Precios: '💸',
    'Calidad de productos': '📦',
    'No encontré lo que buscaba': '🔍',
    Atención: '🙁',
    'Tiempo de espera': '⏳',
    'Ninguna, todo bien': '👍',
  },
  likes: {
    Precios: '🏷️',
    'Calidad de frutas y verduras': '🥦',
    'Calidad de carnicería': '🥩',
    Atención: '🙋',
    'Limpieza y orden': '✨',
    'Todo me gustó': '🎉',
  },
};

interface Props {
  question: SurveyQuestion;
  selected: string[];
  onToggle: (option: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function QuestionScreen({ question, selected, onToggle, onNext, onBack }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 min-h-0 flex-col px-4 sm:px-6">
      <div
        key={question.id}
        className="anim-slide-in flex flex-1 min-h-0 flex-col overflow-y-auto py-6"
      >
        <h2 className="text-center text-[22px] font-semibold leading-snug tracking-tight sm:text-[26px]">
          {question.title}
        </h2>
        <p className="mt-1.5 text-center text-[14px] text-muted sm:text-base">{question.help}</p>

        <div className="mt-6 grid flex-1 grid-cols-1 gap-3 content-start sm:grid-cols-2 lg:grid-cols-3">
          {question.options.map((option, i) => {
            const active = selected.includes(option);
            const emoji = OPTION_EMOJI[question.id]?.[option];
            return (
              <button
                key={option}
                onClick={() => onToggle(option)}
                style={{ animationDelay: `${i * 45}ms` }}
                className={`anim-fade-up group relative flex min-h-[132px] flex-col items-center justify-center gap-2.5 rounded-3xl border-2 p-4 text-center transition-all duration-200 active:scale-[0.97] ${
                  active
                    ? 'border-brand-600 bg-brand-50 shadow-pop dark:bg-brand-500/15'
                    : 'border-line bg-surface hover:border-brand-400 hover:shadow-card'
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${
                    active
                      ? 'anim-pop border-brand-600 bg-brand-600 text-white'
                      : 'border-line text-transparent'
                  }`}
                  style={{ position: 'absolute', top: '0.75rem', right: '0.75rem' }}
                >
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
                {emoji && <span className="text-[40px] leading-none sm:text-[44px]">{emoji}</span>}
                <span
                  className={`text-[16px] font-semibold leading-snug sm:text-[17px] ${
                    active ? 'text-brand-900 dark:text-brand-100' : 'text-ink/85'
                  }`}
                >
                  {option}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-line py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
          <button onClick={onBack} className="btn-ghost h-16 flex-1 px-5 text-base sm:text-lg">
            <IconChevronLeft className="h-6 w-6" />
            Atrás
          </button>
          <button
            onClick={onNext}
            disabled={selected.length === 0}
            className="group btn-primary h-16 flex-1 px-5 text-base sm:text-lg"
          >
            Siguiente
            <IconChevronRight className="h-6 w-6 transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
