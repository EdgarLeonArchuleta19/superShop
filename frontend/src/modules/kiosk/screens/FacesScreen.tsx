import { IconChevronLeft } from '../../../components/Icons';
import { RATING } from '../../../lib/questions';

interface Face {
  value: number;
  label: string;
  emoji: string;
  chip: string;
  ring: string;
  hover: string;
}

const FACES: Face[] = [
  {
    value: 1,
    label: 'Mala',
    emoji: '😞',
    chip: 'bg-red-100 dark:bg-red-500/15',
    ring: 'border-red-500/60',
    hover: 'hover:bg-red-50 dark:hover:bg-red-500/10',
  },
  {
    value: 3,
    label: 'Regular',
    emoji: '😐',
    chip: 'bg-gray-100 dark:bg-gray-500/15',
    ring: 'border-gray-300/80 dark:border-gray-500/50',
    hover: 'hover:bg-gray-50 dark:hover:bg-gray-500/10',
  },
  {
    value: 5,
    label: 'Buena',
    emoji: '😄',
    chip: 'bg-emerald-100 dark:bg-emerald-500/15',
    ring: 'border-emerald-500/60',
    hover: 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
  },
];

interface Props {
  onSelect: (rating: number) => void;
  onBack: () => void;
}

export default function FacesScreen({ onSelect, onBack }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 min-h-0 flex-col px-4 sm:px-6">
      <div className="anim-slide-in flex flex-1 min-h-0 flex-col items-center justify-center overflow-y-auto py-6 text-center">
        <h2 className="max-w-md text-[22px] font-semibold leading-snug tracking-tight sm:text-[26px]">
          {RATING.title}
        </h2>
        <p className="mt-2 text-[14px] text-muted sm:text-base">Toca la carita que mejor te represente</p>

        <div className="mt-8 grid w-full grid-cols-3 gap-3 sm:gap-5" role="radiogroup" aria-label={RATING.title}>
          {FACES.map((face, i) => (
            <button
              key={face.value}
              onClick={() => onSelect(face.value)}
              style={{ animationDelay: `${i * 60}ms` }}
              role="radio"
              aria-label={face.label}
              className={`anim-fade-up group flex min-h-[150px] flex-col items-center justify-center gap-3 rounded-3xl border-2 bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop active:scale-[0.96] sm:min-h-[190px] ${face.ring} ${face.hover}`}
            >
              <span
                className={`grid h-[84px] w-[84px] place-items-center rounded-full text-[46px] leading-none transition-transform duration-200 group-hover:scale-110 sm:h-[110px] sm:w-[110px] sm:text-[60px] ${face.chip}`}
              >
                {face.emoji}
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-ink sm:text-lg">
                {face.label}
              </span>
            </button>
          ))}
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
