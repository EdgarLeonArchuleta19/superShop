import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import type { Branch, Register } from '../../lib/types';
import { Modal, Spinner } from '../../components/Modal';
import Select from '../../components/Select';
import { IconAlert, IconCheck, IconTablet } from '../../components/Icons';
import { SURVEY_ICON } from '../../components/StoreLogo';
import { PUBLIC_URL } from '../../lib/domain';
import { useSettings } from '../../lib/settings';

/*
 * Vincular dispositivos → "SuperShop Survey" (QR). La lista de tablets está en Registro de accesos.
 * El QR lleva un código de un solo uso que vence en 5 minutos y se renueva solo mientras
 * la pantalla está abierta; la pantalla pregunta cada pocos segundos si ya lo escanearon
 * (como WhatsApp Web). Ver backend/src/routes/devices.js.
 */

/** Dirección de esta computadora en la red de la tienda (QR en la app de escritorio). */
export interface PairingAddress {
  label: string;
  url: string;
}

interface Pairing {
  id: number;
  code: string;
  ttl_ms: number;
  /** Vencimiento según el reloj de este equipo (el del servidor puede no coincidir). */
  localExpires: number;
}

interface PairedDevice {
  id: number;
  name: string;
  branch: { id: number; name: string } | null;
  register: { id: number; name: string } | null;
}

const POLL_MS = 2500;
/** Renovaciones automáticas del QR (5 min cada una) antes de pedir que se genere otro. */
const MAX_RENEWALS = 6;

function pairingLink(address: string, code: string, accessKey: string | null): string {
  const params = new URLSearchParams({ codigo: code });
  if (accessKey) params.set('acceso', accessKey);
  return `${address}/encuestas/vincular?${params.toString()}`;
}

/** "Chrome · Android", "App de escritorio · Windows"… a partir del navegador. */
export function describeAgent(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  const os = /iPad/.test(ua)
    ? 'iPad'
    : /iPhone/.test(ua)
      ? 'iPhone'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  const app = /Electron\//.test(ua)
    ? 'App de escritorio'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /SamsungBrowser\//.test(ua)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Navegador';
  return os ? `${app} · ${os}` : app;
}

/** Tienda + caja de una tablet (catálogo activo). */
function usePlaces(branchId: string) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);

  useEffect(() => {
    api<{ items: Branch[] }>('/api/catalog/branches')
      .then((res) => setBranches(res.items))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (!branchId) {
      setRegisters([]);
      return;
    }
    api<{ items: Register[] }>(`/api/catalog/registers?branch_id=${branchId}`)
      .then((res) => setRegisters(res.items))
      .catch(() => setRegisters([]));
  }, [branchId]);

  return { branches, registers };
}

function PlaceFields({
  branchId,
  registerId,
  name,
  onBranch,
  onRegister,
  onName,
  namePlaceholder,
}: {
  branchId: string;
  registerId: string;
  name: string;
  onBranch: (v: string) => void;
  onRegister: (v: string) => void;
  onName: (v: string) => void;
  namePlaceholder: string;
}) {
  const { branches, registers } = usePlaces(branchId);
  // Con una sola tienda, se selecciona sola; la caja siempre se elige.
  useEffect(() => {
    if (!branchId && branches.length === 1) onBranch(String(branches[0].id));
  }, [branchId, branches, onBranch]);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="eyebrow mb-1 block" htmlFor="dev-branch">
          Tienda
        </label>
        <Select
          id="dev-branch"
          value={branchId}
          onChange={onBranch}
          placeholder="Selecciona una tienda…"
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      </div>
      <div>
        <label className="eyebrow mb-1 block" htmlFor="dev-register">
          Caja
        </label>
        <Select
          id="dev-register"
          value={registerId}
          onChange={onRegister}
          disabled={!branchId}
          placeholder={branchId ? 'Selecciona una caja…' : 'Primero elige la tienda'}
          options={registers.map((r) => ({ value: r.id, label: r.name }))}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="eyebrow mb-1 block" htmlFor="dev-name">
          Nombre de la tablet <span className="normal-case text-muted">(opcional)</span>
        </label>
        <input
          id="dev-name"
          className="input"
          value={name}
          maxLength={60}
          onChange={(e) => onName(e.target.value)}
          placeholder={namePlaceholder}
        />
      </div>
    </div>
  );
}

/**
 * Hacia dónde apuntan los QR (SuperShop y SuperShop Survey):
 * - Versión web: el dominio fijo de SuperShop (lib/domain.ts), porque está en internet.
 * - App de escritorio: la IP de esta computadora en la red de la tienda (http, sin
 *   certificado), porque está pensada para funcionar en el wifi de la tienda.
 */
export function useQrTarget(localAddresses: PairingAddress[]) {
  const cloud = !!useSettings().settings.cloud;
  const [index, setIndex] = useState(0);
  const localAddress = localAddresses[Math.min(index, localAddresses.length - 1)] ?? null;
  const url = cloud ? PUBLIC_URL : (localAddress?.url ?? null);
  return { cloud, url, index, setIndex, localAddresses };
}

/** Escritorio: aviso de red local y, si la computadora tiene varias IP, cuál usar. */
export function QrAddressPicker({ target }: { target: ReturnType<typeof useQrTarget> }) {
  const { cloud, localAddresses, index, setIndex } = target;
  if (cloud || localAddresses.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
      <span>Funciona con los equipos conectados al wifi de la tienda.</span>
      {localAddresses.length > 1 && (
        <>
          <span>¿No abre? Prueba:</span>
          {localAddresses.map((a, i) => (
            <button
              key={a.url}
              onClick={() => setIndex(i)}
              className={`rounded-full px-2.5 py-1 font-semibold ${
                i === Math.min(index, localAddresses.length - 1)
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'bg-faint text-ink/70 hover:text-ink'
              }`}
            >
              {a.label}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

/** Escritorio sin red local: no hay dirección para el QR. */
export function NoNetworkNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-faint px-3.5 py-3 text-[13px] text-muted">
      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p>Conecta esta computadora al wifi o módem de la tienda para generar el código.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QR de "SuperShop Survey"
// ---------------------------------------------------------------------------

export function SurveyPairingCard({
  localAddresses,
  accessKey,
  onPaired,
}: {
  localAddresses: PairingAddress[];
  accessKey: string | null;
  onPaired?: () => void;
}) {
  const toast = useToast();
  const [branchId, setBranchId] = useState('');
  const [registerId, setRegisterId] = useState('');
  const [name, setName] = useState('');
  const target = useQrTarget(localAddresses);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [renewals, setRenewals] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [paired, setPaired] = useState<PairedDevice | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const request = useRef({ branchId, registerId, name });
  const renewing = useRef(false);

  const generate = useCallback(async () => {
    const { branchId: b, registerId: r, name: n } = request.current;
    setBusy(true);
    try {
      const res = await api<Omit<Pairing, 'localExpires'>>('/api/admin/devices/pairing', {
        method: 'POST',
        body: { branch_id: Number(b), register_id: Number(r), name: n.trim() },
      });
      setPairing({ ...res, localExpires: Date.now() + res.ttl_ms });
      setNow(Date.now());
      return true;
    } catch (err) {
      toast.error('No se pudo generar el código', err instanceof Error ? err.message : undefined);
      setPairing(null);
      return false;
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const start = async () => {
    request.current = { branchId, registerId, name };
    setPaired(null);
    setStalled(false);
    setRenewals(0);
    await generate();
  };

  const cancel = () => {
    setPairing(null);
    setStalled(false);
  };

  // Cuenta regresiva del código en pantalla.
  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  // Mientras el QR está en pantalla: ¿ya lo escanearon? Al vencer, se renueva solo.
  useEffect(() => {
    if (!pairing) return;
    let alive = true;
    const tick = async () => {
      if (renewing.current) return;
      try {
        const res = await api<{ status: 'pending' | 'used' | 'expired'; device?: PairedDevice }>(
          `/api/admin/devices/pairing/${pairing.id}`
        );
        if (!alive) return;
        if (res.status === 'used' && res.device) {
          setPairing(null);
          setPaired(res.device);
          toast.create('Tablet vinculada', `${res.device.name} ya puede recibir encuestas.`);
          onPaired?.();
        } else if (res.status === 'expired' || pairing.localExpires <= Date.now()) {
          if (renewals + 1 >= MAX_RENEWALS) {
            setPairing(null);
            setStalled(true);
          } else {
            renewing.current = true;
            setRenewals((n) => n + 1);
            void generate().finally(() => {
              renewing.current = false;
            });
          }
        }
      } catch {
        /* sin conexión con el servidor: se reintenta en el siguiente ciclo */
      }
    };
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [pairing, renewals, generate, onPaired, toast]);

  const remainingS = pairing ? Math.max(0, Math.ceil((pairing.localExpires - now) / 1000)) : 0;
  const link = pairing && target.url ? pairingLink(target.url, pairing.code, accessKey) : null;

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start gap-3">
        <img src={SURVEY_ICON} alt="" className="h-10 w-10 shrink-0 rounded-2xl ring-1 ring-line" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight">SuperShop Survey</h2>
          <p className="text-[12px] text-muted">
            Vincula una tablet que solo mostrará encuestas a los clientes: sin usuario ni contraseña y fija a una caja.
          </p>
        </div>
      </div>

      {!target.url ? (
        <NoNetworkNotice />
      ) : pairing && link ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <div className="rounded-2xl bg-white p-2 ring-1 ring-line">
            <QRCodeSVG
              value={link}
              size={196}
              level="Q"
              marginSize={1}
              bgColor="#ffffff"
              fgColor="#0f172a"
              imageSettings={{ src: SURVEY_ICON, height: 40, width: 40, excavate: true }}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <ol className="space-y-1.5 text-[13px] text-ink/80">
              <li>1. Abre la cámara de la tablet y apunta a este código.</li>
              <li>2. Toca el enlace que aparece: la tablet se vincula sola.</li>
              <li>3. Para tenerla a pantalla completa, agrégala a la pantalla de inicio.</li>
            </ol>
            <p className="flex items-center gap-2 text-[12px] text-muted">
              <Spinner className="h-3.5 w-3.5" />
              Esperando que lo escaneen… el código se renueva en {Math.floor(remainingS / 60)}:
              {String(remainingS % 60).padStart(2, '0')}
            </p>
            <button onClick={cancel} className="btn-ghost h-9 px-3.5 text-[13px]">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {paired && (
            <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 px-3.5 py-3 text-[13px] text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
              <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{paired.name}</strong> quedó vinculada. Puedes vincular otra tablet.
              </span>
            </div>
          )}
          {stalled && (
            <div className="flex items-start gap-2.5 rounded-xl bg-faint px-3.5 py-3 text-[13px] text-muted">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>El código dejó de renovarse porque nadie lo escaneó. Genera uno nuevo cuando tengas la tablet.</span>
            </div>
          )}
          <PlaceFields
            branchId={branchId}
            registerId={registerId}
            name={name}
            onBranch={(v) => {
              setBranchId(v);
              setRegisterId('');
            }}
            onRegister={setRegisterId}
            onName={setName}
            namePlaceholder="Se usa la caja y la tienda, p. ej. Caja 1 · Centro"
          />
          <div className="flex justify-end">
            <button
              onClick={() => void start()}
              disabled={busy || !branchId || !registerId}
              className="btn-primary h-10 px-5 text-sm"
            >
              {busy ? <Spinner className="h-4 w-4" /> : <IconTablet className="h-4 w-4" />}
              Generar código QR
            </button>
          </div>
        </div>
      )}
      <QrAddressPicker target={target} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Editar tablet (Registro de accesos)
// ---------------------------------------------------------------------------

/** Lo que se edita de una tablet: nombre, tienda y caja. */
export interface EditableTablet {
  id: number;
  name: string;
  branch_id: number | null;
  register_id: number | null;
}

export function EditKioskModal({
  kiosk,
  busy,
  onClose,
  onSave,
}: {
  kiosk: EditableTablet;
  busy: boolean;
  onClose: () => void;
  onSave: (body: { name: string; branch_id: number; register_id: number }) => void;
}) {
  const [branchId, setBranchId] = useState(kiosk.branch_id ? String(kiosk.branch_id) : '');
  const [registerId, setRegisterId] = useState(kiosk.register_id ? String(kiosk.register_id) : '');
  const [name, setName] = useState(kiosk.name);

  return (
    <Modal
      open
      title="Editar tablet"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost h-11 px-5 text-sm">
            Cancelar
          </button>
          <button
            onClick={() => onSave({ name: name.trim(), branch_id: Number(branchId), register_id: Number(registerId) })}
            disabled={busy || !branchId || !registerId || !name.trim()}
            className="btn-primary h-11 px-5 text-sm"
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <PlaceFields
        branchId={branchId}
        registerId={registerId}
        name={name}
        onBranch={(v) => {
          setBranchId(v);
          setRegisterId('');
        }}
        onRegister={setRegisterId}
        onName={setName}
        namePlaceholder="Nombre de la tablet"
      />
      <p className="mt-3 text-[12px] text-muted">La tablet toma los cambios en unos minutos, sin volver a escanear.</p>
    </Modal>
  );
}
