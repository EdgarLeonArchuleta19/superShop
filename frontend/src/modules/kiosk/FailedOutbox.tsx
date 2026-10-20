import { useState, useSyncExternalStore } from 'react';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { IconAlert, IconRefresh, IconTrash } from '../../components/Icons';
import { clearFailed, getFailedCount, getFailedItems, retryFailed, subscribeOutbox } from '../../lib/offline';
import type { FailedSurvey } from '../../lib/offline';

const REASON_LABEL: Record<FailedSurvey['reason'], string> = {
  invalid: 'Datos incompletos',
  server: 'Falla del servidor',
  unknown: 'Error desconocido',
};

function fmtWhen(ms: number): string {
  try {
    return new Date(ms).toLocaleString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function FailedOutbox() {
  const failedCount = useSyncExternalStore(subscribeOutbox, getFailedCount);
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  if (failedCount === 0) return null;

  const items = getFailedItems();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Encuestas que no se pudieron enviar"
        className="flex h-9 items-center gap-1.5 rounded-full bg-red-50 px-3 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25"
      >
        <IconAlert className="h-4 w-4" />
        {failedCount}
        <span className="hidden sm:inline">sin enviar</span>
      </button>

      <Modal
        open={open}
        title="Encuestas sin enviar"
        onClose={() => setOpen(false)}
        wide
        footer={
          <>
            <button onClick={() => setClearing(true)} className="btn-ghost h-11 px-5 text-sm text-red-600">
              <IconTrash className="h-4 w-4" />
              Descartar
            </button>
            <button
              onClick={() => {
                retryFailed();
                setOpen(false);
              }}
              className="btn h-11 bg-brand-600 px-5 text-sm text-white shadow-glow hover:bg-brand-700"
            >
              <IconRefresh className="h-4 w-4" />
              Reintentar
            </button>
          </>
        }
      >
        <div className="space-y-2 text-[14px] leading-relaxed text-ink/80">
          <p>
            Estas encuestas se contestaron en este dispositivo pero <strong>no llegaron al servidor</strong>{' '}
            (por ejemplo, por una falla del servidor o porque el dispositivo no tenía acceso). Siguen guardadas aquí.
          </p>
          <p>
            Toca <strong>Reintentar</strong> para enviarlas de nuevo: no se duplican. <strong>Descartar</strong> las
            borra para siempre.
          </p>
        </div>
        <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
          {items.map((f) => (
            <li
              key={f.uuid}
              className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-faint px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink/85">
                  Contestada el {fmtWhen(f.queuedAt)}
                </p>
                <p className="truncate text-[12px] text-muted">Falló el {fmtWhen(f.failedAt)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-300">
                {REASON_LABEL[f.reason]}
              </span>
            </li>
          ))}
        </ul>
      </Modal>

      <ConfirmDialog
        open={clearing}
        title="Descartar encuestas"
        message={`Se eliminarán ${failedCount} encuesta(s) que no se pudieron enviar. Esta acción no se puede deshacer.`}
        confirmLabel="Descartar"
        danger
        onConfirm={() => {
          clearFailed();
          setClearing(false);
          setOpen(false);
        }}
        onClose={() => setClearing(false)}
      />
    </>
  );
}
