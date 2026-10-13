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
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void;
export function setToken(_role: TokenRole, token: string): void;
export function setToken(a: string, b?: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, b ?? a);
  } catch {
    /* ignorar */
  }
}

export function clearToken(_role?: TokenRole): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignorar */
  }
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; role?: TokenRole } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new NetError();
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
