import { IconChevronLeft } from '../../../components/Icons';
import FaceIcon from '../../../components/FaceIcon';
import { RATING } from '../../../lib/questions';
import { RATING_META, RATING_ORDER } from '../../../lib/rating';
import type { RatingValue } from '../../../lib/types';

interface Props {
  onSelect: (rating: RatingValue) => void;
  onBack: () => void;
}

const RING: Record<RatingValue, string> = {
  good: 'border-emerald-500/70 ring-2 ring-emerald-500/20 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:shadow-[0_18px_40px_-18px_rgba(34,197,94,0.9)]',
  regular: 'border-amber-500/70 ring-2 ring-amber-500/20 hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:shadow-[0_18px_40px_-18px_rgba(245,158,11,0.9)]',
  bad: 'border-red-500/70 ring-2 ring-red-500/20 hover:bg-red-50 dark:hover:bg-red-500/10 hover:shadow-[0_18px_40px_-18px_rgba(239,68,68,0.9)]',
};

export default function FacesScreen({ onSelect, onBack }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 min-h-0 flex-col px-4 sm:px-6">
      <div className="anim-slide-in flex flex-1 min-h-0 flex-col items-center justify-center overflow-y-auto py-6 text-center">
        <h2 className="max-w-md text-[22px] font-semibold leading-snug tracking-tight sm:text-[26px]">
          {RATING.title}
        </h2>
        <p className="mt-2 text-[14px] text-muted sm:text-base">{RATING.help}</p>
        <div
          className="mt-8 grid w-full grid-cols-3 gap-3 sm:gap-5"
          role="radiogroup"
          aria-label={RATING.title}
        >
          {RATING_ORDER.map((value, i) => {
            const meta = RATING_META[value];
            return (
              <button
                key={value}
                onClick={() => onSelect(value)}
                style={{ animationDelay: `${i * 60}ms` }}
                role="radio"
                aria-label={meta.label}
                className={`anim-fade-up group flex min-h-[150px] flex-col items-center justify-center gap-3 rounded-[28px] border-2 bg-surface p-4 transition-all duration-200 hover:-translate-y-1 active:scale-[0.98] sm:min-h-[190px] ${RING[value]}`}
              >
                <span className="grid place-items-center transition-transform duration-200 group-hover:scale-110">
                  <FaceIcon
                    value={value}
                    className="h-[84px] w-[84px] sm:h-[110px] sm:w-[110px]"
                  />
                </span>
                <span className="text-[15px] font-semibold tracking-tight text-ink sm:text-lg">
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="shrink-0 border-t border-line py-3">
        <button onClick={onBack} className="btn-ghost h-11 px-4 text-sm">
          <IconChevronLeft className="h-4 w-4" />
          Atrás
        </button>
      </div>
    </div>
  );
}
