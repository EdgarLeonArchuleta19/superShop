import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { useSettings } from '../../lib/settings';
import { enqueueSurvey, flushOutbox, getPendingCount, subscribeOutbox } from '../../lib/offline';
import type { Branch, Cashier, KioskSessionInfo, Register } from '../../lib/types';
import type { Step } from './kioskTypes';
import {
  advanceQuestionIndex,
  clearDraft,
  getQuestionIndex,
  makeUuid,
  readDraft,
  saveDraft,
  startCooldown,
  SURVEY_COOLDOWN_MS,
} from './kioskTypes';
import { QUESTIONS, isExclusiveOption } from '../../lib/questions';
import { ConfirmDialog, Spinner, ThemeToggleButton } from '../../components/Modal';
import Select from '../../components/Select';
import { IconChevronRight, IconCloudCheck, IconCloudOff, IconLogout } from '../../components/Icons';
import HomeScreen from './screens/HomeScreen';
import QuestionScreen from './screens/QuestionScreen';
import FacesScreen from './screens/FacesScreen';
import ThanksScreen from './screens/ThanksScreen';

export default function KioskPage() {
  const { ready, user } = useAuth();
  const { theme, toggle } = useTheme();
  const { settings, logo } = useSettings();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('select');
  const [session, setSession] = useState<KioskSessionInfo | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [exitOpen, setExitOpen] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [branchId, setBranchId] = useState('');
  const [registerId, setRegisterId] = useState('');
  const [cashierId, setCashierId] = useState('');
  const [selectError, setSelectError] = useState('');

  const pending = useSyncExternalStore(subscribeOutbox, getPendingCount);
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

  useEffect(() => {
    api<{ items: Branch[] }>('/api/branches?active=1')
      .then((res) => {
        setBranches(res.items);
        const preferred = res.items.find((b) => /super\s*nallely/i.test(b.name)) ?? res.items[0];
        if (preferred) setBranchId(String(preferred.id));
      })
      .catch(() => setSelectError('No se pudo conectar con el servidor'));
  }, []);

  useEffect(() => {
    if (!branchId) {
      setRegisters([]);
      setCashiers([]);
      return;
    }
    setRegisterId('');
    setCashierId('');
    Promise.all([
      api<{ items: Register[] }>(`/api/branches/${branchId}/registers?active=1`),
      api<{ items: Cashier[] }>(`/api/branches/${branchId}/cashiers?active=1`),
    ])
      .then(([r, c]) => {
        setRegisters(r.items);
        setCashiers(c.items);
      })
      .catch(() => setSelectError('No se pudieron cargar las cajas y cajeros(as)'));
  }, [branchId]);

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
    setStep('home');
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

  const start = () => {
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
  };

  const restart = useCallback(() => {
    clearDraft();
    setSelected([]);
    setStep('home');
  }, []);

  const finish = (ratingValue: number) => {
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
  const subtitle =
    step === 'select' || !session
      ? 'Nueva encuesta'
      : `${session.register.name} · ${session.cashier.name}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 text-ink backdrop-blur sm:px-6">
        <div className="flex items-center gap-2.5">
          <img
            src={logo}
            alt={settings.store_name}
            className="h-9 w-9 rounded-xl object-cover ring-1 ring-line"
          />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">{settings.store_name}</p>
            <p className="hidden text-[11px] text-muted sm:block">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {offlineOpen && (
            <span
              className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:flex ${
                !online
                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'
                  : 'bg-faint text-muted'
              }`}
            >
              {!online ? (
                <IconCloudOff className="h-4 w-4" />
              ) : (
                <IconCloudCheck className="h-4 w-4" />
              )}
              {!online ? `Sin conexión (${pending})` : `Enviando ${pending}…`}
            </span>
          )}
          <ThemeToggleButton onClick={toggle} theme={theme} variant="light" />
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

        {step === 'home' && session && (
          <HomeScreen session={session} onStart={start} />
        )}

        {step === 'question' && (
          <QuestionScreen
            question={question}
            selected={selected}
            onToggle={toggleOption}
            onNext={() => setStep('rating')}
            onBack={restart}
          />
        )}

        {step === 'rating' && (
          <FacesScreen onSelect={finish} onBack={() => setStep('question')} />
        )}

        {step === 'thanks' && (
          <ThanksScreen onRestart={restart} cooldownMs={SURVEY_COOLDOWN_MS} />
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
          navigate('/app');
        }}
        onClose={() => setExitOpen(false)}
      />
    </div>
  );
}
