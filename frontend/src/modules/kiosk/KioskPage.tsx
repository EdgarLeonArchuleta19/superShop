import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useKioskDevice, useSurveyAppManifest } from '../../lib/device';
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
import type { KioskSessionInfo, RatingValue } from '../../lib/types';
import type { Step } from './kioskTypes';
import {
  advanceQuestionIndex,
  clearDraft,
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
import { ThemeToggleButton } from '../../components/Modal';
import { IconCloudCheck, IconCloudOff } from '../../components/Icons';
import QuestionScreen from './screens/QuestionScreen';
import FacesScreen from './screens/FacesScreen';
import ThanksScreen from './screens/ThanksScreen';
import FailedOutbox from './FailedOutbox';
import DeviceNotice from './DeviceNotice';

const QUESTION_IDLE_ADVANCE_MS = 5000;
const RATING_IDLE_RESTART_MS = 5000;

/**
 * "SuperShop Survey": la pantalla de la tablet vinculada. No tiene inicio de sesión ni
 * salida: la tienda y la caja vienen de la vinculación y la encuesta arranca sola. Por
 * ahora no se elige cajero(a): las encuestas se guardan sin cajero(a).
 */
export default function KioskPage() {
  useSurveyAppManifest();
  const { status, device } = useKioskDevice();
  const { theme, toggle } = useTheme();
  const { settings, logo } = useSettings();

  const [boot] = useState(() => readKioskState());
  const [step, setStep] = useState<Step>(boot?.step ?? 'select');
  const [session, setSession] = useState<KioskSessionInfo | null>(boot?.session ?? null);
  const [questionIndex, setQuestionIndex] = useState(boot?.questionIndex ?? 0);
  const [selected, setSelected] = useState<string[]>(boot?.selected ?? []);

  const branch = device?.branch ?? null;
  const register = device?.register ?? null;
  const branchId = branch ? String(branch.id) : '';
  const registerId = register ? String(register.id) : '';

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

  useEffect(() => {
    saveKioskState({ step, session, branchId, registerId, cashierId: '', questionIndex, selected });
  }, [step, session, branchId, registerId, questionIndex, selected]);

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

  const question = QUESTIONS[questionIndex];

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

  // La tienda y la caja vienen de la tablet: la encuesta arranca sola. Si desde el panel le
  // cambian la tienda o la caja, se aplica sin reiniciarla.
  useEffect(() => {
    if (!branch || !register) return;
    const changed =
      !session ||
      session.cashier !== null ||
      session.branch.id !== branch.id ||
      session.register.id !== register.id ||
      session.register.name !== register.name;
    if (changed) setSession({ branch, register, cashier: null });
    if (step === 'select') start();
  }, [branch, register, session, step, start]);

  const finish = (ratingValue: RatingValue | null) => {
    if (!session) return;
    const payload = {
      client_uuid: makeUuid(),
      branch_id: session.branch.id,
      register_id: session.register.id,
      cashier_id: session.cashier?.id ?? null,
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

  const offlineOpen = !online || pending > 0;
  // Estado real de la cola: "Enviando" solo mientras de verdad se envía.
  const outboxText = !online
    ? `Sin conexión (${pending})`
    : outboxIssue === 'access'
      ? `${pending} sin enviar: abre el enlace privado`
      : outboxIssue === 'auth'
        ? `${pending} sin enviar: la tablet no está vinculada`
        : sending
          ? `Enviando ${pending}…`
          : `${pending} por enviar (se reintenta solo)`;
  const subtitle =
    step === 'select' || !session
      ? register
        ? `${register.name} · Encuestas`
        : 'Encuestas'
      : `${session.register.name} · ${session.branch.name}`;

  if (status !== 'paired') return <DeviceNotice status={status} pending={pending} />;
  if (!branch || !register) return <DeviceNotice status="no-place" pending={pending} />;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 text-ink backdrop-blur sm:px-6">
        <div className="flex items-center gap-2.5">
          <StoreLogo
            app="survey"
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
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col bg-canvas">
        {step === 'question' && (
          <QuestionScreen
            question={question}
            selected={selected}
            onToggle={toggleOption}
            onNext={() => setStep('rating')}
          />
        )}

        {step === 'rating' && (
          <FacesScreen onSelect={finish} onBack={() => setStep('question')} />
        )}

        {step === 'thanks' && (
          <ThanksScreen onRestart={start} cooldownMs={SURVEY_COOLDOWN_MS} />
        )}
      </main>
    </div>
  );
}
