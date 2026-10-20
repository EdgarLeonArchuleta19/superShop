export type TokenRole = 'admin' | 'kiosk';

const TOKEN_KEY = 'nallely.token';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class NetError extends Error {
  constructor(message = 'Sin conexión con el servidor') {
    super(message);
    this.name = 'NetError';
  }
}

export function getToken(_role?: TokenRole): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void;
export function setToken(_role: TokenRole, token: string): void;
export function setToken(a: string, b?: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, b ?? a);
  } catch {
    /* ignorar */
  }
}

export function clearToken(_role?: TokenRole): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignorar */
  }
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; role?: TokenRole; /** Corta la petición (NetError) si tarda más. */ timeoutMs?: number } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = opts.timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs) : null;
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller?.signal,
    });
  } catch {
    throw new NetError();
  } finally {
    if (timer) clearTimeout(timer);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : 'Error del servidor';
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

const CACHE_PREFIX = 'nallely.cache.';

/**
 * Igual que `api`, pero guarda la respuesta en localStorage y la devuelve
 * como respaldo cuando no hay conexión. Pensado para catálogos (tiendas,
 * cajas, cajeros) que el kiosko necesita para arrancar sin internet.
 */
export async function apiCached<T>(path: string): Promise<T> {
  try {
    const res = await api<T>(path);
    try {
      localStorage.setItem(CACHE_PREFIX + path, JSON.stringify(res));
    } catch {
      /* almacenamiento lleno: se ignora */
    }
    return res;
  } catch (err) {
    if (err instanceof NetError) {
      try {
        const raw = localStorage.getItem(CACHE_PREFIX + path);
        if (raw) return JSON.parse(raw) as T;
      } catch {
        /* cache inválida: se propaga el error original */
      }
    }
    throw err;
  }
}
