import PageSizeSelect from './PageSizeSelect';
import { IconChevronLeft, IconChevronRight } from './Icons';

interface Props {
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  noun?: string;
}

export default function Pagination({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
  noun = 'registros',
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);

  const navBtn =
    'grid h-8 w-8 place-items-center text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-2.5">
      <p className="text-[12px] tabular-nums text-muted">
        {start}–{end} de {total} {noun}
      </p>
      <div className="flex items-center gap-2.5">
        <PageSizeSelect
          value={pageSize}
          onChange={(v) => {
            onPageSize(v);
            onPage(1);
          }}
        />
        <div className="flex items-center rounded-full bg-faint">
          <button
            type="button"
            className={navBtn}
            onClick={() => onPage(Math.max(1, current - 1))}
            disabled={current <= 1}
            aria-label="Anterior"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[3rem] text-center text-[12px] font-medium tabular-nums text-ink/70">
            {current} / {totalPages}
          </span>
          <button
            type="button"
            className={navBtn}
            onClick={() => onPage(Math.min(totalPages, current + 1))}
            disabled={current >= totalPages}
            aria-label="Siguiente"
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}