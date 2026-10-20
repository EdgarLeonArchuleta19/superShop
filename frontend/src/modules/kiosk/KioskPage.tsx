import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, apiCached } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { useSettings } from '../../lib/settings';
import StoreLogo from '../../components/StoreLogo';
import {
  enqueueSurvey,
  flushOutbox,
  getOutboxIssue,
  getPendingCount,
  isSending,
  subscribeOutbox,
} from '../../lib/offline';
import type { Branch, Cashier, KioskSessionInfo, RatingValue, Register } from '../../lib/types';
import type { Step } from './kioskTypes';
import {
  advanceQuestionIndex,
  clearDraft,
  clearKioskState,
  getQuestionIndex,
  makeUuid,
  readDraft,
  readKioskState,
  saveDraft,
  saveKioskState,
  startCooldown,
  SURVEY_COOLDOWN_MS,
} from './kioskTypes';
import { QUESTIONS, isExclusiveOption } from '../../lib/questions';
import { ConfirmDialog, Spinner, ThemeToggleButton } from '../../components/Modal';
import Select from '../../components/Select';
import { IconChevronRight, IconCloudCheck, IconCloudOff, IconLogout } from '../../components/Icons';
import QuestionScreen from './screens/QuestionScreen';
import FacesScreen from './screens/FacesScreen';
import ThanksScreen from './screens/ThanksScreen';
import FailedOutbox from './FailedOutbox';

const QUESTION_IDLE_ADVANCE_MS = 5000;
const RATING_IDLE_RESTART_MS = 5000;

export default function KioskPage() {
  const { ready, user } = useAuth();
  const { theme, toggle } = useTheme();
  const { settings, logo } = useSettings();
  const navigate = useNavigate();

  const [boot] = useState(() => readKioskState());
  const [step, setStep] = useState<Step>(boot?.step ?? 'select');
  const [session, setSession] = useState<KioskSessionInfo | null>(boot?.session ?? null);
  const [questionIndex, setQuestionIndex] = useState(boot?.questionIndex ?? 0);
  const [selected, setSelected] = useState<string[]>(boot?.selected ?? []);
  const [exitOpen, setExitOpen] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [branchId, setBranchId] = useState(boot?.branchId ?? '');
  const [registerId, setRegisterId] = useState(boot?.registerId ?? '');
  const [cashierId, setCashierId] = useState(boot?.cashierId ?? '');
  const [selectError, setSelectError] = useState('');

  const pending = useSyncExternalStore(subscribeOutbox, getPendingCount);
  const sending = useSyncExternalStore(subscribeOutbox, isSending);
  const outboxIssue = useSyncExternalStore(subscribeOutbox, getOutboxIssue);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  const flush = useCallback(() => {
    void flushOutbox();
  }, []);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      flush();
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [flush]);

  useEffect(() => {
    flush();
  }, [flush]);

  // Mientras haya encuestas pendientes se reintenta cada 30 s (no solo al terminar otra
  // encuesta o al volver la conexión).
  useEffect(() => {
    if (pending === 0) return;
    const timer = window.setInterval(flush, 30_000);
    return () => window.clearInterval(timer);
  }, [pending, flush]);

  // Latido: mantiene viva la sesión del kiosko (expiración deslizante).
  useEffect(() => {
    const ping = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      api('/api/auth/me').catch(() => undefined);
    };
    ping();
    const timer = window.setInterval(ping, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    apiCached<{ items: Branch[] }>('/api/catalog/branches')
      .then((res) => {
        setBranches(res.items);
        const preferred = res.items.find((b) => /super\s*nallely/i.test(b.name)) ?? res.items[0];
        if (preferred) setBranchId((current) => current || String(preferred.id));
      })
      .catch(() => setSelectError('No se pudo conectar con el servidor'));
  }, []);

  const prevBranchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!branchId) {
      setRegisters([]);
      setCashiers([]);
      return;
    }
    if (prevBranchRef.current !== null && prevBranchRef.current !== branchId) {
      setRegisterId('');
      setCashierId('');
    }
    prevBranchRef.current = branchId;
    Promise.all([
      apiCached<{ items: Register[] }>(`/api/catalog/registers?branch_id=${branchId}`),
      apiCached<{ items: Cashier[] }>(`/api/catalog/cashiers?branch_id=${branchId}`),
    ])
      .then(([r, c]) => {
        setRegisters(r.items);
        setCashiers(c.items);
      })
      .catch(() => setSelectError('No se pudieron cargar las cajas y cajeros(as)'));
  }, [branchId]);

  useEffect(() => {
    saveKioskState({ step, session, branchId, registerId, cashierId, questionIndex, selected });
  }, [step, session, branchId, registerId, cashierId, questionIndex, selected]);

  useEffect(() => {
    if (step !== 'question') return;
    if (selected.length === 0) return;

    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setStep('rating'), QUESTION_IDLE_ADVANCE_MS);
    };
    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'pointermove',
      'touchstart',
      'touchmove',
      'mousemove',
      'keydown',
      'wheel',
    ];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();

    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [step, selected]);

  useEffect(() => {
    if (step !== 'rating') return;
    const timer = window.setTimeout(() => {
      finish(null);
    }, RATING_IDLE_RESTART_MS);
    return () => window.clearTimeout(timer);
  }, [step]);

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-ink">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8 text-brand-600" />
          <p className="text-sm text-muted">Cargando…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const question = QUESTIONS[questionIndex];

  const confirmSelection = () => {
    setSelectError('');
    const branch = branches.find((b) => String(b.id) === branchId);
    const register = registers.find((r) => String(r.id) === registerId);
    const cashier = cashiers.find((c) => String(c.id) === cashierId);
    if (!branch || !register || !cashier) {
      setSelectError('Selecciona tienda, caja y cajero(a)');
      return;
    }
    setSession({
      branch: { id: branch.id, name: branch.name },
      register: { id: register.id, name: register.name },
      cashier: { id: cashier.id, name: cashier.name },
    });
    start();
  };

  const toggleOption = (option: string) => {
    setSelected((current) => {
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : isExclusiveOption(option)
          ? [option]
          : [...current.filter((o) => !isExclusiveOption(o)), option];
      saveDraft(question.id, next);
      return next;
    });
  };

  const start = useCallback(() => {
    const idx = getQuestionIndex();
    setQuestionIndex(idx);
    const draft = readDraft();
    if (draft && draft.questionId === QUESTIONS[idx].id) {
      setSelected(draft.selected);
    } else {
      clearDraft();
      setSelected([]);
    }
    setStep('question');
  }, []);

  const finish = (ratingValue: RatingValue | null) => {
    if (!session) return;
    const payload = {
      client_uuid: makeUuid(),
      branch_id: session.branch.id,
      register_id: session.register.id,
      cashier_id: session.cashier.id,
      areas: question.id === 'areas' ? selected : [],
      dislikes: question.id === 'dislikes' ? selected : [],
      likes: question.id === 'likes' ? selected : [],
      rating: ratingValue,
      client_ts: new Date().toISOString(),
    };
    enqueueSurvey(payload);
    flush();
    clearDraft();
    startCooldown(SURVEY_COOLDOWN_MS);
    advanceQuestionIndex(QUESTIONS.length);
    setStep('thanks');
  };

  const surveyInProgress = step === 'question' || step === 'rating';
  const exitMessage = surveyInProgress
    ? 'Tienes una encuesta en curso. Si sales ahora, se guardará y podrás continuar después.'
    : '¿Deseas salir de Mi encuesta? Volverás al menú.';

  const offlineOpen = !online || pending > 0;
  // Estado real de la cola: "Enviando" solo mientras de verdad se envía.
  const outboxText = !online
    ? `Sin conexión (${pending})`
    : outboxIssue === 'access'
      ? `${pending} sin enviar: abre el enlace privado`
      : outboxIssue === 'auth'
        ? `${pending} sin enviar: inicia sesión de nuevo`
        : sending
          ? `Enviando ${pending}…`
          : `${pending} por enviar (se reintenta solo)`;
  const subtitle =
    step === 'select' || !session
      ? 'Nueva encuesta'
      : `${session.register.name} · ${session.cashier.name}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 text-ink backdrop-blur sm:px-6">
        <div className="flex items-center gap-2.5">
          <StoreLogo
            name={settings.store_name}
            logo={logo}
            className="h-9 w-9 rounded-xl ring-1 ring-line"
          />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">{settings.store_name}</p>
            <p className="hidden text-[11px] text-muted sm:block">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {offlineOpen && (
            <span
              title={outboxText}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                !online || outboxIssue
                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'
                  : 'bg-faint text-muted'
              }`}
            >
              {!online || outboxIssue ? (
                <IconCloudOff className="h-4 w-4" />
              ) : (
                <IconCloudCheck className={`h-4 w-4 ${sending ? 'animate-pulse' : ''}`} />
              )}
              <span className="sm:hidden">{pending}</span>
              <span className="hidden sm:inline">{outboxText}</span>
            </span>
          )}
          <FailedOutbox />
          <ThemeToggleButton onClick={toggle} theme={theme} />
          <button
            onClick={() => setExitOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-full bg-faint px-3 text-xs font-semibold text-ink/80 transition hover:bg-hairline"
          >
            <IconLogout className="h-4 w-4" />
            Salir
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col bg-canvas">
        {step === 'select' && (
          <div className="flex flex-1 items-center justify-center px-4 py-10">
            <div className="card w-full max-w-md p-6 sm:p-7">
              <h1 className="text-lg font-semibold tracking-tight">Antes de empezar</h1>
              <p className="mt-0.5 text-[13px] text-muted">
                Indica dónde y quién atiende esta encuesta.
              </p>

              {selectError && (
                <div className="anim-pop mt-4 rounded-xl border border-red-600/20 bg-red-50 px-3 py-2 text-[13px] text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {selectError}
                </div>
              )}

              <div className="mt-4 space-y-3.5">
                <div>
                  <label className="eyebrow mb-1 block" htmlFor="k-branch">
                    Tienda
                  </label>
                  <Select
                    id="tienda"
                    value={branchId}
                    onChange={setBranchId}
                    placeholder="Selecciona una tienda…"
                    options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  />
                </div>
                <div>
                  <label className="eyebrow mb-1 block" htmlFor="k-register">
                    Caja
                  </label>
                  <Select
                    id="caja"
                    value={registerId}
                    onChange={setRegisterId}
                    disabled={!branchId}
                    placeholder={branchId ? 'Selecciona una caja…' : 'Primero elige la tienda'}
                    options={registers.map((r) => ({ value: r.id, label: r.name }))}
                  />
                </div>
                <div>
                  <label className="eyebrow mb-1 block" htmlFor="cajero">
                    Cajero(a)
                  </label>
                  <Select
                    id="cajero"
                    value={cashierId}
                    onChange={setCashierId}
                    disabled={!branchId}
                    placeholder={branchId ? 'Selecciona quién atiende…' : 'Primero elige la tienda'}
                    options={cashiers.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </div>
                <button
                  onClick={confirmSelection}
                  disabled={!branchId || !registerId || !cashierId}
                  className="btn-primary group h-11 w-full text-sm"
                >
                  Continuar
                  <IconChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'question' && (
          <QuestionScreen
            question={question}
            selected={selected}
            onToggle={toggleOption}
            onNext={() => setStep('rating')}
            onBack={() => setStep('select')}
          />
        )}

        {step === 'rating' && (
          <FacesScreen onSelect={finish} onBack={() => setStep('question')} />
        )}

        {step === 'thanks' && (
          <ThanksScreen onRestart={start} cooldownMs={SURVEY_COOLDOWN_MS} />
        )}
      </main>

      <ConfirmDialog
        open={exitOpen}
        title="Salir de la encuesta"
        message={exitMessage}
        confirmLabel="Salir"
        cancelLabel="Continuar aquí"
        onConfirm={() => {
          setExitOpen(false);
          clearKioskState();
          navigate('/app');
        }}
        onClose={() => setExitOpen(false)}
      />
    </div>
  );
}
