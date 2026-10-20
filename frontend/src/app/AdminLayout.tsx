import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { sessionLabel, timeAgo } from '../lib/format';
import { useSettings } from '../lib/settings';
import type { ActivityResponse, AuthUser } from '../lib/types';
import { can } from '../lib/permissions';
import { ThemeToggleButton, ConfirmDialog } from '../components/Modal';
import {
  IconBarChart2,
  IconBell,
  IconChevronDown,
  IconChevronRight,
  IconClipboard,
  IconCloudCheck,
  IconFileArchive,
  IconGrid,
  IconImage,
  IconInfo,
  IconLogout,
  IconMenu,
  IconRegister,
  IconSettings,
  IconShield,
  IconStore,
  IconUser,
  IconUsers,
  IconX,
} from '../components/Icons';

type IconType = (p: { className?: string }) => React.ReactElement;

/** `perm`: permiso requerido (lib/permissions.ts). Sin `perm` lo ve todo usuario; `'admin'` solo el Administrador. */
interface Leaf {
  to: string;
  label: string;
  icon: IconType;
  perm?: string;
  external?: boolean;
  /** Solo existe en la app de escritorio (se oculta en la versión web). */
  desktopOnly?: boolean;
}
type MenuEntry =
  | { kind: 'link'; to: string; label: string; icon: IconType; end?: boolean; perm?: string }
  | { kind: 'group'; id: string; label: string; icon: IconType; children: Leaf[] };

const MENU: MenuEntry[] = [
  {
    kind: 'link',
    to: '/app',
    label: 'Panel de control',
    icon: IconGrid,
    end: true,
    perm: 'panel',
  },
  {
    kind: 'group',
    id: 'encuestas',
    label: 'Encuestas',
    icon: IconClipboard,
    children: [
      { to: '/app/encuestas/estadisticas', label: 'Estadísticas', icon: IconBarChart2, perm: 'surveys.stats' },
      { to: '/mi-encuesta', label: 'Mi encuesta', icon: IconUser, perm: 'surveys.kiosk', external: true },
      { to: '/app/encuestas/respuestas', label: 'Respuestas', icon: IconFileArchive, perm: 'surveys.responses' },
    ],
  },
  {
    kind: 'group',
    id: 'catalogos',
    label: 'Catálogos',
    icon: IconStore,
    children: [
      { to: '/app/catalogos/tiendas', label: 'Tiendas', icon: IconImage, perm: 'catalog.branches' },
      { to: '/app/catalogos/cajas', label: 'Cajas', icon: IconRegister, perm: 'catalog.registers' },
      { to: '/app/catalogos/cajeros', label: 'Cajeros(as)', icon: IconUsers, perm: 'catalog.cashiers' },
    ],
  },
  {
    kind: 'group',
    id: 'ajustes',
    label: 'Ajustes',
    icon: IconSettings,
    children: [
      { to: '/app/ajustes/perfil', label: 'Perfil', icon: IconUser },
      { to: '/app/ajustes/usuarios', label: 'Usuarios', icon: IconUsers, perm: 'settings.users' },
      { to: '/app/ajustes/roles', label: 'Roles y permisos', icon: IconShield, perm: 'admin' },
      { to: '/app/ajustes/respaldos', label: 'Respaldos e Importaciones', icon: IconFileArchive, perm: 'settings.backups', desktopOnly: true },
      { to: '/app/ajustes/informacion', label: 'Información', icon: IconInfo, perm: 'settings.info' },
      { to: '/app/ajustes/conectar', label: 'Vincular dispositivos', icon: IconCloudCheck, perm: 'settings.connect' },
    ],
  },
];

const TITLES: Record<string, string> = {
  '/app': 'Panel de control',
  '/app/encuestas/respuestas': 'Respuestas',
  '/app/encuestas/estadisticas': 'Estadísticas',
  '/app/catalogos/tiendas': 'Tiendas',
  '/app/catalogos/cajas': 'Cajas',
  '/app/catalogos/cajeros': 'Cajeros(as)',
  '/app/ajustes/perfil': 'Perfil',
  '/app/ajustes/usuarios': 'Usuarios',
  '/app/ajustes/roles': 'Roles y permisos',
  '/app/ajustes/respaldos': 'Respaldos e Importaciones',
  '/app/ajustes/informacion': 'Información',
  '/app/ajustes/conectar': 'Vincular dispositivos',
};

/** Cierre automático por inactividad en el panel admin. 30 minutos. */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
] as const;

interface Notif {
  id: number;
  title: string;
  message: string;
  tone?: 'info' | 'danger';
}

function useVisibleMenu(user: AuthUser | null) {
  const { settings } = useSettings();
  const cloud = !!settings.cloud;
  return useMemo(() => {
    const entries: MenuEntry[] = [];
    for (const entry of MENU) {
      if (entry.kind === 'link') {
        if (can(user, entry.perm)) entries.push(entry);
      } else {
        const children = entry.children.filter((c) => can(user, c.perm) && !(cloud && c.desktopOnly));
        if (children.length) entries.push({ ...entry, children });
      }
    }
    return entries;
  }, [user, cloud]);
}

function NavList({
  user,
  onNavigate,
  collapsed,
}: {
  user: AuthUser | null;
  onNavigate: () => void;
  collapsed: boolean;
}) {
  const location = useLocation();
  const menu = useVisibleMenu(user);

  const activeGroupId = useMemo(() => {
    for (const entry of menu) {
      if (entry.kind !== 'group') continue;
      if (entry.children.some((c) => c.to === location.pathname)) return entry.id;
    }
    return null;
  }, [menu, location.pathname]);

  const [open, setOpen] = useState<Set<string>>(
    () => new Set(activeGroupId ? [activeGroupId] : [])
  );

  useEffect(() => {
    if (activeGroupId) {
      setOpen((prev) => {
        if (prev.has(activeGroupId)) return prev;
        const next = new Set(prev);
        next.add(activeGroupId);
        return next;
      });
    }
  }, [activeGroupId]);

  const toggleGroup = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (collapsed) {
    const flat: Leaf[] = [];
    for (const entry of menu) {
      if (entry.kind === 'link') flat.push(entry);
      else flat.push(...entry.children);
    }
    return (
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-3">
        {flat.map((leaf) => (
          <NavLink
            key={leaf.to}
            to={leaf.to}
            title={leaf.label}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center justify-center rounded-xl px-0 py-2.5 text-[13px] font-semibold transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'text-ink/70 hover:bg-faint hover:text-ink'
              }`
            }
          >
            <leaf.icon className="h-[18px] w-[18px] shrink-0" />
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-3">
      {menu.map((entry) => {
        if (entry.kind === 'link') {
          return (
            <NavLink
              key={entry.to}
              to={entry.to}
              end={entry.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                    : 'text-ink/70 hover:bg-faint hover:text-ink'
                }`
              }
            >
              <entry.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{entry.label}</span>
            </NavLink>
          );
        }

        const isOpen = open.has(entry.id);
        const groupActive = activeGroupId === entry.id;
        return (
          <div key={entry.id} className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => toggleGroup(entry.id)}
              aria-expanded={isOpen}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                groupActive
                  ? 'text-brand-700 dark:text-brand-300'
                  : 'text-ink/70 hover:bg-faint hover:text-ink'
              }`}
            >
              <entry.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 truncate text-left">{entry.label}</span>
              <IconChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div className="ml-4 flex flex-col gap-0.5 border-l border-line pl-3">
                {entry.children.map((leaf) => (
                  <NavLink
                    key={leaf.to}
                    to={leaf.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                        isActive
                          ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                          : 'text-ink/65 hover:bg-faint hover:text-ink'
                      }`
                    }
                  >
                    <leaf.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{leaf.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Brand({
  collapsed,
  onToggle,
  onClose,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}) {
  useSettings();
  const names = (
    <div className="min-w-0 leading-tight text-left">
      <p className="truncate text-sm font-semibold tracking-tight">SuperShop</p>
      <p className="truncate text-[11px] text-muted">Sistema de administración de tiendas</p>
    </div>
  );

  return (
    <div className="flex h-14 shrink-0 items-center border-b border-line">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          className={`flex h-full w-full items-center transition-colors hover:bg-faint ${
            collapsed ? 'justify-center' : 'justify-between px-3'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <img
              src="/supershop_fondo_azul.png"
              alt="SuperShop"
              className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-line"
            />
            {!collapsed && names}
          </span>
          {!collapsed && <IconChevronRight className="h-4 w-4 rotate-180 text-muted" />}
        </button>
      ) : (
        <div className="flex w-full items-center justify-between px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src="/supershop_fondo_azul.png"
              alt="SuperShop"
              className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-line"
            />
            {names}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="btn-ghost h-9 w-9 shrink-0 lg:hidden"
              aria-label="Cerrar menú"
            >
              <IconX className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UserCard({
  name,
  roleName,
  collapsed,
}: {
  name?: string;
  roleName?: string;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <div className="flex justify-center px-2" title={name || 'Usuario'}>
        <div className="h-9 w-9 rounded-full bg-brand-600 text-center text-sm font-semibold leading-9 text-white">
          {(name || 'U').charAt(0).toUpperCase()}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl bg-faint px-3 py-2.5">
      <div className="h-9 w-9 shrink-0 rounded-full bg-brand-600 text-center text-sm font-semibold leading-9 text-white">
        {(name || 'U').charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-semibold text-ink">{name || 'Usuario'}</p>
        <p className="truncate text-[11px] text-muted">{roleName}</p>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout, refresh } = useAuth();
  const { settings } = useSettings();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === '1'
  );

  const isAdmin = !!user?.is_admin;

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Relee rol y permisos al navegar: si el administrador cambió el rol, el menú se ajusta solo.
  useEffect(() => {
    void refresh();
  }, [location.pathname, refresh]);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    setNotifs([
      {
        id: 1,
        title: 'Bienvenido',
        message: `Hola ${user?.name || 'Usuario'}, bienvenido al panel de ${settings.store_name}.`,
      },
    ]);
  }, [user?.name, settings.store_name]);

  const seenClosures = useRef<Set<number>>(new Set());

  const loadActivity = useCallback(() => {
    if (!isAdmin) return;
    api<ActivityResponse>('/api/admin/activity')
      .then((res) => {
        const fresh = res.recentClosures
          .filter((s) => !seenClosures.current.has(s.id))
          .slice(0, 5);
        if (fresh.length === 0) return;
        fresh.forEach((s) => seenClosures.current.add(s.id));
        setNotifs((prev) => [
          ...fresh.map((s) => ({
            id: 1_000_000 + s.id,
            title: 'Cierre de sesión',
            message: `${sessionLabel(s)} cerró sesión${
              s.closed_at ? ` · ${timeAgo(s.closed_at)}` : ''
            }`,
          })),
          ...prev,
        ]);
      })
      .catch(() => undefined);
  }, [isAdmin]);

  useEffect(() => {
    loadActivity();
    const timer = window.setInterval(loadActivity, 30000);
    return () => window.clearInterval(timer);
  }, [loadActivity]);

  const doLogout = useCallback(async () => {
    await logout('logout');
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  // Auto-cierre por inactividad (solo panel admin; el kiosko nunca cierra solo).
  useEffect(() => {
    let timer = window.setTimeout(() => void logout('idle'), IDLE_TIMEOUT_MS);
    let last = Date.now();
    const reset = () => {
      const now = Date.now();
      if (now - last < 5000) return;
      last = now;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void logout('idle'), IDLE_TIMEOUT_MS);
    };
    for (const ev of IDLE_EVENTS) window.addEventListener(ev, reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const ev of IDLE_EVENTS) window.removeEventListener(ev, reset);
    };
  }, [logout]);

  const askLogout = useCallback(() => {
    setMenuOpen(false);
    setExitOpen(true);
  }, []);

  const unread = notifOpen ? 0 : notifs.length;

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      <aside
        className={`hidden shrink-0 flex-col border-r border-line bg-surface/60 backdrop-blur lg:flex ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        <Brand collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <NavList user={user} onNavigate={() => undefined} collapsed={collapsed} />
        <div className="space-y-2 border-t border-line p-3">
          <UserCard name={user?.name} roleName={user?.role_name} collapsed={collapsed} />
          <button onClick={askLogout} className="btn-soft h-10 w-full text-[13px]">
            <IconLogout className="h-4 w-4" />
            {!collapsed && 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="anim-sidebar-in absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-line bg-surface">
            <Brand collapsed={false} onClose={() => setMenuOpen(false)} />
            <NavList user={user} onNavigate={() => setMenuOpen(false)} collapsed={false} />
            <div className="space-y-2 border-t border-line p-3">
              <UserCard name={user?.name} roleName={user?.role_name} collapsed={false} />
              <button
                onClick={() => {
                  setMenuOpen(false);
                  askLogout();
                }}
                className="btn-soft h-10 w-full text-[13px]"
              >
                <IconLogout className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      {notifOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="animate-fade-in absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setNotifOpen(false)}
          />
          <aside className="anim-notif-in absolute inset-y-0 right-0 flex w-80 max-w-[88vw] flex-col border-l border-line bg-surface">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <div className="flex items-center gap-2">
                <IconBell className="h-5 w-5 text-brand-600" />
                <p className="text-sm font-semibold tracking-tight">Notificaciones</p>
              </div>
              <button
                onClick={() => setNotifOpen(false)}
                className="btn-ghost h-9 w-9"
                aria-label="Cerrar notificaciones"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-4">
              {notifs.length === 0 ? (
                <div className="grid place-items-center gap-2 py-16 text-center text-muted">
                  <IconBell className="h-7 w-7" />
                  <p className="text-sm">No tienes notificaciones</p>
                </div>
              ) : (
                notifs.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-2xl border p-3.5 ${
                      n.tone === 'danger'
                        ? 'border-red-600/20 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10'
                        : 'border-line bg-faint'
                    }`}
                  >
                    <p className="text-[13px] font-semibold text-ink">{n.title}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{n.message}</p>
                  </div>
                ))
              )}
            </div>

            {notifs.length > 0 && (
              <div className="shrink-0 border-t border-line p-3">
                <button onClick={() => setNotifs([])} className="btn-soft h-9 w-full text-[13px]">
                  Limpiar avisos
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setMenuOpen(true)}
              className="btn-ghost h-10 w-10 lg:hidden"
              aria-label="Abrir menú"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <div className="leading-tight">
              <p className="truncate text-sm font-semibold tracking-tight">
                {TITLES[location.pathname] || 'Panel de control'}
              </p>
              <p className="hidden truncate text-[11px] text-muted sm:block">
                {user?.name} · {user?.role_name}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-faint px-3 py-1.5 text-[12px] font-semibold text-muted sm:inline-flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              En línea
            </span>
            <button
              onClick={() => setNotifOpen(true)}
              className="btn-ghost relative h-10 w-10"
              aria-label="Notificaciones"
              title="Notificaciones"
            >
              <IconBell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {unread}
                </span>
              )}
            </button>
            <ThemeToggleButton onClick={toggle} theme={theme} />
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <main className="min-w-0 flex-1 p-4 sm:p-5">
            <Outlet />
          </main>
        </div>
      </div>

      <ConfirmDialog
        open={exitOpen}
        title="Cerrar sesión"
        message="¿Seguro que deseas cerrar sesión?"
        confirmLabel="Cerrar sesión"
        danger
        onConfirm={doLogout}
        onClose={() => setExitOpen(false)}
      />
    </div>
  );
}
